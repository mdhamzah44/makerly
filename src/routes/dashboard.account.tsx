import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeMyPasswordStart,
  changeMyPasswordVerify,
  getSession,
  mySessions,
  saveProfile,
  signOutOthers,
} from "@/lib/admin.functions";
import { PASSWORD_HINT } from "@/lib/password";

export const Route = createFileRoute("/dashboard/account")({
  component: AccountPage,
});

function AccountPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">My account</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, password and active sessions.
        </p>
      </div>
      <ProfileCard />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}

function ProfileCard() {
  const session = useServerFn(getSession);
  const save = useServerFn(saveProfile);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => session(),
    staleTime: 60_000,
  });
  const admin = data?.admin;

  const [name, setName] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (admin && !touched) {
      setName(admin.name);
      setRecoveryEmail(admin.recoveryEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  return (
    <form
      className="surface-card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void save({ data: { name, recoveryEmail } })
          .then(() => {
            toast.success("Profile updated.");
            return qc.invalidateQueries({ queryKey: ["admin-session"] });
          })
          .catch((err: Error) => toast.error(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="text-base font-semibold">Profile</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="acct-username">Username</Label>
          <Input id="acct-username" value={admin?.username ?? ""} disabled />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acct-role">Role</Label>
          <Input
            id="acct-role"
            value={admin?.role.replace("_", " ") ?? ""}
            disabled
            className="capitalize"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acct-name">Display name</Label>
          <Input
            id="acct-name"
            value={name}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acct-recovery">Recovery email</Label>
          <Input
            id="acct-recovery"
            type="email"
            value={recoveryEmail}
            onChange={(e) => {
              setTouched(true);
              setRecoveryEmail(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">Used for account recovery codes.</p>
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

function PasswordCard() {
  const start = useServerFn(changeMyPasswordStart);
  const verify = useServerFn(changeMyPasswordVerify);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("form");
    setCurrent("");
    setNext("");
    setConfirm("");
    setCode("");
    setHint("");
  };

  return (
    <div className="surface-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Password</h2>
      </div>

      {step === "form" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== confirm) {
              toast.error("Passwords do not match.");
              return;
            }
            setBusy(true);
            void start({ data: { current, next } })
              .then((res) => {
                setHint(res.hint);
                setStep("otp");
                toast.success(`Code sent to ${res.hint}.`);
              })
              .catch((err: Error) => toast.error(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <p className="text-sm text-muted-foreground">
            Even though you're signed in, changing your password requires a one-time code sent to
            your email — this protects the account if your session is ever hijacked.
          </p>
          <div className="space-y-1">
            <Label htmlFor="pw-cur">Current password</Label>
            <Input
              id="pw-cur"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-new">New password</Label>
            <Input
              id="pw-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-cnf">Confirm new password</Label>
            <Input
              id="pw-cnf"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending code…" : "Send verification code"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void verify({ data: { code, next } })
              .then(() => {
                toast.success("Password updated. Other sessions were signed out.");
                reset();
              })
              .catch((err: Error) => toast.error(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {hint}.</p>
          <div className="space-y-1">
            <Label htmlFor="pw-otp">Verification code</Label>
            <Input
              id="pw-otp"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Confirming…" : "Confirm password change"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function SessionsCard() {
  const load = useServerFn(mySessions);
  const signOutAll = useServerFn(signOutOthers);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: () => load(),
    staleTime: 15_000,
  });
  const [busy, setBusy] = useState(false);

  return (
    <div className="surface-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Laptop className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Active sessions</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signOutAll()
              .then((res) => {
                toast.success(`Signed out ${res.removed} other session(s).`);
                return qc.invalidateQueries({ queryKey: ["admin-sessions"] });
              })
              .catch((err: Error) => toast.error(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Sign out other sessions
        </Button>
      </div>
      <div className="divide-y divide-border/60">
        {(data ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <p className="font-medium">
                {s.ip}{" "}
                {s.current && (
                  <span className="text-xs font-normal text-success">· this device</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{s.ua}</p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              {s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}
            </p>
          </div>
        ))}
        {!data?.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">No active sessions.</p>
        )}
      </div>
    </div>
  );
}
