// End-to-end permission & workflow tests against a RUNNING server (fresh database recommended).
// Usage: BASE=http://localhost:3100 node scripts/test-api.mjs
const BASE = process.env.BASE || "http://localhost:3100";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let pass = 0;
const fails = [];
const section = (s) => console.log(`\n== ${s}`);
function check(label, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fails.push(label);
    console.log(`  FAIL ${label} ${extra}`);
  }
}
const eq = (label, a, b) => check(label, a === b, `(got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

function actor(name) {
  return { name, cookies: {} };
}
async function api(who, method, path, body, opts = {}) {
  const headers = { Cookie: Object.entries(who.cookies).map(([k, v]) => `${k}=${v}`).join("; ") };
  if (method !== "GET") headers["Content-Type"] = opts.contentType || "application/json";
  const res = await fetch(BASE + "/api" + path, {
    method,
    headers,
    body: method === "GET" ? undefined : opts.rawBody ?? JSON.stringify(body ?? {}),
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    const k = kv.slice(0, i);
    const v = decodeURIComponent(kv.slice(i + 1));
    if (/Max-Age=0/i.test(c) || v === "") delete who.cookies[k];
    else who.cookies[k] = v;
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

const login = async (who, email, password) => api(who, "POST", "/auth/login", { email, password });

async function main() {
  const t1 = actor("teacher1"), t2 = actor("teacher2"), t3 = actor("teacher3"), ed = actor("educator");
  const anon = actor("anon");
  const demoEducator = (await api(anon, "GET", "/auth/demo-accounts")).json?.accounts?.find((a) => a.role === "educator");

  section("Authentication & RBAC");
  eq("wrong password -> 401", (await login(actor("x"), "teacher1@school.test", "nope")).status, 401);
  eq("teacher1 login", (await login(t1, "teacher1@school.test", "Teacher1!demo")).status, 200);
  eq("teacher2 login", (await login(t2, "teacher2@school.test", "Teacher2!demo")).status, 200);
  eq("teacher3 login", (await login(t3, "teacher3@school.test", "Teacher3!demo")).status, 200);
  eq("educator login", (await login(ed, demoEducator?.email ?? "educator@school.test", demoEducator?.password ?? "Educator1!demo")).status, 200);
  eq("unauthenticated teacher route -> 401", (await api(anon, "GET", "/teacher/sessions")).status, 401);
  eq("unauthenticated educator route -> 401", (await api(anon, "GET", "/educator/templates")).status, 401);
  eq("educator cannot list teacher sessions", (await api(ed, "GET", "/teacher/sessions")).status, 403);
  eq("educator cannot create a session", (await api(ed, "POST", "/teacher/sessions", { title: "x" })).status, 403);
  eq("teacher cannot open educator templates", (await api(t1, "GET", "/educator/templates")).status, 403);
  eq("non-JSON mutation rejected (CSRF guard)", (await api(anon, "POST", "/auth/login", null, { contentType: "text/plain", rawBody: "a=b" })).status, 415);
  eq("API usage requires staff authentication", (await api(anon, "GET", "/teacher/api-usage")).status, 401);
  eq("teacher cannot use educator API usage route", (await api(t1, "GET", "/educator/api-usage")).status, 403);
  const teacherUsage = await api(t1, "GET", "/teacher/api-usage");
  const educatorUsage = await api(ed, "GET", "/educator/api-usage");
  check("both staff roles can see shared API caps", teacherUsage.status === 200 && educatorUsage.status === 200 && teacherUsage.json.daily.limit === educatorUsage.json.daily.limit);
  check("teacher usage is scoped to the teacher and educator totals are aggregate", teacherUsage.json.own?.requests === 0 && educatorUsage.json.own === null && !("apiKey" in educatorUsage.json));

  section("Teacher Educator templates & assignment");
  const tpls = (await api(ed, "GET", "/educator/templates")).json.templates;
  check("educator sees the sample template", tpls.length >= 1);
  const tplId = tpls[0].id;
  const tplBefore = (await api(ed, "GET", `/educator/templates/${tplId}`)).json;
  const teachers = (await api(ed, "GET", "/educator/teachers")).json.teachers;
  eq("educator supports 2 teachers", teachers.length, 2);
  const t3id = (await api(t3, "GET", "/auth/me")).json.staff.id;
  eq("educator cannot assign to an unsupported teacher", (await api(ed, "POST", `/educator/templates/${tplId}/assign`, { teacherIds: [t3id] })).status, 403);
  const newTpl = (await api(ed, "POST", "/educator/templates", { title: "Test template" })).json.id;
  check("educator creates template", !!newTpl);
  eq("educator edits template", (await api(ed, "PUT", `/educator/templates/${newTpl}`, { title: "Test template", pedagogyNotes: "n", aiCriteria: "c", parts: [1, 2, 3].map((p) => ({ part: p, instructions: `Inst ${p}`, webLink: "https://example.org", questions: [`Q${p}a`] })) })).status, 200);
  eq("unsafe link rejected", (await api(ed, "PUT", `/educator/templates/${newTpl}`, { title: "T", parts: [1, 2, 3].map((p) => ({ part: p, instructions: "", webLink: "javascript:alert(1)", questions: [] })) })).status, 400);
  const t1id = teachers.find((t) => t.email === "teacher1@school.test").id;
  eq("educator assigns to teacher1", (await api(ed, "POST", `/educator/templates/${newTpl}/assign`, { teacherIds: [t1id], note: "hi", refLinks: [{ label: "Ref", url: "https://example.org/r" }] })).status, 200);
  const t1assigned = (await api(t1, "GET", "/teacher/assigned-templates")).json.templates;
  check("teacher1 sees assigned templates (incl. new one)", t1assigned.some((a) => a.title === "Test template"));
  eq("teacher3 has no assigned templates", (await api(t3, "GET", "/teacher/assigned-templates")).json.templates.length, 0);
  const asg = t1assigned.find((a) => a.templateId === tplId);
  eq("teacher3 cannot import teacher1's assignment", (await api(t3, "POST", "/teacher/sessions", { title: "steal", assignmentId: asg.assignmentId })).status, 403);
  const newTeacher = { name: "New test teacher", email: `new-teacher-${Date.now()}@example.test`, password: "Unique-test-staff-password-54" };
  eq("classroom teachers cannot create staff accounts", (await api(t1, "POST", "/educator/teachers", newTeacher)).status, 403);
  eq("educator cannot create account with short password", (await api(ed, "POST", "/educator/teachers", { ...newTeacher, password: "short" })).status, 400);
  const createdTeacher = await api(ed, "POST", "/educator/teachers", newTeacher);
  eq("educator creates a teacher", createdTeacher.status, 200);
  check("new teacher is linked without exposing their password", !("password" in createdTeacher.json) && (await api(ed, "GET", "/educator/teachers")).json.teachers.some((t) => t.id === createdTeacher.json.id));
  eq("duplicate teacher account is rejected", (await api(ed, "POST", "/educator/teachers", newTeacher)).status, 409);
  const tNew = actor("new-teacher");
  eq("new teacher can sign in", (await login(tNew, newTeacher.email, newTeacher.password)).json?.user?.role, "teacher");

  section("Sessions: import as copy, ownership");
  const sid = (await api(t1, "POST", "/teacher/sessions", { title: "Period 3 Investigation", assignmentId: asg.assignmentId })).json.id;
  check("teacher1 creates session from template", !!sid);
  let S = (await api(t1, "GET", `/teacher/sessions/${sid}`)).json;
  eq("template instructions copied to session", S.parts[0].instructions, tplBefore.parts[0].instructions);
  eq("guiding questions copied", S.parts[0].questions.length, tplBefore.parts[0].questions.length);
  eq("Part 1 open, Part 2 locked by default", [S.parts[0].visibility, S.parts[1].visibility, S.parts[2].visibility].join(","), "open,visible,visible");
  await api(t1, "PUT", `/teacher/sessions/${sid}/parts/1`, { instructions: "CUSTOMISED by teacher", webLink: "https://example.org/p1", questions: ["Custom Q1", "Custom Q2"] });
  const tplAfter = (await api(ed, "GET", `/educator/templates/${tplId}`)).json;
  eq("master template NOT altered by teacher edits", tplAfter.parts[0].instructions, tplBefore.parts[0].instructions);
  eq("master template version unchanged", tplAfter.version, tplBefore.version);
  eq("teacher2 cannot read teacher1's session", (await api(t2, "GET", `/teacher/sessions/${sid}`)).status, 404);
  eq("teacher2 cannot read its status", (await api(t2, "GET", `/teacher/sessions/${sid}/status`)).status, 404);
  eq("educator cannot read a live session", (await api(ed, "GET", `/teacher/sessions/${sid}`)).status, 403);
  eq("educator cannot unlock submissions", (await api(ed, "POST", `/teacher/sessions/${sid}/unlock-submission`, { groupId: 1, part: 1 })).status, 403);
  eq("educator cannot view student entries", (await api(ed, "GET", `/teacher/sessions/${sid}/entries`)).status, 403);

  section("Groups: PIN and seat cap");
  const gA = S.groups[0].id, gB = S.groups[1].id;
  const gC = (await api(t1, "POST", `/teacher/sessions/${sid}/groups`, { name: "Group C", pin: "abc12", seatCap: 1 })).json.id;
  check("teacher creates PIN+cap group", !!gC);
  eq("bad PIN format rejected", (await api(t1, "POST", `/teacher/sessions/${sid}/groups`, { name: "Z", pin: "!!" })).status, 400);
  const code = S.joinCode;
  eq("unknown join code -> 404", (await api(anon, "GET", "/join/ZZZZZZ")).status, 404);
  const lookup = (await api(anon, "GET", `/join/${code}`)).json;
  check("join lookup hides PIN value", !JSON.stringify(lookup).includes("abc12"));
  eq("join lookup reports PIN needed", lookup.groups.find((g) => g.id === gC).hasPin, true);

  const s1 = actor("alice"), s2 = actor("bob"), s3 = actor("cara"), s4 = actor("dan"), s5 = actor("eve");
  const join = (who, name, no, groupId, pin, resume) => api(who, "POST", "/student/join", { code, name, class: "8A", classNo: no, groupId, pin, resume });
  eq("student joins group A", (await join(s1, "Alice Lee", "1", gA)).status, 200);
  eq("second student joins group A", (await join(s2, "Bob Tam", "2", gA)).status, 200);
  eq("student joins group B", (await join(s3, "Cara Ng", "3", gB)).status, 200);
  const sessionBase = `/teacher/sessions/${sid}`;
  section("Ordered instruction blocks");
  const partEdit = { instructions: "CUSTOMISED by teacher", webLink: "https://example.org/p1", questions: ["Custom Q1", "Custom Q2"] };
  const blocks = [
    { title: "Predict", text: "Record a prediction.", webLink: "https://example.org/predict", questions: ["What do you predict?", "Why?"] },
    { title: "", text: "Explain your reasoning.", webLink: "https://example.org/explain", questions: ["What evidence supports your reasoning?"] },
  ];
  const taskContent = (items) => items.map(({ title, text, webLink, questions }) => ({ title, text, webLink, questions }));
  eq("existing part starts with no task blocks", (await api(t1, "GET", sessionBase)).json.parts[0].instructionBlocks.length, 0);
  eq("another teacher cannot add blocks", (await api(t2, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: blocks })).status, 404);
  eq("teacher saves ordered task blocks", (await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: blocks })).status, 200);
  eq("teacher cannot save a blank block", (await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: [{ title: "Empty", text: " " }] })).status, 400);
  eq("too many blocks rejected", (await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: Array(13).fill(blocks[0]) })).status, 400);
  eq("an older client can save instructions without removing the blocks", (await api(t1, "PUT", `${sessionBase}/parts/1`, partEdit)).status, 200);
  const oldTasks = blocks.map(({ title, text, webLink }) => ({ title, text, webLink }));
  eq("an older task editor cannot erase guiding questions by omitting them", (await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: oldTasks })).json.parts[0].instructionBlocks[0].questions.join("|"), blocks[0].questions.join("|"));
  const putQuestions = (questions) => api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: [{ ...blocks[0], questions }, blocks[1]] });
  eq("task question field must be a list", (await putQuestions("not a list")).status, 400);
  eq("task question item must be text", (await putQuestions([42])).status, 400);
  eq("task question length is limited", (await putQuestions(["q".repeat(501)])).status, 400);
  eq("task question count is limited", (await putQuestions(Array(21).fill("Question?"))).status, 400);
  const cleared = (await putQuestions([])).json.parts[0].instructionBlocks;
  check("clearing one task's questions leaves the other task untouched", cleared[0].questions.length === 0 && cleared[1].questions[0] === blocks[1].questions[0]);
  eq("task question text is trimmed and empty entries ignored", (await putQuestions(["  ", " What do you predict? ", "Why?"])).json.parts[0].instructionBlocks[0].questions.join("|"), blocks[0].questions.join("|"));
  eq("teacher can prepare blocks for a locked part", (await api(t1, "PUT", `${sessionBase}/parts/2`, { ...partEdit, instructionBlocks: blocks })).status, 200);
  const tasksState = (await api(s1, "GET", "/student/state")).json;
  eq("students receive ordered blocks with their own links and questions", JSON.stringify(taskContent(tasksState.parts[0].instructionBlocks)), JSON.stringify(blocks));
  eq("part-wide questions remain separate from task questions", tasksState.parts[0].questions[0].text, "Custom Q1");
  eq("students still receive the existing overview", tasksState.parts[0].instructions, partEdit.instructions);
  check("locked parts do not expose task blocks", !("instructionBlocks" in tasksState.parts[1]));
  const upload = async (who, part, text, name = "Class guide.pdf", taskId) => fetch(`${BASE}/api${sessionBase}/parts/${part}${taskId ? `/tasks/${taskId}` : ""}/attachment`, {
    method: "PUT",
    headers: { Cookie: Object.entries(who.cookies).map(([k, v]) => `${k}=${v}`).join("; "), "Content-Type": "application/octet-stream", "X-Instruction-Filename": encodeURIComponent(name) },
    body: text,
  });
  section("Task instruction attachments");
  eq("other teacher cannot upload a task file", (await upload(t2, 1, "not allowed")).status, 404);
  eq("student cannot upload a task file", (await upload(s1, 1, "not allowed")).status, 401);
  eq("teacher attaches one file to Part 1", (await upload(t1, 1, "Class guide")).status, 200);
  eq("teacher can attach a file before a part opens", (await upload(t1, 2, "Private until open")).status, 200);
  eq("student cannot download an attachment in a locked part", (await api(s1, "GET", "/student/parts/2/attachment")).status, 403);
  const stateWithAttachment = (await api(s1, "GET", "/student/state")).json;
  eq("student sees the attachment name for an open part", stateWithAttachment.parts[0].attachment.name, "Class guide.pdf");
  check("student cannot see locked attachment metadata", !stateWithAttachment.parts[1].attachment);
  const attachment = await api(s1, "GET", "/student/parts/1/attachment");
  eq("student downloads exact attachment contents", attachment.text, "Class guide");
  check("file is forced to download", attachment.headers.get("content-disposition")?.startsWith("attachment;"));
  eq("non-image preview request is rejected", (await api(s1, "GET", "/student/parts/1/attachment?preview=1")).status, 415);
  eq("invalid replacement leaves original file in place", (await upload(t1, 1, "")).status, 400);
  eq("original still downloads", (await api(s1, "GET", "/student/parts/1/attachment")).text, "Class guide");
  eq("new upload replaces the single attachment", (await upload(t1, 1, "New version", "Revised guide.txt")).status, 200);
  eq("student downloads replacement", (await api(s1, "GET", "/student/parts/1/attachment")).text, "New version");
  const pngBytes = Buffer.from(PNG.split(",")[1], "base64");
  const savedTasks = tasksState.parts[0].instructionBlocks;
  const taskIds = savedTasks.map(({ id }) => id);
  const lockedId = (await api(t1, "GET", sessionBase)).json.parts[1].instructionBlocks[0].id;
  const preview = `${sessionBase}/student-view`;
  const taskPath = (part, id) => `/parts/${part}/tasks/${id}/attachment`;
  eq("reject an invalid task URL", (await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: [{ ...savedTasks[0], webLink: "not a web address" }] })).status, 400);
  eq("reject duplicate task IDs", (await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: [savedTasks[0], savedTasks[0]] })).status, 400);
  eq("teacher uploads an image to the first task", (await upload(t1, 1, pngBytes, "First diagram.png", taskIds[0])).status, 200);
  eq("teacher uploads a separate image to the second task", (await upload(t1, 1, pngBytes, "Second diagram.png", taskIds[1])).status, 200);
  eq("teacher attaches an image to a locked task", (await upload(t1, 2, pngBytes, "Later diagram.png", lockedId)).status, 200);
  eq("other teachers cannot upload to a task", (await upload(t2, 1, pngBytes, "Other diagram.png", taskIds[0])).status, 404);
  eq("a task requires a real image signature", (await upload(t1, 1, "Plain text", "Not a diagram.png", taskIds[0])).status, 415);
  eq("students cannot read a locked task diagram", (await api(s1, "GET", `/student${taskPath(2, lockedId)}`)).status, 403);
  eq("the teacher preview also blocks locked task diagrams", (await api(t1, "GET", `${preview}${taskPath(2, lockedId)}`)).status, 403);
  eq("anonymous visitors cannot use teacher preview", (await api(anon, "GET", preview)).status, 401);
  eq("another teacher cannot use a session's student preview", (await api(t2, "GET", preview)).status, 404);
  eq("teacher can read but not edit via preview endpoint", (await api(t1, "PUT", preview, {})).status, 405);
  eq("owner preview streams open task diagrams", (await api(t1, "GET", `${preview}${taskPath(1, taskIds[0])}`)).headers.get("content-type"), "image/png");
  const studentPreview = (await api(t1, "GET", preview)).json;
  eq("teacher's Student view shows the same task questions", JSON.stringify(studentPreview.parts[0].instructionBlocks[0].questions), JSON.stringify(blocks[0].questions));
  check("preview includes open task content and strips locked tasks and private group state", studentPreview.parts[0].instructionBlocks[0].attachment.name === "First diagram.png" && studentPreview.parts[1].locked && !studentPreview.parts[1].instructionBlocks && !studentPreview.group);
  await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: savedTasks.slice().reverse() });
  const reordered = (await api(s1, "GET", "/student/state")).json.parts[0].instructionBlocks;
  check("task diagrams and links follow their block when reordered", reordered[0].id === taskIds[1] && reordered[0].attachment.name === "Second diagram.png"
    && reordered[0].webLink === blocks[1].webLink && reordered[1].attachment.name === "First diagram.png" && reordered[1].webLink === blocks[0].webLink);
  check("questions follow their tasks and keep question order", reordered[0].questions[0] === blocks[1].questions[0] && JSON.stringify(reordered[1].questions) === JSON.stringify(blocks[0].questions));
  await api(t1, "PUT", `${sessionBase}/parts/1`, { ...partEdit, instructionBlocks: savedTasks });
  eq("teacher can clear the task blocks explicitly", (await api(t1, "PUT", `${sessionBase}/parts/2`, { ...partEdit, instructionBlocks: [] })).json.parts[1].instructionBlocks.length, 0);
  eq("removed tasks no longer have a diagram", (await api(t1, "GET", `${sessionBase}${taskPath(2, lockedId)}`)).status, 404);
  eq("teacher uploads a diagram", (await upload(t1, 1, pngBytes, "Cell diagram.png")).status, 200);
  eq("teacher uploads a diagram before Part 2 opens", (await upload(t1, 2, pngBytes, "Hidden diagram.png")).status, 200);
  const diagramMeta = (await api(s1, "GET", "/student/state")).json.parts[0].attachment;
  check("open part has an inline image URL", diagramMeta.previewUrl?.startsWith("/api/student/parts/1/attachment?preview=1"));
  const diagram = await fetch(BASE + diagramMeta.previewUrl, { headers: { Cookie: Object.entries(s1.cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });
  check("image streams inline with its detected MIME and exact bytes", diagram.ok
    && diagram.headers.get("content-type") === "image/png"
    && diagram.headers.get("content-disposition")?.startsWith("inline;")
    && Buffer.from(await diagram.arrayBuffer()).equals(pngBytes));
  eq("students cannot preview a locked diagram", (await api(s1, "GET", "/student/parts/2/attachment?preview=1")).status, 403);
  eq("anonymous visitors cannot preview a diagram", (await api(anon, "GET", "/student/parts/1/attachment?preview=1")).status, 401);
  eq("teacher can also request an inline preview", (await api(t1, "GET", `${sessionBase}/parts/1/attachment?preview=1`)).headers.get("content-type"), "image/png");
  eq("teacher can replace the diagram with another file", (await upload(t1, 1, "Plain text", "Not an image.png")).status, 200);
  eq("file named PNG without an image signature remains a download", (await api(s1, "GET", "/student/state")).json.parts[0].attachment.previewUrl, null);
  eq("teacher removes file", (await api(t1, "DELETE", `${sessionBase}/parts/1/attachment`)).status, 200);
  eq("removed file cannot be downloaded", (await api(s1, "GET", "/student/parts/1/attachment")).status, 404);
  section("Session-specific entry tags");
  const tagDraft = (await api(s1, "POST", "/student/entries", { part: 1, body: "Temporary tagged entry", tag: "Assumption" })).json.entry;
  eq("other teacher cannot edit entry tags", (await api(t2, "PATCH", sessionBase, { entryTags: ["Claim"] })).status, 404);
  eq("case-insensitive duplicate tags are rejected", (await api(t1, "PATCH", sessionBase, { entryTags: ["Claim", "claim"] })).status, 400);
  eq("teacher configures custom tags", (await api(t1, "PATCH", sessionBase, { entryTags: ["Claim", "Fair test"] })).status, 200);
  eq("student sees custom session tags", (await api(s1, "GET", "/student/state")).json.entryTags.join(","), "Claim,Fair test");
  eq("removed tag rejected for new entries", (await api(s1, "POST", "/student/entries", { part: 1, body: "new", tag: "Assumption" })).status, 400);
  const reSave = await api(s1, "PATCH", `/student/entries/${tagDraft.id}`, { body: "Temporary edited entry", tag: "Assumption" });
  eq("existing entry stays editable and retains its old tag", reSave.json.entry?.tag, "Assumption");
  eq("custom tag is valid", (await api(s1, "PATCH", `/student/entries/${tagDraft.id}`, { tag: "Fair test" })).json.entry?.tag, "Fair test");
  await api(s1, "DELETE", `/student/entries/${tagDraft.id}`);
  await api(t1, "PATCH", sessionBase, { entryTags: stateWithAttachment.entryTags });
  eq("PIN group without PIN -> 403", (await join(s4, "Dan Yu", "4", gC)).status, 403);
  eq("PIN group with wrong PIN -> 403", (await join(s4, "Dan Yu", "4", gC, "wrong")).status, 403);
  eq("PIN group with right PIN OK", (await join(s4, "Dan Yu", "4", gC, "abc12")).status, 200);
  const full = await join(s5, "Eve Ho", "5", gC, "abc12");
  eq("seat cap enforced (group full)", full.json?.error, "group_full");
  eq("missing name rejected", (await api(actor("n"), "POST", "/student/join", { code, name: "", class: "8A", classNo: "9", groupId: gA })).status, 400);

  section("Session recovery (refresh / new device)");
  eq("same browser rejoin resumes", (await join(s1, "alice lee", "1", gA)).json.resumed, true);
  eq("cookie alone restores the student", (await api(s1, "GET", "/student/state")).json.student.name, "Alice Lee");
  const s1b = actor("alice-phone");
  const r1 = await join(s1b, "Alice Lee", "1", gA, undefined, true);
  eq("new device, unpinned group -> needs teacher approval", r1.json?.error, "needs_approval");
  eq("student with no token cannot read state", (await api(s1b, "GET", "/student/state")).status, 401);
  let st = (await api(t1, "GET", `/teacher/sessions/${sid}/status`)).json;
  eq("teacher sees the pending device request", st.recovery.length, 1);
  eq("teacher approves device", (await api(t1, "POST", `/teacher/sessions/${sid}/recovery/${st.recovery[0].id}/approve`)).status, 200);
  eq("approved device can resume", (await join(s1b, "Alice Lee", "1", gA, undefined, true)).status, 200);
  eq("approval is single-use", (await join(actor("alice-3"), "Alice Lee", "1", gA, undefined, true)).json?.error, "needs_approval");
  const s4b = actor("dan-phone");
  eq("PIN group: device switch needs PIN", (await join(s4b, "Dan Yu", "4", gC, undefined, true)).json?.error, "pin_required");
  eq("PIN group: device switch with PIN works", (await join(s4b, "Dan Yu", "4", gC, "abc12", true)).status, 200);

  section("Part visibility & locking (server-enforced)");
  let state = (await api(s1, "GET", "/student/state")).json;
  const designHint = [{ tag: "Independent variable", hint: "The factor you deliberately change." }];
  eq("wrong teacher cannot configure design hints", (await api(t2, "PATCH", sessionBase, { designTagHints: designHint })).status, 404);
  eq("design hint must belong to a configured tag", (await api(t1, "PATCH", sessionBase, { designTagHints: [{ tag: "Not a tag", hint: "Example" }] })).status, 400);
  eq("teacher saves design hints", (await api(t1, "PATCH", sessionBase, { designTagHints: designHint })).status, 200);
  eq("live monitor reports how many saved hints can be released", (await api(t1, "GET", `${sessionBase}/status`)).json.designHintCount, 1);
  state = (await api(s1, "GET", "/student/state")).json;
  check("saved design hints stay hidden until released", !("designTagHints" in state.parts[0]));
  check("preview also hides unreleased hints", !(await api(t1, "GET", preview)).json.parts[0].designTagHints);
  const hintVisibility = `${sessionBase}/design-tag-hints/visibility`;
  eq("another teacher cannot release hints", (await api(t2, "PUT", hintVisibility, { visible: true })).status, 404);
  eq("owning teacher can release hints", (await api(t1, "PUT", hintVisibility, { visible: true })).status, 200);
  state = (await api(s1, "GET", "/student/state")).json;
  eq("students receive the hint for Part 1", state.parts[0].designTagHints[0].hint, designHint[0].hint);
  eq("student preview respects hint release", (await api(t1, "GET", preview)).json.parts[0].designTagHints[0].hint, designHint[0].hint);
  check("design hints are not included outside Part 1", !state.parts[1].designTagHints);
  eq("teacher can hide hints again", (await api(t1, "PUT", hintVisibility, { visible: false })).status, 200);
  check("hidden hint content is not sent to students", !JSON.stringify((await api(s1, "GET", "/student/state")).json).includes(designHint[0].hint));
  eq("student sees 3 parts", state.parts.length, 3);
  check("locked Part 2 carries no instructions/questions", state.parts[1].locked && !("instructions" in state.parts[1]) && !("questions" in state.parts[1]));
  eq("Part 2 entries -> 403 while locked", (await api(s1, "GET", "/student/entries?part=2")).status, 403);
  eq("Part 2 entry creation -> 403 while locked", (await api(s1, "POST", "/student/entries", { part: 2, body: "sneaky" })).status, 403);
  eq("Part 2 reference -> 403 while locked", (await api(s1, "GET", "/student/reference?part=2")).status, 403);
  await api(t1, "POST", `/teacher/sessions/${sid}/parts/3/visibility`, { visibility: "hidden" });
  state = (await api(s1, "GET", "/student/state")).json;
  check("hidden parts are omitted from student preview", !(await api(t1, "GET", preview)).json.parts.some((p) => p.part === 3));
  eq("hidden Part 3 is absent from student state", state.parts.length, 2);
  eq("hidden Part 3 entries -> 403", (await api(s1, "GET", "/student/entries?part=3")).status, 403);
  await api(t1, "POST", `/teacher/sessions/${sid}/parts/3/visibility`, { visibility: "visible" });

  section("Entries: separate per-member, tags, image, table");
  const e1 = (await api(s1, "POST", "/student/entries", { part: 1, tag: "Hypothesis", body: "Thicker towels absorb more", image: PNG })).json.entry;
  check("entry created with contributor identity", e1 && e1.author.name === "Alice Lee" && e1.author.class === "8A" && e1.author.classNo === "1" && e1.tag === "Hypothesis" && e1.hasImage);
  const e2 = (await api(s2, "POST", "/student/entries", { part: 1, tag: "Aim", body: "Compare three brands", table: { columns: ["Brand", "ml"], rows: [["A", "40"], ["B", "55"]] } })).json.entry;
  check("second member adds a separate entry", e2 && e2.id !== e1.id && e2.table.rows.length === 2);
  let list = (await api(s2, "GET", "/student/entries?part=1")).json;
  eq("group members see each other's entries (sync)", list.entries.length, 2);
  eq("teammate entry flagged not mine", list.entries.find((e) => e.id === e1.id).mine, false);
  eq("teammate cannot edit my entry", (await api(s2, "PATCH", `/student/entries/${e1.id}`, { body: "overwrite!" })).status, 403);
  eq("teammate cannot delete my entry", (await api(s2, "DELETE", `/student/entries/${e1.id}`)).status, 403);
  eq("other group cannot edit my entry (404)", (await api(s3, "PATCH", `/student/entries/${e1.id}`, { body: "x" })).status, 404);
  eq("other group sees nothing of group A", (await api(s3, "GET", "/student/entries?part=1")).json.entries.length, 0);
  eq("owner edits own entry (autosave)", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "Thicker towels absorb more water" })).json.entry.body, "Thicker towels absorb more water");
  eq("stale edit detected", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "old", baseUpdatedAt: 1 })).json?.error, "stale");
  eq("unknown tag rejected", (await api(s1, "POST", "/student/entries", { part: 1, tag: "Banana" })).status, 400);
  eq("fake image rejected (signature check)", (await api(s1, "POST", "/student/entries", { part: 1, image: "data:image/png;base64," + Buffer.from("this is not a png at all").toString("base64") })).status, 400);
  eq("SVG upload rejected", (await api(s1, "POST", "/student/entries", { part: 1, image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })).status, 400);
  eq("oversized table rejected", (await api(s1, "POST", "/student/entries", { part: 1, table: { columns: Array(20).fill("c"), rows: [] } })).status, 400);
  eq("overlong text rejected", (await api(s1, "POST", "/student/entries", { part: 1, body: "x".repeat(5000) })).status, 400);
  const img = await fetch(`${BASE}/api/images/${e1.id}`, { headers: { Cookie: `si_student=${s2.cookies.si_student}` } });
  eq("teammate can load the group image", img.status, 200);
  eq("image served with nosniff", img.headers.get("x-content-type-options"), "nosniff");
  eq("other group cannot load the image", (await api(s3, "GET", `/images/${e1.id}`)).status, 404);
  const timg = await fetch(`${BASE}/api/images/${e1.id}`, { headers: { Cookie: `si_staff=${t1.cookies.si_staff}` } });
  eq("owning teacher loads image", timg.status, 200);
  const t2img = await fetch(`${BASE}/api/images/${e1.id}`, { headers: { Cookie: `si_staff=${t2.cookies.si_staff}` } });
  eq("other teacher cannot load image", t2img.status, 404);

  section("Individual submissions");
  const submitMine = (who, part = 1) => api(who, "POST", "/student/submit-individual", { part, confirm: true });
  eq("student cannot submit a locked part", (await submitMine(s1, 2)).status, 403);
  eq("student cannot submit without any own entries", (await submitMine(s3)).json?.error, "nothing_to_submit");
  eq("student submits their own entries", (await submitMine(s1)).json?.individualSubmission?.status, "submitted");
  eq("same individual submission cannot be sent twice", (await submitMine(s1)).status, 409);
  eq("student cannot edit locked individual work", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "late" })).json?.error, "individual_submitted");
  eq("teammate can edit despite a peer's individual submission", (await api(s2, "PATCH", `/student/entries/${e2.id}`, { body: "Compare three brands" })).status, 200);
  const one = (await api(s1, "GET", "/student/entries?part=1")).json;
  eq("individual submission does not submit the group", one.submission.status, "draft");
  const studentId = (await api(s1, "GET", "/student/state")).json.student.id;
  const individualPath = `${sessionBase}/students/${studentId}/parts/1/submission`;
  const individualCopy = await api(t1, "GET", individualPath);
  check("teacher sees only this student's submitted entries", individualCopy.json?.entries?.length === 1 && individualCopy.json.entries[0].id === e1.id);
  eq("another teacher cannot see the individual submission", (await api(t2, "GET", individualPath)).status, 404);
  eq("teacher can reopen individual work", (await api(t1, "POST", individualPath)).status, 200);
  eq("reopening allows student edits", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "Thicker towels absorb more water" })).status, 200);
  eq("a resubmission creates revision two", (await submitMine(s1)).json?.individualSubmission?.revision, 2);
  await api(t1, "POST", individualPath);

  section("Collective submission safeguard");
  eq("presence heartbeat", (await api(s2, "POST", "/student/presence", { part: 1, editingEntryId: e2.id })).status, 200);
  const chk = (await api(s1, "GET", "/student/submit-check?part=1")).json;
  eq("submit-check lists all contributors", chk.members.length, 2);
  eq("submit-check warns about an active editor", chk.editors.length, 1);
  eq("submit requires confirmation", (await api(s1, "POST", "/student/submit", { part: 1 })).json?.error, "confirm_required");
  eq("submit blocked while a teammate has unsaved work", (await api(s1, "POST", "/student/submit", { part: 1, confirm: true })).json?.error, "editors_active");
  await api(s2, "POST", "/student/presence", { part: 1, editingEntryId: null });
  eq("empty group cannot submit", (await api(s3, "POST", "/student/submit", { part: 1, confirm: true })).json?.error, "nothing_to_submit");
  const sub1 = await api(s1, "POST", "/student/submit", { part: 1, confirm: true });
  eq("group submits Part 1", sub1.json?.submission?.status, "submitted");
  eq("teammate cannot edit after submission", (await api(s2, "PATCH", `/student/entries/${e2.id}`, { body: "late" })).json?.error, "part_submitted");
  eq("cannot add entries after submission", (await api(s2, "POST", "/student/entries", { part: 1, body: "late" })).json?.error, "part_submitted");
  eq("cannot submit twice", (await api(s2, "POST", "/student/submit", { part: 1, confirm: true })).status, 403);
  eq("student can separately submit saved work after group submission", (await submitMine(s2)).json?.individualSubmission?.status, "submitted");

  section("Stage unlocking & deliberate override");
  const blocked = await api(t1, "POST", `/teacher/sessions/${sid}/parts/2/visibility`, { visibility: "open" });
  eq("unlock Part 2 blocked: a group is missing", blocked.json?.error, "groups_missing");
  eq("override needs a reason", (await api(t1, "POST", `/teacher/sessions/${sid}/parts/2/visibility`, { visibility: "open", override: true })).status, 400);
  eq("teacher2 cannot unlock teacher1's part", (await api(t2, "POST", `/teacher/sessions/${sid}/parts/2/visibility`, { visibility: "open", override: true, reason: "x" })).status, 404);
  eq("deliberate override unlocks Part 2", (await api(t1, "POST", `/teacher/sessions/${sid}/parts/2/visibility`, { visibility: "open", override: true, reason: "Group B is absent today" })).status, 200);
  st = (await api(t1, "GET", `/teacher/sessions/${sid}/status`)).json;
  eq("override is recorded", st.overrides.length, 1);
  const sum1 = st.summary.find((s) => s.part === 1);
  eq("status counts submitted groups", `${sum1.submitted}/${sum1.activeGroups}`, "1/3");
  state = (await api(s1, "GET", "/student/state")).json;
  check("Part 2 now shows instructions", state.parts[1].locked === false && typeof state.parts[1].instructions === "string");

  section("Reference panel & preserved Part 1");
  const ref = (await api(s1, "GET", "/student/reference?part=2")).json;
  eq("Part 2 reference shows submitted Part 1", ref.parts[0].entries.length, 2);
  const p2 = (await api(s1, "POST", "/student/entries", { part: 2, tag: "Observation", body: "B soaked up 55 ml" })).json.entry;
  check("Part 2 entry stored separately", p2.part === 2);
  eq("Part 1 entries unchanged by Part 2 work", (await api(s1, "GET", "/student/entries?part=1")).json.entries.length, 2);
  eq("Part 3 reference still locked", (await api(s1, "GET", "/student/reference?part=3")).status, 403);
  eq("cross-group reference isolation (group B has no Part 1 submission)", (await api(s3, "GET", "/student/reference?part=2")).json.parts[0].submitted, false);

  section("Unlock a submission for revision");
  eq("student cannot unlock", (await api(s1, "POST", `/teacher/sessions/${sid}/unlock-submission`, { groupId: gA, part: 1 })).status, 401);
  eq("teacher unlocks Group A Part 1", (await api(t1, "POST", `/teacher/sessions/${sid}/unlock-submission`, { groupId: gA, part: 1 })).status, 200);
  eq("reopening the group does not reopen an individual's work", (await api(s2, "PATCH", `/student/entries/${e2.id}`, { body: "still locked" })).json?.error, "individual_submitted");
  const student2Id = (await api(s2, "GET", "/student/state")).json.student.id;
  await api(t1, "POST", `${sessionBase}/students/${student2Id}/parts/1/submission`);
  eq("group can revise after unlock", (await api(s2, "PATCH", `/student/entries/${e2.id}`, { body: "Compare three brands fairly" })).status, 200);
  eq("resubmission creates revision 2", (await api(s2, "POST", "/student/submit", { part: 1, confirm: true })).json?.submission?.revision, 2);

  section("Teacher reads contributions");
  const all1 = (await api(t1, "GET", `/teacher/sessions/${sid}/entries?groupId=${gA}&part=1`)).json.entries;
  check("teacher sees name/class/class no/tag", all1.every((e) => e.author.name && e.author.class && e.author.classNo) && all1.some((e) => e.tag === "Hypothesis") && all1.some((e) => e.hasImage) && all1.some((e) => e.table));

  section("Controlled sharing, anonymisation, critique");
  eq("student sees nothing shared yet", (await api(s3, "GET", "/student/class")).json.shares.length, 0);
  eq("critique on unshared entry impossible", (await api(s3, "POST", "/student/critiques", { shareId: 1, promptKey: "clarify", body: "?" })).status, 404);
  eq("student cannot publish shares", (await api(s1, "POST", `/teacher/sessions/${sid}/shares`, { entryIds: [e1.id] })).status, 401);
  eq("teacher2 cannot share teacher1's entries", (await api(t2, "POST", `/teacher/sessions/${sid}/shares`, { entryIds: [e1.id] })).status, 404);
  eq("teacher shares an entry", (await api(t1, "POST", `/teacher/sessions/${sid}/shares`, { entryIds: [e1.id, e2.id] })).json?.added, 2);
  let cls = (await api(s3, "GET", "/student/class")).json;
  eq("other group now sees 2 shared entries", cls.shares.length, 2);
  eq("group name shown when not anonymised", cls.shares[0].label, "Group A");
  check("no student names exposed to class", !JSON.stringify(cls).includes("Alice") && !JSON.stringify(cls).includes("Bob"));
  await api(t1, "PATCH", `/teacher/sessions/${sid}`, { anonymiseSharing: true });
  cls = (await api(s3, "GET", "/student/class")).json;
  eq("anonymised label", cls.shares[0].label, "Sample Response #1");
  const reactionPath = `/student/shares/${cls.shares[0].shareId}/reaction`;
  eq("cannot react to an unpublished response", (await api(s3, "PUT", "/student/shares/999999/reaction", { reaction: "like" })).status, 404);
  eq("cannot react to own response", (await api(s1, "PUT", reactionPath, { reaction: "heart" })).status, 403);
  eq("student likes peer response", (await api(s3, "PUT", reactionPath, { reaction: "like" })).json.reactions?.like, 1);
  eq("repeating the same request does not double count", (await api(s3, "PUT", reactionPath, { reaction: "like" })).json.reactions?.like, 1);
  const swap = (await api(s3, "PUT", reactionPath, { reaction: "heart" })).json.reactions;
  check("heart replaces a like instead of adding another reaction", swap.heart === 1 && swap.like === 0 && swap.mine === "heart");
  const teacherReactions = (await api(t1, "GET", `${sessionBase}/shares`)).json.shares.find((s) => s.shareId === cls.shares[0].shareId)?.reactions;
  check("teacher ranking receives matching aggregate star and heart counts", teacherReactions?.like === 0 && teacherReactions.heart === 1 && teacherReactions.mine === null);
  const authorReactions = (await api(s1, "GET", "/student/class")).json.shares[0].reactions;
  check("other students see only totals and their own selection", authorReactions.heart === 1 && authorReactions.mine === null && Object.keys(authorReactions).length === 3);
  eq("student can undo a reaction", (await api(s3, "PUT", reactionPath, { reaction: null })).json.reactions?.heart, 0);
  check("group names AND student names absent when anonymised", !JSON.stringify(cls).includes("Group A") && !JSON.stringify(cls).includes("Alice"));
  const simg = await fetch(`${BASE}/api/images/${e1.id}`, { headers: { Cookie: `si_student=${s3.cookies.si_student}` } });
  eq("shared image visible to class", simg.status, 200);
  const crit = await api(s3, "POST", "/student/critiques", { shareId: cls.shares[0].shareId, promptKey: "confounding", body: "Towel size may differ" });
  eq("peer critique posted", crit.status, 200);
  eq("disabled critique prompt rejected", (await api(s3, "POST", "/student/critiques", { shareId: cls.shares[0].shareId, promptKey: "improve", body: "x" })).status, 400);
  cls = (await api(s1, "GET", "/student/class")).json;
  eq("critique visible to class, author anonymised", cls.shares[0].critiques[0].authorLabel, "A classmate");
  const critiqueId = cls.shares[0].critiques[0].id;
  const sessionPath = `/teacher/sessions/${sid}`;
  const defaultLabel = "Identify a confounding variable";
  const customLabel = "Name one factor that could skew the results";
  const promptList = (await api(t1, "GET", sessionPath)).json.critiquePrompts;
  const findPrompt = (list, key = "confounding") => list.find((p) => p.key === key);
  const changePrompt = (patch) => ({ critiquePrompts: promptList.map((p) => p.key === "confounding" ? { ...p, ...patch } : p) });
  eq("session starts with built-in critique wording", findPrompt(promptList).label, defaultLabel);
  eq("another teacher cannot rename a prompt", (await api(t2, "PATCH", sessionPath, changePrompt({ label: customLabel }))).status, 404);
  eq("a student cannot rename a prompt", (await api(s1, "PATCH", sessionPath, changePrompt({ label: customLabel }))).status, 401);
  eq("invalid prompt wording is rejected", (await api(t1, "PATCH", sessionPath, { ...changePrompt({ label: "a".repeat(121) }), title: "Should not save" })).status, 400);
  eq("invalid prompt edit does not save other settings", (await api(t1, "GET", sessionPath)).json.title, "Period 3 Investigation");
  eq("teacher saves custom wording", (await api(t1, "PATCH", sessionPath, changePrompt({ label: `  ${customLabel}  ` }))).status, 200);
  eq("checkbox-only save preserves custom wording", findPrompt((await api(t1, "PATCH", sessionPath, changePrompt({ label: undefined }))).json.critiquePrompts).label, customLabel);
  eq("custom wording persists in the session", findPrompt((await api(t1, "GET", sessionPath)).json.critiquePrompts).label, customLabel);
  cls = (await api(s1, "GET", "/student/class")).json;
  eq("student can select the renamed prompt", findPrompt(cls.prompts).label, customLabel);
  eq("existing critique uses the renamed label on the class board", cls.shares[0].critiques[0].promptLabel, customLabel);
  eq("existing critique uses the renamed label in teacher sharing", (await api(t1, "GET", `${sessionPath}/shares`)).json.shares[0].critiques[0].promptLabel, customLabel);
  eq("existing critique uses the renamed label on the projector", (await api(t1, "GET", `${sessionPath}/projector`)).json.shares[0].critiques[0].promptLabel, customLabel);
  await api(t1, "PATCH", sessionPath, changePrompt({ label: customLabel, enabled: false }));
  cls = (await api(s1, "GET", "/student/class")).json;
  check("disabled custom prompt is hidden without removing existing critiques", !findPrompt(cls.prompts) && cls.shares[0].critiques[0].id === critiqueId);
  const reset = findPrompt((await api(t1, "PATCH", sessionPath, changePrompt({ label: "  ", enabled: false }))).json.critiquePrompts);
  check("clearing a built-in label restores the default and keeps its checkbox", reset.label === defaultLabel && reset.enabled === false);
  await api(t1, "POST", `/teacher/sessions/${sid}/critiques/${critiqueId}/hide`, { hidden: true });
  eq("teacher can hide a critique", (await api(s1, "GET", "/student/class")).json.shares[0].critiques.length, 0);
  const addedPrompt = { key: "teacher-prompt-1", label: "Check whether the repeat trials agree", enabled: true };
  const livePrompts = (await api(t1, "GET", sessionPath)).json.critiquePrompts;
  eq("teacher can create a new critique prompt", (await api(t1, "PATCH", sessionPath, { critiquePrompts: [...livePrompts, addedPrompt] })).status, 200);
  eq("students can see the new prompt", findPrompt((await api(s3, "GET", "/student/class")).json.prompts, addedPrompt.key)?.label, addedPrompt.label);
  eq("students can post under the new prompt", (await api(s3, "POST", "/student/critiques", { shareId: cls.shares[0].shareId, promptKey: addedPrompt.key, body: "How consistent were the trials?" })).status, 200);

  section("Projector view shows only published content");
  const unshared = (await api(s1, "POST", "/student/entries", { part: 2, body: "PRIVATE-DRAFT-TEXT" })).json.entry;
  const proj = (await api(t1, "GET", `/teacher/sessions/${sid}/projector`)).json;
  const previewBoard = (await api(t1, "GET", `${preview}/class`)).json;
  check("student preview board includes only published responses with anonymous labels", previewBoard.shares.length === proj.shares.length && !JSON.stringify(previewBoard).includes("PRIVATE-DRAFT-TEXT") && !JSON.stringify(previewBoard).includes("Alice") && previewBoard.shares.every((s) => !s.canReact));
  check("projector has shared entries", proj.shares.length === 2);
  check("projector excludes unshared drafts and names", !JSON.stringify(proj).includes("PRIVATE-DRAFT-TEXT") && !JSON.stringify(proj).includes("Alice") && !JSON.stringify(proj).includes("Group A"));
  eq("student cannot open projector endpoint", (await api(s1, "GET", `/teacher/sessions/${sid}/projector`)).status, 401);
  void unshared;

  section("Export");
  await api(s1, "POST", "/student/entries", { part: 2, tag: "Evidence", body: "=HYPERLINK(\"http://evil\")" });
  const csv = await api(t1, "GET", `/teacher/sessions/${sid}/export?format=csv`);
  eq("CSV export OK", csv.status, 200);
  check("CSV has student name/class/class no/tag/stage", /Alice Lee/.test(csv.text) && /"8A"/.test(csv.text) && /Hypothesis/.test(csv.text) && /Part 1: Designing/.test(csv.text));
  check("CSV neutralises spreadsheet formulas", csv.text.includes("\"'=HYPERLINK"));
  const js = (await api(t1, "GET", `/teacher/sessions/${sid}/export?format=json`)).json;
  eq("JSON export includes the ordered task blocks, links and questions", JSON.stringify(taskContent(js.stages[0].instructionBlocks)), JSON.stringify(blocks));
  check("JSON export has stages, questions and entries", js.stages.length === 3 && js.stages[0].guidingQuestions[0] === "Custom Q1" && js.entries.length >= 4);
  eq("other teacher cannot export", (await api(t2, "GET", `/teacher/sessions/${sid}/export?format=json`)).status, 404);
  eq("educator cannot export", (await api(ed, "GET", `/teacher/sessions/${sid}/export?format=json`)).status, 403);
  const duplicate = actor("same-details");
  const originalStudent = (await api(s1, "GET", "/student/state")).json.student.id;
  const duplicateJoin = await join(duplicate, "Alice Lee", "1", gB);
  check("same details can join without approval as a separate student", duplicateJoin.status === 200 && !duplicateJoin.json.resumed && duplicateJoin.json.student.id !== originalStudent);
  eq("the duplicate can rejoin on their own browser", (await join(duplicate, "Alice Lee", "1", gB)).json.student?.id, duplicateJoin.json.student.id);
  eq("the duplicate cannot edit the original student's work", (await api(duplicate, "PATCH", `/student/entries/${e1.id}`, { body: "wrong student" })).status, 404);
  eq("recovery refuses ambiguous identical details without a group", (await join(actor("ambiguous"), "Alice Lee", "1", "auto", undefined, true)).json?.error, "ambiguous_recovery");

  section("Archive & delete");
  eq("cannot delete an active session", (await api(t1, "DELETE", `/teacher/sessions/${sid}`, { confirmTitle: "Period 3 Investigation" })).status, 403);
  eq("teacher archives", (await api(t1, "POST", `/teacher/sessions/${sid}/archive`)).status, 200);
  eq("archived session: student edits blocked", (await api(s1, "POST", "/student/entries", { part: 2, body: "x" })).json?.error, "session_archived");
  eq("archived session: join code stops working", (await api(anon, "GET", `/join/${code}`)).status, 404);
  eq("delete needs the title typed", (await api(t1, "DELETE", `/teacher/sessions/${sid}`, { confirmTitle: "nope" })).status, 400);
  eq("teacher deletes archived session", (await api(t1, "DELETE", `/teacher/sessions/${sid}`, { confirmTitle: "Period 3 Investigation" })).status, 200);
  eq("deleted session: student cookie is useless", (await api(s1, "GET", "/student/state")).status, 401);

  section("Logout");
  await api(t1, "POST", "/auth/logout");
  eq("after logout teacher route -> 401", (await api(t1, "GET", "/teacher/sessions")).status, 401);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log("Failures:\n - " + fails.join("\n - "));
    process.exit(1);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
