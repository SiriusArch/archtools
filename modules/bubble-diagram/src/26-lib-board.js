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

  /* ---------------- tek renk (monokrom) ----------------
     Her renk, parlaklığına göre seçilen rengin (siyah) ile beyaz arasındaki tonuna çevrilir; görüntüler (img) aynı eşlemeyle boyanır.
     App.board.monoPrims(prims, '#1F3A5F') → yeni primitif listesi (girdiyi değiştirmez). */
  const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
  function parseColor(c) {
    if (typeof c !== 'string') return null;
    const s = c.trim().toLowerCase();
    if (NAMED[s]) return NAMED[s];
    let m = /^#([0-9a-f]{3})$/.exec(s);
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]; }
    m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] != null ? +m[4] : 1];
    return null;
  }
  const lumOf = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  function monoColor(c, base) {
    const q = parseColor(c);
    if (!q) return c;
    const L = lumOf(q[0], q[1], q[2]);
    const r = Math.round(base[0] + (255 - base[0]) * L), g = Math.round(base[1] + (255 - base[1]) * L), b = Math.round(base[2] + (255 - base[2]) * L);
    if (q[3] >= 0.999) return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.round(q[3] * 1000) / 1000 + ')';
  }
  function monoPrims(prims, hex) {
    const base = parseColor(hex);
    if (!base) return prims;
    const norm = '#' + ((1 << 24) | (base[0] << 16) | (base[1] << 8) | base[2]).toString(16).slice(1);
    const walk = (p) => {
      const q = Object.assign({}, p);
      if (typeof q.fill === 'string') q.fill = monoColor(q.fill, base);
      if (typeof q.stroke === 'string') q.stroke = monoColor(q.stroke, base);
      if (q.shadow && typeof q.shadow.color === 'string') q.shadow = Object.assign({}, q.shadow, { color: monoColor(q.shadow.color, base) });
      if (q.t === 'img') q.tint = norm;
      if (q.t === 'g' && q.items) q.items = q.items.map(walk);
      return q;
    };
    return prims.map(walk);
  }
  /* SVG ön izleme için: belge içinde bir kez tanımlanan "iki ton" süzgeci */
  function monoFilterUrl(hex) {
    const base = parseColor(hex);
    if (!base || typeof document === 'undefined') return null;
    const id = 'mono-' + hex.replace('#', '');
    if (!document.getElementById(id)) {
      const NS = 'http://www.w3.org/2000/svg';
      let defs = document.getElementById('mono-defs');
      if (!defs) {
        defs = document.createElementNS(NS, 'svg');
        defs.setAttribute('id', 'mono-defs'); defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.setAttribute('aria-hidden', 'true');
        defs.style.position = 'absolute';
        document.body.appendChild(defs);
      }
      const f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', id); f.setAttribute('color-interpolation-filters', 'sRGB'); f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '1'); f.setAttribute('height', '1');
      const cm = document.createElementNS(NS, 'feColorMatrix');
      cm.setAttribute('type', 'matrix'); cm.setAttribute('values', '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0');
      const ct = document.createElementNS(NS, 'feComponentTransfer');
      ['R', 'G', 'B'].forEach((ch, i) => {
        const fn = document.createElementNS(NS, 'feFunc' + ch);
        fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', (base[i] / 255).toFixed(4) + ' 1');
        ct.appendChild(fn);
      });
      f.appendChild(cm); f.appendChild(ct);
      defs.appendChild(f);
    }
    return 'url(#' + id + ')';
  }
  const tintCache = new Map();
  /* tuval çıktısı için: görüntüyü piksel piksel iki tonlu yapar (en çok 2048 px) */
  function tintedSource(im, key, hex) {
    const ck = key + '|' + hex;
    if (tintCache.has(ck)) return tintCache.get(ck);
    const base = parseColor(hex);
    const k = Math.min(1, 2048 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), hh = Math.max(1, Math.round(im.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    const cx = cv.getContext('2d');
    cx.drawImage(im, 0, 0, w, hh);
    let out = cv;
    try {
      const id = cx.getImageData(0, 0, w, hh), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const L = lumOf(d[i], d[i + 1], d[i + 2]);
        d[i] = base[0] + (255 - base[0]) * L; d[i + 1] = base[1] + (255 - base[1]) * L; d[i + 2] = base[2] + (255 - base[2]) * L;
      }
      cx.putImageData(id, 0, 0);
    } catch (err) { out = im; } // harici kaynak tuvali kirletmişse özgün görüntü çizilir
    tintCache.set(ck, out);
    if (tintCache.size > 24) tintCache.delete(tintCache.keys().next().value);
    return out;
  }

  /* ---------------- SVG çizici (sanal DOM düğümü) ---------------- */
  function shadowCss(sh) { return 'drop-shadow(' + sh.dx + 'px ' + sh.dy + 'px ' + sh.blur + 'px ' + (sh.css || sh.color) + ')'; }

  function primToV(p, extra) {
    const a = Object.assign({}, extra || {});
    if (p.opacity != null) a.opacity = p.opacity;
    if (p.blend) a.style = { mixBlendMode: p.blend };
    switch (p.t) {
      case 'img': {
        // görüntü: p.href (data URL), x, y, w, h; p.clip (isteğe bağlı, dikdörtgen) ile kırpılır
        if (p.tint) { const fu = monoFilterUrl(p.tint); if (fu) a.style = Object.assign(a.style || {}, { filter: fu }); else a.style = Object.assign(a.style || {}, { filter: 'grayscale(1)' }); }
        else if (p.gray) a.style = Object.assign(a.style || {}, { filter: 'grayscale(1)' });
        const im = h('image', Object.assign(a, { x: p.x, y: p.y, width: p.w, height: p.h, href: p.href, preserveAspectRatio: 'none', 'pointer-events': 'none' }));
        if (!p.clip) return im;
        const cid = 'clip-' + p.clip.id;
        return h('g', {}, h('clipPath', { id: cid }, h('rect', { x: p.clip.x, y: p.clip.y, width: p.clip.w, height: p.clip.h })), h('g', { 'clip-path': 'url(#' + cid + ')' }, im));
      }
      case 'g': {
        // kırpmalı grup: p.clip = { id, x, y, w, h } (dikdörtgen) ya da { id, pts } (çokgen); p.items = primitifler
        const cid = 'clip-' + (p.clip.id || 'g');
        const shape = p.clip.pts ? h('polygon', { points: p.clip.pts.map((q) => q.join(',')).join(' ') }) : h('rect', { x: p.clip.x, y: p.clip.y, width: p.clip.w, height: p.clip.h });
        return h('g', a, h('clipPath', { id: cid }, shape), h('g', { 'clip-path': 'url(#' + cid + ')' }, p.items.map((q) => primToV(q))));
      }
      case 'rect':
        Object.assign(a, { x: p.x, y: p.y, width: p.w, height: p.h, fill: p.fill || 'none' });
        if (p.rx) a.rx = p.rx;
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = p.rx ? 'round' : 'miter'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        if (p.shadow) a.style = Object.assign(a.style || {}, { filter: shadowCss(p.shadow) });
        return h('rect', a);
      case 'circle':
        Object.assign(a, { cx: p.cx, cy: p.cy, r: p.r, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; }
        if (p.shadow) a.style = Object.assign(a.style || {}, { filter: shadowCss(p.shadow) });
        return h('circle', a);
      case 'line':
        Object.assign(a, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: p.stroke, 'stroke-width': p.sw, 'stroke-linecap': p.cap || 'butt' });
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('line', a);
      case 'poly':
        Object.assign(a, { points: p.pts.map((q) => q.join(',')).join(' '), fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = 'round'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
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
    if (p.t === 'g') {
      ctx.save();
      if (p.opacity != null) ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      if (p.clip.pts) { p.clip.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); } else ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h);
      ctx.clip();
      p.items.forEach((q) => paintPrim(ctx, q));
      ctx.restore();
      return;
    }
    ctx.save();
    if (p.opacity != null) ctx.globalAlpha = p.opacity;
    if (p.blend) ctx.globalCompositeOperation = p.blend;
    ctx.setLineDash(p.dash || []);
    ctx.lineCap = p.cap || 'butt';
    switch (p.t) {
      case 'img': {
        const im = App.board.imgCache && App.board.imgCache[p.ik || p.href];
        if (im && im.complete && im.naturalWidth) {
          if (p.clip) { ctx.beginPath(); ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h); ctx.clip(); }
          if (p.tint) ctx.drawImage(tintedSource(im, p.ik || p.href, p.tint), p.x, p.y, p.w, p.h);
          else {
            if (p.gray && 'filter' in ctx) ctx.filter = 'grayscale(1)';
            ctx.drawImage(im, p.x, p.y, p.w, p.h);
          }
        }
        break;
      }
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
    imgCache: {}, allPrims: allPrims, primToV: primToV, paintPrim: paintPrim, toCanvas: toCanvas, primsToCanvas: primsToCanvas, shadowCss: shadowCss, monoPrims: monoPrims, monoColor: (c, hex) => monoColor(c, parseColor(hex) || [0, 0, 0]),
  };
})();
