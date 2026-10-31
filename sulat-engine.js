/*
  Sulat engine
  Turns a phrase into Baybayin glyphs drawn from a hand-recorded stroke pack,
  lays them out with their vowel marks, and animates every stroke in the order
  it was drawn. No dependencies. Exposes window.Sulat.
*/
(function (global) {
  'use strict';

  /* ---------- 1. Phrase to syllables ---------- */

  var VOWEL_GLYPH = { a: 'a', e: 'i', i: 'i', o: 'u', u: 'u' };
  var VOWEL_MARK = { a: null, e: 'mark-i', i: 'mark-i', o: 'mark-u', u: 'mark-u' };
  var CONSONANT = {
    b: 'ba', k: 'ka', d: 'da', r: 'da', g: 'ga', h: 'ha', l: 'la', m: 'ma',
    n: 'na', ng: 'nga', p: 'pa', s: 'sa', t: 'ta', w: 'wa', y: 'ya'
  };
  // Letters Baybayin has no glyph for, folded to the nearest sound.
  var FOLD = { c: 'k', f: 'p', v: 'b', j: 'dy', q: 'k', x: 'ks', z: 's' };
  // Words with a conventional spelling that the rules would get wrong.
  var SPECIAL = { mga: [{ base: 'ma', mark: null, text: 'ma' }, { base: 'nga', mark: null, text: 'nga' }] };

  function normalize(text) {
    var s = String(text || '').toLowerCase().replace(/\u00f1/g, 'ny');
    if (s.normalize) { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (FOLD[ch]) { out += FOLD[ch]; }
      else if (ch >= 'a' && ch <= 'z') { out += ch; }
      else if (/[\s\-]/.test(ch)) { out += ' '; }
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function syllabifyWord(word) {
    if (SPECIAL[word]) {
      return SPECIAL[word].map(function (t) { return { base: t.base, mark: t.mark, text: t.text }; });
    }
    var tokens = [];
    var i = 0;
    while (i < word.length) {
      var c = word.charAt(i);
      var cons = null;
      if (word.substr(i, 2) === 'ng') { cons = 'ng'; i += 2; }
      else if (CONSONANT[c]) { cons = c; i += 1; }
      else if (VOWEL_GLYPH[c]) { tokens.push({ base: VOWEL_GLYPH[c], mark: null, text: c }); i += 1; continue; }
      else { i += 1; continue; }
      var v = word.charAt(i);
      if (v && Object.prototype.hasOwnProperty.call(VOWEL_MARK, v)) {
        tokens.push({ base: CONSONANT[cons], mark: VOWEL_MARK[v], text: cons + v });
        i += 1;
      } else {
        // A consonant with no vowel after it: the cross silences its built-in "a".
        tokens.push({ base: CONSONANT[cons], mark: 'mark-virama', text: cons });
      }
    }
    return tokens;
  }

  function syllabify(text) {
    return normalize(text).split(' ').filter(Boolean).map(function (w) {
      return { text: w, tokens: syllabifyWord(w) };
    });
  }

  // A plain-language explanation of one syllable, for lesson cards.
  function describe(token) {
    var base = token.base;
    if (token.mark === null && VOWEL_GLYPH[token.text]) {
      return token.text + ': the vowel on its own';
    }
    if (token.mark === 'mark-i') { return token.text + ': ' + base + ' with a dot above, which turns its a into i or e'; }
    if (token.mark === 'mark-u') { return token.text + ': ' + base + ' with a dot below, which turns its a into u or o'; }
    if (token.mark === 'mark-virama') { return token.text + ': ' + base + ' with a cross below, which silences its a'; }
    return token.text + ': the letter ' + base + ' (every letter already carries an a)';
  }

  /* ---------- 2. Geometry and layout ---------- */

  function sized(b) {
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
    b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2;
    return b;
  }

  function boxOfStrokes(strokes) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    strokes.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p[0] < b.x0) { b.x0 = p[0]; }
        if (p[0] > b.x1) { b.x1 = p[0]; }
        if (p[1] < b.y0) { b.y0 = p[1]; }
        if (p[1] > b.y1) { b.y1 = p[1]; }
      });
    });
    return sized(b);
  }

  function box(pack, id) {
    if (!pack.__boxes) { Object.defineProperty(pack, '__boxes', { value: {}, enumerable: false }); }
    if (!pack.__boxes[id]) { pack.__boxes[id] = boxOfStrokes(pack.glyphs[id].strokes); }
    return pack.__boxes[id];
  }

  // Where a mark sits on a given letter. Marks were drawn against a reference
  // letter (usually ka). We keep the same horizontal offset (scaled to the new
  // letter's width) and the same gap above or below, never closer than minGap.
  function markOffset(pack, baseBox, markId, minGap) {
    var m = pack.glyphs[markId];
    var mb = box(pack, markId);
    var ref = m.referenceBox
      ? sized({ x0: m.referenceBox.x0, y0: m.referenceBox.y0, x1: m.referenceBox.x1, y1: m.referenceBox.y1 })
      : box(pack, m.reference || 'ka');
    var sx = ref.w ? baseBox.w / ref.w : 1;
    var tx = baseBox.cx + (mb.cx - ref.cx) * sx;
    var ty;
    if (mb.cy < ref.cy) {
      ty = baseBox.y0 + (mb.cy - ref.y0);
      ty = Math.min(ty, baseBox.y0 - minGap - mb.h / 2);
    } else {
      ty = baseBox.y1 + (mb.cy - ref.y1);
      ty = Math.max(ty, baseBox.y1 + minGap + mb.h / 2);
    }
    return { dx: tx - mb.cx, dy: ty - mb.cy };
  }

  function layout(pack, words, opts) {
    opts = opts || {};
    var gap = opts.gap != null ? opts.gap : 90;
    var wordGap = opts.wordGap != null ? opts.wordGap : 300;
    var pad = opts.pad != null ? opts.pad : 70;
    var minGap = opts.markGap != null ? opts.markGap : 55;
    var cursor = 0;
    var items = [];
    var missing = [];
    var minY = Infinity, maxY = -Infinity, maxX = 0;

    words.forEach(function (word, wi) {
      if (wi > 0) { cursor += wordGap - gap; }
      word.tokens.forEach(function (tok) {
        if (!pack.glyphs[tok.base]) { missing.push(tok.base); return; }
        var b = box(pack, tok.base);
        var dx = cursor - b.x0;
        var item = { word: wi, token: tok, base: tok.base, dx: dx, dy: 0, box: b, mark: null };
        var y0 = b.y0, y1 = b.y1, x1 = b.x1 + dx;
        if (tok.mark) {
          if (pack.glyphs[tok.mark]) {
            var off = markOffset(pack, b, tok.mark, minGap);
            var mb = box(pack, tok.mark);
            item.mark = { id: tok.mark, dx: off.dx + dx, dy: off.dy };
            y0 = Math.min(y0, mb.y0 + off.dy);
            y1 = Math.max(y1, mb.y1 + off.dy);
            x1 = Math.max(x1, mb.x1 + off.dx + dx);
          } else { missing.push(tok.mark); }
        }
        if (y0 < minY) { minY = y0; }
        if (y1 > maxY) { maxY = y1; }
        if (x1 > maxX) { maxX = x1; }
        items.push(item);
        cursor += b.w + gap;
      });
    });

    if (!items.length) { minY = 0; maxY = 1000; maxX = 1000; }
    return {
      words: words,
      items: items,
      missing: missing,
      viewBox: [-pad, minY - pad, maxX + 2 * pad, (maxY - minY) + 2 * pad]
    };
  }

  /* ---------- 3. Rendering and animation ---------- */

  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var n = global.document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  function polyLength(points) {
    var L = 0;
    for (var i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }

  function render(container, pack, lay, opts) {
    opts = opts || {};
    var ink = opts.ink || 22;
    var dotInk = opts.dotInk || 32;
    var labelSize = opts.labelSize || 70;
    var vb = lay.viewBox.slice();
    if (opts.labels) { vb[3] += labelSize * 1.9; }

    container.innerHTML = '';
    var svg = el('svg', { viewBox: vb.map(r2).join(' '), role: 'img', 'aria-label': opts.ariaLabel || 'Baybayin' });
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    var steps = [];
    var labelNodes = [];

    function addStroke(group, s, itemIndex) {
      var dot = s.kind === 'dot';
      var path = el('path', {
        d: s.path, fill: 'none', stroke: 'currentColor',
        'stroke-width': dot ? dotInk : ink, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      });
      group.appendChild(path);
      steps.push({ node: path, dot: dot, item: itemIndex, points: s.points, len: 0 });
    }

    lay.items.forEach(function (it, idx) {
      var g = el('g', { transform: 'translate(' + r2(it.dx) + ' ' + r2(it.dy) + ')', 'class': 'glyph' });
      pack.glyphs[it.base].strokes.forEach(function (s) { addStroke(g, s, idx); });
      svg.appendChild(g);
      if (it.mark) {
        var m = el('g', { transform: 'translate(' + r2(it.mark.dx) + ' ' + r2(it.mark.dy) + ')', 'class': 'mark' });
        pack.glyphs[it.mark.id].strokes.forEach(function (s) { addStroke(m, s, idx); });
        svg.appendChild(m);
      }
      if (opts.labels) {
        var t = el('text', {
          x: r2(it.box.cx + it.dx), y: r2(lay.viewBox[1] + lay.viewBox[3] + labelSize * 1.15),
          'text-anchor': 'middle', 'font-size': labelSize, fill: 'currentColor', 'class': 'label'
        });
        t.textContent = it.token.text;
        svg.appendChild(t);
        labelNodes.push(t);
      }
    });

    container.appendChild(svg);

    // Measure after insertion; fall back to the point polyline where the browser can't measure.
    steps.forEach(function (st) {
      var L = 0;
      try { if (st.node.getTotalLength) { L = st.node.getTotalLength(); } } catch (e) { L = 0; }
      st.len = (L && isFinite(L)) ? L : Math.max(1, polyLength(st.points));
    });

    var anims = [];
    var timers = [];

    function hide(st) {
      if (st.dot) { st.node.style.opacity = '0'; return; }
      var L = st.len + 1;
      st.node.style.strokeDasharray = L + 'px ' + L + 'px';
      st.node.style.strokeDashoffset = L + 'px';
    }
    function show(st) {
      st.node.style.opacity = '';
      st.node.style.strokeDasharray = '';
      st.node.style.strokeDashoffset = '';
    }
    function stop() {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* already gone */ } });
      timers.forEach(clearTimeout);
      anims = [];
      timers = [];
    }
    function showAll() { stop(); steps.forEach(show); }
    function hideAll() { stop(); steps.forEach(hide); }

    function play(p) {
      p = p || {};
      var speed = p.speed || 1;
      var msPerUnit = 0.8 / speed;
      var strokeGap = 110 / speed;
      var glyphGap = 260 / speed;
      hideAll();
      var t = 0;
      var lastItem = -1;
      steps.forEach(function (st) {
        if (st.item !== lastItem) {
          if (lastItem !== -1) { t += glyphGap; }
          (function (itemIndex, at) {
            if (opts.onGlyph) { timers.push(setTimeout(function () { opts.onGlyph(itemIndex); }, at)); }
          })(st.item, t);
          lastItem = st.item;
        }
        var dur = st.dot ? 200 / speed : Math.min(1000 / speed, Math.max(240, st.len * msPerUnit));
        var L = st.len + 1;
        if (st.node.animate) {
          var frames = st.dot
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ strokeDashoffset: L + 'px' }, { strokeDashoffset: '0px' }];
          var a = st.node.animate(frames, { duration: dur, delay: t, fill: 'forwards', easing: 'ease-in-out' });
          a.onfinish = (function (s, anim) { return function () { show(s); try { anim.cancel(); } catch (e) { /* ok */ } }; })(st, a);
          anims.push(a);
        } else {
          timers.push(setTimeout((function (s) { return function () { show(s); }; })(st), t + dur));
        }
        t += dur + strokeGap;
      });
      var total = t;
      return new Promise(function (resolve) {
        timers.push(setTimeout(function () {
          if (opts.onGlyph) { opts.onGlyph(-1); }
          resolve();
        }, total + 50));
      });
    }

    return {
      svg: svg,
      steps: steps,
      labels: labelNodes,
      play: play,
      showAll: showAll,
      hideAll: hideAll,
      stop: stop
    };
  }

  function loadPack(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) { throw new Error('Could not load the stroke pack (' + res.status + ')'); }
      return res.json();
    });
  }

  global.Sulat = {
    normalize: normalize,
    syllabify: syllabify,
    syllabifyWord: syllabifyWord,
    describe: describe,
    layout: layout,
    render: render,
    loadPack: loadPack
  };
})(typeof window !== 'undefined' ? window : this);
