/* ==========================================================================
   39-lib-d-sitedraw.js — arsa paftası çizim yardımcıları (Modül 4, 5, 6 ortak)
   Çıktı primitif listesidir (path, poly, circle, text); ekranda SVG, dışa aktarmada Canvas aynı listeden çizer.
   Dönüşüm nesnesi T: T.P(x, y, z) → ekran [X, Y]  (x doğu, y kuzey, z yükseklik; metre)
     · T.s   metre başına piksel (çizgi kalınlığı için)  · T.iso  izometrik izdüşüm (yoksa düz plan)
   Aynı işlevler hem plan hem izometrik levhada çalışır: levha yüksekliği z ile verilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const site = App.site;
  const iso = App.iso;
  const U = App.util;
  const D = (App.siteDraw = {});

  const f1 = (v) => (Math.round(v * 10) / 10).toString();

  /* ---------------- renkler (tema duyarlı) ---------------- */
  D.cols = function () {
    const g = App.theme.name === 'glass';
    const P = App.PAL;
    if (g) {
      return {
        glass: true, ink: P.ink, paper: '#F6F7F9', disc: '#FDFDFE', discLine: 'rgba(23,24,27,.30)', faint: 'rgba(23,24,27,.14)', mid: 'rgba(23,24,27,.45)',
        water: '#D3D7DF', waterLine: '#A9AFBC', green: '#CBCED5', greenPub: '#BFC3CB', greenLine: 'rgba(23,24,27,.18)',
        roadMinor: '#C0C3CA', roadMid: '#8D9099', roadMajor: '#4E5159', rail: '#2A2B30', ped: '#A6A9B1',
        bBase: '#E4E5E9', bLine: 'rgba(23,24,27,.28)', bTone: ['#ECEDF0', '#D3D5DA', '#B4B7BF', '#878B94', '#4E5159'],
        isoBand: ['#2E3036', '#80848E', '#C5C8CF'], isoOp: [0.78, 0.55, 0.42],
        cat: { gunluk: '#17181B', yeme: '#3A3C42', egitim: '#55585F', saglik: '#26272B', rekreasyon: '#6C6F77', kultur: '#8A8D95', hizmet: '#44464D', alisveris: '#9A9DA5' },
        noise: ['rgba(23,24,27,.14)', 'rgba(23,24,27,.36)'], noiseSolid: ['#B9BCC4', '#585B63'],
        heat: ['rgba(23,24,27,.10)', 'rgba(23,24,27,.22)', 'rgba(23,24,27,.36)', 'rgba(23,24,27,.52)', 'rgba(23,24,27,.72)'],
        topo: ['#F4F5F7', '#E8EAED', '#DCDEE3', '#CFD2D8', '#C2C5CC', '#B5B8C0', '#A8ABB3', '#9A9EA7'], contour: 'rgba(23,24,27,.45)',
        accent: P.ink, accent2: '#55585F', parcelFill: 'rgba(23,24,27,.10)', env: P.ink, shadow: 'rgba(23,24,27,.30)', sun: P.ink,
        good: '#2A2B30', warn: '#6C6F77', bad: '#17181B', score: ['#E8E9ED', '#B5B8C0', '#7A7E88', '#4C4F57', '#17181B'],
      };
    }
    return {
      glass: false, ink: P.ink, paper: P.paper, disc: '#F8F0DB', discLine: P.ink, faint: 'rgba(38,29,17,.2)', mid: 'rgba(38,29,17,.5)',
      water: '#93BCDB', waterLine: '#3F7FAF', green: '#A5CC98', greenPub: '#86B97A', greenLine: 'rgba(38,29,17,.3)',
      roadMinor: '#B9A785', roadMid: '#7B6845', roadMajor: P.ink, rail: P.ink, ped: '#A58D5E',
      bBase: '#E7D6AC', bLine: 'rgba(38,29,17,.5)', bTone: ['#EDE0BE', '#EBCB83', '#E3A63F', '#C45A2C', '#8C2F1B'],
      isoBand: ['#C03A22', '#E87E1B', '#EAAE1B'], isoOp: [0.6, 0.5, 0.4],
      cat: { gunluk: P.yellow, yeme: P.orange, egitim: P.blue, saglik: P.red, rekreasyon: P.green, kultur: P.indigo, hizmet: P.ink, alisveris: P.blueBright },
      noise: ['rgba(234,174,27,.38)', 'rgba(192,58,34,.5)'], noiseSolid: ['#EAAE1B', '#C03A22'],
      heat: ['rgba(234,174,27,.30)', 'rgba(232,126,27,.48)', 'rgba(224,90,30,.60)', 'rgba(192,58,34,.72)', 'rgba(140,47,27,.85)'],
      topo: ['#F2E8CC', '#EADDB7', '#E1D0A0', '#D7C28B', '#CCB276', '#C0A263', '#B49252', '#A68343'], contour: 'rgba(38,29,17,.55)',
      accent: P.red, accent2: P.blue, parcelFill: 'rgba(192,58,34,.18)', env: P.blue, shadow: 'rgba(38,29,17,.34)', sun: P.orange,
      good: P.green, warn: P.yellow, bad: P.red, score: ['#E8DCBA', '#EAAE1B', '#E87E1B', '#3A8040', '#00427A'],
    };
  };

  /* ---------------- dönüşümler ---------------- */
  D.mapT = function (cx, cy, s) { return { P: (x, y) => [cx + x * s, cy - y * s], s: s, iso: null, cx: cx, cy: cy }; };
  D.isoT = function (I) { return { P: (x, y, z) => I.proj(x, -y, z || 0), s: I.s, iso: I }; };

  const ringD = (T, ring, z) => { let d = ''; for (let i = 0; i < ring.length; i++) { const q = T.P(ring[i][0], ring[i][1], z); d += (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); } return d + 'Z'; };
  const lineD = (T, pts, z) => { let d = ''; for (let i = 0; i < pts.length; i++) { const q = T.P(pts[i][0], pts[i][1], z); d += (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); } return d; };
  D.ringD = ringD; D.lineD = lineD;

  /* ---------------- levha zemini (daire) ---------------- */
  D.disc = function (T, R, C, z, o) {
    o = o || {};
    const ring = gis.circlePoly(R, 72);
    const P = [];
    P.push({ t: 'path', d: ringD(T, ring, z), fill: o.fill || C.disc, stroke: C.glass ? C.discLine : C.ink, sw: C.glass ? 1.4 : 3, opacity: o.opacity });
    return P;
  };

  /* ---------------- yol sınıfı biçemi ---------------- */
  const RW = { motorway: 16, trunk: 14, primary: 11, secondary: 8.5, tertiary: 7, residential: 5, living: 4, service: 3, pedestrian: 4.5, footway: 1.7, path: 1.4, cycleway: 1.8, steps: 1.5, track: 2 };
  const ROAD_ORDER = ['track', 'steps', 'path', 'footway', 'cycleway', 'service', 'living', 'pedestrian', 'residential', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
  const roadColor = (C, cls) => (cls === 'motorway' || cls === 'trunk' || cls === 'primary' ? C.roadMajor : cls === 'secondary' || cls === 'tertiary' ? C.roadMid : cls === 'footway' || cls === 'path' || cls === 'steps' || cls === 'cycleway' || cls === 'track' || cls === 'pedestrian' ? C.ped : C.roadMinor);
  D.roadLabel = { motorway: 'Otoyol', trunk: 'Ana arter', primary: 'Ana cadde', secondary: 'Cadde', tertiary: 'Toplayıcı yol', residential: 'Sokak', living: 'Yaşam sokağı', service: 'Servis yolu', pedestrian: 'Yaya yolu', footway: 'Yaya yolu', path: 'Patika', cycleway: 'Bisiklet yolu', steps: 'Merdiven', track: 'Tarla yolu' };

  /* yollar: sınıf başına tek path. emph: hiyerarşiyi vurgula (renk + kalınlık), değilse ince gri zemin */
  D.roads = function (T, cl, C, z, o) {
    o = o || {};
    const P = [];
    const by = {};
    cl.roads.forEach((r) => { if (r.tn && !o.tunnels) return; (by[r.cls] = by[r.cls] || []).push(r); });
    ROAD_ORDER.forEach((cls) => {
      const list = by[cls];
      if (!list) return;
      let d = '';
      list.forEach((r) => { d += lineD(T, r.pts, z); });
      const base = (RW[cls] || 3) * T.s * (o.k || 1);
      const w = Math.max(o.minW || 0.7, o.emph ? base : Math.min(base, (o.cap || 2.2) + base * 0.15));
      if (o.emph && cls !== 'footway' && cls !== 'path' && cls !== 'steps' && cls !== 'cycleway' && cls !== 'track' && w > 2.6) P.push({ t: 'path', d: d, stroke: C.glass ? '#FFFFFF' : C.paper, sw: w + 2, cap: 'round', opacity: 0.95 });
      const col = o.emph ? roadColor(C, cls) : (cls === 'footway' || cls === 'path' || cls === 'steps' || cls === 'cycleway' || cls === 'track' ? C.ped : C.roadMinor);
      const dash = cls === 'footway' || cls === 'path' || cls === 'steps' ? [3, 2.5] : null;
      P.push({ t: 'path', d: d, stroke: col, sw: w, cap: dash ? 'butt' : 'round', dash: dash || undefined, opacity: o.opacity });
    });
    return P;
  };

  D.rails = function (T, cl, C, z) {
    const P = [];
    if (!cl.rails.length) return P;
    let d = '';
    cl.rails.forEach((r) => { d += lineD(T, r.pts, z); });
    P.push({ t: 'path', d: d, stroke: C.rail, sw: Math.max(1.8, 4 * T.s), cap: 'butt' });
    P.push({ t: 'path', d: d, stroke: C.disc, sw: Math.max(0.9, 2 * T.s), cap: 'butt', dash: [6, 6] });
    return P;
  };

  /* ---------------- su ve yeşil ---------------- */
  D.water = function (T, cl, C, z) {
    const P = [];
    let fill = '', lines = '', coast = '';
    cl.water.forEach((w) => {
      if (w.line) { if (w.kind === 'coast') coast += lineD(T, w.pts, z); else lines += lineD(T, w.pts, z); }
      else fill += ringD(T, w.pts, z);
    });
    if (fill) P.push({ t: 'path', d: fill, fill: C.water, stroke: C.waterLine, sw: 0.8 });
    if (lines) P.push({ t: 'path', d: lines, stroke: C.waterLine, sw: Math.max(1.2, 3 * T.s), cap: 'round' });
    if (coast) P.push({ t: 'path', d: coast, stroke: C.waterLine, sw: 1.4 });
    return P;
  };
  D.green = function (T, cl, C, z, o) {
    o = o || {};
    const P = [];
    let pub = '', priv = '';
    cl.green.forEach((g) => { if (g.pub) pub += ringD(T, g.pts, z); else priv += ringD(T, g.pts, z); });
    if (priv) P.push({ t: 'path', d: priv, fill: C.green, stroke: C.greenLine, sw: 0.6, opacity: o.opacity != null ? o.opacity * 0.7 : 0.7 });
    if (pub) P.push({ t: 'path', d: pub, fill: o.deep ? C.greenPub : C.green, stroke: C.greenLine, sw: 0.8, opacity: o.opacity });
    return P;
  };

  /* ---------------- binalar ---------------- */
  const hClass = (h) => (h <= 4 ? 0 : h <= 10 ? 1 : h <= 16 ? 2 : h <= 30 ? 3 : 4);
  D.hClass = hClass;
  D.HLABEL = ['≤ 4 m', '4–10 m', '10–16 m', '16–30 m', '> 30 m'];

  // daireye taşan binaları kırp (bellekli)
  const bClip = new WeakMap();
  function clippedBuildings(cl) {
    let m = bClip.get(cl);
    if (m) return m;
    const R = cl.R, R2 = R * R, cp = gis.circlePoly(R, 96);
    m = [];
    cl.buildings.forEach((b) => {
      if (b.pts.every((q) => q[0] * q[0] + q[1] * q[1] <= R2)) { m.push(b); return; }
      const c = gis.clipPoly(gis.ccw(b.pts), cp);
      if (c.length >= 3 && Math.abs(gis.area(c)) > 2) m.push(Object.assign({}, b, { pts: c }));
    });
    bClip.set(cl, m);
    return m;
  }
  D.clippedBuildings = clippedBuildings;
  // mode: 'faint' zemin izi · 'tone' yüksekliğe göre ton · 'use' kullanıma göre
  D.buildings = function (T, cl, C, z, o) {
    o = o || {};
    const P = [];
    const bs = clippedBuildings(cl);
    if (!bs.length) return P;
    if (T.iso && o.extrude) {
      const I = T.iso;
      const zx = o.zx || 1;
      const ord = bs.map((b) => ({ b: b, dp: I.depth(b.cx, -b.cy) })).sort((a, c) => a.dp - c.dp);
      ord.forEach((e) => {
        const b = e.b;
        const h = osm.heightOf(b) * zx;
        const fill = C.bTone[hClass(osm.heightOf(b))];
        const ring = b.pts.map((q) => [q[0], -q[1]]);
        if (o.lod) {
          const F = iso.extrudeFaces(I, ring, z, z + h);
          P.push({ t: 'poly', pts: F.roof, fill: fill, stroke: C.bLine, sw: 0.5 });
        } else iso.extrude(I, ring, z, z + h, fill, { stroke: C.glass ? 'rgba(23,24,27,.30)' : 'rgba(38,29,17,.55)', sw: 0.7 }).forEach((p) => P.push(p));
      });
      return P;
    }
    if (o.mode === 'faint' || !o.mode) {
      let d = '';
      bs.forEach((b) => { d += ringD(T, b.pts, z); });
      P.push({ t: 'path', d: d, fill: C.bBase, stroke: C.bLine, sw: 0.5, opacity: o.opacity });
      return P;
    }
    const groups = [[], [], [], [], []];
    bs.forEach((b) => { groups[o.mode === 'use' ? useIdx(b.kind) : hClass(osm.heightOf(b))].push(b); });
    groups.forEach((list, i) => {
      if (!list.length) return;
      let d = '';
      list.forEach((b) => { d += ringD(T, b.pts, z); });
      P.push({ t: 'path', d: d, fill: C.bTone[i], stroke: C.bLine, sw: 0.5, opacity: o.opacity });
    });
    return P;
  };
  const USE_IDX = { konut: 1, ticari: 3, kamu: 4, sanayi: 2, diger: 0 };
  const useIdx = (k) => USE_IDX[site.useOf(k)] || 0;

  /* ---------------- topografya ---------------- */
  D.topo = function (T, A, C, z, o) {
    o = o || {};
    const Tp = A.topo;
    const P = [];
    if (!Tp) return P;
    const M = Tp.M, R = Tp.R, cs = (2 * R) / (M - 1);
    const range = Math.max(1e-6, Tp.max - Tp.min);
    const bins = C.topo.map(() => '');
    const cx0 = A.R;
    for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
      const x0 = -R + i * cs, y0 = -R + j * cs;
      const mx = x0 + cs / 2, my = y0 + cs / 2;
      if (mx * mx + my * my > cx0 * cx0) continue;
      const v = (Tp.z[j * M + i] + Tp.z[j * M + i + 1] + Tp.z[(j + 1) * M + i] + Tp.z[(j + 1) * M + i + 1]) / 4;
      const b = Math.min(C.topo.length - 1, Math.floor(((v - Tp.min) / range) * C.topo.length));
      bins[b] += ringD(T, [[x0, y0], [x0 + cs, y0], [x0 + cs, y0 + cs], [x0, y0 + cs]], z);
    }
    bins.forEach((d, i) => { if (d) P.push({ t: 'path', d: d, fill: C.topo[i], stroke: C.topo[i], sw: 0.6, opacity: o.opacity }); });
    // eş yükselti eğrileri (çalışma yarıçapına kırpılmış)
    const cont = site.contours(Tp, Tp.step);
    const Rc = A.R;
    cont.forEach((c, ci) => {
      let d = '';
      const lift = o.lift ? (c.level - Tp.min) * (o.zx || 1) : 0;
      c.segs.forEach((q) => {
        if (q[0] * q[0] + q[1] * q[1] > Rc * Rc || q[2] * q[2] + q[3] * q[3] > Rc * Rc) return;
        const a = T.P(q[0], q[1], z + lift), b = T.P(q[2], q[3], z + lift);
        d += 'M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]);
      });
      if (d) P.push({ t: 'path', d: d, stroke: C.contour, sw: Math.abs(Math.round(c.level / Tp.step)) % 5 === 0 ? 1.5 : 0.8, cap: 'round' });
    });
    return P;
  };

  /* ---------------- yaya erişimi (izokron bantları) ---------------- */
  D.access = function (T, A, C, z, o) {
    o = o || {};
    const P = [];
    const bw = 2 * 40 * T.s;
    [2, 1, 0].forEach((i) => {
      const b = A.iso[i];
      if (!b.segs.length) return;
      let d = '';
      b.segs.forEach((q) => {
        gis.clipLineToCircle([[q[0], q[1]], [q[2], q[3]]], A.R - 38).forEach((pl) => {
          if (pl.length >= 2) d += lineD(T, pl, z);
        });
      });
      P.push({ t: 'path', d: d, stroke: C.isoBand[i], sw: Math.max(3, bw), cap: 'round', opacity: C.isoOp[i] * (o.opacity != null ? o.opacity : 1) });
    });
    return P;
  };

  /* ---------------- gürültü ısı hücreleri ---------------- */
  D.noise = function (T, A, C, z) {
    const P = [];
    const mid = [], hi = [];
    A.noiseCells.forEach((c) => {
      if (c.c === 'sessiz') return;
      if (Math.hypot(c.x + c.s / 2, c.y + c.s / 2) > A.R - c.s * 0.3) return;
      (c.c === 'orta' ? mid : hi).push(ringD(T, [[c.x, c.y], [c.x + c.s, c.y], [c.x + c.s, c.y + c.s], [c.x, c.y + c.s]], z));
    });
    if (mid.length) P.push({ t: 'path', d: mid.join(''), fill: C.noise[0], stroke: C.noise[0], sw: 0.5 });
    if (hi.length) P.push({ t: 'path', d: hi.join(''), fill: C.noise[1], stroke: C.noise[1], sw: 0.5 });
    return P;
  };

  /* ---------------- işlev yoğunluğu (altıgen ısı hücreleri) ---------------- */
  D.density = function (T, A, C, z, cat) {
    const H = App.site.hex(A, cat);
    const P = [];
    if (!H || !H.cells.length) return P;
    const byLv = [[], [], [], [], []];
    H.cells.forEach((c) => byLv[c.lv].push(ringD(T, c.poly, z)));
    byLv.forEach((arr, i) => { if (arr.length) P.push({ t: 'path', d: arr.join(''), fill: C.heat[i], stroke: C.glass ? 'rgba(23,24,27,.18)' : 'rgba(38,29,17,.28)', sw: 0.6 }); });
    return P;
  };

  /* ---------------- işlev / durak imleri ---------------- */
  const SHAPES = { gunluk: 'circle', yeme: 'diamond', egitim: 'tri', saglik: 'plus', rekreasyon: 'square', kultur: 'ring', hizmet: 'hex', alisveris: 'circle2' };
  D.SHAPE = SHAPES;
  function shapeD(T, x, y, z, shape, r) {
    const q = T.P(x, y, z), X = q[0], Y = q[1];
    switch (shape) {
      case 'circle': case 'circle2': case 'ring': return 'M' + f1(X - r) + ' ' + f1(Y) + 'a' + r + ' ' + r + ' 0 1 0 ' + f1(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + f1(-2 * r) + ' 0Z';
      case 'diamond': return 'M' + f1(X) + ' ' + f1(Y - r * 1.2) + 'L' + f1(X + r * 1.1) + ' ' + f1(Y) + 'L' + f1(X) + ' ' + f1(Y + r * 1.2) + 'L' + f1(X - r * 1.1) + ' ' + f1(Y) + 'Z';
      case 'tri': return 'M' + f1(X) + ' ' + f1(Y - r * 1.15) + 'L' + f1(X + r * 1.1) + ' ' + f1(Y + r * 0.8) + 'L' + f1(X - r * 1.1) + ' ' + f1(Y + r * 0.8) + 'Z';
      case 'square': return 'M' + f1(X - r * 0.9) + ' ' + f1(Y - r * 0.9) + 'h' + f1(r * 1.8) + 'v' + f1(r * 1.8) + 'h' + f1(-r * 1.8) + 'Z';
      case 'plus': { const a = r * 0.45, b = r * 1.1; return 'M' + f1(X - a) + ' ' + f1(Y - b) + 'h' + f1(2 * a) + 'v' + f1(b - a) + 'h' + f1(b - a) + 'v' + f1(2 * a) + 'h' + f1(-(b - a)) + 'v' + f1(b - a) + 'h' + f1(-2 * a) + 'v' + f1(-(b - a)) + 'h' + f1(-(b - a)) + 'v' + f1(-2 * a) + 'h' + f1(b - a) + 'Z'; }
      case 'hex': { let d = ''; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; d += (i ? 'L' : 'M') + f1(X + Math.cos(a) * r * 1.1) + ' ' + f1(Y + Math.sin(a) * r * 1.1); } return d + 'Z'; }
      default: return '';
    }
  }
  D.shapeD = shapeD;

  D.pois = function (T, A, C, z, o) {
    o = o || {};
    const P = [];
    const r = o.r || 4.6;
    osm.CATS.forEach((c) => {
      const list = A.pois.filter((p) => p.cat === c.id && !p.park && p.inR);
      if (!list.length) return;
      let d = '';
      list.forEach((p) => { d += shapeD(T, p.x, p.y, z, SHAPES[c.id], r); });
      const ring = SHAPES[c.id] === 'ring';
      P.push({ t: 'path', d: d, fill: ring ? C.disc : C.cat[c.id], stroke: ring ? C.cat[c.id] : (C.glass ? 'rgba(255,255,255,.9)' : C.ink), sw: ring ? 1.8 : (C.glass ? 0.8 : 0.9) });
    });
    // parklar: yeşil nokta + yarıçap
    const parks = A.pois.filter((p) => p.park && p.inR);
    if (parks.length) {
      let d = '';
      parks.forEach((p) => { d += shapeD(T, p.x, p.y, z, 'square', r); });
      P.push({ t: 'path', d: d, fill: C.cat.rekreasyon, stroke: C.glass ? 'rgba(255,255,255,.9)' : C.ink, sw: 0.9 });
    }
    return P;
  };

  D.transit = function (T, A, C, z, o) {
    o = o || {};
    const P = [];
    const st = A.transit.stops.filter((t) => Math.hypot(t.x, t.y) <= A.R);
    const bus = st.filter((t) => t.kind === 'otobus');
    const other = st.filter((t) => t.kind !== 'otobus');
    if (bus.length) {
      let d = '';
      bus.forEach((t) => { d += shapeD(T, t.x, t.y, z, 'square', 3.6); });
      P.push({ t: 'path', d: d, fill: C.glass ? C.ink : C.accent2, stroke: C.disc, sw: 1 });
    }
    other.forEach((t) => {
      const q = T.P(t.x, t.y, z);
      P.push({ t: 'circle', cx: q[0], cy: q[1], r: 8.5, fill: C.glass ? C.ink : C.accent, stroke: C.disc, sw: 1.8 });
      P.push({ t: 'text', x: q[0], y: q[1] + 3.6, s: t.kind === 'metro' ? 'M' : t.kind === 'tren' ? 'T' : t.kind === 'tramvay' ? 'R' : 'İ', size: 10.5, weight: 800, fam: 'b', fill: C.glass ? '#FFFFFF' : C.paper, anchor: 'middle', pe: false });
    });
    return P;
  };

  /* ---------------- güneş ve gölge ---------------- */
  // her bina için ayak izi ile ötelenmiş ayak izinin dışbükey zarfı (hızlı; çoğu bina için yeterince doğru)
  D.shadowPolys = function (buildings, alt, az, zx) {
    if (alt <= 1.5) return [];
    const t = Math.tan((alt * Math.PI) / 180);
    const ux = -Math.sin((az * Math.PI) / 180), uy = -Math.cos((az * Math.PI) / 180);
    const out = [];
    buildings.forEach((b) => {
      const L = Math.min(b.hgt / t, 160);
      if (L < 0.8) return;
      const dx = ux * L, dy = uy * L;
      const pts = b.pts.concat(b.pts.map((q) => [q[0] + dx, q[1] + dy]));
      out.push(gis.hull(pts));
    });
    void zx;
    return out;
  };
  D.sunState = function (A, o) {
    const day = gis.SUN_DAYS.find((s) => s.id === o.sunDay) || gis.SUN_DAYS[0];
    const sp = gis.sunPos(A.entry.data.lat0, day.doy, o.sunHour);
    return { day: day, hour: o.sunHour, alt: sp.alt, az: sp.az };
  };
  D.shadows = function (T, A, C, z, sun, o) {
    o = o || {};
    const P = [];
    if (sun.alt <= 1.5) return P;
    const bl = A.clip.buildings.map((b) => ({ pts: b.pts, hgt: osm.heightOf(b) }));
    const polys = D.shadowPolys(bl, sun.alt, sun.az);
    let d = '';
    polys.forEach((p) => { if (p.length >= 3) d += ringD(T, p, z); });
    if (d) P.push({ t: 'path', d: d, fill: C.shadow, opacity: o.opacity });
    return P;
  };
  // rim üzerinde güneş simgesi
  D.sunMark = function (T, R, C, sun, z) {
    const P = [];
    if (sun.alt <= 0) return P;
    const a = (sun.az * Math.PI) / 180;
    const rim = [Math.sin(a) * (R * 1.06), Math.cos(a) * (R * 1.06)];
    const q = T.P(rim[0], rim[1], z), q2 = T.P(Math.sin(a) * R * 0.82, Math.cos(a) * R * 0.82, z);
    P.push({ t: 'line', x1: q[0], y1: q[1], x2: q2[0], y2: q2[1], stroke: C.sun, sw: 1.6, dash: [4, 4] });
    P.push({ t: 'circle', cx: q[0], cy: q[1], r: 9, fill: C.glass ? C.disc : '#EAAE1B', stroke: C.ink, sw: 2 });
    for (let i = 0; i < 8; i++) { const b = (Math.PI / 4) * i; P.push({ t: 'line', x1: q[0] + Math.cos(b) * 12, y1: q[1] + Math.sin(b) * 12, x2: q[0] + Math.cos(b) * 16.5, y2: q[1] + Math.sin(b) * 16.5, stroke: C.ink, sw: 1.8, cap: 'round' }); }
    return P;
  };

  /* ---------------- çalışma noktası ve halkalar ---------------- */
  D.center = function (T, C, z, label) {
    const q = T.P(0, 0, z);
    const P = [];
    P.push({ t: 'circle', cx: q[0], cy: q[1], r: 11, fill: C.glass ? C.disc : C.paper, stroke: C.ink, sw: C.glass ? 2 : 3 });
    P.push({ t: 'circle', cx: q[0], cy: q[1], r: 4.5, fill: C.accent });
    if (label) P.push({ t: 'text', x: q[0] + 15, y: q[1] + 4, s: label, size: 12, weight: 700, fam: 'b', fill: C.ink, pe: false });
    return P;
  };
  D.rings = function (T, A, C, z, mins) {
    const P = [];
    (mins || [5, 10, 15]).forEach((m) => {
      const r = m * 80;
      if (r > A.R * 1.02) return;
      P.push({ t: 'path', d: ringD(T, gis.circlePoly(r, 90), z), stroke: C.mid, sw: 1, dash: [3, 5], fill: undefined });
      const q = T.P(0, r, z);
      P.push({ t: 'text', x: q[0] + 4, y: q[1] - 4, s: m + ' dk', size: 10.5, weight: 700, fam: 'b', fill: C.ink, opacity: 0.7, pe: false });
    });
    return P;
  };

  /* ---------------- yön oku ve ölçek çubuğu (düz plan) ---------------- */
  D.north = function (x, y, C, size) {
    const s = size || 22;
    const P = [];
    P.push({ t: 'circle', cx: x, cy: y, r: s, fill: C.glass ? C.disc : C.paper, stroke: C.ink, sw: C.glass ? 1.2 : 2.5 });
    P.push({ t: 'poly', pts: [[x, y - s * 0.78], [x + s * 0.34, y + s * 0.5], [x, y + s * 0.2], [x - s * 0.34, y + s * 0.5]], fill: C.ink });
    P.push({ t: 'text', x: x, y: y - s - 6, s: 'K', size: 13, weight: 800, fam: 'b', fill: C.ink, anchor: 'middle', pe: false });
    return P;
  };
  D.scaleBar = function (x, y, s, C, lenHint) {
    const target = lenHint || 100;
    const L = gis.niceLen(target);
    const px = L * s;
    const P = [];
    P.push({ t: 'rect', x: x - 16, y: y - 22, w: px + 48, h: 34, rx: C.glass ? 10 : 0, fill: C.paper || '#fff', opacity: 0.82 });
    P.push({ t: 'rect', x: x, y: y, w: px / 2, h: 6, fill: C.ink, stroke: C.ink, sw: 1 });
    P.push({ t: 'rect', x: x + px / 2, y: y, w: px / 2, h: 6, fill: C.disc, stroke: C.ink, sw: 1 });
    P.push({ t: 'text', x: x, y: y - 5, s: '0', size: 11, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle', pe: false });
    P.push({ t: 'text', x: x + px, y: y - 5, s: (L >= 1000 ? L / 1000 + ' km' : L + ' m'), size: 11, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle', pe: false });
    return P;
  };

  /* ---------------- etiketler: çakışmasız yerleştirme ---------------- */
  D.labeler = function () {
    const placed = [];
    const hit = (b) => placed.some((p) => !(b.x1 < p.x0 || b.x0 > p.x1 || b.y1 < p.y0 || b.y0 > p.y1));
    return {
      // x, y: ekran konumu · s: yazı · size · o: { anchor, rot (radyan), weight, fill, opacity, halo }
      try: function (x, y, s, size, o) {
        o = o || {};
        const w = s.length * size * 0.56, hgt = size * 1.1;
        const rot = o.rot || 0;
        const ex = Math.abs(Math.cos(rot)) * w + Math.abs(Math.sin(rot)) * hgt, ey = Math.abs(Math.sin(rot)) * w + Math.abs(Math.cos(rot)) * hgt;
        const ax = o.anchor === 'middle' ? x - ex / 2 : o.anchor === 'end' ? x - ex : x;
        const b = { x0: ax - 2, x1: ax + ex + 2, y0: y - ey / 2 - 2, y1: y + ey / 2 + 2 };
        if (o.bounds && (b.x0 < o.bounds.x0 || b.x1 > o.bounds.x1 || b.y0 < o.bounds.y0 || b.y1 > o.bounds.y1)) return null;
        if (hit(b)) return null;
        placed.push(b);
        const prim = { t: 'text', x: x, y: y + size * 0.34, s: s, size: size, weight: o.weight || 600, fam: o.fam || 'b', fill: o.fill, anchor: o.anchor || 'middle', opacity: o.opacity, pe: false };
        if (rot) prim.xf = [Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot)];
        return prim;
      },
      reserve: function (b) { placed.push(b); },
    };
  };

  /* ana yol adları (düz plan): yolun en uzun düz parçasına paralel */
  D.roadNames = function (T, cl, C, lab, bounds) {
    const out = [];
    const seen = new Set();
    const roads = cl.roads.filter((r) => r.name && !seen.has(r.name) && ['primary', 'secondary', 'tertiary', 'residential', 'pedestrian'].indexOf(r.cls) >= 0);
    // ada göre en uzun parça
    const best = new Map();
    roads.forEach((r) => {
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const k = r.name;
        const rank = ['primary', 'secondary', 'tertiary', 'pedestrian', 'residential'].indexOf(r.cls);
        const cur = best.get(k);
        if (!cur || l > cur.l + 1e-6) best.set(k, { l: l, a: a, b: b, rank: rank, name: r.name });
      }
    });
    Array.from(best.values()).filter((e) => e.l * T.s > e.name.length * 6.5 + 10).sort((x, y) => x.rank - y.rank || y.l - x.l).slice(0, 14).forEach((e) => {
      const p0 = T.P(e.a[0], e.a[1]), p1 = T.P(e.b[0], e.b[1]);
      let ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      const t = lab.try((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, e.name, 10, { anchor: 'middle', rot: ang, weight: 600, fill: C.ink, opacity: 0.78, bounds: bounds });
      if (t) out.push(t);
    });
    return out;
  };
  D.poiNames = function (T, A, C, lab, bounds) {
    const out = [];
    const list = A.pois.filter((p) => p.name && p.inR && (p.park || p.cat === 'egitim' || p.cat === 'saglik' || p.cat === 'kultur' || p.cat === 'hizmet')).slice(0, 40);
    list.forEach((p) => {
      const q = T.P(p.x, p.y);
      const t = lab.try(q[0] + 7, q[1] - 7, p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name, 10, { anchor: 'start', weight: 700, fill: C.ink, bounds: bounds });
      if (t) out.push(t);
    });
    return out;
  };

  /* ---------------- parsel ---------------- */
  D.parcel = function (T, parcel, C, z, o) {
    o = o || {};
    const P = [];
    if (!parcel) return P;
    P.push({ t: 'path', d: ringD(T, parcel, z), fill: C.parcelFill, stroke: C.accent, sw: o.sw || 2.4, dash: o.dash });
    return P;
  };

  /* ---------------- iklim: aylık sıcaklık/yağış + rüzgâr gülü ---------------- */
  D.windRose = function (x, y, r, climate, C) {
    const P = [];
    P.push({ t: 'circle', cx: x, cy: y, r: r, stroke: C.faint, sw: 1 });
    P.push({ t: 'circle', cx: x, cy: y, r: r * 0.5, stroke: C.faint, sw: 1, opacity: 0.8 });
    if (!climate) return P;
    const mx = Math.max.apply(null, climate.wind.map((w) => w.share)) || 1;
    climate.wind.forEach((w) => {
      const len = (w.share / mx) * r * 0.96;
      if (len < 1) return;
      const a0 = ((w.dir - 9) * Math.PI) / 180, a1 = ((w.dir + 9) * Math.PI) / 180;
      const p0 = [x + Math.sin(a0) * len, y - Math.cos(a0) * len], p1 = [x + Math.sin(a1) * len, y - Math.cos(a1) * len];
      P.push({ t: 'poly', pts: [[x, y], p0, p1], fill: C.glass ? C.ink : C.accent2, opacity: 0.78 });
    });
    ['K', 'D', 'G', 'B'].forEach((l, i) => { const a = (Math.PI / 2) * i; P.push({ t: 'text', x: x + Math.sin(a) * (r + 10), y: y - Math.cos(a) * (r + 10) + 4, s: l, size: 10, weight: 700, fam: 'b', fill: C.ink, opacity: 0.6, anchor: 'middle', pe: false }); });
    return P;
  };
  D.monthly = function (x, y, w, h, climate, C) {
    const P = [];
    if (!climate) return P;
    const M = climate.monthly;
    const bw = w / 12;
    const rmax = Math.max.apply(null, M.map((m) => m.rad)) || 1;
    const ts = M.map((m) => m.t).filter((v) => v != null);
    const tmin = Math.min.apply(null, ts), tmax = Math.max.apply(null, ts);
    M.forEach((m, i) => {
      const bh = (m.rad / rmax) * h * 0.9;
      P.push({ t: 'rect', x: x + i * bw + 2, y: y + h - bh, w: bw - 4, h: bh, fill: C.glass ? C.bTone[1] : C.isoBand[2], opacity: 0.9 });
    });
    let d = '';
    M.forEach((m, i) => {
      if (m.t == null) return;
      const px = x + i * bw + bw / 2, py = y + h - ((m.t - tmin) / Math.max(1, tmax - tmin)) * h * 0.82 - h * 0.08;
      d += (d ? 'L' : 'M') + f1(px) + ' ' + f1(py);
    });
    if (d) P.push({ t: 'path', d: d, stroke: C.glass ? C.ink : C.accent, sw: 2, cap: 'round' });
    ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'].forEach((l, i) => P.push({ t: 'text', x: x + i * bw + bw / 2, y: y + h + 12, s: l, size: 10, weight: 600, fam: 'b', fill: C.ink, opacity: 0.6, anchor: 'middle', pe: false }));
    return P;
  };

  /* ---------------- küçük grafik parçaları ---------------- */
  D.bar = function (x, y, w, h, v, C, o) {
    o = o || {};
    const P = [];
    P.push({ t: 'rect', x: x, y: y, w: w, h: h, rx: C.glass ? h / 2 : 0, fill: C.glass ? 'rgba(23,24,27,.09)' : 'rgba(38,29,17,.12)' });
    const bw = Math.max(0, Math.min(1, v)) * w;
    if (bw > 0.5) P.push({ t: 'rect', x: x, y: y, w: bw, h: h, rx: C.glass ? h / 2 : 0, fill: o.fill || (C.glass ? C.ink : v >= 0.7 ? C.good : v >= 0.4 ? C.warn : C.bad) });
    return P;
  };

  /* zemin: daire + su + yeşil + yollar + (isteğe bağlı) bina izleri */
  D.ground = function (T, A, C, z, o) {
    o = o || {};
    const P = [];
    D.disc(T, A.R, C, z).forEach((p) => P.push(p));
    D.green(T, A.clip, C, z, { opacity: o.greenOpacity != null ? o.greenOpacity : 0.55 }).forEach((p) => P.push(p));
    D.water(T, A.clip, C, z).forEach((p) => P.push(p));
    if (o.buildings) D.buildings(T, A.clip, C, z, { mode: 'faint', opacity: o.bOpacity }).forEach((p) => P.push(p));
    D.roads(T, A.clip, C, z, { emph: !!o.emphRoads, opacity: o.roadOpacity }).forEach((p) => P.push(p));
    return P;
  };
})();
