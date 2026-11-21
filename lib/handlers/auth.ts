import { randomUUID } from "node:crypto";
import { route, bad, forbidden, notFound, HttpError, str, type Ctx } from "../router";
import { all, get, run, tx, now, num, audit } from "../db";
import { hashPassword, verifyPassword, issueToken, revokeToken, rateLimit, rateLimitReset, STAFF_COOKIE, STUDENT_COOKIE } from "../auth";
import { LIMITS } from "../constants";
import { DEMO_ACCOUNTS, isDemoPassword, usesPrivateStaff } from "../seed";

const nameKey = (name: string, cls: string, no: string) => [name, cls, no].map((s) => s.trim().toLowerCase().replace(/\s+/g, " ")).join("|");

route("POST", "/auth/login", (ctx) => {
  const email = str(ctx.body?.email, 200, "Email").toLowerCase();
  const password = str(ctx.body?.password, 200, "Password");
  const k1 = `login:${ctx.ip}`;
  const k2 = `login:${email}`;
  if (!rateLimit(k1, 30, 300000) || !rateLimit(k2, 8, 300000)) throw new HttpError(429, "rate_limited", "Too many sign-in attempts. Please wait a few minutes.");
  const u = get("SELECT * FROM users WHERE email=?", email);
  if (!u || (usesPrivateStaff() && isDemoPassword(password)) || !verifyPassword(password, String(u.password_hash))) {
    throw new HttpError(401, "invalid_credentials", "Email or password is incorrect.");
  }
  rateLimitReset(k2);
  if (ctx.auth.staffToken) revokeToken(ctx.auth.staffToken);
  const { token, maxAge } = issueToken("staff", num(u.id));
  ctx.setCookie(STAFF_COOKIE, token, maxAge);
  audit("staff", num(u.id), "login");
  return { user: { id: num(u.id), role: u.role, name: u.name, email: u.email } };
});

route("POST", "/auth/logout", (ctx) => {
  if (ctx.auth.staffToken) revokeToken(ctx.auth.staffToken);
  if (ctx.auth.studentToken) revokeToken(ctx.auth.studentToken);
  ctx.setCookie(STAFF_COOKIE, "", 0);
  ctx.setCookie(STUDENT_COOKIE, "", 0);
  return { ok: true };
});

route("GET", "/auth/me", (ctx) => {
  let student = null;
  if (ctx.auth.studentId) {
    const s = get("SELECT s.id,s.name,s.class,s.class_no,se.title,se.status FROM students s JOIN sessions se ON se.id=s.session_id WHERE s.id=?", ctx.auth.studentId);
    if (s) student = { id: num(s.id), name: s.name, class: s.class, classNo: s.class_no, sessionTitle: s.title, sessionStatus: s.status };
  }
  return { staff: ctx.auth.staff ?? null, student };
});

/* Staff change their own password. Other signed-in devices are signed out; this one stays signed in. */
route("POST", "/auth/password", (ctx) => {
  const staff = ctx.auth.staff;
  if (!staff) throw new HttpError(401, "unauthenticated", "Please sign in.");
  if (!rateLimit(`password:${staff.id}`, 8, 300000)) throw new HttpError(429, "rate_limited", "Too many attempts. Please wait a few minutes.");
  const current = str(ctx.body?.currentPassword, LIMITS.passwordMax, "Current password");
  const next = typeof ctx.body?.newPassword === "string" ? ctx.body.newPassword : "";
  if (next.length < LIMITS.passwordMin) throw bad(`Your new password must be at least ${LIMITS.passwordMin} characters.`);
  if (next.length > LIMITS.passwordMax) throw bad(`Your new password must be at most ${LIMITS.passwordMax} characters.`);
  if (next !== next.trim()) throw bad("Your new password can’t start or end with a space.");
  const u = get("SELECT password_hash FROM users WHERE id=?", staff.id);
  if (!u || !verifyPassword(current, String(u.password_hash))) throw new HttpError(403, "wrong_password", "Your current password is incorrect.");
  if (next === current) throw bad("Choose a new password that is different from your current one.");
  if (isDemoPassword(next)) throw bad("Choose a private password, not a demo password.");
  tx(() => {
    run("UPDATE users SET password_hash=? WHERE id=?", hashPassword(next), staff.id);
    run("DELETE FROM auth_tokens WHERE kind='staff' AND user_id=?", staff.id);
  });
  rateLimitReset(`password:${staff.id}`);
  const { token, maxAge } = issueToken("staff", staff.id);
  ctx.setCookie(STAFF_COOKIE, token, maxAge);
  audit("staff", staff.id, "password.change");
  return { ok: true };
});

route("GET", "/auth/demo-accounts", () => {
  if (usesPrivateStaff() || process.env.HIDE_DEMO_ACCOUNTS === "1") return { accounts: [] };
  return { accounts: DEMO_ACCOUNTS.map((a) => ({ role: a.role, name: a.name, email: a.email, password: a.password })) };
});

/* ---------- Student join ---------- */
function findSession(code: string) {
  const s = get("SELECT * FROM sessions WHERE join_code=? AND status='active' AND template_design=0", code.trim().toUpperCase());
  if (!s) throw notFound("We could not find an active session with that code.");
  return s;
}

route("GET", "/join/:code", (ctx) => {
  if (!rateLimit(`joinlookup:${ctx.ip}`, 60, 300000)) throw new HttpError(429, "rate_limited", "Too many attempts. Please wait a moment.");
  const s = findSession(ctx.params.code);
  const groups = all("SELECT g.id,g.name,g.pin,g.seat_cap,(SELECT COUNT(*) FROM students st WHERE st.group_id=g.id AND st.unassigned=0) AS n FROM groups g WHERE g.session_id=? ORDER BY g.id", num(s.id));
  return {
    session: { title: s.title },
    groups: groups.map((g) => ({
      id: num(g.id),
      name: g.name,
      hasPin: !!g.pin,
      seatsLeft: g.seat_cap ? Math.max(0, num(g.seat_cap) - num(g.n)) : null,
    })),
  };
});

function studentState(id: number) {
  const s = get("SELECT s.id,s.name,s.class,s.class_no,g.name AS group_name FROM students s JOIN groups g ON g.id=s.group_id WHERE s.id=?", id)!;
  return { id: num(s.id), name: s.name, class: s.class, classNo: s.class_no, groupName: s.group_name };
}

function issueStudent(ctx: Ctx, id: number) {
  const { token, maxAge } = issueToken("student", id);
  ctx.setCookie(STUDENT_COOKIE, token, maxAge);
}

route("POST", "/student/join", (ctx) => {
  const b = ctx.body || {};
  const code = str(b.code, 20, "Join code");
  const name = str(b.name, LIMITS.nameMax, "Name");
  const cls = str(b.class, LIMITS.classMax, "Class");
  const classNo = str(b.classNo, 10, "Class number");
  if (!rateLimit(`join:${ctx.ip}:${code.toUpperCase()}`, 40, 300000)) throw new HttpError(429, "rate_limited", "Too many attempts. Please wait a moment.");
  const session = findSession(code);
  const sid = num(session.id);
  const key = nameKey(name, cls, classNo);
  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  const pinKey = `pin:${ctx.ip}:${sid}`;

  const existing = get("SELECT id FROM students WHERE session_id=? AND name_key=?", sid, key);
  const current = ctx.auth.studentId ? get("SELECT * FROM students WHERE id=? AND session_id=?", ctx.auth.studentId, sid) : undefined;
  if (current && nameKey(String(current.name), String(current.class), String(current.class_no)) === key) {
    return { student: studentState(num(current.id)), resumed: true };
  }
  // A student the teacher added in advance goes straight to the group the teacher chose.
  const reserved = all("SELECT id,group_id,name,class,class_no FROM students WHERE session_id=? AND placeholder=1 ORDER BY id", sid)
    .find((row) => nameKey(String(row.name), String(row.class), String(row.class_no)) === key);
  if (reserved) {
    const grp = get("SELECT * FROM groups WHERE id=?", num(reserved.group_id))!;
    if (grp.pin) {
      if (!pin) throw new HttpError(403, "pin_required", `Your teacher has placed you in ${grp.name}. Enter its group PIN to continue.`);
      if (!rateLimit(pinKey, 10, 300000)) throw new HttpError(429, "rate_limited", "Too many PIN attempts. Please wait a few minutes.");
      if (pin !== String(grp.pin)) throw new HttpError(403, "wrong_pin", "That group PIN is not correct.");
    }
    run("UPDATE students SET placeholder=0, last_seen=? WHERE id=?", now(), num(reserved.id));
    issueStudent(ctx, num(reserved.id));
    audit("student", num(reserved.id), "join_reserved", `session:${sid}`);
    return { student: studentState(num(reserved.id)), resumed: false, assignedByTeacher: true };
  }
  if (b.resume === true) {
    const requestedGroup = Number(b.groupId);
    const candidates = all("SELECT id,group_id,name,class,class_no FROM students WHERE session_id=? AND placeholder=0", sid)
      .filter((row) => nameKey(String(row.name), String(row.class), String(row.class_no)) === key &&
        (!Number.isInteger(requestedGroup) || requestedGroup <= 0 || num(row.group_id) === requestedGroup));
    if (!candidates.length) throw notFound("No existing work matches those details. Turn off recovery to join as a new student.");
    if (candidates.length > 1) throw new HttpError(409, "ambiguous_recovery", "More than one student matches. Choose your original group, or open your previous device if the details are identical.");
    const student = candidates[0];
    const grp = get("SELECT * FROM groups WHERE id=?", num(student.group_id))!;
    let ok = false;
    if (grp.pin) {
      if (!pin) throw new HttpError(403, "pin_required", "This name is already in the session. Enter your group PIN to continue on this device.");
      if (!rateLimit(pinKey, 10, 300000)) throw new HttpError(429, "rate_limited", "Too many PIN attempts. Please wait a few minutes.");
      if (pin !== String(grp.pin)) throw new HttpError(403, "wrong_pin", "That group PIN is not correct.");
      ok = true;
    } else {
      const rr = get("SELECT * FROM recovery_requests WHERE student_id=? AND approved_at IS NOT NULL AND consumed_at IS NULL ORDER BY id DESC LIMIT 1", num(student.id));
      if (rr) {
        run("UPDATE recovery_requests SET consumed_at=? WHERE id=?", now(), num(rr.id));
        ok = true;
      } else {
        if (!get("SELECT 1 FROM recovery_requests WHERE student_id=? AND approved_at IS NULL", num(student.id)))
          run("INSERT INTO recovery_requests(student_id,created_at) VALUES(?,?)", num(student.id), now());
        throw new HttpError(403, "needs_approval", "This name is already in the session. Your teacher has been asked to approve this device. Try again in a moment.");
      }
    }
    if (ok) {
      issueStudent(ctx, num(student.id));
      run("UPDATE students SET last_seen=? WHERE id=?", now(), num(student.id));
      return { student: studentState(num(student.id)), resumed: true };
    }
  }

  // New student: choose or be assigned a group.
  const groups = all("SELECT g.*,(SELECT COUNT(*) FROM students st WHERE st.group_id=g.id AND st.unassigned=0) AS n FROM groups g WHERE g.session_id=? ORDER BY g.id", sid);
  if (!groups.length) throw bad("This session has no groups yet. Ask your teacher.");
  let g;
  if (b.groupId === "auto" || b.groupId === undefined || b.groupId === null || b.groupId === "") {
    g = groups.filter((x) => !x.pin).find((x) => !x.seat_cap || num(x.n) < num(x.seat_cap));
    if (!g) throw bad("No open group could be assigned automatically. Please choose a group with its PIN.", "no_auto_group");
  } else {
    g = groups.find((x) => num(x.id) === Number(b.groupId));
    if (!g) throw bad("That group does not exist in this session.");
  }
  if (g.pin) {
    if (!pin) throw new HttpError(403, "pin_required", "This group needs a PIN from your teacher.");
    if (!rateLimit(pinKey, 10, 300000)) throw new HttpError(429, "rate_limited", "Too many PIN attempts. Please wait a few minutes.");
    if (pin !== String(g.pin)) throw new HttpError(403, "wrong_pin", "That group PIN is not correct.");
  }
  const id = tx(() => {
    const n = num(get("SELECT COUNT(*) AS n FROM students WHERE group_id=? AND unassigned=0", num(g.id))!.n);
    if (g.seat_cap && n >= num(g.seat_cap)) throw forbidden("That group is full. Please choose another group.", "group_full");
    const studentKey = existing ? `${key}|${randomUUID()}` : key;
    return run("INSERT INTO students(session_id,group_id,name,class,class_no,name_key,last_seen,created_at) VALUES(?,?,?,?,?,?,?,?)", sid, num(g.id), name, cls, classNo, studentKey, now(), now()).id;
  });
  issueStudent(ctx, id);
  audit("student", id, "join", `session:${sid}`);
  return { student: studentState(id), resumed: false };
});
