import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes, MessageCircle, ShieldAlert, Store, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { dashboard } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · 1Antiq Admin" },
      { name: "description", content: "Live marketplace activity, catalogue size and queues." },
      { property: "og:title", content: "Dashboard · 1Antiq Admin" },
      { property: "og:description", content: "Live marketplace activity and queues." },
    ],
  }),
  component: DashboardPage,
});

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Boxes;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => dashboard() });

  if (isLoading || !data) return <p className="text-muted-foreground">Loading dashboard…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live snapshot of the marketplace.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={Boxes} label="Products" value={data.counts["products"] ?? 0} />
        <Stat icon={Store} label="Sellers" value={data.counts["sellers"] ?? 0} hint={`${data.pending.sellers} awaiting approval`} />
        <Stat icon={Users} label="Users" value={data.counts["users"] ?? 0} hint={`${data.pending.suspendedUsers} suspended`} />
        <Stat
          icon={MessageCircle}
          label="Conversations"
          value={data.counts["conversations"] ?? 0}
          hint={`${data.pending.openConversations} open`}
        />
        <Stat icon={ShieldAlert} label="Reviews" value={data.counts["reviews"] ?? 0} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Activity — last 14 days
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="views" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="carts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-foreground)",
                }}
              />
              <Area type="monotone" dataKey="views" stroke="var(--color-chart-1)" fill="url(#views)" />
              <Area type="monotone" dataKey="carts" stroke="var(--color-chart-2)" fill="url(#carts)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Most viewed products
          </h2>
          <ul className="space-y-2">
            {data.topProducts.length === 0 && <li className="text-sm text-muted-foreground">No views recorded yet.</li>}
            {data.topProducts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="line-clamp-1">{p.name}</span>
                <Badge variant="secondary">{p.views}</Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </h2>
          <ul className="space-y-2">
            {data.recentEvents.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="line-clamp-1">
                  <Badge variant="outline" className="mr-2">
                    {e.type}
                  </Badge>
                  {e.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {String(e.at).slice(5, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}