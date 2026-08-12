import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  FileText,
  Gauge,
  History,
  Images,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Star,
  Store,
  Tags,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { adminLogout } from "@/lib/admin.functions";
import type { AdminUser } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

const NAV: { group: string; items: { to: string; label: string; icon: typeof Gauge }[] }[] = [
  {
    group: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: Gauge }],
  },
  {
    group: "Marketplace",
    items: [
      { to: "/products", label: "Products", icon: Boxes },
      { to: "/sellers", label: "Sellers", icon: Store },
      { to: "/categories", label: "Categories", icon: Tags },
      { to: "/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    group: "People",
    items: [
      { to: "/users", label: "Users", icon: Users },
      { to: "/conversations", label: "Conversations", icon: MessagesSquare },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/pages", label: "Pages", icon: FileText },
      { to: "/settings", label: "Site settings", icon: Settings },
      { to: "/media", label: "Data browser", icon: LayoutGrid },
    ],
  },
  {
    group: "Security",
    items: [
      { to: "/admins", label: "Admin accounts", icon: ShieldCheck },
      { to: "/audit", label: "Audit log", icon: History },
    ],
  },
];

export function AdminShell({ admin, children }: { admin: AdminUser; children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await adminLogout();
    toast.success("Signed out");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Images className="size-5 text-primary" />
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-sidebar-foreground">1Antiq</p>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Admin</p>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {NAV.map((group) => (
            <div key={group.group}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.group}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-primary"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 overflow-x-auto md:hidden">
            {NAV.flatMap((g) => g.items).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{admin.name}</p>
              <p className="text-[11px] uppercase tracking-wider text-primary">{admin.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}