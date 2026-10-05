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
  /* İşlev şeması künyesi: ortak, ölçümlü pafta çerçevesi (App.sheet.frame) kullanılır */
  function frameInfo(info, glass) {
    const ink = PAL.ink;
    const legend = glass ? [
      { label: 'Güçlü ilişki', line: { stroke: ink, sw: 6, cap: 'round' } },
      { label: 'Zayıf ilişki', line: { stroke: ink, sw: 2.5, dash: [9, 8], cap: 'round', opacity: 0.7 } },
      { label: 'Ayrı tut', line: { stroke: ink, sw: 3.5, dash: [0.5, 9], cap: 'round' } }
    ] : [
      { label: 'Güçlü ilişki', line: { stroke: ink, sw: 10, inner: { stroke: PAL.paper, sw: 3 } } },
      { label: 'Zayıf ilişki', line: { stroke: ink, sw: 3, dash: [11, 8] } },
      { label: 'Ayrı tut', line: { stroke: PAL.red, sw: 3, dash: [3, 8], cap: 'round' } }
    ];
    return {
      name: info.name, subtitle: info.typeLabel + ' · ' + info.variantLabel, legend: legend,
      stats: [['Mekân', String(info.count)], ['Toplam', fmt(info.total) + ' m²'], ['Tarih', info.date]],
      scoreLabel: 'Verimlilik', percent: info.percent
    };
  }
  function staticBauhaus(info) { return App.sheet.frame(frameInfo(info, false), false); }

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
  function staticGlass(info, opts) { return App.sheet.frame(frameInfo(info, true), !!(opts && opts.live)); }

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
