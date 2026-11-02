// Paper endpoint checks (built with Muse Code). Fast: stubbed Meta API, no network.
// Run from the repo root:  node tests/paper_test.js   — should end with PAPER OK.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const dir = (process.env.SULAT_DIR || require('path').join(__dirname, '..') + '/');

let metaReply = null, sentBody = null, fetchCalls = 0;
const ctx = {
  fetch: async (url, opts) => {
    fetchCalls++;
    sentBody = JSON.parse(opts.body);
    return {
      ok: metaReply.ok, status: metaReply.status || 200,
      json: async () => metaReply.json, text: async () => JSON.stringify(metaReply.json),
    };
  },
  Response: Response,
  console: console,
};
vm.createContext(ctx);
const src = fs.readFileSync(dir + 'functions/api/paper.js', 'utf8')
  .replace('export async function onRequestPost', 'async function onRequestPost');
vm.runInContext(src + '\n;this.__paper = onRequestPost;', ctx);

const post = (payload) => ctx.__paper({ env: { META_API_KEY: 'test' }, request: { json: async () => payload } })
  .then(async (res) => ({ status: res.status, json: await res.json() }));
const IMG = { photo: 'aGVsbG8=', reference: 'aGVsbG8=' };
const reply = (content, extra) => Object.assign(
  { ok: true, json: { choices: [{ message: { content: content } }] } }, extra || {});

(async () => {
  // Valid syllable: prompt names the mark, images are labeled, budget set.
  metaReply = reply('{"verdict": "almost", "tips": ["Dot sits a little left."]}');
  let r = await post({ target: 'ki', ...IMG });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(sentBody.model, 'muse-spark-1.3');
  assert.strictEqual(sentBody.max_completion_tokens, 6000);
  assert.match(sentBody.messages[0].content, /never name any syllable other than the target/);
  assert.deepStrictEqual(
    sentBody.messages[1].content.map((b) => b.type),
    ['text', 'text', 'image_url', 'text', 'image_url']);
  assert.match(sentBody.messages[1].content[0].text, /dot ABOVE/);

  // A tip naming another syllable is dropped; the target may still be named.
  metaReply = reply('{"verdict": "almost", "tips": ["This reads as ka, not ma.", "The dot sits high, and ma needs no mark."]}');
  r = await post({ target: 'ma', ...IMG });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.tips, ['The dot sits high, and ma needs no mark.']);

  // Retry with every tip dropped falls back to the generic tip.
  metaReply = reply('{"verdict": "retry", "tips": ["Wrong stroke order here.", "Looks like ka."]}');
  r = await post({ target: 'ma', ...IMG });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.tips, ['This looks like a different letter. Compare it with the reference.']);

  // The exception follows the target: nga may be named when the target is nga.
  metaReply = reply('{"verdict": "almost", "tips": ["Good nga shape here.", "Unlike ka over there."]}');
  r = await post({ target: 'nga', ...IMG });
  assert.deepStrictEqual(r.json.tips, ['Good nga shape here.']);

  // Not one syllable: rejected without calling Meta.
  fetchCalls = 0;
  r = await post({ target: 'mahal', ...IMG });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(fetchCalls, 0);

  console.log('PAPER OK');
})().catch((e) => { console.error('PAPER FAIL', e.message); process.exit(1); });
