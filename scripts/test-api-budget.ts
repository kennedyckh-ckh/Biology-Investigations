import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiRequest } from "../lib/ai";

async function test() {
  const dir = mkdtempSync(join(tmpdir(), "si-api-budget-"));
  const savedFetch = globalThis.fetch;
  Object.assign(process.env, {
    DATA_DIR: dir, DB_FILE: "budget-test.db",
    HKU_OPENAI_ENDPOINT: "https://api.example.test/v1",
    HKU_OPENAI_API_KEY: "synthetic-test-value", AI_MODEL: "example",
    AI_DAILY_REQUEST_LIMIT: "2", AI_MONTHLY_REQUEST_LIMIT: "5", AI_MONTHLY_TOKEN_LIMIT: "200000",
  });
  try {
    const { apiUsage, finishApiRequest, reserveApiRequest } = await import("../lib/api-usage");
    const { llmProvider, mockProvider } = await import("../lib/ai");
    const req: AiRequest = {
      kind: "group_summary", part: 1, criteria: "", groupLabel: "Group 1",
      entries: [{ id: 1, part: 1, group: "Group 1", student: "Student A", tag: "Aim", text: "Compare three materials.", table: "", hasImage: false }],
    };
    const tracker = (teacherId: number) => ({ reserve: (tokens: number) => reserveApiRequest(teacherId, tokens), finish: finishApiRequest });
    const content = await mockProvider.generate(req, tracker(1));
    assert.equal(apiUsage().daily.used, 0);
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      assert.equal(body.max_tokens, 2000);
      if (calls === 2) return new Response("", { status: 429 });
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 700 } });
    };
    await llmProvider.generate(req, tracker(1));
    assert.equal(apiUsage(1).tokens.reported, 700);
    assert.equal(apiUsage(1).own?.requests, 1);
    await assert.rejects(llmProvider.generate(req, tracker(2)), { code: "ai_upstream_error" });
    assert.ok(apiUsage().tokens.estimated > 2000);
    await assert.rejects(llmProvider.generate(req, tracker(2)), { code: "ai_budget_reached" });
    assert.equal(calls, 2);
    process.env.AI_DAILY_REQUEST_LIMIT = "20";
    process.env.AI_MONTHLY_REQUEST_LIMIT = "2";
    await assert.rejects(llmProvider.generate(req, tracker(1)), { code: "ai_budget_reached" });
    assert.equal(calls, 2);
    process.env.AI_MONTHLY_REQUEST_LIMIT = "20";
    process.env.AI_MONTHLY_TOKEN_LIMIT = String(apiUsage().tokens.used + 100);
    await assert.rejects(llmProvider.generate(req, tracker(1)), { code: "ai_budget_reached" });
    assert.equal(calls, 2);
    assert.equal(apiUsage(2).own?.requests, 1);
    assert.equal(apiUsage().monthly.used, 2);
    console.log("API budget verified: mock excluded, provider usage reconciled, unknown usage reserved, daily/monthly caps block before fetch, token cap and teacher scopes enforced.");
  } finally {
    globalThis.fetch = savedFetch;
    rmSync(dir, { recursive: true, force: true });
  }
}
test().catch((error) => { console.error(error); process.exitCode = 1; });
