/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 8-way MongoDB shard router, with the old single-cluster database
 * (atlas-cerulean-field, referred to here as "primary") kept alive as a
 * read fallback while data drains out of it.
 *
 * How a record's shard is chosen: deterministic hash of its `_id`, mod 8.
 * No lookup table anywhere — `shardIndexFor(id)` is a pure function, so
 * every replica, the migration sweep script, and any future process all
 * agree on where a given ID lives without coordinating.
 *
 * How migration actually happens — two mechanisms, working together:
 *  1. **Migrate-on-read** (this file, `getRecordWithFallback`): a shard
 *     miss falls back to primary; if found there, it's copied into the
 *     correct shard before the request returns. Every subsequent read for
 *     that ID is a shard hit and never touches primary again. This alone
 *     migrates your "hot" data — anything actually being read — with zero
 *     separate migration step.
 *  2. **Background sweep** (scripts/shard-migrate.mjs): a slow, resumable
 *     process that walks every record on primary — including ones nobody
 *     has read since this shipped — copies each to its shard, and deletes
 *     it from primary once confirmed. This is what eventually empties
 *     primary out completely, including "cold" records mechanism 1 alone
 *     would never touch.
 *
 * SCOPE — read this before wiring in a new collection:
 * This only helps queries that fetch a single record by `_id`. It does
 * NOT help: search, "all orders for a store", admin listings, anything
 * with a $or/$in across many IDs, or aggregations — those still need to
 * query every shard and merge in application code, which is real
 * additional work per query path, not something this router gives you
 * for free. Wire up `_id` lookups first (auth, order-by-id, product-by-id
 * detail pages); leave listing/search endpoints on `mongo.server.ts`
 * (unsharded) until those are explicitly rewritten to fan out.
 *
 * Configuration (env vars, never hardcode connection strings here):
 *   MONGO_SHARD_URLS            comma-separated, exactly 8 connection
 *                                strings, in a fixed order you don't
 *                                change once records exist (changing the
 *                                order silently changes which shard every
 *                                ID hashes to).
 *   MONGO_PRIMARY_URL            the old single-cluster connection string
 *                                (atlas-cerulean-field) — read fallback +
 *                                migration source only, not written to by
 *                                normal app traffic once this is wired in.
 *   MONGO_PRIMARY_CONNECTION_LIMIT   total connections you want primary to
 *                                    ever hold across every process talking
 *                                    to it (web replicas + order-worker +
 *                                    the migration sweep). Default 400.
 *   MONGO_PRIMARY_MIGRATOR_RESERVE   slice of that budget reserved for
 *                                    scripts/shard-migrate.mjs. Default 10.
 */
import { MongoClient, ObjectId, type Db } from "mongodb";

export const SHARD_COUNT = 8;

function parseShardUrls(): string[] {
  const raw = process.env["MONGO_SHARD_URLS"];
  if (!raw || !raw.trim()) return [];
  const urls = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length !== SHARD_COUNT) {
    console.error(
      `[shard] MONGO_SHARD_URLS has ${urls.length} entries, expected exactly ${SHARD_COUNT}. ` +
        `Sharding is disabled until this is fixed.`,
    );
    return [];
  }
  return urls;
}

let shardClientPromises: Promise<MongoClient>[] | null = null;
let primaryClientPromise: Promise<MongoClient> | null = null;

/** Per-shard pool size, budgeted the same way mongo.server.ts budgets the primary pool. */
function shardPoolSize(): number {
  const replicas = Math.max(1, Number(process.env["WEB_REPLICA_COUNT"] ?? 1));
  const perShardLimit = Number(process.env["ATLAS_CONNECTION_LIMIT"] ?? 500);
  const safety = 0.85;
  return Math.max(5, Math.min(Math.floor((perShardLimit * safety) / replicas), 100));
}

function getShardClients(): Promise<MongoClient>[] {
  if (shardClientPromises) return shardClientPromises;
  const urls = parseShardUrls();
  if (urls.length === 0) {
    throw new Error("MONGO_SHARD_URLS is not configured (need exactly 8, comma-separated)");
  }
  const poolSize = shardPoolSize();
  shardClientPromises = urls.map((uri, i) => {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: poolSize,
      minPoolSize: Math.min(5, poolSize),
      maxIdleTimeMS: 30_000,
    });
    client.on?.("error", (err: Error) =>
      console.error(`[shard:${i}] connection error:`, err.message),
    );
    return client.connect();
  });
  console.log(`[shard] ${urls.length} shards configured, maxPoolSize=${poolSize}/shard/instance`);
  return shardClientPromises;
}

/**
 * Primary's pool is deliberately small and shared across every process
 * still talking to it (web replicas + order-worker + the sweep script) —
 * it's being drained, not serving normal traffic, so it doesn't get the
 * same per-instance budget a shard gets.
 */
function primaryPoolSize(): number {
  const replicas = Math.max(1, Number(process.env["WEB_REPLICA_COUNT"] ?? 1));
  const totalBudget = Number(process.env["MONGO_PRIMARY_CONNECTION_LIMIT"] ?? 400);
  const migratorReserve = Number(process.env["MONGO_PRIMARY_MIGRATOR_RESERVE"] ?? 10);
  const workerReserve = Number(process.env["MONGODB_WORKER_RESERVE"] ?? 20);
  const safety = 0.85;
  const perInstance = Math.floor(
    (totalBudget * safety - migratorReserve - workerReserve) / replicas,
  );
  return Math.max(2, Math.min(perInstance, 50));
}

function getPrimaryClient(): Promise<MongoClient> {
  if (primaryClientPromise) return primaryClientPromise;
  const uri = process.env["MONGO_PRIMARY_URL"];
  if (!uri) throw new Error("MONGO_PRIMARY_URL is not configured");
  const poolSize = primaryPoolSize();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: poolSize,
    minPoolSize: Math.min(2, poolSize),
    maxIdleTimeMS: 30_000,
  });
  client.on?.("error", (err: Error) =>
    console.error("[shard:primary] connection error:", err.message),
  );
  console.log(
    `[shard:primary] maxPoolSize=${poolSize}/instance (see MONGO_PRIMARY_CONNECTION_LIMIT)`,
  );
  primaryClientPromise = client.connect();
  return primaryClientPromise;
}

/** Stable string hash (djb2) — same algorithm used for Redis shard hashing, for consistency. */
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic shard index for a given record ID — pure function, no lookup table. */
export function shardIndexFor(id: string): number {
  return hashId(String(id)) % SHARD_COUNT;
}

export async function getShardDb(index: number, dbName: string): Promise<Db> {
  const clients = getShardClients();
  const client = await clients[((index % SHARD_COUNT) + SHARD_COUNT) % SHARD_COUNT]!;
  return client.db(dbName);
}

export async function getPrimaryDb(dbName: string): Promise<Db> {
  const client = await getPrimaryClient();
  return client.db(dbName);
}

export function isShardingConfigured(): boolean {
  return parseShardUrls().length === SHARD_COUNT;
}

export function isPrimaryFallbackConfigured(): boolean {
  return Boolean(process.env["MONGO_PRIMARY_URL"]);
}

/** `_id` may be a MongoDB ObjectId or a plain string ID (this app uses both across collections). */
function idQuery(id: string): Record<string, unknown> {
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    try {
      return { _id: new ObjectId(id) };
    } catch {
      // fall through to string form below
    }
  }
  return { _id: id };
}

/**
 * Read-through, self-healing single-record lookup. See the file-level
 * comment for the two-part migration mechanism this participates in.
 *
 * Does NOT throw on a primary-fallback failure — if primary is
 * unreachable, callers just get null (record not found) rather than a
 * hard failure, since primary is meant to be decommissioned eventually
 * and shouldn't become a new single point of failure while it drains.
 */
export async function getRecordWithFallback<T = any>(
  dbName: string,
  collection: string,
  id: string,
): Promise<T | null> {
  if (!isShardingConfigured()) {
    throw new Error("Sharding is not configured — set MONGO_SHARD_URLS (8 URLs) first");
  }

  const index = shardIndexFor(id);
  const shardDb = await getShardDb(index, dbName);
  const query = idQuery(id);

  const onShard = await shardDb.collection(collection).findOne(query);
  if (onShard) return onShard as T;

  if (!isPrimaryFallbackConfigured()) return null;

  let onPrimary: any;
  try {
    const primaryDb = await getPrimaryDb(dbName);
    onPrimary = await primaryDb.collection(collection).findOne(query);
  } catch (err) {
    console.error(
      `[shard] primary fallback failed for ${collection}/${id}:`,
      (err as Error).message,
    );
    return null;
  }
  if (!onPrimary) return null;

  // Migrate-on-read: copy to the correct shard now so the next read never
  // touches primary again. Fire-and-forget — never block or fail the
  // caller's request over this; the sweep script is the safety net if it
  // fails here.
  shardDb
    .collection(collection)
    .updateOne(query, { $set: onPrimary }, { upsert: true })
    .then(() =>
      console.log(`[shard] migrated ${collection}/${id} -> shard ${index} (read-triggered)`),
    )
    .catch((err) =>
      console.error(
        `[shard] migrate-on-read failed for ${collection}/${id}:`,
        (err as Error).message,
      ),
    );

  return onPrimary as T;
}

/**
 * Batch version of getRecordWithFallback, for call sites that already
 * have an array of ids (cart contents, wishlists, `_id: { $in: [...] }`
 * style lookups) rather than one id at a time.
 *
 * Groups ids by shard so each shard gets exactly one `$in` query instead
 * of N round trips, then does a single fallback pass to primary for
 * anything still missing after all shards report in. Order of the
 * returned array is NOT guaranteed to match `ids` — callers that care
 * about order should re-sort by their own id list.
 */
export async function getRecordsWithFallback<T = any>(
  dbName: string,
  collection: string,
  ids: string[],
): Promise<T[]> {
  if (!ids.length) return [];
  if (!isShardingConfigured()) {
    throw new Error("Sharding is not configured — set MONGO_SHARD_URLS (8 URLs) first");
  }

  const byShard = new Map<number, string[]>();
  for (const id of ids) {
    const idx = shardIndexFor(id);
    (byShard.get(idx) ?? byShard.set(idx, []).get(idx)!).push(id);
  }

  const shardResults = await Promise.all(
    [...byShard.entries()].map(async ([index, shardIds]) => {
      const db = await getShardDb(index, dbName);
      const objIds = shardIds.map((id) => idQuery(id)["_id"]);
      return db
        .collection(collection)
        .find({ _id: { $in: objIds } } as any)
        .toArray();
    }),
  );

  const found = new Map<string, any>();
  for (const docs of shardResults) for (const d of docs) found.set(String(d._id), d);

  const missing = ids.filter((id) => !found.has(id));
  if (missing.length && isPrimaryFallbackConfigured()) {
    try {
      const primaryDb = await getPrimaryDb(dbName);
      const objIds = missing.map((id) => idQuery(id)["_id"]);
      const onPrimary = (await primaryDb
        .collection(collection)
        .find({ _id: { $in: objIds } } as any)
        .toArray()) as any[];
      for (const d of onPrimary) {
        found.set(String(d._id), d);
        // Migrate-on-read, same fire-and-forget contract as the single-record path.
        const idx = shardIndexFor(String(d._id));
        getShardDb(idx, dbName)
          .then((db) =>
            db.collection(collection).updateOne({ _id: d._id }, { $set: d }, { upsert: true }),
          )
          .then(() =>
            console.log(
              `[shard] migrated ${collection}/${d._id} -> shard ${idx} (batch-read-triggered)`,
            ),
          )
          .catch((err) =>
            console.error(
              `[shard] batch migrate-on-read failed for ${collection}/${d._id}:`,
              (err as Error).message,
            ),
          );
      }
    } catch (err) {
      console.error(
        `[shard] primary batch fallback failed for ${collection}:`,
        (err as Error).message,
      );
    }
  }

  return [...found.values()] as T[];
}

/**
 * Ensures a record is present on its correct shard (running migrate-on-read
 * and *waiting* for the copy to finish, unlike the fire-and-forget version
 * inside getRecordWithFallback), then hands back both the shard's Db and
 * the record's shard index so a caller can immediately issue a consistent
 * write against the same shard. Use this — not a raw updateOne against
 * whatever `getDb()` happens to point at — for any update to a record that
 * may already have been migrated, or a read of it right after would see
 * a stale copy on primary instead of the update.
 */
async function ensureOnShard(
  dbName: string,
  collection: string,
  id: string,
): Promise<{ db: Db; index: number; existed: boolean }> {
  if (!isShardingConfigured()) {
    throw new Error("Sharding is not configured — set MONGO_SHARD_URLS (8 URLs) first");
  }
  const index = shardIndexFor(id);
  const shardDb = await getShardDb(index, dbName);
  const query = idQuery(id);

  const onShard = await shardDb.collection(collection).findOne(query, { projection: { _id: 1 } });
  if (onShard) return { db: shardDb, index, existed: true };

  if (!isPrimaryFallbackConfigured()) return { db: shardDb, index, existed: false };

  try {
    const primaryDb = await getPrimaryDb(dbName);
    const onPrimary = await primaryDb.collection(collection).findOne(query);
    if (onPrimary) {
      await shardDb.collection(collection).updateOne(query, { $set: onPrimary }, { upsert: true });
      console.log(`[shard] migrated ${collection}/${id} -> shard ${index} (write-triggered)`);
      return { db: shardDb, index, existed: true };
    }
  } catch (err) {
    console.error(
      `[shard] write-path primary fallback failed for ${collection}/${id}:`,
      (err as Error).message,
    );
  }
  return { db: shardDb, index, existed: false };
}

/**
 * Insert a brand-new record directly onto its shard — never onto primary.
 * Once a collection is wired into sharding, new records should never be
 * created on primary at all; primary is drain-only from that point on.
 * `doc._id` must already be set (it determines the shard).
 */
export async function insertRecordToShard(
  dbName: string,
  collection: string,
  doc: Record<string, unknown> & { _id: unknown },
): Promise<void> {
  const id = String(doc._id);
  const index = shardIndexFor(id);
  const db = await getShardDb(index, dbName);
  await db.collection(collection).insertOne(doc as any);
}

/**
 * Write-safe update-by-id: guarantees the record is on its shard (awaiting
 * migration if it was still on primary) before applying `updateOp`, so the
 * write always lands where the next read will look for it. Returns false
 * if the record doesn't exist anywhere (shard or primary) — callers should
 * treat that the same as a 404, same as a findOne-then-update pattern would.
 */
export async function updateRecordWithFallback(
  dbName: string,
  collection: string,
  id: string,
  updateOp: Record<string, unknown>,
): Promise<boolean> {
  const { db, existed } = await ensureOnShard(dbName, collection, id);
  if (!existed) return false;
  await db.collection(collection).updateOne(idQuery(id), updateOp as any);
  return true;
}

/**
 * Deletes a record from wherever it currently lives — shard and primary
 * both, best-effort on primary. Needed because getRecordWithFallback would
 * otherwise resurrect a shard-deleted-but-primary-still-has-it record on
 * the next read.
 */
/**
 * Best-effort, fire-and-forget mirror of a primary write onto a record's
 * shard — for collections like `products` where primary stays the source
 * of truth (because the hot read path looks records up by `slug`, not
 * `_id`, and can't be routed to a shard without a lookup table), but a
 * secondary `_id`-keyed read path (e.g. `getRecordsWithFallback` for cart/
 * wishlist batch fetches) may have already cached a copy on a shard via
 * migrate-on-read. Without this, that cached shard copy would go stale
 * the next time primary is updated. `upsert: false` on purpose — if the
 * record was never migrated, there's nothing on the shard to keep in
 * sync, and this must not create a partial doc there.
 */
export function mirrorUpdateToShard(
  dbName: string,
  collection: string,
  id: string,
  updateOp: Record<string, unknown>,
): void {
  if (!isShardingConfigured()) return;
  const index = shardIndexFor(id);
  getShardDb(index, dbName)
    .then((db) =>
      db.collection(collection).updateOne(idQuery(id), updateOp as any, { upsert: false }),
    )
    .catch((err) =>
      console.error(
        `[shard] mirror update failed for ${collection}/${id}:`,
        (err as Error).message,
      ),
    );
}

export async function deleteRecordEverywhere(
  dbName: string,
  collection: string,
  id: string,
): Promise<void> {
  const index = shardIndexFor(id);
  const shardDb = await getShardDb(index, dbName);
  const query = idQuery(id);
  await shardDb.collection(collection).deleteOne(query);
  if (isPrimaryFallbackConfigured()) {
    try {
      const primaryDb = await getPrimaryDb(dbName);
      await primaryDb.collection(collection).deleteOne(query);
    } catch (err) {
      console.error(
        `[shard] primary delete failed for ${collection}/${id}:`,
        (err as Error).message,
      );
    }
  }
}
