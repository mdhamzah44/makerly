/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from "./mongo.server";
import { assertStrongPassword, normalizeEmail } from "./password";
import {
  clientIp,
  ensureSecurityIndexes,
  hashToken,
  randomOtp,
  randomToken,
  timingSafeEqual,
  toHex,
  userAgent,
} from "./security.server";

export const SESSION_COOKIE = "1antiq_admin_session";
const ITER = 210_000;
const SESSION_DAYS = 7;
export const OTP_TTL_MINUTES = 10;

const enc = new TextEncoder();

export type AdminRole = "super_admin" | "admin" | "viewer";

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: AdminRole;
  disabled: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  recoveryEmail: string;
};

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
  return timingSafeEqual(candidate, hash);
}

function newId() {
  return randomToken(12);
}

function shape(doc: any): AdminUser {
  return {
    id: String(doc._id),
    username: doc.username ?? "",
    email: doc.email ?? "",
    name: doc.name ?? doc.username ?? "",
    role: (doc.role ?? "admin") as AdminRole,
    disabled: !!doc.disabled,
    createdAt: doc.created_at ? new Date(doc.created_at).toISOString() : null,
    lastLoginAt: doc.last_login_at ? new Date(doc.last_login_at).toISOString() : null,
    recoveryEmail: doc.recovery_email ?? doc.email ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

let bootstrapped: Promise<void> | null = null;

/** Creates the super admin from env on first run. Never overwrites an existing one. */
export function ensureSuperAdmin() {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await ensureSecurityIndexes();
      const db = await getDb();
      const username = (process.env["SUPER_ADMIN_USERNAME"] || "superadmin").toLowerCase();
      const email = normalizeEmail(process.env["SUPER_ADMIN_EMAIL"] || "mhd123hamzah@gmail.com");
      const password = process.env["SUPER_ADMIN_PASSWORD"] || "";
      const existing = await db.collection("admins").findOne({ role: "super_admin" } as any);
      if (existing) return;
      if (!password) {
        console.error("[admin] SUPER_ADMIN_PASSWORD is not configured — no super admin created");
        return;
      }
      await db.collection("admins").insertOne({
        _id: newId() as any,
        username,
        email,
        recovery_email: email,
        name: "Super Admin",
        role: "super_admin",
        pw: await hashPassword(password),
        disabled: false,
        must_change_password: true,
        created_at: new Date().toISOString(),
      } as any);
    })().catch((e) => {
      bootstrapped = null;
      throw e;
    });
  }
  return bootstrapped;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function createSession(adminId: string) {
  const db = await getDb();
  const token = randomToken(32);
  await db.collection("admin_sessions").insertOne({
    token: await hashToken(token),
    admin: adminId,
    ip: clientIp(),
    ua: userAgent(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * SESSION_DAYS).toISOString(),
  } as any);
  await db
    .collection("admins")
    .updateOne({ _id: adminId as any }, { $set: { last_login_at: new Date().toISOString() } });
  return token;
}

export async function destroySession(token: string) {
  const db = await getDb();
  await db.collection("admin_sessions").deleteMany({ token: await hashToken(token) } as any);
}

export async function destroyOtherSessions(adminId: string, currentToken?: string) {
  const db = await getDb();
  const keep = currentToken ? await hashToken(currentToken) : "";
  const res = await db
    .collection("admin_sessions")
    .deleteMany({ admin: adminId, token: { $ne: keep } } as any);
  return res.deletedCount ?? 0;
}

export async function listSessions(adminId: string, currentToken?: string) {
  const db = await getDb();
  const keep = currentToken ? await hashToken(currentToken) : "";
  const rows = (await db
    .collection("admin_sessions")
    .find({ admin: adminId } as any)
    .sort({ created_at: -1 })
    .limit(50)
    .toArray()) as any[];
  return rows.map((r) => ({
    id: String(r._id),
    ip: r.ip ?? "unknown",
    ua: r.ua ?? "unknown",
    createdAt: r.created_at ?? null,
    expiresAt: r.expires_at ?? null,
    current: r.token === keep,
  }));
}

export async function adminFromToken(token: string | undefined): Promise<AdminUser | null> {
  if (!token || token.length < 32) return null;
  const db = await getDb();
  const session = (await db
    .collection("admin_sessions")
    .findOne({ token: await hashToken(token) } as any)) as any;
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await db.collection("admin_sessions").deleteOne({ _id: session._id } as any);
    return null;
  }
  const doc = (await db.collection("admins").findOne({ _id: session.admin as any })) as any;
  if (!doc || doc.disabled) return null;
  return shape(doc);
}

/* ------------------------------------------------------------------ */
/* One-time codes                                                      */
/* ------------------------------------------------------------------ */

type TokenKind = "login_otp" | "recovery_otp" | "change_password_otp";

async function issueCode(
  kind: TokenKind,
  adminId: string,
  value: string,
  ttlMinutes = OTP_TTL_MINUTES,
) {
  const db = await getDb();
  await ensureSecurityIndexes();
  await db.collection("admin_tokens").deleteMany({ admin: adminId, kind } as any);
  await db.collection("admin_tokens").insertOne({
    kind,
    admin: adminId,
    hash: await hashToken(`${kind}:${value}`),
    created_at: new Date(),
    expires_at: new Date(Date.now() + ttlMinutes * 60_000),
  } as any);
}

async function consumeCode(kind: TokenKind, value: string, adminId?: string) {
  const db = await getDb();
  const hash = await hashToken(`${kind}:${value}`);
  const query: any = adminId ? { kind, hash, admin: adminId } : { kind, hash };
  const doc = (await db.collection("admin_tokens").findOne(query)) as any;
  if (!doc) return null;
  if (new Date(doc.expires_at) < new Date()) {
    await db.collection("admin_tokens").deleteOne({ _id: doc._id } as any);
    return null;
  }
  const del = await db.collection("admin_tokens").deleteOne({ _id: doc._id } as any);
  if (!del.deletedCount) return null;
  return String(doc.admin);
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export async function audit(actor: string, action: string, details: Record<string, unknown> = {}) {
  try {
    const db = await getDb();
    await db.collection("admin_audit").insertOne({
      actor,
      action,
      details,
      ip: clientIp(),
      ua: userAgent(),
      at: new Date().toISOString(),
    } as any);
  } catch {
    /* auditing must never break the request */
  }
}

export async function listAudit(limit = 100, skip = 0) {
  const db = await getDb();
  const col = db.collection("admin_audit");
  const [rows, total] = await Promise.all([
    col
      .find({} as any)
      .sort({ at: -1 })
      .skip(skip)
      .limit(Math.min(limit, 200))
      .toArray() as Promise<any[]>,
    col.countDocuments({} as any),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: String(r._id),
      actor: r.actor ?? "system",
      action: r.action ?? "",
      details: r.details ?? {},
      ip: r.ip ?? "",
      at: r.at ?? null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Login: password -> emailed OTP                                      */
/* ------------------------------------------------------------------ */

export async function findAdmin(usernameOrEmail: string) {
  const db = await getDb();
  const value = (usernameOrEmail ?? "").trim().toLowerCase();
  return (await db.collection("admins").findOne({
    $or: [{ username: value }, { email: value }],
  } as any)) as any;
}

/** Step 1 — verify the password and return an OTP to email. */
export async function startLogin(usernameOrEmail: string, password: string) {
  await ensureSuperAdmin();
  const doc = await findAdmin(usernameOrEmail);
  const stored = doc?.pw ?? "pbkdf2$1$00$00";
  const ok = await verifyPassword(password ?? "", stored);
  if (!doc || !ok) throw new Error("Invalid credentials.");
  if (doc.disabled) throw new Error("This admin account is disabled.");
  const code = randomOtp();
  await issueCode("login_otp", String(doc._id), code);
  return { adminId: String(doc._id), email: doc.email as string, code };
}

/** Step 2 — exchange the emailed code for a session. */
export async function completeLogin(usernameOrEmail: string, code: string) {
  const doc = await findAdmin(usernameOrEmail);
  if (!doc) throw new Error("That code is invalid or has expired.");
  const adminId = await consumeCode("login_otp", code, String(doc._id));
  if (!adminId) throw new Error("That code is invalid or has expired.");
  const token = await createSession(adminId);
  await audit(doc.username ?? "unknown", "auth.login", { via: "password+otp" });
  return { token, admin: shape(doc) };
}

/** Resend the login code for an already password-verified admin. */
export async function resendLoginOtp(usernameOrEmail: string) {
  const doc = await findAdmin(usernameOrEmail);
  if (!doc) return null;
  const code = randomOtp();
  await issueCode("login_otp", String(doc._id), code);
  return { email: doc.email as string, code };
}

/* ------------------------------------------------------------------ */
/* Recovery                                                            */
/* ------------------------------------------------------------------ */

/** Sends a code to the account's recovery email. Silent when unknown. */
export async function startRecovery(usernameOrEmail: string) {
  await ensureSuperAdmin();
  const doc = await findAdmin(usernameOrEmail);
  if (!doc) return null;
  const code = randomOtp();
  await issueCode("recovery_otp", String(doc._id), code);
  const email = (doc.recovery_email as string) || (doc.email as string);
  return { email, code };
}

export async function completeRecovery(usernameOrEmail: string, code: string, newPassword: string) {
  const doc = await findAdmin(usernameOrEmail);
  if (!doc) throw new Error("That code is invalid or has expired.");
  const adminId = await consumeCode("recovery_otp", code, String(doc._id));
  if (!adminId) throw new Error("That code is invalid or has expired.");
  assertStrongPassword(newPassword);
  const db = await getDb();
  await db.collection("admins").updateOne(
    { _id: adminId as any },
    {
      $set: {
        pw: await hashPassword(newPassword),
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      },
    },
  );
  await db.collection("admin_sessions").deleteMany({ admin: adminId } as any);
  await audit(doc.username ?? "unknown", "auth.recovery_reset", {});
  return { email: (doc.recovery_email as string) || (doc.email as string) };
}

/* ------------------------------------------------------------------ */
/* Account management                                                  */
/* ------------------------------------------------------------------ */

/** Step 1 — verify the current password and email a one-time code before anything changes. */
export async function startPasswordChange(
  adminId: string,
  currentPassword: string,
  newPassword: string,
) {
  const db = await getDb();
  const doc = (await db.collection("admins").findOne({ _id: adminId as any })) as any;
  if (!doc) throw new Error("Account not found.");
  if (!(await verifyPassword(currentPassword, doc.pw ?? "")))
    throw new Error("Your current password is incorrect.");
  assertStrongPassword(newPassword);
  if (await verifyPassword(newPassword, doc.pw ?? ""))
    throw new Error("Choose a password you haven't used here before.");
  const code = randomOtp();
  await issueCode("change_password_otp", String(doc._id), code);
  return { email: doc.email as string, code };
}

/** Step 2 — the emailed code confirms it's really the account owner making the change. */
export async function confirmPasswordChange(adminId: string, code: string, newPassword: string) {
  const db = await getDb();
  const doc = (await db.collection("admins").findOne({ _id: adminId as any })) as any;
  if (!doc) throw new Error("Account not found.");
  const confirmedId = await consumeCode("change_password_otp", code, adminId);
  if (!confirmedId) throw new Error("That code is invalid or has expired.");
  assertStrongPassword(newPassword);
  if (await verifyPassword(newPassword, doc.pw ?? ""))
    throw new Error("Choose a password you haven't used here before.");
  await db.collection("admins").updateOne(
    { _id: doc._id },
    {
      $set: {
        pw: await hashPassword(newPassword),
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      },
    },
  );
  await audit(doc.username ?? "unknown", "account.password_changed", {});
  return { email: (doc.email as string) ?? "" };
}

export async function updateProfile(
  adminId: string,
  input: { name?: string; recoveryEmail?: string },
) {
  const db = await getDb();
  const set: any = {};
  if (input.name !== undefined) set.name = input.name.trim().slice(0, 80);
  if (input.recoveryEmail) set.recovery_email = normalizeEmail(input.recoveryEmail);
  if (!Object.keys(set).length) return true;
  await db.collection("admins").updateOne({ _id: adminId as any }, { $set: set });
  return true;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const db = await getDb();
  const rows = (await db
    .collection("admins")
    .find({} as any)
    .sort({ created_at: 1 })
    .toArray()) as any[];
  return rows.map(shape);
}

export async function setAdminDisabled(adminId: string, disabled: boolean) {
  const db = await getDb();
  const doc = (await db.collection("admins").findOne({ _id: adminId as any })) as any;
  if (!doc) throw new Error("Admin not found.");
  if (doc.role === "super_admin") throw new Error("The super admin cannot be disabled.");
  await db.collection("admins").updateOne({ _id: doc._id }, { $set: { disabled } });
  if (disabled) await db.collection("admin_sessions").deleteMany({ admin: adminId } as any);
  return true;
}
