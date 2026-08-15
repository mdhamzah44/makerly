import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminToggle, adminsList } from "@/lib/admin.functions";

export const Route = createFileRoute("/dashboard/admins")({
  component: AdminsPage,
});

function AdminsPage() {
  const load = useServerFn(adminsList);
  const toggle = useServerFn(adminToggle);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["admins"], queryFn: () => load(), staleTime: 30_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admins"] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Admins</h1>
        <p className="text-sm text-muted-foreground">
          Admin accounts are provisioned outside this dashboard. From here the super admin can only
          suspend or re-enable an existing account — no new admins can be added or removed here.
        </p>
      </div>

      <section className="surface-card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">{a.username}</td>
                <td className="px-4 py-3">{a.email}</td>
                <td className="px-4 py-3 capitalize">{a.role.replace("_", " ")}</td>
                <td className="px-4 py-3">
                  {a.disabled ? (
                    <Badge className="border-transparent bg-destructive/15 text-destructive">
                      Disabled
                    </Badge>
                  ) : (
                    <Badge className="border-transparent bg-success/15 text-success">Active</Badge>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {a.role !== "super_admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void toggle({ data: { id: a.id, disabled: !a.disabled } })
                          .then(() => {
                            toast.success(a.disabled ? "Admin re-enabled." : "Admin suspended.");
                            return refresh();
                          })
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      {a.disabled ? "Enable" : "Disable"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No admin accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
