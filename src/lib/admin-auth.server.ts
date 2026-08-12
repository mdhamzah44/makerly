/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCookie, setCookie } from "@tanstack/react-start/server";

import { getDb, newId, plain } from "./mongo.server";

export const ADMIN_COOKIE = "1antiq_admin_session";
const ITER = 120_000;
const enc = new TextEncoder();

import type { AdminRole, AdminUser } from "./admin-types";

export type { AdminRole, AdminUser };

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations = ITER) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${toHex(salt.buffer)}$${await pbkdf2(password, salt)}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored?.startsWith("pbkdf2$")) return false;
  const [, iterStr, saltHex, hash] = stored.split("$");
  if (!iterStr || !saltHex || !hash) return false;
  const candidate = await pbkdf2(password, fromHex(saltHex), Number(iterStr));
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

function mapAdmin(d: any): AdminUser {
  return {
    id: String(d._id),
    name: d.name ?? "",
    email: d.email ?? "",
    role: (d.role ?? "admin") as AdminRole,
    active: d.active !== false,
    lastLoginAt: d.last_login_at ?? null,
    createdAt: d.created_at ?? "",
  };
}

export async function countAdmins() {
  const db = await getDb();
  return db.collection("admin_users").countDocuments();
}

export async function listAdmins(): Promise<AdminUser[]> {
  const db = await getDb();
  const docs = (await db.collection("admin_users").find({}).sort({ created_at: 1 }).toArray()) as any[];
  return plain(docs.map(mapAdmin));
}

export async function createAdmin(input: {
  name: string;
  email: string;
  password: string;
  role?: AdminRole;
}) {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || input.password.length < 8)
    throw new Error("Email and a password of at least 8 characters are required.");
  const existing = await db.collection("admin_users").findOne({ email } as any);
  if (existing) throw new Error("An admin with that email already exists.");
  const id = newId();
  await db.collection("admin_users").insertOne({
    _id: id as any,
    name: input.name.trim() || email,
    email,
    pw: await hashPassword(input.password),
    role: input.role ?? "admin",
    active: true,
    created_at: new Date().toISOString(),
    last_login_at: null,
  } as any);
  return id;
}

export async function updateAdmin(
  id: string,
  patch: { name?: string; email?: string; role?: AdminRole; active?: boolean; password?: string },
) {
  const db = await getDb();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set["name"] = patch.name;
  if (patch.email !== undefined) set["email"] = patch.email.trim().toLowerCase();
  if (patch.role !== undefined) set["role"] = patch.role;
  if (patch.active !== undefined) set["active"] = patch.active;
  if (patch.password) {
    if (patch.password.length < 8) throw new Error("Password must be at least 8 characters.");
    set["pw"] = await hashPassword(patch.password);
  }
  await db.collection("admin_users").updateOne({ _id: id as any }, { $set: set });
}

export async function deleteAdmin(id: string) {
  const db = await getDb();
  const total = await db.collection("admin_users").countDocuments();
  if (total <= 1) throw new Error("You cannot delete the last remaining admin.");
  await db.collection("admin_users").deleteOne({ _id: id as any });
  await db.collection("admin_sessions").deleteMany({ admin: id } as any);
}

export async function loginAdmin(email: string, password: string) {
  const db = await getDb();
  const doc = (await db
    .collection("admin_users")
    .findOne({ email: email.trim().toLowerCase() } as any)) as any;
  if (!doc?.pw) throw new Error("Invalid email or password.");
  if (doc.active === false) throw new Error("This admin account is disabled.");
  if (!(await verifyPassword(password, doc.pw))) throw new Error("Invalid email or password.");

  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const now = new Date();
  await db.collection("admin_sessions").insertOne({
    _id: newId() as any,
    token,
    admin: String(doc._id),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 12).toISOString(),
  } as any);
  await db
    .collection("admin_users")
    .updateOne({ _id: doc._id }, { $set: { last_login_at: now.toISOString() } });

  setCookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return mapAdmin({ ...doc, last_login_at: now.toISOString() });
}

export async function logoutAdmin() {
  const token = getCookie(ADMIN_COOKIE);
  if (token) {
    const db = await getDb();
    await db.collection("admin_sessions").deleteOne({ token } as any);
  }
  setCookie(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function currentAdmin(): Promise<AdminUser | null> {
  const token = getCookie(ADMIN_COOKIE);
  if (!token) return null;
  const db = await getDb();
  const session = (await db.collection("admin_sessions").findOne({ token } as any)) as any;
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await db.collection("admin_sessions").deleteOne({ token } as any);
    return null;
  }
  const doc = (await db.collection("admin_users").findOne({ _id: session.admin as any })) as any;
  if (!doc || doc.active === false) return null;
  return plain(mapAdmin(doc));
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}

/** Roles allowed to mutate data. */
export function assertWriter(admin: AdminUser) {
  if (admin.role === "support") throw new Error("Your role is read-only.");
  return admin;
}

export function assertOwner(admin: AdminUser) {
  if (admin.role !== "owner") throw new Error("Only an owner can manage admin accounts.");
  return admin;
}

export async function writeAudit(admin: AdminUser, action: string, detail: Record<string, unknown>) {
  const db = await getDb();
  await db.collection("admin_audit").insertOne({
    _id: newId() as any,
    admin: admin.id,
    admin_email: admin.email,
    action,
    detail,
    created_at: new Date().toISOString(),
  } as any);
}