"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useToast } from "@/components/ui";
import { WorkspaceHeading } from "@/components/workspace-icon";
import type { RosterStudent, SessionDetail } from "./types";

type G = SessionDetail["groups"][number];

export function Groups({ session, onSaved }: { session: SessionDetail; onSaved: () => void }) {
  const toast = useToast();
  const archived = session.status === "archived";
  const [nName, setNName] = useState("");
  const [nPin, setNPin] = useState("");
  const [nCap, setNCap] = useState("");
  async function add() {
    try {
      await api("POST", `/teacher/sessions/${session.id}/groups`, { name: nName, pin: nPin, seatCap: nCap ? Number(nCap) : null });
      setNName("");
      setNPin("");
      setNCap("");
      toast("Group added");
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
        Students pick one of these authorised groups (or are assigned one) when they join. A <b>PIN</b> stops students from joining the wrong group by accident, and a <b>seat cap</b> limits group size. The PIN is also what lets a student continue on a new device.
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3">Group name</th>
              <th className="p-3">PIN (optional)</th>
              <th className="p-3">Seat cap</th>
              <th className="p-3">Members</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {session.groups.map((g) => (
              <GroupRow key={g.id} g={g} sessionId={session.id} disabled={archived} onSaved={onSaved} />
            ))}
            <tr className="bg-slate-50/60">
              <td className="p-3">
                <input className="input" placeholder="New group name" value={nName} onChange={(e) => setNName(e.target.value)} maxLength={60} disabled={archived} />
              </td>
              <td className="p-3">
                <input className="input font-mono" placeholder="none" value={nPin} onChange={(e) => setNPin(e.target.value)} maxLength={12} disabled={archived} />
              </td>
              <td className="p-3">
                <input className="input" type="number" min={1} max={60} placeholder="no limit" value={nCap} onChange={(e) => setNCap(e.target.value)} disabled={archived} />
              </td>
              <td />
              <td className="p-3 text-right">
                <button className="btn-primary btn-sm" disabled={archived || !nName.trim()} onClick={add}>
                  Add group
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Roster session={session} onSaved={onSaved} disabled={archived} />
    </div>
  );
}

function Roster({ session, onSaved, disabled }: { session: SessionDetail; onSaved: () => void; disabled: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [no, setNo] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const target = groupId || String(session.groups[0]?.id ?? "");
  const groupName = (id: number) => session.groups.find((g) => g.id === id)?.name ?? "their group";

  async function call(method: "PATCH" | "DELETE" | "POST", path: string, body: unknown, done: string) {
    setBusy(true);
    try {
      await api(method, path, body);
      toast(done);
      onSaved();
      return true;
    } catch (e) {
      toast((e as ApiError).message, "err");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const move = (st: RosterStudent, gid: number) => call("PATCH", `/teacher/sessions/${session.id}/students/${st.id}`, { groupId: gid }, `${st.name} moved to ${groupName(gid)}`);
  function unassign(st: RosterStudent) {
    if (!confirm(`Remove ${st.name} from ${groupName(st.groupId)}? They will wait without a group until you add them to one. Entries they have already written stay with ${groupName(st.groupId)}.`)) return;
    call("PATCH", `/teacher/sessions/${session.id}/students/${st.id}`, { groupId: null }, `${st.name} removed from the group`);
  }
  function deleteReserved(st: RosterStudent) {
    if (!confirm(`Delete ${st.name} from the class list? They haven’t joined yet.`)) return;
    call("DELETE", `/teacher/sessions/${session.id}/students/${st.id}`, undefined, `${st.name} deleted from the class list`);
  }
  async function add() {
    const ok = await call("POST", `/teacher/sessions/${session.id}/students`, { name, class: cls, classNo: no, groupId: Number(target) }, `${name.trim()} added to ${groupName(Number(target))}`);
    if (ok) { setName(""); setNo(""); }
  }

  const studentRow = (st: RosterStudent, unassigned = false) => (
    <li key={st.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 text-sm">
        <span className="font-semibold text-slate-900">{st.name}</span>
        <span className="text-slate-500"> · {st.class} · No. {st.classNo}</span>
        <span className={`badge ml-2 ${st.joined ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{st.joined ? "Joined" : "Not joined yet"}</span>
        {st.entries > 0 && <span className="ml-2 text-xs text-slate-500">{st.entries} {st.entries === 1 ? "entry" : "entries"}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`move-${st.id}`}>{unassigned ? `Add ${st.name} to a group` : `Move ${st.name} to another group`}</label>
        <select id={`move-${st.id}`} className="input h-9 w-auto py-1 text-sm" disabled={disabled || busy} value=""
          onChange={(e) => { if (e.target.value) move(st, Number(e.target.value)); }}>
          <option value="">{unassigned ? "Add to group…" : "Move to…"}</option>
          {session.groups.filter((g) => unassigned || g.id !== st.groupId).map((g) => (
            <option key={g.id} value={g.id} disabled={g.seatCap !== null && g.members >= g.seatCap}>{g.name}{g.seatCap !== null && g.members >= g.seatCap ? " (full)" : ""}</option>
          ))}
        </select>
        {!unassigned && st.joined && <button className="btn-ghost btn-sm text-rose-700" disabled={disabled || busy} onClick={() => unassign(st)}>Remove from group</button>}
        {!st.joined && <button className="btn-ghost btn-sm text-rose-700" disabled={disabled || busy} onClick={() => deleteReserved(st)}>Delete</button>}
      </div>
    </li>
  );

  return (
    <section className="card space-y-4">
      <WorkspaceHeading icon="groups">Students in groups</WorkspaceHeading>
      <p className="text-sm text-slate-600">Add students to a group before they join, move students between groups, or remove them from a group. When a student you added joins with the same name, class and class number, they go straight to that group. A group PIN still applies. Entries a student has already written stay with the group they were written in.</p>

      {session.unassigned.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h4 className="text-sm font-semibold text-amber-900">Not in a group ({session.unassigned.length})</h4>
          <p className="text-xs text-amber-800">These students are waiting. Their workspace opens when you add them to a group.</p>
          <ul className="mt-1 divide-y divide-amber-100">{session.unassigned.map((st) => studentRow(st, true))}</ul>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {session.groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-slate-200 p-3">
            <h4 className="flex items-center justify-between text-sm font-semibold text-blue-950">
              {g.name}<span className="text-xs font-normal text-slate-500">{g.members}{g.seatCap ? ` / ${g.seatCap}` : ""} {g.members === 1 ? "student" : "students"}</span>
            </h4>
            {g.students.length === 0 ? <p className="mt-2 text-sm text-slate-500">No students yet.</p>
              : <ul className="mt-1 divide-y divide-slate-100">{g.students.map((st) => studentRow(st))}</ul>}
          </div>
        ))}
      </div>

      <fieldset className="rounded-xl border border-blue-100 bg-blue-50/60 p-3" disabled={disabled || busy || !session.groups.length}>
        <legend className="px-1 text-sm font-semibold text-blue-950">Add a student to a group</legend>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] sm:items-end">
          <label className="text-xs font-medium text-slate-700">Name<input className="input mt-1" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-700">Class<input className="input mt-1" value={cls} maxLength={20} onChange={(e) => setCls(e.target.value)} placeholder="e.g. 4A" /></label>
          <label className="text-xs font-medium text-slate-700">Class number<input className="input mt-1" value={no} maxLength={10} onChange={(e) => setNo(e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-700">Group
            <select className="input mt-1" value={target} onChange={(e) => setGroupId(e.target.value)}>
              {session.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={!name.trim() || !cls.trim() || !no.trim() || !target} onClick={add}>Add student</button>
        </div>
      </fieldset>
    </section>
  );
}

function GroupRow({ g, sessionId, disabled, onSaved }: { g: G; sessionId: number; disabled: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(g.name);
  const [pin, setPin] = useState(g.pin);
  const [cap, setCap] = useState(g.seatCap === null ? "" : String(g.seatCap));
  const dirty = name !== g.name || pin !== g.pin || cap !== (g.seatCap === null ? "" : String(g.seatCap));
  async function save() {
    try {
      await api("PATCH", `/teacher/sessions/${sessionId}/groups/${g.id}`, { name, pin, seatCap: cap ? Number(cap) : null });
      toast("Group saved");
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    }
  }
  async function del() {
    if (!confirm(`Remove ${g.name}?`)) return;
    try {
      await api("DELETE", `/teacher/sessions/${sessionId}/groups/${g.id}`);
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "err");
    }
  }
  return (
    <tr>
      <td className="p-3">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} maxLength={60} aria-label="Group name" />
      </td>
      <td className="p-3">
        <input className="input font-mono" value={pin} onChange={(e) => setPin(e.target.value)} disabled={disabled} maxLength={12} placeholder="none" aria-label="Group PIN" />
      </td>
      <td className="p-3">
        <input className="input" type="number" min={1} max={60} value={cap} onChange={(e) => setCap(e.target.value)} disabled={disabled} placeholder="no limit" aria-label="Seat cap" />
      </td>
      <td className="p-3 font-semibold">{g.members}{g.seatCap ? ` / ${g.seatCap}` : ""}</td>
      <td className="flex justify-end gap-2 p-3">
        <button className="btn-primary btn-sm" disabled={disabled || !dirty || !name.trim()} onClick={save}>
          Save
        </button>
        <button className="btn-ghost btn-sm text-rose-700" disabled={disabled || g.students.length > 0} title={g.students.length > 0 ? "Groups with students can't be removed" : "Remove"} onClick={del}>
          Remove
        </button>
      </td>
    </tr>
  );
}
