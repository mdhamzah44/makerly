/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";

import type { Json, JsonDoc } from "./collections";
import { getDb, newId, plain } from "./mongo.server";

export type CollectionKey =
  | "products"
  | "sellers"
  | "users"
  | "categories"
  | "pages"
  | "reviews"
  | "conversations"
  | "messages"
  | "events"
  | "translations"
  | "sessions"
  | "favourites"
  | "cart_items"
  | "site_settings"
  | "admin_audit";

export type CollectionMeta = {
  key: CollectionKey;
  label: string;
  search: string[];
  sort: Record<string, 1 | -1>;
  titleField: string;
  readOnly?: boolean;
};

export const COLLECTIONS: CollectionMeta[] = [
  { key: "products", label: "Products", search: ["name", "slug", "keywords", "category"], sort: { created_at: -1 }, titleField: "name" },
  { key: "sellers", label: "Sellers", search: ["store_name", "slug", "city", "support_email"], sort: { created_at: -1 }, titleField: "store_name" },
  { key: "users", label: "Users", search: ["name", "email", "phone"], sort: { created_at: -1 }, titleField: "name" },
  { key: "categories", label: "Categories", search: ["name", "slug"], sort: { position: 1 }, titleField: "name" },
  { key: "pages", label: "Pages", search: ["title", "slug", "description"], sort: { slug: 1 }, titleField: "title" },
  { key: "reviews", label: "Reviews", search: ["author", "body", "product"], sort: { created_at: -1 }, titleField: "author" },
  { key: "conversations", label: "Conversations", search: ["subject", "user_name", "store_name"], sort: { last_at: -1 }, titleField: "subject" },
  { key: "messages", label: "Messages", search: ["body", "author_name"], sort: { created_at: -1 }, titleField: "body" },
  { key: "events", label: "Events", search: ["type", "entity_name"], sort: { created_at: -1 }, titleField: "entity_name" },
  { key: "translations", label: "Translations", search: ["lang", "source", "value"], sort: { _id: -1 }, titleField: "source" },
  { key: "sessions", label: "User sessions", search: ["token", "user"], sort: { created_at: -1 }, titleField: "user" },
  { key: "favourites", label: "Favourites", search: ["user", "product"], sort: { created_at: -1 }, titleField: "product" },
  { key: "cart_items", label: "Cart items", search: ["user", "product"], sort: { created_at: -1 }, titleField: "product" },
  { key: "site_settings", label: "Site settings", search: ["site_name"], sort: { _id: 1 }, titleField: "site_name" },
  { key: "admin_audit", label: "Audit log", search: ["action", "admin_email"], sort: { created_at: -1 }, titleField: "action", readOnly: true },
];

export function metaFor(key: string): CollectionMeta {
  const meta = COLLECTIONS.find((c) => c.key === key);
  if (!meta) throw new Error(`Unknown collection: ${key}`);
  return meta;
}

function idQuery(id: string) {
  const or: any[] = [{ _id: id }];
  if (/^[a-f\d]{24}$/i.test(id)) {
    try {
      or.push({ _id: new ObjectId(id) });
    } catch {
      /* not an ObjectId */
    }
  }
  return { $or: or };
}

export type DocPage = {
  items: JsonDoc[];
  total: number;
  page: number;
  limit: number;
};

export async function listDocs(input: {
  collection: string;
  q?: string;
  page?: number;
  limit?: number;
  filter?: Record<string, unknown>;
}): Promise<DocPage> {
  const meta = metaFor(input.collection);
  const db = await getDb();
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(200, Math.max(1, input.limit ?? 25));
  const query: any = { ...(input.filter ?? {}) };
  const q = (input.q ?? "").trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = meta.search.map((f) => ({ [f]: rx }));
  }
  const col = db.collection(meta.key);
  const [items, total] = await Promise.all([
    col
      .find(query)
      .sort(meta.sort as any)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    col.countDocuments(query),
  ]);
  return plain({ items: items as any[], total, page, limit });
}

export async function getDoc(collection: string, id: string): Promise<JsonDoc | null> {
  const meta = metaFor(collection);
  const db = await getDb();
  const doc = await db.collection(meta.key).findOne(idQuery(id) as any);
  return doc ? plain(doc as any) : null;
}

function coerce(value: Json): Json {
  return value;
}

export async function saveDoc(collection: string, id: string, patch: JsonDoc) {
  const meta = metaFor(collection);
  if (meta.readOnly) throw new Error(`${meta.label} is read-only.`);
  const db = await getDb();
  const set: JsonDoc = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "_id") continue;
    set[k] = coerce(v);
  }
  set["updated_at"] = new Date().toISOString();
  const res = await db.collection(meta.key).updateOne(idQuery(id) as any, { $set: set });
  if (!res.matchedCount) throw new Error("Document not found.");
  return getDoc(collection, id);
}

export async function createDoc(collection: string, doc: JsonDoc): Promise<JsonDoc> {
  const meta = metaFor(collection);
  if (meta.readOnly) throw new Error(`${meta.label} is read-only.`);
  const db = await getDb();
  const id = String(doc["_id"] ?? doc["slug"] ?? newId());
  const payload: any = { ...doc, _id: id, created_at: new Date().toISOString() };
  const exists = await db.collection(meta.key).findOne({ _id: id as any });
  if (exists) throw new Error("A document with that id already exists.");
  await db.collection(meta.key).insertOne(payload);
  return plain(payload);
}

export async function deleteDoc(collection: string, id: string) {
  const meta = metaFor(collection);
  if (meta.readOnly) throw new Error(`${meta.label} is read-only.`);
  const db = await getDb();
  await db.collection(meta.key).deleteOne(idQuery(id) as any);
  return { ok: true };
}

export async function bulkDelete(collection: string, ids: string[]) {
  for (const id of ids) await deleteDoc(collection, id);
  return { ok: true, deleted: ids.length };
}

export async function setField(collection: string, ids: string[], field: string, value: Json) {
  const meta = metaFor(collection);
  if (meta.readOnly) throw new Error(`${meta.label} is read-only.`);
  const db = await getDb();
  for (const id of ids) {
    await db
      .collection(meta.key)
      .updateOne(idQuery(id) as any, { $set: { [field]: value, updated_at: new Date().toISOString() } });
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- */
/* Dashboard                                                         */
/* ---------------------------------------------------------------- */

export type DashboardData = {
  counts: Record<string, number>;
  pending: { sellers: number; suspendedUsers: number; openConversations: number };
  daily: { day: string; views: number; carts: number; searches: number }[];
  topProducts: { id: string; name: string; views: number }[];
  recentEvents: { type: string; name: string; at: string }[];
  revenueProxy: { totalListed: number; avgPrice: number };
};

export async function fetchDashboard(days = 14): Promise<DashboardData> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const events = db.collection("events");

  const [
    products,
    sellers,
    users,
    reviews,
    conversations,
    messages,
    pendingSellers,
    suspendedUsers,
    openConversations,
    byDay,
    topProducts,
    recent,
    priceAgg,
  ] = await Promise.all([
    db.collection("products").countDocuments(),
    db.collection("sellers").countDocuments(),
    db.collection("users").countDocuments(),
    db.collection("reviews").countDocuments(),
    db.collection("conversations").countDocuments(),
    db.collection("messages").countDocuments(),
    db.collection("sellers").countDocuments({ status: { $nin: ["approved"] } } as any),
    db.collection("users").countDocuments({ is_suspended: true } as any),
    db.collection("conversations").countDocuments({ status: { $ne: "closed" } } as any),
    events
      .aggregate([
        { $match: { day: { $gte: since } } },
        { $group: { _id: { day: "$day", type: "$type" }, n: { $sum: 1 } } },
      ])
      .toArray() as Promise<any[]>,
    events
      .aggregate([
        { $match: { type: "view_product" } },
        { $group: { _id: "$entity_id", name: { $last: "$entity_name" }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 8 },
      ])
      .toArray() as Promise<any[]>,
    events.find({}).sort({ created_at: -1 }).limit(12).toArray() as Promise<any[]>,
    db
      .collection("products")
      .aggregate([{ $group: { _id: null, total: { $sum: "$price" }, avg: { $avg: "$price" } } }])
      .toArray() as Promise<any[]>,
  ]);

  const dayMap = new Map<string, { day: string; views: number; carts: number; searches: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    dayMap.set(day, { day, views: 0, carts: 0, searches: 0 });
  }
  for (const row of byDay) {
    const entry = dayMap.get(row._id.day);
    if (!entry) continue;
    if (String(row._id.type).startsWith("view")) entry.views += row.n;
    else if (row._id.type === "add_cart") entry.carts += row.n;
    else if (row._id.type === "search") entry.searches += row.n;
  }

  return plain({
    counts: { products, sellers, users, reviews, conversations, messages },
    pending: { sellers: pendingSellers, suspendedUsers, openConversations },
    daily: [...dayMap.values()],
    topProducts: topProducts.map((p) => ({ id: String(p._id), name: p.name ?? String(p._id), views: p.n })),
    recentEvents: recent.map((e) => ({
      type: e.type,
      name: e.entity_name ?? e.entity_id ?? "—",
      at: e.created_at,
    })),
    revenueProxy: {
      totalListed: Math.round(priceAgg[0]?.total ?? 0),
      avgPrice: Math.round(priceAgg[0]?.avg ?? 0),
    },
  });
}

/* ---------------------------------------------------------------- */
/* Conversations                                                     */
/* ---------------------------------------------------------------- */

export async function conversationThread(conversationId: string): Promise<{ conversation: JsonDoc | null; messages: JsonDoc[] }> {
  const db = await getDb();
  const [conversation, msgs] = await Promise.all([
    db.collection("conversations").findOne({ _id: conversationId as any }),
    db
      .collection("messages")
      .find({ conversation: conversationId } as any)
      .sort({ created_at: 1 })
      .limit(500)
      .toArray(),
  ]);
  await db
    .collection("conversations")
    .updateOne({ _id: conversationId as any }, { $set: { unread_staff: 0 } });
  return plain({ conversation: conversation as any, messages: msgs as any[] });
}

export async function replyToConversation(conversationId: string, body: string, authorName: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection("messages").insertOne({
    _id: (Date.now().toString(36) + newId().slice(0, 8)) as any,
    conversation: conversationId,
    body,
    role: "admin",
    author_name: authorName,
    created_at: now,
  } as any);
  await db.collection("conversations").updateOne({ _id: conversationId as any }, {
    $set: { last_message: body.slice(0, 200), last_at: now, status: "open" },
    $inc: { unread_user: 1 },
  } as any);
  return { ok: true };
}

/* ---------------------------------------------------------------- */
/* Site settings                                                     */
/* ---------------------------------------------------------------- */

export async function fetchSiteSettings(): Promise<JsonDoc> {
  const db = await getDb();
  const doc = await db.collection("site_settings").findOne({ _id: "site" as any });
  return plain((doc ?? { _id: "site" }) as any);
}

export async function saveSiteSettings(patch: JsonDoc) {
  const db = await getDb();
  const set = { ...patch } as JsonDoc;
  delete set["_id"];
  set["updated_at"] = new Date().toISOString();
  await db.collection("site_settings").updateOne({ _id: "site" as any }, { $set: set }, { upsert: true });
  return fetchSiteSettings();
}