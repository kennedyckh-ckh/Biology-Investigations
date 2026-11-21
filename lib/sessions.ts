import crypto from "node:crypto";
import { constants as fsConstants, copyFileSync } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR, all, get, run, tx, now, num, type Row } from "./db";
import { DEFAULT_CRITIQUE_PROMPTS, PART_TITLES, TAGS, type DesignTagHint, type InstructionBlock } from "./constants";
import { attachmentInfo, extraInfo, removeInstructionFile, taskAttachmentInfo, taskPdfInfo } from "./instruction-files";
import { stageCritiquePrompts } from "./sharing";

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
  const pdfs = prefix && blocks.length ? taskPdfInfo(sessionId, part, prefix) : null;
  return blocks.map(({ id, title, text, webLink, questions }, i) => {
    const taskId = id ?? `legacy-${i + 1}`;
    return { id: taskId, title, text, webLink: webLink ?? "", questions: questions ?? [], ...(prefix ? { attachment: files?.get(taskId) ?? null, pdf: pdfs?.get(taskId) ?? null } : {}) };
  });
}

export function partConfig(sessionId: number) {
  const prefix = `/api/teacher/sessions/${sessionId}`;
  const promptLists = stageCritiquePrompts(sessionRow(sessionId));
  return [1, 2, 3].map((part) => {
    const p = get("SELECT * FROM session_parts WHERE session_id=? AND part=?", sessionId, part)!;
    return {
      part,
      instructions: String(p.instructions),
      instructionBlocks: instructionBlocksFor(sessionId, part, prefix),
      webLink: String(p.web_link),
      attachment: attachmentInfo(sessionId, part, prefix),
      diagram: extraInfo(sessionId, part, "part_diagram", prefix),
      visibility: String(p.visibility),
      questions: questionsFor(sessionId, part),
      entryTags: entryTagsFor(sessionId, part),
      critiquePrompts: promptLists[part],
      tagHints: tagHintsFor(sessionId, part),
      tagHintsVisible: tagHintsVisible(sessionId, part),
    };
  });
}

/** Use the same release and visibility rules for students and the read-only teacher preview. */
export function studentPart(sessionId: number, part: number, prefix = "/api/student") {
  const p = get("SELECT * FROM session_parts WHERE session_id=? AND part=?", sessionId, part)!;
  const vis = String(p.visibility);
  if (vis === "hidden") return null;
  const base = { part, title: PART_TITLES[part], locked: vis !== "open" };
  if (base.locked) return base;
  const entryTags = entryTagsFor(sessionId, part);
  return {
    ...base,
    instructions: String(p.instructions),
    instructionBlocks: instructionBlocksFor(sessionId, part, prefix),
    webLink: String(p.web_link),
    attachment: attachmentInfo(sessionId, part, prefix),
    diagram: extraInfo(sessionId, part, "part_diagram", prefix),
    questions: questionsFor(sessionId, part),
    entryTags,
    ...(tagHintsVisible(sessionId, part) ? { designTagHints: tagHintsFor(sessionId, part).filter(({ tag }) => entryTags.includes(tag)) } : {}),
  };
}

export function entryTagsFor(sessionId: number, part?: number): readonly string[] {
  if (part !== undefined) {
    const stage = get("SELECT tags_json FROM stage_settings WHERE session_id=? AND part=?", sessionId, part);
    if (stage?.tags_json != null) return JSON.parse(String(stage.tags_json)) as string[];
  }
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

/** Part 1 keeps its original storage; Parts 2 and 3 have their own hint lists and release switches. */
export function tagHintsFor(sessionId: number, part: number): DesignTagHint[] {
  if (part === 1) return designHintsFor(sessionId);
  const row = get("SELECT hints_json FROM stage_tag_hints WHERE session_id=? AND part=?", sessionId, part);
  return row ? JSON.parse(String(row.hints_json)) as DesignTagHint[] : [];
}

export function tagHintsVisible(sessionId: number, part: number): boolean {
  if (part === 1) return designHintsVisible(sessionId);
  return !!get("SELECT 1 FROM stage_hint_release WHERE session_id=? AND part=?", sessionId, part);
}

export function saveTagHints(sessionId: number, part: number, hintsJson: string) {
  if (part === 1) run("INSERT INTO design_tag_hints(session_id,hints_json) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET hints_json=excluded.hints_json", sessionId, hintsJson);
  else run("INSERT INTO stage_tag_hints(session_id,part,hints_json) VALUES(?,?,?) ON CONFLICT(session_id,part) DO UPDATE SET hints_json=excluded.hints_json", sessionId, part, hintsJson);
}

export function setTagHintsVisible(sessionId: number, part: number, visible: boolean) {
  if (part === 1) {
    if (visible) run("INSERT OR IGNORE INTO design_hint_release(session_id) VALUES(?)", sessionId);
    else run("DELETE FROM design_hint_release WHERE session_id=?", sessionId);
  } else if (visible) run("INSERT OR IGNORE INTO stage_hint_release(session_id,part) VALUES(?,?)", sessionId, part);
  else run("DELETE FROM stage_hint_release WHERE session_id=? AND part=?", sessionId, part);
}

const INSTRUCTION_DIR = path.join(UPLOAD_DIR, "instructions");

/**
 * Copies a session's design (settings, parts, tasks, files and empty groups) into a new session for the same teacher.
 * Students, entries, submissions, shares and AI drafts are never copied. Hints start hidden and Part 1 starts open.
 */
export function cloneSession(teacherId: number, sourceId: number, title: string): number {
  const copied: string[] = [];
  const copyFile = (storageName: unknown): string | null => {
    const next = crypto.randomUUID();
    try {
      copyFileSync(path.join(INSTRUCTION_DIR, String(storageName)), path.join(INSTRUCTION_DIR, next), fsConstants.COPYFILE_FICLONE);
    } catch (error) {
      // A file missing from storage is skipped rather than blocking the copy.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    copied.push(next);
    return next;
  };
  try {
    return tx(() => {
      const src = get("SELECT * FROM sessions WHERE id=? AND teacher_id=?", sourceId, teacherId)!;
      const sid = run(
        "INSERT INTO sessions(teacher_id,title,join_code,status,source_template_id,source_version,pedagogy_notes,anonymise_sharing,critique_prompts_json,ai_criteria,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        teacherId, title, newJoinCode(), "active", src.source_template_id ?? null, src.source_version ?? null,
        String(src.pedagogy_notes), num(src.anonymise_sharing), String(src.critique_prompts_json), String(src.ai_criteria), now()
      ).id;
      for (const p of all("SELECT * FROM session_parts WHERE session_id=? ORDER BY part", sourceId)) {
        run("INSERT INTO session_parts(session_id,part,instructions,web_link,visibility) VALUES(?,?,?,?,?)", sid, num(p.part), String(p.instructions), String(p.web_link), num(p.part) === 1 ? "open" : "visible");
      }
      run("INSERT INTO session_questions(session_id,part,position,text) SELECT ?,part,position,text FROM session_questions WHERE session_id=?", sid, sourceId);
      run("INSERT INTO session_entry_tags(session_id,tags_json) SELECT ?,tags_json FROM session_entry_tags WHERE session_id=?", sid, sourceId);
      run("INSERT INTO stage_settings(session_id,part,tags_json,prompts_json) SELECT ?,part,tags_json,prompts_json FROM stage_settings WHERE session_id=?", sid, sourceId);
      run("INSERT INTO design_tag_hints(session_id,hints_json) SELECT ?,hints_json FROM design_tag_hints WHERE session_id=?", sid, sourceId);
      run("INSERT INTO stage_tag_hints(session_id,part,hints_json) SELECT ?,part,hints_json FROM stage_tag_hints WHERE session_id=?", sid, sourceId);
      run("INSERT INTO part_instruction_blocks(session_id,part,blocks_json) SELECT ?,part,blocks_json FROM part_instruction_blocks WHERE session_id=?", sid, sourceId);
      for (const f of all("SELECT * FROM instruction_attachments WHERE session_id=?", sourceId)) {
        const copy = copyFile(f.storage_name);
        if (copy) run("INSERT INTO instruction_attachments(session_id,part,storage_name,name,size) VALUES(?,?,?,?,?)", sid, num(f.part), copy, String(f.name), num(f.size));
      }
      for (const f of all("SELECT * FROM task_instruction_attachments WHERE session_id=?", sourceId)) {
        const copy = copyFile(f.storage_name);
        if (copy) run("INSERT INTO task_instruction_attachments(session_id,part,task_id,storage_name,name,size) VALUES(?,?,?,?,?,?)", sid, num(f.part), String(f.task_id), copy, String(f.name), num(f.size));
      }
      for (const f of all("SELECT * FROM extra_instruction_files WHERE session_id=?", sourceId)) {
        const copy = copyFile(f.storage_name);
        if (copy) run("INSERT INTO extra_instruction_files(session_id,part,kind,task_id,storage_name,name,size) VALUES(?,?,?,?,?,?,?)", sid, num(f.part), String(f.kind), String(f.task_id), copy, String(f.name), num(f.size));
      }
      run("INSERT INTO groups(session_id,name,pin,seat_cap) SELECT ?,name,pin,seat_cap FROM groups WHERE session_id=? ORDER BY id", sid, sourceId);
      return sid;
    });
  } catch (error) {
    copied.forEach(removeInstructionFile);
    throw error;
  }
}

export function setQuestions(sessionId: number, part: number, questions: string[]) {
  run("DELETE FROM session_questions WHERE session_id=? AND part=?", sessionId, part);
  questions.forEach((q, i) => run("INSERT INTO session_questions(session_id,part,position,text) VALUES(?,?,?,?)", sessionId, part, i, q));
}

export function activeGroupIds(sessionId: number): number[] {
  return all("SELECT g.id FROM groups g WHERE g.session_id=? AND EXISTS(SELECT 1 FROM students s WHERE s.group_id=g.id AND s.unassigned=0 AND s.placeholder=0)", sessionId).map((r) => num(r.id));
}

export function sessionRow(id: number): Row {
  return get("SELECT * FROM sessions WHERE id=?", id)!;
}
