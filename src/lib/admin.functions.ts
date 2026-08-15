import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";

import {
  SESSION_COOKIE,
  adminFromToken,
  audit,
  completeLogin,
  completeRecovery,
  confirmPasswordChange,
  destroyOtherSessions,
  destroySession,
  ensureSuperAdmin,
  listAdmins,
  listAudit,
  listSessions,
  resendLoginOtp,
  setAdminDisabled,
  startLogin,
  startPasswordChange,
  startRecovery,
  updateProfile,
} from "./admin-auth.server";
import {
  bulkDelete,
  createDoc,
  dbHealth,
  deleteDoc,
  exportEntity,
  getDoc,
  listEntity,
  overviewStats,
  patchDoc,
} from "./admin-data.server";
import { sendAdminAlertEmail, sendAdminOtpEmail } from "./email.server";
import { isValidEmail } from "./password";
import { clearAttempts, clearLockout, consumeAttempt, listLockouts } from "./security.server";

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

async function requireAdmin() {
  const admin = await adminFromToken(getCookie(SESSION_COOKIE));
  if (!admin) throw new Error("Please sign in again.");
  return admin;
}

async function requireSuper() {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") throw new Error("Super admin only.");
  return admin;
}

async function requireWriter() {
  const admin = await requireAdmin();
  if (admin.role === "viewer") throw new Error("Your account has read-only access.");
  return admin;
}

/* ------------------------------ session ------------------------------ */

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await adminFromToken(getCookie(SESSION_COOKIE));
  return { admin };
});

export const loginStep1 = createServerFn({ method: "POST" })
  .inputValidator((i: { username: string; password: string }) => {
    const username = (i?.username ?? "").trim();
    if (!username) throw new Error("Enter your username or email.");
    if (!i?.password) throw new Error("Enter your password.");
    return { username, password: i.password };
  })
  .handler(async ({ data }) => {
    await ensureSuperAdmin();
    await consumeAttempt("admin_login", data.username);
    const result = await startLogin(data.username, data.password);
    await clearAttempts("admin_login", data.username);
    await sendAdminOtpEmail(result.email, result.code, 10, "Confirm your admin sign-in");
    await audit(data.username, "auth.otp_sent", {});
    const [name, domain] = result.email.split("@");
    return { otpSent: true, hint: `${(name ?? "").slice(0, 2)}•••@${domain ?? ""}` };
  });

export const loginResend = createServerFn({ method: "POST" })
  .inputValidator((i: { username: string }) => ({ username: (i?.username ?? "").trim() }))
  .handler(async ({ data }) => {
    await consumeAttempt("admin_otp_resend", data.username, 5);
    const result = await resendLoginOtp(data.username);
    if (result)
      await sendAdminOtpEmail(result.email, result.code, 10, "Confirm your admin sign-in");
    return { sent: true };
  });

export const loginStep2 = createServerFn({ method: "POST" })
  .inputValidator((i: { username: string; code: string }) => {
    const code = (i?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("Enter the 6-digit code.");
    return { username: (i?.username ?? "").trim(), code };
  })
  .handler(async ({ data }) => {
    await consumeAttempt("admin_otp", data.username);
    const { token, admin } = await completeLogin(data.username, data.code);
    await clearAttempts("admin_otp", data.username);
    setCookie(SESSION_COOKIE, token, cookieOpts);
    return { admin };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) await destroySession(token);
  setCookie(SESSION_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  return { ok: true };
});

/* ------------------------------ recovery ------------------------------ */

export const recoveryStart = createServerFn({ method: "POST" })
  .inputValidator((i: { username: string }) => {
    const username = (i?.username ?? "").trim();
    if (!username) throw new Error("Enter your username or recovery email.");
    return { username };
  })
  .handler(async ({ data }) => {
    await consumeAttempt("admin_recovery", data.username, 5);
    const result = await startRecovery(data.username);
    if (result) await sendAdminOtpEmail(result.email, result.code, 10, "Reset your admin password");
    return { sent: true };
  });

export const recoveryComplete = createServerFn({ method: "POST" })
  .inputValidator((i: { username: string; code: string; password: string }) => {
    const code = (i?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("Enter the 6-digit code.");
    return { username: (i?.username ?? "").trim(), code, password: i?.password ?? "" };
  })
  .handler(async ({ data }) => {
    await consumeAttempt("admin_recovery_verify", data.username);
    const { email } = await completeRecovery(data.username, data.code, data.password);
    await clearAttempts("admin_recovery_verify", data.username);
    await sendAdminAlertEmail(
      email,
      "Password reset",
      "Your admin password was reset and all sessions were signed out.",
    ).catch(() => undefined);
    return { ok: true };
  });

/* ------------------------------ account ------------------------------ */

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${(name ?? "").slice(0, 2)}•••@${domain ?? ""}`;
}

export const changeMyPasswordStart = createServerFn({ method: "POST" })
  .inputValidator((i: { current: string; next: string }) => ({
    current: i?.current ?? "",
    next: i?.next ?? "",
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await consumeAttempt("admin_change_pw", admin.username, 5);
    const { email, code } = await startPasswordChange(admin.id, data.current, data.next);
    await clearAttempts("admin_change_pw", admin.username);
    await sendAdminOtpEmail(email, code, 10, "Confirm your password change");
    await audit(admin.username, "account.password_change_otp_sent", {});
    return { otpSent: true, hint: maskEmail(email) };
  });

export const changeMyPasswordVerify = createServerFn({ method: "POST" })
  .inputValidator((i: { code: string; next: string }) => {
    const code = (i?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("Enter the 6-digit code.");
    return { code, next: i?.next ?? "" };
  })
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await consumeAttempt("admin_change_pw_otp", admin.username, 5);
    const { email } = await confirmPasswordChange(admin.id, data.code, data.next);
    await clearAttempts("admin_change_pw_otp", admin.username);
    await destroyOtherSessions(admin.id, getCookie(SESSION_COOKIE));
    await sendAdminAlertEmail(
      email,
      "Password changed",
      "Your admin password was just changed and other sessions were signed out.",
    ).catch(() => undefined);
    return { ok: true };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator((i: { name?: string; recoveryEmail?: string }) => {
    if (i?.recoveryEmail && !isValidEmail(i.recoveryEmail))
      throw new Error("Enter a valid recovery email.");
    return { name: i?.name ?? "", recoveryEmail: i?.recoveryEmail ?? "" };
  })
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await updateProfile(admin.id, { name: data.name, recoveryEmail: data.recoveryEmail });
    await audit(admin.username, "account.profile_updated", {});
    return { ok: true };
  });

export const mySessions = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdmin();
  return listSessions(admin.id, getCookie(SESSION_COOKIE));
});

export const signOutOthers = createServerFn({ method: "POST" }).handler(async () => {
  const admin = await requireAdmin();
  const removed = await destroyOtherSessions(admin.id, getCookie(SESSION_COOKIE));
  await audit(admin.username, "account.sessions_revoked", { removed });
  return { removed };
});

/* ------------------------------- data -------------------------------- */

export const statsOverview = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const [stats, health] = await Promise.all([overviewStats(), dbHealth()]);
  return { ...stats, health };
});

export const listRecords = createServerFn({ method: "POST" })
  .inputValidator(
    (i: {
      entity: string;
      q?: string;
      page?: number;
      filter?: Record<string, unknown> | null;
      sort?: string;
      dir?: "asc" | "desc";
    }) => ({
      entity: i?.entity ?? "",
      q: i?.q ?? "",
      page: i?.page ?? 1,
      filter: i?.filter ?? null,
      sort: i?.sort ?? "",
      dir: i?.dir ?? ("desc" as const),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    return listEntity({
      entity: data.entity,
      q: data.q,
      page: data.page,
      filter: data.filter,
      sort: data.sort,
      dir: data.dir,
    });
  });

export const getRecord = createServerFn({ method: "POST" })
  .inputValidator((i: { entity: string; id: string }) => ({
    entity: i?.entity ?? "",
    id: i?.id ?? "",
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return getDoc(data.entity, data.id);
  });

export const createRecord = createServerFn({ method: "POST" })
  .inputValidator((i: { entity: string; patch: Record<string, unknown> }) => ({
    entity: i?.entity ?? "",
    patch: i?.patch ?? {},
  }))
  .handler(async ({ data }) => {
    const admin = await requireWriter();
    const { id } = await createDoc(data.entity, data.patch);
    await audit(admin.username, `${data.entity}.create`, { id });
    return { id };
  });

export const patchRecord = createServerFn({ method: "POST" })
  .inputValidator((i: { entity: string; id: string; patch: Record<string, unknown> }) => ({
    entity: i?.entity ?? "",
    id: i?.id ?? "",
    patch: i?.patch ?? {},
  }))
  .handler(async ({ data }) => {
    const admin = await requireWriter();
    const set = await patchDoc(data.entity, data.id, data.patch);
    await audit(admin.username, `${data.entity}.update`, { id: data.id, fields: Object.keys(set) });
    return { ok: true };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .inputValidator((i: { entity: string; id: string }) => ({
    entity: i?.entity ?? "",
    id: i?.id ?? "",
  }))
  .handler(async ({ data }) => {
    const admin = await requireWriter();
    const ok = await deleteDoc(data.entity, data.id);
    await audit(admin.username, `${data.entity}.delete`, { id: data.id });
    return { ok };
  });

export const deleteRecords = createServerFn({ method: "POST" })
  .inputValidator((i: { entity: string; ids: string[] }) => ({
    entity: i?.entity ?? "",
    ids: i?.ids ?? [],
  }))
  .handler(async ({ data }) => {
    const admin = await requireWriter();
    const removed = await bulkDelete(data.entity, data.ids);
    await audit(admin.username, `${data.entity}.bulk_delete`, { count: removed });
    return { removed };
  });

export const exportRecords = createServerFn({ method: "POST" })
  .inputValidator((i: { entity: string; q?: string }) => ({
    entity: i?.entity ?? "",
    q: i?.q ?? "",
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    await audit(admin.username, `${data.entity}.export`, {});
    return { rows: await exportEntity(data.entity, data.q) };
  });

/* ------------------------------ security ------------------------------ */

export const securityOverview = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const [lockouts, auditLog] = await Promise.all([listLockouts(), listAudit(50)]);
  return { lockouts, audit: auditLog };
});

export const auditPage = createServerFn({ method: "POST" })
  .inputValidator((i: { page?: number }) => ({ page: i?.page ?? 1 }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAudit(50, (data.page - 1) * 50);
  });

export const unlock = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string }) => ({ id: i?.id ?? "" }))
  .handler(async ({ data }) => {
    const admin = await requireWriter();
    await clearLockout(data.id);
    await audit(admin.username, "security.unlock", { key: data.id });
    return { ok: true };
  });

/* -------------------------------- admins ------------------------------ */
/* Admin accounts are provisioned outside this UI (env-configured super admin
 * only) — this app intentionally does not support adding or deleting admins
 * from here. Existing accounts can still be suspended if compromised. */

export const adminsList = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return listAdmins();
});

export const adminToggle = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; disabled: boolean }) => ({
    id: i?.id ?? "",
    disabled: !!i?.disabled,
  }))
  .handler(async ({ data }) => {
    const admin = await requireSuper();
    await setAdminDisabled(data.id, data.disabled);
    await audit(admin.username, data.disabled ? "admins.disable" : "admins.enable", {
      id: data.id,
    });
    return { ok: true };
  });
