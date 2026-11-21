// Checks that Teacher Educators edit templates with the same task editor as teachers, and imports copy everything.
// Usage (after test-api on the same fresh database): BASE=http://localhost:3100 node scripts/test-educator-template.mjs
const BASE = process.env.BASE || "http://localhost:3100";
let pass = 0;
const fails = [];
const section = (s) => console.log(`\n== ${s}`);
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fails.push(label); console.log(`  FAIL ${label} ${extra}`); }
}
const eq = (label, a, b) => check(label, a === b, `(got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const actor = (name) => ({ name, cookies: {} });
const cookie = (who) => Object.entries(who.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
function keep(who, res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    const k = kv.slice(0, i);
    const v = decodeURIComponent(kv.slice(i + 1));
    if (/Max-Age=0/i.test(c) || v === "") delete who.cookies[k];
    else who.cookies[k] = v;
  }
}
async function api(who, method, path, body) {
  const headers = { Cookie: cookie(who) };
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + "/api" + path, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
  keep(who, res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary */ }
  return { status: res.status, json, headers: res.headers, text };
}
async function upload(who, path, bytes, name) {
  const res = await fetch(`${BASE}/api${path}`, { method: "PUT", headers: { Cookie: cookie(who), "Content-Type": "application/octet-stream", "X-Instruction-Filename": encodeURIComponent(name) }, body: bytes });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json };
}
async function raw(who, path) {
  const res = await fetch(`${BASE}/api${path}`, { headers: { Cookie: cookie(who) } });
  return { status: res.status, type: res.headers.get("content-type"), disposition: res.headers.get("content-disposition"), csp: res.headers.get("content-security-policy"), body: Buffer.from(await res.arrayBuffer()) };
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");


async function main() {
  const ed = actor("educator"), t1 = actor("teacher1"), t2 = actor("teacher2"), anon = actor("anon");
  const login = (who, email, password) => api(who, "POST", "/auth/login", { email, password });
  const accounts = (await api(anon, "GET", "/auth/demo-accounts")).json.accounts;
  const edAcc = accounts.find((a) => a.role === "educator");
  eq("educator signs in", (await login(ed, edAcc.email, edAcc.password)).status, 200);
  eq("teacher1 signs in", (await login(t1, "teacher1@school.test", "Teacher1!demo")).status, 200);
  eq("teacher2 signs in", (await login(t2, "teacher2@school.test", "Teacher2!demo")).status, 200);
  const t1id = (await api(ed, "GET", "/educator/teachers")).json.teachers.find((t) => t.email === "teacher1@school.test").id;

  section("Educator edits a template with the teacher Setup editor");
  const tid = (await api(ed, "POST", "/educator/templates", { title: "Catalase template" })).json.id;
  const T = (await api(ed, "GET", `/educator/templates/${tid}`)).json;
  check("template has a design session", Number.isInteger(T.designSessionId));
  const dsid = T.designSessionId;
  const D = (await api(ed, "GET", `/teacher/sessions/${dsid}`)).json;
  eq("educator opens the design session like a teacher Setup", D.parts?.length, 3);
  const v0 = T.version;
  const task1 = crypto.randomUUID(), task2 = crypto.randomUUID();
  const put = await api(ed, "PUT", `/teacher/sessions/${dsid}/parts/1`, {
    instructions: "[b]Safety[/b] first", webLink: "https://example.org/part", questions: ["Part-wide Q"],
    instructionBlocks: [
      { id: task1, title: "Plan", text: "[u]Choose[/u] your variables\n- IV\n- DV", webLink: "https://example.org/t1", questions: ["What will you change?"] },
      { id: task2, title: "Predict", text: "Write a prediction", webLink: "", questions: [] },
    ],
  });
  eq("educator saves formatted task blocks", put.status, 200);
  eq("two tasks saved", put.json.parts[0].instructionBlocks.length, 2);
  eq("task diagram upload", (await upload(ed, `/teacher/sessions/${dsid}/parts/1/tasks/${task1}/attachment`, PNG, "setup.png")).status, 200);
  eq("task PDF upload", (await upload(ed, `/teacher/sessions/${dsid}/parts/1/tasks/${task2}/pdf`, PDF, "worksheet.pdf")).status, 200);
  eq("part diagram upload", (await upload(ed, `/teacher/sessions/${dsid}/parts/1/diagram`, PNG, "overview.png")).status, 200);
  eq("part file upload", (await upload(ed, `/teacher/sessions/${dsid}/parts/1/attachment`, Buffer.from("notes"), "notes.txt")).status, 200);
  const prompts = D.parts[1].critiquePrompts.map((p, i) => ({ ...p, label: i === 0 ? "Is the evidence enough?" : p.label }));
  eq("educator saves Part 2 stage settings", (await api(ed, "PATCH", `/teacher/sessions/${dsid}/parts/2/settings`, { critiquePrompts: prompts, entryTags: ["Observation", "Data"], tagHints: [{ tag: "Data", hint: "Numbers with units" }] })).status, 200);
  const T2 = (await api(ed, "GET", `/educator/templates/${tid}`)).json;
  check("design edits raise the template version", T2.version > v0, `(${v0} -> ${T2.version})`);
  eq("template detail shows tasks", T2.parts[0].taskCount, 2);
  eq("details save without parts", (await api(ed, "PUT", `/educator/templates/${tid}`, { title: "Catalase template", pedagogyNotes: "Notes", aiCriteria: "Criteria" })).status, 200);
  eq("details save keeps the tasks", (await api(ed, "GET", `/teacher/sessions/${dsid}`)).json.parts[0].instructionBlocks.length, 2);

  section("Access to design sessions");
  eq("teacher cannot open a design session", (await api(t1, "GET", `/teacher/sessions/${dsid}`)).status, 404);
  eq("educator cannot use live-monitor routes on it", (await api(ed, "GET", `/teacher/sessions/${dsid}/status`)).status, 403);
  const joinCode = D.joinCode;
  eq("students cannot join a design session", (await api(anon, "GET", `/join/${joinCode}`)).status, 404);
  const other = actor("other-educator");
  eq("signed-out user cannot edit a design session", (await api(other, "GET", `/teacher/sessions/${dsid}`)).status, 401);

  section("Teachers import the whole design");
  eq("share with teacher1", (await api(ed, "POST", `/educator/templates/${tid}/assign`, { teacherIds: [t1id] })).status, 200);
  const asg = (await api(t1, "GET", "/teacher/assigned-templates")).json.templates.find((a) => a.templateId === tid);
  eq("preview lists tasks", asg.parts[0].tasks.length, 2);
  check("preview shows task resources", asg.parts[0].tasks[0].hasDiagram && asg.parts[0].tasks[1].hasPdf && asg.parts[0].hasDiagram && asg.parts[0].hasFile);
  const sid = (await api(t1, "POST", "/teacher/sessions", { title: "Imported catalase", assignmentId: asg.assignmentId })).json.id;
  const S = (await api(t1, "GET", `/teacher/sessions/${sid}`)).json;
  eq("overview copied", S.parts[0].instructions, "[b]Safety[/b] first");
  eq("part link copied", S.parts[0].webLink, "https://example.org/part");
  eq("tasks copied in order", S.parts[0].instructionBlocks.map((b) => b.title).join(","), "Plan,Predict");
  eq("task guiding questions copied", S.parts[0].instructionBlocks[0].questions[0], "What will you change?");
  eq("task link copied", S.parts[0].instructionBlocks[0].webLink, "https://example.org/t1");
  check("task diagram and PDF copied", !!S.parts[0].instructionBlocks[0].attachment && !!S.parts[0].instructionBlocks[1].pdf);
  check("part diagram and file copied", !!S.parts[0].diagram && !!S.parts[0].attachment);
  eq("copied diagram downloads", (await raw(t1, S.parts[0].instructionBlocks[0].attachment.url.replace("/api", ""))).status, 200);
  eq("entry tags copied", S.parts[1].entryTags.join(","), "Observation,Data");
  eq("tag hints copied", S.parts[1].tagHints[0]?.hint, "Numbers with units");
  eq("hints start hidden", S.parts[1].tagHintsVisible, false);
  eq("critique prompt copied", S.parts[1].critiquePrompts[0].label, "Is the evidence enough?");
  eq("pedagogy notes and criteria copied", [S.pedagogyNotes, S.aiCriteria].join("|"), "Notes|Criteria");
  eq("source template recorded", S.source?.templateId, tid);
  eq("session is joinable", (await api(anon, "GET", `/join/${S.joinCode}`)).status, 200);
  await api(t1, "PUT", `/teacher/sessions/${sid}/parts/1`, { instructions: "Teacher change", webLink: "", questions: [], instructionBlocks: [] });
  eq("teacher edits do not change the master", (await api(ed, "GET", `/teacher/sessions/${dsid}`)).json.parts[0].instructionBlocks.length, 2);
  check("design session is not in the teacher's session list", !(await api(t1, "GET", "/teacher/sessions")).json.sessions.some((s) => s.id === dsid));

  section("Older templates are converted");
  const old = (await api(ed, "GET", "/educator/templates")).json.templates.find((t) => t.title.startsWith("Which paper towel"));
  const O = (await api(ed, "GET", `/educator/templates/${old.id}`)).json;
  const OD = (await api(ed, "GET", `/teacher/sessions/${O.designSessionId}`)).json;
  check("seeded template text moved into its design", OD.parts[0].instructions.startsWith("Plan a fair test") && OD.parts[0].questions.length === 4);

  section("Deleting a template");
  eq("delete template", (await api(ed, "DELETE", `/educator/templates/${tid}`)).status, 200);
  eq("design session removed", (await api(ed, "GET", `/teacher/sessions/${dsid}`)).status, 403);
  eq("imported session kept", (await api(t1, "GET", `/teacher/sessions/${sid}`)).status, 200);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
