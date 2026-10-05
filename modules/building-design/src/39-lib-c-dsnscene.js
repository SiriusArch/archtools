/* ==========================================================================
   39-lib-c-dsnscene.js — Tasarım Üretici paftası (Modül 7)
   Seçili alternatifi pafta primitifleri olarak çizer (ekran SVG'si, PNG/PDF aynı listeden):
     vaziyet  parsel, çekme zarfı, kütle, çevre yapıları, kenar türleri
     tipik    tipik kat planı: daireler (türe göre ton), çekirdek, koridor, taşıyıcı aks ve kolonlar, ölçüler
     bodrum   otopark planı: ramp, araç yerleri, sürüş yolları, kolonlar
     kutle    izometrik kütle (çevre yapılarıyla)
     kiyas    tüm alternatiflerin tipik katları yan yana
   Çıktı: { prims, hits, W, H }. Saf mantık; hesap App.design içindedir.
   Not: App.siteDraw / App.siteScene bu dosyadan sonra yüklenir; yalnızca çağrı anında kullanılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const fmt = U.fmt;
  const DS = (App.dsnScene = {});

  const gis = () => App.gis;
  const SD = () => App.siteDraw;
  const SS = () => App.siteScene;
  const sheet = () => App.sheet;
  const TYPES = ['1+0', '1+1', '2+1', '3+1', '4+1'];

  /* tür → dolgu tonu (glass: gri, Bauhaus: sıcak ton) */
  DS.typeFill = function (type, C) {
    const i = Math.max(0, TYPES.indexOf(type));
    return C.bTone[Math.min(4, i)];
  };
  const onFill = (fill, C) => {
    if (!C.glass) return C.ink;
    const h = String(fill).replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return r * 0.3 + g * 0.59 + b * 0.11 < 150 ? '#FFFFFF' : C.ink;
  };

  /* dünya → ekran dönüşümü: sınır kutusunu alana sığdır */
  function fit(pts, area, margin, maxS) {
    const b = gis().bbox(pts);
    const sw = (area.w - margin * 2) / Math.max(1, b.w), sh = (area.h - margin * 2) / Math.max(1, b.h);
    const s = Math.min(sw, sh, maxS || 60);
    const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
    const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    return { s: s, b: b, P: (x, y) => [cx + (x - mx) * s, cy - (y - my) * s], inv: (px, py) => [mx + (px - cx) / s, my - (py - cy) / s] };
  }
  const ringD = (F, ring) => ring.map((q, i) => { const p = F.P(q[0], q[1]); return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + 'Z';
  const lineD = (F, pts) => pts.map((q, i) => { const p = F.P(q[0], q[1]); return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');

  /* ---------------- ortak: künye bilgisi ---------------- */
  function info(project, alt, im, C, mode) {
    const modeName = { vaziyet: 'vaziyet', tipik: 'tipik kat', bodrum: 'bodrum otopark', kutle: 'kütle', kiyas: 'alternatif karşılaştırma' }[mode] || mode;
    const nm = (project.site.loc && project.site.loc.name) || '';
    const t = alt ? alt.unitTotals : null;
    const legend = [];
    if (alt) {
      Object.keys(t.byType || {}).sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b)).slice(0, 5).forEach((k) => legend.push({ label: k + ' · ' + t.byType[k] + ' adet', fill: DS.typeFill(k, C) }));
      if (alt.plan && alt.plan.cores && alt.plan.cores.length) legend.push({ label: 'Çekirdek', fill: C.ink });
      legend.push({ label: 'Kolon', fill: C.glass ? '#2A2B30' : App.PAL.red });
    }
    return {
      name: project.meta.name,
      subtitle: 'Tasarım üretici · ' + modeName + (alt ? ' · ' + alt.label : '') + (nm ? ' · ' + (nm.length > 18 ? nm.slice(0, 17) + '…' : nm) : ''),
      legend: legend,
      stats: alt ? [['Kat', alt.floors + ' × ' + fmt(im.floorH, 1) + ' m'], ['Daire', String(t.total)], ['Verim', '%' + Math.round(alt.plan.areas.efficiency * 100)]] : [['Kat', '—'], ['Daire', '—'], ['Verim', '—']],
      scoreLabel: 'Tasarım skoru', percent: alt ? Math.round(alt.score) : null,
    };
  }

  /* ---------------- sağ sütun: skor bileşenleri + alan tablosu ---------------- */
  function rightColumn(alt, rows, C) {
    const P = [];
    const X = 1018, W = 340;
    const SSc = SS(), D = SD();
    SSc.panelTitle(X, 56, W, 'Seçenek puanı', C).forEach((p) => P.push(p));
    (alt.parts || []).forEach((p, i) => {
      const y = 84 + i * 22;
      P.push({ t: 'text', x: X, y: y, s: p.label.length > 30 ? p.label.slice(0, 29) + '…' : p.label, size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      D.bar(X + 200, y - 9, 78, 8, p.v, C).forEach((q) => P.push(q));
      P.push({ t: 'text', x: X + W, y: y, s: '%' + Math.round(p.v * 100), size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
    });
    let y = 84 + (alt.parts || []).length * 22 + 20;
    SSc.panelTitle(X, y, W, 'Alanlar ve program', C).forEach((p) => P.push(p));
    y += 28;
    let lastG = null;
    rows.forEach((r) => {
      if (y > 836) return;
      if (r.g !== lastG && lastG != null) y += 6;
      lastG = r.g;
      const v = r.u === 'm²' ? fmt(r.v, 0) + ' m²' : r.u === 'adet' ? String(r.v) : r.u ? fmt(r.v, r.v < 10 ? 2 : 0) + ' ' + r.u : fmt(r.v, 2);
      SSc.kv(X, y, W, r.k.length > 34 ? r.k.slice(0, 33) + '…' : r.k, v, C).forEach((p) => P.push(p));
      y += 20;
    });
    return P;
  }

  /* ---------------- kenar yardımcıları ---------------- */
  function dimLine(F, a, b, off, text, C) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const A = F.P(a[0] + nx * off, a[1] + ny * off), B = F.P(b[0] + nx * off, b[1] + ny * off);
    const A0 = F.P(a[0], a[1]), B0 = F.P(b[0], b[1]);
    const P = [];
    P.push({ t: 'line', x1: A0[0], y1: A0[1], x2: A[0] + (A[0] - A0[0]) * 0.1, y2: A[1] + (A[1] - A0[1]) * 0.1, stroke: C.ink, sw: 0.8, opacity: 0.5 });
    P.push({ t: 'line', x1: B0[0], y1: B0[1], x2: B[0] + (B[0] - B0[0]) * 0.1, y2: B[1] + (B[1] - B0[1]) * 0.1, stroke: C.ink, sw: 0.8, opacity: 0.5 });
    P.push({ t: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: C.ink, sw: 1, opacity: 0.8 });
    [A, B].forEach((p) => P.push({ t: 'line', x1: p[0] - 4, y1: p[1] + 4, x2: p[0] + 4, y2: p[1] - 4, stroke: C.ink, sw: 1.4 }));
    let ang = (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    P.push({ t: 'text', x: (A[0] + B[0]) / 2 + Math.sin(ang * Math.PI / 180) * 4, y: (A[1] + B[1]) / 2 - Math.cos(ang * Math.PI / 180) * 4, s: text, size: 11, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle', xf: [Math.cos(ang * Math.PI / 180), Math.sin(ang * Math.PI / 180), -Math.sin(ang * Math.PI / 180), Math.cos(ang * Math.PI / 180)], pe: false });
    return P;
  }

  /* ---------------- VAZİYET ---------------- */
  DS.vaziyet = function (project, ctx, alt, view, live) {
    const C = SD().cols(), tb = sheet().tb, D = SD();
    const parcel = project.site.parcel, im = ctx.im;
    const area = { x: 40, y: 56, w: 940, h: tb.y - 56 - 24 };
    const prims = sheet().frame(info(project, alt, im, C, 'vaziyet'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    const R = alt.R;
    const pb = gis().bbox(parcel), ex = Math.max(18, Math.max(pb.w, pb.h) * 0.35);
    const F = fit([[pb.x0 - ex, pb.y0 - ex], [pb.x1 + ex, pb.y1 + ex]], area, 24, 26);
    // çevre: alan dışına taşan yapı ve yolları kes (pafta çerçevesini örtmesin)
    const tl = F.inv(area.x + 6, area.y + 6), br = F.inv(area.x + area.w - 6, area.y + area.h - 6);
    const wx0 = tl[0], wx1 = br[0], wy0 = br[1], wy1 = tl[1];
    const wrect = [[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1]];
    const segClip = (a, b) => {
      let t0 = 0, t1 = 1;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const chk = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
      if (!(chk(-dx, a[0] - wx0) && chk(dx, wx1 - a[0]) && chk(-dy, a[1] - wy0) && chk(dy, wy1 - a[1]))) return null;
      return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
    };
    const e = ctx.e;
    if (e && e.data) {
      let d = '';
      e.data.buildings.forEach((b) => {
        if (!b.pts || b.cx < wx0 - 40 || b.cx > wx1 + 40 || b.cy < wy0 - 40 || b.cy > wy1 + 40) return;
        if (gis().pointInPoly([b.cx, b.cy], parcel)) return;
        const c = gis().clipPoly(b.pts, wrect);
        if (c.length >= 3) d += ringD(F, c);
      });
      if (d) add([{ t: 'path', d: d, fill: C.bTone[1], stroke: C.bLine, sw: 0.8, opacity: 0.9 }]);
      let rd = '';
      e.data.roads.forEach((r) => {
        if (r.tn) return;
        for (let i = 1; i < r.pts.length; i++) {
          const sg = segClip(r.pts[i - 1], r.pts[i]);
          if (sg) rd += lineD(F, sg);
        }
      });
      if (rd) add([{ t: 'path', d: rd, stroke: C.roadMid, sw: 5, cap: 'round', opacity: 0.55 }]);
    }
    add([{ t: 'path', d: ringD(F, parcel), fill: C.parcelFill }]);
    if (R.env && R.env.length >= 3) add([{ t: 'path', d: ringD(F, R.env), stroke: C.env, sw: 1.4, dash: [6, 4] }]);
    // kütle
    const fill = C.glass ? '#2E3036' : '#EAAE1B';
    R.pieces.forEach((pc) => add([{ t: 'path', d: ringD(F, pc), fill: fill, stroke: C.ink, sw: C.glass ? 1.4 : 2.6 }]));
    if (alt.plan) {
      (alt.plan.cores || []).forEach((c) => add([{ t: 'path', d: ringD(F, c.poly), fill: C.glass ? '#fff' : C.paper, opacity: 0.9 }]));
    }
    // parsel sınırı + kenar türleri
    (R.edges || []).forEach((ed) => {
      const a = F.P(ed.a[0], ed.a[1]), b = F.P(ed.b[0], ed.b[1]);
      add([{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.accent, sw: ed.kind === 'on' ? 4.5 : 2.6, dash: ed.kind === 'arka' ? [7, 4] : undefined, cap: 'round' }]);
      const nx = ed.dir[1], ny = -ed.dir[0];
      const m = F.P(ed.mid[0], ed.mid[1]);
      const txt = (ed.kind === 'on' ? 'Ön' : ed.kind === 'arka' ? 'Arka' : 'Yan') + ' ' + fmt(ed.len, 1) + ' m';
      const tw = App.sheet.tw(txt, 11.5, 700, 'b', 0);
      const off = 8 + Math.abs(nx) * tw / 2 + Math.abs(ny) * 7;
      add([{ t: 'text', x: m[0] + nx * off, y: m[1] - ny * off + 4, s: txt, size: 11.5, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle', pe: false }]);
    });
    // otopark rampı
    if (alt.basement && alt.basement.ramp && alt.basement.ramp.poly) add([{ t: 'path', d: ringD(F, alt.basement.ramp.poly), stroke: C.accent2, sw: 1.4, dash: [4, 3] }]);
    // etiket: rampa (kesikli dikdörtgen) üstüne gelmeyecek biçimde yerleştir
    const big = R.pieces.reduce((m, p) => (Math.abs(gis().area(p)) > Math.abs(gis().area(m)) ? p : m), R.pieces[0]);
    const bc = F.P.apply(null, gis().centroid(big));
    const t2 = fmt(alt.height, 1) + ' m · ' + alt.unitTotals.total + ' daire';
    const lw = Math.max(App.sheet.tw(alt.floors + ' kat', 16, 800, 'b', 0), App.sheet.tw(t2, 11.5, 600, 'b', 0));
    let rb = null;
    if (alt.basement && alt.basement.ramp && alt.basement.ramp.poly) {
      const pts = alt.basement.ramp.poly.map((q) => F.P(q[0], q[1]));
      rb = { x0: Math.min.apply(null, pts.map((q) => q[0])) - 4, x1: Math.max.apply(null, pts.map((q) => q[0])) + 4, y0: Math.min.apply(null, pts.map((q) => q[1])) - 4, y1: Math.max.apply(null, pts.map((q) => q[1])) + 4 };
    }
    const hitsRamp = (cy) => rb && bc[0] + lw / 2 > rb.x0 && bc[0] - lw / 2 < rb.x1 && cy + 20 > rb.y0 && cy - 20 < rb.y1;
    let ly = bc[1];
    [0, -44, 44, -88, 88].some((d) => { if (!hitsRamp(bc[1] + d)) { ly = bc[1] + d; return true; } return false; });
    add([
      { t: 'text', x: bc[0], y: ly - 2, s: alt.floors + ' kat', size: 16, weight: 800, fam: 'b', fill: C.glass ? '#fff' : C.ink, anchor: 'middle', pe: false },
      { t: 'text', x: bc[0], y: ly + 15, s: t2, size: 11.5, weight: 600, fam: 'b', fill: C.glass ? '#fff' : C.ink, anchor: 'middle', pe: false, opacity: 0.85 },
    ]);
    add(D.north(86, 92, C, 20));
    add(D.scaleBar(70, tb.y - 28, F.s, C, 110 / F.s));
    add(rightColumn(alt, ctx.table, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* ---------------- TİPİK KAT ---------------- */
  DS.tipik = function (project, ctx, alt, view, live) {
    const C = SD().cols(), tb = sheet().tb, D = SD();
    const im = ctx.im, plan = alt.plan;
    const area = { x: 40, y: 56, w: 940, h: tb.y - 56 - 24 };
    const prims = sheet().frame(info(project, alt, im, C, 'tipik'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    const vi = Math.max(0, Math.min((plan.variants ? plan.variants.length : 1) - 1, view.variant || 0));
    const units = plan.variants && plan.variants[vi] ? plan.variants[vi].units : plan.units;
    const all = [];
    plan.pieces.forEach((p) => p.poly.forEach((q) => all.push(q)));
    const F = fit(all, area, 90, 40);
    const wall = C.glass ? 2.4 : 3.2;
    // zemin: parsel çok soluk
    if (project.site.parcel) add([{ t: 'path', d: ringD(F, project.site.parcel), stroke: C.ink, sw: 0.8, opacity: 0.18, dash: [5, 4] }]);
    // aks ve kolon
    const g = plan.grid;
    if (view.grid && g && g.axesU && g.axesV) {
      const b = F.b;
      const ext = 2.5;
      const O = g.origin || [0, 0];
      const u = g.dirU, v = g.dirV;
      const half = Math.max(b.w, b.h);
      const umin = Math.min.apply(null, g.axesU) - ext, umax = Math.max.apply(null, g.axesU) + ext;
      const vmin = Math.min.apply(null, g.axesV) - ext, vmax = Math.max.apply(null, g.axesV) + ext;
      void half;
      const W = (a, c) => [O[0] + u[0] * a + v[0] * c, O[1] + u[1] * a + v[1] * c];
      g.axesU.forEach((a, i) => {
        const p0 = F.P.apply(null, W(a, vmin)), p1 = F.P.apply(null, W(a, vmax));
        add([{ t: 'line', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: C.accent2, sw: 0.7, dash: [10, 3, 2, 3], opacity: 0.55 }]);
        const lab = String.fromCharCode(65 + (i % 26));
        add([{ t: 'text', x: p0[0], y: p0[1] + 4, s: lab, size: 10, weight: 700, fam: 'b', fill: C.accent2, anchor: 'middle', pe: false }]);
      });
      g.axesV.forEach((c, i) => {
        const p0 = F.P.apply(null, W(umin, c)), p1 = F.P.apply(null, W(umax, c));
        add([{ t: 'line', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: C.accent2, sw: 0.7, dash: [10, 3, 2, 3], opacity: 0.55 }]);
        add([{ t: 'text', x: p0[0] - 6, y: p0[1] + 3.5, s: String(i + 1), size: 10, weight: 700, fam: 'b', fill: C.accent2, anchor: 'end', pe: false }]);
      });
    }
    // koridorlar
    (plan.corridors || []).forEach((c) => add([{ t: 'path', d: ringD(F, c), fill: C.glass ? '#fff' : C.paper, stroke: C.ink, sw: 0.8, opacity: 1 }]));
    // daireler
    const lab = [];
    units.forEach((u) => {
      const f = DS.typeFill(u.type, C);
      add([{ t: 'path', d: ringD(F, u.poly), fill: f, stroke: C.ink, sw: C.glass ? 1.1 : 1.8 }]);
      const lp = App.design.labelPoint ? App.design.labelPoint(u.poly) : gis().centroid(u.poly);
      const bb = gis().bbox(u.poly);
      if (bb.w * F.s > 56 && bb.h * F.s > 34) lab.push({ at: F.P(lp[0], lp[1]), t: u.type, a: fmt(u.area, 0) + ' m²', col: onFill(f, C) });
      else if (bb.w * F.s > 30 && bb.h * F.s > 18) lab.push({ at: F.P(lp[0], lp[1]), t: u.type, a: '', col: onFill(f, C) });
    });
    // piece konturu (duvar)
    plan.pieces.forEach((p) => add([{ t: 'path', d: ringD(F, p.poly), stroke: C.ink, sw: wall }]));
    // çekirdekler
    (plan.cores || []).forEach((c) => {
      add([{ t: 'path', d: ringD(F, c.poly), fill: C.ink, stroke: C.ink, sw: 1 }]);
      if (c.stair) add([{ t: 'path', d: ringD(F, c.stair), fill: C.glass ? '#fff' : C.paper, opacity: 0.92, stroke: C.ink, sw: 0.8 }]);
      (c.lifts || []).forEach((l) => {
        const p0 = F.P(l[0][0], l[0][1]), p1 = F.P(l[2][0], l[2][1]);
        add([{ t: 'path', d: ringD(F, l), fill: C.glass ? '#fff' : C.paper, opacity: 0.92, stroke: C.ink, sw: 0.8 }]);
        add([{ t: 'line', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: C.ink, sw: 0.7 }]);
      });
    });
    // kolonlar
    if (g && g.cols && view.grid !== false) {
      g.cols.forEach((c) => {
        const p = F.P(c[0], c[1]);
        const w = Math.max(3, c[2] * F.s), h = Math.max(3, c[3] * F.s);
        add([{ t: 'rect', x: p[0] - w / 2, y: p[1] - h / 2, w: w, h: h, fill: C.glass ? '#17181B' : App.PAL.red, stroke: C.ink, sw: 0.6 }]);
      });
    }
    // etiketler
    lab.forEach((l) => {
      add([{ t: 'text', x: l.at[0], y: l.at[1] + (l.a ? -1 : 4), s: l.t, size: 13, weight: 800, fam: 'b', fill: l.col, anchor: 'middle', pe: false }]);
      if (l.a) add([{ t: 'text', x: l.at[0], y: l.at[1] + 15, s: l.a, size: 12.5, weight: 600, fam: 'b', fill: l.col, anchor: 'middle', pe: false, opacity: 0.85 }]);
    });
    // ölçüler: her parçanın uzunluk ve derinliği
    if (view.dims) {
      plan.pieces.slice(0, 4).forEach((p) => {
        const d = p.dir || [1, 0];
        const bb = gis().bbox(p.poly);
        const c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2];
        const L = p.length, Dp = p.depth;
        const n = [-d[1], d[0]];
        const a0 = [c[0] - d[0] * L / 2 - n[0] * Dp / 2, c[1] - d[1] * L / 2 - n[1] * Dp / 2];
        const a1 = [a0[0] + d[0] * L, a0[1] + d[1] * L];
        const b1 = [a0[0] + n[0] * Dp, a0[1] + n[1] * Dp];
        add(dimLine(F, a0, a1, -2.6, fmt(L, 1) + ' m', C));
        add(dimLine(F, a0, b1, -2.6, fmt(Dp, 1) + ' m', C));
      });
    }
    add(D.north(86, 92, C, 20));
    add(D.scaleBar(70, tb.y - 28, F.s, C, 110 / F.s));
    if (plan.variants && plan.variants.length > 1) {
      prims.push({ t: 'text', x: 980, y: tb.y - 32, s: 'Plan tipi ' + String.fromCharCode(65 + vi) + ' / ' + plan.variants.length + ' · kat başına değişir', size: 12, weight: 700, fam: 'b', fill: C.ink, anchor: 'end', opacity: 0.7 });
    }
    add(rightColumn(alt, ctx.table, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* ---------------- BODRUM ---------------- */
  DS.bodrum = function (project, ctx, alt, view, live) {
    const C = SD().cols(), tb = sheet().tb, D = SD();
    const im = ctx.im, B = alt.basement;
    const area = { x: 40, y: 56, w: 940, h: tb.y - 56 - 24 };
    const prims = sheet().frame(info(project, alt, im, C, 'bodrum'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    const base = B.ring && B.ring.length >= 3 ? B.ring : project.site.parcel;
    const F = fit(project.site.parcel.concat(base), area, 90, 40);
    add([{ t: 'path', d: ringD(F, project.site.parcel), stroke: C.ink, sw: 0.8, opacity: 0.25, dash: [5, 4] }]);
    if (B.ring && B.ring.length >= 3) add([{ t: 'path', d: ringD(F, B.ring), fill: C.glass ? '#fff' : C.paper, stroke: C.ink, sw: C.glass ? 2 : 3.2 }]);
    (B.aisles || []).forEach((a) => add([{ t: 'path', d: ringD(F, a), fill: C.glass ? 'rgba(23,24,27,.05)' : 'rgba(38,29,17,.07)' }]));
    (B.stalls || []).forEach((s) => add([{ t: 'path', d: ringD(F, s.poly), stroke: C.ink, sw: 0.9, opacity: 0.85 }]));
    if (B.ramp && B.ramp.poly) {
      add([{ t: 'path', d: ringD(F, B.ramp.poly), fill: C.glass ? 'rgba(23,24,27,.16)' : 'rgba(234,174,27,.5)', stroke: C.ink, sw: 1.4 }]);
      const rc = gis().centroid(B.ramp.poly), d = B.ramp.dir || [1, 0];
      const a = F.P(rc[0] - d[0] * 4, rc[1] - d[1] * 4), b = F.P(rc[0] + d[0] * 4, rc[1] + d[1] * 4);
      add([{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.ink, sw: 1.6 }, { t: 'text', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 8, s: 'RAMP', size: 10.5, weight: 800, fam: 'b', fill: C.ink, anchor: 'middle', pe: false }]);
    }
    // bina izdüşümü (kesikli)
    alt.R.pieces.forEach((p) => add([{ t: 'path', d: ringD(F, p), stroke: C.accent2, sw: 1.2, dash: [8, 4], opacity: 0.8 }]));
    (B.cols || []).forEach((c) => {
      const p = F.P(c[0], c[1]);
      const w = Math.max(3, c[2] * F.s), h = Math.max(3, c[3] * F.s);
      add([{ t: 'rect', x: p[0] - w / 2, y: p[1] - h / 2, w: w, h: h, fill: C.glass ? '#17181B' : App.PAL.red }]);
    });
    const cap = B.capacity, need = B.need;
    add([
      { t: 'text', x: 70, y: 124, s: B.floors ? B.floors + ' bodrum kat · kat başına ' + (B.perFloor != null ? B.perFloor : Math.round(cap / Math.max(1, B.floors))) + ' araç' : 'Bodrum kat yok', size: 15, weight: 800, fam: 'b', fill: C.ink },
      { t: 'text', x: 70, y: 144, s: 'Toplam ' + cap + ' araç yeri · gereken ' + need + (B.shortage ? ' · ' + B.shortage + ' araç eksik' : ' · yeterli'), size: 12.5, weight: 600, fam: 'b', fill: B.shortage ? (C.bad || C.ink) : C.ink, opacity: 0.85 },
    ]);
    add(D.north(86, 192, C, 20));
    add(D.scaleBar(70, tb.y - 28, F.s, C, 110 / F.s));
    add(rightColumn(alt, ctx.table, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* ---------------- KÜTLE (izometrik) ---------------- */
  DS.kutle = function (project, ctx, alt, view, live) {
    const C = SD().cols(), tb = sheet().tb, D = SD(), iso = App.iso, osm = App.osm;
    const im = ctx.im, R = alt.R, parcel = project.site.parcel;
    const prims = sheet().frame(info(project, alt, im, C, 'kutle'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    const c = gis().centroid(parcel);
    const maxd = Math.max.apply(null, parcel.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
    const Rv = U.clamp(Math.ceil((maxd * 2.6) / 10) * 10, 90, 260);
    const e = ctx.e;
    const cl = e ? App.imarScene.local(e.data, c, Rv) : { R: Rv, buildings: [], roads: [], rails: [], green: [], landuse: [], water: [], poi: [], transit: [], offset: [0, 0] };
    const mvc = (pts) => pts.map((q) => [q[0] - cl.offset[0], q[1] - cl.offset[1]]);
    const zx = view.zx || 1;
    const H = alt.height;
    const maxCtx = cl.buildings.reduce((m, b) => Math.max(m, osm.heightOf(b)), 0);
    const hMax = Math.max(H, Math.min(maxCtx, 60), 12) * zx;
    const area = { x: 40, y: 56, w: 940, h: tb.y - 56 - 24 };
    const pr = (view.pitch * Math.PI) / 180;
    const sc = Math.min(area.w / (2 * Rv * 1.04), area.h / (2 * Rv * Math.sin(pr) + hMax * Math.cos(pr))) * 0.98;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2 + (hMax * Math.cos(pr) * sc) / 2;
    const I = iso.make({ yaw: view.yaw, pitch: view.pitch, s: sc, cx: cx, cy: cy, center: [0, 0] });
    const T = D.isoT(I);
    add(D.disc(T, Rv, C, 0));
    add(D.green(T, cl, C, 0, { opacity: 0.6 }));
    add(D.water(T, cl, C, 0));
    add(D.roads(T, cl, C, 0, { emph: true }));
    add([{ t: 'path', d: D.ringD(T, mvc(parcel), 0.1), fill: C.parcelFill, stroke: C.accent, sw: 2.4 }]);
    if (R.env && R.env.length >= 3) add([{ t: 'path', d: D.ringD(T, mvc(R.env), 0.15), stroke: C.env, sw: 1.4, dash: [6, 4] }]);
    const ents = [];
    D.clippedBuildings(cl).forEach((b) => {
      if (gis().pointInPoly([b.cx + cl.offset[0], b.cy + cl.offset[1]], parcel)) return;
      ents.push({ dp: I.depth(b.cx, -b.cy), ctx: b });
    });
    R.pieces.forEach((pc) => { const q = gis().centroid(mvc(pc)); ents.push({ dp: I.depth(q[0], -q[1]) - 0.5, piece: mvc(pc) }); });
    ents.sort((a, b) => a.dp - b.dp);
    ents.forEach((en) => {
      if (en.ctx) {
        const b = en.ctx, h = osm.heightOf(b) * zx;
        iso.extrude(I, b.pts.map((q) => [q[0], -q[1]]), 0, h, C.bTone[D.hClass(osm.heightOf(b))], { stroke: C.glass ? 'rgba(23,24,27,.30)' : 'rgba(38,29,17,.55)', sw: 0.7 }).forEach((p) => prims.push(p));
        return;
      }
      const ring = en.piece.map((q) => [q[0], -q[1]]);
      const fill = C.glass ? '#2E3036' : '#EAAE1B';
      const Fc = iso.extrudeFaces(I, ring, 0, H * zx);
      Fc.walls.forEach((w) => {
        prims.push({ t: 'poly', pts: w.pts, fill: iso.shade(fill, w.f), stroke: C.ink, sw: C.glass ? 0.8 : 1.6 });
        if (alt.floors > 1 && alt.floors <= 40) {
          for (let k = 1; k < alt.floors; k++) {
            const t = k / alt.floors;
            const a = [w.pts[3][0] + (w.pts[0][0] - w.pts[3][0]) * t, w.pts[3][1] + (w.pts[0][1] - w.pts[3][1]) * t];
            const b = [w.pts[2][0] + (w.pts[1][0] - w.pts[2][0]) * t, w.pts[2][1] + (w.pts[1][1] - w.pts[2][1]) * t];
            prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.glass ? 'rgba(255,255,255,.35)' : 'rgba(38,29,17,.45)', sw: 0.8 });
          }
        }
      });
      prims.push({ t: 'poly', pts: Fc.roof, fill: iso.shade(fill, 1.12), stroke: C.ink, sw: C.glass ? 1 : 2 });
    });
    add(rightColumn(alt, ctx.table, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* ---------------- KIYAS: tüm alternatifler ---------------- */
  DS.kiyas = function (project, ctx, alt, view, live) {
    const C = SD().cols(), tb = sheet().tb;
    const im = ctx.im;
    const prims = sheet().frame(info(project, alt, im, C, 'kiyas'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    const alts = ctx.res.alts;
    const cols = alts.length > 4 ? 4 : Math.max(2, alts.length), rows = Math.ceil(alts.length / cols);
    const gx = 40, gy = 56, gw = 940, gh = tb.y - 56 - 20;
    const cw = gw / cols, ch = gh / rows;
    const hits = [];
    alts.forEach((a, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x0 = gx + col * cw, y0 = gy + row * ch;
      const sel = alt && a.id === alt.id;
      const pad = 8;
      add([{ t: 'rect', x: x0 + pad, y: y0 + pad, w: cw - pad * 2, h: ch - pad * 2, rx: C.glass ? 22 : 0, fill: C.glass ? (sel ? '#fff' : 'rgba(255,255,255,.55)') : C.paper, stroke: C.ink, sw: sel ? (C.glass ? 2.4 : 5) : (C.glass ? 1 : 2) }]);
      const all = [];
      a.plan.pieces.forEach((p) => p.poly.forEach((q) => all.push(q)));
      const F = fit(all, { x: x0 + pad + 6, y: y0 + pad + 30, w: cw - pad * 2 - 12, h: ch - pad * 2 - 76 }, 6, 30);
      const units = a.plan.variants && a.plan.variants[0] ? a.plan.variants[0].units : a.plan.units;
      units.forEach((u) => add([{ t: 'path', d: ringD(F, u.poly), fill: DS.typeFill(u.type, C), stroke: C.ink, sw: 0.7 }]));
      a.plan.pieces.forEach((p) => add([{ t: 'path', d: ringD(F, p.poly), stroke: C.ink, sw: 1.8 }]));
      (a.plan.cores || []).forEach((c) => add([{ t: 'path', d: ringD(F, c.poly), fill: C.ink }]));
      add([
        { t: 'text', x: x0 + pad + 12, y: y0 + pad + 22, s: a.label.length > 26 ? a.label.slice(0, 25) + '…' : a.label, size: 13, weight: 800, fam: 'b', fill: C.ink },
        { t: 'text', x: x0 + cw - pad - 12, y: y0 + pad + 22, s: '%' + Math.round(a.score), size: 15, weight: 800, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' },
        { t: 'text', x: x0 + pad + 12, y: y0 + ch - pad - 30, s: a.floors + ' kat · ' + a.unitTotals.total + ' daire · verim %' + Math.round(a.plan.areas.efficiency * 100), size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 },
        { t: 'text', x: x0 + pad + 12, y: y0 + ch - pad - 12, s: 'otopark ' + a.basement.capacity + '/' + a.basement.need + ' · TAKS ' + fmt(a.metrics.taks, 2), size: 11.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.65 },
      ]);
      hits.push({ i: i, id: a.id, x0: x0 + pad, y0: y0 + pad, x1: x0 + cw - pad, y1: y0 + ch - pad });
    });
    if (alt) add(rightColumn(alt, ctx.table, C));
    return { prims: prims, hits: hits, W: sheet().W, H: sheet().H };
  };

  DS.scene = function (project, ctx, alt, view, live) {
    if (!alt) return { prims: [], hits: [], W: sheet().W, H: sheet().H };
    const f = DS[view.mode] || DS.vaziyet;
    return f(project, ctx, alt, view, live);
  };
})();
