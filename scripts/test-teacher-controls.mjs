// Checks for teacher controls: own password, session copies, formatted instructions, task PDFs,
// part-wide diagram and link, entry-tag hints in Parts 2 and 3, unlocking for resubmission, and student groups.
// Usage (after test-api on the same fresh database): BASE=http://localhost:3100 node scripts/test-teacher-controls.mjs
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
  const t1 = actor("teacher1"), t2 = actor("teacher2"), t3 = actor("teacher3"), t3other = actor("teacher3-other-device");
  const login = (who, email, password) => api(who, "POST", "/auth/login", { email, password });
  eq("teacher1 signs in", (await login(t1, "teacher1@school.test", "Teacher1!demo")).status, 200);
  eq("teacher2 signs in", (await login(t2, "teacher2@school.test", "Teacher2!demo")).status, 200);

  section("Teachers change their own password");
  eq("signed-out user cannot change a password", (await api(actor("anon"), "POST", "/auth/password", { currentPassword: "x", newPassword: "y".repeat(20) })).status, 401);
  eq("teacher3 signs in", (await login(t3, "teacher3@school.test", "Teacher3!demo")).status, 200);
  eq("teacher3 signs in on another device", (await login(t3other, "teacher3@school.test", "Teacher3!demo")).status, 200);
  eq("wrong current password is refused", (await api(t3, "POST", "/auth/password", { currentPassword: "nope", newPassword: "A new private pass 1" })).json?.error, "wrong_password");
  eq("short new password is refused", (await api(t3, "POST", "/auth/password", { currentPassword: "Teacher3!demo", newPassword: "short" })).status, 400);
  eq("a demo password is refused", (await api(t3, "POST", "/auth/password", { currentPassword: "Teacher3!demo", newPassword: "Teacher1!demo" })).status, 400);
  eq("same password is refused", (await api(t3, "POST", "/auth/password", { currentPassword: "Teacher3!demo", newPassword: "Teacher3!demo" })).status, 400);
  eq("teacher changes their password", (await api(t3, "POST", "/auth/password", { currentPassword: "Teacher3!demo", newPassword: "A new private pass 1" })).status, 200);
  eq("this device stays signed in", (await api(t3, "GET", "/teacher/sessions")).status, 200);
  eq("other devices are signed out", (await api(t3other, "GET", "/teacher/sessions")).status, 401);
  eq("old password no longer works", (await login(actor("x"), "teacher3@school.test", "Teacher3!demo")).status, 401);
  eq("new password works", (await login(actor("y"), "teacher3@school.test", "A new private pass 1")).status, 200);

  section("Formatted task instructions, task PDFs and part-wide resources");
  const sid = (await api(t1, "POST", "/teacher/sessions", { title: "Enzyme lab" })).json.id;
  const base = `/teacher/sessions/${sid}`;
  const S = (await api(t1, "GET", base)).json;
  const [gA, gB] = S.groups.map((g) => g.id);
  const formatted = "[b]Safety[/b] first.\n- Wear [u]goggles[/u]\n- [large]Tie back hair[/large]\n1. Measure 5 ml";
  const taskA = crypto.randomUUID(), taskB = crypto.randomUUID();
  const putPart = (part, blocks, extra = {}) => api(t1, "PUT", `${base}/parts/${part}`, { instructions: "[xl]Overview[/xl]", webLink: "https://example.org/part", questions: [], instructionBlocks: blocks, ...extra });
  eq("teacher saves formatted task instructions", (await putPart(1, [{ id: taskA, title: "Set up", text: formatted }, { id: taskB, title: "Run", text: "Plain step" }])).status, 200);
  eq("PDF upload needs a saved task", (await upload(t1, `${base}/parts/1/tasks/${crypto.randomUUID()}/pdf`, PDF, "Protocol.pdf")).status, 404);
  eq("task PDF must really be a PDF", (await upload(t1, `${base}/parts/1/tasks/${taskA}/pdf`, Buffer.from("hello"), "Fake.pdf")).json?.error, "not_pdf");
  eq("other teachers cannot attach a PDF", (await upload(t2, `${base}/parts/1/tasks/${taskA}/pdf`, PDF, "Protocol.pdf")).status, 404);
  eq("teacher attaches a PDF to a task", (await upload(t1, `${base}/parts/1/tasks/${taskA}/pdf`, PDF, "Protocol.pdf")).status, 200);
  eq("a task can have a diagram as well as a PDF", (await upload(t1, `${base}/parts/1/tasks/${taskA}/attachment`, PNG, "Set-up.png")).status, 200);
  eq("PDF is attached to the second task too", (await upload(t1, `${base}/parts/1/tasks/${taskB}/pdf`, PDF, "Run sheet.pdf")).status, 200);
  eq("part diagram must be an image", (await upload(t1, `${base}/parts/1/diagram`, PDF, "Not image.png")).status, 415);
  eq("teacher adds a part-wide diagram", (await upload(t1, `${base}/parts/1/diagram`, PNG, "Overview.png")).status, 200);
  eq("teacher adds a part-wide file", (await upload(t1, `${base}/parts/1/attachment`, Buffer.from("guide"), "Guide.txt")).status, 200);

  const s1 = actor("amy"), s2 = actor("ben");
  const code = S.joinCode;
  const join = (who, name, no, groupId, pin) => api(who, "POST", "/student/join", { code, name, class: "4A", classNo: no, groupId, pin });
  eq("student joins", (await join(s1, "Amy Wong", "1", gA)).status, 200);
  eq("second student joins", (await join(s2, "Ben Chan", "2", gA)).status, 200);
  const st = (await api(s1, "GET", "/student/state")).json;
  const p1 = st.parts[0];
  eq("students receive the formatting unchanged", p1.instructionBlocks[0].text, formatted);
  check("students receive the task PDF", p1.instructionBlocks[0].pdf?.name === "Protocol.pdf" && p1.instructionBlocks[0].attachment?.name === "Set-up.png");
  check("students receive the part-wide diagram, link and file", p1.diagram?.previewUrl && p1.webLink === "https://example.org/part" && p1.attachment?.name === "Guide.txt");
  const pdf = await raw(s1, p1.instructionBlocks[0].pdf.url.replace(/^\/api/, ""));
  check("student opens the PDF inline in the browser", pdf.status === 200 && pdf.type === "application/pdf" && /^inline/.test(pdf.disposition) && !/sandbox/.test(pdf.csp ?? ""), JSON.stringify({ s: pdf.status, t: pdf.type, d: pdf.disposition, c: pdf.csp }));
  check("PDF bytes are unchanged", pdf.body.equals(PDF));
  const dia = await raw(s1, p1.diagram.previewUrl.replace(/^\/api/, ""));
  check("student sees the part diagram as an image", dia.status === 200 && dia.type === "image/png");
  eq("Student view preview shows the PDF", (await raw(t1, `${base}/student-view/parts/1/tasks/${taskA}/pdf`)).type, "application/pdf");
  eq("locked part's PDF is not available to students", (await raw(s1, `/student/parts/2/tasks/${taskA}/pdf`)).status, 403);
  eq("removing a task removes its PDF", (await putPart(1, [{ id: taskA, title: "Set up", text: formatted }])).json.parts[0].instructionBlocks.length, 1);
  eq("removed task's PDF is gone", (await raw(t1, `${base}/parts/1/tasks/${taskB}/pdf`)).status, 404);

  section("Entry-tag hints in Parts 2 and 3");
  const stage = (n) => `${base}/parts/${n}/settings`;
  eq("Part 2 hint must use a Part 2 tag", (await api(t1, "PATCH", stage(2), { entryTags: ["Observation", "Result"], tagHints: [{ tag: "Hypothesis", hint: "x" }] })).status, 400);
  eq("teacher writes a Part 2 hint", (await api(t1, "PATCH", stage(2), { entryTags: ["Observation", "Result"], tagHints: [{ tag: "Observation", hint: "Describe what you see." }] })).status, 200);
  eq("teacher writes a Part 3 hint", (await api(t1, "PATCH", stage(3), { tagHints: [{ tag: "Limitation", hint: "What reduces your confidence?" }] })).status, 200);
  const detail = (await api(t1, "GET", base)).json;
  check("hints are stored separately for each part", detail.parts[1].tagHints[0].hint === "Describe what you see." && detail.parts[2].tagHints[0].tag === "Limitation" && detail.parts[0].tagHints.length === 0);
  await api(t1, "POST", `${base}/parts/2/visibility`, { visibility: "open", override: true, reason: "test" });
  check("Part 2 hints are hidden until released", !("designTagHints" in (await api(s1, "GET", "/student/state")).json.parts[1]));
  eq("students cannot release hints", (await api(s1, "PUT", `${base}/parts/2/tag-hints/visibility`, { visible: true })).status, 401);
  eq("teacher releases Part 2 hints", (await api(t1, "PUT", `${base}/parts/2/tag-hints/visibility`, { visible: true })).status, 200);
  eq("students read the released Part 2 hint", (await api(s1, "GET", "/student/state")).json.parts[1].designTagHints?.[0]?.hint, "Describe what you see.");
  const status = (await api(t1, "GET", `${base}/status`)).json;
  check("Live monitor reports hints for each part", status.hints[1].visible && status.hints[1].count === 1 && !status.hints[2].visible && status.hints[2].count === 1);
  eq("teacher hides Part 2 hints", (await api(t1, "PUT", `${base}/parts/2/tag-hints/visibility`, { visible: false })).status, 200);
  check("hidden hints are withdrawn", !("designTagHints" in (await api(s1, "GET", "/student/state")).json.parts[1]));

  section("Unlocking submissions for resubmission");
  const e1 = (await api(s1, "POST", "/student/entries", { part: 1, tag: "Hypothesis", body: "More enzyme, more foam" })).json.entry;
  eq("student submits individual work", (await api(s1, "POST", "/student/submit-individual", { part: 1, confirm: true })).status, 200);
  eq("group submits Part 1", (await api(s1, "POST", "/student/submit", { part: 1, confirm: true })).status, 200);
  eq("work is locked after submission", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "edit" })).status, 403);
  const unlocked = (await api(t1, "POST", `${base}/unlock-submission`, { groupId: gA, part: 1 })).json;
  eq("unlocking a group also reopens members' individual work", unlocked?.individualReopened, 1);
  eq("student can edit after unlocking", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "Revised hypothesis" })).status, 200);
  eq("student resubmits individual work", (await api(s1, "POST", "/student/submit-individual", { part: 1, confirm: true })).json?.individualSubmission?.revision, 2);
  eq("group resubmits", (await api(s1, "POST", "/student/submit", { part: 1, confirm: true })).json?.submission?.revision, 2);
  eq("students cannot unlock all", (await api(s1, "POST", `${base}/parts/1/unlock-all`)).status, 401);
  const all = (await api(t1, "POST", `${base}/parts/1/unlock-all`)).json;
  check("Unlock all reopens every locked submission in the part", all?.groups === 1 && all?.individual === 1, JSON.stringify(all));
  eq("student can edit after Unlock all", (await api(s1, "PATCH", `/student/entries/${e1.id}`, { body: "Second revision" })).status, 200);
  eq("Unlock all again finds nothing locked", (await api(t1, "POST", `${base}/parts/1/unlock-all`)).json?.groups, 0);

  section("Adding, moving and removing students");
  eq("teacher adds a student to Group B before they join", (await api(t1, "POST", `${base}/students`, { name: "Cat Lau", class: "4A", classNo: "3", groupId: gB })).status, 200);
  eq("duplicate details are refused", (await api(t1, "POST", `${base}/students`, { name: " cat lau ", class: "4a", classNo: "3", groupId: gA })).json?.error, "student_exists");
  eq("an existing student cannot be added again", (await api(t1, "POST", `${base}/students`, { name: "Amy Wong", class: "4A", classNo: "1", groupId: gB })).json?.error, "student_exists");
  eq("other teachers cannot add students", (await api(t2, "POST", `${base}/students`, { name: "X", class: "4A", classNo: "9", groupId: gA })).status, 404);
  let d = (await api(t1, "GET", base)).json;
  const cat = d.groups[1].students.find((x) => x.name === "Cat Lau");
  check("added student is listed as not joined yet", cat && cat.joined === false);
  check("a student who hasn't joined is not counted as active in the monitor", !(await api(t1, "GET", `${base}/status`)).json.groups[1].members.some((m) => m.name === "Cat Lau"));
  const s3 = actor("cat");
  const j3 = await join(s3, "Cat Lau", "3", gA);
  check("joining with the same details goes straight to the teacher's group", j3.json?.student?.groupName === "Group B" && j3.json?.assignedByTeacher === true, JSON.stringify(j3.json));
  eq("teacher cannot delete a student who has joined", (await api(t1, "DELETE", `${base}/students/${cat.id}`)).json?.error, "student_joined");
  await api(t1, "PATCH", `${base}/groups/${gB}`, { pin: "BETA" });
  eq("teacher adds a student to a PIN group", (await api(t1, "POST", `${base}/students`, { name: "Dev Ho", class: "4A", classNo: "4", groupId: gB })).status, 200);
  eq("a PIN group still needs its PIN", (await join(actor("dev"), "Dev Ho", "4", gA)).json?.error, "pin_required");
  eq("the PIN lets the student in", (await join(actor("dev2"), "Dev Ho", "4", gA, "BETA")).json?.student?.groupName, "Group B");
  eq("teacher adds a student who will not come", (await api(t1, "POST", `${base}/students`, { name: "Eli Ma", class: "4A", classNo: "5", groupId: gA })).status, 200);
  d = (await api(t1, "GET", base)).json;
  const eli = d.groups[0].students.find((x) => x.name === "Eli Ma");
  eq("teacher deletes a student who hasn't joined", (await api(t1, "DELETE", `${base}/students/${eli.id}`)).status, 200);

  const ben = d.groups[0].students.find((x) => x.name === "Ben Chan");
  eq("other teachers cannot move students", (await api(t2, "PATCH", `${base}/students/${ben.id}`, { groupId: gB })).status, 404);
  eq("teacher moves a student to another group", (await api(t1, "PATCH", `${base}/students/${ben.id}`, { groupId: gB })).status, 200);
  eq("the student now works in the new group", (await api(s2, "GET", "/student/state")).json.group.name, "Group B");
  await api(t1, "PATCH", `${base}/groups/${gA}`, { seatCap: 1 });
  eq("a full group cannot take another student", (await api(t1, "PATCH", `${base}/students/${ben.id}`, { groupId: gA })).json?.error, "group_full");
  eq("teacher removes a student from their group", (await api(t1, "PATCH", `${base}/students/${ben.id}`, { groupId: null })).status, 200);
  const removed = (await api(s2, "GET", "/student/state")).json;
  check("removed student sees that they are not in a group", removed.unassigned === true && removed.parts.length === 0);
  eq("removed student cannot read group entries", (await api(s2, "GET", "/student/entries?part=1")).json?.error, "unassigned");
  check("removed student is not shown as a group member", !(await api(s1, "GET", "/student/state")).json.group.members.some((m) => m.name === "Ben Chan"));
  d = (await api(t1, "GET", base)).json;
  check("teacher sees the student under Not in a group", d.unassigned.length === 1 && d.unassigned[0].name === "Ben Chan");
  eq("monitor counts students not in a group", (await api(t1, "GET", `${base}/status`)).json.unassignedCount, 1);
  eq("teacher adds the student back to a group", (await api(t1, "PATCH", `${base}/students/${ben.id}`, { groupId: gB })).status, 200);
  check("student's workspace opens again", (await api(s2, "GET", "/student/state")).json.unassigned === false);

  section("Copying a session");
  eq("other teachers cannot copy a session", (await api(t2, "POST", `${base}/clone`, { title: "Stolen" })).status, 404);
  eq("a copy needs a title", (await api(t1, "POST", `${base}/clone`, { title: " " })).status, 400);
  const cid = (await api(t1, "POST", `${base}/clone`, { title: "Enzyme lab (copy)" })).json.id;
  const C = (await api(t1, "GET", `/teacher/sessions/${cid}`)).json;
  const O = (await api(t1, "GET", base)).json;
  check("copy has its own join code and title", C.joinCode !== O.joinCode && C.title === "Enzyme lab (copy)");
  check("copy keeps formatted instructions and tasks", C.parts[0].instructions === O.parts[0].instructions && C.parts[0].instructionBlocks[0].text === formatted && C.parts[0].webLink === "https://example.org/part");
  check("copy keeps task diagrams, PDFs and part resources", C.parts[0].instructionBlocks[0].pdf?.name === "Protocol.pdf" && C.parts[0].instructionBlocks[0].attachment?.name === "Set-up.png" && C.parts[0].diagram?.name === "Overview.png" && C.parts[0].attachment?.name === "Guide.txt");
  check("copy keeps stage tags and hints, with hints hidden", C.parts[1].entryTags.join() === "Observation,Result" && C.parts[1].tagHints[0].hint === "Describe what you see." && !C.parts.some((p) => p.tagHintsVisible));
  check("copy keeps group names, PINs and seat caps but no students", C.groups.map((g) => `${g.name}:${g.pin}:${g.seatCap}`).join() === O.groups.map((g) => `${g.name}:${g.pin}:${g.seatCap}`).join() && C.groups.every((g) => g.students.length === 0) && C.unassigned.length === 0);
  check("copy resets part visibility", C.parts.map((p) => p.visibility).join() === "open,visible,visible");
  eq("copy has no shared responses", (await api(t1, "GET", `/teacher/sessions/${cid}/shares`)).json.shares.length, 0);
  eq("copy has no entries", (await api(t1, "GET", `/teacher/sessions/${cid}/entries`)).json.entries.length, 0);
  await api(t1, "DELETE", `${base}/parts/1/tasks/${taskA}/pdf`);
  const copiedPdf = await raw(t1, `/teacher/sessions/${cid}/parts/1/tasks/${taskA}/pdf`);
  check("copied files are independent of the original", copiedPdf.status === 200 && copiedPdf.body.equals(PDF));
  await api(t1, "PUT", `/teacher/sessions/${cid}/parts/1`, { instructions: "Changed", webLink: "", questions: [] });
  eq("editing the copy leaves the original unchanged", (await api(t1, "GET", base)).json.parts[0].instructions, "[xl]Overview[/xl]");
  const copyJoin = await api(actor("zoe"), "POST", "/student/join", { code: C.joinCode, name: "Zoe", class: "4B", classNo: "1", groupId: C.groups[0].id });
  eq("students can join the copy", copyJoin.status, 200);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log("Failures:\n - " + fails.join("\n - "));
    process.exit(1);
  }
}
main().catch((e) => { console.error(e); process.exit(2); });
