// Built with Muse Code.
// POST /api/intent: accepts {"text"} and calls Muse Spark 1.3 with one
// tool, start_lesson. Returns {"intent": "teach", ...} or {"intent": "other", ...}.
// The API key stays server-side in the META_API_KEY secret.
var META_URL = 'https://api.meta.ai/v1/chat/completions';
var MAX_CHARS = 500;

var STARTERS = [
  { tagalog: 'mahal kita', english: 'I love you' },
  { tagalog: 'salamat', english: 'thank you' },
  { tagalog: 'kumusta', english: 'how are you' },
  { tagalog: 'magandang umaga', english: 'good morning' },
  { tagalog: 'paalam', english: 'goodbye' }
];

var SYSTEM = 'You route spoken requests for Sulat, a Baybayin handwriting tutor. ' +
  'The learner wants to see a Tagalog word or phrase drawn in Baybayin. ' +
  'There are five starter phrases: "mahal kita" (I love you), "salamat" (thank you), ' +
  '"kumusta" (how are you), "magandang umaga" (good morning), "paalam" (goodbye). ' +
  'If the request asks how to write one of these, in English or Tagalog, call start_lesson ' +
  'with that starter spelled EXACTLY as listed, its English meaning, and source "starter". ' +
  'If the request asks how to write any other word or phrase, translate it to Tagalog yourself ' +
  'and call start_lesson with the Tagalog text, its English meaning, and source "translated". ' +
  'If the request is not about writing a word or phrase, do not call any tool; answer with one ' +
  'short friendly sentence offering to teach a Baybayin phrase.';

var TOOLS = [{
  type: 'function',
  function: {
    name: 'start_lesson',
    description: 'Open the Show me page for a Tagalog phrase.',
    parameters: {
      type: 'object',
      properties: {
        tagalog: { type: 'string', description: 'The Tagalog phrase to teach, e.g. mahal kita' },
        english: { type: 'string', description: 'The English meaning, e.g. I love you' },
        source: {
          type: 'string',
          enum: ['starter', 'translated'],
          description: '"starter" for one of the five starter phrases, otherwise "translated"'
        }
      },
      required: ['tagalog', 'english', 'source'],
      additionalProperties: false
    }
  }
}];

export async function onRequestPost(context) {
  var apiKey = context.env && context.env.META_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'The lesson service is not configured yet.' }, { status: 500 });
  }

  var body = null;
  try { body = await context.request.json(); } catch (e) { /* handled below */ }
  var text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return Response.json({ error: 'Nothing to interpret. Say which phrase to write.' }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return Response.json({ error: 'That request is too long. Try one short phrase.' }, { status: 400 });
  }

  var started = Date.now();
  var metaRes;
  try {
    metaRes = await fetch(META_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'muse-spark-1.3',
        max_completion_tokens: 3000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text }
        ],
        tools: TOOLS
      })
    });
  } catch (e) {
    return Response.json({ error: 'Could not reach the lesson service. Try again.' }, { status: 502 });
  }
  var ms = Date.now() - started;

  if (!metaRes.ok) {
    return Response.json(
      { error: 'The lesson service returned an error (' + metaRes.status + '). Try again.' },
      { status: 502 }
    );
  }
  var data = null;
  try { data = await metaRes.json(); } catch (e) { /* handled below */ }
  var msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) {
    return Response.json({ error: 'The lesson service gave no answer. Try again.' }, { status: 502 });
  }

  var calls = msg.tool_calls || [];
  if (calls.length && calls[0].function) {
    var args = {};
    try { args = JSON.parse(calls[0].function.arguments || '{}'); } catch (e) { args = {}; }
    var tagalog = String(args.tagalog || '').trim();
    var english = String(args.english || '').trim();
    var source = args.source === 'translated' ? 'translated' : 'starter';
    var hit = null;
    for (var i = 0; i < STARTERS.length; i++) {
      if (STARTERS[i].tagalog.toLowerCase() === tagalog.toLowerCase()) { hit = STARTERS[i]; break; }
    }
    if (hit) {
      tagalog = hit.tagalog;
      if (!english) { english = hit.english; }
      source = 'starter';
    }
    if (!tagalog) {
      return Response.json({ intent: 'other', reply: 'I teach Baybayin writing. Try asking "How do I write thank you?"', ms: ms });
    }
    return Response.json({ intent: 'teach', tagalog: tagalog, english: english, source: source, ms: ms });
  }

  var reply = msg.content && String(msg.content).trim()
    ? String(msg.content).trim()
    : 'I teach Baybayin writing. Try asking "How do I write thank you?"';
  return Response.json({ intent: 'other', reply: reply, ms: ms });
}
