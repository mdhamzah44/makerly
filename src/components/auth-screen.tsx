import { useNavigate } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminBootstrap, adminLogin } from "@/lib/admin.functions";

export function AuthScreen({ needsBootstrap }: { needsBootstrap: boolean }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (needsBootstrap) {
        await adminBootstrap({ data: { name, email, password } });
        toast.success("Owner account created");
      } else {
        await adminLogin({ data: { email, password } });
        toast.success("Welcome back");
      }
      await navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
            {needsBootstrap ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold">1Antiq Admin</h1>
            <p className="text-xs text-muted-foreground">
              {needsBootstrap ? "Create the first owner account" : "Staff sign in"}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {needsBootstrap && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={needsBootstrap ? 8 : 1}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : needsBootstrap ? "Create owner account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Admin credentials are stored separately from marketplace shoppers.
        </p>
      </div>
    </div>
  );
}