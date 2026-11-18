import { get, now, num, run, tx } from "./db";
import { HttpError } from "./router";

function limit(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  // Invalid configuration fails closed, rather than accidentally removing a guard.
  return /^\d+$/.test(raw) && Number.isSafeInteger(value) && value <= 1_000_000_000 ? value : 0;
}

function windows(at: number) {
  const date = new Date(at);
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  return {
    day: Date.UTC(y, m, d),
    month: Date.UTC(y, m, 1),
    dayReset: Date.UTC(y, m, d + 1),
    monthReset: Date.UTC(y, m + 1, 1),
  };
}

function totals(since: number, teacherId?: number) {
  const row = get(
    `SELECT COUNT(*) AS requests,
      COALESCE(SUM(COALESCE(actual_tokens, reserved_tokens)),0) AS tokens,
      COALESCE(SUM(actual_tokens),0) AS reported,
      COALESCE(SUM(CASE WHEN actual_tokens IS NULL THEN reserved_tokens ELSE 0 END),0) AS estimated
      FROM ai_api_requests WHERE started_at>=?${teacherId === undefined ? "" : " AND teacher_id=?"}`,
    since, ...(teacherId === undefined ? [] : [teacherId])
  )!;
  return { requests: num(row.requests), tokens: num(row.tokens), reported: num(row.reported), estimated: num(row.estimated) };
}

function limits() {
  return {
    dailyRequests: limit("AI_DAILY_REQUEST_LIMIT", 20),
    monthlyRequests: limit("AI_MONTHLY_REQUEST_LIMIT", 100),
    monthlyTokens: limit("AI_MONTHLY_TOKEN_LIMIT", 1_000_000),
  };
}

export function apiUsage(teacherId?: number) {
  const period = windows(now());
  const cap = limits();
  const day = totals(period.day);
  const month = totals(period.month);
  return {
    daily: { used: day.requests, limit: cap.dailyRequests, resetAt: period.dayReset },
    monthly: { used: month.requests, limit: cap.monthlyRequests, resetAt: period.monthReset },
    tokens: { used: month.tokens, reported: month.reported, estimated: month.estimated, limit: cap.monthlyTokens, resetAt: period.monthReset },
    own: teacherId === undefined ? null : { ...totals(period.month, teacherId) },
  };
}

export function reserveApiRequest(teacherId: number, tokenAllowance: number): number {
  return tx(() => {
    const at = now();
    const period = windows(at);
    const cap = limits();
    const month = totals(period.month);
    if (totals(period.day).requests >= cap.dailyRequests || month.requests >= cap.monthlyRequests) {
      throw new HttpError(429, "ai_budget_reached", "The app’s API request limit has been reached. Check API usage for the reset time.");
    }
    if (month.tokens + tokenAllowance > cap.monthlyTokens || cap.monthlyTokens === 0) {
      throw new HttpError(429, "ai_budget_reached", "This request would exceed the app’s monthly token budget. Try fewer entries or check API usage.");
    }
    return run("INSERT INTO ai_api_requests(teacher_id,started_at,reserved_tokens) VALUES(?,?,?)", teacherId, at, tokenAllowance).id;
  });
}

export function finishApiRequest(id: number, ok: boolean, reportedTokens: number | null) {
  run("UPDATE ai_api_requests SET status=?, actual_tokens=? WHERE id=? AND status='pending'", ok ? "complete" : "failed", reportedTokens, id);
}
