/* ==========================================================================
   39-lib-unitscene.js — Modül 9 · Birim Oluşturucu paftaları (plan · izometrik · süreç afişi)
   Canlı SVG ve PNG/PDF çıktısı aynı primitif listesinden çizilir (App.board.primToV / primsToCanvas).
   ========================================================================== */
(function () {
  const App = window.App;
  const sheet = App.sheet;
  const iso = App.iso;
  const U = App.util;
  const fmt = U.fmt;
  const unit = App.unit;
  const FH = unit.FH;

  const glass = () => App.theme.name === 'glass';
  const AREA = () => ({ x: 64, y: 54, w: sheet.W - 128, h: sheet.tb.y - 54 - 22 });
  const upper = () => !!App.theme.cur().label.upper;
  const UP = (s) => (upper() ? String(s).toLocaleUpperCase('tr') : String(s));

  function colors() {
    const PAL = App.PAL, g = glass();
    return g
      ? { g: true, ink: PAL.ink, panel: '#F1F2F5', panelStroke: 'rgba(23,24,27,.16)', ground: '#FBFBFC', parcel: '#FFFFFF', ctx: '#D9DBE0', ctxTop: '#E6E8EC', mass: '#3A3C42', massTop: '#4C4F57', green: '#AEB3BB', greenDk: '#8C9199', voidF: '#E9EAEE', flow: PAL.ink, thru: PAL.ink, entry: PAL.ink, edge: 'rgba(23,24,27,.45)', edgeW: 1.6, soft: 'rgba(23,24,27,.2)' }
      : { g: false, ink: PAL.ink, panel: PAL.paperDark, panelStroke: PAL.ink, ground: PAL.paper, parcel: '#FBF3DC', ctx: '#BDB49C', ctxTop: '#CFC7B1', mass: PAL.red, massTop: '#D9573D', green: PAL.green, greenDk: '#2C6330', voidF: PAL.paper, flow: PAL.ink, thru: PAL.blue, entry: PAL.yellow, edge: PAL.ink, edgeW: 2.2, soft: 'rgba(38,29,17,.3)' };
  }
  unit.colors = colors;

  /* ---------- görünüm: dünya (m) → paftaya ---------- */
  function fitView(area, b, padM) {
    const x0 = b.x0 - padM, x1 = b.x1 + padM, y0 = b.y0 - padM, y1 = b.y1 + padM;
    let w = Math.max(x1 - x0, 20), h = Math.max(y1 - y0, 14);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ar = area.w / area.h;
    if (w / h < ar) w = h * ar; else h = w / ar;
    const win = { x0: cx - w / 2, y0: cy - h / 2, w: w, h: h };
    const s = Math.min(area.w / win.w, area.h / win.h);
    const ox = area.x + (area.w - win.w * s) / 2, oy = area.y + (area.h - win.h * s) / 2;
    return { area: area, win: win, s: s, ox: ox, oy: oy, X: (wx) => ox + (wx - win.x0) * s, Y: (wy) => oy + (wy - win.y0) * s, wx: (px) => win.x0 + (px - ox) / s, wy: (py) => win.y0 + (py - oy) / s };
  }
  /* çalışma penceresi (m): parsel + çevre şeridi + tüm adımlardaki öğeler. Dışında kalan çevre yapıları çizilmez. */
  unit.win = function (u, kind) {
    const site = u.site;
    const k = Math.min(site.w, site.d);
    const m = kind === 'iso' ? U.clamp(k * 0.3, 14, 30) : U.clamp(k * 0.2, 9, 22);
    const bb = { x0: -m, y0: -m, x1: site.w + m, y1: site.d + m };
    u.steps.forEach((s) => s.els.forEach((e) => {
      if (e.t === 'mass' || e.t === 'void' || e.t === 'green') { bb.x0 = Math.min(bb.x0, e.x - 4); bb.y0 = Math.min(bb.y0, e.y - 4); bb.x1 = Math.max(bb.x1, e.x + e.w + 4); bb.y1 = Math.max(bb.y1, e.y + e.d + 4); }
      if (e.t === 'tree') { bb.x0 = Math.min(bb.x0, e.x - e.r - 2); bb.y0 = Math.min(bb.y0, e.y - e.r - 2); bb.x1 = Math.max(bb.x1, e.x + e.r + 2); bb.y1 = Math.max(bb.y1, e.y + e.r + 2); }
      if (e.t === 'arrow') { bb.x0 = Math.min(bb.x0, e.x1 - 3, e.x2 - 3); bb.y0 = Math.min(bb.y0, e.y1 - 3, e.y2 - 3); bb.x1 = Math.max(bb.x1, e.x1 + 3, e.x2 + 3); bb.y1 = Math.max(bb.y1, e.y1 + 3, e.y2 + 3); }
    }));
    return bb;
  };
  // çevre yapıları pencereye kırpılır: pencere dışına taşan kısım çizilmez
  unit.ctxIn = function (u, w) {
    const out = [];
    u.ctx.forEach((c) => {
      const x0 = Math.max(c.x, w.x0), y0 = Math.max(c.y, w.y0), x1 = Math.min(c.x + c.w, w.x1), y1 = Math.min(c.y + c.d, w.y1);
      if (x1 - x0 < 1.5 || y1 - y0 < 1.5) return;
      out.push({ id: c.id, x: x0, y: y0, w: x1 - x0, d: y1 - y0, h: c.h });
    });
    return out;
  };

  unit.planView = function (u, frozen) {
    const area = AREA();
    if (frozen) {
      const s = Math.min(area.w / frozen.w, area.h / frozen.h);
      const ox = area.x + (area.w - frozen.w * s) / 2, oy = area.y + (area.h - frozen.h * s) / 2;
      return { area: area, win: frozen, s: s, ox: ox, oy: oy, X: (wx) => ox + (wx - frozen.x0) * s, Y: (wy) => oy + (wy - frozen.y0) * s, wx: (px) => frozen.x0 + (px - ox) / s, wy: (py) => frozen.y0 + (py - oy) / s };
    }
    return fitView(area, unit.win(u, 'plan'), 1);
  };

  /* ---------- ortak yardımcılar ---------- */
  function wrapText(s, maxW, size, weight, fam, maxLines) {
    const words = String(s || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      const t = cur ? cur + ' ' + w : w;
      if (sheet.tw(t, size, weight, fam, 0) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      const keep = lines.slice(0, maxLines);
      keep[maxLines - 1] = sheet.clip(keep[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), maxW, size, weight, fam, 0);
      return keep;
    }
    return lines;
  }

  function headPoly(x, y, ux, uy, len, wid, fill, stroke, sw) {
    return { t: 'poly', pts: [[x, y], [x - ux * len - uy * wid, y - uy * len + ux * wid], [x - ux * len + uy * wid, y - uy * len - ux * wid]], fill: fill, stroke: stroke, sw: sw };
  }

  // ekranda ok: kind 'flow' dolu çizgi + ok başı · 'through' noktalı kesik çizgi · 'entry' üçgen işaret
  function arrowScreen(a, C, scale) {
    const P = [];
    const x1 = a[0], y1 = a[1], x2 = a[2], y2 = a[3];
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const k = scale || 1;
    if (a.k === 'entry') {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, s = 9 * k;
      P.push({ t: 'poly', pts: [[mx + ux * s * 1.2, my + uy * s * 1.2], [mx - ux * s * 0.8 - uy * s, my - uy * s * 0.8 + ux * s], [mx - ux * s * 0.8 + uy * s, my - uy * s * 0.8 - ux * s]], fill: C.entry, stroke: C.ink, sw: 1.8 });
      return P;
    }
    if (a.k === 'through') {
      P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: C.thru, sw: 2.6 * k, dash: [0.5, 7 * k], cap: 'round' });
      return P;
    }
    const hl = 11 * k;
    P.push({ t: 'line', x1: x1, y1: y1, x2: x2 - ux * hl * 0.5, y2: y2 - uy * hl * 0.5, stroke: C.flow, sw: 2.2 * k, cap: 'round' });
    P.push(headPoly(x2, y2, ux, uy, hl, hl * 0.52, C.flow, C.flow, 1));
    return P;
  }

  function legendFor(u, C) {
    const lineLg = (label, stroke, sw, dash) => ({ label: label, line: { stroke: stroke, sw: sw, dash: dash, cap: 'round' } });
    return [
      { label: 'Mevcut çevre', fill: C.ctx },
      { label: 'Yeni kütle', fill: C.mass },
      { label: 'Yeşil alan', fill: C.green },
      lineLg('Yaya akışı', C.flow, 3),
      lineLg('Geçit', C.thru, 3, [0.5, 7]),
      { label: 'Ana giriş', fill: C.entry },
    ];
  }

  function frameInfo(u, step, sub, M) {
    const C = colors();
    return {
      name: u.title || 'Birim',
      subtitle: sub,
      legend: legendFor(u, C),
      stats: [['Taban alanı', fmt(M.footprint) + ' m²'], ['TAKS / KAKS', fmt(M.taks, 2) + ' / ' + fmt(M.kaks, 2)], ['En yüksek', fmt(M.maxHeight) + ' m · ' + M.maxFloors + ' kat']],
      scoreLabel: 'Açık alan', percent: M.masses ? Math.round((1 - M.taks) * 100) : null,
    };
  }
  unit.frameInfo = frameInfo;

  function panelRect(prims, a, C) {
    prims.push(C.g
      ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, fill: C.panel, stroke: C.panelStroke, sw: 1 }
      : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: C.panel, stroke: C.ink, sw: 4 });
  }

  /* ==========================================================================
     PLAN
     ========================================================================== */
  function gridPrims(view, C) {
    const P = [];
    const a = view.area, s = view.s, w = view.win;
    const minor = s >= 9 ? 1 : 0;
    const major = s >= 4 ? 5 : 10;
    for (let x = Math.ceil(w.x0); x <= Math.floor(w.x0 + w.w); x++) {
      const mj = x % major === 0;
      if (!mj && !minor) continue;
      const px = view.X(x);
      if (px < a.x + 2 || px > a.x + a.w - 2) continue;
      P.push({ t: 'line', x1: px, y1: a.y + 2, x2: px, y2: a.y + a.h - 2, stroke: C.ink, sw: mj ? 0.9 : 0.6, opacity: mj ? 0.12 : 0.05 });
    }
    for (let y = Math.ceil(w.y0); y <= Math.floor(w.y0 + w.h); y++) {
      const mj = y % major === 0;
      if (!mj && !minor) continue;
      const py = view.Y(y);
      if (py < a.y + 2 || py > a.y + a.h - 2) continue;
      P.push({ t: 'line', x1: a.x + 2, y1: py, x2: a.x + a.w - 2, y2: py, stroke: C.ink, sw: mj ? 0.9 : 0.6, opacity: mj ? 0.12 : 0.05 });
    }
    return P;
  }

  function scaleBar(view, C, x, y) {
    const P = [];
    const cand = [1, 2, 5, 10, 20, 50, 100];
    let m = cand[0];
    cand.forEach((c) => { if (c * view.s <= 150) m = c; });
    const len = m * view.s;
    const st0 = { stroke: C.ink, sw: 2, opacity: 0.75 };
    P.push(Object.assign({ t: 'line', x1: x - len, y1: y, x2: x, y2: y }, st0));
    P.push(Object.assign({ t: 'line', x1: x - len, y1: y - 5, x2: x - len, y2: y + 5 }, st0));
    P.push(Object.assign({ t: 'line', x1: x, y1: y - 5, x2: x, y2: y + 5 }, st0));
    P.push(Object.assign({ t: 'line', x1: x - len / 2, y1: y - 3, x2: x - len / 2, y2: y + 3 }, st0));
    P.push({ t: 'text', x: x - len / 2, y: y - 10, s: m + ' m', size: 11.5, weight: 700, fam: 'm', fill: C.ink, opacity: 0.75, anchor: 'middle' });
    return P;
  }
  function northArrow(C, x, y) {
    const P = [];
    P.push({ t: 'circle', cx: x, cy: y, r: 16, stroke: C.ink, sw: 1.6, opacity: 0.7 });
    P.push({ t: 'poly', pts: [[x, y - 13], [x - 6, y + 8], [x, y + 3], [x + 6, y + 8]], fill: C.ink, opacity: 0.8 });
    P.push({ t: 'text', x: x, y: y - 22, s: 'K', size: 11.5, weight: 700, fam: 'm', fill: C.ink, opacity: 0.75, anchor: 'middle' });
    return P;
  }

  function dimsPrims(u, view, C) {
    const P = [];
    const site = u.site, X = view.X, Y = view.Y, a = view.area;
    const dl = { stroke: C.ink, sw: 1, opacity: 0.42 };
    const by = Y(site.d) + 18, lx = X(0) - 18;
    if (by < a.y + a.h - 20) {
      P.push(Object.assign({ t: 'line', x1: X(0), y1: by, x2: X(site.w), y2: by }, dl));
      P.push(Object.assign({ t: 'line', x1: X(0), y1: by - 4, x2: X(0), y2: by + 4 }, dl));
      P.push(Object.assign({ t: 'line', x1: X(site.w), y1: by - 4, x2: X(site.w), y2: by + 4 }, dl));
      P.push({ t: 'text', x: (X(0) + X(site.w)) / 2, y: by + 14, s: 'Parsel ' + fmt(site.w, 1) + ' m', size: 12, weight: 600, fam: C.g ? 'b' : 'm', fill: C.ink, opacity: 0.62, anchor: 'middle' });
    }
    if (lx > a.x + 22) {
      P.push(Object.assign({ t: 'line', x1: lx, y1: Y(0), x2: lx, y2: Y(site.d) }, dl));
      P.push(Object.assign({ t: 'line', x1: lx - 4, y1: Y(0), x2: lx + 4, y2: Y(0) }, dl));
      P.push(Object.assign({ t: 'line', x1: lx - 4, y1: Y(site.d), x2: lx + 4, y2: Y(site.d) }, dl));
      P.push({ t: 'text', x: lx - 6, y: (Y(0) + Y(site.d)) / 2, s: fmt(site.d, 1) + ' m', size: 12, weight: 600, fam: C.g ? 'b' : 'm', fill: C.ink, opacity: 0.62, anchor: 'middle', xf: [0, -1, 1, 0] });
    }
    return P;
  }

  function planPrims(u, step, prev, view, C, o) {
    const P = [];
    const X = view.X, Y = view.Y, s = view.s;
    const site = u.site;
    // parsel
    P.push({ t: 'rect', x: X(0), y: Y(0), w: site.w * s, h: site.d * s, fill: C.parcel, stroke: C.ink, sw: 1.6, dash: [8, 6], opacity: 1 });
    // çevre
    unit.ctxIn(u, { x0: view.win.x0, y0: view.win.y0, x1: view.win.x0 + view.win.w, y1: view.win.y0 + view.win.h }).forEach((c) => P.push({ t: 'rect', x: X(c.x), y: Y(c.y), w: c.w * s, h: c.d * s, fill: C.ctx, stroke: C.edge, sw: 1, opacity: 0.95 }));
    // önceki adım (hayalet)
    if (o.ghost && prev) prev.els.forEach((e) => {
      if (e.t !== 'mass') return;
      P.push({ t: 'poly', pts: unit.ring(e).map((q) => [X(q[0]), Y(q[1])]), stroke: C.ink, sw: 1.3, dash: [5, 5], opacity: 0.4 });
    });
    const by = (t) => step.els.filter((e) => e.t === t);
    by('green').forEach((e) => {
      if (e.round) P.push({ t: 'circle', cx: X(e.x + e.w / 2), cy: Y(e.y + e.d / 2), r: Math.min(e.w, e.d) * s / 2, fill: C.green, stroke: C.greenDk, sw: 1.4, opacity: 0.9 });
      else P.push({ t: 'rect', x: X(e.x), y: Y(e.y), w: e.w * s, h: e.d * s, fill: C.green, stroke: C.greenDk, sw: 1.4, opacity: 0.9 });
    });
    by('void').forEach((e) => {
      P.push({ t: 'rect', x: X(e.x), y: Y(e.y), w: e.w * s, h: e.d * s, fill: C.voidF, stroke: C.ink, sw: 1.6, dash: [3, 5], opacity: 0.95 });
      if (e.w * s > 60 && e.d * s > 30) P.push({ t: 'text', x: X(e.x + e.w / 2), y: Y(e.y + e.d / 2) + 4, s: UP('Boşluk'), size: 11, weight: 600, fam: 'b', fill: C.ink, opacity: 0.45, anchor: 'middle', ls: upper() ? 1 : 0, pe: false });
    });
    by('mass').forEach((e) => {
      P.push({ t: 'poly', pts: unit.ring(e).map((q) => [X(q[0]), Y(q[1])]), fill: e.roof === 'green' ? C.green : C.mass, stroke: C.ink, sw: C.edgeW });
    });
    by('mass').forEach((e) => {
      const lr = App.study.freeLabelRect({ x: e.x, y: e.y, w: e.w, h: e.d, shape: e.shape, rot: e.rot, cut: e.cut });
      const w = lr.w * s, h = lr.h * s;
      if (w < 30 || h < 18) return;
      const dark = e.roof !== 'green';
      const txt = e.floors + ' kat';
      P.push({ t: 'text', x: X(lr.x + lr.w / 2), y: Y(lr.y + lr.h / 2) + 4, s: txt, size: Math.max(9, Math.min(15, w / 6)), weight: 700, fam: 'b', fill: dark ? (C.g ? '#F6F7F9' : App.PAL.paper) : C.ink, anchor: 'middle', pe: false });
    });
    by('tree').forEach((e) => {
      P.push({ t: 'circle', cx: X(e.x), cy: Y(e.y), r: Math.max(2.5, e.r * s), fill: C.green, stroke: C.greenDk, sw: 1, opacity: 0.8 });
      P.push({ t: 'circle', cx: X(e.x), cy: Y(e.y), r: 1.4, fill: C.ink, opacity: 0.6 });
    });
    by('arrow').forEach((e) => {
      arrowScreen(Object.assign([X(e.x1), Y(e.y1), X(e.x2), Y(e.y2)], { k: e.k }), C, 1).forEach((p) => P.push(p));
    });
    return P;
  }

  /* opts: { live, frozen, ghost, dims } */
  unit.planScene = function (u, opts) {
    opts = opts || {};
    const C = colors();
    const view = unit.planView(u, opts.frozen);
    const step = u.steps[Math.min(u.cur, u.steps.length - 1)];
    const prev = u.cur > 0 ? u.steps[u.cur - 1] : null;
    const M = unit.metrics(u, step);
    const info = frameInfo(u, step, 'Plan · adım ' + (u.cur + 1) + '/' + u.steps.length + ' · ' + step.title, M);
    const prims = sheet.frame(info, opts.live !== false);
    const a = view.area;
    panelRect(prims, a, C);
    gridPrims(view, C).forEach((p) => prims.push(p));
    planPrims(u, step, prev, view, C, { ghost: opts.ghost !== false }).forEach((p) => prims.push(p));
    if (opts.dims !== false) dimsPrims(u, view, C).forEach((p) => prims.push(p));
    prims.push({ t: 'rect', x: a.x + a.w - 190, y: a.y + 6, w: 184, h: 40, rx: C.g ? 10 : 0, fill: C.panel, opacity: 0.92 });
    scaleBar(view, C, a.x + a.w - 24, a.y + 30).forEach((p) => prims.push(p));
    prims.push({ t: 'rect', x: a.x + 8, y: a.y + 8, w: 56, h: 56, rx: C.g ? 10 : 0, fill: C.panel, opacity: 0.92 });
    northArrow(C, a.x + 36, a.y + 40).forEach((p) => prims.push(p));
    // adım etiketi
    const lab = UP((u.cur + 1) + ' · ' + step.title + (step.sub ? ' — ' + step.sub : ''));
    const labS = sheet.clip(lab, a.w * 0.55, 15, 700, 'd', upper() ? 1 : 0);
    const labW = sheet.tw(labS, 15, 700, 'd', upper() ? 1 : 0);
    prims.push({ t: 'rect', x: a.x + 64, y: a.y + 8, w: labW + 14, h: 52, rx: C.g ? 10 : 0, fill: C.panel, opacity: 0.92 });
    prims.push({ t: 'text', x: a.x + 70, y: a.y + 40, s: labS, size: 15, weight: 700, fam: 'd', fill: C.ink, ls: upper() ? 1 : 0, opacity: 0.85 });
    return { prims: prims, view: view };
  };

  /* ==========================================================================
     İZOMETRİK
     ========================================================================== */
  // tüm adımları kapsayan ortak kamera: rect içine sığdır
  function isoCamera(u, steps, yaw, pitch, rect, zx) {
    const w = unit.win(u, 'iso');
    const cxw = (w.x0 + w.x1) / 2, cyw = (w.y0 + w.y1) / 2;
    let hMax = 6;
    unit.ctxIn(u, w).forEach((c) => { hMax = Math.max(hMax, c.h); });
    steps.forEach((s) => s.els.forEach((e) => { if (e.t === 'mass') hMax = Math.max(hMax, e.floors * FH); }));
    const I0 = iso.make({ yaw: yaw, pitch: pitch, s: 1, cx: 0, cy: 0, center: [cxw, cyw] });
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    const hz = hMax * (zx || 1);
    [[w.x0, w.y0], [w.x1, w.y0], [w.x1, w.y1], [w.x0, w.y1]].forEach((q) => [0, hz].forEach((z) => {
      const p = I0.proj(q[0], q[1], z);
      mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
    }));
    const s = Math.min(rect.w / (mxx - mnx), rect.h / (mxy - mny)) * 0.96;
    const cx = rect.x + rect.w / 2 - s * (mnx + mxx) / 2, cy = rect.y + rect.h / 2 - s * (mny + mxy) / 2;
    return iso.make({ yaw: yaw, pitch: pitch, s: s, cx: cx, cy: cy, center: [cxw, cyw] });
  }

  function floorLines(F, step, h, C, P) {
    if (step <= 1) return;
    F.walls.forEach((w) => {
      for (let k = 1; k < step; k++) {
        const t = k / step;
        const a = [w.pts[3][0] + (w.pts[0][0] - w.pts[3][0]) * t, w.pts[3][1] + (w.pts[0][1] - w.pts[3][1]) * t];
        const b = [w.pts[2][0] + (w.pts[1][0] - w.pts[2][0]) * t, w.pts[2][1] + (w.pts[1][1] - w.pts[2][1]) * t];
        P.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'rgba(255,255,255,.28)', sw: 0.8 });
      }
    });
  }

  function isoStepPrims(u, step, I, C, o) {
    const P = [];
    o = o || {};
    const site = u.site;
    const ring4 = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
    const flat = (ring, z, fill, st) => Object.assign({ t: 'poly', pts: ring.map((q) => I.proj(q[0], q[1], z)), fill: fill }, st);
    // zemin tablası
    const b = o.bounds;
    P.push(flat(ring4(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0), 0, C.ground, { stroke: C.soft, sw: 1 }));
    P.push(flat(ring4(0, 0, site.w, site.d), 0.02, C.parcel, { stroke: C.ink, sw: 1.3, dash: [7, 5] }));
    if (o.grid !== false) {
      const gs = site.w > 80 || site.d > 80 ? 10 : 5;
      iso.grid(I, site.w, site.d, 0.03, gs, { stroke: C.ink, sw: 0.6, opacity: 0.12 }).forEach((p) => {
        // iso.grid yalnızca (0,0)-(W,D) kutusunda; parsel ile aynı
        P.push(p);
      });
    }
    const by = (t) => step.els.filter((e) => e.t === t);
    // zemin düzeyi: yeşil, boşluk, oklar
    by('green').forEach((e) => {
      if (e.round) {
        const pts = [];
        for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([e.x + e.w / 2 + Math.cos(a) * e.w / 2, e.y + e.d / 2 + Math.sin(a) * e.d / 2]); }
        P.push(flat(pts, 0.05, C.green, { stroke: C.greenDk, sw: 1, opacity: 0.92 }));
      } else P.push(flat(ring4(e.x, e.y, e.w, e.d), 0.05, C.green, { stroke: C.greenDk, sw: 1, opacity: 0.92 }));
    });
    by('void').forEach((e) => P.push(flat(ring4(e.x, e.y, e.w, e.d), 0.06, C.voidF, { stroke: C.ink, sw: 1.4, dash: [3, 4], opacity: 0.95 })));
    // hacimler: derinliğe göre
    const solids = [];
    unit.ctxIn(u, o.bounds).forEach((c) => solids.push({ d: I.depth(c.x + c.w / 2, c.y + c.d / 2), mk: () => iso.extrude(I, ring4(c.x, c.y, c.w, c.d), 0, c.h, C.ctx, { stroke: C.edge, sw: 0.9, topFill: C.ctxTop }) }));
    by('mass').forEach((e) => {
      const ring = unit.ring(e), h = e.floors * FH;
      solids.push({ d: I.depth(e.x + e.w / 2, e.y + e.d / 2) + 0.01, mk: () => {
        const F = iso.extrudeFaces(I, ring, 0, h);
        const out = F.walls.map((w) => ({ t: 'poly', pts: w.pts, fill: iso.shade(C.mass, w.f), stroke: C.ink, sw: 1.1 }));
        floorLines(F, e.floors <= 14 ? e.floors : 0, h, C, out);
        out.push({ t: 'poly', pts: F.roof, fill: e.roof === 'green' ? C.green : C.massTop, stroke: C.ink, sw: 1.3 });
        return out;
      } });
    });
    by('tree').forEach((e) => solids.push({ d: I.depth(e.x, e.y) + 0.02, mk: () => {
      const g = I.proj(e.x, e.y, 0), c = I.proj(e.x, e.y, e.r * 1.7);
      return [
        { t: 'line', x1: g[0], y1: g[1], x2: c[0], y2: c[1] + 2, stroke: C.greenDk, sw: Math.max(1, e.r * I.s * 0.14), cap: 'round' },
        { t: 'circle', cx: c[0], cy: c[1], r: Math.max(2.5, e.r * I.s * 0.85), fill: C.green, stroke: C.greenDk, sw: 1, opacity: 0.95 },
      ];
    } }));
    solids.sort((p, q) => p.d - q.d).forEach((sd) => sd.mk().forEach((p) => P.push(p)));
    // akışlar en üstte: bir kütlenin arkasında kalsalar da okunur (anlatım şeması)
    by('arrow').forEach((e) => {
      const a = I.proj(e.x1, e.y1, 0.3), bq = I.proj(e.x2, e.y2, 0.3);
      const pr = arrowScreen(Object.assign([a[0], a[1], bq[0], bq[1]], { k: e.k }), C, o.k || 1);
      if (e.k !== 'entry') pr.forEach((p) => { if (p.t === 'line') P.push(Object.assign({}, p, { stroke: C.ground, sw: p.sw + 3.5, dash: undefined, opacity: 0.75 })); });
      pr.forEach((p) => P.push(p));
    });
    return P;
  }

  /* opts: { live, yaw, pitch, zx, grid } */
  unit.isoScene = function (u, opts) {
    opts = opts || {};
    const C = colors();
    const step = u.steps[Math.min(u.cur, u.steps.length - 1)];
    const M = unit.metrics(u, step);
    const info = frameInfo(u, step, 'İzometrik · adım ' + (u.cur + 1) + '/' + u.steps.length + ' · ' + step.title, M);
    const prims = sheet.frame(info, opts.live !== false);
    const a = AREA();
    panelRect(prims, a, C);
    const I = isoCamera(u, u.steps, opts.yaw == null ? 35 : opts.yaw, opts.pitch == null ? 45 : opts.pitch, { x: a.x + 20, y: a.y + 56, w: a.w - 40, h: a.h - 80 }, opts.zx || 1);
    isoStepPrims(u, step, I, C, { bounds: unit.win(u, 'iso'), grid: opts.grid !== false, k: 1.25 }).forEach((p) => prims.push(p));
    const lab = UP((u.cur + 1) + ' · ' + step.title + (step.sub ? ' — ' + step.sub : ''));
    prims.push({ t: 'text', x: a.x + 24, y: a.y + 38, s: sheet.clip(lab, a.w * 0.6, 17, 700, 'd', upper() ? 1 : 0), size: 17, weight: 700, fam: 'd', fill: C.ink, ls: upper() ? 1 : 0 });
    const lines = wrapText(step.desc, a.w * 0.42, 13, 500, 'b', 3);
    lines.forEach((ln, i) => prims.push({ t: 'text', x: a.x + 24, y: a.y + 62 + i * 17, s: ln, size: 13, weight: 500, fam: 'b', fill: C.ink, opacity: 0.66 }));
    // kütle bilgisi: sağ üst
    const rows = [['Kütle', String(M.masses)], ['Yeşil oranı', '%' + Math.round(M.greenShare * 100)], ['Ağaç', String(M.trees)]];
    rows.forEach((r, i) => {
      prims.push({ t: 'text', x: a.x + a.w - 170, y: a.y + 34 + i * 18, s: UP(r[0]), size: 11.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.55, ls: upper() ? 1 : 0 });
      prims.push({ t: 'text', x: a.x + a.w - 22, y: a.y + 34 + i * 18, s: r[1], size: 13, weight: 700, fam: 'b', fill: C.ink, anchor: 'end' });
    });
    northArrow(C, a.x + a.w - 40, a.y + a.h - 40).forEach((p) => prims.push(p));
    return { prims: prims, I: I };
  };

  /* ==========================================================================
     SÜREÇ AFİŞİ
     ========================================================================== */
  unit.layoutCells = function (n, rect) {
    const cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const cw = rect.w / cols, ch = rect.h / rows;
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: rect.x + (i % cols) * cw, y: rect.y + Math.floor(i / cols) * ch, w: cw, h: ch, i: i });
    return { cols: cols, rows: rows, cells: out };
  };

  /* opts: { live, yaw, pitch, zx } */
  unit.processScene = function (u, opts) {
    opts = opts || {};
    const C = colors();
    const n = u.steps.length;
    const last = u.steps[n - 1];
    const M = unit.metrics(u, last);
    const info = frameInfo(u, last, 'Süreç · ' + n + ' adım · yoğunluk ve boşluk', M);
    const prims = sheet.frame(info, opts.live !== false);
    const a = AREA();
    panelRect(prims, a, C);
    const g = C.g, up = upper();
    const title = (u.title || 'Birim') + (g ? '' : '.');
    // başlık
    const tsize = sheet.fitLine(UP(title), a.w * 0.5, 46, 26, g ? 400 : 700, 'd', up ? 1 : 0);
    prims.push({ t: 'text', x: a.x + 28, y: a.y + 56, s: tsize.s, size: tsize.size, weight: g ? 400 : 700, fam: 'd', fill: C.ink, ls: up ? 1 : 0 });
    // akış satırı
    const fr = { x: a.x + 28, y: a.y + 78, w: a.w - 56, h: 54 };
    const fw = fr.w / n;
    u.steps.forEach((s, i) => {
      const x = fr.x + i * fw;
      prims.push({ t: 'circle', cx: x + 13, cy: fr.y + 16, r: 13, fill: i === n - 1 ? C.mass : C.panel, stroke: C.ink, sw: 1.8 });
      prims.push({ t: 'text', x: x + 13, y: fr.y + 21, s: String(i + 1), size: 13, weight: 700, fam: 'b', fill: i === n - 1 ? (g ? '#F6F7F9' : App.PAL.paper) : C.ink, anchor: 'middle' });
      const nm = sheet.fitLine(UP(s.title), fw - 74, 15, 10, 700, 'd', up ? 0.8 : 0);
      prims.push({ t: 'text', x: x + 33, y: fr.y + 15, s: nm.s, size: nm.size, weight: 700, fam: 'd', fill: C.ink, ls: up ? 0.8 : 0 });
      if (s.sub) prims.push({ t: 'text', x: x + 33, y: fr.y + 33, s: sheet.clip(s.sub, fw - 74, 12, 500, 'b', 0), size: 12, weight: 500, fam: 'b', fill: C.ink, opacity: 0.6 });
      if (i < n - 1) {
        const ax = x + fw - 30;
        prims.push({ t: 'line', x1: ax - 16, y1: fr.y + 16, x2: ax + 8, y2: fr.y + 16, stroke: C.ink, sw: 1.8, opacity: 0.7, cap: 'round' });
        prims.push(headPoly(ax + 12, fr.y + 16, 1, 0, 9, 5, C.ink, C.ink, 1));
      }
    });
    prims.push({ t: 'line', x1: a.x + 20, y1: fr.y + 50, x2: a.x + a.w - 20, y2: fr.y + 50, stroke: C.ink, sw: 1, opacity: 0.12 });

    // paneller
    const rect = { x: a.x + 10, y: fr.y + 58, w: a.w - 20, h: a.h - (fr.y - a.y) - 66 };
    const L = unit.layoutCells(n, rect);
    const wn = unit.win(u, 'iso');
    const hdrH = 62;
    // kamera: tüm adımlar için ortak ölçek
    const cellRect = (c) => ({ x: c.x + 8, y: c.y + hdrH, w: c.w - 16, h: c.h - hdrH - 6 });
    const c0 = cellRect(L.cells[0]);
    const I0 = isoCamera(u, u.steps, opts.yaw == null ? 35 : opts.yaw, opts.pitch == null ? 45 : opts.pitch, c0, opts.zx || 1);
    L.cells.forEach((c) => {
      const s = u.steps[c.i];
      const r = cellRect(c);
      // aynı ölçek, hücreye ötele
      const dx = r.x + r.w / 2 - (c0.x + c0.w / 2), dy = r.y + r.h / 2 - (c0.y + c0.h / 2);
      const I = iso.make({ yaw: opts.yaw == null ? 35 : opts.yaw, pitch: opts.pitch == null ? 45 : opts.pitch, s: I0.s, cx: 0, cy: 0, center: [0, 0] });
      void I;
      const Ic = Object.assign({}, I0);
      Ic.proj = (uu, vv, z) => { const p = I0.proj(uu, vv, z); return [p[0] + dx, p[1] + dy]; };
      // ayırıcı çizgi
      if (c.i % L.cols !== 0) prims.push({ t: 'line', x1: c.x, y1: c.y + 6, x2: c.x, y2: c.y + c.h - 6, stroke: C.ink, sw: 1, opacity: 0.1 });
      if (c.i >= L.cols) prims.push({ t: 'line', x1: c.x + 6, y1: c.y, x2: c.x + c.w - 6, y2: c.y, stroke: C.ink, sw: 1, opacity: 0.1 });
      // başlık + açıklama
      prims.push({ t: 'text', x: c.x + 16, y: c.y + 30, s: String(c.i + 1).padStart(2, '0'), size: 24, weight: g ? 300 : 700, fam: 'd', fill: C.ink, opacity: 0.9 });
      const tt = sheet.fitLine(UP(s.title), c.w - 96, 15, 10, 700, 'd', up ? 0.8 : 0);
      prims.push({ t: 'text', x: c.x + 62, y: c.y + 24, s: tt.s, size: tt.size, weight: 700, fam: 'd', fill: C.ink, ls: up ? 0.8 : 0 });
      wrapText(s.desc, c.w - 80, 11.5, 500, 'b', 2).forEach((ln, k) => prims.push({ t: 'text', x: c.x + 62, y: c.y + 41 + k * 14, s: ln, size: 11.5, weight: 500, fam: 'b', fill: C.ink, opacity: 0.62 }));
      isoStepPrims(u, s, Ic, C, { bounds: wn, grid: false, k: 0.8 }).forEach((p) => prims.push(p));
    });
    return { prims: prims, layout: L };
  };

  /* ---------- tek giriş ---------- */
  unit.scene = function (u, opts) {
    opts = opts || {};
    if (opts.mode === 'iso') return unit.isoScene(u, opts);
    if (opts.mode === 'surec') return unit.processScene(u, opts);
    return unit.planScene(u, opts);
  };
})();
