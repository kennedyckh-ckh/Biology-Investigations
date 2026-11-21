import { route, bad, forbidden, notFound, str, int, safeLink, HttpError } from "../router";
import { all, get, run, tx, now, num, audit } from "../db";
import { requireEducator } from "../authz";
import { hashPassword } from "../auth";
import { isDemoPassword } from "../seed";
import { deleteDesignSession, ensureDesignSession, partConfig, setQuestions } from "../sessions";
import { LIMITS } from "../constants";

function ownTemplate(ctx: Parameters<typeof requireEducator>[0], rawId: string | number) {
  const u = requireEducator(ctx);
  const t = get("SELECT * FROM templates WHERE id=? AND educator_id=?", Number(rawId), u.id);
  if (!t) throw notFound("Template not found");
  return t;
}

function templateDetail(t: Record<string, unknown>) {
  const id = num(t.id);
  const designSessionId = ensureDesignSession(id);
  return {
    id,
    title: t.title,
    pedagogyNotes: t.pedagogy_notes,
    aiCriteria: t.ai_criteria,
    version: num(t.version),
    updatedAt: num(t.updated_at),
    // Parts, tasks, files and stage settings live in the template's design session (edited with the teacher Setup editor).
    designSessionId,
    parts: partConfig(designSessionId).map((p) => ({ part: p.part, instructions: p.instructions, webLink: p.webLink, questions: p.questions.map((q) => q.text), taskCount: p.instructionBlocks.length })),
    assignments: all("SELECT a.id,a.teacher_id,a.note,a.ref_links_json,a.assigned_at,u.name,u.email FROM template_assignments a JOIN users u ON u.id=a.teacher_id WHERE a.template_id=? ORDER BY u.name", id).map((a) => ({
      id: num(a.id),
      teacherId: num(a.teacher_id),
      teacher: a.name,
      email: a.email,
      note: a.note,
      refLinks: JSON.parse(String(a.ref_links_json)),
      assignedAt: num(a.assigned_at),
    })),
  };
}

route("GET", "/educator/teachers", (ctx) => {
  const u = requireEducator(ctx);
  return { teachers: all("SELECT u.id,u.name,u.email FROM educator_teacher et JOIN users u ON u.id=et.teacher_id WHERE et.educator_id=? ORDER BY u.name", u.id).map((t) => ({ id: num(t.id), name: t.name, email: t.email })) };
});

route("POST", "/educator/teachers", (ctx) => {
  const educator = requireEducator(ctx);
  const name = str(ctx.body?.name, 100, "Teacher name");
  const email = str(ctx.body?.email, 200, "Teacher email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Enter a valid email address.");
  const password = str(ctx.body?.password, 200, "Initial password", { min: 16 });
  if (isDemoPassword(password)) throw bad("Choose a private password, not a demo password.");
  return tx(() => {
    if (get("SELECT 1 FROM users WHERE email=?", email)) {
      throw new HttpError(409, "email_in_use", "An account already uses that email address.");
    }
    const id = run("INSERT INTO users(role,name,email,password_hash,created_at) VALUES('teacher',?,?,?,?)", name, email, hashPassword(password), now()).id;
    run("INSERT INTO educator_teacher(educator_id,teacher_id) VALUES(?,?)", educator.id, id);
    audit("staff", educator.id, "teacher.create", `teacher:${id}`);
    return { id, name, email };
  });
});

route("GET", "/educator/templates", (ctx) => {
  const u = requireEducator(ctx);
  return {
    templates: all("SELECT t.*, (SELECT COUNT(*) FROM template_assignments a WHERE a.template_id=t.id) AS n FROM templates t WHERE t.educator_id=? ORDER BY t.updated_at DESC", u.id).map((t) => ({
      id: num(t.id),
      title: t.title,
      version: num(t.version),
      updatedAt: num(t.updated_at),
      assignedTo: num(t.n),
    })),
  };
});

route("POST", "/educator/templates", (ctx) => {
  const u = requireEducator(ctx);
  const title = str(ctx.body?.title, 150, "Template title");
  const id = tx(() => {
    const tid = run("INSERT INTO templates(educator_id,title,created_at,updated_at) VALUES(?,?,?,?)", u.id, title, now(), now()).id;
    for (const p of [1, 2, 3]) run("INSERT INTO template_parts(template_id,part) VALUES(?,?)", tid, p);
    return tid;
  });
  ensureDesignSession(id);
  return { id };
});

route("GET", "/educator/templates/:id", (ctx) => templateDetail(ownTemplate(ctx, ctx.params.id)));

route("PUT", "/educator/templates/:id", (ctx) => {
  const t = ownTemplate(ctx, ctx.params.id);
  const b = ctx.body || {};
  const title = str(b.title, 150, "Template title");
  const notes = str(b.pedagogyNotes, 6000, "Pedagogical notes", { optional: true });
  const criteria = str(b.aiCriteria, 2000, "AI analysis criteria", { optional: true });
  // Parts are optional here: the template page edits them through the shared Setup editor.
  // Older clients may still send the overview, link and part-wide questions for each part.
  const parts = b.parts === undefined ? [] : b.parts;
  if (!Array.isArray(parts) || (parts.length && parts.length !== 3)) throw bad("Provide all three parts");
  const tid = num(t.id);
  const sid = ensureDesignSession(tid);
  const updates = (parts as { part: number; instructions?: string; webLink?: string; questions?: unknown[] }[]).map((p) => {
    const part = int(p.part, "part");
    if (part < 1 || part > 3) throw bad("Invalid part");
    const qs = (Array.isArray(p.questions) ? p.questions : []).map((q) => str(q, LIMITS.guidingQuestionMax, "Guiding question", { optional: true })).filter(Boolean).slice(0, 20);
    return { part, instructions: str(p.instructions, LIMITS.instructionTextMax, "Instructions", { optional: true }), link: safeLink(p.webLink), qs };
  });
  tx(() => {
    run("UPDATE templates SET title=?, pedagogy_notes=?, ai_criteria=?, version=version+1, updated_at=? WHERE id=?", title, notes, criteria, now(), tid);
    run("UPDATE sessions SET title=?, ai_criteria=? WHERE id=?", title, criteria, sid);
    for (const u of updates) {
      run("UPDATE session_parts SET instructions=?, web_link=? WHERE session_id=? AND part=?", u.instructions, u.link, sid, u.part);
      setQuestions(sid, u.part, u.qs);
    }
  });
  audit("staff", ctx.auth.staff!.id, "template.update", `template:${tid}`);
  return templateDetail(ownTemplate(ctx, tid));
});

route("DELETE", "/educator/templates/:id", (ctx) => {
  const t = ownTemplate(ctx, ctx.params.id);
  run("DELETE FROM templates WHERE id=?", num(t.id));
  if (t.design_session_id != null) deleteDesignSession(num(t.design_session_id));
  return { ok: true };
});

/* Educators can only share with teachers they have been assigned to support. */
route("POST", "/educator/templates/:id/assign", (ctx) => {
  const u = requireEducator(ctx);
  const t = ownTemplate(ctx, ctx.params.id);
  const b = ctx.body || {};
  if (!Array.isArray(b.teacherIds) || !b.teacherIds.length) throw bad("Choose at least one teacher");
  const note = str(b.note, 1000, "Note", { optional: true });
  const links = (Array.isArray(b.refLinks) ? b.refLinks : []).slice(0, 10).map((l: { label?: string; url?: string }) => ({ label: str(l.label, 120, "Link label", { optional: true }) || safeLink(l.url), url: safeLink(l.url) })).filter((l: { url: string }) => l.url);
  tx(() => {
    for (const raw of b.teacherIds) {
      const teacherId = int(raw, "teacherId");
      if (!get("SELECT 1 FROM educator_teacher WHERE educator_id=? AND teacher_id=?", u.id, teacherId)) throw forbidden("You can only assign templates to teachers you support.", "not_your_teacher");
      run("INSERT INTO template_assignments(template_id,teacher_id,note,ref_links_json,assigned_at) VALUES(?,?,?,?,?) ON CONFLICT(template_id,teacher_id) DO UPDATE SET note=excluded.note, ref_links_json=excluded.ref_links_json, assigned_at=excluded.assigned_at", num(t.id), teacherId, note, JSON.stringify(links), now());
    }
  });
  audit("staff", u.id, "template.assign", `template:${num(t.id)}`);
  return templateDetail(ownTemplate(ctx, num(t.id)));
});

route("DELETE", "/educator/templates/:id/assign/:teacherId", (ctx) => {
  const t = ownTemplate(ctx, ctx.params.id);
  run("DELETE FROM template_assignments WHERE template_id=? AND teacher_id=?", num(t.id), Number(ctx.params.teacherId));
  return { ok: true };
});
