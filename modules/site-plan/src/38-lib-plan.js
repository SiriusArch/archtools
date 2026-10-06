/* ==========================================================================
   38-lib-plan.js — Modül 10 · Vaziyet Planı: veri modeli, geometri, ölçüler, örnek vaziyet, içe aktarma
   Veri : project.plan = { v, title, scale, cx, cy, style, snap, grid, shadow, labels, els[] }
   Birim: metre. x doğu (sağ), y güney (aşağı). (cx, cy) pafta penceresinin merkezi.
   Ölçek: pafta A3 yatay (420 mm) kabul edilir; 1 px = 0,3 mm → px/m = 3333 / ölçek paydası.
   Öğe  : { id, t, ... }
     bound  proje / parsel sınırı     { pts[] }
     bld    bina                       { pts[], floors, k:'yeni'|'mevcut' }
     road   yol                        { pts[], w, k:'arac'|'yaya', smooth }
     green  yeşil alan                 { pts[], smooth, k:'cim'|'orman' }
     water  su                         { pts[], smooth }
     plaza  meydan / sert zemin        { pts[], smooth }
     park   otopark                    { pts[] }
     tree   ağaç                       { x, y, r }
     text   yazı                       { x, y, s, size }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const plan = (App.plan = {});

  const r1 = (v) => Math.round(v * 10) / 10;
  const num = (v, d) => (isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
  const uid = () => 'p' + Math.random().toString(36).slice(2, 8);
  const FH = 3.2;

  plan.SCALES = [200, 500, 1000, 2000, 5000];
  plan.FH = FH;
  plan.pxPerM = (scale) => 3333 / scale;
  plan.TYPES = {
    bound: { label: 'Proje sınırı', poly: true },
    bld: { label: 'Bina', poly: true },
    road: { label: 'Yol', poly: false },
    green: { label: 'Yeşil alan', poly: true },
    water: { label: 'Su', poly: true },
    plaza: { label: 'Meydan', poly: true },
    park: { label: 'Otopark', poly: true },
    tree: { label: 'Ağaç', poly: false },
    text: { label: 'Yazı', poly: false },
  };
  plan.ROAD_KINDS = [{ v: 'arac', label: 'Taşıt yolu' }, { v: 'yaya', label: 'Yaya yolu' }];

  /* ---------- tohumlu rastgele ---------- */
  function rng(seed) {
    let a = (seed >>> 0) + 0x6d2b79f5;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  plan.rng = rng;

  /* ---------- geometri ---------- */
  const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
  const centroid = (p) => {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; const f = p[i][0] * q[1] - q[0] * p[i][1]; a += f; cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f; }
    if (Math.abs(a) < 1e-9) { const n = p.length; return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]; }
    return [cx / (3 * a), cy / (3 * a)];
  };
  const inPoly = (pt, p) => {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > pt[1]) !== (p[j][1] > pt[1]) && pt[0] < ((p[j][0] - p[i][0]) * (pt[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  };
  const bbox = (p) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; p.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); return { x0: x0, y0: y0, x1: x1, y1: y1 }; };
  const hull = (pts) => {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    p.forEach((q) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    const up = [];
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  };
  const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const circlePts = (cx, cy, r, n) => { const o = []; for (let i = 0; i < (n || 20); i++) { const a = (i / (n || 20)) * Math.PI * 2; o.push([r1(cx + Math.cos(a) * r), r1(cy + Math.sin(a) * r)]); } return o; };
  const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
  plan.geo = { area: area, centroid: centroid, inPoly: inPoly, bbox: bbox, hull: hull, rectPts: rectPts, circlePts: circlePts, polyLen: polyLen };

  // düzgünleştirilmiş yol (ekran noktaları): kapalı → orta nokta Bezier halkası, açık → uçlar sabit
  plan.smoothPath = function (pts, closed) {
    const n = pts.length;
    const f = (v) => v.toFixed(1);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (n < 3) return 'M' + pts.map((q) => f(q[0]) + ' ' + f(q[1])).join(' L');
    if (closed) {
      const m0 = mid(pts[n - 1], pts[0]);
      let d = 'M' + f(m0[0]) + ' ' + f(m0[1]);
      for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); d += ' Q' + f(pts[i][0]) + ' ' + f(pts[i][1]) + ' ' + f(m[0]) + ' ' + f(m[1]); }
      return d + ' Z';
    }
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 1; i < n - 1; i++) { const m = mid(pts[i], pts[i + 1]); d += ' Q' + f(pts[i][0]) + ' ' + f(pts[i][1]) + ' ' + f(m[0]) + ' ' + f(m[1]); }
    return d + ' L' + f(pts[n - 1][0]) + ' ' + f(pts[n - 1][1]);
  };
  plan.linePath = function (pts, closed) { return 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') + (closed ? ' Z' : ''); };

  /* ---------- öğe fabrikaları ---------- */
  const make = {
    bound: (pts) => ({ id: uid(), t: 'bound', pts: pts }),
    bld: (pts, o) => Object.assign({ id: uid(), t: 'bld', pts: pts, floors: 4, k: 'yeni' }, o || {}),
    road: (pts, o) => Object.assign({ id: uid(), t: 'road', pts: pts, w: 8, k: 'arac', smooth: false }, o || {}),
    green: (pts, o) => Object.assign({ id: uid(), t: 'green', pts: pts, smooth: true, k: 'cim' }, o || {}),
    water: (pts, o) => Object.assign({ id: uid(), t: 'water', pts: pts, smooth: true }, o || {}),
    plaza: (pts, o) => Object.assign({ id: uid(), t: 'plaza', pts: pts, smooth: false }, o || {}),
    park: (pts) => ({ id: uid(), t: 'park', pts: pts }),
    tree: (x, y, r) => ({ id: uid(), t: 'tree', x: x, y: y, r: r || 3 }),
    text: (x, y, s) => ({ id: uid(), t: 'text', x: x, y: y, s: s || 'Yazı', size: 15 }),
  };
  plan.make = make;

  /* ---------- doğrulama ---------- */
  const cleanPts = (pts, min) => {
    if (!Array.isArray(pts)) return null;
    const o = pts.slice(0, 400).map((q) => [r1(U.clamp(num(q && q[0], 0), -8000, 8000)), r1(U.clamp(num(q && q[1], 0), -8000, 8000))]);
    return o.length >= min ? o : null;
  };
  plan.clean = function (el, patch) {
    const o = Object.assign({}, el, patch || {});
    const t = o.t;
    if (!plan.TYPES[t]) return null;
    const base = { id: o.id, t: t };
    if (t === 'tree') return Object.assign(base, { x: r1(U.clamp(num(o.x, 0), -8000, 8000)), y: r1(U.clamp(num(o.y, 0), -8000, 8000)), r: r1(U.clamp(num(o.r, 3), 0.5, 20)) });
    if (t === 'text') return Object.assign(base, { x: r1(U.clamp(num(o.x, 0), -8000, 8000)), y: r1(U.clamp(num(o.y, 0), -8000, 8000)), s: String(o.s == null ? '' : o.s).slice(0, 80) || 'Yazı', size: Math.round(U.clamp(num(o.size, 15), 8, 64)) });
    const pts = cleanPts(o.pts, t === 'road' ? 2 : 3);
    if (!pts) return null;
    base.pts = pts;
    if (t === 'bld') return Object.assign(base, { floors: Math.round(U.clamp(num(o.floors, 4), 1, 80)), k: o.k === 'mevcut' ? 'mevcut' : 'yeni' });
    if (t === 'road') return Object.assign(base, { w: r1(U.clamp(num(o.w, 8), 1, 60)), k: o.k === 'yaya' ? 'yaya' : 'arac', smooth: !!o.smooth });
    if (t === 'green') return Object.assign(base, { smooth: o.smooth !== false, k: o.k === 'orman' ? 'orman' : 'cim' });
    if (t === 'water' || t === 'plaza') return Object.assign(base, { smooth: !!o.smooth });
    return base;
  };

  plan.moveEl = function (el, dx, dy) {
    if (el.t === 'tree' || el.t === 'text') return { x: r1(el.x + dx), y: r1(el.y + dy) };
    return { pts: el.pts.map((q) => [r1(q[0] + dx), r1(q[1] + dy)]) };
  };
  plan.center = function (el) {
    if (el.t === 'tree' || el.t === 'text') return [el.x, el.y];
    if (el.t === 'road') return el.pts[Math.floor(el.pts.length / 2)];
    return centroid(el.pts);
  };

  /* ---------- ölçüler ---------- */
  plan.metrics = function (P) {
    const els = P.els;
    const bound = els.find((e) => e.t === 'bound');
    const A = bound ? area(bound.pts) : 0;
    const inside = (e) => !bound || inPoly(plan.center(e), bound.pts);
    let newFoot = 0, newGfa = 0, oldFoot = 0, nNew = 0, nOld = 0, green = 0, water = 0, plaza = 0, park = 0, roadLen = 0, pathLen = 0, trees = 0, maxF = 0;
    els.forEach((e) => {
      if (e.t === 'bld') {
        const a = area(e.pts);
        if (e.k === 'mevcut') { oldFoot += a; nOld++; }
        else if (inside(e)) { newFoot += a; newGfa += a * e.floors; nNew++; maxF = Math.max(maxF, e.floors); }
      } else if (e.t === 'green' && inside(e)) green += area(e.pts);
      else if (e.t === 'water' && inside(e)) water += area(e.pts);
      else if (e.t === 'plaza' && inside(e)) plaza += area(e.pts);
      else if (e.t === 'park' && inside(e)) park += area(e.pts);
      else if (e.t === 'road') { if (e.k === 'yaya') pathLen += polyLen(e.pts); else roadLen += polyLen(e.pts); }
      else if (e.t === 'tree' && inside(e)) trees++;
    });
    return { boundArea: A, hasBound: !!bound, newFoot: newFoot, newGfa: newGfa, oldFoot: oldFoot, nNew: nNew, nOld: nOld, green: green, water: water, plaza: plaza, park: park, roadLen: roadLen, pathLen: pathLen, trees: trees, maxFloors: maxF, taks: A ? newFoot / A : null, kaks: A ? newGfa / A : null, greenShare: A ? Math.min(1, green / A) : null, count: els.length };
  };

  /* ---------- boş belge ---------- */
  plan.defaults = function () {
    return { v: 1, title: '', scale: 1000, cx: 0, cy: 0, style: 'auto', snap: 1, grid: false, shadow: true, labels: true, map: App.basemap.defaults(), els: [] };
  };
  plan.cleanDoc = function (p) {
    const d = plan.defaults();
    const o = Object.assign({}, d, p || {});
    o.title = String(o.title || '').slice(0, 60);
    o.scale = plan.SCALES.indexOf(Number(o.scale)) >= 0 ? Number(o.scale) : 1000;
    o.cx = r1(U.clamp(num(o.cx, 0), -8000, 8000)); o.cy = r1(U.clamp(num(o.cy, 0), -8000, 8000));
    o.style = ['auto', 'sade', 'renkli'].indexOf(o.style) >= 0 ? o.style : 'auto';
    o.snap = [0.5, 1, 2, 5].indexOf(Number(o.snap)) >= 0 ? Number(o.snap) : 1;
    o.grid = !!o.grid; o.shadow = o.shadow !== false; o.labels = o.labels !== false;
    o.map = App.basemap.clean(o.map);
    o.els = (Array.isArray(o.els) ? o.els : []).slice(0, 1800).map((e) => plan.clean(e)).filter(Boolean);
    return o;
  };

  /* ---------- ağaç serpme / sıra ağaç ---------- */
  plan.scatterIn = function (pts, count, seed, rMin, rMax, avoid) {
    const R = rng(seed || Math.floor(Math.random() * 1e6));
    const b = bbox(pts);
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const x = r1(b.x0 + R() * (b.x1 - b.x0)), y = r1(b.y0 + R() * (b.y1 - b.y0));
      if (!inPoly([x, y], pts)) continue;
      if (avoid && avoid.some((a) => inPoly([x, y], a))) continue;
      out.push(make.tree(x, y, r1(rMin + R() * (rMax - rMin))));
    }
    return out;
  };
  plan.alongRoad = function (road, gap, r) {
    const out = [];
    const off = road.w / 2 + r + 0.6;
    let carry = gap / 2;
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
      for (let s = carry; s < L; s += gap) {
        const x = a[0] + ux * s, y = a[1] + uy * s;
        out.push(make.tree(r1(x + nx * off), r1(y + ny * off), r), make.tree(r1(x - nx * off), r1(y - ny * off), r));
        carry = s + gap - L;
      }
      if (carry >= gap) carry = 0;
    }
    return out;
  };

  /* ---------- örnek vaziyet: mahalle + proje parseli ---------- */
  plan.sample = function (seed) {
    const R = rng(seed || 7);
    const els = [];
    const xr = [-250, -150, -50, 50, 150, 250], yr = [-180, -90, 0, 90, 180];
    xr.forEach((x) => els.push(make.road([[x, -180], [x, 180]], { w: 10 })));
    yr.forEach((y) => els.push(make.road([[-250, y], [250, y]], { w: 10 })));
    // mevcut bloklar (proje bloğu hariç): 5 sütun × 4 satır
    for (let k = 0; k < 5; k++) {
      for (let j = 0; j < 4; j++) {
        const bx0 = -245 + k * 100, by0 = -175 + j * 90;
        if (bx0 === -45 && by0 === -85) continue;
        const n = 3 + Math.floor(R() * 4);
        for (let m = 0; m < n; m++) {
          const w = 16 + R() * 26, d = 10 + R() * 14;
          const x = bx0 + 4 + R() * (90 - 8 - w), y = by0 + 4 + R() * (80 - 8 - d);
          els.push(make.bld(rectPts(r1(x), r1(y), r1(x + w), r1(y + d)), { k: 'mevcut', floors: 2 + Math.floor(R() * 5) }));
        }
        for (let m = 0; m < 8; m++) els.push(make.tree(r1(bx0 + 4 + R() * 82), r1(by0 + 4 + R() * 72), r1(2 + R() * 1.6)));
      }
    }
    // proje bloğu: (-45,-85)–(45,-5)
    const bnd = [[-45, -85], [45, -85], [45, -5], [-45, -5]];
    els.push(make.bound(bnd));
    els.push(make.green([[-41, -81], [41, -81], [43, -50], [30, -30], [-6, -22], [-30, -12], [-41, -22]], { smooth: true }));
    els.push(make.water([[-24, -66], [-8, -72], [4, -64], [0, -52], [-14, -46], [-26, -54]], { smooth: true }));
    els.push(make.road([[-40, -10], [-22, -30], [-8, -38], [8, -36], [26, -48], [38, -76]], { w: 3, k: 'yaya', smooth: true }));
    els.push(make.road([[-42, -62], [-30, -44], [-12, -30]], { w: 2.4, k: 'yaya', smooth: true }));
    els.push(make.plaza(rectPts(14, -26, 40, -8), { smooth: false }));
    els.push(make.park(rectPts(-40, -12, -18, -6)));
    els.push(make.bld(rectPts(-38, -80, -8, -70), { floors: 5, k: 'yeni' }));
    els.push(make.bld([[14, -80], [40, -80], [40, -62], [28, -62], [28, -70], [14, -70]], { floors: 4, k: 'yeni' }));
    els.push(make.bld(rectPts(18, -24, 38, -10), { floors: 3, k: 'yeni' }));
    const g = els.find((e) => e.t === 'green' && e.pts.length === 7);
    plan.scatterIn(g.pts, 46, 11, 1.8, 3.6, [els.find((e) => e.t === 'water').pts]).forEach((t) => els.push(t));
    return els;
  };

  /* ---------- Mekân Etüdü'nden (Modül 2) ---------- */
  plan.fromStudy = function (P) {
    const M = App.massing;
    if (!M || !P.spaces.length) return null;
    const doc = M.doc(P, { live: true });
    const step = doc.steps[0];
    const S = doc.site;
    const ox = -S.w / 2, oy = -S.d / 2;
    const T = (q) => [r1(q[0] + ox), r1(q[1] + oy)];
    const els = [];
    const sw = 5, off = 3;
    if (doc.siteOn) {
      els.push(make.road([[ox - off, oy - off], [ox + S.w + off, oy - off], [ox + S.w + off, oy + S.d + off], [ox - off, oy + S.d + off], [ox - off, oy - off]], { w: sw }));
      els.push(make.bound(rectPts(ox, oy, ox + S.w, oy + S.d)));
    }
    doc.ctx.forEach((c) => els.push(make.bld(rectPts(r1(c.x + ox), r1(c.y + oy), r1(c.x + c.w + ox), r1(c.y + c.d + oy)), { k: 'mevcut', floors: Math.max(1, Math.round(c.h / FH)) })));
    const masses = step.els.filter((e) => e.t === 'mass');
    if (masses.length) {
      const pts = [];
      masses.forEach((m) => M.ring(m).forEach((q) => pts.push(T(q))));
      const floors = Math.max(1, masses.reduce((q, m) => Math.max(q, m.lv + m.floors), 1));
      els.push(make.bld(hull(pts), { k: 'yeni', floors: floors, name: P.meta.name }));
    }
    step.els.forEach((e) => {
      if (e.t === 'green') els.push(make.green(e.round ? circlePts(e.x + e.w / 2 + ox, e.y + e.d / 2 + oy, Math.min(e.w, e.d) / 2, 20) : rectPts(r1(e.x + ox), r1(e.y + oy), r1(e.x + e.w + ox), r1(e.y + e.d + oy)), { smooth: !!e.round }));
      else if (e.t === 'void') els.push(make.plaza(rectPts(r1(e.x + ox), r1(e.y + oy), r1(e.x + e.w + ox), r1(e.y + e.d + oy))));
      else if (e.t === 'tree') els.push(make.tree(r1(e.x + ox), r1(e.y + oy), e.r));
      else if (e.t === 'arrow' && e.k !== 'entry') els.push(make.road([T([e.x1, e.y1]), T([e.x2, e.y2])], { w: 2.4, k: 'yaya' }));
    });
    return els;
  };

  /* ---------- İmar ve Kapasite'den (Modül 5) ---------- */
  plan.fromImar = function (P) {
    const s = P.site;
    if (!s || !s.parcel || s.parcel.length < 3) return null;
    const flip = (q) => [r1(q[0]), r1(-q[1])];
    const els = [make.bound(s.parcel.map(flip))];
    try {
      const Z = App.zoning;
      const e = App.site.entry && App.site.entry(s);
      let ctx = null;
      if (e) { const A = App.site.analyze(s, e); ctx = { data: e.data, A: A, lat: e.data.lat0, parcel: s.parcel }; }
      const R = Z.compute(s.imar, s.parcel, ctx);
      if (R && R.ok && R.pieces) R.pieces.forEach((pc) => els.push(make.bld(pc.map(flip), { k: 'yeni', floors: R.floors || 4 })));
    } catch (err) { /* hesap yoksa yalnızca sınır alınır */ }
    return els;
  };

  plan.fit = function (els) {
    if (!els.length) return { cx: 0, cy: 0 };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    els.forEach((e) => {
      if (e.t === 'road' && e.w > 6 && els.some((q) => q.t === 'bound')) return;
      if (e.pts) e.pts.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
      else { x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x); y1 = Math.max(y1, e.y); }
    });
    return { cx: r1((x0 + x1) / 2), cy: r1((y0 + y1) / 2), w: x1 - x0, h: y1 - y0 };
  };
})();
