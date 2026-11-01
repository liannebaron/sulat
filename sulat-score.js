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

  function segDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t: t };
  }
  // For each point of A, the distance to the nearest point on path B. Unlike a point-by-point comparison,
  // this does not care whether the learner's stroke is a bit longer or shorter than the guide.
  // Each result says how far, and whether the nearest spot is just the very end of B (an overshoot).
  function nearest(A, B) {
    return A.map(function (p) {
      var m = 1e9, mi = 0, mt = 0;
      for (var i = 0; i < B.length - 1; i++) {
        var r = segDist(p, B[i], B[i + 1]);
        if (r.d < m) { m = r.d; mi = i; mt = r.t; }
      }
      return { d: m, end: (mi === 0 && mt === 0) || (mi === B.length - 2 && mt === 1) };
    });
  }

  function score(ref, user, opts) {
    opts = opts || {};
    var memory = opts.mode === 'memory';
    // How far a stroke may stray, as a fraction of the glyph's size. Tracing is measured against the
    // guide itself; from memory, size and position are forgiven but the shape must hold.
    // From memory the learner has only an image in their head, so the shape may be loose as long as it is
    // clearly this letter: right strokes, order, direction and marks, and closer to this letter than to any other.
    var LIM = memory ? { mean: 0.15, p90: 0.28, minLen: 0.7 } : { mean: 0.075, p90: 0.15, minLen: 0 };
    var TIP = memory ? 0.09 : 0.055;
    // Tracing: how far the learner's line strays from the guide (user to guide), and how much of the guide
    // is left uncovered (guide to user), as fractions of glyph size. Overshooting or stopping a little
    // short is normal with a finger, so ends are not punished the way a point-by-point match would.
    var TRACE = { m1: 0.06, p1: 0.12, m2: 0.08, p2: 0.16, mark: 0.22 };
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
    // How much a stroke bends: its biggest sideways bulge from the straight line between its ends
    // (or, for a loop, how far it strays from its start), as a fraction of the glyph's size.
    function bend(p) {
      var a = p[0], c = p[p.length - 1], chord = dist(a, c), mx = 0;
      for (var q = 0; q < p.length; q++) {
        var d = chord < 0.15 * R.size ? dist(a, p[q])
          : Math.abs((c.y - a.y) * p[q].x - (c.x - a.x) * p[q].y + c.x * a.y - c.y * a.x) / chord;
        if (d > mx) { mx = d; }
      }
      return mx / R.size;
    }
    var flat = [];
    var errors = [], load = [];
    var worst = 0, worstI = 0, offGuide = false;
    for (var m = 0; m < n; m++) {
      var isMark = k && m >= n - k;
      if (isMark) {
        var moff = memory ? 0 : dist(centroid([ref[m]]), centroid([userN[m]])) / R.size;
        errors.push(moff); load.push(memory ? 0 : moff / TRACE.mark);
        if (load[m] > worst) { worst = load[m]; worstI = m; }
        continue;
      }
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
      // From memory, judge a stroke's shape separately from where it sits: a crossbar a little too high or
      // low is still a good crossbar. Placement gets its own, wider allowance.
      var sh = st, place = 0;
      if (memory) {
        var rc2 = centroid([{ pts: rr[m] }]), uc2 = centroid([{ pts: uu[m] }]);
        place = dist(rc2, uc2) / R.size;
        sh = stat(rr[m], uu[m].map(function (p) { return { x: p.x - uc2.x + rc2.x, y: p.y - uc2.y + rc2.y }; }));
      }
      var e = Math.max(sh.mean / LIM.mean, sh.p90 / LIM.p90, LIM.minLen && lenRatio < LIM.minLen ? 1.5 : 0, memory ? place / 0.3 : 0);
      if (!memory) {
        var gp = resample(ref[m].pts, 64), up = resample(userN[m].pts, 64);
        var n1 = nearest(up, gp), n2 = nearest(gp, up);
        // Running past either end of the guide is fine in moderation (a finger overshoots); a long tail is not.
        var onGuide = n1.filter(function (o) { return !o.end; });
        var overshoot = 1 - onGuide.length / n1.length;
        var d1 = (onGuide.length ? onGuide : n1).map(function (o) { return o.d; });
        var d2 = n2.map(function (o) { return o.d; });
        e = Math.max(avg(d1) / R.size / TRACE.m1, p90(d1) / R.size / TRACE.p1, avg(d2) / R.size / TRACE.m2, p90(d2) / R.size / TRACE.p2, overshoot / 0.35);
      }
      var rb = bend(rr[m]), ub = bend(uu[m]);
      if (rb > 0.06 && ub < 0.45 * rb) { flat[m] = true; e = Math.max(e, 1.5); }
      errors.push(sh.mean);
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
    // Is it clearly closer to a different letter? (From memory only; needs the other letters from the page.)
    if (memory && worst <= 1 && opts.alternatives && opts.alternatives.length) {
      var fit = function (target) {
        var Rt = bbox(target), sc = Rt.size / U2.size, tot = 0, cnt = 0;
        for (var q = 0; q < target.length; q++) {
          if (k && q >= target.length - k) { continue; }
          var a2 = resample(target[q].pts, N);
          var b2 = resample(user[q].pts.map(function (p) { return { x: (p.x - U2.cx) * sc + Rt.cx, y: (p.y - U2.cy) * sc + Rt.cy }; }), N);
          tot += Math.min(avg(distances(a2, b2)), avg(distances(a2, b2.slice().reverse()))) / Rt.size; cnt++;
        }
        return cnt ? tot / cnt : 0;
      };
      var U2 = bbox(user);
      var own0 = fit(ref), best = 1e9;
      opts.alternatives.forEach(function (alt) { if (alt.strokes.length === n) { best = Math.min(best, fit(alt.strokes)); } });
      if (own0 > 0.05 && best < own0 * 0.8) {
        return {
          pass: false, issue: 'lookalike', error: own0, transform: transform,
          message: 'That reads more like a different letter. Compare it with the guide, then try again.'
        };
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
        pass: false, issue: flat[worstI] ? 'straight' : 'shape', stroke: worstI, error: mean, strokes: strokes, transform: transform,
        message: flat[worstI]
          ? which + ' should curve more, like the guide. Compare it, then try again.'
          : which + ' drifts from the shape. ' +
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

  global.SulatScore = { score: score, resample: resample, bbox: bbox, version: 'strict-6' };
})(typeof window !== 'undefined' ? window : this);
