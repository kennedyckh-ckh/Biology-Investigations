"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client/api";
import { EnlargeView, Field, useToast } from "@/components/ui";
import { LIMITS, PART_TITLES, TAGS, type InstructionFile } from "@/lib/constants";
import { partIcon, WorkspaceHeading, WorkspaceIcon } from "@/components/workspace-icon";
import { RichTextArea } from "@/components/rich-text";
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
        <PartEditor key={p.part} sessionId={session.id} cfg={p} onSaved={onSaved} disabled={archived}
          stageSettings={<StageSettings session={session} cfg={p} onSaved={onSaved} disabled={archived} />} />
      ))}
    </div>
  );
}

function SessionSettings({ session, onSaved, disabled }: { session: SessionDetail; onSaved: () => void; disabled: boolean }) {
  const toast = useToast();
  const [title, setTitle] = useState(session.title);
  const [criteria, setCriteria] = useState(session.aiCriteria);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("PATCH", `/teacher/sessions/${session.id}`, { title, aiCriteria: criteria });
      toast("Session settings saved");
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    } finally {
      setBusy(false);
    }
  }
  return <section className="card space-y-4">
    <WorkspaceHeading icon="settings">Session settings</WorkspaceHeading>
    <Field label="Session title">
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy || disabled} maxLength={150} />
    </Field>
    <Field label="Criteria for AI analysis" hint="What should the AI look for? It always prioritises divergent findings, uncontrolled variables, evidence-to-claim gaps and misconceptions.">
      <textarea className="input min-h-20" value={criteria} onChange={(e) => setCriteria(e.target.value)} disabled={busy || disabled} maxLength={2000} />
    </Field>
    <button className="btn-primary" disabled={busy || disabled} onClick={save}>Save session settings</button>
  </section>;
}

function StageSettings({ session, cfg, onSaved, disabled }: { session: SessionDetail; cfg: PartCfg; onSaved: () => void; disabled: boolean }) {
  const toast = useToast();
  const [prompts, setPrompts] = useState(cfg.critiquePrompts);
  const [tags, setTags] = useState(cfg.entryTags.join("\n"));
  const [tagsEdited, setTagsEdited] = useState(false);
  const [hints, setHints] = useState(cfg.tagHints);
  const [hintsEdited, setHintsEdited] = useState(false);
  const [hintTag, setHintTag] = useState("");
  const tagList = [...new Set(tags.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean))];
  const activeHintTag = tagList.includes(hintTag) ? hintTag : tagList[0] ?? "";
  const [busy, setBusy] = useState(false);
  function updatePrompt(key: string, update: { label?: string; enabled?: boolean }) {
    setPrompts((ps) => ps.map((p) => p.key === key ? { ...p, ...update } : p));
  }
  async function save() {
    setBusy(true);
    try {
      const saved = await api<SessionDetail>("PATCH", `/teacher/sessions/${session.id}/parts/${cfg.part}/settings`, {
        critiquePrompts: prompts,
        ...(tagsEdited ? { entryTags: tags.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean) } : {}),
        ...(tagsEdited || hintsEdited ? { tagHints: hints.filter(({ tag }) => tagList.includes(tag)) } : {}),
      });
      const savedPart = saved.parts.find((p) => p.part === cfg.part)!;
      setPrompts(savedPart.critiquePrompts);
      setTags(savedPart.entryTags.join("\n"));
      setTagsEdited(false);
      setHints(savedPart.tagHints);
      setHintsEdited(false);
      toast(`Part ${cfg.part} stage settings saved`);
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/65 p-3 sm:p-4">
      <summary className="cursor-pointer text-sm font-semibold text-blue-950">
        <span className="ml-1 inline-flex items-center gap-2 align-middle"><WorkspaceIcon name="settings" />Stage settings: critique prompts, entry tags and hints</span>
      </summary>
      <div className="mt-4 space-y-4">
      <fieldset className="min-w-0" disabled={busy || disabled} aria-describedby={`critique-prompts-help-${cfg.part}`}>
        <legend className="label">Peer critique prompts for Part {cfg.part}</legend>
        <p id={`critique-prompts-help-${cfg.part}`} className="mb-2 text-xs text-slate-600">
          These prompts appear only on shared work from this stage. Untick a prompt to hide it without removing previous critiques. Clear a built-in label to restore its original wording.
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
        <button type="button" className="btn-ghost btn-sm mt-2" disabled={prompts.length >= LIMITS.critiquePromptCount} onClick={() => {
          setPrompts((current) => [...current, { key: crypto.randomUUID(), label: "", enabled: true }]);
        }}>Add critique prompt</button>
        {prompts.some((p) => !cfg.critiquePrompts.some((saved) => saved.key === p.key)) && (
          <button type="button" className="btn-ghost btn-sm mt-2 ml-2" onClick={() => setPrompts((current) => current.filter((p) => cfg.critiquePrompts.some((saved) => saved.key === p.key)))}>
            Discard new prompts
          </button>
        )}
      </fieldset>
      <details className="rounded-lg border border-blue-100 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">Customise entry tags</summary>
        <div className="mt-3 space-y-2">
          <Field label={`Entry tags for Part ${cfg.part}`} hint="Enter one tag per line. This list applies only to this stage. Existing entries keep their original tags.">
            <textarea className="input min-h-[140px]" rows={6} value={tags} onChange={(e) => { setTags(e.target.value); setTagsEdited(true); }} disabled={busy || disabled} />
          </Field>
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setTags(TAGS.join("\n")); setTagsEdited(true); }} disabled={busy || disabled}>
            Restore default tags
          </button>
        </div>
      </details>
      <details className="rounded-lg border border-blue-100 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-blue-900">{cfg.part === 1 ? "Design entry-tag hints" : `Part ${cfg.part} entry-tag hints`}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">Write a short definition, example or question, then save your settings. {cfg.tagHintsVisible ? `Hints are released. Students can open them while Part ${cfg.part} is open. To hide them, go to Live monitor.` : `To release the saved hints, click “Show Part ${cfg.part} hints” in Live monitor.`}</p>
          {activeHintTag ? (
            <>
              <Field label="Choose a tag">
                <select className="input max-w-sm" disabled={busy || disabled} value={activeHintTag} onChange={(e) => setHintTag(e.target.value)}>
                  {tagList.map((tag) => <option key={tag}>{tag}</option>)}
                </select>
              </Field>
              <Field label="Hint for the selected tag" hint="Leave this blank if you don’t want a hint for this tag.">
                <textarea className="input min-h-24" disabled={busy || disabled} maxLength={LIMITS.designHintMax}
                  value={hints.find((h) => h.tag === activeHintTag)?.hint ?? ""}
                  placeholder={cfg.part === 1 ? "Example: The independent variable is what you deliberately change." : cfg.part === 2 ? "Example: Record what you see, not what you expected to see." : "Example: A limitation is a feature of the method that reduces confidence in the conclusion."}
                  onChange={(e) => {
                    const text = e.target.value;
                    setHints((current) => [...current.filter(({ tag }) => tag !== activeHintTag), { tag: activeHintTag, hint: text }]);
                    setHintsEdited(true);
                  }} />
              </Field>
              <p className="text-xs text-slate-500">{hints.filter(({ tag, hint }) => tagList.includes(tag) && hint.trim()).length} tags with hints.</p>
            </>
          ) : <p className="text-sm text-slate-600">Add an entry tag before writing a hint.</p>}
        </div>
      </details>
      <button className="btn-primary btn-sm" disabled={busy || disabled} onClick={save}>{busy ? "Saving…" : `Save Part ${cfg.part} stage settings`}</button>
      </div>
    </details>
  );
}

type AttachmentVariant = "file" | "taskDiagram" | "taskPdf" | "partDiagram";
const VARIANTS: Record<AttachmentVariant, { legend: string; help: string; accept?: string; noun: string; icon?: "diagram" | "task"; uploaded: string; removed: string }> = {
  file: { legend: "Shared part file", help: "Any file type, up to 500 MB. Students download it from the part's shared resources.", noun: "file", uploaded: "Instruction file uploaded", removed: "Instruction file removed" },
  partDiagram: { legend: "Shared part diagram (optional)", help: "PNG, JPEG, WebP or GIF, up to 500 MB. Shown with the part's shared resources, and students can enlarge it.", accept: "image/png,image/jpeg,image/webp,image/gif", noun: "diagram", icon: "diagram", uploaded: "Part diagram uploaded", removed: "Part diagram removed" },
  taskDiagram: { legend: "Task diagram (optional)", help: "PNG, JPEG, WebP or GIF, up to 500 MB. Students can enlarge the diagram without leaving the task.", accept: "image/png,image/jpeg,image/webp,image/gif", noun: "diagram", icon: "diagram", uploaded: "Task diagram uploaded", removed: "Task diagram removed" },
  taskPdf: { legend: "Task PDF (optional)", help: "A PDF worksheet, protocol or reading, up to 500 MB. Students can open it in the browser or download it.", accept: "application/pdf,.pdf", noun: "PDF", icon: "task", uploaded: "Task PDF attached", removed: "Task PDF removed" },
};

function InstructionAttachment({ sessionId, part, initial, onSaved, disabled, taskId, taskNumber, beforeUpload, uploadBlocked, variant = taskId ? "taskDiagram" : "file" }: {
  sessionId: number; part: number; initial: InstructionFile | null; onSaved: () => void; disabled: boolean; taskId?: string; taskNumber?: number;
  beforeUpload?: () => Promise<boolean>; uploadBlocked?: boolean; variant?: AttachmentVariant;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [inputVersion, setInputVersion] = useState(0);
  const toast = useToast();
  const v = VARIANTS[variant];
  const endpoint = `/teacher/sessions/${sessionId}/parts/${part}${
    variant === "file" ? "/attachment" : variant === "partDiagram" ? "/diagram" : variant === "taskDiagram" ? `/tasks/${taskId}/attachment` : `/tasks/${taskId}/pdf`}`;
  const resource = v.noun;
  const busy = progress !== null || removing || preparing;
  const isImage = variant === "taskDiagram" || variant === "partDiagram";
  const where = taskNumber ? `Task ${taskNumber}` : `Part ${part}`;

  async function upload() {
    if (!file || busy || uploadBlocked) return;
    setError("");
    if (beforeUpload) {
      setPreparing(true);
      const ready = await beforeUpload();
      setPreparing(false);
      if (!ready) return;
    }
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
        toast(v.uploaded);
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
      toast(v.removed);
      onSaved();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="label"><span className="inline-flex items-center gap-2">{v.icon && <WorkspaceIcon name={v.icon} />}{v.legend}</span></legend>
      <p className="text-xs text-slate-600">{v.help}</p>
      {initial && (isImage && initial.previewUrl
        ? <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={initial.previewUrl} alt="" className="h-14 w-auto max-w-[8rem] rounded border border-slate-200 object-contain" />
          <span className="break-all">{initial.name}</span>
          <EnlargeView title={`${where} diagram`} label="Enlarge diagram">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={initial.previewUrl} alt={`${where} diagram: ${initial.name}`} className="mx-auto h-auto max-h-[68dvh] max-w-full object-contain" />
          </EnlargeView>
        </div>
        : <p className="text-sm"><a className="break-all text-blue-700 underline" href={initial.previewUrl ?? initial.url} download={variant === "file" && !initial.previewUrl} target={variant === "taskPdf" || initial.previewUrl ? "_blank" : undefined} rel="noopener noreferrer">{initial.name}</a>
          <span className="ml-2 text-xs text-slate-500">{formatBytes(initial.size)}</span></p>)}
      {(!disabled || busy) && (
        <div className="flex flex-wrap items-center gap-2">
          <input key={inputVersion} type="file" aria-label={`Choose ${resource} for ${where}`} accept={v.accept} className="input min-w-0 max-w-sm" disabled={busy || disabled} onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            const tooBig = selected && (selected.size > LIMITS.instructionFileBytes || selected.size === 0);
            const notPdf = variant === "taskPdf" && selected && !/\.pdf$/i.test(selected.name) && selected.type !== "application/pdf";
            setFile(tooBig || notPdf ? null : selected);
            setError(tooBig ? "Choose a non-empty file no larger than 500 MB." : notPdf ? "Choose a PDF file." : "");
            if (tooBig || notPdf) e.target.value = "";
          }} />
          <button type="button" className="btn-ghost btn-sm" disabled={!file || busy || disabled || uploadBlocked} onClick={upload}>
            <WorkspaceIcon name="upload" />{preparing ? "Saving part…" : beforeUpload ? `Save part and upload ${resource}` : initial ? `Replace ${resource}` : `Upload ${resource}`}
          </button>
          {initial && <button type="button" className="btn-ghost btn-sm text-rose-700" disabled={busy || disabled} onClick={remove}>Remove {resource}</button>}
        </div>
      )}
      {uploadBlocked && file && <p className="text-xs text-slate-600">Complete the task instructions before saving the part and uploading.</p>}
      {progress !== null && <div role="status" className="text-sm">Uploading: {progress}%<progress aria-label="Upload progress" className="ml-2 align-middle" value={progress} max={100} /></div>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </fieldset>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function PartEditor({ sessionId, cfg, onSaved, disabled, stageSettings }: { sessionId: number; cfg: PartCfg; onSaved: () => void; disabled: boolean; stageSettings: ReactNode }) {
  const toast = useToast();
  const [instructions, setInstructions] = useState(cfg.instructions);
  const [blocks, setBlocks] = useState(cfg.instructionBlocks);
  const [link, setLink] = useState(cfg.webLink);
  const [qs, setQs] = useState<string[]>(cfg.questions.map((q) => q.text));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const preSaveCfg = useRef<PartCfg | null>(null);
  useEffect(() => {
    if (!dirty && cfg !== preSaveCfg.current) {
      preSaveCfg.current = null;
      setInstructions(cfg.instructions);
      setBlocks(cfg.instructionBlocks);
      setLink(cfg.webLink);
      setQs(cfg.questions.map((q) => q.text));
    }
  }, [cfg, dirty]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  async function save(forUpload = false) {
    setBusy(true);
    try {
      const result = await api<{ parts: PartCfg[] }>("PUT", `/teacher/sessions/${sessionId}/parts/${cfg.part}`, { instructions, instructionBlocks: blocks.map(({ id, title, text, webLink, questions }) => ({ id, title, text, webLink, questions: questions.filter((q) => q.trim()) })), webLink: link, questions: qs.filter((q) => q.trim()) });
      const saved = result.parts.find((p) => p.part === cfg.part)!;
      preSaveCfg.current = cfg;
      setInstructions(saved.instructions);
      setBlocks(saved.instructionBlocks);
      setLink(saved.webLink);
      setQs(saved.questions.map((q) => q.text));
      setDirty(false);
      if (!forUpload) toast(`Part ${cfg.part} saved`);
      await onSaved();
      return true;
    } catch (e) {
      toast((e as ApiError).message, "err");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <WorkspaceHeading icon={partIcon(cfg.part)}>{PART_TITLES[cfg.part]}</WorkspaceHeading>
        {dirty && <span className="badge bg-amber-100 text-amber-800">Unsaved changes</span>}
      </div>
      {stageSettings}
      <Field label="Part overview" hint="Optional. Students see this before the numbered tasks. Select text, then use the toolbar to format it.">
        <RichTextArea label={`Part ${cfg.part} overview`} value={instructions} onChange={touch(setInstructions)} disabled={disabled || busy} maxLength={LIMITS.instructionTextMax} minHeight="min-h-[110px]" />
      </Field>
      <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:p-4">
        <WorkspaceHeading as="h4" icon="task">Task instruction blocks</WorkspaceHeading>
        <p className="text-xs text-slate-600">Add separate tasks and arrange them in the order students should follow.</p>
        <ol className="space-y-3">
          {blocks.map((block, i) => (
            <li key={block.id} className="space-y-3 rounded-lg border border-blue-100 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="badge bg-blue-100 text-blue-900">Task {i + 1}</span>
                <div className="flex flex-wrap gap-1">
                  {([-1, 1] as const).map((d) => (
                    <button key={d} type="button" className="btn-ghost btn-sm" aria-label={`Move task ${i + 1} ${d < 0 ? "up" : "down"}`} disabled={disabled || busy || !blocks[i + d]} onClick={() => {
                      const next = blocks.slice();
                      [next[i], next[i + d]] = [next[i + d], next[i]];
                      touch(setBlocks)(next);
                    }}>{d < 0 ? "↑" : "↓"}</button>
                  ))}
                  <button type="button" className="btn-ghost btn-sm text-rose-700" aria-label={`Remove task ${i + 1}`} disabled={disabled || busy} onClick={() => touch(setBlocks)(blocks.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
              <Field label="Task heading (optional)">
                <input className="input" aria-label={`Task ${i + 1} heading`} value={block.title} disabled={disabled || busy} maxLength={LIMITS.instructionTitleMax} onChange={(e) => touch(setBlocks)(blocks.map((b, j) => j === i ? { ...b, title: e.target.value } : b))} />
              </Field>
              <Field label="Task instructions" hint="Select text, then use the toolbar for bold, underline, text size or bullet points.">
                <RichTextArea label={`Task ${i + 1} instructions`} value={block.text} disabled={disabled || busy} maxLength={LIMITS.instructionTextMax} onChange={(text) => touch(setBlocks)(blocks.map((b, j) => j === i ? { ...b, text } : b))} />
              </Field>
              <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                <QuestionList questions={block.questions} taskNumber={i + 1} disabled={disabled || busy} onChange={(questions) => touch(setBlocks)(blocks.map((b) => b.id === block.id ? { ...b, questions } : b))} />
              </div>
              <Field label="Task external link (optional)">
                <input className="input" aria-label={`Task ${i + 1} external link`} value={block.webLink} disabled={disabled || busy} placeholder="https://…" maxLength={500} onChange={(e) => touch(setBlocks)(blocks.map((b) => b.id === block.id ? { ...b, webLink: e.target.value } : b))} />
              </Field>
              <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                <InstructionAttachment sessionId={sessionId} part={cfg.part} taskId={block.id} taskNumber={i + 1}
                  initial={cfg.instructionBlocks.find((b) => b.id === block.id)?.attachment ?? null} onSaved={onSaved} disabled={disabled || busy}
                  beforeUpload={cfg.instructionBlocks.some((b) => b.id === block.id) ? undefined : () => save(true)}
                  uploadBlocked={!cfg.instructionBlocks.some((b) => b.id === block.id) && blocks.some((b) => !b.text.trim())} />
              </div>
              <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                <InstructionAttachment sessionId={sessionId} part={cfg.part} taskId={block.id} taskNumber={i + 1} variant="taskPdf"
                  initial={cfg.instructionBlocks.find((b) => b.id === block.id)?.pdf ?? null} onSaved={onSaved} disabled={disabled || busy}
                  beforeUpload={cfg.instructionBlocks.some((b) => b.id === block.id) ? undefined : () => save(true)}
                  uploadBlocked={!cfg.instructionBlocks.some((b) => b.id === block.id) && blocks.some((b) => !b.text.trim())} />
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-ghost btn-sm" disabled={disabled || busy || blocks.length >= LIMITS.instructionBlockCount} onClick={() => touch(setBlocks)([...blocks, { id: crypto.randomUUID(), title: "", text: "", webLink: "", questions: [] }])}>+ Add task block</button>
        {blocks.some((b) => !b.text.trim()) && <p className="text-xs text-slate-600">Fill in the instructions for every task or remove blank tasks before saving.</p>}
      </div>
      <details className="rounded-lg border border-slate-200 p-3" open={!!(cfg.webLink || cfg.diagram || cfg.attachment) || undefined}>
        <summary className="cursor-pointer text-sm font-semibold">Shared part resources (optional)</summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-slate-600">These resources apply to the whole of Part {cfg.part}. Students see them under the part overview, above the tasks.</p>
          <Field label="Shared part web link (optional)" hint="Save the part to apply a new or changed link.">
            <input className="input" value={link} placeholder="https://…" onChange={(e) => touch(setLink)(e.target.value)} disabled={disabled || busy} maxLength={500} />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <InstructionAttachment sessionId={sessionId} part={cfg.part} variant="partDiagram" initial={cfg.diagram} onSaved={onSaved} disabled={disabled} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <InstructionAttachment sessionId={sessionId} part={cfg.part} initial={cfg.attachment} onSaved={onSaved} disabled={disabled} />
          </div>
        </div>
      </details>
      <QuestionList questions={qs} disabled={disabled || busy} onChange={touch(setQs)} />
      <button className="btn-primary" disabled={busy || disabled || !dirty || blocks.some((b) => !b.text.trim())} onClick={() => save()}>
        {busy ? "Saving…" : `Save Part ${cfg.part}`}
      </button>
    </section>
  );
}

function QuestionList({ questions, onChange, disabled, taskNumber }: {
  questions: string[]; onChange: (questions: string[]) => void; disabled: boolean; taskNumber?: number;
}) {
  const scope = taskNumber === undefined ? "Part-wide" : `Task ${taskNumber}`;
  const lastInput = useRef<HTMLInputElement>(null);
  const focusAddedQuestion = useRef(false);
  useEffect(() => {
    if (!focusAddedQuestion.current) return;
    focusAddedQuestion.current = false;
    lastInput.current?.focus();
  }, [questions.length]);
  function move(i: number, offset: number) {
    const next = questions.slice();
    const j = i + offset;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return <fieldset className="min-w-0">
    <legend className="label">{taskNumber === undefined ? "Part-wide guiding questions" : "Guiding questions for this task"}</legend>
    <ol className="space-y-2">
      {questions.map((q, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-xs font-semibold text-slate-600">{i + 1}</span>
          <input ref={i === questions.length - 1 ? lastInput : undefined} className="input min-w-0 basis-[calc(100%_-_1.5rem)] sm:basis-auto" value={q} onChange={(e) => onChange(questions.map((x, j) => j === i ? e.target.value : x))} disabled={disabled} maxLength={LIMITS.guidingQuestionMax} aria-label={`${scope} guiding question ${i + 1}`} />
          <div className="ml-5 flex shrink-0 gap-1 sm:ml-0">
            <button type="button" className="btn-ghost btn-sm" disabled={disabled || i === 0} aria-label={`${scope}: move question ${i + 1} up`} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="btn-ghost btn-sm" disabled={disabled || i === questions.length - 1} aria-label={`${scope}: move question ${i + 1} down`} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="btn-ghost btn-sm text-rose-700" disabled={disabled} aria-label={`${scope}: remove question ${i + 1}`} onClick={() => onChange(questions.filter((_, j) => j !== i))}>✕</button>
          </div>
        </li>
      ))}
    </ol>
    <button type="button" className="btn-ghost btn-sm mt-2" disabled={disabled || questions.length >= LIMITS.taskQuestionCount} onClick={() => {
      focusAddedQuestion.current = true;
      onChange([...questions, ""]);
    }}>{taskNumber === undefined ? "+ Add part-wide question" : "+ Add guiding question"}</button>
  </fieldset>;
}
