"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Field } from "@/components/ui";

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

export default function Home() {
  const [mode, setMode] = useState<"student" | "staff">("student");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("GET", "/auth/me")
      .then(setMe)
      .catch(() => setMe({ staff: null, student: null }));
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden border-t-4 border-blue-800 bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-10 sm:px-8 lg:py-16">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
          {/* Left Column: Pedagogical Framing & Active Session Resume */}
          <div className="flex flex-col justify-center lg:col-span-7">
            <div className="mb-6 inline-flex w-fit items-center border-l-2 border-violet-600 pl-3 text-xs font-semibold tracking-widest text-slate-600">
              COLLABORATIVE SCIENCE INQUIRY PLATFORM
            </div>

            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-800 text-white"
                aria-hidden
              >
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3h6" />
                  <path d="M10 9h4" />
                  <path d="M10 3v6l-4.5 8.5A2 2 0 0 0 7.26 20.5h9.48a2 2 0 0 0 1.76-3L14 9V3" />
                </svg>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.65rem] lg:leading-[1.15]">
                Scientific Investigations
              </h1>
            </div>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Design an investigation, carry it out, and reflect on what really happened—building evidence-based scientific reasoning together with your group.
            </p>

            {/* Connected 3-Stage Inquiry Roadmap */}
            <ol className="mt-8 space-y-4">
              {INQUIRY_STAGES.map((stage, i) => (
                <li key={stage.title} className="group relative flex items-start gap-4">
                  {i < INQUIRY_STAGES.length - 1 && (
                    <span
                      className="absolute top-9 left-4 h-7 w-px bg-slate-300"
                      aria-hidden
                    />
                  )}
                  <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-bold text-blue-800">
                    {i + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="text-sm font-bold text-slate-800">{stage.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                      {stage.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Resume Active Sessions */}
            {(me?.student?.sessionStatus === "active" || me?.staff) && (
              <div className="mt-8 space-y-3">
                {me?.student && me.student.sessionStatus === "active" && (
                  <ContinueCard
                    label={`Continue as ${me.student.name}`}
                    sub={me.student.sessionTitle}
                    badge="Active Student Session"
                    href="/student"
                  />
                )}
                {me?.staff && (
                  <ContinueCard
                    label={`Continue as ${me.staff.name}`}
                    sub={
                      me.staff.role === "teacher"
                        ? "Teacher Live Monitor & Session Dashboard"
                        : "Teacher Educator Curriculum & Template Studio"
                    }
                    badge="Signed In"
                    href={me.staff.role === "teacher" ? "/teacher" : "/educator"}
                  />
                )}
              </div>
            )}
          </div>

          {/* Right Column: Elevated Join / Sign-In Card */}
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {/* Role Switcher Tabs */}
              <div
                className="mb-7 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1.5 text-sm font-semibold ring-1 ring-inset ring-slate-200"
                role="tablist"
              >
                {(["student", "staff"] as const).map((m) => {
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMode(m)}
                      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition-all duration-150 ${
                        active
                          ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/70"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {m === "student" ? (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          <span>I’m a student</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="12" rx="2" />
                            <path d="M2 20h20" />
                            <path d="M12 16v4" />
                          </svg>
                          <span>Teacher / Educator</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              {mode === "student" ? <StudentJoin /> : <StaffLogin />}
            </div>
          </div>
        </div>
      </div>
    </main>
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
      className="group flex items-center justify-between rounded-2xl border border-indigo-200/90 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md"
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
          <p className="mt-1 text-xs text-slate-500">
            Enter the session code projected on your classroom screen.
          </p>
        </div>

        <Field label="Session join code" hint="Ask your teacher for the 6-letter join code.">
          <input
            className="input h-14 rounded-xl border-slate-300 bg-slate-50/70 text-center font-mono text-2xl font-bold uppercase tracking-[0.35em] text-indigo-950 transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
            placeholder="ABCDEF"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoFocus
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
        <p className="mt-1 text-xs text-slate-500">
          Access your live classroom monitor, AI analysis drafts, or curriculum templates.
        </p>
      </div>

      <Field label="Email address">
        <input
          className="input rounded-xl"
          type="email"
          placeholder="name@school.edu.hk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
      </Field>

      <Field label="Password">
        <input
          className="input rounded-xl"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </Field>

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
