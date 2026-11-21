"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { Field, Header, Modal, Spinner, useToast } from "@/components/ui";
import { LIMITS } from "@/lib/constants";
import { WorkspaceIcon } from "@/components/workspace-icon";

export interface StaffUser {
  id: number;
  role: "teacher" | "educator";
  name: string;
  email: string;
}

/** Client-side guard for nicer navigation only. Every API call is authorised again on the server. */
export function StaffShell({ role, children, crumbs }: { role: "teacher" | "educator"; children: (u: StaffUser) => ReactNode; crumbs?: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    api<{ staff: StaffUser | null }>("GET", "/auth/me")
      .then((m) => {
        if (!m.staff) router.replace("/");
        else if (m.staff.role !== role) router.replace(m.staff.role === "teacher" ? "/teacher" : "/educator");
        else setUser(m.staff);
      })
      .catch(() => router.replace("/"));
  }, [role, router]);
  if (!user) return <Spinner />;
  return (
    <div className="min-h-screen">
      <Header
        title="Scientific Investigations"
        sub={`${user.name} · ${role === "teacher" ? "Teacher" : "Teacher Educator"}`}
        right={
          <>
            {crumbs}
            <Link href={role === "teacher" ? "/teacher" : "/educator"} className="btn-ghost btn-sm">
              <WorkspaceIcon name="board" />Dashboard
            </Link>
            <Link href={`/${role}/api-usage`} className="btn-ghost btn-sm"><WorkspaceIcon name="analysis" />API usage</Link>
            <button className="btn-ghost btn-sm" onClick={() => setChanging(true)}>Change password</button>
            <button className="btn-ghost btn-sm" onClick={async () => { await api("POST", "/auth/logout").catch(() => {}); router.push("/"); }}>
              Sign out
            </button>
          </>
        }
      />
      {children(user)}
      {changing && <ChangePassword email={user.email} onClose={() => setChanging(false)} />}
    </div>
  );
}

function ChangePassword({ email, onClose }: { email: string; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tooShort = next.length > 0 && next.length < LIMITS.passwordMin;
  const mismatch = confirm.length > 0 && next !== confirm;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/auth/password", { currentPassword: current, newPassword: next });
      toast("Password changed. Other devices have been signed out.");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const type = show ? "text" : "password";
  return (
    <Modal title="Change your password" onClose={() => { if (!busy) onClose(); }}>
      <form className="space-y-3" onSubmit={save}>
        {/* Lets password managers update the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label="Current password">
          <input className="input" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </Field>
        <Field label="New password" hint={`At least ${LIMITS.passwordMin} characters. Use a private password that you don’t use elsewhere.`}>
          <input className="input" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} maxLength={LIMITS.passwordMax} aria-invalid={tooShort || undefined} />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={LIMITS.passwordMax} aria-invalid={mismatch || undefined} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
        {tooShort && <p className="text-sm text-amber-800">The new password needs at least {LIMITS.passwordMin} characters.</p>}
        {mismatch && <p className="text-sm text-amber-800">The new passwords don’t match.</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <p className="text-xs text-slate-500">After the change, you stay signed in here and are signed out on other devices.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !current || next.length < LIMITS.passwordMin || next !== confirm}>{busy ? "Saving…" : "Change password"}</button>
        </div>
      </form>
    </Modal>
  );
}
