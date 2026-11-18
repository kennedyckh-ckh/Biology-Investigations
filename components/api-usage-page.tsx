"use client";

import { StaffShell } from "@/components/staff-shell";
import { ErrorBox, Spinner } from "@/components/ui";
import { usePoll } from "@/lib/client/api";

type Usage = {
  mode: "live" | "mock" | "unconfigured";
  daily: { used: number; limit: number; resetAt: number };
  monthly: { used: number; limit: number; resetAt: number };
  tokens: { used: number; limit: number; resetAt: number; reported: number; estimated: number };
  own: { requests: number; tokens: number } | null;
};
const number = (n: number) => n.toLocaleString();
const utc = (n: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(n) + " UTC";

function Meter({ label, value }: { label: string; value: Usage["daily"] }) {
  const blocked = value.used >= value.limit;
  return (
    <div className="card space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
      <p className="text-2xl font-bold tabular-nums">{number(value.used)} <span className="text-base font-medium text-slate-500">of {number(value.limit)}</span></p>
      <progress className="w-full accent-violet-700" aria-label={label} value={value.limit ? Math.min(value.used, value.limit) : 1} max={value.limit || 1} />
      <p className="text-xs text-slate-600">Resets {utc(value.resetAt)}</p>
      {blocked && <p className="text-xs font-semibold text-amber-800">{value.limit ? "Limit reached" : "Live requests disabled by this limit"}</p>}
    </div>
  );
}

function UsageDashboard({ role }: { role: "teacher" | "educator" }) {
  const { data, loading, error, refresh } = usePoll<Usage>(`/${role}/api-usage`, 15_000);
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">API usage</h1>
          <p className="mt-1 text-sm text-slate-600">Live AI requests from this installation, across all teachers. The API key is never displayed.</p>
        </div>
        <button className="btn-ghost" onClick={refresh}>Refresh usage</button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error.message} onRetry={refresh} />}
      {data && (
        <>
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm" role="status">
            {data.mode === "live" ? "Live AI is configured. Requests are blocked before sending if they would exceed an app limit." :
              data.mode === "mock" ? "Mock AI is active. Mock analyses do not use the API key or count towards these limits." :
              "Live AI is not fully configured. Check the server settings before using live analysis."}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Meter label="Daily requests" value={data.daily} />
            <Meter label="Monthly requests" value={data.monthly} />
            <Meter label="Monthly token budget" value={data.tokens} />
          </div>
          <section className="card space-y-2">
            <h2 className="font-bold">How usage is counted</h2>
            <p className="text-sm text-slate-700">{number(data.tokens.reported)} tokens reported by the provider and {number(data.tokens.estimated)} reserved or estimated this month.</p>
            <p className="text-sm text-slate-600">Attempts and in-flight requests count. When an attempt has no reported token total, the app keeps its reservation. The provider may enforce separate rate or billing limits, and usage of the key outside this app is not counted here.</p>
            {data.own && <p className="text-sm text-slate-700">Your activity this month: {number(data.own.requests)} requests and {number(data.own.tokens)} tokens against the shared budget.</p>}
            <p className="text-xs text-slate-600">The hosting administrator can change the app limits in the service’s environment settings. Usage starts when this tracking is installed.</p>
          </section>
        </>
      )}
    </main>
  );
}

export function ApiUsagePage({ role }: { role: "teacher" | "educator" }) {
  return <StaffShell role={role}>{() => <UsageDashboard role={role} />}</StaffShell>;
}
