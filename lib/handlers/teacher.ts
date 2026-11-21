import { route, bad, forbidden, notFound, HttpError, str, int, partNo, safeLink, type Ctx } from "../router";
import { all, get, run, tx, now, num, audit, type Row } from "../db";
import { requireTeacher, ownSession, ownSetupSession, ownGroup, mustBeActive, submissionInfo, individualSubmissionInfo, onlineEditors } from "../authz";
import { createSession, cloneSession, partConfig, setQuestions, activeGroupIds, entryTagsFor, designHintsFor, designHintsVisible, instructionBlocksFor, studentPart, touchDesignTemplate, ensureDesignSession, saveTagHints, setTagHintsVisible, tagHintsFor, tagHintsVisible } from "../sessions";
import { entriesWhere, deleteImageFile } from "../entries";
import { classBoardFor, publishedShares, publishedAi, critiquePromptsOf, stageCritiquePrompts, reactionsFor } from "../sharing";
import { LIMITS, PART_TITLES, ONLINE_WINDOW_MS, DEFAULT_CRITIQUE_PROMPTS, type InstructionBlock } from "../constants";
import { randomUUID } from "node:crypto";
import { attachmentInfo, attachmentRow, downloadExtraFile, downloadInstructionFile, extraInfo, extraRow, receiveInstructionFile, removeInstructionFile, uploadsInProgress, type ExtraKind } from "../instruction-files";
import { revokeStudentTokens } from "../auth";

/* ---------- Sessions list / create ---------- */
route("GET", "/teacher/sessions", (ctx) => {
  const t = requireTeacher(ctx);
  const rows = all(
    "SELECT s.*, (SELECT COUNT(*) FROM groups g WHERE g.session_id=s.id) AS groups_n, (SELECT COUNT(*) FROM students st WHERE st.session_id=s.id) AS students_n FROM sessions s WHERE s.teacher_id=? ORDER BY s.status, s.created_at DESC",
    t.id
  );
  return {
    sessions: rows.map((s) => ({
      id: num(s.id),
      title: s.title,
      joinCode: s.join_code,
      status: s.status,
      groups: num(s.groups_n),
      students: num(s.students_n),
      fromTemplate: !!s.source_template_id,
      createdAt: num(s.created_at),
    })),
  };
});

route("GET", "/teacher/assigned-templates", (ctx) => {
  const t = requireTeacher(ctx);
  const rows = all(
    "SELECT a.*, tp.title, tp.pedagogy_notes, tp.version, tp.ai_criteria, u.name AS educator_name FROM template_assignments a JOIN templates tp ON tp.id=a.template_id JOIN users u ON u.id=tp.educator_id WHERE a.teacher_id=? ORDER BY a.assigned_at DESC",
    t.id
  );
  return {
    templates: rows.map((r) => ({
      assignmentId: num(r.id),
      templateId: num(r.template_id),
      title: r.title,
      pedagogyNotes: r.pedagogy_notes,
      aiCriteria: r.ai_criteria,
      version: num(r.version),
      note: r.note,
      refLinks: JSON.parse(String(r.ref_links_json)),
      educator: r.educator_name,
      assignedAt: num(r.assigned_at),
      parts: templatePreview(num(r.template_id)),
    })),
  };
});

/** What a teacher sees before importing: each part's overview, link, tasks and guiding questions from the design. */
function templatePreview(templateId: number) {
  const sid = ensureDesignSession(templateId);
  return partConfig(sid).map((p) => ({
    part: p.part,
    instructions: p.instructions,
    webLink: p.webLink,
    questions: p.questions.map((q) => q.text),
    tasks: p.instructionBlocks.map((b) => ({ title: b.title, text: b.text, questions: b.questions, hasDiagram: !!b.attachment, hasPdf: !!b.pdf, webLink: b.webLink })),
    hasDiagram: !!p.diagram,
    hasFile: !!p.attachment,
  }));
}

route("POST", "/teacher/sessions", (ctx) => {
  const t = requireTeacher(ctx);
  const title = str(ctx.body?.title, 150, "Session title");
  let templateId: number | undefined;
  if (ctx.body?.assignmentId !== undefined && ctx.body?.assignmentId !== null) {
    // Only templates actually assigned to THIS teacher can be imported.
    const a = get("SELECT template_id FROM template_assignments WHERE id=? AND teacher_id=?", int(ctx.body.assignmentId, "assignmentId"), t.id);
    if (!a) throw forbidden("That template has not been shared with you.");
    templateId = num(a.template_id);
  }
  const id = createSession(t.id, title, templateId);
  audit("staff", t.id, templateId ? "session.create_from_template" : "session.create", `session:${id}`);
  return { id };
});

route("POST", "/teacher/sessions/:id/clone", (ctx) => {
  const t = requireTeacher(ctx);
  const s = ownSession(ctx, ctx.params.id);
  const title = str(ctx.body?.title, 150, "Session title");
  const id = cloneSession(t.id, num(s.id), title);
  audit("staff", t.id, "session.clone", `session:${num(s.id)}->session:${id}`);
  return { id };
});

/* ---------- Session detail / settings ---------- */
function sessionDetail(s: Row) {
  const sid = num(s.id);
  const src = s.source_template_id ? get("SELECT title,version FROM templates WHERE id=?", num(s.source_template_id)) : undefined;
  return {
    id: sid,
    title: s.title,
    joinCode: s.join_code,
    status: s.status,
    anonymiseSharing: !!num(s.anonymise_sharing),
    critiquePrompts: critiquePromptsOf(s),
    entryTags: entryTagsFor(sid),
    designTagHints: designHintsFor(sid),
    designHintsVisible: designHintsVisible(sid),
    aiCriteria: s.ai_criteria,
    pedagogyNotes: s.pedagogy_notes,
    source: s.source_template_id ? { templateId: num(s.source_template_id), title: src?.title ?? "(removed)", importedVersion: num(s.source_version), currentVersion: src ? num(src.version) : null } : null,
    parts: partConfig(sid),
    groups: all("SELECT g.*,(SELECT COUNT(*) FROM students st WHERE st.group_id=g.id AND st.unassigned=0) AS n FROM groups g WHERE g.session_id=? ORDER BY g.id", sid).map((g) => ({
      id: num(g.id),
      name: g.name,
      pin: g.pin ?? "",
      seatCap: g.seat_cap === null ? null : num(g.seat_cap),
      members: num(g.n),
      students: rosterRows("s.group_id=? AND s.unassigned=0", num(g.id)),
    })),
    unassigned: rosterRows("s.session_id=? AND s.unassigned=1", sid),
  };
}

function rosterRows(where: string, ...params: unknown[]) {
  return all(`SELECT s.id,s.name,s.class,s.class_no,s.placeholder,s.group_id,(SELECT COUNT(*) FROM entries e WHERE e.student_id=s.id AND e.deleted_at IS NULL) AS entries FROM students s WHERE ${where} ORDER BY s.class, s.class_no, s.name`, ...params).map((r) => ({
    id: num(r.id), name: String(r.name), class: String(r.class), classNo: String(r.class_no),
    joined: !num(r.placeholder), entries: num(r.entries), groupId: num(r.group_id),
  }));
}

route("GET", "/teacher/sessions/:id", (ctx) => sessionDetail(ownSetupSession(ctx, ctx.params.id)));

route("PUT", "/teacher/sessions/:id/design-tag-hints/visibility", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const sid = num(s.id);
  const visible = ctx.body?.visible;
  if (typeof visible !== "boolean") throw bad("Choose whether to show the design tag hints.");
  setTagHintsVisible(sid, 1, visible);
  return { visible };
});

route("PUT", "/teacher/sessions/:id/parts/:n/tag-hints/visibility", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const part = partNo(ctx.params.n);
  const visible = ctx.body?.visible;
  if (typeof visible !== "boolean") throw bad("Choose whether to show the entry-tag hints.");
  setTagHintsVisible(num(s.id), part, visible);
  audit("staff", ctx.auth.staff!.id, visible ? "hints.show" : "hints.hide", `session:${num(s.id)}:part:${part}`);
  return { visible };
});

function updateSessionSettings(ctx: Ctx) {
  const s = ownSetupSession(ctx, ctx.params.id);
  mustBeActive(s);
  const part = ctx.params.n === undefined ? undefined : partNo(ctx.params.n);
  const b = ctx.body || {};
  const sid = num(s.id);
  let tags: string[] | undefined;
  if ("entryTags" in b) {
    if (!Array.isArray(b.entryTags) || b.entryTags.length > LIMITS.entryTagCount) {
      throw bad(`Use up to ${LIMITS.entryTagCount} entry tags.`);
    }
    const proposed = (b.entryTags as unknown[]).map((v) => str(v, LIMITS.entryTagMax, "Entry tag"));
    if (proposed.some((tag) => /[\r\n]/.test(tag))) throw bad("Use one line for each tag.");
    if (new Set(proposed.map((tag) => tag.toLowerCase())).size !== proposed.length) throw bad("Entry tags must be unique.");
    tags = proposed;
  }
  let promptsJson: string | undefined;
  if ("critiquePrompts" in b) {
    if (!Array.isArray(b.critiquePrompts) || b.critiquePrompts.length > LIMITS.critiquePromptCount) throw bad(`Use up to ${LIMITS.critiquePromptCount} critique prompts.`);
    const defaults = new Map(DEFAULT_CRITIQUE_PROMPTS.map((p) => [p.key, p.label]));
    const current = critiquePromptsOf(s, part);
    const currentLabels = new Map(current.map((p) => [p.key, p.label]));
    const next = (b.critiquePrompts as unknown[]).map((value) => {
      if (!value || typeof value !== "object") throw bad("Invalid critique prompt");
      const p = value as { key?: unknown; label?: unknown; enabled?: unknown };
      const key = str(p.key, 40, "Prompt key");
      const defaultLabel = defaults.get(key);
      const label = p.label === undefined
        ? currentLabels.get(key) ?? defaultLabel
        : str(p.label, LIMITS.critiqueLabelMax, "Prompt label", { optional: !!defaultLabel }) || defaultLabel;
      if (!label) throw bad("Prompt label is required");
      return { key, label, enabled: !!p.enabled };
    });
    const used = new Set(next.map((prompt) => prompt.key));
    if (used.size !== next.length) throw bad("Critique prompt keys must be unique.");
    if (part !== undefined) {
      // Retain the labels linked to prior critiques even when a prompt is removed from the menu.
      const retired = current.filter((p) => !used.has(p.key)).map((p) => ({ ...p, enabled: false }));
      if (next.length + retired.length > LIMITS.critiquePromptCount) throw bad(`Use up to ${LIMITS.critiquePromptCount} critique prompts, including disabled prompts.`);
      promptsJson = JSON.stringify([...next, ...retired]);
    } else if (next.length) promptsJson = JSON.stringify(next);
  }
  let hintsJson: string | undefined;
  const hintPart = part ?? 1;
  const rawHints = "tagHints" in b ? b.tagHints : "designTagHints" in b ? b.designTagHints : undefined;
  if (rawHints !== undefined) {
    if (!Array.isArray(rawHints) || rawHints.length > LIMITS.entryTagCount) throw bad(`Use up to ${LIMITS.entryTagCount} entry-tag hints.`);
    const validTags = tags ?? entryTagsFor(sid, hintPart);
    const next = (rawHints as unknown[]).map((value) => {
      if (!value || typeof value !== "object") throw bad("Invalid entry-tag hint.");
      const hint = value as { tag?: unknown; hint?: unknown };
      const tag = str(hint.tag, LIMITS.entryTagMax, "Entry tag");
      if (!validTags.includes(tag)) throw bad(`Entry-tag hints must use a Part ${hintPart} entry tag.`);
      return { tag, hint: str(hint.hint, LIMITS.designHintMax, "Entry-tag hint", { optional: true }) };
    });
    if (new Set(next.map((record) => record.tag)).size !== next.length) throw bad("Use one hint per tag.");
    hintsJson = JSON.stringify(next.filter((record) => record.hint));
  }
  tx(() => {
    if (part !== undefined) {
      if (tags !== undefined || promptsJson !== undefined) run(
        "INSERT INTO stage_settings(session_id,part,tags_json,prompts_json) VALUES(?,?,?,?) ON CONFLICT(session_id,part) DO UPDATE SET tags_json=COALESCE(excluded.tags_json,tags_json),prompts_json=COALESCE(excluded.prompts_json,prompts_json)",
        sid, part, tags === undefined ? null : JSON.stringify(tags), promptsJson ?? null,
      );
    } else {
      if ("title" in b) run("UPDATE sessions SET title=? WHERE id=?", str(b.title, 150, "Session title"), sid);
      if ("anonymiseSharing" in b) run("UPDATE sessions SET anonymise_sharing=? WHERE id=?", b.anonymiseSharing ? 1 : 0, sid);
      if ("aiCriteria" in b) run("UPDATE sessions SET ai_criteria=? WHERE id=?", str(b.aiCriteria, 2000, "AI criteria", { optional: true }), sid);
      if (promptsJson !== undefined) run("UPDATE sessions SET critique_prompts_json=? WHERE id=?", promptsJson, sid);
      if (tags !== undefined) run("INSERT INTO session_entry_tags(session_id,tags_json) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET tags_json=excluded.tags_json", sid, JSON.stringify(tags));
    }
    if (hintsJson !== undefined) saveTagHints(sid, hintPart, hintsJson);
    touchDesignTemplate(sid);
    audit("staff", ctx.auth.staff!.id, part === undefined ? "session.update" : "stage.settings", `session:${sid}${part === undefined ? "" : `:part${part}`}`);
  });
  return sessionDetail(ownSetupSession(ctx, sid));
}
route("PATCH", "/teacher/sessions/:id", updateSessionSettings);
route("PATCH", "/teacher/sessions/:id/parts/:n/settings", updateSessionSettings);

route("PUT", "/teacher/sessions/:id/parts/:n", (ctx) => {
  const s = ownSetupSession(ctx, ctx.params.id);
  mustBeActive(s);
  const part = partNo(ctx.params.n);
  const b = ctx.body || {};
  const instructions = str(b.instructions, LIMITS.instructionTextMax, "Instructions", { optional: true });
  const link = safeLink(b.webLink);
  if (!Array.isArray(b.questions)) throw bad("Guiding questions must be a list");
  const qs = (b.questions as unknown[]).map((q) => str(q, LIMITS.guidingQuestionMax, "Guiding question", { optional: true })).filter(Boolean);
  if (qs.length > 20) throw bad("At most 20 guiding questions per part");
  const sid = num(s.id);
  let blocks: InstructionBlock[] | undefined;
  if ("instructionBlocks" in b) {
    if (!Array.isArray(b.instructionBlocks) || b.instructionBlocks.length > LIMITS.instructionBlockCount) {
      throw bad(`Use up to ${LIMITS.instructionBlockCount} task blocks per part.`);
    }
    const previous = instructionBlocksFor(sid, part);
    const ids = new Set<string>();
    blocks = (b.instructionBlocks as unknown[]).map((block, i) => {
      if (!block || typeof block !== "object") throw bad("Invalid task block.");
      const value = block as { id?: unknown; title?: unknown; text?: unknown; webLink?: unknown; questions?: unknown };
      const id = value.id === undefined ? previous[i]?.id ?? randomUUID() : value.id;
      if (typeof id !== "string" || (!previous.some((p) => p.id === id) && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) || ids.has(id)) throw bad("Each task must have a unique ID.");
      ids.add(id);
      const prior = previous.find((p) => p.id === id);
      const questions = value.questions === undefined ? prior?.questions ?? [] : value.questions;
      if (!Array.isArray(questions) || questions.length > LIMITS.taskQuestionCount) {
        throw bad(`Use a list of up to ${LIMITS.taskQuestionCount} guiding questions per task.`);
      }
      return {
        id,
        title: str(value.title, LIMITS.instructionTitleMax, "Task heading", { optional: true }),
        text: str(value.text, LIMITS.instructionTextMax, "Task instructions"),
        webLink: value.webLink === undefined ? prior?.webLink ?? "" : safeLink(value.webLink),
        questions: (questions as unknown[]).map((q) => str(q, LIMITS.guidingQuestionMax, "Task guiding question", { optional: true })).filter(Boolean),
      };
    });
  }
  const removedFiles: string[] = [];
  tx(() => {
    run("UPDATE session_parts SET instructions=?, web_link=? WHERE session_id=? AND part=?", instructions, link, sid, part);
    setQuestions(sid, part, qs);
    if (blocks !== undefined) {
      run("INSERT INTO part_instruction_blocks(session_id,part,blocks_json) VALUES(?,?,?) ON CONFLICT(session_id,part) DO UPDATE SET blocks_json=excluded.blocks_json", sid, part, JSON.stringify(blocks));
      for (const row of all("SELECT task_id,storage_name FROM task_instruction_attachments WHERE session_id=? AND part=?", sid, part)) {
        if (blocks.some((b) => b.id === row.task_id)) continue;
        run("DELETE FROM task_instruction_attachments WHERE session_id=? AND part=? AND task_id=?", sid, part, String(row.task_id));
        removedFiles.push(String(row.storage_name));
      }
      for (const row of all("SELECT task_id,storage_name FROM extra_instruction_files WHERE session_id=? AND part=? AND kind='task_pdf'", sid, part)) {
        if (blocks.some((b) => b.id === row.task_id)) continue;
        run("DELETE FROM extra_instruction_files WHERE session_id=? AND part=? AND kind='task_pdf' AND task_id=?", sid, part, String(row.task_id));
        removedFiles.push(String(row.storage_name));
      }
    }
  });
  removedFiles.forEach(removeInstructionFile);
  touchDesignTemplate(sid);
  return { parts: partConfig(sid) };
});

const attachmentPath = "/teacher/sessions/:id/parts/:n/attachment";
const taskAttachmentPath = "/teacher/sessions/:id/parts/:n/tasks/:taskId/attachment";
function getInstructionAttachment(ctx: Ctx) {
  const sid = num(ownSetupSession(ctx, ctx.params.id).id);
  const taskId = ctx.params.taskId;
  return downloadInstructionFile(attachmentRow(sid, partNo(ctx.params.n), taskId), taskId !== undefined || ctx.query.get("preview") === "1");
}
async function putInstructionAttachment(ctx: Ctx) {
  const s = ownSetupSession(ctx, ctx.params.id);
  mustBeActive(s);
  const sid = num(s.id);
  const part = partNo(ctx.params.n);
  const taskId = ctx.params.taskId;
  const assertTaskExists = () => {
    if (taskId !== undefined && !instructionBlocksFor(sid, part).some((b) => b.id === taskId)) throw notFound("Save the task before uploading a diagram.");
  };
  assertTaskExists();
  const key = `${sid}:${part}:${taskId ?? ""}`;
  if (uploadsInProgress.has(key)) throw new HttpError(409, "upload_in_progress", "A file is already being uploaded to this task.");
  uploadsInProgress.add(key);
  try {
    const file = await receiveInstructionFile(ctx.req, taskId !== undefined);
    try {
      mustBeActive(ownSetupSession(ctx, sid));
      assertTaskExists();
      const old = attachmentRow(sid, part, taskId);
      if (taskId === undefined) run(
        "INSERT INTO instruction_attachments(session_id,part,storage_name,name,size) VALUES(?,?,?,?,?) ON CONFLICT(session_id,part) DO UPDATE SET storage_name=excluded.storage_name,name=excluded.name,size=excluded.size",
        sid, part, file.storageName, file.name, file.size
      );
      else run(
        "INSERT INTO task_instruction_attachments(session_id,part,task_id,storage_name,name,size) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,part,task_id) DO UPDATE SET storage_name=excluded.storage_name,name=excluded.name,size=excluded.size",
        sid, part, taskId, file.storageName, file.name, file.size
      );
      if (old) removeInstructionFile(String(old.storage_name));
    } catch (error) {
      removeInstructionFile(file.storageName);
      throw error;
    }
    touchDesignTemplate(sid);
    return { attachment: attachmentInfo(sid, part, `/api/teacher/sessions/${sid}`, taskId) };
  } finally {
    uploadsInProgress.delete(key);
  }
}
function deleteInstructionAttachment(ctx: Ctx) {
  const s = ownSetupSession(ctx, ctx.params.id);
  mustBeActive(s);
  const sid = num(s.id);
  const part = partNo(ctx.params.n);
  const taskId = ctx.params.taskId;
  if (uploadsInProgress.has(`${sid}:${part}:${taskId ?? ""}`)) throw new HttpError(409, "upload_in_progress", "Wait for the upload to finish before removing the file.");
  const old = attachmentRow(sid, part, taskId);
  if (taskId === undefined) run("DELETE FROM instruction_attachments WHERE session_id=? AND part=?", sid, part);
  else run("DELETE FROM task_instruction_attachments WHERE session_id=? AND part=? AND task_id=?", sid, part, taskId);
  if (old) removeInstructionFile(String(old.storage_name));
  touchDesignTemplate(sid);
  return { attachment: null };
}
for (const path of [attachmentPath, taskAttachmentPath]) {
  route("GET", path, getInstructionAttachment);
  route("PUT", path, putInstructionAttachment, { binary: true });
  route("DELETE", path, deleteInstructionAttachment);
}

/* Part-wide diagram (image) and per-task PDF. */
const extraPaths: [string, ExtraKind][] = [["/teacher/sessions/:id/parts/:n/diagram", "part_diagram"], ["/teacher/sessions/:id/parts/:n/tasks/:taskId/pdf", "task_pdf"]];
for (const [path, kind] of extraPaths) {
  route("GET", path, (ctx) => {
    const sid = num(ownSetupSession(ctx, ctx.params.id).id);
    return downloadExtraFile(extraRow(sid, partNo(ctx.params.n), kind, ctx.params.taskId ?? ""), kind);
  });
  route("PUT", path, async (ctx) => {
    const s = ownSetupSession(ctx, ctx.params.id);
    mustBeActive(s);
    const sid = num(s.id);
    const part = partNo(ctx.params.n);
    const taskId = ctx.params.taskId ?? "";
    const assertTaskExists = () => {
      if (kind === "task_pdf" && !instructionBlocksFor(sid, part).some((b) => b.id === taskId)) throw notFound("Save the task before attaching a PDF.");
    };
    assertTaskExists();
    const key = `${sid}:${part}:${kind}:${taskId}`;
    if (uploadsInProgress.has(key)) throw new HttpError(409, "upload_in_progress", "A file is already being uploaded here.");
    uploadsInProgress.add(key);
    try {
      const file = await receiveInstructionFile(ctx.req, kind === "part_diagram", kind === "task_pdf");
      try {
        mustBeActive(ownSetupSession(ctx, sid));
        assertTaskExists();
        const old = extraRow(sid, part, kind, taskId);
        run(
          "INSERT INTO extra_instruction_files(session_id,part,kind,task_id,storage_name,name,size) VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id,part,kind,task_id) DO UPDATE SET storage_name=excluded.storage_name,name=excluded.name,size=excluded.size",
          sid, part, kind, taskId, file.storageName, file.name, file.size
        );
        if (old) removeInstructionFile(String(old.storage_name));
      } catch (error) {
        removeInstructionFile(file.storageName);
        throw error;
      }
      touchDesignTemplate(sid);
      return { attachment: extraInfo(sid, part, kind, `/api/teacher/sessions/${sid}`, taskId) };
    } finally {
      uploadsInProgress.delete(key);
    }
  }, { binary: true });
  route("DELETE", path, (ctx) => {
    const s = ownSetupSession(ctx, ctx.params.id);
    mustBeActive(s);
    const sid = num(s.id);
    const part = partNo(ctx.params.n);
    const taskId = ctx.params.taskId ?? "";
    if (uploadsInProgress.has(`${sid}:${part}:${kind}:${taskId}`)) throw new HttpError(409, "upload_in_progress", "Wait for the upload to finish before removing the file.");
    const old = extraRow(sid, part, kind, taskId);
    run("DELETE FROM extra_instruction_files WHERE session_id=? AND part=? AND kind=? AND task_id=?", sid, part, kind, taskId);
    if (old) removeInstructionFile(String(old.storage_name));
    touchDesignTemplate(sid);
    return { attachment: null };
  });
}

const previewPath = "/teacher/sessions/:id/student-view";
route("GET", previewPath, (ctx) => {
  const s = ownSetupSession(ctx, ctx.params.id);
  const sid = num(s.id);
  const entryTags = entryTagsFor(sid);
  return {
    title: s.title, archived: s.status !== "active", entryTags,
    parts: [1, 2, 3].map((part) => studentPart(sid, part, `/api/teacher/sessions/${sid}/student-view`)).filter(Boolean),
  };
});
route("GET", `${previewPath}/class`, (ctx) => {
  const s = ownSetupSession(ctx, ctx.params.id);
  return classBoardFor(s);
});
for (const suffix of ["/parts/:n/attachment", "/parts/:n/tasks/:taskId/attachment"]) {
  route("GET", `${previewPath}${suffix}`, (ctx) => {
    const sid = num(ownSetupSession(ctx, ctx.params.id).id);
    const part = partNo(ctx.params.n);
    if (get("SELECT visibility FROM session_parts WHERE session_id=? AND part=?", sid, part)?.visibility !== "open") throw forbidden("This part is not open to students.");
    const taskId = ctx.params.taskId;
    return downloadInstructionFile(attachmentRow(sid, part, taskId), taskId !== undefined || ctx.query.get("preview") === "1");
  });
}
for (const [suffix, kind] of [["/parts/:n/diagram", "part_diagram"], ["/parts/:n/tasks/:taskId/pdf", "task_pdf"]] as const) {
  route("GET", `${previewPath}${suffix}`, (ctx) => {
    const sid = num(ownSetupSession(ctx, ctx.params.id).id);
    const part = partNo(ctx.params.n);
    if (get("SELECT visibility FROM session_parts WHERE session_id=? AND part=?", sid, part)?.visibility !== "open") throw forbidden("This part is not open to students.");
    return downloadExtraFile(extraRow(sid, part, kind, ctx.params.taskId ?? ""), kind);
  });
}

/* Visibility: hidden | visible (shown but locked) | open. Opening Part 2/3 checks the previous part. */
function missingGroups(sessionId: number, part: number) {
  if (part === 1) return [];
  return activeGroupIds(sessionId)
    .filter((gid) => submissionInfo(gid, part - 1).status !== "submitted")
    .map((gid) => ({ id: gid, name: String(get("SELECT name FROM groups WHERE id=?", gid)!.name), status: submissionInfo(gid, part - 1).status }));
}

route("POST", "/teacher/sessions/:id/parts/:n/visibility", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const part = partNo(ctx.params.n);
  const v = ctx.body?.visibility;
  if (v !== "hidden" && v !== "visible" && v !== "open") throw bad("visibility must be hidden, visible or open");
  const sid = num(s.id);
  if (v === "open" && part > 1) {
    const missing = missingGroups(sid, part);
    if (missing.length) {
      if (ctx.body?.override !== true) throw new HttpError(409, "groups_missing", `${missing.length} active group(s) have not submitted Part ${part - 1}: ${missing.map((m) => m.name).join(", ")}.`);
      const reason = str(ctx.body?.reason, 300, "Reason for override");
      run("INSERT INTO part_overrides(session_id,part,overridden_by,reason,missing_groups_json,at) VALUES(?,?,?,?,?,?)", sid, part, ctx.auth.staff!.id, reason, JSON.stringify(missing), now());
      audit("staff", ctx.auth.staff!.id, "part.override_unlock", `session:${sid}:part:${part}`);
    }
  }
  run("UPDATE session_parts SET visibility=? WHERE session_id=? AND part=?", v, sid, part);
  audit("staff", ctx.auth.staff!.id, `part.${v}`, `session:${sid}:part:${part}`);
  return { parts: partConfig(sid) };
});

/* ---------- Archive / restore / delete ---------- */
route("POST", "/teacher/sessions/:id/archive", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  run("UPDATE sessions SET status='archived', archived_at=? WHERE id=?", now(), num(s.id));
  return { ok: true };
});
route("POST", "/teacher/sessions/:id/restore", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  run("UPDATE sessions SET status='active', archived_at=NULL WHERE id=?", num(s.id));
  return { ok: true };
});
route("DELETE", "/teacher/sessions/:id", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  if (s.status !== "archived") throw forbidden("Archive the session first; only archived sessions can be deleted.", "not_archived");
  if (ctx.body?.confirmTitle !== s.title) throw bad("Type the session title to confirm deletion.", "confirm_required");
  const files = all("SELECT image_file FROM entries WHERE session_id=? AND image_file IS NOT NULL", num(s.id));
  const attachments = all("SELECT storage_name FROM instruction_attachments WHERE session_id=? UNION ALL SELECT storage_name FROM task_instruction_attachments WHERE session_id=? UNION ALL SELECT storage_name FROM extra_instruction_files WHERE session_id=?", num(s.id), num(s.id), num(s.id));
  tx(() => run("DELETE FROM sessions WHERE id=?", num(s.id)));
  files.forEach((f) => deleteImageFile(String(f.image_file)));
  attachments.forEach((f) => removeInstructionFile(String(f.storage_name)));
  audit("staff", ctx.auth.staff!.id, "session.delete", `session:${num(s.id)}`);
  return { ok: true };
});

/* ---------- Groups ---------- */
function groupFields(b: Record<string, unknown>) {
  const name = str(b.name, 60, "Group name");
  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  if (pin && !/^[A-Za-z0-9]{3,12}$/.test(pin)) throw bad("PIN must be 3 to 12 letters or digits");
  let cap: number | null = null;
  if (b.seatCap !== null && b.seatCap !== undefined && b.seatCap !== "") {
    cap = int(b.seatCap, "Seat cap");
    if (cap < 1 || cap > 60) throw bad("Seat cap must be between 1 and 60");
  }
  return { name, pin: pin || null, cap };
}
route("POST", "/teacher/sessions/:id/groups", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  if (num(get("SELECT COUNT(*) AS n FROM groups WHERE session_id=?", num(s.id))!.n) >= 40) throw bad("At most 40 groups per session");
  const f = groupFields(ctx.body || {});
  const id = run("INSERT INTO groups(session_id,name,pin,seat_cap) VALUES(?,?,?,?)", num(s.id), f.name, f.pin, f.cap).id;
  return { id };
});
route("PATCH", "/teacher/sessions/:id/groups/:gid", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const g = ownGroup(s, ctx.params.gid);
  const f = groupFields({ name: g.name, pin: g.pin ?? "", seatCap: g.seat_cap, ...(ctx.body || {}) });
  const members = num(get("SELECT COUNT(*) AS n FROM students WHERE group_id=? AND unassigned=0", num(g.id))!.n);
  if (f.cap !== null && f.cap < members) throw bad(`This group already has ${members} members, so the seat cap cannot be lower.`);
  run("UPDATE groups SET name=?, pin=?, seat_cap=? WHERE id=?", f.name, f.pin, f.cap, num(g.id));
  return { ok: true };
});
route("DELETE", "/teacher/sessions/:id/groups/:gid", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const g = ownGroup(s, ctx.params.gid);
  if (num(get("SELECT COUNT(*) AS n FROM students WHERE group_id=?", num(g.id))!.n) > 0) throw new HttpError(409, "group_has_students", "This group has students in it, or students who were removed from it still have work there, so it cannot be removed.");
  run("DELETE FROM groups WHERE id=?", num(g.id));
  return { ok: true };
});

/* ---------- Students in groups ---------- */
function seatCheck(g: Row, exceptStudentId?: number) {
  if (g.seat_cap === null || g.seat_cap === undefined) return;
  const n = num(get("SELECT COUNT(*) AS n FROM students WHERE group_id=? AND unassigned=0 AND id<>?", num(g.id), exceptStudentId ?? 0)!.n);
  if (n >= num(g.seat_cap)) throw new HttpError(409, "group_full", `${g.name} is full (seat cap ${num(g.seat_cap)}). Raise its seat cap or choose another group.`);
}
const rosterKey = (name: string, cls: string, no: string) => [name, cls, no].map((v) => v.trim().toLowerCase().replace(/\s+/g, " ")).join("|");

/* Adds a student to a group before they join. When they join with the same name, class and class number, they go straight to this group. */
route("POST", "/teacher/sessions/:id/students", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const sid = num(s.id);
  const b = ctx.body || {};
  const name = str(b.name, LIMITS.nameMax, "Name");
  const cls = str(b.class, LIMITS.classMax, "Class");
  const classNo = str(b.classNo, 10, "Class number");
  const g = ownGroup(s, b.groupId);
  const key = rosterKey(name, cls, classNo);
  if (all("SELECT name,class,class_no FROM students WHERE session_id=?", sid).some((r) => rosterKey(String(r.name), String(r.class), String(r.class_no)) === key)) {
    throw new HttpError(409, "student_exists", "A student with this name, class and class number is already in this session. Use Move to change their group.");
  }
  if (num(get("SELECT COUNT(*) AS n FROM students WHERE session_id=?", sid)!.n) >= 400) throw bad("At most 400 students per session.");
  seatCheck(g);
  const id = run("INSERT INTO students(session_id,group_id,name,class,class_no,name_key,last_seen,created_at,placeholder) VALUES(?,?,?,?,?,?,?,?,1)", sid, num(g.id), name, cls, classNo, key, 0, now()).id;
  audit("staff", ctx.auth.staff!.id, "student.add", `session:${sid}:student:${id}`);
  return { id };
});

/* Move a student to another group (groupId), or remove them from their group (groupId: null). Their earlier entries stay with the group they were written in. */
route("PATCH", "/teacher/sessions/:id/students/:studentId", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const sid = num(s.id);
  const st = get("SELECT * FROM students WHERE id=? AND session_id=?", int(ctx.params.studentId, "Student ID"), sid);
  if (!st) throw notFound("Student not found in this session.");
  const studentId = num(st.id);
  const raw = ctx.body?.groupId;
  tx(() => {
    if (raw === null) {
      run("UPDATE students SET unassigned=1 WHERE id=?", studentId);
      run("DELETE FROM presence WHERE student_id=?", studentId);
    } else {
      const g = ownGroup(s, raw);
      if (num(g.id) !== num(st.group_id) || num(st.unassigned)) seatCheck(g, studentId);
      run("UPDATE students SET group_id=?, unassigned=0 WHERE id=?", num(g.id), studentId);
      run("UPDATE presence SET group_id=?, editing_entry_id=NULL WHERE student_id=?", num(g.id), studentId);
    }
  });
  audit("staff", ctx.auth.staff!.id, raw === null ? "student.unassign" : "student.move", `session:${sid}:student:${studentId}`);
  return sessionDetail(ownSession(ctx, sid));
});

/* Only a student who was added by the teacher and has not joined yet can be deleted from the roster. */
route("DELETE", "/teacher/sessions/:id/students/:studentId", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const st = get("SELECT * FROM students WHERE id=? AND session_id=?", int(ctx.params.studentId, "Student ID"), num(s.id));
  if (!st) throw notFound("Student not found in this session.");
  if (!num(st.placeholder)) throw new HttpError(409, "student_joined", "This student has already joined. Use Remove from group instead, so their work is kept.");
  run("DELETE FROM students WHERE id=?", num(st.id));
  revokeStudentTokens(num(st.id));
  return sessionDetail(ownSession(ctx, num(s.id)));
});

/* ---------- Monitoring ---------- */
route("GET", "/teacher/sessions/:id/status", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const sid = num(s.id);
  const groups = all("SELECT * FROM groups WHERE session_id=? ORDER BY id", sid).map((g) => {
    const gid = num(g.id);
    const members = all("SELECT s.id,s.name,s.class,s.class_no,s.placeholder,p.last_beat,p.editing_entry_id FROM students s LEFT JOIN presence p ON p.student_id=s.id WHERE s.group_id=? AND s.unassigned=0 AND s.placeholder=0 ORDER BY s.name", gid).map((m) => ({
      id: num(m.id),
      name: m.name,
      class: m.class,
      classNo: m.class_no,
      online: !!m.last_beat && now() - num(m.last_beat) < ONLINE_WINDOW_MS,
      individualSubmissions: [1, 2, 3].map((part) => ({ part, ...individualSubmissionInfo(num(m.id), part) })),
    }));
    const parts = [1, 2, 3].map((part) => ({
      part,
      submission: submissionInfo(gid, part),
      entryCount: num(get("SELECT COUNT(*) AS n FROM entries WHERE group_id=? AND part=? AND deleted_at IS NULL", gid, part)!.n),
      editing: onlineEditors(gid, part).length,
    }));
    return { id: gid, name: g.name, members, parts };
  });
  const active = groups.filter((g) => g.members.length > 0);
  const summary = [1, 2, 3].map((part) => ({
    part,
    activeGroups: active.length,
    submitted: active.filter((g) => g.parts[part - 1].submission.status === "submitted").length,
    missing: active.filter((g) => g.parts[part - 1].submission.status !== "submitted").map((g) => g.name),
  }));
  const recovery = all("SELECT r.id,r.created_at,s.name,s.class,s.class_no,g.name AS group_name FROM recovery_requests r JOIN students s ON s.id=r.student_id JOIN groups g ON g.id=s.group_id WHERE s.session_id=? AND r.approved_at IS NULL ORDER BY r.id", sid).map((r) => ({ id: num(r.id), name: r.name, class: r.class, classNo: r.class_no, group: r.group_name, createdAt: num(r.created_at) }));
  const overrides = all("SELECT part,reason,at,missing_groups_json FROM part_overrides WHERE session_id=? ORDER BY id DESC", sid).map((o) => ({ part: num(o.part), reason: o.reason, at: num(o.at), missing: JSON.parse(String(o.missing_groups_json)) }));
  const tags = entryTagsFor(sid, 1);
  const designHintCount = designHintsFor(sid).filter(({ tag }) => tags.includes(tag)).length;
  const hints = [1, 2, 3].map((part) => {
    const partTags = entryTagsFor(sid, part);
    return { part, visible: tagHintsVisible(sid, part), count: tagHintsFor(sid, part).filter(({ tag, hint }) => partTags.includes(tag) && hint).length };
  });
  const unassigned = all("SELECT COUNT(*) AS n FROM students WHERE session_id=? AND unassigned=1", sid)[0];
  return { status: s.status, designHintsVisible: designHintsVisible(sid), designHintCount, hints, unassignedCount: num(unassigned.n), parts: partConfig(sid).map((p) => ({ part: p.part, title: PART_TITLES[p.part], visibility: p.visibility })), groups, summary, recovery, overrides };
});

const individualPath = "/teacher/sessions/:id/students/:studentId/parts/:part/submission";
function individualTarget(ctx: Parameters<typeof ownSession>[0]) {
  const s = ownSession(ctx, ctx.params.id);
  const student = get("SELECT id,name,group_id FROM students WHERE id=? AND session_id=?", int(ctx.params.studentId, "Student ID"), num(s.id));
  if (!student) throw notFound("Student not found in this session.");
  return { s, student, studentId: num(student.id), part: partNo(ctx.params.part) };
}
route("GET", individualPath, (ctx) => {
  const { student, studentId, part } = individualTarget(ctx);
  const row = get("SELECT revision,submitted_at,snapshot_json,unlocked_at FROM individual_submissions WHERE student_id=? AND part=? ORDER BY revision DESC LIMIT 1", studentId, part);
  if (!row) throw notFound("This student has not submitted individual work for this part.");
  return { name: student.name, revision: num(row.revision), submittedAt: num(row.submitted_at), entries: JSON.parse(String(row.snapshot_json)), reopened: !!row.unlocked_at };
});
route("POST", individualPath, (ctx) => {
  const { s, studentId, part } = individualTarget(ctx);
  mustBeActive(s);
  const latest = individualSubmissionInfo(studentId, part);
  if (latest.status !== "submitted") throw new HttpError(409, "not_submitted", "There is no locked individual submission for this part.");
  run("UPDATE individual_submissions SET unlocked_at=? WHERE student_id=? AND part=? AND revision=?", now(), studentId, part, latest.revision);
  return { ok: true };
});

route("GET", "/teacher/sessions/:id/entries", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const sid = num(s.id);
  const clauses = ["e.session_id=?"];
  const params: unknown[] = [sid];
  if (ctx.query.get("groupId")) {
    clauses.push("e.group_id=?");
    params.push(num(ownGroup(s, ctx.query.get("groupId")!).id));
  }
  if (ctx.query.get("part")) {
    clauses.push("e.part=?");
    params.push(partNo(ctx.query.get("part")));
  }
  const shared = new Map(all("SELECT id,entry_id FROM shares WHERE session_id=?", sid).map((r) => [num(r.entry_id), num(r.id)]));
  const groups = new Map(all("SELECT id,name FROM groups WHERE session_id=?", sid).map((g) => [num(g.id), String(g.name)]));
  return {
    entries: entriesWhere(clauses.join(" AND "), ...params).map((e) => ({ ...e, groupName: groups.get(e.groupId), shared: shared.has(e.id), shareId: shared.get(e.id) ?? null })),
  };
});

route("POST", "/teacher/sessions/:id/unlock-submission", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const g = ownGroup(s, ctx.body?.groupId);
  const part = partNo(ctx.body?.part);
  const info = submissionInfo(num(g.id), part);
  if (info.status !== "submitted") throw new HttpError(409, "not_submitted", "That group has no locked submission for this part.");
  const reopened = tx(() => {
    run("UPDATE part_submissions SET unlocked_at=?, unlocked_by=? WHERE group_id=? AND part=? AND revision=?", now(), ctx.auth.staff!.id, num(g.id), part, info.revision);
    return ctx.body?.includeIndividual === false ? 0 : reopenIndividual("s.group_id=? AND s.unassigned=0", part, num(g.id));
  });
  audit("staff", ctx.auth.staff!.id, "submission.unlock", `group:${num(g.id)}:part:${part}`);
  return { ok: true, individualReopened: reopened };
});

/** Reopens the latest locked individual submission of each matching student for one part. */
function reopenIndividual(where: string, part: number, ...params: unknown[]) {
  let n = 0;
  for (const st of all(`SELECT s.id FROM students s WHERE ${where}`, ...params)) {
    const latest = individualSubmissionInfo(num(st.id), part);
    if (latest.status !== "submitted") continue;
    run("UPDATE individual_submissions SET unlocked_at=? WHERE student_id=? AND part=? AND revision=?", now(), num(st.id), part, latest.revision);
    n++;
  }
  return n;
}

/* Unlock every locked group and individual submission for one part so students can revise and resubmit. */
route("POST", "/teacher/sessions/:id/parts/:n/unlock-all", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const sid = num(s.id);
  const part = partNo(ctx.params.n);
  const result = tx(() => {
    let groups = 0;
    for (const g of all("SELECT id FROM groups WHERE session_id=?", sid)) {
      const info = submissionInfo(num(g.id), part);
      if (info.status !== "submitted") continue;
      run("UPDATE part_submissions SET unlocked_at=?, unlocked_by=? WHERE group_id=? AND part=? AND revision=?", now(), ctx.auth.staff!.id, num(g.id), part, info.revision);
      groups++;
    }
    return { groups, individual: reopenIndividual("s.session_id=?", part, sid) };
  });
  audit("staff", ctx.auth.staff!.id, "submission.unlock_all", `session:${sid}:part:${part}`);
  return result;
});

route("POST", "/teacher/sessions/:id/recovery/:rid/approve", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const r = get("SELECT r.id FROM recovery_requests r JOIN students st ON st.id=r.student_id WHERE r.id=? AND st.session_id=?", Number(ctx.params.rid), num(s.id));
  if (!r) throw notFound();
  run("UPDATE recovery_requests SET approved_at=? WHERE id=?", now(), num(r.id));
  return { ok: true };
});

/* ---------- Sharing with the class ---------- */
route("GET", "/teacher/sessions/:id/shares", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const sid = num(s.id);
  const promptsByPart = stageCritiquePrompts(s);
  const rows = all("SELECT * FROM shares WHERE session_id=? ORDER BY seq", sid).map((sh) => {
    const e = entriesWhere("e.id=?", num(sh.entry_id))[0];
    if (!e) return null;
    const group = String(get("SELECT name FROM groups WHERE id=?", e.groupId)!.name);
    const critiques = all("SELECT * FROM critiques WHERE share_id=? ORDER BY id", num(sh.id)).map((c) => {
      const st = get("SELECT name,class,class_no FROM students WHERE id=?", num(c.student_id))!;
      return { id: num(c.id), promptLabel: promptsByPart[e.part]?.find((p) => p.key === c.prompt_key)?.label || String(c.prompt_key), body: c.body, hidden: !!num(c.hidden), author: `${st.name} (${st.class}/${st.class_no})` };
    });
    return { shareId: num(sh.id), seq: num(sh.seq), publishedAt: num(sh.published_at), entry: e, groupName: group, publicLabel: num(s.anonymise_sharing) ? `Sample Response #${num(sh.seq)}` : group, critiques, reactions: reactionsFor(num(sh.id)) };
  });
  return { shares: rows.filter(Boolean), anonymised: !!num(s.anonymise_sharing) };
});

route("POST", "/teacher/sessions/:id/shares", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  mustBeActive(s);
  const ids = ctx.body?.entryIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw bad("Choose between 1 and 100 entries to share");
  const sid = num(s.id);
  return tx(() => {
    let added = 0;
    for (const raw of ids) {
      const eid = int(raw, "entry id");
      // Only ORIGINAL student entries from THIS session can be shared.
      const e = get("SELECT id FROM entries WHERE id=? AND session_id=? AND deleted_at IS NULL", eid, sid);
      if (!e) throw notFound(`Entry ${eid} not found in this session`);
      if (get("SELECT 1 FROM shares WHERE session_id=? AND entry_id=?", sid, eid)) continue;
      const seq = num(get("SELECT COALESCE(MAX(seq),0)+1 AS n FROM shares WHERE session_id=?", sid)!.n);
      run("INSERT INTO shares(session_id,entry_id,seq,published_at) VALUES(?,?,?,?)", sid, eid, seq, now());
      added++;
    }
    audit("staff", ctx.auth.staff!.id, "share.publish", `session:${sid}:n=${added}`);
    return { added };
  });
});

route("DELETE", "/teacher/sessions/:id/shares/:shareId", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const r = run("DELETE FROM shares WHERE id=? AND session_id=?", Number(ctx.params.shareId), num(s.id));
  if (!r.changes) throw notFound();
  return { ok: true };
});

route("POST", "/teacher/sessions/:id/critiques/:cid/hide", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const c = get("SELECT c.id FROM critiques c JOIN shares sh ON sh.id=c.share_id WHERE c.id=? AND sh.session_id=?", Number(ctx.params.cid), num(s.id));
  if (!c) throw notFound();
  run("UPDATE critiques SET hidden=? WHERE id=?", ctx.body?.hidden === false ? 0 : 1, num(c.id));
  return { ok: true };
});

/* Projector view: exactly what is published, nothing else. */
route("GET", "/teacher/sessions/:id/projector", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  return { title: s.title, anonymised: !!num(s.anonymise_sharing), shares: publishedShares(s), ai: publishedAi(num(s.id)) };
});

/* ---------- Export ---------- */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula-injection guard
  return `"${s.replace(/"/g, '""')}"`;
};
const csv = (head: string[], rows: unknown[][]) => [head.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");

route("GET", "/teacher/sessions/:id/export", (ctx) => {
  const s = ownSession(ctx, ctx.params.id);
  const sid = num(s.id);
  const fmt = ctx.query.get("format") === "csv" ? "csv" : "json";
  const kind = ctx.query.get("kind") === "ai" ? "ai" : "entries";
  const parts = partConfig(sid);
  const groups = new Map(all("SELECT id,name FROM groups WHERE session_id=?", sid).map((g) => [num(g.id), String(g.name)]));
  const sharedIds = new Set(all("SELECT entry_id FROM shares WHERE session_id=?", sid).map((r) => num(r.entry_id)));
  const entries = entriesWhere("e.session_id=?", sid).map((e) => {
    const sub = submissionInfo(e.groupId, e.part);
    return {
      entryId: e.id,
      stage: PART_TITLES[e.part],
      part: e.part,
      group: groups.get(e.groupId) || "",
      studentName: e.author.name,
      studentClass: e.author.class,
      studentClassNo: e.author.classNo,
      tag: e.tag || "",
      text: e.body,
      table: e.table,
      hasImage: e.hasImage,
      groupSubmissionStatus: sub.status,
      sharedWithClass: sharedIds.has(e.id),
      createdAt: new Date(e.createdAt).toISOString(),
      updatedAt: new Date(e.updatedAt).toISOString(),
    };
  });
  const ai = all("SELECT * FROM ai_outputs WHERE session_id=? ORDER BY id", sid).map((o) => ({
    id: num(o.id),
    kind: o.kind,
    part: num(o.part),
    group: o.group_id ? groups.get(num(o.group_id)) || "" : "",
    status: o.status,
    provider: o.provider,
    criteria: o.criteria,
    citedEntryIds: JSON.parse(String(o.cited_ids_json)),
    content: JSON.parse(String(o.content_json)),
    createdAt: new Date(num(o.created_at)).toISOString(),
  }));
  const fname = `${String(s.title).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}_${kind}`;
  let payload: string;
  let type: string;
  if (fmt === "json") {
    payload = JSON.stringify(
      { session: { id: sid, title: s.title, exportedAt: new Date().toISOString() }, stages: parts.map((p) => ({ part: p.part, label: PART_TITLES[p.part], instructions: p.instructions, instructionBlocks: p.instructionBlocks, webLink: p.webLink, guidingQuestions: p.questions.map((q) => q.text), entryTags: p.entryTags, critiquePrompts: p.critiquePrompts })), entries, aiOutputs: ai },
      null,
      2
    );
    type = "application/json";
  } else if (kind === "entries") {
    const q = (n: number) => parts[n - 1].questions.map((x) => x.text).join(" | ");
    payload = csv(
      ["entry_id", "stage", "group", "student_name", "class", "class_no", "tag", "text", "data_table", "has_image", "group_submission_status", "shared_with_class", "guiding_questions_for_stage", "created_at", "updated_at"],
      entries.map((e) => [e.entryId, e.stage, e.group, e.studentName, e.studentClass, e.studentClassNo, e.tag, e.text, e.table ? JSON.stringify(e.table) : "", e.hasImage ? "yes" : "no", e.groupSubmissionStatus, e.sharedWithClass ? "yes" : "no", q(e.part), e.createdAt, e.updatedAt])
    );
    type = "text/csv; charset=utf-8";
  } else {
    payload = csv(
      ["id", "kind", "stage", "group", "status", "provider", "criteria", "cited_entry_ids", "content", "created_at"],
      ai.map((o) => [o.id, o.kind, PART_TITLES[o.part], o.group, o.status, o.provider, o.criteria, o.citedEntryIds.join(" "), JSON.stringify(o.content), o.createdAt])
    );
    type = "text/csv; charset=utf-8";
  }
  audit("staff", ctx.auth.staff!.id, "export", `session:${sid}:${fmt}:${kind}`);
  return new Response("﻿" + payload, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${fname}.${fmt}"` } });
});

void LIMITS;
