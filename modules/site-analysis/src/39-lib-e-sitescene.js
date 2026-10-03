/* ==========================================================================
   39-lib-e-sitescene.js — Arsa Analizi paftası (Modül 4)
   İki kip: "Harita" (düz plan, katmanlar üst üste) ve "Katmanlar" (izometrik, her katman ayrı levha).
   Sağ sütun: skor bileşenleri, erişim tablosu, çevre ölçüleri, iklim ve güneş.
   Çıktı: { prims, hits, geom, W, H } — SVG ve Canvas aynı primitif listesinden çizer.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const site = App.site;
  const D = App.siteDraw;
  const sheet = App.sheet;
  const iso = App.iso;
  const U = App.util;
  const fmt = U.fmt;
  const SS = (App.siteScene = {});

  const dimOp = (P, f) => (f >= 0.999 ? P : P.map((p) => Object.assign({}, p, { opacity: (p.opacity == null ? 1 : p.opacity) * f })));
  SS.dimOp = dimOp;

  /* ---------------- ortak parçalar ---------------- */
  SS.panelTitle = function (x, y, w, text, C) {
    const g = C.glass;
    return [
      { t: 'text', x: x, y: y, s: g ? text : text.toLocaleUpperCase('tr'), size: g ? 14 : 12.5, weight: g ? 700 : 700, fam: g ? 'b' : 'm', fill: C.ink, ls: g ? 0 : 1.6 },
      { t: 'line', x1: x, y1: y + 8, x2: x + w, y2: y + 8, stroke: C.ink, sw: g ? 1 : 2.4, opacity: g ? 0.25 : 1 },
    ];
  };
  SS.kv = function (x, y, w, k, v, C, o) {
    o = o || {};
    return [
      { t: 'text', x: x, y: y, s: k, size: 12.5, weight: 500, fam: 'b', fill: C.ink, opacity: 0.62 },
      { t: 'text', x: x + w, y: y, s: v, size: 13, weight: 700, fam: C.glass ? 'b' : 'm', fill: o.fill || C.ink, anchor: 'end' },
    ];
  };

  const pctS = (v) => '%' + Math.round(v * 100);
  const minS = (m) => (m == null || !isFinite(m) ? '—' : (m < 10 ? fmt(m, 1) : String(Math.round(m))) + ' dk');

  function legendFor(layers, C) {
    const L = [];
    const sw = (label, fill) => L.push({ label: label, fill: fill });
    layers.forEach((id) => {
      if (id === 'erisim') { sw('5 dk yürüme', C.isoBand[0]); sw('10 dk', C.isoBand[1]); sw('15 dk', C.isoBand[2]); }
      else if (id === 'yapi') { sw('Alçak bina', C.bTone[1]); sw('Orta', C.bTone[2]); sw('Yüksek', C.bTone[4]); }
      else if (id === 'yesil') { sw('Yeşil alan', C.green); sw('Su', C.water); }
      else if (id === 'gurultu') { sw('Orta gürültü', C.noiseSolid[0]); sw('Gürültülü', C.noiseSolid[1]); }
      else if (id === 'ulasim') sw('Durak', C.glass ? C.ink : C.accent);
      else if (id === 'gunes') sw('Bina gölgesi', C.shadow);
      else if (id === 'topo') sw('Yükselti', C.topo[5]);
    });
    return L.slice(0, 8);
  }

  function layerNote(id, A, sun) {
    const T = A.topo;
    if (id === 'topo') return T ? 'Kot ' + fmt(T.min, 0) + '–' + fmt(T.max, 0) + ' m · eğim %' + fmt(T.slope, 1) + (T.aspect != null ? ' · ' + gis.compass(T.aspect) + ' bakı' : '') : 'Yükselti verisi yok';
    if (id === 'yapi') return A.built.count + ' bina · emsal ~' + fmt(A.built.far, 2);
    if (id === 'yesil') return 'Yeşil ' + pctS(A.green.share) + ' · park ' + minS(A.green.nearPark ? A.green.nearPark.min : null);
    if (id === 'ulasim') return A.transit.in10 + ' durak (10 dk) · yol ' + fmt(A.mob.roadKm, 1) + ' km';
    if (id === 'erisim') return A.iso.map((b) => fmt(b.ha, 0)).join(' / ') + ' ha (5 / 10 / 15 dk)';
    if (id === 'islev') return A.pois.filter((p) => p.inR).length + ' işlev noktası';
    if (id === 'gurultu') return 'Çalışma noktasında: ' + A.noise.cls.label.toLowerCase();
    if (id === 'gunes') return sun.day.label + ' ' + fmt(sun.hour, 0) + ':00 · ' + Math.round(sun.alt) + '° yükseklik';
    return '';
  }

  /* ---------------- sağ sütun ---------------- */
  function rightColumn(A, C, view, sun) {
    const P = [];
    const X = 1018, W = 340;
    // 1. skor bileşenleri
    SS.panelTitle(X, 56, W, 'Konum skoru bileşenleri', C).forEach((p) => P.push(p));
    A.parts.forEach((p, i) => {
      const y = 84 + i * 22;
      P.push({ t: 'text', x: X, y: y, s: p.label, size: 12.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      D.bar(X + 128, y - 9, 150, 8, p.v, C).forEach((q) => P.push(q));
      P.push({ t: 'text', x: X + W, y: y, s: pctS(p.v), size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
    });
    // 2. erişim tablosu
    SS.panelTitle(X, 232, W, 'Yürüme erişimi (10 dk)', C).forEach((p) => P.push(p));
    A.cats.forEach((c, i) => {
      const y = 260 + i * 22;
      const q = { x: X + 6, y: y - 4 };
      const T = D.mapT(0, 0, 1);
      const shape = D.shapeD(T, q.x, -q.y, 0, D.SHAPE[c.id], 4.6);
      const ring = D.SHAPE[c.id] === 'ring';
      P.push({ t: 'path', d: shape, fill: ring ? C.disc : C.cat[c.id], stroke: ring ? C.cat[c.id] : (C.glass ? 'rgba(255,255,255,.9)' : C.ink), sw: ring ? 1.8 : 0.9 });
      P.push({ t: 'text', x: X + 20, y: y, s: c.label, size: 12.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      P.push({ t: 'text', x: X + 214, y: y, s: minS(c.nearMin), size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
      P.push({ t: 'text', x: X + W, y: y, s: c.c10 + ' adet', size: 12, weight: 500, fam: 'b', fill: C.ink, opacity: 0.6, anchor: 'end' });
    });
    // 3. çevre ölçüleri
    SS.panelTitle(X, 462, W, 'Çevre ölçüleri', C).forEach((p) => P.push(p));
    const rows = [
      ['Bina sayısı', String(A.built.count)],
      ['Taban alanı oranı (TAKS)', fmt(A.built.coverage, 2)],
      ['Tahmini emsal (KAKS)', fmt(A.built.far, 2)],
      ['Yeşil alan', pctS(A.green.share)],
      ['Yol ağı yoğunluğu', fmt(A.mob.density, 1) + ' km/km²'],
      ['Kesişim yoğunluğu', Math.round(A.mob.interDensity) + ' /km²'],
      ['Durak (10 dk içinde)', String(A.transit.in10)],
      ['Gürültü göstergesi', A.noise.cls.label],
    ];
    rows.forEach((r, i) => SS.kv(X, 490 + i * 22, W, r[0], r[1], C).forEach((p) => P.push(p)));
    // 4. iklim ve güneş
    SS.panelTitle(X, 686, W, 'İklim ve güneş', C).forEach((p) => P.push(p));
    if (A.climate) {
      P.push({ t: 'text', x: X, y: 710, s: 'Aylık sıcaklık (çizgi) ve ışınım (sütun)' + (A.climate.demo ? ' · örnek' : ''), size: 11, weight: 500, fam: 'b', fill: C.ink, opacity: 0.55 });
      D.monthly(X, 718, 232, 64, A.climate, C).forEach((p) => P.push(p));
      D.windRose(X + 292, 752, 34, A.climate, C).forEach((p) => P.push(p));
      if (A.climate.dominant) P.push({ t: 'text', x: X + 292, y: 818, s: 'Hâkim rüzgâr ' + gis.compass(A.climate.dominant.dir), size: 11, weight: 600, fam: 'b', fill: C.ink, opacity: 0.7, anchor: 'middle' });
    } else P.push({ t: 'text', x: X, y: 722, s: 'İklim verisi alınamadı', size: 12, weight: 500, fam: 'b', fill: C.ink, opacity: 0.55 });
    const w = A.sun.find((s) => s.id === 'kis'), su = A.sun.find((s) => s.id === 'yaz');
    if (w && su) {
      SS.kv(X, 828, 232, '21 Aralık: gün ' + fmt(w.len, 1) + ' sa', 'öğlen ' + Math.round(w.noonAlt) + '°', C).forEach((p) => P.push(p));
      SS.kv(X, 846, 232, '21 Haziran: gün ' + fmt(su.len, 1) + ' sa', 'öğlen ' + Math.round(su.noonAlt) + '°', C).forEach((p) => P.push(p));
    }
    return P;
  }

  /* ---------------- ortak: künye ---------------- */
  function infoOf(project, A, mode, layers) {
    const C = D.cols();
    const s = project.site;
    const nm = s.loc.name.length > 26 ? s.loc.name.slice(0, 25) + '…' : s.loc.name;
    return {
      name: project.meta.name,
      subtitle: 'Arsa analizi · ' + nm + ' · ' + A.template.label + (mode === 'iso' ? ' · katmanlar' : ''),
      legend: legendFor(layers, C),
      stats: [['Yarıçap', fmt(A.R, 0) + ' m'], ['Yürüme', s.walkMin + ' dk'], ['Veri', A.demo ? 'Demo (sentetik)' : 'OSM']],
      scoreLabel: 'Konum skoru', percent: A.score,
    };
  }

  /* ---------------- HARİTA kipi ---------------- */
  SS.arsaMap = function (project, A, view, live) {
    const C = D.cols();
    const tb = sheet.tb;
    const layers = view.layers;
    const on = (id) => layers.indexOf(id) >= 0;
    const CX = 506, CY = 442, RP = 376;
    const s = RP / A.R;
    const T = D.mapT(CX, CY, s);
    const sun = D.sunState(A, view);
    const prims = sheet.frame(infoOf(project, A, 'map', layers), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    // zemin
    add(D.disc(T, A.R, C, 0));
    if (on('topo')) add(D.topo(T, A, C, 0, { opacity: 0.9 }));
    add(D.green(T, A.clip, C, 0, { opacity: on('yesil') ? 1 : 0.5, deep: on('yesil') }));
    add(D.water(T, A.clip, C, 0));
    if (on('gurultu')) add(D.noise(T, A, C, 0));
    if (on('erisim')) add(D.access(T, A, C, 0));
    add(D.roads(T, A.clip, C, 0, { emph: on('ulasim') || on('yapi') === false }));
    if (on('ulasim')) add(D.rails(T, A.clip, C, 0));
    add(D.buildings(T, A.clip, C, 0, { mode: on('yapi') ? 'tone' : 'faint', opacity: on('yapi') ? 1 : 0.9 }));
    if (on('gunes')) { add(D.shadows(T, A, C, 0, sun)); }
    if (view.parcel !== false && project.site.parcel) {
      add(D.parcel(T, project.site.parcel, C, 0, { sw: 2.6 }));
      const c = gis.centroid(project.site.parcel), q = T.P(c[0], c[1], 0);
      const ar = Math.abs(gis.area(project.site.parcel));
      add([{ t: 'text', x: q[0], y: q[1] + 4, s: 'Parsel ' + fmt(ar, 0) + ' m²', size: 11.5, weight: 800, fam: 'b', fill: C.ink, anchor: 'middle', pe: false }]);
    }
    if (on('erisim')) add(D.rings(T, A, C, 0));
    if (on('islev')) add(D.pois(T, A, C, 0));
    if (on('ulasim')) add(D.transit(T, A, C, 0));
    // üzerine gelince bilgi (SVG ekranda başlık olarak gösterilir)
    const hits = [];
    if (on('islev')) A.pois.filter((p) => p.inR).forEach((p) => {
      const q = T.P(p.x, p.y);
      hits.push({ kind: 'poi', x: q[0], y: q[1], r: 8, label: (p.name || p.kind || 'İşlev') + (p.min != null ? ' · ' + minS(p.min) + ' yürüme' : '') });
    });
    if (on('ulasim')) A.entry.data.transit.forEach((p) => {
      if (p.x * p.x + p.y * p.y > A.R * A.R) return;
      const q = T.P(p.x, p.y);
      hits.push({ kind: 'poi', x: q[0], y: q[1], r: 9, label: (p.name || site.TRANSIT_LABEL[p.kind] || 'Durak') });
    });
    // etiketler
    if (view.labels) {
      const lab = D.labeler();
      const bounds = { x0: CX - RP + 8, x1: CX + RP - 8, y0: CY - RP + 8, y1: CY + RP - 8 };
      add(D.roadNames(T, A.clip, C, lab, bounds));
      if (on('islev')) add(D.poiNames(T, A, C, lab, bounds));
    }
    add(D.center(T, C, 0));
    if (on('gunes')) add(D.sunMark(T, A.R, C, sun, 0));
    // yarıçap halkası ve yön
    prims.push({ t: 'path', d: D.ringD(T, gis.circlePoly(A.R, 96), 0), stroke: C.ink, sw: C.glass ? 1.4 : 3 });
    add(D.north(86, 92, C, 20));
    add(D.scaleBar(70, tb.y - 28, s, C, 120));
    add(rightColumn(A, C, view, sun));
    // yarıçap etiketi
    prims.push({ t: 'text', x: CX + RP, y: CY + RP + 22, s: 'r = ' + fmt(A.R, 0) + ' m', size: 12, weight: 700, fam: 'b', fill: C.ink, opacity: 0.6, anchor: 'end' });
    return { prims: prims, hits: hits, geom: { cx: CX, cy: CY, s: s, R: A.R, Rpx: RP, W: sheet.W, H: sheet.H }, W: sheet.W, H: sheet.H, sun: sun, mode: 'map' };
  };

  /* ---------------- KATMANLAR kipi (izometrik levhalar) ---------------- */
  SS.arsaIso = function (project, A, view, live) {
    const C = D.cols();
    const tb = sheet.tb;
    const order = site.LAYERS.map((l) => l.id);
    let ids = order.filter((id) => view.layers.indexOf(id) >= 0);
    if (!ids.length) ids = ['yapi'];
    const n = ids.length;
    const area = { x: 360, y: 62, w: 990, h: tb.y - 62 - 30 };
    const R = A.R;
    const ex = U.clamp(view.explode, 0, 1);
    const zx = view.zx || 1.6;
    const maxH = Math.max(20, Math.min(90, (A.built.maxH || 20))) * zx;
    const topoH = A.topo ? (A.topo.max - A.topo.min) * zx : 0;
    const GAP0 = 16, GX = 0.42 * R * 2 * 0.38;
    const step = GAP0 + ex * GX;
    const lastH = Math.max(maxH, topoH);
    const zMax = (n - 1) * (GAP0 + GX) + lastH * 0.9;
    const zCur = (n - 1) * step + lastH * 0.9;
    const pr = (view.pitch * Math.PI) / 180;
    const diag = 2 * R;
    const bw = diag * 1.04, bh = diag * Math.sin(pr) + zMax * Math.cos(pr);
    const sc = Math.min(area.w / bw, area.h / bh) * 0.97;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2 + (zCur * Math.cos(pr) * sc) / 2 - (lastH * 0.25 * Math.cos(pr) * sc) / 2;
    const I = iso.make({ yaw: view.yaw, pitch: view.pitch, s: sc, cx: cx, cy: cy, center: [0, 0] });
    const T = D.isoT(I);
    const sun = D.sunState(A, view);
    const prims = sheet.frame(infoOf(project, A, 'iso', ids), live);
    const hits = [];
    const marks = [];
    const lod = !!view.lod;

    ids.forEach((id, i) => {
      const z = i * step;
      const dim = view.sel && view.sel !== id ? 0.26 : 1;
      let P = [];
      const add = (L) => L.forEach((p) => P.push(p));
      add(D.disc(T, R, C, z));
      if (id === 'topo') {
        add(D.topo(T, A, C, z, { lift: true, zx: zx }));
        add(D.water(T, A.clip, C, z));
      } else if (id === 'yapi') {
        add(D.green(T, A.clip, C, z, { opacity: 0.4 }));
        add(D.water(T, A.clip, C, z));
        add(D.roads(T, A.clip, C, z, { emph: false }));
        add(D.buildings(T, A.clip, C, z, { extrude: true, zx: zx, lod: lod }));
      } else if (id === 'yesil') {
        add(D.green(T, A.clip, C, z, { opacity: 1, deep: true }));
        add(D.water(T, A.clip, C, z));
        add(D.roads(T, A.clip, C, z, { emph: false, opacity: 0.6 }));
        add(D.buildings(T, A.clip, C, z, { mode: 'faint', opacity: 0.55 }));
      } else if (id === 'ulasim') {
        add(D.green(T, A.clip, C, z, { opacity: 0.3 }));
        add(D.water(T, A.clip, C, z));
        add(D.roads(T, A.clip, C, z, { emph: true }));
        add(D.rails(T, A.clip, C, z));
        add(D.transit(T, A, C, z));
      } else if (id === 'erisim') {
        add(D.ground(T, A, C, z, { greenOpacity: 0.3, roadOpacity: 0.9 }).slice(1));
        add(D.access(T, A, C, z));
        add(D.rings(T, A, C, z));
        add(D.center(T, C, z));
      } else if (id === 'islev') {
        add(D.ground(T, A, C, z, { greenOpacity: 0.35, buildings: true, bOpacity: 0.6 }).slice(1));
        add(D.pois(T, A, C, z, { r: 5.4 }));
      } else if (id === 'gurultu') {
        add(D.ground(T, A, C, z, { greenOpacity: 0.3 }).slice(1));
        add(D.noise(T, A, C, z));
        add(D.roads(T, A.clip, C, z, { emph: true, opacity: 0.8 }));
        add(D.rails(T, A.clip, C, z));
      } else if (id === 'gunes') {
        add(D.ground(T, A, C, z, { greenOpacity: 0.3, buildings: true }).slice(1));
        add(D.shadows(T, A, C, z, sun));
        add(D.sunMark(T, R, C, sun, z));
      }
      if (project.site.parcel && (id === 'yapi' || id === 'erisim')) add(D.parcel(T, project.site.parcel, C, z + 0.2, { sw: 2.2 }));
      dimOp(P, dim).forEach((p) => prims.push(p));
      // levha kontur ve tıklama bölgesi
      const ring = gis.circlePoly(R, 48).map((q) => T.P(q[0], q[1], z));
      hits.push({ kind: 'slab', id: id, pts: ring });
      const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
      marks.push({ i: i, id: id, cy: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2, minX: Math.min.apply(null, xs), z: z, dim: dim });
    });

    // sol sütun: başlık, not, gösterge — slaytlara yakın ama üst üste binmeden dağıtılır
    const g = C.glass;
    const showLeg = n <= 4;
    const blockH = showLeg ? 62 + 18 * 3 : 54;
    const top = area.y + 20, bot = tb.y - 36 - blockH;
    const ys = marks.map((mk) => mk.cy - 30);
    // aşağıdan yukarı sırala: ids[0] en altta; en üst blok en küçük y
    const asc = ys.map((y, i) => ({ y: y, i: i })).sort((p, q) => p.y - q.y);
    let prev = top - blockH;
    asc.forEach((o) => { o.y = Math.max(o.y, prev + blockH, top); prev = o.y; });
    let nxt = bot + blockH;
    for (let k = asc.length - 1; k >= 0; k--) { asc[k].y = Math.min(asc[k].y, nxt - blockH, bot); nxt = asc[k].y; }
    asc.forEach((o) => { ys[o.i] = o.y; });
    ids.forEach((id, i) => {
      const mk = marks[i];
      const meta = site.LAYERS.find((l) => l.id === id);
      const x0 = 60, y0 = ys[i];
      const xe = Math.max(x0 + 170, Math.min(mk.minX - 14, 330));
      const Pg = [];
      Pg.push({ t: 'text', x: x0, y: y0, s: g ? meta.name : meta.name.toLocaleUpperCase('tr'), size: 17, weight: g ? 400 : 700, fam: 'd', fill: C.ink, ls: g ? 0 : 1 });
      Pg.push({ t: 'line', x1: x0, y1: y0 + 8, x2: xe, y2: y0 + 8, stroke: C.ink, sw: g ? 1.2 : 2.5, opacity: g ? 0.5 : 1 });
      Pg.push({ t: 'text', x: x0, y: y0 + 26, s: layerNote(id, A, sun), size: 12, weight: 700, fam: g ? 'b' : 'm', fill: C.ink, opacity: 0.7 });
      if (showLeg) legendFor([id], C).slice(0, 3).forEach((it, j) => {
        const yy = y0 + 46 + j * 18;
        Pg.push({ t: 'rect', x: x0, y: yy - 11, w: 14, h: 14, rx: g ? 7 : 0, fill: it.fill, stroke: g ? 'rgba(23,24,27,.3)' : C.ink, sw: g ? 1 : 1.6 });
        Pg.push({ t: 'text', x: x0 + 22, y: yy, s: it.label, size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      });
      dimOp(Pg, mk.dim).forEach((p) => prims.push(p));
      prims.push({ t: 'line', x1: xe, y1: y0 + 8, x2: mk.minX + 6, y2: mk.cy, stroke: C.ink, sw: 1, dash: [2, 4], opacity: 0.45 * mk.dim });
    });
    return { prims: prims, hits: hits, geom: null, W: sheet.W, H: sheet.H, sun: sun, mode: 'iso', ids: ids };
  };

  SS.arsa = function (project, A, view, live) { return view.mode === 'iso' ? SS.arsaIso(project, A, view, live) : SS.arsaMap(project, A, view, live); };
})();
