"use client";
import { useState } from "react";
import { api, usePoll, ApiError } from "@/lib/client/api";
import { EntryBody, TagBadge, Spinner, ErrorBox, Empty, useToast, type TableData } from "@/components/ui";
import { AiView, type AiContent } from "@/components/ai-view";
import type { PeerReaction } from "@/lib/constants";

function ReactionIcon({ reaction, filled }: { reaction: PeerReaction; filled?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {reaction === "like"
        ? <path d="m12 3 2.78 5.63 6.22.9-4.5 4.38 1.06 6.19L12 17.18l-5.56 2.92 1.06-6.19L3 9.53l6.22-.9L12 3Z" />
        : <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />}
    </svg>
  );
}

interface ClassResp {
  anonymised: boolean;
  shares: {
    shareId: number;
    entryId: number;
    label: string;
    part: number;
    tag: string | null;
    body: string;
    hasImage: boolean;
    table: TableData | null;
    canReact: boolean;
    reactions: { like: number; heart: number; mine: PeerReaction | null };
    critiques: { id: number; promptLabel: string; body: string; mine: boolean; authorLabel: string }[];
  }[];
  ai: { id: number; kind: string; part: number; content: AiContent }[];
  prompts: { key: string; label: string }[];
}

export function ClassBoard() {
  const { data, error, loading, refresh, setData } = usePoll<ClassResp>("/student/class", 5000);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error.message} onRetry={refresh} />;
  if (!data) return null;
  const discussion = data.ai.filter((a) => a.kind === "discussion_points");
  const summaries = data.ai.filter((a) => a.kind !== "discussion_points");
  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
        This is where your teacher shares chosen responses with the whole class. Critique the <b>science</b>, not the people.
        {data.anonymised && " Responses are anonymous."}
      </div>

      {discussion.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-violet-900">💬 Questions for class discussion</h3>
          <div className="space-y-4">
            {discussion.map((d) => (
              <div key={d.id} className="card border-violet-200 bg-violet-50/50">
                <AiView content={d.content} />
              </div>
            ))}
          </div>
        </section>
      )}

      {summaries.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold">Summaries from your teacher</h3>
          <div className="space-y-4">
            {summaries.map((d) => (
              <div key={d.id} className="card">
                <AiView content={d.content} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-lg font-bold">Shared responses</h3>
        {data.shares.length === 0 ? (
          <Empty>Nothing has been shared yet. Your teacher will share responses here.</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.shares.map((s) => (
              <ShareCard key={s.shareId} s={s} prompts={data.prompts} onChanged={refresh} onReaction={(reactions) => {
                setData((current) => current && { ...current, shares: current.shares.map((item) => item.shareId === s.shareId ? { ...item, reactions } : item) });
              }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ShareCard({ s, prompts, onChanged, onReaction }: {
  s: ClassResp["shares"][number]; prompts: ClassResp["prompts"]; onChanged: () => void;
  onReaction: (r: ClassResp["shares"][number]["reactions"]) => void;
}) {
  const toast = useToast();
  const [selectedKey, setSelectedKey] = useState("");
  const key = prompts.some((p) => p.key === selectedKey) ? selectedKey : prompts[0]?.key ?? "";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reacting, setReacting] = useState(false);
  async function react(reaction: PeerReaction) {
    setReacting(true);
    try {
      const result = await api<{ reactions: typeof s.reactions }>("PUT", `/student/shares/${s.shareId}/reaction`, {
        reaction: s.reactions.mine === reaction ? null : reaction,
      });
      onReaction(result.reactions);
    } catch (e) {
      toast((e as ApiError).message, "err");
    } finally {
      setReacting(false);
    }
  }
  async function post() {
    setBusy(true);
    try {
      await api("POST", "/student/critiques", { shareId: s.shareId, promptKey: key, body: text });
      setText("");
      toast("Critique posted");
      onChanged();
    } catch (e) {
      toast((e as ApiError).message, "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-slate-900">{s.label}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Part {s.part}</span>
          <TagBadge tag={s.tag} />
        </div>
      </div>
      <EntryBody body={s.body} hasImage={s.hasImage} entryId={s.entryId} table={s.table} />
      {s.canReact ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Reactions">
          {(["like", "heart"] as const).map((reaction) => (
            <button key={reaction} type="button" className={`btn-ghost min-h-11 ${s.reactions.mine === reaction ? (reaction === "like" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700") : ""}`}
              aria-label={`${reaction === "like" ? "Star" : "Heart"} ${s.reactions[reaction]}`} aria-pressed={s.reactions.mine === reaction} disabled={reacting} onClick={() => react(reaction)}>
              <ReactionIcon reaction={reaction} filled={s.reactions.mine === reaction} /> <span className="tabular-nums">{s.reactions[reaction]}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="flex gap-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1" aria-label={`${s.reactions.like} stars`}><ReactionIcon reaction="like" />{s.reactions.like}</span>
          <span className="inline-flex items-center gap-1" aria-label={`${s.reactions.heart} hearts`}><ReactionIcon reaction="heart" />{s.reactions.heart}</span>
        </p>
      )}
      <div className="border-t border-slate-100 pt-3">
        {s.critiques.length > 0 && (
          <ul className="mb-3 space-y-2">
            {s.critiques.map((c) => (
              <li key={c.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="mb-0.5 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    <b className="text-violet-700">{c.promptLabel}</b> · {c.authorLabel}
                    {c.mine && " (you)"}
                  </span>
                  {c.mine && (
                    <button className="text-rose-600 hover:underline" onClick={async () => { await api("DELETE", `/student/critiques/${c.id}`).catch(() => {}); onChanged(); }}>
                      Delete
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {prompts.length > 0 ? (
          <div className="space-y-2">
            <select className="input" value={key} onChange={(e) => setSelectedKey(e.target.value)} aria-label="Type of critique">
              {prompts.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <textarea className="input min-h-[70px]" placeholder="Write your response…" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
            <button className="btn-accent btn-sm" disabled={busy || !text.trim()} onClick={post}>
              Post critique
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Your teacher has not turned on critique prompts.</p>
        )}
      </div>
    </article>
  );
}
