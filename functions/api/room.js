// Built with Muse Code.
// Shared-room API for the glasses loop: the glasses post capture commands,
// the desk-camera phone posts results, both poll this room. D1 binding env.DB.
// Rooms older than 24 hours are deleted on every write. No secrets involved.

function bad(msg, status) {
  return Response.json({ error: msg }, { status: status || 400 });
}

function normCode(code) {
  var c = String(code || '').trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(c) ? c : null;
}

function ensureSchema(db) {
  return db.prepare(
    'CREATE TABLE IF NOT EXISTS rooms (' +
    'code TEXT PRIMARY KEY, cmd_id TEXT, cmd_target TEXT, ' +
    'verdict TEXT, tips TEXT, ms INTEGER, updated_at INTEGER)'
  ).run();
}

function sweepOld(db, now) {
  return db.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
}

function toRoom(code, row) {
  return {
    code: code,
    command: row && row.cmd_id ? { id: row.cmd_id, target: row.cmd_target } : null,
    result: row && row.verdict
      ? { id: row.cmd_id, verdict: row.verdict, tips: JSON.parse(row.tips || '[]'), ms: row.ms }
      : null
  };
}

export async function onRequestGet(context) {
  var db = context.env && context.env.DB;
  if (!db) { return Response.json({ error: 'Room storage is not configured.' }, { status: 500 }); }
  var code = null;
  try { code = new URL(context.request.url).searchParams.get('code'); } catch (e) { /* handled below */ }
  code = normCode(code);
  if (!code) { return bad('Send a room code of 4 to 8 letters or digits, e.g. ?code=4821.'); }
  var row = await db.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
  return Response.json(toRoom(code, row));
}

export async function onRequestPost(context) {
  var db = context.env && context.env.DB;
  if (!db) { return Response.json({ error: 'Room storage is not configured.' }, { status: 500 }); }
  var body = null;
  try { body = await context.request.json(); } catch (e) { /* handled below */ }
  var code = body ? normCode(body.code) : null;
  if (!code) { return bad('Send a room code of 4 to 8 letters or digits.'); }
  var action = body && body.action;
  if (action !== 'capture' && action !== 'result') { return bad('Send action "capture" or "result".'); }

  await ensureSchema(db);
  var now = Date.now();
  await sweepOld(db, now);

  if (action === 'capture') {
    var target = body && typeof body.target === 'string' ? body.target.trim().toLowerCase() : '';
    if (!/^[a-z]{1,8}$/.test(target)) { return bad('Send one syllable as target, e.g. "ki".'); }
    var id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : 'cmd' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    await db.prepare(
      'INSERT INTO rooms (code, cmd_id, cmd_target, verdict, tips, ms, updated_at) ' +
      'VALUES (?, ?, ?, NULL, NULL, NULL, ?) ' +
      'ON CONFLICT(code) DO UPDATE SET cmd_id = ?, cmd_target = ?, verdict = NULL, tips = NULL, ms = NULL, updated_at = ?'
    ).bind(code, id, target, now, id, target, now).run();
    return Response.json({ code: code, command: { id: id, target: target } });
  }

  // action === 'result'
  var rid = body && typeof body.id === 'string' ? body.id : '';
  var verdict = body && body.verdict;
  var tips = body && body.tips;
  var ms = body && body.ms;
  if (!rid) { return bad('Send the command id this result answers.'); }
  if (verdict !== 'good' && verdict !== 'almost' && verdict !== 'retry') {
    return bad('Verdict must be "good", "almost" or "retry".');
  }
  if (!Array.isArray(tips) || tips.some(function (t) { return typeof t !== 'string'; })) {
    return bad('Tips must be an array of up to 2 strings.');
  }
  if (typeof ms !== 'number' || !(ms >= 0)) { return bad('ms must be a number.'); }
  var row = await db.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
  if (!row || row.cmd_id !== rid) {
    return Response.json({ error: 'That command is no longer current.' }, { status: 409 });
  }
  await db.prepare(
    'UPDATE rooms SET verdict = ?, tips = ?, ms = ?, updated_at = ? WHERE code = ?'
  ).bind(verdict, JSON.stringify(tips.slice(0, 2)), Math.round(ms), now, code).run();
  return Response.json({ code: code, result: { id: rid, verdict: verdict, tips: tips.slice(0, 2), ms: Math.round(ms) } });
}
