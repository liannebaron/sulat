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

  // Real pen and finger input is a little jittery. Left alone, that jitter makes a stroke look longer
  // than it is and throws off the point-by-point comparison, so smooth each stroke first (ends stay put).
  function clean(pts) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) { if (dist(pts[i], out[out.length - 1]) >= 3) { out.push(pts[i]); } }
    if (out.length === 1 && pts.length > 1) { out.push(pts[pts.length - 1]); }
    for (var pass = 0; pass < 3; pass++) {
      var q = out.slice();
      for (var k = 1; k < out.length - 1; k++) {
        q[k] = { x: (out[k - 1].x + out[k].x + out[k + 1].x) / 3, y: (out[k - 1].y + out[k].y + out[k + 1].y) / 3 };
      }
      out = q;
    }
    return out;
  }

  function score(ref, user, opts) {
    opts = opts || {};
    var memory = opts.mode === 'memory';
    // How far a stroke may stray, as a fraction of the glyph's size. Tracing is measured against the
    // guide itself; from memory, size and position are forgiven but the shape must hold.
    var LIM = memory ? { mean: 0.09, p90: 0.15, minLen: 0.75 } : { mean: 0.075, p90: 0.15, minLen: 0 };
    var TIP = memory ? 0.065 : 0.055;
    var n = ref.length;

    if (!user.length) {
      return { pass: false, issue: 'empty', message: 'Draw it first, then check.' };
    }
    user = user.map(function (st) { return { pts: clean(st.pts) }; });

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

    // From memory: line the attempt up with the reference (same centre, same overall size), so only
    // the shape is judged. Tracing: no alignment, because the guide is right there on the screen.
    var R = bbox(ref), U = bbox(user);
    var s = memory ? R.size / U.size : 1;
    var ucx = memory ? U.cx : R.cx, ucy = memory ? U.cy : R.cy;
    function T(p) { return { x: (p.x - ucx) * s + R.cx, y: (p.y - ucy) * s + R.cy }; }
    var userN = user.map(function (st) { return { pts: st.pts.map(T) }; });
    var transform = { s: s, ux: ucx, uy: ucy, rx: R.cx, ry: R.cy };

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

    // Per-stroke measurements, in either direction of travel.
    function distances(a, b) {
      var d = [];
      for (var q = 0; q < a.length; q++) { d.push(dist(a[q], b[q])); }
      return d;
    }
    function avg(d) { var t = 0; for (var q = 0; q < d.length; q++) { t += d[q]; } return t / d.length; }
    function p90(d) { var c = d.slice().sort(function (x, y) { return x - y; }); return c[Math.floor(0.9 * (c.length - 1))]; }
    function smooth3(p) {
      return p.map(function (pt, q) {
        var a = p[Math.max(0, q - 1)], c = p[Math.min(p.length - 1, q + 1)];
        return { x: (a.x + pt.x + c.x) / 3, y: (a.y + pt.y + c.y) / 3 };
      });
    }
    function lenOf(p) { return pathLen(smooth3(smooth3(p))); }
    function stat(a, b) {
      var f = distances(a, b), r = distances(a, b.slice().reverse());
      var forward = avg(f) <= avg(r);
      var d = forward ? f : r;
      return { mean: avg(d) / R.size, p90: p90(d) / R.size, reversed: !forward, meanF: avg(f) / R.size, meanR: avg(r) / R.size };
    }

    // 3. Stroke order: does a learner stroke match a different reference stroke much better?
    for (var i = 0; i < n; i++) {
      if (rlen[i] < 0.12) { continue; } // tiny strokes and dots: order doesn't matter much
      var own = stat(rr[i], uu[i]).mean;
      for (var j = 0; j < n; j++) {
        if (j === i || rlen[j] < 0.12) { continue; }
        var other = stat(rr[j], uu[i]).mean;
        if (other < own * 0.6 && own > LIM.mean * 0.8) {
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
    var errors = [], load = [];
    var worst = 0, worstI = 0, offGuide = false;
    for (var m = 0; m < n; m++) {
      var isDot = ref[m].pts.length < 2 || rlen[m] < 0.03;
      if (isDot) {
        // A dot or tiny mark: the side check above covers memory mode; when tracing it must sit on the guide.
        var rc = centroid([ref[m]]), uc = centroid([userN[m]]);
        var off = dist(rc, uc) / R.size;
        errors.push(off); load.push(memory ? 0 : off / 0.12);
        if (load[m] > worst) { worst = load[m]; worstI = m; }
        continue;
      }
      var st = stat(rr[m], uu[m]);
      if (st.meanF > LIM.mean * 0.8 && st.meanR < st.meanF * 0.6) {
        return {
          pass: false, issue: 'direction', stroke: m, transform: transform,
          message: 'Stroke ' + (m + 1) + ' goes the other way. Start it from ' + startWord(ref[m].pts) + '.'
        };
      }
      var lenRatio = lenOf(uu[m]) / lenOf(rr[m]);
      var e = Math.max(st.mean / LIM.mean, st.p90 / LIM.p90, LIM.minLen && lenRatio < LIM.minLen ? 1.5 : 0);
      errors.push(st.mean);
      load.push(e);
      if (e > worst) { worst = e; worstI = m; }
      if (!memory && e > 1) {
        // Right shape but away from the guide? Check it again after lining the stroke up.
        var al = stat(rr[m], resample(userN[m].pts.map(function (p) {
          var cu = bbox([{ pts: userN[m].pts }]), cr = bbox([ref[m]]);
          return { x: p.x - cu.cx + cr.cx, y: p.y - cu.cy + cr.cy };
        }), N));
        if (al.mean < LIM.mean * 0.6 && al.p90 < LIM.p90 * 0.8) { offGuide = true; }
      }
    }
    var mean = errors.reduce(function (a, b) { return a + b; }, 0) / n;
    var strokes = errors.map(function (e2, idx) { return { index: idx, error: Math.round(e2 * 1000) / 1000, load: Math.round(load[idx] * 100) / 100 }; });

    if (worst > 1) {
      var which = 'Stroke ' + (worstI + 1);
      if (offGuide) {
        return {
          pass: false, issue: 'offguide', stroke: worstI, error: mean, strokes: strokes, transform: transform,
          message: which + ' has the right shape but sits off the guide. Trace right on top of it.'
        };
      }
      return {
        pass: false, issue: 'shape', stroke: worstI, error: mean, strokes: strokes, transform: transform,
        message: which + ' drifts from the shape. ' +
          (memory ? 'Compare it with the guide, then try again.' : 'Trace closer to the guide and try again.')
      };
    }
    if (worst > TIP / (memory ? LIM.mean : LIM.mean)) {
      return {
        pass: true, issue: 'close', stroke: worstI, error: mean, strokes: strokes, transform: transform,
        message: 'Looks right!',
        tip: 'Stroke ' + (worstI + 1) + ' could follow the curve a little more closely.'
      };
    }
    return { pass: true, issue: null, error: mean, strokes: strokes, transform: transform, message: 'Looks right!' };
  }

  global.SulatScore = { score: score, resample: resample, bbox: bbox, version: 'strict-2' };
})(typeof window !== 'undefined' ? window : this);
