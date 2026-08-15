import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginResend,
  loginStep1,
  loginStep2,
  recoveryComplete,
  recoveryStart,
} from "@/lib/admin.functions";
import { PASSWORD_HINT } from "@/lib/password";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Admin sign in — 1Antiq Console" },
      {
        name: "description",
        content:
          "Secure staff console for 1Antiq: sign in with your admin username, password and emailed one-time code.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin sign in — 1Antiq Console" },
      { property: "og:description", content: "Secure staff console for the 1Antiq marketplace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

type Mode = "password" | "otp" | "recover" | "recover-verify";

function LoginPage() {
  const navigate = useNavigate();
  const step1 = useServerFn(loginStep1);
  const step2 = useServerFn(loginStep2);
  const resend = useServerFn(loginResend);
  const recover = useServerFn(recoveryStart);
  const recoverDone = useServerFn(recoveryComplete);

  const [mode, setMode] = useState<Mode>("password");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [hint, setHint] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">1Antiq Admin</h1>
            <p className="text-sm text-muted-foreground">
              Restricted console — all actions are logged.
            </p>
          </div>
        </div>

        <div className="surface-card p-6">
          {mode === "password" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const res = await step1({ data: { username, password } });
                  setHint(res.hint);
                  setMode("otp");
                  toast.success("We emailed you a 6-digit code.");
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="username">Username or email</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                3 failed attempts lock the account for 1 hour.
              </p>
              <button
                type="button"
                className="w-full text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => setMode("recover")}
              >
                Forgot password?
              </button>
            </form>
          )}

          {mode === "otp" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await step2({ data: { username, code } });
                  toast.success("Welcome back.");
                  await navigate({ to: "/dashboard" });
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <p className="text-xs text-muted-foreground">
                  Sent to {hint || "your admin email"}. Expires in 10 minutes.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify & sign in
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => setMode("password")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    void run(async () => {
                      await resend({ data: { username } });
                      toast.success("New code sent.");
                    })
                  }
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {mode === "recover" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await recover({ data: { username } });
                  setMode("recover-verify");
                  toast.success(
                    "If that account exists, a code is on its way to the recovery email.",
                  );
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="ru">Username or recovery email</Label>
                <Input id="ru" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send recovery code
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:underline"
                onClick={() => setMode("password")}
              >
                Back to sign in
              </button>
            </form>
          )}

          {mode === "recover-verify" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await recoverDone({ data: { username, code, password: newPassword } });
                  setMode("password");
                  setCode("");
                  setNewPassword("");
                  toast.success("Password reset. Sign in with your new password.");
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="rc">Recovery code</Label>
                <Input
                  id="rc"
                  inputMode="numeric"
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np">New password</Label>
                <Input
                  id="np"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reset password
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
