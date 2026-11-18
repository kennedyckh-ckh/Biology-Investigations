"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Field, useToast } from "@/components/ui";
import { LIMITS, PART_TITLES, TAGS, type InstructionFile } from "@/lib/constants";
import type { SessionDetail, PartCfg } from "./types";

export function Setup({ session, onSaved }: { session: SessionDetail; onSaved: () => void }) {
  const archived = session.status === "archived";
  return (
    <div className="space-y-6">
      {session.source && (
        <div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-950">
          Imported from the Teacher Educator template <b>“{session.source.title}”</b> (version {session.source.importedVersion}). This session is your own copy; edits here never change the original.
          {session.source.currentVersion !== null && session.source.currentVersion !== session.source.importedVersion && <span className="ml-1 text-amber-700">The master has since been updated (v{session.source.currentVersion}); import it again for a new session if you want the changes.</span>}
          {session.pedagogyNotes && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold">Pedagogical notes from your Teacher Educator</summary>
              <p className="mt-2 whitespace-pre-wrap">{session.pedagogyNotes}</p>
            </details>
          )}
        </div>
      )}
      <SessionSettings session={session} onSaved={onSaved} disabled={archived} />
      {session.parts.map((p) => (
        <PartEditor key={p.part} sessionId={session.id} cfg={p} onSaved={onSaved} disabled={archived} />
      ))}
    </div>
  );
}

function SessionSettings({ session, onSaved, disabled }: { session: SessionDetail; onSaved: () => void; disabled: boolean }) {
  const toast = useToast();
  const [title, setTitle] = useState(session.title);
  const [criteria, setCriteria] = useState(session.aiCriteria);
  const [prompts, setPrompts] = useState(session.critiquePrompts);
  const [tags, setTags] = useState(session.entryTags.join("\n"));
  const [tagsEdited, setTagsEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  function updatePrompt(key: string, update: { label?: string; enabled?: boolean }) {
    setPrompts((ps) => ps.map((p) => p.key === key ? { ...p, ...update } : p));
  }
  async function save() {
    setBusy(true);
    try {
      const saved = await api<SessionDetail>("PATCH", `/teacher/sessions/${session.id}`, {
        title, aiCriteria: criteria, critiquePrompts: prompts,
        ...(tagsEdited ? { entryTags: tags.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean) } : {}),
      });
      setPrompts(saved.critiquePrompts);
      setTags(saved.entryTags.join("\n"));
      setTagsEdited(false);
      toast("Session settings saved");
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-y-4">
      <h3 className="text-lg font-bold">Session settings</h3>
      <Field label="Session title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy || disabled} maxLength={150} />
      </Field>
      <fieldset disabled={busy || disabled} aria-describedby="critique-prompts-help">
        <legend className="label">Peer critique prompts students can use on shared responses</legend>
        <p id="critique-prompts-help" className="mb-2 text-xs text-slate-500">
          Edit the wording for this session and tick the prompts students can use. Clear a built-in label to restore its original wording when you save.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {prompts.map((p, i) => (
            <div key={p.key} className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 p-1.5">
              <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                <span className="sr-only">Use prompt {i + 1}</span>
                <input type="checkbox" checked={p.enabled} onChange={(e) => updatePrompt(p.key, { enabled: e.target.checked })} />
              </label>
              <input
                className="input min-h-11 min-w-0"
                aria-label={`Prompt ${i + 1} label`}
                value={p.label}
                onChange={(e) => updatePrompt(p.key, { label: e.target.value })}
                maxLength={LIMITS.critiqueLabelMax}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Customise entry tags</summary>
        <div className="mt-3 space-y-2">
          <Field label="Entry tags" hint="Enter one tag per line. Students see this list in every part of this session. Changing the list does not relabel existing entries.">
            <textarea className="input min-h-[140px]" rows={6} value={tags} onChange={(e) => { setTags(e.target.value); setTagsEdited(true); }} disabled={busy || disabled} />
          </Field>
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setTags(TAGS.join("\n")); setTagsEdited(true); }} disabled={busy || disabled}>
            Restore default tags
          </button>
        </div>
      </details>
      <Field label="Criteria for AI analysis" hint="What should the AI look for? It always prioritises divergent findings, uncontrolled variables, evidence-to-claim gaps and misconceptions.">
        <textarea className="input min-h-[80px]" value={criteria} onChange={(e) => setCriteria(e.target.value)} disabled={busy || disabled} maxLength={2000} />
      </Field>
      <button className="btn-primary" disabled={busy || disabled} onClick={save}>
        Save settings
      </button>
    </section>
  );
}

function InstructionAttachment({ sessionId, part, initial, onSaved, disabled }: {
  sessionId: number; part: number; initial: InstructionFile | null; onSaved: () => void; disabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [inputVersion, setInputVersion] = useState(0);
  const toast = useToast();
  const endpoint = `/teacher/sessions/${sessionId}/parts/${part}/attachment`;
  const busy = progress !== null || removing;

  function upload() {
    if (!file || busy) return;
    setError("");
    setProgress(0);
    const request = new XMLHttpRequest();
    request.open("PUT", `/api${endpoint}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-Instruction-Filename", encodeURIComponent(file.name));
    request.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.min(100, Math.round(e.loaded / e.total * 100))); };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        setFile(null);
        setInputVersion((n) => n + 1);
        toast("Instruction file uploaded");
        onSaved();
      } else {
        let message = `Upload failed (${request.status}).`;
        try { message = JSON.parse(request.responseText).message || message; } catch { /* gateway response */ }
        setError(message);
      }
      setProgress(null);
    };
    request.onerror = () => { setError("The upload did not finish. Check your connection and try again."); setProgress(null); };
    request.send(file);
  }

  async function remove() {
    setRemoving(true);
    setError("");
    try {
      await api("DELETE", endpoint);
      toast("Instruction file removed");
      onSaved();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="label">Instruction file</legend>
      <p className="text-xs text-slate-500">One file per part, up to 500 MB. Students can download it once this part is open.</p>
      {initial && <p className="text-sm"><a className="break-all text-blue-700 underline" href={initial.url} download>{initial.name}</a> <span className="text-slate-500">({(initial.size / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB)</span></p>}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input key={inputVersion} type="file" aria-label={`Choose instruction file for Part ${part}`} className="input min-w-0 max-w-sm" disabled={busy} onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            const invalid = selected && (selected.size > LIMITS.instructionFileBytes || selected.size === 0);
            setFile(invalid ? null : selected);
            setError(invalid ? "Choose a non-empty file no larger than 500 MB." : "");
            if (invalid) e.target.value = "";
          }} />
          <button type="button" className="btn-ghost btn-sm" disabled={!file || busy} onClick={upload}>{initial ? "Replace file" : "Upload file"}</button>
          {initial && <button type="button" className="btn-ghost btn-sm text-rose-700" disabled={busy} onClick={remove}>Remove file</button>}
        </div>
      )}
      {progress !== null && <div role="status" className="text-sm">Uploading: {progress}%<progress aria-label="Upload progress" className="ml-2 align-middle" value={progress} max={100} /></div>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </fieldset>
  );
}

function PartEditor({ sessionId, cfg, onSaved, disabled }: { sessionId: number; cfg: PartCfg; onSaved: () => void; disabled: boolean }) {
  const toast = useToast();
  const [instructions, setInstructions] = useState(cfg.instructions);
  const [link, setLink] = useState(cfg.webLink);
  const [qs, setQs] = useState<string[]>(cfg.questions.map((q) => q.text));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) {
      setInstructions(cfg.instructions);
      setLink(cfg.webLink);
      setQs(cfg.questions.map((q) => q.text));
    }
  }, [cfg, dirty]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  async function save() {
    setBusy(true);
    try {
      await api("PUT", `/teacher/sessions/${sessionId}/parts/${cfg.part}`, { instructions, webLink: link, questions: qs.filter((q) => q.trim()) });
      setDirty(false);
      toast(`Part ${cfg.part} saved`);
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    } finally {
      setBusy(false);
    }
  }
  const move = (i: number, d: number) => {
    const n = qs.slice();
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    touch(setQs)(n);
  };
  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{PART_TITLES[cfg.part]}</h3>
        {dirty && <span className="badge bg-amber-100 text-amber-800">Unsaved changes</span>}
      </div>
      <Field label="Instructions for students">
        <textarea className="input min-h-[110px]" value={instructions} onChange={(e) => touch(setInstructions)(e.target.value)} disabled={disabled} maxLength={5000} />
      </Field>
      <Field label="External web link" hint="Opens in a new tab for students. Must start with http:// or https://">
        <input className="input" value={link} onChange={(e) => touch(setLink)(e.target.value)} disabled={disabled} placeholder="https://…" maxLength={500} />
      </Field>
      <InstructionAttachment sessionId={sessionId} part={cfg.part} initial={cfg.attachment} onSaved={onSaved} disabled={disabled} />
      <div>
        <span className="label">Guiding questions</span>
        <ol className="space-y-2">
          {qs.map((q, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs font-bold text-slate-400">{i + 1}</span>
              <input className="input" value={q} onChange={(e) => touch(setQs)(qs.map((x, j) => (j === i ? e.target.value : x)))} disabled={disabled} maxLength={500} aria-label={`Guiding question ${i + 1}`} />
              <button className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label="Move up">
                ↑
              </button>
              <button className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={disabled || i === qs.length - 1} aria-label="Move down">
                ↓
              </button>
              <button className="btn-ghost btn-sm text-rose-700" onClick={() => touch(setQs)(qs.filter((_, j) => j !== i))} disabled={disabled} aria-label="Remove question">
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button className="btn-ghost btn-sm mt-2" disabled={disabled || qs.length >= 20} onClick={() => touch(setQs)([...qs, ""])}>
          + Add question
        </button>
      </div>
      <button className="btn-primary" disabled={busy || disabled || !dirty} onClick={save}>
        {busy ? "Saving…" : `Save Part ${cfg.part}`}
      </button>
    </section>
  );
}
