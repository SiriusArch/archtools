/* ==========================================================================
   39-lib-f-imarscene.js — İmar ve kapasite paftası (Modül 5)
   Parsel çevresini yakın plan (daire pencere) çizer: parsel, çekme zarfı, kütle, gölge, çevre yapıları.
   Kipler: "plan" (düz plan, kenar etiketleri ve tutamaçlar) ve "iso" (izometrik kütle, kat çizgileri).
   Çıktı: { prims, hits, geom, W, H } — hits ekran koordinatında; geom plan ↔ ekran dönüşümü içindir.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const Z = App.zoning;
  const D = App.siteDraw;
  const SS = App.siteScene;
  const sheet = App.sheet;
  const iso = App.iso;
  const U = App.util;
  const fmt = U.fmt;
  const IS = (App.imarScene = {});

  /* ---------------- yerel görünüm: veriyi parsel merkezine kaydır ve kırp ---------------- */
  const memo = new WeakMap();
  IS.local = function (data, c, Rv) {
    const key = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(Rv);
    let m = memo.get(data);
    if (m && m.k === key) return m.v;
    const cx = Math.round(c[0]), cy = Math.round(c[1]);
    const R2 = Rv + 160; // kaydırılmış veri kırpma dairesinden biraz büyük alınır
    const near = (b) => Math.abs(b.cx - cx) <= R2 && Math.abs(b.cy - cy) <= R2;
    const mv = (pts) => pts.map((q) => [q[0] - cx, q[1] - cy]);
    const bb = (o) => { const b = gis.bbox(o.pts); return !(b.x1 < cx - R2 || b.x0 > cx + R2 || b.y1 < cy - R2 || b.y0 > cy + R2); };
    const sh = (list) => list.filter(bb).map((o) => Object.assign({}, o, { pts: mv(o.pts) }));
    const d2 = {
      R: R2,
      buildings: data.buildings.filter(near).map((b) => Object.assign({}, b, { pts: mv(b.pts), cx: b.cx - cx, cy: b.cy - cy })),
      roads: sh(data.roads), rails: sh(data.rails), green: sh(data.green), landuse: sh(data.landuse), water: sh(data.water),
      poi: data.poi.map((p) => Object.assign({}, p, { x: p.x - cx, y: p.y - cy })),
      transit: data.transit.map((p) => Object.assign({}, p, { x: p.x - cx, y: p.y - cy })),
    };
    const v = osm.clipped(d2, Rv);
    v.offset = [cx, cy];
    memo.set(data, { k: key, v: v });
    return v;
  };

  // görünüm penceresi: parsel merkezi ve yarıçap (sürükleme sırasında view.fixed ile dondurulur)
  IS.frame = function (parcel, view, k, lo, hi) {
    if (view && view.fixed) return { c: view.fixed.c, Rv: view.fixed.Rv };
    if (!parcel || parcel.length < 3) return { c: [0, 0], Rv: 160 };
    const c = gis.centroid(parcel);
    const maxd = Math.max.apply(null, parcel.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
    return { c: c, Rv: U.clamp(Math.ceil((maxd * k) / 10) * 10, lo, hi) };
  };

  const EDGE_LABEL = { on: 'ÖN', yan: 'YAN', arka: 'ARKA' };
  const EDGE_LABEL_G = { on: 'Ön', yan: 'Yan', arka: 'Arka' };

  /* ---------------- ortak sağ sütun: program tablosu ---------------- */
  function rightColumn(R, im, C, project) {
    const P = [];
    const X = 1018, W = 340;
    const use = Z.use(im.use);
    SS.panelTitle(X, 56, W, 'İmar durumu · ' + use.label.split(' (')[0], C).forEach((p) => P.push(p));
    const f = R.ok ? R.facts : null;
    const bar = (y, label, used, allow, text) => {
      P.push({ t: 'text', x: X, y: y, s: label, size: 12.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      const v = allow ? used / allow : 0;
      D.bar(X + 128, y - 9, 120, 8, Math.min(1, v), C, { fill: v > 1.002 ? C.bad : undefined }).forEach((q) => P.push(q));
      P.push({ t: 'text', x: X + W, y: y, s: text, size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
    };
    if (f) {
      bar(84, 'Taban alanı (TAKS)', f.taksUsed, im.taks, fmt(f.taksUsed, 2) + ' / ' + fmt(im.taks, 2));
      bar(106, 'Emsal (KAKS)', f.kaksUsed, im.kaks, fmt(f.kaksUsed, 2) + ' / ' + fmt(im.kaks, 2));
      bar(128, 'Yükseklik', R.height, im.hmax, fmt(R.height, 1) + ' / ' + fmt(im.hmax, 1) + ' m');
    } else {
      P.push({ t: 'text', x: X, y: 84, s: R.reason === 'cekme' ? 'Çekmeler parseli tüketiyor' : R.reason === 'kucuk' ? 'Yapılabilir alan çok küçük' : 'Önce parsel çizin', size: 13, weight: 700, fam: 'b', fill: C.bad, });
    }
    SS.panelTitle(X, 162, W, 'Alanlar ve kapasite', C).forEach((p) => P.push(p));
    const rows = f ? [
      ['Parsel alanı', fmt(R.A, 0) + ' m²'],
      ['Yapılabilir alan (çekme sonrası)', fmt(R.Aenv, 0) + ' m²'],
      ['Taban alanı', fmt(R.footprint, 0) + ' m²'],
      ['Kat sayısı', R.floors + ' kat × ' + fmt(im.floorH, 1) + ' m'],
      ['Toplam inşaat alanı', fmt(R.built, 0) + ' m²'],
      ['Net kullanım alanı (~%' + Math.round(im.eff * 100) + ')', fmt(f.net, 0) + ' m²'],
      [use.unitName.charAt(0).toLocaleUpperCase('tr') + use.unitName.slice(1) + ' sayısı (~' + fmt(im.unit, 0) + ' m²)', String(f.units)],
      ['Tahmini ' + use.perName + ' sayısı', String(f.people)],
      ['Yoğunluk', fmt(f.density, 0) + ' ' + (use.perName === 'kişi' ? 'kişi' : 'kullanıcı') + '/ha'],
      ['Otopark (gerekli / ' + im.basement + ' bodrum)', f.carsNeed + ' / ' + f.carsCap],
      ['Açık alan', '%' + Math.round(f.freeShare * 100)],
    ] : [['Parsel alanı', fmt(R.A || 0, 0) + ' m²'], ['Yapılabilir alan', fmt(R.Aenv || 0, 0) + ' m²']];
    rows.forEach((r, i) => SS.kv(X, 190 + i * 22, W, r[0], r[1], C).forEach((p) => P.push(p)));
    // çekmeler
    let y = 190 + rows.length * 22 + 22;
    SS.panelTitle(X, y, W, 'Çekme mesafeleri', C).forEach((p) => P.push(p));
    y += 28;
    [['on', 'Ön bahçe'], ['yan', 'Yan bahçe'], ['arka', 'Arka bahçe']].forEach((k, i) => {
      SS.kv(X, y + i * 22, W, k[1], fmt(im.setback[k[0]], 1) + ' m', C).forEach((p) => P.push(p));
    });
    y += 3 * 22 + 18;
    // senaryolar
    if (im.scn.length && y < 760) {
      SS.panelTitle(X, y, W, 'Senaryolar', C).forEach((p) => P.push(p));
      y += 26;
      P.push({ t: 'text', x: X + 150, y: y, s: 'kat', size: 11, weight: 600, fam: 'b', fill: C.ink, opacity: 0.55, anchor: 'end' });
      P.push({ t: 'text', x: X + 220, y: y, s: 'emsal', size: 11, weight: 600, fam: 'b', fill: C.ink, opacity: 0.55, anchor: 'end' });
      P.push({ t: 'text', x: X + W, y: y, s: use.unitName, size: 11, weight: 600, fam: 'b', fill: C.ink, opacity: 0.55, anchor: 'end' });
      y += 20;
      im.scn.slice(0, 4).forEach((sc) => {
        if (y > 840) return;
        const s = sc.sum || {};
        P.push({ t: 'text', x: X, y: y, s: sc.name, size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
        P.push({ t: 'text', x: X + 150, y: y, s: s.ok ? String(s.floors) : '—', size: 12, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
        P.push({ t: 'text', x: X + 220, y: y, s: s.ok ? fmt(s.kaks, 2) : '—', size: 12, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
        P.push({ t: 'text', x: X + W, y: y, s: s.ok ? String(s.units) : '—', size: 12, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
        y += 20;
      });
    }
    void project;
    return P;
  }

  function infoOf(project, R, im, mode, C, ctxName) {
    const f = R.ok ? R.facts : null;
    const legend = [
      { label: 'Parsel', fill: C.accent },
      { label: 'Yapılabilir zarf', fill: C.env },
      { label: 'Önerilen kütle', fill: C.glass ? C.ink : '#EAAE1B' },
      { label: 'Yeni gölge', fill: C.shadow },
      { label: 'Çevre yapıları', fill: C.bTone[2] },
    ];
    return {
      name: project.meta.name,
      subtitle: 'İmar ve kapasite · ' + Z.use(im.use).label.split(' (')[0] + (mode === 'iso' ? ' · kütle' : '') + ' · ' + (ctxName.length > 22 ? ctxName.slice(0, 21) + '…' : ctxName),
      legend: legend,
      stats: [['Parsel', fmt(R.A || 0, 0) + ' m²'], ['TAKS·KAKS', fmt(im.taks, 2) + '·' + fmt(im.kaks, 1)], ['Yençok', fmt(im.hmax, 1) + ' m']],
      scoreLabel: 'Emsal kullanımı', percent: f ? Math.round(Math.min(1, f.emsalUse) * 100) : 0,
    };
  }

  const massFill = (C) => (C.glass ? '#2E3036' : '#EAAE1B');

  /* ---------------- PLAN kipi ---------------- */
  IS.plan = function (project, A, R, view, live) {
    const C = D.cols();
    const tb = sheet.tb;
    const s0 = project.site, im = s0.imar, parcel = s0.parcel;
    const e = App.site.entry(s0);
    const fv = IS.frame(parcel, view, 2.1, 90, 300);
    const c = fv.c, Rv = fv.Rv;
    const CX = 506, CY = 442, RP = 376;
    const sc = RP / Rv;
    const T = D.mapT(CX, CY, sc);
    const cl = e ? IS.local(e.data, c, Rv) : { R: Rv, buildings: [], roads: [], rails: [], green: [], landuse: [], water: [], poi: [], transit: [], offset: [0, 0] };
    const mv = (pts) => pts.map((q) => [q[0] - cl.offset[0], q[1] - cl.offset[1]]);
    const mvc = (pts) => (cl.offset ? mv(pts) : pts);
    const prims = sheet.frame(infoOf(project, R, im, 'plan', C, s0.loc.name), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    const hits = [];

    add(D.disc(T, Rv, C, 0));
    add(D.green(T, cl, C, 0, { opacity: 0.7, deep: false }));
    add(D.water(T, cl, C, 0));
    add(D.roads(T, cl, C, 0, { emph: true }));
    add(D.rails(T, cl, C, 0));
    add(D.buildings(T, cl, C, 0, { mode: 'tone', opacity: 1 }));
    // gölge
    if (view.shadow && R.ok && R.shadow && R.shadow.polys.length) {
      let d = '';
      R.shadow.polys.forEach((p) => { if (p.length >= 3) d += D.ringD(T, mvc(p), 0); });
      if (d) add([{ t: 'path', d: d, fill: C.shadow }]);
      // gölgede kalan komşular
      const hitB = D.clippedBuildings(cl).filter((b) => R.shadow.polys.some((p) => p.length >= 3 && gis.pointInPoly([b.cx + cl.offset[0], b.cy + cl.offset[1]], p)));
      if (hitB.length) {
        let dd = '';
        hitB.forEach((b) => { dd += D.ringD(T, b.pts, 0); });
        add([{ t: 'path', d: dd, fill: C.glass ? C.ink : C.red || '#C03A22', opacity: 0.55, stroke: C.ink, sw: 0.8 }]);
      }
    }
    // parsel
    const par = parcel ? mvc(parcel) : [];
    if (par.length >= 3) add([{ t: 'path', d: D.ringD(T, par, 0), fill: C.parcelFill }]);
    // zarf
    if (R.env && R.env.length >= 3) {
      add([{ t: 'path', d: D.ringD(T, mvc(R.env), 0), fill: C.glass ? 'rgba(23,24,27,.06)' : 'rgba(0,66,122,.08)', stroke: C.env, sw: 1.6, dash: [6, 4] }]);
    }
    // kütle
    if (R.ok) {
      R.pieces.forEach((pc) => add([{ t: 'path', d: D.ringD(T, mvc(pc), 0), fill: massFill(C), stroke: C.ink, sw: C.glass ? 1.4 : 2.6 }]));
    }
    // parsel sınırı: kenar türüne göre
    (R.edges || []).forEach((ed) => {
      const a = T.P(ed.a[0] - cl.offset[0], ed.a[1] - cl.offset[1]), b = T.P(ed.b[0] - cl.offset[0], ed.b[1] - cl.offset[1]);
      const w = ed.kind === 'on' ? (C.glass ? 4 : 5.5) : ed.kind === 'arka' ? 2.4 : 3;
      add([{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.accent, sw: w, dash: ed.kind === 'arka' ? [7, 4] : undefined, cap: 'round' }]);
    });
    // kenar etiketleri (tıklanabilir)
    (R.edges || []).forEach((ed) => {
      const dx = ed.dir[0], dy = ed.dir[1];
      const n = [dy, -dx]; // CCW parselde dışa
      const m = T.P(ed.mid[0] - cl.offset[0], ed.mid[1] - cl.offset[1]);
      const sx = n[0], sy = -n[1]; // ekran (y ters)
      const off = 22;
      const x = m[0] + sx * off, y = m[1] + sy * off;
      const dist = ed.kind === 'on' ? im.setback.on : ed.kind === 'arka' ? im.setback.arka : im.setback.yan;
      const txt = (C.glass ? EDGE_LABEL_G[ed.kind] : EDGE_LABEL[ed.kind]) + ' ' + fmt(dist, 1) + ' m';
      const w = txt.length * 6.6 + 14, h = 19;
      const rx = Math.max(CX - RP + 6 + w / 2, Math.min(CX + RP - 6 - w / 2, x)), ry = Math.max(CY - RP + 16, Math.min(CY + RP - 16, y));
      add([
        { t: 'rect', x: rx - w / 2, y: ry - h / 2, w: w, h: h, rx: C.glass ? h / 2 : 0, fill: C.glass ? '#fff' : C.paper, stroke: C.ink, sw: C.glass ? 1 : 1.6 },
        { t: 'text', x: rx, y: ry + 4.2, s: txt, size: 11, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'middle', pe: false },
      ]);
      hits.push({ kind: 'edge', i: ed.i, x0: rx - w / 2, x1: rx + w / 2, y0: ry - h / 2, y1: ry + h / 2 });
      // kenar uzunluğu
      if (ed.len * sc > 46) {
        const lx = m[0] - sx * 12, ly = m[1] - sy * 12;
        add([{ t: 'text', x: lx, y: ly + 3.5, s: fmt(ed.len, 1) + ' m', size: 10.5, weight: 700, fam: 'b', fill: C.ink, opacity: 0.8, anchor: 'middle', pe: false }]);
      }
    });
    // tutamaçlar
    if (view.handles) {
      par.forEach((q, i) => {
        const p = T.P(q[0], q[1]);
        add([{ t: 'circle', cx: p[0], cy: p[1], r: 6, fill: '#fff', stroke: C.accent, sw: 2.2 }]);
        hits.push({ kind: 'pv', i: i, x: p[0], y: p[1], r: 11 });
      });
    }
    // kütle etiketi
    if (R.ok && R.pieces.length) {
      const big = R.pieces.reduce((m, p) => (Math.abs(gis.area(p)) > Math.abs(gis.area(m)) ? p : m), R.pieces[0]);
      const bc = gis.centroid(big);
      const q = T.P(bc[0] - cl.offset[0], bc[1] - cl.offset[1]);
      const fnt = C.glass ? '#fff' : C.ink;
      add([
        { t: 'text', x: q[0], y: q[1] - 1, s: R.floors + ' kat', size: 15, weight: 800, fam: 'b', fill: fnt, anchor: 'middle', pe: false },
        { t: 'text', x: q[0], y: q[1] + 15, s: fmt(R.height, 1) + ' m', size: 11.5, weight: 600, fam: 'b', fill: fnt, anchor: 'middle', pe: false, opacity: 0.85 },
      ]);
    }
    // etiketler
    if (view.labels) {
      const lab = D.labeler();
      hits.forEach((h) => lab.reserve({ x0: h.x0 || h.x - 8, x1: h.x1 || h.x + 8, y0: h.y0 || h.y - 8, y1: h.y1 || h.y + 8 }));
      add(D.roadNames(T, cl, C, lab, { x0: CX - RP + 8, x1: CX + RP - 8, y0: CY - RP + 8, y1: CY + RP - 8 }));
    }
    // güneş yönü
    if (view.shadow && R.ok && R.shadow && R.shadow.alt > 0) add(D.sunMark(T, Rv, C, { alt: R.shadow.alt, az: R.shadow.az }, 0));
    prims.push({ t: 'path', d: D.ringD(T, gis.circlePoly(Rv, 96), 0), stroke: C.ink, sw: C.glass ? 1.4 : 3 });
    add(D.north(86, 92, C, 20));
    add(D.scaleBar(70, tb.y - 28, sc, C, 110 / sc));
    prims.push({ t: 'text', x: CX + RP, y: CY + RP + 22, s: 'r = ' + fmt(Rv, 0) + ' m' + (view.shadow && R.ok && R.shadow ? ' · ' + R.shadow.day.label + ' ' + fmt(im.hour, 0) + ':00' : ''), size: 12, weight: 700, fam: 'b', fill: C.ink, opacity: 0.6, anchor: 'end' });
    add(rightColumn(R, im, C, project));
    return { prims: prims, hits: hits, geom: { cx: CX, cy: CY, s: sc, c: cl.offset, Rv: Rv, Rpx: RP, W: sheet.W, H: sheet.H }, W: sheet.W, H: sheet.H, mode: 'plan' };
  };

  /* ---------------- İZO kipi ---------------- */
  IS.iso = function (project, A, R, view, live) {
    const C = D.cols();
    const tb = sheet.tb;
    const s0 = project.site, im = s0.imar, parcel = s0.parcel;
    const e = App.site.entry(s0);
    const fv = IS.frame(parcel, view, 2.6, 100, 260);
    const c = fv.c, Rv = fv.Rv;
    const cl = e ? IS.local(e.data, c, Rv) : { R: Rv, buildings: [], roads: [], rails: [], green: [], landuse: [], water: [], poi: [], transit: [], offset: [0, 0] };
    const mvc = (pts) => pts.map((q) => [q[0] - cl.offset[0], q[1] - cl.offset[1]]);
    const zx = view.zx || 1;
    const H = R.ok ? R.height : 0;
    const maxCtx = cl.buildings.reduce((m, b) => Math.max(m, osm.heightOf(b)), 0);
    const hMax = Math.max(H, Math.min(maxCtx, 60), 12) * zx;
    const area = { x: 40, y: 56, w: 940, h: tb.y - 56 - 24 };
    const pr = (view.pitch * Math.PI) / 180;
    const sc = Math.min(area.w / (2 * Rv * 1.04), area.h / (2 * Rv * Math.sin(pr) + hMax * Math.cos(pr))) * 0.98;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2 + (hMax * Math.cos(pr) * sc) / 2;
    const I = iso.make({ yaw: view.yaw, pitch: view.pitch, s: sc, cx: cx, cy: cy, center: [0, 0] });
    const T = D.isoT(I);
    const prims = sheet.frame(infoOf(project, R, im, 'iso', C, s0.loc.name), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    add(D.disc(T, Rv, C, 0));
    add(D.green(T, cl, C, 0, { opacity: 0.6 }));
    add(D.water(T, cl, C, 0));
    add(D.roads(T, cl, C, 0, { emph: true }));
    add(D.rails(T, cl, C, 0));
    // gölge
    if (view.shadow && R.ok && R.shadow && R.shadow.polys.length) {
      let d = '';
      R.shadow.polys.forEach((p) => { if (p.length >= 3) d += D.ringD(T, mvc(p), 0.05); });
      if (d) add([{ t: 'path', d: d, fill: C.shadow }]);
    }
    const par = mvc(parcel);
    add([{ t: 'path', d: D.ringD(T, par, 0.1), fill: C.parcelFill, stroke: C.accent, sw: 2.4 }]);
    if (R.env && R.env.length >= 3) add([{ t: 'path', d: D.ringD(T, mvc(R.env), 0.15), stroke: C.env, sw: 1.4, dash: [6, 4] }]);
    // yapılar: derinlik sırası
    const ents = [];
    const pcen = gis.centroid(mvc(parcel)), pdp = I.depth(pcen[0], -pcen[1]);
    D.clippedBuildings(cl).forEach((b) => {
      if (gis.pointInPoly([b.cx + cl.offset[0], b.cy + cl.offset[1]], parcel)) return;
      ents.push({ dp: I.depth(b.cx, -b.cy), ctx: b });
    });
    if (R.ok) R.pieces.forEach((pc) => { const q = gis.centroid(mvc(pc)); ents.push({ dp: I.depth(q[0], -q[1]) - 0.5, piece: mvc(pc) }); });
    ents.sort((a, b) => a.dp - b.dp);
    const lod = !!view.lod;
    ents.forEach((en) => {
      if (en.ctx) {
        const b = en.ctx, h = osm.heightOf(b) * zx;
        const fill = C.bTone[D.hClass(osm.heightOf(b))];
        const ring = b.pts.map((q) => [q[0], -q[1]]);
        if (lod) { const F = iso.extrudeFaces(I, ring, 0, h); prims.push({ t: 'poly', pts: F.roof, fill: fill, stroke: C.bLine, sw: 0.5 }); }
        else {
          // parselin önünde kalıp kütleyi örten yakın yapılar yarı saydam çizilir: önerilen kütle görünür kalsın
          const veil = R.ok && en.dp > pdp && Math.hypot(b.cx - pcen[0], b.cy - pcen[1]) < 70 + h;
          iso.extrude(I, ring, 0, h, fill, { stroke: C.glass ? 'rgba(23,24,27,.30)' : 'rgba(38,29,17,.55)', sw: 0.7 }).forEach((p) => { if (veil) p.opacity = 0.32; prims.push(p); });
        }
        return;
      }
      const ring = en.piece.map((q) => [q[0], -q[1]]);
      const h = H * zx;
      const fill = massFill(C);
      const F = iso.extrudeFaces(I, ring, 0, h);
      F.walls.forEach((w) => {
        prims.push({ t: 'poly', pts: w.pts, fill: iso.shade(fill, w.f), stroke: C.ink, sw: C.glass ? 0.8 : 1.6 });
        if (!lod && R.floors > 1 && R.floors <= 40) {
          for (let k = 1; k < R.floors; k++) {
            const t = k / R.floors;
            const a = [w.pts[3][0] + (w.pts[0][0] - w.pts[3][0]) * t, w.pts[3][1] + (w.pts[0][1] - w.pts[3][1]) * t];
            const b = [w.pts[2][0] + (w.pts[1][0] - w.pts[2][0]) * t, w.pts[2][1] + (w.pts[1][1] - w.pts[2][1]) * t];
            prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.glass ? 'rgba(255,255,255,.35)' : 'rgba(38,29,17,.45)', sw: 0.8 });
          }
        }
      });
      prims.push({ t: 'poly', pts: F.roof, fill: iso.shade(fill, 1.12), stroke: C.ink, sw: C.glass ? 1 : 2 });
    });
    if (view.shadow && R.ok && R.shadow && R.shadow.alt > 0) add(D.sunMark(T, Rv, C, { alt: R.shadow.alt, az: R.shadow.az }, 0));
    // yön oku
    const nd = I.dir(0, -1);
    const nl = Math.hypot(nd[0], nd[1]) || 1;
    prims.push({ t: 'line', x1: 86, y1: 100, x2: 86 + (nd[0] / nl) * 26, y2: 100 + (nd[1] / nl) * 26, stroke: C.ink, sw: 2.4, cap: 'round' });
    prims.push({ t: 'text', x: 86 + (nd[0] / nl) * 38, y: 104 + (nd[1] / nl) * 38, s: 'K', size: 13, weight: 800, fam: 'b', fill: C.ink, anchor: 'middle' });
    add(rightColumn(R, im, C, project));
    return { prims: prims, hits: [], geom: null, W: sheet.W, H: sheet.H, mode: 'iso' };
  };

  /* boş (kütle yok) durum için ortak: arayüz parsel yoksa bu işlevi çağırmaz */
  IS.scene = function (project, A, R, view, live) { return view.mode === 'iso' ? IS.iso(project, A, R, view, live) : IS.plan(project, A, R, view, live); };
})();
