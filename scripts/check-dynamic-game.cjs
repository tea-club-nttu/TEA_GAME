const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const read = (p) => fs.readFileSync(p, 'utf8');
const source = read('supabase/functions/submit-game-result/index.ts').replace(/^import .*\r?\n/gm, '');
let handler, saved, session, activityState = 'active';
const query = (table) => {
  const q = { select() { return q; }, eq() { return q; }, is() { return q; }, update(v) { saved = v; return q; },
    async maybeSingle() { return { data: table === 'activities' ? { is_active: true } : saved ? { id: 's' } : session }; } };
  return q;
};
vm.runInNewContext(stripTypeScriptTypes(source), {
  Deno: { serve(fn) { handler = fn; } }, service: () => ({ from: query }), hash: async (x) => x,
  activityStatus: () => activityState, now: () => new Date(), corsHeaders: {}, Response,
  json: (body, status = 200) => new Response(JSON.stringify(body), { status })
});
const custom = { id: 'custom-tea', correctOptionId: 'b', difficulty: 'hard' };
const emptyHits = { twoLeaves: 0, singleBud: 0, oldLeaf: 0, diseasedLeaf: 0 };
async function run(stages, questions, answers, hits = emptyHits, seconds = 2) {
  saved = null;
  session = { id: 's', activity_id: 'a', session_token_hash: 'token', game_started_at: new Date(Date.now() - seconds * 1000).toISOString(), stages_snapshot: stages, quiz_snapshot: questions };
  const response = await handler(new Request('https://test', { method: 'POST', headers: { 'x-game-session-token': 'token' }, body: JSON.stringify({ sessionId: 's', scoringVersion: 'harvest-balanced-v1', harvest: { hits, missedCorrect: 0 }, quizAnswers: answers }) }));
  return { status: response.status, body: await response.json() };
}
(async () => {
  const quizOnly = { harvest: false, knowledge: false, quiz: true };
  const correct = [{ questionId: custom.id, optionId: 'b', elapsedMs: 6000 }];
  const result = await run(quizOnly, [custom], correct);
  assert.equal(result.body.accepted, true); assert.equal(result.body.score.total, 115);
  activityState = 'paused';
  assert.equal((await run(quizOnly, [custom], correct)).body.accepted, true);
  for (const status of ['closed', 'ended', 'upcoming']) {
    activityState = status;
    assert.equal((await run(quizOnly, [custom], correct)).status, 403);
  }
  activityState = 'active';
  assert.equal((await run(quizOnly, [custom], [{ ...correct[0], optionId: 'a' }])).body.score.total, 0);
  assert.equal((await run(quizOnly, [custom], [{ ...correct[0], questionId: 'disabled-question' }])).status, 400);
  assert.equal((await run(quizOnly, [custom], [])).status, 400);
  assert.equal((await run(quizOnly, [custom], [...correct, ...correct])).status, 400);
  assert.equal((await run(quizOnly, [custom], correct, { ...emptyHits, twoLeaves: 1 })).status, 400);
  const harvestOnly = { harvest: true, knowledge: false, quiz: false };
  assert.equal((await run(harvestOnly, [], [], { ...emptyHits, twoLeaves: 1 }, 31)).body.score.total, 40);
  assert.equal((await run(harvestOnly, [], correct, emptyHits, 31)).status, 400);
  assert.equal((await run(harvestOnly, [], [], emptyHits, 2)).status, 400);
  assert.equal((await run({ harvest: false, knowledge: true, quiz: false }, [], [])).body.score.total, 0);
  const many = Array.from({ length: 50 }, (_, i) => ({ ...custom, id: `q-${i}` }));
  const allCorrect = many.map((q) => ({ questionId: q.id, optionId: 'b', elapsedMs: 0 }));
  const fifty = await run(quizOnly, many, allCorrect, emptyHits, 700);
  assert.equal(fifty.body.accepted, true); assert.equal(fifty.body.score.correctAnswers, 50);
  assert.ok(fifty.body.score.total > 6000);

  // Exercise every non-empty stage selection using the real routing function.
  const routing = read('js/game.js').match(/  function nextStage\(after = ""\) \{[\s\S]*?\n  \}/)[0];
  for (let mask = 1; mask < 8; mask++) {
    const order = ['harvest', 'knowledge', 'quiz'];
    const enabled = Object.fromEntries(order.map((k, i) => [k, Boolean(mask & (1 << i))]));
    let seen;
    const c = vm.createContext({ stages: () => enabled, state: {}, startHarvest: () => { seen = 'harvest'; }, renderKnowledge: () => { seen = 'knowledge'; }, startQuiz: () => { seen = 'quiz'; }, submitResult: () => { seen = 'done'; } });
    vm.runInContext(routing, c);
    for (const after of ['', ...order]) {
      c.nextStage(after);
      assert.equal(seen, order.slice(order.indexOf(after) + 1).find((k) => enabled[k]) || 'done');
    }
  }
  console.log('PASS: custom question scoring, snapshot validation, disabled-stage rejection, 50-question limit range, all seven stage combinations.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
