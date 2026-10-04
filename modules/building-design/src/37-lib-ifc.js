/* ==========================================================================
   37-lib-ifc.js — IFC4 (ISO 10303-21 / STEP fiziksel dosya) yazıcısı: App.ifc
   Tarayıcıda çalışır, bağımlılık yoktur; dosya kaydetme çağıran tarafa bırakılır.
   Revit, ArchiCAD, BIMvision, Solibri, FreeCAD, Blender (BlenderBIM) uyumlu IFC4 üretir.

   Giriş modeli (metre; yerel koordinat x doğu, y kuzey; yerel başlangıç = geo noktası):
   {
     name, description?, author?, organization?, createdAt? (ISO),
     geo: { lat, lon, elev?: 0 },              // IfcSite RefLatitude/RefLongitude/RefElevation
     parcel: [[x,y], ...],                      // parsel sınırı (IfcSite 'FootPrint' eğrisi + Qto_SiteBaseQuantities)
     storeys: [{
       name, elevation, height,                 // elevation = bitmiş döşeme üst kotu (bodrum negatif)
       slabThickness?: 0.25,
       slabs:   [{ ring, thickness?, kind: 'floor'|'roof'|'base', name?, top?: 0 }],   // döşeme: üst yüzü kat kotu + top, aşağı doğru kalınlık
       walls:   [{ a:[x,y], b:[x,y], thickness?: 0.2, height?, kind: 'exterior'|'interior', name? }],
       spaces:  [{ name, longName?, usage?, ring, height?, area?, props?: { anahtar: değer } }],
       columns: [{ x, y, w?: 0.4, d?: 0.4 }],
       stalls:  [{ ring, name? }]               // otopark yeri: IfcSpace PARKING
     }],
     psets?: { building?: {...}, site?: {...}, project?: {...} }   // özel IfcPropertySet (Pset_Archtools*)
   }
   Kat içi varsayılan temiz yükseklik = height − slabThickness (duvar / mekan / kolon bu yüksekliği alır;
   böylece üstteki katın döşemesi ile çakışmaz). Çatı için kat kotu = son katın üst kotu olan ayrı bir
   kat verilir ve çatı döşemesi o katın içine 'roof' olarak konur (üst yüzü o kotta).

   Not: IfcLocalPlacement bir ürüne özgüdür (IFC4 PlacesObject [0:1]); nokta, yön, eksen yerleşimi, profil,
   katı, stil ve ortak Pset'ler ise yinelenmesin diye paylaşılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const IFC = (App.ifc = {});
  IFC.version = '1.0';

  /* ---------------- sayı ve metin biçimleri ---------------- */
  const fin = (v, d) => { v = Number(v); return isFinite(v) ? v : (d == null ? 0 : d); };
  const pos = (v, d) => { v = Number(v); return isFinite(v) && v > 0 ? v : d; };
  const r4 = (v) => Math.round(v * 1e4) / 1e4;

  // SPF gerçek sayı: her zaman '.' içerir ('1.' gibi), NaN/Infinity üretmez, üstel gösterim yok
  function num(v) {
    v = Number(v);
    if (!isFinite(v)) v = 0;
    v = Math.max(-1e15, Math.min(1e15, v));
    let s = String(Math.round(v * 1e6) / 1e6);
    if (/e/i.test(s)) s = v.toFixed(6);
    if (s === '-0') s = '0';
    return s.indexOf('.') < 0 ? s + '.' : s;
  }
  const int = (v) => String(Math.round(fin(v)) || 0);
  const hex = (n, w) => ('00000000' + n.toString(16).toUpperCase()).slice(-w);

  // SPF metin: apostrof ve ters eğik çizgi ikilenir; ASCII dışı \X2\....\X0\ (BMP) / \X4\........\X0\
  function uni(run) {
    let out = '', buf = '';
    const flush = () => { if (buf) { out += '\\X2\\' + buf + '\\X0\\'; buf = ''; } };
    for (const ch of run) {
      const cp = ch.codePointAt(0);
      if (cp > 0xffff) { flush(); out += '\\X4\\' + hex(cp, 8) + '\\X0\\'; } else buf += hex(cp, 4);
    }
    flush();
    return out;
  }
  function esc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]+/g, uni);
  }
  const str = (s) => (s == null || s === '' ? '$' : "'" + esc(s) + "'");
  IFC.str = str;
  IFC.num = num;

  /* ---------------- GlobalId: 128 bit → 22 karakter IFC base64 ---------------- */
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  // cyrb128: dizgeden 4 × 32 bit karma
  function hash128(s) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < s.length; i++) {
      const k = s.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  // standart IfcGloballyUniqueId sıkıştırması: ilk bayt 2 karakter, sonra 5 × (3 bayt → 4 karakter)
  function compress(b) {
    const enc = (v, l) => { let s = ''; for (let i = l - 1; i >= 0; i--) s += B64[Math.floor(v / Math.pow(64, i)) % 64]; return s; };
    let out = enc(b[0], 2);
    for (let i = 1; i < 16; i += 3) out += enc((b[i] << 16) | (b[i + 1] << 8) | b[i + 2], 4);
    return out;
  }
  IFC.guid = function (seed) {
    const h = hash128(String(seed));
    const b = [];
    h.forEach((w) => { b.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255); });
    return compress(b);
  };

  /* ---------------- SPF yazıcısı ---------------- */
  const R = (id) => '#' + id;
  const RL = (ids) => '(' + ids.map(R).join(',') + ')';
  function createWriter() {
    const lines = [];
    const seen = Object.create(null);
    let n = 0;
    const w = {
      lines: lines,
      add: (type, args) => { n++; lines.push('#' + n + '=' + type + '(' + args + ');'); return n; },
      // değer tipi varlıklar (nokta, yön, profil, katı...) aynı içerikle bir kez yazılır
      def: (type, args) => { const k = type + '(' + args + ')'; return seen[k] || (seen[k] = w.add(type, args)); },
    };
    return w;
  }

  /* ---------------- geometri yardımcıları ---------------- */
  // halka temizliği: tekrar eden noktalar atılır, CCW'ye çevrilir, {pts, area, perim} döner (geçersizse null)
  function cleanRing(ring) {
    if (!Array.isArray(ring)) return null;
    const out = [];
    ring.forEach((p) => {
      if (!p) return;
      const x = Number(p[0]), y = Number(p[1]);
      if (!isFinite(x) || !isFinite(y)) return;
      const q = [r4(x), r4(y)];
      const l = out[out.length - 1];
      if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
    });
    while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
    if (out.length < 3) return null;
    let a = 0, per = 0;
    for (let i = 0; i < out.length; i++) {
      const p = out[i], q = out[(i + 1) % out.length];
      a += p[0] * q[1] - q[0] * p[1];
      per += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    a /= 2;
    if (Math.abs(a) < 1e-6) return null;
    if (a < 0) out.reverse();
    return { pts: out, area: Math.abs(a), perim: per };
  }

  // enlem/boylam → IfcCompoundPlaneAngleMeasure (derece, dakika, saniye, milyonda bir saniye; hepsi aynı işaretli)
  function dms(v) {
    const sg = v < 0 ? -1 : 1;
    let a = Math.abs(v);
    let d = Math.floor(a); a = (a - d) * 60;
    let m = Math.floor(a); a = (a - m) * 60;
    let s = Math.floor(a);
    let u = Math.round((a - s) * 1e6);
    if (u >= 1e6) { u -= 1e6; s++; }
    if (s >= 60) { s -= 60; m++; }
    if (m >= 60) { m -= 60; d++; }
    return '(' + [d, m, s, u].map((x) => String((sg * x) || 0)).join(',') + ')';
  }

  // yüzey renkleri: [r, g, b, saydamlık, ad]
  const STYLE = {
    wall_ext: [0.84, 0.84, 0.82, 0, 'Duvar-dis'],
    wall_int: [0.93, 0.93, 0.91, 0, 'Duvar-ic'],
    slab_floor: [0.6, 0.6, 0.63, 0, 'Doseme'],
    slab_base: [0.47, 0.47, 0.5, 0, 'Temel'],
    slab_roof: [0.4, 0.43, 0.48, 0, 'Cati'],
    column: [0.52, 0.52, 0.56, 0, 'Kolon'],
    space: [0.55, 0.75, 0.95, 0.7, 'Mekan'],
    stall: [0.96, 0.8, 0.3, 0.6, 'Park'],
  };

  /* ---------------- özellik / miktar değerleri ---------------- */
  const V = {
    bool: (b) => 'IFCBOOLEAN(' + (b ? '.T.' : '.F.') + ')',
    label: (s) => 'IFCLABEL(' + str(s) + ')',
    ident: (s) => 'IFCIDENTIFIER(' + str(s) + ')',
    area: (v) => 'IFCAREAMEASURE(' + num(v) + ')',
  };
  // serbest değer → IFC nominal değer (tür otomatik); boş/NaN → null (özellik atlanır)
  function autoVal(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'boolean') return V.bool(v);
    if (typeof v === 'number') {
      if (!isFinite(v)) return null;
      return Number.isInteger(v) && Math.abs(v) < 2147483647 ? 'IFCINTEGER(' + int(v) + ')' : 'IFCREAL(' + num(v) + ')';
    }
    if (typeof v === 'string') return 'IFCTEXT(' + str(v) + ')';
    try { return 'IFCTEXT(' + str(JSON.stringify(v)) + ')'; } catch (e) { return null; }
  }

  /* ======================================================================
     build: model → .ifc metin
     ====================================================================== */
  IFC.build = function (model) {
    const M = model || {};
    const name = String(M.name || 'archtools');
    const W = createWriter();
    const add = W.add, def = W.def;

    // deterministik GlobalId (ad + anahtar); çakışmada tuz eklenir
    const used = Object.create(null);
    const guid = (seed) => {
      let g, k = 0;
      do { g = IFC.guid(name + '|' + seed + (k ? '#' + k : '')); k++; } while (used[g]);
      used[g] = 1;
      return g;
    };

    /* ---- zaman damgası, sahiplik ---- */
    let when = M.createdAt ? new Date(M.createdAt) : new Date();
    if (isNaN(when.getTime())) when = new Date();
    const stamp = Math.floor(when.getTime() / 1000);
    const org = def('IFCORGANIZATION', '$,' + str(M.organization || 'archtools') + ',$,$,$');
    const person = def('IFCPERSON', '$,' + str(M.author || 'archtools') + ',$,$,$,$,$,$');
    const pao = def('IFCPERSONANDORGANIZATION', R(person) + ',' + R(org) + ',$');
    const appOrg = def('IFCORGANIZATION', "$,'archtools',$,$,$");
    const app = def('IFCAPPLICATION', R(appOrg) + ',' + str(IFC.version) + ',' + str('archtools Mimari Tasarım Asistanı') + ",'archtools-ifc'");
    const OH = add('IFCOWNERHISTORY', R(pao) + ',' + R(app) + ',$,.ADDED.,$,$,$,' + stamp);

    /* ---- kök varlık üretici: ('GUID', OwnerHistory, ...kuyruk) ---- */
    const root = (type, seed, tail) => add(type, "'" + guid(seed) + "'," + R(OH) + ',' + tail.join(','));

    /* ---- temel geometri ---- */
    const P2 = (x, y) => def('IFCCARTESIANPOINT', '(' + num(r4(x)) + ',' + num(r4(y)) + ')');
    const P3 = (x, y, z) => def('IFCCARTESIANPOINT', '(' + num(r4(x)) + ',' + num(r4(y)) + ',' + num(r4(z)) + ')');
    const D2 = (x, y) => def('IFCDIRECTION', '(' + num(x) + ',' + num(y) + ')');
    const D3 = (x, y, z) => def('IFCDIRECTION', '(' + num(x) + ',' + num(y) + ',' + num(z) + ')');
    const Z = D3(0, 0, 1);
    const AX3 = (x, y, z, dz, dx) => def('IFCAXIS2PLACEMENT3D', R(P3(x, y, z)) + ',' + (dz ? R(dz) : '$') + ',' + (dx ? R(dx) : '$'));
    const AX2 = (x, y) => def('IFCAXIS2PLACEMENT2D', R(P2(x, y)) + ',' + R(D2(1, 0)));
    const WORLD = AX3(0, 0, 0);
    const LP = (rel, axis) => add('IFCLOCALPLACEMENT', (rel ? R(rel) : '$') + ',' + R(axis));
    const north = D2(0, 1);

    /* ---- temsil bağlamları ---- */
    const ctxModel = add('IFCGEOMETRICREPRESENTATIONCONTEXT', "$,'Model',3,1.E-05," + R(WORLD) + ',' + R(north));
    const ctxPlan = add('IFCGEOMETRICREPRESENTATIONCONTEXT', "$,'Plan',2,1.E-05," + R(AX2(0, 0)) + ',' + R(north));
    const ctxBody = add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', "'Body','Model',*,*,*,*," + R(ctxModel) + ',$,.MODEL_VIEW.,$');
    const ctxFoot = add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', "'FootPrint','Plan',*,*,*,*," + R(ctxPlan) + ',$,.PLAN_VIEW.,$');

    /* ---- birimler: m, m², m³, derece ---- */
    const uLen = def('IFCSIUNIT', '*,.LENGTHUNIT.,$,.METRE.');
    const uArea = def('IFCSIUNIT', '*,.AREAUNIT.,$,.SQUARE_METRE.');
    const uVol = def('IFCSIUNIT', '*,.VOLUMEUNIT.,$,.CUBIC_METRE.');
    const uRad = def('IFCSIUNIT', '*,.PLANEANGLEUNIT.,$,.RADIAN.');
    const dimNone = def('IFCDIMENSIONALEXPONENTS', '0,0,0,0,0,0,0');
    const degMeas = def('IFCMEASUREWITHUNIT', 'IFCPLANEANGLEMEASURE(0.017453292519943295),' + R(uRad));
    const uDeg = def('IFCCONVERSIONBASEDUNIT', R(dimNone) + ",.PLANEANGLEUNIT.,'DEGREE'," + R(degMeas));
    const units = add('IFCUNITASSIGNMENT', RL([uLen, uArea, uVol, uDeg]));

    /* ---- stil ---- */
    const styleIds = {};
    const styled = (solid, key) => {
      const s = STYLE[key];
      if (!styleIds[key]) {
        const col = def('IFCCOLOURRGB', '$,' + num(s[0]) + ',' + num(s[1]) + ',' + num(s[2]));
        const rend = def('IFCSURFACESTYLERENDERING', R(col) + ',' + num(s[3]) + ',$,$,$,$,$,$,.NOTDEFINED.');
        styleIds[key] = def('IFCSURFACESTYLE', str(s[4]) + ',.BOTH.,(' + R(rend) + ')');
      }
      def('IFCSTYLEDITEM', R(solid) + ',(' + R(styleIds[key]) + '),$');
    };

    /* ---- katı + gövde temsili ---- */
    // halka (CCW, temiz) → ekstrüde alan katısı; z0 = taban kotu (yerleşime göre), +Z yönünde depth
    const prism = (pts, depth, z0) => {
      const ids = pts.map((p) => P2(p[0], p[1]));
      ids.push(ids[0]);
      const poly = def('IFCPOLYLINE', RL(ids));
      const prof = def('IFCARBITRARYCLOSEDPROFILEDEF', '.AREA.,$,' + R(poly));
      return def('IFCEXTRUDEDAREASOLID', R(prof) + ',' + R(AX3(0, 0, z0)) + ',' + R(Z) + ',' + num(depth));
    };
    // x ekseninde cx merkezli len × wid dikdörtgen profil, +Z yönünde depth
    const rectSolid = (cx, len, wid, depth) => {
      const prof = def('IFCRECTANGLEPROFILEDEF', '.AREA.,$,' + R(AX2(cx, 0)) + ',' + num(len) + ',' + num(wid));
      return def('IFCEXTRUDEDAREASOLID', R(prof) + ',' + R(WORLD) + ',' + R(Z) + ',' + num(depth));
    };
    const shapeOf = (solid, styleKey) => {
      styled(solid, styleKey);
      const rep = add('IFCSHAPEREPRESENTATION', R(ctxBody) + ",'Body','SweptSolid'," + RL([solid]));
      return add('IFCPRODUCTDEFINITIONSHAPE', '$,$,' + RL([rep]));
    };

    /* ---- özellik kümeleri / miktarlar ---- */
    const pv = (n, nominal) => def('IFCPROPERTYSINGLEVALUE', str(n) + ',$,' + nominal + ',$');
    const propSet = (psName, entries, seed) => {
      const ids = entries.filter((e) => e[1]).map((e) => pv(e[0], e[1]));
      if (!ids.length) return 0;
      return root('IFCPROPERTYSET', seed, [str(psName), '$', RL(ids)]);
    };
    const objEntries = (o) => Object.keys(o || {}).filter((k) => k).map((k) => [k, autoVal(o[k])]);
    const relDefines = (objs, ps, seed) => { if (ps && objs.length) root('IFCRELDEFINESBYPROPERTIES', seed, ['$', '$', RL(objs), R(ps)]); };

    // miktarlar: ['len'|'area'|'vol', ad, değer]
    const qtoSet = (obj, qName, rows, seed) => {
      const ids = [];
      rows.forEach((q) => {
        const v = fin(q[2]);
        if (!(v >= 0)) return;
        if (q[0] === 'len') ids.push(def('IFCQUANTITYLENGTH', str(q[1]) + ',$,$,' + num(v) + ',$'));
        else if (q[0] === 'area') ids.push(def('IFCQUANTITYAREA', str(q[1]) + ',$,$,' + num(v) + ',$'));
        else ids.push(def('IFCQUANTITYVOLUME', str(q[1]) + ',$,$,' + num(v) + ',$'));
      });
      if (!ids.length) return;
      const qs = root('IFCELEMENTQUANTITY', seed, [str(qName), '$', '$', RL(ids)]);
      relDefines([obj], qs, seed + '|rel');
    };

    // aynı içerikli Pset (örn. Pset_WallCommon IsExternal=T): tek küme, çok nesne, tek ilişki
    const shared = {};
    const sharePset = (key, psName, entries, obj) => {
      if (!shared[key]) shared[key] = { ps: propSet(psName, entries, 'pset|' + key), objs: [] };
      shared[key].objs.push(obj);
    };

    /* ======================================================================
       mekânsal yapı: proje → arsa → bina → katlar
       ====================================================================== */
    const geo = M.geo || {};
    const lat = Math.max(-90, Math.min(90, fin(geo.lat, NaN)));
    let lon = fin(geo.lon, NaN);
    if (isFinite(lon)) lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const elev0 = fin(geo.elev, 0);
    const hasGeo = isFinite(Number(geo.lat)) && isFinite(Number(geo.lon));

    const project = root('IFCPROJECT', 'project', [str(name), str(M.description), '$', str(name), '$', RL([ctxModel, ctxPlan]), R(units)]);

    // arsa: sınır çizgisi (FootPrint / Curve2D)
    const parcel = cleanRing(M.parcel);
    let siteRep = '$';
    if (parcel) {
      const ids = parcel.pts.map((p) => P2(p[0], p[1]));
      ids.push(ids[0]);
      const poly = def('IFCPOLYLINE', RL(ids));
      const rep = add('IFCSHAPEREPRESENTATION', R(ctxFoot) + ",'FootPrint','Curve2D'," + RL([poly]));
      siteRep = R(add('IFCPRODUCTDEFINITIONSHAPE', '$,$,' + RL([rep])));
    }
    const sitePl = LP(0, WORLD);
    const site = root('IFCSITE', 'site', [
      str('Arsa'), str(M.description), '$', R(sitePl), siteRep, str(name), '.ELEMENT.',
      hasGeo ? dms(lat) : '$', hasGeo ? dms(lon) : '$', num(elev0), '$', '$',
    ]);
    if (parcel) {
      qtoSet(site, 'Qto_SiteBaseQuantities', [['area', 'GrossArea', parcel.area], ['len', 'GrossPerimeter', parcel.perim]], 'qto|site');
    }

    const bldPl = LP(sitePl, WORLD);
    const building = root('IFCBUILDING', 'building', [str(name), str(M.description), '$', R(bldPl), '$', str(name), '.ELEMENT.', '0.', num(elev0), '$']);

    const storeyIds = [];
    const storeys = Array.isArray(M.storeys) ? M.storeys : [];
    const perStorey = []; // {st, contained[], spaces[]}

    storeys.forEach((S, si) => {
      S = S || {};
      const elev = fin(S.elevation, 0);
      const nextElev = storeys[si + 1] && isFinite(Number(storeys[si + 1].elevation)) ? Number(storeys[si + 1].elevation) : null;
      const h = isFinite(Number(S.height)) && Number(S.height) >= 0 ? Number(S.height) : (nextElev != null && nextElev > elev ? nextElev - elev : 3);
      const sT = pos(S.slabThickness, 0.25);
      const clearH = Math.max(0.1, h - sT);
      const stPl = LP(bldPl, AX3(0, 0, elev));
      const st = root('IFCBUILDINGSTOREY', 'storey|' + si, [str(S.name || 'Kat ' + (si + 1)), '$', '$', R(stPl), '$', '$', '.ELEMENT.', num(elev)]);
      storeyIds.push(st);
      const contained = [];
      const spaceIds = [];

      /* döşemeler */
      (S.slabs || []).forEach((s, i) => {
        s = s || {};
        const r = cleanRing(s.ring);
        if (!r) return;
        const kind = s.kind === 'roof' ? 'roof' : s.kind === 'base' ? 'base' : 'floor';
        const t = pos(s.thickness, sT);
        const top = fin(s.top, 0);
        const shape = shapeOf(prism(r.pts, t, top - t), 'slab_' + kind);
        const id = root('IFCSLAB', 'slab|' + si + '|' + i, [
          str(s.name || (kind === 'roof' ? 'Çatı döşemesi' : kind === 'base' ? 'Temel döşemesi' : 'Döşeme')), '$', '$',
          R(LP(stPl, WORLD)), R(shape), '$', kind === 'roof' ? '.ROOF.' : kind === 'base' ? '.BASESLAB.' : '.FLOOR.',
        ]);
        contained.push(id);
        sharePset('slab_' + (kind === 'roof'), 'Pset_SlabCommon', [['IsExternal', V.bool(kind === 'roof')]], id);
        qtoSet(id, 'Qto_SlabBaseQuantities', [['len', 'Width', t], ['len', 'Perimeter', r.perim], ['area', 'GrossArea', r.area], ['area', 'NetArea', r.area], ['vol', 'GrossVolume', r.area * t]], 'qto|slab|' + si + '|' + i);
      });

      /* duvarlar: yerleşim başlangıç noktasında, yerel x duvar doğrultusunda, profil eksene ortalı */
      (S.walls || []).forEach((w, i) => {
        w = w || {};
        if (!w.a || !w.b) return;
        const ax = Number(w.a[0]), ay = Number(w.a[1]), bx = Number(w.b[0]), by = Number(w.b[1]);
        if (![ax, ay, bx, by].every(isFinite)) return;
        const L = r4(Math.hypot(bx - ax, by - ay));
        if (L < 0.01) return;
        const ext = w.kind !== 'interior';
        const t = pos(w.thickness, 0.2);
        const hh = pos(w.height, clearH);
        const shape = shapeOf(rectSolid(L / 2, L, t, hh), ext ? 'wall_ext' : 'wall_int');
        const axis = AX3(ax, ay, 0, Z, D3((bx - ax) / L, (by - ay) / L, 0));
        const id = root('IFCWALL', 'wall|' + si + '|' + i, [
          str(w.name || (ext ? 'Dış duvar' : 'İç duvar')), '$', '$', R(LP(stPl, axis)), R(shape), '$', ext ? '.STANDARD.' : '.PARTITIONING.',
        ]);
        contained.push(id);
        sharePset('wall_' + ext, 'Pset_WallCommon', [['IsExternal', V.bool(ext)]], id);
        qtoSet(id, 'Qto_WallBaseQuantities', [['len', 'Length', L], ['len', 'Width', t], ['len', 'Height', hh], ['vol', 'GrossVolume', L * t * hh]], 'qto|wall|' + si + '|' + i);
      });

      /* kolonlar: yerleşim (x, y), profil kendi merkezinde */
      (S.columns || []).forEach((c, i) => {
        c = c || {};
        const x = Number(c.x), y = Number(c.y);
        if (!isFinite(x) || !isFinite(y)) return;
        const cw = pos(c.w, 0.4), cd = pos(c.d, 0.4);
        const shape = shapeOf(rectSolid(0, cw, cd, clearH), 'column');
        const id = root('IFCCOLUMN', 'col|' + si + '|' + i, [str(c.name || 'Kolon'), '$', '$', R(LP(stPl, AX3(x, y, 0))), R(shape), '$', '.COLUMN.']);
        contained.push(id);
        sharePset('column', 'Pset_ColumnCommon', [['IsExternal', V.bool(false)], ['LoadBearing', V.bool(true)]], id);
        qtoSet(id, 'Qto_ColumnBaseQuantities', [['len', 'Length', clearH], ['area', 'CrossSectionArea', cw * cd], ['vol', 'GrossVolume', cw * cd * clearH]], 'qto|col|' + si + '|' + i);
      });

      /* mekânlar ve otopark yerleri: IfcSpace, kata IfcRelAggregates ile bağlanır */
      const addSpace = (s, i, tag, isStall) => {
        const r = cleanRing(s.ring);
        if (!r) return;
        const hh = pos(s.height, clearH);
        const net = isStall ? r.area : pos(s.area, r.area);
        const nm = s.name || (isStall ? 'Park yeri ' + (i + 1) : 'Mekan ' + (i + 1));
        const shape = shapeOf(prism(r.pts, hh, 0), isStall ? 'stall' : 'space');
        const id = root('IFCSPACE', tag + '|' + si + '|' + i, [
          str(nm), str(isStall ? 'Otopark' : s.usage), '$', R(LP(stPl, WORLD)), R(shape), str(s.longName),
          '.ELEMENT.', isStall ? '.PARKING.' : '.SPACE.', '$',
        ]);
        spaceIds.push(id);
        const seed = tag + '|' + si + '|' + i;
        qtoSet(id, 'Qto_SpaceBaseQuantities', [
          ['len', 'Height', hh], ['len', 'GrossPerimeter', r.perim], ['area', 'GrossFloorArea', r.area], ['area', 'NetFloorArea', net],
          ['vol', 'GrossVolume', r.area * hh], ['vol', 'NetVolume', net * hh],
        ], 'qto|' + seed);
        const common = propSet('Pset_SpaceCommon', [
          ['Reference', V.ident(nm)], ['Category', isStall ? V.label('Otopark') : (s.usage ? V.label(s.usage) : null)],
          ['NetPlannedArea', V.area(net)], ['IsExternal', V.bool(false)],
        ], 'pset|common|' + seed);
        relDefines([id], common, 'pset|common|rel|' + seed);
        if (s.props && typeof s.props === 'object') {
          const custom = propSet('Pset_ArchtoolsSpace', objEntries(s.props), 'pset|custom|' + seed);
          relDefines([id], custom, 'pset|custom|rel|' + seed);
        }
      };
      (S.spaces || []).forEach((s, i) => addSpace(s || {}, i, 'space', false));
      (S.stalls || []).forEach((s, i) => addSpace(s || {}, i, 'stall', true));

      perStorey.push({ st: st, contained: contained, spaces: spaceIds, si: si });
    });

    /* ---- ilişkiler ---- */
    root('IFCRELAGGREGATES', 'agg|project', ['$', '$', R(project), RL([site])]);
    root('IFCRELAGGREGATES', 'agg|site', ['$', '$', R(site), RL([building])]);
    if (storeyIds.length) root('IFCRELAGGREGATES', 'agg|building', ['$', '$', R(building), RL(storeyIds)]);
    perStorey.forEach((p) => {
      if (p.spaces.length) root('IFCRELAGGREGATES', 'agg|storey|' + p.si, ['$', '$', R(p.st), RL(p.spaces)]);
      if (p.contained.length) root('IFCRELCONTAINEDINSPATIALSTRUCTURE', 'contain|' + p.si, ['$', '$', RL(p.contained), R(p.st)]);
    });
    Object.keys(shared).forEach((k) => relDefines(shared[k].objs, shared[k].ps, 'pset|rel|' + k));

    /* ---- özel Pset'ler: proje / arsa / bina ---- */
    const ps = M.psets || {};
    [['project', project, 'Pset_ArchtoolsProject'], ['site', site, 'Pset_ArchtoolsSite'], ['building', building, 'Pset_ArchtoolsBuilding']].forEach((t) => {
      if (!ps[t[0]] || typeof ps[t[0]] !== 'object') return;
      relDefines([t[1]], propSet(t[2], objEntries(ps[t[0]]), 'pset|' + t[0]), 'pset|rel|' + t[0]);
    });

    /* ---- dosya ---- */
    const fname = String(name).replace(/[\\/:*?"<>|]+/g, '_') + '.ifc';
    const header = [
      'ISO-10303-21;',
      'HEADER;',
      "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
      'FILE_NAME(' + str(fname) + ",'" + when.toISOString().slice(0, 19) + "',(" + (str(M.author) === '$' ? "'archtools'" : str(M.author)) + '),(' + (str(M.organization) === '$' ? "'archtools'" : str(M.organization)) + "),'archtools-ifc " + IFC.version + "','archtools','');",
      "FILE_SCHEMA(('IFC4'));",
      'ENDSEC;',
      'DATA;',
    ];
    return header.concat(W.lines, ['ENDSEC;', 'END-ISO-10303-21;', '']).join('\n');
  };
})();
