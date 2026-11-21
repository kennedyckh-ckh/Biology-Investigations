"use client";
import { useId, useRef, type ReactNode } from "react";

/*
 * Lightweight, safe formatting for teacher-written instructions.
 * Text is stored as plain text with a few tags and is rendered as React elements (never as HTML):
 *   [b]bold[/b]  [i]italic[/i]  [u]underline[/u]  [small]…[/small]  [large]…[/large]  [xl]…[/xl]
 *   Lines starting with "- " become bullet points; lines starting with "1. " become a numbered list.
 * Plain instructions written before this feature render exactly as before.
 */
type StyleTag = "b" | "i" | "u" | "small" | "large" | "xl";
const TAG_RE = /\[(\/?)(b|i|u|small|large|xl)\]/g;
const SIZE_TAGS: StyleTag[] = ["small", "large", "xl"];

interface Segment { text: string; styles: StyleTag[] }

function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const stack: StyleTag[] = [];
  let last = 0;
  const push = (t: string) => { if (t) out.push({ text: t, styles: [...stack] }); };
  for (const m of text.matchAll(TAG_RE)) {
    const closing = m[1] === "/";
    const tag = m[2] as StyleTag;
    push(text.slice(last, m.index));
    last = m.index! + m[0].length;
    if (!closing) stack.push(tag);
    else {
      const at = stack.lastIndexOf(tag);
      if (at >= 0) stack.splice(at, 1);
    }
  }
  push(text.slice(last));
  return out;
}

const sizeClass: Record<string, string> = { small: "text-[0.85em]", large: "text-[1.2em] leading-snug", xl: "text-[1.45em] leading-tight" };

function renderSegment(seg: Segment, key: number): ReactNode {
  const size = [...seg.styles].reverse().find((s) => SIZE_TAGS.includes(s));
  const cls = [
    seg.styles.includes("b") && "font-semibold text-slate-900",
    seg.styles.includes("i") && "italic",
    seg.styles.includes("u") && "underline underline-offset-2",
    size && sizeClass[size],
  ].filter(Boolean).join(" ");
  return cls ? <span key={key} className={cls}>{seg.text}</span> : <span key={key}>{seg.text}</span>;
}

type Line = Segment[];
function splitLines(segs: Segment[]): Line[] {
  const lines: Line[] = [[]];
  for (const seg of segs) {
    const parts = seg.text.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, styles: seg.styles });
    });
  }
  return lines;
}

const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d{1,3}[.)]\s+/;

/** Removes the list marker from the first segment of a line. */
function stripMarker(line: Line, re: RegExp): Line {
  const copy = line.map((s) => ({ ...s }));
  // A marker can be preceded by an opening tag such as "[b]- point", so look through the leading segments.
  let joined = "";
  for (let i = 0; i < copy.length; i++) {
    joined += copy[i].text;
    const m = joined.match(re);
    if (m) {
      let remove = m[0].length - (joined.length - copy[i].text.length);
      for (let j = 0; j <= i; j++) {
        if (j < i) { copy[j].text = ""; continue; }
        copy[j].text = copy[j].text.slice(Math.max(0, remove));
        remove = 0;
      }
      return copy.filter((s) => s.text);
    }
    if (joined.trim()) break;
  }
  return copy;
}

const lineText = (line: Line) => line.map((s) => s.text).join("");

export function hasFormatting(text: string) {
  return /\[(\/?)(b|i|u|small|large|xl)\]/.test(text) || text.split("\n").some((l) => BULLET.test(l) || NUMBER.test(l));
}

/** Strips formatting tags for places that need plain text, such as exports and AI prompts. */
export function plainText(text: string) {
  return text.replace(TAG_RE, "");
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = splitLines(segments(text));
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const t = lineText(lines[i]);
    const kind = BULLET.test(t) ? "ul" : NUMBER.test(t) ? "ol" : null;
    if (kind) {
      const items: Line[] = [];
      const re = kind === "ul" ? BULLET : NUMBER;
      while (i < lines.length && re.test(lineText(lines[i]))) items.push(stripMarker(lines[i++], re));
      const List = kind;
      blocks.push(<List key={key++} className={`my-1 space-y-0.5 pl-6 ${kind === "ul" ? "list-disc" : "list-decimal"}`}>
        {items.map((item, j) => <li key={j}>{item.map(renderSegment)}</li>)}
      </List>);
      continue;
    }
    // Consecutive ordinary lines keep their line breaks, as before.
    const para: Line[] = [];
    while (i < lines.length) {
      const lt = lineText(lines[i]);
      if (BULLET.test(lt) || NUMBER.test(lt)) break;
      para.push(lines[i++]);
    }
    blocks.push(<p key={key++} className="whitespace-pre-wrap">{para.map((line, j) => <span key={j}>{j > 0 && "\n"}{line.map(renderSegment)}</span>)}</p>);
  }
  return <div className={`break-words ${className}`}>{blocks}</div>;
}

/* ---------- Editor: toolbar + textarea + live preview ---------- */

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled}
    onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-slate-700 hover:bg-white hover:text-blue-900 hover:shadow-sm disabled:opacity-40">
    {children}
  </button>;
}

export function RichTextArea({ value, onChange, disabled, maxLength, label, ariaLabel, minHeight = "min-h-24", placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; maxLength?: number; label: string; ariaLabel?: string; minHeight?: string; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const previewId = useId();

  function apply(next: string, selStart: number, selEnd: number) {
    if (maxLength && next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function wrap(tag: StyleTag) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const open = `[${tag}]`;
    const close = `[/${tag}]`;
    const selected = value.slice(a, b);
    // Toggle off when the selection is already wrapped in this tag.
    if (value.slice(a - open.length, a) === open && value.slice(b, b + close.length) === close) {
      apply(value.slice(0, a - open.length) + selected + value.slice(b + close.length), a - open.length, b - open.length);
      return;
    }
    if (selected.startsWith(open) && selected.endsWith(close)) {
      const inner = selected.slice(open.length, selected.length - close.length);
      apply(value.slice(0, a) + inner + value.slice(b), a, a + inner.length);
      return;
    }
    let inner = selected;
    // Only one text size applies at a time: replace any size tags inside the selection.
    if (SIZE_TAGS.includes(tag)) inner = inner.replace(/\[\/?(small|large|xl)\]/g, "");
    apply(value.slice(0, a) + open + inner + close + value.slice(b), a + open.length, a + open.length + inner.length);
  }

  function setSize(size: "normal" | "small" | "large" | "xl") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    // Expand the selection over size tags that directly surround it.
    const before = value.slice(0, a).match(/\[(small|large|xl)\]$/);
    const after = value.slice(b).match(/^\[\/(small|large|xl)\]/);
    const start = before ? a - before[0].length : a;
    const end = after ? b + after[0].length : b;
    const inner = value.slice(a, b).replace(/\[\/?(small|large|xl)\]/g, "");
    const wrapped = size === "normal" ? inner : `[${size}]${inner}[/${size}]`;
    const offset = size === "normal" ? 0 : size.length + 2;
    apply(value.slice(0, start) + wrapped + value.slice(end), start + offset, start + offset + inner.length);
  }

  function list(kind: "ul" | "ol") {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const start = value.lastIndexOf("\n", a - 1) + 1;
    const endIdx = value.indexOf("\n", Math.max(b - (b > a && value[b - 1] === "\n" ? 1 : 0), a));
    const end = endIdx === -1 ? value.length : endIdx;
    const lines = value.slice(start, end).split("\n");
    const re = kind === "ul" ? BULLET : NUMBER;
    const allListed = lines.every((l) => !l.trim() || re.test(l));
    const next = lines.map((l, i) => {
      const bare = l.replace(BULLET, "").replace(NUMBER, "");
      if (allListed) return bare;
      if (!l.trim()) return l;
      return kind === "ul" ? `- ${bare}` : `${i + 1}. ${bare}`;
    }).join("\n");
    apply(value.slice(0, start) + next + value.slice(end), start, start + next.length);
  }

  function clear() {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const whole = a === b;
    const s = whole ? 0 : a;
    const e = whole ? value.length : b;
    const inner = value.slice(s, e).replace(TAG_RE, "");
    apply(value.slice(0, s) + inner + value.slice(e), s, s + inner.length);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b" || k === "i" || k === "u") {
      e.preventDefault();
      wrap(k);
    }
  }

  const showPreview = hasFormatting(value);
  return <div className="space-y-1.5">
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
      <div role="toolbar" aria-label={`Formatting for ${label}`} className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        <ToolButton label="Bold (Ctrl+B)" disabled={disabled} onClick={() => wrap("b")}><b>B</b></ToolButton>
        <ToolButton label="Italic (Ctrl+I)" disabled={disabled} onClick={() => wrap("i")}><i className="font-serif">I</i></ToolButton>
        <ToolButton label="Underline (Ctrl+U)" disabled={disabled} onClick={() => wrap("u")}><span className="underline underline-offset-2">U</span></ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden="true" />
        <label className="sr-only" htmlFor={`${previewId}-size`}>Text size</label>
        <select id={`${previewId}-size`} disabled={disabled} className="h-8 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-slate-700 hover:border-slate-300 hover:bg-white"
          value="" onMouseDown={() => { /* keep the selection */ }} onChange={(e) => { setSize(e.target.value as "normal"); e.target.value = ""; }}>
          <option value="" disabled>Text size</option>
          <option value="small">Small</option>
          <option value="normal">Normal</option>
          <option value="large">Large</option>
          <option value="xl">Extra large</option>
        </select>
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden="true" />
        <ToolButton label="Bullet points" disabled={disabled} onClick={() => list("ul")}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
        </ToolButton>
        <ToolButton label="Numbered list" disabled={disabled} onClick={() => list("ol")}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5c0-1 .8-1.5 1.5-1.5s1.5.5 1.5 1.3c0 1-3 2.2-3 3.7h3" /></svg>
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden="true" />
        <ToolButton label="Clear formatting (selection, or all text if nothing is selected)" disabled={disabled || !hasFormatting(value)} onClick={clear}>
          <span className="text-xs font-medium">Clear</span>
        </ToolButton>
      </div>
      <textarea ref={ref} className={`block w-full resize-y border-0 px-3 py-2 text-sm outline-none focus:ring-0 ${minHeight}`}
        aria-label={ariaLabel ?? label} aria-describedby={showPreview ? previewId : undefined} value={value} disabled={disabled} maxLength={maxLength}
        placeholder={placeholder} onKeyDown={onKeyDown} onChange={(e) => onChange(e.target.value)} />
    </div>
    {showPreview && <div id={previewId} className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">Student view</p>
      <RichText text={value} className="text-sm leading-relaxed text-slate-700" />
    </div>}
  </div>;
}
