/* eslint-disable @typescript-eslint/no-explicit-any */
import { getRequest } from "@tanstack/react-start/server";

import { getDb } from "./mongo.server";

/** Admin policy: 3 attempts per identity+action, then a 1 hour lockout. */
export const MAX_ATTEMPTS = 3;
export const WINDOW_MS = 60 * 60 * 1000;
export const LOCKOUT_MS = 60 * 60 * 1000;

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array) {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...view].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** 6-digit numeric OTP with rejection sampling (no modulo bias). */
export function randomOtp() {
  let value = 1_000_000;
  while (value >= 1_000_000) {
    const b = crypto.getRandomValues(new Uint8Array(3));
    value = ((b[0]! << 16) | (b[1]! << 8) | b[2]!) % 16_777_216;
    if (value >= 16_000_000) {
      value = 1_000_000;
      continue;
    }
    value = value % 1_000_000;
    break;
  }
  return String(value).padStart(6, "0");
}

/** Tokens/OTPs are stored hashed so a database leak cannot be replayed. */
export async function hashToken(token: string) {
  const secret = process.env["AUTH_TOKEN_PEPPER"] ?? process.env["SESSION_SECRET"] ?? "";
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:${token}`));
  return toHex(digest);
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function clientIp(): string {
  try {
    const req = getRequest();
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return fwd || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

export function userAgent(): string {
  try {
    return getRequest().headers.get("user-agent")?.slice(0, 200) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export type RateLimitState = { remaining: number; blockedUntil: number | null };

function lockMessage(untilMs: number) {
  const mins = Math.max(1, Math.ceil((untilMs - Date.now()) / 60000));
  return `Too many attempts. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}.`;
}

/**
 * Atomic, database-backed limiter. One attempt is consumed up-front so a
 * crash, a parallel request, or a client-side bypass cannot skip the counter.
 */
export async function consumeAttempt(action: string, identifier: string, max = MAX_ATTEMPTS) {
  const db = await getDb();
  const now = Date.now();
  const key = `${action}:${identifier.toLowerCase()}:${clientIp()}`;
  const col = db.collection("rate_limits");
  const existing = (await col.findOne({ _id: key as any })) as any;

  if (existing?.blocked_until && existing.blocked_until > now)
    throw new Error(lockMessage(existing.blocked_until));

  if (!existing || existing.window_start + WINDOW_MS < now) {
    await col.updateOne(
      { _id: key as any },
      {
        $set: {
          window_start: now,
          count: 1,
          blocked_until: null,
          action,
          identifier: identifier.toLowerCase(),
          ip: clientIp(),
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
    return { remaining: max - 1, blockedUntil: null } as RateLimitState;
  }

  const updated = (await col.findOneAndUpdate(
    { _id: key as any },
    { $inc: { count: 1 }, $set: { updated_at: new Date() } },
    { returnDocument: "after" },
  )) as any;

  const count = updated?.count ?? (existing.count ?? 0) + 1;
  if (count > max) {
    const blockedUntil = now + LOCKOUT_MS;
    await col.updateOne({ _id: key as any }, { $set: { blocked_until: blockedUntil } });
    throw new Error(lockMessage(blockedUntil));
  }
  return { remaining: Math.max(0, max - count), blockedUntil: null } as RateLimitState;
}

/** Clear the counter after a legitimate success. */
export async function clearAttempts(action: string, identifier: string) {
  const db = await getDb();
  const key = `${action}:${identifier.toLowerCase()}:${clientIp()}`;
  await db.collection("rate_limits").deleteOne({ _id: key as any });
}

export async function listLockouts() {
  const db = await getDb();
  const now = Date.now();
  const rows = (await db
    .collection("rate_limits")
    .find({ blocked_until: { $gt: now } } as any)
    .sort({ blocked_until: -1 })
    .limit(100)
    .toArray()) as any[];
  return rows.map((r) => ({
    id: String(r._id),
    action: r.action ?? String(r._id).split(":")[0],
    identifier: r.identifier ?? String(r._id).split(":")[1],
    ip: r.ip ?? "unknown",
    attempts: r.count ?? 0,
    blockedUntil: new Date(r.blocked_until).toISOString(),
  }));
}

export async function clearLockout(id: string) {
  const db = await getDb();
  await db.collection("rate_limits").deleteOne({ _id: id as any });
  return true;
}

/** Best-effort index creation (TTL cleanup for one-time tokens + counters). */
let indexesReady: Promise<void> | null = null;
export function ensureSecurityIndexes() {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.allSettled([
        db
          .collection("rate_limits")
          .createIndex({ updated_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 }),
        db.collection("admin_tokens").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
        db.collection("admin_tokens").createIndex({ admin: 1, kind: 1 }),
        db.collection("admin_sessions").createIndex({ token: 1 }),
        db.collection("admins").createIndex({ username: 1 }, { unique: true }),
        db.collection("admin_audit").createIndex({ at: -1 }),
      ]);
    })().catch(() => undefined);
  }
  return indexesReady;
}
