/* ==========================================================================
   39-lib-b-zoning.js — İmar ve kapasite hesapları (Modül 5)
   Parsel (yerel metre halkası) + imar parametreleri (TAKS, KAKS/emsal, yençok, çekmeler) →
   yapılabilir zarf, kütle, kat sayısı, alanlar, birim / otopark / nüfus tahmini, güneş gölgesi, bulgular.
   Not: imar değerleri kullanıcıdan alınır; hazır değerler yalnızca başlangıç önerisidir.
   Saf mantık: arayüz bilmez.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const U = App.util;
  const Z = (App.zoning = {});

  Object.assign(App.KB.SOURCES, {
    'imar': { label: 'Planlı Alanlar İmar Yönetmeliği ve parselin imar planı notları — değerleri kendi imar durumunuza göre girin', kind: 'Mevzuat', trust: 'kullanıcı girdisi' },
  });

  /* ---------------- program türleri ---------------- */
  Z.USES = [
    { id: 'konut', label: 'Konut', eff: 0.8, unit: 110, floorH: 3.0, cars: 1, per: 3.2, unitName: 'daire', perName: 'kişi' },
    { id: 'karma', label: 'Karma (zemin ticari + konut)', eff: 0.78, unit: 100, floorH: 3.2, cars: 1, per: 3.0, unitName: 'birim', perName: 'kişi' },
    { id: 'ofis', label: 'Ofis', eff: 0.85, unit: 60, floorH: 3.4, cars: 0.8, per: 4.5, unitName: 'ofis birimi', perName: 'çalışan' },
    { id: 'ticari', label: 'Ticari / perakende', eff: 0.72, unit: 80, floorH: 4.0, cars: 0.8, per: 2.0, unitName: 'dükkân', perName: 'çalışan' },
    { id: 'otel', label: 'Otel', eff: 0.7, unit: 32, floorH: 3.2, cars: 0.4, per: 1.9, unitName: 'oda', perName: 'konuk' },
    { id: 'kamu', label: 'Kamu / eğitim', eff: 0.65, unit: 55, floorH: 3.6, cars: 0.3, per: 12, unitName: 'derslik / birim', perName: 'kullanıcı' },
  ];
  Z.use = (id) => Z.USES.find((u) => u.id === id) || Z.USES[0];

  Z.FORMS = [
    { id: 'blok', label: 'Tek blok', sub: 'Zarfın içinde tek kütle' },
    { id: 'L', label: 'L kütle', sub: 'Yol ve yan sınır boyunca iki kanat' },
    { id: 'U', label: 'U kütle', sub: 'Üç kanat, arka bahçeye açılan avlu' },
    { id: 'avlu', label: 'Avlulu', sub: 'Dört kanat, kapalı iç avlu' },
    { id: 'cift', label: 'İki paralel blok', sub: 'Ön ve arka blok, ortada aralık' },
  ];

  Z.PRESETS = [
    { id: 'dusuk', label: 'Düşük yoğunluk konut', v: { use: 'konut', taks: 0.25, kaks: 0.75, hmax: 9.5, floorH: 3.0 } },
    { id: 'orta', label: 'Orta yoğunluk konut', v: { use: 'konut', taks: 0.35, kaks: 1.4, hmax: 15.5, floorH: 3.0 } },
    { id: 'yuksek', label: 'Yüksek yoğunluk konut', v: { use: 'konut', taks: 0.4, kaks: 2.4, hmax: 24.5, floorH: 3.0 } },
    { id: 'ticaret', label: 'Ticaret alanı', v: { use: 'ticari', taks: 0.6, kaks: 3.0, hmax: 30, floorH: 4.0 } },
    { id: 'cevre', label: 'Çevre ortalaması', v: null, ctx: true },
  ];

  Z.defaults = function () {
    return {
      use: 'konut', taks: 0.35, kaks: 1.4, hmax: 15.5, floorH: 3.0,
      setback: { on: 5, yan: 3, arka: 3 }, ek: {}, form: 'blok',
      eff: 0.8, unit: 110, cars: 1, per: 3.2, basement: 1,
      day: 'kis', hour: 12, scn: [],
    };
  };
  Z.clampImar = function (x) {
    const d = Z.defaults();
    const o = Object.assign({}, d, x || {});
    const n = (v, a, b, def) => U.clamp(Number.isFinite(Number(v)) ? Number(v) : def, a, b);
    o.use = Z.USES.some((u) => u.id === o.use) ? o.use : d.use;
    o.taks = n(o.taks, 0.05, 1, d.taks); o.kaks = n(o.kaks, 0.1, 12, d.kaks);
    o.hmax = n(o.hmax, 3, 150, d.hmax); o.floorH = n(o.floorH, 2.4, 6, d.floorH);
    const sb = Object.assign({}, d.setback, o.setback || {});
    o.setback = { on: n(sb.on, 0, 30, 5), yan: n(sb.yan, 0, 30, 3), arka: n(sb.arka, 0, 30, 3) };
    o.ek = {};
    Object.keys((x && x.ek) || {}).forEach((k) => { if (['on', 'yan', 'arka'].indexOf(x.ek[k]) >= 0) o.ek[k] = x.ek[k]; });
    o.form = Z.FORMS.some((f) => f.id === o.form) ? o.form : 'blok';
    o.eff = n(o.eff, 0.4, 0.95, d.eff); o.unit = n(o.unit, 15, 600, d.unit); o.cars = n(o.cars, 0, 4, d.cars); o.per = n(o.per, 0.5, 40, d.per);
    o.basement = Math.round(n(o.basement, 0, 4, 1));
    o.day = gis.SUN_DAYS.some((s) => s.id === o.day) ? o.day : 'kis';
    o.hour = n(o.hour, 8, 17, 12);
    o.scn = Array.isArray(x && x.scn) ? x.scn.slice(0, 4) : [];
    return o;
  };

  /* ---------------- parsel üretimi ---------------- */
  Z.rectParcel = function (w, d, rotDeg, cx, cy) {
    const a = ((rotDeg || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map((q) => [Math.round((cx + q[0] * c - q[1] * s) * 10) / 10, Math.round((cy + q[0] * s + q[1] * c) * 10) / 10]);
  };
  Z.cleanParcel = function (pts) {
    if (!Array.isArray(pts)) return null;
    let p = pts.map((q) => [Math.round(Number(q[0]) * 10) / 10, Math.round(Number(q[1]) * 10) / 10]).filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
    const o = [];
    p.forEach((q) => { const l = o[o.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.3) o.push(q); });
    if (o.length > 1 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) <= 0.3) o.pop();
    if (o.length < 3 || o.length > 40) return null;
    const ccw = gis.ccw(o);
    const a = Math.abs(gis.area(ccw));
    if (!(a >= 20 && a <= 250000)) return null;
    return ccw;
  };
  // basit kendini kesme denetimi (O(n²), n ≤ 40)
  Z.selfIntersects = function (p) {
    const n = p.length;
    const X = (a, b, c, d) => {
      const o = (p1, p2, p3) => (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (X(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
    return false;
  };

  /* ---------------- kenar sınıflaması: ön / yan / arka ---------------- */
  const DRIVE = { motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1, residential: 1, living: 1, service: 1 };
  Z.edges = function (parcel, roads, ek) {
    const n = parcel.length;
    const E = [];
    for (let i = 0; i < n; i++) {
      const a = parcel[i], b = parcel[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let rd = Infinity, rname = null, rcls = null;
      (roads || []).forEach((r) => {
        if (!DRIVE[r.cls] || r.tn) return;
        let m = Infinity;
        for (let k = 1; k < r.pts.length; k++) {
          const p0 = r.pts[k - 1], p1 = r.pts[k];
          const dm = gis.nearestOnSeg(mid[0], mid[1], p0[0], p0[1], p1[0], p1[1]).d;
          if (dm < m) m = dm;
        }
        if (m < rd) { rd = m; rname = r.name || null; rcls = r.cls; }
      });
      E.push({ i: i, a: a, b: b, len: len, mid: mid, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], road: rd, roadName: rname, roadCls: rcls });
    }
    // ön: yola en yakın kenar(lar) — köşe parselde birden çok kenar ön sayılır
    const minRoad = Math.min.apply(null, E.map((e) => e.road));
    const hasRoad = isFinite(minRoad) && minRoad < 60;
    E.forEach((e) => { e.kind = null; });
    if (hasRoad) E.forEach((e) => { if (e.road <= Math.max(minRoad + 4, 0) && e.road < 40) e.kind = 'on'; });
    else { const lg = E.reduce((m, e) => (e.len > m.len ? e : m), E[0]); lg.kind = 'on'; }
    const fronts = E.filter((e) => e.kind === 'on');
    const ref = fronts.reduce((m, e) => (e.len > m.len ? e : m), fronts[0]);
    // arka: ön kenarın tersine bakan ve en uzak kenar
    const nrm = [-ref.dir[1], ref.dir[0]];
    let rear = null, bestD = -1;
    E.forEach((e) => {
      if (e.kind) return;
      const dd = (e.mid[0] - ref.mid[0]) * nrm[0] + (e.mid[1] - ref.mid[1]) * nrm[1];
      const anti = e.dir[0] * ref.dir[0] + e.dir[1] * ref.dir[1] < -0.45;
      const sc = dd + (anti ? 1000 : 0);
      if (dd > 0 && sc > bestD) { bestD = sc; rear = e; }
    });
    if (rear) rear.kind = 'arka';
    E.forEach((e) => { if (!e.kind) e.kind = 'yan'; });
    // kullanıcı düzeltmeleri
    Object.keys(ek || {}).forEach((k) => { const e = E[Number(k)]; if (e && ek[k]) e.kind = ek[k]; });
    return { edges: E, front: ref, hasRoad: hasRoad };
  };

  /* ---------------- kütle: zarf içinde kanatlar ---------------- */
  function rectPoly(u0, v0, u1, v1) { return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; }
  function shapeRects(form, B, t) {
    const u0 = B.u0, u1 = B.u1, v0 = B.v0, v1 = B.v1, W = u1 - u0, D = v1 - v0;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    if (form === 'blok') { const s = t; return [rectPoly(cu - (s * W) / 2, cv - (s * D) / 2, cu + (s * W) / 2, cv + (s * D) / 2)]; }
    if (form === 'L') return [rectPoly(u0, v0, u1, v0 + t), rectPoly(u0, v0 + t, u0 + t, v1)];
    if (form === 'U') return [rectPoly(u0, v0, u1, v0 + t), rectPoly(u0, v0 + t, u0 + t, v1), rectPoly(u1 - t, v0 + t, u1, v1)];
    if (form === 'avlu') return [rectPoly(u0, v0, u1, v0 + t), rectPoly(u0, v1 - t, u1, v1), rectPoly(u0, v0 + t, u0 + t, v1 - t), rectPoly(u1 - t, v0 + t, u1, v1 - t)];
    return [rectPoly(u0, v0, u1, v0 + t), rectPoly(u0, v1 - t, u1, v1)]; // cift
  }
  function tRange(form, B) {
    const W = B.u1 - B.u0, D = B.v1 - B.v0;
    if (form === 'blok') return [0.05, 1];
    if (form === 'L') return [0.5, Math.min(W, D)];
    if (form === 'U') return [0.5, Math.min(W / 2, D)];
    if (form === 'avlu') return [0.5, Math.min(W, D) / 2];
    return [0.5, D / 2];
  }

  Z.massing = function (env, form, target, frontDir) {
    if (!env || env.length < 3) return { pieces: [], t: 0, area: 0 };
    const O = gis.centroid(env);
    const d = frontDir, nrm = [-d[1], d[0]];
    const toUV = (p) => [(p[0] - O[0]) * d[0] + (p[1] - O[1]) * d[1], (p[0] - O[0]) * nrm[0] + (p[1] - O[1]) * nrm[1]];
    const fromUV = (q) => [O[0] + q[0] * d[0] + q[1] * nrm[0], O[1] + q[0] * d[1] + q[1] * nrm[1]];
    const E = env.map(toUV);
    const bb = gis.bbox(E);
    const B = { u0: bb.x0, u1: bb.x1, v0: bb.y0, v1: bb.y1 };
    const Aenv = Math.abs(gis.area(E));
    const build = (t) => {
      const out = [];
      shapeRects(form, B, t).forEach((r) => {
        const c = gis.clipPoly(E, r);
        if (c.length >= 3 && Math.abs(gis.area(c)) > 0.5) out.push(c);
      });
      return out;
    };
    const areaOf = (ps) => ps.reduce((s, p) => s + Math.abs(gis.area(p)), 0);
    const tr = tRange(form, B);
    let lo = tr[0], hi = tr[1], pieces = build(hi);
    if (target >= areaOf(pieces) - 0.5 || target >= Aenv - 0.5) {
      const full = areaOf(pieces);
      return { pieces: pieces.map((p) => p.map(fromUV)), t: hi, area: full, full: true };
    }
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      const a = areaOf(build(mid));
      if (a < target) lo = mid; else hi = mid;
    }
    const t = hi;
    pieces = build(t);
    const thick = form === 'blok' ? null : t;
    return { pieces: pieces.map((p) => p.map(fromUV)), t: thick, area: areaOf(pieces), full: false, scale: form === 'blok' ? t : null };
  };

  /* ---------------- ana hesap ---------------- */
  Z.compute = function (im, parcel, ctx) {
    const R = { ok: false, im: im };
    if (!parcel || parcel.length < 3) return R;
    const A = Math.abs(gis.area(parcel));
    const roads = ctx && ctx.data ? ctx.data.roads : [];
    const ed = Z.edges(parcel, roads, im.ek);
    const dists = ed.edges.map((e) => (e.kind === 'on' ? im.setback.on : e.kind === 'arka' ? im.setback.arka : im.setback.yan));
    const env = gis.offsetPoly(parcel, dists);
    const Aenv = env ? Math.abs(gis.area(env)) : 0;
    const use = Z.use(im.use);
    const Nh = Math.max(1, Math.floor(im.hmax / im.floorH + 1e-6));
    const emsal = im.kaks * A;
    const taksArea = im.taks * A;
    const Fcap = Math.min(taksArea, Aenv);
    R.A = A; R.edges = ed.edges; R.front = ed.front; R.hasRoad = ed.hasRoad; R.env = env; R.Aenv = Aenv; R.dists = dists;
    R.emsal = emsal; R.taksArea = taksArea; R.Nmax = Nh; R.use = use;
    if (!env || Fcap < 8) { R.ok = false; R.reason = !env ? 'cekme' : 'kucuk'; R.footprint = 0; R.floors = 0; R.pieces = []; R.built = 0; R.facts = Z.facts(R, im, ctx); R.items = Z.findings(R, im, ctx); R.counts = countOf(R.items); return R; }
    let N = Math.min(Nh, Math.max(1, Math.ceil(emsal / Fcap - 1e-9)));
    const Ft = Math.min(Fcap, emsal / N);
    const m = Z.massing(env, im.form, Ft, R.front.dir);
    R.pieces = m.pieces; R.wing = m.t; R.scale = m.scale; R.footprint = m.area;
    N = Math.min(Nh, Math.max(1, Math.ceil(emsal / Math.max(1, m.area) - 1e-9)));
    R.floors = N;
    R.height = N * im.floorH;
    R.built = m.area * N;
    R.ok = true;
    R.facts = Z.facts(R, im, ctx);
    R.shadow = Z.shadow(R, im, ctx);
    R.items = Z.findings(R, im, ctx);
    R.counts = countOf(R.items);
    return R;
  };
  const countOf = (items) => { const c = { hata: 0, uyari: 0, oneri: 0 }; items.forEach((i) => { if (c[i.level] != null) c[i.level]++; }); return c; };

  /* türetilmiş sayılar */
  Z.facts = function (R, im, ctx) {
    const f = {};
    const A = R.A;
    f.taksUsed = R.footprint / A;
    f.kaksUsed = R.built / A;
    f.emsalUse = R.emsal ? Math.min(1.5, R.built / R.emsal) : 0;
    f.heightUsed = R.height || 0;
    f.free = A - R.footprint;
    f.freeShare = f.free / A;
    f.net = R.built * im.eff;
    f.units = Math.max(0, Math.floor(f.net / im.unit));
    f.people = Math.round(f.units * im.per);
    f.density = f.people / (A / 1e4);
    f.carsNeed = Math.ceil(f.units * im.cars);
    const bAreaEach = Math.min(R.Aenv * 0.92, A * 0.8);
    f.carsCap = Math.floor((im.basement * bAreaEach) / 28);
    f.basementNeed = im.cars > 0 && f.carsNeed > 0 && bAreaEach > 0 ? Math.ceil((f.carsNeed * 28) / bAreaEach) : 0;
    // çevre karşılaştırması
    if (ctx && ctx.A) { f.ctxFar = ctx.A.built.far; f.ctxCover = ctx.A.built.coverage; }
    if (ctx && ctx.data) {
      const c = gis.centroid(R.pieces && R.pieces.length ? R.pieces[0] : R.env || [[0, 0]]);
      let s = 0, n = 0;
      ctx.data.buildings.forEach((b) => { if (Math.hypot(b.cx - c[0], b.cy - c[1]) <= 120) { s += App.osm.heightOf(b); n++; } });
      f.ctxH = n >= 3 ? s / n : null; f.ctxN = n;
    }
    return f;
  };

  /* güneş gölgesi (yeni kütlenin) ve komşu yapılara etkisi */
  Z.shadow = function (R, im, ctx) {
    if (!ctx || !ctx.lat) return null;
    const day = gis.SUN_DAYS.find((s) => s.id === im.day) || gis.SUN_DAYS[0];
    const sp = gis.sunPos(ctx.lat, day.doy, im.hour);
    if (sp.alt <= 1.5) return { polys: [], alt: sp.alt, az: sp.az, hit: 0, len: 0, day: day };
    const polys = gis.shadows(R.pieces.map((p) => ({ pts: p, hgt: R.height })), sp.alt, sp.az);
    const len = Math.min(R.height / Math.tan((sp.alt * Math.PI) / 180), 160);
    let hit = 0, tot = 0;
    const pset = polys.filter((p) => p.length >= 3);
    const parcelPoly = ctx.parcel;
    if (ctx.data) {
      const c0 = gis.centroid(parcelPoly);
      ctx.data.buildings.forEach((b) => {
        if (Math.hypot(b.cx - c0[0], b.cy - c0[1]) > 160) return;
        if (parcelPoly && gis.pointInPoly([b.cx, b.cy], parcelPoly)) return;
        tot++;
        for (let i = 0; i < pset.length; i++) { if (gis.pointInPoly([b.cx, b.cy], pset[i])) { hit++; break; } }
      });
    }
    return { polys: polys, alt: sp.alt, az: sp.az, hit: hit, tot: tot, len: len, day: day };
  };

  /* ---------------- bulgular ---------------- */
  const pc = (v) => '%' + Math.round(v * 100);
  Z.findings = function (R, im, ctx) {
    const it = [];
    const add = (id, level, title, detail, src, actions) => it.push({ id: id, level: level, title: title, detail: detail, src: src || ['imar'], actions: actions || [] });
    if (!R.ok) {
      if (R.reason === 'cekme') add('cekme', 'hata', 'Çekme mesafeleri parseli tüketiyor', 'Ön ' + U.fmt(im.setback.on, 1) + ' m, yan ' + U.fmt(im.setback.yan, 1) + ' m ve arka ' + U.fmt(im.setback.arka, 1) + ' m çekme sonrası yapılabilir alan kalmıyor. Çekmeleri küçültün ya da parseli büyütün.', ['imar'], [{ type: 'imarTab', tab: 'parametre', label: 'Parametreleri aç' }]);
      else add('kucuk', 'hata', 'Yapılabilir alan çok küçük', 'Zarf alanı ' + U.fmt(R.Aenv) + ' m². Bu parselde anlamlı bir kütle kurulamıyor.', ['imar'], []);
      return it;
    }
    const f = R.facts;
    const eps = 0.002;
    if (f.taksUsed > im.taks + eps) add('taks', 'hata', 'TAKS aşılıyor: ' + U.fmt(f.taksUsed, 2) + ' > ' + U.fmt(im.taks, 2), 'Taban alanı izin verilenden fazla.', ['imar'], []);
    if (f.kaksUsed > im.kaks + eps) add('kaks', 'hata', 'Emsal aşılıyor: ' + U.fmt(f.kaksUsed, 2) + ' > ' + U.fmt(im.kaks, 2), 'Toplam inşaat alanı izin verilenden fazla.', ['imar'], []);
    // kapasite neden dolmadı
    if (f.emsalUse < 0.97) {
      const byH = R.floors >= R.Nmax;
      if (byH) add('hlim', 'uyari', 'Emsalin %' + Math.round((1 - f.emsalUse) * 100) + '’i yükseklik sınırı yüzünden kullanılamıyor', 'En çok ' + R.Nmax + ' kat (' + U.fmt(im.hmax, 1) + ' m) yapılabiliyor; ' + U.fmt(R.emsal - R.built) + ' m² emsal açıkta kalıyor. Yençok artırılabilirse ya da taban alanı büyütülebilirse kapasite tamamlanır.', ['imar'], [{ type: 'imarTab', tab: 'parametre', label: 'Parametreleri aç' }]);
      else add('zarf', 'uyari', 'Zarf emsali karşılamaya yetmiyor', 'Çekmeler sonrası ' + U.fmt(R.Aenv) + ' m² alan kalıyor; ' + U.fmt(R.emsal - R.built) + ' m² emsal kullanılamıyor.', ['imar'], []);
    } else add('kap-ok', 'ok', 'Emsalin tamamı kullanılıyor', U.fmt(R.built) + ' m² · ' + R.floors + ' kat · taban ' + U.fmt(R.footprint) + ' m².', ['imar'], []);
    const envShare = R.Aenv / R.A;
    if (envShare < 0.4) add('envshare', 'uyari', 'Yapılabilir alan parselin yalnızca ' + pc(envShare) + '’i', 'Parsel dar ya da çekmeler büyük; kütle seçeneklerini bu zarfa göre değerlendirin.', ['imar'], []);
    if (R.wing != null && im.form !== 'blok') {
      if (R.wing < 8) add('kanat-ince', 'oneri', 'Kanat derinliği ' + U.fmt(R.wing, 1) + ' m: ince', 'Tipik konut kanadı 10–14 m derinliktedir; daha az kanat (L, tek blok) ya da daha çok kat düşünün.', ['S'], []);
      else if (R.wing > 16) add('kanat-derin', 'uyari', 'Kanat derinliği ' + U.fmt(R.wing, 1) + ' m: derin plan', 'İki cepheli doğal aydınlatma için 16 m’yi aşan derinlik zordur; avlu ya da çift blok denenebilir.', ['S'], []);
      else add('kanat-ok', 'ok', 'Kanat derinliği ' + U.fmt(R.wing, 1) + ' m', 'Çift cepheli yerleşim ve doğal aydınlatma için kabul edilebilir aralıkta.', ['S'], []);
    }
    if (im.form === 'cift') {
      const D = (R.pieces.length === 2) ? Math.abs(gis.centroid(R.pieces[0])[1] - gis.centroid(R.pieces[1])[1]) : 0;
      if (D && R.height > 0 && (D - (R.wing || 0)) < R.height * 0.5) add('aralik', 'uyari', 'Bloklar arası aralık dar', 'İki blok arası mesafe yüksekliğin yarısından az; karşılıklı gölge ve mahremiyet sorunu çıkar.', ['S'], []);
    }
    // otopark
    if (f.carsNeed > 0) {
      if (f.carsNeed > f.carsCap) add('otopark', 'uyari', 'Otopark gereksinimi: ' + f.carsNeed + ' araç, ' + im.basement + ' bodrumda ~' + f.carsCap, 'Yaklaşık ' + f.basementNeed + ' bodrum kat gerekir (28 m²/araç, rampa ve sirkülasyon dahil). Bodrum sayısını artırın ya da araç oranını düşürün.', ['S'], [{ type: 'imarTab', tab: 'parametre', label: 'Parametreleri aç' }]);
      else add('otopark-ok', 'ok', 'Otopark yeterli: ' + f.carsNeed + ' / ' + f.carsCap + ' araç', im.basement + ' bodrum kat ile karşılanıyor.', ['S'], []);
    }
    // açık alan
    if (f.freeShare < 0.3) add('acik', 'oneri', 'Açık alan oranı ' + pc(f.freeShare), 'Bahçe ve yeşil için ayrılan alan az; çevresel konfor ve yağmur suyu için ağaçlandırma ve geçirgen yüzey değerlendirin.', ['S'], []);
    // çevre ile karşılaştırma
    if (f.ctxFar != null && f.ctxFar > 0.2 && f.kaksUsed > f.ctxFar * 1.6) add('ctxfar', 'uyari', 'Çevreden belirgin yoğun: emsal ' + U.fmt(f.kaksUsed, 2) + ' · çevre ~' + U.fmt(f.ctxFar, 2), 'Önerilen yoğunluk çevrenin yaklaşık ' + U.fmt(f.kaksUsed / f.ctxFar, 1) + ' katı. Silüet ve altyapı kapasitesi açısından gerekçelendirin.', ['OSM'], []);
    if (f.ctxH != null && R.height > f.ctxH * 1.8 && R.height > 12) add('ctxh', 'oneri', 'Komşu binalardan ' + U.fmt(R.height / f.ctxH, 1) + ' kat daha yüksek', 'Yakın çevredeki binalar ortalama ' + U.fmt(f.ctxH, 1) + ' m; önerilen ' + U.fmt(R.height, 1) + ' m. Geçiş için kademeli kütle ya da cephe geri çekmesi düşünülebilir.', ['OSM'], []);
    // gölge
    const sh = R.shadow;
    if (sh && sh.alt > 1.5 && sh.tot > 0) {
      if (sh.hit > 0) add('golge', sh.hit >= 4 ? 'uyari' : 'oneri', sh.hit + ' komşu yapı ' + sh.day.label + ' saat ' + U.fmt(im.hour, 0) + ':00’te gölgede kalıyor', 'Gölge uzunluğu ~' + Math.round(sh.len) + ' m (güneş ' + Math.round(sh.alt) + '° yükseklikte). Kuzeydeki komşular kış güneşinden etkilenir; kütleyi güney sınırından uzaklaştırmak ya da yüksekliği azaltmak gölgeyi kısaltır.', ['S'], [{ type: 'imarShadow', label: 'Gölgeyi göster' }]);
      else add('golge-ok', 'ok', 'Komşulara gölge düşmüyor (' + sh.day.label + ', ' + U.fmt(im.hour, 0) + ':00)', 'Gölge ~' + Math.round(sh.len) + ' m uzunlukta; yakın yapılara ulaşmıyor.', ['S'], []);
    }
    if (!ed2(R)) add('on-yok', 'oneri', 'Yola cephe bulunamadı', 'Parselin yakınında araç yolu görünmüyor; ön cephe en uzun kenar olarak varsayıldı. Kenarlara tıklayarak ön / yan / arka olarak değiştirebilirsiniz.', ['OSM'], []);
    return it;
  };
  const ed2 = (R) => R.hasRoad;

  /* ---------------- özet (JSON uzantısı + senaryo karşılaştırma) ---------------- */
  Z.summary = function (R, im) {
    const r2 = (v) => Math.round(v * 100) / 100;
    if (!R || !R.ok) return { ok: false };
    const f = R.facts;
    return {
      ok: true, parcelArea: r2(R.A), buildableArea: r2(R.Aenv), footprint: r2(R.footprint), floors: R.floors, height: r2(R.height), built: r2(R.built),
      taks: r2(f.taksUsed), kaks: r2(f.kaksUsed), netArea: r2(f.net), units: f.units, people: f.people, cars: f.carsNeed, carsCapacity: f.carsCap,
      openShare: r2(f.freeShare), wing: R.wing == null ? null : r2(R.wing), form: im.form,
    };
  };
})();
