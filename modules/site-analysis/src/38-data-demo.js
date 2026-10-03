/* ==========================================================================
   38-data-demo.js — demo bölge (SENTETİK veri; gerçek bir yeri göstermez)
   Amaç: internet / Overpass erişimi olmadan da Arsa Analizi, İmar ve Yer Seçimi'nin tam çalışması.
   Üretim: sabit tohumlu rastgele sayılarla, Overpass yanıtıyla aynı biçimde (elements[]) bir kent dokusu
   kurulur ve gerçek ayrıştırıcıdan (App.osm.parse) geçirilir; böylece demo da gerçek veri yolunu sınar.
   Doku: ~14° döndürülmüş ızgara, ana cadde, park, okul, kıyı (deniz), otobüs durakları, işlevler.
   İklim değerleri bölgeye özgü olmayan, Akdeniz/Marmara tipi örnek iklim normalleridir.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;

  const DEMO_LAT = 40.9835, DEMO_LON = 29.0255;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function build() {
    const rand = rng(20261003);
    const proj = gis.makeProj(DEMO_LAT, DEMO_LON);
    const TH = (14 * Math.PI) / 180, C = Math.cos(TH), S = Math.sin(TH);
    const W = (u, v) => [u * C - v * S, u * S + v * C]; // ızgara → yerel metre
    const ll = (x, y) => { const q = proj.inv(x, y); return { lat: q[0], lon: q[1] }; };
    const gl = (u, v) => { const q = W(u, v); return ll(q[0], q[1]); };
    const els = [];
    let id = 1000;

    const Pu = 106, Pv = 82, wS = 10, Bu = Pu - wS, Bv = Pv - wS;
    const OU = -Pu * 0.45, OV = -Pv * 0.15; // ızgara ötelemesi: çalışma noktası ana cadde kenarında
    const I0 = -12, I1 = 12, J0 = -15, J1 = 15;
    // kıyı: GB köşede, su sağda kalacak yönde (kıyı çizgisi GD → KB doğrultusunda)
    const coastY = (x) => -0.62 * x - 330 + 40 * Math.sin(x / 140);
    const isSea = (x, y) => y < coastY(x);

    // ---- sokaklar
    const nameU = (i) => (i === 0 ? 'Ata Bulvarı' : i % 3 === 0 ? 'Çınar Sokak' : 'Gül Sokak ' + Math.abs(i));
    const nameV = (j) => (j === 0 ? 'Örnek Caddesi' : j === 2 ? 'Çarşı Yaya Yolu' : j % 3 === 0 ? 'Okul Sokak' : 'Lale Sokak ' + Math.abs(j));
    const clsV = (j) => (j === 0 ? 'secondary' : j === 2 ? 'pedestrian' : j % 4 === 0 ? 'tertiary' : 'residential');
    const clsU = (i) => (i === 0 ? 'tertiary' : 'residential');
    const road = (cls, name, uvs) => {
      // kıyıdan denize taşan kısımları at
      let cur = [];
      const flush = () => { if (cur.length > 1) els.push({ type: 'way', id: id++, tags: { highway: cls, name: name }, geometry: cur.map((p) => ll(p[0], p[1])) }); cur = []; };
      uvs.forEach((p) => { const q = W(p[0], p[1]); if (isSea(q[0], q[1])) flush(); else cur.push(q); });
      flush();
    };
    for (let j = J0; j <= J1; j++) {
      const v = OV + j * Pv, pts = [];
      for (let i = I0; i <= I1 + 1; i++) pts.push([OU + i * Pu, v]); // her kesişimde köşe noktası
      road(clsV(j), nameV(j), pts);
    }
    for (let i = I0; i <= I1 + 1; i++) {
      const u = OU + i * Pu, pts = [];
      for (let j = J0; j <= J1; j++) pts.push([u, OV + j * Pv]);
      road(clsU(i), nameU(i), pts);
    }
    // park içinden geçen yaya yolu (çapraz)
    const parkBlocks = [[1, 1], [-3, 2], [3, -2]];
    const pk = parkBlocks[0];
    els.push({ type: 'way', id: id++, tags: { highway: 'footway' }, geometry: [gl(OU + pk[0] * Pu + wS / 2, OV + pk[1] * Pv + wS / 2), gl(OU + pk[0] * Pu + Pu - wS / 2, OV + pk[1] * Pv + Pv - wS / 2)] });
    // servis yolu ve ek yaya bağlantıları
    for (let k = 0; k < 8; k++) {
      const i = Math.round((rand() - 0.5) * 12), j = Math.round((rand() - 0.5) * 12);
      const u0 = OU + i * Pu + Pu / 2, v0 = OV + j * Pv + wS / 2;
      const a = W(u0, v0), b = W(u0, v0 + Bv);
      if (!isSea(a[0], a[1]) && !isSea(b[0], b[1])) els.push({ type: 'way', id: id++, tags: { highway: k % 2 ? 'footway' : 'service' }, geometry: [ll(a[0], a[1]), ll(b[0], b[1])] });
    }

    // ---- bloklar
    const kinds = ['apartments', 'apartments', 'residential', 'apartments', 'commercial'];
    const pois = [];
    const poiAt = (x, y, tags) => pois.push({ x: x, y: y, tags: tags });
    const schoolBlocks = new Set(['-1|1', '2|-3']);
    const mosqueBlocks = new Set(['-2|-1']);
    const isPark = (i, j) => parkBlocks.some((p) => p[0] === i && p[1] === j);
    const ring = (uvs) => uvs.concat([uvs[0]]).map((p) => gl(p[0], p[1]));
    let bCount = 0;
    for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
      const u0 = OU + i * Pu + wS / 2, v0 = OV + j * Pv + wS / 2;
      const cc = W(u0 + Bu / 2, v0 + Bv / 2);
      if (isSea(cc[0], cc[1]) || Math.hypot(cc[0], cc[1]) > 1230) continue;
      const key = i + '|' + j;
      const nearAve = Math.abs(j) <= 1 || Math.abs(i) <= 0;
      if (isPark(i, j)) {
        els.push({ type: 'way', id: id++, tags: { leisure: 'park', name: i === 1 ? 'Merkez Park' : 'Mahalle Parkı' }, geometry: ring([[u0, v0], [u0 + Bu, v0], [u0 + Bu, v0 + Bv], [u0, v0 + Bv]]) });
        els.push({ type: 'way', id: id++, tags: { leisure: 'playground' }, geometry: ring([[u0 + 14, v0 + 12], [u0 + 38, v0 + 12], [u0 + 38, v0 + 30], [u0 + 14, v0 + 30]]) });
        continue;
      }
      if (schoolBlocks.has(key)) {
        els.push({ type: 'way', id: id++, tags: { building: 'school', amenity: 'school', name: key === '-1|1' ? 'Atatürk İlkokulu' : 'Cumhuriyet Ortaokulu', 'building:levels': '3' }, geometry: ring([[u0 + 8, v0 + 10], [u0 + Bu - 8, v0 + 10], [u0 + Bu - 8, v0 + 34], [u0 + 8, v0 + 34]]) });
        els.push({ type: 'way', id: id++, tags: { leisure: 'pitch', sport: 'basketball' }, geometry: ring([[u0 + 20, v0 + 44], [u0 + 56, v0 + 44], [u0 + 56, v0 + 64], [u0 + 20, v0 + 64]]) });
        els.push({ type: 'way', id: id++, tags: { landuse: 'institutional' }, geometry: ring([[u0, v0], [u0 + Bu, v0], [u0 + Bu, v0 + Bv], [u0, v0 + Bv]]) });
        bCount++;
        continue;
      }
      if (mosqueBlocks.has(key)) {
        els.push({ type: 'way', id: id++, tags: { building: 'mosque', amenity: 'place_of_worship', name: 'Merkez Camii' }, geometry: ring([[u0 + 28, v0 + 20], [u0 + 60, v0 + 20], [u0 + 60, v0 + 48], [u0 + 28, v0 + 48]]) });
        els.push({ type: 'way', id: id++, tags: { leisure: 'garden' }, geometry: ring([[u0, v0], [u0 + Bu, v0], [u0 + Bu, v0 + Bv], [u0, v0 + Bv]]) });
        continue;
      }
      // iki sıra bina (uzun kenarlar boyunca) + iç avlu
      const rows = [[0, 22 + rand() * 4], [Bv - 22 - rand() * 4, Bv]];
      rows.forEach((rw) => {
        let u = 0;
        while (u < Bu - 12) {
          const w = Math.min(Bu - u, 15 + rand() * 12);
          const gap = rand() < 0.15 ? 2.5 : 0;
          const lv = nearAve ? 4 + Math.floor(rand() * 5) : 3 + Math.floor(rand() * 4);
          const kind = nearAve && rand() < 0.35 ? 'commercial' : kinds[Math.floor(rand() * kinds.length)];
          const tags = { building: kind, 'building:levels': String(lv) };
          if (rand() < 0.18) tags.height = String(Math.round(lv * 3.1 * 10) / 10);
          if (rand() < 0.25) delete tags['building:levels']; // OSM'deki gibi: kat bilgisi her binada yok
          const x0 = u + gap, x1 = u + w;
          els.push({ type: 'way', id: id++, tags: tags, geometry: ring([[u0 + x0, v0 + rw[0]], [u0 + x1, v0 + rw[0]], [u0 + x1, v0 + rw[1]], [u0 + x0, v0 + rw[1]]]) });
          bCount++;
          if (nearAve && rw[0] < 5 && rand() < 0.55) { const p = W(u0 + (x0 + x1) / 2, v0 + (rw[0] + rw[1]) / 2); poiAt(p[0], p[1], null); }
          u += w;
        }
      });
      // avlu içinde küçük yapı
      if (rand() < 0.5) els.push({ type: 'way', id: id++, tags: { building: 'garage' }, geometry: ring([[u0 + 40, v0 + 30], [u0 + 52, v0 + 30], [u0 + 52, v0 + 40], [u0 + 40, v0 + 40]]) });
    }

    // ---- arazi kullanımı
    const R0 = 1230;
    els.push({ type: 'way', id: id++, tags: { landuse: 'residential' }, geometry: [[-R0, -R0 * 0.2], [R0, -R0 * 0.2], [R0, R0], [-R0, R0]].map((p) => ll(p[0], p[1])).concat([ll(-R0, -R0 * 0.2)]) });
    els.push({ type: 'way', id: id++, tags: { landuse: 'commercial' }, geometry: ring([[OU - 3 * Pu, OV - Pv * 0.5 - 8], [OU + 6 * Pu, OV - Pv * 0.5 - 8], [OU + 6 * Pu, OV + Pv * 1.6], [OU - 3 * Pu, OV + Pv * 1.6]]) });

    // ---- kıyı
    const coast = [];
    for (let x = -1300; x <= 1300; x += 40) coast.push(ll(x, coastY(x)));
    els.push({ type: 'way', id: id++, tags: { natural: 'coastline' }, geometry: coast });
    // sahil yolu
    const sy = [];
    for (let x = -1300; x <= 1300; x += 40) sy.push(ll(x, coastY(x) + 16));
    els.push({ type: 'way', id: id++, tags: { highway: 'secondary', name: 'Sahil Yolu' }, geometry: sy });
    // demiryolu (gürültü kaynağı): KD'de uzak
    els.push({ type: 'way', id: id++, tags: { railway: 'rail' }, geometry: [ll(-900, 820), ll(-300, 700), ll(300, 640), ll(900, 500)] });
    // dere
    els.push({ type: 'way', id: id++, tags: { waterway: 'stream' }, geometry: [ll(420, 900), ll(380, 600), ll(300, 380), ll(260, 150), ll(180, coastY(180) + 4)] });

    // ---- işlevler (düğümler)
    const node = (x, y, tags) => els.push(Object.assign({ type: 'node', id: id++ }, ll(x, y), { tags: tags }));
    // ana cadde ve çevresindeki dükkânlar
    const cafeSet = [
      { amenity: 'cafe', name: 'Moda Kahve' }, { amenity: 'cafe', name: 'Köşe Kafe' }, { amenity: 'restaurant', name: 'Deniz Lokantası' }, { amenity: 'restaurant', name: 'Sofra' },
      { shop: 'supermarket', name: 'Mahalle Market' }, { shop: 'bakery', name: 'Fırın 1' }, { amenity: 'pharmacy', name: 'Merkez Eczanesi' }, { amenity: 'bank', name: 'Banka' },
      { shop: 'convenience', name: 'Bakkal' }, { amenity: 'fast_food', name: 'Dürümcü' }, { shop: 'clothes', name: 'Butik' }, { amenity: 'atm', name: 'ATM' },
      { shop: 'greengrocer', name: 'Manav' }, { amenity: 'cafe', name: 'Çay Evi' }, { amenity: 'bar', name: 'Bar' }, { shop: 'books', name: 'Kitabevi' },
    ];
    pois.forEach((p, k) => {
      const t = Object.assign({}, cafeSet[k % cafeSet.length]);
      if (k >= cafeSet.length) t.name = t.name + ' ' + (1 + Math.floor(k / cafeSet.length));
      node(p.x, p.y, t);
    });
    // hizmet noktaları: sabit, serpiştirilmiş
    const spread = [
      [-420, 120, { shop: 'supermarket', name: 'Büyük Market' }], [260, -90, { shop: 'supermarket', name: 'Şok Market' }], [480, 260, { amenity: 'marketplace', name: 'Semt Pazarı' }],
      [-180, 260, { amenity: 'kindergarten', name: 'Papatya Anaokulu' }], [330, 310, { amenity: 'kindergarten', name: 'Minik Adımlar' }], [-60, -150, { amenity: 'clinic', name: 'Sağlık Merkezi' }],
      [150, 420, { amenity: 'doctors', name: 'Aile Sağlığı Merkezi' }], [-350, -80, { amenity: 'library', name: 'Halk Kütüphanesi' }], [70, 70, { amenity: 'post_office', name: 'PTT' }],
      [-120, 40, { leisure: 'fitness_centre', name: 'Fit Club' }], [380, 60, { leisure: 'fitness_centre', name: 'Spor Salonu' }], [-480, 300, { amenity: 'cinema', name: 'Sinema' }],
      [610, -120, { amenity: 'hospital', name: 'Bölge Hastanesi' }], [-30, 520, { amenity: 'community_centre', name: 'Kültür Merkezi' }], [200, 180, { amenity: 'dentist', name: 'Diş Kliniği' }],
      [-600, -20, { amenity: 'townhall', name: 'Belediye Hizmet Binası' }], [-250, 440, { shop: 'bakery', name: 'Fırın 2' }], [420, 440, { shop: 'bakery', name: 'Fırın 3' }],
      [90, -240, { amenity: 'pharmacy', name: 'Sahil Eczanesi' }], [-300, 380, { amenity: 'cafe', name: 'Park Kafe' }], [560, 420, { amenity: 'university', name: 'Meslek Yüksekokulu' }],
    ];
    spread.forEach((s) => { if (!isSea(s[0], s[1])) node(s[0], s[1], s[2]); });

    // ---- toplu taşıma
    const busU = [];
    for (let i = -6; i <= 7; i += 2) busU.push([OU + i * Pu + 14, OV - 4]);
    busU.forEach((p, k) => { const q = W(p[0], p[1]); if (!isSea(q[0], q[1])) node(q[0], q[1], { highway: 'bus_stop', name: 'Durak ' + (k + 1) }); });
    [[OU + 0 * Pu - 4, OV + 5 * Pv], [OU + 0 * Pu - 4, OV - 4 * Pv], [OU + 4 * Pu + 8, OV + 3 * Pv]].forEach((p, k) => { const q = W(p[0], p[1]); if (!isSea(q[0], q[1])) node(q[0], q[1], { highway: 'bus_stop', name: 'Cadde durağı ' + (k + 1) }); });
    node(430, 380, { railway: 'subway_entrance', name: 'Metro girişi' });
    node(-140, coastY(-140) + 30, { amenity: 'ferry_terminal', name: 'İskele' });

    return { type: 'elements', json: { elements: els } };
  }

  /* örnek iklim normalleri (bölgeye özgü değil) */
  function climate() {
    const T = [6.4, 6.7, 8.5, 12.6, 17.4, 22.1, 24.9, 25.2, 21.2, 16.6, 12.2, 8.4];
    const Pm = [92, 70, 62, 44, 34, 30, 26, 28, 40, 72, 88, 108];
    const Rad = [48, 68, 112, 148, 192, 222, 233, 208, 158, 104, 60, 44];
    const share = [0.12, 0.09, 0.05, 0.04, 0.03, 0.03, 0.05, 0.05, 0.02, 0.03, 0.06, 0.09, 0.10, 0.05, 0.05, 0.14];
    const spd = [22, 20, 17, 15, 13, 12, 13, 14, 12, 13, 17, 21, 24, 20, 18, 26];
    const sum = share.reduce((a, b) => a + b, 0);
    const wind = share.map((s, i) => ({ dir: i * 22.5, share: s / sum, speed: spd[i] }));
    const main = wind.slice().sort((a, b) => b.share - a.share)[0];
    return { year: 0, demo: true, monthly: T.map((t, i) => ({ t: t, p: Pm[i], rad: Rad[i] })), wind: wind, dominant: { dir: main.dir, share: main.share, speed: main.speed } };
  }

  function elevation(R, ox, oy) {
    const n = 10, z = [];
    ox = ox || 0; oy = oy || 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -R + (2 * R * i) / (n - 1) + ox, y = -R + (2 * R * j) / (n - 1) + oy;
      const coastY = -0.62 * x - 330;
      const d = (y - coastY) / Math.sqrt(1 + 0.62 * 0.62); // kıyıdan uzaklık (m)
      z.push(Math.max(0, Math.round((2 + Math.max(0, d) * 0.045 + 6 * Math.sin(x / 260) * Math.cos(y / 310)) * 10) / 10));
    }
    return { n: n, R: R, z: z };
  }

  const cache = new Map();
  osm.DEMO = { lat: DEMO_LAT, lon: DEMO_LON, name: 'Demo bölge (sentetik veri)' };
  // örnek kentte (dx, dy) metre kaydırılmış merkezli veri: karşılaştırma ve konum bulma demoları için
  function shifted(base, dx, dy) {
    const r1 = (v) => Math.round(v * 10) / 10;
    const sh = (p) => [r1(p[0] - dx), r1(p[1] - dy)];
    const mapPts = (o) => Object.assign({}, o, { pts: o.pts.map(sh) });
    const proj = gis.makeProj(DEMO_LAT, DEMO_LON);
    const ll = proj.inv(dx, dy);
    return {
      lat0: ll[0], lon0: ll[1], R: Math.max(300, Math.floor(base.R - Math.hypot(dx, dy))), t: base.t,
      buildings: base.buildings.map((b) => Object.assign({}, b, { pts: b.pts.map(sh), cx: r1(b.cx - dx), cy: r1(b.cy - dy) })),
      roads: base.roads.map(mapPts), rails: base.rails.map(mapPts), green: base.green.map(mapPts), landuse: base.landuse.map(mapPts), water: base.water.map(mapPts),
      poi: base.poi.map((p) => Object.assign({}, p, { x: r1(p.x - dx), y: r1(p.y - dy) })),
      transit: base.transit.map((p) => Object.assign({}, p, { x: r1(p.x - dx), y: r1(p.y - dy) })),
    };
  }
  osm.demo = function (dx, dy) {
    dx = Math.round(dx || 0); dy = Math.round(dy || 0);
    const k = dx + ',' + dy;
    if (cache.has(k)) return cache.get(k);
    if (!cache.has('0,0')) {
      const R = 1260;
      const data = osm.parse(build().json, DEMO_LAT, DEMO_LON, R);
      data.R = 1200;
      cache.set('0,0', { key: 'demo', data: data, elev: elevation(900), climate: climate(), demo: true, dx: 0, dy: 0 });
    }
    if (k === '0,0') return cache.get(k);
    const base = cache.get('0,0');
    const ent = { key: 'demo:' + k, data: shifted(base.data, dx, dy), elev: elevation(900, dx, dy), climate: base.climate, demo: true, dx: dx, dy: dy };
    cache.set(k, ent);
    return ent;
  };
  osm.demoLoc = function (dx, dy, name) {
    const proj = gis.makeProj(DEMO_LAT, DEMO_LON);
    const ll = proj.inv(dx || 0, dy || 0);
    return { lat: Math.round(ll[0] * 1e6) / 1e6, lon: Math.round(ll[1] * 1e6) / 1e6, name: name || osm.DEMO.name, src: 'demo', dx: dx || 0, dy: dy || 0 };
  };
})();
