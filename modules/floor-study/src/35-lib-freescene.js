/* ==========================================================================
   35-lib-freescene.js — Mekân Etüdü paftası (serbest düzen): ölçekli mekân çokgenleri + ilişkiler
   Canlı SVG ve PNG/PDF çıktısı aynı primitif listesinden çizilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const sheet = App.sheet;
  const st = App.study;
  const U = App.util;
  const fmt = U.fmt;

  const glass = () => App.theme.name === 'glass';
  const AREA = () => ({ x: 64, y: 54, w: sheet.W - 128, h: sheet.tb.y - 54 - 22 });

  /* dünya penceresi (metre) → paftaya ölçek: bounds + kenar boşluğu, alan oranına uyar.
     frozen verilirse (sürükleme sırasında) pencere değişmez */
  function freeView(fd, frozen) {
    const area = AREA();
    let win = frozen;
    if (!win) {
      const b = fd.bounds;
      const pad = Math.max(3, 0.1 * Math.max(b.w, b.h));
      let x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
      let w = Math.max(x1 - x0, 22), h = Math.max(y1 - y0, 14);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const ar = area.w / area.h;
      if (w / h < ar) w = h * ar; else h = w / ar;
      win = { x0: cx - w / 2, y0: cy - h / 2, w: w, h: h };
    }
    const s = Math.min(area.w / win.w, area.h / win.h);
    const ox = area.x + (area.w - win.w * s) / 2, oy = area.y + (area.h - win.h * s) / 2;
    return { area: area, win: win, s: s, ox: ox, oy: oy, X: (wx) => ox + (wx - win.x0) * s, Y: (wy) => oy + (wy - win.y0) * s, wx: (px) => win.x0 + (px - ox) / s, wy: (py) => win.y0 + (py - oy) / s };
  }

  /* etiket için mekânın içine sığan en geniş dikdörtgen (dünya, metre) */
  function labelRect(it) {
    const c = it.cut;
    let u;
    if (it.shape === 'L') {
      const col = [0, 0, 1 - c, 1], row = [0, c, 1, 1];
      const mc = Math.min((1 - c) * it.w, it.h), mr = Math.min(it.w, (1 - c) * it.h);
      u = mc >= mr ? col : row;
    } else if (it.shape === 'T') {
      const s = Math.max(0.25, 1 - 1.5 * c), t = 0.42;
      u = t >= (s * (1 - t)) ? [0, 0, 1, t] : [(1 - s) / 2, t, (1 + s) / 2, 1];
    } else if (it.shape === 'U') u = [0, 0.55, 1, 1];
    else u = [0, 0, 1, 1];
    const rot = (p, r) => (r === 1 ? [1 - p[1], p[0]] : r === 2 ? [1 - p[0], 1 - p[1]] : r === 3 ? [p[1], 1 - p[0]] : p);
    const a = rot([u[0], u[1]], it.rot), b = rot([u[2], u[3]], it.rot);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    return { x: it.x + x0 * it.w, y: it.y + y0 * it.h, w: (x1 - x0) * it.w, h: (y1 - y0) * it.h };
  }

  // iki merkez arasındaki doğrunun kutu kenarından çıktığı nokta
  function exitPoint(it, tx, ty) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const k = Math.min(dx ? (it.w / 2) / Math.abs(dx) : Infinity, dy ? (it.h / 2) / Math.abs(dy) : Infinity);
    return [cx + dx * k, cy + dy * k];
  }

  function colors() {
    const PAL = App.PAL, g = glass();
    return g
      ? { g: true, ink: PAL.ink, panel: '#F1F2F5', panelStroke: 'rgba(23,24,27,.16)', edge: '#F6F7F9', edgeW: 2.4, rel: PAL.ink, bad: PAL.ink, weak: PAL.ink, chipBg: '#F6F7F9', over: 'rgba(23,24,27,.32)' }
      : { g: false, ink: PAL.ink, panel: PAL.paperDark, panelStroke: PAL.ink, edge: PAL.ink, edgeW: 3, rel: PAL.blue, bad: PAL.red, weak: PAL.ink, chipBg: PAL.paper, over: 'rgba(192,58,34,.45)' };
  }

  function relationPrims(fd, C, view) {
    const P = [];
    const X = view.X, Y = view.Y, s = view.s;
    fd.pairs.forEach((p) => {
      const A = fd.byId.get(p.a), B = fd.byId.get(p.b);
      if (!A || !B || p.state === 'overlap') return;
      const ea = exitPoint(A, B.x + B.w / 2, B.y + B.h / 2), eb = exitPoint(B, A.x + A.w / 2, A.y + A.h / 2);
      // yakın / bitişik: temas noktası
      const mx = (ea[0] + eb[0]) / 2, my = (ea[1] + eb[1]) / 2;
      const x1 = X(ea[0]), y1 = Y(ea[1]), x2 = X(eb[0]), y2 = Y(eb[1]);
      const mxp = X(mx), myp = Y(my);
      const ok = p.ok >= 0.99, bad = p.ok < 0.5;
      const col = p.type === 'avoid' ? C.bad : p.type === 'strong' ? C.rel : C.weak;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (p.state === 'adjacent') {
        if (p.type === 'avoid') {
          P.push({ t: 'circle', cx: mxp, cy: myp, r: 8, fill: C.chipBg, stroke: col, sw: 2 });
          P.push({ t: 'line', x1: mxp - 3.4, y1: myp - 3.4, x2: mxp + 3.4, y2: myp + 3.4, stroke: col, sw: 2, cap: 'round' });
          P.push({ t: 'line', x1: mxp - 3.4, y1: myp + 3.4, x2: mxp + 3.4, y2: myp - 3.4, stroke: col, sw: 2, cap: 'round' });
        } else if (p.type === 'strong') {
          P.push({ t: 'circle', cx: mxp, cy: myp, r: 6.5, fill: col, stroke: C.chipBg, sw: 2 });
        } else {
          P.push({ t: 'circle', cx: mxp, cy: myp, r: 5, fill: C.chipBg, stroke: col, sw: 1.8 });
        }
        return;
      }
      const dash = p.type === 'strong' ? (ok ? undefined : [9, 6]) : p.type === 'weak' ? [6, 6] : [1.5, 6];
      const sw = p.type === 'strong' ? (bad ? 2.4 : 3.2) : p.type === 'weak' ? 1.6 : 2;
      const op = p.type === 'avoid' && ok ? 0.45 : p.type === 'weak' ? 0.65 : 0.95;
      P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: col, sw: sw, dash: dash, cap: 'round', opacity: op });
      [[x1, y1], [x2, y2]].forEach((q) => P.push({ t: 'circle', cx: q[0], cy: q[1], r: p.type === 'strong' ? 4 : 3, fill: col, opacity: op }));
      if (p.type === 'avoid' && !ok) {
        P.push({ t: 'circle', cx: mxp, cy: myp, r: 7, fill: C.chipBg, stroke: col, sw: 1.8 });
        P.push({ t: 'line', x1: mxp - 3, y1: myp - 3, x2: mxp + 3, y2: myp + 3, stroke: col, sw: 1.8, cap: 'round' });
        P.push({ t: 'line', x1: mxp - 3, y1: myp + 3, x2: mxp + 3, y2: myp - 3, stroke: col, sw: 1.8, cap: 'round' });
      } else if (view.chips && dist > 34 && p.type !== 'weak') {
        const txt = fmt(p.gap, 1) + ' m';
        const tw = sheet.tw(txt, 11, 700, 'm', 0) + 10;
        P.push({ t: 'rect', x: mxp - tw / 2, y: myp - 9, w: tw, h: 18, rx: C.g ? 9 : 0, fill: C.chipBg, stroke: col, sw: 1.4 });
        P.push({ t: 'text', x: mxp, y: myp + 4, s: txt, size: 11, weight: 700, fam: 'm', fill: C.ink, anchor: 'middle' });
      }
    });
    return P;
  }

  function itemPrims(it, C, view) {
    const P = [];
    const z = App.ZONES[it.zone] || App.ZONES.sosyal;
    const X = view.X, Y = view.Y, s = view.s;
    P.push({ t: 'poly', pts: it.ring.map((q) => [X(q[0]), Y(q[1])]), fill: z.fill, stroke: C.edge, sw: C.edgeW });
    return P;
  }

  function labelPrims(it, C, view) {
    const P = [];
    const z = App.ZONES[it.zone] || App.ZONES.sosyal;
    const lr = labelRect(it);
    const x = view.X(lr.x), y = view.Y(lr.y), w = lr.w * view.s, h = lr.h * view.s;
    const lab = sheet.fitLabel(it.name, w, h, { withArea: true, max: 16 });
    if (lab) {
      const lh = lab.fs * 1.16, afs = Math.max(8, lab.fs * 0.82);
      const dim = h > 78 && w > 70;
      const bh = lab.lines.length * lh + afs + (dim ? afs : 0);
      const ty = y + h / 2 - bh / 2 + lab.fs * 0.84;
      lab.lines.forEach((ln, i) => P.push({ t: 'text', x: x + w / 2, y: ty + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: z.text, anchor: 'middle', ls: lab.ls }));
      P.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1, s: fmt(it.area) + ' m²', size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.78 });
      if (dim) P.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1 + afs, s: fmt(it.w, 1) + ' × ' + fmt(it.h, 1), size: afs - 0.5, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.55 });
    } else if (w > 24 && h > 16) {
      P.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 3.5, s: fmt(it.area, 0), size: 10, weight: 700, fam: 'b', fill: z.text, anchor: 'middle', opacity: 0.85 });
    }
    return P;
  }

  function gridPrims(view, C) {
    const P = [];
    const a = view.area, s = view.s, w = view.win;
    const minor = s >= 11 ? 1 : 0;
    const major = s >= 4.5 ? 5 : 10;
    const x0 = Math.ceil(w.x0), x1 = Math.floor(w.x0 + w.w), y0 = Math.ceil(w.y0), y1 = Math.floor(w.y0 + w.h);
    for (let x = x0; x <= x1; x++) {
      const isMaj = x % major === 0;
      if (!isMaj && !minor) continue;
      const px = view.X(x);
      if (px < a.x + 2 || px > a.x + a.w - 2) continue;
      P.push({ t: 'line', x1: px, y1: a.y + 2, x2: px, y2: a.y + a.h - 2, stroke: C.ink, sw: isMaj ? 0.9 : 0.6, opacity: isMaj ? 0.13 : 0.06 });
      if (isMaj) P.push({ t: 'text', x: px + 3, y: a.y + a.h - 6, s: String(x), size: 10, weight: 500, fam: 'm', fill: C.ink, opacity: 0.35 });
    }
    for (let y = y0; y <= y1; y++) {
      const isMaj = y % major === 0;
      if (!isMaj && !minor) continue;
      const py = view.Y(y);
      if (py < a.y + 2 || py > a.y + a.h - 2) continue;
      P.push({ t: 'line', x1: a.x + 2, y1: py, x2: a.x + a.w - 2, y2: py, stroke: C.ink, sw: isMaj ? 0.9 : 0.6, opacity: isMaj ? 0.13 : 0.06 });
      if (isMaj && py < a.y + a.h - 18) P.push({ t: 'text', x: a.x + 5, y: py - 3, s: String(y), size: 10, weight: 500, fam: 'm', fill: C.ink, opacity: 0.35 });
    }
    return P;
  }

  function scaleBar(view, C) {
    const P = [];
    const a = view.area;
    const m = view.s * 5 > 90 ? 5 : view.s * 10 > 90 ? 10 : 20;
    const len = m * view.s;
    const x1 = a.x + a.w - 22, x0 = x1 - len, y = a.y + 22;
    const st0 = { stroke: C.ink, sw: 2, opacity: 0.7 };
    P.push(Object.assign({ t: 'line', x1: x0, y1: y, x2: x1, y2: y }, st0));
    P.push(Object.assign({ t: 'line', x1: x0, y1: y - 5, x2: x0, y2: y + 5 }, st0));
    P.push(Object.assign({ t: 'line', x1: x1, y1: y - 5, x2: x1, y2: y + 5 }, st0));
    P.push({ t: 'text', x: (x0 + x1) / 2, y: y - 9, s: m + ' m', size: 11.5, weight: 700, fam: 'm', fill: C.ink, opacity: 0.7, anchor: 'middle' });
    return P;
  }

  function footprintDims(fd, C, view) {
    const P = [];
    const b = fd.bounds;
    const X = view.X, Y = view.Y;
    const dl = { stroke: C.ink, sw: 1, opacity: 0.4 };
    const by = Y(b.y1) + 16, lx = X(b.x0) - 16;
    const a = view.area;
    if (by < a.y + a.h - 22) {
      P.push(Object.assign({ t: 'line', x1: X(b.x0), y1: by, x2: X(b.x1), y2: by }, dl));
      P.push(Object.assign({ t: 'line', x1: X(b.x0), y1: by - 4, x2: X(b.x0), y2: by + 4 }, dl));
      P.push(Object.assign({ t: 'line', x1: X(b.x1), y1: by - 4, x2: X(b.x1), y2: by + 4 }, dl));
      P.push({ t: 'text', x: (X(b.x0) + X(b.x1)) / 2, y: by + 14, s: sheet.dimText(b.w), size: 12, weight: 600, fam: C.g ? 'b' : 'm', fill: C.ink, opacity: 0.6, anchor: 'middle' });
    }
    if (lx > a.x + 22) {
      P.push(Object.assign({ t: 'line', x1: lx, y1: Y(b.y0), x2: lx, y2: Y(b.y1) }, dl));
      P.push(Object.assign({ t: 'line', x1: lx - 4, y1: Y(b.y0), x2: lx + 4, y2: Y(b.y0) }, dl));
      P.push(Object.assign({ t: 'line', x1: lx - 4, y1: Y(b.y1), x2: lx + 4, y2: Y(b.y1) }, dl));
      P.push({ t: 'text', x: lx - 6, y: (Y(b.y0) + Y(b.y1)) / 2, s: sheet.dimText(b.h), size: 12, weight: 600, fam: C.g ? 'b' : 'm', fill: C.ink, opacity: 0.6, anchor: 'middle', xf: [0, -1, 1, 0] });
    }
    return P;
  }

  /* opts: { live, frozen (pencere), chips } */
  function scene(project, fd, opts) {
    opts = opts || {};
    const C = colors();
    const view = freeView(fd, opts.frozen);
    view.chips = opts.chips !== false;
    const m = fd.metrics;
    const zones = [];
    project.spaces.forEach((sp) => { if (zones.indexOf(sp.zone) < 0) zones.push(sp.zone); });
    const lineLg = (label, stroke, sw, dash) => ({ label: label, line: { stroke: stroke, sw: sw, dash: dash, cap: 'round' } });
    const legend = sheet.zoneLegend(zones).slice(0, 5).concat([lineLg('Güçlü ilişki', C.rel, 3), lineLg('Ayrı tut', C.bad, 2, [1.5, 5])]);
    const info = {
      name: project.meta.name,
      subtitle: 'Mekân etüdü · ' + fd.items.length + ' mekân · serbest düzen',
      legend: legend.slice(0, 8),
      stats: [['Mekân', String(fd.items.length)], ['Toplam alan', fmt(m.total) + ' m²'], ['Kaplama', fmt(fd.bounds.w, 1) + ' × ' + fmt(fd.bounds.h, 1) + ' m']],
      scoreLabel: 'Düzen skoru', percent: m.score,
    };
    const prims = sheet.frame(info, opts.live !== false);
    const a = view.area;
    prims.push(C.g
      ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, fill: C.panel, stroke: C.panelStroke, sw: 1 }
      : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: C.panel, stroke: C.ink, sw: 4 });
    gridPrims(view, C).forEach((p) => prims.push(p));
    const sorted = fd.items.slice().sort((p, q) => q.area - p.area);
    sorted.forEach((it) => itemPrims(it, C, view).forEach((p) => prims.push(p)));
    // çakışmalar
    fd.overlaps.forEach((o) => {
      const A = fd.byId.get(o.a), B = fd.byId.get(o.b);
      const x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w), y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
      if (x1 > x0 && y1 > y0) prims.push({ t: 'rect', x: view.X(x0), y: view.Y(y0), w: (x1 - x0) * view.s, h: (y1 - y0) * view.s, fill: C.over, stroke: C.bad, sw: 1.6, dash: [5, 4] });
    });
    relationPrims(fd, C, view).forEach((p) => prims.push(p));
    sorted.forEach((it) => labelPrims(it, C, view).forEach((p) => prims.push(p)));
    footprintDims(fd, C, view).forEach((p) => prims.push(p));
    scaleBar(view, C).forEach((p) => prims.push(p));
    return { prims: prims, view: view };
  }

  st.freeView = freeView;
  st.freeScene = scene;
  st.freeExitPoint = exitPoint;
  st.freeLabelRect = labelRect;
})();
