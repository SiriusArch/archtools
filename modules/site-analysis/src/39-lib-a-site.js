/* ==========================================================================
   39-lib-a-site.js — Arsa Analizi hesapları (Modül 4)
   Girdi: site ayarları (konum, yarıçap, şablon) + coğrafi veri girdisi (App.osm önbelleği).
   Çıktı: 15 dakikalık yürüme erişimi, işlev kategorileri, toplu taşıma, yeşil, gürültü göstergesi,
          yapı formu, ulaşım ağı, arazi, güneş ve şablona göre ağırlıklı konum skoru + bulgular.
   Saf mantık: arayüz bilmez. Sahne çizimi 39-lib-sitescene.js içindedir.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const U = App.util;
  const site = (App.site = {});

  /* ---------------- şablonlar (Aino: "template-based analysis") ---------------- */
  const EQ = { gunluk: 1, yeme: 1, egitim: 1, saglik: 1, rekreasyon: 1, kultur: 1, hizmet: 1, alisveris: 1 };
  site.TEMPLATES = [
    { id: 'konut', label: 'Konut', desc: 'Günlük ihtiyaç, eğitim, park ve sessizlik öncelikli.', w: { erisim: 0.3, ulasim: 0.15, yesil: 0.2, sessizlik: 0.2, karisim: 0.05, baglanti: 0.1 }, cw: { gunluk: 3, egitim: 2, saglik: 2, rekreasyon: 2.5, yeme: 1, kultur: 1, hizmet: 1, alisveris: 1 }, layers: ['yesil', 'yapi', 'ulasim', 'erisim', 'islev'], arch: 'konut' },
    { id: 'karma', label: 'Karma kullanım', desc: 'İşlev çeşitliliği, toplu taşıma ve canlı cadde.', w: { erisim: 0.25, ulasim: 0.2, yesil: 0.1, sessizlik: 0.1, karisim: 0.25, baglanti: 0.1 }, cw: EQ, layers: ['yapi', 'ulasim', 'erisim', 'islev'], arch: 'konut' },
    { id: 'ticari', label: 'Ticari / perakende', desc: 'Yaya erişimi, toplu taşıma ve çevredeki işlev yoğunluğu.', w: { erisim: 0.15, ulasim: 0.3, yesil: 0.05, sessizlik: 0.0, karisim: 0.2, baglanti: 0.3 }, cw: { gunluk: 1.5, yeme: 2.5, egitim: 0.5, saglik: 0.5, rekreasyon: 0.5, kultur: 1.5, hizmet: 1.5, alisveris: 3 }, layers: ['yapi', 'ulasim', 'erisim', 'islev'], arch: 'ticaret' },
    { id: 'kamu', label: 'Kamu / eğitim', desc: 'Ulaşılabilirlik, güvenli çevre ve kamusal hizmetlere yakınlık.', w: { erisim: 0.2, ulasim: 0.3, yesil: 0.1, sessizlik: 0.15, karisim: 0.05, baglanti: 0.2 }, cw: { gunluk: 1.5, yeme: 0.5, egitim: 2, saglik: 2, rekreasyon: 1.5, kultur: 1, hizmet: 2, alisveris: 0.5 }, layers: ['yesil', 'yapi', 'ulasim', 'erisim', 'gurultu'], arch: 'egitim' },
    { id: 'altyapi', label: 'Altyapı / ulaşım', desc: 'Ağ bağlantısı, ulaşım hiyerarşisi ve çevre baskısı.', w: { erisim: 0.1, ulasim: 0.35, yesil: 0.05, sessizlik: 0.05, karisim: 0.05, baglanti: 0.4 }, cw: EQ, layers: ['yapi', 'ulasim', 'gurultu', 'erisim'], arch: 'genel' },
    { id: 'serbest', label: 'Serbest (dengeli)', desc: 'Tüm ölçütler eşit ağırlıkta.', w: { erisim: 1 / 6, ulasim: 1 / 6, yesil: 1 / 6, sessizlik: 1 / 6, karisim: 1 / 6, baglanti: 1 / 6 }, cw: EQ, layers: ['yesil', 'yapi', 'ulasim', 'erisim', 'islev'], arch: 'genel' },
  ];
  site.template = (id) => site.TEMPLATES.find((t) => t.id === id) || site.TEMPLATES[0];

  site.PARTS = [
    { id: 'erisim', label: '15 dk erişim', sub: 'Günlük ihtiyaç, eğitim, sağlık, park ve hizmetlere yürüme süresi' },
    { id: 'ulasim', label: 'Toplu taşıma', sub: 'En yakın durak ve 10 dk içindeki durak sayısı' },
    { id: 'yesil', label: 'Yeşil alan', sub: 'En yakın parka yürüme ve çevredeki yeşil oranı' },
    { id: 'sessizlik', label: 'Sessizlik', sub: 'Yol ve ray yakınlığına dayalı gürültü göstergesi (ölçüm değil)' },
    { id: 'karisim', label: 'İşlev karışımı', sub: 'Yapı kullanımı ve işlev kategorisi çeşitliliği' },
    { id: 'baglanti', label: 'Ağ bağlantısı', sub: 'Kesişim yoğunluğu ve yol ağı sıklığı' },
  ];

  /* katmanlar (harita: üst üste · izometrik: ayrı levhalar). Zemin ("baglam") her zaman vardır. */
  site.LAYERS = [
    { id: 'topo', name: 'Topografya', sub: 'Yükselti renkleri ve eş yükselti eğrileri' },
    { id: 'yapi', name: 'Yapı formu', sub: 'Bina kütleleri, yüksekliğe göre ton' },
    { id: 'yesil', name: 'Yeşil ve su', sub: 'Parklar, bahçeler, dere ve deniz' },
    { id: 'ulasim', name: 'Ulaşım', sub: 'Yol hiyerarşisi ve toplu taşıma durakları' },
    { id: 'erisim', name: 'Yaya erişimi', sub: '5 · 10 · 15 dakikalık yürüme izokronları' },
    { id: 'islev', name: 'İşlevler', sub: 'Günlük ihtiyaç, eğitim, sağlık, yeme-içme…' },
    { id: 'gurultu', name: 'Gürültü', sub: 'Yol ve ray yakınlığına göre gösterge' },
    { id: 'gunes', name: 'Güneş ve gölge', sub: 'Seçilen gün ve saatte bina gölgeleri' },
  ];

  /* ---------------- varsayılanlar ---------------- */
  site.defaults = function () {
    return {
      loc: osm.demoLoc(0, 0),
      radius: 500, walkMin: 10, template: 'konut',
      parcel: null, imar: App.zoning ? App.zoning.defaults() : null,
    };
  };
  site.fetchRadius = (s) => osm.needRadius(s.radius, s.walkMin);

  site.entry = function (s) {
    if (!s || !s.loc) return null;
    if (s.loc.src === 'demo') return osm.demo(s.loc.dx, s.loc.dy);
    return osm.cacheGet(s.loc.lat, s.loc.lon, site.fetchRadius(s));
  };

  /* ---------------- gürültü göstergesi ---------------- */
  const NOISE_ROAD = { motorway: [1, 260], trunk: [0.95, 240], primary: [0.85, 200], secondary: [0.65, 150], tertiary: [0.42, 100], residential: [0.14, 35], service: [0.05, 20], living: [0.05, 20] };
  const NOISE_RAIL = { rail: [0.75, 230], light_rail: [0.5, 140], subway: [0.1, 40], tram: [0.3, 60], narrow_gauge: [0.4, 100] };
  site.NOISE_CLASS = [
    { id: 'sessiz', label: 'Sessiz', max: 0.18 },
    { id: 'orta', label: 'Orta', max: 0.45 },
    { id: 'gurultulu', label: 'Gürültülü', max: 9 },
  ];
  site.noiseClass = (v) => (v < 0.18 ? site.NOISE_CLASS[0] : v < 0.45 ? site.NOISE_CLASS[1] : site.NOISE_CLASS[2]);

  function noiseSources(d) {
    const out = [];
    d.roads.forEach((r) => { if (r.tn) return; const c = NOISE_ROAD[r.cls]; if (c) out.push({ pts: r.pts, w: c[0], dm: c[1], name: r.name, cls: r.cls }); });
    d.rails.forEach((r) => { const c = NOISE_RAIL[r.kind]; if (c) out.push({ pts: r.pts, w: c[0], dm: c[1], name: 'Demiryolu', cls: 'rail' }); });
    return out;
  }
  function noiseAt(src, x, y) {
    let best = 0, who = null, dd = Infinity;
    for (let i = 0; i < src.length; i++) {
      const s = src[i], p = s.pts;
      // kaba eleme: sınır kutusu
      let near = Infinity;
      for (let k = 1; k < p.length; k++) {
        const q = gis.nearestOnSeg(x, y, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]);
        if (q.d < near) near = q.d;
      }
      if (near >= s.dm) continue;
      const v = s.w * Math.pow(1 - near / s.dm, 1.2);
      if (v > best) { best = v; who = s; dd = near; }
    }
    return { v: best, src: who, d: dd };
  }
  site.noiseAt = (A, x, y) => noiseAt(A.noiseSrc, x, y);

  /* ---------------- topografya ---------------- */
  function topo(entry, R) {
    const e = entry.elev;
    if (!e) return null;
    const n = e.n, Re = e.R;
    const at = (x, y) => {
      const fx = U.clamp(((x + Re) / (2 * Re)) * (n - 1), 0, n - 1), fy = U.clamp(((y + Re) / (2 * Re)) * (n - 1), 0, n - 1);
      const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
      const z00 = e.z[j * n + i], z10 = e.z[j * n + i + 1], z01 = e.z[(j + 1) * n + i], z11 = e.z[(j + 1) * n + i + 1];
      return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
    };
    const M = 40;
    const z = [];
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -R + (2 * R * i) / (M - 1), y = -R + (2 * R * j) / (M - 1);
      const v = at(x, y);
      z.push(v);
      if (x * x + y * y <= R * R) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    // düzlem uydur: z ≈ a + gx·x + gy·y
    let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, cnt = 0;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -R + (2 * R * i) / (M - 1), y = -R + (2 * R * j) / (M - 1);
      if (x * x + y * y > R * R) continue;
      const v = z[j * M + i];
      sx += x; sy += y; sz += v; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * v; syz += y * v; cnt++;
    }
    let gx = 0, gy = 0;
    if (cnt > 10) {
      const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, cnt]], b = [sxz, syz, sz];
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(A);
      if (Math.abs(D) > 1e-9) {
        const rep = (col) => A.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)));
        gx = det(rep(0)) / D; gy = det(rep(1)) / D;
      }
    }
    const slope = Math.hypot(gx, gy) * 100;
    const aspect = slope > 0.3 ? (((Math.atan2(-gx, -gy) * 180) / Math.PI) + 360) % 360 : null; // yokuş aşağı yön (kuzeyden saat yönü)
    const range = mx - mn;
    const nice = [0.5, 1, 2, 5, 10, 20, 25, 50];
    const want = range / 6;
    const step = nice.find((v) => v >= want) || 50;
    return { M: M, R: R, z: z, min: mn, max: mx, range: range, slope: slope, aspect: aspect, step: step, demo: !!entry.demo, at: at };
  }

  // marching squares: seviye başına doğru parçaları [[x1,y1,x2,y2]]
  site.contours = function (T, step) {
    const M = T.M, R = T.R, out = [];
    const px = (i) => -R + (2 * R * i) / (M - 1);
    const lo = Math.ceil(T.min / step) * step, hi = T.max;
    for (let lv = lo; lv <= hi + 1e-6; lv += step) {
      const segs = [];
      for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
        const v = [T.z[j * M + i], T.z[j * M + i + 1], T.z[(j + 1) * M + i + 1], T.z[(j + 1) * M + i]];
        const c = (v[0] >= lv ? 1 : 0) | (v[1] >= lv ? 2 : 0) | (v[2] >= lv ? 4 : 0) | (v[3] >= lv ? 8 : 0);
        if (c === 0 || c === 15) continue;
        const X0 = px(i), X1 = px(i + 1), Y0 = px(j), Y1 = px(j + 1);
        const lerp = (a, b, va, vb) => a + ((b - a) * (lv - va)) / (vb - va || 1e-9);
        const e = [
          [lerp(X0, X1, v[0], v[1]), Y0], // alt
          [X1, lerp(Y0, Y1, v[1], v[2])], // sağ
          [lerp(X0, X1, v[3], v[2]), Y1], // üst
          [X0, lerp(Y0, Y1, v[0], v[3])], // sol
        ];
        const T2 = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] };
        (T2[c] || []).forEach((pr) => segs.push([e[pr[0]][0], e[pr[0]][1], e[pr[1]][0], e[pr[1]][1]]));
      }
      if (segs.length) out.push({ level: lv, segs: segs });
    }
    return out;
  };

  /* ---------------- güneş özeti ---------------- */
  function sunInfo(lat) {
    return gis.SUN_DAYS.map((d) => {
      const len = gis.dayLength(lat, d.doy);
      const noon = gis.sunPos(lat, d.doy, 12);
      return { id: d.id, label: d.label, doy: d.doy, len: len, rise: 12 - len / 2, set: 12 + len / 2, noonAlt: noon.alt };
    });
  }

  /* ---------------- bina sınıfları ---------------- */
  const B_RES = { apartments: 1, residential: 1, house: 1, detached: 1, terrace: 1, semidetached_house: 1, dormitory: 1, bungalow: 1, yes: 0.5 };
  const B_COM = { commercial: 1, retail: 1, office: 1, supermarket: 1, hotel: 1, kiosk: 1, mixed: 1 };
  const B_CIV = { school: 1, kindergarten: 1, hospital: 1, church: 1, mosque: 1, mosque_small: 1, public: 1, civic: 1, government: 1, university: 1, college: 1, chapel: 1, temple: 1, synagogue: 1, fire_station: 1, train_station: 1 };
  const B_IND = { industrial: 1, warehouse: 1, factory: 1, manufacture: 1 };
  site.useOf = (k) => (B_CIV[k] ? 'kamu' : B_COM[k] ? 'ticari' : B_IND[k] ? 'sanayi' : B_RES[k] ? 'konut' : 'diger');

  const SCORE_T = [[5, 1], [10, 0.75], [15, 0.45], [20, 0.15]];
  const timeScore = (m) => { if (m == null || !isFinite(m)) return 0; for (let i = 0; i < SCORE_T.length; i++) if (m <= SCORE_T[i][0]) return SCORE_T[i][1]; return 0; };
  const DENS_TARGET = { gunluk: 4, yeme: 6, egitim: 2, saglik: 2, rekreasyon: 2, kultur: 2, hizmet: 2, alisveris: 4 };
  const TRANSIT_LABEL = { otobus: 'Otobüs durağı', tramvay: 'Tramvay durağı', metro: 'Metro', tren: 'Tren istasyonu', vapur: 'İskele' };
  site.TRANSIT_LABEL = TRANSIT_LABEL;

  /* ---------------- ana hesap ---------------- */
  const memo = new WeakMap();
  site.analyze = function (s, entry) {
    if (!entry) return null;
    const key = [s.radius, s.walkMin, s.template].join('|');
    const m = memo.get(entry);
    if (m && m.k === key) return m.v;
    const v = compute(s, entry);
    memo.set(entry, { k: key, v: v });
    return v;
  };

  function compute(s, entry) {
    const d = entry.data;
    const R = Math.min(s.radius, d.R);
    const T = site.template(s.template);
    const cl = osm.clipped(d, R);
    const area = Math.PI * R * R;
    const A = { R: R, entry: entry, demo: !!entry.demo, template: T, clip: cl };

    /* --- yürüme ağı --- */
    const g = gis.buildGraph(d.roads, (r) => !r.nf && r.cls !== 'motorway' && r.cls !== 'trunk');
    const snap = gis.snap(g, 0, 0, 250);
    const maxWalk = 15 * 80 + 40;
    const dist = snap ? gis.shortest(g, snap, maxWalk) : null;
    A.graph = g; A.snap = snap; A.dist = dist;
    const walkM = (x, y, rad) => {
      let w = dist ? gis.reach(g, dist, x, y, 140) : Infinity;
      if (!isFinite(w)) { const st = Math.hypot(x, y); if (st < 90) w = st * 1.3; }
      if (isFinite(w) && rad) w = Math.max(0, w - rad);
      return w;
    };

    /* --- izokronlar --- */
    const clipSegs = (segs) => {
      const out = [];
      segs.forEach((q) => {
        const in1 = q[0] * q[0] + q[1] * q[1] <= R * R, in2 = q[2] * q[2] + q[3] * q[3] <= R * R;
        if (in1 && in2) out.push(q);
        else gis.clipLineToCircle([[q[0], q[1]], [q[2], q[3]]], R).forEach((p) => out.push([p[0][0], p[0][1], p[1][0], p[1][1]]));
      });
      return out;
    };
    A.iso = [5, 10, 15].map((min) => {
      if (!dist) return { min: min, D: min * 80, segs: [], km: 0, ha: 0, clipped: false };
      const raw = gis.bandSegments(g, dist, min * 80);
      let km = 0;
      raw.forEach((q) => { km += Math.hypot(q[2] - q[0], q[3] - q[1]); });
      const segs = clipSegs(raw);
      return { min: min, D: min * 80, segs: segs, km: km / 1000, ha: gis.bufferArea(raw, 40, Math.min(d.R, 1250)) / 1e4, clipped: min * 80 * 0.92 > R };
    });

    /* --- işlevler --- */
    const pois = [];
    d.poi.forEach((p) => {
      if (Math.hypot(p.x, p.y) > Math.min(d.R, 1250)) return;
      const w = walkM(p.x, p.y, p.park ? p.r : 0);
      pois.push(Object.assign({}, p, { m: w, min: isFinite(w) ? w / 80 : null, inR: p.x * p.x + p.y * p.y <= R * R }));
    });
    pois.sort((a, b) => (a.min == null ? 1e9 : a.min) - (b.min == null ? 1e9 : b.min));
    A.pois = pois;
    A.cats = osm.CATS.map((c) => {
      const list = pois.filter((p) => p.cat === c.id && p.min != null);
      const c5 = list.filter((p) => p.min <= 5).length, c10 = list.filter((p) => p.min <= 10).length, c15 = list.filter((p) => p.min <= 15).length;
      const near = list[0] || null;
      const dens = Math.min(1, c10 / (DENS_TARGET[c.id] || 3));
      return { id: c.id, label: c.label, short: c.short, color: c.color, c5: c5, c10: c10, c15: c15, total: pois.filter((p) => p.cat === c.id && p.inR).length, nearest: near, nearMin: near ? near.min : null, score: 0.65 * timeScore(near && near.min) + 0.35 * dens };
    });
    const cw = T.cw;
    let cws = 0, cs = 0;
    A.cats.forEach((c) => { const w = cw[c.id] != null ? cw[c.id] : 1; cs += w * c.score; cws += w; });
    const vErisim = cws ? cs / cws : 0;

    /* --- toplu taşıma --- */
    const stops = d.transit.filter((t) => Math.hypot(t.x, t.y) <= Math.min(d.R, 1250)).map((t) => { const w = walkM(t.x, t.y, 0); return Object.assign({}, t, { m: w, min: isFinite(w) ? w / 80 : null }); }).filter((t) => t.min != null);
    stops.sort((a, b) => a.min - b.min);
    const nearBus = stops.find((t) => t.kind === 'otobus') || null;
    const nearRail = stops.find((t) => t.kind !== 'otobus') || null;
    const st10 = stops.filter((t) => t.min <= 10).length;
    const vUlasim = Math.min(1, Math.max(timeScore(nearBus && nearBus.min), 0.85 * timeScore(nearRail && nearRail.min)) * 0.75 + Math.min(1, st10 / 6) * 0.25 + (nearRail && nearRail.min <= 15 ? 0.08 : 0));
    A.transit = { stops: stops, nearBus: nearBus, nearRail: nearRail, in5: stops.filter((t) => t.min <= 5).length, in10: st10, byKind: {} };
    stops.forEach((t) => { A.transit.byKind[t.kind] = (A.transit.byKind[t.kind] || 0) + 1; });

    /* --- yeşil --- */
    let greenArea = 0, pubArea = 0;
    cl.green.forEach((q) => { const a = Math.abs(gis.area(q.pts)); greenArea += a; if (q.pub) pubArea += a; });
    const parks = pois.filter((p) => p.park && p.min != null);
    const nearPark = parks[0] || null;
    const greenShare = Math.min(1, greenArea / area);
    const vYesil = Math.min(1, 0.6 * timeScore(nearPark && nearPark.min) + 0.4 * Math.min(1, greenShare / 0.12));
    A.green = { area: greenArea, pubArea: pubArea, share: greenShare, nearPark: nearPark, parkCount: parks.length };

    /* --- gürültü --- */
    A.noiseSrc = noiseSources(d);
    const nc = noiseAt(A.noiseSrc, 0, 0);
    A.noise = { v: nc.v, cls: site.noiseClass(nc.v), src: nc.src, d: nc.d };
    const vSes = Math.max(0, 1 - Math.min(1, nc.v * 1.15));
    {
      // ısı hücreleri: büyük yollar ve ray için ızgara
      const N = 44, cs2 = (2 * R) / N, cells = [];
      const major = A.noiseSrc.filter((q) => q.w >= 0.3);
      const grid = new Float32Array(N * N);
      major.forEach((q) => {
        for (let k = 1; k < q.pts.length; k++) {
          const a = q.pts[k - 1], b = q.pts[k];
          const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - q.dm + R) / cs2)), x1 = Math.min(N - 1, Math.floor((Math.max(a[0], b[0]) + q.dm + R) / cs2));
          const y0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - q.dm + R) / cs2)), y1 = Math.min(N - 1, Math.floor((Math.max(a[1], b[1]) + q.dm + R) / cs2));
          for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
            const cx = -R + (ix + 0.5) * cs2, cy = -R + (iy + 0.5) * cs2;
            const dd = gis.nearestOnSeg(cx, cy, a[0], a[1], b[0], b[1]).d;
            if (dd >= q.dm) continue;
            const v = q.w * Math.pow(1 - dd / q.dm, 1.2);
            if (v > grid[iy * N + ix]) grid[iy * N + ix] = v;
          }
        }
      });
      for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
        const cx = -R + (ix + 0.5) * cs2, cy = -R + (iy + 0.5) * cs2;
        if (cx * cx + cy * cy > R * R) continue;
        cells.push({ x: cx - cs2 / 2, y: cy - cs2 / 2, s: cs2, v: grid[iy * N + ix], c: site.noiseClass(grid[iy * N + ix]).id });
      }
      A.noiseCells = cells;
    }

    /* --- yapı formu --- */
    const bs = cl.buildings;
    let fp = 0, known = 0, flo = 0, sumLv = 0, nLv = 0, maxH = 0, maxB = null;
    const use = { konut: 0, ticari: 0, kamu: 0, sanayi: 0, diger: 0 };
    const hist = [0, 0, 0, 0, 0];
    bs.forEach((b) => {
      fp += b.area;
      const h = osm.heightOf(b);
      const lvEst = h / 3.1;
      flo += b.area * lvEst;
      if (b.h || b.lv) { known++; sumLv += b.lv || h / 3.1; nLv++; }
      if (h > maxH) { maxH = h; maxB = b; }
      use[site.useOf(b.kind)] += b.area;
      hist[h <= 4 ? 0 : h <= 10 ? 1 : h <= 16 ? 2 : h <= 30 ? 3 : 4]++;
    });
    A.built = { count: bs.length, footprint: fp, coverage: fp / area, far: flo / area, levelKnown: bs.length ? known / bs.length : 0, avgLevels: nLv ? sumLv / nLv : null, maxH: maxH, maxB: maxB, hist: hist, use: use, floorArea: flo };
    const useTot = Object.keys(use).reduce((t, k) => t + use[k], 0) || 1;
    const sh = ['konut', 'ticari', 'kamu', 'sanayi'].map((k) => use[k] / useTot).filter((x) => x > 0);
    const ent = sh.length > 1 ? -sh.reduce((t, x) => t + x * Math.log(x), 0) / Math.log(4) : 0;
    const catsPresent = A.cats.filter((c) => c.c10 > 0).length / A.cats.length;
    const vKar = Math.min(1, 0.45 * Math.min(1, ent / 0.6) + 0.55 * catsPresent);

    /* --- ulaşım ağı --- */
    let roadLen = 0;
    const byCls = {};
    cl.roads.forEach((r) => { let l = 0; for (let k = 1; k < r.pts.length; k++) l += Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]); roadLen += l; byCls[r.cls] = (byCls[r.cls] || 0) + l; });
    let inter = 0, dead = 0;
    g.nodes.forEach((q, i) => { if (q[0] * q[0] + q[1] * q[1] > R * R) return; const dg = new Set(g.adj[i].map((e) => e[0])).size; if (dg >= 3) inter++; else if (dg === 1) dead++; });
    const km2 = area / 1e6;
    const pedCls = ['pedestrian', 'footway', 'path', 'living', 'cycleway', 'steps'];
    const pedLen = pedCls.reduce((t, k) => t + (byCls[k] || 0), 0);
    A.mob = { roadKm: roadLen / 1000, density: roadLen / 1000 / km2, inter: inter, interDensity: inter / km2, dead: dead, byCls: byCls, pedShare: roadLen ? pedLen / roadLen : 0 };
    const vBag = Math.min(1, 0.6 * Math.min(1, A.mob.interDensity / 110) + 0.4 * Math.min(1, A.mob.density / 14));

    /* --- topografya, güneş, iklim --- */
    A.topo = topo(entry, R);
    A.sun = sunInfo(d.lat0);
    A.climate = entry.climate;

    /* --- skor --- */
    const vals = { erisim: vErisim, ulasim: vUlasim, yesil: vYesil, sessizlik: vSes, karisim: vKar, baglanti: vBag };
    A.parts = site.PARTS.map((p) => ({ id: p.id, label: p.label, sub: p.sub, v: vals[p.id], w: T.w[p.id] }));
    const wsum = A.parts.reduce((t, p) => t + p.w, 0) || 1;
    A.score = Math.round((A.parts.reduce((t, p) => t + p.v * p.w, 0) / wsum) * 100);

    A.items = findings(s, A);
    const LEVEL = { hata: 0, uyari: 1, oneri: 2, ok: 3 };
    A.items.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
    A.counts = { hata: 0, uyari: 0, oneri: 0 };
    A.items.forEach((i) => { if (A.counts[i.level] != null) A.counts[i.level]++; });
    return A;
  }

  /* ---------------- bulgular ---------------- */
  const fm = (m) => (m == null || !isFinite(m) ? '—' : U.fmt(m, m < 10 ? 1 : 0) + ' dk');
  function findings(s, A) {
    const it = [];
    const add = (id, level, title, detail, src, actions) => it.push({ id: id, level: level, title: title, detail: detail, src: src || ['OSM', 'S'], actions: actions || [] });
    if (A.demo) add('demo', 'oneri', 'Demo veri kullanılıyor', 'Gösterilen bölge sentetiktir ve gerçek bir yeri temsil etmez. Gerçek veriyle çalışmak için bir adres arayın ya da koordinat girin.', ['S'], []);
    if (!A.snap) add('graf', 'uyari', 'Yürüme ağı kurulamadı', 'Çalışma noktasının 250 m çevresinde yürünebilir yol verisi bulunamadı; süre hesapları devre dışı. Noktayı bir sokağa yaklaştırın ya da OpenStreetMap’te yol eksik olabilir.', ['OSM'], []);
    const gun = A.cats.find((c) => c.id === 'gunluk');
    if (A.snap) {
      if (gun.nearMin == null || gun.nearMin > 10) add('gunluk', 'uyari', 'Günlük ihtiyaçlar uzak: en yakın ' + (gun.nearest ? gun.nearest.kind.toLowerCase() + ' ' + fm(gun.nearMin) : 'nokta bulunamadı'), '15 dakikalık kent yaklaşımında market, fırın ve eczane 10 dakikada erişilebilir olmalı. Konut programı için bu bir dezavantajdır.', ['15dk', 'OSM'], [{ type: 'siteLayer', id: 'islev', label: 'İşlevleri göster' }]);
      else if (gun.nearMin <= 5) add('gunluk-ok', 'ok', 'Günlük ihtiyaçlar 5 dakika içinde', gun.nearest.kind + ' ' + fm(gun.nearMin) + ' · 10 dk içinde ' + gun.c10 + ' nokta.', ['15dk', 'OSM'], []);
      const par = A.green.nearPark;
      if (!par || par.min > 15) add('park', 'uyari', 'Park çok uzak' + (par ? ' (' + fm(par.min) + ')' : ' ya da bulunamadı'), 'Kullanıcıların günlük yeşil alana erişimi için 10 dakikalık yürüme mesafesi hedeflenir. Açık alan ya da avlu önerisini programa taşıyın.', ['15dk', 'OSM'], [{ type: 'siteLayer', id: 'yesil', label: 'Yeşili göster' }]);
      else if (par.min > 10) add('park', 'oneri', 'En yakın park ' + fm(par.min), '10 dakikalık eşiğin biraz üstünde; parsel içinde yeşil alan kazanmak değerlidir.', ['15dk', 'OSM'], []);
      else add('park-ok', 'ok', 'Park ' + fm(par.min) + ' uzaklıkta', (par.name || par.kind) + ' · çevredeki yeşil oranı %' + Math.round(A.green.share * 100) + '.', ['OSM'], []);
      const nb = A.transit.nearBus;
      if (!nb || nb.min > 10) add('durak', 'uyari', 'Toplu taşıma zayıf' + (nb ? ': en yakın otobüs durağı ' + fm(nb.min) : ': yakında durak bulunamadı'), 'Araç sahibi olmayan kullanıcılar için ulaşım güçlük yaratır; otopark ve servis kararlarını buna göre düşünün.', ['15dk', 'OSM'], [{ type: 'siteLayer', id: 'ulasim', label: 'Ulaşımı göster' }]);
      else if (!A.transit.nearRail) add('raylı', 'oneri', 'Raylı sistem 15 dakika içinde yok', 'Otobüs erişimi var (' + fm(nb.min) + ') ancak raylı sistem ya da iskele yürüme mesafesinde değil.', ['OSM'], []);
      else add('durak-ok', 'ok', 'Toplu taşıma erişilebilir', 'Otobüs ' + fm(nb.min) + (A.transit.nearRail ? ' · ' + TRANSIT_LABEL[A.transit.nearRail.kind] + ' ' + fm(A.transit.nearRail.min) : '') + '.', ['OSM'], []);
    }
    if (A.noise.v >= 0.45) add('gurultu', 'uyari', 'Gürültü kaynağına yakın: ' + (A.noise.src && A.noise.src.name ? A.noise.src.name : A.noise.src && A.noise.src.cls === 'rail' ? 'demiryolu' : 'ana yol') + ' (~' + Math.round(A.noise.d) + ' m)', 'Yol ve ray yakınlığına dayalı gösterge yüksek. Yaşama mekânlarını yoldan uzağa, servis ve merdiveni yola bakacak yerleştirin; ölçüm yerine geçmez.', ['S'], [{ type: 'siteLayer', id: 'gurultu', label: 'Gürültüyü göster' }]);
    else if (A.noise.v >= 0.18) add('gurultu', 'oneri', 'Orta düzey gürültü göstergesi', 'Çevredeki yol hiyerarşisi orta düzey bir baskı oluşturuyor; yatak odalarını sessiz cepheye alın.', ['S'], []);
    else add('gurultu-ok', 'ok', 'Gürültü göstergesi düşük', 'Yakında ana yol ya da ray hattı görünmüyor.', ['S'], []);
    if (A.mob.interDensity < 60) add('baglanti', 'oneri', 'Ağ bağlantısı düşük (' + Math.round(A.mob.interDensity) + ' kesişim/km²)', 'Seyrek kesişim yürüme mesafelerini uzatır; parsel içinden yaya geçişi açmak değerlendirilebilir.', ['S'], []);
    if (A.cats.filter((c) => c.c10 === 0).length >= 4) add('karisim', 'oneri', 'İşlev çeşitliliği düşük', '10 dakikalık yürüme içinde ' + A.cats.filter((c) => c.c10 === 0).map((c) => c.short.toLowerCase()).join(', ') + ' hizmeti yok.', ['OSM'], []);
    if (A.built.count && A.built.levelKnown < 0.3) add('kat-bilgisi', 'oneri', 'Bina yükseklikleri çoğunlukla tahmini', 'OpenStreetMap’te binaların yalnızca %' + Math.round(A.built.levelKnown * 100) + '’inde kat ya da yükseklik bilgisi var; gölge ve yoğunluk (KAKS) değerleri bu yüzden yaklaşıktır.', ['OSM'], []);
    if (A.topo && A.topo.slope >= 8) add('egim', 'oneri', 'Arazi eğimli (%' + Math.round(A.topo.slope) + ')', 'Yamaç ' + (A.topo.aspect != null ? gis.compass(A.topo.aspect) + ' yönüne bakıyor. ' : '') + 'Kot farkını kütle ve bodrum kararlarında kullanın.', ['Open-Meteo'], [{ type: 'siteLayer', id: 'topo', label: 'Topografyayı göster' }]);
    const win = A.sun.find((x) => x.id === 'kis');
    if (win) add('gunes', 'oneri', 'Kış güneşi öğlen ' + Math.round(win.noonAlt) + '° yükseklikte', 'Gün uzunluğu 21 Aralık’ta ' + U.fmt(win.len, 1) + ' saat. Güney cephesini yaşama mekânlarına ayırmak ve kuzey komşu gölgesini kontrol etmek için “Güneş ve gölge” katmanını kullanın.', ['S'], [{ type: 'siteLayer', id: 'gunes', label: 'Gölgeyi göster' }]);
    if (!it.some((x) => x.level === 'hata' || x.level === 'uyari')) it.unshift({ id: 'ok', level: 'ok', title: 'Kritik bir olumsuzluk görünmüyor', detail: 'Konum skoru %' + A.score + '.', src: ['S'], actions: [] });
    return it;
  }

  /* Modül 6 için özet: ham veriyi saklamadan skorlanabilir sonuç */
  site.summary = function (A) {
    const catScores = {};
    A.cats.forEach((c) => { catScores[c.id] = Math.round(c.score * 100) / 100; });
    return {
      t: Date.now(), score: A.score,
      parts: A.parts.reduce((o, p) => { o[p.id] = Math.round(p.v * 1000) / 1000; return o; }, {}),
      cats: catScores,
      nearMin: A.cats.reduce((o, c) => { o[c.id] = c.nearMin == null ? null : Math.round(c.nearMin * 10) / 10; return o; }, {}),
      counts: A.cats.reduce((o, c) => { o[c.id] = c.c10; return o; }, {}),
      noise: Math.round(A.noise.v * 100) / 100, green: Math.round(A.green.share * 1000) / 1000,
      far: Math.round(A.built.far * 100) / 100, cover: Math.round(A.built.coverage * 1000) / 1000,
      interDensity: Math.round(A.mob.interDensity), stops10: A.transit.in10, demo: A.demo,
    };
  };

  /* Modül 4 JSON uzantısı: extensions.siteAnalysis */
  site.toExt = function (project) {
    const s = project.site;
    if (!s) return {};
    const out = { version: 1, location: { lat: s.loc.lat, lon: s.loc.lon, name: s.loc.name, source: s.loc.src }, radiusM: s.radius, walkMinutes: s.walkMin, template: s.template };
    const e = site.entry(s);
    if (e) {
      const A = site.analyze(s, e);
      out.demo = !!e.demo;
      out.score = A.score;
      out.parts = A.parts.map((p) => ({ id: p.id, value: Math.round(p.v * 1000) / 1000, weight: p.w }));
      out.metrics = {
        buildings: A.built.count, footprintCoverage: Math.round(A.built.coverage * 1000) / 1000, estimatedFAR: Math.round(A.built.far * 100) / 100,
        greenShare: Math.round(A.green.share * 1000) / 1000, streetDensityKmPerKm2: Math.round(A.mob.density * 10) / 10, intersectionsPerKm2: Math.round(A.mob.interDensity),
        noiseIndex: Math.round(A.noise.v * 100) / 100, transitStopsIn10min: A.transit.in10,
      };
      out.categories = A.cats.map((c) => ({ id: c.id, nearestWalkMin: c.nearMin == null ? null : Math.round(c.nearMin * 10) / 10, in5: c.c5, in10: c.c10, in15: c.c15 }));
    }
    return { siteAnalysis: out };
  };
  site.fromExt = function (x, project) {
    try {
      const d = site.defaults();
      const lat = Number(x.location && x.location.lat), lon = Number(x.location && x.location.lon);
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) return d;
      d.loc = { lat: lat, lon: lon, name: String(x.location.name || lat.toFixed(5) + ', ' + lon.toFixed(5)).slice(0, 120), src: x.location.source === 'demo' ? 'demo' : x.location.source || 'koordinat' };
      d.radius = U.clamp(Math.round(Number(x.radiusM) || 500), 250, 1000);
      d.walkMin = [5, 10, 15].indexOf(Number(x.walkMinutes)) >= 0 ? Number(x.walkMinutes) : 10;
      d.template = site.TEMPLATES.some((t) => t.id === x.template) ? x.template : 'konut';
      return d;
    } catch (e) { return site.defaults(); }
  };
  App.extProviders.push(site.toExt);
})();
