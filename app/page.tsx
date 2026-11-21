"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Field } from "@/components/ui";
import { BrandLogo } from "@/components/brand-logo";
import { WorkspaceIcon, type IconName } from "@/components/workspace-icon";
import { DesignScene, EnactScene, HeroBackdrop, InquiryCycle, ReflectScene } from "@/components/cover-art";

interface Me {
  staff: { id: number; role: "teacher" | "educator"; name: string } | null;
  student: { name: string; sessionTitle: string; sessionStatus: string } | null;
}

interface Lookup {
  session: { title: string };
  groups: { id: number; name: string; hasPin: boolean; seatsLeft: number | null }[];
}

interface Demo {
  role: string;
  name: string;
  email: string;
  password: string;
}

const INQUIRY_STAGES = [
  {
    title: "Designing the investigation",
    desc: "Formulate hypotheses, identify variables, and plan a fair test.",
  },
  {
    title: "Enacting the investigation",
    desc: "Gather structured observations, measurements, and evidence.",
  },
  {
    title: "Reflecting on the investigation",
    desc: "Evaluate claims against data and debate alternative explanations.",
  },
];

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "groups", title: "Work in groups", desc: "Record plans, data and photos together in one group workspace." },
  { icon: "share", title: "Share and critique", desc: "Post work to the class board for peer critique and reactions." },
  { icon: "monitor", title: "Teacher-guided", desc: "Teachers open each part, follow progress and give feedback." },
];

export default function Home() {
  const [mode, setMode] = useState<"student" | "staff">("student");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("GET", "/auth/me")
      .then(setMe)
      .catch(() => setMe({ staff: null, student: null }));
  }, []);

  const access = (
    <section aria-label="Platform access" className="w-full rounded-2xl border border-blue-200/70 bg-white px-5 pt-5 pb-6 text-slate-900 shadow-2xl shadow-blue-950/30 sm:px-7 sm:pt-6 sm:pb-7">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.13em] text-blue-800 uppercase"><WorkspaceIcon name="lock" /> Platform access</p>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold" role="tablist" aria-label="Choose your role">
        {(["student", "staff"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              id={`access-tab-${m}`}
              aria-selected={active}
              aria-controls={`access-panel-${m}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setMode(m)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                const next = e.key === "Home" ? "student" : e.key === "End" ? "staff" : mode === "student" ? "staff" : "student";
                setMode(next);
                document.getElementById(`access-tab-${next}`)?.focus();
              }}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-2 py-2 transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${active ? "bg-blue-800 text-white" : "text-slate-700 hover:bg-white"}`}
            >
              <WorkspaceIcon name={m === "student" ? "groups" : "monitor"} className="hidden h-4 w-4 min-[420px]:block" />
              <span>{m === "student" ? "I’m a student" : "Teacher / Educator"}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id="access-panel-student" aria-labelledby="access-tab-student" hidden={mode !== "student"}>
        {mode === "student" && <StudentJoin />}
      </div>
      <div role="tabpanel" id="access-panel-staff" aria-labelledby="access-tab-staff" hidden={mode !== "staff"}>
        {mode === "staff" && <StaffLogin />}
      </div>
    </section>
  );

  return (
    <>
      <header className="platform-masthead">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-3 sm:px-8">
          <BrandLogo className="w-48 rounded-md bg-white px-2 py-0.5 sm:w-58" priority />
          <p className="hidden border-l border-blue-600 pl-5 text-xs font-semibold tracking-wide text-blue-100 sm:block">Collaborative science inquiry platform</p>
        </div>
      </header>
      <main>
        <div className="cover-hero relative isolate overflow-hidden text-white">
          <HeroBackdrop className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-blue-300/15" />
          <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-7 px-4 pt-8 pb-12 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:pt-16 lg:pb-20">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/40 bg-blue-900/60 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-blue-100 uppercase">
                <WorkspaceIcon name="enact" /> Biology inquiry workspace
              </p>
              <h1 className="mt-4 text-[2.35rem] leading-[1.04] font-bold tracking-tight text-white sm:text-[3.4rem] lg:text-[3.9rem]">
                Scientific<br />Investigations
              </h1>
              <p className="mt-4 max-w-[38ch] text-base leading-relaxed text-blue-100 sm:text-lg">
                Plan an investigation, collect evidence, and use it to explain what you found.
              </p>
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <ul className="grid gap-3 sm:grid-cols-3 lg:max-w-xl">
                {FEATURES.map((f) => (
                  <li key={f.title} className="flex gap-3 rounded-xl border border-blue-400/25 bg-white/[0.06] p-3.5 backdrop-blur-sm sm:block">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-900"><WorkspaceIcon name={f.icon} className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white sm:mt-2.5">{f.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-blue-100">{f.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {(me?.student?.sessionStatus === "active" || me?.staff) && (
                <div className="mt-6 space-y-2 lg:max-w-xl">
                  {me?.student?.sessionStatus === "active" && <ContinueCard label={`Continue as ${me.student.name}`} sub={me.student.sessionTitle} badge="Active session" href="/student" />}
                  {me?.staff && <ContinueCard label={`Continue as ${me.staff.name}`} sub={me.staff.role === "teacher" ? "Teacher dashboard" : "Teacher Educator dashboard"} badge="Signed in" href={me.staff.role === "teacher" ? "/teacher" : "/educator"} />}
                </div>
              )}
            </div>
            <div className="row-start-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-full lg:max-w-md lg:self-center lg:justify-self-end">{access}</div>
          </div>
        </div>

        <section aria-labelledby="inquiry-stages" className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12 lg:py-16">
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <InquiryCycle className="h-auto w-full" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-blue-700 uppercase">How an investigation unfolds</p>
            <h2 id="inquiry-stages" className="mt-2 text-2xl font-bold tracking-tight text-blue-950 sm:text-3xl">The investigation cycle</h2>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-slate-600 sm:text-base">
              Each session has three parts. Your teacher opens them one at a time, and the evidence you gather links all three.
            </p>
            <ol className="mt-6 space-y-3">
              {INQUIRY_STAGES.map((stage, i) => {
                const Scene = [DesignScene, EnactScene, ReflectScene][i];
                return (
                  <li key={stage.title} className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-white p-3 shadow-xs shadow-blue-950/5 sm:p-4">
                    <span className="grid h-18 w-18 shrink-0 place-items-center rounded-xl bg-blue-50 sm:h-20 sm:w-20"><Scene className="h-15 w-15 sm:h-17 sm:w-17" /></span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase">Part {i + 1}</p>
                      <p className="text-base font-semibold text-blue-950">{stage.title}</p>
                      <p className="mt-0.5 text-sm leading-snug text-slate-600">{stage.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500 sm:px-8">Innovations in Biology Investigations · Scientific Investigations platform</p>
      </footer>
    </>
  );
}

function ContinueCard({
  label,
  sub,
  badge,
  href,
}: {
  label: string;
  sub: string;
  badge: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 transition hover:border-blue-400"
    >
      <div className="min-w-0 pr-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {badge}
        </span>
        <span className="mt-0.5 block truncate text-sm font-bold text-slate-900 group-hover:text-indigo-700">
          {label}
        </span>
        <span className="block truncate text-xs text-slate-500">{sub}</span>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-600 group-hover:text-white">
        →
      </span>
    </a>
  );
}

function StudentJoin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [classNo, setClassNo] = useState("");
  const [groupId, setGroupId] = useState<string>("auto");
  const [pin, setPin] = useState("");
  const [needPin, setNeedPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [resume, setResume] = useState(false);

  async function findSession(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const l = await api<Lookup>("GET", `/join/${encodeURIComponent(code.trim())}`);
      setLookup(l);
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api("POST", "/student/join", {
        code,
        name,
        class: cls,
        classNo,
        groupId: groupId === "auto" ? "auto" : Number(groupId),
        pin,
        resume,
      });
      router.push("/student");
    } catch (x) {
      const a = x as ApiError;
      if (a.code === "pin_required") setNeedPin(true);
      if (a.code === "needs_approval") setWaiting(true);
      else setWaiting(false);
      setErr(a.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => join(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  if (!lookup) {
    return (
      <form onSubmit={findSession} className="space-y-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Join your session</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Enter the six-character code from your teacher.
          </p>
        </div>

        <Field label="Session join code">
          <input
            className="input h-12 bg-slate-50 text-center font-mono text-xl font-semibold uppercase tracking-[0.3em] text-blue-900 placeholder:text-slate-400"
            placeholder="ABCDEF"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            required
            autoComplete="off"
          />
        </Field>

        {err && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700" role="alert">
            {err}
          </div>
        )}

        <button
          className="btn-primary h-11 w-full"
          disabled={busy || code.trim().length < 4}
        >
          {busy ? "Checking session…" : "Continue →"}
        </button>
      </form>
    );
  }

  const chosen = lookup.groups.find((g) => String(g.id) === groupId);

  return (
    <form onSubmit={join} className="space-y-4">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
          onClick={() => {
            setLookup(null);
            setNeedPin(false);
            setWaiting(false);
            setErr("");
          }}
        >
          ← Change code ({code})
        </button>
        <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900">
          {lookup.session.title}
        </h2>
      </div>

      <Field label="Your name">
        <input
          className="input rounded-xl"
          placeholder="e.g. Chan Tai Man"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          autoFocus
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Class">
          <input
            className="input rounded-xl"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
            placeholder="e.g. 5A"
            maxLength={20}
            required
            autoComplete="off"
          />
        </Field>
        <Field label="Class number">
          <input
            className="input rounded-xl"
            value={classNo}
            onChange={(e) => setClassNo(e.target.value)}
            placeholder="e.g. 12"
            maxLength={10}
            inputMode="numeric"
            required
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Your group">
        <select
          className="input rounded-xl"
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setNeedPin(false);
          }}
        >
          <option value="auto">Assign me to a group automatically</option>
          {lookup.groups.map((g) => (
            <option key={g.id} value={g.id} disabled={g.seatsLeft === 0}>
              {g.name}
              {g.hasPin ? " 🔒" : ""}
              {g.seatsLeft !== null ? ` – ${g.seatsLeft} seat${g.seatsLeft === 1 ? "" : "s"} left` : ""}
            </option>
          ))}
        </select>
      </Field>

      {(needPin || chosen?.hasPin) && (
        <Field label="Group PIN" hint="Ask your teacher for your group’s PIN.">
          <input
            className="input rounded-xl font-mono tracking-widest"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={12}
            autoComplete="off"
          />
        </Field>
      )}

      {err && (
        <div
          className={`rounded-xl border p-3.5 text-sm ${
            waiting
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
          role="alert"
        >
          <p className="font-medium">{err}</p>
          {waiting && (
            <span className="mt-1 block text-xs text-amber-700">
              Waiting for teacher approval… this page will continue automatically.
            </span>
          )}
        </div>
      )}

      <button
        className="btn-primary h-11 w-full"
        disabled={busy && !waiting}
      >
        {busy ? "Joining session…" : "Join session"}
      </button>

      <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
        <input className="mt-0.5" type="checkbox" checked={resume} onChange={(e) => { setResume(e.target.checked); setWaiting(false); setErr(""); }} />
        <span>Recover my previous work on a new device. Leave this unchecked to join as a new student, even if someone has the same name.</span>
      </label>
    </form>
  );
}

function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<Demo[]>([]);

  useEffect(() => {
    api<{ accounts: Demo[] }>("GET", "/auth/demo-accounts")
      .then((d) => setDemo(d.accounts))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ user: { role: string } }>("POST", "/auth/login", { email, password });
      router.push(r.user.role === "teacher" ? "/teacher" : "/educator");
    } catch (x) {
      setErr((x as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Staff sign in</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Sign in with your teacher or teacher educator account.
        </p>
      </div>

      <Field label="Email address">
        <input
          className="input min-h-11"
          type="email"
          placeholder="name@school.edu.hk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
      </Field>

      <div>
        <label className="label" htmlFor="staff-password">Password</label>
        <div className="relative">
          <input id="staff-password" className="input min-h-11 pr-18" type={showPassword ? "text" : "password"}
            value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <button type="button" aria-controls="staff-password" aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 min-w-16 rounded-r-lg px-3 text-xs font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"
            onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700" role="alert">
          {err}
        </div>
      )}

      <button
        className="btn-primary h-11 w-full"
        disabled={busy}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {demo.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-700">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-700 hover:text-indigo-700">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Quick-fill demo accounts
            </span>
            <span className="text-[11px] text-slate-400 transition group-open:rotate-180">▼</span>
          </summary>
          <ul className="mt-3 space-y-2 border-t border-slate-200/80 pt-2.5">
            {demo.map((d) => (
              <li
                key={d.email}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2 shadow-2xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-slate-900">{d.name}</span>
                    <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                      {d.role}
                    </span>
                  </div>
                  <span className="block truncate font-mono text-[11px] text-slate-500">
                    {d.email}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-600 hover:text-white"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                >
                  Fill
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}
