// Run: node scripts/check-scoring.cjs. Exercises the real Edge Function with an in-memory DB.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { stripTypeScriptTypes } = require("node:module");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const frontend = { window: {} };
vm.runInNewContext(read("js/data.js"), frontend);
const data = frontend.window.TEA_GAME_DATA;
let handler, saved;
const service = () => ({ from(table) {
  const query = {
    select() { return query; }, eq() { return query; }, is() { return query; },
    update(value) { saved = value; return query; },
    async maybeSingle() {
      return { data: table === "activities" ? { is_active: true } : saved ? { id: "test" } : {
        id: "test", activity_id: "activity", session_token_hash: "token",
        game_started_at: new Date(Date.now() - 35000).toISOString()
      } };
    }
  };
  return query;
} });
vm.runInNewContext(stripTypeScriptTypes(read("supabase/functions/submit-game-result/index.ts").replace(/^import .*\r?\n/, "")), {
  Deno: { serve(fn) { handler = fn; } }, service, hash: async (x) => x,
  activityStatus: () => "active", now: () => new Date(), corsHeaders: {}, Response,
  json: (body, status = 200) => new Response(JSON.stringify(body), { status })
});
async function run(hits, missed, correct, elapsedMs, version = data.teaPicking.scoringVersion) {
  saved = null;
  const quizAnswers = data.quiz.questions.map((q, i) => ({
    questionId: q.id, optionId: i < correct ? q.correctOptionId : null, elapsedMs
  }));
  const response = await handler(new Request("https://test", {
    method: "POST", headers: { "x-game-session-token": "token" },
    body: JSON.stringify({ sessionId: "test", scoringVersion: version,
      harvest: { hits, missedCorrect: missed }, quizAnswers })
  }));
  return { status: response.status, body: await response.json() };
}
const hits = (counts) => Object.fromEntries(data.teaPicking.types.map((t, i) => [t.id, counts[i]]));
(async () => {
  for (const [i, type] of data.teaPicking.types.entries()) {
    const result = await run(hits(data.teaPicking.types.map((_, j) => i === j ? 1 : 0)), 0, 0, 6000);
    assert.equal(result.body.accepted, true);
    assert.equal(result.body.score.harvest, type.score);
    assert.equal(saved.harvest_score, type.score);
  }
  for (const [name, counts, missed, correct, elapsed, expected] of [
    ["beginner", [8, 5, 3, 2], 17, 3, 6000, 454],
    ["practiced", [14, 8, 1, 1], 9, 4, 4000, 1010],
    ["expert", [18, 11, 0, 0], 2, 5, 3000, 1474]
  ]) {
    const result = await run(hits(counts), missed, correct, elapsed);
    assert.equal(result.body.accepted, true);
    assert.equal(result.body.score.total, expected);
    console.log(name, result.body.score);
  }
  const high = await run(hits([130, 0, 0, 0]), 0, 5, 0);
  assert.equal(high.body.accepted, true);
  assert.ok(high.body.score.total > 3200 && high.body.score.total <= 6000);
  const low = await run(hits([0, 0, 0, 130]), 0, 0, 6000);
  assert.equal(low.body.accepted, true);
  assert.equal(low.body.score.total, -5200);
  assert.equal((await run(hits([130, 1, 0, 0]), 0, 0, 6000)).body.accepted, false);
  assert.equal((await run(hits([1, 0, 0, 0]), 0, 0, 6000, "old-version")).status, 400);
  assert.equal(saved, null);
  console.log("PASS: frontend/backend scoring, example rounds, score bounds, event limits and stale version rejection");
})().catch((error) => { console.error(error); process.exitCode = 1; });
