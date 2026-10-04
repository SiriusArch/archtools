/* ==========================================================================
   37-lib-osm.js — açık coğrafi veri: OpenStreetMap (Overpass + Nominatim), Open-Meteo (yükselti, iklim)
   Hepsi tarayıcıdan, anahtarsız ve ücretsiz uç noktalardır; sunucu gerekmez.
   Veri modeli (yerel metre, x doğu / y kuzey, çalışma noktası = 0,0):
     { lat0, lon0, R, t, buildings, roads, rails, green, landuse, water, poi, transit }
   Ağ başarısız olursa arayüz "demo bölge" ile çalışmaya devam eder (38-data-demo.js).
   Kaynak: © OpenStreetMap katkıda bulunanlar (ODbL) · Open-Meteo (CC BY 4.0)
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = (App.osm = {});

  Object.assign(App.KB.SOURCES, {
    'OSM': { label: 'OpenStreetMap katkıda bulunanları (ODbL) — bina, yol, işlev, toplu taşıma', kind: 'Açık veri', trust: 'orta-yüksek' },
    'Open-Meteo': { label: 'Open-Meteo — yükselti (Copernicus DEM) ve geçmiş hava verisi (CC BY 4.0)', kind: 'Açık veri', trust: 'orta-yüksek' },
    '15dk': { label: '15 dakikalık kent yaklaşımı (Moreno) — günlük ihtiyaçlara 15 dk yürüme; yürüme hızı 4,8 km/sa varsayımı', kind: 'Kavram', trust: 'orta' },
  });

  /* ---------------- işlev (POI) kategorileri ---------------- */
  osm.CATS = [
    { id: 'gunluk', label: 'Günlük ihtiyaç', short: 'Günlük', color: 'yellow', icon: 'G' },
    { id: 'yeme', label: 'Yeme-içme', short: 'Yeme-içme', color: 'orange', icon: 'Y' },
    { id: 'egitim', label: 'Eğitim', short: 'Eğitim', color: 'blue', icon: 'E' },
    { id: 'saglik', label: 'Sağlık', short: 'Sağlık', color: 'red', icon: 'S' },
    { id: 'rekreasyon', label: 'Park ve spor', short: 'Park/spor', color: 'green', icon: 'P' },
    { id: 'kultur', label: 'Kültür ve toplum', short: 'Kültür', color: 'indigo', icon: 'K' },
    { id: 'hizmet', label: 'Kamu ve finans', short: 'Hizmet', color: 'ink', icon: 'H' },
    { id: 'alisveris', label: 'Alışveriş', short: 'Alışveriş', color: 'blueBright', icon: 'A' },
  ];
  osm.cat = (id) => osm.CATS.find((c) => c.id === id) || osm.CATS[0];

  // [etiket anahtarı, değer(ler), kategori, ad]
  const RULES = [
    ['shop', 'supermarket', 'gunluk', 'Market'], ['shop', 'convenience', 'gunluk', 'Bakkal / market'], ['shop', 'bakery', 'gunluk', 'Fırın'],
    ['shop', 'greengrocer', 'gunluk', 'Manav'], ['shop', 'butcher', 'gunluk', 'Kasap'], ['shop', 'grocery', 'gunluk', 'Bakkal'],
    ['shop', 'kiosk', 'gunluk', 'Büfe'], ['shop', 'general', 'gunluk', 'Bakkal'], ['shop', 'chemist', 'gunluk', 'Drogeri'],
    ['amenity', 'pharmacy', 'gunluk', 'Eczane'], ['amenity', 'marketplace', 'gunluk', 'Pazar'],
    ['amenity', 'restaurant', 'yeme', 'Restoran'], ['amenity', 'cafe', 'yeme', 'Kafe'], ['amenity', 'fast_food', 'yeme', 'Fast food'],
    ['amenity', 'bar', 'yeme', 'Bar'], ['amenity', 'pub', 'yeme', 'Pub'], ['amenity', 'food_court', 'yeme', 'Yemek alanı'], ['amenity', 'ice_cream', 'yeme', 'Dondurma'],
    ['amenity', 'school', 'egitim', 'Okul'], ['amenity', 'kindergarten', 'egitim', 'Anaokulu'], ['amenity', 'university', 'egitim', 'Üniversite'],
    ['amenity', 'college', 'egitim', 'Kolej'], ['amenity', 'childcare', 'egitim', 'Kreş'], ['amenity', 'language_school', 'egitim', 'Dil okulu'],
    ['amenity', 'hospital', 'saglik', 'Hastane'], ['amenity', 'clinic', 'saglik', 'Klinik'], ['amenity', 'doctors', 'saglik', 'Doktor'],
    ['amenity', 'dentist', 'saglik', 'Diş hekimi'], ['healthcare', '*', 'saglik', 'Sağlık'],
    ['leisure', 'playground', 'rekreasyon', 'Oyun alanı'], ['leisure', 'fitness_centre', 'rekreasyon', 'Spor salonu'], ['leisure', 'sports_centre', 'rekreasyon', 'Spor merkezi'],
    ['leisure', 'pitch', 'rekreasyon', 'Spor sahası'], ['leisure', 'swimming_pool', 'rekreasyon', 'Yüzme havuzu'], ['leisure', 'stadium', 'rekreasyon', 'Stadyum'],
    ['amenity', 'library', 'kultur', 'Kütüphane'], ['amenity', 'theatre', 'kultur', 'Tiyatro'], ['amenity', 'cinema', 'kultur', 'Sinema'],
    ['amenity', 'arts_centre', 'kultur', 'Sanat merkezi'], ['amenity', 'community_centre', 'kultur', 'Toplum merkezi'], ['amenity', 'place_of_worship', 'kultur', 'İbadethane'],
    ['tourism', 'museum', 'kultur', 'Müze'], ['tourism', 'gallery', 'kultur', 'Galeri'],
    ['amenity', 'bank', 'hizmet', 'Banka'], ['amenity', 'atm', 'hizmet', 'ATM'], ['amenity', 'post_office', 'hizmet', 'Postane'],
    ['amenity', 'townhall', 'hizmet', 'Belediye'], ['amenity', 'police', 'hizmet', 'Polis'], ['amenity', 'fire_station', 'hizmet', 'İtfaiye'],
    ['amenity', 'courthouse', 'hizmet', 'Adliye'], ['office', 'government', 'hizmet', 'Kamu ofisi'],
    ['shop', '*', 'alisveris', 'Mağaza'],
  ];

  osm.classify = function (tags) {
    for (let i = 0; i < RULES.length; i++) {
      const r = RULES[i], v = tags[r[0]];
      if (v && (r[1] === '*' || r[1] === v)) return { cat: r[2], kind: r[3], tag: r[0] + '=' + v };
    }
    return null;
  };

  /* ---------------- Overpass sorgusu ---------------- */
  osm.query = function (lat, lon, R) {
    const a = '(around:' + Math.round(R) + ',' + lat.toFixed(6) + ',' + lon.toFixed(6) + ')';
    return '[out:json][timeout:40];(' +
      'way' + a + '["building"];' +
      'way' + a + '["highway"];' +
      'way' + a + '["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"];' +
      'way' + a + '["leisure"~"^(park|garden|playground|pitch|sports_centre|recreation_ground|nature_reserve|common|dog_park|stadium)$"];' +
      'way' + a + '["landuse"];' +
      'way' + a + '["natural"~"^(water|wood|scrub|grassland|wetland|beach|coastline)$"];' +
      'way' + a + '["waterway"~"^(river|stream|canal)$"];' +
      'way' + a + '["amenity"];' +
      'way' + a + '["shop"];' +
      'relation' + a + '["natural"="water"];' +
      'relation' + a + '["leisure"~"^(park|garden)$"];' +
      'node' + a + '["amenity"];' +
      'node' + a + '["shop"];' +
      'node' + a + '["healthcare"];' +
      'node' + a + '["highway"="bus_stop"];' +
      'node' + a + '["public_transport"~"^(stop_position|platform|station)$"];' +
      'node' + a + '["railway"~"^(station|halt|tram_stop|subway_entrance)$"];' +
      'node' + a + '["leisure"~"^(playground|fitness_centre|sports_centre|pitch)$"];' +
      'node' + a + '["tourism"~"^(museum|gallery)$"];' +
      ');out geom;';
  };

  /* ---------------- ayrıştırma ---------------- */
  const r1 = (v) => Math.round(v * 10) / 10;
  const ROAD = { motorway: 'motorway', motorway_link: 'motorway', trunk: 'trunk', trunk_link: 'trunk', primary: 'primary', primary_link: 'primary', secondary: 'secondary', secondary_link: 'secondary', tertiary: 'tertiary', tertiary_link: 'tertiary', residential: 'residential', unclassified: 'residential', living_street: 'living', service: 'service', pedestrian: 'pedestrian', footway: 'footway', cycleway: 'cycleway', steps: 'steps', path: 'path', track: 'track', bridleway: 'path', corridor: 'footway' };
  const GREEN_LU = { grass: 1, forest: 1, meadow: 1, village_green: 1, recreation_ground: 1, cemetery: 1, allotments: 1, orchard: 1, vineyard: 1, flowerbed: 1, greenfield: 1, plant_nursery: 1 };
  const GREEN_LEISURE = { park: 1, garden: 1, playground: 1, recreation_ground: 1, nature_reserve: 1, common: 1, dog_park: 1 };
  const USE_LU = { residential: 'konut', commercial: 'ticari', retail: 'ticari', industrial: 'sanayi', institutional: 'kamu', education: 'kamu', military: 'kamu', railway: 'ulasim', garages: 'ulasim', construction: 'yapim', brownfield: 'yapim', religious: 'kamu' };
  osm.USE_LABEL = { konut: 'Konut', ticari: 'Ticari', sanayi: 'Sanayi', kamu: 'Kamu / kurum', ulasim: 'Ulaşım', yapim: 'Yapım / boş', yesil: 'Yeşil alan' };

  function ptsOf(el, proj) {
    const g = el.geometry || [];
    const out = [];
    for (let i = 0; i < g.length; i++) {
      if (!g[i]) continue;
      const q = proj.fwd(g[i].lat, g[i].lon);
      const x = r1(q[0]), y = r1(q[1]);
      const l = out[out.length - 1];
      if (l && l[0] === x && l[1] === y) continue;
      out.push([x, y]);
    }
    return out;
  }
  const isClosed = (el) => el.geometry && el.geometry.length > 3 && el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat && el.geometry[0].lon === el.geometry[el.geometry.length - 1].lon;

  function height(tags) {
    let h = null, lv = null;
    if (tags.height) { const m = parseFloat(String(tags.height).replace(',', '.')); if (m > 0 && m < 400) h = m; }
    if (tags['building:levels']) { const l = parseFloat(String(tags['building:levels']).replace(',', '.')); if (l > 0 && l < 120) lv = Math.round(l); }
    return { h: h, lv: lv };
  }

  // açık halkaları uç noktalardan birleştir (multipolygon dış halkaları)
  function joinWays(ways) {
    const rings = [];
    const rest = ways.map((w) => w.slice());
    while (rest.length) {
      let cur = rest.shift();
      let grew = true;
      while (grew) {
        grew = false;
        const s = cur[0], e = cur[cur.length - 1];
        if (cur.length > 3 && s[0] === e[0] && s[1] === e[1]) break;
        for (let i = 0; i < rest.length; i++) {
          const w = rest[i], ws = w[0], we = w[w.length - 1];
          const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.25 && Math.abs(a[1] - b[1]) < 0.25;
          if (eq(e, ws)) { cur = cur.concat(w.slice(1)); }
          else if (eq(e, we)) { cur = cur.concat(w.slice(0, -1).reverse()); }
          else if (eq(s, we)) { cur = w.slice(0, -1).concat(cur); }
          else if (eq(s, ws)) { cur = w.slice(1).reverse().concat(cur); }
          else continue;
          rest.splice(i, 1);
          grew = true;
          break;
        }
      }
      if (cur.length > 3) rings.push(cur[0][0] === cur[cur.length - 1][0] && cur[0][1] === cur[cur.length - 1][1] ? cur.slice(0, -1) : cur);
    }
    return rings;
  }

  // kıyı çizgileri (su sağda) → deniz çokgenleri (Rf daire sınırına kapatılır)
  function seaPolys(lines, R) {
    const pieces = [];
    lines.forEach((l) => gis.clipLineToCircle(l, R).forEach((s) => { if (s.length > 1) pieces.push(s); }));
    const ang = (q) => Math.atan2(q[1], q[0]);
    const onC = (q) => Math.abs(Math.hypot(q[0], q[1]) - R) < 0.6;
    const ps = pieces.filter((s) => onC(s[0]) && onC(s[s.length - 1]));
    const out = [];
    const used = new Set();
    ps.forEach((p0, i0) => {
      if (used.has(i0)) return;
      const poly = [];
      let i = i0, guard = 0;
      do {
        used.add(i);
        const piece = ps[i];
        piece.forEach((q) => poly.push(q));
        const aE = ang(piece[piece.length - 1]);
        // saat yönünde (açı azalan) bir sonraki başlangıç
        let best = -1, bd = Infinity;
        ps.forEach((c, j) => {
          let d = aE - ang(c[0]);
          while (d < -1e-6) d += Math.PI * 2;
          while (d > Math.PI * 2 - 1e-6 && j !== i) d -= Math.PI * 2;
          if (d < bd - 1e-9) { bd = d; best = j; }
        });
        if (best < 0) break;
        const steps = Math.max(1, Math.ceil((bd / (Math.PI / 36))));
        for (let s = 1; s < steps; s++) { const a = aE - (bd * s) / steps; poly.push([Math.cos(a) * R, Math.sin(a) * R]); }
        i = best;
      } while (i !== i0 && !used.has(i) && ++guard < 40);
      if (poly.length > 2) out.push(poly);
    });
    return out;
  }

  osm.parse = function (json, lat0, lon0, R) {
    const proj = gis.makeProj(lat0, lon0);
    const d = { lat0: lat0, lon0: lon0, R: R, t: Date.now(), buildings: [], roads: [], rails: [], green: [], landuse: [], water: [], poi: [], transit: [] };
    const els = (json && json.elements) || [];
    const coast = [];
    const seenPoi = new Set();
    const addPoi = (tags, x, y, id) => {
      const c = osm.classify(tags);
      if (!c) return;
      const nm = tags.name || tags['name:tr'] || '';
      const key = c.cat + '|' + (nm || id);
      if (nm && seenPoi.has(key + '|' + Math.round(x / 25) + Math.round(y / 25))) return; // aynı ad, 25 m içinde: tekrar sayma
      seenPoi.add(key + '|' + Math.round(x / 25) + Math.round(y / 25));
      d.poi.push({ x: r1(x), y: r1(y), cat: c.cat, kind: c.kind, name: nm });
    };
    const addGreenOrLanduse = (tags, pts, polygon) => {
      const lu = tags.landuse, le = tags.leisure, na = tags.natural;
      if ((le && GREEN_LEISURE[le]) || (lu && GREEN_LU[lu]) || na === 'wood' || na === 'scrub' || na === 'grassland' || na === 'wetland') {
        if (polygon) d.green.push({ pts: pts, kind: le || lu || na, pub: !!(le && (le === 'park' || le === 'garden' || le === 'playground' || le === 'common')) });
        return true;
      }
      if (lu && USE_LU[lu] && polygon) { d.landuse.push({ pts: pts, kind: USE_LU[lu] }); return true; }
      return false;
    };

    els.forEach((el) => {
      const t = el.tags || {};
      if (el.type === 'node') {
        const q = proj.fwd(el.lat, el.lon);
        // toplu taşıma
        const hw = t.highway, pt = t.public_transport, rw = t.railway;
        let tk = null;
        if (hw === 'bus_stop' || ((pt === 'platform' || pt === 'stop_position') && (t.bus === 'yes' || t.trolleybus === 'yes'))) tk = 'otobus';
        else if (rw === 'tram_stop' || ((pt === 'platform' || pt === 'stop_position') && t.tram === 'yes')) tk = 'tramvay';
        else if (rw === 'subway_entrance' || (rw === 'station' && (t.station === 'subway' || t.subway === 'yes')) || ((pt === 'station' || pt === 'stop_position') && t.subway === 'yes')) tk = 'metro';
        else if (rw === 'station' || rw === 'halt' || (pt === 'station' && t.train === 'yes')) tk = 'tren';
        else if (t.amenity === 'ferry_terminal') tk = 'vapur';
        if (tk) {
          const dup = d.transit.some((s) => s.kind === tk && Math.abs(s.x - q[0]) < 20 && Math.abs(s.y - q[1]) < 20);
          if (!dup) d.transit.push({ x: r1(q[0]), y: r1(q[1]), kind: tk, name: t.name || '' });
          return;
        }
        addPoi(t, q[0], q[1], el.id);
        return;
      }
      if (el.type === 'way') {
        const pts = ptsOf(el, proj);
        if (pts.length < 2) return;
        const closed = isClosed(el) && pts.length >= 3;
        if (t.building && closed) {
          const ring = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
          if (ring.length < 3) return;
          const hh = height(t);
          const c = gis.centroid(ring);
          d.buildings.push({ pts: ring, h: hh.h, lv: hh.lv, kind: t.building, cx: r1(c[0]), cy: r1(c[1]), area: Math.round(Math.abs(gis.area(ring))) });
          if (t.amenity || t.shop) addPoi(t, c[0], c[1], el.id);
          return;
        }
        if (t.highway && ROAD[t.highway]) {
          if (t.highway === 'pedestrian' && closed) { // yaya alanı çokgeni: yeşil değil, yol sınıfı olarak çizgi
            d.roads.push({ pts: pts.concat([pts[0]]), cls: 'pedestrian', name: t.name || '' });
            return;
          }
          d.roads.push({ pts: pts, cls: ROAD[t.highway], name: t.name || '', nf: t.foot === 'no' || t.access === 'private' || t.access === 'no' ? 1 : 0, br: t.bridge && t.bridge !== 'no' ? 1 : 0, tn: t.tunnel && t.tunnel !== 'no' ? 1 : 0 });
          return;
        }
        if (t.railway) { d.rails.push({ pts: pts, kind: t.railway }); return; }
        if (t.natural === 'coastline') { coast.push(pts); return; }
        if (t.waterway) { d.water.push({ pts: pts, kind: t.waterway, line: 1 }); return; }
        if (t.natural === 'water' && closed) { d.water.push({ pts: pts.slice(0, -1), kind: t.water || 'water' }); return; }
        if (closed) {
          const ring = pts.slice(0, -1);
          if (ring.length >= 3) {
            addGreenOrLanduse(t, ring, true);
            if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'playground') {
              const c = gis.centroid(ring);
              if (Math.abs(gis.area(ring)) > 600) d.poi.push({ x: r1(c[0]), y: r1(c[1]), cat: 'rekreasyon', kind: t.leisure === 'playground' ? 'Oyun alanı' : 'Park', name: t.name || '', park: 1, r: r1(Math.sqrt(Math.abs(gis.area(ring))) / 2) });
            }
            if (t.amenity || t.shop) { const c = gis.centroid(ring); addPoi(t, c[0], c[1], el.id); }
          }
        } else if (t.amenity || t.shop) addPoi(t, pts[0][0], pts[0][1], el.id);
        return;
      }
      if (el.type === 'relation' && el.members) {
        const outers = [];
        el.members.forEach((m) => { if (m.type === 'way' && m.role !== 'inner' && m.geometry) outers.push(ptsOf(m, proj)); });
        const rings = joinWays(outers.filter((o) => o.length > 1));
        rings.forEach((ring) => {
          if (ring.length < 3) return;
          if (t.natural === 'water') d.water.push({ pts: ring, kind: t.water || 'water' });
          else addGreenOrLanduse(t, ring, true);
          if ((t.leisure === 'park' || t.leisure === 'garden') && Math.abs(gis.area(ring)) > 600) { const c = gis.centroid(ring); d.poi.push({ x: r1(c[0]), y: r1(c[1]), cat: 'rekreasyon', kind: 'Park', name: t.name || '', park: 1, r: r1(Math.sqrt(Math.abs(gis.area(ring))) / 2) }); }
        });
      }
    });

    // deniz
    if (coast.length) {
      const joined = [];
      // kıyı parçalarını uçtan uca birleştir (yön korunur)
      let rest = coast.map((c) => c.slice());
      while (rest.length) {
        let cur = rest.shift(), grew = true;
        while (grew) {
          grew = false;
          for (let i = 0; i < rest.length; i++) {
            const w = rest[i];
            const e = cur[cur.length - 1], s = cur[0];
            if (Math.hypot(e[0] - w[0][0], e[1] - w[0][1]) < 0.3) { cur = cur.concat(w.slice(1)); }
            else if (Math.hypot(s[0] - w[w.length - 1][0], s[1] - w[w.length - 1][1]) < 0.3) { cur = w.slice(0, -1).concat(cur); }
            else continue;
            rest.splice(i, 1); grew = true; break;
          }
        }
        joined.push(cur);
      }
      seaPolys(joined, R).forEach((p) => d.water.push({ pts: p.map((q) => [r1(q[0]), r1(q[1])]), kind: 'sea' }));
      joined.forEach((l) => d.water.push({ pts: l, kind: 'coast', line: 1 }));
    }
    return d;
  };

  osm.HEIGHT_DEFAULT = { house: 6, detached: 6, residential: 15, apartments: 18, commercial: 12, retail: 8, office: 18, industrial: 8, warehouse: 7, school: 10, hospital: 18, church: 12, mosque: 14, garage: 3, garages: 3, shed: 3, roof: 3, yes: 10 };
  osm.heightOf = function (b) {
    if (b.h) return b.h;
    if (b.lv) return b.lv * 3.1;
    return osm.HEIGHT_DEFAULT[b.kind] || 10;
  };

  /* yarıçapa kırpılmış görünüm (bellekte tutulur) */
  const clipMemo = new WeakMap();
  osm.clipped = function (data, R) {
    let m = clipMemo.get(data);
    if (m && m.R === R) return m.v;
    const cp = gis.circlePoly(R, 96);
    const inR = (x, y) => x * x + y * y <= R * R;
    const polys = (list) => {
      const out = [];
      list.forEach((o) => {
        const bb = gis.bbox(o.pts);
        if (bb.x1 < -R || bb.x0 > R || bb.y1 < -R || bb.y0 > R) return;
        let p = gis.ccw(o.pts);
        const inside = p.every((q) => inR(q[0], q[1]));
        const c = inside ? p : gis.clipPoly(p, cp);
        if (c.length >= 3 && Math.abs(gis.area(c)) > 1) out.push(Object.assign({}, o, { pts: c, full: o.pts }));
      });
      return out;
    };
    const lines = (list) => {
      const out = [];
      list.forEach((o) => {
        const bb = gis.bbox(o.pts);
        if (bb.x1 < -R || bb.x0 > R || bb.y1 < -R || bb.y0 > R) return;
        gis.clipLineToCircle(o.pts, R).forEach((s) => out.push(Object.assign({}, o, { pts: s })));
      });
      return out;
    };
    const v = {
      R: R,
      buildings: d_buildings(data, R),
      roads: lines(data.roads),
      rails: lines(data.rails),
      green: polys(data.green),
      landuse: polys(data.landuse),
      water: polys(data.water.filter((w) => !w.line)).concat(lines(data.water.filter((w) => w.line)).map((w) => Object.assign(w, { line: 1 }))),
      poi: data.poi.filter((p) => inR(p.x, p.y)),
      transit: data.transit.filter((p) => inR(p.x, p.y)),
    };
    clipMemo.set(data, { R: R, v: v });
    return v;
  };
  function d_buildings(data, R) {
    const out = [];
    data.buildings.forEach((b) => {
      if (b.cx * b.cx + b.cy * b.cy > R * R) return;
      out.push(b);
    });
    return out;
  }

  /* ---------------- sıkıştır / aç (önbellek ve demo için) ---------------- */
  // desimetre tamsayıları, ilk nokta mutlak, sonrakiler farklar (JSON'da çok daha kısa)
  const packPts = (p) => {
    const o = [];
    let px = 0, py = 0;
    for (let i = 0; i < p.length; i++) { const x = Math.round(p[i][0] * 10), y = Math.round(p[i][1] * 10); o.push(x - px, y - py); px = x; py = y; }
    return o;
  };
  const unpackPts = (a) => {
    const o = [];
    let x = 0, y = 0;
    for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; o.push([x / 10, y / 10]); }
    return o;
  };
  osm.pack = function (d) {
    return {
      v: 1, lat0: d.lat0, lon0: d.lon0, R: d.R, t: d.t,
      b: d.buildings.map((b) => [packPts(b.pts), b.h, b.lv, b.kind]),
      r: d.roads.map((r) => [packPts(r.pts), r.cls, r.name, r.nf ? 1 : 0, r.br ? 1 : 0, r.tn ? 1 : 0]),
      l: d.rails.map((r) => [packPts(r.pts), r.kind]),
      g: d.green.map((g) => [packPts(g.pts), g.kind, g.pub ? 1 : 0]),
      u: d.landuse.map((g) => [packPts(g.pts), g.kind]),
      w: d.water.map((w) => [packPts(w.pts), w.kind, w.line ? 1 : 0]),
      p: d.poi.map((p) => [Math.round(p.x * 10), Math.round(p.y * 10), p.cat, p.kind, p.name, p.park ? 1 : 0, p.r || 0]),
      s: d.transit.map((p) => [Math.round(p.x * 10), Math.round(p.y * 10), p.kind, p.name]),
    };
  };
  osm.unpack = function (o) {
    const d = { lat0: o.lat0, lon0: o.lon0, R: o.R, t: o.t, buildings: [], roads: [], rails: [], green: [], landuse: [], water: [], poi: [], transit: [] };
    o.b.forEach((b) => { const pts = unpackPts(b[0]); const c = gis.centroid(pts); d.buildings.push({ pts: pts, h: b[1], lv: b[2], kind: b[3], cx: Math.round(c[0] * 10) / 10, cy: Math.round(c[1] * 10) / 10, area: Math.round(Math.abs(gis.area(pts))) }); });
    o.r.forEach((r) => d.roads.push({ pts: unpackPts(r[0]), cls: r[1], name: r[2], nf: r[3], br: r[4], tn: r[5] }));
    o.l.forEach((r) => d.rails.push({ pts: unpackPts(r[0]), kind: r[1] }));
    o.g.forEach((g) => d.green.push({ pts: unpackPts(g[0]), kind: g[1], pub: g[2] }));
    o.u.forEach((g) => d.landuse.push({ pts: unpackPts(g[0]), kind: g[1] }));
    o.w.forEach((w) => d.water.push({ pts: unpackPts(w[0]), kind: w[1], line: w[2] }));
    o.p.forEach((p) => d.poi.push({ x: p[0] / 10, y: p[1] / 10, cat: p[2], kind: p[3], name: p[4], park: p[5], r: p[6] || 0 }));
    o.s.forEach((p) => d.transit.push({ x: p[0] / 10, y: p[1] / 10, kind: p[2], name: p[3] }));
    return d;
  };

  osm.counts = (d) => ({ bina: d.buildings.length, yol: d.roads.length, isl: d.poi.length, dur: d.transit.length, yesil: d.green.length });

  /* ---------------- ağ istemcileri ---------------- */
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  function withTimeout(ms, fn) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(function () { if (ac) ac.abort(); }, ms);
    return fn(ac ? ac.signal : undefined).then(function (v) { clearTimeout(tm); return v; }, function (e) { clearTimeout(tm); throw e; });
  }

  // tarayıcının İngilizce ağ hatası metinlerini Türkçeleştir
  function netMsg(e) {
    if (e && e.name === 'AbortError') return 'zaman aşımı';
    const m = String((e && e.message) || '');
    return /failed to fetch|networkerror|load failed|network request/i.test(m) ? 'ağ bağlantısı kurulamadı' : m;
  }
  osm.netMsg = netMsg;

  osm.fetchOverpass = function (lat, lon, R) {
    const body = 'data=' + encodeURIComponent(osm.query(lat, lon, R));
    let i = 0, lastErr = null;
    const next = function () {
      if (i >= ENDPOINTS.length) return Promise.reject(new Error('OpenStreetMap sunucularına ulaşılamadı' + (lastErr ? ' (' + lastErr + ')' : '') + '. Bağlantınızı kontrol edin ya da birkaç dakika sonra yeniden deneyin.'));
      const url = ENDPOINTS[i++];
      return withTimeout(45000, (signal) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, signal: signal }))
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((j) => { if (!j || !Array.isArray(j.elements)) throw new Error('beklenmeyen yanıt'); return j; })
        .catch((e) => { lastErr = netMsg(e); return next(); });
    };
    return next().then((json) => osm.parse(json, lat, lon, R));
  };

  // Adres / yer adı arama (Nominatim). "41.0082, 28.9784" biçimi doğrudan koordinat sayılır.
  osm.parseCoord = function (q) {
    const m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(String(q || ''));
    if (!m) return null;
    const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
    return { lat: lat, lon: lon, name: lat.toFixed(5) + ', ' + lon.toFixed(5) };
  };
  osm.geocode = function (q) {
    const c = osm.parseCoord(q);
    if (c) return Promise.resolve([c]);
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=tr&addressdetails=0&q=' + encodeURIComponent(q);
    return withTimeout(15000, (signal) => fetch(url, { signal: signal }))
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((list) => list.map((x) => ({ lat: parseFloat(x.lat), lon: parseFloat(x.lon), name: x.display_name, kind: x.type })))
      .catch((e) => { throw new Error('Adres araması yapılamadı' + (e && e.name === 'AbortError' ? ' (zaman aşımı)' : '') + '. Koordinat girerek devam edebilirsiniz (örn. 41.0082, 28.9784).'); });
  };
  osm.reverse = function (lat, lon) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=tr&lat=' + lat + '&lon=' + lon;
    return withTimeout(10000, (signal) => fetch(url, { signal: signal })).then((r) => r.json()).then((x) => {
      const a = x && x.address ? x.address : {};
      const nm = [a.road || a.pedestrian || a.neighbourhood || '', a.suburb || a.neighbourhood || a.quarter || '', a.city_district || a.town || a.city || a.county || ''].filter(Boolean);
      return nm.length ? nm.slice(0, 3).join(', ') : (x && x.display_name ? x.display_name.split(',').slice(0, 3).join(',') : null);
    }).catch(() => null);
  };

  // yükselti ızgarası: n×n nokta, [-R, R] karesi (Open-Meteo, en çok 100 nokta)
  osm.fetchElevation = function (lat0, lon0, R, n) {
    n = n || 10;
    const proj = gis.makeProj(lat0, lon0);
    const lats = [], lons = [], pts = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -R + (2 * R * i) / (n - 1), y = -R + (2 * R * j) / (n - 1);
      const ll = proj.inv(x, y);
      lats.push(ll[0].toFixed(5)); lons.push(ll[1].toFixed(5)); pts.push([x, y]);
    }
    const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + lats.join(',') + '&longitude=' + lons.join(',');
    return withTimeout(15000, (signal) => fetch(url, { signal: signal })).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => { if (!j || !Array.isArray(j.elevation) || j.elevation.length !== n * n) throw new Error('yükselti yanıtı eksik'); return { n: n, R: R, z: j.elevation.map((v) => (typeof v === 'number' ? v : 0)) }; });
  };

  // son tam yılın günlük hava verisi → aylık ortalamalar + rüzgâr gülü + aylık radyasyon
  osm.fetchClimate = function (lat, lon) {
    const yr = new Date().getFullYear() - 1;
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
      '&start_date=' + yr + '-01-01&end_date=' + yr + '-12-31&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum&timezone=auto';
    return withTimeout(25000, (signal) => fetch(url, { signal: signal })).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => osm.climateFrom(j, yr));
  };
  osm.climateFrom = function (j, yr) {
    const d = j && j.daily;
    if (!d || !d.time) throw new Error('iklim yanıtı eksik');
    const mon = [];
    for (let m = 0; m < 12; m++) mon.push({ t: 0, tn: 0, p: 0, rad: 0, n: 0 });
    const bins = new Array(16).fill(0), spd = new Array(16).fill(0);
    let wn = 0;
    d.time.forEach((day, i) => {
      const m = parseInt(day.slice(5, 7), 10) - 1;
      const t = d.temperature_2m_mean[i], p = d.precipitation_sum[i], rad = d.shortwave_radiation_sum[i], ws = d.wind_speed_10m_max[i], wd = d.wind_direction_10m_dominant[i];
      if (typeof t === 'number') { mon[m].t += t; mon[m].tn++; }
      if (typeof p === 'number') mon[m].p += p;
      if (typeof rad === 'number') mon[m].rad += rad / 3.6; // MJ/m² → kWh/m²
      if (typeof wd === 'number' && typeof ws === 'number') { const b = Math.round(wd / 22.5) % 16; bins[b]++; spd[b] += ws; wn++; }
    });
    const out = { year: yr, monthly: mon.map((x) => ({ t: x.tn ? Math.round((x.t / x.tn) * 10) / 10 : null, p: Math.round(x.p), rad: Math.round(x.rad) })), wind: bins.map((c, i) => ({ dir: i * 22.5, share: wn ? c / wn : 0, speed: c ? spd[i] / c : 0 })) };
    const main = out.wind.slice().sort((a, b) => b.share - a.share)[0];
    out.dominant = main && main.share > 0 ? { dir: main.dir, share: main.share, speed: main.speed } : null;
    return out;
  };

  /* ---------------- önbellek ---------------- */
  const mem = new Map();
  const LS_KEY = 'archtools.geo.cache';
  osm.key = (lat, lon) => lat.toFixed(4) + ',' + lon.toFixed(4);
  osm.needRadius = (R, walkMin) => Math.round(Math.max(300, Math.min(1100, Math.max(R, walkMin * 80 * 0.92))) + 40);

  osm.cacheGet = function (lat, lon, Rneed) {
    const k = osm.key(lat, lon);
    const e = mem.get(k);
    if (e && e.data.R >= Rneed - 1) return e;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        const hit = arr.find((x) => x.k === k && x.d.R >= Rneed - 1);
        if (hit) {
          const ent = { key: k, data: osm.unpack(hit.d), elev: hit.e || null, climate: hit.c || null, demo: false, source: hit.s || 'osm', iso: hit.i || null };
          mem.set(k, ent);
          return ent;
        }
      }
    } catch (err) { /* önbellek yoksa sessizce atla */ }
    return null;
  };
  osm.cachePut = function (ent) {
    mem.set(ent.key, ent);
    if (mem.size > 8) mem.delete(mem.keys().next().value);
    if (ent.demo) return;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      let arr = raw ? JSON.parse(raw) : [];
      arr = arr.filter((x) => x.k !== ent.key);
      arr.unshift({ k: ent.key, d: osm.pack(ent.data), e: ent.elev, c: ent.climate, s: ent.source || 'osm', i: ent.iso || null });
      arr = arr.slice(0, 3);
      let s = JSON.stringify(arr);
      while (s.length > 2.4e6 && arr.length > 1) { arr.pop(); s = JSON.stringify(arr); }
      if (s.length <= 2.4e6) window.localStorage.setItem(LS_KEY, s);
    } catch (err) { /* kota dolu olabilir */ }
  };

  /* Tam çekim: Overpass zorunlu; yükselti ve iklim isteğe bağlı (hata verirse boş kalır) */
  osm.fetchAll = function (lat, lon, Rf, progress) {
    const say = (m) => { if (progress) progress(m); };
    say('Bina, yol ve işlev verisi alınıyor…');
    const pElev = osm.fetchElevation(lat, lon, Math.min(Rf, 900), 10).catch(() => null);
    const pClim = osm.fetchClimate(lat, lon).catch(() => null);
    return osm.fetchOverpass(lat, lon, Rf).then((data) => {
      say('Yükselti ve iklim verisi alınıyor…');
      return Promise.all([pElev, pClim]).then((r) => {
        const ent = { key: osm.key(lat, lon), data: data, elev: r[0], climate: r[1], demo: false };
        osm.cachePut(ent);
        return ent;
      });
    });
  };
})();
