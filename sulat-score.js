/*
  Sulat stroke scorer
  Compares a learner's strokes with the reference strokes for one syllable and
  returns a pass/fail plus ONE specific, kind correction. Deterministic: no AI.
  Default (legible-1): judges the picture. The ink must cover this letter and look more like it than any
  other, with the vowel mark on the correct side. Stroke order, direction and count are only tips.
  opts.strict = true runs the older strict-6 rules (stroke count, mark side, order, direction, shape),
  which is what the Nov 1 family study used. Exposes window.SulatScore.score(ref, user, opts).

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

  // ---------------------------------------------------------------------------------------------
  // Legibility scoring (default). Written after a Baybayin calligrapher advised that a strict stroke
  // pattern or order is not important, as long as the characters are similar enough to the historically
  // recorded forms and distinguishable from each other. So this judges the PICTURE: the ink has to land
  // on the letter, cover the letter, and look more like this letter than any other, with the marks
  // (which change the sound) on the right side. Stroke order, direction and count become gentle tips.
  // The strict scorer is still here (opts.strict = true) and is what the Nov 1 family study used.
  // ---------------------------------------------------------------------------------------------
  function scoreLegible(ref, user, opts) {
    var memory = opts.mode === 'memory';
    var LG = memory
      ? { m1: 0.075, p1: 0.17, m2: 0.075, p2: 0.17, cover: 0.12, minInk: 0.55 }
      : { m1: 0.06, p1: 0.12, m2: 0.08, p2: 0.16, cover: 0.14, minInk: 0 };
    var MARK_TRACE = 0.22;
    var n = ref.length;
    var k = opts.markStrokes && opts.markSide && n > opts.markStrokes ? opts.markStrokes : 0;
    var refBase = ref.slice(0, n - k), refMark = ref.slice(n - k);
    var R = bbox(ref), RB = bbox(refBase);

    user = user.map(function (st) { return { pts: clean(st.pts) }; });

    // Which of the learner's strokes are the mark (small ones), and which are the letter.
    var userMark = [], userBase = user.slice();
    if (k) {
      var markRel = bbox(refMark).size / RB.size;
      var smallestBase = Math.min.apply(null, refBase.map(function (st) { return bbox([st]).size / RB.size; }));
      var thr = markRel * 2.5 + 0.05;
      if (smallestBase * 0.8 > markRel * 1.3) { thr = Math.min(thr, smallestBase * 0.8); }
      // The mark is the learner's smallest stroke(s): as many as the mark has, and only if small.
      var bySize = user.map(function (st) { return { st: st, rel: bbox([st]).size / RB.size }; })
        .sort(function (a, b) { return a.rel - b.rel; });
      userBase = []; userMark = [];
      bySize.forEach(function (o, idx) { (idx < k && o.rel <= thr ? userMark : userBase).push(o.st); });
      if (!userBase.length) { userBase = user.slice(); userMark = []; }
    }
    var markName = opts.markKind === 'cross' ? 'cross' : 'dot';

    // Line the letter up with the reference (same centre and size) from memory; trace is judged where it sits.
    var U = bbox(userBase);
    var s = memory ? RB.size / U.size : 1;
    var ucx = memory ? U.cx : RB.cx, ucy = memory ? U.cy : RB.cy;
    function T(p) { return { x: (p.x - ucx) * s + RB.cx, y: (p.y - ucy) * s + RB.cy }; }
    var ubN = userBase.map(function (st) { return { pts: st.pts.map(T) }; });
    var umN = userMark.map(function (st) { return { pts: st.pts.map(T) }; });
    var transform = { s: s, ux: ucx, uy: ucy, rx: RB.cx, ry: RB.cy };

    // Marks first: they change the sound, so a missing or misplaced one is a real mistake.
    if (k) {
      var why = opts.markKind === 'cross' ? 'That’s what silences its a.'
        : (opts.markSide === 'above' ? 'That’s what turns its a into i.' : 'That’s what turns its a into u.');
      if (!umN.length) {
        return { pass: false, issue: 'mark', transform: transform,
          message: 'Add the ' + markName + ' ' + opts.markSide + ' the letter. ' + why };
      }
      if (opts.markKind === 'cross') {
        var oneLine = umN.length < 2 && pathLen(umN[0].pts) < 2.0 * Math.max(bbox(umN).size, 1);
        if (oneLine) {
          return { pass: false, issue: 'mark', transform: transform,
            message: 'The cross needs two lines, one across the other. ' + why };
        }
      }
      var c = centroid(umN), base = bbox(ubN);
      var side = c.y < base.y0 + 0.2 * base.h ? 'above' : (c.y > base.y1 - 0.2 * base.h ? 'below' : 'middle');
      if (side !== opts.markSide) {
        return { pass: false, issue: 'mark', transform: transform,
          message: (opts.markKind === 'cross' ? 'The cross' : 'The dot') + ' belongs ' + opts.markSide + ' the letter. ' + why };
      }
      if (!memory) {
        var off = dist(c, centroid(refMark)) / R.size;
        if (off > MARK_TRACE) {
          return { pass: false, issue: 'mark', transform: transform,
            message: 'The ' + markName + ' should sit on its guide. Trace it right there.' };
        }
      }
    }

    // Sample the ink: evenly spaced points along every stroke, however many strokes the learner used.
    function cloud(strokes, stepSize) {
      var out = [], step = stepSize || RB.size / 40;
      strokes.forEach(function (st) {
        var len = pathLen(st.pts);
        var m = Math.max(3, Math.round(len / step));
        resample(st.pts, m).forEach(function (p) { out.push(p); });
      });
      return out;
    }
    var rr = refBase.map(function (st) { return resample(st.pts, 40); });
    var uc = ubN.map(function (st) { return resample(st.pts, 40); });
    var ucl = cloud(ubN);
    if (!ucl.length) { return { pass: false, issue: 'shape', transform: transform, message: 'Draw the letter, then check.' }; }

    // Distance from a point to the nearest part of any stroke in a set; also whether that nearest spot
    // is just the very end of a stroke (an overshoot).
    function toSet(p, set) {
      var best = 1e9, end = false;
      for (var a = 0; a < set.length; a++) {
        var path = set[a];
        for (var i = 0; i < path.length - 1; i++) {
          var r = segDist(p, path[i], path[i + 1]);
          if (r.d < best) { best = r.d; end = (i === 0 && r.t === 0) || (i === path.length - 2 && r.t === 1); }
        }
      }
      return { d: best, end: end };
    }
    function avg(d) { var t = 0; for (var q = 0; q < d.length; q++) { t += d[q]; } return t / d.length; }
    function p90(d) { var c2 = d.slice().sort(function (x, y) { return x - y; }); return c2[Math.floor(0.9 * (c2.length - 1))]; }

    var refSet = rr, userSet = uc;
    var near1 = ucl.map(function (p) { return toSet(p, refSet); });           // learner ink -> letter
    var onLetter = near1.filter(function (o) { return !o.end; });
    var overshoot = 1 - onLetter.length / near1.length;
    var d1 = (onLetter.length ? onLetter : near1).map(function (o) { return o.d / RB.size; });
    var refCloud = cloud(refBase);
    var d2 = refCloud.map(function (p) { return toSet(p, userSet).d / RB.size; }); // letter -> learner ink

    // How well each reference stroke is covered by the ink (finds a missing stroke).
    var covered = rr.map(function (path) {
      return avg(resample(path, 24).map(function (p) { return toSet(p, userSet).d / RB.size; }));
    });
    var worstCover = 0, worstCoverI = 0;
    covered.forEach(function (v, i) { if (v > worstCover) { worstCover = v; worstCoverI = i; } });
    // A stroke is missing when most of it has no ink anywhere near it.
    var FAR = 0.09, missingI = -1, missingFrac = 0;
    rr.forEach(function (path, i) {
      var pts = resample(path, 24), far = 0;
      pts.forEach(function (p) { if (toSet(p, userSet).d / RB.size > FAR) { far++; } });
      if (far / pts.length > missingFrac) { missingFrac = far / pts.length; missingI = i; }
    });

    var load = Math.max(avg(d1) / LG.m1, p90(d1) / LG.p1, avg(d2) / LG.m2, p90(d2) / LG.p2, worstCover / LG.cover);
    if (!memory) { load = Math.max(load, overshoot / 0.35); }

    // Pair each reference stroke with the learner stroke that covers it best (any order, any direction).
    function pairCost(a, b) {
      var A = resample(a, 24), B = resample(b, 24), x = 0, y = 0, i;
      for (i = 0; i < A.length; i++) { x += toSet(A[i], [B]).d; }
      for (i = 0; i < B.length; i++) { y += toSet(B[i], [A]).d; }
      return (x + y) / (A.length + B.length) / RB.size;
    }
    var match = rr.map(function (path, i) {
      var best = -1, bc = 1e9;
      uc.forEach(function (u, j) { var cst = pairCost(path, u); if (cst < bc) { bc = cst; best = j; } });
      return { i: i, j: best, cost: bc };
    });

    // A curve drawn as a straight line is a different shape, even if the ink stays close to it.
    function bend(p) {
      var a = p[0], c2 = p[p.length - 1], chord = dist(a, c2), mx = 0;
      for (var q = 0; q < p.length; q++) {
        var d = chord < 0.15 * RB.size ? dist(a, p[q])
          : Math.abs((c2.y - a.y) * p[q].x - (c2.x - a.x) * p[q].y + c2.x * a.y - c2.y * a.x) / chord;
        if (d > mx) { mx = d; }
      }
      return mx / RB.size;
    }
    var flatI = -1, claimed = {};
    match.forEach(function (m) { claimed[m.j] = (claimed[m.j] || 0) + 1; });
    match.forEach(function (m) {
      if (claimed[m.j] > 1 || m.cost > 0.12) { return; }
      if (userBase.length !== refBase.length) { return; }   // a stroke lifted into pieces is still the same curve
      if (m.j < 0) { return; }
      var rb = bend(rr[m.i]), ub = bend(uc[m.j]);
      if (rb > 0.06 && ub < 0.45 * rb && flatI < 0) { flatI = m.i; }
    });

    // Closer to a different letter? (From memory only; the page passes the other letters.)
    if (memory && load <= 1 && flatI < 0 && opts.alternatives && opts.alternatives.length) {
      var fit = function (target) {
        var tb = target.slice(0, target.length - k), TB = bbox(tb), sc = TB.size / U.size;
        var tset = tb.map(function (st) { return resample(st.pts, 24); });
        var uset = ubN.map(function (st) {
          return resample(st.pts.map(function (p) { return { x: (p.x - RB.cx) / s * 1, y: (p.y - RB.cy) / s * 1 }; })
            .map(function (p) { return { x: (p.x) * sc + TB.cx, y: (p.y) * sc + TB.cy }; }), 24);
        });
        var cs = TB.size / 22;
        var a1 = cloud(uset.map(function (pp) { return { pts: pp }; }), cs), a2 = cloud(tb, cs);
        var x = avg(a1.map(function (p) { return toSet(p, tset).d; })), y = avg(a2.map(function (p) { return toSet(p, uset).d; }));
        return (x + y) / 2 / TB.size;
      };
      var own = fit(ref), bestAlt = 1e9;
      opts.alternatives.forEach(function (alt) { if (alt.strokes.length === n) { bestAlt = Math.min(bestAlt, fit(alt.strokes)); } });
      if (own > 0.03 && bestAlt < own * 0.8) {
        return { pass: false, issue: 'lookalike', error: own, transform: transform,
          message: 'That reads more like a different letter. Compare it with the guide, then try again.' };
      }
    }

    var mean = (avg(d1) + avg(d2)) / 2;
    var refInk = 0, userInk = 0;
    refBase.forEach(function (st) { refInk += pathLen(st.pts); });
    ubN.forEach(function (st) { userInk += pathLen(st.pts); });
    var inkRatio = userInk / refInk;
    if (missingFrac > 0.5 || inkRatio < 0.8) {
      return { pass: false, issue: 'missing', stroke: missingI, error: mean, transform: transform,
        message: 'Stroke ' + (missingI + 1) + ' looks missing or too far from the shape. ' +
          (memory ? 'Picture Show me and try again.' : 'Follow the numbers on the guide.') };
    }
    if (flatI >= 0) {
      return { pass: false, issue: 'straight', stroke: flatI, error: mean, transform: transform,
        message: 'Stroke ' + (flatI + 1) + ' should curve more, like the guide. Compare it, then try again.' };
    }
    if (load > 1) {
      var what;
      if (worstCover / LG.cover >= 1 && worstCover / LG.cover >= load * 0.99) {
        what = 'Stroke ' + (worstCoverI + 1) + ' looks missing or too far from the shape. ' +
          (memory ? 'Picture Show me and try again.' : 'Follow the numbers on the guide.');
        return { pass: false, issue: 'missing', stroke: worstCoverI, error: mean, transform: transform, message: what };
      }
      if (!memory && overshoot / 0.35 >= load * 0.99) {
        return { pass: false, issue: 'shape', error: mean, transform: transform,
          message: 'Part of your line runs past the guide. Stay on the guide and try again.' };
      }
      var offG = false;
      if (!memory) {
        // Right shape but away from the guide? Line the ink up and look again.
        var UB = bbox(ubN), sh2 = ubN.map(function (st) { return { pts: st.pts.map(function (p) { return { x: p.x - UB.cx + RB.cx, y: p.y - UB.cy + RB.cy }; }) }; });
        var cl2 = cloud(sh2), e1 = cl2.map(function (p) { return toSet(p, refSet).d / RB.size; });
        var e2 = refCloud.map(function (p) { return toSet(p, sh2.map(function (st) { return resample(st.pts, 40); })).d / RB.size; });
        if (avg(e1) < LG.m1 * 0.7 && avg(e2) < LG.m2 * 0.7) { offG = true; }
      }
      if (offG) {
        return { pass: false, issue: 'offguide', error: mean, transform: transform,
          message: 'That has the right shape but sits off the guide. Trace right on top of it.' };
      }
      return { pass: false, issue: 'shape', error: mean, transform: transform,
        message: 'That drifts from the shape. ' + (memory ? 'Compare it with the guide, then try again.' : 'Trace closer to the guide and try again.') };
    }

    // It reads fine. Offer ONE gentle tip about the usual way, never a failure.
    var tip = '';
    var strokeRel = function (st) { return pathLen(st.pts) / RB.size; };
    var used = {};
    var big = match.filter(function (m) { return m.j >= 0 && m.cost < 0.2 && strokeRel(refBase[m.i]) >= 0.12; });
    var reversedAt = -1;
    big.forEach(function (m) {
      var a = resample(refBase[m.i].pts, 32), b = resample(ubN[m.j].pts, 32), f = 0, rv = 0;
      for (var q = 0; q < 32; q++) { f += dist(a[q], b[q]); rv += dist(a[q], b[31 - q]); }
      f /= 32 * RB.size; rv /= 32 * RB.size;
      if (reversedAt < 0 && f > 0.12 && rv < f * 0.6) { reversedAt = m.i; }
    });
    if (reversedAt >= 0) {
      tip = 'Tip: stroke ' + (reversedAt + 1) + ' is usually written from ' + startWord(refBase[reversedAt].pts) + '. Yours reads fine either way.';
    } else if (userBase.length !== refBase.length) {
      tip = 'Tip: Show me writes the letter in ' + refBase.length + (refBase.length === 1 ? ' stroke' : ' strokes') + '. Yours reads fine.';
    } else {
      var seq = big.map(function (m) { return m.j; });
      var inOrder = seq.every(function (v, i2) { return i2 === 0 || v > seq[i2 - 1]; });
      if (!inOrder) { tip = 'Tip: Show me writes the strokes in a different order. Yours reads fine.'; }
    }
    if (!tip && load > 0.8) { tip = 'Tip: you could follow the curves a little more closely.'; }
    var out = { pass: true, issue: tip ? 'tip' : null, error: mean, transform: transform, message: 'Looks right!' };
    if (tip) { out.tip = tip; }
    return out;
  }

  function score(ref, user, opts) {
    opts = opts || {};
    if (!opts.strict) {
      if (!user.length) { return { pass: false, issue: 'empty', message: 'Draw it first, then check.' }; }
      return scoreLegible(ref, user, opts);
    }
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

  global.SulatScore = { score: score, resample: resample, bbox: bbox, version: 'legible-1' };
})(typeof window !== 'undefined' ? window : this);
