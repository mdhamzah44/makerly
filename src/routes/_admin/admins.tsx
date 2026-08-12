import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  changeOwnPassword,
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
} from "@/lib/admin.functions";
import type { AdminRole } from "@/lib/admin-types";

export const Route = createFileRoute("/_admin/admins")({
  head: () => ({
    meta: [
      { title: "Admin accounts · 1Antiq Admin" },
      {
        name: "description",
        content: "Console credentials, stored separately from marketplace shopper accounts.",
      },
      { property: "og:title", content: "Admin accounts · 1Antiq Admin" },
      { property: "og:description", content: "Manage console credentials and roles." },
    ],
  }),
  component: AdminsPage,
});

const ROLES: AdminRole[] = ["owner", "admin", "editor", "support"];

function AdminsPage() {
  const qc = useQueryClient();
  const { data: admins = [] } = useQuery({ queryKey: ["admins"], queryFn: () => listAdminUsers() });

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" as AdminRole });
  const [pw, setPw] = useState({ current: "", next: "" });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["admins"] });
  const onError = (e: Error) => toast.error(e.message);

  const create = useMutation({
    mutationFn: () => createAdminUser({ data: form }),
    onSuccess: () => {
      toast.success("Admin created");
      setForm({ name: "", email: "", password: "", role: "admin" });
      refresh();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: (v: { id: string; role?: AdminRole; active?: boolean; password?: string }) =>
      updateAdminUser({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAdminUser({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      refresh();
    },
    onError,
  });

  const changePw = useMutation({
    mutationFn: () => changeOwnPassword({ data: pw }),
    onSuccess: () => {
      toast.success("Password updated");
      setPw({ current: "", next: "" });
    },
    onError,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin accounts</h1>
        <p className="text-sm text-muted-foreground">
          Console credentials live in their own collection — never mixed with marketplace users.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{a.email}</TableCell>
                <TableCell>
                  <Select
                    value={a.role}
                    onValueChange={(role) => update.mutate({ id: a.id, role: role as AdminRole })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={a.active}
                    onCheckedChange={(active) => update.mutate({ id: a.id, active })}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {a.lastLoginAt ? a.lastLoginAt.slice(0, 16).replace("T", " ") : <Badge variant="outline">never</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = window.prompt(`New password for ${a.email} (min 8 characters)`);
                      if (next) update.mutate({ id: a.id, password: next });
                    }}
                  >
                    Reset password
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-2 text-destructive" onClick={() => remove.mutate(a.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-lg border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="font-semibold">Invite a new admin</h2>
          <div className="space-y-1.5">
            <Label htmlFor="an">Name</Label>
            <Input id="an" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ae">Email</Label>
            <Input
              id="ae"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap">Temporary password</Label>
            <Input
              id="ap"
              type="text"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(role) => setForm({ ...form, role: role as AdminRole })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={create.isPending}>
            Create admin
          </Button>
          <p className="text-xs text-muted-foreground">
            Owner: full control. Admin/editor: can edit data. Support: read-only.
          </p>
        </form>

        <form
          className="space-y-3 rounded-lg border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            changePw.mutate();
          }}
        >
          <h2 className="font-semibold">Change my password</h2>
          <div className="space-y-1.5">
            <Label htmlFor="cp">Current password</Label>
            <Input
              id="cp"
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np">New password</Label>
            <Input
              id="np"
              type="password"
              minLength={8}
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              required
            />
          </div>
          <Button type="submit" disabled={changePw.isPending}>
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}