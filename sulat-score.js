/*
  Sulat stroke scorer
  Compares a learner's strokes with the reference strokes for one syllable and
  returns a pass/fail plus ONE specific, kind correction. Deterministic: no AI.
  Checks, in priority order: stroke count, vowel-mark side, stroke order,
  stroke direction, then shape. Exposes window.SulatScore.score(ref, user, opts).

  ref:  [{ pts: [{x, y}, ...] }, ...]   reference strokes, in drawing order
  user: [{ pts: [{x, y}, ...] }, ...]   learner strokes, same coordinate units
  opts: { mode: 'trace' | 'memory', markStrokes: k, markSide: 'above' | 'below',
          markKind: 'dot' | 'cross', pass: 0.14, close: 0.20 }
*/
(function (global) {
  'use strict';

  var N = 32;

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  function pathLen(p) {
    var L = 0;
    for (var i = 1; i < p.length; i++) { L += dist(p[i - 1], p[i]); }
    return L;
  }

  // Evenly spaced points along a stroke (the classic $1 recognizer resample).
  function resample(pts, n) {
    var out = [];
    if (pts.length < 2 || pathLen(pts) === 0) {
      for (var k = 0; k < n; k++) { out.push({ x: pts[0].x, y: pts[0].y }); }
      return out;
    }
    var step = pathLen(pts) / (n - 1);
    var q = pts.map(function (p) { return { x: p.x, y: p.y }; });
    var D = 0;
    out.push({ x: q[0].x, y: q[0].y });
    for (var j = 1; j < q.length; j++) {
      var d = dist(q[j - 1], q[j]);
      if (d > 0 && D + d >= step) {
        var t = (step - D) / d;
        var nq = { x: q[j - 1].x + t * (q[j].x - q[j - 1].x), y: q[j - 1].y + t * (q[j].y - q[j - 1].y) };
        out.push(nq);
        q.splice(j, 0, nq);
        D = 0;
      } else { D += d; }
      if (out.length === n) { break; }
    }
    while (out.length < n) { out.push({ x: q[q.length - 1].x, y: q[q.length - 1].y }); }
    return out;
  }

  function bbox(strokes) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    strokes.forEach(function (s) {
      s.pts.forEach(function (p) {
        if (p.x < b.x0) { b.x0 = p.x; }
        if (p.x > b.x1) { b.x1 = p.x; }
        if (p.y < b.y0) { b.y0 = p.y; }
        if (p.y > b.y1) { b.y1 = p.y; }
      });
    });
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
    b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2;
    b.size = Math.max(b.w, b.h) || 1;
    return b;
  }

  function meanDist(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) { s += dist(a[i], b[i]); }
    return s / a.length;
  }

  function centroid(strokes) {
    var x = 0, y = 0, n = 0;
    strokes.forEach(function (s) { s.pts.forEach(function (p) { x += p.x; y += p.y; n++; }); });
    return { x: x / n, y: y / n };
  }

  // Which way a reference stroke starts, in words a learner understands.
  function startWord(pts) {
    var a = pts[0], b = pts[Math.min(pts.length - 1, Math.max(1, Math.floor(pts.length / 4)))];
    var dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) { return dx > 0 ? 'the left' : 'the right'; }
    return dy > 0 ? 'the top' : 'the bottom';
  }

  function score(ref, user, opts) {
    opts = opts || {};
    var passT = opts.pass != null ? opts.pass : 0.14;
    var closeT = opts.close != null ? opts.close : 0.22;
    var memory = opts.mode === 'memory';
    var n = ref.length;

    if (!user.length) {
      return { pass: false, issue: 'empty', message: 'Draw it first, then check.' };
    }

    // 1. Stroke count
    if (user.length !== n) {
      var more = user.length > n;
      var msg;
      if (more) {
        msg = 'You used ' + user.length + ' strokes, but this one has ' + n + '. Try drawing each line in one go.';
      } else {
        msg = 'This one has ' + n + ' strokes, and you drew ' + user.length + '. ' +
          (memory ? 'Picture Show me and try again.' : 'Follow the numbers on the guide.');
      }
      return { pass: false, issue: 'count', expected: n, got: user.length, message: msg };
    }

    // Align the learner's attempt with the reference: same centre, same overall size.
    var R = bbox(ref), U = bbox(user);
    var s = R.size / U.size;
    function T(p) { return { x: (p.x - U.cx) * s + R.cx, y: (p.y - U.cy) * s + R.cy }; }
    var userN = user.map(function (st) { return { pts: st.pts.map(T) }; });
    var transform = { s: s, ux: U.cx, uy: U.cy, rx: R.cx, ry: R.cy };

    // 2. Vowel mark on the correct side (this changes the sound, so it comes first)
    var k = opts.markStrokes || 0;
    if (k && opts.markSide && n > k) {
      // If the "mark" strokes are letter-sized, the learner drew the mark first: that's order, not side.
      var refMark = bbox(ref.slice(n - k)).size / R.size;
      var userMark = bbox(userN.slice(n - k)).size / R.size;
      if (userMark > refMark * 2.5 + 0.05) {
        var markName = opts.markKind === 'cross' ? 'cross' : 'dot';
        return {
          pass: false, issue: 'order', transform: transform,
          message: 'Write the letter first, then add the ' + markName + '.'
        };
      }
      var base = bbox(userN.slice(0, n - k));
      var c = centroid(userN.slice(n - k));
      var side = c.y < base.y0 + 0.2 * base.h ? 'above' : (c.y > base.y1 - 0.2 * base.h ? 'below' : 'middle');
      if (side !== opts.markSide) {
        var what = opts.markKind === 'cross' ? 'The cross' : 'The dot';
        var why = opts.markKind === 'cross' ? 'That’s what silences its a.'
          : (opts.markSide === 'above' ? 'That’s what turns its a into i.' : 'That’s what turns its a into u.');
        return {
          pass: false, issue: 'mark', transform: transform,
          message: what + ' belongs ' + opts.markSide + ' the letter. ' + why
        };
      }
    }

    var rr = ref.map(function (st) { return resample(st.pts, N); });
    var uu = userN.map(function (st) { return resample(st.pts, N); });
    var rlen = ref.map(function (st) { return pathLen(st.pts) / R.size; });

    // 3. Stroke order: does a learner stroke match a different reference stroke much better?
    for (var i = 0; i < n; i++) {
      if (rlen[i] < 0.12) { continue; } // tiny strokes and dots: order doesn't matter much
      var own = Math.min(meanDist(uu[i], rr[i]), meanDist(uu[i].slice().reverse(), rr[i]));
      for (var j = 0; j < n; j++) {
        if (j === i || rlen[j] < 0.12) { continue; }
        var other = Math.min(meanDist(uu[i], rr[j]), meanDist(uu[i].slice().reverse(), rr[j]));
        if (other < own * 0.6 && own / R.size > passT) {
          return {
            pass: false, issue: 'order', transform: transform,
            message: memory
              ? 'Close, but the strokes came in a different order. Start with the one from Show me.'
              : 'Check the order: draw stroke ' + (j + 1) + ' where you drew stroke ' + (i + 1) + '. Follow the numbers.'
          };
        }
      }
    }

    // 4. Direction, then 5. shape
    var errors = [];
    var worst = 0, worstI = 0;
    for (var m = 0; m < n; m++) {
      var fwd = meanDist(uu[m], rr[m]) / R.size;
      var rev = meanDist(uu[m].slice().reverse(), rr[m]) / R.size;
      var dot = ref[m].pts.length < 2 || rlen[m] < 0.03;
      if (!dot && fwd > passT && rev < fwd * 0.6) {
        return {
          pass: false, issue: 'direction', stroke: m, transform: transform,
          message: 'Stroke ' + (m + 1) + ' goes the other way. Start it from ' + startWord(ref[m].pts) + '.'
        };
      }
      errors.push(fwd);
      if (fwd > worst) { worst = fwd; worstI = m; }
    }
    var mean = errors.reduce(function (a, b) { return a + b; }, 0) / n;
    var strokes = errors.map(function (e, idx) { return { index: idx, error: Math.round(e * 1000) / 1000 }; });

    if (worst > closeT) {
      return {
        pass: false, issue: 'shape', stroke: worstI, error: mean, strokes: strokes, transform: transform,
        message: 'Stroke ' + (worstI + 1) + ' drifts from the shape. ' +
          (memory ? 'Compare it with the guide, then try again.' : 'Trace closer to the guide and try again.')
      };
    }
    if (worst > passT) {
      return {
        pass: true, issue: 'close', stroke: worstI, error: mean, strokes: strokes, transform: transform,
        message: 'Looks right!',
        tip: 'Stroke ' + (worstI + 1) + ' could follow the curve a little more closely.'
      };
    }
    return { pass: true, issue: null, error: mean, strokes: strokes, transform: transform, message: 'Looks right!' };
  }

  global.SulatScore = { score: score, resample: resample, bbox: bbox };
})(typeof window !== 'undefined' ? window : this);
