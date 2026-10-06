/* ==========================================================================
   39-lib-collagescene.js — Modül 11 · kolaj sahnesi
   Katmanlar alttan üste primitiflere çevrilir; canlı SVG ve PNG / PDF çıktısı aynı listeden çizilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const C = App.collage;

  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  C.contrast = (hex) => (lum(hex) > 0.6 ? '#17181B' : '#FFFFFF');
  const dashOf = (l) => (l.dash === 1 ? [l.w * 3.2 + 4, l.w * 2.2 + 3] : l.dash === 2 ? [0.1, l.w * 2.2 + 3] : null);

  function photoPrims(l, out) {
    const im = C.imgs[l.src];
    if (!im) { out.push({ t: 'rect', x: l.x, y: l.y, w: l.w, h: l.h, fill: '#C9CACD', opacity: l.op }); return; }
    const pr = C.processed(l);
    const rg = C.cropRegion(im, l.crop);
    const s = Math.max(l.w / rg.w, l.h / rg.h) * l.zoom;
    const dw = im.w * s, dh = im.h * s;
    const dx = l.x + (l.w - rg.w * s) * l.ox - rg.x * s, dy = l.y + (l.h - rg.h * s) * l.oy - rg.y * s;
    const mp = C.maskPts(l.mask, l.x, l.y, l.w, l.h);
    const clip = mp ? { id: 'ph' + l.id, pts: mp } : { id: 'ph' + l.id, x: l.x, y: l.y, w: l.w, h: l.h };
    out.push({ t: 'g', clip: clip, opacity: l.op, items: [{ t: 'img', href: pr.href, ik: pr.ik, x: dx, y: dy, w: dw, h: dh }] });
  }

  function shapePrims(l, out) {
    const common = { fill: l.col, opacity: l.op };
    if (l.blend === 'multiply') common.blend = 'multiply';
    if (l.kind === 'rect' && !l.rot) { out.push(Object.assign({ t: 'rect', x: l.x, y: l.y, w: l.w, h: l.h }, common)); return; }
    const pts = C.shapePts(l.kind, l.x, l.y, l.w, l.h, l.np).map((q) => C.rot(q[0], q[1], l.x + l.w / 2, l.y + l.h / 2, l.rot));
    out.push(Object.assign({ t: 'poly', pts: pts.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]) }, common));
  }

  function lineArrow(a, b, w, id, hand) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const L = 14 + w * 2.4;
    const R = C.rng(7 + Math.round(a[0] + a[1]));
    const wob = (v) => v + (hand ? (R() - 0.5) * 3 : 0);
    const p1 = [b[0] - Math.cos(ang - 0.42) * L, b[1] - Math.sin(ang - 0.42) * L];
    const p2 = [b[0] - Math.cos(ang + 0.42) * L, b[1] - Math.sin(ang + 0.42) * L];
    void id;
    return 'M' + wob(p1[0]).toFixed(1) + ' ' + wob(p1[1]).toFixed(1) + ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + ' L' + wob(p2[0]).toFixed(1) + ' ' + wob(p2[1]).toFixed(1);
  }
  function linePrims(l, out) {
    const st = { stroke: l.col, sw: l.w, cap: 'round', opacity: l.op };
    const dash = dashOf(l);
    if (dash) st.dash = dash;
    if (l.kind === 'free') { out.push(Object.assign({ t: 'path', d: C.smoothPath(C.simplify(l.pts, 2.5)) }, st)); return; }
    const a = l.pts[0], b = l.pts[1];
    out.push(Object.assign({ t: 'path', d: C.handLine(a, b, l.hand, l.id) }, st));
    if (l.kind === 'arrow') out.push({ t: 'path', d: lineArrow(a, b, l.w, l.id, l.hand), stroke: l.col, sw: l.w, cap: 'round', opacity: l.op });
  }

  function textPrims(l, out) {
    const m = C.textMetrics(l);
    const cx = l.x + m.w / 2, cy = l.y + m.h / 2;
    const bgCol = l.bg === 'white' ? '#FFFFFF' : l.bg === 'ink' ? '#17181B' : l.bg === 'col' ? l.col : null;
    const fg = l.bg === 'col' ? C.contrast(l.col) : l.col;
    if (bgCol) {
      if (!l.rot) out.push({ t: 'rect', x: l.x, y: l.y, w: m.w, h: m.h, fill: bgCol });
      else out.push({ t: 'poly', pts: C.boxPts(l.x, l.y, m.w, m.h, l.rot), fill: bgCol });
    }
    const o = C.rot(l.x + m.padX, l.y + m.padY + l.size * 0.92, cx, cy, l.rot);
    const t = { t: 'text', x: o[0], y: o[1], s: m.s, size: l.size, weight: l.weight, fam: l.fam, fill: fg, ls: m.ls, pe: false };
    if (l.rot) { const a = (l.rot * Math.PI) / 180; t.xf = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)]; }
    out.push(t);
  }

  C.layerPrims = function (l, out) {
    if (l.t === 'photo') photoPrims(l, out);
    else if (l.t === 'shape') shapePrims(l, out);
    else if (l.t === 'fig') out.push({ t: 'path', d: C.figPath(l), fill: l.col, opacity: l.op });
    else if (l.t === 'line') linePrims(l, out);
    else if (l.t === 'text') textPrims(l, out);
  };

  /* C.scene(doc) → { prims, W, H } */
  C.scene = function (doc, opts) {
    void opts;
    const sz = C.sizeOf(doc);
    const prims = [{ t: 'rect', x: 0, y: 0, w: sz.w, h: sz.h, fill: C.bgColor(doc) }];
    doc.layers.forEach((l) => { if (!l.hidden) C.layerPrims(l, prims); });
    return { prims: prims, W: sz.w, H: sz.h };
  };
  /* tek katman (önizleme) */
  C.figThumbPath = function (kind, w) {
    const f = C.FIGS[kind];
    const h = w * (f.vh / f.vw);
    return { d: C.figPath({ kind: kind, x: 0, y: 0, w: w, rot: 0, flip: false }), h: h };
  };
})();
