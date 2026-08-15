/**
 * Two-tier client cache: IndexedDB for volume, localStorage for speed.
 *
 * Repeat navigations in this app used to re-fetch the same catalogue payloads
 * from the origin every time, so a returning visitor paid full network
 * latency to see products they'd already seen. This module lets any client
 * fetch be wrapped in stale-while-revalidate:
 *
 *   - **localStorage** is synchronous, so a cached value can be read *during*
 *     the first render — no loading state, no layout shift, no waterfall.
 *     It's small (~5 MB) so it only holds compact entries.
 *   - **IndexedDB** is async and orders of magnitude larger, so it holds
 *     everything (product pages, feed pages) and is read right after mount.
 *
 * Writes go to both tiers. Reads prefer localStorage, fall back to IDB.
 * Every entry is timestamped and versioned so a deploy or a TTL expiry can
 * invalidate cleanly instead of serving stale prices forever.
 */

const VERSION = "v1";
const DB_NAME = "1antiqe-cache";
const STORE = "entries";
const LS_PREFIX = `1antiqe.cache.${VERSION}.`;
/** Anything bigger than this skips the synchronous tier. */
const LS_MAX_BYTES = 96 * 1024;

const isBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";

type Entry<T> = { v: string; t: number; d: T };

function fresh<T>(entry: Entry<T> | null, ttlMs: number): boolean {
  return !!entry && entry.v === VERSION && Date.now() - entry.t < ttlMs;
}

/* ------------------------------- IndexedDB ------------------------------- */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!isBrowser) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // Private-mode browsers can hang here rather than erroring.
      setTimeout(() => resolve(req.result ?? null), 1500);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<Entry<T> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Entry<T> | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, entry: Entry<T>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(entry, key);
  } catch {
    /* storage disabled */
  }
}

/* ------------------------------ localStorage ----------------------------- */

function lsGet<T>(key: string): Entry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, entry: Entry<T>, serialized: string): void {
  if (typeof window === "undefined") return;
  if (serialized.length > LS_MAX_BYTES) return;
  try {
    window.localStorage.setItem(LS_PREFIX + key, serialized);
  } catch {
    // Quota hit — drop our own oldest entries and give up quietly.
    pruneLocalStorage();
  }
}

function pruneLocalStorage(): void {
  try {
    const ours: { key: string; t: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(LS_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      const t = raw ? ((JSON.parse(raw) as Entry<unknown>).t ?? 0) : 0;
      ours.push({ key, t });
    }
    ours
      .sort((a, b) => a.t - b.t)
      .slice(0, Math.ceil(ours.length / 2))
      .forEach((e) => window.localStorage.removeItem(e.key));
  } catch {
    /* nothing else we can do */
  }
}

/* --------------------------------- API ---------------------------------- */

/** Synchronous read — safe to call during render for instant first paint. */
export function readCacheSync<T>(key: string, ttlMs: number): T | null {
  const entry = lsGet<T>(key);
  return fresh(entry, ttlMs) ? entry!.d : null;
}

/** Async read across both tiers. */
export async function readCache<T>(key: string, ttlMs: number): Promise<T | null> {
  const sync = lsGet<T>(key);
  if (fresh(sync, ttlMs)) return sync!.d;
  const stored = await idbGet<T>(key);
  return fresh(stored, ttlMs) ? stored!.d : null;
}

export function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  const entry: Entry<T> = { v: VERSION, t: Date.now(), d: data };
  let serialized = "";
  try {
    serialized = JSON.stringify(entry);
  } catch {
    return;
  }
  lsSet(key, entry, serialized);
  void idbSet(key, entry);
}

/**
 * Stale-while-revalidate. Resolves from cache immediately when possible and
 * refreshes in the background, so navigation feels instant while data still
 * converges on the server's answer.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  { ttlMs = 5 * 60_000, onRevalidate }: { ttlMs?: number; onRevalidate?: (data: T) => void } = {},
): Promise<T> {
  const cached = await readCache<T>(key, ttlMs);

  if (cached !== null) {
    void fetcher()
      .then((fresh_) => {
        writeCache(key, fresh_);
        onRevalidate?.(fresh_);
      })
      .catch(() => {
        /* offline: the cached value stands */
      });
    return cached;
  }

  const data = await fetcher();
  writeCache(key, data);
  return data;
}
