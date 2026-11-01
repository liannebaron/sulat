// Built with Muse Code.
// POST /api/transcribe: accepts a short WAV clip, forwards it to
// Meta Muse Voice Transcribe, and returns {"text", "ms"}.
// The API key stays server-side in the META_API_KEY secret.
var META_URL = 'https://api.meta.ai/v1/asr/transcribe';
var KEYWORDS = ['mahal kita', 'salamat', 'kumusta', 'magandang umaga', 'paalam', 'Baybayin'];
var MAX_BYTES = 2 * 1024 * 1024; // ~60 s of 16 kHz mono 16-bit; the page stops at ~12 s.

export async function onRequestPost(context) {
  var apiKey = context.env && context.env.META_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'The voice service is not configured yet.' }, { status: 500 });
  }

  var audio;
  try {
    audio = await context.request.arrayBuffer();
  } catch (e) {
    return Response.json({ error: 'Could not read the audio clip.' }, { status: 400 });
  }
  if (!audio || !audio.byteLength) {
    return Response.json({ error: 'No audio received. Hold the button while you speak.' }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return Response.json({ error: 'That clip is too long. Keep it under about 12 seconds.' }, { status: 413 });
  }

  var form = new FormData();
  form.append('request', new File([JSON.stringify({
    mode: 'PUSH_TO_TALK',
    model: 'muse-voice-transcribe-1.0',
    audioEncoding: 'WAV',
    keywords: KEYWORDS
  })], 'request.json', { type: 'application/json' }));
  form.append('audio', new File([audio], 'clip.wav', { type: 'audio/wav' }));

  var started = Date.now();
  var metaRes;
  try {
    metaRes = await fetch(META_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form
    });
  } catch (e) {
    return Response.json({ error: 'Could not reach the voice service. Try again.' }, { status: 502 });
  }
  var ms = Date.now() - started;

  var data = null;
  try { data = await metaRes.json(); } catch (e) { /* non-JSON body handled below */ }
  if (!metaRes.ok) {
    return Response.json(
      { error: 'The voice service returned an error (' + metaRes.status + '). Try again.' },
      { status: 502 }
    );
  }
  var text = data && typeof data.transcript === 'string' ? data.transcript : '';
  return Response.json({ text: text, ms: ms });
}
