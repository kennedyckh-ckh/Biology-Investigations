import { all, get, num, type Row } from "./db";
import { toDto } from "./entries";
import type { CritiquePrompt, PeerReaction } from "./constants";

const BASE =
  "SELECT e.*, s.name AS s_name, s.class AS s_class, s.class_no AS s_class_no FROM entries e JOIN students s ON s.id=e.student_id WHERE e.id=?";

export function reactionsFor(shareId: number, viewer?: number) {
  const counts = { like: 0, heart: 0 };
  for (const r of all("SELECT reaction, COUNT(*) AS n FROM share_reactions WHERE share_id=? GROUP BY reaction", shareId)) {
    counts[r.reaction as PeerReaction] = num(r.n);
  }
  const mine = viewer === undefined ? undefined : get("SELECT reaction FROM share_reactions WHERE share_id=? AND student_id=?", shareId, viewer);
  return { ...counts, mine: (mine?.reaction as PeerReaction | undefined) ?? null };
}

export function critiquePromptsOf(session: Row, part?: number): CritiquePrompt[] {
  const stage = part === undefined ? undefined : get("SELECT prompts_json FROM stage_settings WHERE session_id=? AND part=?", num(session.id), part);
  try {
    return JSON.parse(String(stage?.prompts_json ?? session.critique_prompts_json));
  } catch {
    return [];
  }
}

export function stageCritiquePrompts(session: Row) {
  return Object.fromEntries([1, 2, 3].map((part) => [part, critiquePromptsOf(session, part)]));
}

export function classBoardFor(session: Row, viewerStudentId?: number) {
  const promptLists = stageCritiquePrompts(session);
  return {
    anonymised: !!num(session.anonymise_sharing),
    shares: publishedShares(session, viewerStudentId, promptLists),
    ai: publishedAi(num(session.id)),
    // Keep the old global list for older clients, not for the stage-specific UI.
    prompts: critiquePromptsOf(session).filter((p) => p.enabled),
    promptsByPart: Object.fromEntries(Object.entries(promptLists).map(([part, list]) => [part, list.filter((p) => p.enabled)])),
  };
}

/**
 * What the whole class may see. Anonymisation is applied HERE, on the server:
 * when the session is anonymised, neither group names nor student names leave this function.
 */
export function publishedShares(session: Row, viewerStudentId?: number, promptLists = stageCritiquePrompts(session)) {
  const sid = num(session.id);
  const anon = !!num(session.anonymise_sharing);
  const shares = all("SELECT * FROM shares WHERE session_id=? ORDER BY seq", sid);
  return shares
    .map((sh) => {
      const er = get(BASE, num(sh.entry_id));
      if (!er || er.deleted_at) return null;
      const e = toDto(er);
      const prompts = promptLists[e.part] ?? [];
      const g = get("SELECT name FROM groups WHERE id=?", e.groupId)!;
      const critiques = all(
        "SELECT c.*, g.name AS g_name FROM critiques c JOIN students s ON s.id=c.student_id JOIN groups g ON g.id=s.group_id WHERE c.share_id=? AND c.hidden=0 ORDER BY c.id",
        num(sh.id)
      ).map((c) => ({
        id: num(c.id),
        promptKey: String(c.prompt_key),
        promptLabel: prompts.find((p) => p.key === c.prompt_key)?.label || String(c.prompt_key),
        body: String(c.body),
        mine: viewerStudentId !== undefined && num(c.student_id) === viewerStudentId,
        authorLabel: anon ? "A classmate" : String(c.g_name),
        createdAt: num(c.created_at),
      }));
      return {
        shareId: num(sh.id),
        entryId: e.id,
        label: anon ? `Sample Response #${num(sh.seq)}` : String(g.name),
        part: e.part,
        tag: e.tag,
        body: e.body,
        hasImage: e.hasImage,
        table: e.table,
        critiques,
        reactions: reactionsFor(num(sh.id), viewerStudentId),
        canReact: viewerStudentId !== undefined && viewerStudentId !== e.studentId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/** Published group summaries / cross-group comparisons and REVEALED discussion points only. */
export function publishedAi(sessionId: number) {
  return all(
    "SELECT * FROM ai_outputs WHERE session_id=? AND ((kind IN ('group_summary','cross_group') AND status IN ('published','revealed')) OR (kind='discussion_points' AND status='revealed')) ORDER BY id",
    sessionId
  ).map((o) => ({
    id: num(o.id),
    kind: String(o.kind),
    part: num(o.part),
    content: JSON.parse(String(o.content_json)),
  }));
}
