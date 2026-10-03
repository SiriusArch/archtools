/* ==========================================================================
   26-lib-board.js — pafta sahnesi (primitifler) + SVG / Canvas çizicileri
   Ekrandaki canlı pafta (SVG) ile PNG/PDF çıktısı (Canvas) aynı primitif listesinden
   üretilir; böylece dışa aktarılan görüntü ekrandakiyle birebir aynıdır.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const PAL = App.PAL;
  const FONTS = App.FONTS;
  const geo = App.geo;
  const fmt = App.util.fmt;

  /* ---------------- primitif üreticiler ---------------- */
  function staticBauhaus(info) {
    const P = [];
    const W = geo.W, H = geo.H, F = geo.FRAME, tb = geo.titleBlock;
    P.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: PAL.paper });
    // modüler ızgara (Bauhaus afişlerindeki gibi ince)
    for (let x = F + 50; x < W - F; x += 50) P.push({ t: 'line', x1: x, y1: F, x2: x, y2: tb.y, stroke: PAL.ink, sw: 1, opacity: 0.07 });
    for (let y = F + 50; y < tb.y; y += 50) P.push({ t: 'line', x1: F, y1: y, x2: W - F, y2: y, stroke: PAL.ink, sw: 1, opacity: 0.07 });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, stroke: PAL.ink, sw: 6 });
    P.push({ t: 'line', x1: F, y1: tb.y, x2: W - F, y2: tb.y, stroke: PAL.ink, sw: 5 });

    // logo bloğu
    P.push({ t: 'rect', x: tb.x, y: tb.y, w: tb.h, h: tb.h, fill: PAL.blue });
    P.push({ t: 'circle', cx: tb.x + 36, cy: tb.y + 36, r: 20, fill: PAL.yellow, stroke: PAL.ink, sw: 3 });
    P.push({ t: 'rect', x: tb.x + 54, y: tb.y + 50, w: 36, h: 36, fill: PAL.red, stroke: PAL.ink, sw: 3 });
    P.push({ t: 'poly', pts: [[tb.x + 14, tb.y + 90], [tb.x + 46, tb.y + 90], [tb.x + 30, tb.y + 58]], fill: PAL.paper, stroke: PAL.ink, sw: 3 });
    const xs = [tb.x + tb.h, 720, 1010, 1190];
    xs.forEach((x, i) => { if (i > 0) P.push({ t: 'line', x1: x, y1: tb.y, x2: x, y2: tb.y + tb.h, stroke: PAL.ink, sw: 4 }); });
    P.push({ t: 'line', x1: xs[0], y1: tb.y, x2: xs[0], y2: tb.y + tb.h, stroke: PAL.ink, sw: 4 });

    // proje adı
    let name = String(info.name || 'Adsız proje').toLocaleUpperCase('tr');
    const fs = name.length > 26 ? 24 : name.length > 20 ? 30 : 36;
    const maxCh = Math.floor(560 / (fs * 0.66));
    if (name.length > maxCh) name = name.slice(0, maxCh - 1) + '…';
    P.push({ t: 'text', x: xs[0] + 22, y: tb.y + 54, s: name, size: fs, weight: 700, fam: 'd', fill: PAL.ink, ls: 1 });
    P.push({ t: 'text', x: xs[0] + 22, y: tb.y + 84, s: (info.typeLabel + ' · ' + info.variantLabel).toLocaleUpperCase('tr'), size: 15, weight: 600, fam: 'b', fill: PAL.ink, ls: 2.5, opacity: 0.8 });

    // gösterge
    const lx = xs[1] + 20;
    P.push({ t: 'line', x1: lx, y1: tb.y + 28, x2: lx + 54, y2: tb.y + 28, stroke: PAL.ink, sw: 10 });
    P.push({ t: 'line', x1: lx, y1: tb.y + 28, x2: lx + 54, y2: tb.y + 28, stroke: PAL.paper, sw: 3 });
    P.push({ t: 'text', x: lx + 70, y: tb.y + 34, s: 'GÜÇLÜ İLİŞKİ', size: 15, weight: 600, fam: 'b', fill: PAL.ink, ls: 1.5 });
    P.push({ t: 'line', x1: lx, y1: tb.y + 56, x2: lx + 54, y2: tb.y + 56, stroke: PAL.ink, sw: 3, dash: [11, 8] });
    P.push({ t: 'text', x: lx + 70, y: tb.y + 62, s: 'ZAYIF İLİŞKİ', size: 15, weight: 600, fam: 'b', fill: PAL.ink, ls: 1.5 });
    P.push({ t: 'line', x1: lx, y1: tb.y + 84, x2: lx + 54, y2: tb.y + 84, stroke: PAL.red, sw: 3, dash: [3, 8], cap: 'round' });
    P.push({ t: 'text', x: lx + 70, y: tb.y + 90, s: 'AYRI TUT', size: 15, weight: 600, fam: 'b', fill: PAL.ink, ls: 1.5 });

    // istatistik
    const sx = xs[2] + 20, ex = xs[3] - 20;
    [['MEKAN', String(info.count)], ['TOPLAM', fmt(info.total) + ' m²'], ['TARİH', info.date]].forEach((r, i) => {
      const y = tb.y + 34 + i * 28;
      P.push({ t: 'text', x: sx, y: y, s: r[0], size: 12, weight: 500, fam: 'm', fill: PAL.ink, ls: 1.5, opacity: 0.7 });
      P.push({ t: 'text', x: ex, y: y, s: r[1], size: i === 2 ? 16 : 20, weight: 700, fam: i === 2 ? 'm' : 'd', fill: PAL.ink, anchor: 'end' });
    });

    // skor bloğu
    const pc = info.percent;
    const bg = pc == null ? PAL.paperDark : pc >= 70 ? PAL.green : pc >= 40 ? PAL.yellow : PAL.red;
    const fg = pc == null ? PAL.ink : pc >= 70 ? PAL.paper : pc >= 40 ? PAL.ink : PAL.paper;
    P.push({ t: 'rect', x: xs[3], y: tb.y, w: tb.x + tb.w - xs[3], h: tb.h, fill: bg });
    P.push({ t: 'text', x: xs[3] + 20, y: tb.y + 30, s: 'VERİMLİLİK', size: 13, weight: 500, fam: 'm', fill: fg, ls: 2 });
    P.push({ t: 'text', x: xs[3] + 20, y: tb.y + 88, s: pc == null ? '—' : '%' + pc, size: 58, weight: 700, fam: 'd', fill: fg });
    // üst/alt çerçeve çizgisi kapanışı
    P.push({ t: 'rect', x: tb.x, y: tb.y, w: tb.w, h: tb.h, stroke: PAL.ink, sw: 4 });
    return P;
  }

  function relBauhaus(a, b, type, ra, rb) {
    const P = [];
    if (type === 'strong') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: PAL.ink, sw: 11 });
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: PAL.paper, sw: 3 });
    } else if (type === 'weak') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: PAL.ink, sw: 3, dash: [12, 9] });
    } else if (type === 'avoid') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: PAL.red, sw: 3.5, dash: [3, 9], cap: 'round' });
      // görünür aralığın ortasına çarpı işareti
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
      const s0 = ra, s1 = d - rb;
      const mid = s1 > s0 ? (s0 + s1) / 2 : d / 2;
      const mx = a.x + ux * mid, my = a.y + uy * mid;
      P.push({ t: 'circle', cx: mx, cy: my, r: 12, fill: PAL.paper, stroke: PAL.red, sw: 3 });
      P.push({ t: 'line', x1: mx - 5, y1: my - 5, x2: mx + 5, y2: my + 5, stroke: PAL.red, sw: 3, cap: 'round' });
      P.push({ t: 'line', x1: mx - 5, y1: my + 5, x2: mx + 5, y2: my - 5, stroke: PAL.red, sw: 3, cap: 'round' });
    }
    return P;
  }

  function bubbleBauhaus(s, r) {
    const z = App.ZONES[s.zone] || App.ZONES.sosyal;
    const P = [];
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r, fill: z.fill, stroke: PAL.ink, sw: 5 });
    if (r >= 60) P.push({ t: 'circle', cx: s.x, cy: s.y, r: r - 11, stroke: z.text, sw: 1.5, opacity: 0.35 });
    const lab = geo.label(s.name, r);
    const areaTxt = fmt(s.area) + ' m²';
    const afs = Math.max(10, Math.round(lab.fs * 0.78));
    const lh = lab.fs * 1.12;
    if (lab.outside) {
      let y = s.y + r + 20;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: PAL.ink, anchor: 'middle', ls: lab.ls }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: PAL.ink, anchor: 'middle' });
    } else {
      const blockH = lab.lines.length * lh + afs + 4;
      let y = s.y - blockH / 2 + lab.fs * 0.85;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: z.text, anchor: 'middle', ls: lab.ls }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle' });
    }
    return P;
  }


  /* ---------------- GLASS (minimal, tek renksiz) ---------------- */
  function staticGlass(info, opts) {
    const P = [];
    const W = geo.W, H = geo.H, F = geo.FRAME, tb = geo.titleBlock;
    const ink = PAL.ink;
    const live = !!(opts && opts.live);
    if (!live) P.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#E9EAEE' });
    // kabartmalı levha: koyu gölge + açık vurgu
    const sheet = live ? 'rgba(249,250,252,.9)' : '#F6F7F9';
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, fill: sheet, shadow: { dx: 10, dy: 14, blur: 30, color: 'rgba(46,52,68,.22)', css: 'var(--sheet-lo, rgba(46,52,68,.22))' } });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, fill: sheet, shadow: { dx: -8, dy: -8, blur: 20, color: 'rgba(255,255,255,.9)', css: 'var(--sheet-hi, rgba(255,255,255,.9))' } });
    // nokta ızgara
    for (let x = F + 50; x < W - F; x += 50) for (let y = F + 50; y < tb.y; y += 50) P.push({ t: 'circle', cx: x, cy: y, r: 1.7, fill: ink, opacity: 0.13 });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, stroke: ink, sw: 1.5, opacity: 0.10 });
    P.push({ t: 'line', x1: tb.x + 30, y1: tb.y, x2: tb.x + tb.w - 30, y2: tb.y, stroke: ink, sw: 1.5, opacity: 0.14 });

    let name = String(info.name || 'Adsız proje');
    const fs = name.length > 26 ? 18 : name.length > 20 ? 22 : 27;
    const maxCh = Math.floor(540 / (fs * 0.82));
    if (name.length > maxCh) name = name.slice(0, maxCh - 1) + '…';
    const x0 = tb.x + 36;
    P.push({ t: 'text', x: x0, y: tb.y + 56, s: name, size: fs, weight: 400, fam: 'd', fill: ink });
    P.push({ t: 'text', x: x0, y: tb.y + 84, s: info.typeLabel + ' · ' + info.variantLabel, size: 15, weight: 600, fam: 'b', fill: ink, opacity: 0.5 });

    // gösterge
    const lx = 650;
    P.push({ t: 'line', x1: lx, y1: tb.y + 34, x2: lx + 48, y2: tb.y + 34, stroke: ink, sw: 6, cap: 'round' });
    P.push({ t: 'text', x: lx + 64, y: tb.y + 39, s: 'Güçlü ilişki', size: 14, weight: 600, fam: 'b', fill: ink, opacity: 0.8 });
    P.push({ t: 'line', x1: lx, y1: tb.y + 58, x2: lx + 48, y2: tb.y + 58, stroke: ink, sw: 2.5, dash: [9, 8], cap: 'round', opacity: 0.7 });
    P.push({ t: 'text', x: lx + 64, y: tb.y + 63, s: 'Zayıf ilişki', size: 14, weight: 600, fam: 'b', fill: ink, opacity: 0.8 });
    P.push({ t: 'line', x1: lx, y1: tb.y + 82, x2: lx + 48, y2: tb.y + 82, stroke: ink, sw: 3.5, dash: [0.5, 9], cap: 'round' });
    P.push({ t: 'text', x: lx + 64, y: tb.y + 87, s: 'Ayrı tut', size: 14, weight: 600, fam: 'b', fill: ink, opacity: 0.8 });

    // istatistik
    const sx = 905, ex = 1105;
    [['Mekân', String(info.count)], ['Toplam', fmt(info.total) + ' m²'], ['Tarih', info.date]].forEach((r, i) => {
      const y = tb.y + 40 + i * 25;
      P.push({ t: 'text', x: sx, y: y, s: r[0], size: 13, weight: 500, fam: 'b', fill: ink, opacity: 0.5 });
      P.push({ t: 'text', x: ex, y: y, s: r[1], size: 15, weight: 700, fam: 'b', fill: ink, anchor: 'end' });
    });

    // skor
    const pc = info.percent;
    const rx = tb.x + tb.w - 36;
    P.push({ t: 'text', x: rx, y: tb.y + 36, s: 'Verimlilik', size: 13, weight: 600, fam: 'b', fill: ink, opacity: 0.5, anchor: 'end' });
    P.push({ t: 'text', x: rx, y: tb.y + 84, s: pc == null ? '—' : '%' + pc, size: 50, weight: 300, fam: 'd', fill: ink, anchor: 'end' });
    return P;
  }

  function relGlass(a, b, type, ra, rb) {
    const P = [];
    const ink = PAL.ink;
    if (type === 'strong') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: ink, sw: 6, cap: 'round' });
    } else if (type === 'weak') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: ink, sw: 2.5, dash: [9, 9], cap: 'round', opacity: 0.7 });
    } else if (type === 'avoid') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: ink, sw: 3.5, dash: [0.5, 10], cap: 'round' });
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
      const s0 = ra, s1 = d - rb;
      const mid = s1 > s0 ? (s0 + s1) / 2 : d / 2;
      const mx = a.x + ux * mid, my = a.y + uy * mid;
      P.push({ t: 'circle', cx: mx, cy: my, r: 13, fill: '#F6F7F9', stroke: ink, sw: 2, shadow: { dx: 0, dy: 3, blur: 7, color: 'rgba(30,34,44,.28)' } });
      P.push({ t: 'line', x1: mx - 5, y1: my - 5, x2: mx + 5, y2: my + 5, stroke: ink, sw: 2.4, cap: 'round' });
      P.push({ t: 'line', x1: mx - 5, y1: my + 5, x2: mx + 5, y2: my - 5, stroke: ink, sw: 2.4, cap: 'round' });
    }
    return P;
  }

  function bubbleGlass(s, r) {
    const z = App.ZONES[s.zone] || App.ZONES.sosyal;
    const P = [];
    // yumuşak kabartma: koyu gölge + açık vurgu, üstüne cam kenar
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r, fill: z.fill, shadow: { dx: 9, dy: 12, blur: 22, color: 'rgba(36,40,52,.30)' } });
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r, fill: z.fill, shadow: { dx: -8, dy: -8, blur: 18, color: 'rgba(255,255,255,.95)' } });
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r - 1, stroke: 'rgba(23,24,27,.13)', sw: 1.5 });
    if (r >= 60) P.push({ t: 'circle', cx: s.x, cy: s.y, r: r - 13, stroke: z.text, sw: 1.2, opacity: 0.14 });
    const lab = geo.label(s.name, r);
    const areaTxt = fmt(s.area) + ' m²';
    const afs = Math.max(10, Math.round(lab.fs * 0.8));
    const lh = lab.fs * 1.15;
    const ink = PAL.ink;
    if (lab.outside) {
      const y = s.y + r + 22;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: ink, anchor: 'middle' }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: ink, anchor: 'middle', opacity: 0.6 });
    } else {
      const blockH = lab.lines.length * lh + afs + 4;
      const y = s.y - blockH / 2 + lab.fs * 0.85;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: z.text, anchor: 'middle' }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.72 });
    }
    return P;
  }

  const isGlass = () => App.theme.name === 'glass';
  const staticPrims = (info, opts) => (isGlass() ? staticGlass(info, opts) : staticBauhaus(info, opts));
  const relLinePrims = (a, b, type, ra, rb) => (isGlass() ? relGlass(a, b, type, ra, rb) : relBauhaus(a, b, type, ra, rb));
  const bubblePrims = (s, r) => (isGlass() ? bubbleGlass(s, r) : bubbleBauhaus(s, r));

  function infoOf(project, score) {
    const type = App.kb.type(project.meta.buildingType);
    const variant = App.kb.variant(project.meta.buildingType, project.meta.variant);
    return {
      name: project.meta.name,
      typeLabel: type.label,
      variantLabel: variant.label,
      count: project.spaces.length,
      total: App.util.sum(project.spaces, (s) => s.area),
      date: App.util.today(),
      percent: score ? score.percent : null,
    };
  }

  function allPrims(project, k, score) {
    const P = staticPrims(infoOf(project, score));
    const by = new Map(project.spaces.map((s) => [s.id, s]));
    Object.keys(project.relations).forEach((key) => {
      const ids = key.split('|');
      const a = by.get(ids[0]), b = by.get(ids[1]);
      if (!a || !b) return;
      relLinePrims(a, b, project.relations[key], geo.radius(a.area, k), geo.radius(b.area, k)).forEach((x) => P.push(x));
    });
    project.spaces.forEach((s) => bubblePrims(s, geo.radius(s.area, k)).forEach((x) => P.push(x)));
    return P;
  }

  /* ---------------- SVG çizici (sanal DOM düğümü) ---------------- */
  function shadowCss(sh) { return 'drop-shadow(' + sh.dx + 'px ' + sh.dy + 'px ' + sh.blur + 'px ' + (sh.css || sh.color) + ')'; }

  function primToV(p, extra) {
    const a = Object.assign({}, extra || {});
    if (p.opacity != null) a.opacity = p.opacity;
    switch (p.t) {
      case 'rect':
        Object.assign(a, { x: p.x, y: p.y, width: p.w, height: p.h, fill: p.fill || 'none' });
        if (p.rx) a.rx = p.rx;
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = p.rx ? 'round' : 'miter'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        if (p.shadow) a.style = { filter: shadowCss(p.shadow) };
        return h('rect', a);
      case 'circle':
        Object.assign(a, { cx: p.cx, cy: p.cy, r: p.r, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; }
        if (p.shadow) a.style = { filter: shadowCss(p.shadow) };
        return h('circle', a);
      case 'line':
        Object.assign(a, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: p.stroke, 'stroke-width': p.sw, 'stroke-linecap': p.cap || 'butt' });
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('line', a);
      case 'poly':
        Object.assign(a, { points: p.pts.map((q) => q.join(',')).join(' '), fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = 'round'; }
        return h('polygon', a);
      case 'path':
        Object.assign(a, { d: p.d, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linecap'] = p.cap || 'butt'; a['stroke-linejoin'] = 'round'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('path', a);
      case 'text':
        Object.assign(a, { x: p.x, y: p.y, fill: p.fill, 'font-family': FONTS[p.fam], 'font-size': p.size, 'font-weight': p.weight, 'text-anchor': p.anchor || 'start' });
        if (p.xf) { a.x = 0; a.y = 0; a.transform = 'matrix(' + p.xf.map((v) => Math.round(v * 1000) / 1000).join(' ') + ' ' + Math.round(p.x * 100) / 100 + ' ' + Math.round(p.y * 100) / 100 + ')'; }
        if (p.ls) a['letter-spacing'] = p.ls;
        if (p.pe === false) a['pointer-events'] = 'none';
        return h('text', a, p.s);
    }
    return null;
  }

  /* ---------------- Canvas çizici ---------------- */
  function applyShadow(ctx, sh) {
    if (!sh) return;
    const k = ctx.__k || 1;
    ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur * k; ctx.shadowOffsetX = sh.dx * k; ctx.shadowOffsetY = sh.dy * k;
  }

  function paintPrim(ctx, p) {
    ctx.save();
    if (p.opacity != null) ctx.globalAlpha = p.opacity;
    ctx.setLineDash(p.dash || []);
    ctx.lineCap = p.cap || 'butt';
    switch (p.t) {
      case 'rect':
        applyShadow(ctx, p.shadow);
        if (p.rx) {
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h, p.rx); else ctx.rect(p.x, p.y, p.w, p.h);
          if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'round'; ctx.stroke(); }
        } else {
          if (p.fill) { ctx.fillStyle = p.fill; ctx.fillRect(p.x, p.y, p.w, p.h); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'miter'; ctx.strokeRect(p.x, p.y, p.w, p.h); }
        }
        break;
      case 'circle':
        applyShadow(ctx, p.shadow);
        ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.stroke(); }
        break;
      case 'line':
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2);
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.stroke();
        break;
      case 'poly':
        ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'round'; ctx.stroke(); }
        break;
      case 'path': {
        const pth = new Path2D(p.d);
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(pth); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'round'; ctx.stroke(pth); }
        break;
      }
      case 'text':
        ctx.font = p.weight + ' ' + p.size + 'px ' + FONTS[p.fam];
        ctx.fillStyle = p.fill;
        ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        if ('letterSpacing' in ctx) ctx.letterSpacing = (p.ls || 0) + 'px';
        if (p.xf) { ctx.transform(p.xf[0], p.xf[1], p.xf[2], p.xf[3], p.x, p.y); ctx.fillText(p.s, 0, 0); }
        else ctx.fillText(p.s, p.x, p.y);
        break;
    }
    ctx.restore();
  }

  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = App.theme.cur().fontLoads.map((f) => document.fonts.load(f, 'AaİıŞşĞğÜüÖöÇç0123456789'));
    return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]).catch(function () {});
  }

  function toCanvas(project, k, score, factor) {
    return ensureFonts().then(function () {
      const s = factor || 2;
      const cv = document.createElement('canvas');
      cv.width = Math.round(geo.W * s);
      cv.height = Math.round(geo.H * s);
      const ctx = cv.getContext('2d');
      ctx.__k = s;
      ctx.scale(s, s);
      allPrims(project, k, score).forEach((p) => paintPrim(ctx, p));
      return cv;
    });
  }

  // Herhangi bir sahneyi (primitif listesi) tuvale çiz: diğer modüller (kat etüdü, analiz) kullanır
  function primsToCanvas(prims, W, H, factor) {
    return ensureFonts().then(function () {
      const s = factor || 2;
      const cv = document.createElement('canvas');
      cv.width = Math.round(W * s);
      cv.height = Math.round(H * s);
      const ctx = cv.getContext('2d');
      ctx.__k = s;
      ctx.scale(s, s);
      prims.forEach((p) => paintPrim(ctx, p));
      return cv;
    });
  }

  App.board = {
    staticPrims: staticPrims, relLinePrims: relLinePrims, bubblePrims: bubblePrims, infoOf: infoOf,
    allPrims: allPrims, primToV: primToV, paintPrim: paintPrim, toCanvas: toCanvas, primsToCanvas: primsToCanvas, shadowCss: shadowCss,
  };
})();
