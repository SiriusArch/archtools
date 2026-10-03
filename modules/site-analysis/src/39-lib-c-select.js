/* ==========================================================================
   39-lib-c-select.js — Yer Seçimi hesapları (Modül 6)
   · Karşılaştır: aday konumların Arsa Analizi sonuçlarını ortak ağırlıklarla sıralar, filtreler, nedenini söyler.
   · Konum bul: tek bir veri kümesi üzerinde ızgara taraması (yaklaşık skor) → ısı haritası + en iyi noktalar.
   Saf mantık: arayüz bilmez.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const site = App.site;
  const U = App.util;
  const sel = (App.select = {});

  /* ---------------- filtre tanımları ---------------- */
  sel.FILTERS = [
    { id: 'park', label: 'Parka yürüme', unit: 'dk', max: 20, step: 1, def: 10, sub: 'en yakın park en çok' },
    { id: 'durak', label: 'Toplu taşıma', unit: 'dk', max: 20, step: 1, def: 10, sub: 'en yakın durak en çok' },
    { id: 'gunluk', label: 'Günlük ihtiyaç', unit: 'dk', max: 20, step: 1, def: 10, sub: 'market / fırın / eczane en çok' },
    { id: 'gurultu', label: 'Gürültü göstergesi', unit: '', max: 2, step: 1, def: 2, sub: 'en çok: 0 sessiz · 1 orta · 2 gürültülü', ord: true },
    { id: 'skor', label: 'Asgari skor', unit: '%', max: 100, step: 5, def: 60, sub: 'ağırlıklı konum skoru en az' },
  ];
  sel.NOISE_ORD = ['sessiz', 'orta', 'gurultulu'];

  sel.defaults = function () {
    return { list: [], w: null, f: { on: {}, v: {} }, sel: null, mode: 'karsilastir', scan: { step: 120, n: 5 } };
  };
  sel.clamp = function (x) {
    const d = sel.defaults();
    if (!x || typeof x !== 'object') return d;
    const list = (Array.isArray(x.list) ? x.list : []).slice(0, 8).map((c, i) => {
      const lat = Number(c.lat), lon = Number(c.lon);
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
      return { id: String(c.id || 'c' + i), name: String(c.name || 'Aday ' + (i + 1)).slice(0, 60), lat: lat, lon: lon, src: String(c.src || 'koordinat'), dx: Number(c.dx) || 0, dy: Number(c.dy) || 0, note: String(c.note || '').slice(0, 140) };
    }).filter(Boolean);
    const w = x.w && typeof x.w === 'object' ? {} : null;
    if (w) site.PARTS.forEach((p) => { w[p.id] = U.clamp(Number(x.w[p.id]), 0, 1); if (!Number.isFinite(w[p.id])) w[p.id] = 0.5; });
    const f = { on: {}, v: {} };
    sel.FILTERS.forEach((fl) => { f.on[fl.id] = !!(x.f && x.f.on && x.f.on[fl.id]); const v = Number(x.f && x.f.v && x.f.v[fl.id]); f.v[fl.id] = Number.isFinite(v) ? U.clamp(v, 0, fl.max) : fl.def; });
    return { list: list, w: w, f: f, sel: list.some((c) => c.id === x.sel) ? x.sel : null, mode: x.mode === 'bul' ? 'bul' : 'karsilastir', scan: { step: U.clamp(Number(x.scan && x.scan.step) || 120, 60, 250), n: U.clamp(Math.round(Number(x.scan && x.scan.n) || 5), 1, 8) } };
  };

  /* aday → veri girdisi */
  sel.entryOf = function (c, set) {
    if (c.src === 'demo') return osm.demo(c.dx, c.dy);
    return osm.cacheGet(c.lat, c.lon, osm.needRadius(set.radius, set.walkMin));
  };
  sel.settingsOf = (s) => ({ radius: s.radius, walkMin: s.walkMin, template: s.template });

  sel.weights = function (cand, templateId) {
    if (cand.w) return cand.w;
    return site.template(templateId).w;
  };
  sel.weightedScore = function (parts, w) {
    let t = 0, ws = 0;
    parts.forEach((p) => { const x = w[p.id] != null ? w[p.id] : 0; t += p.v * x; ws += x; });
    return ws > 0 ? Math.round((t / ws) * 100) : 0;
  };

  /* ---------------- karşılaştırma ---------------- */
  sel.compare = function (cand, set) {
    const w = sel.weights(cand, set.template);
    const rows = cand.list.map((c) => {
      const e = sel.entryOf(c, set);
      const A = e ? site.analyze({ loc: c, radius: set.radius, walkMin: set.walkMin, template: set.template }, e) : null;
      const row = { id: c.id, c: c, e: e, A: A, ready: !!A };
      if (A) {
        row.parts = A.parts.map((p) => ({ id: p.id, label: p.label, v: p.v }));
        row.score = sel.weightedScore(A.parts, w);
        const g = A.cats.find((x) => x.id === 'gunluk');
        row.m = {
          park: A.green.nearPark ? A.green.nearPark.min : null,
          durak: A.transit.nearBus ? Math.min(A.transit.nearBus.min, A.transit.nearRail ? A.transit.nearRail.min : 1e9) : (A.transit.nearRail ? A.transit.nearRail.min : null),
          gunluk: g ? g.nearMin : null,
          gurultu: sel.NOISE_ORD.indexOf(A.noise.cls.id),
        };
      }
      return row;
    });
    // filtreler
    rows.forEach((r) => {
      r.fail = [];
      if (!r.ready) return;
      sel.FILTERS.forEach((fl) => {
        if (!cand.f.on[fl.id]) return;
        const lim = cand.f.v[fl.id];
        if (fl.id === 'skor') { if (r.score < lim) r.fail.push('Skor %' + r.score + ' < %' + lim); return; }
        const v = r.m[fl.id];
        if (fl.id === 'gurultu') { if (v > lim) r.fail.push('Gürültü: ' + sel.NOISE_ORD[v]); return; }
        if (v == null || v > lim) r.fail.push(fl.label + ': ' + (v == null ? 'yok' : U.fmt(v, 1) + ' dk') + ' > ' + lim + ' dk');
      });
      r.pass = r.fail.length === 0;
    });
    const ready = rows.filter((r) => r.ready);
    ready.sort((a, b) => (b.pass - a.pass) || (b.score - a.score));
    ready.forEach((r, i) => { r.rank = i + 1; });
    // neden: ölçüt bazında ortalamadan sapma
    if (ready.length > 1) {
      const mean = {};
      site.PARTS.forEach((p) => { mean[p.id] = ready.reduce((t, r) => t + r.parts.find((x) => x.id === p.id).v, 0) / ready.length; });
      ready.forEach((r) => {
        const dev = r.parts.map((p) => ({ id: p.id, label: p.label, d: (p.v - mean[p.id]) * (w[p.id] != null ? w[p.id] : 0) / (Math.max(0.001, Object.keys(w).reduce((t, k) => t + w[k], 0))) * 6, raw: p.v - mean[p.id] }));
        r.strong = dev.filter((x) => x.raw >= 0.1).sort((a, b) => b.d - a.d).slice(0, 3);
        r.weak = dev.filter((x) => x.raw <= -0.1).sort((a, b) => a.d - b.d).slice(0, 3);
      });
    } else ready.forEach((r) => { r.strong = []; r.weak = []; });
    return { rows: rows, ranked: ready, w: w, best: ready.length && ready[0].pass ? ready[0] : null };
  };

  sel.findings = function (cmp, cand) {
    const it = [];
    const add = (id, level, title, detail, src, actions) => it.push({ id: id, level: level, title: title, detail: detail, src: src || ['OSM', 'S'], actions: actions || [] });
    if (!cand.list.length) { add('bos', 'oneri', 'Aday konum yok', 'Bir adres arayın ya da koordinat girin; en az iki aday karşılaştırmayı anlamlı kılar.', ['S'], []); return it; }
    const miss = cmp.rows.filter((r) => !r.ready);
    if (miss.length) add('veri', 'uyari', miss.length + ' adayın verisi yok', miss.map((r) => r.c.name).join(', ') + ' için harita verisi tarayıcıda bulunamadı (ilk kez ya da önbellek temizlenmiş). “Verileri çek” ile yeniden alın.', ['OSM'], [{ type: 'selFetch', label: 'Verileri çek' }]);
    if (cmp.ranked.length >= 2) {
      const a = cmp.ranked[0], b = cmp.ranked[1];
      const d = a.score - b.score;
      if (a.pass) add('kazanan', 'ok', a.c.name + ' önde (%' + a.score + ')', 'İkinci ' + b.c.name + ' %' + b.score + '. ' + (a.strong.length ? 'Öne çıkan: ' + a.strong.map((x) => x.label.toLowerCase()).join(', ') + '. ' : '') + (d <= 3 ? 'Fark küçük; ağırlıkları değiştirerek sağlamlığı sınayın.' : ''), ['S'], []);
      else add('kazanan-yok', 'uyari', 'Filtreleri geçen aday yok', 'En yüksek skorlu ' + a.c.name + ' (%' + a.score + ') ' + a.fail.join('; ') + '. Eşikleri gevşetin ya da aday ekleyin.', ['S'], [{ type: 'selTab', tab: 'olcut', label: 'Ölçütleri aç' }]);
      if (d <= 3 && a.pass && b.pass) add('yakin', 'oneri', 'Birinci ve ikinci aday çok yakın', 'Aradaki fark %' + d + '. Karar için ağırlıkları ya da filtreleri netleştirin; ölçü dışı ölçütler (maliyet, mülkiyet, imar) belirleyici olabilir.', ['S'], []);
    }
    cmp.ranked.forEach((r) => {
      if (!r.pass) add('fail-' + r.id, 'oneri', r.c.name + ' filtrelerden elendi', r.fail.join('; ') + '.', ['S'], []);
    });
    cmp.ranked.filter((r) => r.A.demo).slice(0, 1).forEach(() => add('demo', 'oneri', 'Demo veri kullanılıyor', 'Demo adaylar sentetik bir kentten üretilir; gerçek yerler için adres arayın.', ['S'], []));
    if (cmp.ranked.length === 1) add('tek', 'oneri', 'Karşılaştırma için ikinci aday ekleyin', 'Tek adayla yalnızca skor görülür; sıralama ve neden analizi en az iki aday ister.', ['S'], []);
    return it;
  };

  /* ---------------- ızgara taraması (konum bul) ---------------- */
  const SCORE_T = [[5, 1], [10, 0.75], [15, 0.45], [20, 0.15]];
  const timeScore = (m) => { if (m == null || !isFinite(m)) return 0; for (let i = 0; i < SCORE_T.length; i++) if (m <= SCORE_T[i][0]) return SCORE_T[i][1]; return 0; };
  const DENS = { gunluk: 4, yeme: 6, egitim: 2, saglik: 2, rekreasyon: 2, kultur: 2, hizmet: 2, alisveris: 4 };

  sel.scanRadius = function (data, walkMin) { return Math.max(150, Math.min(700, Math.floor(data.R - walkMin * 80 * 0.6))); };

  sel.scan = function (entry, set, opts) {
    opts = opts || {};
    const d = entry.data;
    const T = site.template(set.template);
    const step = opts.step || 120;
    const Rs = sel.scanRadius(d, set.walkMin);
    const g = gis.buildGraph(d.roads, (r) => !r.nf && r.cls !== 'motorway' && r.cls !== 'trunk');
    const noiseSrc = (function () {
      const NR = { motorway: [1, 260], trunk: [0.95, 240], primary: [0.85, 200], secondary: [0.65, 150], tertiary: [0.42, 100], residential: [0.14, 35], service: [0.05, 20], living: [0.05, 20] };
      const NL = { rail: [0.75, 230], light_rail: [0.5, 140], subway: [0.1, 40], tram: [0.3, 60], narrow_gauge: [0.4, 100] };
      const out = [];
      d.roads.forEach((r) => { if (r.tn) return; const c = NR[r.cls]; if (c) out.push({ pts: r.pts, w: c[0], dm: c[1] }); });
      d.rails.forEach((r) => { const c = NL[r.kind]; if (c) out.push({ pts: r.pts, w: c[0], dm: c[1] }); });
      return out;
    })();
    const noiseAt = (x, y) => {
      let best = 0;
      noiseSrc.forEach((s) => {
        let near = Infinity;
        for (let k = 1; k < s.pts.length; k++) { const q = gis.nearestOnSeg(x, y, s.pts[k - 1][0], s.pts[k - 1][1], s.pts[k][0], s.pts[k][1]); if (q.d < near) near = q.d; }
        if (near < s.dm) { const v = s.w * Math.pow(1 - near / s.dm, 1.2); if (v > best) best = v; }
      });
      return best;
    };
    // hedeflerin kenar bağlantıları bir kez hesaplanır
    const snapPts = (list, rad) => list.map((p) => { const sn = gis.snap(g, p.x, p.y, 140); return { p: p, sn: sn, r: rad ? rad(p) : 0 }; });
    const poiS = snapPts(d.poi, (p) => (p.park ? p.r || 0 : 0));
    const trS = snapPts(d.transit);
    const walkTo = (dist, o) => {
      if (!o.sn) return Infinity;
      const e = g.edges[o.sn.e];
      let w = Math.min(dist[e.a] + o.sn.t * e.len, dist[e.b] + (1 - o.sn.t) * e.len) + o.sn.d;
      if (dist.src && dist.src.e === o.sn.e) w = Math.min(w, Math.abs(o.sn.t - dist.src.t) * e.len + dist.src.d + o.sn.d);
      return Math.max(0, w - o.r);
    };
    // kesişim düğümleri
    const inter = [];
    g.nodes.forEach((q, i) => { if (new Set(g.adj[i].map((e) => e[0])).size >= 3) inter.push(q); });
    const midE = g.edges.map((e) => [(g.nodes[e.a][0] + g.nodes[e.b][0]) / 2, (g.nodes[e.a][1] + g.nodes[e.b][1]) / 2, e.len]);
    const bs = d.buildings;
    const cells = [];
    const maxWalk = 15 * 80 + 40;
    for (let gy = -Rs; gy <= Rs + 1e-6; gy += step) for (let gx = -Rs; gx <= Rs + 1e-6; gx += step) {
      if (gx * gx + gy * gy > Rs * Rs) continue;
      const sn = gis.snap(g, gx, gy, 120);
      const cell = { x: gx, y: gy, s: step, ok: !!sn };
      if (!sn) { cell.score = null; cells.push(cell); continue; }
      const dist = gis.shortest(g, sn, maxWalk);
      // işlevler
      const near = {};
      osm.CATS.forEach((c) => { near[c.id] = { min: null, c10: 0 }; });
      let parkMin = null, parks = 0;
      poiS.forEach((o) => {
        const w = walkTo(dist, o);
        if (!isFinite(w)) return;
        const m = w / 80, n = near[o.p.cat];
        if (n.min == null || m < n.min) n.min = m;
        if (m <= 10) n.c10++;
        if (o.p.park) { if (parkMin == null || m < parkMin) parkMin = m; if (m <= 10) parks++; }
      });
      let cs = 0, cws = 0, present = 0;
      osm.CATS.forEach((c) => {
        const n = near[c.id], wt = T.cw[c.id] != null ? T.cw[c.id] : 1;
        cs += wt * (0.65 * timeScore(n.min) + 0.35 * Math.min(1, n.c10 / (DENS[c.id] || 3)));
        cws += wt;
        if (n.c10 > 0) present++;
      });
      const vEr = cws ? cs / cws : 0;
      // toplu taşıma
      let nb = null, nr = null, st10 = 0;
      trS.forEach((o) => { const w = walkTo(dist, o); if (!isFinite(w)) return; const m = w / 80; if (o.p.kind === 'otobus') { if (nb == null || m < nb) nb = m; } else if (nr == null || m < nr) nr = m; if (m <= 10) st10++; });
      const vUl = Math.min(1, Math.max(timeScore(nb), 0.85 * timeScore(nr)) * 0.75 + Math.min(1, st10 / 6) * 0.25 + (nr != null && nr <= 15 ? 0.08 : 0));
      // yeşil
      const vYe = Math.min(1, 0.6 * timeScore(parkMin) + 0.4 * Math.min(1, parks / 2));
      // gürültü
      const nv = noiseAt(gx, gy);
      const vSe = Math.max(0, 1 - Math.min(1, nv * 1.15));
      // karışım: yakın yapı kullanımı
      const use = { konut: 0, ticari: 0, kamu: 0, sanayi: 0 };
      for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (Math.abs(b.cx - gx) > 220 || Math.abs(b.cy - gy) > 220) continue; const u = site.useOf(b.kind); if (use[u] != null) use[u] += b.area; }
      const tot = use.konut + use.ticari + use.kamu + use.sanayi;
      const sh = ['konut', 'ticari', 'kamu', 'sanayi'].map((k) => (tot ? use[k] / tot : 0)).filter((x) => x > 0);
      const ent = sh.length > 1 ? -sh.reduce((t, x) => t + x * Math.log(x), 0) / Math.log(4) : 0;
      const vKa = Math.min(1, 0.45 * Math.min(1, ent / 0.6) + 0.55 * (present / osm.CATS.length));
      // bağlantı: 400 m içindeki kesişim ve yol yoğunluğu
      let ni = 0, rl = 0;
      for (let i = 0; i < inter.length; i++) { if (Math.hypot(inter[i][0] - gx, inter[i][1] - gy) <= 400) ni++; }
      for (let i = 0; i < midE.length; i++) { if (Math.hypot(midE[i][0] - gx, midE[i][1] - gy) <= 400) rl += midE[i][2]; }
      const km2 = (Math.PI * 0.4 * 0.4);
      const vBa = Math.min(1, 0.6 * Math.min(1, ni / km2 / 110) + 0.4 * Math.min(1, rl / 1000 / km2 / 14));
      const vals = { erisim: vEr, ulasim: vUl, yesil: vYe, sessizlik: vSe, karisim: vKa, baglanti: vBa };
      const parts = site.PARTS.map((p) => ({ id: p.id, label: p.label, v: vals[p.id] }));
      const w = opts.w || T.w;
      cell.parts = vals;
      cell.score = sel.weightedScore(parts, w);
      cell.m = { park: parkMin, durak: nb != null && nr != null ? Math.min(nb, nr) : nb != null ? nb : nr, gunluk: near.gunluk.min, gurultu: sel.NOISE_ORD.indexOf(site.noiseClass(nv).id) };
      cells.push(cell);
    }
    // filtre
    const cand = { f: opts.f || { on: {}, v: {} } };
    cells.forEach((c) => {
      c.pass = false;
      if (c.score == null) return;
      c.pass = true;
      sel.FILTERS.forEach((fl) => {
        if (!cand.f.on[fl.id]) return;
        const lim = cand.f.v[fl.id];
        if (fl.id === 'skor') { if (c.score < lim) c.pass = false; return; }
        const v = c.m[fl.id];
        if (fl.id === 'gurultu') { if (v > lim) c.pass = false; return; }
        if (v == null || v > lim) c.pass = false;
      });
    });
    const valid = cells.filter((c) => c.score != null);
    const sc = valid.map((c) => c.score);
    const mn = sc.length ? Math.min.apply(null, sc) : 0, mx = sc.length ? Math.max.apply(null, sc) : 0;
    // en iyi noktalar: yerel baskılama (en az 1,6 adım uzaklık)
    const peaks = [];
    valid.filter((c) => c.pass).sort((a, b) => b.score - a.score).forEach((c) => {
      if (peaks.length >= (opts.n || 5)) return;
      if (peaks.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= step * 1.6)) peaks.push(c);
    });
    return { cells: cells, peaks: peaks, min: mn, max: mx, R: Rs, step: step, passN: valid.filter((c) => c.pass).length, validN: valid.length, g: g, lat0: d.lat0, lon0: d.lon0, proj: gis.makeProj(d.lat0, d.lon0), t: Date.now() };
  };
})();
