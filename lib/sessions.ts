import crypto from "node:crypto";
import { all, get, run, tx, now, num, type Row } from "./db";
import { DEFAULT_CRITIQUE_PROMPTS, PART_TITLES, TAGS, type DesignTagHint, type InstructionBlock } from "./constants";
import { attachmentInfo, taskAttachmentInfo } from "./instruction-files";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newJoinCode(): string {
  for (let i = 0; i < 20; i++) {
    let c = "";
    const b = crypto.randomBytes(6);
    for (let j = 0; j < 6; j++) c += ALPHABET[b[j] % ALPHABET.length];
    if (!get("SELECT 1 FROM sessions WHERE join_code=?", c)) return c;
  }
  throw new Error("Could not allocate join code");
}

/** Creates a session. If a template id is given it is COPIED: later edits never touch the master. */
export function createSession(teacherId: number, title: string, templateId?: number): number {
  return tx(() => {
    const tpl = templateId ? get("SELECT * FROM templates WHERE id=?", templateId) : undefined;
    const sid = run(
      "INSERT INTO sessions(teacher_id,title,join_code,status,source_template_id,source_version,pedagogy_notes,critique_prompts_json,ai_criteria,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      teacherId,
      title,
      newJoinCode(),
      "active",
      tpl ? num(tpl.id) : null,
      tpl ? num(tpl.version) : null,
      tpl ? String(tpl.pedagogy_notes) : "",
      JSON.stringify(DEFAULT_CRITIQUE_PROMPTS),
      tpl ? String(tpl.ai_criteria) : "",
      now()
    ).id;
    for (const part of [1, 2, 3]) {
      const tp = tpl ? get("SELECT * FROM template_parts WHERE template_id=? AND part=?", num(tpl.id), part) : undefined;
      run(
        "INSERT INTO session_parts(session_id,part,instructions,web_link,visibility) VALUES(?,?,?,?,?)",
        sid,
        part,
        tp ? String(tp.instructions) : "",
        tp ? String(tp.web_link) : "",
        part === 1 ? "open" : "visible"
      );
      if (tpl) {
        for (const q of all("SELECT text,position FROM template_questions WHERE template_id=? AND part=? ORDER BY position", num(tpl.id), part)) {
          run("INSERT INTO session_questions(session_id,part,position,text) VALUES(?,?,?,?)", sid, part, num(q.position), String(q.text));
        }
      }
    }
    run("INSERT INTO groups(session_id,name) VALUES(?,?)", sid, "Group A");
    run("INSERT INTO groups(session_id,name) VALUES(?,?)", sid, "Group B");
    return sid;
  });
}

export function questionsFor(sessionId: number, part: number): { id: number; text: string }[] {
  return all("SELECT id,text FROM session_questions WHERE session_id=? AND part=? ORDER BY position,id", sessionId, part).map((q) => ({ id: num(q.id), text: String(q.text) }));
}

export function instructionBlocksFor(sessionId: number, part: number, prefix?: string): InstructionBlock[] {
  const saved = get("SELECT blocks_json FROM part_instruction_blocks WHERE session_id=? AND part=?", sessionId, part);
  if (!saved) return [];
  const blocks = JSON.parse(String(saved.blocks_json)) as InstructionBlock[];
  const files = prefix && blocks.length ? taskAttachmentInfo(sessionId, part, prefix) : null;
  return blocks.map(({ id, title, text, webLink }, i) => {
    const taskId = id ?? `legacy-${i + 1}`;
    return { id: taskId, title, text, webLink: webLink ?? "", ...(prefix ? { attachment: files?.get(taskId) ?? null } : {}) };
  });
}

export function partConfig(sessionId: number) {
  const prefix = `/api/teacher/sessions/${sessionId}`;
  return [1, 2, 3].map((part) => {
    const p = get("SELECT * FROM session_parts WHERE session_id=? AND part=?", sessionId, part)!;
    return {
      part,
      instructions: String(p.instructions),
      instructionBlocks: instructionBlocksFor(sessionId, part, prefix),
      webLink: String(p.web_link),
      attachment: attachmentInfo(sessionId, part, prefix),
      visibility: String(p.visibility),
      questions: questionsFor(sessionId, part),
    };
  });
}

/** Use the same release and visibility rules for students and the read-only teacher preview. */
export function studentPart(sessionId: number, part: number, entryTags: readonly string[], prefix = "/api/student") {
  const p = get("SELECT * FROM session_parts WHERE session_id=? AND part=?", sessionId, part)!;
  const vis = String(p.visibility);
  if (vis === "hidden") return null;
  const base = { part, title: PART_TITLES[part], locked: vis !== "open" };
  if (base.locked) return base;
  return {
    ...base,
    instructions: String(p.instructions),
    instructionBlocks: instructionBlocksFor(sessionId, part, prefix),
    webLink: String(p.web_link),
    attachment: attachmentInfo(sessionId, part, prefix),
    questions: questionsFor(sessionId, part),
    ...(part === 1 && designHintsVisible(sessionId) ? { designTagHints: designHintsFor(sessionId).filter(({ tag }) => entryTags.includes(tag)) } : {}),
  };
}

export function entryTagsFor(sessionId: number): readonly string[] {
  const saved = get("SELECT tags_json FROM session_entry_tags WHERE session_id=?", sessionId);
  return saved ? JSON.parse(String(saved.tags_json)) as string[] : TAGS;
}

export function designHintsFor(sessionId: number): DesignTagHint[] {
  const row = get("SELECT hints_json FROM design_tag_hints WHERE session_id=?", sessionId);
  return row ? JSON.parse(String(row.hints_json)) as DesignTagHint[] : [];
}

export function designHintsVisible(sessionId: number): boolean {
  return !!get("SELECT 1 FROM design_hint_release WHERE session_id=?", sessionId);
}

export function setQuestions(sessionId: number, part: number, questions: string[]) {
  run("DELETE FROM session_questions WHERE session_id=? AND part=?", sessionId, part);
  questions.forEach((q, i) => run("INSERT INTO session_questions(session_id,part,position,text) VALUES(?,?,?,?)", sessionId, part, i, q));
}

export function activeGroupIds(sessionId: number): number[] {
  return all("SELECT g.id FROM groups g WHERE g.session_id=? AND EXISTS(SELECT 1 FROM students s WHERE s.group_id=g.id)", sessionId).map((r) => num(r.id));
}

export function sessionRow(id: number): Row {
  return get("SELECT * FROM sessions WHERE id=?", id)!;
}
