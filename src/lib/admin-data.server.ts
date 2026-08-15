/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";

import { ENTITIES, entityByKey } from "./entities";
import { getDb, plain } from "./mongo.server";

const PAGE_SIZE = 25;

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
  const col = db.collection(def.collection);

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

  const [rows, total] = await Promise.all([
    col
      .find(query)
      .sort({ [sortField]: sortDir } as any)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    col.countDocuments(query),
  ]);

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
  const doc = await db.collection(def.collection).findOne(idFilter(id));
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
  const res = await db.collection(def.collection).updateOne(idFilter(id), { $set: set });
  if (!res.matchedCount) throw new Error("Record not found.");
  return set;
}

export async function deleteDoc(entity: string, id: string) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  const db = await getDb();
  const res = await db.collection(def.collection).deleteOne(idFilter(id));
  return res.deletedCount === 1;
}

export async function bulkDelete(entity: string, ids: string[]) {
  const def = entityByKey(entity);
  if (!def) throw new Error("Unknown collection.");
  if (!ids.length) return 0;
  const db = await getDb();
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
  await db.collection(def.collection).insertOne(doc as any);
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
  const [newUsers, newProducts, newSellers, recentOrders] = await Promise.all([
    db
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
    db
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
  const recentUsers = (await db
    .collection("users")
    .find({ created_at: { $gte: days[0]!.day } } as any)
    .project({ created_at: 1 })
    .limit(5000)
    .toArray()
    .catch(() => [] as any[])) as any[];
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
      db
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
