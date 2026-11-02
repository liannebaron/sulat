// Room endpoint checks (built with Muse Code). Fast: stubbed D1, no network.
// Run from the repo root:  node tests/room_test.js   — should end with ROOM OK.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const dir = (process.env.SULAT_DIR || require('path').join(__dirname, '..') + '/');

// Minimal in-memory D1 stand-in: only the statements room.js uses.
function fakeDB() {
  const rows = new Map();
  let created = false;
  const api = {
    rows,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      const runner = (args) => ({
        first: async () => {
          if (q.startsWith('SELECT')) {
            if (!created) { throw new Error('no such table: rooms'); }
            const r = rows.get(args[0]); return r ? { ...r } : null;
          }
          return null;
        },
        run: async () => {
          if (q.startsWith('CREATE TABLE')) { created = true; return { success: true }; }
          if (q.startsWith('DELETE')) {
            for (const [k, r] of rows) { if (r.updated_at < args[0]) { rows.delete(k); } }
            return { success: true };
          }
          if (q.startsWith('INSERT')) {
            // bind order: code, id, target, now, id, target, now
            rows.set(args[0], { code: args[0], cmd_id: args[1], cmd_target: args[2], verdict: null, tips: null, ms: null, updated_at: args[3] });
            return { success: true };
          }
          if (q.startsWith('UPDATE')) {
            const r = rows.get(args[4]);
            if (r) { r.verdict = args[0]; r.tips = args[1]; r.ms = args[2]; r.updated_at = args[3]; }
            return { success: true };
          }
          throw new Error('stub: unhandled SQL: ' + q.slice(0, 60));
        },
      });
      return { bind: (...args) => runner(args), run: () => runner([]).run(), first: () => runner([]).first() };
    },
  };
  return api;
}

const ctx = { Response: Response, console: console, crypto: require('crypto'), URL: URL };
vm.createContext(ctx);
const src = fs.readFileSync(dir + 'functions/api/room.js', 'utf8')
  .replace('export async function onRequestGet', 'async function onRequestGet')
  .replace('export async function onRequestPost', 'async function onRequestPost');
vm.runInContext(src + '\n;this.__room = { onRequestGet, onRequestPost };', ctx);

let db;
function resetDB() { db = fakeDB(); }
const get = (code) => ctx.__room.onRequestGet({ env: { DB: db }, request: { url: 'https://x.test/api/room?code=' + encodeURIComponent(code) } })
  .then(async (res) => ({ status: res.status, json: await res.json() }));
const post = (payload) => ctx.__room.onRequestPost({ env: { DB: db }, request: { json: async () => payload } })
  .then(async (res) => ({ status: res.status, json: await res.json() }));

(async () => {
  resetDB();

  // Unknown code: empty room, not an error.
  let r = await get('4821');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json, { code: '4821', command: null, result: null });

  // Bad codes and actions rejected.
  for (const bad of ['ab', 'toolongcode99', 'a b1', '']) {
    r = await get(bad);
    assert.strictEqual(r.status, 400, JSON.stringify(bad));
  }
  r = await post({ code: '4821', action: 'nap' });
  assert.strictEqual(r.status, 400);
  r = await post({ code: '4821', action: 'capture', target: 'mahal kita' });
  assert.strictEqual(r.status, 400, 'multi-syllable target rejected');

  // Capture creates a command id and clears any previous result.
  r = await post({ code: '4821', action: 'capture', target: 'ki' });
  assert.strictEqual(r.status, 200);
  const id1 = r.json.command.id;
  assert.ok(id1 && typeof id1 === 'string');
  r = await get('4821');
  assert.deepStrictEqual(r.json.command, { id: id1, target: 'ki' });
  assert.strictEqual(r.json.result, null);

  // Result for a stale id is rejected, not stored.
  r = await post({ code: '4821', action: 'result', id: 'nope', verdict: 'good', tips: [], ms: 1 });
  assert.strictEqual(r.status, 409);
  r = await get('4821');
  assert.strictEqual(r.json.result, null);

  // Bad verdicts and tips rejected.
  r = await post({ code: '4821', action: 'result', id: id1, verdict: 'great', tips: [], ms: 1 });
  assert.strictEqual(r.status, 400);
  r = await post({ code: '4821', action: 'result', id: id1, verdict: 'good', tips: 'nice', ms: 1 });
  assert.strictEqual(r.status, 400);

  // Matching result stores and reads back.
  r = await post({ code: '4821', action: 'result', id: id1, verdict: 'almost', tips: ['Dot sits left.'], ms: 6123.7 });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.result, { id: id1, verdict: 'almost', tips: ['Dot sits left.'], ms: 6124 });
  r = await get('4821');
  assert.deepStrictEqual(r.json, { code: '4821', command: { id: id1, target: 'ki' }, result: r.json.result });

  // A new capture clears the old result.
  r = await post({ code: '4821', action: 'capture', target: 'ma' });
  assert.strictEqual(r.status, 200);
  assert.notStrictEqual(r.json.command.id, id1, 'new command id minted');
  r = await get('4821');
  assert.strictEqual(r.json.result, null);

  // Rooms older than 24h are swept on write; missing DB is a 500.
  db.rows.set('OLD9', { code: 'OLD9', cmd_id: 'x', cmd_target: 'ma', verdict: null, tips: null, ms: null, updated_at: Date.now() - 25 * 3600 * 1000 });
  await post({ code: '4821', action: 'capture', target: 'ta' });
  r = await get('OLD9');
  assert.deepStrictEqual(r.json, { code: 'OLD9', command: null, result: null }, 'old room swept');
  r = await ctx.__room.onRequestGet({ env: {}, request: { url: 'https://x.test/api/room?code=4821' } }).then(async (res) => res.status);
  assert.strictEqual(r, 500);

  console.log('ROOM OK');
})().catch((e) => { console.error('ROOM FAIL', e.message); process.exit(1); });
