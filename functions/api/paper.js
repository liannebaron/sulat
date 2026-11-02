// Built with Muse Code.
// POST /api/paper: accepts {"target", "photo", "reference"}, asks Muse Spark 1.3
// to judge one handwritten Baybayin syllable against a reference image.
// Advisory only: verdict + up to 2 kind tips. Never stores or logs images.
// The API key stays server-side in the META_API_KEY secret.
var META_URL = 'https://api.meta.ai/v1/chat/completions';
var MAX_CHARS = 8;
var MAX_B64 = 2000000;

// Mirrors sulat-engine.js so the target is validated as one buildable syllable
// and the prompt can name the expected vowel mark. Keep in sync with the engine.
var CONSONANT = {
  b: 'ba', k: 'ka', d: 'da', r: 'da', g: 'ga', h: 'ha', l: 'la', m: 'ma',
  n: 'na', ng: 'nga', p: 'pa', s: 'sa', t: 'ta', w: 'wa', y: 'ya'
};
var VOWEL_GLYPH = { a: 'a', e: 'i', i: 'i', o: 'u', u: 'u' };
var VOWEL_MARK = { a: null, e: 'mark-i', i: 'mark-i', o: 'mark-u', u: 'mark-u' };
var FOLD = { c: 'k', f: 'p', v: 'b', j: 'dy', q: 'k', x: 'ks', z: 's' };
var BASE_GLYPHS = ['a', 'i', 'u', 'ba', 'ka', 'da', 'ga', 'ha', 'la', 'ma', 'na', 'nga', 'pa', 'sa', 'ta', 'wa', 'ya'];

function syllabifyOne(word) {
  var s = String(word || '').toLowerCase();
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (FOLD[ch]) { out += FOLD[ch]; }
    else if (ch >= 'a' && ch <= 'z') { out += ch; }
    else { return null; }
  }
  var tokens = [];
  var j = 0;
  while (j < out.length) {
    var cons = null;
    if (out.substr(j, 2) === 'ng') { cons = 'ng'; j += 2; }
    else if (CONSONANT[out.charAt(j)]) { cons = out.charAt(j); j += 1; }
    else if (VOWEL_GLYPH[out.charAt(j)]) { tokens.push({ base: VOWEL_GLYPH[out.charAt(j)], mark: null }); j += 1; continue; }
    else { return null; }
    var v = out.charAt(j);
    if (v && Object.prototype.hasOwnProperty.call(VOWEL_MARK, v)) {
      tokens.push({ base: CONSONANT[cons], mark: VOWEL_MARK[v] });
      j += 1;
    } else {
      tokens.push({ base: CONSONANT[cons], mark: 'mark-virama' });
    }
  }
  if (tokens.length !== 1 || BASE_GLYPHS.indexOf(tokens[0].base) < 0) { return null; }
  return tokens[0];
}

function markText(tok) {
  if (tok.mark === 'mark-i') { return 'a dot ABOVE the letter (this turns its "a" into "i" or "e")'; }
  if (tok.mark === 'mark-u') { return 'a dot BELOW the letter (this turns its "a" into "u" or "o")'; }
  if (tok.mark === 'mark-virama') { return 'a cross BELOW the letter (this silences its "a")'; }
  return 'no mark (the letter already carries its "a" sound, or it is a standalone vowel)';
}

function cleanB64(s) {
  s = String(s || '');
  var m = s.match(/^data:image\/[a-z]+;base64,(.*)$/);
  if (m) { s = m[1]; }
  return s.replace(/\s+/g, '');
}

function parseVerdict(text) {
  var t = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  var start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start < 0 || end <= start) { return null; }
  var obj = null;
  try { obj = JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
  if (!obj || (obj.verdict !== 'good' && obj.verdict !== 'almost' && obj.verdict !== 'retry')) { return null; }
  var banned = /\b(order|direction|clockwise|stroke count|number of strokes|how many strokes)\b/i;
  var tips = Array.isArray(obj.tips)
    ? obj.tips.filter(function (x) { return typeof x === 'string' && x.trim() && !banned.test(x); }).slice(0, 2)
    : [];
  return { verdict: obj.verdict, tips: tips };
}

export async function onRequestPost(context) {
  var apiKey = context.env && context.env.META_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'The paper service is not configured yet.' }, { status: 500 });
  }

  var body = null;
  try { body = await context.request.json(); } catch (e) { /* handled below */ }
  var target = body && typeof body.target === 'string' ? body.target.trim() : '';
  var photo = body ? cleanB64(body.photo) : '';
  var reference = body ? cleanB64(body.reference) : '';
  if (!target || target.length > MAX_CHARS) {
    return Response.json({ error: 'Send one Baybayin syllable as "target", e.g. "ki".' }, { status: 400 });
  }
  var tok = syllabifyOne(target);
  if (!tok) {
    return Response.json({ error: '"' + target + '" is not one Baybayin syllable. Try one, e.g. "ma" or "ki".' }, { status: 400 });
  }
  if (!photo || !reference) {
    return Response.json({ error: 'Send both "photo" and "reference" images as base64.' }, { status: 400 });
  }
  if (photo.length > MAX_B64 || reference.length > MAX_B64) {
    return Response.json({ error: 'An image is too large. Keep each under about 1 MB.' }, { status: 413 });
  }

  var system = 'You give gentle feedback on Baybayin handwriting practice. ' +
    'You are given the TARGET syllable and a REFERENCE image drawn with correct strokes. ' +
    'You are NEVER asked which glyph you see; the target is already known. ' +
    'Normal handwriting varies: ignore size, slant, and proportions. ' +
    'Stroke order, stroke direction, and the number of strokes DO NOT matter. ' +
    'Judge only whether the handwritten character is clear and distinguishable from other Baybayin characters. ' +
    'The one thing that must be right is the vowel mark, because it changes the sound. ' +
    'Be kind and specific. Never mention stroke order, stroke direction, or stroke count. ' +
    'Reply with JSON only: {"verdict": "good" | "almost" | "retry", "tips": ["...", "..."]}, ' +
    'with at most 2 short tips. No other text. ' +
    'Verdicts: "good" means it clearly reads as the target with the right mark. ' +
    '"almost" means it reads as the target but one part could be clearer (say which in a tip). ' +
    '"retry" means it reads as a different character, a part is missing, ' +
    'or the vowel mark is missing or on the wrong side.';
  var photoUrl = 'data:' + (photo.indexOf('iVBO') === 0 ? 'image/png' : 'image/jpeg') + ';base64,' + photo;
  var userText = 'The target syllable is "' + target.toLowerCase() + '". ' +
    'The expected vowel mark is ' + markText(tok) + '. ' +
    'Is the handwritten character clear, with the expected mark? Reply with JSON only.';

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
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'text', text: 'Image 1, the learner\'s handwriting:' },
              { type: 'image_url', image_url: { url: photoUrl } },
              { type: 'text', text: 'Image 2, the correct reference:' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,' + reference } }
            ]
          }
        ]
      })
    });
  } catch (e) {
    return Response.json({ error: 'Could not reach the paper service. Try again.' }, { status: 502 });
  }
  var ms = Date.now() - started;

  if (!metaRes.ok) {
    var detail = '';
    try { detail = await metaRes.text(); } catch (e) { /* ignore */ }
    return Response.json(
      { error: 'The paper service returned an error (' + metaRes.status + ').', detail: detail.slice(0, 500), ms: ms },
      { status: 502 }
    );
  }
  var data = null;
  try { data = await metaRes.json(); } catch (e) { /* handled below */ }
  var msg = data && data.choices && data.choices[0] && data.choices[0].message;
  var content = '';
  if (msg) {
    if (typeof msg.content === 'string') { content = msg.content; }
    else if (Array.isArray(msg.content)) {
      content = msg.content.map(function (p) {
        if (typeof p === 'string') { return p; }
        return p && typeof p.text === 'string' ? p.text : '';
      }).join('\n');
    }
  }
  var parsed = parseVerdict(content);
  if (!parsed) {
    return Response.json({ error: 'The feedback came back unclear. Try again with a sharper photo.', ms: ms }, { status: 502 });
  }
  return Response.json({ verdict: parsed.verdict, tips: parsed.tips, ms: ms });
}
