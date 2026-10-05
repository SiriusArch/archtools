/* ==========================================================================
   39-lib-planscene.js — Modül 10 · Vaziyet Planı paftası (ölçekli)
   Canlı SVG ve PNG/PDF çıktısı aynı primitif listesinden çizilir. Çizim, pafta alanına kırpılır (g grubu).
   ========================================================================== */
(function () {
  const App = window.App;
  const sheet = App.sheet;
  const plan = App.plan;
  const U = App.util;
  const fmt = U.fmt;
  const G = plan.geo;

  const glass = () => App.theme.name === 'glass';
  const AREA = () => ({ x: 64, y: 54, w: sheet.W - 128, h: sheet.tb.y - 54 - 22 });
  plan.area = AREA;

  plan.styleOf = (P) => (P.style === 'sade' || P.style === 'renkli' ? P.style : (glass() ? 'sade' : 'renkli'));

  /* iki çizim stili: sade (gri tonlu, sunum) ve renkli */
  function palette(style) {
    const PAL = App.PAL;
    if (style === 'sade') {
      return { name: 'sade', ink: PAL.ink, ground: '#F4F4F2', grid: 'rgba(23,24,27,.07)', road: '#DADAD7', roadEdge: '#C4C4C0', center: '#FFFFFF', path: '#EEEDE8', pathEdge: '#D2D1CA', plaza: '#E8E8E4', plazaEdge: '#D2D2CC', park: '#D5D5D1', parkLine: '#BDBDB8',
        green: '#CBD6C3', greenEdge: '#B2C0A9', forest: '#B7C6AD', water: '#CAD8DE', waterEdge: '#AFC3CC', bldOld: '#EDEDEA', bldOldEdge: '#B9B9B5', bldNew: '#FFFFFF', bldNewEdge: '#17181B', shadow: 'rgba(40,44,52,.16)',
        tree: '#B6C6AD', treeEdge: '#98AB8F', treeHi: '#D2DECA', treeShade: 'rgba(40,44,52,.12)', bound: '#17181B', text: '#17181B', panel: '#F1F2F5', panelStroke: 'rgba(23,24,27,.16)' };
    }
    return { name: 'renkli', ink: PAL.ink, ground: '#EDE7D6', grid: 'rgba(38,29,17,.09)', road: '#9A9C9E', roadEdge: '#75787B', center: '#F4F1E6', path: '#F2E9D3', pathEdge: '#D4C6A4', plaza: '#E4D4B2', plazaEdge: '#C9B88F', park: '#B3B1AA', parkLine: '#F1ECDC',
      green: '#98BA74', greenEdge: '#6F9553', forest: '#6E9A56', water: '#7FB1D2', waterEdge: '#4E86AB', bldOld: '#D9D2C0', bldOldEdge: '#8F8874', bldNew: '#FFFDF6', bldNewEdge: '#261D11', shadow: 'rgba(38,29,17,.22)',
      tree: '#5F9249', treeEdge: '#3F6A31', treeHi: '#8DBB6B', treeShade: 'rgba(38,29,17,.2)', bound: '#C03A22', text: '#261D11', panel: PAL.paperDark, panelStroke: PAL.ink };
  }
  plan.palette = palette;

  /* pafta penceresi: (cx, cy) merkez, ölçek → px/m */
  plan.view = function (P) {
    const a = AREA();
    const ppm = plan.pxPerM(P.scale);
    const X = (x) => a.x + a.w / 2 + (x - P.cx) * ppm;
    const Y = (y) => a.y + a.h / 2 + (y - P.cy) * ppm;
    return { area: a, ppm: ppm, X: X, Y: Y, wx: (px) => P.cx + (px - a.x - a.w / 2) / ppm, wy: (py) => P.cy + (py - a.y - a.h / 2) / ppm, win: { x0: P.cx - a.w / 2 / ppm, y0: P.cy - a.h / 2 / ppm, x1: P.cx + a.w / 2 / ppm, y1: P.cy + a.h / 2 / ppm } };
  };

  const toPx = (pts, v) => pts.map((q) => [v.X(q[0]), v.Y(q[1])]);
  const pathOf = (px, smooth, closed) => (smooth ? plan.smoothPath(px, closed) : plan.linePath(px, closed));

  function legendOf(P, C) {
    const has = (t, f) => P.els.some((e) => e.t === t && (!f || f(e)));
    const out = [];
    const lineLg = (label, stroke, sw, dash) => ({ label: label, line: { stroke: stroke, sw: sw, dash: dash, cap: 'round' } });
    if (has('bld', (e) => e.k === 'yeni')) out.push({ label: 'Yeni yapı', fill: C.bldNew });
    if (has('bld', (e) => e.k === 'mevcut')) out.push({ label: 'Mevcut yapı', fill: C.bldOld });
    if (has('green')) out.push({ label: 'Yeşil alan', fill: C.green });
    if (has('water')) out.push({ label: 'Su', fill: C.water });
    if (has('road', (e) => e.k === 'arac')) out.push(lineLg('Taşıt yolu', C.road, 8));
    if (has('road', (e) => e.k === 'yaya')) out.push(lineLg('Yaya yolu', C.pathEdge, 4));
    if (has('plaza')) out.push({ label: 'Meydan', fill: C.plaza });
    if (has('park')) out.push({ label: 'Otopark', fill: C.park });
    if (has('bound') && out.length < 8) out.push(lineLg('Proje sınırı', C.bound, 2.5, [7, 4]));
    return out.slice(0, 8);
  }

  function gridPrims(v, C, P) {
    const out = [];
    const step = v.ppm >= 6 ? 10 : v.ppm >= 1.6 ? 50 : 100;
    const w = v.win;
    for (let x = Math.ceil(w.x0 / step) * step; x <= w.x1; x += step) out.push({ t: 'line', x1: v.X(x), y1: v.area.y, x2: v.X(x), y2: v.area.y + v.area.h, stroke: C.ink, sw: 0.8, opacity: 0.1 });
    for (let y = Math.ceil(w.y0 / step) * step; y <= w.y1; y += step) out.push({ t: 'line', x1: v.area.x, y1: v.Y(y), x2: v.area.x + v.area.w, y2: v.Y(y), stroke: C.ink, sw: 0.8, opacity: 0.1 });
    void P;
    return out;
  }

  // otopark çizgileri: çokgenin içine kırpılmış 45° tarama
  function parkPrims(e, v, C) {
    const px = toPx(e.pts, v);
    const b = G.bbox(px);
    const items = [];
    const gap = Math.max(4, 2.5 * v.ppm);
    for (let k = -(b.y1 - b.y0); k < b.x1 - b.x0 + (b.y1 - b.y0); k += gap) items.push({ t: 'line', x1: b.x0 + k, y1: b.y0, x2: b.x0 + k - (b.y1 - b.y0), y2: b.y1, stroke: C.parkLine, sw: 1.1 });
    return [{ t: 'poly', pts: px, fill: C.park, stroke: C.plazaEdge, sw: 1 }, { t: 'g', clip: { id: 'pk' + e.id, pts: px }, items: items }];
  }

  function bldPrims(e, v, C, P, shadowsOnly) {
    const out = [];
    const px = toPx(e.pts, v);
    if (shadowsOnly) {
      const len = Math.min(40, e.floors * plan.FH * 0.5);
      const dx = len * 0.7, dy = len * 0.7;
      const hl = G.hull(e.pts.concat(e.pts.map((q) => [q[0] + dx, q[1] + dy])));
      if (hl.length >= 3) out.push({ t: 'poly', pts: toPx(hl, v), fill: C.shadow });
      return out;
    }
    const neu = e.k === 'yeni';
    out.push({ t: 'poly', pts: px, fill: neu ? C.bldNew : C.bldOld, stroke: neu ? C.bldNewEdge : C.bldOldEdge, sw: neu ? 1.7 : 1.1 });
    if (P.labels && neu) {
      const b = G.bbox(px);
      if (b.x1 - b.x0 > 34 && b.y1 - b.y0 > 18) {
        const c = G.centroid(px);
        out.push({ t: 'text', x: c[0], y: c[1] + 4, s: e.floors + ' kat', size: 11.5, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle', opacity: 0.75, pe: false });
      }
    }
    return out;
  }

  function scaleBar(v, C, x, y) {
    const out = [];
    const cand = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
    let m = cand[0];
    cand.forEach((c) => { if (c * v.ppm <= 170) m = c; });
    const len = m * v.ppm;
    const st = { stroke: C.ink, sw: 2, opacity: 0.8 };
    out.push({ t: 'rect', x: x - 12, y: y - 30, w: len + 24, h: 48, rx: glass() ? 10 : 0, fill: C.panel, opacity: 0.9 });
    out.push(Object.assign({ t: 'line', x1: x, y1: y, x2: x + len, y2: y }, st));
    [0, 0.5, 1].forEach((f) => out.push(Object.assign({ t: 'line', x1: x + len * f, y1: y - (f === 0.5 ? 3 : 6), x2: x + len * f, y2: y + (f === 0.5 ? 3 : 6) }, st)));
    out.push({ t: 'text', x: x, y: y - 11, s: '0', size: 11, weight: 700, fam: 'm', fill: C.ink, opacity: 0.8, anchor: 'middle' });
    out.push({ t: 'text', x: x + len, y: y - 11, s: m + ' m', size: 11, weight: 700, fam: 'm', fill: C.ink, opacity: 0.8, anchor: 'middle' });
    return out;
  }
  function northArrow(C, x, y) {
    return [
      { t: 'circle', cx: x, cy: y, r: 17, fill: C.panel, stroke: C.ink, sw: 1.6, opacity: 0.9 },
      { t: 'poly', pts: [[x, y - 13], [x - 6, y + 9], [x, y + 4], [x + 6, y + 9]], fill: C.ink, opacity: 0.85 },
      { t: 'text', x: x, y: y - 24, s: 'K', size: 12, weight: 700, fam: 'm', fill: C.ink, opacity: 0.8, anchor: 'middle' },
    ];
  }

  /* opts: { live, grid } */
  plan.scene = function (P, opts) {
    opts = opts || {};
    const style = plan.styleOf(P);
    const C = palette(style);
    const v = plan.view(P);
    const a = v.area;
    const M = plan.metrics(P);
    const info = {
      name: P.title || (App.store && App.store.get().project.meta.name) || 'Vaziyet planı',
      subtitle: 'Vaziyet planı · 1/' + P.scale + ' · A3',
      legend: legendOf(P, C),
      stats: M.hasBound
        ? [['Parsel alanı', fmt(M.boundArea) + ' m²'], ['TAKS / KAKS', fmt(M.taks, 2) + ' / ' + fmt(M.kaks, 2)], ['Yeşil alan', fmt(M.green) + ' m²']]
        : [['Yeni yapı', M.nNew + ' · ' + fmt(M.newFoot) + ' m²'], ['Mevcut yapı', String(M.nOld)], ['Ağaç', String(M.trees)]],
      scoreLabel: 'Yeşil oranı', percent: M.greenShare == null ? null : Math.round(M.greenShare * 100),
    };
    const prims = sheet.frame(info, opts.live !== false);
    const items = [];
    items.push({ t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: C.ground });
    if (P.grid) gridPrims(v, C, P).forEach((p) => items.push(p));
    const by = (t, f) => P.els.filter((e) => e.t === t && (!f || f(e)));
    const sw = (m, min) => Math.max(min || 1.2, m * v.ppm);

    by('water').forEach((e) => { const px = toPx(e.pts, v); items.push({ t: 'path', d: pathOf(px, e.smooth, true), fill: C.water, stroke: C.waterEdge, sw: 1.4 }); });
    by('green').forEach((e) => { const px = toPx(e.pts, v); items.push({ t: 'path', d: pathOf(px, e.smooth, true), fill: e.k === 'orman' ? C.forest : C.green, stroke: C.greenEdge, sw: 1.2 }); });
    by('plaza').forEach((e) => { const px = toPx(e.pts, v); items.push({ t: 'path', d: pathOf(px, e.smooth, true), fill: C.plaza, stroke: C.plazaEdge, sw: 1.1 }); });
    by('park').forEach((e) => parkPrims(e, v, C).forEach((p) => items.push(p)));
    // yollar: önce kenarlıklar, sonra dolgular (kesişimler birleşir)
    const roads = by('road', (e) => e.k !== 'yaya'), paths = by('road', (e) => e.k === 'yaya');
    roads.forEach((e) => items.push({ t: 'path', d: pathOf(toPx(e.pts, v), e.smooth, false), stroke: C.roadEdge, sw: sw(e.w, 2) + 2.6, cap: 'round' }));
    roads.forEach((e) => items.push({ t: 'path', d: pathOf(toPx(e.pts, v), e.smooth, false), stroke: C.road, sw: sw(e.w, 2), cap: 'round' }));
    roads.forEach((e) => { if (e.w * v.ppm >= 22) items.push({ t: 'path', d: pathOf(toPx(e.pts, v), e.smooth, false), stroke: C.center, sw: 1.1, dash: [9, 9], opacity: 0.55 }); });
    paths.forEach((e) => items.push({ t: 'path', d: pathOf(toPx(e.pts, v), e.smooth, false), stroke: C.pathEdge, sw: sw(e.w, 1.6) + 1.8, cap: 'round' }));
    paths.forEach((e) => items.push({ t: 'path', d: pathOf(toPx(e.pts, v), e.smooth, false), stroke: C.path, sw: sw(e.w, 1.6), cap: 'round' }));
    if (P.shadow) by('bld').forEach((e) => bldPrims(e, v, C, P, true).forEach((p) => items.push(p)));
    by('bld', (e) => e.k === 'mevcut').forEach((e) => bldPrims(e, v, C, P).forEach((p) => items.push(p)));
    by('bld', (e) => e.k === 'yeni').forEach((e) => bldPrims(e, v, C, P).forEach((p) => items.push(p)));
    by('bound').forEach((e) => items.push({ t: 'poly', pts: toPx(e.pts, v), stroke: C.bound, sw: 2.6, dash: [11, 6] }));
    const trees = by('tree');
    if (P.shadow) trees.forEach((e) => items.push({ t: 'circle', cx: v.X(e.x) + e.r * v.ppm * 0.35, cy: v.Y(e.y) + e.r * v.ppm * 0.35, r: Math.max(1.5, e.r * v.ppm), fill: C.treeShade }));
    trees.forEach((e) => {
      const r = Math.max(1.5, e.r * v.ppm);
      items.push({ t: 'circle', cx: v.X(e.x), cy: v.Y(e.y), r: r, fill: C.tree, stroke: C.treeEdge, sw: 0.9, opacity: 0.94 });
      if (r > 4) items.push({ t: 'circle', cx: v.X(e.x) - r * 0.22, cy: v.Y(e.y) - r * 0.22, r: r * 0.46, fill: C.treeHi, opacity: 0.55 });
    });
    by('text').forEach((e) => items.push({ t: 'text', x: v.X(e.x), y: v.Y(e.y) + e.size * 0.34, s: e.s, size: e.size, weight: 700, fam: 'd', fill: C.text, anchor: 'middle', ls: App.theme.cur().label.upper ? 0.6 : 0, pe: false }));

    prims.push({ t: 'g', clip: { id: 'plan-area', x: a.x, y: a.y, w: a.w, h: a.h }, items: items });
    prims.push(glass() ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, stroke: C.panelStroke, sw: 1 } : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, stroke: C.ink, sw: 4 });
    scaleBar(v, C, a.x + 36, a.y + a.h - 24).forEach((p) => prims.push(p));
    northArrow(C, a.x + a.w - 36, a.y + 44).forEach((p) => prims.push(p));
    // ölçek etiketi
    const lab = '1/' + P.scale;
    const lw = sheet.tw(lab, 17, 700, 'd', 0) + 24;
    prims.push({ t: 'rect', x: a.x + 12, y: a.y + 12, w: lw, h: 32, rx: glass() ? 10 : 0, fill: C.panel, opacity: 0.92 });
    prims.push({ t: 'text', x: a.x + 24, y: a.y + 34, s: lab, size: 17, weight: 700, fam: 'd', fill: C.ink });
    return { prims: prims, view: v, metrics: M };
  };
})();
