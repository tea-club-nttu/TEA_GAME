const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = fs.readFileSync('supabase/functions/_shared/core.ts', 'utf8');
const core = stripTypeScriptTypes(source.replace(/^import .*\n/gm, '').replace(/^export /gm, ''));
const context = vm.createContext({ Date, Response });
vm.runInContext(core, context);
const at = new Date('2026-09-16T04:00:00Z');
const base = { start_at: '2026-09-16T03:00:00Z', end_at: '2026-09-16T05:00:00Z', is_active: true };
const status = (changes, time = at) => context.activityStatus({ ...base, ...changes }, time);
assert.equal(status({}), 'active');
assert.equal(status({ is_paused: true }), 'paused');
assert.equal(status({ is_paused: true, resume_at: '2026-09-16T04:30:00Z' }), 'paused');
assert.equal(status({ is_paused: true, resume_at: at.toISOString() }), 'active');
assert.equal(status({ is_paused: true, resume_at: '2026-09-16T03:30:00Z' }), 'active');
assert.equal(status({ is_active: false, is_paused: true }), 'closed');
assert.equal(status({ is_paused: true }, new Date('2026-09-16T02:00:00Z')), 'upcoming');
assert.equal(status({ is_paused: true }, new Date('2026-09-16T06:00:00Z')), 'ended');

// A stale browser must not bypass the server-side pause guard.
async function verifyStart(paused, resumeAt, expected) {
  let handler, inserts = 0;
  const activity = { ...base, id: 'test', is_paused: paused, resume_at: resumeAt, stages: { harvest: true, knowledge: false, quiz: false } };
  const query = { select() { return this; }, eq() { return this; }, order: async () => ({ data: [activity] }) };
  const db = { from(name) {
    if (name === 'activities') return query;
    return { insert() { inserts++; return { select() { return { single: async () => ({ data: { id: 'session', game_started_at: at.toISOString() } }) }; } }; } };
  } };
  const code = stripTypeScriptTypes(fs.readFileSync('supabase/functions/create-game-session/index.ts', 'utf8').replace(/^import .*\n/gm, ''));
  vm.runInNewContext(code, { Deno: { serve(fn) { handler = fn; } }, Response, crypto: require('node:crypto').webcrypto,
    activityStatus: (item) => context.activityStatus(item, at), now: () => at, service: () => db,
    validPlayer: () => true, publicActivity: (x) => x, hash: async () => 'hash', corsHeaders: {},
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }) });
  const response = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ name: 'test', studentId: 'test' }) }));
  assert.equal(response.status, expected);
  assert.equal(inserts, expected === 200 ? 1 : 0);
}
(async () => {
  await verifyStart(true, null, 403);
  await verifyStart(true, '2026-09-16T04:30:00Z', 403);
  await verifyStart(true, at.toISOString(), 200);
  await verifyStart(false, null, 200);
  console.log('Activity pause: status boundaries, scheduled reopening, and server admission checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
