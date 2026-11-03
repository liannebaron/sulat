/*
  Sulat photo clean-up (built with Claude).
  A phone photo of thin pen on grey paper is nearly invisible once a vision model shrinks it.
  This finds the ink against the local paper brightness, ignores the page edges and stray specks
  (but keeps marks near the letter, like a vowel dot), crops to the letter, and redraws it as bold
  black on pure white, in the same style as Sulat's reference images.
  Browser:  SulatPhoto.clean(imageOrCanvas) -> { canvas, dataURL } or null if no writing was found.
  Core:     SulatPhoto.cleanPixels(rgba, width, height) -> Uint8Array (OUT x OUT, 0 = ink, 255 = paper) or null.
*/
(function (global) {
  'use strict';
  var WORK = 1600, OUT = 768;

  // Sliding-window max along rows or columns (monotonic deque), radius r.
  function maxFilter1D(src, w, h, r, horizontal) {
    var out = new Float32Array(src.length);
    var n = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w;
    var q = new Int32Array(n);
    for (var line = 0; line < lines; line++) {
      var base = horizontal ? line * w : line, head = 0, tail = 0;
      for (var i = 0; i < n + r; i++) {
        if (i < n) {
          var v = src[base + i * step];
          while (tail > head && src[base + q[tail - 1] * step] <= v) { tail--; }
          q[tail++] = i;
        }
        var c = i - r;
        if (c >= 0) {
          while (q[head] < c - r) { head++; }
          out[base + c * step] = src[base + q[head] * step];
        }
      }
    }
    return out;
  }
  function maxFilter(src, w, h, r) { return maxFilter1D(maxFilter1D(src, w, h, r, true), w, h, r, false); }

  // Box blur via an integral image, radius r (window 2r+1), edges clamped.
  function boxBlur(src, w, h, r) {
    var I = new Float64Array((w + 1) * (h + 1)), x, y;
    for (y = 0; y < h; y++) {
      var row = 0;
      for (x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    var out = new Float32Array(w * h);
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        var s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  }

  function cleanPixels(rgba, w, h) {
    var N = w * h, i, x, y;
    var g = new Float32Array(N);
    for (i = 0; i < N; i++) { g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; }
    // Local paper brightness: light blur, then the brightest nearby value, then smooth it.
    var bg = boxBlur(maxFilter(boxBlur(g, w, h, 4), w, h, 20), w, h, 20);
    var m = Math.round(0.05 * Math.min(w, h));
    var ink = new Uint8Array(N);
    for (y = m; y < h - m; y++) {
      for (x = m; x < w - m; x++) {
        i = y * w + x;
        if (g[i] < bg[i] * 0.78 && bg[i] - g[i] > 20) { ink[i] = 1; }
      }
    }
    // Group nearby ink into pieces (after a slight thickening so one pen line stays one piece).
    var grown = maxFilter(Float32Array.from(ink), w, h, 3);
    var lab = new Int32Array(N), sizes = [0], boxes = [null], stack = new Int32Array(N), n = 0;
    for (i = 0; i < N; i++) {
      if (!grown[i] || lab[i]) { continue; }
      n++; var top = 0, sz = 0, b = { x0: w, y0: h, x1: 0, y1: 0 };
      stack[top++] = i; lab[i] = n;
      while (top) {
        var p = stack[--top], px = p % w, py = (p - px) / w;
        if (ink[p]) { sz++; }
        if (px < b.x0) { b.x0 = px; } if (px > b.x1) { b.x1 = px; }
        if (py < b.y0) { b.y0 = py; } if (py > b.y1) { b.y1 = py; }
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var qx = px + dx, qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) { continue; }
            var qi = qy * w + qx;
            if (grown[qi] && !lab[qi]) { lab[qi] = n; stack[top++] = qi; }
          }
        }
      }
      sizes.push(sz); boxes.push(b);
    }
    if (!n) { return null; }
    // The edge of the paper or the desk shows up as one long, thin, straight line. That is never writing,
    // so drop it before anything else (otherwise it shrinks the letter and drags specks in with it).
    var k;
    for (k = 1; k <= n; k++) {
      var e = boxes[k], bw = e.x1 - e.x0 + 1, bh = e.y1 - e.y0 + 1;
      var long = Math.max(bw, bh), thin = Math.min(bw, bh);
      var spans = bw > 0.6 * (w - 2 * m) || bh > 0.6 * (h - 2 * m);
      if (spans && thin < 0.06 * long) { sizes[k] = 0; }
    }
    // A paper edge can also arrive broken into a few pieces. Any long, thin, straight piece is set aside
    // while we find the letter, and only kept if it sits inside the letter (a real straight stroke).
    var lineLike = new Uint8Array(n + 1), anyOther = false;
    for (k = 1; k <= n; k++) {
      if (!sizes[k]) { continue; }
      var q = boxes[k], qw = q.x1 - q.x0 + 1, qh = q.y1 - q.y0 + 1, ql = Math.max(qw, qh);
      if (Math.min(qw, qh) < 0.06 * ql && ql > 0.2 * Math.min(w, h)) { lineLike[k] = 1; } else { anyOther = true; }
    }
    if (!anyOther) { lineLike = new Uint8Array(n + 1); }
    var big = 0;
    for (k = 1; k <= n; k++) { if (!lineLike[k] && sizes[k] > big) { big = sizes[k]; } }
    if (big < 30) { return null; }
    // The letter: the big pieces. Small pieces count only if they sit close to it (a vowel dot or cross).
    var keep = new Uint8Array(n + 1), C = { x0: w, y0: h, x1: 0, y1: 0 };
    for (k = 1; k <= n; k++) {
      if (!lineLike[k] && sizes[k] > 0 && sizes[k] >= 0.15 * big) {
        keep[k] = 1; var bb = boxes[k];
        C.x0 = Math.min(C.x0, bb.x0); C.y0 = Math.min(C.y0, bb.y0); C.x1 = Math.max(C.x1, bb.x1); C.y1 = Math.max(C.y1, bb.y1);
      }
    }
    var cs = Math.max(C.x1 - C.x0, C.y1 - C.y0);
    for (k = 1; k <= n; k++) {
      if (!lineLike[k]) { continue; }
      var L = boxes[k], pad = 0.1 * cs;
      var inside = L.x0 >= C.x0 - pad && L.x1 <= C.x1 + pad && L.y0 >= C.y0 - pad && L.y1 <= C.y1 + pad;
      if (inside) { keep[k] = 1; } else { sizes[k] = 0; }
    }
    for (k = 1; k <= n; k++) {
      // A real vowel dot is a solid blob; a fleck of dust or a pen tap is tiny. Ignore the tiny ones.
      if (keep[k] || sizes[k] < Math.max(6, 0.006 * big)) { continue; }
      var b2 = boxes[k], cy = (b2.y0 + b2.y1) / 2, cx = (b2.x0 + b2.x1) / 2;
      var ddy = Math.max(C.y0 - cy, 0, cy - C.y1), ddx = Math.max(C.x0 - cx, 0, cx - C.x1);
      if (Math.max(ddx, ddy) < 0.35 * cs) { keep[k] = 1; }
    }
    var F = { x0: w, y0: h, x1: 0, y1: 0 };
    var mask = new Uint8Array(N);
    for (i = 0; i < N; i++) {
      if (ink[i] && keep[lab[i]]) {
        mask[i] = 1; x = i % w; y = (i - x) / w;
        if (x < F.x0) { F.x0 = x; } if (x > F.x1) { F.x1 = x; } if (y < F.y0) { F.y0 = y; } if (y > F.y1) { F.y1 = y; }
      }
    }
    // Square crop with the letter filling about 80%, then OR-sample into the output.
    var side = Math.max(F.x1 - F.x0, F.y1 - F.y0) / 0.8, sx = (F.x0 + F.x1) / 2 - side / 2, sy = (F.y0 + F.y1) / 2 - side / 2;
    var I = new Int32Array((w + 1) * (h + 1));
    for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) { row += mask[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    var f = side / OUT, o = new Float32Array(OUT * OUT);
    for (var oy = 0; oy < OUT; oy++) {
      for (var ox = 0; ox < OUT; ox++) {
        var ax = Math.floor(sx + ox * f), ay = Math.floor(sy + oy * f);
        var bx = Math.max(ax + 1, Math.floor(sx + (ox + 1) * f)), by = Math.max(ay + 1, Math.floor(sy + (oy + 1) * f));
        ax = Math.max(0, Math.min(w, ax)); bx = Math.max(0, Math.min(w, bx)); ay = Math.max(0, Math.min(h, ay)); by = Math.max(0, Math.min(h, by));
        if (bx > ax && by > ay && I[by * (w + 1) + bx] - I[ay * (w + 1) + bx] - I[by * (w + 1) + ax] + I[ay * (w + 1) + ax] > 0) { o[oy * OUT + ox] = 1; }
      }
    }
    var thick = maxFilter(o, OUT, OUT, 4); // bold, like the reference strokes
    var out = new Uint8Array(OUT * OUT);
    for (i = 0; i < OUT * OUT; i++) { out[i] = thick[i] ? 0 : 255; }
    return out;
  }

  function clean(img) {
    var iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
    var s = WORK / Math.max(iw, ih), w = Math.round(iw * s), h = Math.round(ih * s);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
    var px = cleanPixels(cx.getImageData(0, 0, w, h).data, w, h);
    if (!px) { return null; }
    var o = document.createElement('canvas'); o.width = OUT; o.height = OUT;
    var ox = o.getContext('2d'), d = ox.createImageData(OUT, OUT);
    for (var i = 0; i < px.length; i++) { d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = px[i]; d.data[i * 4 + 3] = 255; }
    ox.putImageData(d, 0, 0);
    return { canvas: o, dataURL: o.toDataURL('image/jpeg', 0.9) };
  }

  global.SulatPhoto = { clean: clean, cleanPixels: cleanPixels, OUT: OUT };
})(typeof window !== 'undefined' ? window : this);
