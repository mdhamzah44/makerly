import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, LogOut, Menu, ScrollText, ShieldCheck, UserCog, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { entitiesByGroup } from "@/lib/entities";
import { iconFor } from "@/lib/icon-map";
import { getSession, logout } from "@/lib/admin.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — 1Antiq Admin" },
      {
        name: "description",
        content:
          "Operational dashboard for the 1Antiq marketplace: catalog, sellers, orders, finance and support.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Dashboard — 1Antiq Admin" },
      { property: "og:description", content: "Operational dashboard for the 1Antiq marketplace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardShell,
});

const SYSTEM_LINKS = [
  { to: "/dashboard/security", label: "Security & audit", icon: ScrollText },
  { to: "/dashboard/admins", label: "Admin users", icon: UserCog },
];

function DashboardShell() {
  const navigate = useNavigate();
  const session = useServerFn(getSession);
  const signOut = useServerFn(logout);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const groups = useMemo(() => entitiesByGroup(), []);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => session(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoading && data && !data.admin) void navigate({ to: "/" });
  }, [data, isLoading, navigate]);

  useEffect(() => setOpen(false), [pathname]);

  const admin = data?.admin ?? null;
  const initials = admin?.name
    ? admin.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "…";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <Link
          to="/dashboard"
          className="flex items-center gap-2 font-display text-lg font-semibold"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          1Antiq Admin
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {admin ? `${admin.name} · ${admin.role.replace("_", " ")}` : "…"}
          </span>
          <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground sm:flex">
            {initials}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void signOut().then(() => {
                toast.success("Signed out.");
                return navigate({ to: "/" });
              });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1680px]">
        <aside
          className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[57px] z-20 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-border bg-card p-3 lg:sticky lg:top-[57px] lg:block lg:h-[calc(100vh-57px)] lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r`}
        >
          <nav className="grid gap-4 pb-6">
            <div className="grid gap-1">
              <NavLink
                to="/dashboard"
                label="Overview"
                icon={LayoutDashboard}
                active={pathname === "/dashboard"}
              />
            </div>

            {groups.map(({ group, entities }) => (
              <div key={group}>
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group}
                </p>
                <div className="grid gap-1">
                  {entities.map((e) => {
                    const to = `/dashboard/data/${e.key}`;
                    return (
                      <NavLink
                        key={e.key}
                        to={to}
                        label={e.plural}
                        icon={iconFor(e.icon)}
                        active={pathname.startsWith(to)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            <div>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Administration
              </p>
              <div className="grid gap-1">
                {SYSTEM_LINKS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    active={pathname.startsWith(item.to)}
                  />
                ))}
                <NavLink
                  to="/dashboard/account"
                  label="My account"
                  icon={UserCog}
                  active={pathname.startsWith("/dashboard/account")}
                />
              </div>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
