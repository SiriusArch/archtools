/* ==========================================================================
   39-lib-a2-insight.js — Arsa Analizi ek içgörüleri (Modül 4)
   · site.karne(A)   15 dakikalık şehir karnesi: her işlev türü ve ulaşım için yürüme süresi, harf notu
   · site.ask(A, s, q) "Sor": çözümlenmiş veriden soruları yanıtlayan KURAL TABANLI soru-cevap
                       (yapay zekâ değildir; yalnızca hesaplanmış sayıları okur, uydurma yapmaz)
   · site.hex(A, cat) altıgen yoğunluk hücreleri (işlev noktası sayısı), ısı katmanı için
   Saf mantık: arayüz bilmez.
   ========================================================================== */
(function () {
  const App = window.App;
  const site = App.site;
  const osm = App.osm;
  const U = App.util;
  const fmt = U.fmt;

  site.LAYERS.push({ id: 'yogunluk', name: 'İşlev yoğunluğu', sub: 'Altıgen ısı hücreleri: nerede ne kadar işlev var' });

  /* ---------------- 15 dakikalık şehir karnesi ---------------- */
  const GRADES = [
    { min: 90, g: 'A', label: 'Çok güçlü 15 dakikalık çevre' },
    { min: 70, g: 'B', label: 'İyi: eksikler az' },
    { min: 50, g: 'C', label: 'Orta: birkaç ihtiyaç için taşıt gerekebilir' },
    { min: 30, g: 'D', label: 'Zayıf: çoğu ihtiyaç yürüyerek karşılanmıyor' },
    { min: 0, g: 'E', label: 'Araca bağımlı çevre' },
  ];
  const status = (m) => (m == null || !isFinite(m) ? 'yok' : m <= 5 ? 'cok' : m <= 10 ? 'iyi' : m <= 15 ? 'sinirda' : 'yok');
  const STATUS_LABEL = { cok: '5 dk içinde', iyi: '10 dk içinde', sinirda: '15 dk içinde', yok: '15 dk dışında' };
  site.KARNE_STATUS = STATUS_LABEL;

  site.karne = function (A) {
    if (!A) return null;
    const rows = A.cats.map((c) => ({ id: c.id, label: c.label, min: c.nearMin, name: c.nearest ? c.nearest.name || null : null, c10: c.c10, c15: c.c15, st: status(c.nearMin), kind: 'islev' }));
    const bus = A.transit.nearBus, rail = A.transit.nearRail;
    const tr = A.transit.stops[0] || null;
    rows.push({ id: 'ulasim', label: 'Toplu taşıma', min: tr ? tr.min : null, name: tr ? (tr.name || site.TRANSIT_LABEL[tr.kind] || 'Durak') : null, c10: A.transit.in10, c15: A.transit.stops.filter((t) => t.min <= 15).length, st: status(tr && tr.min), kind: 'ulasim' });
    const park = A.green.nearPark;
    rows.push({ id: 'yesil', label: 'Park', min: park ? park.min : null, name: park ? park.name || 'Park' : null, c10: A.green.parkCount, c15: A.green.parkCount, st: status(park && park.min), kind: 'yesil' });
    const pass = rows.filter((r) => r.st !== 'yok').length;
    const near = rows.filter((r) => r.st === 'cok' || r.st === 'iyi').length;
    // 15 dk içindeki her ihtiyaç 1 puan; 10 dk içindekiler +0,5 bonus (en çok %100)
    const pctN = Math.min(100, Math.round(((pass + 0.5 * near) / (rows.length * 1.5)) * 100));
    const gr = GRADES.find((x) => pctN >= x.min);
    return { rows: rows, pass: pass, near: near, total: rows.length, pct: pctN, grade: gr.g, label: gr.label, missing: rows.filter((r) => r.st === 'yok').map((r) => r.label) };
  };

  /* ---------------- Sor: kural tabanlı soru-cevap ---------------- */
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/[^a-z0-9\s]/g, ' ');
  const KEY = {
    gunluk: ['market', 'bakkal', 'gunluk', 'manav', 'firin', 'kasap'],
    yeme: ['yemek', 'restoran', 'kafe', 'cafe', 'kahve', 'lokanta', 'yeme'],
    egitim: ['okul', 'egitim', 'lise', 'kres', 'anaokul', 'universite', 'ilkokul', 'ortaokul'],
    saglik: ['saglik', 'hastane', 'klinik', 'eczane', 'doktor', 'hekim'],
    rekreasyon: ['spor', 'oyun', 'rekreasyon', 'fitness'],
    kultur: ['kultur', 'cami', 'kutuphane', 'muze', 'sinema', 'ibadet', 'kilise'],
    hizmet: ['banka', 'postane', 'belediye', 'kamu', 'atm', 'polis', 'hizmet'],
    alisveris: ['alisveris', 'avm', 'magaza', 'carsi', 'pazar'],
  };
  const has = (q, list) => list.some((k) => q.indexOf(k) >= 0);
  const mins = (m) => (m == null || !isFinite(m) ? 'erişilemiyor' : (m < 10 ? fmt(m, 1) : String(Math.round(m))) + ' dakika');
  const dist = (m) => (m == null ? '' : Math.round(m / 10) * 10 + ' m');

  site.ASK_EXAMPLES = ['En yakın park nerede?', 'Okul 10 dakika içinde mi?', 'Toplu taşıma nasıl?', 'Burası sessiz mi?', '15 dakikalık şehir notu ne?', 'Genel skor nedir?'];

  site.ask = function (A, s, text) {
    if (!A) return { a: 'Önce bir konum seçin; sorular çözümlenmiş çevre verisinden yanıtlanır.', go: null };
    const q = norm(text);
    if (!q.trim()) return { a: 'Bir soru yazın. Örnek: “' + site.ASK_EXAMPLES[0] + '”', go: null };
    const out = (a, go) => ({ a: a, go: go || null });
    const catRow = (id) => A.cats.find((c) => c.id === id);
    const catAnswer = (id) => {
      const c = catRow(id);
      const nm = c.nearest ? (c.nearest.name ? '“' + c.nearest.name + '”' : 'adsız bir nokta') : null;
      if (!c.nearest) return c.label + ' için çözümleme alanında (' + A.R + ' m) 15 dakika içinde ulaşılabilir nokta bulunamadı. Harita verisinde eksik olabilir; sahada doğrulayın.';
      return c.label + ': en yakını ' + nm + ', yürüyerek ' + mins(c.nearMin) + ' (≈' + dist(c.nearest.m) + '). 10 dakika içinde ' + c.c10 + ', 15 dakika içinde ' + c.c15 + ' nokta var.';
    };
    // belirli bir süre eşiği ("10 dakika içinde mi")
    const th = q.match(/(\d{1,2})\s*(dk|dakika)/);
    const limit = th ? parseInt(th[1], 10) : null;
    const goLayer = (id, label) => ({ layer: id, label: label || 'Haritada göster' });

    if (has(q, ['karne', 'sehir not', '15 dakikalik', '15 dk', 'on bes'])) {
      const k = site.karne(A);
      return out('15 dakikalık şehir karnesi: ' + k.grade + ' (%' + k.pct + '). ' + k.label + '. ' + k.pass + '/' + k.total + ' ihtiyaç 15 dakika içinde' + (k.missing.length ? '; eksikler: ' + k.missing.join(', ') + '.' : '.'), { tab: 'karne', label: 'Karneyi aç' });
    }
    if (has(q, ['durak', 'otobus', 'metro', 'tramvay', 'tren', 'toplu', 'ulasim', 'iskele', 'vapur'])) {
      const t = A.transit;
      if (!t.stops.length) return out('Çözümleme alanında yürüme erişimi olan toplu taşıma durağı bulunamadı.', goLayer('ulasim'));
      const kinds = Object.keys(t.byKind).map((k) => t.byKind[k] + ' ' + (site.TRANSIT_LABEL[k] || k).toLowerCase()).join(', ');
      const parts = ['En yakın durak ' + mins(t.stops[0].min) + ' uzaklıkta' + (t.stops[0].name ? ' (“' + t.stops[0].name + '”)' : '') + '.'];
      if (t.nearRail) parts.push('Raylı sistem: ' + mins(t.nearRail.min) + '.');
      parts.push('10 dakika içinde ' + t.in10 + ' durak var (' + kinds + ').');
      return out(parts.join(' '), goLayer('ulasim'));
    }
    if (has(q, ['sessiz', 'gurultu', 'trafik', 'ses '])) {
      const n = A.noise;
      return out('Çalışma noktasında gürültü göstergesi: ' + n.cls.label.toLowerCase() + (n.src ? ' (baskın kaynak: ' + (n.src.name || n.src.cls) + (n.d != null ? ', ≈' + Math.round(n.d) + ' m' : '') + ')' : '') + '. Bu ölçüm değil, yol sınıfı ve uzaklığa dayanan bir göstergedir.', goLayer('gurultu'));
    }
    if (has(q, ['park', 'yesil', 'agac', 'bahce'])) {
      const g = A.green;
      if (!g.nearPark) return out('Çözümleme alanında yürüme erişimi olan park bulunamadı. Yeşil alan payı %' + Math.round(g.share * 100) + '.', goLayer('yesil'));
      return out('En yakın park' + (g.nearPark.name ? ' “' + g.nearPark.name + '”' : '') + ' yürüyerek ' + mins(g.nearPark.min) + '. Alanın %' + Math.round(g.share * 100) + '’i yeşil; alanda ' + g.parkCount + ' park/spor noktası var.', goLayer('yesil'));
    }
    for (const id of Object.keys(KEY)) {
      if (has(q, KEY[id])) {
        const c = catRow(id);
        let a = catAnswer(id);
        if (limit != null && c.nearest) a = (c.nearMin <= limit ? 'Evet: ' : 'Hayır: ') + a;
        return out(a, goLayer('islev'));
      }
    }
    if (has(q, ['bina', 'yapi', 'kat', 'yogun', 'emsal', 'yukseklik', 'dokusu'])) {
      const b = A.built;
      return out('Çözümleme alanında ' + b.count + ' bina var; taban alanı oranı yaklaşık %' + Math.round(b.coverage * 100) + ', emsal ≈' + fmt(b.far, 2) + '. En yüksek bina ≈' + fmt(b.maxH, 0) + ' m' + (b.avgLevels ? '; kat bilgisi olanlarda ortalama ' + fmt(b.avgLevels, 1) + ' kat' : '') + '. Kat bilgisi olmayan binalarda yükseklik tahmin edilir (bilinen oranı %' + Math.round(b.levelKnown * 100) + ').', goLayer('yapi'));
    }
    if (has(q, ['yol', 'kavsak', 'yaya', 'baglanti', 'ag '])) {
      const m = A.mob;
      return out('Yol ağı ' + fmt(m.roadKm, 1) + ' km (yoğunluk ' + fmt(m.density, 1) + ' km/km²), kavşak yoğunluğu ' + fmt(m.interDensity, 0) + '/km²; yaya ve bisiklet yollarının payı %' + Math.round(m.pedShare * 100) + '.', goLayer('ulasim'));
    }
    if (has(q, ['gunes', 'golge', 'iklim', 'gun isigi'])) {
      const d = A.sun.find((x) => x.id === 'yaz') || A.sun[0], w = A.sun.find((x) => x.id === 'kis') || A.sun[A.sun.length - 1];
      return out('Gün uzunluğu: ' + d.label + ' ≈' + fmt(d.len, 1) + ' saat (öğle güneş yüksekliği ' + Math.round(d.noonAlt) + '°), ' + w.label + ' ≈' + fmt(w.len, 1) + ' saat (' + Math.round(w.noonAlt) + '°). Bina gölgeleri için Güneş katmanını açın.', goLayer('gunes'));
    }
    if (has(q, ['skor', 'puan', 'ozet', 'genel', 'nasil', 'uygun', 'not'])) {
      const best = A.parts.slice().sort((x, y) => y.v - x.v), worst = best[best.length - 1];
      return out('Konum skoru %' + A.score + ' (“' + A.template.label + '” programına göre). En güçlü: ' + best[0].label.toLowerCase() + ' (%' + Math.round(best[0].v * 100) + '); en zayıf: ' + worst.label.toLowerCase() + ' (%' + Math.round(worst.v * 100) + ').', { tab: 'bulgular', label: 'Bulgulara git' });
    }
    return out('Bu soruyu anlayamadım. Şunları sorabilirsiniz: ' + site.ASK_EXAMPLES.map((x) => '“' + x + '”').join(', ') + '. Not: yanıtlar yalnızca çözümlenen harita verisinden gelir.');
  };

  /* ---------------- altıgen yoğunluk ---------------- */
  const memo = new WeakMap();
  site.hex = function (A, cat) {
    if (!A) return null;
    const key = cat || 'all';
    let m = memo.get(A);
    if (!m) { m = {}; memo.set(A, m); }
    if (m[key]) return m[key];
    const R = A.R, hr = R / 7.5;
    const pts = A.pois.filter((p) => p.inR && (!cat || cat === 'all' || p.cat === cat));
    const cells = new Map();
    const hexOf = (x, y) => {
      // eksenel koordinatlar, sivri üstü olmayan (flat-top) altıgen ızgara
      const qf = (2 / 3 * x) / hr, rf = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / hr;
      let rx = Math.round(qf), rz = Math.round(rf), ry = Math.round(-qf - rf);
      const dx = Math.abs(rx - qf), dz = Math.abs(rz - rf), dy = Math.abs(ry + qf + rf);
      if (dx > dz && dx > dy) rx = -rz - ry; else if (dz > dy) rz = -rx - ry;
      return [rx, rz];
    };
    pts.forEach((p) => { const h = hexOf(p.x, p.y); const k = h[0] + ',' + h[1]; const c = cells.get(k) || { q: h[0], r: h[1], n: 0 }; c.n++; cells.set(k, c); });
    const list = [];
    let max = 0;
    cells.forEach((c) => {
      const cx = hr * 1.5 * c.q, cy = hr * Math.sqrt(3) * (c.r + c.q / 2);
      if (Math.hypot(cx, cy) > R - hr * 0.25) return;
      const poly = [];
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; poly.push([cx + hr * 0.96 * Math.cos(a), cy + hr * 0.96 * Math.sin(a)]); }
      list.push({ x: cx, y: cy, n: c.n, poly: poly });
      if (c.n > max) max = c.n;
    });
    list.forEach((c) => { c.lv = max ? Math.min(4, Math.floor((c.n / max) * 4.999)) : 0; });
    const peak = list.slice().sort((a, b) => b.n - a.n)[0] || null;
    return (m[key] = { cells: list, max: max, hr: hr, peak: peak, total: pts.length });
  };
})();
