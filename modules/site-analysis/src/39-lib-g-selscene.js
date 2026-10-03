/* ==========================================================================
   39-lib-g-selscene.js — Yer Seçimi paftası (Modül 6)
   Kip "karsilastir": aday konumların küçük çoklu haritaları + sıralama, ölçüt matrisi, ağırlıklar.
   Kip "bul": tek veri kümesi üzerinde ızgara taraması — skor ısı haritası, en iyi noktalar, seçili nokta ayrıntısı.
   Çıktı: { prims, hits, geom, W, H } — hits ekran koordinatında.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const site = App.site;
  const sel = App.select;
  const D = App.siteDraw;
  const SS = App.siteScene;
  const sheet = App.sheet;
  const U = App.util;
  const fmt = U.fmt;
  const YS = (App.selScene = {});

  const SHORT = { erisim: 'Erişim', ulasim: 'Taşıma', yesil: 'Yeşil', sessizlik: 'Sessiz', karisim: 'Karışım', baglanti: 'Bağlantı' };
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  // 0..100 skor → kademe rengi
  function ramp(C, v) {
    const k = Math.max(0, Math.min(4, Math.floor((v / 100) * 5 - 1e-9)));
    return C.score[k];
  }
  YS.ramp = ramp;

  function legendRamp(x, y, w, C, lo, hi) {
    const P = [];
    const n = C.score.length, cw = w / n;
    C.score.forEach((col, i) => P.push({ t: 'rect', x: x + i * cw, y: y, w: cw + 0.5, h: 10, fill: col, stroke: C.glass ? 'rgba(23,24,27,.2)' : C.ink, sw: C.glass ? 0.6 : 1 }));
    P.push({ t: 'text', x: x, y: y + 24, s: '%' + Math.round(lo), size: 11, weight: 700, fam: 'b', fill: C.ink, opacity: 0.7 });
    P.push({ t: 'text', x: x + w, y: y + 24, s: '%' + Math.round(hi), size: 11, weight: 700, fam: 'b', fill: C.ink, opacity: 0.7, anchor: 'end' });
    return P;
  }

  /* ---------------- KARŞILAŞTIR ---------------- */
  YS.compare = function (project, ctx, view, live) {
    const C = D.cols();
    const tb = sheet.tb;
    const cmp = ctx.cmp, cand = project.cand, s0 = project.site;
    const rows = cmp.rows;
    const n = Math.max(1, rows.length);
    const prims = [];
    const best = cmp.best || cmp.ranked[0];
    const info = {
      name: project.meta.name,
      subtitle: 'Yer seçimi · karşılaştırma · ' + site.template(s0.template).label,
      legend: [
        { label: 'Birinci aday', fill: C.glass ? C.ink : C.good },
        { label: 'Elenen aday', fill: C.glass ? '#B5B8C0' : C.bad },
        { label: '10 dk yürüme', fill: C.isoBand[1] },
        { label: 'Yapı', fill: C.bTone[2] },
        { label: 'Yeşil alan', fill: C.green },
        { label: 'Su', fill: C.water },
      ],
      stats: [['Aday', String(rows.length)], ['Yarıçap', fmt(s0.radius, 0) + ' m'], ['Yürüme', s0.walkMin + ' dk']],
      scoreLabel: 'En yüksek skor', percent: best ? best.score : 0,
    };
    sheet.frame(info, live).forEach((p) => prims.push(p));
    const hits = [];
    const add = (L) => L.forEach((p) => prims.push(p));

    // karo ızgarası
    const area = { x: 40, y: 54, w: 950, h: tb.y - 54 - 20 };
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const rws = Math.ceil(n / cols);
    const tw = area.w / cols, th = area.h / rws;
    const ts = Math.min(tw, th);
    rows.forEach((r, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x0 = area.x + col * tw + (tw - ts) / 2, y0 = area.y + row * th + (th - ts) / 2;
      const cx = x0 + ts / 2, cy = y0 + ts / 2 - 10;
      const rt = ts / 2 - 34;
      const isSel = cand.sel === r.id;
      hits.push({ kind: 'cand', id: r.id, x0: x0, y0: y0, x1: x0 + ts, y1: y0 + ts });
      if (isSel) add([{ t: 'rect', x: x0 + 4, y: y0 + 2, w: ts - 8, h: ts - 4, rx: C.glass ? 18 : 0, stroke: C.ink, sw: C.glass ? 1.4 : 2.4, dash: [5, 4] }]);
      if (!r.ready) {
        add([{ t: 'circle', cx: cx, cy: cy, r: rt, fill: C.disc, stroke: C.ink, sw: C.glass ? 1.2 : 2.4 }]);
        add([{ t: 'text', x: cx, y: cy + 4, s: 'veri yok', size: 13, weight: 700, fam: 'b', fill: C.ink, opacity: 0.5, anchor: 'middle' }]);
        add([{ t: 'text', x: cx, y: cy + rt + 24, s: cut(r.c.name, 26), size: 13, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle' }]);
        return;
      }
      const A = r.A;
      const T = D.mapT(cx, cy, rt / A.R);
      const dim = r.pass ? 1 : 0.5;
      const P = [];
      const pa = (L) => L.forEach((p) => P.push(p));
      pa(D.disc(T, A.R, C, 0));
      pa(D.green(T, A.clip, C, 0, { opacity: 0.8 }));
      pa(D.water(T, A.clip, C, 0));
      pa(D.access(T, A, C, 0, { opacity: 0.8 }));
      pa(D.roads(T, A.clip, C, 0, { emph: false, minW: 0.6 }));
      pa(D.buildings(T, A.clip, C, 0, { mode: 'tone', opacity: 0.95 }));
      pa(D.center(T, C, 0));
      P.push({ t: 'path', d: D.ringD(T, gis.circlePoly(A.R, 72), 0), stroke: C.ink, sw: C.glass ? 1.2 : 2.4 });
      SS.dimOp(P, dim).forEach((p) => prims.push(p));
      // sıra rozeti
      const bx = cx - rt * 0.78, by = cy - rt * 0.78;
      const first = r.rank === 1 && r.pass;
      add([
        { t: 'circle', cx: bx, cy: by, r: 15, fill: first ? (C.glass ? C.ink : C.good) : C.glass ? '#fff' : C.paper, stroke: C.ink, sw: C.glass ? 1.2 : 2.2 },
        { t: 'text', x: bx, y: by + 5, s: String(r.rank), size: 15, weight: 800, fam: 'b', fill: first ? '#fff' : C.ink, anchor: 'middle', pe: false },
      ]);
      // ad ve skor
      add([
        { t: 'text', x: cx, y: cy + rt + 22, s: cut(r.c.name, 28), size: 13.5, weight: 700, fam: 'b', fill: C.ink, anchor: 'middle', opacity: dim },
        { t: 'text', x: cx, y: cy + rt + 41, s: '%' + r.score + (r.pass ? '' : ' · elendi'), size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: r.pass ? C.ink : C.bad, anchor: 'middle' },
      ]);
    });

    // sağ sütun
    const X = 1018, W = 340;
    SS.panelTitle(X, 56, W, 'Sıralama', C).forEach((p) => prims.push(p));
    cmp.ranked.slice(0, 8).forEach((r, i) => {
      const y = 84 + i * 22;
      prims.push({ t: 'text', x: X, y: y, s: r.rank + '.', size: 12.5, weight: 800, fam: C.glass ? 'b' : 'm', fill: C.ink });
      prims.push({ t: 'text', x: X + 20, y: y, s: cut(r.c.name, 17), size: 12.5, weight: 600, fam: 'b', fill: C.ink, opacity: r.pass ? 0.9 : 0.5 });
      D.bar(X + 170, y - 9, 100, 8, r.score / 100, C, r.pass ? {} : { fill: C.glass ? '#B5B8C0' : C.bad }).forEach((q) => prims.push(q));
      prims.push({ t: 'text', x: X + W, y: y, s: '%' + r.score, size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
    });
    const y1 = 84 + Math.max(1, cmp.ranked.length) * 22 + 14;
    SS.panelTitle(X, y1, W, 'Ölçüt matrisi', C).forEach((p) => prims.push(p));
    const mx = X + 26, mw = 52;
    site.PARTS.forEach((p, j) => {
      prims.push({ t: 'text', x: mx + j * mw * 0.0 + (j * (W - 26)) / 6 + (W - 26) / 12, y: y1 + 28, s: SHORT[p.id], size: 10.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.65, anchor: 'middle' });
    });
    const cw = (W - 26) / 6;
    cmp.ranked.slice(0, 8).forEach((r, i) => {
      const y = y1 + 38 + i * 26;
      prims.push({ t: 'text', x: X + 6, y: y + 15, s: String(r.rank), size: 12, weight: 800, fam: C.glass ? 'b' : 'm', fill: C.ink });
      r.parts.forEach((p, j) => {
        const x = mx + j * cw;
        const f = p.v >= 0.7 ? 1 : p.v >= 0.4 ? 0.6 : 0.3;
        prims.push({ t: 'rect', x: x + 2, y: y, w: cw - 4, h: 21, rx: C.glass ? 6 : 0, fill: ramp(C, p.v * 100), stroke: C.glass ? 'rgba(23,24,27,.18)' : C.ink, sw: C.glass ? 0.8 : 1.2 });
        prims.push({ t: 'text', x: x + cw / 2, y: y + 14.5, s: String(Math.round(p.v * 100)), size: 11, weight: 700, fam: C.glass ? 'b' : 'm', fill: p.v >= 0.6 ? (C.glass ? '#fff' : '#fff') : C.ink, anchor: 'middle', opacity: f > 0 ? 1 : 1 });
      });
    });
    const y2 = y1 + 38 + Math.max(1, cmp.ranked.length) * 26 + 18;
    SS.panelTitle(X, y2, W, 'Ağırlıklar', C).forEach((p) => prims.push(p));
    site.PARTS.forEach((p, i) => {
      const y = y2 + 28 + i * 20;
      prims.push({ t: 'text', x: X, y: y, s: p.label, size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      D.bar(X + 150, y - 9, 130, 8, cmp.w[p.id] != null ? cmp.w[p.id] : 0, C).forEach((q) => prims.push(q));
      prims.push({ t: 'text', x: X + W, y: y, s: fmt((cmp.w[p.id] || 0) * 100, 0), size: 12, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
    });
    if (best && (best.strong || []).length && y2 + 28 + 6 * 20 + 20 < tb.y - 8) {
      const y = y2 + 28 + 6 * 20 + 14;
      prims.push({ t: 'text', x: X, y: y, s: cut('Öne çıkan: ' + best.strong.map((x) => x.label.toLowerCase()).join(', '), 48), size: 11.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.75 });
    }
    return { prims: prims, hits: hits, geom: null, W: sheet.W, H: sheet.H, mode: 'karsilastir' };
  };

  /* ---------------- KONUM BUL (ızgara taraması) ---------------- */
  YS.scan = function (project, ctx, view, live) {
    const C = D.cols();
    const tb = sheet.tb;
    const sc = ctx.scan, e = ctx.entry, s0 = project.site, cand = project.cand;
    const prims = [];
    const peaks = sc ? sc.peaks : [];
    const info = {
      name: project.meta.name,
      subtitle: 'Yer seçimi · konum bul · ' + site.template(s0.template).label,
      legend: [
        { label: 'Düşük skor', fill: C.score[0] },
        { label: 'Orta', fill: C.score[2] },
        { label: 'Yüksek skor', fill: C.score[4] },
        { label: 'Filtreyi geçmeyen', fill: C.glass ? '#B5B8C0' : C.mid },
        { label: 'En iyi nokta', fill: C.ink },
      ],
      stats: [['Alan', sc ? '⌀ ' + fmt(sc.R * 2, 0) + ' m' : '—'], ['Adım', sc ? sc.step + ' m' : '—'], ['Geçen', sc ? sc.passN + ' / ' + sc.validN : '—']],
      scoreLabel: 'En iyi nokta', percent: peaks.length ? peaks[0].score : sc ? sc.max : 0,
    };
    sheet.frame(info, live).forEach((p) => prims.push(p));
    const add = (L) => L.forEach((p) => prims.push(p));
    const hits = [];
    const CX = 506, CY = 442, RP = 376;
    if (!sc || !e) {
      add([{ t: 'circle', cx: CX, cy: CY, r: RP, fill: C.disc, stroke: C.ink, sw: C.glass ? 1.2 : 2.4 }]);
      add([{ t: 'text', x: CX, y: CY, s: 'Tarama için konum verisi gerekli', size: 15, weight: 700, fam: 'b', fill: C.ink, opacity: 0.55, anchor: 'middle' }]);
      return { prims: prims, hits: hits, geom: null, W: sheet.W, H: sheet.H, mode: 'bul' };
    }
    const Rs = sc.R;
    const Rd = Math.min(e.data.R, Rs + sc.step * 0.75);
    const s = RP / Rd;
    const T = D.mapT(CX, CY, s);
    const cl = osm.clipped(e.data, Rd);
    add(D.disc(T, Rd, C, 0));
    add(D.green(T, cl, C, 0, { opacity: 0.5 }));
    add(D.water(T, cl, C, 0));
    add(D.roads(T, cl, C, 0, { emph: false, minW: 0.6, opacity: 0.8 }));
    add(D.buildings(T, cl, C, 0, { mode: 'faint', opacity: 0.8 }));
    // ısı hücreleri
    const buckets = [[], [], [], [], []];
    const fail = [];
    const half = sc.step / 2;
    sc.cells.forEach((c) => {
      if (c.score == null) return;
      const ring = [[c.x - half, c.y - half], [c.x + half, c.y - half], [c.x + half, c.y + half], [c.x - half, c.y + half]];
      const d = D.ringD(T, ring, 0);
      if (!c.pass) { fail.push(d); return; }
      const k = Math.max(0, Math.min(4, Math.floor((c.score / 100) * 5 - 1e-9)));
      buckets[k].push(d);
    });
    if (fail.length) add([{ t: 'path', d: fail.join(''), fill: C.glass ? '#B5B8C0' : C.mid, opacity: 0.32 }]);
    buckets.forEach((b, k) => { if (b.length) add([{ t: 'path', d: b.join(''), fill: C.score[k], opacity: 0.78, stroke: C.glass ? 'rgba(255,255,255,.55)' : 'rgba(241,230,203,.6)', sw: 0.8 }]); });
    // aday konumları (merkezde)
    add(D.center(T, C, 0));
    // seçili hücre
    const pick = view.pick && sc.cells.find((c) => c.x === view.pick.x && c.y === view.pick.y);
    if (pick) {
      const q = T.P(pick.x, pick.y);
      add([{ t: 'rect', x: q[0] - half * s, y: q[1] - half * s, w: sc.step * s, h: sc.step * s, stroke: C.ink, sw: C.glass ? 2 : 3 }]);
    }
    // en iyi noktalar
    peaks.forEach((p, i) => {
      const q = T.P(p.x, p.y);
      add([
        { t: 'circle', cx: q[0], cy: q[1], r: 13, fill: C.ink, stroke: C.glass ? '#fff' : C.paper, sw: 2.4 },
        { t: 'text', x: q[0], y: q[1] + 4.6, s: String(i + 1), size: 13, weight: 800, fam: 'b', fill: C.glass ? '#fff' : C.paper, anchor: 'middle', pe: false },
      ]);
      hits.push({ kind: 'peak', i: i, x: q[0], y: q[1], r: 16, cx: p.x, cy: p.y });
    });
    prims.push({ t: 'path', d: D.ringD(T, gis.circlePoly(Rd, 96), 0), stroke: C.ink, sw: C.glass ? 1.4 : 3 });
    add(D.north(86, 92, C, 20));
    add(D.scaleBar(70, tb.y - 28, s, C, 110 / s));
    prims.push({ t: 'text', x: CX + RP, y: CY + RP + 22, s: 'tarama yarıçapı ' + fmt(Rs, 0) + ' m', size: 12, weight: 700, fam: 'b', fill: C.ink, opacity: 0.6, anchor: 'end' });

    // sağ sütun
    const X = 1018, W = 340;
    SS.panelTitle(X, 56, W, 'En iyi noktalar', C).forEach((p) => prims.push(p));
    if (!peaks.length) prims.push({ t: 'text', x: X, y: 86, s: sc.validN ? 'Filtreleri geçen nokta yok' : 'Taranabilir yol ağı yok', size: 12.5, weight: 700, fam: 'b', fill: C.bad });
    peaks.slice(0, 8).forEach((p, i) => {
      const y = 86 + i * 24;
      const dist = Math.hypot(p.x, p.y);
      const brg = (Math.atan2(p.x, p.y) * 180) / Math.PI;
      prims.push({ t: 'circle', cx: X + 9, cy: y - 4.5, r: 9, fill: C.ink });
      prims.push({ t: 'text', x: X + 9, y: y - 0.5, s: String(i + 1), size: 11, weight: 800, fam: 'b', fill: C.glass ? '#fff' : C.paper, anchor: 'middle' });
      prims.push({ t: 'text', x: X + 28, y: y, s: dist < 20 ? 'Merkez' : gis.compass((brg + 360) % 360) + ' · ' + Math.round(dist) + ' m', size: 12.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
      D.bar(X + 170, y - 9, 100, 8, p.score / 100, C).forEach((q) => prims.push(q));
      prims.push({ t: 'text', x: X + W, y: y, s: '%' + p.score, size: 12.5, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
    });
    let y = 86 + Math.max(1, Math.min(8, peaks.length)) * 24 + 12;
    SS.panelTitle(X, y, W, 'Skor ölçeği', C).forEach((p) => prims.push(p));
    legendRamp(X, y + 24, W, C, sc.min, sc.max).forEach((p) => prims.push(p));
    y += 78;
    const tgt = pick || peaks[0];
    SS.panelTitle(X, y, W, pick ? 'Seçili nokta' : 'Birinci nokta', C).forEach((p) => prims.push(p));
    if (tgt && tgt.parts) {
      SS.kv(X, y + 26, W, 'Konum', 'x ' + Math.round(tgt.x) + ' · y ' + Math.round(tgt.y) + ' m', C).forEach((p) => prims.push(p));
      site.PARTS.forEach((p, i) => {
        const yy = y + 50 + i * 20;
        prims.push({ t: 'text', x: X, y: yy, s: p.label, size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
        D.bar(X + 150, yy - 9, 130, 8, tgt.parts[p.id], C).forEach((q) => prims.push(q));
        prims.push({ t: 'text', x: X + W, y: yy, s: String(Math.round(tgt.parts[p.id] * 100)), size: 12, weight: 700, fam: C.glass ? 'b' : 'm', fill: C.ink, anchor: 'end' });
      });
      const m = tgt.m || {};
      const yy = y + 50 + 6 * 20 + 6;
      if (yy < tb.y - 36) {
        SS.kv(X, yy, W, 'Park · durak · günlük', (m.park == null ? '—' : fmt(m.park, 0)) + ' · ' + (m.durak == null ? '—' : fmt(m.durak, 0)) + ' · ' + (m.gunluk == null ? '—' : fmt(m.gunluk, 0)) + ' dk', C).forEach((p) => prims.push(p));
      }
    } else prims.push({ t: 'text', x: X, y: y + 28, s: 'Haritada bir noktaya tıklayın', size: 12, weight: 500, fam: 'b', fill: C.ink, opacity: 0.55 });
    void cand;
    return { prims: prims, hits: hits, geom: { cx: CX, cy: CY, s: s, R: Rd, Rpx: RP, W: sheet.W, H: sheet.H }, W: sheet.W, H: sheet.H, mode: 'bul' };
  };

  YS.scene = function (project, ctx, view, live) { return view.mode === 'bul' ? YS.scan(project, ctx, view, live) : YS.compare(project, ctx, view, live); };
})();
