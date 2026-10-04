/* ==========================================================================
   38-lib-b-cost.js — Maliyet ve Fizibilite motoru  ·  App.cost
   Bina tasarım özeti + kullanıcının fiyat varsayımları → metraj (BoQ), toplam maliyet, satış geliri,
   kâr, başabaş, kalıntı arsa değeri, duyarlılık, nakit akışı (fonlama, NPV, IRR) ve CANLI FORMÜLLÜ Excel kitabı.
   DOM yok; yalnız App.xlsx (toWorkbook içinde, çağrı anında) kullanılır.

   DÜRÜSTLÜK KURALI: archtools gerçek birim fiyatları bilmez. Buradaki tüm varsayılan fiyatlar
   "ÖRNEK / ILLUSTRATIVE" değerlerdir; kullanıcı MUTLAKA kendi değerleriyle değiştirmelidir
   (Çevre, Şehircilik ve İklim Değişikliği Bakanlığı yıllık yapı yaklaşık birim maliyetleri tebliği,
   yerel piyasa teklifleri vb.). Çıktılar değerleme ya da yatırım tavsiyesi değildir.

   Model özeti (ay 0 = arsa alımı + proje/ruhsat; ay 1..M inşaat; M+1..M+6 satış kuyruğu):
   - Yapım gideri (BoQ + danışmanlık + genel gider + beklenmedik) lojistik S-eğrisiyle M aya yayılır.
   - Pazarlama, satış gelirinin aynı ay payı kadardır. Satışlar nakit tahsil edilir (taksit/kredi planı modellenmez).
   - Finansman: önce özkaynak (maliyetin `equity` payı), sonra kredi; net girişler önce krediyi kapatır;
     faiz aylık, ortalama çekili bakiye üzerinden işler ve bakiyeye eklenir (kapitalize). Finans gideri = toplam faiz.
   - Toplam = yapım + dolaylı + arsa + tapu harcı + finansman;  kâr = net gelir − toplam.
   ========================================================================== */
(function () {
  const App = (window.App = window.App || {});
  const C = (App.cost = {});
  C.version = '1.0';

  C.DISCLAIMER = 'Bu bir ön fizibilite hesabıdır; girilen varsayımlara bağlıdır, yatırım ya da değerleme tavsiyesi değildir.';
  C.disclaimer = C.DISCLAIMER;
  C.ILLUSTRATIVE_LABEL = 'ÖRNEK / ILLUSTRATIVE — kendi değerlerinizle değiştirin';
  const NOTE_BASE = 'ÖRNEK fiyat; Bakanlığın yıllık yaklaşık birim maliyetleri tebliği ve yerel piyasa teklifleriyle değiştirin.';

  const GROUPS = { kaba: 'Kaba yapı', ince: 'İnce işler', tesisat: 'Tesisat ve asansör', dis: 'Dış işler ve ek kalemler' };
  C.GROUPS = GROUPS;

  /* ---------------- BoQ sınıfları ---------------- */
  // basis: miktarın hangi tasarım büyüklüğünden geldiği (qtyOf içinde çözülür)
  const CLASSES = [
    { id: 'kazi-iksa-temel', poz: 'M.01', label: 'Kazı, iksa ve temel', unit: 'm²', qtyBasis: 'bodrum + taban oturumu', price: 3000, group: 'kaba', note: 'Bodrum alanı + zemin kat taban alanı üzerinden. ' + NOTE_BASE },
    { id: 'kaba-insaat', poz: 'M.02', label: 'Kaba inşaat (betonarme)', unit: 'm²', qtyBasis: 'toplam brüt inşaat (zemin üstü + bodrum)', price: 7000, group: 'kaba', note: 'Kolon, kiriş, döşeme, perde. ' + NOTE_BASE },
    { id: 'duvar-siva', poz: 'M.03', label: 'Duvar ve sıva', unit: 'm²', qtyBasis: 'zemin üstü brüt alan', price: 1500, group: 'kaba', note: 'Dolgu duvar, sıva, şap. ' + NOTE_BASE },
    { id: 'cati-yalitim', poz: 'M.04', label: 'Çatı ve yalıtım', unit: 'm²', qtyBasis: 'çatı alanı (= taban oturumu)', price: 2200, group: 'kaba', note: 'Çatı örtüsü, su ve ısı yalıtımı. ' + NOTE_BASE },
    { id: 'cephe', poz: 'M.05', label: 'Cephe', unit: 'm²', qtyBasis: 'cephe alanı (çevre × yükseklik, tahmini)', price: 3500, group: 'ince', note: 'Dış kaplama ve ısı yalıtım sistemi. ' + NOTE_BASE },
    { id: 'ince-isler', poz: 'M.06', label: 'İnce işler (zemin, boya, doğrama, mutfak/banyo)', unit: 'm²', qtyBasis: 'zemin üstü brüt alan', price: 5000, group: 'ince', note: 'Seçilen kalite ön ayarıyla çarpılır. ' + NOTE_BASE },
    { id: 'mekanik', poz: 'M.07', label: 'Mekanik tesisat (ısıtma, sıhhi tesisat)', unit: 'm²', qtyBasis: 'zemin üstü brüt alan', price: 2400, group: 'tesisat', note: NOTE_BASE },
    { id: 'elektrik', poz: 'M.08', label: 'Elektrik ve zayıf akım', unit: 'm²', qtyBasis: 'zemin üstü brüt alan', price: 1700, group: 'tesisat', note: NOTE_BASE },
    { id: 'asansor', poz: 'M.09', label: 'Asansör', unit: 'durak', qtyBasis: 'asansör sayısı × durak sayısı', price: 250000, group: 'tesisat', note: 'Asansör sayısı daire sayısından tahmin edilir (4+ katta). ' + NOTE_BASE },
    { id: 'cevre-duzenleme', poz: 'M.10', label: 'Çevre düzenleme', unit: 'm²-açık', qtyBasis: 'açık alan (parsel − taban oturumu)', price: 2500, group: 'dis', note: 'Peyzaj, sert zemin, çevre duvarı, aydınlatma. ' + NOTE_BASE },
    { id: 'bodrum-otopark', poz: 'M.11', label: 'Bodrum otopark ek maliyeti', unit: 'm²', qtyBasis: 'bodrum alanı', price: 2500, group: 'dis', note: 'Rampa, havalandırma, yangın söndürme, su yalıtımı farkı. ' + NOTE_BASE },
    { id: 'ortak-alan', poz: 'M.12', label: 'Ortak alan ve lobi', unit: 'm²', qtyBasis: 'ortak alan (zemin üstü brüt − daire brüt − ticari)', price: 2500, group: 'ince', note: 'Lobi, koridor, merdiven kaplama ve aydınlatma farkı. ' + NOTE_BASE },
  ];
  C.CLASSES = CLASSES;
  const CLS = {};
  CLASSES.forEach(function (c) { CLS[c.id] = c; });

  C.PRESETS = [
    { id: 'ekonomik', label: 'Ekonomik (örnek)', mult: 0.8 },
    { id: 'orta', label: 'Orta (örnek)', mult: 1 },
    { id: 'luks', label: 'Lüks (örnek)', mult: 1.5 },
  ];
  const PRE = {};
  C.PRESETS.forEach(function (p) { PRE[p.id] = p; });

  // varsayımlardaki sabitler (clamp ve Excel aynı değerleri kullanır)
  C.SOFT_DEFS = [
    { id: 'proje', label: 'Proje ve mühendislik', base: 'hard', timing: 'ay0' },
    { id: 'ruhsat', label: 'Ruhsat, harç ve katkı payları', base: 'hard', timing: 'ay0' },
    { id: 'danisma', label: 'Danışmanlık ve denetim', base: 'hard', timing: 'yapim' },
    { id: 'pazarlama', label: 'Pazarlama ve satış', base: 'revenue', timing: 'satis' },
    { id: 'genel', label: 'Genel yönetim giderleri', base: 'hard', timing: 'yapim' },
    { id: 'beklenmedik', label: 'Beklenmedik giderler', base: 'hard', timing: 'yapim' },
  ];
  const SOFT_DEF = {};
  C.SOFT_DEFS.forEach(function (s) { SOFT_DEF[s.id] = s; });
  const TAIL = 6; // tamamlanma sonrası satış kuyruğu (ay)

  /* ---------------- yardımcılar ---------------- */
  const fin = function (v, d) { v = Number(v); return isFinite(v) ? v : (d == null ? 0 : d); };
  const pos = function (v, d) { v = Number(v); return isFinite(v) && v > 0 ? v : (d == null ? 0 : d); };
  const clampN = function (v, lo, hi, d) { v = Number(v); if (v === null || !isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); };
  const isObj = function (o) { return o && typeof o === 'object' && !Array.isArray(o); };
  const r0 = function (v) { return isFinite(v) ? Math.round(v) : 0; };
  const r4 = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; };
  const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function typeOrder(a, b) { const x = parseFloat(a), y = parseFloat(b); if (isFinite(x) && isFinite(y) && x !== y) return x - y; return a < b ? -1 : a > b ? 1 : 0; }

  /* ---------------- varsayılan varsayımlar ---------------- */
  C.defaults = function () {
    return {
      currency: 'TL',
      preset: 'orta',
      prices: {},
      soft: { proje: 0.04, ruhsat: 0.012, danisma: 0.015, pazarlama: 0.03, genel: 0.04, beklenmedik: 0.05 },
      land: { cost: 0, tapuHarc: 0.04 },
      sales: { price: {}, base: 55000, ground: 1.0, floorPremium: 0.01, commercialPrice: null, parkingPrice: 600000, parkingShare: 1, vat: 0.20, vatMode: 'net', efficiencyNet: 1 },
      finance: { rate: 0.45, equity: 0.4, months: 24, salesStart: 6, presale: 0.35, disc: 0.4 },
      targetMargin: 0.2,
    };
  };
  const DEF = C.defaults();

  // aralık ve tür denetimi; bilinmeyen fiyat kimliklerini atar; eksikleri varsayılanla doldurur
  C.clamp = function (a) {
    const o = C.defaults();
    a = isObj(a) ? a : {};
    const cur = String(a.currency == null ? 'TL' : a.currency).trim().slice(0, 8);
    o.currency = cur || 'TL';
    o.preset = PRE[a.preset] ? a.preset : 'orta';
    if (isObj(a.prices)) Object.keys(a.prices).forEach(function (k) {
      const v = a.prices[k];
      if (CLS[k] && v !== null && v !== '' && isFinite(Number(v)) && Number(v) >= 0) o.prices[k] = Number(v);
    });
    const s = isObj(a.soft) ? a.soft : {};
    Object.keys(DEF.soft).forEach(function (k) { o.soft[k] = clampN(s[k], 0, 0.5, DEF.soft[k]); });
    const l = isObj(a.land) ? a.land : {};
    o.land.cost = clampN(l.cost, 0, 1e13, 0);
    o.land.tapuHarc = clampN(l.tapuHarc, 0, 0.2, DEF.land.tapuHarc);
    const sa = isObj(a.sales) ? a.sales : {};
    const S = o.sales;
    if (isObj(sa.price)) Object.keys(sa.price).forEach(function (k) {
      const v = sa.price[k];
      if (v !== null && v !== '' && isFinite(Number(v)) && Number(v) >= 0) S.price[String(k)] = Number(v);
    });
    S.base = clampN(sa.base, 0, 1e8, DEF.sales.base);
    S.ground = clampN(sa.ground, 0.3, 3, DEF.sales.ground);
    S.floorPremium = clampN(sa.floorPremium, 0, 0.1, DEF.sales.floorPremium);
    S.commercialPrice = sa.commercialPrice === null || sa.commercialPrice === undefined || sa.commercialPrice === '' || !isFinite(Number(sa.commercialPrice)) || Number(sa.commercialPrice) < 0 ? null : Number(sa.commercialPrice);
    S.parkingPrice = clampN(sa.parkingPrice, 0, 1e9, DEF.sales.parkingPrice);
    S.parkingShare = clampN(sa.parkingShare, 0, 1, DEF.sales.parkingShare);
    S.vat = clampN(sa.vat, 0, 0.5, DEF.sales.vat);
    S.vatMode = sa.vatMode === 'gross' ? 'gross' : 'net';
    S.efficiencyNet = clampN(sa.efficiencyNet, 0.3, 1.5, DEF.sales.efficiencyNet);
    const f = isObj(a.finance) ? a.finance : {};
    const F = o.finance;
    F.rate = clampN(f.rate, 0, 3, DEF.finance.rate);
    F.equity = clampN(f.equity, 0, 1, DEF.finance.equity);
    F.months = Math.round(clampN(f.months, 3, 120, DEF.finance.months));
    F.salesStart = Math.round(clampN(f.salesStart, 0, F.months, DEF.finance.salesStart));
    F.presale = clampN(f.presale, 0, 1, DEF.finance.presale);
    F.disc = clampN(f.disc, 0, 3, DEF.finance.disc);
    o.targetMargin = clampN(a.targetMargin, 0, 0.9, DEF.targetMargin);
    return o;
  };

  // etkin birim fiyat: kullanıcı değeri varsa aynen; yoksa örnek fiyat × (ince/tesisat için) ön ayar çarpanı
  function uprice(id, a) {
    const c = CLS[id];
    if (!c) return 0;
    if (a.prices[id] != null) return a.prices[id];
    const m = c.group === 'ince' || c.group === 'tesisat' ? PRE[a.preset].mult : 1;
    return c.price * m;
  }
  C.unitPrice = function (id, a) { return uprice(id, C.clamp(a)); };

  /* ---------------- tasarımdan özet ---------------- */
  // alt: bina üretecinin alternatifi; im: imar sonucu (isteğe bağlı); eksik alanlara toleranslı, asla fırlatmaz
  C.fromDesign = function (alt, im, parcelArea) {
    alt = isObj(alt) ? alt : {};
    im = isObj(im) ? im : {};
    const plan = isObj(alt.plan) ? alt.plan : {};
    const pa = isObj(plan.areas) ? plan.areas : {};
    const bs = isObj(alt.basement) ? alt.basement : {};
    const stack = Array.isArray(alt.stack) ? alt.stack : [];
    const ut = isObj(alt.unitTotals) ? alt.unitTotals : {};
    const stackGross = stack.reduce(function (t, s) { return t + pos(s && s.gross, 0); }, 0);

    let floors = Math.round(pos(alt.floors, 0)) || stack.length || Math.round(pos(im.floors, 0));
    const footprint = pos(alt.footprint, 0) || pos(im.footprint, 0);
    let built = pos(alt.built, 0) || stackGross || pos(im.built, 0) || footprint * floors;
    if (!floors && footprint > 0 && built > 0) floors = Math.max(1, Math.round(built / footprint));
    const height = pos(alt.height, 0) || pos(im.height, 0) || floors * 3;
    const A = pos(parcelArea, 0) || pos(im.parcelArea, 0) || pos(alt.parcelArea, 0);

    // daire sayıları
    const byType = {};
    if (isObj(ut.byType)) Object.keys(ut.byType).forEach(function (k) { const n = fin(ut.byType[k], 0); if (n > 0) byType[k] = Math.round(n); });
    let total = Math.round(pos(ut.total, 0)) || Object.keys(byType).reduce(function (t, k) { return t + byType[k]; }, 0);
    if (!total) total = Math.round(pos(im.units, 0));
    let grossSum = pos(ut.grossSum, 0) || pos(pa.unitsGross, 0);
    const unitList = Array.isArray(plan.units) ? plan.units : [];
    // tür başına ortalama brüt alan (plan.units'ten), toplam brüt ile uyumlu ölçeklenir
    const acc = {};
    unitList.forEach(function (u) {
      if (!u || u.type == null) return;
      const ar = pos(u.area, 0);
      if (!ar) return;
      const e = (acc[u.type] = acc[u.type] || { s: 0, n: 0 });
      e.s += ar; e.n++;
    });
    const unitAreas = {};
    Object.keys(acc).forEach(function (k) { unitAreas[k] = acc[k].s / acc[k].n; });
    const types = Object.keys(byType);
    const avgGross = pos(ut.avgGross, 0) || (total > 0 && grossSum > 0 ? grossSum / total : 0);
    if (!grossSum && types.length && types.every(function (k) { return unitAreas[k]; })) grossSum = types.reduce(function (t, k) { return t + byType[k] * unitAreas[k]; }, 0);
    if (!grossSum && total > 0 && pos(pa.gross, 0) && pos(pa.efficiency, 0)) grossSum = pos(pa.gross, 0) * Math.min(1, pos(pa.efficiency, 0));
    if (!grossSum && built > 0 && total > 0) grossSum = built * 0.8;
    const typeSum = types.reduce(function (t, k) { return t + byType[k] * (unitAreas[k] || avgGross || (total > 0 ? grossSum / total : 0)); }, 0);
    const scale = typeSum > 0 && grossSum > 0 && Object.keys(unitAreas).length ? grossSum / typeSum : 1;
    types.forEach(function (k) {
      const base = unitAreas[k] ? unitAreas[k] * scale : (avgGross || (total > 0 ? grossSum / total : 0));
      unitAreas[k] = Math.round(base * 100) / 100;
    });
    Object.keys(unitAreas).forEach(function (k) { if (!byType[k]) delete unitAreas[k]; });
    const netSum = pos(ut.netSum, 0) || 0;

    // bodrum, otopark
    const bFloors = Math.max(0, Math.round(fin(bs.floors, 0)));
    const basementArea = bFloors * pos(bs.areaEach, 0) || pos(bs.total, 0) || pos(alt.basementArea, 0);
    const parkingCap = Math.max(0, Math.round(fin(bs.capacity, fin(im.carsCapacity, 0))));
    const parkingNeed = Math.max(0, Math.round(fin(bs.need, fin(im.cars, fin(im.carsNeed, 0)))));

    // zemin ticari: yığındaki ticari/ofis katlarının brüt alanı
    let com = pos(alt.groundCommercialArea, 0);
    if (!com) stack.forEach(function (s) { if (s && /ticari|commercial|d[uü]kk[aâ]n|ofis|retail|shop/i.test(String(s.kind || ''))) com += pos(s.gross, 0); });

    const perimeter = pos(alt.perimeter, 0) || pos(plan.perimeter, 0) || (footprint > 0 ? 4.6 * Math.sqrt(footprint) : 0);
    return {
      parcelArea: Math.round(A * 100) / 100,
      built: Math.round(built * 100) / 100,
      basementArea: Math.round(basementArea * 100) / 100,
      floors: floors,
      height: Math.round(height * 100) / 100,
      footprint: Math.round(footprint * 100) / 100,
      unitTotals: { total: total, byType: byType, grossSum: Math.round(grossSum * 100) / 100, netSum: Math.round(netSum * 100) / 100, avgGross: Math.round((avgGross || (total > 0 ? grossSum / total : 0)) * 100) / 100 },
      unitAreas: unitAreas,
      groundCommercialArea: Math.round(com * 100) / 100,
      parkingCap: parkingCap,
      parkingNeed: parkingNeed,
      openArea: Math.round(Math.max(0, A - footprint) * 100) / 100,
      perimeter: Math.round(perimeter * 100) / 100,
      facadeArea: Math.round(pos(alt.facadeArea, 0) || perimeter * height),
    };
  };

  /* ---------------- tasarımı normalleştir ---------------- */
  function normD(d) {
    d = isObj(d) ? d : {};
    const ut = isObj(d.unitTotals) ? d.unitTotals : {};
    const n = {};
    n.parcelArea = pos(d.parcelArea, 0);
    n.footprint = pos(d.footprint, 0);
    n.floors = Math.round(pos(d.floors, 0));
    n.built = pos(d.built, 0) || n.footprint * n.floors;
    if (!n.floors && n.footprint > 0 && n.built > 0) n.floors = Math.max(1, Math.round(n.built / n.footprint));
    if (!n.footprint && n.floors > 0 && n.built > 0) n.footprint = n.built / n.floors;
    n.height = pos(d.height, 0) || n.floors * 3;
    n.basementArea = pos(d.basementArea, 0);
    n.commercial = Math.min(pos(d.groundCommercialArea, 0), n.built);
    n.parkingCap = Math.max(0, Math.round(fin(d.parkingCap, 0)));
    n.parkingNeed = Math.max(0, Math.round(fin(d.parkingNeed, 0)));
    n.openArea = d.openArea != null && isFinite(Number(d.openArea)) ? Math.max(0, Number(d.openArea)) : Math.max(0, n.parcelArea - n.footprint);
    n.perimeter = pos(d.perimeter, 0) || (n.footprint > 0 ? 4.6 * Math.sqrt(n.footprint) : 0);
    n.facade = pos(d.facadeArea, 0) || n.perimeter * n.height;
    n.byType = {};
    if (isObj(ut.byType)) Object.keys(ut.byType).forEach(function (k) { const c = Math.round(fin(ut.byType[k], 0)); if (c > 0) n.byType[k] = c; });
    n.units = Math.round(pos(ut.total, 0)) || Object.keys(n.byType).reduce(function (t, k) { return t + n.byType[k]; }, 0);
    n.grossSum = pos(ut.grossSum, 0);
    n.avgGross = pos(ut.avgGross, 0) || (n.units > 0 && n.grossSum > 0 ? n.grossSum / n.units : 0);
    n.unitArea = {};
    const ua = isObj(d.unitAreas) ? d.unitAreas : {};
    Object.keys(n.byType).forEach(function (k) {
      n.unitArea[k] = pos(ua[k], 0) || n.avgGross || (n.units > 0 && n.grossSum > 0 ? n.grossSum / n.units : 0);
    });
    // yalnız toplam sayı verilmişse tek satır
    if (!Object.keys(n.byType).length && n.units > 0) {
      n.byType = { 'Daire': n.units };
      n.unitArea['Daire'] = n.avgGross || (n.grossSum > 0 ? n.grossSum / n.units : 0);
    }
    const typeGross = Object.keys(n.byType).reduce(function (t, k) { return t + n.byType[k] * n.unitArea[k]; }, 0);
    n.unitsGross = typeGross > 0 ? typeGross : n.grossSum;
    n.common = n.unitsGross > 0 ? Math.max(0, n.built - n.unitsGross - n.commercial) : 0;
    // asansör: 4+ katta, ~40 daireye bir; durak = kat + (bodrum varsa 1)
    n.lifts = n.floors >= 4 ? Math.max(1, Math.ceil((n.units || (n.built * 0.8 / 100)) / 40)) : 0;
    n.stops = n.floors + (n.basementArea > 0 ? 1 : 0);
    return n;
  }

  /* ---------------- metraj (BoQ) ---------------- */
  function qtyOf(id, n) {
    switch (id) {
      case 'kazi-iksa-temel': return { q: n.basementArea + n.footprint, t: 'bodrum ' + Math.round(n.basementArea) + ' + taban ' + Math.round(n.footprint) + ' m²' };
      case 'kaba-insaat': return { q: n.built + n.basementArea, t: 'zemin üstü ' + Math.round(n.built) + ' + bodrum ' + Math.round(n.basementArea) + ' m²' };
      case 'duvar-siva': case 'ince-isler': case 'mekanik': case 'elektrik': return { q: n.built, t: 'zemin üstü brüt ' + Math.round(n.built) + ' m²' };
      case 'cati-yalitim': return { q: n.footprint, t: 'taban oturumu ' + Math.round(n.footprint) + ' m²' };
      case 'cephe': return { q: n.facade, t: 'çevre ' + Math.round(n.perimeter) + ' m × yükseklik ' + Math.round(n.height * 10) / 10 + ' m (tahmini)' };
      case 'asansor': return { q: n.lifts * n.stops, t: n.lifts + ' asansör × ' + n.stops + ' durak' };
      case 'cevre-duzenleme': return { q: n.openArea, t: 'açık alan ' + Math.round(n.openArea) + ' m²' };
      case 'bodrum-otopark': return { q: n.basementArea, t: 'bodrum ' + Math.round(n.basementArea) + ' m²' };
      case 'ortak-alan': return { q: n.common, t: 'ortak alan ' + Math.round(n.common) + ' m²' };
    }
    return { q: 0, t: '' };
  }

  function makeBoq(n, a, costMult) {
    const out = [];
    CLASSES.forEach(function (c) {
      const qq = qtyOf(c.id, n);
      const price = uprice(c.id, a) * costMult;
      const qty = Math.round(qq.q * 100) / 100;
      out.push({ id: c.id, poz: c.poz, label: c.label, group: c.group, unit: c.unit, qty: qty, price: price, amount: qty * price, qtyBasis: c.qtyBasis, qtyNote: qq.t, note: c.note });
    });
    return out;
  }

  /* ---------------- gelir ---------------- */
  // zemin üstü konut katlarının ortalama fiyat çarpanı: zemin kat → ground, diğerleri 1 + prim × (kat − 1)
  function floorFactors(n, S) {
    const hasCom = n.commercial > 0 && n.floors > 1;
    const fr = Math.max(1, n.floors - (hasCom ? 1 : 0));
    const list = [];
    for (let i = 1; i <= fr; i++) {
      const f = i + (hasCom ? 1 : 0);
      list.push({ floor: f, factor: f === 1 ? S.ground : 1 + S.floorPremium * (f - 1) });
    }
    const avg = list.reduce(function (t, x) { return t + x.factor; }, 0) / list.length;
    return { list: list, avg: avg };
  }

  function makeRevenue(n, a, priceMult) {
    const S = a.sales;
    const ff = floorFactors(n, S);
    const rows = [];
    let resArea = 0, resAmt = 0;
    Object.keys(n.byType).sort(typeOrder).forEach(function (t) {
      const count = n.byType[t];
      const area = count * n.unitArea[t] * S.efficiencyNet;
      const base = S.price[t] != null ? S.price[t] : S.base;
      const price = base * ff.avg * priceMult;
      rows.push({ type: t, count: count, unitGross: n.unitArea[t], area: area, basePrice: base, price: price, amount: area * price });
      resArea += area; resAmt += area * price;
    });
    const comPrice = (S.commercialPrice != null ? S.commercialPrice : S.base) * priceMult;
    const commercial = n.commercial * comPrice;
    const stalls = Math.round(n.parkingCap * S.parkingShare);
    const parking = stalls * S.parkingPrice * priceMult;
    const gross = resAmt + commercial + parking;
    const vat = S.vatMode === 'net' ? gross - gross / (1 + S.vat) : 0;
    return {
      rows: rows, commercial: commercial, commercialArea: n.commercial, commercialPrice: comPrice, parking: parking, stalls: stalls,
      gross: gross, vat: vat, net: gross - vat, sellable: resArea + n.commercial, resArea: resArea, floorFactor: ff.avg, floorFactors: ff.list,
    };
  }

  /* ---------------- nakit akışı ---------------- */
  C.SCURVE_K = 6; // lojistik S-eğrisi dikliği
  const sig = function (z) { return 1 / (1 + Math.exp(-z)); };
  function scurveF(x, k) {
    const lo = sig(-k / 2), hi = sig(k / 2);
    return (sig(k * (x - 0.5)) - lo) / (hi - lo);
  }
  const monthly = function (annual) { return Math.pow(1 + annual, 1 / 12) - 1; };

  // periyodik net akış serisi için NPV (t=0 iskontosuz)
  C.npv = function (rate, flows) {
    let s = 0;
    for (let t = 0; t < flows.length; t++) s += fin(flows[t], 0) / Math.pow(1 + rate, t);
    return s;
  };
  // periyodik IRR (ör. aylık); işaret değişimi yoksa null. Alttan taranıp ilk kök ikiye bölmeyle bulunur.
  C.irr = function (flows) {
    if (!Array.isArray(flows)) return null;
    let pos_ = false, neg_ = false;
    flows.forEach(function (v) { v = fin(v, 0); if (v > 0) pos_ = true; if (v < 0) neg_ = true; });
    if (!pos_ || !neg_) return null;
    const f = function (r) { return C.npv(r, flows); };
    let lo = -0.95, flo = f(lo);
    const grid = [];
    for (let r = -0.95; r <= 5; r += 0.01) grid.push(Math.round(r * 1e4) / 1e4);
    for (let i = 1; i < grid.length; i++) {
      const hi = grid[i], fhi = f(hi);
      if (isFinite(flo) && isFinite(fhi) && (flo === 0 || flo * fhi < 0)) {
        let a = lo, b = hi, fa = flo;
        if (flo === 0) return a;
        for (let k = 0; k < 100; k++) {
          const m = (a + b) / 2, fm = f(m);
          if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
        }
        return (a + b) / 2;
      }
      lo = hi; flo = fhi;
    }
    return null;
  };

  // P: { M, salesStart, presale, rate, equity, disc, month0, constr, netRev, mktRate }
  function cashflow(P) {
    const M = P.M, T = M + TAIL;
    const L3 = Math.round(M / 3);
    const pEff = M > P.salesStart ? P.presale : 0;
    const nPre = M - P.salesStart, remStart = M - L3 + 1, nRem = T - remStart + 1;
    const rm = monthly(P.rate);
    const mkt = P.mktRate * P.netRev;
    const preFin = P.month0 + P.constr + mkt;
    const E = P.equity * preFin;

    const cash = { months: [], salesShare: [], buildShare: [], cost: [], revenue: [], net: [], cum: [], interest: [], debt: [], equityIn: [], cumLev: [] };
    let eqLeft = E, cashBal = 0, debt = 0, cum = 0, cumLev = 0, interestSum = 0, peakDebt = 0, eqUsed = 0;
    for (let t = 0; t <= T; t++) {
      const ss = (t > P.salesStart && t <= M && nPre > 0 ? pEff / nPre : 0) + (t >= remStart && t <= T ? (1 - pEff) / nRem : 0);
      const cs = t >= 1 && t <= M ? scurveF(t / M, C.SCURVE_K) - scurveF((t - 1) / M, C.SCURVE_K) : 0;
      const rev = P.netRev * ss;
      const cost = (t === 0 ? P.month0 : 0) + P.constr * cs + P.mktRate * rev;
      const net = rev - cost;
      const need = Math.max(0, -net), inflow = Math.max(0, net);
      const useCash = Math.min(cashBal, need);
      const useEq = Math.min(eqLeft, need - useCash);
      const draw = need - useCash - useEq;
      const repay = Math.min(debt, inflow);
      const interest = rm * (debt + (draw - repay) / 2);
      const debtClose = debt + draw - repay + interest;
      cashBal = cashBal - useCash + (inflow - repay);
      eqLeft -= useEq; eqUsed += useEq;
      debt = debtClose; interestSum += interest;
      if (debt > peakDebt) peakDebt = debt;
      cum += net; cumLev += net - interest;
      cash.months.push(t); cash.salesShare.push(ss); cash.buildShare.push(cs);
      cash.cost.push(cost); cash.revenue.push(rev); cash.net.push(net); cash.cum.push(cum);
      cash.interest.push(interest); cash.debt.push(debtClose); cash.equityIn.push(useEq); cash.cumLev.push(cumLev);
    }
    const rd = monthly(P.disc);
    const npv = C.npv(rd, cash.net);
    const irrM = C.irr(cash.net);
    const irr = irrM == null ? null : Math.pow(1 + irrM, 12) - 1;
    let payback = null, minSoFar = Infinity;
    for (let t = 0; t <= T; t++) {
      minSoFar = Math.min(minSoFar, cash.cumLev[t]);
      if (cash.cumLev[t] >= 0 && minSoFar < 0) { payback = t; break; }
    }
    return {
      cash: cash, finance: interestSum, equityPlanned: E, equity: eqUsed, debt: peakDebt,
      peakFunding: Math.max(0, -Math.min.apply(null, cash.cumLev)), npv: npv, irr: irr, irrMonthly: irrM, paybackMonth: payback, horizon: T,
    };
  }

  /* ---------------- tek çalıştırma (çekirdek) ---------------- */
  // n: normalleştirilmiş tasarım, a: C.clamp çıktısı, ov: { land, price, cost, rate, months, presale }
  function run(n, a, ov) {
    ov = ov || {};
    const costMult = ov.cost == null ? 1 : ov.cost, priceMult = ov.price == null ? 1 : ov.price;
    const F = a.finance;
    const M = ov.months != null ? Math.max(3, Math.round(ov.months)) : F.months;
    const boq = makeBoq(n, a, costMult);
    const hard = boq.reduce(function (t, x) { return t + x.amount; }, 0);
    const revenue = makeRevenue(n, a, priceMult);
    const softItems = C.SOFT_DEFS.map(function (sd) {
      const base = sd.base === 'revenue' ? revenue.net : hard;
      const rate = a.soft[sd.id];
      return { id: sd.id, label: sd.label, base: base, rate: rate, amount: base * rate, basis: sd.base, timing: sd.timing };
    });
    const soft = softItems.reduce(function (t, x) { return t + x.amount; }, 0);
    const land = ov.land != null ? ov.land : a.land.cost;
    const landTax = land * a.land.tapuHarc;
    const sv = function (id) { return softItems.filter(function (x) { return x.id === id; })[0].amount; };
    const cf = cashflow({
      M: M, salesStart: Math.min(F.salesStart, M), presale: ov.presale != null ? ov.presale : F.presale,
      rate: ov.rate != null ? ov.rate : F.rate, equity: F.equity, disc: F.disc,
      month0: land + landTax + sv('proje') + sv('ruhsat'),
      constr: hard + sv('danisma') + sv('genel') + sv('beklenmedik'),
      netRev: revenue.net, mktRate: a.soft.pazarlama,
    });
    const total = hard + soft + land + landTax + cf.finance;
    const profit = revenue.net - total;
    return { boq: boq, hard: hard, softItems: softItems, soft: soft, land: land, landTax: landTax, finance: cf.finance, total: total, revenue: revenue, profit: profit, cf: cf };
  }
  const profitOf = function (n, a, ov) { return run(n, a, ov).profit; };

  /* ---------------- başabaş ve kalıntı arsa ---------------- */
  // Başabaş: tüm satış fiyatlarına (konut, ticari, otopark) uygulanan k çarpanı için kâr(k) = 0.
  //   Kâr k'da tekdüze artan (gelir ↑, pazarlama payı < 1, finans ↓) → tam nakit akışı modelinde ikiye bölme.
  //   Yaklaşık kapalı biçim: k ≈ (toplam − pazarlama) / (net gelir × (1 − pazarlama%)) — yalnız referans.
  function solveBreakEven(n, a) {
    const base = run(n, a);
    if (!(base.revenue.net > 0)) return null;
    let lo = 0.001, hi = 20;
    if (profitOf(n, a, { price: hi }) < 0) return null;
    if (profitOf(n, a, { price: lo }) > 0) return { k: lo, base: base };
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      if (profitOf(n, a, { price: m }) < 0) lo = m; else hi = m;
    }
    return { k: (lo + hi) / 2, base: base };
  }

  // Kalıntı arsa: marj(L) = kâr(L)/net gelir = hedef.
  //   f(L) = kâr(L) − hedef·net;  kâr(L) = net − (yapım+dolaylı) − L(1+τ) − finans(L)
  //   Kapalı biçim tohumu: L* = f(0) / (1 + τ + φ),  φ = dFinans/dL (küçük adımla)
  //   Sonra [0, f(0)/(1+τ)] aralığında ikiye bölmeyle tam nakit akışı modeline oturtulur.
  function solveResidualLand(n, a) {
    const tau = a.land.tapuHarc, m = a.targetMargin;
    const R0 = run(n, a, { land: 0 });
    const net = R0.revenue.net;
    if (!(net > 0)) return { value: 0, raw: null, seed: 0 };
    const f = function (L) { return profitOf(n, a, { land: L }) - m * net; };
    const f0 = f(0);
    const step = Math.max(1, Math.abs(f0) * 0.01);
    const phi = Math.max(0, run(n, a, { land: step }).finance - R0.finance) / step;
    const seed = f0 / (1 + tau + phi);
    if (f0 <= 0) return { value: 0, raw: seed, seed: seed };
    let lo = 0, hi = f0 / (1 + tau);
    if (seed > lo && seed < hi) { if (f(seed) > 0) lo = seed; else hi = seed; }
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return { value: (lo + hi) / 2, raw: (lo + hi) / 2, seed: seed };
  }

  /* ---------------- uyarılar ---------------- */
  function sameJson(x, y) { return JSON.stringify(x) === JSON.stringify(y); }
  // kullanıcının varsayılanlardan değiştirdiği bölümler
  function changedSections(a) {
    const out = [];
    if (Object.keys(a.prices).length) out.push('prices');
    if (a.preset !== DEF.preset) out.push('preset');
    if (!sameJson(a.soft, DEF.soft)) out.push('soft');
    if (!sameJson(a.land, DEF.land)) out.push('land');
    if (!sameJson(a.sales, DEF.sales)) out.push('sales');
    if (!sameJson(a.finance, DEF.finance)) out.push('finance');
    if (a.targetMargin !== DEF.targetMargin) out.push('targetMargin');
    return out;
  }

  function makeWarnings(n, a, R, be, rl) {
    const w = [];
    const ch = changedSections(a);
    if (!a.prices || !Object.keys(a.prices).length) w.push('Maliyet birim fiyatları ÖRNEK varsayılandır (gerçek değildir); Bakanlığın yıllık yaklaşık birim maliyetleri ve yerel teklifleri ile mutlaka değiştirin.');
    if (ch.indexOf('sales') < 0 || (a.sales.base === DEF.sales.base && !Object.keys(a.sales.price).length)) w.push('Satış fiyatı (' + Math.round(a.sales.base) + ' ' + a.currency + '/m²) ÖRNEK varsayımdır; bölgenizin güncel emsal satış fiyatlarını girin.');
    if (!(a.land.cost > 0)) w.push('Arsa bedeli girilmedi (0); kâr ve marj arsa maliyeti hariç görünür. Arsa bedelini Varsayımlar bölümüne girin.');
    if (!(n.built > 0)) w.push('Zemin üstü brüt inşaat alanı (emsal) 0 ya da eksik; maliyet ve gelir hesaplanamaz.');
    if (!(n.units > 0)) w.push('Daire dağılımı bulunamadı; konut geliri hesaplanamadı.');
    if (n.units > 0 && !(n.grossSum > 0)) w.push('Daire brüt alanları eksik; konut geliri alan bilgisi olmadan hesaplanamaz.');
    if (!(R.revenue.gross > 0)) w.push('Satış geliri sıfır; fiyat ve alan varsayımlarını kontrol edin.');
    if (n.parkingNeed > n.parkingCap) w.push('Otopark yetersiz: gereken ' + n.parkingNeed + ' araç, kapasite ' + n.parkingCap + '.');
    if (a.sales.parkingPrice > 0 && n.parkingCap > 0) w.push('Otopark yerlerinin tamamı ayrıca satılıyor varsayıldı (' + R.revenue.stalls + ' adet); zorunlu otopark konut fiyatına dahilse otopark fiyatını 0 yapın.');
    if (a.sales.vatMode === 'net') w.push('Gelir KDV hariç gösterilir (fiyatlar %' + Math.round(a.sales.vat * 100) + ' KDV dahil girildi varsayıldı); maliyetlerde KDV ayrıca modellenmez.');
    if (R.profit < 0) w.push('Bu varsayımlarla proje zarar ediyor (kâr ' + Math.round(R.profit) + ' ' + a.currency + ').');
    else if (R.revenue.net > 0 && R.profit / R.revenue.net < a.targetMargin) w.push('Kâr marjı hedefin altında (%' + (R.profit / R.revenue.net * 100).toFixed(1).replace('.', ',') + ' < %' + Math.round(a.targetMargin * 100) + ').');
    if (rl && rl.value <= 0 && R.revenue.net > 0) w.push('Hedef marj için kalıntı arsa değeri 0 ya da negatif: arsa bedeli sıfır olsa bile hedef marj sağlanmıyor.');
    if (R.cf.peakFunding > 0 && R.cf.irr == null) w.push('Net nakit akışında işaret değişimi yok; IRR tanımsız.');
    if (a.finance.salesStart >= a.finance.months) w.push('Satış başlangıcı inşaat süresine eşit ya da sonra; ön satış payı kullanılmadı.');
    if (R.cf.paybackMonth == null && R.revenue.net > 0) w.push('Finansman sonrası kümülatif nakit akışı ufukta pozitife dönmüyor.');
    w.push('Nakit akışı basitleştirilmiştir: satışlar satış anında tahsil edilir, kredi faizi bakiyeye eklenir, vergi ve enflasyon modellenmez.');
    return w;
  }

  /* ---------------- compute ---------------- */
  C.compute = function (d, a) {
    const A = C.clamp(a), n = normD(d);
    const R = run(n, A);
    const rev = R.revenue;
    const be = solveBreakEven(n, A);
    const rl = solveResidualLand(n, A);
    const sellable = rev.sellable;
    const curPrice = sellable > 0 ? rev.gross / sellable : 0;
    const breakEven = be ? {
      pricePerM2: curPrice * be.k, netPricePerM2: sellable > 0 ? rev.net / sellable * be.k : 0, uplift: be.k - 1, factor: be.k, currentPricePerM2: curPrice,
    } : { pricePerM2: null, netPricePerM2: null, uplift: null, factor: null, currentPricePerM2: curPrice };
    const res = {
      currency: A.currency, boq: R.boq, hard: R.hard, softItems: R.softItems, soft: R.soft, land: R.land, landTax: R.landTax, finance: R.finance, total: R.total,
      revenue: { rows: rev.rows, commercial: rev.commercial, parking: rev.parking, gross: rev.gross, vat: rev.vat, net: rev.net, sellable: rev.sellable, stalls: rev.stalls, floorFactor: rev.floorFactor, floorFactors: rev.floorFactors, commercialArea: rev.commercialArea, commercialPrice: rev.commercialPrice },
      profit: R.profit,
      margin: rev.net > 0 ? R.profit / rev.net : 0,
      roiOnCost: R.total > 0 ? R.profit / R.total : 0,
      costPerM2: n.built > 0 ? R.total / n.built : 0,
      hardPerM2: n.built > 0 ? R.hard / n.built : 0,
      salePerM2: sellable > 0 ? rev.net / sellable : 0,
      breakEven: breakEven,
      residualLand: rl.value, residualLandRaw: rl.raw,
      residualLandPerParcelM2: n.parcelArea > 0 ? rl.value / n.parcelArea : null,
      equity: R.cf.equity, equityPlanned: R.cf.equityPlanned, debt: R.cf.debt, peakFunding: R.cf.peakFunding,
      cash: R.cf.cash, npv: R.cf.npv, irr: R.cf.irr, irrMonthly: R.cf.irrMonthly, paybackMonth: R.cf.paybackMonth, horizon: R.cf.horizon,
      warnings: [], disclaimer: C.DISCLAIMER, label: C.ILLUSTRATIVE_LABEL,
      changed: changedSections(A),
    };
    res.warnings = makeWarnings(n, A, R, breakEven, rl);
    return res;
  };

  /* ---------------- duyarlılık ---------------- */
  C.sensitivity = function (d, a) {
    const A = C.clamp(a), n = normD(d);
    const steps = [-0.2, -0.1, 0, 0.1, 0.2];
    const grid = { costs: steps.slice(), prices: steps.slice(), profit: [], margin: [] };
    steps.forEach(function (cs) {
      const pr = [], mg = [];
      steps.forEach(function (ps) {
        const R = run(n, A, { cost: 1 + cs, price: 1 + ps });
        pr.push(R.profit); mg.push(R.revenue.net > 0 ? R.profit / R.revenue.net : 0);
      });
      grid.profit.push(pr); grid.margin.push(mg);
    });
    const base = run(n, A).profit;
    const F = A.finance;
    const drivers = [
      { id: 'price', label: 'Satış fiyatı', ov: function (k) { return { price: k }; }, val: function (k) { return k; } },
      { id: 'cost', label: 'İnşaat maliyeti', ov: function (k) { return { cost: k }; }, val: function (k) { return k; } },
      { id: 'land', label: 'Arsa bedeli', ov: function (k) { return { land: A.land.cost * k }; }, val: function (k) { return A.land.cost * k; } },
      { id: 'rate', label: 'Kredi faizi', ov: function (k) { return { rate: F.rate * k }; }, val: function (k) { return F.rate * k; } },
      { id: 'months', label: 'İnşaat süresi', ov: function (k) { return { months: Math.max(3, Math.round(F.months * k)) }; }, val: function (k) { return Math.max(3, Math.round(F.months * k)); } },
      { id: 'presale', label: 'Ön satış payı', ov: function (k) { return { presale: Math.min(1, F.presale * k) }; }, val: function (k) { return Math.min(1, F.presale * k); } },
    ];
    const tornado = drivers.map(function (dr) {
      const lo = run(n, A, dr.ov(0.9)).profit, hi = run(n, A, dr.ov(1.1)).profit;
      return { id: dr.id, label: dr.label, low: lo, high: hi, base: base, lowValue: dr.val(0.9), highValue: dr.val(1.1), swing: Math.abs(hi - lo) };
    }).sort(function (x, y) { return y.swing - x.swing; });
    return { grid: grid, tornado: tornado };
  };

  /* ---------------- özet (proje uzantısı) ---------------- */
  C.summary = function (res, a) {
    res = res || {};
    const A = C.clamp(a);
    const ch = changedSections(A);
    const rv = function (v) { return v == null || !isFinite(v) ? null : Math.round(v); };
    return {
      currency: A.currency,
      total: rv(res.total), hard: rv(res.hard), soft: rv(res.soft), land: rv(res.land), landTax: rv(res.landTax), finance: rv(res.finance),
      revenueNet: rv(res.revenue && res.revenue.net), profit: rv(res.profit),
      margin: res.margin == null ? null : r4(res.margin),
      breakEvenPricePerM2: rv(res.breakEven && res.breakEven.pricePerM2),
      residualLand: rv(res.residualLand), peakFunding: rv(res.peakFunding), npv: rv(res.npv),
      irr: res.irr == null ? null : r4(res.irr),
      assumptionsLabel: ch.length ? 'user assumptions' : 'illustrative defaults',
      assumptionsLabelTr: ch.length ? 'Kullanıcı varsayımları' : 'ÖRNEK varsayılanlar',
      changedSections: ch,
      disclaimer: C.DISCLAIMER,
    };
  };

  // dışarıya açılan iç yardımcılar (test ve arayüz için)
  C.normalize = normD;
  C.groupSubtotals = function (boq) {
    const o = {};
    (boq || []).forEach(function (x) { o[x.group] = (o[x.group] || 0) + x.amount; });
    return o;
  };

  /* ==========================================================================
     Excel çalışma kitabı  ·  CANLI FORMÜLLÜ
     Kitap, JS modelinin sadeleştirilmiş ama aynı mantıklı bir kopyasıdır: BoQ, gelir, dolaylı giderler, nakit akışı
     ve finansman formüllerle yeniden hesaplanır. Başabaş fiyat ve kalıntı arsa için tam model yerine formüllü yaklaşım
     (finans, dışa aktarım anındaki kiriş eğimiyle doğrusallaştırılır) kullanılır; dışa aktarım anındaki tam model değerleri yanlarında statik verilir.
     ========================================================================== */
  C.toWorkbook = function (d, a, res, meta) {
    const X = App.xlsx;
    if (!X || !X.build) throw new Error('App.xlsx (29-lib-xlsx.js) yüklü değil');
    meta = meta || {};
    const A = C.clamp(a), n = normD(d);
    res = res && res.boq ? res : C.compute(d, A);
    const useCache = meta.cache !== false;
    const sens = C.sensitivity(d, A);
    const cur = A.currency;
    const be = res.breakEven || {};
    const SN = { ozet: 'Özet', va: 'Varsayımlar', boq: 'Metraj-Maliyet', gelir: 'Gelir', nakit: 'Nakit Akışı', duy: 'Duyarlılık' };
    const Q = function (k) { return "'" + SN[k] + "'!"; };
    const cn = X.colName;
    const abs = function (r, c) { return '$' + cn(c) + '$' + (r + 1); };
    const rel = function (r, c) { return cn(c) + (r + 1); };

    const COLORS = { navy: '1F3A5F', mid: '3B5B85' };
    const st = {
      title: { b: true, size: 15, color: COLORS.navy },
      note: { i: true, color: '555555' },
      warn: { b: true, color: 'B00020', fill: 'FDE7E7' },
      sec: { b: true, color: 'FFFFFF', fill: COLORS.navy },
      hdr: { b: true, color: 'FFFFFF', fill: COLORS.mid, align: 'center', valign: 'center', wrap: true, border: 'all', borderColor: 'BBBBBB' },
      lab: {},
      inp: { fill: 'FFF2CC', color: '0000FF', border: 'all', borderColor: 'BF9000' },
      calc: { border: 'all', borderColor: 'DDDDDD' },
      sub: { b: true, fill: 'E8EEF5', border: 'all', borderColor: 'BBBBBB' },
      tot: { b: true, fill: 'D9EAD3', border: 'all', borderColor: '6AA84F' },
      dim: { color: '666666' },
      stat: { fill: 'F3F3F3', color: '444444', border: 'all', borderColor: 'DDDDDD' },
    };
    const S = function (base, fmt, extra) { return Object.assign({}, base, fmt ? { fmt: fmt } : {}, extra || {}); };
    const fx = function (f, v, s) {
      const o = { f: f, s: s };
      if (useCache && v != null && typeof v === 'number' && isFinite(v)) o.v = v;
      return o;
    };
    const sheets = {};
    const mk = function (key) { sheets[key] = { name: SN[key], rows: [] }; return sheets[key]; };
    const put = function (sh, r, c, cell) { (sh.rows[r] = sh.rows[r] || [])[c] = cell; };
    const fillRow = function (sh, r, c1, c2, s) { for (let c = c1; c <= c2; c++) if (!(sh.rows[r] && sh.rows[r][c] != null)) put(sh, r, c, { v: null, s: s }); };
    const sheetHead = function (sh, title, width) {
      put(sh, 0, 0, { v: title, s: st.title });
      put(sh, 1, 0, { v: C.ILLUSTRATIVE_LABEL + ' — ' + 'sarı hücreler girdidir', s: st.warn });
      fillRow(sh, 1, 1, width - 1, st.warn);
    };
    const Rf = {}; // ad → mutlak başvuru (sayfa adı dahil)

    /* ----- geometri (diğer sayfalarca önceden bilinmesi gerekenler) ----- */
    const types = Object.keys(n.byType).sort(typeOrder);
    const kT = Math.max(1, types.length);
    const gTop = 4, gEnd = gTop + kT - 1, gTot = gEnd + 1, gCom = gTot + 1, gPark = gCom + 1, gGross = gPark + 1, gVat = gGross + 1, gNet = gVat + 1, gUg = gNet + 1, gSell = gUg + 1;
    const gelirRef = function (r, c) { return Q('gelir') + abs(r, c); };

    /* ===================== VARSAYIMLAR ===================== */
    const V = mk('va');
    sheetHead(V, 'Varsayımlar ve tasarım verisi', 7);
    put(V, 2, 0, { v: C.DISCLAIMER, s: st.note });
    let vr = 4;
    const vsec = function (t) { put(V, vr, 0, { v: t, s: st.sec }); fillRow(V, vr, 1, 6, st.sec); vr++; };
    const vhead = function (arr) { arr.forEach(function (t, i) { put(V, vr, i, { v: t, s: st.hdr }); }); V.rowH = V.rowH || {}; V.rowH[vr] = 32; vr++; };
    const inp = function (key, label, val, fmt, unit, note) {
      put(V, vr, 0, { v: label, s: st.lab });
      put(V, vr, 1, { v: val, s: S(st.inp, fmt) });
      put(V, vr, 2, { v: unit || '', s: st.dim });
      put(V, vr, 3, { v: note || '', s: st.dim });
      Rf[key] = Q('va') + abs(vr, 1); vr++;
    };
    const calc = function (key, label, f, v, fmt, unit, note) {
      put(V, vr, 0, { v: label, s: st.lab });
      put(V, vr, 1, fx(f, v, S(st.calc, fmt)));
      put(V, vr, 2, { v: unit || '', s: st.dim });
      put(V, vr, 3, { v: note || '', s: st.dim });
      Rf[key] = Q('va') + abs(vr, 1); vr++;
    };
    vhead(['Parametre', 'Değer', 'Birim', 'Açıklama']);
    vsec('Genel');
    inp('cur', 'Para birimi', cur, null, '', 'Yalnız etiket; sayılar bu birimde girilir');
    const pre = PRE[A.preset];
    inp('presetName', 'Kalite ön ayarı', pre.label, null, '', 'ekonomik / orta / lüks (örnek) — yalnız ince işler ve tesisat sınıflarını çarpar');
    inp('presetMult', 'Kalite çarpanı (ince işler + tesisat)', pre.mult, 'dec2', '×', 'Ön ayar adıyla uyumlu çarpan; doğrudan değiştirilebilir');
    inp('costMult', 'Maliyet duyarlılık çarpanı', 1, 'dec2', '×', '1 = değişmez; tüm BoQ birim fiyatlarını çarpar (ne olur analizi)');
    inp('targetMargin', 'Hedef kâr marjı (kâr / net gelir)', A.targetMargin, 'pct1', '', 'Kalıntı arsa hesabında kullanılır');
    vr++;
    vsec('Tasarım verisi (bina üretecinden; elle değiştirilebilir)');
    inp('parcel', 'Parsel alanı', n.parcelArea, 'dec2', 'm²', '');
    inp('built', 'Zemin üstü brüt inşaat alanı (emsal)', n.built, 'dec2', 'm²', '');
    inp('basement', 'Bodrum brüt alanı (tüm katlar)', n.basementArea, 'dec2', 'm²', '');
    inp('footprint', 'Taban oturumu', n.footprint, 'dec2', 'm²', '');
    inp('floors', 'Kat sayısı (zemin üstü)', n.floors, 'int', 'adet', '');
    inp('height', 'Bina yüksekliği', n.height, 'dec2', 'm', 'Bilgi');
    inp('facade', 'Cephe alanı (tahmini)', n.facade, 'dec2', 'm²', 'Çevre × yükseklik');
    inp('open', 'Açık alan (parsel − taban)', n.openArea, 'dec2', 'm²', '');
    inp('lifts', 'Asansör sayısı', n.lifts, 'int', 'adet', '4+ katta ~40 daireye bir (tahmin)');
    inp('stops', 'Asansör durak sayısı (her asansör)', n.stops, 'int', 'adet', 'Kat + bodrum');
    inp('commercial', 'Zemin kat ticari alan', n.commercial, 'dec2', 'm²', '');
    inp('parkCap', 'Otopark kapasitesi', n.parkingCap, 'int', 'araç', '');
    inp('parkNeed', 'Otopark ihtiyacı', n.parkingNeed, 'int', 'araç', 'Bilgi');
    calc('common', 'Ortak alan (zemin üstü − daire brüt − ticari)', 'IF(' + gelirRef(gUg, 3) + '>0,MAX(0,' + 'REF_built' + '-' + gelirRef(gUg, 3) + '-' + 'REF_com' + '),0)', n.common, 'dec2', 'm²', 'Formül: Gelir sayfasındaki daire brüt toplamından');
    vr++;
    vsec('Birim fiyatlar — ' + 'ÖRNEK / ILLUSTRATIVE (kendi değerlerinizi "Kullanıcı fiyatı" sütununa yazın)');
    vhead(['Poz – iş kalemi', 'Örnek fiyat (ÖRNEK)', 'Kullanıcı fiyatı (boş = örnek)', 'Etkin fiyat', 'Birim', 'Grup', 'Not']);
    CLASSES.forEach(function (c) {
      put(V, vr, 0, { v: c.poz + ' – ' + c.label, s: st.lab });
      put(V, vr, 1, { v: c.price, s: S(st.stat, 'int') });
      put(V, vr, 2, { v: A.prices[c.id] != null ? A.prices[c.id] : null, s: S(st.inp, 'int') });
      put(V, vr, 3, fx('IF(ISNUMBER(' + rel(vr, 2) + '),' + rel(vr, 2) + ',' + rel(vr, 1) + '*IF(OR(' + rel(vr, 5) + '="ince",' + rel(vr, 5) + '="tesisat"),REF_presetMult,1))', uprice(c.id, A), S(st.calc, 'int')));
      put(V, vr, 4, { v: c.unit, s: st.dim });
      put(V, vr, 5, { v: c.group, s: st.dim });
      put(V, vr, 6, { v: c.note, s: st.dim });
      Rf['price:' + c.id] = Q('va') + abs(vr, 3); vr++;
    });
    vr++;
    vsec('Dolaylı giderler (oran)');
    C.SOFT_DEFS.forEach(function (sd) {
      inp('soft:' + sd.id, sd.label, A.soft[sd.id], 'pct1', '', sd.base === 'revenue' ? 'Net satış geliri üzerinden' : 'Yapım maliyeti (hard) üzerinden');
    });
    vr++;
    vsec('Arsa — kullanıcı girmelidir');
    inp('landCost', 'Arsa bedeli', A.land.cost, 'int', cur, 'Girilmezse 0 kalır; kâr arsa hariç görünür');
    inp('tapuHarc', 'Tapu harcı ve alım masrafı', A.land.tapuHarc, 'pct1', '', 'Arsa bedeline oran');
    vr++;
    vsec('Satış — ÖRNEK fiyatlar; bölge emsallerine göre değiştirin');
    inp('base', 'Taban satış fiyatı (konut)', A.sales.base, 'int', cur + '/m² brüt', 'ÖRNEK; tür bazlı fiyat Gelir sayfasında girilebilir');
    inp('ground', 'Zemin kat fiyat çarpanı', A.sales.ground, 'dec2', '×', '');
    inp('floorPremium', 'Kat primi (1. kattan sonra her kat)', A.sales.floorPremium, 'pct1', '', 'Birimler konut katlarına eşit dağılır varsayımı');
    inp('comPrice', 'Ticari satış fiyatı (boş = taban)', A.sales.commercialPrice, 'int', cur + '/m²', '');
    inp('parkPrice', 'Otopark yeri satış fiyatı', A.sales.parkingPrice, 'int', cur + '/adet', '0 = konut fiyatına dahil');
    inp('parkShare', 'Ayrıca satılan otopark payı', A.sales.parkingShare, 'pct1', '', '');
    inp('vat', 'KDV oranı', A.sales.vat, 'pct1', '', '');
    inp('vatMode', 'KDV kipi (net / gross)', A.sales.vatMode, null, '', 'net: fiyatlar KDV dahil, gelir KDV hariç gösterilir');
    inp('eff', 'Satılabilir alan çarpanı (brüt → satılan)', A.sales.efficiencyNet, 'dec2', '×', '1 = brüt alan üzerinden satış');
    calc('comEff', 'Etkin ticari fiyat', 'IF(ISNUMBER(REF_comPrice),REF_comPrice,REF_base)', res.revenue.commercialPrice, 'int', cur + '/m²', '');
    vr++;
    vsec('Finansman ve zaman');
    inp('rate', 'Kredi faizi (yıllık)', A.finance.rate, 'pct1', '', 'Aylık eşdeğer bileşik oran kullanılır');
    inp('equity', 'Özkaynak payı (maliyet üzerinden)', A.finance.equity, 'pct1', '', 'Önce özkaynak, sonra kredi');
    inp('months', 'İnşaat süresi', A.finance.months, 'int', 'ay', 'En çok 120');
    inp('salesStart', 'Satış başlangıcı', A.finance.salesStart, 'int', 'ay', 'İnşaat süresinden büyük olamaz');
    inp('presale', 'Tamamlanmadan satılan pay', A.finance.presale, 'pct1', '', 'Satış başlangıcından tamamlanmaya doğrusal');
    inp('disc', 'NPV iskonto oranı (yıllık)', A.finance.disc, 'pct1', '', '');
    inp('K', 'S-eğrisi dikliği', C.SCURVE_K, 'dec2', '', 'Yapım giderinin aylara lojistik dağılımı');
    // yer tutucuları çöz
    const subst = function (f) {
      return f.replace(/REF_([A-Za-z]+)/g, function (m, k) {
        const map = { built: Rf.built, com: Rf.commercial, presetMult: Rf.presetMult, comPrice: Rf.comPrice, base: Rf.base };
        return map[k] || m;
      });
    };
    V.rows.forEach(function (row) { if (row) row.forEach(function (c) { if (c && c.f) c.f = subst(c.f); }); });
    V.cols = [{ w: 52 }, { w: 22 }, { w: 22 }, { w: 18 }, { w: 12 }, { w: 12 }, { w: 80 }];
    V.freeze = { row: 5, col: 0 };
    V.tab = 'FFC000';

    /* ===================== GELİR ===================== */
    const G = mk('gelir');
    sheetHead(G, 'Satış geliri', 12);
    put(G, 2, 0, { v: 'Gelir = satılabilir m² × birim fiyat × ortalama kat çarpanı. Fiyatlar ÖRNEK; tür bazlı fiyat sütunu boşsa taban fiyat kullanılır.', s: st.note });
    ['Tür', 'Adet', 'Brüt m² / daire', 'Satılabilir m²', 'Fiyat girdisi (boş = taban)', 'Etkin taban fiyat', 'Kat çarpanı (ort.)', 'Birim fiyat (' + cur + '/m²)', 'Tutar (' + cur + ')'].forEach(function (t, i) { put(G, 3, i, { v: t, s: st.hdr }); });
    G.rowH = { 3: 34 };
    const ffAvgRef = '$L$' + (gTop + res.revenue.floorFactors.length + 1); // ortalama hücresi (aşağıda)
    const ffList = res.revenue.floorFactors;
    const rowsRev = res.revenue.rows;
    for (let i = 0; i < kT; i++) {
      const r = gTop + i, t = types[i], rr = rowsRev[i];
      put(G, r, 0, { v: t == null ? '—' : t, s: st.calc });
      put(G, r, 1, { v: t == null ? 0 : n.byType[t], s: S(st.inp, 'int') });
      put(G, r, 2, { v: t == null ? 0 : n.unitArea[t], s: S(st.inp, 'dec2') });
      put(G, r, 3, fx(rel(r, 1) + '*' + rel(r, 2) + '*' + Rf.eff, rr && rr.area, S(st.calc, 'dec2')));
      put(G, r, 4, { v: t != null && A.sales.price[t] != null ? A.sales.price[t] : null, s: S(st.inp, 'int') });
      put(G, r, 5, fx('IF(ISNUMBER(' + rel(r, 4) + '),' + rel(r, 4) + ',' + Rf.base + ')', rr && rr.basePrice, S(st.calc, 'int')));
      put(G, r, 6, fx(ffAvgRef, res.revenue.floorFactor, S(st.calc, '0.0000')));
      put(G, r, 7, fx(rel(r, 5) + '*' + rel(r, 6), rr && rr.price, S(st.calc, 'int')));
      put(G, r, 8, fx(rel(r, 3) + '*' + rel(r, 7), rr && rr.amount, S(st.calc, 'int')));
    }
    const rg = function (c) { return rel(gTop, c) + ':' + rel(gEnd, c); };
    const resAmtJs = rowsRev.reduce(function (t, x) { return t + x.amount; }, 0);
    put(G, gTot, 0, { v: 'Konut toplamı', s: st.sub });
    put(G, gTot, 1, fx('SUM(' + rg(1) + ')', n.units, S(st.sub, 'int')));
    put(G, gTot, 2, { v: null, s: st.sub });
    put(G, gTot, 3, fx('SUM(' + rg(3) + ')', res.revenue.sellable - res.revenue.commercialArea, S(st.sub, 'dec2')));
    fillRow(G, gTot, 4, 7, st.sub);
    put(G, gTot, 8, fx('SUM(' + rg(8) + ')', resAmtJs, S(st.sub, 'int')));
    put(G, gCom, 0, { v: 'Zemin kat ticari', s: st.calc });
    put(G, gCom, 1, { v: null, s: st.calc }); put(G, gCom, 2, { v: null, s: st.calc });
    put(G, gCom, 3, fx(Rf.commercial, res.revenue.commercialArea, S(st.calc, 'dec2')));
    fillRow(G, gCom, 4, 6, st.calc);
    put(G, gCom, 7, fx(Rf.comEff, res.revenue.commercialPrice, S(st.calc, 'int')));
    put(G, gCom, 8, fx(rel(gCom, 3) + '*' + rel(gCom, 7), res.revenue.commercial, S(st.calc, 'int')));
    put(G, gPark, 0, { v: 'Otopark yerleri (adet)', s: st.calc });
    put(G, gPark, 1, fx('ROUND(' + Rf.parkCap + '*' + Rf.parkShare + ',0)', res.revenue.stalls, S(st.calc, 'int')));
    fillRow(G, gPark, 2, 6, st.calc);
    put(G, gPark, 7, fx(Rf.parkPrice, A.sales.parkingPrice, S(st.calc, 'int')));
    put(G, gPark, 8, fx(rel(gPark, 1) + '*' + rel(gPark, 7), res.revenue.parking, S(st.calc, 'int')));
    put(G, gGross, 0, { v: 'Brüt satış geliri' + (A.sales.vatMode === 'net' ? ' (KDV dahil)' : ''), s: st.sub });
    fillRow(G, gGross, 1, 7, st.sub);
    put(G, gGross, 8, fx(rel(gTot, 8) + '+' + rel(gCom, 8) + '+' + rel(gPark, 8), res.revenue.gross, S(st.sub, 'int')));
    put(G, gVat, 0, { v: 'KDV (yalnız "net" kipinde düşülür)', s: st.calc });
    fillRow(G, gVat, 1, 7, st.calc);
    put(G, gVat, 8, fx('IF(' + Rf.vatMode + '="net",' + rel(gGross, 8) + '-' + rel(gGross, 8) + '/(1+' + Rf.vat + '),0)', res.revenue.vat, S(st.calc, 'int')));
    put(G, gNet, 0, { v: 'NET SATIŞ GELİRİ', s: st.tot });
    fillRow(G, gNet, 1, 7, st.tot);
    put(G, gNet, 8, fx(rel(gGross, 8) + '-' + rel(gVat, 8), res.revenue.net, S(st.tot, 'int')));
    put(G, gUg, 0, { v: 'Daire brüt toplamı (adet × brüt m²)', s: st.dim });
    put(G, gUg, 3, fx('SUMPRODUCT(' + rg(1) + ',' + rg(2) + ')', n.unitsGross, S(st.calc, 'dec2')));
    put(G, gSell, 0, { v: 'Satılabilir toplam alan (konut + ticari)', s: st.dim });
    put(G, gSell, 3, fx(rel(gTot, 3) + '+' + rel(gCom, 3), res.revenue.sellable, S(st.calc, 'dec2')));
    // kat çarpanı tablosu
    put(G, 3, 10, { v: 'Kat', s: st.hdr }); put(G, 3, 11, { v: 'Fiyat çarpanı', s: st.hdr });
    ffList.forEach(function (x, i) {
      const r = gTop + i;
      put(G, r, 10, { v: x.floor, s: S(st.calc, 'int') });
      put(G, r, 11, fx('IF(' + rel(r, 10) + '=1,' + Rf.ground + ',1+' + Rf.floorPremium + '*(' + rel(r, 10) + '-1))', x.factor, S(st.calc, '0.0000')));
    });
    const ffAvgRow = gTop + ffList.length;
    put(G, ffAvgRow, 10, { v: 'Ortalama', s: st.sub });
    put(G, ffAvgRow, 11, fx('AVERAGE(' + rel(gTop, 11) + ':' + rel(ffAvgRow - 1, 11) + ')', res.revenue.floorFactor, S(st.sub, '0.0000')));
    G.cols = [{ w: 38 }, { w: 10 }, { w: 14 }, { w: 16 }, { w: 20 }, { w: 16 }, { w: 14 }, { w: 18 }, { w: 20 }, { w: 3 }, { w: 10 }, { w: 14 }];
    G.freeze = { row: 4, col: 1 };
    G.tab = '6AA84F';
    Rf.gNet = gelirRef(gNet, 8); Rf.gGross = gelirRef(gGross, 8); Rf.gVat = gelirRef(gVat, 8);
    Rf.sellable = gelirRef(gSell, 3);

    /* ===================== METRAJ-MALİYET ===================== */
    const B = mk('boq');
    sheetHead(B, 'Metraj ve maliyet (BoQ)', 9);
    put(B, 2, 0, { v: 'Tutar = miktar × birim fiyat (Varsayımlar sayfasındaki etkin fiyat × maliyet çarpanı). Alt toplamlar SUBTOTAL ile, genel toplam alt toplamları saymaz.', s: st.note });
    ['Poz', 'İş kalemi', 'Grup', 'Birim', 'Miktar', 'Birim fiyat (' + cur + ')', 'Tutar (' + cur + ')', 'Miktar dayanağı', 'Not'].forEach(function (t, i) { put(B, 3, i, { v: t, s: st.hdr }); });
    B.rowH = { 3: 30 };
    const QF = {
      'kazi-iksa-temel': Rf.basement + '+' + Rf.footprint,
      'kaba-insaat': Rf.built + '+' + Rf.basement,
      'duvar-siva': Rf.built, 'ince-isler': Rf.built, 'mekanik': Rf.built, 'elektrik': Rf.built,
      'cati-yalitim': Rf.footprint, 'cephe': Rf.facade, 'asansor': Rf.lifts + '*' + Rf.stops,
      'cevre-duzenleme': Rf.open, 'bodrum-otopark': Rf.basement, 'ortak-alan': Rf.common,
    };
    const boqById = {};
    res.boq.forEach(function (x) { boqById[x.id] = x; });
    let br = 4;
    const gFirst = br, subRows = [];
    Object.keys(GROUPS).forEach(function (g) {
      const first = br;
      CLASSES.filter(function (c) { return c.group === g; }).forEach(function (c) {
        const x = boqById[c.id];
        put(B, br, 0, { v: c.poz, s: st.calc });
        put(B, br, 1, { v: c.label, s: st.calc });
        put(B, br, 2, { v: g, s: st.calc });
        put(B, br, 3, { v: c.unit, s: st.calc });
        put(B, br, 4, fx('ROUND(' + QF[c.id] + ',2)', x && x.qty, S(st.calc, 'dec2')));
        put(B, br, 5, fx(Rf['price:' + c.id] + '*' + Rf.costMult, x && x.price, S(st.calc, 'int')));
        put(B, br, 6, fx(rel(br, 4) + '*' + rel(br, 5), x && x.amount, S(st.calc, 'int')));
        put(B, br, 7, { v: (x ? x.qtyNote : '') || c.qtyBasis, s: st.dim });
        put(B, br, 8, { v: c.note, s: st.dim });
        br++;
      });
      const gs = C.groupSubtotals(res.boq)[g];
      put(B, br, 0, { v: '', s: st.sub });
      put(B, br, 1, { v: 'Ara toplam — ' + GROUPS[g], s: st.sub });
      fillRow(B, br, 2, 5, st.sub);
      put(B, br, 6, fx('SUBTOTAL(9,' + rel(first, 6) + ':' + rel(br - 1, 6) + ')', gs, S(st.sub, 'int')));
      fillRow(B, br, 7, 8, st.sub);
      subRows.push(br);
      br++;
    });
    const gLast = br - 1;
    put(B, br, 1, { v: 'YAPIM MALİYETİ (HARD)', s: st.tot });
    fillRow(B, br, 0, 5, st.tot);
    put(B, br, 6, fx('SUBTOTAL(9,' + rel(gFirst, 6) + ':' + rel(gLast, 6) + ')', res.hard, S(st.tot, 'int')));
    fillRow(B, br, 7, 8, st.tot);
    Rf.hard = Q('boq') + abs(br, 6);
    br += 2;
    // dolaylı giderler
    ['', 'Dolaylı gider', 'Baz', 'Oran', 'Baz tutarı', '', 'Tutar (' + cur + ')'].forEach(function (t, i) { put(B, br, i, { v: t, s: st.hdr }); });
    br++;
    const softFirst = br;
    C.SOFT_DEFS.forEach(function (sd) {
      const it = res.softItems.filter(function (x) { return x.id === sd.id; })[0];
      put(B, br, 1, { v: sd.label, s: st.calc });
      put(B, br, 2, { v: sd.base === 'revenue' ? 'Net gelir' : 'Hard', s: st.calc });
      put(B, br, 3, fx(Rf['soft:' + sd.id], A.soft[sd.id], S(st.calc, 'pct1')));
      put(B, br, 4, fx(sd.base === 'revenue' ? Rf.gNet : Rf.hard, it && it.base, S(st.calc, 'int')));
      put(B, br, 5, { v: null, s: st.calc });
      put(B, br, 6, fx(rel(br, 4) + '*' + rel(br, 3), it && it.amount, S(st.calc, 'int')));
      Rf['s:' + sd.id] = Q('boq') + abs(br, 6);
      br++;
    });
    put(B, br, 1, { v: 'Dolaylı giderler toplamı', s: st.sub });
    fillRow(B, br, 0, 5, st.sub);
    put(B, br, 6, fx('SUM(' + rel(softFirst, 6) + ':' + rel(br - 1, 6) + ')', res.soft, S(st.sub, 'int')));
    Rf.soft = Q('boq') + abs(br, 6); br++;
    put(B, br, 1, { v: 'Arsa bedeli', s: st.calc });
    put(B, br, 6, fx(Rf.landCost, res.land, S(st.calc, 'int'))); Rf.land = Q('boq') + abs(br, 6); br++;
    put(B, br, 1, { v: 'Tapu harcı ve alım masrafı', s: st.calc });
    put(B, br, 3, fx(Rf.tapuHarc, A.land.tapuHarc, S(st.calc, 'pct1')));
    put(B, br, 4, fx(Rf.land, res.land, S(st.calc, 'int')));
    put(B, br, 6, fx(rel(br, 4) + '*' + rel(br, 3), res.landTax, S(st.calc, 'int'))); Rf.tax = Q('boq') + abs(br, 6); br++;
    put(B, br, 1, { v: 'Finansman gideri (Nakit Akışı sayfasındaki toplam faiz)', s: st.calc });
    // finans hücresi Nakit Akışı sayfası kurulunca doldurulur
    const finRowB = br; br++;
    put(B, br, 1, { v: 'TOPLAM MALİYET', s: st.tot });
    fillRow(B, br, 0, 5, st.tot);
    put(B, br, 6, fx(Rf.hard + '+' + Rf.soft + '+' + Rf.land + '+' + Rf.tax + '+' + rel(finRowB, 6), res.total, S(st.tot, 'int')));
    fillRow(B, br, 7, 8, st.tot);
    Rf.total = Q('boq') + abs(br, 6);
    B.cols = [{ w: 8 }, { w: 52 }, { w: 12 }, { w: 10 }, { w: 14 }, { w: 16 }, { w: 20 }, { w: 44 }, { w: 80 }];
    B.freeze = { row: 4, col: 2 };
    B.tab = '3B5B85';

    /* ===================== NAKİT AKIŞI ===================== */
    const N = mk('nakit');
    sheetHead(N, 'Aylık nakit akışı, finansman, NPV ve IRR', 24);
    put(N, 2, 0, { v: 'Ay 0 = arsa + proje + ruhsat; ay 1..M inşaat (S-eğrisi); satış payları doğrusal; faiz ortalama çekili bakiye üzerinden bakiyeye eklenir. 127 satır (ay 0..126) — ufuk dışı satırlar 0 görünür.', s: st.note });
    const NP = {}; // parametre başvuruları
    const nparam = function (key, row, label, f, v, fmt) {
      put(N, row, 0, { v: label, s: st.lab });
      put(N, row, 1, fx(f, v, S(st.calc, fmt)));
      NP[key] = abs(row, 1);
    };
    const cf = res.cash;
    const Tn = res.horizon, Mn = A.finance.months;
    const Sn = Math.min(A.finance.salesStart, Mn);
    const L3n = Math.round(Mn / 3);
    nparam('M', 3, 'İnşaat süresi M (ay)', Rf.months, Mn, 'int');
    nparam('S', 4, 'Satış başlangıcı S (ay)', 'MIN(' + Rf.salesStart + ',' + abs(3, 1) + ')', Sn, 'int');
    nparam('pre', 5, 'Ön satış payı', Rf.presale, A.finance.presale, 'pct1');
    nparam('pEff', 6, 'Etkin ön satış payı', 'IF(' + NP.M + '>' + NP.S + ',' + NP.pre + ',0)', Mn > Sn ? A.finance.presale : 0, 'pct1');
    nparam('L3', 7, 'Son üçte bir (ay)', 'ROUND(' + NP.M + '/3,0)', L3n, 'int');
    nparam('nPre', 8, 'Ön satış penceresi (ay)', NP.M + '-' + NP.S, Mn - Sn, 'int');
    nparam('rs', 9, 'Kalan satış başlangıcı (ay)', NP.M + '-' + NP.L3 + '+1', Mn - L3n + 1, 'int');
    nparam('T', 10, 'Ufuk T = M + 6 (ay)', NP.M + '+6', Tn, 'int');
    nparam('nRem', 11, 'Kalan satış penceresi (ay)', NP.T + '-' + NP.rs + '+1', Tn - (Mn - L3n + 1) + 1, 'int');
    nparam('rm', 12, 'Aylık faiz', '(1+' + Rf.rate + ')^(1/12)-1', Math.pow(1 + A.finance.rate, 1 / 12) - 1, '0.0000%');
    nparam('rd', 13, 'Aylık iskonto', '(1+' + Rf.disc + ')^(1/12)-1', Math.pow(1 + A.finance.disc, 1 / 12) - 1, '0.0000%');
    nparam('K', 14, 'S-eğrisi dikliği', Rf.K, C.SCURVE_K, 'dec2');
    nparam('lo', 15, 'S-eğrisi alt (σ(−K/2))', '1/(1+EXP(' + NP.K + '/2))', sig(-C.SCURVE_K / 2), '0.0000');
    nparam('hi', 16, 'S-eğrisi üst (σ(K/2))', '1/(1+EXP(-' + NP.K + '/2))', sig(C.SCURVE_K / 2), '0.0000');
    const m0 = res.land + res.landTax + res.softItems.filter(function (x) { return x.id === 'proje' || x.id === 'ruhsat'; }).reduce(function (t, x) { return t + x.amount; }, 0);
    const cst = res.hard + res.softItems.filter(function (x) { return x.id === 'danisma' || x.id === 'genel' || x.id === 'beklenmedik'; }).reduce(function (t, x) { return t + x.amount; }, 0);
    nparam('m0', 17, 'Ay 0 gideri (arsa + tapu + proje + ruhsat)', Rf.land + '+' + Rf.tax + '+' + Rf['s:proje'] + '+' + Rf['s:ruhsat'], m0, 'int');
    nparam('cs', 18, 'Yapım giderleri (hard + danışmanlık + genel + beklenmedik)', Rf.hard + '+' + Rf['s:danisma'] + '+' + Rf['s:genel'] + '+' + Rf['s:beklenmedik'], cst, 'int');
    nparam('rev', 19, 'Net satış geliri', Rf.gNet, res.revenue.net, 'int');
    nparam('mk', 20, 'Pazarlama oranı (gelir payı)', Rf.soft + ':pazarlama', A.soft.pazarlama, 'pct1');
    N.rows[20][1].f = Rf['soft:pazarlama'];
    const pf = m0 + cst + A.soft.pazarlama * res.revenue.net;
    nparam('pf', 21, 'Finansman öncesi toplam maliyet', NP.m0 + '+' + NP.cs + '+' + NP.rev + '*' + NP.mk, pf, 'int');
    nparam('E', 22, 'Planlanan özkaynak (özkaynak payı × maliyet)', Rf.equity + '*' + NP.pf, res.equityPlanned, 'int');

    const th = 25, r0 = th + 1, NR = 127, rL = r0 + NR - 1;
    const heads = ['Ay t', 'Satış payı', 'Yapım payı (S)', 'Yapım gideri', 'Ay 0 gideri', 'Pazarlama', 'Toplam gider', 'Net gelir', 'Net nakit (finans öncesi)', 'Kümülatif (finans öncesi)',
      'Nakit açılış', 'Özkaynak kalan (açılış)', 'Borç açılış', 'Fon ihtiyacı', 'Nakitten karşılanan', 'Özkaynaktan karşılanan', 'Kredi çekimi', 'Kredi geri ödeme', 'Faiz', 'Borç kapanış', 'Nakit kapanış', 'Özkaynak kalan (kapanış)', 'Kümülatif (finans sonrası)', 'Geri ödendi bayrağı'];
    heads.forEach(function (t, i) { put(N, th, i, { v: t, s: st.hdr }); });
    N.rowH = { 25: 48 };
    const Fx = function (x) { return '(1/(1+EXP(-' + NP.K + '*(' + x + '-0.5)))-' + NP.lo + ')/(' + NP.hi + '-' + NP.lo + ')'; };
    for (let i = 0; i < NR; i++) {
      const r = r0 + i, t = rel(r, 0), pv = i > 0 ? r - 1 : null;
      const c = function (k) { return rel(r, k); };
      const p = function (k) { return pv == null ? null : rel(pv, k); };
      const cell = function (k, f, fmt, v) { put(N, r, k, fx(f, v, S(st.calc, fmt))); };
      put(N, r, 0, { v: i, s: S(st.calc, 'int') });
      cell(1, 'IF(' + t + '>' + NP.T + ',0,IF(AND(' + t + '>' + NP.S + ',' + t + '<=' + NP.M + ',' + NP.nPre + '>0),' + NP.pEff + '/' + NP.nPre + ',0)+IF(' + t + '>=' + NP.rs + ',(1-' + NP.pEff + ')/' + NP.nRem + ',0))', '0.0000');
      cell(2, 'IF(AND(' + t + '>=1,' + t + '<=' + NP.M + '),' + Fx(t + '/' + NP.M) + '-' + Fx('(' + t + '-1)/' + NP.M) + ',0)', '0.0000');
      cell(3, NP.cs + '*' + c(2), 'int');
      cell(4, 'IF(' + t + '=0,' + NP.m0 + ',0)', 'int');
      cell(5, NP.mk + '*' + c(7), 'int');
      cell(6, c(3) + '+' + c(4) + '+' + c(5), 'int');
      cell(7, NP.rev + '*' + c(1), 'int');
      cell(8, c(7) + '-' + c(6), 'int');
      cell(9, (pv == null ? '' : p(9) + '+') + c(8), 'int');
      cell(10, pv == null ? '0' : p(20), 'int');
      cell(11, pv == null ? NP.E : p(21), 'int');
      cell(12, pv == null ? '0' : p(19), 'int');
      cell(13, 'MAX(0,-' + c(8) + ')', 'int');
      cell(14, 'MIN(' + c(10) + ',' + c(13) + ')', 'int');
      cell(15, 'MIN(' + c(11) + ',' + c(13) + '-' + c(14) + ')', 'int');
      cell(16, c(13) + '-' + c(14) + '-' + c(15), 'int');
      cell(17, 'MIN(' + c(12) + ',MAX(0,' + c(8) + '))', 'int');
      cell(18, 'IF(' + t + '>' + NP.T + ',0,' + NP.rm + '*(' + c(12) + '+(' + c(16) + '-' + c(17) + ')/2))', 'int');
      cell(19, c(12) + '+' + c(16) + '-' + c(17) + '+' + c(18), 'int');
      cell(20, c(10) + '-' + c(14) + '+MAX(0,' + c(8) + ')-' + c(17), 'int');
      cell(21, c(11) + '-' + c(15), 'int');
      cell(22, (pv == null ? '' : p(22) + '+') + c(8) + '-' + c(18), 'int');
      cell(23, 'IF(AND(' + c(22) + '>=0,MIN(' + abs(r0, 22) + ':' + c(22) + ')<0),1,0)', 'int');
    }
    const colR = function (k) { return abs(r0, k) + ':' + abs(rL, k); };
    const nres = function (row, label, f, v, fmt) {
      put(N, row, 3, { v: label, s: st.lab });
      put(N, row, 4, fx(f, v, S(st.tot, fmt)));
      return Q('nakit') + abs(row, 4);
    };
    Rf.fin = nres(3, 'Finans gideri (toplam faiz)', 'SUM(' + colR(18) + ')', res.finance, 'int');
    Rf.eqUsed = nres(4, 'Özkaynak (kullanılan)', 'SUM(' + colR(15) + ')', res.equity, 'int');
    Rf.debtPeak = nres(5, 'Kredi (en yüksek bakiye)', 'MAX(' + colR(19) + ')', res.debt, 'int');
    Rf.peak = nres(6, 'Zirve fonlama ihtiyacı', 'MAX(0,-MIN(' + colR(22) + '))', res.peakFunding, 'int');
    Rf.npv = nres(7, 'NPV (finans öncesi net akış, aylık iskonto)', rel(r0, 8) + '+NPV(' + NP.rd + ',' + rel(r0 + 1, 8) + ':' + rel(rL, 8) + ')', res.npv, 'int');
    const irrAddr = nres(8, 'IRR (aylık)', 'IFERROR(IRR(' + rel(r0, 8) + ':' + rel(rL, 8) + ',0.01),"—")', res.irrMonthly, '0.0000%');
    Rf.irr = nres(9, 'IRR (yıllık)', 'IFERROR((1+' + irrAddr.replace(/^.*!/, '') + ')^12-1,"—")', res.irr, '0.0%');
    Rf.payback = nres(10, 'Geri ödeme ayı (finans sonrası küm. ≥ 0)', 'IFERROR(MATCH(1,' + colR(23) + ',0)-1,"—")', res.paybackMonth, 'int');
    Rf.chk = nres(11, 'Kontrol: son küm. (finans sonrası) − kâr', rel(rL, 22) + '-REF_PROFIT', 0, 'int');
    put(N, 12, 3, { v: 'Kontrol 0 (≈) olmalıdır; kâr = net gelir − toplam maliyet.', s: st.note });
    N.cols = [{ w: 40 }, { w: 14 }, { w: 14 }].concat(Array.apply(null, Array(21)).map(function () { return { w: 15 }; }));
    N.cols[3] = { w: 36 }; N.cols[4] = { w: 16 };
    N.freeze = { row: 26, col: 1 };
    N.tab = 'E06666';
    // finans satırı (Metraj-Maliyet)
    put(B, finRowB, 6, fx(Rf.fin, res.finance, S(st.calc, 'int')));
    fillRow(B, finRowB, 2, 5, st.calc);

    /* ===================== ÖZET ===================== */
    const O = mk('ozet');
    put(O, 0, 0, { v: 'Maliyet ve Fizibilite — Ön Hesap' + (meta.name ? ' · ' + meta.name : ''), s: st.title });
    put(O, 1, 0, { v: C.ILLUSTRATIVE_LABEL, s: st.warn }); fillRow(O, 1, 1, 3, st.warn);
    put(O, 2, 0, { v: C.DISCLAIMER, s: st.note });
    put(O, 3, 0, { v: 'Tarih: ' + (meta.date || (App.util && App.util.today ? App.util.today() : '')) + ' · Para birimi: ' + cur + ' · Varsayımlar: ' + (changedSections(A).length ? 'kullanıcı değiştirdi (' + changedSections(A).join(', ') + ')' : 'ÖRNEK varsayılanlar (değiştirilmedi)'), s: st.dim });
    let orow = 5;
    const osec = function (t) { put(O, orow, 0, { v: t, s: st.sec }); fillRow(O, orow, 1, 3, st.sec); orow++; };
    const kv = function (key, label, f, v, fmt, note, style) {
      put(O, orow, 0, { v: label, s: style === 'tot' ? st.tot : st.lab });
      put(O, orow, 1, fx(f, v, S(style === 'tot' ? st.tot : st.calc, fmt)));
      put(O, orow, 2, { v: note || '', s: st.dim });
      Rf[key] = Q('ozet') + abs(orow, 1); orow++;
    };
    osec('Temel göstergeler (formüllü — Varsayımlar sayfası değişince yeniden hesaplanır)');
    kv('o_total', 'Toplam maliyet (' + cur + ')', Rf.total, res.total, 'int', 'yapım + dolaylı + arsa + tapu + finansman', 'tot');
    kv('o_hard', 'Yapım maliyeti (hard)', Rf.hard, res.hard, 'int', 'Metraj-Maliyet sayfası');
    kv('o_soft', 'Dolaylı giderler', Rf.soft, res.soft, 'int', '');
    kv('o_land', 'Arsa bedeli', Rf.land, res.land, 'int', 'Kullanıcı girdisi');
    kv('o_tax', 'Tapu harcı ve masraf', Rf.tax, res.landTax, 'int', '');
    kv('o_fin', 'Finansman gideri', Rf.fin, res.finance, 'int', 'Nakit Akışı sayfasındaki toplam faiz');
    kv('o_gross', 'Brüt satış geliri', Rf.gGross, res.revenue.gross, 'int', '');
    kv('o_vat', 'KDV', Rf.gVat, res.revenue.vat, 'int', '');
    kv('o_net', 'Net satış geliri', Rf.gNet, res.revenue.net, 'int', '', 'tot');
    kv('o_profit', 'Kâr (net gelir − toplam maliyet)', Rf.gNet + '-' + Rf.total, res.profit, 'int', '', 'tot');
    kv('o_margin', 'Kâr marjı (kâr / net gelir)', 'IFERROR(' + Rf.o_profit + '/' + Rf.gNet + ',0)', res.margin, 'pct1', 'Hedef: ' + Math.round(A.targetMargin * 1000) / 10 + '%');
    kv('o_roi', 'Maliyet üzerinden getiri (kâr / toplam maliyet)', 'IFERROR(' + Rf.o_profit + '/' + Rf.total + ',0)', res.roiOnCost, 'pct1', '');
    kv('o_cpm', 'Maliyet / zemin üstü brüt alan (' + cur + '/m²)', 'IFERROR(' + Rf.total + '/' + Rf.built + ',0)', res.costPerM2, 'int', '');
    kv('o_spm', 'Net satış / satılabilir m² (' + cur + '/m²)', 'IFERROR(' + Rf.gNet + '/' + Rf.sellable + ',0)', res.salePerM2, 'int', '');
    // finansın fiyata duyarlılığı ψ (statik kiriş eğimi: k = 1 ile başabaş k arasında; dışa aktarım anında tam modelle)
    const kb = be.factor;
    const dk = kb != null && isFinite(kb) && Math.abs(kb - 1) > 1e-4 ? kb - 1 : 0.01;
    const psi = (run(n, A, { price: 1 + dk }).finance - res.finance) / dk;
    put(O, orow, 0, { v: 'Finansın fiyata duyarlılığı ψ (dışa aktarım anı; yaklaşım katsayısı)', s: st.lab });
    put(O, orow, 1, { v: psi, s: S(st.inp, 'int') });
    put(O, orow, 2, { v: 'Başabaş yaklaşımı için sabit (kiriş eğimi: finans gideri / fiyat çarpanı); faiz/süre/özkaynak değişirse tam modelle yeniden dışa aktarın', s: st.dim });
    Rf.psi = Q('ozet') + abs(orow, 1); orow++;
    const kBE = '(' + Rf.total + '-' + Rf.fin + '-' + Rf['s:pazarlama'] + '+' + Rf.fin + '-' + Rf.psi + ')/(' + Rf.gNet + '*(1-' + Rf['soft:pazarlama'] + ')-' + Rf.psi + ')';
    kv('o_k', 'Başabaş fiyat çarpanı k (yaklaşık, finans doğrusallaştırılmış)', 'IFERROR(' + kBE + ',"—")', be.factor, '0.0000', 'k = (X + finans − ψ) / (net gelir × (1 − pazarlama %) − ψ),  X = toplam − finans − pazarlama');
    kv('o_be', 'Başabaş ortalama satış fiyatı (' + cur + '/m², brüt gelir / satılabilir m² × k)', 'IFERROR(' + Rf.gGross + '/' + Rf.sellable + '*' + Rf.o_k + ',"—")', be.pricePerM2, 'int', 'Yaklaşık (<1% fark hedeflenir); tam model değeri aşağıda');
    kv('o_up', 'Başabaş için gereken fiyat değişimi', 'IFERROR(' + Rf.o_k + '-1,"—")', be.uplift, 'pct1', 'Negatif = fiyat düşebilir');
    // kalıntı arsa için finans yükü: cari arsa ile kalıntı arsa arasındaki kiriş eğimi (dışa aktarım anında, tam modelle)
    const Lr = res.residualLand, L0 = res.land;
    const stepL = Math.abs(Lr - L0) > 1000 ? Lr - L0 : Math.max(1e5, 0.05 * Math.max(L0, 1e6));
    const phi = Math.max(0, (run(n, A, { land: L0 + stepL }).finance - res.finance) / stepL);
    put(O, orow, 0, { v: 'Arsa başına finans yükü φ (dışa aktarım anı; yaklaşım katsayısı)', s: st.lab });
    put(O, orow, 1, { v: phi, s: S(st.inp, '0.0000') });
    put(O, orow, 2, { v: 'Kalıntı arsa yaklaşımı için sabit (kiriş eğimi: finans gideri / arsa bedeli); faiz/özkaynak/süre değişirse tam modelle yeniden dışa aktarın', s: st.dim });
    Rf.phi = Q('ozet') + abs(orow, 1); orow++;
    kv('o_rl', 'Kalıntı arsa değeri (yaklaşık, hedef marj için)', 'MAX(0,' + Rf.land + '+(' + Rf.o_profit + '-' + Rf.targetMargin + '*' + Rf.gNet + ')/(1+' + Rf.tapuHarc + '+' + Rf.phi + '))', res.residualLand, 'int', 'L = L₀ + (kâr − hedef·net) / (1 + tapu + φ),  φ = kiriş eğimi');
    kv('o_peak', 'Zirve fonlama ihtiyacı', Rf.peak, res.peakFunding, 'int', 'Birikimli açığın (faiz dahil) en derin noktası');
    kv('o_eq', 'Kullanılan özkaynak', Rf.eqUsed, res.equity, 'int', '');
    kv('o_debt', 'Kredi (en yüksek bakiye)', Rf.debtPeak, res.debt, 'int', '');
    kv('o_npv', 'NPV (' + Math.round(A.finance.disc * 100) + '% yıllık iskonto)', Rf.npv, res.npv, 'int', 'Finans öncesi proje net akışı');
    kv('o_irr', 'IRR (yıllık)', Rf.irr, res.irr, '0.0%', 'Aylık IRR yıllıklaştırılmış; işaret değişimi yoksa —');
    kv('o_pb', 'Geri ödeme ayı', Rf.payback, res.paybackMonth, 'int', '');
    orow++;
    osec('Tam model değerleri — dışa aktarım anında hesaplandı (STATİK; girdi değişince güncellenmez)');
    const stat = function (label, v, fmt, note) {
      put(O, orow, 0, { v: label, s: st.lab });
      put(O, orow, 1, { v: v == null || !isFinite(v) ? '—' : v, s: S(st.stat, fmt) });
      put(O, orow, 2, { v: note || '', s: st.dim }); orow++;
    };
    stat('Kâr', res.profit, 'int', 'Formüllü kâr bu değerle eşleşmelidir (aynı girdilerle)');
    stat('Kâr marjı', res.margin, 'pct1');
    stat('Başabaş ortalama satış fiyatı (tam model)', be.pricePerM2, 'int', 'Nakit akışı yeniden çözülerek (finans fiyatla değişir)');
    stat('Başabaş için gereken fiyat değişimi (tam model)', be.uplift, 'pct1');
    stat('Kalıntı arsa değeri (tam model)', res.residualLand, 'int', 'Hedef marj ' + Math.round(A.targetMargin * 1000) / 10 + '%');
    stat('NPV', res.npv, 'int'); stat('IRR (yıllık)', res.irr, '0.0%');
    orow++;
    osec('Uyarılar');
    res.warnings.forEach(function (w) { put(O, orow, 0, { v: '• ' + w, s: st.dim }); orow++; });
    orow++;
    osec('Notlar');
    [
      'Bu kitap JS modelinin formüllü kopyasıdır: BoQ, gelir, dolaylı gider, nakit akışı ve finansman Excel/LibreOffice\'te yeniden hesaplanır.',
      'Başabaş fiyat ve kalıntı arsa formüllü sürümde yaklaşıktır (finans, dışa aktarım anındaki kiriş eğimiyle doğrusallaştırılır); tam model değerleri yukarıda statik verilmiştir.',
      'Duyarlılık sayfası dışa aktarım anında hesaplanmış STATİK değerlerdir.',
      'Tüm birim fiyatlar ÖRNEK varsayımdır; resmî birim maliyet tebliği ve yerel piyasa verisiyle değiştirilmelidir.',
    ].forEach(function (t) { put(O, orow, 0, { v: t, s: st.dim }); orow++; });
    O.cols = [{ w: 70 }, { w: 22 }, { w: 80 }, { w: 4 }];
    O.tab = '1F3A5F';
    // Nakit Akışı kontrol hücresindeki kâr başvurusu
    N.rows[11][4].f = N.rows[11][4].f.replace('REF_PROFIT', Rf.o_profit);

    /* ===================== DUYARLILIK ===================== */
    const D = mk('duy');
    sheetHead(D, 'Duyarlılık (statik)', 8);
    put(D, 2, 0, { v: 'Aşağıdaki değerler dışa aktarım anında tam modelle hesaplanmış STATİK değerlerdir; Varsayımlar değişince güncellenmez.', s: st.note });
    let dr = 4;
    const gridT = function (title, mat, fmt) {
      put(D, dr, 0, { v: title, s: st.sec }); fillRow(D, dr, 1, 5, st.sec); dr++;
      put(D, dr, 0, { v: 'Maliyet ↓ / Fiyat →', s: st.hdr });
      sens.grid.prices.forEach(function (p, j) { put(D, dr, 1 + j, { v: (p > 0 ? '+' : '') + Math.round(p * 100) + '%', s: st.hdr }); });
      dr++;
      sens.grid.costs.forEach(function (cs, i) {
        put(D, dr, 0, { v: (cs > 0 ? '+' : '') + Math.round(cs * 100) + '%', s: st.hdr });
        mat[i].forEach(function (v, j) { put(D, dr, 1 + j, { v: v, s: S(i === 2 && j === 2 ? st.tot : st.stat, fmt) }); });
        dr++;
      });
      dr++;
    };
    gridT('Kâr (' + cur + ') — inşaat maliyeti × satış fiyatı', sens.grid.profit, 'int');
    gridT('Kâr marjı — inşaat maliyeti × satış fiyatı', sens.grid.margin, 'pct1');
    put(D, dr, 0, { v: 'Tornado — her girdi ±%10 (kâr, ' + cur + ')', s: st.sec }); fillRow(D, dr, 1, 5, st.sec); dr++;
    ['Girdi', '−%10 değeri', '+%10 değeri', 'Kâr (−%10)', 'Kâr (+%10)', 'Oynama'].forEach(function (t, i) { put(D, dr, i, { v: t, s: st.hdr }); });
    dr++;
    sens.tornado.forEach(function (t) {
      const vf = t.id === 'rate' || t.id === 'presale' ? 'pct1' : t.id === 'months' ? 'int' : t.id === 'land' ? 'int' : 'dec2';
      put(D, dr, 0, { v: t.label, s: st.calc });
      put(D, dr, 1, { v: t.lowValue, s: S(st.stat, vf) }); put(D, dr, 2, { v: t.highValue, s: S(st.stat, vf) });
      put(D, dr, 3, { v: t.low, s: S(st.stat, 'int') }); put(D, dr, 4, { v: t.high, s: S(st.stat, 'int') });
      put(D, dr, 5, { v: t.swing, s: S(st.stat, 'int') });
      dr++;
    });
    put(D, dr + 1, 0, { v: 'Fiyat / maliyet için değer = çarpan (1,00 = mevcut); arsa, faiz, süre, ön satış için gerçek değer.', s: st.dim });
    D.cols = [{ w: 26 }, { w: 18 }, { w: 18 }, { w: 18 }, { w: 18 }, { w: 18 }, { w: 4 }, { w: 4 }];
    D.tab = '999999';

    const order = ['ozet', 'va', 'boq', 'gelir', 'nakit', 'duy'];
    return {
      title: 'Maliyet ve Fizibilite' + (meta.name ? ' — ' + meta.name : ''),
      author: meta.author || 'Mimari Tasarım Asistanı',
      sheets: order.map(function (k) { return sheets[k]; }),
    };
  };
})();
