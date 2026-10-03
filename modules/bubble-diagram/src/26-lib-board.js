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
  function staticPrims(info) {
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

  function relLinePrims(a, b, type, ra, rb) {
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

  function bubblePrims(s, r) {
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
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'd', fill: PAL.ink, anchor: 'middle', ls: 0.5 }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: PAL.ink, anchor: 'middle' });
    } else {
      const blockH = lab.lines.length * lh + afs + 4;
      let y = s.y - blockH / 2 + lab.fs * 0.85;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'd', fill: z.text, anchor: 'middle', ls: 0.5 }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle' });
    }
    return P;
  }

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
  function primToV(p, extra) {
    const a = Object.assign({}, extra || {});
    if (p.opacity != null) a.opacity = p.opacity;
    switch (p.t) {
      case 'rect':
        Object.assign(a, { x: p.x, y: p.y, width: p.w, height: p.h, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = 'miter'; }
        return h('rect', a);
      case 'circle':
        Object.assign(a, { cx: p.cx, cy: p.cy, r: p.r, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; }
        return h('circle', a);
      case 'line':
        Object.assign(a, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: p.stroke, 'stroke-width': p.sw, 'stroke-linecap': p.cap || 'butt' });
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('line', a);
      case 'poly':
        Object.assign(a, { points: p.pts.map((q) => q.join(',')).join(' '), fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = 'round'; }
        return h('polygon', a);
      case 'text':
        Object.assign(a, { x: p.x, y: p.y, fill: p.fill, 'font-family': FONTS[p.fam], 'font-size': p.size, 'font-weight': p.weight, 'text-anchor': p.anchor || 'start' });
        if (p.ls) a['letter-spacing'] = p.ls;
        return h('text', a, p.s);
    }
    return null;
  }

  /* ---------------- Canvas çizici ---------------- */
  function paintPrim(ctx, p) {
    ctx.save();
    if (p.opacity != null) ctx.globalAlpha = p.opacity;
    ctx.setLineDash(p.dash || []);
    ctx.lineCap = p.cap || 'butt';
    switch (p.t) {
      case 'rect':
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fillRect(p.x, p.y, p.w, p.h); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'miter'; ctx.strokeRect(p.x, p.y, p.w, p.h); }
        break;
      case 'circle':
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
      case 'text':
        ctx.font = p.weight + ' ' + p.size + 'px ' + FONTS[p.fam];
        ctx.fillStyle = p.fill;
        ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        if ('letterSpacing' in ctx) ctx.letterSpacing = (p.ls || 0) + 'px';
        ctx.fillText(p.s, p.x, p.y);
        break;
    }
    ctx.restore();
  }

  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = [
      "700 20px 'Chakra Petch'", "600 16px 'Jost'", "500 14px 'DM Mono'", "700 16px 'DM Mono'",
    ].map((f) => document.fonts.load(f, 'AaİıŞşĞğÜüÖöÇç0123456789'));
    return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]).catch(function () {});
  }

  function toCanvas(project, k, score, factor) {
    return ensureFonts().then(function () {
      const s = factor || 2;
      const cv = document.createElement('canvas');
      cv.width = Math.round(geo.W * s);
      cv.height = Math.round(geo.H * s);
      const ctx = cv.getContext('2d');
      ctx.scale(s, s);
      allPrims(project, k, score).forEach((p) => paintPrim(ctx, p));
      return cv;
    });
  }

  App.board = {
    staticPrims: staticPrims, relLinePrims: relLinePrims, bubblePrims: bubblePrims, infoOf: infoOf,
    allPrims: allPrims, primToV: primToV, paintPrim: paintPrim, toCanvas: toCanvas,
  };
})();
