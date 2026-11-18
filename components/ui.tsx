"use client";
import { useEffect, useState, useId, useRef, createContext, useContext, useCallback, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="btn-ghost btn-sm mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-10" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EnlargeView({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  return <>
    <button ref={trigger} type="button" className="btn-ghost btn-sm min-h-9 self-start text-blue-800" aria-haspopup="dialog" onClick={() => {
      dialog.current?.showModal();
      setOpen(true);
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /></svg>
      {label}
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onClose={() => { setOpen(false); trigger.current?.focus(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-5xl overflow-auto overscroll-contain rounded-xl border border-blue-100 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-blue-950/60 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold text-blue-950">{title}</h2>
        <button type="button" autoFocus className="btn-ghost btn-sm" onClick={() => dialog.current?.close()}>Close</button>
      </div>
      {open && children}
    </dialog>
  </>;
}

type ToastKind = "ok" | "err";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: ToastKind }[]>([]);
  const push = useCallback((msg: string, kind: ToastKind = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === "err" ? 7000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${t.kind === "err" ? "bg-rose-600 text-white" : "bg-slate-900 text-white"}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const TAG_COLORS: Record<string, string> = {
  Hypothesis: "bg-violet-100 text-violet-800",
  Aim: "bg-indigo-100 text-indigo-800",
  "Independent variable": "bg-sky-100 text-sky-800",
  "Dependent variable": "bg-cyan-100 text-cyan-800",
  "Control variable": "bg-teal-100 text-teal-800",
  Assumption: "bg-amber-100 text-amber-800",
  Control: "bg-emerald-100 text-emerald-800",
  Observation: "bg-blue-100 text-blue-800",
  Reasoning: "bg-fuchsia-100 text-fuchsia-800",
  Evidence: "bg-green-100 text-green-800",
  Limitation: "bg-orange-100 text-orange-800",
  Improvement: "bg-pink-100 text-pink-800",
};
export function TagBadge({ tag }: { tag: string | null }) {
  if (!tag) return <span className="badge bg-slate-100 text-slate-500">No tag</span>;
  return <span className={`badge ${TAG_COLORS[tag] || "bg-slate-100 text-slate-700"}`}>{tag}</span>;
}

export interface TableData {
  columns: string[];
  rows: string[][];
}
export function MiniTable({ table, enlarged = false }: { table: TableData; enlarged?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`mt-2 min-w-[240px] border-collapse ${enlarged ? "w-full text-base" : "text-sm"}`}>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className="border border-slate-300 bg-slate-100 px-3 py-1.5 text-left font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border border-slate-300 px-3 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Text, image and mini data table of an entry. Student text is rendered as plain text (React escapes it). */
export function EntryBody({ body, hasImage, entryId, table, enlarged }: { body: string; hasImage: boolean; entryId: number; table: TableData | null; enlarged?: boolean }) {
  return (
    <div>
      {body && <p className={`whitespace-pre-wrap break-words leading-relaxed text-slate-800 ${enlarged ? "text-lg" : "text-[15px]"}`}>{body}</p>}
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/images/${entryId}`} alt="Attached evidence" className={`mt-3 h-auto max-w-full rounded-lg border border-slate-200 object-contain ${enlarged ? "max-h-[68dvh]" : "max-h-72"}`} loading="lazy" />
      )}
      {table && <MiniTable table={table} enlarged={enlarged} />}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Header({ title, right, sub }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="platform-masthead">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 max-w-full items-center gap-2.5 sm:gap-4">
          <BrandLogo className="w-32 shrink-0 rounded-md bg-white px-1.5 py-0.5 sm:w-40" />
          <div className="min-w-0 border-l border-blue-600 py-0.5 pl-2.5 break-words sm:pl-4">
            <div className="text-sm font-bold leading-tight text-white">{title}</div>
            {sub && <div className="text-xs text-blue-100">{sub}</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
