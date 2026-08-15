import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  PackageSearch,
  ShoppingBag,
  Store,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { entitiesByGroup } from "@/lib/entities";
import { iconFor } from "@/lib/icon-map";
import { statsOverview } from "@/lib/admin.functions";
import { money, num, shortDate } from "@/lib/format";
import { readCacheSync, writeCache } from "@/lib/client-cache";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

type Stats = Awaited<ReturnType<typeof statsOverview>>;
type TopProduct = Stats["topProducts"][number];
type TopSeller = Stats["topSellers"][number];

function Overview() {
  const fetchStats = useServerFn(statsOverview);
  const initial = readCacheSync<Stats>("admin.stats", 5 * 60_000);

  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = (await fetchStats()) as Stats;
      writeCache("admin.stats", res);
      return res;
    },
    ...(initial ? { initialData: initial } : {}),
    staleTime: 60_000,
  });

  const counts = data?.counts ?? {};
  const attention = data?.attention;
  const groups = entitiesByGroup();

  const attentionItems = attention
    ? [
        {
          key: "pendingSellers",
          label: "Sellers awaiting approval",
          value: attention.pendingSellers,
          to: "sellers",
          tone: "warning" as const,
        },
        {
          key: "outOfStock",
          label: "Products out of stock",
          value: attention.outOfStock,
          to: "products",
          tone: "destructive" as const,
        },
        {
          key: "lowStock",
          label: "Products low on stock",
          value: attention.lowStock,
          to: "products",
          tone: "warning" as const,
        },
        {
          key: "pendingOrders",
          label: "Orders to process",
          value: attention.pendingOrders,
          to: "orders",
          tone: "default" as const,
        },
        {
          key: "pendingReturns",
          label: "Return requests",
          value: attention.pendingReturns,
          to: "return_requests",
          tone: "warning" as const,
        },
        {
          key: "openConversations",
          label: "Open conversations",
          value: attention.openConversations,
          to: "conversations",
          tone: "default" as const,
        },
      ].filter((i) => (i.value ?? 0) > 0)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold lg:text-3xl">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {data?.health?.ok
              ? `Database online · ${data.health.latencyMs}ms`
              : "Connecting to the database…"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.generatedAt
            ? `Updated ${new Date(data.generatedAt).toLocaleTimeString("en-IN")}`
            : ""}
        </p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          label="Revenue (last 200 orders)"
          value={money(data?.revenue ?? 0)}
          accent="primary"
        />
        <KpiCard
          icon={ShoppingBag}
          label="Orders (recent)"
          value={num(data?.orders30d ?? 0)}
          accent="accent"
        />
        <KpiCard
          icon={UserPlus}
          label="New customers (30d)"
          value={num(data?.newUsers ?? 0)}
          accent="success"
        />
        <KpiCard
          icon={Banknote}
          label="New sellers (30d)"
          value={num(data?.newSellers ?? 0)}
          accent="warning"
        />
      </div>

      {/* Needs attention */}
      {attentionItems.length > 0 && (
        <div className="surface-card p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            <h2 className="text-base font-semibold">Needs your attention</h2>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {attentionItems.map((item) => (
              <Link
                key={item.key}
                to="/dashboard/data/$entity"
                params={{ entity: item.to }}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm transition-colors hover:bg-secondary"
              >
                <span className="text-foreground">{item.label}</span>
                <span className="ml-2 flex items-center gap-1 font-semibold">
                  {num(item.value ?? 0)}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trend chart */}
      <div className="surface-card p-4">
        <h2 className="text-base font-semibold">Last 14 days</h2>
        <p className="text-xs text-muted-foreground">Signups vs. orders placed, per day.</p>
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.trend ?? []} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="usersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent-foreground)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-accent-foreground)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey="day"
                tickFormatter={(v: string) => shortDate(v).replace(/, \d{4}$/, "")}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v: string) => shortDate(v)}
              />
              <Area
                type="monotone"
                dataKey="orders"
                name="Orders"
                stroke="var(--color-primary)"
                fill="url(#ordersFill)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="users"
                name="Signups"
                stroke="var(--color-accent-foreground)"
                fill="url(#usersFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top products / sellers */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface-card p-4">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Most-viewed products</h2>
          </div>
          <ul className="mt-3 divide-y divide-border/60">
            {(data?.topProducts ?? []).length ? (
              (data?.topProducts ?? []).map((p: TopProduct) => (
                <li key={p._id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate pr-3">{p.name ?? "Untitled product"}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {p.view_count != null ? `${num(p.view_count)} views` : money(p.price ?? 0)}
                  </span>
                </li>
              ))
            ) : (
              <li className="py-6 text-center text-sm text-muted-foreground">No view data yet.</li>
            )}
          </ul>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Most-viewed sellers</h2>
          </div>
          <ul className="mt-3 divide-y divide-border/60">
            {(data?.topSellers ?? []).length ? (
              (data?.topSellers ?? []).map((s: TopSeller) => (
                <li key={s._id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate pr-3">{s.store_name ?? "Unnamed seller"}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {s.view_count != null
                      ? `${num(s.view_count)} views`
                      : (s.verification?.status ?? "—")}
                  </span>
                </li>
              ))
            ) : (
              <li className="py-6 text-center text-sm text-muted-foreground">
                No seller view data yet.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Browse by module */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Browse the marketplace</h2>
        {groups.map(({ group, entities }) => (
          <div key={group}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {entities.map((e) => {
                const Icon = iconFor(e.icon);
                return (
                  <Link
                    key={e.key}
                    to="/dashboard/data/$entity"
                    params={{ entity: e.key }}
                    className="surface-card flex items-center gap-3 p-4 transition-shadow hover:shadow-lg"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0">
                      <p className="truncate text-sm text-muted-foreground">{e.plural}</p>
                      <p className="text-xl font-semibold">{num(counts[e.key] ?? 0)}</p>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: "primary" | "accent" | "success" | "warning";
}) {
  const accentClass: Record<typeof accent, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
  };
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentClass[accent]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold lg:text-2xl">{value}</p>
    </div>
  );
}
