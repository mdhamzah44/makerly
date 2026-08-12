import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AdminShell } from "@/components/admin-shell";
import { adminMe } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  loader: async () => {
    const me = await adminMe();
    if (!me.admin) throw redirect({ to: "/" });
    return { admin: me.admin };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { admin } = Route.useLoaderData();
  return (
    <AdminShell admin={admin}>
      <Outlet />
    </AdminShell>
  );
}