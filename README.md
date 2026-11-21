# Scientific Investigations

A classroom web app for three-stage scientific investigations: **Part 1 Designing → Part 2 Enacting → Part 3 Reflecting**. Roles: Student, Teacher, Teacher Educator.

Next.js 15 (App Router) + TypeScript + Tailwind, with a real server-side API and a SQLite database (Node's built-in `node:sqlite`, so there is nothing native to compile).
**Requires Node 22.13 or newer.**

## Run it

```bash
npm install
npm run build
npm start            # http://localhost:3000  (for another port: npx next start -p 3200)
```

`npm run dev` works too. Data lives in `./data` (`app.db` + `uploads/`). Override with `DATA_DIR=/some/path`.
Optional demo class: with the app running, `BASE=http://localhost:3000 npm run seed:demo`.

## Deploy to Render

This is a Node.js web service, not a Static Site. The root [`render.yaml`](render.yaml) configures the build, health check and a 1 GB persistent disk for SQLite and uploaded images.

Instruction files are stored on the same disk as the database and student images. Each part can have one shared file and each task can have one diagram, up to 500 MB per upload. Increase disk capacity before hosting several large files; replacing a file temporarily needs room for both versions.

1. In the Render Dashboard, choose **New → Blueprint**, connect GitHub and select this repository. Choose the branch that contains `render.yaml`, or `main` after the changes have been merged.
2. Enter `INITIAL_EDUCATOR_EMAIL`, `INITIAL_EDUCATOR_PASSWORD`, `INITIAL_TEACHER_EMAIL` and `INITIAL_TEACHER_PASSWORD` in Render. Use distinct email addresses and distinct private passwords of at least 16 characters; don't commit credentials to GitHub.
3. Review the paid web service and disk before creating the Blueprint. A free web service cannot attach a persistent disk ([Render persistent disks](https://render.com/docs/disks)).
4. When the deploy is live, open the Render URL. Sign in with the initial educator or teacher account. Create a test session, join as a student and confirm that the session still exists after a restart.

For an existing Render service, update it in place rather than creating a second service. Use the build and start commands, Node version, environment and health check settings from this repository. Keep the existing persistent disk and `DATA_DIR` if it already contains classroom data. Back up your database and uploads before switching settings or moving data; a new disk starts empty. Do not copy a local demo database into a public service: private mode blocks the known demo passwords but does not replace existing accounts, rotate their credentials or revoke old sessions.

The four `INITIAL_…` values are only used to create the first two staff accounts on an empty database. The educator and teacher are linked automatically. Editing those values later does not change any existing password. Local development still uses the demo setup by default, but on Render demo sign-in is disabled and the demo accounts are not seeded. The app uses mock AI by default unless a real provider is configured.

## Session setup and peer review

- Sign in as **Teacher Educator → Teachers you support → Add teacher** to provision another classroom teacher with their own email and private password. The teacher will be linked to that educator, who can assign them templates but cannot view their live sessions. No new Render environment variables are needed.
- Students can join as new without approval, even if their details match another student's. They can choose **Recover my previous work on a new device** instead; that separate action still verifies a group PIN or requires teacher approval.

- In **Setup**, use **Add task block** to create up to 12 ordered tasks in each part. Add an external link and choose a diagram inside the task. On a new task, choose **Save part and upload diagram**. Each task can have one PNG, JPEG, WebP or GIF diagram up to 500 MB. Links and diagrams follow their tasks when reordered. Teachers and students can select **Enlarge diagram** for a closer look.
- Within a task, select **Add guiding question** to write up to 20 optional questions in order. They appear inside that task for students and in Student view. Existing part-wide guiding questions stay separate.
- **Shared part resources** are separate from the tasks. Existing part-level links and files are preserved. A general supporting file can still be uploaded for the whole part.
- Select **Student view** in the teacher’s session header to check open and locked parts, released hints, entry tags and the Class board. The preview is read-only and does not join a group or show private group work.
- In **Setup**, open **Stage settings: critique prompts and entry tags** inside a part. Edit that stage’s tag list one tag per line and add or rename its critique prompts, then save its stage settings. Settings from older sessions serve as the initial defaults. Existing entries retain their original tags. On the Class board, students select from the prompts for the stage that produced each shared response.
- In **Part 1 stage settings**, write and save **Design entry-tag hints**. Click **Live monitor → Show design tag hints** to release the hints, or **Hide design tag hints** to withdraw them. In open Part 1, students click **Entry-tag hints** beside **Group entries** to read the released hints one at a time.
- Students can click **Submit my work** for each open part. It submits only their own entries and does not submit or lock classmates' work. Teachers can review and reopen individual submissions under **Live monitor → Group progress**. Group submission is still a separate action.
- **Change password:** Teachers and Teacher Educators can select **Change password** in the top bar. They enter their current password and a new private password of at least 12 characters. They stay signed in on that device and are signed out on other devices.
- **Copy session:** On a session page, select **Copy session** to create an editable copy with a new join code. The copy includes settings, all three parts, tasks, formatting, files, diagrams and PDFs, stage settings, hints, group names, PINs and seat caps. It does not include students, their work, shared responses or AI drafts. Hints start hidden, and only Part 1 starts open.
- **Formatted instructions:** The part overview and each task's instructions have a toolbar for **bold**, italic, underline, text size (Small, Normal, Large, Extra large), bullet points and numbered lists. A **Student view** preview appears below the box. Formatting is stored as simple tags (for example `[b]…[/b]`) and displayed safely, so earlier plain-text instructions look the same.
- **Task PDF:** Each task can have one PDF up to 500 MB, in addition to its diagram and link. Students can open it in the browser or download it. Removing a task also removes its PDF.
- **Shared part resources:** Each part can have a shared web link, a shared diagram (with **Enlarge diagram**) and a shared file. Students see them below the part overview.
- **Entry-tag hints in every part:** In **Setup → Stage settings**, each of Parts 1, 2 and 3 has its own entry-tag hints. In **Live monitor**, use **Show/Hide** for each part to release or withdraw them. Students click **Entry-tag hints** beside **Group entries** once hints are released.
- **Unlock for resubmission:** In **Live monitor → Group progress**, **Unlock for resubmission** reopens a group's submission and its members' individual submissions for that part. Under **Individual**, **Unlock to resubmit** reopens one student's work. **Unlock all for resubmission** in **Who has submitted?** reopens every locked submission in that part. Submitted versions are kept.
- **Students in groups:** In **Groups → Students in groups**, teachers can add a student to a group before they join, move students between groups, and remove students from a group. A student added in advance who joins with the same name, class and class number goes straight to that group; the group PIN still applies. A removed student waits on a "not in a group" screen until the teacher adds them to a group. Entries already written stay with the group they were written in. A student added in advance who hasn't joined yet can be deleted.
- In **Class board**, students can select **Enlarge response** to read a peer’s shared text, image and table in a larger view. They can Star or Heart the response. Selecting the same reaction again removes it. Only aggregate counts and the student's own selection are shown, not the names of students who reacted.
- In the teacher’s **Sharing** tab, choose **Most stars**, **Most hearts** or **Total reactions** to rank published responses. Ties share the same rank. This does not change the order on the student Class board or projector.

## AI API usage and limits

The **API usage** page is available from both staff dashboards. Both roles see shared totals and limits; teachers also see their own monthly totals. It does not display the API key or include mock analyses or activity outside this app.

| Render environment variable | Default |
|---|---:|
| `AI_DAILY_REQUEST_LIMIT` | 20 requests per UTC day |
| `AI_MONTHLY_REQUEST_LIMIT` | 100 requests per UTC calendar month |
| `AI_MONTHLY_TOKEN_LIMIT` | 1,000,000 tokens per UTC calendar month |

These are installation-wide app limits, not the upstream provider's billing or account limits. Set them at or below the allowance for this installation in Render's Environment settings. Enter `0` for any limit to stop live API requests. Each live attempt reserves a request and a conservative token allowance before sending; if the provider returns usage, that total replaces the allowance. Failed or interrupted attempts with unknown consumption keep their allowance. Tracking starts once this update is deployed. Consider using a dedicated key and setting an independent provider quota or spending limit where available.

## Local test accounts (seeded on first start)

| Role | Email | Password |
|---|---|---|
| Teacher 1 | teacher1@school.test | `Teacher1!demo` |
| Teacher 2 | teacher2@school.test | `Teacher2!demo` |
| Teacher 3 | teacher3@school.test | `Teacher3!demo` |
| Teacher Educator | See the local sign-in page’s test accounts | `Educator1!demo` |

The educator supports Teachers 1 and 2 (they receive its templates). **Teacher 3 is deliberately unassigned**, so you can see access control refusing it. A sample template, *"Which paper towel absorbs the most water?"*, is shared with Teachers 1 and 2.
The local sign-in page shows these accounts in a "Test accounts" box. `HIDE_DEMO_ACCOUNTS=1` only hides the box; use the private staff setup above for hosted deployments.

Students need no account: they enter the session **join code**, name, class, class number and pick a group.

## What is fully working (real) vs simulated

| Area | Status |
|---|---|
| Authentication, roles, backend access control, sessions, groups (PIN / seat cap), student join + recovery | **Real** (SQLite, server-side checks on every route) |
| Part 1–3 workspace: per-member entries, tags, picture + mini data table, autosave, polling sync, editing warnings, collective submit, Reference Panel | **Real** |
| Teacher dashboard: monitor, unlock parts / submissions, override, share, anonymise, critique, projector, export (CSV/JSON) | **Real** |
| Teacher Educator: templates, assignment, import-as-copy | **Real** |
| **AI analysis** | **SIMULATED.** A rule-based *mock analyser* produces the drafts. It is not a language model. Everything around it (citation checks, injection hardening, review/edit, Publish vs Reveal) is real. |
| Real-time sync | **Polling** every 4–6 s (not WebSockets) |
| Picture storage | Local disk (`data/uploads`), served only through permission-checked routes |
| Email, SSO, school roster import, virus scanning, backups, HTTPS | **Not included** |

## How access control works

Every API route calls one of the guards in `lib/authz.ts` before touching data:

* staff routes need a valid staff cookie **and** the right role; teacher routes additionally check the teacher **owns** the session (someone else's session answers 404, not 403, so ids don't leak)
* the Teacher Educator has **no** route into live sessions, entries, submissions, or AI drafts
* student routes need a student cookie; entries are scoped to the student's own **group**; a hidden or locked part returns 403 (no instructions or questions are sent for locked parts)
* students can only edit their **own** entries, only while the part is open and the group has not submitted
* shared content is built server-side (`lib/sharing.ts`); when anonymised, group and student names never leave the server
* AI drafts are teacher-only until the teacher publishes (summaries) or reveals (discussion points)
* all mutating routes accept JSON only (a cross-site form post cannot send it), cookies are `HttpOnly; SameSite=Lax`

Run the tests against a running server (a fresh database is best):

```bash
BASE=http://localhost:3100 npm run test:api    # Permission & workflow checks
BASE=http://localhost:3100 npm run test:ai     # 50 AI workflow & guardrail checks
BASE=http://localhost:3100 npm run test:teacher-controls   # 96 checks; run after test:api on the same database
npm run test:unit                              # 14 prompt-hardening / validation / fuzz checks
```

## Wiring a real LLM later

All AI code is in `lib/ai.ts` (pure, no database).

1. Implement `llmProvider.generate(req)`: call your model with `buildPrompt(req)` (system + user message) and return the parsed JSON.
2. Start the app with `AI_PROVIDER=llm`.

You do **not** need to touch the guardrails; the API handler runs `validateContent()` on whatever the provider returns and rejects replies that cite entries that don't exist, omit citations, or present "discussion points" as statements. `buildPrompt` already sends student text only as sanitised JSON inside a delimited `<student_data>` block, and student names are replaced with neutral labels (`Student A`, `Group 2`) before anything leaves the server.
Prompt injection can only ever be *mitigated* by this design, never fully ruled out for a real model. Keep the teacher review step.

## Known limitations (be aware before classroom use)

* **Student identity is classroom-grade, not account-grade.** New joins create separate identities, and explicit recovery of existing work on a new device requires the **group PIN** or **teacher approval**. Students in the same group are still collaborators. Use group PINs for sensitive classes.
* Login and PIN throttling is **in memory** and per process: it resets on restart, and a locked-out email is locked for 5 minutes. Put a reverse proxy / WAF in front for real deployments. The client IP is read from `X-Forwarded-For`, which only a trusted proxy should set.
* Set `COOKIE_SECURE=1` when serving over HTTPS.
* SQLite is a single file: fine for one class or school; take regular backups of `./data`.
* Pictures are limited to PNG/JPEG/WebP ≤ 3 MB, checked by file signature. EXIF data (e.g. location) is not stripped.
* Exports contain student names. Handle them under your school's data policy. Deleting a session removes its data and picture files.
* The mock analyser is heuristic: it spots tag gaps, different numbers, differing statements and absolute wording, not meaning.
