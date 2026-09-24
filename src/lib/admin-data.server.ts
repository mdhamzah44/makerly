/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";

import { ENTITIES, entityByKey } from "./entities";
import { getDb, plain } from "./mongo.server";
import {
  deleteRecordEverywhere,
  getPrimaryDb,
  getRecordWithFallback,
  getShardDb,
  insertRecordToShard,
  isPrimaryFallbackConfigured,
  isShardingConfigured,
  SHARD_COUNT,
  updateRecordWithFallback,
} from "./shard.server";

const PAGE_SIZE = 25;

/** Collections the storefront/order-worker write through the 8-way shard
 *  router for (see SHARDING.md — "fully wired": users, orders). Every
 *  other collection is still 100% on the single primary cluster, so the
 *  admin keeps reading/writing those the old way. Once a new collection
 *  is fully wired on the storefront side, add its `collection` name here
 *  and the generic CRUD helpers below automatically fan out to it. */
const SHARDED_COLLECTIONS = new Set(["orders", "users"]);

function isSharded(collection: string) {
  return isShardingConfigured() && SHARDED_COLLECTIONS.has(collection);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** IDs in this database are a mix of real BSON ObjectIds and plain hex-looking
 *  strings (both 24 characters, so you can't tell them apart just by shape).
 *  Matching only one representation silently drops every edit/delete on
 *  whichever collections use the other one, so we always match both. */
function looksLikeObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

function idFilter(id: string): any {
  if (looksLikeObjectId(id)) {
    return { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
  }
  return { _id: id };
}

function idsFilter(ids: string[]): any {
  const objectIds = ids.filter(looksLikeObjectId).map((id) => new ObjectId(id));
  if (!objectIds.length) return { _id: { $in: ids } };
  return { $or: [{ _id: { $in: ids } }, { _id: { $in: objectIds } }] };
}

/** Writes `value` at a dot-notation path inside `obj`, creating objects as needed. */
function setPath(obj: Record<string, any>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Sorts a merged, cross-shard result set. Numeric-looking values compare
 *  numerically (so "total"/money columns sort correctly); everything else
 *  compares as a string, which is also what makes ISO `created_at` sort
 *  correctly without parsing dates. */
function compareForSort(a: any, b: any, sortField: string, sortDir: 1 | -1) {
  const av = sortField.split(".").reduce((o, k) => (o == null ? o : o[k]), a);
  const bv = sortField.split(".").reduce((o, k) => (o == null ? o : o[k]), b);
  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
  return sortDir === 1 ? cmp : -cmp;
}

/**
 * Fan-out reader for the collections the storefront writes through the
 * 8-way shard router (`orders`, `users` — see SHARDING.md). Once a
 * collection is sharded there's no single place holding "every row" any
 * more, so listing it means querying all 8 shards + primary in parallel
 * and merging — the same trade-off `listOrders` makes on the storefront
 * side for a user's order history, just applied to the admin's
 * unbounded "show me everything, sorted, paginated" case instead of a
 * bounded per-user one.
 *
 * Each source is asked for up to `page * pageSize` rows (capped) so a
 * deep page still sorts correctly even if every matching row happens to
 * live on one shard; the merge then re-sorts and slices to the exact
 * page. `total` is a summed `countDocuments()` across every source —
 * it can very briefly over-count a record that's mid-migration (copied
 * onto its shard but not yet swept off primary), which self-corrects
 * once the background sweep deletes it from primary.
 */
async function fanOutList(
  dbName: string,
  collection: string,
  query: any,
  sortField: string,
  sortDir: 1 | -1,
  page: number,
  pageSize: number,
) {
  const fetchLimit = Math.min(Math.max(page * pageSize, pageSize), 5000);

  const shardReads = Array.from({ length: SHARD_COUNT }, async (_, i) => {
    try {
      const db = await getShardDb(i, dbName);
      return await db
        .collection(collection)
        .find(query)
        .sort({ [sortField]: sortDir } as any)
        .limit(fetchLimit)
        .toArray();
    } catch (err) {
      console.error(`[shard] admin list fan-out failed on shard ${i}:`, (err as Error).message);
      return [] as any[];
    }
  });

  const primaryRead = isPrimaryFallbackConfigured()
    ? (async () => {
        try {
          const db = await getPrimaryDb(dbName);
          return await db
            .collection(collection)
            .find(query)
            .sort({ [sortField]: sortDir } as any)
            .limit(fetchLimit)
            .toArray();
        } catch (err) {
          console.error("[shard] admin list primary fallback failed:", (err as Error).message);
          return [] as any[];
        }
      })()
    : Promise.resolve([] as any[]);

  const [shardResults, primaryResult, counts] = await Promise.all([
    Promise.all(shardReads),
    primaryRead,
    fanOutCount(dbName, collection, query),
  ]);

  const merged = new Map<string, any>();
  for (const doc of [...shardResults.flat(), ...primaryResult]) merged.set(String(doc._id), doc);
  const all = [...merged.values()].sort((a, b) => compareForSort(a, b, sortField, sortDir));

  return {
    rows: all.slice((page - 1) * pageSize, page * pageSize),
    total: counts,
  };
}

async function fanOutCount(dbName: string, collection: string, query: any): Promise<number> {
  const shardCounts = Array.from({ length: SHARD_COUNT }, async (_, i) => {
    try {
      const db = await getShardDb(i, dbName);
      return await db.collection(collection).countDocuments(query);
    } catch (err) {
      console.error(`[shard] admin count fan-out failed on shard ${i}:`, (err as Error).message);
      return 0;
    }
  });
  const primaryCount = isPrimaryFallbackConfigured()
    ? getPrimaryDb(dbName)
        .then((db) => db.collection(collection).countDocuments(query))
        .catch((err) => {
          console.error("[shard] admin count primary fallback failed:", (err as Error).message);
          return 0;
        })
    : Promise.resolve(0);
  const [shardTotals, primaryTotal] = await Promise.all([Promise.all(shardCounts), primaryCount]);
  return shardTotals.reduce((sum, n) => sum + n, 0) + primaryTotal;
}

/** Fan-out find with no pagination — used by dashboard aggregates that
 *  already cap themselves with `limit` (top-N leaderboards, trend charts)
 *  rather than paging through everything. */
async function fanOutFind(
  dbName: string,
  collection: string,
  query: any,
  sortField: string,
  sortDir: 1 | -1,
  limit: number,
  projection?: Record<string, 1>,
): Promise<any[]> {
  const shardReads = Array.from({ length: SHARD_COUNT }, async (_, i) => {
    try {
      const db = await getShardDb(i, dbName);
      let cursor = db
        .collection(collection)
        .find(query)
        .sort({ [sortField]: sortDir } as any)
        .limit(limit);
      if (projection) cursor = cursor.project(projection) as any;
      return (await cursor.toArray()) as any[];
    } catch (err) {
      console.error(`[shard] dashboard fan-out failed on shard ${i}:`, (err as Error).message);
      return [] as any[];
    }
  });
  const primaryRead = isPrimaryFallbackConfigured()
    ? (async () => {
        try {
          const db = await getPrimaryDb(dbName);
          let cursor = db
            .collection(collection)
            .find(query)
            .sort({ [sortField]: sortDir } as any)
            .limit(limit);
          if (projection) cursor = cursor.project(projection) as any;
          return (await cursor.toArray()) as any[];
        } catch (err) {
          console.error("[shard] dashboard primary fallback failed:", (err as Error).message);
          return [] as any[];
        }
      })()
    : Promise.resolve([] as any[]);

  const [shardResults, primaryResult] = await Promise.all([Promise.all(shardReads), primaryRead]);
  const merged = new Map<string, any>();
  for (const doc of [...shardResults.flat(), ...primaryResult]) merged.set(String(doc._id), doc);
  return [...merged.values()]
    .sort((a, b) => compareForSort(a, b, sortField, sortDir))
    .slice(0, limit);
}

export async function listEntity(input: {
  entity: string;
  q?: string;
  page?: number;
  pageSize?: number;
  filter?: Record<string, unknown> | null;
  sort?: string;
  dir?: "asc" | "desc";
}) {
  const def = entityByKey(input.entity);
  if (!def) throw new Error("Unknown collection.");
  const db = await getDb();

  const query: any = { ...(input.filter ?? {}) };
  const q = (input.q ?? "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    query.$or = def.search.map((f) => ({ [f]: rx }));
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, input.pageSize ?? PAGE_SIZE);
  const sortField = input.sort || def.sort;
  const sortDir = input.dir === "asc" ? 1 : -1;

  let rows: any[];
  let total: number;
  if (isSharded(def.collection)) {
    const result = await fanOutList(
      db.databaseName,
      def.collection,
      query,
      sortField,
      sortDir,
      page,
      pageSize,
    );
    rows = result.rows;
    total = result.total;
  } else {
    const col = db.collection(def.collection);
    [rows, total] = await Promise.all([
      col
        .find(query)
        .sort({ [sortField]: sortDir } as any)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      col.countDocuments(query),
    ]);
  }

  return {
    rows: plain(rows).map((r: any) => ({ ...r, _id: String(r._id) })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDoc(entity: string, id: string) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  const db = await getDb();
  const doc = isSharded(def.collection)
    ? await getRecordWithFallback<any>(db.databaseName, def.collection, id)
    : await db.collection(def.collection).findOne(idFilter(id));
  if (!doc) throw new Error("Record not found.");
  return { ...(plain(doc) as any), _id: String((doc as any)._id) };
}

export async function patchDoc(entity: string, id: string, patch: Record<string, unknown>) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  const allowed = new Set(def.fields.filter((f) => f.editable).map((f) => f.key));
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (allowed.has(k)) set[k] = v;
  if (!Object.keys(set).length) throw new Error("Nothing editable in that change.");
  set["updated_at"] = new Date().toISOString();
  const db = await getDb();
  if (isSharded(def.collection)) {
    const ok = await updateRecordWithFallback(db.databaseName, def.collection, id, {
      $set: set,
    });
    if (!ok) throw new Error("Record not found.");
    return set;
  }
  const res = await db.collection(def.collection).updateOne(idFilter(id), { $set: set });
  if (!res.matchedCount) throw new Error("Record not found.");
  return set;
}

export async function deleteDoc(entity: string, id: string) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  const db = await getDb();
  if (isSharded(def.collection)) {
    // deleteRecordEverywhere doesn't report whether a record actually
    // existed (it's a delete-from-wherever-it-lives, best-effort on
    // primary) — confirm it's really gone so the admin gets an honest
    // true/false instead of always "succeeding".
    const existed = await getRecordWithFallback<any>(db.databaseName, def.collection, id);
    await deleteRecordEverywhere(db.databaseName, def.collection, id);
    return Boolean(existed);
  }
  const res = await db.collection(def.collection).deleteOne(idFilter(id));
  return res.deletedCount === 1;
}

export async function bulkDelete(entity: string, ids: string[]) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  if (!ids.length) return 0;
  const db = await getDb();
  if (isSharded(def.collection)) {
    const results = await Promise.all(ids.map((id) => deleteDoc(entity, id)));
    return results.filter(Boolean).length;
  }
  const res = await db.collection(def.collection).deleteMany(idsFilter(ids));
  return res.deletedCount ?? 0;
}

/** Creates a new record with a plain string id (kept consistent with idFilter's matching). */
export async function createDoc(entity: string, patch: Record<string, unknown>) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  const allowed = new Set(def.fields.filter((f) => f.editable).map((f) => f.key));
  const doc: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) continue;
    if (v === "" || v === undefined) continue;
    setPath(doc, k, v);
  }
  const now = new Date().toISOString();
  doc["created_at"] = doc["created_at"] ?? now;
  doc["updated_at"] = now;
  const id = new ObjectId().toHexString();
  doc["_id"] = id;
  const db = await getDb();
  if (isSharded(def.collection)) {
    // New records created from the admin go straight to their shard,
    // same as the storefront's own writes — never onto primary, which is
    // drain-only once a collection is wired into sharding.
    await insertRecordToShard(db.databaseName, def.collection, doc as any);
  } else {
    await db.collection(def.collection).insertOne(doc as any);
  }
  return { id };
}

export async function exportEntity(entity: string, q?: string, limit = 1000) {
  const { rows } = await listEntity({
    entity,
    ...(q ? { q } : {}),
    page: 1,
    pageSize: Math.min(limit, 100),
  });
  return rows;
}

/* ------------------------------- Overview ------------------------------- */

export async function overviewStats() {
  const db = await getDb();
  const counts = await Promise.all(
    ENTITIES.map(async (e) => {
      try {
        return [e.key, await db.collection(e.collection).estimatedDocumentCount()] as const;
      } catch {
        return [e.key, 0] as const;
      }
    }),
  );

  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const dbName = db.databaseName;
  const [newUsers, newProducts, newSellers, recentOrders] = await Promise.all([
    isSharded("users")
      ? fanOutCount(dbName, "users", { created_at: { $gte: since } }).catch(() => 0)
      : db
          .collection("users")
          .countDocuments({ created_at: { $gte: since } } as any)
          .catch(() => 0),
    db
      .collection("products")
      .countDocuments({ created_at: { $gte: since } } as any)
      .catch(() => 0),
    db
      .collection("sellers")
      .countDocuments({ created_at: { $gte: since } } as any)
      .catch(() => 0),
    isSharded("orders")
      ? fanOutFind(dbName, "orders", {}, "created_at", -1, 200).catch(() => [] as any[])
      : db
          .collection("orders")
          .find({} as any)
          .sort({ created_at: -1 })
          .limit(200)
          .toArray()
          .catch(() => [] as any[]),
  ]);

  const revenue = (recentOrders as any[]).reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  // 14-day signup / order trend (client renders the chart).
  const days: { day: string; users: number; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(Date.now() - i * 86_400_000);
    const key = start.toISOString().slice(0, 10);
    days.push({ day: key, users: 0, orders: 0 });
  }
  const map = new Map(days.map((d) => [d.day, d]));
  const recentUsers = (await (isSharded("users")
    ? fanOutFind(dbName, "users", { created_at: { $gte: days[0]!.day } }, "created_at", -1, 5000, {
        created_at: 1,
      }).catch(() => [] as any[])
    : db
        .collection("users")
        .find({ created_at: { $gte: days[0]!.day } } as any)
        .project({ created_at: 1 })
        .limit(5000)
        .toArray()
        .catch(() => [] as any[]))) as any[];
  for (const u of recentUsers) {
    const key = String(u.created_at ?? "").slice(0, 10);
    const row = map.get(key);
    if (row) row.users += 1;
  }
  for (const o of recentOrders as any[]) {
    const key = String(o.created_at ?? "").slice(0, 10);
    const row = map.get(key);
    if (row) row.orders += 1;
  }

  // Items that need admin attention right now — every metric here is backed
  // by a real field in the schema (nothing invented).
  const [pendingSellers, outOfStock, lowStock, pendingOrders, pendingReturns, openConversations] =
    await Promise.all([
      db
        .collection("sellers")
        .countDocuments({ "verification.status": { $in: ["pending", "under_review"] } } as any)
        .catch(() => 0),
      db
        .collection("products")
        .countDocuments({ stock: 0 } as any)
        .catch(() => 0),
      db
        .collection("products")
        .countDocuments({ stock: { $gt: 0, $lte: 5 } } as any)
        .catch(() => 0),
      isSharded("orders")
        ? fanOutCount(dbName, "orders", { status: { $in: ["pending", "processing"] } }).catch(
            () => 0,
          )
        : db
            .collection("orders")
            .countDocuments({ status: { $in: ["pending", "processing"] } } as any)
            .catch(() => 0),
      db
        .collection("return_requests")
        .countDocuments({ status: { $in: ["requested", "pending"] } } as any)
        .catch(() => 0),
      db
        .collection("conversations")
        .countDocuments({ status: { $ne: "closed" } } as any)
        .catch(() => 0),
    ]);

  // Most-viewed products / sellers — the schema tracks view_count, not
  // units sold or revenue, so the leaderboards reflect that honestly.
  const topProducts = (await db
    .collection("products")
    .find({} as any)
    .sort({ view_count: -1 } as any)
    .limit(5)
    .project({ name: 1, price: 1, view_count: 1, stock: 1 })
    .toArray()
    .catch(() => [] as any[])) as any[];

  const topSellers = (await db
    .collection("sellers")
    .find({} as any)
    .sort({ view_count: -1 } as any)
    .limit(5)
    .project({ store_name: 1, view_count: 1, rating: 1, verification: 1 })
    .toArray()
    .catch(() => [] as any[])) as any[];

  return {
    counts: Object.fromEntries(counts) as Record<string, number>,
    newUsers,
    newProducts,
    newSellers,
    revenue,
    orders30d: (recentOrders as any[]).length,
    trend: days,
    attention: {
      pendingSellers,
      outOfStock,
      lowStock,
      pendingOrders,
      pendingReturns,
      openConversations,
    },
    topProducts: plain(topProducts).map((p: any) => ({ ...p, _id: String(p._id) })),
    topSellers: plain(topSellers).map((s: any) => ({ ...s, _id: String(s._id) })),
    generatedAt: new Date().toISOString(),
  };
}

export type ShardHealth = {
  configured: boolean;
  primaryConfigured: boolean;
  shardedCollections: string[];
  shards: { index: number; ok: boolean; latencyMs: number; error?: string }[];
  primary: { ok: boolean; latencyMs: number; error?: string } | null;
};

/** Pings every shard + primary in parallel so the admin can see, at a
 *  glance, whether all 8 shards backing `orders`/`users` are reachable —
 *  not just the single `MONGODB_URI` cluster `dbHealth()` already checks. */
export async function shardHealth(): Promise<ShardHealth> {
  if (!isShardingConfigured()) {
    return {
      configured: false,
      primaryConfigured: isPrimaryFallbackConfigured(),
      shardedCollections: [],
      shards: [],
      primary: null,
    };
  }
  const db = await getDb();
  const dbName = db.databaseName;

  const shards = await Promise.all(
    Array.from({ length: SHARD_COUNT }, async (_, i) => {
      const started = Date.now();
      try {
        const shardDb = await getShardDb(i, dbName);
        await shardDb.command({ ping: 1 });
        return { index: i, ok: true, latencyMs: Date.now() - started };
      } catch (e) {
        return {
          index: i,
          ok: false,
          latencyMs: Date.now() - started,
          error: (e as Error).message,
        };
      }
    }),
  );

  let primary: ShardHealth["primary"] = null;
  if (isPrimaryFallbackConfigured()) {
    const started = Date.now();
    try {
      const primaryDb = await getPrimaryDb(dbName);
      await primaryDb.command({ ping: 1 });
      primary = { ok: true, latencyMs: Date.now() - started };
    } catch (e) {
      primary = { ok: false, latencyMs: Date.now() - started, error: (e as Error).message };
    }
  }

  return {
    configured: true,
    primaryConfigured: isPrimaryFallbackConfigured(),
    shardedCollections: [...SHARDED_COLLECTIONS],
    shards,
    primary,
  };
}

export async function dbHealth() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - started, database: db.databaseName };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      database: "",
      error: (e as Error).message,
    };
  }
}
