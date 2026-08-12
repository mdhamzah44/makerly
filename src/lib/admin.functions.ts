import { createServerFn } from "@tanstack/react-start";

import type { Json, JsonDoc } from "./collections";
import * as auth from "./admin-auth.server";
import * as data from "./admin-data.server";

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await auth.currentAdmin();
  const needsBootstrap = admin ? false : (await auth.countAdmins()) === 0;
  return { admin, needsBootstrap };
});

export const adminBootstrap = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; email: string; password: string }) => d)
  .handler(async ({ data: input }) => {
    if ((await auth.countAdmins()) > 0) throw new Error("Admin accounts already exist.");
    await auth.createAdmin({ ...input, role: "owner" });
    return auth.loginAdmin(input.email, input.password);
  });

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data: input }) => auth.loginAdmin(input.email, input.password));

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  await auth.logoutAdmin();
  return { ok: true };
});

export const listAdminUsers = createServerFn({ method: "GET" }).handler(async () => {
  await auth.requireAdmin();
  return auth.listAdmins();
});

export const createAdminUser = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; email: string; password: string; role: auth.AdminRole }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertOwner(await auth.requireAdmin());
    await auth.createAdmin(input);
    await auth.writeAudit(me, "admin.create", { email: input.email, role: input.role });
    return auth.listAdmins();
  });

export const updateAdminUser = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      email?: string;
      role?: auth.AdminRole;
      active?: boolean;
      password?: string;
    }) => d,
  )
  .handler(async ({ data: input }) => {
    const me = auth.assertOwner(await auth.requireAdmin());
    const { id, ...patch } = input;
    await auth.updateAdmin(id, patch);
    await auth.writeAudit(me, "admin.update", { id, fields: Object.keys(patch) });
    return auth.listAdmins();
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertOwner(await auth.requireAdmin());
    if (me.id === input.id) throw new Error("You cannot delete your own account.");
    await auth.deleteAdmin(input.id);
    await auth.writeAudit(me, "admin.delete", { id: input.id });
    return auth.listAdmins();
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { current: string; next: string }) => d)
  .handler(async ({ data: input }) => {
    const me = await auth.requireAdmin();
    await auth.loginAdmin(me.email, input.current);
    await auth.updateAdmin(me.id, { password: input.next });
    await auth.writeAudit(me, "admin.password_change", {});
    return { ok: true };
  });

export const dashboard = createServerFn({ method: "GET" }).handler(async () => {
  await auth.requireAdmin();
  return data.fetchDashboard();
});

export const listDocuments = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      collection: string;
      q?: string;
      page?: number;
      limit?: number;
      filter?: JsonDoc;
    }) => d,
  )
  .handler(async ({ data: input }) => {
    await auth.requireAdmin();
    return data.listDocs(input);
  });

export const getDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { collection: string; id: string }) => d)
  .handler(async ({ data: input }) => {
    await auth.requireAdmin();
    return data.getDoc(input.collection, input.id);
  });

export const saveDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { collection: string; id: string; patch: JsonDoc }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertWriter(await auth.requireAdmin());
    const result = await data.saveDoc(input.collection, input.id, input.patch);
    await auth.writeAudit(me, "doc.update", {
      collection: input.collection,
      id: input.id,
      fields: Object.keys(input.patch),
    });
    return result;
  });

export const createDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { collection: string; doc: JsonDoc }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertWriter(await auth.requireAdmin());
    const result = await data.createDoc(input.collection, input.doc);
    await auth.writeAudit(me, "doc.create", { collection: input.collection });
    return result;
  });

export const deleteDocuments = createServerFn({ method: "POST" })
  .inputValidator((d: { collection: string; ids: string[] }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertWriter(await auth.requireAdmin());
    const result = await data.bulkDelete(input.collection, input.ids);
    await auth.writeAudit(me, "doc.delete", { collection: input.collection, ids: input.ids });
    return result;
  });

export const setDocumentField = createServerFn({ method: "POST" })
  .inputValidator((d: { collection: string; ids: string[]; field: string; value: Json }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertWriter(await auth.requireAdmin());
    const result = await data.setField(input.collection, input.ids, input.field, input.value);
    await auth.writeAudit(me, "doc.set_field", {
      collection: input.collection,
      ids: input.ids,
      field: input.field,
      value: input.value,
    });
    return result;
  });

export const loadThread = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data: input }) => {
    await auth.requireAdmin();
    return data.conversationThread(input.id);
  });

export const replyThread = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; body: string }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertWriter(await auth.requireAdmin());
    return data.replyToConversation(input.id, input.body, me.name || "Support");
  });

export const loadSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  await auth.requireAdmin();
  return data.fetchSiteSettings();
});

export const saveSiteSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { patch: JsonDoc }) => d)
  .handler(async ({ data: input }) => {
    const me = auth.assertWriter(await auth.requireAdmin());
    const result = await data.saveSiteSettings(input.patch);
    await auth.writeAudit(me, "settings.update", { fields: Object.keys(input.patch) });
    return result;
  });