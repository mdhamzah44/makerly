import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { securityOverview, unlock } from "@/lib/admin.functions";

export const Route = createFileRoute("/dashboard/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const load = useServerFn(securityOverview);
  const clear = useServerFn(unlock);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-security"],
    queryFn: () => load(),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security &amp; audit</h1>
        <p className="text-sm text-muted-foreground">
          3 failed attempts lock an identity for 1 hour. Every admin action is recorded.
        </p>
      </div>

      <section className="surface-card p-4">
        <h2 className="text-base font-semibold">Active lockouts</h2>
        <div className="mt-3 grid gap-2">
          {(data?.lockouts ?? []).map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <span className="font-medium">{l.identifier}</span>
              <span className="text-muted-foreground">{l.action}</span>
              <span className="text-muted-foreground">{l.ip}</span>
              <span className="text-muted-foreground">
                until {new Date(l.blockedUntil).toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() =>
                  void clear({ data: { id: l.id } }).then(() => {
                    toast.success("Unlocked.");
                    return qc.invalidateQueries({ queryKey: ["admin-security"] });
                  })
                }
              >
                Unlock
              </Button>
            </div>
          ))}
          {!data?.lockouts?.length && (
            <p className="text-sm text-muted-foreground">No accounts are locked right now.</p>
          )}
        </div>
      </section>

      <section className="surface-card p-4">
        <h2 className="text-base font-semibold">Audit log</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {(data?.audit?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.at ? new Date(r.at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">{r.actor}</td>
                  <td className="px-3 py-2">{r.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.ip}</td>
                </tr>
              ))}
              {!data?.audit?.rows?.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Nothing logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
