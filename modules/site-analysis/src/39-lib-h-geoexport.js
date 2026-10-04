/* ==========================================================================
   39-lib-h-geoexport.js — CAD / GIS / tablo dışa aktarma (Modül 4, 5, 6 ortak)
   Ortak ara biçim "özellik listesi": { layer, type: 'polygon' | 'line' | 'point' | 'text', pts, props, text? }
   Koordinatlar yerel metredir (x doğu, y kuzey, çalışma noktası merkez). Biçimler:
     · GeoJSON  (WGS84 boylam/enlem — QGIS, ArcGIS, geojson.io)
     · DXF R12  (metre, katmanlı — AutoCAD, Rhino, Revit, ArchiCAD, LibreCAD)
     · CSV      (Türkçe Excel uyumlu: ; ayracı, virgüllü ondalık, UTF-8 BOM)
     · SVG      (pafta primitiflerinden vektör)
   Saf mantık: dosya kaydetme çağıran tarafa bırakılır (App.files.saveBlob).
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const site = App.site;
  const Z = App.zoning;
  const GX = (App.geoExport = {});

  /* ---------------- özellik toplayıcılar ---------------- */
  const poly = (layer, pts, props) => ({ layer: layer, type: 'polygon', pts: pts, props: props || {} });
  const line = (layer, pts, props) => ({ layer: layer, type: 'line', pts: pts, props: props || {} });
  const point = (layer, p, props) => ({ layer: layer, type: 'point', pts: [p], props: props || {} });
  const text = (layer, p, s, props) => ({ layer: layer, type: 'text', pts: [p], text: s, props: props || {} });

  const r2 = (v) => Math.round(v * 100) / 100;

  /* Arsa Analizi: harita katmanlarının tamamı */
  GX.collectArsa = function (project, A) {
    const F = [];
    const cl = A.clip;
    F.push(poly('yaricap', gis.circlePoly(A.R, 96), { radiusM: A.R }));
    cl.buildings.forEach((b) => F.push(poly('bina', b.pts, { heightM: r2(osm.heightOf(b)), kind: b.kind || '', use: site.useOf(b.kind) })));
    cl.roads.forEach((r) => { if (r.pts.length > 1) F.push(line('yol', r.pts, { class: r.cls, name: r.name || '' })); });
    cl.rails.forEach((r) => { if (r.pts.length > 1) F.push(line('ray', r.pts, { kind: r.kind || '' })); });
    cl.green.forEach((g) => F.push(poly('yesil', g.pts, { kind: g.kind || '', name: g.name || '' })));
    cl.water.forEach((w) => { if (w.line) { if (w.pts.length > 1) F.push(line('su', w.pts, { kind: w.kind || '' })); } else F.push(poly('su', w.pts, { kind: w.kind || '' })); });
    A.pois.filter((p) => p.inR).forEach((p) => F.push(point('islev', [p.x, p.y], { category: p.cat, kind: p.kind || '', name: p.name || '', walkMin: p.min == null ? '' : r2(p.min) })));
    cl.transit.forEach((p) => F.push(point('durak', [p.x, p.y], { kind: p.kind || '', name: p.name || '' })));
    A.iso.forEach((b) => b.segs.forEach((q) => F.push(line('erisim_' + b.min, [[q[0], q[1]], [q[2], q[3]]], { minutes: b.min }))));
    F.push(point('merkez', [0, 0], { name: project.site.loc.name }));
    const s = project.site;
    if (s.parcel) addParcel(F, project, A, null);
    return F;
  };

  function addParcel(F, project, A, R) {
    const s = project.site;
    if (!s.parcel) return;
    const e = site.entry(s);
    if (!R) R = Z.compute(s.imar, s.parcel, e ? { data: e.data, A: A || site.analyze(s, e), lat: e.data.lat0, parcel: s.parcel } : null);
    F.push(poly('parsel', s.parcel, { areaM2: r2(Math.abs(gis.area(s.parcel))) }));
    if (R.env && R.env.length >= 3) F.push(poly('zarf', R.env, { areaM2: r2(R.Aenv) }));
    if (R.ok) R.pieces.forEach((p) => F.push(poly('kutle', p, { floors: R.floors, heightM: r2(R.height), footprintM2: r2(R.footprint), totalM2: r2(R.built) })));
    (R.edges || []).forEach((ed) => F.push(line('parsel_kenar', [ed.a, ed.b], { kind: ed.kind, lengthM: r2(ed.len), road: ed.roadName || '' })));
  }

  /* İmar ve kapasite: parsel, zarf, kütle, gölge, çevre yapıları */
  GX.collectImar = function (project, A, R) {
    const F = [];
    const s = project.site;
    if (!s.parcel) return F;
    const e = site.entry(s);
    addParcel(F, project, A, R);
    if (R && R.shadow) R.shadow.polys.forEach((p) => { if (p.length >= 3) F.push(poly('golge', p, { day: R.shadow.day.label, hour: s.imar.hour })); });
    if (e) {
      const c = gis.centroid(s.parcel);
      e.data.buildings.forEach((b) => { if (Math.hypot(b.cx - c[0], b.cy - c[1]) <= 220 && !gis.pointInPoly([b.cx, b.cy], s.parcel)) F.push(poly('bina', b.pts, { heightM: r2(osm.heightOf(b)), kind: b.kind || '' })); });
      e.data.roads.forEach((r) => { if (r.pts.length > 1 && r.pts.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) <= 220)) F.push(line('yol', r.pts, { class: r.cls, name: r.name || '' })); });
    }
    return F;
  };

  // yerel koordinatların başlangıcı: tarama varsa tarama merkezi, yoksa ilk aday
  GX.yerRef = function (project, ctx) {
    if (ctx && ctx.scan) return [ctx.scan.lat0, ctx.scan.lon0];
    const c = project.cand && project.cand.list[0];
    return c ? [c.lat, c.lon] : [project.site.loc.lat, project.site.loc.lon];
  };

  /* Yer Seçimi: adaylar ve (varsa) tarama hücreleri */
  GX.collectYer = function (project, ctx) {
    const F = [];
    const cand = project.cand;
    const ref = GX.yerRef(project, ctx);
    const PJ = ref ? gis.makeProj(ref[0], ref[1]) : null;
    if (ctx.cmp) ctx.cmp.rows.forEach((r) => {
      F.push(point('aday', PJ ? PJ.fwd(r.c.lat, r.c.lon).map((v) => Math.round(v * 10) / 10) : [r.c.dx || 0, r.c.dy || 0], { name: r.c.name, rank: r.rank || '', score: r.score == null ? '' : r.score, passes: r.pass == null ? '' : r.pass, lat: r.c.lat, lon: r.c.lon }));
    });
    const sc = ctx.scan;
    if (sc) {
      const half = sc.step / 2;
      sc.cells.forEach((c) => {
        if (c.score == null) return;
        F.push(poly('tarama', [[c.x - half, c.y - half], [c.x + half, c.y - half], [c.x + half, c.y + half], [c.x - half, c.y + half]], { score: c.score, passes: c.pass }));
      });
      sc.peaks.forEach((p, i) => F.push(point('en_iyi', [p.x, p.y], { rank: i + 1, score: p.score })));
    }
    void cand;
    return F;
  };

  /* ---------------- GeoJSON ---------------- */
  const r7 = (v) => Math.round(v * 1e7) / 1e7;
  GX.geojson = function (features, lat0, lon0, meta) {
    const P = gis.makeProj(lat0, lon0);
    const ll = (q) => { const p = P.inv(q[0], q[1]); return [r7(p[1]), r7(p[0])]; };
    const out = [];
    features.forEach((f) => {
      if (f.type === 'text') return;
      const props = Object.assign({ layer: f.layer }, f.props);
      let g;
      if (f.type === 'point') g = { type: 'Point', coordinates: ll(f.pts[0]) };
      else if (f.type === 'line') g = { type: 'LineString', coordinates: f.pts.map(ll) };
      else {
        const ring = f.pts.map(ll);
        const a = ring[0], b = ring[ring.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a);
        g = { type: 'Polygon', coordinates: [ring] };
      }
      out.push({ type: 'Feature', properties: props, geometry: g });
    });
    return JSON.stringify({ type: 'FeatureCollection', name: 'archtools', archtools: Object.assign({ origin: { lat: lat0, lon: lon0 }, localUnit: 'm' }, meta || {}), features: out });
  };

  /* ---------------- DXF R12 ---------------- */
  // ACI renkleri: 1 kırmızı · 2 sarı · 3 yeşil · 4 camgöbeği · 5 mavi · 6 eflatun · 7 beyaz/siyah · 8 koyu gri · 9 açık gri
  const DXF_LAYERS = {
    yaricap: ['ARCH_YARICAP', 8], bina: ['ARCH_BINA', 9], yol: ['ARCH_YOL', 7], ray: ['ARCH_RAY', 1], yesil: ['ARCH_YESIL', 3], su: ['ARCH_SU', 5],
    islev: ['ARCH_ISLEV', 6], durak: ['ARCH_DURAK', 30], merkez: ['ARCH_MERKEZ', 1], parsel: ['ARCH_PARSEL', 1], zarf: ['ARCH_ZARF', 4], kutle: ['ARCH_KUTLE', 2],
    golge: ['ARCH_GOLGE', 8], parsel_kenar: ['ARCH_PARSEL_KENAR', 1], aday: ['ARCH_ADAY', 1], tarama: ['ARCH_TARAMA', 3], en_iyi: ['ARCH_EN_IYI', 2], yazi: ['ARCH_YAZI', 7],
    erisim_5: ['ARCH_ERISIM_5', 1], erisim_10: ['ARCH_ERISIM_10', 30], erisim_15: ['ARCH_ERISIM_15', 2],
  };
  const dxfLayer = (id) => (DXF_LAYERS[id] || ['ARCH_' + String(id).toUpperCase().replace(/[^A-Z0-9_]/g, '_'), 7]);
  const n6 = (v) => (Math.round(v * 1e4) / 1e4).toFixed(4);

  /* KML (Google Earth): GeoJSON ile aynı geometri, katman başına klasör */
  GX.kml = function (features, lat0, lon0, name) {
    const P = gis.makeProj(lat0, lon0);
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ll = (q) => { const p = P.inv(q[0], q[1]); return r7(p[1]) + ',' + r7(p[0]) + ',0'; };
    const byLayer = {};
    features.forEach((f) => { if (f.type === 'text') return; (byLayer[f.layer || 'katman'] = byLayer[f.layer || 'katman'] || []).push(f); });
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc(name || 'archtools') + '</name>\n';
    Object.keys(byLayer).forEach((ly) => {
      x += '<Folder><name>' + esc(ly) + '</name>\n';
      byLayer[ly].forEach((f) => {
        const props = f.props || {};
        const ext = Object.keys(props).map((k) => '<Data name="' + esc(k) + '"><value>' + esc(props[k]) + '</value></Data>').join('');
        let g;
        if (f.type === 'point') g = '<Point><coordinates>' + ll(f.pts[0]) + '</coordinates></Point>';
        else if (f.type === 'line') g = '<LineString><coordinates>' + f.pts.map(ll).join(' ') + '</coordinates></LineString>';
        else { const ring = f.pts.map(ll); ring.push(ring[0]); g = '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + ring.join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon>'; }
        x += '<Placemark><name>' + esc(props.name || props.label || ly) + '</name><ExtendedData>' + ext + '</ExtendedData>' + g + '</Placemark>\n';
      });
      x += '</Folder>\n';
    });
    return x + '</Document></kml>';
  };

  GX.dxf = function (features) {
    const used = {};
    const E = [];
    const g = (code, val) => { E.push(String(code)); E.push(String(val)); };
    features.forEach((f) => {
      const L = dxfLayer(f.layer);
      used[L[0]] = L[1];
      if (f.type === 'polygon' || f.type === 'line') {
        if (f.pts.length < 2) return;
        g(0, 'POLYLINE'); g(8, L[0]); g(66, 1); g(70, f.type === 'polygon' ? 1 : 0);
        f.pts.forEach((q) => { g(0, 'VERTEX'); g(8, L[0]); g(10, n6(q[0])); g(20, n6(q[1])); g(30, '0.0'); });
        g(0, 'SEQEND'); g(8, L[0]);
      } else if (f.type === 'point') {
        g(0, 'CIRCLE'); g(8, L[0]); g(10, n6(f.pts[0][0])); g(20, n6(f.pts[0][1])); g(30, '0.0'); g(40, f.layer === 'merkez' ? '4.0' : '2.0');
      } else if (f.type === 'text') {
        g(0, 'TEXT'); g(8, L[0]); g(10, n6(f.pts[0][0])); g(20, n6(f.pts[0][1])); g(30, '0.0'); g(40, (f.props && f.props.height) || '3.0'); g(1, asciiTr(f.text));
      }
    });
    const H = [];
    const h = (code, val) => { H.push(String(code)); H.push(String(val)); };
    h(0, 'SECTION'); h(2, 'HEADER'); h(9, '$ACADVER'); h(1, 'AC1009'); h(0, 'ENDSEC');
    h(0, 'SECTION'); h(2, 'TABLES');
    h(0, 'TABLE'); h(2, 'LTYPE'); h(70, 1); h(0, 'LTYPE'); h(2, 'CONTINUOUS'); h(70, 0); h(3, 'Solid line'); h(72, 65); h(73, 0); h(40, '0.0'); h(0, 'ENDTAB');
    const names = Object.keys(used);
    h(0, 'TABLE'); h(2, 'LAYER'); h(70, names.length + 1);
    h(0, 'LAYER'); h(2, '0'); h(70, 0); h(62, 7); h(6, 'CONTINUOUS');
    names.forEach((n) => { h(0, 'LAYER'); h(2, n); h(70, 0); h(62, used[n]); h(6, 'CONTINUOUS'); });
    h(0, 'ENDTAB');
    h(0, 'ENDSEC');
    h(0, 'SECTION'); h(2, 'ENTITIES');
    return H.join('\n') + '\n' + E.join('\n') + '\n0\nENDSEC\n0\nEOF\n';
  };
  const TR = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U', 'â': 'a', 'î': 'i', 'û': 'u', '²': '2' };
  function asciiTr(s) { return String(s == null ? '' : s).replace(/[çÇğĞıİöÖşŞüÜâîû²]/g, (c) => TR[c] || c).replace(/[^\x20-\x7e]/g, '?'); }
  GX.asciiTr = asciiTr;

  /* ---------------- CSV ---------------- */
  // rows: dizi dizisi (sayılar virgüllü ondalıkla yazılır)
  GX.csv = function (rows) {
    const cell = (v) => {
      if (v == null) return '';
      if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '';
      if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
      const s = String(v);
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  };

  GX.csvArsa = function (project, A) {
    const s = project.site;
    const rows = [['archtools · Arsa analizi'], ['Konum', s.loc.name], ['Enlem', s.loc.lat], ['Boylam', s.loc.lon], ['Yarıçap (m)', A.R], ['Yürüme süresi (dk)', s.walkMin], ['Program', A.template.label], ['Veri', A.demo ? 'Demo (sentetik)' : (App.ui.site && App.ui.site.sourceName ? App.ui.site.sourceName(App.site.entry(s)) : 'OpenStreetMap')], ['Konum skoru (%)', A.score], []];
    rows.push(['Skor bileşeni', 'Değer (0-1)', 'Ağırlık']);
    A.parts.forEach((p) => rows.push([p.label, Math.round(p.v * 1000) / 1000, p.w]));
    rows.push([]);
    rows.push(['İşlev kategorisi', 'En yakın (dk)', '5 dk içinde', '10 dk içinde', '15 dk içinde', 'Yarıçap içinde toplam']);
    A.cats.forEach((c) => rows.push([c.label, c.nearMin == null ? '' : Math.round(c.nearMin * 10) / 10, c.c5, c.c10, c.c15, c.total]));
    rows.push([]);
    rows.push(['Çevre ölçüsü', 'Değer']);
    [['Bina sayısı', A.built.count], ['Taban alanı oranı (TAKS)', A.built.coverage], ['Tahmini emsal (KAKS)', A.built.far], ['Yeşil alan payı', A.green.share], ['Yol ağı yoğunluğu (km/km²)', A.mob.density], ['Kesişim yoğunluğu (/km²)', A.mob.interDensity], ['Durak (10 dk içinde)', A.transit.in10], ['Gürültü göstergesi', A.noise.cls.label]].forEach((r) => rows.push(r));
    rows.push([]);
    rows.push(['İşlev noktası', 'Kategori', 'Tür', 'Yürüme (dk)']);
    A.pois.filter((p) => p.inR).forEach((p) => rows.push([p.name || '', osm.cat(p.cat).label, p.kind || '', p.min == null ? '' : Math.round(p.min * 10) / 10]));
    return GX.csv(rows);
  };

  GX.csvImar = function (project, R) {
    const im = project.site.imar;
    const use = Z.use(im.use);
    const rows = [['archtools · İmar ve kapasite'], ['Proje', project.meta.name], ['Program', use.label], [], ['Parametre', 'Değer']];
    [['TAKS', im.taks], ['KAKS (emsal)', im.kaks], ['Yençok (m)', im.hmax], ['Kat yüksekliği (m)', im.floorH], ['Ön çekme (m)', im.setback.on], ['Yan çekme (m)', im.setback.yan], ['Arka çekme (m)', im.setback.arka], ['Kütle biçimi', (Z.FORMS.find((f) => f.id === im.form) || {}).label], ['Net/brüt verim', im.eff], ['Ortalama birim net alan (m²)', im.unit], ['Birim başına araç', im.cars], ['Birim başına kişi', im.per], ['Bodrum kat sayısı', im.basement]].forEach((r) => rows.push(r));
    rows.push([]);
    rows.push(['Sonuç', 'Değer']);
    if (R && R.ok) {
      const f = R.facts;
      [['Parsel alanı (m²)', R.A], ['Yapılabilir alan (m²)', R.Aenv], ['Taban alanı (m²)', R.footprint], ['Kat sayısı', R.floors], ['Yükseklik (m)', R.height], ['Toplam inşaat alanı (m²)', R.built], ['Kullanılan TAKS', f.taksUsed], ['Kullanılan KAKS', f.kaksUsed], ['Net kullanım alanı (m²)', f.net], [use.unitName + ' sayısı', f.units], ['Tahmini ' + use.perName, f.people], ['Gerekli otopark', f.carsNeed], ['Bodrum otopark kapasitesi', f.carsCap], ['Açık alan payı', f.freeShare]].forEach((r) => rows.push(r));
    } else rows.push(['Hesaplanamadı', R && R.reason ? R.reason : '']);
    if (im.scn.length) {
      rows.push([]);
      rows.push(['Senaryo', 'Kat', 'Emsal', 'Toplam inşaat (m²)', 'Birim']);
      im.scn.forEach((c) => { const s = c.sum || {}; rows.push([c.name, s.floors, s.kaks, s.built, s.units]); });
    }
    return GX.csv(rows);
  };

  GX.csvYer = function (project, ctx) {
    const rows = [['archtools · Yer seçimi'], ['Proje', project.meta.name], []];
    if (ctx.cmp && ctx.cmp.ranked.length) {
      rows.push(['Sıra', 'Aday', 'Skor (%)', 'Filtreleri geçti'].concat(site.PARTS.map((p) => p.label)).concat(['Elenme nedeni']));
      ctx.cmp.ranked.forEach((r) => rows.push([r.rank, r.c.name, r.score, r.pass].concat(r.parts.map((p) => Math.round(p.v * 1000) / 1000)).concat([r.fail.join(' | ')])));
      rows.push([]);
      rows.push(['Ağırlık'].concat(site.PARTS.map((p) => p.label)));
      rows.push(['Değer'].concat(site.PARTS.map((p) => (ctx.cmp.w[p.id] == null ? '' : Math.round(ctx.cmp.w[p.id] * 100) / 100))));
    }
    if (ctx.scan) {
      rows.push([]);
      rows.push(['Tarama hücresi x (m)', 'y (m)', 'Skor (%)', 'Filtreleri geçti']);
      ctx.scan.cells.forEach((c) => { if (c.score != null) rows.push([c.x, c.y, c.score, c.pass]); });
    }
    return GX.csv(rows);
  };

  /* ---------------- SVG ---------------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n1 = (v) => Math.round(v * 100) / 100;
  GX.svg = function (prims, W, H, title) {
    const F = App.FONTS || {};
    const shadowDefs = [];
    const out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">', '<title>' + esc(title || 'archtools') + '</title>'];
    prims.forEach((p) => {
      const a = [];
      if (p.opacity != null) a.push('opacity="' + p.opacity + '"');
      const st = () => {
        if (p.stroke) { a.push('stroke="' + p.stroke + '" stroke-width="' + p.sw + '" stroke-linejoin="round"'); if (p.cap) a.push('stroke-linecap="' + p.cap + '"'); }
        if (p.dash) a.push('stroke-dasharray="' + p.dash.join(' ') + '"');
      };
      switch (p.t) {
        case 'rect': a.push('x="' + n1(p.x) + '" y="' + n1(p.y) + '" width="' + n1(p.w) + '" height="' + n1(p.h) + '" fill="' + (p.fill || 'none') + '"'); if (p.rx) a.push('rx="' + p.rx + '"'); st(); out.push('<rect ' + a.join(' ') + '/>'); break;
        case 'circle': a.push('cx="' + n1(p.cx) + '" cy="' + n1(p.cy) + '" r="' + n1(p.r) + '" fill="' + (p.fill || 'none') + '"'); st(); out.push('<circle ' + a.join(' ') + '/>'); break;
        case 'line': a.push('x1="' + n1(p.x1) + '" y1="' + n1(p.y1) + '" x2="' + n1(p.x2) + '" y2="' + n1(p.y2) + '" stroke="' + p.stroke + '" stroke-width="' + p.sw + '" stroke-linecap="' + (p.cap || 'butt') + '"'); if (p.dash) a.push('stroke-dasharray="' + p.dash.join(' ') + '"'); out.push('<line ' + a.join(' ') + '/>'); break;
        case 'poly': a.push('points="' + p.pts.map((q) => n1(q[0]) + ',' + n1(q[1])).join(' ') + '" fill="' + (p.fill || 'none') + '"'); st(); out.push('<polygon ' + a.join(' ') + '/>'); break;
        case 'path': a.push('d="' + p.d + '" fill="' + (p.fill || 'none') + '"'); st(); out.push('<path ' + a.join(' ') + '/>'); break;
        case 'text': {
          const font = esc(F[p.fam] || F.b || 'sans-serif');
          if (p.xf) a.push('x="0" y="0" transform="matrix(' + p.xf.map((v) => Math.round(v * 1000) / 1000).join(' ') + ' ' + n1(p.x) + ' ' + n1(p.y) + ')"');
          else a.push('x="' + n1(p.x) + '" y="' + n1(p.y) + '"');
          a.push('fill="' + p.fill + '" font-family="' + font + '" font-size="' + p.size + '" font-weight="' + p.weight + '" text-anchor="' + (p.anchor || 'start') + '"');
          if (p.ls) a.push('letter-spacing="' + p.ls + '"');
          out.push('<text ' + a.join(' ') + '>' + esc(p.s) + '</text>');
          break;
        }
        default:
      }
    });
    void shadowDefs;
    out.push('</svg>');
    return out.join('\n');
  };
})();
