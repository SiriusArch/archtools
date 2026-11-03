window.App = window.App || {};
window.App.config = {"modules":["islev"],"api":{"visit":"/api/v"}};
/* ==========================================================================
   00-core.js — ortak yardımcılar, mini sanal-DOM (h/patch), store
   Tüm modüller window.App altında toplanır; mantık katmanları (lib/*) arayüzden
   bağımsızdır ve ileride React vb. bir arayüze olduğu gibi taşınabilir.
   ========================================================================== */
(function () {
  const App = (window.App = window.App || {});
  const U = (App.util = {});

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  U.pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  U.norm = (s) =>
    String(s == null ? '' : s)
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/â/g, 'a')
      .replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  U.slug = (s) => U.norm(s).replace(/ /g, '-').replace(/[^a-z0-9+-]/g, '') || 'proje';
  U.fmt = (n, d) => {
    if (n == null || isNaN(n)) return '—';
    const r = Math.round(n * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d);
    return r.toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 1 : d });
  };
  U.sum = (arr, f) => arr.reduce((t, x) => t + (f ? f(x) : x), 0);
  U.mid = (r) => (r[0] + r[1]) / 2;
  U.round5 = (n) => Math.round(n * 2) / 2;
  U.today = () => {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  };

  /* ---------- mini sanal DOM ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function h(tag, props) {
    props = props || {};
    const kids = [];
    (function flat(a) {
      for (let i = 0; i < a.length; i++) {
        const k = a[i];
        if (Array.isArray(k)) flat(k);
        else if (k === null || k === undefined || k === false || k === true) continue;
        else if (typeof k === 'object') kids.push(k);
        else kids.push({ text: String(k) });
      }
    })(Array.prototype.slice.call(arguments, 2));
    return { tag: tag, props: props, children: kids, key: props.key };
  }

  const BOOL = { checked: 1, disabled: 1, selected: 1, hidden: 1, readOnly: 1 };

  function setProps(el, o, n, svg) {
    for (const k in o) if (!(k in n) && k !== 'key' && k !== 'ref' && k !== 'value' && k !== 'keep') clearProp(el, k, svg);
    for (const k in n) {
      if (k === 'key' || k === 'value' || k === 'keep') continue;
      const v = n[k];
      if (k === 'ref') { if (typeof v === 'function') v(el); continue; }
      if (k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110 && typeof v === 'function') { el[k.toLowerCase()] = v; continue; }
      if (o[k] === v && k !== 'style') continue;
      if (k === 'class') { if (svg) el.setAttribute('class', v || ''); else el.className = v || ''; }
      else if (k === 'style') {
        if (v && typeof v === 'object') {
          let css = '';
          for (const s in v) if (v[s] != null && v[s] !== false) css += s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v[s] + ';';
          // CSSOM ile yazılır (setAttribute('style') katı CSP'de engellenir)
          if (el.__css !== css) { el.style.cssText = css; el.__css = css; }
        } else if (v) { if (el.__css !== v) { el.style.cssText = v; el.__css = v; } } else { el.removeAttribute('style'); el.__css = null; }
      } else if (BOOL[k]) el[k] = !!v;
      else if (k === 'html') el.innerHTML = v;
      else if (v === false || v == null) el.removeAttribute(k);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  function clearProp(el, k, svg) {
    if (k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110) el[k.toLowerCase()] = null;
    else if (k === 'class') { if (svg) el.removeAttribute('class'); else el.className = ''; }
    else if (BOOL[k]) el[k] = false;
    else el.removeAttribute(k);
  }
  function applyValue(el, props) {
    if ('value' in props) {
      const v = props.value == null ? '' : String(props.value);
      if (el.value !== v && !(props.keep && document.activeElement === el)) el.value = v;
    }
  }

  function create(v, svg) {
    if (v.tag === undefined) { v.el = document.createTextNode(v.text); return v.el; }
    const isSvg = svg || v.tag === 'svg';
    const el = isSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
    setProps(el, {}, v.props, isSvg);
    const childSvg = isSvg && v.tag !== 'foreignObject';
    for (let i = 0; i < v.children.length; i++) el.appendChild(create(v.children[i], childSvg));
    applyValue(el, v.props);
    v.el = el;
    return el;
  }

  function patchEl(el, o, n, svg) {
    const isSvg = svg || n.tag === 'svg';
    setProps(el, o.props, n.props, isSvg);
    patchChildren(el, o.children, n.children, isSvg && n.tag !== 'foreignObject');
    applyValue(el, n.props);
    n.el = el;
  }

  function patchChildren(parent, oc, nc, svg) {
    const keyed = new Map();
    for (let i = 0; i < oc.length; i++) if (oc[i].key != null) keyed.set(oc[i].key, oc[i]);
    const used = new Set();
    const els = [];
    for (let i = 0; i < nc.length; i++) {
      const n = nc[i];
      let o = null;
      if (n.key != null) o = keyed.get(n.key) || null;
      else if (oc[i] && oc[i].key == null) o = oc[i];
      if (o && !used.has(o) && o.tag === n.tag) {
        used.add(o);
        if (n.tag === undefined) { if (o.text !== n.text) o.el.nodeValue = n.text; n.el = o.el; }
        else patchEl(o.el, o, n, svg);
      } else create(n, svg);
      els.push(n.el);
    }
    for (let i = 0; i < oc.length; i++) {
      const o = oc[i];
      if (!used.has(o) && o.el && o.el.parentNode === parent) parent.removeChild(o.el);
    }
    let ref = parent.firstChild;
    for (let i = 0; i < els.length; i++) {
      if (els[i] === ref) ref = ref.nextSibling;
      else parent.insertBefore(els[i], ref);
    }
  }

  App.h = h;
  App.mount = function (container, render) {
    let prev = null;
    return function paint() {
      const next = render();
      if (!prev || prev.tag !== next.tag) { container.textContent = ''; container.appendChild(create(next, false)); }
      else patchEl(prev.el, prev, next, false);
      prev = next;
    };
  };
  App.raf = function (fn) {
    let queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    };
  };

  /* ---------- store ---------- */
  App.createStore = function (reducer, initial) {
    let state = initial;
    const subs = new Set();
    return {
      get: () => state,
      dispatch(a) {
        const next = reducer(state, a);
        if (next !== state) { state = next; subs.forEach((f) => f(state, a)); }
      },
      subscribe(f) { subs.add(f); return () => subs.delete(f); },
    };
  };
})();

/* ==========================================================================
   10-data-palette.js — monokrom tema belirteçleri (design tokens), bölgeler, ilişki türleri, anahtar kelime ipuçları
   ========================================================================== */
(function () {
  const App = window.App;

  /* ---------------- tema ----------------
     Arayüzün tek tabanı monokrom "glass" temasıdır (minimal, buzlu cam, gri tonlar). "Beni renklendir!" aynı yerleşimi
     bozmaz; yalnızca renk değişkenlerini seçilen palete göre yeniden üretir (bkz. 13-lib-colortheme.js).
     App.PAL / App.ZONES / App.FONTS nesneleri yerinde güncellenir; böylece pafta çizimi ve dışa aktarma her zaman
     etkin renkleri kullanır. Tailwind'e taşırken: theme.extend.colors = App.THEMES.glass.pal */
  const THEMES = {
    glass: {
      pal: {
        ink: '#17181B', paper: '#F3F4F6', paperDark: '#D6D8DD', blue: '#17181B', blueBright: '#44464D', yellow: '#C9CBD1', red: '#3A3C42', green: '#2A2B30', indigo: '#6C6F77', orange: '#9A9DA5',
        // pafta levhası (PNG/PDF ve canlı pafta): tuval, levha yüzü, gölge — renkli kipte palete göre türetilir
        outer: '#E9EAEE', sheet: '#F6F7F9', sheetLive: 'rgba(249,250,252,.9)', shade: 'rgba(46,52,68,.22)',
      },
      fonts: {
        d: "'Unbounded','Century Gothic','Trebuchet MS',sans-serif",
        b: "'Manrope','Segoe UI','Helvetica Neue',Arial,sans-serif",
        m: "'Manrope','Segoe UI','Helvetica Neue',Arial,sans-serif",
        l: "'Manrope','Segoe UI','Helvetica Neue',Arial,sans-serif",
      },
      zones: {
        sosyal: ['#E1E2E6', '#17181B'], ozel: ['#55585F', '#F6F7F9'], servis: ['#26272B', '#F6F7F9'], calisma: ['#B4B6BD', '#17181B'],
        sirkulasyon: ['#FDFDFE', '#17181B'], teknik: ['#7D8088', '#F6F7F9'], acik: ['#D3D5DA', '#17181B'],
      },
      label: { upper: false, cw: 0.57, nameW: 0.82 },
      fontLoads: ["300 20px 'Unbounded'", "400 20px 'Unbounded'", "600 16px 'Manrope'", "700 16px 'Manrope'", "500 14px 'Manrope'"],
    },
  };

  App.THEMES = THEMES;
  App.PAL = Object.assign({}, THEMES.glass.pal);
  App.FONTS = Object.assign({}, THEMES.glass.fonts);

  // Mekan bölgeleri (zone): daire rengi + üzerindeki yazı rengi (temaya göre güncellenir)
  App.ZONES = {
    sosyal:      { label: 'Sosyal / kamusal' },
    ozel:        { label: 'Özel / dinlenme' },
    servis:      { label: 'Islak / servis' },
    calisma:     { label: 'Çalışma / eğitim' },
    sirkulasyon: { label: 'Sirkülasyon' },
    teknik:      { label: 'Teknik / depo' },
    acik:        { label: 'Açık / yarı açık' },
  };

  App.theme = {
    name: 'glass',
    cur: function () { return THEMES.glass; },
    // monokrom taban değerlerine döner (renkli kip kapanırken de bu çağrılır)
    reset: function () {
      const t = THEMES.glass;
      Object.assign(App.PAL, t.pal);
      Object.assign(App.FONTS, t.fonts);
      Object.keys(App.ZONES).forEach(function (z) { App.ZONES[z].fill = t.zones[z][0]; App.ZONES[z].text = t.zones[z][1]; });
    },
  };
  App.theme.reset();
  App.ZONE_ORDER = ['sosyal', 'ozel', 'servis', 'calisma', 'sirkulasyon', 'teknik', 'acik'];

  // İlişki türleri
  App.REL = {
    strong: { label: 'Güçlü',       short: 'Güçlü',  sym: '●', weight: 3 },
    weak:   { label: 'Zayıf',       short: 'Zayıf',  sym: '○', weight: 1 },
    none:   { label: 'İlişkisiz',   short: 'Yok',    sym: '·', weight: 0 },
    avoid:  { label: 'Ayrı tut',    short: 'Ayrı',   sym: '✕', weight: 2 },
  };
  App.REL_CYCLE = ['none', 'strong', 'weak', 'avoid'];

  // Anahtar kelimeden bölge tahmini (kullanıcının yazdığı serbest mekan adları için)
  App.ZONE_HINTS = [
    ['servis', ['wc', 'banyo', 'tuvalet', 'lavabo', 'mutfak', 'camasir', 'dus', 'islak', 'hasta wc', 'bulasik', 'temizlik']],
    ['sirkulasyon', ['antre', 'hol', 'koridor', 'sirkulasyon', 'merdiven', 'asansor', 'lobi', 'giris', 'fuaye', 'bekleme']],
    ['ozel', ['yatak', 'ebeveyn', 'cocuk odasi', 'uyku', 'giyinme', 'mudur', 'idare', 'yonetici', 'ofis', 'rehberlik', 'muayene']],
    ['calisma', ['derslik', 'sinif', 'atolye', 'laboratuvar', 'lab', 'calisma', 'kutuphane', 'okuma', 'galeri', 'sergi', 'toplanti', 'egitim', 'studuyo', 'studyo']],
    ['teknik', ['depo', 'kiler', 'teknik', 'kazan', 'sunucu', 'arsiv', 'garaj', 'jenerator', 'siginak', 'yukleme', 'mal kabul']],
    ['acik', ['balkon', 'teras', 'bahce', 'avlu', 'veranda', 'otopark']],
    ['sosyal', ['salon', 'oturma', 'yemek', 'restoran', 'kafe', 'mutfak salon', 'misafir', 'cok amacli', 'kantin', 'bar', 'magaza', 'resepsiyon']],
  ];
})();

/* ==========================================================================
   11-data-knowledge.js — Akıllı öneri asistanının hazır bilgi tabanı
   Kaynaklar: (1) Türk mevzuatı ve bakanlık kılavuzları (sert alt sınır),
   (2) uluslararası rehberler (tipik/ideal aralık), (3) yüklenen kitaplardaki
   mekân organizasyonu ve dolaşım kavramları (Ching), (4) bu çalışmanın sentezi (S).
   min = mevzuat asgarisi (null: sayısal asgari yok) | typ = tipik aralık | ideal = ideal aralık
   Alan birimi: m². Veri yapısı JSON'a uygundur; modüller arası paylaşım için tasarlanmıştır.
   ========================================================================== */
(function () {
  const App = window.App;

  const SOURCES = {
    'PAİY':    { label: 'Planlı Alanlar İmar Yönetmeliği (md. 29)', kind: 'Mevzuat', trust: 'çok yüksek' },
    'İst.İY':  { label: 'İstanbul İmar Yönetmeliği (md. 31)', kind: 'Mevzuat', trust: 'çok yüksek' },
    'MEB15':   { label: 'MEB Eğitim Yapıları Asgari Tasarım Standartları Kılavuzu 2015', kind: 'Bakanlık kılavuzu', trust: 'çok yüksek' },
    'ÖÖK':     { label: 'MEB Özel Öğretim Kurumları Standartlar Yönergesi', kind: 'Yönerge', trust: 'yüksek' },
    'KREŞ':    { label: 'Özel Kreş ve Gündüz Bakımevleri Yönetmeliği', kind: 'Mevzuat', trust: 'çok yüksek' },
    'AHUY':    { label: 'Aile Hekimliği Uygulama Yönetmeliği', kind: 'Mevzuat', trust: 'çok yüksek' },
    'ATTY':    { label: 'Ayakta Teşhis ve Tedavi Yapılan Özel Sağlık Kuruluşları Yönetmeliği', kind: 'Mevzuat', trust: 'çok yüksek' },
    'TTNY':    { label: 'Turizm Tesislerinin Niteliklerine İlişkin Yönetmelik (2024 değ.)', kind: 'Mevzuat', trust: 'çok yüksek' },
    'NDSS':    { label: 'İngiltere Nationally Described Space Standard', kind: 'Yabancı standart', trust: 'yüksek' },
    'BCO':     { label: 'British Council for Offices — ofis yoğunluğu', kind: 'Sektör rehberi', trust: 'orta-yüksek' },
    'GSA':     { label: 'GSA / Gensler — Sirkülasyon (2012); UNM Verimlilik Rehberi', kind: 'Kurumsal rehber', trust: 'orta-yüksek' },
    'Dahlgren':{ label: 'Dahlgren — Public Library Space Needs (2009)', kind: 'Rehber', trust: 'orta-yüksek' },
    'Ching':   { label: 'Ching — Mimarlık: Biçim, Mekan ve Düzen (yüklenen kitap)', kind: 'Literatür', trust: 'yüksek' },
    'White':   { label: 'E. T. White — Space Adjacency Analysis (1986)', kind: 'Literatür', trust: 'yüksek' },
    'TOKİ':    { label: 'TOKİ proje belgeleri (net/brüt oranları)', kind: 'Uygulama verisi', trust: 'orta' },
    'S':       { label: 'Sentez: kaynaklı değerlerden türetilmiş öneri; kullanım ile kalibre edilmeli', kind: 'Sentez', trust: 'orta' },
  };

  const E = (key, name, zone, min, typ, ideal, o) =>
    Object.assign({ key: key, name: name, zone: zone, min: min, typ: typ, ideal: ideal || typ, req: true, noise: 'mid', kw: [name], note: '', src: 'S' }, o || {});

  /* ------------------------------ KONUT ------------------------------ */
  function konut(n, villa) {
    const e = [];
    e.push(E('antre', 'Antre', 'sirkulasyon', null, [3, 6], [4, 8], { kw: ['antre', 'giris', 'vestiyer'], src: 'S', note: 'Hol/koridor genişliği en az 1,20 m olmalı (İstanbul: 1,10 m). Antre + hol toplamı net alanın yaklaşık %8–14’ü.' }));
    if (n >= 3 || villa) e.push(E('hol', 'Yatak Holü', 'sirkulasyon', null, [3, 6], [4, 7], { kw: ['yatak holu', 'hol', 'koridor'], req: false, src: 'S', note: 'Yatak odalarını ve banyoyu salondan ayıran özel bölge; koridor ≥ 1,20 m.' }));
    e.push(E('salon', 'Salon', 'sosyal', 12, [18, 28], [22, 32], { kw: ['salon', 'oturma', 'yasam', 'living'], src: 'PAİY', note: 'Oturma odası en az 12 m², dar kenar 3,00 m. Tipik aralık uygulama verisidir.' }));
    e.push(E('yemek', 'Yemek Alanı', 'sosyal', null, [8, 12], [10, 14], { kw: ['yemek'], req: false, src: 'S', note: 'Açık planlı salon–mutfakta mutfak nişi + oda minimumlarının toplamı aranır (12 + 3,30 m²).' }));
    e.push(E('mutfak', 'Mutfak', 'servis', 3.3, [8, 14], [10, 14], { kw: ['mutfak', 'kitchen'], noise: 'mid', src: 'PAİY', note: 'Mutfak en az 3,30 m² (dar kenar 1,50 m). Mutfak, oda ve banyo/WC havalandırmaları aynı boşluğa açılamaz.' }));
    e.push(E('yatak1', 'Ebeveyn Yatak Odası', 'ozel', 9, [12, 16], [14, 18], { kw: ['ebeveyn', 'yatak odasi 1', 'master', 'yatak odasi', 'yatak'], noise: 'quiet', src: 'PAİY', note: 'Yatak odası en az 9 m², dar kenar 2,50 m (İstanbul İmar Yönetmeliği: 8 m² / 2,40 m). NDSS çift kişilik oda ≥ 11,5 m².' }));
    for (let i = 2; i <= n; i++) {
      e.push(E('yatak' + i, 'Yatak Odası ' + i, 'ozel', 9, [9, 12], [11, 14], { kw: ['yatak odasi ' + i, 'cocuk odasi ' + (i - 1), 'cocuk', 'yatak odasi', 'yatak'], noise: 'quiet', src: 'PAİY', note: 'En az 9 m²; tek kişilik oda için NDSS ≥ 7,5 m² (Türk asgarisi daha büyük).' }));
    }
    e.push(E('banyo', 'Banyo', 'servis', 3, [5, 8], [6, 8], { kw: ['banyo', 'dus', 'bath'], src: 'PAİY', note: 'Banyo en az 3,00 m², dar kenar 1,50 m (İstanbul: 1,20 m). En fazla 3 odalı konutta banyo ve WC birleştirilebilir.' }));
    if (n >= 3 || villa) e.push(E('banyo2', 'Ebeveyn Banyosu', 'servis', null, [3.5, 5], [5, 6], { kw: ['ebeveyn banyo', 'ensuit', 'en suite'], req: false, src: 'S', note: 'Yalnızca ebeveyn yatak odasına açılır.' }));
    e.push(E('wc', 'WC', 'servis', 1.2, [1.5, 2.5], [2, 2.5], { kw: ['wc', 'tuvalet', 'misafir wc'], req: n >= 3 || villa, src: 'PAİY', note: 'WC en az 1,20 m², dar kenar 1,00 m. Misafir WC’si antre/salon tarafında olmalı; mutfağa ve yemek alanına doğrudan açılmamalı.' }));
    e.push(E('balkon', 'Balkon', 'acik', null, [4, 8], [6, 12], { kw: ['balkon', 'teras'], req: false, src: 'S', note: 'Salonu tamamlayan balkon; servis balkonu mutfağa bağlanır.' }));
    e.push(E('kiler', 'Kiler / Depo', 'teknik', null, [1.5, 3], [3, 5], { kw: ['kiler', 'depo', 'camasir', 'dolap'], req: false, src: 'NDSS', note: 'NDSS iç depo: 1 yatak odalı 1,5 m², 2 yatak odalı 2,0 m². En sık unutulan mekân.' }));
    if (villa) {
      e.push(E('calisma', 'Çalışma Odası', 'ozel', null, [9, 14], [12, 16], { kw: ['calisma', 'ofis'], req: false, noise: 'quiet', src: 'S' }));
      e.push(E('misafir', 'Misafir Odası + WC', 'ozel', 9, [12, 16], [14, 18], { kw: ['misafir odasi', 'misafir'], req: false, noise: 'quiet', src: 'PAİY', note: 'Misafir odası zemin katta, yatak katından ayrı olmalı.' }));
      e.push(E('garaj', 'Garaj', 'teknik', null, [15, 30], [18, 36], { kw: ['garaj', 'otopark'], req: false, src: 'S' }));
      e.push(E('teknik', 'Kazan / Teknik Oda', 'teknik', null, [4, 8], [6, 10], { kw: ['kazan', 'teknik'], req: false, noise: 'loud', src: 'S', note: 'Servis girişinden erişilmeli; yatak odalarından uzak.' }));
      e.push(E('merdiven', 'Merdiven', 'sirkulasyon', null, [6, 10], [8, 12], { kw: ['merdiven'], req: true, src: 'PAİY', note: 'İç yükseklik ≥ 2,60 m.' }));
    }
    const has = (k) => e.some((x) => x.key === k);
    const R = [
      ['antre', 'salon', 'strong'], ['antre', 'mutfak', 'weak'], ['antre', 'wc', 'strong'],
      ['salon', 'yemek', 'strong'], ['salon', 'balkon', 'strong'], ['salon', 'mutfak', 'weak'], ['yemek', 'mutfak', 'strong'],
      ['mutfak', 'kiler', 'strong'], ['mutfak', 'balkon', 'weak'],
      ['salon', 'yatak1', 'avoid'], ['salon', 'banyo', 'avoid'], ['mutfak', 'wc', 'avoid'], ['mutfak', 'yatak1', 'avoid'],
      ['yatak1', 'banyo2', 'strong'], ['banyo', 'wc', 'strong'],
      ['hol', 'banyo', 'strong'], ['hol', 'yatak1', 'strong'], ['hol', 'salon', 'weak'],
      ['garaj', 'antre', 'weak'], ['garaj', 'yatak1', 'avoid'], ['teknik', 'yatak1', 'avoid'], ['teknik', 'garaj', 'weak'],
      ['misafir', 'antre', 'weak'], ['calisma', 'salon', 'avoid'], ['merdiven', 'antre', 'strong'],
    ];
    for (let i = 2; i <= n; i++) {
      R.push([has('hol') ? 'hol' : 'antre', 'yatak' + i, has('hol') ? 'strong' : 'weak']);
      R.push(['yatak' + i, 'banyo', 'weak']);
      R.push(['salon', 'yatak' + i, 'avoid']);
      R.push(['mutfak', 'yatak' + i, 'avoid']);
    }
    if (!has('hol')) { R.push(['antre', 'yatak1', 'weak']); R.push(['yatak1', 'banyo', 'strong']); R.push(['antre', 'banyo', 'weak']); }
    return { entries: e, relations: R };
  }

  /* ------------------------ DİĞER BİNA TİPLERİ ------------------------ */
  const OFIS = {
    entries: [
      E('resepsiyon', 'Resepsiyon / Bekleme', 'sirkulasyon', null, [10, 20], [14, 24], { kw: ['resepsiyon', 'bekleme', 'giris', 'karsilama'], src: 'S' }),
      E('acik', 'Açık Ofis', 'calisma', null, [100, 120], [110, 130], { kw: ['acik ofis', 'calisma alani', 'ofis'], src: 'BCO', note: 'Tasarım yoğunluğu çalışma yeri başına yaklaşık 10 m² (BCO 2022). Tarihsel aralık 8–13 m². Örnek program 10 kişiliktir.' }),
      E('yonetici', 'Yönetici Odası', 'ozel', null, [12, 16], [16, 20], { kw: ['yonetici', 'mudur', 'direktor'], noise: 'quiet', src: 'S' }),
      E('toplanti', 'Toplantı Odası', 'calisma', null, [16, 28], [20, 32], { kw: ['toplanti'], src: 'S', note: 'Her 8–12 kişiye bir toplantı odası; misafir toplantıları için resepsiyona yakın.' }),
      E('cay', 'Çay Ocağı / Mutfak', 'servis', null, [6, 12], [8, 14], { kw: ['cay', 'mutfak', 'kafeterya'], noise: 'loud', src: 'S' }),
      E('wc', 'WC', 'servis', null, [8, 14], [10, 16], { kw: ['wc', 'tuvalet'], src: 'S' }),
      E('arsiv', 'Arşiv / Depo', 'teknik', null, [5, 15], [8, 18], { kw: ['arsiv', 'depo'], req: false, src: 'S' }),
      E('sunucu', 'Sunucu / Teknik Oda', 'teknik', null, [4, 10], [6, 12], { kw: ['sunucu', 'teknik'], req: false, src: 'S', note: 'Islak hacimlerin altına/yanına gelmemeli.' }),
      E('foto', 'Fotokopi Nişi', 'teknik', null, [3, 6], [4, 8], { kw: ['fotokopi', 'yazici'], req: false, noise: 'loud', src: 'S' }),
      E('koridor', 'Koridor / Sirkülasyon', 'sirkulasyon', null, [30, 45], [35, 50], { kw: ['koridor', 'sirkulasyon', 'hol'], src: 'GSA', note: 'Ofiste sirkülasyon brüt alanın yaklaşık %16–28’i; kapalı ofis ağırlıklı planlarda %30’u aşabilir.' }),
    ],
    relations: [
      ['resepsiyon', 'toplanti', 'strong'], ['resepsiyon', 'acik', 'weak'], ['acik', 'toplanti', 'strong'], ['acik', 'yonetici', 'weak'],
      ['acik', 'cay', 'weak'], ['cay', 'wc', 'weak'], ['acik', 'foto', 'strong'], ['yonetici', 'toplanti', 'weak'],
      ['sunucu', 'cay', 'avoid'], ['sunucu', 'wc', 'avoid'], ['yonetici', 'cay', 'avoid'], ['acik', 'arsiv', 'weak'],
    ],
  };

  const OKUL = {
    entries: [
      E('giris', 'Giriş Holü / Kapalı Teneffüs', 'sirkulasyon', null, [90, 160], [120, 180], { kw: ['giris', 'hol', 'teneffus'], src: 'MEB15' }),
      E('mudur', 'Müdür ve Yardımcıları', 'ozel', null, [30, 45], [35, 55], { kw: ['mudur', 'idare'], noise: 'quiet', src: 'MEB15', note: 'Alan verilmemiş (ihtiyaç programına bağlı). Müdür odası girişlere ve öğrenci alanlarına hâkim olmalı.' }),
      E('ogretmen', 'Öğretmenler Odası', 'ozel', null, [40, 60], [45, 70], { kw: ['ogretmen'], noise: 'quiet', src: 'MEB15' }),
      E('rehber', 'Rehberlik Servisi', 'ozel', null, [15, 25], [18, 28], { kw: ['rehber', 'veli'], noise: 'quiet', src: 'MEB15', note: 'Girişe yakın olmalı.' }),
      E('derslik', 'Derslik Grubu (12)', 'calisma', 666, [666, 720], [700, 780], { kw: ['derslik', 'sinif'], noise: 'quiet', src: 'MEB15', note: '30 öğrencilik derslik; ortaokul/lisede ≥ 1,85 m²/öğrenci (ilkokulda 1,60). 12 derslik için 12 × 30 × 1,85 = 666 m².' }),
      E('lab', 'Fen Laboratuvarı', 'calisma', 55.5, [56, 65], [60, 72], { kw: ['laboratuvar', 'lab', 'fen'], src: 'MEB15', note: '≥ 1,85 m²/kişi + hazırlık odası; tercihen zemin kat.' }),
      E('muzik', 'Müzik Dersliği', 'calisma', 55.5, [56, 70], [60, 75], { kw: ['muzik'], noise: 'loud', src: 'MEB15', note: 'Dersliklerden uzak, ses yalıtımlı alanda olmalı.' }),
      E('gorsel', 'Görsel Sanatlar Dersliği', 'calisma', 55.5, [56, 70], [60, 75], { kw: ['gorsel', 'resim'], req: false, src: 'MEB15' }),
      E('kutuphane', 'Kütüphane', 'calisma', 60, [60, 100], [80, 120], { kw: ['kutuphane'], noise: 'quiet', src: 'MEB15', note: '≥ 1,50 m²/kişi (çalışma salonu); yarısı okuma, yarısı raf.' }),
      E('cokamacli', 'Çok Amaçlı Salon', 'sosyal', 180, [180, 300], [220, 320], { kw: ['cok amacli', 'konferans', 'salon'], noise: 'loud', src: 'MEB15', note: 'Oturma alanında ≥ 1,20 m²/kişi; dersliklerden uzak, zemin kat.' }),
      E('yemekhane', 'Yemekhane', 'sosyal', 234, [234, 270], [250, 300], { kw: ['yemekhane'], noise: 'loud', src: 'MEB15', note: '≥ 1,30 m²/kişi; öğrencilerin %50’si 15’er dakikalık periyotlarla. (360 öğrenci örneği)' }),
      E('mutfak', 'Yemekhane Mutfağı', 'servis', 117, [120, 150], [130, 160], { kw: ['mutfak'], noise: 'loud', src: 'MEB15', note: 'Pişirme alanı salonun en az %50’si; servis girişi öğrenci sirkülasyonuyla kesişmemeli.' }),
      E('kantin', 'Kantin', 'sosyal', null, [40, 80], [50, 90], { kw: ['kantin'], req: false, noise: 'loud', src: 'S' }),
      E('wck', 'Öğrenci WC (Kız)', 'servis', null, [30, 45], [35, 50], { kw: ['wc kiz', 'kiz wc', 'kiz', 'wc'], src: 'MEB15', note: 'Her 20 öğrenciye 1 WC + 1 lavabo; her katta ayrı kız/erkek. WC’ler laboratuvar/mutfak üzerine gelmemeli.' }),
      E('wce', 'Öğrenci WC (Erkek)', 'servis', null, [30, 45], [35, 50], { kw: ['wc erkek', 'erkek wc', 'erkek', 'wc'], src: 'MEB15', note: 'Pisuar ayrıca; her katta engelli WC.' }),
      E('koridor', 'Koridor / Sirkülasyon', 'sirkulasyon', null, [500, 700], [550, 720], { kw: ['koridor', 'sirkulasyon', 'merdiven'], src: 'MEB15', note: 'Sirkülasyon alanı, eğitsel+sosyal+idari alanların %50–60’ı (brütün yaklaşık %33–37’si). Çift taraflı koridor ≥ 3,00 m.' }),
      E('spor', 'Spor Salonu', 'sosyal', null, [300, 500], [400, 600], { kw: ['spor'], req: false, noise: 'loud', src: 'S' }),
      E('teknik', 'Kazan / Teknik', 'teknik', null, [30, 60], [40, 70], { kw: ['kazan', 'teknik', 'jenerator'], req: false, noise: 'loud', src: 'MEB15', note: 'Bodrumda/arka cephede; servis yolu tören alanından ayrı.' }),
    ],
    relations: [
      ['giris', 'mudur', 'strong'], ['giris', 'rehber', 'strong'], ['giris', 'kantin', 'weak'], ['giris', 'koridor', 'strong'],
      ['koridor', 'derslik', 'strong'], ['derslik', 'wck', 'strong'], ['derslik', 'wce', 'strong'], ['derslik', 'lab', 'weak'], ['derslik', 'kutuphane', 'weak'],
      ['derslik', 'muzik', 'avoid'], ['derslik', 'cokamacli', 'avoid'], ['derslik', 'spor', 'avoid'], ['kutuphane', 'muzik', 'avoid'], ['kutuphane', 'cokamacli', 'avoid'],
      ['yemekhane', 'mutfak', 'strong'], ['yemekhane', 'kantin', 'weak'], ['mudur', 'ogretmen', 'weak'], ['cokamacli', 'giris', 'weak'], ['teknik', 'derslik', 'avoid'],
    ],
  };

  const KRES = {
    entries: [
      E('giris', 'Giriş / Karşılama', 'sirkulasyon', null, [10, 20], [14, 24], { kw: ['giris', 'karsilama', 'antre'], src: 'S' }),
      E('oyun', 'Oyun ve Etkinlik Odası', 'sosyal', 15, [40, 50], [45, 60], { kw: ['oyun', 'etkinlik'], noise: 'loud', src: 'KREŞ', note: 'Oda ≥ 15 m²; çocuk başına ≥ 2 m² + 6 m³ hava. Kapasite bu odaların alanından hesaplanır (örnek: 20 çocuk).' }),
      E('uyku', 'Uyku Odası', 'ozel', 15, [20, 40], [25, 45], { kw: ['uyku'], noise: 'quiet', src: 'KREŞ', note: 'KREŞ: ≥ 2 m² + 6 m³/çocuk; MEB15: 1,50 m²/kişi; ÖÖK: ≥ 3 m² + 10 m³/öğrenci. Kurumun bağlı olduğu bakanlığa göre seçin.' }),
      E('emekleme', 'Oyun / Emekleme Odası', 'sosyal', 15, [20, 40], [25, 45], { kw: ['emekleme'], req: false, noise: 'loud', src: 'KREŞ', note: 'Uyku odasına denk büyüklükte; kapasiteye dahil edilmez.' }),
      E('bahce', 'Oyun Bahçesi', 'acik', 30, [40, 80], [60, 100], { kw: ['bahce', 'oyun bahcesi'], src: 'KREŞ', note: '≥ 1,5 m²/çocuk; sınıflardan doğrudan bahçeye çıkılabilmeli.' }),
      E('mutfak', 'Mutfak', 'servis', null, [10, 18], [12, 20], { kw: ['mutfak'], src: 'S' }),
      E('yemek', 'Yemek Odası', 'sosyal', null, [15, 25], [18, 28], { kw: ['yemek'], req: false, src: 'S' }),
      E('idare', 'İdare / Müdür Odası', 'ozel', 10, [10, 15], [12, 16], { kw: ['idare', 'mudur'], noise: 'quiet', src: 'ÖÖK', note: 'Müdür odası ≥ 10 m²; girişe yakın, kontrol görüşü.' }),
      E('veli', 'Veli Görüşme', 'ozel', 15, [15, 20], [16, 22], { kw: ['veli', 'gorusme'], req: false, noise: 'quiet', src: 'ÖÖK' }),
      E('wc', 'Çocuk WC / Lavabo', 'servis', null, [8, 14], [10, 16], { kw: ['wc', 'lavabo', 'tuvalet'], src: 'MEB15', note: 'Her 30 öğrenciye 1 WC + 1 lavabo (MEB15); etkinlik odalarına bitişik, yaşa uygun lavabo yüksekliği.' }),
      E('bakim', 'Bebek Bakım / Alt Değiştirme', 'servis', null, [6, 10], [8, 12], { kw: ['bakim', 'alt degistirme'], req: false, src: 'S' }),
      E('depo', 'Depo', 'teknik', null, [4, 8], [5, 10], { kw: ['depo'], req: false, src: 'S' }),
    ],
    relations: [
      ['giris', 'idare', 'strong'], ['giris', 'veli', 'weak'], ['oyun', 'bahce', 'strong'], ['oyun', 'wc', 'strong'], ['oyun', 'uyku', 'weak'],
      ['uyku', 'emekleme', 'strong'], ['yemek', 'mutfak', 'strong'], ['oyun', 'yemek', 'weak'], ['uyku', 'bahce', 'avoid'], ['uyku', 'mutfak', 'avoid'],
      ['mutfak', 'oyun', 'avoid'], ['bakim', 'uyku', 'weak'],
    ],
  };

  const OTEL = {
    entries: [
      E('lobi', 'Lobi / Resepsiyon', 'sirkulasyon', null, [40, 80], [50, 90], { kw: ['lobi', 'resepsiyon', 'giris'], src: 'S' }),
      E('bagaj', 'Bagaj Odası', 'teknik', null, [6, 12], [8, 14], { kw: ['bagaj'], req: false, src: 'S' }),
      E('oda', 'Oda Grubu (10)', 'ozel', 200, [220, 320], [250, 320], { kw: ['oda', 'standart oda', 'suit'], noise: 'quiet', src: 'TTNY', note: '4★ otelde oda banyo dahil ≥ 20 m², 5★’ta ≥ 25 m² (RG 22.12.2024). 10 oda × 20 m² = 200 m².' }),
      E('restoran', 'Restoran / Kahvaltı Salonu', 'sosyal', null, [60, 120], [80, 140], { kw: ['restoran', 'kahvalti', 'yemek'], noise: 'loud', src: 'S' }),
      E('mutfak', 'Mutfak', 'servis', null, [25, 50], [30, 60], { kw: ['mutfak'], noise: 'loud', src: 'S' }),
      E('katofis', 'Kat Ofisi', 'teknik', null, [6, 12], [8, 14], { kw: ['kat ofisi'], src: 'TTNY', note: 'Servis akışı lobiden geçmemeli.' }),
      E('camasir', 'Çamaşırhane', 'servis', null, [15, 30], [18, 36], { kw: ['camasir'], noise: 'loud', src: 'S' }),
      E('personel', 'Personel (Soyunma / Yemek)', 'teknik', null, [15, 30], [18, 32], { kw: ['personel'], src: 'S' }),
      E('yonetim', 'Yönetim Ofisi', 'ozel', null, [12, 20], [14, 22], { kw: ['yonetim', 'ofis'], req: false, src: 'S' }),
      E('depo', 'Depo', 'teknik', null, [10, 25], [12, 28], { kw: ['depo'], req: false, src: 'S' }),
      E('teknik', 'Teknik Oda', 'teknik', null, [10, 25], [12, 28], { kw: ['teknik', 'kazan'], req: false, noise: 'loud', src: 'S' }),
      E('koridor', 'Kat Koridoru / Sirkülasyon', 'sirkulasyon', null, [60, 90], [70, 100], { kw: ['koridor', 'sirkulasyon', 'merdiven', 'asansor'], src: 'S' }),
    ],
    relations: [
      ['lobi', 'bagaj', 'strong'], ['lobi', 'restoran', 'strong'], ['lobi', 'yonetim', 'strong'], ['lobi', 'koridor', 'strong'], ['koridor', 'oda', 'strong'],
      ['mutfak', 'restoran', 'strong'], ['katofis', 'oda', 'strong'], ['camasir', 'katofis', 'strong'], ['personel', 'mutfak', 'weak'], ['depo', 'mutfak', 'weak'],
      ['mutfak', 'lobi', 'avoid'], ['camasir', 'lobi', 'avoid'], ['teknik', 'oda', 'avoid'], ['restoran', 'oda', 'avoid'],
    ],
  };

  const ASM = {
    entries: [
      E('bekleme', 'Bekleme', 'sirkulasyon', 25, [28, 45], [35, 50], { kw: ['bekleme', 'giris', 'hol'], src: 'AHUY', note: 'Tek hekimde ≥ 20 m², her ek hekim için +5 m² (Ek-1). 1 hekim için ≥ 5 koltuk, her ek hekim +3.' }),
      E('kayit', 'Kayıt / Danışma', 'sosyal', null, [8, 15], [10, 16], { kw: ['kayit', 'danisma'], src: 'S' }),
      E('muayene1', 'Muayene Odası 1', 'ozel', 10, [14, 16], [14, 18], { kw: ['muayene odasi 1', 'muayene'], noise: 'quiet', src: 'AHUY', note: 'ASM’de muayene odası ≥ 10 m², lavabolu (Ek-1 puanlamasında 14 m²). Poliklinikte ise ≥ 16 m² (ATTY).' }),
      E('muayene2', 'Muayene Odası 2', 'ozel', 10, [14, 16], [14, 18], { kw: ['muayene odasi 2', 'muayene'], noise: 'quiet', src: 'AHUY' }),
      E('asi', 'Aşı / İzlem Odası', 'ozel', 10, [10, 14], [12, 16], { kw: ['asi', 'izlem', 'bebek'], src: 'AHUY', note: 'Müstakil oda ≥ 10 m²; her 3 hekime 1 oda.' }),
      E('mudahale', 'Müdahale / Pansuman', 'servis', 10, [10, 14], [12, 16], { kw: ['mudahale', 'pansuman'], src: 'AHUY' }),
      E('wc', 'Hasta WC', 'servis', null, [3, 6], [4, 7], { kw: ['wc', 'tuvalet'], src: 'S', note: 'Engelli erişimi ve acil çağrı düğmesi.' }),
      E('personel', 'Personel / Dinlenme', 'ozel', null, [10, 16], [12, 18], { kw: ['personel', 'dinlenme'], req: false, src: 'S' }),
      E('depo', 'Depo / İlaç', 'teknik', null, [4, 8], [5, 10], { kw: ['depo', 'ilac'], req: false, src: 'S' }),
      E('koridor', 'Koridor', 'sirkulasyon', null, [20, 35], [25, 40], { kw: ['koridor', 'sirkulasyon'], src: 'S', note: 'Merdiven ve sahanlık sedye için ≥ 1,30 m.' }),
    ],
    relations: [
      ['bekleme', 'kayit', 'strong'], ['bekleme', 'wc', 'strong'], ['bekleme', 'koridor', 'strong'], ['koridor', 'muayene1', 'strong'], ['koridor', 'muayene2', 'strong'],
      ['muayene1', 'mudahale', 'weak'], ['asi', 'bekleme', 'weak'], ['mudahale', 'asi', 'weak'], ['depo', 'mudahale', 'weak'],
      ['muayene1', 'bekleme', 'avoid'], ['muayene2', 'bekleme', 'avoid'], ['personel', 'bekleme', 'avoid'],
    ],
  };
  const POLI = {
    entries: [
      E('bekleme', 'Bekleme', 'sirkulasyon', 25, [30, 45], [35, 50], { kw: ['bekleme', 'giris'], src: 'ATTY', note: 'Poliklinikte ≥ 20 m²; ikiden fazla her muayene odası için +5 m². Bekleme amaçlı orta koridor ≥ 3 m.' }),
      E('kayit', 'Kayıt / Danışma', 'sosyal', null, [8, 15], [10, 16], { kw: ['kayit', 'danisma'], src: 'S' }),
      E('muayene1', 'Muayene Odası 1', 'ozel', 16, [16, 20], [18, 22], { kw: ['muayene odasi 1', 'muayene'], noise: 'quiet', src: 'ATTY', note: '≥ 16 m² (8 m² hekim + 8 m² muayene alanı); soyunma bölümü ve lavabo.' }),
      E('muayene2', 'Muayene Odası 2', 'ozel', 16, [16, 20], [18, 22], { kw: ['muayene odasi 2', 'muayene'], noise: 'quiet', src: 'ATTY' }),
      E('muayene3', 'Muayene Odası 3', 'ozel', 16, [16, 20], [18, 22], { kw: ['muayene odasi 3', 'muayene'], noise: 'quiet', src: 'ATTY' }),
      E('mudahale', 'Pansuman / Müdahale', 'servis', 10, [10, 14], [12, 16], { kw: ['mudahale', 'pansuman'], src: 'ATTY' }),
      E('wc', 'Hasta WC', 'servis', null, [3, 6], [4, 7], { kw: ['wc', 'tuvalet'], src: 'ATTY', note: 'Bekleme salonuna koridorla bağlı, acil çağrı ve tutamaçlı.' }),
      E('koridor', 'Koridor', 'sirkulasyon', null, [25, 40], [30, 45], { kw: ['koridor', 'sirkulasyon'], src: 'S' }),
      E('depo', 'Depo / Steril', 'teknik', null, [4, 10], [6, 12], { kw: ['depo', 'steril'], req: false, src: 'S' }),
    ],
    relations: [
      ['bekleme', 'kayit', 'strong'], ['bekleme', 'wc', 'strong'], ['bekleme', 'koridor', 'strong'], ['koridor', 'muayene1', 'strong'], ['koridor', 'muayene2', 'strong'], ['koridor', 'muayene3', 'strong'],
      ['muayene1', 'mudahale', 'weak'], ['muayene1', 'bekleme', 'avoid'], ['muayene2', 'bekleme', 'avoid'], ['muayene3', 'bekleme', 'avoid'], ['mudahale', 'depo', 'weak'],
    ],
  };

  const KUTUP = {
    entries: [
      E('giris', 'Giriş / Kontrol / Ödünç', 'sirkulasyon', null, [25, 45], [30, 50], { kw: ['giris', 'kontrol', 'odunc'], src: 'S' }),
      E('yetiskin', 'Yetişkin Koleksiyon + Okuma', 'calisma', null, [150, 230], [180, 260], { kw: ['yetiskin', 'koleksiyon', 'raf'], noise: 'quiet', src: 'Dahlgren', note: 'Okuyucu oturma yeri 2,3–3,7 m² (ort. 2,8 m²) ve raf yoğunluğu ortalama ≈ 108 cilt/m².' }),
      E('cocuk', 'Çocuk Bölümü', 'sosyal', null, [45, 80], [55, 90], { kw: ['cocuk'], noise: 'loud', src: 'S', note: 'Ayrı ve tanınabilir; sessiz okumadan uzak.' }),
      E('sessiz', 'Sessiz Okuma / Çalışma', 'calisma', null, [60, 110], [70, 120], { kw: ['sessiz', 'calisma', 'okuma'], noise: 'quiet', src: 'Dahlgren' }),
      E('etkinlik', 'Etkinlik / Toplantı Salonu', 'sosyal', null, [40, 80], [50, 90], { kw: ['etkinlik', 'toplanti', 'salon'], noise: 'loud', src: 'S' }),
      E('depo', 'Depo / Arşiv', 'teknik', null, [15, 40], [20, 45], { kw: ['depo', 'arsiv'], src: 'S' }),
      E('personel', 'Personel / İşlem', 'ozel', null, [15, 30], [18, 32], { kw: ['personel', 'islem'], src: 'S' }),
      E('wc', 'WC', 'servis', null, [12, 20], [14, 22], { kw: ['wc', 'tuvalet'], src: 'S' }),
      E('kafe', 'Kafe', 'sosyal', null, [20, 40], [25, 45], { kw: ['kafe'], req: false, noise: 'loud', src: 'S' }),
    ],
    relations: [
      ['giris', 'yetiskin', 'strong'], ['giris', 'cocuk', 'weak'], ['yetiskin', 'sessiz', 'strong'], ['giris', 'wc', 'weak'], ['giris', 'etkinlik', 'weak'],
      ['depo', 'personel', 'strong'], ['etkinlik', 'sessiz', 'avoid'], ['cocuk', 'sessiz', 'avoid'], ['kafe', 'sessiz', 'avoid'], ['giris', 'personel', 'weak'],
    ],
  };

  const RESTORAN = {
    entries: [
      E('giris', 'Giriş / Bekleme', 'sirkulasyon', null, [8, 15], [10, 18], { kw: ['giris', 'bekleme'], src: 'S' }),
      E('salon', 'Yemek Salonu', 'sosyal', null, [60, 100], [70, 110], { kw: ['salon', 'yemek', 'restoran'], noise: 'loud', src: 'S', note: 'Kişi başı yaklaşık 1,0–1,5 m² (gündelik 0,9–1,1; lüks 1,5–1,9 m²). Örnek program 60 kişiliktir. Kaba kural: salon %60, mutfak+hazırlık+depo %40.' }),
      E('bar', 'Bar / Servis Tezgâhı', 'sosyal', null, [8, 15], [10, 18], { kw: ['bar', 'servis', 'tezgah'], noise: 'loud', src: 'S' }),
      E('mutfak', 'Mutfak', 'servis', null, [30, 50], [35, 55], { kw: ['mutfak'], noise: 'loud', src: 'S' }),
      E('bulasik', 'Bulaşık / Çöp', 'servis', null, [4, 8], [5, 9], { kw: ['bulasik', 'cop'], src: 'S' }),
      E('wc', 'Müşteri WC', 'servis', null, [8, 14], [10, 16], { kw: ['wc', 'tuvalet'], src: 'S', note: 'Mutfağa ve yemek alanına doğrudan açılmamalı.' }),
      E('malkabul', 'Mal Kabul / Depo', 'teknik', null, [10, 20], [12, 22], { kw: ['mal kabul', 'depo'], src: 'S', note: 'Müşteri girişiyle kesişmeyen ayrı servis girişi.' }),
      E('soguk', 'Soğuk Hava Deposu', 'teknik', null, [4, 8], [5, 9], { kw: ['soguk'], req: false, src: 'S' }),
      E('personel', 'Personel (Soyunma / WC)', 'teknik', null, [6, 10], [7, 12], { kw: ['personel', 'soyunma'], src: 'S' }),
      E('teras', 'Teras', 'acik', null, [20, 60], [30, 80], { kw: ['teras', 'bahce'], req: false, src: 'S' }),
    ],
    relations: [
      ['giris', 'salon', 'strong'], ['salon', 'bar', 'strong'], ['bar', 'mutfak', 'weak'], ['mutfak', 'bulasik', 'strong'], ['mutfak', 'malkabul', 'strong'],
      ['mutfak', 'salon', 'strong'], ['malkabul', 'soguk', 'strong'], ['giris', 'wc', 'weak'], ['salon', 'teras', 'strong'],
      ['wc', 'mutfak', 'avoid'], ['wc', 'salon', 'weak'], ['malkabul', 'giris', 'avoid'], ['malkabul', 'salon', 'avoid'],
    ],
  };

  const MUZE = {
    entries: [
      E('giris', 'Giriş / Bilet / Vestiyer', 'sirkulasyon', null, [30, 60], [40, 70], { kw: ['giris', 'bilet', 'vestiyer'], src: 'S' }),
      E('kalici', 'Kalıcı Sergi Salonu', 'calisma', null, [150, 300], [180, 320], { kw: ['kalici', 'sergi'], noise: 'quiet', src: 'S', note: 'Kalıcı sergiler toplam alanın yaklaşık %40’ı. Galeri : galeri dışı ≈ 48 : 52 (ikincil kaynak).' }),
      E('gecici', 'Geçici Sergi Salonu', 'calisma', null, [80, 150], [100, 170], { kw: ['gecici'], req: false, noise: 'quiet', src: 'S' }),
      E('depo', 'Koleksiyon Deposu', 'teknik', null, [60, 120], [70, 140], { kw: ['koleksiyon', 'depo'], src: 'S', note: 'Koleksiyon hacmi + planlı büyüme + bağışlar için yaklaşık %15 ek alan; depo ekipman izdüşümüne %60 sirkülasyon.' }),
      E('karantina', 'Kasa Açma / Karantina', 'teknik', null, [15, 30], [18, 34], { kw: ['kasa acma', 'karantina'], src: 'S' }),
      E('yukleme', 'Yükleme Alanı', 'teknik', null, [20, 40], [25, 45], { kw: ['yukleme', 'mal kabul'], noise: 'loud', src: 'S', note: 'Koleksiyon rotası kamusal alanlardan geçmemeli.' }),
      E('magaza', 'Mağaza', 'sosyal', null, [15, 30], [18, 34], { kw: ['magaza', 'hediye'], req: false, src: 'S' }),
      E('kafe', 'Kafe', 'sosyal', null, [30, 60], [35, 70], { kw: ['kafe'], req: false, noise: 'loud', src: 'S' }),
      E('egitim', 'Eğitim Atölyesi', 'calisma', null, [30, 50], [35, 55], { kw: ['egitim', 'atolye'], req: false, noise: 'loud', src: 'S' }),
      E('ofis', 'Ofis', 'ozel', null, [20, 40], [24, 44], { kw: ['ofis', 'idare'], src: 'S' }),
      E('wc', 'WC', 'servis', null, [12, 24], [14, 26], { kw: ['wc', 'tuvalet'], src: 'S', note: 'Islak hacimler depo/galeri üzerinde yer almamalı.' }),
      E('konservasyon', 'Konservasyon', 'teknik', null, [20, 40], [24, 44], { kw: ['konservasyon', 'restorasyon'], req: false, src: 'S' }),
    ],
    relations: [
      ['giris', 'kalici', 'strong'], ['giris', 'magaza', 'weak'], ['giris', 'kafe', 'weak'], ['kalici', 'gecici', 'strong'], ['giris', 'wc', 'weak'],
      ['yukleme', 'karantina', 'strong'], ['karantina', 'depo', 'strong'], ['depo', 'gecici', 'weak'], ['depo', 'konservasyon', 'strong'], ['ofis', 'depo', 'weak'],
      ['yukleme', 'giris', 'avoid'], ['yukleme', 'kalici', 'avoid'], ['kafe', 'kalici', 'avoid'], ['wc', 'depo', 'avoid'], ['egitim', 'kalici', 'avoid'],
    ],
  };

  const ATOLYE = {
    entries: [
      E('giris', 'Giriş / Karşılama', 'sirkulasyon', null, [8, 15], [10, 18], { kw: ['giris', 'karsilama'], src: 'S' }),
      E('atolye', 'Atölye', 'calisma', 22.5, [28, 45], [32, 50], { kw: ['atolye', 'studyo', 'studuyo'], noise: 'loud', src: 'MEB15', note: 'Özel kurumlarda öğrenci başına ≥ 1,5 m² (ÖÖK), kamu okulunda 1,85 m² (MEB15). Örnek: 15 öğrenci.' }),
      E('malzeme', 'Malzeme Deposu', 'teknik', null, [6, 12], [8, 14], { kw: ['malzeme', 'depo'], src: 'S' }),
      E('islak', 'Islak Alan / Temizlik', 'servis', null, [4, 8], [5, 9], { kw: ['islak', 'temizlik', 'lavabo'], src: 'S' }),
      E('boya', 'Boya / Havalandırmalı Bölüm', 'teknik', null, [8, 15], [10, 18], { kw: ['boya', 'havalandirma'], req: false, noise: 'loud', src: 'S' }),
      E('sergi', 'Sergi / Galeri', 'sosyal', null, [20, 40], [25, 45], { kw: ['sergi', 'galeri'], req: false, src: 'S' }),
      E('ofis', 'Eğitmen / Ofis', 'ozel', null, [8, 14], [10, 16], { kw: ['egitmen', 'ofis'], noise: 'quiet', src: 'S' }),
      E('wc', 'WC', 'servis', null, [4, 8], [5, 9], { kw: ['wc', 'tuvalet'], src: 'S' }),
    ],
    relations: [
      ['atolye', 'malzeme', 'strong'], ['atolye', 'islak', 'strong'], ['atolye', 'sergi', 'weak'], ['giris', 'sergi', 'strong'], ['giris', 'ofis', 'weak'], ['atolye', 'boya', 'weak'], ['giris', 'wc', 'weak'],
      ['atolye', 'ofis', 'avoid'],
    ],
  };

  const GENEL = {
    entries: [
      E('giris', 'Giriş', 'sirkulasyon', null, [6, 15], [8, 18], { kw: ['giris', 'antre', 'lobi'], src: 'S' }),
      E('ana', 'Ana Kullanım Alanı', 'sosyal', null, [40, 100], [60, 120], { kw: ['ana'], src: 'S' }),
      E('wc', 'WC', 'servis', null, [3, 8], [4, 10], { kw: ['wc', 'tuvalet'], src: 'S' }),
      E('depo', 'Depo', 'teknik', null, [4, 12], [6, 14], { kw: ['depo'], req: false, src: 'S' }),
      E('koridor', 'Sirkülasyon', 'sirkulasyon', null, [8, 20], [10, 24], { kw: ['koridor', 'sirkulasyon', 'hol'], src: 'S' }),
    ],
    relations: [['giris', 'ana', 'strong'], ['giris', 'wc', 'weak'], ['ana', 'depo', 'weak']],
  };

  const k1 = konut(1, false), k2 = konut(2, false), k3 = konut(3, false), k4 = konut(4, false), kv = konut(4, true);

  const TYPES = [
    { key: 'konut', label: 'Konut', circ: [0.08, 0.14], circNote: 'Konutta antre + hol + koridor net alanın yaklaşık %8–14’ü (TOKİ örneklerinde net/brüt ≈ 0,74–0,82).',
      notes: ['Mevzuat yalnızca asgari piyes ölçülerini verir; “tipik/ideal” değerler uygulama verisidir.', 'İl yönetmeliği PAİY’den farklı olabilir (ör. İstanbul: yatak odası 8 m², hol 1,10 m).', 'Islak hacimler tesisat şaftı etrafında gruplanır; ancak mutfak, oda ve WC/banyo havalandırmaları aynı boşluğa açılamaz.'],
      variants: [
        { key: '1+1', label: '1+1 Daire', entries: k1.entries, relations: k1.relations },
        { key: '2+1', label: '2+1 Daire', entries: k2.entries, relations: k2.relations },
        { key: '3+1', label: '3+1 Daire', entries: k3.entries, relations: k3.relations },
        { key: '4+1', label: '4+1 Daire', entries: k4.entries, relations: k4.relations },
        { key: 'villa', label: 'Müstakil Villa', entries: kv.entries, relations: kv.relations },
      ] },
    { key: 'ofis', label: 'Ofis', circ: [0.16, 0.28], circNote: 'Ofiste sirkülasyon brüt alanın yaklaşık %16’sı (UNM) ile kullanılabilir alanın %28–38’i (GSA/Gensler) arasında değişir.',
      notes: ['Türkiye’de ofis için ulusal m²/kişi standardı yok; BCO 2022 çalışma yeri başına 10 m² öneriyor (WC/asansör hesabında efektif 16,7 m²/kişi).'],
      variants: [{ key: '10kisi', label: '10 kişilik ofis', entries: OFIS.entries, relations: OFIS.relations }] },
    { key: 'okul', label: 'Okul', circ: [0.33, 0.37], circNote: 'MEB 2015: sirkülasyon, eğitsel + sosyal + idari alanların %50–60’ı (brütün yaklaşık %33–37’si).',
      notes: ['Okul modülü MEB 2015 Kılavuzu’na dayanır; derslik 30 öğrenci, ilkokulda ≥ 1,60, ortaokul/lisede ≥ 1,85 m²/öğrenci.', 'Kılavuz 2015 tarihlidir; daha yeni bir revizyon olup olmadığını kontrol edin.', 'Çift taraflı koridor ≥ 3,00 m; her 20 öğrenciye 1 WC + 1 lavabo.'],
      variants: [{ key: 'ortaokul12', label: 'Ortaokul (12 derslik)', entries: OKUL.entries, relations: OKUL.relations }] },
    { key: 'kres', label: 'Kreş / Anaokulu', circ: [0.15, 0.25], circNote: 'Kreş için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['İki bakanlık farklı değer verir: ASHB kreş yönetmeliği (≥ 2 m²/çocuk, oda ≥ 15 m²) ve MEB anaokulu (derslik ≥ 2,40 m²/kişi). Kurumun bağlı olduğu bakanlığı seçin.', 'Yaş tanımları 2016’da değişti (0–24 ay kreş, 25–66 ay gündüz bakımevi); eski kaynaklar yanlış oda tipi önerebilir.'],
      variants: [{ key: 'kres20', label: 'Kreş (20 çocuk)', entries: KRES.entries, relations: KRES.relations }] },
    { key: 'otel', label: 'Otel', circ: [0.2, 0.3], circNote: 'Otel için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['4★ otelde oda banyo dahil ≥ 20 m², 5★’ta ≥ 25 m² (TTNY, RG 22.12.2024).', 'Misafir ve servis akışı ayrılmalı: servis asansörü, kat ofisi, çamaşırhane ve mutfak lobiden geçmemeli.'],
      variants: [{ key: 'otel10', label: 'Butik otel (10 oda)', entries: OTEL.entries, relations: OTEL.relations }] },
    { key: 'saglik', label: 'Sağlık (ASM / Poliklinik)', circ: [0.2, 0.3], circNote: 'Sağlık yapıları için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['İki rejimi karıştırmayın: ASM (AHUY) muayene odası ≥ 10 m²; özel poliklinik/muayenehane (ATTY) ≥ 16 m².', 'Muayene odası bekleme alanından görsel ve işitsel mahremiyeti korumalı.'],
      variants: [
        { key: 'asm', label: 'Aile Sağlığı Merkezi (2 hekim)', entries: ASM.entries, relations: ASM.relations },
        { key: 'poli', label: 'Poliklinik (3 muayene odası)', entries: POLI.entries, relations: POLI.relations },
      ] },
    { key: 'kutuphane', label: 'Kütüphane', circ: [0.15, 0.25], circNote: 'Kütüphane için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['Okuyucu koltuğu 2,3–3,7 m² (ort. 2,8 m²); raf yoğunluğu ≈ 108 cilt/m² (Dahlgren 2009).', 'Etkinlik salonu ve çocuk bölümü sessiz okumaya bitişik olmamalı.'],
      variants: [{ key: 'halk40', label: 'Halk kütüphanesi (40 koltuk)', entries: KUTUP.entries, relations: KUTUP.relations }] },
    { key: 'restoran', label: 'Restoran / Kafe', circ: [0.1, 0.2], circNote: 'Restoranda salon ≈ %60, mutfak + hazırlık + depo ≈ %40 (sektör kaba kuralı; orta güvenilirlik).',
      notes: ['“Başlık sayısı = m²” gibi formüller 100 m² altındaki salonlarda yanıltıcıdır.', 'Mal kabul ve çöp çıkışı müşteri akışıyla kesişmemeli.'],
      variants: [{ key: 'rest60', label: 'Restoran (60 kişi)', entries: RESTORAN.entries, relations: RESTORAN.relations }] },
    { key: 'muze', label: 'Küçük Müze / Sergi', circ: [0.25, 0.35], circNote: 'Kamusal tip müzede net ≈ brütün %70’i (%30 tare); atölye/depo tipinde %20 (WBDG örneği).',
      notes: ['Dört zon: kamusal–koleksiyonsuz, kamusal–koleksiyonlu, kamusal olmayan–koleksiyonlu (depo), kamusal olmayan–koleksiyonsuz (ofis).', 'Yükleme → kasa açma → depo → sergi için geniş ve düz bir servis rotası kurulmalı.'],
      variants: [{ key: 'muze', label: 'Küçük müze', entries: MUZE.entries, relations: MUZE.relations }] },
    { key: 'atolye', label: 'Atölye / Stüdyo', circ: [0.1, 0.2], circNote: 'Atölye için resmî sirkülasyon oranı yok; sentez değer.',
      notes: ['Özel kurumda öğrenci başına 1,5 m² (ÖÖK), kamu okulunda 1,85 m² (MEB15).'],
      variants: [{ key: 'atolye15', label: 'Atölye (15 öğrenci)', entries: ATOLYE.entries, relations: ATOLYE.relations }] },
    { key: 'genel', label: 'Diğer / Serbest', circ: [0.1, 0.2], circNote: 'Genel varsayım (kalibre edilmeli).', notes: ['Bu tip için hazır program yok; mekanlarınızı kendiniz ekleyin.'],
      variants: [{ key: 'serbest', label: 'Serbest program', entries: GENEL.entries, relations: GENEL.relations }] },
  ];

  /* ----------- Literatür: mekân organizasyonu (Ching, yüklenen kitap) ----------- */
  const ORGS = [
    { key: 'merkezi', name: 'Merkezi organizasyon', text: 'Büyük, baskın bir merkezi mekânın çevresinde toplanan ikincil mekânlardan oluşur; merkez genellikle düzenli ve sabit biçimlidir.', bubble: 'En büyük balonu (ör. salon, çok amaçlı salon, lobi) ortaya koyun, diğerlerini çevresine yerleştirin.', use: 'Konutta salon, okulda çok amaçlı salon veya avlu, otelde lobi.' },
    { key: 'cizgisel', name: 'Çizgisel organizasyon', text: 'Mekânların bir sıra halinde dizilmesiyle oluşur; sıranın başı ve sonu girişe/dış mekâna bağlanır, tek tek mekânlar yan yana ya da bir sirkülasyon çizgisine bağlanabilir.', bubble: 'Balonları tek bir hat boyunca dizin; koridor/hol balonunu bu hattın omurgası yapın.', use: 'Derslik blokları, otel kat planları, poliklinik koridorları.' },
    { key: 'isinsal', name: 'Işınsal (radyal) organizasyon', text: 'Merkezi bir mekândan dışa doğru uzanan çizgisel kolların birleşimidir; merkezi ve çizgisel düzenlerin karışımıdır.', bubble: 'Merkez balonundan farklı yönlere uzanan kollar çizin; her kola bir işlev grubu verin.', use: 'Büyük hastane ve otel blokları, çok kanatlı okullar.' },
    { key: 'kumelenmis', name: 'Kümelenmiş organizasyon', text: 'Mekânlar yakınlık, ortak görsel özellik veya ortak ilişki temelinde gruplanır; boyut, biçim ve işlev bakımından farklı mekânlar bir arada olabilir.', bubble: 'Güçlü ilişkili balonları kümeler halinde toplayın (ıslak hacim kümesi, yatak kümesi, servis kümesi).', use: 'Konutta gün/gece bölgeleri, müzede kamusal/koleksiyon zonları.' },
    { key: 'izgara', name: 'Izgara organizasyon', text: 'Mekânlar düzenli bir yapısal ızgara veya modül içinde düzenlenir; ızgara tekrar eden, esnek ve genişletilebilir bir düzen sağlar.', bubble: 'Balon boyutlarını ortak bir modüle yaklaştırın ve hizalayarak yerleştirin.', use: 'Ofis katları, atölye ve stüdyo blokları.' },
  ];
  const SPATIAL = [
    { name: 'Mekân içinde mekân', text: 'Büyük bir mekânın içinde daha küçük bir mekân yer alır (ör. salon içinde yemek köşesi, galeri içinde kapalı bir oda). Balon diyagramında küçük balon büyük balonun içine alınır.' },
    { name: 'Kenetlenen (iç içe geçen) mekânlar', text: 'İki mekânın alanları kısmen örtüşür ve ortak bölge her iki mekâna hizmet eder (ör. açık planlı salon–mutfak).' },
    { name: 'Bitişik mekânlar', text: 'En yaygın ilişkidir; iki mekân ortak bir sınır paylaşır. Sınırın nasıl kurulacağı (kapı, açıklık, sürekli duvar) iki mekânın ilişkisinin gücünü belirler.' },
    { name: 'Ortak bir mekânla bağlanan mekânlar', text: 'Birbirinden uzak iki mekân, aralarındaki üçüncü bir mekânla bağlanır (ör. antre/hol/koridor). Ara mekân sirkülasyon balonu olarak çizilir.' },
  ];
  const CIRC_PATHS = [
    { name: 'Mekânların yanından geçen yol', text: 'Mekânların bütünlüğünü korur, serbest bir dolaşım sağlar; yola açılan bağlantı mekânın girişine bağlıdır.' },
    { name: 'Mekânların içinden geçen yol', text: 'Yol mekânı keser; mekânın kullanım alanı azalır, ancak mekânlar arası bağlantı doğrudandır. Küçük konutlarda salonun dolaşım yolu olması bu türdendir.' },
    { name: 'Mekânda sonlanan yol', text: 'Yol bir mekâna varır ve orada biter; mekânın önemini vurgular (ör. antre → salon).' },
  ];

  const METHOD = [
    'Program listesi: bina tipine göre zorunlu mekânları ve kullanıcı sayısını belirleyin (öğrenci, hekim, koltuk, yatak).',
    'Alan ataması: her mekâna asgari (mevzuat), tipik ve ideal alan verin; kişi başı kuralları uygulayın.',
    'İlişki matrisi: her mekân çifti için güçlü, zayıf, ilişkisiz veya ayrı tutulacak olarak işaretleyin (White matris yöntemi).',
    'Balon diyagramı: balon alanını m² ile orantılı çizin; güçlü ilişkileri kalın, zayıfları ince çizgiyle gösterin.',
    'Zonlama: kamusal / yarı özel / özel, ıslak / kuru, gürültülü / sessiz, misafir / servis katmanlarına göre kümeleyin.',
    'Sirkülasyon ve brüt hesap: net toplam alanı bina tipine uygun sirkülasyon payıyla artırın.',
    'Kontrol: asgari alan ihlali, ayrı tutulması gerekenlerin bitişikliği ve verimlilik skorunu değerlendirin.',
  ];
  const MISTAKES = [
    'Balon boyutlarını alanla orantısız çizmek (küçük WC’yi salon kadar göstermek).',
    'Sirkülasyonu (antre, hol, koridor, merdiven) hiç çizmemek; brüt alan sonradan tutmaz.',
    'Matristeki bütün ilişkileri çizip diyagramı okunmaz hale getirmek; önce güçlü ve ayrı tutulacak ilişkileri öne çıkarın.',
    'Ayrı tutulacak ilişkileri hiç kodlamamak (ıslak hacim–yatak odası, gürültülü–sessiz, mal kabul–müşteri girişi).',
    'Tek giriş yönünü, servis girişini ve çöp/mal kabul akışını unutmak.',
    'Balon diyagramını kesin çözüm sanmak; statik bir araçtır ve çok işlevli mekânları iyi temsil etmez.',
  ];

  App.KB = { SOURCES: SOURCES, TYPES: TYPES, ORGS: ORGS, SPATIAL: SPATIAL, CIRC_PATHS: CIRC_PATHS, METHOD: METHOD, MISTAKES: MISTAKES };

  App.kb = {
    type: (key) => TYPES.find((t) => t.key === key) || TYPES[0],
    variant: (typeKey, variantKey) => {
      const t = TYPES.find((x) => x.key === typeKey) || TYPES[0];
      return t.variants.find((v) => v.key === variantKey) || t.variants[0];
    },
  };
})();

/* ==========================================================================
   12-data-palettes.js — hazır renk paletleri (colorpalettes.net) · ortak veri
   Her palet 5 renktir: [numara, [hex ×5]]. Kaynak: https://colorpalettes.net/color-palette-<numara>/
   Palet kimliği 'cp<numara>' (örn. 'cp4816'). JSON'a (extensions.colorPalette) kimlik + hex birlikte yazılır;
   böylece dosya bu listeden bağımsız olarak da açılır. Tailwind'e taşırken: theme.extend.colors.palette = App.palettes.byId
   ========================================================================== */
(function () {
  const App = window.App;

  const RAW = [
    [4816, ['#2E3604', '#4E5E07', '#E19D29', '#D8D2CF', '#8D8179']],
    [4815, ['#223125', '#729969', '#A1C0C2', '#E6E7EB', '#F6F6F6']],
    [4814, ['#0B161E', '#51625C', '#A6B9BE', '#D8D2C6', '#4F6734']],
    [4813, ['#2D3939', '#5B6972', '#CFD8DF', '#9DADA3', '#273E20']],
    [4811, ['#624621', '#9F6D2D', '#F8DAB2', '#EEEBE4', '#D2D2D2']],
    [4810, ['#2B3034', '#627C8C', '#989398', '#B9C7D2', '#E93C35']],
    [4809, ['#738488', '#A6B6BA', '#D0D8DA', '#E1DDD7', '#EFECE7']],
    [4808, ['#353C52', '#554A53', '#726364', '#9A686B', '#BA897A']],
    [4807, ['#D1ECE7', '#FEE16C', '#BD7F01', '#A23D01', '#22352C']],
    [4806, ['#E0E5E8', '#DD8607', '#C25006', '#943A02', '#401600']],
    [4805, ['#102020', '#2D4C4F', '#78B4B7', '#D9E9E9', '#83241E']],
    [4804, ['#6F5B42', '#B5A892', '#D2D2D1', '#BEBBB4', '#15160A']],
    [4803, ['#020608', '#1C252B', '#486B85', '#93B4BC', '#CAD2CB']],
    [4802, ['#010A13', '#497683', '#8AB0A5', '#F5E9D4', '#82797A']],
    [4801, ['#031725', '#022E5B', '#499BED', '#A1C6F6', '#DAEAFF']],
    [4800, ['#232E20', '#D2A16E', '#B55E28', '#4F4B40', '#3F2512']],
    [4798, ['#E8E8E8', '#C1C6C9', '#AC2724', '#583E24', '#3E4524']],
    [4797, ['#D1D2D4', '#909483', '#616657', '#C19386', '#B25C40']],
    [4796, ['#FAFAFA', '#D0D2CF', '#575C55', '#86612F', '#52311B']],
    [4794, ['#E3DBD2', '#7F888D', '#324E59', '#011F28', '#000201']],
    [4793, ['#5D6474', '#A7A6B0', '#ECEDE6', '#8CA9BD', '#6498AF']],
    [4792, ['#0B4E65', '#3F7F9E', '#E2C9CA', '#D8A996', '#B47C50']],
    [4791, ['#120223', '#430357', '#6E022F', '#8C0286', '#C40361']],
    [4790, ['#CDB08E', '#BFB6A6', '#AAAAA4', '#4A4944', '#11100B']],
    [4789, ['#8A889E', '#EDD600', '#956B00', '#1A4208', '#051107']],
    [4788, ['#FDFEE8', '#90B1E6', '#4C6794', '#234485', '#000000']],
    [4787, ['#E8EDF0', '#E1E4E3', '#8FA8AE', '#425363', '#A90101']],
    [4783, ['#F7E1D3', '#AFA0A0', '#576071', '#AC6646', '#151A1E']],
    [4780, ['#C3DECE', '#91C2A6', '#165225', '#B62D4F', '#6A1823']],
    [4779, ['#E26858', '#A9A8AD', '#8B4252', '#56334B', '#272C49']],
    [4778, ['#363233', '#613708', '#895C20', '#A38976', '#CABCAC']],
    [4776, ['#54332B', '#943636', '#B26B2F', '#CEA05A', '#5F5949']],
    [4774, ['#242423', '#854D34', '#BB794C', '#DEB308', '#A59257']],
    [4773, ['#191A1E', '#61353B', '#82625A', '#85858F', '#E88538']],
    [4751, ['#4B3831', '#CA4213', '#F98C45', '#CBCBCB', '#C5E4E7']],
    [4750, ['#372E19', '#3F4321', '#93631F', '#F4C579', '#B4B4B4']],
    [4748, ['#5E0208', '#AE3433', '#C9983C', '#888C94', '#D7CCBD']],
    [4746, ['#183716', '#D52217', '#DB5559', '#F3B9CF', '#F2BD03']],
    [4742, ['#120F0A', '#3B200B', '#D76F02', '#FAA718', '#FCCF46']]
  ];

  const list = RAW.map(function (r) {
    return { id: 'cp' + r[0], n: r[0], name: 'Palet #' + r[0], url: 'https://colorpalettes.net/color-palette-' + r[0] + '/', colors: r[1].slice() };
  });
  const byId = {};
  list.forEach(function (p) { byId[p.id] = p; });

  const HEX = /^#[0-9a-f]{6}$/i;
  const rgb = function (hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  // WCAG göreli parlaklık
  const lum = function (hex) {
    const c = rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = function (a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  App.palettes = {
    source: 'colorpalettes.net',
    list: list,
    byId: byId,
    get: function (id) { return byId[id] || null; },
    isHex: function (v) { return typeof v === 'string' && HEX.test(v); },
    contrast: contrast,
    // zemin renginin üstünde okunaklı yazı rengi: iki aday arasından kontrastı yüksek olan
    textOn: function (fill, dark, light) { return contrast(fill, dark) >= contrast(fill, light) ? dark : light; },
  };
})();

/* ==========================================================================
   13-lib-colortheme.js — "Beni renklendir!": paletten arayüz renkleri üretir
   Monokrom glass tema aynen kalır (düğmelerin şekli ve yeri değişmez); yalnızca CSS renk değişkenleri,
   pafta renkleri (App.PAL) ve bölge dolguları (App.ZONES) seçilen 5 renkli palete göre yeniden hesaplanır.
   Bu dosya veri / DOM'dan bağımsız hesap yapar (derive); DOM'a yalnızca sync() dokunur.
   - Kullanıcı tercihi: state.ui.color = { on: boolean, p: 'cp4816' }  (localStorage: archtools.color)
   - CSP uyumu: renkler <html> üzerine CSSOM ile (style.setProperty) yazılır; <style> öğesi ya da satır içi
     stil özniteliği gerekmez.
   - Okunabilirlik: yazı renkleri ≥ 4.5:1, vurgu dolgusu ve halkalar zemine karşı ≥ 3:1 olacak şekilde ayarlanır.
   ========================================================================== */
(function () {
  const App = window.App;
  const PL = App.palettes;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const parse = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgba = (hex, a) => { const c = parse(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  const mix = (a, b, t) => { const x = parse(a), y = parse(b); return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t)); };

  function rgb2hsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(hh * 60 + 360) % 360, s, l];
  }
  function hsl(h, s, l) {
    s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const k = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex(k.map((v) => (v + m) * 255));
  }

  const ratio = PL.contrast;
  // koyulaştır / açıklaştır: zemine karşı en az `min` kontrast sağlanana kadar
  function ensure(hex, bg, min, toLight) {
    let h = hex, n = 0;
    while (ratio(h, bg) < min && n < 24) { h = mix(h, toLight ? '#FFFFFF' : '#000000', 0.1); n++; }
    return { hex: h, steps: n };
  }
  // okunaklı yazı: aday renklerden kontrastı yüksek olan; yetersizse siyah / beyaz
  function readable(fill, a, b) {
    let t = ratio(fill, a) >= ratio(fill, b) ? a : b;
    if (ratio(fill, t) < 4.5) t = ratio(fill, '#000000') >= ratio(fill, '#FFFFFF') ? '#000000' : '#FFFFFF';
    return t;
  }

  /* ---------- palet → renk sistemi (saf işlev) ---------- */
  function derive(colors) {
    const info = colors.map((hex) => {
      const c = rgb2hsl(parse(hex));
      return { hex: hex.toUpperCase(), h: c[0], s: c[1], l: c[2], v: c[1] * (1 - Math.abs(2 * c[2] - 1)), lum: ratio(hex, '#000000') };
    });
    const byLum = info.slice().sort((a, b) => b.lum - a.lum);
    const lightest = byLum[0], deepest = byLum[byLum.length - 1];
    const vivid = info.slice().sort((a, b) => b.v - a.v)[0];
    const gray = vivid.v < 0.07;
    // yüzey tonu: açık pastel ton varsa o, yoksa en canlı renk
    const src = gray ? null : lightest.s >= 0.22 && lightest.l >= 0.7 ? lightest : vivid;
    const H = src ? src.h : 222;
    const sb = src ? clamp(src.s, 0.1, 0.6) * 0.5 : 0.06;
    const Hi = gray ? 222 : deepest.h;
    const si = gray ? 0.06 : clamp(deepest.s * 0.5, 0.04, 0.3);

    const mk = (dark) => {
      const bg = dark ? hsl(H, sb * 0.7, 0.075) : hsl(H, sb, 0.895);
      const bg2 = dark ? hsl(H, sb * 0.6, 0.125) : hsl(H, sb * 0.75, 0.968);
      const bg3 = dark ? hsl(H, sb * 0.7, 0.045) : hsl(H, Math.min(sb * 1.15, 0.4), 0.79);
      const hueInk = dark ? (gray ? 222 : lightest.h) : Hi;
      const sInk = dark ? (gray ? 0.06 : clamp(lightest.s, 0, 0.3) * 0.5) : si;
      const ink = dark ? hsl(hueInk, sInk, 0.95) : hsl(hueInk, sInk, 0.1);
      // ikincil / üçüncül yazı: zemine karşı 4.6 / 2.8 kontrast
      const ink2 = ensure(hsl(hueInk, sInk * 0.6, dark ? 0.7 : 0.4), bg, 4.6, dark).hex;
      const ink3 = ensure(hsl(hueInk, sInk * 0.5, dark ? 0.48 : 0.58), bg, 2.8, dark).hex;
      const onInk = dark ? hsl(H, sb * 0.6, 0.08) : bg2;
      // vurgu rengi: palet renklerinden zemine karşı ≥ 3:1 olan en canlı olanı (yoksa en canlısı ayarlanır)
      const cand = info.map((c) => { const e = ensure(c.hex, bg, 3, dark); return { hex: e.hex, score: c.v + (e.steps === 0 ? 1 : 0) - e.steps * 0.02 }; });
      cand.sort((a, b) => b.score - a.score);
      const accent = cand[0].hex;
      const onAccent = readable(accent, ink, onInk);
      const shadow = hsl(H, Math.min(sb * 1.2, 0.3), 0.22);
      const v = {
        '--bg': bg, '--bg-2': bg2, '--bg-3': bg3,
        '--ink': ink, '--ink-2': ink2, '--ink-3': ink3, '--on-ink': onInk,
        '--accent': accent, '--on-accent': onAccent,
        '--ring': rgba(accent, dark ? 0.5 : 0.4), '--ring-0': rgba(accent, 0),
        '--dial-pin': dark ? bg2 : bg,
      };
      if (dark) {
        Object.assign(v, {
          '--glass': rgba(hsl(H, sb * 0.5, 0.16), 0.9), '--glass-2': rgba(hsl(H, sb * 0.5, 0.23), 0.94), '--stroke': 'rgba(255,255,255,.09)',
          '--line': 'rgba(255,255,255,.09)', '--hi': 'rgba(255,255,255,.05)', '--lo': 'rgba(0,0,0,.55)', '--lo-soft': 'rgba(0,0,0,.4)', '--inset-bg': 'rgba(0,0,0,.22)',
          '--sheet-hi': 'rgba(255,255,255,.04)', '--sheet-lo': 'rgba(0,0,0,.6)', '--dot-ring': 'rgba(255,255,255,.42)',
        });
      } else {
        Object.assign(v, {
          '--glass': 'rgba(255,255,255,.55)', '--glass-2': 'rgba(255,255,255,.82)', '--stroke': 'rgba(255,255,255,.9)',
          '--line': rgba(ink, 0.09), '--hi': 'rgba(255,255,255,.95)', '--lo': rgba(shadow, 0.2), '--lo-soft': rgba(shadow, 0.13), '--inset-bg': rgba(ink, 0.035),
          '--sheet-hi': 'rgba(255,255,255,.9)', '--sheet-lo': rgba(shadow, 0.22), '--dot-ring': rgba(ink, 0.22),
        });
      }
      return { vars: v, bg: bg, bg2: bg2, ink: ink, accent: accent, onAccent: onAccent, shadow: shadow };
    };
    const L = mk(false), D = mk(true);

    // pafta levhası (açık kalır): çıktıda da aynı renkler kullanılır
    const sheet = hsl(H, sb * 0.55, 0.975);
    const pal = {
      ink: L.ink, paper: L.bg2, paperDark: L.vars['--bg-3'],
      outer: hsl(H, sb * 0.85, 0.915), sheet: sheet, sheetLive: rgba(sheet, 0.9), shade: rgba(L.shadow, 0.22),
    };

    // bölge dolguları: 5 palet rengi + en koyunun koyusu + en açığın açığı = 7 basamak; mono tema ile aynı açık-koyu sırası
    const asc = byLum.slice().reverse().map((c) => c.hex); // koyu → açık
    const ladder = [mix(asc[0], '#000000', 0.36)].concat(asc, [mix(asc[asc.length - 1], '#FFFFFF', 0.55)]);
    const ORDER = ['servis', 'ozel', 'teknik', 'calisma', 'acik', 'sosyal', 'sirkulasyon']; // koyu → açık
    const zones = {};
    ORDER.forEach((z, i) => { zones[z] = [ladder[i], readable(ladder[i], pal.ink, pal.sheet)]; });

    return { light: L.vars, dark: D.vars, pal: pal, zones: zones, accent: L.accent, swatches: info.slice(0, 3).map((c) => c.hex) };
  }

  /* ---------- uygulama (tek DOM temas noktası) ---------- */
  const cache = {};
  const root = () => document.documentElement;
  const SW = ['--sw1', '--sw2', '--sw3'];
  let applied = { key: '', on: false, p: null };
  let setNames = [];

  function scheme() {
    const t = root().getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function clearVars() { setNames.forEach((n) => root().style.removeProperty(n)); setNames = []; }

  // ui = { on, p }; durum değiştiyse true döner. Çizimden önce çağrılır (view başında) — tekrar çağrı ucuzdur.
  function sync(ui) {
    const pal = ui && ui.on ? PL.get(ui.p) : null;
    const sc = scheme();
    const key = pal ? pal.id + '|' + sc : '';
    if (key === applied.key) return false;
    clearVars();
    App.theme.reset();
    if (!pal) {
      root().removeAttribute('data-color');
      applied = { key: '', on: false, p: null };
      return true;
    }
    const d = cache[pal.id] || (cache[pal.id] = derive(pal.colors));
    const vars = Object.assign({}, sc === 'dark' ? d.dark : d.light);
    SW.forEach((n, i) => { vars[n] = d.swatches[i]; });
    Object.keys(vars).forEach((n) => { root().style.setProperty(n, vars[n]); setNames.push(n); });
    root().setAttribute('data-color', 'on');
    Object.assign(App.PAL, d.pal);
    Object.keys(d.zones).forEach((z) => { App.ZONES[z].fill = d.zones[z][0]; App.ZONES[z].text = d.zones[z][1]; });
    applied = { key: key, on: true, p: pal.id };
    return true;
  }

  // işletim sistemi açık / koyu geçişinde yeniden hesapla ve boya
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function () {
      if (!App.store) return;
      applied.key = applied.on ? '~' : applied.key;
      sync(App.store.get().ui.color);
      if (App.paintNow) App.paintNow();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  App.colortheme = {
    derive: derive,
    sync: sync,
    isOn: function () { return applied.on; },
    palette: function () { return applied.p; },
    // varsayılan palet: nötr, okunaklı bir başlangıç
    DEFAULT: 'cp4815',
  };
})();

/* ==========================================================================
   20-lib-geometry.js — pafta geometrisi, ölçek, daire yarıçapı, etiket sığdırma
   Dünya koordinatları: 1400 × 990 birim (A3 yatay oranı 1,414).
   ========================================================================== */
(function () {
  const App = window.App;
  const clamp = App.util.clamp;

  const W = 1400, H = 990, FRAME = 22, TB_H = 104;
  const geo = (App.geo = {
    W: W, H: H, FRAME: FRAME, TB_H: TB_H,
    MIN_R: 24, MAX_R: 230,
    // Balonların serbestçe gezebildiği çizim alanı
    area: { x0: FRAME + 14, y0: FRAME + 14, x1: W - FRAME - 14, y1: H - FRAME - TB_H - 14 },
    titleBlock: { x: FRAME, y: H - FRAME - TB_H, w: W - FRAME * 2, h: TB_H },
  });

  /* Sonsuz tuval: pafta (levha) sonsuz düzlemin ortasındaki bir sayfadır; daireler düzlemin her yerine bırakılabilir.
     Dünya sınırı yalnızca sayıların makul kalması içindir (±1 milyon birim ≈ 700 pafta eni; kayan nokta hassasiyeti bozulmasın);
     kullanıcı pratikte sınıra hiç takılmaz. Yakınlaştırma çarpanı paftanın görünür alana sığdığı ölçeğe göredir (1 = pafta sığar). */
  geo.WORLD = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };
  geo.ZOOM = { min: 0.02, max: 24 };
  geo.clampWorld = function (x, y, r) {
    const w = geo.WORLD, m = r || 0;
    return { x: clamp(x, w.x0 + m, w.x1 - m), y: clamp(y, w.y0 + m, w.y1 - m) };
  };
  geo.clampHit = (w) => clamp(w, 8, 90); // ilişki çizgisinin tıklama genişliği
  geo.inSheet = (x, y) => x >= geo.area.x0 && x <= geo.area.x1 && y >= geo.area.y0 && y <= geo.area.y1;
  // görünüm: null (pafta görünür alana sığdırılmış) ya da { cx, cy, k }; SVG viewBox'ı 47-ui-zoom.js (Z.viewBox) üretir
  geo.normView = function (v) {
    if (!v) return null;
    const k = clamp(Number(v.k) || 1, geo.ZOOM.min, geo.ZOOM.max);
    const w = geo.WORLD;
    const cx = clamp(Number(v.cx), w.x0, w.x1), cy = clamp(Number(v.cy), w.y0, w.y1);
    if (!isFinite(cx) || !isFinite(cy)) return null;
    if (Math.abs(k - 1) < 0.004 && Math.abs(cx - W / 2) < 0.6 && Math.abs(cy - H / 2) < 0.6) return null; // varsayılan görünüm
    return { cx: cx, cy: cy, k: k };
  };

  // Toplam balon alanı çizim alanının ~%20'sini kaplayacak şekilde ölçek (px / √m²)
  geo.scale = function (spaces) {
    const total = spaces.reduce((t, s) => t + (s.area > 0 ? s.area : 0), 0);
    if (!total) return 30;
    const a = geo.area;
    const cover = 0.2 * (a.x1 - a.x0) * (a.y1 - a.y0);
    return Math.sqrt(cover / (Math.PI * total));
  };
  geo.radius = function (area, k) {
    return clamp(k * Math.sqrt(Math.max(area, 0.1)), geo.MIN_R, geo.MAX_R);
  };
  geo.clampPos = function (x, y, r) {
    const a = geo.area;
    const lx = a.x0 + r, hx = a.x1 - r, ly = a.y0 + r, hy = a.y1 - r;
    return {
      x: lx > hx ? (a.x0 + a.x1) / 2 : clamp(x, lx, hx),
      y: ly > hy ? (a.y0 + a.y1) / 2 : clamp(y, ly, hy),
    };
  };

  // Etiket yerleşimi: ad satırlara bölünür, daireye sığacak yazı boyutu seçilir
  geo.label = function (name, r) {
    const outside = r < 36;
    const maxW = outside ? 150 : r * 1.72;
    let fs = outside ? 14 : clamp(r * 0.27, 11, 22);
    const T = App.theme.cur().label;
    const text = T.upper ? String(name || '').toLocaleUpperCase('tr') : String(name || '');
    const cw = T.cw; // tema yazı tipine göre ortalama karakter genişliği çarpanı
    function wrap(size) {
      const words = text.split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      const cap = Math.max(3, Math.floor(maxW / (size * cw)));
      words.forEach((w) => {
        const next = cur ? cur + ' ' + w : w;
        if (next.length <= cap || !cur) cur = next;
        else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      return { lines: lines, cap: cap };
    }
    let res = wrap(fs);
    const maxLines = outside ? 2 : r > 90 ? 3 : 2;
    while ((res.lines.length > maxLines || res.lines.some((l) => l.length > res.cap)) && fs > 9) {
      fs -= 1;
      res = wrap(fs);
    }
    let lines = res.lines.slice(0, maxLines);
    if (res.lines.length > maxLines || lines.some((l) => l.length > res.cap)) {
      lines = lines.map((l) => (l.length > res.cap ? l.slice(0, Math.max(1, res.cap - 1)) + '…' : l));
      if (res.lines.length > maxLines) lines[lines.length - 1] = lines[lines.length - 1].replace(/…?$/, '…');
    }
    return { lines: lines, fs: fs, outside: outside, ls: T.upper ? 0.5 : 0 };
  };
})();

/* ==========================================================================
   21-lib-score.js — verimlilik skoru (canlı)
   Güçlü ilişkili daireler birbirine yaklaştıkça skor artar; ayrı tutulması
   istenen daireler uzaklaştıkça artar; üst üste binen daireler skoru düşürür.
   Skor = 100 × Σ(ağırlık × memnuniyet) / Σ(ağırlık) × (1 − örtüşme cezası)
   Ağırlıklar: güçlü 3, ayrı tut 2, zayıf 1.
   ========================================================================== */
(function () {
  const App = window.App;
  const geo = App.geo;

  function evaluate(spaces, relations, k) {
    const by = new Map();
    spaces.forEach((s) => by.set(s.id, s));
    const rad = new Map();
    spaces.forEach((s) => rad.set(s.id, geo.radius(s.area, k)));

    const pairs = [];
    let sumW = 0, sumWS = 0;
    const counts = { strong: [0, 0], weak: [0, 0], avoid: [0, 0] };

    Object.keys(relations).forEach((key) => {
      const ids = key.split('|');
      const a = by.get(ids[0]), b = by.get(ids[1]);
      if (!a || !b) return;
      const type = relations[key];
      const ra = rad.get(a.id), rb = rad.get(b.id);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const gap = d - ra - rb;
      let s, w, ok;
      if (type === 'strong') {
        w = 3;
        const tol = 8 + 0.1 * Math.min(ra, rb);
        const L = 0.6 * (ra + rb) + 40;
        s = gap <= tol ? 1 : Math.exp(-(gap - tol) / L);
        ok = s >= 0.75;
      } else if (type === 'weak') {
        w = 1;
        const tol = 0.5 * (ra + rb);
        const L = 0.9 * (ra + rb) + 60;
        s = gap <= tol ? 1 : Math.exp(-(gap - tol) / L);
        ok = s >= 0.6;
      } else if (type === 'avoid') {
        w = 2;
        const need = 0.6 * (ra + rb) + 70;
        s = gap <= 0 ? 0 : Math.min(1, gap / need);
        ok = s >= 0.7;
      } else return;
      sumW += w;
      sumWS += w * s;
      counts[type][0]++;
      if (ok) counts[type][1]++;
      pairs.push({ key: key, a: a.id, b: b.id, type: type, gap: gap, s: s, ok: ok, w: w });
    });

    // Balonların üst üste binmesi (ilişkiden bağımsız)
    const overlaps = [];
    for (let i = 0; i < spaces.length; i++) {
      for (let j = i + 1; j < spaces.length; j++) {
        const a = spaces[i], b = spaces[j];
        const ra = rad.get(a.id), rb = rad.get(b.id);
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - ra - rb;
        if (gap < -0.3 * Math.min(ra, rb)) overlaps.push({ a: a.id, b: b.id, gap: gap });
      }
    }
    const penalty = Math.min(0.25, overlaps.length * 0.04);
    const percent = sumW === 0 ? null : Math.round(100 * (sumWS / sumW) * (1 - penalty));
    return { percent: percent, pairs: pairs, counts: counts, overlaps: overlaps, penalty: penalty, radii: rad };
  }

  App.score = { evaluate: evaluate };
})();

/* ==========================================================================
   22-lib-layout.js — otomatik yerleştirme (kuvvet tabanlı)
   Güçlü ilişki: çekme • Zayıf: yumuşak çekme • Ayrı tut: itme • Hepsi: çarpışma önleme
   Başlangıç konumu bağlantı derecesine göre merkezden spiral (deterministik).
   ========================================================================== */
(function () {
  const App = window.App;
  const geo = App.geo;

  function autoLayout(spaces, relations, k, opts) {
    opts = opts || {};
    const fixed = new Set(opts.fixed || []); // opts.fixed: yerinde kalan (paftanın dışına bırakılmış) daireler; yalnızca engel olarak sayılır
    const n = spaces.length;
    const out = {};
    if (!n) return out;
    const a = geo.area;
    const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;

    const deg = {};
    spaces.forEach((s) => (deg[s.id] = 0));
    Object.keys(relations).forEach((key) => {
      const t = relations[key];
      const ids = key.split('|');
      const w = t === 'strong' ? 3 : t === 'weak' ? 1 : 0.5;
      if (deg[ids[0]] != null) deg[ids[0]] += w;
      if (deg[ids[1]] != null) deg[ids[1]] += w;
    });

    const P = spaces
      .map((s) => ({ id: s.id, r: geo.radius(s.area, k), x: s.x, y: s.y, d: deg[s.id] || 0 }))
      .sort((p, q) => q.d + q.r * 0.01 - (p.d + p.r * 0.01));

    if (!opts.keep) {
      const golden = 2.399963;
      P.forEach((p, i) => {
        const rr = 36 * Math.sqrt(i + 0.5) * (k / 28) * 2.4;
        p.x = cx + Math.cos(i * golden) * rr * 1.45;
        p.y = cy + Math.sin(i * golden) * rr * 0.95;
      });
    }
    const idx = new Map();
    P.forEach((p, i) => idx.set(p.id, i));
    const rels = [];
    Object.keys(relations).forEach((key) => {
      const ids = key.split('|');
      if (idx.has(ids[0]) && idx.has(ids[1])) rels.push([idx.get(ids[0]), idx.get(ids[1]), relations[key]]);
    });
    const relMap = new Map();
    rels.forEach((r) => relMap.set(r[0] + '_' + r[1], r[2]));

    const ITER = opts.iter != null ? opts.iter : 520;
    for (let it = 0; it < ITER; it++) {
      const alpha = 1 - it / ITER;
      const step = 0.25 + 0.75 * alpha;
      const dx = new Array(n).fill(0), dy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const A = P[i], B = P[j];
          let vx = B.x - A.x, vy = B.y - A.y;
          let d = Math.hypot(vx, vy);
          if (d < 0.01) { vx = Math.cos(i * 7 + j); vy = Math.sin(i * 5 + j); d = 1; }
          const ux = vx / d, uy = vy / d;
          const rr = A.r + B.r;
          const type = relMap.get(i + '_' + j) || relMap.get(j + '_' + i);
          let f = 0; // + çekme, − itme
          if (d < rr + 10) f -= (rr + 10 - d) * 0.55; // çarpışma
          if (type === 'strong') { const target = rr + 3; if (d > target) f += (d - target) * 0.09; }
          else if (type === 'weak') { const target = rr * 1.3 + 16; f += (d - target) * 0.025; }
          else if (type === 'avoid') { const need = rr + 0.6 * rr + 80; if (d < need) f -= (need - d) * 0.06; }
          const ma = B.r / (A.r + B.r), mb = A.r / (A.r + B.r);
          dx[i] += ux * f * ma * 2; dy[i] += uy * f * ma * 2;
          dx[j] -= ux * f * mb * 2; dy[j] -= uy * f * mb * 2;
        }
      }
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (fixed.has(p.id)) continue;
        dx[i] += (cx - p.x) * 0.006; dy[i] += (cy - p.y) * 0.006;
        p.x += dx[i] * step; p.y += dy[i] * step;
        const c = geo.clampPos(p.x, p.y, p.r);
        p.x = c.x; p.y = c.y;
      }
    }
    // dizilimi çizim alanının ortasına al
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const mv = P.filter((p) => !fixed.has(p.id));
    mv.forEach((p) => { minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r); minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r); });
    const sx = cx - (minX + maxX) / 2, sy = cy - (minY + maxY) / 2;
    mv.forEach((p) => {
      const c = geo.clampPos(p.x + sx, p.y + sy, p.r);
      out[p.id] = { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 };
    });
    return out;
  }

  // Boş bir noktaya yeni balon yerleştir (mevcutlarla çakışmayan en yakın nokta)
  // center (isteğe bağlı): aramanın başladığı nokta — kullanıcı tuvalde paftanın dışına kaydırdıysa yeni daire baktığı yere gelir
  function freeSpot(spaces, area, k, center) {
    const a = geo.area;
    const r = geo.radius(area, k);
    const cx = center ? center.x : (a.x0 + a.x1) / 2, cy = center ? center.y : (a.y0 + a.y1) / 2;
    const clampTo = geo.inSheet(cx, cy) ? geo.clampPos : geo.clampWorld; // pafta içinde başladıysa pafta sınırı, dışındaysa tuval sınırı
    let best = { x: cx, y: cy }, bestScore = -Infinity;
    for (let i = 0; i < 260; i++) {
      const ang = i * 2.399963;
      const rr = 14 * Math.sqrt(i) * 2.2;
      const p = clampTo(cx + Math.cos(ang) * rr * 1.4, cy + Math.sin(ang) * rr, r);
      let minGap = Infinity;
      spaces.forEach((s) => {
        const g = Math.hypot(s.x - p.x, s.y - p.y) - geo.radius(s.area, k) - r;
        if (g < minGap) minGap = g;
      });
      if (minGap >= 6) return p;
      if (minGap > bestScore) { bestScore = minGap; best = p; }
    }
    return best;
  }

  App.layout = { auto: autoLayout, freeSpot: freeSpot };
})();

/* ==========================================================================
   23-lib-match.js — kullanıcının yazdığı mekân adlarını bilgi tabanındaki
   mekânlara eşleştirir (Türkçe karakter ve ek farklarına toleranslı).
   ========================================================================== */
(function () {
  const App = window.App;
  const N = App.util.norm;

  function entryKeywords(e) {
    return e.kw.concat([e.name]).map(N).filter(Boolean);
  }

  function scoreName(nm, e) {
    let best = 0;
    entryKeywords(e).forEach((kk) => {
      if (nm === kk) best = Math.max(best, 100 + kk.length);
      else if (nm.includes(kk)) {
        // kısa anahtarlar (wc, lab) yalnızca tam sözcük olarak sayılır
        const words = nm.split(' ');
        const isWord = words.includes(kk) || kk.includes(' ');
        if (kk.length >= 4 || isWord) best = Math.max(best, kk.length + (isWord ? 2 : 0));
      } else if (kk.includes(nm) && nm.length >= 4) best = Math.max(best, nm.length * 0.5);
    });
    return best;
  }

  function matchSpaces(spaces, entries) {
    const cand = [];
    spaces.forEach((s) => {
      const nm = N(s.name);
      entries.forEach((e) => {
        const sc = scoreName(nm, e);
        if (sc > 0) cand.push({ s: s, e: e, score: sc });
      });
    });
    cand.sort((a, b) => b.score - a.score);
    const bySpace = new Map(), byEntry = new Map();
    cand.forEach((c) => {
      if (bySpace.has(c.s.id) || byEntry.has(c.e.key)) return;
      bySpace.set(c.s.id, c.e);
      byEntry.set(c.e.key, c.s);
    });
    return { bySpace: bySpace, byEntry: byEntry, missing: entries.filter((e) => !byEntry.has(e.key)) };
  }

  function zoneFor(name, typeKey, variantKey) {
    const nm = N(name);
    const v = App.kb.variant(typeKey, variantKey);
    let best = null, bs = 0;
    v.entries.forEach((e) => {
      const sc = scoreName(nm, e);
      if (sc > bs) { bs = sc; best = e; }
    });
    if (best && bs >= 4) return best.zone;
    for (let i = 0; i < App.ZONE_HINTS.length; i++) {
      const z = App.ZONE_HINTS[i];
      for (let j = 0; j < z[1].length; j++) if (nm.includes(z[1][j])) return z[0];
    }
    return 'sosyal';
  }

  // Sorguda geçen mekânı bul: önce geçerli bina tipinde, sonra tüm tiplerde
  function findEntryInText(text, typeKey, variantKey) {
    const nq = N(text);
    const words = nq.split(' ');
    const pools = [];
    const cur = App.kb.variant(typeKey, variantKey);
    pools.push({ type: App.kb.type(typeKey), variant: cur });
    App.KB.TYPES.forEach((t) => t.variants.forEach((v) => { if (v !== cur) pools.push({ type: t, variant: v }); }));
    let best = null, bs = 0;
    pools.forEach((p, idx) => {
      p.variant.entries.forEach((e) => {
        entryKeywords(e).forEach((kk) => {
          const ok = kk.includes(' ') ? nq.includes(kk) : words.includes(kk) || (kk.length >= 4 && nq.includes(kk));
          if (!ok) return;
          const sc = kk.length + (idx === 0 ? 8 : 0) + (kk.includes(' ') ? 3 : 0);
          if (sc > bs) { bs = sc; best = { entry: e, type: p.type, variant: p.variant }; }
        });
      });
    });
    return best;
  }

  App.match = { spaces: matchSpaces, zoneFor: zoneFor, findEntryInText: findEntryInText };
})();

/* ==========================================================================
   24-lib-analyze.js — projeyi bilgi tabanına göre otomatik analiz eder
   Çıktı: öneri kartları {id, level: hata|uyari|oneri|ok, title, detail, src, actions[]}
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;
  const fmt = U.fmt;

  const LEVEL_ORDER = { hata: 0, uyari: 1, oneri: 2, ok: 3 };

  function defaultArea(e) { return U.round5(U.mid(e.typ)); }

  function circulationShare(spaces) {
    const total = U.sum(spaces, (s) => s.area);
    const circ = U.sum(spaces.filter((s) => s.zone === 'sirkulasyon'), (s) => s.area);
    return { total: total, circ: circ, share: total ? circ / total : 0 };
  }

  function analyze(project, k, score) {
    const items = [];
    const spaces = project.spaces;
    const meta = project.meta;
    const type = App.kb.type(meta.buildingType);
    const variant = App.kb.variant(meta.buildingType, meta.variant);
    const nameOf = new Map(spaces.map((s) => [s.id, s.name]));

    if (!spaces.length) {
      items.push({ id: 'empty', level: 'oneri', title: 'Projeye ilk mekânı ekleyin', detail: 'Soldaki formdan mekân adı ve m² girin ya da bir bina şablonu yükleyin. Asistan eksik mekânları ve alan sapmalarını burada listeler.', src: [], actions: [{ type: 'focusForm', label: 'Mekân ekle' }] });
      return { items: items, counts: { hata: 0, uyari: 0, oneri: 1 }, circ: circulationShare(spaces) };
    }

    const m = App.match.spaces(spaces, variant.entries);
    const circ = circulationShare(spaces);

    // 1) Eksik mekânlar
    const missReq = m.missing.filter((e) => e.req);
    if (missReq.length && meta.buildingType !== 'genel') {
      items.push({
        id: 'missing', level: 'uyari',
        title: missReq.length + ' gerekli mekân eksik görünüyor',
        detail: missReq.map((e) => e.name).join(', ') + '. (' + type.label + ' · ' + variant.label + ' programına göre)',
        src: [], actions: addActions(missReq),
      });
    }
    const missOpt = m.missing.filter((e) => !e.req);
    if (missOpt.length && meta.buildingType !== 'genel') {
      items.push({
        id: 'missing-opt', level: 'oneri',
        title: 'Sık unutulan / isteğe bağlı mekânlar',
        detail: missOpt.slice(0, 6).map((e) => e.name).join(', ') + '.',
        src: [], actions: addActions(missOpt.slice(0, 5)),
      });
    }

    // 2) Alan kontrolleri
    spaces.forEach((s) => {
      const e = m.bySpace.get(s.id);
      if (!e) return;
      if (e.min != null && s.area < e.min - 0.001) {
        items.push({
          id: 'area-min-' + s.id, level: 'hata',
          title: s.name + ': ' + fmt(s.area) + ' m² asgari alanın altında',
          detail: 'Asgari ' + fmt(e.min) + ' m². ' + e.note,
          src: [e.src], actions: [{ type: 'setArea', id: s.id, area: e.min, label: 'Asgariye çıkar (' + fmt(e.min) + ' m²)' }, { type: 'select', id: s.id, label: 'Seç' }],
        });
      } else if (s.area < e.typ[0] - 0.001) {
        items.push({
          id: 'area-low-' + s.id, level: 'uyari',
          title: s.name + ': tipik aralığın altında (' + fmt(s.area) + ' m²)',
          detail: 'Tipik ' + fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m², ideal ' + fmt(e.ideal[0]) + '–' + fmt(e.ideal[1]) + ' m². ' + e.note,
          src: [e.src], actions: [{ type: 'setArea', id: s.id, area: e.typ[0], label: 'Tipiğe çıkar (' + fmt(e.typ[0]) + ' m²)' }, { type: 'select', id: s.id, label: 'Seç' }],
        });
      } else if (s.area > Math.max(e.typ[1] * 1.8, e.ideal[1] * 1.6)) {
        items.push({
          id: 'area-high-' + s.id, level: 'oneri',
          title: s.name + ': tipik aralığın çok üzerinde (' + fmt(s.area) + ' m²)',
          detail: 'Tipik ' + fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m². Alan dengesini ve verimliliği kontrol edin.',
          src: [e.src], actions: [{ type: 'setArea', id: s.id, area: e.typ[1], label: 'Tipik üst sınıra çek (' + fmt(e.typ[1]) + ' m²)' }, { type: 'select', id: s.id, label: 'Seç' }],
        });
      }
    });

    // 3) Sirkülasyon
    const band = type.circ;
    const nonCirc = circ.total - circ.circ;
    const needArea = Math.max(2, U.round5((nonCirc * U.mid(band)) / (1 - U.mid(band))));
    if (circ.circ === 0 && spaces.length >= 3) {
      items.push({
        id: 'circ-none', level: 'uyari', title: 'Sirkülasyon (antre / hol / koridor) çizilmemiş',
        detail: type.circNote + ' Şu anki mekânlara göre yaklaşık ' + fmt(needArea) + ' m² sirkülasyon alanı eklenmeli.',
        src: ['S'], actions: [{ type: 'addSpaces', list: [{ name: 'Koridor / Sirkülasyon', area: needArea, zone: 'sirkulasyon' }], label: 'Sirkülasyon ekle (' + fmt(needArea) + ' m²)' }],
      });
    } else if (circ.circ > 0 && circ.share < band[0] * 0.7) {
      items.push({
        id: 'circ-low', level: 'uyari', title: 'Sirkülasyon payı düşük: %' + fmt(circ.share * 100, 0),
        detail: 'Önerilen aralık %' + fmt(band[0] * 100, 0) + '–' + fmt(band[1] * 100, 0) + '. ' + type.circNote, src: ['S'], actions: [],
      });
    } else if (circ.share > band[1] * 1.5) {
      items.push({
        id: 'circ-high', level: 'oneri', title: 'Sirkülasyon payı yüksek: %' + fmt(circ.share * 100, 0),
        detail: 'Önerilen aralık %' + fmt(band[0] * 100, 0) + '–' + fmt(band[1] * 100, 0) + '. Koridorları kısaltmayı veya mekânları doğrudan bağlamayı düşünün.', src: ['S'], actions: [],
      });
    }

    // 4) Skor kaynaklı uyarılar
    if (score) {
      score.pairs.filter((p) => p.type === 'strong' && !p.ok).sort((a, b) => a.s - b.s).slice(0, 3).forEach((p) => {
        items.push({
          id: 'far-' + p.key, level: 'uyari',
          title: nameOf.get(p.a) + ' ↔ ' + nameOf.get(p.b) + ': güçlü ilişkili ama uzak',
          detail: 'İki dairenin arası ' + fmt(Math.max(0, p.gap), 0) + ' birim açık. Daireleri yaklaştırın veya Otomatik yerleştir’i kullanın.',
          src: ['White'], actions: [{ type: 'locate', a: p.a, b: p.b, label: 'Göster' }, { type: 'autolayout', label: 'Otomatik yerleştir' }],
        });
      });
      score.pairs.filter((p) => p.type === 'avoid' && !p.ok).slice(0, 3).forEach((p) => {
        items.push({
          id: 'avoid-' + p.key, level: 'uyari',
          title: nameOf.get(p.a) + ' ile ' + nameOf.get(p.b) + ' ayrı tutulmalı ama yakın',
          detail: 'Bu çift “ayrı tut” olarak işaretli (gürültü, koku, mahremiyet veya hijyen).',
          src: ['White'], actions: [{ type: 'locate', a: p.a, b: p.b, label: 'Göster' }],
        });
      });
      if (score.overlaps.length) {
        items.push({
          id: 'overlap', level: 'uyari', title: score.overlaps.length + ' daire çiftinin üst üste bindiği görülüyor',
          detail: 'Üst üste binen daireler okunurluğu ve skoru düşürür.', src: [], actions: [{ type: 'autolayout', label: 'Otomatik yerleştir' }],
        });
      }
      // gürültülü ↔ sessiz yakınlığı (ilişki tanımlı değilse)
      const quiet = [];
      score && spaces.forEach((a, i) => {
        const ea = m.bySpace.get(a.id);
        if (!ea || ea.noise === 'mid') return;
        for (let j = i + 1; j < spaces.length; j++) {
          const b = spaces[j];
          const eb = m.bySpace.get(b.id);
          if (!eb || eb.noise === 'mid' || ea.noise === eb.noise) continue;
          const rel = project.relations[U.pairKey(a.id, b.id)];
          if (rel === 'strong') continue;
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - score.radii.get(a.id) - score.radii.get(b.id);
          if (gap < 0.25 * (score.radii.get(a.id) + score.radii.get(b.id))) quiet.push([a, b, ea.noise === 'loud']);
        }
      });
      quiet.slice(0, 3).forEach((q) => {
        const loud = q[2] ? q[0] : q[1], calm = q[2] ? q[1] : q[0];
        items.push({
          id: 'noise-' + loud.id + calm.id, level: 'uyari',
          title: 'Gürültülü “' + loud.name + '” sessiz “' + calm.name + '” yanına çizilmiş',
          detail: 'Gürültülü ve sessiz mekânlar arasında tampon mekân (koridor, depo) bırakın veya ilişkiyi “ayrı tut” yapın.',
          src: ['MEB15', 'S'], actions: [{ type: 'locate', a: loud.id, b: calm.id, label: 'Göster' }],
        });
      });
    }

    // 5) İlişkisi olmayan mekânlar
    const relCount = Object.keys(project.relations).length;
    if (spaces.length >= 2 && relCount === 0) {
      items.push({ id: 'norel', level: 'oneri', title: 'Henüz hiç ilişki tanımlanmadı', detail: 'Skor, ilişkilere göre hesaplanır. İlişki Matrisi sekmesinden veya bir dairenin kartından güçlü / zayıf / ayrı tut bağları seçin.', src: ['White'], actions: [{ type: 'openMatrix', label: 'Matrisi aç' }] });
    } else if (relCount > 0) {
      const used = new Set();
      Object.keys(project.relations).forEach((key) => key.split('|').forEach((id) => used.add(id)));
      const lone = spaces.filter((s) => !used.has(s.id));
      if (lone.length) {
        items.push({ id: 'lone', level: 'oneri', title: lone.length + ' mekânın hiç ilişkisi yok', detail: lone.slice(0, 6).map((s) => s.name).join(', ') + '. Her mekânın en az bir bağı olmalı.', src: ['White'], actions: lone.slice(0, 3).map((s) => ({ type: 'select', id: s.id, label: s.name })) });
      }
    }

    items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    if (!counts.hata && !counts.uyari) {
      items.unshift({ id: 'ok', level: 'ok', title: 'Kritik sorun görünmüyor', detail: score && score.percent != null ? 'Verimlilik skoru %' + score.percent + '. Kalan önerileri gözden geçirin.' : 'İlişkileri tanımlayarak verimlilik skorunu hesaplatın.', src: [], actions: [] });
    }
    return { items: items, counts: counts, circ: circ, matched: m };
  }

  function addActions(entries) {
    const acts = entries.slice(0, 5).map((e) => ({ type: 'addSpaces', list: [{ name: e.name, area: defaultArea(e), zone: e.zone }], label: '+ ' + e.name }));
    if (entries.length > 1) acts.push({ type: 'addSpaces', list: entries.map((e) => ({ name: e.name, area: defaultArea(e), zone: e.zone })), label: 'Hepsini ekle (' + entries.length + ')' });
    return acts;
  }

  App.analyze = { run: analyze, circulation: circulationShare, defaultArea: defaultArea };
})();

/* ==========================================================================
   25-lib-assistant.js — Akıllı Öneri asistanı: hazır-cevap soru motoru
   Sorunun soruluş mantığına göre niyeti (intent) belirler ve bilgi tabanından yanıt üretir.
   Yanıt biçimi: { blocks: [{t:'p'|'ul'|'ol'|'kv'|'actions', ...}], src: ['PAİY', ...] }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const N = U.norm;
  const fmt = U.fmt;
  const KB = App.KB;

  const p = (text) => ({ t: 'p', text: text });
  const ul = (items) => ({ t: 'ul', items: items });
  const ol = (items) => ({ t: 'ol', items: items });
  const kv = (rows) => ({ t: 'kv', rows: rows });
  const acts = (list) => ({ t: 'actions', actions: list });

  const INTENTS = [
    { key: 'eval',     stems: ['degerlendir', 'analiz', 'skor', 'puan', 'verim', 'projem', 'nasil olmus', 'durum', 'kontrol et', 'ozet'] },
    { key: 'missing',  stems: ['ne eksik', 'eksik', 'unut', 'ne lazim', 'neler lazim', 'hangi mekan', 'program', 'liste', 'ne eklemeli', 'ne ekle'] },
    { key: 'area',     stems: ['kac m', 'm2', 'metrekare', 'alan', 'buyukluk', 'olcu', 'boyut', 'ne kadar', 'minimum', 'asgari', 'kac metre'] },
    { key: 'adj',      stems: ['yanin', 'komsu', 'bitisik', 'yakin', 'nereye', 'iliski', 'bagl', 'ayri', 'uzak', 'yan yana', 'kacin'] },
    { key: 'circ',     stems: ['sirkulasyon', 'koridor', 'dolasim', 'hol ', 'brut', 'net alan', 'verimlilik orani'] },
    { key: 'wet',      stems: ['islak', 'tesisat', 'saft', 'havalandirma', 'grupla'] },
    { key: 'noise',    stems: ['gurultu', 'sessiz', 'akustik', 'ses '] },
    { key: 'zoning',   stems: ['zon', 'mahremiyet', 'kamusal', 'servis akis', 'misafir', 'gun bolgesi', 'gece bolgesi'] },
    { key: 'org',      stems: ['organizasyon', 'merkezi', 'cizgisel', 'isinsal', 'radyal', 'kumelen', 'izgara', 'grid', 'sema tipi', 'diyagram tipi'] },
    { key: 'spatial',  stems: ['mekan icinde mekan', 'kenetlen', 'ic ice', 'ortak mekan', 'bitisik mekan', 'mekan iliski'] },
    { key: 'path',     stems: ['yol', 'giris yaklas', 'dolasim yolu', 'mekanin icinden'] },
    { key: 'method',   stems: ['nasil', 'adim', 'yontem', 'bubble', 'balon', 'matris', 'islev sema', 'fonksiyon sema', 'cizilir', 'baslayay'] },
    { key: 'mistakes', stems: ['hata', 'yanlis', 'dikkat', 'sik yapilan', 'tuzak'] },
    { key: 'regs',     stems: ['yonetmelik', 'mevzuat', 'standart', 'zorunlu', 'imar', 'kaynak'] },
    { key: 'total',    stems: ['toplam', 'insaat alani', 'brut alan', 'kac m2 olur'] },
  ];

  function srcChips(list) {
    return Array.from(new Set(list.filter(Boolean))).filter((c) => KB.SOURCES[c]);
  }

  function entryCard(found, ctx) {
    const e = found.entry;
    const blocks = [];
    const rows = [];
    rows.push(['Asgari', e.min != null ? fmt(e.min) + ' m²' : 'Sayısal asgari yok']);
    rows.push(['Tipik', fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m²']);
    rows.push(['İdeal', fmt(e.ideal[0]) + '–' + fmt(e.ideal[1]) + ' m²']);
    blocks.push(p(e.name + ' · ' + found.type.label + ' (' + found.variant.label + ')'));
    blocks.push(kv(rows));
    if (e.note) blocks.push(p(e.note));
    const mine = ctx.project.spaces.find((s) => N(s.name) === N(e.name) || ctx.analysis.matched.byEntry.get(e.key) === s);
    const own = ctx.analysis.matched.byEntry.get(e.key);
    if (own) {
      let verdict = 'aralıkta';
      if (e.min != null && own.area < e.min) verdict = 'asgarinin altında';
      else if (own.area < e.typ[0]) verdict = 'tipik aralığın altında';
      else if (own.area > e.typ[1]) verdict = 'tipik aralığın üzerinde';
      blocks.push(p('Projenizdeki “' + own.name + '”: ' + fmt(own.area) + ' m² — ' + verdict + '.'));
    }
    return { blocks: blocks, src: srcChips([e.src]), mine: mine };
  }

  function adjacency(found, ctx) {
    const v = found.variant, e = found.entry;
    const nameByKey = new Map(v.entries.map((x) => [x.key, x.name]));
    const strong = [], weak = [], avoid = [];
    v.relations.forEach((r) => {
      let other = null;
      if (r[0] === e.key) other = r[1]; else if (r[1] === e.key) other = r[0];
      if (!other || !nameByKey.has(other)) return;
      (r[2] === 'strong' ? strong : r[2] === 'weak' ? weak : avoid).push(nameByKey.get(other));
    });
    const blocks = [p(e.name + ' için önerilen komşuluklar (' + found.variant.label + ')')];
    if (strong.length) blocks.push(p('Yanında / doğrudan bağlantılı: ' + strong.join(', ') + '.'));
    if (weak.length) blocks.push(p('Yakın olabilir (dolaylı erişim yeterli): ' + weak.join(', ') + '.'));
    if (avoid.length) blocks.push(p('Ayrı tutulmalı: ' + avoid.join(', ') + '.'));
    if (!strong.length && !weak.length && !avoid.length) blocks.push(p('Bu mekân için hazır bir komşuluk kuralı yok; en yakın sirkülasyon mekânına bağlayın.'));
    return { blocks: blocks, src: srcChips(['White', 'S', e.src]) };
  }

  /* ----------------------------- yanıtlar ----------------------------- */
  const handlers = {
    eval(q, ctx) {
      const a = ctx.analysis, s = ctx.score;
      const blocks = [];
      if (!ctx.project.spaces.length) return { blocks: [p('Projede henüz mekân yok. Önce mekân ekleyin ya da bir bina şablonu yükleyin.')], src: [] };
      blocks.push(p(s && s.percent != null ? 'Verimlilik skoru %' + s.percent + '. ' + (s.percent >= 80 ? 'Güçlü ilişkili daireler birbirine yakın.' : s.percent >= 50 ? 'Orta düzey; birkaç güçlü bağ hâlâ uzak.' : 'Düşük; güçlü ilişkili daireleri yaklaştırın.') : 'İlişki tanımlanmadığı için skor hesaplanamadı.'));
      blocks.push(kv([
        ['Mekân sayısı', String(ctx.project.spaces.length)],
        ['Toplam alan', fmt(a.circ.total) + ' m²'],
        ['Sirkülasyon payı', '%' + fmt(a.circ.share * 100, 0)],
        ['Uyarı / hata', a.counts.uyari + ' / ' + a.counts.hata],
      ]));
      const top = a.items.filter((i) => i.level === 'hata' || i.level === 'uyari').slice(0, 4);
      if (top.length) blocks.push(ul(top.map((i) => i.title)));
      else blocks.push(p('Kritik bir sorun görünmüyor.'));
      if (s && s.pairs.length) {
        const c = s.counts;
        blocks.push(p('Güçlü bağlar: ' + c.strong[1] + '/' + c.strong[0] + ' yakın · Ayrı tutulanlar: ' + c.avoid[1] + '/' + c.avoid[0] + ' uzak.'));
      }
      return { blocks: blocks, src: srcChips(['White', 'S']) };
    },

    missing(q, ctx) {
      const meta = ctx.project.meta;
      const type = App.kb.type(meta.buildingType), variant = App.kb.variant(meta.buildingType, meta.variant);
      const m = ctx.analysis.matched || App.match.spaces(ctx.project.spaces, variant.entries);
      const req = m.missing.filter((e) => e.req), opt = m.missing.filter((e) => !e.req);
      const blocks = [p(type.label + ' · ' + variant.label + ' programına göre:')];
      if (req.length) {
        blocks.push(p('Gerekli ve eksik: ' + req.map((e) => e.name + ' (' + fmt(U.round5(U.mid(e.typ))) + ' m²)').join(', ') + '.'));
        blocks.push(acts([{ type: 'addSpaces', list: req.map((e) => ({ name: e.name, area: App.analyze.defaultArea(e), zone: e.zone })), label: 'Eksik gerekli mekânları ekle (' + req.length + ')' }]));
      } else blocks.push(p('Programdaki gerekli mekânların hepsi projede var.'));
      if (opt.length) blocks.push(p('İsteğe bağlı / sık unutulan: ' + opt.map((e) => e.name).join(', ') + '.'));
      if (type.notes.length) blocks.push(ul(type.notes));
      return { blocks: blocks, src: srcChips(['PAİY', 'MEB15', 'S'].concat(variant.entries.map((e) => e.src)).slice(0, 4)) };
    },

    area(q, ctx) {
      const f = App.match.findEntryInText(q, ctx.project.meta.buildingType, ctx.project.meta.variant);
      if (!f) return handlers.regs(q, ctx);
      const c = entryCard(f, ctx);
      return { blocks: c.blocks, src: c.src };
    },

    adj(q, ctx) {
      const f = App.match.findEntryInText(q, ctx.project.meta.buildingType, ctx.project.meta.variant);
      if (!f) return handlers.zoning(q, ctx);
      return adjacency(f, ctx);
    },

    card(q, ctx, f) {
      const a = entryCard(f, ctx), b = adjacency(f, ctx);
      return { blocks: a.blocks.concat(b.blocks.slice(1)), src: srcChips(a.src.concat(b.src)) };
    },

    circ(q, ctx) {
      const type = App.kb.type(ctx.project.meta.buildingType);
      const a = ctx.analysis;
      const blocks = [p(type.label + ' için sirkülasyon payı %' + fmt(type.circ[0] * 100, 0) + '–' + fmt(type.circ[1] * 100, 0) + '.'), p(type.circNote)];
      if (ctx.project.spaces.length) blocks.push(p('Projenizde şu an sirkülasyon payı %' + fmt(a.circ.share * 100, 0) + ' (' + fmt(a.circ.circ) + ' m² / ' + fmt(a.circ.total) + ' m²).'));
      blocks.push(ul([
        'Konut: antre + hol + koridor net alanın yaklaşık %8–14’ü.',
        'Ofis: brütün yaklaşık %16’sı (UNM) ile kullanılabilir alanın %28–38’i (GSA/Gensler).',
        'Okul: eğitsel + sosyal + idari alanların %50–60’ı (MEB 2015), brütün yaklaşık %33–37’si.',
        '“%10–20” tek bir kural değildir: açık planlı ve kısa koridorlu yapılarda geçerlidir.',
      ]));
      return { blocks: blocks, src: srcChips(['MEB15', 'GSA', 'TOKİ', 'S']) };
    },

    wet() {
      return { blocks: [
        p('Islak hacimler (banyo, WC, mutfak, çamaşır) ortak tesisat şaftı çevresinde, yatayda yan yana ve düşeyde üst üste gruplanmalı.'),
        ul([
          'PAİY: mutfak, oda ve WC/banyo havalandırmaları aynı boşluğa açılamaz (banyo ve WC açılabilir).',
          'Misafir WC’si antre tarafında; mutfağa ve yemek alanına doğrudan açılmamalı.',
          'Okulda WC’ler laboratuvar, mutfak, pano, jeneratör ve sistem odası üzerine gelmemeli (MEB 2015).',
          'Islak hacimler müzede depo/galeri üzerinde yer almamalı; ofiste sunucu odasının yanına gelmemeli.',
        ]),
      ], src: srcChips(['PAİY', 'MEB15', 'S']) };
    },

    noise() {
      return { blocks: [
        p('Gürültülü mekânlar ile sessiz mekânlar arasında “ayrı tut” ilişkisi kurun veya aralarına tampon (koridor, depo, WC) koyun.'),
        ul([
          'Müzik dersliği, çok amaçlı salon, spor salonu ve yemekhane dersliklerden ve kütüphaneden uzak tutulur (MEB 2015).',
          'İki derslik arasındaki duvarda ses yalıtımı aranır.',
          'Kütüphanede etkinlik salonu ve çocuk bölümü sessiz okumaya bitişik olmamalı.',
          'Konutta salon ve mutfak, yatak odalarıyla ortak duvar paylaşmamalı (küçük 1+1 daireler istisna).',
        ]),
      ], src: srcChips(['MEB15', 'S']) };
    },

    zoning() {
      return { blocks: [
        p('Zonlama, balonları ortak özelliklerine göre kümelemektir. Dört katmanı birlikte düşünün:'),
        ul([
          'Kamusal / yarı özel / özel (misafir – aile – uyku).',
          'Islak / kuru (şaft çevresinde toplanan servis çekirdeği).',
          'Gürültülü / sessiz.',
          'Kullanıcı akışı / servis akışı (mal kabul, çöp, kirli çamaşır, mutfak servisi ayrı ve kullanıcı akışıyla kesişmez).',
        ]),
        p('Hizmet eden mekânlar (WC, depo, teknik, şaft, merdiven) hizmet edilen mekânların çevresinde çekirdek olarak toplanır.'),
      ], src: srcChips(['White', 'Ching', 'S']) };
    },

    org(q) {
      const nq = N(q);
      const hit = KB.ORGS.filter((o) => nq.includes(N(o.name.split(' ')[0])) || (o.key === 'isinsal' && nq.includes('radyal')) || (o.key === 'kumelenmis' && nq.includes('kumelen')));
      const list = hit.length ? hit : KB.ORGS;
      const blocks = [];
      list.forEach((o) => { blocks.push(p(o.name + ': ' + o.text)); blocks.push(p('Diyagramda: ' + o.bubble + ' Örnek kullanım: ' + o.use)); });
      return { blocks: blocks, src: ['Ching'] };
    },

    spatial() {
      return { blocks: [p('Mekânlar arasındaki dört temel ilişki türü:')].concat([ul(KB.SPATIAL.map((s) => s.name + ': ' + s.text))]), src: ['Ching'] };
    },

    path() {
      return { blocks: [p('Dolaşım yolu ile mekân arasındaki üç temel ilişki:'), ul(KB.CIRC_PATHS.map((s) => s.name + ': ' + s.text))], src: ['Ching'] };
    },

    method() {
      return { blocks: [p('İşlev şeması (balon diyagramı) adım adım:'), ol(KB.METHOD), p('Bu uygulamada 1–2. adım Mekanlar sekmesinde, 3. adım İlişki Matrisi’nde, 4–5. adım pafta üzerinde, 6–7. adım Akıllı Öneri panelinde yapılır.')], src: srcChips(['White', 'Ching']) };
    },

    mistakes() {
      return { blocks: [p('Balon diyagramında sık yapılan hatalar:'), ul(KB.MISTAKES)], src: srcChips(['White', 'S']) };
    },

    regs(q, ctx) {
      const meta = ctx.project.meta;
      const type = App.kb.type(meta.buildingType), variant = App.kb.variant(meta.buildingType, meta.variant);
      const withMin = variant.entries.filter((e) => e.min != null);
      const blocks = [p(type.label + ' · ' + variant.label + ' için sayısal asgari değerler:')];
      if (withMin.length) blocks.push(kv(withMin.map((e) => [e.name, fmt(e.min) + ' m² (' + e.src + ')'])));
      else blocks.push(p('Bu program için mevzuatta sayısal asgari alan bulunmuyor; tipik aralıklar uygulama verisidir.'));
      blocks.push(ul(type.notes));
      return { blocks: blocks, src: srcChips(withMin.map((e) => e.src).concat(['S'])) };
    },

    total(q, ctx) {
      const a = ctx.analysis;
      const type = App.kb.type(ctx.project.meta.buildingType);
      if (!ctx.project.spaces.length) return { blocks: [p('Önce mekânları ekleyin; toplam alan ve sirkülasyon hesabını birlikte yapayım.')], src: [] };
      const nonCirc = a.circ.total - a.circ.circ;
      const need = nonCirc * U.mid(type.circ) / (1 - U.mid(type.circ));
      return { blocks: [
        kv([['Toplam (şu an)', fmt(a.circ.total) + ' m²'], ['Sirkülasyon dışı', fmt(nonCirc) + ' m²'], ['Önerilen sirkülasyon', '≈ ' + fmt(need) + ' m² (%' + fmt(U.mid(type.circ) * 100, 0) + ')'], ['Tahmini toplam', '≈ ' + fmt(nonCirc + need) + ' m²']]),
        p('Duvar kalınlığı ve şaft payı bu hesaba dahil değildir; brüt inşaat alanı için ayrıca eklenmelidir.'),
      ], src: srcChips(['S', 'GSA']) };
    },

    typeProgram(q, ctx, type) {
      const v = type.variants[0];
      const req = v.entries.filter((e) => e.req);
      return { blocks: [
        p(type.label + ' (' + v.label + ') için temel program:'),
        ul(req.map((e) => e.name + ' — tipik ' + fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m²')),
        p(type.notes[0] || ''),
        acts([{ type: 'loadTemplate', typeKey: type.key, variantKey: v.key, label: type.label + ' şablonunu yükle' }]),
      ], src: srcChips(['S'].concat(req.map((e) => e.src)).slice(0, 4)) };
    },

    help() {
      return { blocks: [
        p('Bu soruyu tam eşleştiremedim. Şunları sorabilirsiniz:'),
        ul(['“Projemde ne eksik?”', '“Salon kaç m² olmalı?”', '“Mutfak neyin yanında olmalı?”', '“Sirkülasyon payı ne olmalı?”', '“Projemi değerlendir”', '“Islak hacimleri nasıl gruplarım?”', '“Merkezi organizasyon nedir?”', '“Okul programında hangi mekânlar olmalı?”']),
      ], src: [] };
    },
  };

  function answer(query, ctx) {
    const nq = N(query);
    if (!nq) return handlers.help(query, ctx);

    // bina tipi + program soruları
    const typeHit = KB.TYPES.find((t) => t.key !== 'genel' && nq.split(' ').some((w) => w.length >= 4 && (N(t.label).includes(w) || w.includes(N(t.key)))));
    const wantsProgram = /program|hangi mekan|mekanlar|olmali/.test(nq) && typeHit && !App.match.findEntryInText(query, typeHit.key, typeHit.variants[0].key);
    if (typeHit && wantsProgram) return handlers.typeProgram(query, ctx, typeHit);

    // niyet puanı
    let best = null, bs = 0;
    INTENTS.forEach((it) => {
      let sc = 0;
      it.stems.forEach((st) => { if ((' ' + nq + ' ').includes(st.endsWith(' ') ? ' ' + st : st)) sc += st.length > 5 ? 2 : 1; });
      if (sc > bs) { bs = sc; best = it.key; }
    });

    const found = App.match.findEntryInText(query, ctx.project.meta.buildingType, ctx.project.meta.variant);
    if (found && (best === null || best === 'area' || best === 'adj')) {
      const adjCue = /yanin|komsu|bitisik|yakin|nereye|iliski|ayri|uzak|yan yana|kacin/.test(nq);
      const areaCue = /kac m|m2|metrekare|alan|buyuk|olcu|boyut|ne kadar|minimum|asgari/.test(nq);
      if (adjCue && !areaCue) return handlers.adj(query, ctx);
      if (areaCue && !adjCue) return handlers.area(query, ctx);
      return handlers.card(query, ctx, found);
    }
    if (best && handlers[best]) return handlers[best](query, ctx);
    if (found) return handlers.card(query, ctx, found);
    return handlers.help(query, ctx);
  }

  App.assistant = {
    answer: answer,
    chips: ['Projemde ne eksik?', 'Projemi değerlendir', 'Salon kaç m² olmalı?', 'Mutfak neyin yanında olmalı?', 'Sirkülasyon payı ne olmalı?', 'Islak hacimleri nasıl gruplarım?', 'Merkezi organizasyon nedir?'],
  };
})();

/* ==========================================================================
   26-lib-board.js — pafta sahnesi (primitifler) + SVG / Canvas çizicileri
   Ekrandaki canlı pafta (SVG) ile PNG/PDF çıktısı (Canvas) aynı primitif listesinden
   üretilir; böylece dışa aktarılan görüntü ekrandakiyle birebir aynıdır.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const PAL = App.PAL;
  const FONTS = App.FONTS;
  const geo = App.geo;
  const fmt = App.util.fmt;

  /* ---------------- primitif üreticiler ---------------- */
  /* İşlev şeması künyesi: ortak, ölçümlü pafta çerçevesi (App.sheet.frame) kullanılır */
  function frameInfo(info) {
    const ink = PAL.ink;
    const legend = [
      { label: 'Güçlü ilişki', line: { stroke: ink, sw: 6, cap: 'round' } },
      { label: 'Zayıf ilişki', line: { stroke: ink, sw: 2.5, dash: [9, 8], cap: 'round', opacity: 0.7 } },
      { label: 'Ayrı tut', line: { stroke: ink, sw: 3.5, dash: [0.5, 9], cap: 'round' } }
    ];
    return {
      name: info.name, subtitle: info.typeLabel + ' · ' + info.variantLabel, legend: legend,
      stats: [['Mekân', String(info.count)], ['Toplam', fmt(info.total) + ' m²'], ['Tarih', info.date]],
      scoreLabel: 'Verimlilik', percent: info.percent
    };
  }

  /* ---------------- pafta primitifleri (monokrom glass; renkli kipte palet renkleri) ---------------- */
  function staticGlass(info, opts) { return App.sheet.frame(frameInfo(info), !!(opts && opts.live)); }

  function relGlass(a, b, type, ra, rb) {
    const P = [];
    const ink = PAL.ink;
    if (type === 'strong') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: ink, sw: 6, cap: 'round' });
    } else if (type === 'weak') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: ink, sw: 2.5, dash: [9, 9], cap: 'round', opacity: 0.7 });
    } else if (type === 'avoid') {
      P.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: ink, sw: 3.5, dash: [0.5, 10], cap: 'round' });
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
      const s0 = ra, s1 = d - rb;
      const mid = s1 > s0 ? (s0 + s1) / 2 : d / 2;
      const mx = a.x + ux * mid, my = a.y + uy * mid;
      P.push({ t: 'circle', cx: mx, cy: my, r: 13, fill: PAL.sheet, stroke: ink, sw: 2, shadow: { dx: 0, dy: 3, blur: 7, color: 'rgba(30,34,44,.28)' } });
      P.push({ t: 'line', x1: mx - 5, y1: my - 5, x2: mx + 5, y2: my + 5, stroke: ink, sw: 2.4, cap: 'round' });
      P.push({ t: 'line', x1: mx - 5, y1: my + 5, x2: mx + 5, y2: my - 5, stroke: ink, sw: 2.4, cap: 'round' });
    }
    return P;
  }

  // col: { fill, text } — renk kipinde tek daire / kategori rengi (App.colors.space); verilmezse bölge varsayılanı
  function bubbleGlass(s, r, col) {
    const z = col || App.ZONES[s.zone] || App.ZONES.sosyal;
    const P = [];
    // yumuşak kabartma: koyu gölge + açık vurgu, üstüne cam kenar
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r, fill: z.fill, shadow: { dx: 9, dy: 12, blur: 22, color: 'rgba(36,40,52,.30)' } });
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r, fill: z.fill, shadow: { dx: -8, dy: -8, blur: 18, color: 'rgba(255,255,255,.95)' } });
    P.push({ t: 'circle', cx: s.x, cy: s.y, r: r - 1, stroke: 'rgba(23,24,27,.13)', sw: 1.5 });
    if (r >= 60) P.push({ t: 'circle', cx: s.x, cy: s.y, r: r - 13, stroke: z.text, sw: 1.2, opacity: 0.14 });
    const lab = geo.label(s.name, r);
    const areaTxt = fmt(s.area) + ' m²';
    const afs = Math.max(10, Math.round(lab.fs * 0.8));
    const lh = lab.fs * 1.15;
    const ink = PAL.ink;
    if (lab.outside) {
      const y = s.y + r + 22;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: ink, anchor: 'middle' }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: ink, anchor: 'middle', opacity: 0.6 });
    } else {
      const blockH = lab.lines.length * lh + afs + 4;
      const y = s.y - blockH / 2 + lab.fs * 0.85;
      lab.lines.forEach((ln, i) => { P.push({ t: 'text', x: s.x, y: y + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: z.text, anchor: 'middle' }); });
      P.push({ t: 'text', x: s.x, y: y + lab.lines.length * lh + 2, s: areaTxt, size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.72 });
    }
    return P;
  }

  const staticPrims = staticGlass;
  const relLinePrims = relGlass;
  // project verilirse renk kipinde palet renkleri (tek daire > kategori) uygulanır
  const bubblePrims = (s, r, project) => bubbleGlass(s, r, project && App.colors ? App.colors.space(project, s) : null);

  function infoOf(project, score) {
    const type = App.kb.type(project.meta.buildingType);
    const variant = App.kb.variant(project.meta.buildingType, project.meta.variant);
    return {
      name: project.meta.name,
      typeLabel: type.label,
      variantLabel: variant.label,
      count: project.spaces.length,
      total: App.util.sum(project.spaces, (s) => s.area),
      date: App.util.today(),
      percent: score ? score.percent : null,
    };
  }

  function allPrims(project, k, score) {
    const P = staticPrims(infoOf(project, score));
    const by = new Map(project.spaces.map((s) => [s.id, s]));
    Object.keys(project.relations).forEach((key) => {
      const ids = key.split('|');
      const a = by.get(ids[0]), b = by.get(ids[1]);
      if (!a || !b) return;
      relLinePrims(a, b, project.relations[key], geo.radius(a.area, k), geo.radius(b.area, k)).forEach((x) => P.push(x));
    });
    project.spaces.forEach((s) => bubblePrims(s, geo.radius(s.area, k), project).forEach((x) => P.push(x)));
    return P;
  }

  /* ---------------- tek renk (monokrom) ----------------
     Her renk, parlaklığına göre seçilen rengin (siyah) ile beyaz arasındaki tonuna çevrilir; görüntüler (img) aynı eşlemeyle boyanır.
     App.board.monoPrims(prims, '#1F3A5F') → yeni primitif listesi (girdiyi değiştirmez). */
  const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
  function parseColor(c) {
    if (typeof c !== 'string') return null;
    const s = c.trim().toLowerCase();
    if (NAMED[s]) return NAMED[s];
    let m = /^#([0-9a-f]{3})$/.exec(s);
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]; }
    m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] != null ? +m[4] : 1];
    return null;
  }
  const lumOf = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  function monoColor(c, base) {
    const q = parseColor(c);
    if (!q) return c;
    const L = lumOf(q[0], q[1], q[2]);
    const r = Math.round(base[0] + (255 - base[0]) * L), g = Math.round(base[1] + (255 - base[1]) * L), b = Math.round(base[2] + (255 - base[2]) * L);
    if (q[3] >= 0.999) return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.round(q[3] * 1000) / 1000 + ')';
  }
  function monoPrims(prims, hex) {
    const base = parseColor(hex);
    if (!base) return prims;
    const norm = '#' + ((1 << 24) | (base[0] << 16) | (base[1] << 8) | base[2]).toString(16).slice(1);
    const walk = (p) => {
      const q = Object.assign({}, p);
      if (typeof q.fill === 'string') q.fill = monoColor(q.fill, base);
      if (typeof q.stroke === 'string') q.stroke = monoColor(q.stroke, base);
      if (q.shadow && typeof q.shadow.color === 'string') q.shadow = Object.assign({}, q.shadow, { color: monoColor(q.shadow.color, base) });
      if (q.t === 'img') q.tint = norm;
      if (q.t === 'g' && q.items) q.items = q.items.map(walk);
      return q;
    };
    return prims.map(walk);
  }
  /* SVG ön izleme için: belge içinde bir kez tanımlanan "iki ton" süzgeci */
  function monoFilterUrl(hex) {
    const base = parseColor(hex);
    if (!base || typeof document === 'undefined') return null;
    const id = 'mono-' + hex.replace('#', '');
    if (!document.getElementById(id)) {
      const NS = 'http://www.w3.org/2000/svg';
      let defs = document.getElementById('mono-defs');
      if (!defs) {
        defs = document.createElementNS(NS, 'svg');
        defs.setAttribute('id', 'mono-defs'); defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.setAttribute('aria-hidden', 'true');
        defs.style.position = 'absolute';
        document.body.appendChild(defs);
      }
      const f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', id); f.setAttribute('color-interpolation-filters', 'sRGB'); f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '1'); f.setAttribute('height', '1');
      const cm = document.createElementNS(NS, 'feColorMatrix');
      cm.setAttribute('type', 'matrix'); cm.setAttribute('values', '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0');
      const ct = document.createElementNS(NS, 'feComponentTransfer');
      ['R', 'G', 'B'].forEach((ch, i) => {
        const fn = document.createElementNS(NS, 'feFunc' + ch);
        fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', (base[i] / 255).toFixed(4) + ' 1');
        ct.appendChild(fn);
      });
      f.appendChild(cm); f.appendChild(ct);
      defs.appendChild(f);
    }
    return 'url(#' + id + ')';
  }
  const tintCache = new Map();
  /* tuval çıktısı için: görüntüyü piksel piksel iki tonlu yapar (en çok 2048 px) */
  function tintedSource(im, key, hex) {
    const ck = key + '|' + hex;
    if (tintCache.has(ck)) return tintCache.get(ck);
    const base = parseColor(hex);
    const k = Math.min(1, 2048 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), hh = Math.max(1, Math.round(im.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    const cx = cv.getContext('2d');
    cx.drawImage(im, 0, 0, w, hh);
    let out = cv;
    try {
      const id = cx.getImageData(0, 0, w, hh), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const L = lumOf(d[i], d[i + 1], d[i + 2]);
        d[i] = base[0] + (255 - base[0]) * L; d[i + 1] = base[1] + (255 - base[1]) * L; d[i + 2] = base[2] + (255 - base[2]) * L;
      }
      cx.putImageData(id, 0, 0);
    } catch (err) { out = im; } // harici kaynak tuvali kirletmişse özgün görüntü çizilir
    tintCache.set(ck, out);
    if (tintCache.size > 24) tintCache.delete(tintCache.keys().next().value);
    return out;
  }

  /* ---------------- SVG çizici (sanal DOM düğümü) ---------------- */
  function shadowCss(sh) { return 'drop-shadow(' + sh.dx + 'px ' + sh.dy + 'px ' + sh.blur + 'px ' + (sh.css || sh.color) + ')'; }

  function primToV(p, extra) {
    const a = Object.assign({}, extra || {});
    if (p.opacity != null) a.opacity = p.opacity;
    if (p.blend) a.style = { mixBlendMode: p.blend };
    switch (p.t) {
      case 'img': {
        // görüntü: p.href (data URL), x, y, w, h; p.clip (isteğe bağlı, dikdörtgen) ile kırpılır
        if (p.tint) { const fu = monoFilterUrl(p.tint); if (fu) a.style = Object.assign(a.style || {}, { filter: fu }); else a.style = Object.assign(a.style || {}, { filter: 'grayscale(1)' }); }
        else if (p.gray) a.style = Object.assign(a.style || {}, { filter: 'grayscale(1)' });
        const im = h('image', Object.assign(a, { x: p.x, y: p.y, width: p.w, height: p.h, href: p.href, preserveAspectRatio: 'none', 'pointer-events': 'none' }));
        if (!p.clip) return im;
        const cid = 'clip-' + p.clip.id;
        return h('g', {}, h('clipPath', { id: cid }, h('rect', { x: p.clip.x, y: p.clip.y, width: p.clip.w, height: p.clip.h })), h('g', { 'clip-path': 'url(#' + cid + ')' }, im));
      }
      case 'g': {
        // kırpmalı grup: p.clip = { id, x, y, w, h } (dikdörtgen) ya da { id, pts } (çokgen); p.items = primitifler
        const cid = 'clip-' + (p.clip.id || 'g');
        const shape = p.clip.pts ? h('polygon', { points: p.clip.pts.map((q) => q.join(',')).join(' ') }) : h('rect', { x: p.clip.x, y: p.clip.y, width: p.clip.w, height: p.clip.h });
        return h('g', a, h('clipPath', { id: cid }, shape), h('g', { 'clip-path': 'url(#' + cid + ')' }, p.items.map((q) => primToV(q))));
      }
      case 'rect':
        Object.assign(a, { x: p.x, y: p.y, width: p.w, height: p.h, fill: p.fill || 'none' });
        if (p.rx) a.rx = p.rx;
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = p.rx ? 'round' : 'miter'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        if (p.shadow) a.style = Object.assign(a.style || {}, { filter: shadowCss(p.shadow) });
        return h('rect', a);
      case 'circle':
        Object.assign(a, { cx: p.cx, cy: p.cy, r: p.r, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; }
        if (p.shadow) a.style = Object.assign(a.style || {}, { filter: shadowCss(p.shadow) });
        return h('circle', a);
      case 'line':
        Object.assign(a, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: p.stroke, 'stroke-width': p.sw, 'stroke-linecap': p.cap || 'butt' });
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('line', a);
      case 'poly':
        Object.assign(a, { points: p.pts.map((q) => q.join(',')).join(' '), fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linejoin'] = 'round'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('polygon', a);
      case 'path':
        Object.assign(a, { d: p.d, fill: p.fill || 'none' });
        if (p.stroke) { a.stroke = p.stroke; a['stroke-width'] = p.sw; a['stroke-linecap'] = p.cap || 'butt'; a['stroke-linejoin'] = 'round'; }
        if (p.dash) a['stroke-dasharray'] = p.dash.join(' ');
        return h('path', a);
      case 'text':
        Object.assign(a, { x: p.x, y: p.y, fill: p.fill, 'font-family': FONTS[p.fam], 'font-size': p.size, 'font-weight': p.weight, 'text-anchor': p.anchor || 'start' });
        if (p.xf) { a.x = 0; a.y = 0; a.transform = 'matrix(' + p.xf.map((v) => Math.round(v * 1000) / 1000).join(' ') + ' ' + Math.round(p.x * 100) / 100 + ' ' + Math.round(p.y * 100) / 100 + ')'; }
        if (p.ls) a['letter-spacing'] = p.ls;
        if (p.pe === false) a['pointer-events'] = 'none';
        return h('text', a, p.s);
    }
    return null;
  }

  /* ---------------- Canvas çizici ---------------- */
  function applyShadow(ctx, sh) {
    if (!sh) return;
    const k = ctx.__k || 1;
    ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur * k; ctx.shadowOffsetX = sh.dx * k; ctx.shadowOffsetY = sh.dy * k;
  }

  function paintPrim(ctx, p) {
    if (p.t === 'g') {
      ctx.save();
      if (p.opacity != null) ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      if (p.clip.pts) { p.clip.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); } else ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h);
      ctx.clip();
      p.items.forEach((q) => paintPrim(ctx, q));
      ctx.restore();
      return;
    }
    ctx.save();
    if (p.opacity != null) ctx.globalAlpha = p.opacity;
    if (p.blend) ctx.globalCompositeOperation = p.blend;
    ctx.setLineDash(p.dash || []);
    ctx.lineCap = p.cap || 'butt';
    switch (p.t) {
      case 'img': {
        const im = App.board.imgCache && App.board.imgCache[p.ik || p.href];
        if (im && im.complete && im.naturalWidth) {
          if (p.clip) { ctx.beginPath(); ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h); ctx.clip(); }
          if (p.tint) ctx.drawImage(tintedSource(im, p.ik || p.href, p.tint), p.x, p.y, p.w, p.h);
          else {
            if (p.gray && 'filter' in ctx) ctx.filter = 'grayscale(1)';
            ctx.drawImage(im, p.x, p.y, p.w, p.h);
          }
        }
        break;
      }
      case 'rect':
        applyShadow(ctx, p.shadow);
        if (p.rx) {
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h, p.rx); else ctx.rect(p.x, p.y, p.w, p.h);
          if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'round'; ctx.stroke(); }
        } else {
          if (p.fill) { ctx.fillStyle = p.fill; ctx.fillRect(p.x, p.y, p.w, p.h); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'miter'; ctx.strokeRect(p.x, p.y, p.w, p.h); }
        }
        break;
      case 'circle':
        applyShadow(ctx, p.shadow);
        ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.stroke(); }
        break;
      case 'line':
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2);
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.stroke();
        break;
      case 'poly':
        ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'round'; ctx.stroke(); }
        break;
      case 'path': {
        const pth = new Path2D(p.d);
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(pth); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.lineJoin = 'round'; ctx.stroke(pth); }
        break;
      }
      case 'text':
        ctx.font = p.weight + ' ' + p.size + 'px ' + FONTS[p.fam];
        ctx.fillStyle = p.fill;
        ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        if ('letterSpacing' in ctx) ctx.letterSpacing = (p.ls || 0) + 'px';
        if (p.xf) { ctx.transform(p.xf[0], p.xf[1], p.xf[2], p.xf[3], p.x, p.y); ctx.fillText(p.s, 0, 0); }
        else ctx.fillText(p.s, p.x, p.y);
        break;
    }
    ctx.restore();
  }

  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = App.theme.cur().fontLoads.map((f) => document.fonts.load(f, 'AaİıŞşĞğÜüÖöÇç0123456789'));
    return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]).catch(function () {});
  }

  /* Çıktı alanı: pafta. Daireler paftanın dışına (sonsuz tuvalde) taşındıysa alan, hepsini kapsayacak kadar genişler;
     hepsi paftanın içindeyse çıktı her zamanki gibi tam pafta boyutundadır. */
  function exportBox(project, k) {
    const W = geo.W, H = geo.H;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    project.spaces.forEach((s) => {
      const r = geo.radius(s.area, k), lab = r < 36 ? 64 : 0; // küçük dairenin etiketi altında durur
      x0 = Math.min(x0, s.x - r); y0 = Math.min(y0, s.y - r); x1 = Math.max(x1, s.x + r); y1 = Math.max(y1, s.y + r + lab);
    });
    if (!project.spaces.length || (x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H)) return { x0: 0, y0: 0, x1: W, y1: H, wide: false };
    const m = 48; // gölge payı
    return { x0: Math.min(0, x0 - m), y0: Math.min(0, y0 - m), x1: Math.max(W, x1 + m), y1: Math.max(H, y1 + m), wide: true };
  }

  function toCanvas(project, k, score, factor) {
    return ensureFonts().then(function () {
      const box = exportBox(project, k);
      const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
      // çok geniş çıktılarda piksel sayısı sınırlı tutulur (tarayıcı tuval sınırı)
      const s = Math.min(factor || 2, 5000 / Math.max(bw, bh), Math.sqrt(16e6 / (bw * bh)));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bw * s);
      cv.height = Math.round(bh * s);
      const ctx = cv.getContext('2d');
      ctx.__k = s;
      if (box.wide) { ctx.fillStyle = PAL.outer; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.scale(s, s);
      ctx.translate(-box.x0, -box.y0);
      allPrims(project, k, score).forEach((p) => paintPrim(ctx, p));
      return cv;
    });
  }

  // Herhangi bir sahneyi (primitif listesi) tuvale çiz: diğer modüller (kat etüdü, analiz) kullanır
  function primsToCanvas(prims, W, H, factor) {
    return ensureFonts().then(function () {
      const s = factor || 2;
      const cv = document.createElement('canvas');
      cv.width = Math.round(W * s);
      cv.height = Math.round(H * s);
      const ctx = cv.getContext('2d');
      ctx.__k = s;
      ctx.scale(s, s);
      prims.forEach((p) => paintPrim(ctx, p));
      return cv;
    });
  }

  App.board = {
    staticPrims: staticPrims, relLinePrims: relLinePrims, bubblePrims: bubblePrims, infoOf: infoOf,
    imgCache: {}, allPrims: allPrims, primToV: primToV, paintPrim: paintPrim, toCanvas: toCanvas, primsToCanvas: primsToCanvas, shadowCss: shadowCss, monoPrims: monoPrims, monoColor: (c, hex) => monoColor(c, parseColor(hex) || [0, 0, 0]),
  };
})();

/* ==========================================================================
   27-lib-files.js — JSON kaydet/yükle, PNG ve PDF dışa aktarma
   Standart şema: "mimari-asistan.bubble-diagram" v1 (diğer modüllerle paylaşım için)
   İndirme: önce Artifact "downloads" yeteneği, yoksa tarayıcı indirmesi.
   ========================================================================== */
(function () {
  window.App.extProviders = window.App.extProviders || [];
  const App = window.App;
  const U = App.util;
  const geo = App.geo;

  const SCHEMA = 'mimari-asistan.bubble-diagram';
  const VERSION = 1;

  /* ---------------- dosya kaydetme ---------------- */
  function saveBlob(filename, blob) {
    const cap = window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null);
    return Promise.resolve(cap).catch(function () { return null; }).then(function (dl) {
      if (dl && dl.save) {
        return dl.save({ filename: filename, data: blob }).then(
          function (r) { return { ok: true, status: r.status }; },
          function (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
        );
      }
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        return { ok: true, status: 'saved' };
      } catch (e) { return { ok: false, code: 'unavailable', message: String(e) }; }
    });
  }

  /* ---------------- JSON ---------------- */
  function toJSON(project, k, score, circ) {
    const now = new Date().toISOString();
    const ext = {};
    (App.extProviders || []).forEach((fn) => { try { Object.assign(ext, fn(project)); } catch (e) { /* bir modülün uzantısı hatalıysa dosya yine de yazılır */ } });
    return {
      schema: SCHEMA,
      version: VERSION,
      platform: 'archtools',
      meta: {
        name: project.meta.name,
        buildingType: project.meta.buildingType,
        variant: project.meta.variant,
        createdAt: project.meta.createdAt || now,
        updatedAt: now,
      },
      world: { width: geo.W, height: geo.H, unit: 'px', scalePxPerSqrtM2: Math.round(k * 1000) / 1000 },
      spaces: project.spaces.map((s) => ({ id: s.id, name: s.name, area: s.area, zone: s.zone, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10 })),
      relations: Object.keys(project.relations).map((key) => { const ids = key.split('|'); return { a: ids[0], b: ids[1], type: project.relations[key] }; }),
      metrics: {
        efficiencyScore: score ? score.percent : null,
        totalArea: Math.round(U.sum(project.spaces, (s) => s.area) * 100) / 100,
        circulationShare: circ ? Math.round(circ.share * 1000) / 1000 : null,
      },
      // diğer modüllerin verisi: App.extProviders'a eklenen her işlev { anahtar: veri } döndürür
      //   floorStudy (Modül 2): kat ataması + hesaplanan plan blokları · spaceAnalysis (Modül 3): uyum skoru ve ölçüler
      //   siteAnalysis (Modül 4): konum, parsel, skorlar · zoning (Modül 5): imar parametreleri ve kapasite · siteSelection (Modül 6): adaylar ve sıralama
      extensions: ext,
    };
  }

  function fromJSON(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('Dosya geçerli bir JSON değil.'); }
    if (!o || o.schema !== SCHEMA) throw new Error('Bu dosya bir İşlev Şeması projesi değil (şema: ' + SCHEMA + ').');
    if (!Array.isArray(o.spaces)) throw new Error('Dosyada mekân listesi bulunamadı.');
    const ids = new Set();
    const spaces = o.spaces.map((s, i) => {
      const id = String(s.id || U.uid() + i);
      ids.add(id);
      const area = Number(s.area);
      if (!(area > 0)) throw new Error('“' + (s.name || i + 1) + '” için geçersiz alan.');
      const zone = App.ZONES[s.zone] ? s.zone : App.match.zoneFor(String(s.name || ''), o.meta && o.meta.buildingType, o.meta && o.meta.variant);
      // konum: pafta dışındaki (sonsuz tuval) konumlar korunur; yalnızca tuval sınırına çekilir
      const num = (v, d) => (v === null || v === '' || v === undefined || !isFinite(Number(v)) ? d : Number(v));
      const pos = geo.clampWorld(num(s.x, geo.W / 2), num(s.y, geo.H / 2), 0);
      return { id: id, name: String(s.name || 'Mekân ' + (i + 1)).slice(0, 60), area: area, zone: zone, x: pos.x, y: pos.y };
    });
    const relations = {};
    (o.relations || []).forEach((r) => {
      if (!ids.has(r.a) || !ids.has(r.b) || r.a === r.b) return;
      if (r.type === 'strong' || r.type === 'weak' || r.type === 'avoid') relations[U.pairKey(r.a, r.b)] = r.type;
    });
    const m = o.meta || {};
    const typeKey = App.KB.TYPES.some((t) => t.key === m.buildingType) ? m.buildingType : 'genel';
    const variant = App.kb.variant(typeKey, m.variant).key;
    const project = { meta: { name: String(m.name || 'İçe aktarılan proje').slice(0, 80), buildingType: typeKey, variant: variant, createdAt: m.createdAt || null, example: false }, spaces: spaces, relations: relations };
    if (App.study && o.extensions && o.extensions.floorStudy) project.study = App.study.fromExt(o.extensions.floorStudy, project);
    // arsa / imar / yer seçimi gibi sonradan eklenen modüller: App.extImporters (ext, project) → { alan: değer }
    if (o.extensions) (App.extImporters || []).forEach((fn) => { try { Object.assign(project, fn(o.extensions, project) || {}); } catch (e) { /* bozuk uzantı projeyi engellemez */ } });
    return project;
  }

  /* ---------------- PNG / PDF ---------------- */
  function canvasToBlob(cv, type, q) {
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), type, q));
  }

  function buildPdf(jpeg, iw, ih, title) {
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offs = [];
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    // A3 yatay (pt); paftanın dışına taşan daireler için çıktı genişlemişse sayfa, görüntünün oranına uyar (en çok A3 kutusu)
    const A3W = 1190.55, A3H = 841.89;
    const ar = iw / ih;
    let pw = A3W, ph = A3H;
    if (Math.abs(ar - A3W / A3H) > 0.002) { if (ar > A3W / A3H) ph = A3W / ar; else pw = A3H * ar; }
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offs[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offs[3] = len; push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    offs[4] = len; push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + iw + ' /Height ' + ih + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    push(jpeg); push('\nendstream\nendobj\n');
    const content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    offs[5] = len; push('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
    const t = U.norm(title).replace(/[()\\]/g, '') || 'islev-semasi';
    offs[6] = len; push('6 0 obj\n<< /Title (' + t + ') /Producer (Islev Semasi Simulasyonu) >>\nendobj\n');
    const xref = len;
    let x = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push('trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function exportPNG(project, k, score) {
    return App.board.toCanvas(project, k, score, 2).then((cv) => canvasToBlob(cv, 'image/png')).then((blob) => saveBlob(U.slug(project.meta.name) + '-islev-semasi.png', blob));
  }
  function exportPDF(project, k, score) {
    return App.board.toCanvas(project, k, score, 2.5).then((cv) =>
      canvasToBlob(cv, 'image/jpeg', 0.93).then((b) => b.arrayBuffer()).then((buf) => buildPdf(new Uint8Array(buf), cv.width, cv.height, project.meta.name))
    ).then((blob) => saveBlob(U.slug(project.meta.name) + '-islev-semasi.pdf', blob));
  }
  function exportJSON(project, k, score, circ, suffix) {
    const text = JSON.stringify(toJSON(project, k, score, circ), null, 2);
    return saveBlob(U.slug(project.meta.name) + '-' + (suffix || 'islev-semasi') + '.json', new Blob([text], { type: 'application/json' }));
  }

  App.files = { SCHEMA: SCHEMA, toJSON: toJSON, fromJSON: fromJSON, exportPNG: exportPNG, exportPDF: exportPDF, exportJSON: exportJSON, saveBlob: saveBlob, buildPdf: buildPdf };
})();

/* ==========================================================================
   28-lib-sheet.js — ortak pafta çerçevesi ve etiket sığdırma (Modül 2 ve 3 kullanır)
   Çerçeve: levha + nokta ızgara + künye (başlık, gösterge, istatistik, skor).
   Çıktı primitif listesidir; ekranda SVG, dışa aktarmada Canvas aynı listeden çizilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const PAL = App.PAL;
  const geo = App.geo;
  const fmt = App.util.fmt;

  const sheet = (App.sheet = { W: geo.W, H: geo.H, F: geo.FRAME, tb: geo.titleBlock });

  /* ---------- etiket sığdırma: kutuya (px) ad satırları + boyut ---------- */
  sheet.fitLabel = function (name, w, h, o) {
    o = o || {};
    const T = App.theme.cur().label;
    const text = T.upper ? String(name || '').toLocaleUpperCase('tr') : String(name || '');
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const extra = o.withArea ? 1 : 0;
    const maxFs = Math.min(o.max || 17, h * 0.34);
    for (let fs = maxFs; fs >= (o.min || 8); fs -= 0.5) {
      const cap = Math.max(2, Math.floor((w * 0.92) / (fs * T.cw)));
      const lines = [];
      let cur = '', ok = true;
      for (let i = 0; i < words.length; i++) {
        const wd = words[i];
        if (wd.length > cap) { ok = false; break; }
        const next = cur ? cur + ' ' + wd : wd;
        if (next.length <= cap) cur = next; else { lines.push(cur); cur = wd; }
      }
      if (!ok) continue;
      if (cur) lines.push(cur);
      const need = lines.length * fs * 1.16 + extra * fs * 0.95;
      if (need <= h * 0.9) return { lines: lines, fs: fs, ls: T.upper ? 0.4 : 0 };
    }
    return null;
  };

  sheet.dimText = (m) => fmt(m, m < 10 ? 2 : 1) + ' m';

  /* ---------- metin ölçümü: sabit sütun yerine gerçek genişliğe göre yerleşim ---------- */
  let _cx = null;
  sheet.tw = function (s, size, weight, fam, ls) {
    s = String(s == null ? '' : s);
    let w;
    try {
      if (!_cx) _cx = document.createElement('canvas').getContext('2d');
      _cx.font = (weight || 400) + ' ' + size + 'px ' + App.FONTS[fam || 'b'];
      w = _cx.measureText(s).width;
    } catch (e) { w = s.length * size * 0.6; }
    return w + (ls || 0) * s.length;
  };
  // Sığmayan metni "…" ile kısalt
  sheet.clip = function (s, maxW, size, weight, fam, ls) {
    s = String(s == null ? '' : s);
    if (sheet.tw(s, size, weight, fam, ls) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (sheet.tw(s.slice(0, mid).trimEnd() + '…', size, weight, fam, ls) <= maxW) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, lo).trimEnd() + '…';
  };
  // Tek satır: boyutu küçülterek sığdır, olmazsa kısalt → { s, size }
  sheet.fitLine = function (s, maxW, size, min, weight, fam, ls) {
    s = String(s == null ? '' : s);
    for (let fs = size; fs >= min; fs -= 0.5) if (sheet.tw(s, fs, weight, fam, ls) <= maxW) return { s: s, size: fs };
    return { s: sheet.clip(s, maxW, min, weight, fam, ls), size: min };
  };
  // İki satıra dengeli böl (kelime sınırında); büyükten küçüğe boyut dene → { lines, size } | null
  sheet.wrap2 = function (s, maxW, size, min, weight, fam, ls) {
    const words = String(s || '').split(/\s+/).filter(Boolean);
    for (let fs = size; fs >= min; fs -= 0.5) {
      let best = null, bw = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const m = Math.max(sheet.tw(a, fs, weight, fam, ls), sheet.tw(b, fs, weight, fam, ls));
        if (m <= maxW && m < bw) { bw = m; best = [a, b]; }
      }
      if (best) return { lines: best, size: fs };
    }
    return null;
  };

  /* Künye yerleşimi (iki tema ortak): sağdan sola ölçerek bloklar arasına boşluk bırakır.
     th: temaya göre yazı özellikleri; sonuç: sütun konumları ve gösterge/istatistik ölçüleri. */
  function measureBlocks(info, th) {
    const stats = (info.stats || []).slice(0, 3);
    const lg = (info.legend || []).slice(0, 8);
    const rows = Math.min(4, lg.length);
    const cols = lg.length > 4 ? 2 : (lg.length ? 1 : 0);
    const colW = [0, 0];
    lg.forEach((it, i) => {
      const c = i < 4 ? 0 : 1;
      const lab = th.up ? String(it.label).toLocaleUpperCase('tr') : String(it.label);
      const sw = it.line ? th.lineW : th.swW;
      it._lab = lab; it._sw = sw;
      colW[c] = Math.max(colW[c], sw + th.swGap + sheet.tw(lab, th.lg.size, th.lg.weight, th.lg.fam, th.lg.ls));
    });
    const legW = cols ? colW[0] + (cols === 2 ? th.colGap + colW[1] : 0) : 0;
    let lw = 0, vw = 0;
    stats.forEach((r) => {
      const l = th.up ? String(r[0]).toLocaleUpperCase('tr') : String(r[0]);
      r._l = l;
      lw = Math.max(lw, sheet.tw(l, th.sl.size, th.sl.weight, th.sl.fam, th.sl.ls));
      vw = Math.max(vw, sheet.tw(r[1], th.sv.size, th.sv.weight, th.sv.fam, 0));
    });
    const stW = stats.length ? lw + th.stGap + vw : 0;
    const pcTxt = info.percent == null ? '—' : '%' + info.percent;
    const scL = th.up ? String(info.scoreLabel || 'Skor').toLocaleUpperCase('tr') : String(info.scoreLabel || 'Skor');
    const scW = Math.max(sheet.tw(pcTxt, th.sc.size, th.sc.weight, th.sc.fam, 0), sheet.tw(scL, th.scl.size, th.scl.weight, th.scl.fam, th.scl.ls));
    return { stats: stats, lg: lg, rows: rows, cols: cols, colW: colW, legW: legW, lw: lw, vw: vw, stW: stW, pcTxt: pcTxt, scL: scL, scW: scW };
  }

  // Ad + alt başlık: verilen genişliğe sığdır (gerekirse alt başlığı iki satıra böl)
  function titleBlock(P, info, x0, w, o) {
    const nm = sheet.fitLine(o.up ? String(info.name || 'Adsız proje').toLocaleUpperCase('tr') : String(info.name || 'Adsız proje'), w, o.nameMax, o.nameMin, o.nameW, 'd', o.nameLs);
    const sub = o.up ? String(info.subtitle || '').toLocaleUpperCase('tr') : String(info.subtitle || '');
    const tb = sheet.tb;
    let one = sheet.fitLine(sub, w, o.subSize, o.subMin, 600, 'b', o.subLs);
    const fits1 = sheet.tw(sub, one.size, 600, 'b', o.subLs) <= w;
    if (!fits1) {
      const two = sheet.wrap2(sub, w, Math.min(o.subSize, 13), o.subMin, 600, 'b', o.subLs);
      if (two) {
        const nf = Math.min(nm.size, 26);
        P.push({ t: 'text', x: x0, y: tb.y + 44, s: sheet.clip(nm.s, w, nf, o.nameW, 'd', o.nameLs), size: nf, weight: o.nameW, fam: 'd', fill: o.ink, ls: o.nameLs });
        two.lines.forEach((ln, i) => P.push({ t: 'text', x: x0, y: tb.y + 68 + i * (two.size + 6), s: ln, size: two.size, weight: 600, fam: 'b', fill: o.ink, ls: o.subLs, opacity: o.subOp }));
        return;
      }
    }
    P.push({ t: 'text', x: x0, y: tb.y + 56, s: nm.s, size: nm.size, weight: o.nameW, fam: 'd', fill: o.ink, ls: o.nameLs });
    P.push({ t: 'text', x: x0, y: tb.y + 84, s: one.s, size: one.size, weight: 600, fam: 'b', fill: o.ink, ls: o.subLs, opacity: o.subOp });
  }

  // Gösterge öğesi çizimi: it.fill (renkli işaret) ya da it.line (çizgi örneği)
  function legendItems(P, m, th, x0, tb) {
    const r = m.rows;
    const first = tb.y + 52 - (r - 1) * th.rowH / 2;
    m.lg.forEach((it, i) => {
      const c = i < 4 ? 0 : 1, row = i % 4;
      const x = x0 + (c ? m.colW[0] + th.colGap : 0);
      const cy = first + row * th.rowH, by = cy + th.lg.size * 0.36;
      if (it.line) {
        const L = it.line;
        P.push({ t: 'line', x1: x, y1: cy, x2: x + th.lineW, y2: cy, stroke: L.stroke, sw: L.sw, dash: L.dash, cap: L.cap, opacity: L.opacity });
        if (L.inner) P.push({ t: 'line', x1: x, y1: cy, x2: x + th.lineW, y2: cy, stroke: L.inner.stroke, sw: L.inner.sw });
      } else if (th.round) {
        P.push({ t: 'circle', cx: x + th.swW / 2, cy: cy, r: th.swW / 2, fill: it.fill, stroke: 'rgba(23,24,27,.28)', sw: 1.2 });
      } else {
        P.push({ t: 'rect', x: x, y: cy - th.swW / 2, w: th.swW, h: th.swW, fill: it.fill, stroke: PAL.ink, sw: 2 });
      }
      P.push({ t: 'text', x: x + it._sw + th.swGap, y: by, s: it._lab, size: th.lg.size, weight: th.lg.weight, fam: th.lg.fam, fill: th.ink, ls: th.lg.ls, opacity: th.lgOp });
    });
  }

  function statItems(P, m, th, sx, ex, tb) {
    const n = m.stats.length;
    const first = tb.y + 52 - (n - 1) * th.stH / 2;
    m.stats.forEach((r, i) => {
      const y = first + i * th.stH + th.sv.size * 0.36;
      P.push({ t: 'text', x: sx, y: y, s: r._l, size: th.sl.size, weight: th.sl.weight, fam: th.sl.fam, fill: th.ink, ls: th.sl.ls, opacity: th.slOp });
      P.push({ t: 'text', x: ex, y: y, s: r[1], size: th.sv.size, weight: th.sv.weight, fam: th.sv.fam, fill: th.ink, anchor: 'end' });
    });
  }

  /* ---------- çerçeve ---------- */
  function baseGlass(live) {
    const P = [];
    const W = sheet.W, H = sheet.H, F = sheet.F, tb = sheet.tb, ink = PAL.ink;
    if (!live) P.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: PAL.outer });
    const fill = live ? PAL.sheetLive : PAL.sheet;
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, fill: fill, shadow: { dx: 10, dy: 14, blur: 30, color: PAL.shade, css: 'var(--sheet-lo, ' + PAL.shade + ')' } });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, fill: fill, shadow: { dx: -8, dy: -8, blur: 20, color: 'rgba(255,255,255,.9)', css: 'var(--sheet-hi, rgba(255,255,255,.9))' } });
    for (let x = F + 50; x < W - F; x += 50) for (let y = F + 50; y < tb.y; y += 50) P.push({ t: 'circle', cx: x, cy: y, r: 1.5, fill: ink, opacity: 0.1 });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, stroke: ink, sw: 1.5, opacity: 0.1 });
    P.push({ t: 'line', x1: tb.x + 30, y1: tb.y, x2: tb.x + tb.w - 30, y2: tb.y, stroke: ink, sw: 1.5, opacity: 0.14 });
    return P;
  }

  function frameGlass(info, live) {
    const P = baseGlass(live);
    const tb = sheet.tb, ink = PAL.ink;
    const th = { ink: ink, up: false, round: true, swW: 13, lineW: 44, swGap: 9, colGap: 26, stGap: 22, rowH: 21, stH: 26, lgOp: 0.82, slOp: 0.5,
      lg: { size: 13, weight: 600, fam: 'b', ls: 0 }, sl: { size: 13, weight: 500, fam: 'b', ls: 0 }, sv: { size: 15, weight: 700, fam: 'b' },
      sc: { size: 50, weight: 300, fam: 'd' }, scl: { size: 13, weight: 600, fam: 'b', ls: 0 } };
    const m = measureBlocks(info, th);
    const GAP = 36;
    const rx = tb.x + tb.w - 36;
    const scX0 = rx - m.scW;
    let edge = scX0 - GAP;
    const stX1 = edge, stX0 = stX1 - m.stW;
    if (m.stW) edge = stX0 - GAP;
    const lgX0 = edge - m.legW;
    if (m.legW) edge = lgX0 - GAP;
    const x0 = tb.x + 36;
    titleBlock(P, info, x0, Math.max(160, edge - x0), { ink: ink, up: false, nameMax: 27, nameMin: 16, nameW: 400, nameLs: 0, subSize: 15, subMin: 12, subLs: 0, subOp: 0.5 });
    legendItems(P, m, th, lgX0, tb);
    statItems(P, m, th, stX0, stX1, tb);
    P.push({ t: 'text', x: rx, y: tb.y + 36, s: m.scL, size: 13, weight: 600, fam: 'b', fill: ink, opacity: 0.5, anchor: 'end' });
    P.push({ t: 'text', x: rx, y: tb.y + 84, s: m.pcTxt, size: 50, weight: 300, fam: 'd', fill: ink, anchor: 'end' });
    return P;
  }

  sheet.frame = function (info, live) { return frameGlass(info, live); };

  // Bölge göstergesi: yalnızca projede bulunan bölgeler
  sheet.zoneLegend = function (zones) {
    return App.ZONE_ORDER.filter((z) => zones.indexOf(z) >= 0).map((z) => ({ label: App.ZONES[z].label, fill: App.ZONES[z].fill }));
  };

  // Sahneyi (primitifler) PNG / PDF olarak indir
  sheet.exportScene = function (prims, W, H, baseName, kind) {
    const U = App.util;
    if (kind === 'png') return App.board.primsToCanvas(prims, W, H, 2).then((cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), 'image/png'))).then((blob) => App.files.saveBlob(U.slug(baseName) + '.png', blob));
    return App.board.primsToCanvas(prims, W, H, 2.5).then((cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), 'image/jpeg', 0.93)).then((b) => b.arrayBuffer()).then((buf) => App.files.buildPdf(new Uint8Array(buf), cv.width, cv.height, baseName))).then((blob) => App.files.saveBlob(U.slug(baseName) + '.pdf', blob));
  };
})();

/* ==========================================================================
   29-lib-multisel.js — Ortak çoklu seçim (kutu seçimi) ve toplu taşıma yardımcıları
   Kütle / öğe çizen her araç (Mekân Etüdü, Vaziyet Planı, Kolaj, Pafta Şablonu, İşlev Şeması) aynı davranışı kullanır:
     boş alanda sürükle → kutu çizilir, kutuya değen öğeler seçilir · Shift+tık → seçime ekle / çıkar
     seçili öğelerden birini sürükle → hepsi birlikte taşınır · ok tuşları → hepsini kaydırır · Esc → seçimi bırak
   Bu dosya yalnızca ortak geometri ve çizimi içerir; öğe kaydı her aracın kendi durumunda tutulur.
   Kutu kayıtları: { id, x0, y0, x1, y1 } (aracın kendi koordinat sisteminde).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ms = (App.multi = {});

  /* a: başlangıç, b: şimdiki nokta. Sağdan sola çizilen kutu (cross) değen her şeyi, soldan sağa çizilen kutu yalnızca tamamen içindekileri seçer (CAD kuralı) */
  ms.rect = (a, b) => ({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), cross: b[0] < a[0] });
  ms.hit = (r, boxes) => boxes.filter((q) => (r.cross
    ? q.x1 >= r.x0 && q.x0 <= r.x1 && q.y1 >= r.y0 && q.y0 <= r.y1
    : q.x0 >= r.x0 - 0.01 && q.x1 <= r.x1 + 0.01 && q.y0 >= r.y0 - 0.01 && q.y1 <= r.y1 + 0.01)).map((q) => q.id);
  ms.bounds = function (boxes) {
    if (!boxes.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    boxes.forEach((q) => { x0 = Math.min(x0, q.x0); y0 = Math.min(y0, q.y0); x1 = Math.max(x1, q.x1); y1 = Math.max(y1, q.y1); });
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  };
  ms.toggle = (list, id) => (list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat([id]));
  ms.merge = (list, ids, add) => (add ? list.concat(ids.filter((x) => list.indexOf(x) < 0)) : ids.slice());
  ms.has = (list, id) => list.indexOf(id) >= 0;
  ms.DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  /* ekran (SVG px) koordinatında seçim kutusu */
  ms.marquee = function (r) {
    return h('rect', { key: 'ms-box', class: 'ms-rect', x: r.x0, y: r.y0, width: Math.max(0, r.x1 - r.x0), height: Math.max(0, r.y1 - r.y0), fill: App.PAL.ink, 'fill-opacity': r.cross ? 0.05 : 0.09, stroke: App.PAL.ink, 'stroke-width': 1.5, 'stroke-dasharray': r.cross ? '6 4' : null, 'pointer-events': 'none' });
  };
  /* ekran koordinatında grup çerçevesi (taşınabilir olduğunu gösterir) */
  ms.frame = function (r, pad) {
    pad = pad == null ? 6 : pad;
    return h('rect', { key: 'ms-frame', class: 'ms-frame', x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + pad * 2, height: r.y1 - r.y0 + pad * 2, fill: 'none', stroke: App.PAL.ink, 'stroke-opacity': 0.55, 'stroke-width': 1.2, 'pointer-events': 'none' });
  };
  /* üstteki "N öğe seçili" çipi (arayüz bileşeni) */
  ms.HINT = 'Kutuyu soldan sağa çizerseniz yalnızca tamamen içine alınanlar, sağdan sola çizerseniz değenler seçilir';
  ms.chip = function (n, o) {
    return h('div', { class: 'an-chip ms-chip', role: 'status' }, h('b', {}, n + ' ' + (o.noun || 'öğe') + ' seçili'), h('span', { class: 'mono' }, 'sürükleyerek birlikte taşıyın · ok tuşları · Esc bırakır'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: o.onclear }, App.ui.icon('close', 14)));
  };
})();

/* ==========================================================================
   29-lib-pdf.js — bağımlılıksız çok sayfalı PDF yazıcı (JPEG sayfalar, A3 yatay)
   App.pdf.build(pages, { title, author, subject }) → Blob
   pages: [{ jpeg: Uint8Array, w, h, title? }]  (görüntü sayfaya oran korunarak oturtulur)
   Sayfa başlıkları PDF yer imi (outline) olarak yazılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const pdf = (App.pdf = {});
  const PW = 1190.55, PH = 841.89; // A3 yatay (pt)

  // PDF metin dizgesi (UTF-16BE, BOM'lu): Türkçe karakterler yer imlerinde bozulmaz
  function hexStr(s) {
    let h = 'FEFF';
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0');
    return '<' + h + '>';
  }

  pdf.build = function (pages, opt) {
    opt = opt || {};
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offs = [];
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const n = pages.length;
    // nesne numaraları: 1 katalog · 2 sayfa ağacı · 3 bilgi · 4 outline kökü · 5..4+n outline öğeleri · sonra her sayfa için 3 nesne
    const outBase = 5, pgBase = outBase + n;
    const pageId = (i) => pgBase + i * 3, imgId = (i) => pgBase + i * 3 + 1, ctId = (i) => pgBase + i * 3 + 2;
    const total = pgBase + n * 3 - 1;
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const obj = (id, body) => { offs[id] = len; push(id + ' 0 obj\n' + body + '\nendobj\n'); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R /PageMode /UseOutlines >>');
    obj(2, '<< /Type /Pages /Kids [' + pages.map((_, i) => pageId(i) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
    obj(3, '<< /Title ' + hexStr(opt.title || 'archtools raporu') + ' /Author ' + hexStr(opt.author || 'archtools') + ' /Subject ' + hexStr(opt.subject || '') + ' /Producer (archtools) >>');
    obj(4, '<< /Type /Outlines /First ' + outBase + ' 0 R /Last ' + (outBase + n - 1) + ' 0 R /Count ' + n + ' >>');
    pages.forEach((p, i) => {
      const prev = i ? ' /Prev ' + (outBase + i - 1) + ' 0 R' : '', next = i < n - 1 ? ' /Next ' + (outBase + i + 1) + ' 0 R' : '';
      obj(outBase + i, '<< /Title ' + hexStr(p.title || 'Sayfa ' + (i + 1)) + ' /Parent 4 0 R' + prev + next + ' /Dest [' + pageId(i) + ' 0 R /Fit] >>');
    });
    pages.forEach((p, i) => {
      obj(pageId(i), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + imgId(i) + ' 0 R >> >> /Contents ' + ctId(i) + ' 0 R >>');
      offs[imgId(i)] = len;
      push(imgId(i) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
      push(p.jpeg); push('\nendstream\nendobj\n');
      const s = Math.min(PW / p.w, PH / p.h), dw = p.w * s, dh = p.h * s;
      const content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + ((PW - dw) / 2).toFixed(2) + ' ' + ((PH - dh) / 2).toFixed(2) + ' cm /Im0 Do Q';
      obj(ctId(i), '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    });
    const xref = len;
    let x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  };
})();

/* ==========================================================================
   30-state.js — proje modeli, reducer (geri al/ileri al), türetilmiş veriler, otomatik kayıt
   Proje modeli: { meta, spaces: [{id,name,area,zone,x,y}], relations: {"idA|idB": "strong|weak|avoid"} }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;

  const STORE_KEY = 'islev-semasi:v1:autosave';

  /* ---------------- proje üretimi ---------------- */
  function createFromTemplate(typeKey, variantKey, opts) {
    opts = opts || {};
    const type = App.kb.type(typeKey);
    const v = App.kb.variant(typeKey, variantKey);
    const entries = v.entries.filter((e) => e.req);
    const idByKey = {};
    const spaces = entries.map((e) => {
      const id = U.uid() + e.key;
      idByKey[e.key] = id;
      return { id: id, name: e.name, area: App.analyze.defaultArea(e), zone: e.zone, x: geo.W / 2, y: geo.H / 2 };
    });
    const relations = {};
    v.relations.forEach((r) => {
      if (idByKey[r[0]] && idByKey[r[1]]) relations[U.pairKey(idByKey[r[0]], idByKey[r[1]])] = r[2];
    });
    const k = geo.scale(spaces);
    const pos = App.layout.auto(spaces, relations, k, {});
    spaces.forEach((s) => { if (pos[s.id]) { s.x = pos[s.id].x; s.y = pos[s.id].y; } });
    if (opts.messy && spaces.length > 3) {
      // örnek proje: bilerek dağınık başlar → "Otomatik yerleştir" farkı hemen gösterir
      const pts = spaces.map((s) => ({ x: s.x, y: s.y }));
      const n = spaces.length;
      let best = null;
      for (let shift = 1; shift < n; shift++) {
        const moved = spaces.map((s, i) => Object.assign({}, s, pts[(i + shift) % n]));
        const pc = App.score.evaluate(moved, relations, k).percent;
        if (pc != null && (best === null || pc < best.pc)) best = { pc: pc, shift: shift };
      }
      if (best) spaces.forEach((s, i) => { const q = pts[(i + best.shift) % n]; s.x = q.x; s.y = q.y; });
    }
    return {
      meta: { name: opts.name || (opts.messy ? 'Örnek: ' : '') + v.label + ' ' + type.label, buildingType: type.key, variant: v.key, createdAt: new Date().toISOString(), example: !!opts.messy },
      spaces: spaces,
      relations: relations,
    };
  }

  function emptyProject() {
    return { meta: { name: 'Yeni proje', buildingType: 'konut', variant: '2+1', createdAt: new Date().toISOString(), example: false }, spaces: [], relations: {} };
  }

  /* ---------------- otomatik kayıt (kişisel kolaylık) ---------------- */
  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return App.files.fromJSON(raw);
    } catch (e) { return null; }
  }
  function persist(project) {
    try {
      const k = geo.scale(project.spaces);
      App.autosaving = true; // görseller (büyük) otomatik kayda yazılmaz; IndexedDB'de saklanır
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(App.files.toJSON(project, k, null, null))); } finally { App.autosaving = false; }
    } catch (e) { /* depolama yoksa sessizce atla */ }
  }
  function clearSaved() { try { window.localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* ---------------- başlangıç durumu ---------------- */
  function initialState() {
    const saved = loadSaved();
    let project = saved || createFromTemplate('konut', '2+1', { messy: true });
    if (App.study && !project.study) project = Object.assign({}, project, { study: App.study.init(project) });
    if (App.site && !project.site) project = Object.assign({}, project, App.site.init());
    if (App.design && !project.design) project = Object.assign({}, project, { design: App.design.defaults() });
    if (App.cost && !project.fiz) project = Object.assign({}, project, { fiz: App.cost.defaults() });
    if (App.plan && !project.plan) project = Object.assign({}, project, { plan: App.plan.defaults() });
    if (App.collage && !project.collage) project = Object.assign({}, project, { collage: App.collage.defaults() });
    if (App.tpl && !project.tpl) project = Object.assign({}, project, { tpl: App.tpl.defaults() });
    if (App.colors && !project.colors) project = Object.assign({}, project, { colors: App.colors.defaults() });
    return {
      project: project,
      past: [], future: [],
      selectedId: null,
      restored: !!saved,
      ui: {
        module: 'islev', tab: 'spaces', assistantOpen: false, asTab: 'analysis', messages: [], toast: null, highlight: null,
        stTab: 'katlar', anTab: 'gorunum', an: App.analysisDefaults ? App.analysisDefaults() : {},
        site: App.siteUi ? App.siteUi.arsa() : {}, imar: App.siteUi ? App.siteUi.imar() : {}, yer: App.siteUi ? App.siteUi.yer() : {}, dsn: App.dsnUi ? App.dsnUi.dsn() : {}, fiz: App.dsnUi ? App.dsnUi.fiz() : {}, etut: App.etutDefaults ? App.etutDefaults() : {}, pe: App.peDefaults ? App.peDefaults() : {}, plan: App.planDefaults ? App.planDefaults() : {}, col: App.collageDefaults ? App.collageDefaults() : {}, tpl: App.tplDefaults ? App.tplDefaults() : {}, geo: { busy: null, msg: '', err: null },
        form: { name: '', area: '' }, tplType: project.meta.buildingType, tplVariant: project.meta.variant,
        busy: null, hintDismissed: false, ms: [], mq: null, color: readColor(), view: null, vp: null, focus: false, tool: 'select', sp: false,
      },
    };
  }

  // "Beni renklendir!" tercihi: yalnızca { on, p } okunur; geçersiz her şey varsayılana düşer
  function readColor() {
    const d = { on: false, p: App.colortheme.DEFAULT };
    try {
      const o = JSON.parse(window.localStorage.getItem('archtools.color') || 'null');
      if (o && typeof o === 'object' && typeof o.p === 'string' && App.palettes.get(o.p)) return { on: o.on === true, p: o.p };
    } catch (e) {}
    return d;
  }

  /* ---------------- reducer ---------------- */
  const HISTORY = 60;
  // geri al/ileri al: kat etüdü (study), arsa / imar (site) ve aday konumlar (cand) da projeyle birlikte geri alınır
  function snap(project) { return { meta: project.meta, spaces: project.spaces, relations: project.relations, study: project.study, site: project.site, cand: project.cand, design: project.design, fiz: project.fiz, plan: project.plan, collage: project.collage, tpl: project.tpl, colors: project.colors }; }
  function withHistory(state, project) {
    const meta = project.meta.example ? Object.assign({}, project.meta, { example: false }) : project.meta;
    return Object.assign({}, state, {
      project: Object.assign({}, project, { meta: meta }),
      past: state.past.concat([snap(state.project)]).slice(-HISTORY),
      future: [],
    });
  }
  const setUi = (state, patch) => Object.assign({}, state, { ui: Object.assign({}, state.ui, patch) });

  function reducer(state, a) {
    const P = state.project;
    switch (a.type) {
      case 'ADD_SPACES': {
        const spaces = P.spaces.slice();
        const ids = [];
        a.list.forEach((it) => {
          const area = U.clamp(Number(it.area) || 10, 0.5, 100000);
          const item = { id: U.uid(), name: String(it.name || 'Mekân').slice(0, 60), area: area, zone: App.ZONES[it.zone] ? it.zone : App.match.zoneFor(it.name, P.meta.buildingType, P.meta.variant), x: geo.W / 2, y: geo.H / 2 };
          const k = geo.scale(spaces.concat(item));
          const vw = state.ui.view; // tuvalde paftanın dışına kaydırılmışsa yeni daire görünen alanın ortasına gelir
          const pos = App.layout.freeSpot(spaces, area, k, vw ? { x: vw.cx, y: vw.cy } : null);
          item.x = pos.x; item.y = pos.y;
          spaces.push(item);
          ids.push(item.id);
        });
        if (a.list.length > 2) {
          const k = geo.scale(spaces);
          // paftanın dışına bırakılmış daireler yerinde kalır (yalnızca engel sayılır)
          const away = spaces.filter((s) => !geo.inSheet(s.x, s.y)).map((s) => s.id);
          const pos = App.layout.auto(spaces, P.relations, k, { keep: true, iter: 260, fixed: away });
          spaces.forEach((s) => { if (pos[s.id]) { s.x = pos[s.id].x; s.y = pos[s.id].y; } });
        }
        const next = withHistory(state, Object.assign({}, P, { spaces: spaces }));
        next.selectedId = ids[ids.length - 1];
        return next;
      }
      case 'UPDATE_SPACE': {
        const spaces = P.spaces.map((s) => {
          if (s.id !== a.id) return s;
          const patch = {};
          if (a.patch.name != null) patch.name = String(a.patch.name).slice(0, 60);
          if (a.patch.area != null) { const v = Number(a.patch.area); if (v > 0) patch.area = U.clamp(v, 0.5, 100000); }
          if (a.patch.zone != null && App.ZONES[a.patch.zone]) patch.zone = a.patch.zone;
          return Object.assign({}, s, patch);
        });
        return withHistory(state, Object.assign({}, P, { spaces: spaces }));
      }
      case 'REMOVE_SPACE': {
        const spaces = P.spaces.filter((s) => s.id !== a.id);
        const rel = {};
        Object.keys(P.relations).forEach((key) => { if (key.split('|').indexOf(a.id) < 0) rel[key] = P.relations[key]; });
        const next = withHistory(state, Object.assign({}, P, { spaces: spaces, relations: rel }));
        if (state.selectedId === a.id) next.selectedId = null;
        return next;
      }
      case 'DRAG_START': return Object.assign({}, state, { past: state.past.concat([snap(P)]).slice(-HISTORY), future: [], project: P.meta.example ? Object.assign({}, P, { meta: Object.assign({}, P.meta, { example: false }) }) : P });
      case 'SNAPSHOT': return Object.assign({}, state, { past: state.past.concat([snap(P)]).slice(-HISTORY), future: [] });
      case 'MOVE': {
        const spaces = P.spaces.map((s) => (s.id === a.id ? Object.assign({}, s, { x: a.x, y: a.y }) : s));
        return Object.assign({}, state, { project: Object.assign({}, P, { spaces: spaces }) });
      }
      case 'SET_POSITIONS': {
        const spaces = P.spaces.map((s) => (a.positions[s.id] ? Object.assign({}, s, { x: a.positions[s.id].x, y: a.positions[s.id].y }) : s));
        return Object.assign({}, state, { project: Object.assign({}, P, { spaces: spaces }) });
      }
      case 'SET_RELATION': {
        const key = U.pairKey(a.a, a.b);
        if (a.a === a.b) return state;
        const rel = Object.assign({}, P.relations);
        if (a.rel === 'none') delete rel[key]; else rel[key] = a.rel;
        if ((P.relations[key] || 'none') === a.rel) return state;
        return withHistory(state, Object.assign({}, P, { relations: rel }));
      }
      case 'CYCLE_RELATION': {
        const key = U.pairKey(a.a, a.b);
        const cur = P.relations[key] || 'none';
        const nxt = App.REL_CYCLE[(App.REL_CYCLE.indexOf(cur) + 1) % App.REL_CYCLE.length];
        return reducer(state, { type: 'SET_RELATION', a: a.a, b: a.b, rel: nxt });
      }
      case 'SET_META': return withHistory(state, Object.assign({}, P, { meta: Object.assign({}, P.meta, a.patch) }));
      case 'LOAD_PROJECT': {
        const next = withHistory(state, a.project);
        next.project = a.project;
        next.selectedId = null;
        next.ui = Object.assign({}, state.ui, { tplType: a.project.meta.buildingType, tplVariant: a.project.meta.variant, view: null });
        return next;
      }
      case 'UNDO': {
        if (!state.past.length) return state;
        const prev = state.past[state.past.length - 1];
        return Object.assign({}, state, { project: Object.assign({}, prev), past: state.past.slice(0, -1), future: [snap(P)].concat(state.future), selectedId: prev.spaces.some((s) => s.id === state.selectedId) ? state.selectedId : null });
      }
      case 'REDO': {
        if (!state.future.length) return state;
        const nx = state.future[0];
        return Object.assign({}, state, { project: Object.assign({}, nx), past: state.past.concat([snap(P)]), future: state.future.slice(1) });
      }
      case 'SELECT': return state.selectedId === a.id ? state : Object.assign({}, state, { selectedId: a.id });
      case 'UI': return setUi(state, a.patch);
      case 'FORM': return setUi(state, { form: Object.assign({}, state.ui.form, a.patch) });
      case 'TOAST': return setUi(state, { toast: { msg: a.msg, kind: a.kind || 'info', id: Date.now() } });
      case 'CLEAR_TOAST': return state.ui.toast ? setUi(state, { toast: null }) : state;
      case 'CHAT_ADD': return setUi(state, { messages: state.ui.messages.concat([a.msg]).slice(-30) });
      case 'HIGHLIGHT': return setUi(state, { highlight: a.pair });
      default: return state;
    }
  }

  /* ---------------- modül eklentileri ----------------
     Diğer modüller (kat etüdü vb.) kendi eylemlerini hook ile ekler: fn(next, action, prev) → yeni state | undefined */
  const hooks = [];
  function rootReducer(state, a) {
    let next = reducer(state, a);
    for (let i = 0; i < hooks.length; i++) { const r = hooks[i](next, a, state); if (r) next = r; }
    return next;
  }

  /* ---------------- türetilmiş veriler (önbellekli) ---------------- */
  let memo = { project: null, out: null };
  function derive(state) {
    if (memo.project === state.project) return memo.out;
    const k = geo.scale(state.project.spaces);
    const score = App.score.evaluate(state.project.spaces, state.project.relations, k);
    const analysis = App.analyze.run(state.project, k, score);
    memo = { project: state.project, out: { k: k, score: score, analysis: analysis } };
    return memo.out;
  }

  App.state = { createFromTemplate: createFromTemplate, emptyProject: emptyProject, initialState: initialState, reducer: rootReducer, derive: derive, persist: persist, clearSaved: clearSaved, hooks: hooks, withHistory: withHistory, snap: snap, setUi: setUi, HISTORY: HISTORY };
})();

/* ==========================================================================
   31-state-colors.js — renk paleti: kategori (bölge) ve tek daire rengi
   Model:  project.colors = { v: 1, zones: { <bölge>: ref }, spaces: { <mekânId>: ref } }
           ref = { p: 'cp4816', i: 2, hex: '#E19D29' }   (p/i palet kaynağını gösterir; hex her zaman geçerli renktir)
   Öncelik: tek daire > kategori > palet varsayılanı (13-lib-colortheme.js). Özel renkler yalnızca "Beni renklendir!"
   açıkken çizilir; monokrom kipte veri korunur ama gösterilmez.
   JSON uzantısı: extensions.colorPalette  (kullanılan paletlerin hex listesi dahil → dosya tek başına açılır;
   ui: { on, palette } arayüz renk kipini taşır, dosya açılınca aynı görünüm gelir)
   ========================================================================== */
(function () {
  const App = window.App;
  const PL = App.palettes;

  const defaults = () => ({ v: 1, zones: {}, spaces: {} });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // geçerli bir başvuru üretir; palet bilinmiyorsa yalnızca hex kalır
  function makeRef(p, i, hex) {
    const pal = PL.get(p);
    const idx = Number(i);
    let h = PL.isHex(hex) ? hex.toUpperCase() : null;
    if (pal && idx >= 0 && idx < pal.colors.length && Math.floor(idx) === idx) h = h || pal.colors[idx];
    if (!h) return null;
    const ref = { hex: h };
    if (pal && idx >= 0 && idx < pal.colors.length && pal.colors[idx].toUpperCase() === h) { ref.p = pal.id; ref.i = idx; }
    return ref;
  }

  const on = () => App.colortheme.isOn();
  const readable = (fill) => PL.textOn(fill, App.PAL.ink, App.PAL.paper);

  /* ---------- çözümleme ---------- */
  function zoneRef(project, zone) { const c = project && project.colors; return c && c.zones && own(c.zones, zone) ? c.zones[zone] : null; }
  function spaceRef(project, id) { const c = project && project.colors; return c && c.spaces && own(c.spaces, id) ? c.spaces[id] : null; }
  const pack = (ref) => ({ fill: ref.hex, text: readable(ref.hex), custom: true, ref: ref });

  function zoneColor(project, zone) {
    const z = App.ZONES[zone] || App.ZONES.sosyal;
    const r = on() ? zoneRef(project, zone) : null;
    return r ? pack(r) : { fill: z.fill, text: z.text, custom: false, ref: null };
  }
  function spaceColor(project, s) {
    const r = on() ? spaceRef(project, s.id) : null;
    return r ? pack(r) : zoneColor(project, s.zone);
  }
  // 'space' | 'zone' | null — rengin nereden geldiği (arayüzde "özel" rozeti için)
  function sourceOf(project, s) { return spaceRef(project, s.id) ? 'space' : zoneRef(project, s.zone) ? 'zone' : null; }

  /* ---------- eylemler (reducer eklentisi) ---------- */
  function applyRefs(P, scope, keys, ref) {
    const c = P.colors || defaults();
    const bag = Object.assign({}, scope === 'zone' ? c.zones : c.spaces);
    keys.forEach((k) => { if (ref) bag[k] = ref; else delete bag[k]; });
    return Object.assign({}, c, scope === 'zone' ? { zones: bag } : { spaces: bag });
  }

  App.state.hooks.push(function (next, a) {
    const P = next.project;
    switch (a.type) {
      case 'COLOR_SET': {
        // { scope:'zone'|'space', keys:[…], ref:{p,i,hex}|null }
        const ref = a.ref ? makeRef(a.ref.p, a.ref.i, a.ref.hex) : null;
        if (a.ref && !ref) return next;
        const keys = (a.keys || []).filter((k) => (a.scope === 'zone' ? App.ZONES[k] : P.spaces.some((s) => s.id === k)));
        if (!keys.length) return next;
        const before = P.colors || defaults();
        const bag = a.scope === 'zone' ? before.zones : before.spaces;
        if (keys.every((k) => (ref ? bag[k] && bag[k].hex === ref.hex : !bag[k]))) return next; // değişiklik yok
        return App.state.withHistory(next, Object.assign({}, P, { colors: applyRefs(P, a.scope, keys, ref) }));
      }
      case 'COLOR_DISTRIBUTE': {
        // seçilen paletin renklerini projede kullanılan kategorilere sırayla dağıtır
        const pal = PL.get(a.palette);
        if (!pal) return next;
        const used = App.ZONE_ORDER.filter((z) => P.spaces.some((s) => s.zone === z));
        const zones = {};
        (used.length ? used : App.ZONE_ORDER).forEach((z, n) => { zones[z] = makeRef(pal.id, n % pal.colors.length); });
        return App.state.withHistory(next, Object.assign({}, P, { colors: Object.assign({}, P.colors || defaults(), { zones: zones, spaces: {} }) }));
      }
      case 'COLOR_RESET': {
        // 'all' | 'zones' | 'spaces'
        const c = P.colors || defaults();
        const nz = a.what === 'spaces' ? c.zones : {};
        const ns = a.what === 'zones' ? c.spaces : {};
        if (!Object.keys(c.zones).length && !Object.keys(c.spaces).length) return next;
        return App.state.withHistory(next, Object.assign({}, P, { colors: Object.assign({}, c, { zones: nz, spaces: ns }) }));
      }
      case 'REMOVE_SPACE': {
        if (!P.colors || !P.colors.spaces || !own(P.colors.spaces, a.id)) return next;
        const sp = Object.assign({}, P.colors.spaces); delete sp[a.id];
        return Object.assign({}, next, { project: Object.assign({}, P, { colors: Object.assign({}, P.colors, { spaces: sp }) }) });
      }
    }
    return next;
  });

  /* ---------- JSON: extensions.colorPalette ---------- */
  const refOut = (r) => ({ palette: r.p || null, index: r.p ? r.i : null, hex: r.hex });
  function toExt(project) {
    const c = project.colors;
    const ui = App.store && App.store.get().ui.color;
    const uiOn = !!(ui && ui.on && PL.get(ui.p));
    if (!c && !uiOn) return {};
    const ids = new Set(project.spaces.map((s) => s.id));
    const zones = {}, spaces = {}, used = new Set();
    if (!c) return { colorPalette: { version: 2, source: PL.source, ui: { on: true, palette: ui.p }, palettes: [{ id: ui.p, name: PL.get(ui.p).name, url: PL.get(ui.p).url, colors: PL.get(ui.p).colors.slice() }], zones: {}, spaces: {} } };
    if (uiOn) used.add(ui.p);
    Object.keys(c.zones || {}).forEach((z) => { if (App.ZONES[z]) { zones[z] = refOut(c.zones[z]); if (c.zones[z].p) used.add(c.zones[z].p); } });
    Object.keys(c.spaces || {}).forEach((id) => { if (ids.has(id)) { spaces[id] = refOut(c.spaces[id]); if (c.spaces[id].p) used.add(c.spaces[id].p); } });
    if (!Object.keys(zones).length && !Object.keys(spaces).length && !uiOn) return {};
    return {
      colorPalette: {
        version: 2, source: PL.source, ui: { on: uiOn, palette: uiOn ? ui.p : null },
        palettes: Array.from(used).sort().map((id) => ({ id: id, name: PL.get(id).name, url: PL.get(id).url, colors: PL.get(id).colors.slice() })),
        zones: zones, spaces: spaces,
      },
    };
  }
  function fromExt(x, project) {
    if (!x || typeof x !== 'object') return null;
    const embedded = {};
    (Array.isArray(x.palettes) ? x.palettes : []).forEach((p) => { if (p && Array.isArray(p.colors)) embedded[p.id] = p.colors; });
    const read = (r) => {
      if (!r || typeof r !== 'object') return null;
      const col = embedded[r.palette];
      // dosyada gömülü palet varsa onun, yoksa yerleşik listenin renkleri; her durumda hex önceliklidir
      const hex = PL.isHex(r.hex) ? r.hex : col && PL.isHex(col[r.index]) ? col[r.index] : null;
      return makeRef(r.palette, r.index, hex);
    };
    const c = defaults();
    Object.keys(x.zones || {}).forEach((z) => { const r = App.ZONES[z] ? read(x.zones[z]) : null; if (r) c.zones[z] = r; });
    const ids = new Set(project.spaces.map((s) => s.id));
    Object.keys(x.spaces || {}).forEach((id) => { const r = ids.has(id) ? read(x.spaces[id]) : null; if (r) c.spaces[id] = r; });
    return c;
  }
  App.extProviders = App.extProviders || [];
  App.extProviders.push(toExt);
  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext, project) { const c = fromExt(ext && ext.colorPalette, project); return c ? { colors: c } : {}; });

  // dosyadaki arayüz renk kipi (varsa): { on, p } — ctl.onFile projeyi yükledikten sonra uygular
  function uiFromExt(ext) {
    const x = ext && ext.colorPalette;
    if (!x || typeof x !== 'object' || !x.ui || typeof x.ui !== 'object') return null;
    const pal = typeof x.ui.palette === 'string' ? PL.get(x.ui.palette) : null; // yalnızca yerleşik paletler arayüz paleti olabilir
    if (x.ui.on === true && pal) return { on: true, p: pal.id };
    return x.ui.on === false ? { on: false, p: pal ? pal.id : null } : null;
  }

  App.colors = { uiFromExt: uiFromExt, defaults: defaults, makeRef: makeRef, zone: zoneColor, space: spaceColor, sourceOf: sourceOf, active: on, toExt: toExt, fromExt: fromExt };
})();

/* ==========================================================================
   40-ui-common.js — ikonlar ve ortak arayüz yardımcıları
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = (App.ui = App.ui || {});

  const ICONS = {
    save: ['M12 3v12m0 0l-4-4m4 4l4-4', 'M4 20h16'],
    open: ['M12 16V4m0 0L8 8m4-4l4 4', 'M4 20h16'],
    image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', { c: [9, 9, 1.5] }],
    pdf: ['M6 3h8l4 4v14H6z', 'M14 3v5h4', 'M9 14h6M9 17h6'],
    undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 010 12h-4'],
    redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 000 12h4'],
    layout: ['M3 12a9 9 0 0115-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 01-15 6.7L3 16', 'M3 21v-5h5'],
    plus: ['M12 5v14M5 12h14'],
    minus: ['M5 12h14'],
    fit: ['M4 8V5.5A1.5 1.5 0 015.5 4H8', 'M16 4h2.5A1.5 1.5 0 0120 5.5V8', 'M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16', 'M8 20H5.5A1.5 1.5 0 014 18.5V16', 'M12 12h.01'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
    close: ['M6 6l12 12M18 6L6 18'],
    chevron: ['M9 6l6 6-6 6'],
    newdoc: ['M6 3h8l4 4v14H6z', 'M14 3v5h4', 'M12 11v6M9 14h6'],
    spark: ['M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z'],
    send: ['M4 12l16-8-6 16-3-7z'],
    pin: ['M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z', { c: [12, 10, 2.5] }],
    check: ['M5 12l5 5 9-10'],
    layers: ['M12 2.5l9 4.7-9 4.7-9-4.7z', 'M3 12l9 4.7 9-4.7', 'M3 16.8l9 4.7 9-4.7'],
    reset: ['M3 12a9 9 0 103-6.7', 'M3 4v5h5'],
    play: ['M7 4l13 8-13 8z'],
    search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M21 21l-5-5'],
    share: ['M4 12v7h16v-7', 'M12 3v12', 'M8 7l4-4 4 4'],
    help: [{ c: [12, 12, 9] }, 'M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4', 'M12 17.5v.01'],
    target: [{ c: [12, 12, 8] }, { c: [12, 12, 2.5] }, 'M12 2v4M12 18v4M2 12h4M18 12h4'],
    parcel: ['M4 9l8-5 8 6-3 10H6z'],
    draw: ['M4 20l4-1 11-11-3-3L5 16z'],
    rect: ['M4 6.5h16v11H4z'],
    expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
    shrink: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
    poly: ['M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z'],
    shapeL: ['M5 4h8v7h6v9H5z'],
    shapeT: ['M4 4h16v6h-5v10H9v-10H4z'],
    shapeU: ['M4 4h5v10h6V4h5v16H4z'],
    rotate: ['M20 12a8 8 0 11-2.7-6', 'M20 4v5h-5'],
    link: ['M10 14l4-4', 'M8 12l-2 2a3.5 3.5 0 005 5l2-2', 'M16 12l2-2a3.5 3.5 0 00-5-5l-2 2'],
    grid: ['M4 4h16v16H4z', 'M4 12h16M12 4v16'],
    cube: ['M12 2.5l8 4.5v10l-8 4.5-8-4.5V7z', 'M4 7l8 4.5L20 7', 'M12 11.5v10'],
    sun: [{ c: [12, 12, 4] }, 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'],
    copy: ['M8 8h11v12H8z', 'M5 16V4h11'],
    compare: ['M4 6h7v12H4z', 'M13 9h7v9h-7z'],
    download: ['M12 4v11m0 0l-4-4m4 4l4-4', 'M4 20h16'],
    marquee: ['M4 4h3M10 4h4M17 4h3', 'M20 4v3M20 10v4M20 17v3', 'M4 20h3M10 20h4M17 20h3', 'M4 4v3M4 10v4M4 17v3'],
    hand: ['M8 13V6.5a1.5 1.5 0 013 0V12', 'M11 11V4.5a1.5 1.5 0 013 0V11', 'M14 11V6a1.5 1.5 0 013 0v7.5c0 4-2.2 7-6 7-3 0-4.2-1.8-6-4.8l-1.6-2.6a1.5 1.5 0 012.6-1.5L8 14'],
    selall: ['M4 4h16v16H4z', 'M8 12.5l3 3 5-6.5'],
    user: [{ c: [12, 8, 4] }, 'M4.5 21c0-4.3 3.4-7 7.5-7s7.5 2.7 7.5 7'],
    palette: ['M12 3a9 9 0 100 18c1.4 0 2-1 2-2 0-1.6-1.6-1.9-1.6-3.2 0-1 .8-1.8 1.9-1.8H17a4 4 0 004-4c0-3.9-4-7-9-7z', { c: [7.5, 11, 1.1] }, { c: [10, 7, 1.1] }, { c: [14.5, 7, 1.1] }],
  };

  ui.icon = function (name, size) {
    const s = size || 18;
    const kids = (ICONS[name] || []).map((d) => (typeof d === 'string' ? h('path', { d: d }) : h('circle', { cx: d.c[0], cy: d.c[1], r: d.c[2] })));
    return h('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ico' }, kids);
  };

  // marka işareti: üç geometrik form, tek renk
  ui.logo = function () { return ui.glass.logo(); };

  ui.btn = function (label, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'btn ' + (opts.cls || ''), onclick: opts.onclick, title: opts.title || null, disabled: !!opts.disabled, id: opts.id || null, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) },
      opts.icon ? ui.icon(opts.icon, opts.iconSize) : null,
      label ? h('span', { class: opts.labelCls || '' }, label) : null,
      opts.badge ? h('span', { class: 'badge' + (opts.badgePulse ? ' pulse-badge' : '') }, opts.badge) : null);
  };

  ui.levelLabel = { hata: 'Hata', uyari: 'Uyarı', oneri: 'Öneri', ok: 'Tamam' };

  // kategori noktası: renk kipinde kategori paleti rengini de gösterir
  ui.zoneDot = function (zone) {
    const z = App.ZONES[zone] || App.ZONES.sosyal;
    const c = App.colors && App.store ? App.colors.zone(App.store.get().project, zone) : z;
    return h('span', { class: 'dot', style: { background: c.fill }, title: z.label });
  };
  // mekân noktası: tek daire rengi > kategori rengi
  ui.spaceDot = function (s) {
    const z = App.ZONES[s.zone] || App.ZONES.sosyal;
    const c = App.colors && App.store ? App.colors.space(App.store.get().project, s) : z;
    return h('span', { class: 'dot', style: { background: c.fill }, title: z.label });
  };
})();

/* ==========================================================================
   41-ui-top.js — üst çubuk: proje, kaydet/yükle, dışa aktar (ayrıntı: 46-ui-glass.js)
   ========================================================================== */
(function () {
  const App = window.App;
  const ui = App.ui;

  ui.header = function (state, d) { return ui.glass.header(state, d); };
  // skor kadranı pafta bölümünün içindedir (ui.glass.dial); ayrı bir şerit yoktur
  ui.scorebar = function () { return null; };
})();

/* ==========================================================================
   42-ui-board.js — canlı pafta (SVG): daireler, ilişki çizgileri, sürükle-bırak
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const geo = App.geo;

  let drag = null, lastPt = null;
  const ms = App.multi;
  /* çoklu seçim: kutu çizerek ya da Shift + tıkla birkaç mekân seç, birini sürükleyince hepsi birlikte taşınır */
  const activeMs = (S) => { const have = new Set(S.project.spaces.map((s) => s.id)); const r = (S.ui.ms || []).filter((id) => have.has(id)); return !S.selectedId && r.length >= 2 ? r : []; };
  ui.activeGroup = activeMs;
  const boxes = (S) => { const k = geo.scale(S.project.spaces); return S.project.spaces.map((s) => { const r = geo.radius(s.area, k); return { id: s.id, x0: s.x - r, y0: s.y - r, x1: s.x + r, y1: s.y + r, r: r }; }); };
  ui.multi = function (list) {
    if (list.length === 1) { App.ctl.dispatch({ type: 'UI', patch: { ms: [] } }); App.ctl.dispatch({ type: 'SELECT', id: list[0] }); return; }
    App.ctl.dispatch({ type: 'SELECT', id: null });
    App.ctl.dispatch({ type: 'UI', patch: { ms: list } });
  };

  // istemci noktası → dünya (çözümsel: görünüm durumundan; DOM güncellemesini beklemez, otomatik kaydırmada da doğru kalır)
  function toWorld(e) { return ui.zoom.toWorld(e.clientX, e.clientY); }

  // kıstırma / kaydırma başlayınca sürüklemeyi bırak (47-ui-zoom.js çağırır)
  ui.cancelDrag = function () {
    if (!drag) return;
    drag = null; ui.dragging = false; lastPt = null;
    if (ui.zoom) ui.zoom.stopEdge();
    App.ctl.dispatch({ type: 'UI', patch: { mq: null } });
  };
  const zoomBusy = () => !!(ui.zoom && ui.zoom.busy());

  /* Pencere sınırı. Tuval = beyaz pencerenin kendisi: daire merkezi görünür pencerenin içinde kalır (yarıçap + seçim halkası payıyla;
     küçük dairenin etiketi altta durduğu için alt pay daha geniştir). Pencere daireden darsa (çok yakınlaşınca) merkez pencerenin orta bandında kalır. Daire zaten dışarıdaysa
     (ör. yakınlaştırınca) yakalandığında zıplamaz: yalnızca içeri doğru hareket eder. Pencere ise sonsuzdur: daireyi kenara götürüp
     bekleyince tuval kayar (edgePan) ve daire kenarda kalarak onunla birlikte yeni boş alana ilerler. */
  function winBox(r, ox, oy) {
    const v = ui.zoom && ui.zoom.visible();
    if (!v) return { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    const pad = r + 10, bot = pad + (r < 36 ? 64 : 0);
    // pay, pencerenin en çok %40'ı: daire pencereden büyükse (çok yakınlaşınca) merkez ortadaki banda kıstırılır, takılıp kalmaz
    const span = (a0, a1, p0, p1, o) => {
      const cap = 0.4 * (a1 - a0);
      return [Math.min(a0 + Math.min(p0, cap), o), Math.max(a1 - Math.min(p1, cap), o)];
    };
    const sx = span(v.x0, v.x1, pad, pad, ox), sy = span(v.y0, v.y1, pad, bot, oy);
    return { x0: sx[0], x1: sx[1], y0: sy[0], y1: sy[1] };
  }
  // tek daire: istenen merkez (x, y) pencere ve dünya sınırı içinde kalacak biçimde kıstırılır; (ox, oy) sürükleme başındaki konum
  function fitPoint(x, y, r, ox, oy) {
    const b = winBox(r, ox, oy);
    return geo.clampWorld(Math.max(b.x0, Math.min(b.x1, x)), Math.max(b.y0, Math.min(b.y1, y)), r);
  }
  // grup: tüm daireleri aynı kaydırmayla taşıyan (dx, dy) değerini, hiçbir daire pencereden ya da dünyadan taşmayacak biçimde kıs
  function fitShift(items, dx, dy) {
    let lx = -Infinity, hx = Infinity, ly = -Infinity, hy = Infinity;
    items.forEach((q) => {
      const b = winBox(q.r, q.x, q.y);
      lx = Math.max(lx, b.x0 - q.x); hx = Math.min(hx, b.x1 - q.x);
      ly = Math.max(ly, b.y0 - q.y); hy = Math.min(hy, b.y1 - q.y);
    });
    let ax = Math.max(lx, Math.min(hx, dx)), ay = Math.max(ly, Math.min(hy, dy));
    items.forEach((q) => {
      const c0 = geo.clampWorld(q.x + ax, q.y + ay, q.r);
      ax = ax >= 0 ? Math.min(ax, c0.x - q.x) : Math.max(ax, c0.x - q.x);
      ay = ay >= 0 ? Math.min(ay, c0.y - q.y) : Math.max(ay, c0.y - q.y);
    });
    return { x: ax, y: ay };
  }

  function bubbleDown(e, s, r) {
    if (zoomBusy()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e);
    const S0 = App.store.get();
    if (e.shiftKey) {
      // Shift + tık: seçime ekle / çıkar · Shift + sürükle: dairenin üstünden de kutu seçimi başlar
      drag = { marq: true, add: true, tog: s.id, wx: w.x, wy: w.y, sx: e.clientX, sy: e.clientY, moved: false };
      try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    const list = activeMs(S0);
    if (list.length >= 2 && ms.has(list, s.id)) {
      const orig = {}, rad = {};
      boxes(S0).forEach((q) => { if (ms.has(list, q.id)) rad[q.id] = q.r; });
      S0.project.spaces.forEach((q) => { if (ms.has(list, q.id)) orig[q.id] = { x: q.x, y: q.y }; });
      const items = list.filter((id) => orig[id]).map((id) => ({ x: orig[id].x, y: orig[id].y, r: rad[id] }));
      drag = { group: true, id: s.id, ids: list, orig: orig, rad: rad, items: items, gx: w.x, gy: w.y, sx: e.clientX, sy: e.clientY, moved: false };
      try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    drag = { id: s.id, dx: s.x - w.x, dy: s.y - w.y, ox: s.x, oy: s.y, sx: e.clientX, sy: e.clientY, moved: false, r: r };
    try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    if ((S0.ui.ms || []).length) App.ctl.dispatch({ type: 'UI', patch: { ms: [] } });
    App.ctl.dispatch({ type: 'SELECT', id: s.id });
  }
  function bgDown(e) {
    if (zoomBusy()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const S = App.store.get();
    if (!e.shiftKey && S.selectedId) App.ctl.dispatch({ type: 'SELECT', id: null });
    const w = toWorld(e);
    // yakalama (pointer capture) sürükleme başlayınca alınır; böylece çizgiye tıklayıp ilişkiyi değiştirme bozulmaz
    drag = { marq: true, add: e.shiftKey, wx: w.x, wy: w.y, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
  }
  function svgMove(e) {
    if (!drag || zoomBusy()) return;
    lastPt = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
    if (drag.marq) {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        drag.moved = true;
        try { ui.svgEl.setPointerCapture(drag.pid != null ? drag.pid : e.pointerId); } catch (err) {}
      }
      const w1 = toWorld(e);
      App.ctl.dispatch({ type: 'UI', patch: { mq: ms.rect([drag.wx, drag.wy], [w1.x, w1.y]) } });
      if (ui.zoom) ui.zoom.edgePan(e.clientX, e.clientY);
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      App.ctl.dispatch({ type: 'DRAG_START' });
      ui.dragging = true;
    }
    const w = toWorld(e);
    if (drag.group) {
      // hiçbir daire beyaz pencerenin (ve dünyanın) dışına çıkmasın
      const a = fitShift(drag.items, w.x - drag.gx, w.y - drag.gy);
      const pos = {};
      drag.ids.forEach((id) => { pos[id] = { x: drag.orig[id].x + a.x, y: drag.orig[id].y + a.y }; });
      App.ctl.dispatch({ type: 'SET_POSITIONS', positions: pos });
      if (ui.zoom) ui.zoom.edgePan(e.clientX, e.clientY);
      return;
    }
    const c = fitPoint(w.x + drag.dx, w.y + drag.dy, drag.r, drag.ox, drag.oy);
    App.ctl.dispatch({ type: 'MOVE', id: drag.id, x: c.x, y: c.y });
    if (ui.zoom) ui.zoom.edgePan(e.clientX, e.clientY);
  }
  // otomatik kaydırma tuvali kaydırdığında sürüklenen öğeyi (işaretçi sabit) yeni dünya konumuna taşı
  ui.redrag = function () { if (drag && lastPt) svgMove(lastPt); };
  function svgUp(e) {
    if (!drag || zoomBusy()) return;
    try { ui.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    const g = drag;
    drag = null; lastPt = null;
    ui.dragging = false;
    if (ui.zoom) ui.zoom.stopEdge();
    if (g.marq) {
      const S = App.store.get();
      if (!g.moved) {
        if (g.tog) { const base = activeMs(S).length ? activeMs(S) : (S.selectedId ? [S.selectedId] : []); ui.multi(ms.toggle(base, g.tog)); }
        else if (!g.add && (S.ui.ms || []).length) App.ctl.dispatch({ type: 'UI', patch: { ms: [], mq: null } });
        return;
      }
      const ids = ms.hit(S.ui.mq || ms.rect([g.wx, g.wy], [g.wx, g.wy]), boxes(S));
      const base = g.add ? (activeMs(S).length ? activeMs(S) : (S.selectedId ? [S.selectedId] : [])) : [];
      App.ctl.dispatch({ type: 'UI', patch: { mq: null } });
      ui.multi(ms.merge(base, ids, g.add));
      return;
    }
    if (g.group && !g.moved) ui.multi([g.id]);
  }
  /* klavye: ok tuşları seçili grubu kaydırır, Esc bırakır, Ctrl+A hepsini seçer */
  document.addEventListener('keydown', function (e) {
    const S = App.store.get();
    if (S.ui.module !== 'islev') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { if (S.project.spaces.length > 1) { e.preventDefault(); ui.multi(S.project.spaces.map((s) => s.id)); } return; }
    const list = activeMs(S);
    if (!list.length) return;
    if (e.key === 'Escape') { e.preventDefault(); App.ctl.dispatch({ type: 'UI', patch: { ms: [] } }); return; }
    if (!ms.DIRS[e.key]) return;
    e.preventDefault();
    const n = e.shiftKey ? 20 : 4, dv = ms.DIRS[e.key];
    const rad = {};
    boxes(S).forEach((q) => { rad[q.id] = q.r; });
    const items = S.project.spaces.filter((s) => ms.has(list, s.id)).map((s) => ({ x: s.x, y: s.y, r: rad[s.id] }));
    const a = fitShift(items, dv[0] * n, dv[1] * n);
    App.ctl.dispatch({ type: 'DRAG_START' });
    const pos = {};
    S.project.spaces.forEach((s) => { if (ms.has(list, s.id)) pos[s.id] = { x: s.x + a.x, y: s.y + a.y }; });
    App.ctl.dispatch({ type: 'SET_POSITIONS', positions: pos });
  });

  ui.board = function (state, d) {
    const ctl = App.ctl;
    const P = state.project;
    const k = d.k;
    const by = new Map(P.spaces.map((s) => [s.id, s]));
    const farStrong = new Set(d.score.pairs.filter((p) => p.type === 'strong' && !p.ok).map((p) => p.key));
    const badAvoid = new Set(d.score.pairs.filter((p) => p.type === 'avoid' && !p.ok).map((p) => p.key));

    const view = state.ui.view;
    const hitW = Math.round(geo.clampHit(26 / (ui.zoom ? ui.zoom.scale(view, state) : 1)));

    const lines = [];
    Object.keys(P.relations).forEach((key) => {
      const ids = key.split('|');
      const a = by.get(ids[0]), b = by.get(ids[1]);
      if (!a || !b) return;
      const type = P.relations[key];
      const prims = App.board.relLinePrims(a, b, type, geo.radius(a.area, k), geo.radius(b.area, k));
      const cls = type === 'strong' && farStrong.has(key) ? 'far-strong' : type === 'avoid' && badAvoid.has(key) ? 'far-avoid' : '';
      const label = a.name + ' ↔ ' + b.name + ': ' + App.REL[type].label + ' (tıkla: değiştir)';
      lines.push(h('g', { key: 'r' + key, class: 'rel ' + cls },
        prims.map((p, i) => App.board.primToV(p, i === 0 && cls ? { class: cls } : null)),
        h('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'rel-hit', stroke: 'transparent', 'stroke-width': hitW, onclick: (e) => { e.stopPropagation(); ctl.dispatch({ type: 'CYCLE_RELATION', a: a.id, b: b.id }); } }, h('title', {}, label))));
    });

    const hl = state.ui.highlight;
    const rings = [];
    if (hl) [hl.a, hl.b].forEach((id) => {
      const s = by.get(id);
      if (s) rings.push(h('circle', { key: 'hl' + id, class: 'locate-ring', cx: s.x, cy: s.y, r: geo.radius(s.area, k) + 14, fill: 'none', stroke: App.PAL.red, 'stroke-width': 5, 'stroke-dasharray': '10 8' }));
    });

    const grp = activeMs(state);
    const bubbles = P.spaces.map((s) => {
      const r = geo.radius(s.area, k);
      const grpOn = grp.length > 0 && ms.has(grp, s.id);
      const sel = state.selectedId === s.id || grpOn;
      return h('g', { key: 'b' + s.id, class: 'bubble' + (sel ? ' selected' : ''), role: 'button', tabindex: 0, 'aria-label': s.name + ', ' + App.util.fmt(s.area) + ' metrekare', onpointerdown: (e) => bubbleDown(e, s, r), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctl.dispatch({ type: 'SELECT', id: s.id }); } } },
        sel ? h('circle', { class: 'sel-ring', cx: s.x, cy: s.y, r: r + 10, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6' }) : null,
        App.board.bubblePrims(s, r, P).map((p) => App.board.primToV(p)),
        h('title', {}, s.name + ' — ' + App.util.fmt(s.area) + ' m²'));
    });

    const cls = 'board-svg' + (view ? ' moved' : '') + (state.ui.tool === 'hand' ? ' tool-hand' : '') + (state.ui.sp ? ' pan-ready' : '') + (state.ui.pn ? ' panning' : '');
    const svg = h('svg', {
      id: 'pafta', class: cls, style: { background: App.PAL.sheet }, viewBox: ui.zoom ? ui.zoom.viewBox(view, state) : '0 0 ' + geo.W + ' ' + geo.H, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Bubble diagram paftası (sonsuz çalışma alanı: tekerlekle yakınlaştır, Boşluk + sürükleyerek kaydır)',
      ref: (el) => { ui.svgEl = el; if (ui.zoom) ui.zoom.wire(el); }, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp,
      onpointerdown: bgDown,
    }, ui.zoom ? ui.zoom.grid(view, state) : null, h('g', { class: 'lines' }, lines), h('g', { class: 'bubbles' }, bubbles), h('g', { class: 'rings' }, rings),
    grp.length ? ms.frame(ms.bounds(boxes(state).filter((q) => ms.has(grp, q.id))), 16) : null,
    state.ui.mq ? ms.marquee(state.ui.mq) : null);

    const needHelp = P.spaces.length >= 3 && d.score.percent != null && d.score.percent < 60;
    const empty = !P.spaces.length;
    const hint = state.ui.hintDismissed ? null : 'Daireleri sürükleyin · Çizgiye tıklayarak ilişkiyi değiştirin · Boşlukta kutu çizerek birkaç daire seçin (Shift: ekle / çıkar) · Tekerlek: yakınlaştır / uzaklaştır · Boşluk + sürükle: kaydır · Daireyi pencere kenarında tutarsanız pencere onunla birlikte ilerler';

    const attn = needHelp || P.meta.example;
    // slot: paftanın "güvenli alanı" (paneller arasında kalan boşluk). Tuval (stage) pencerenin tamamını kaplar; slot yalnızca
    // yerleşimdeki boşluğu ayırır ve yüzen öğeleri (zoom çubuğu, seçim çipi, boş durum) tutar.
    const slot = h('div', { class: 'board-slot' },
      h('div', { class: 'board-stage' }, svg),
      grp.length ? ms.chip(grp.length, { noun: 'mekân', onclear: () => ctl.dispatch({ type: 'UI', patch: { ms: [] } }) }) : null,
      empty ? h('div', { class: 'empty-card' },
        h('h2', { class: 'empty-title' }, 'Pafta boş'),
        h('p', {}, 'Soldaki formdan mekân adı ve m² girin, ya da hazır bir bina programıyla başlayın.'),
        h('div', { class: 'empty-actions' },
          ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => ctl.loadTemplate('konut', '2+1') }),
          ui.btn('İlk mekânı ekle', { icon: 'plus', onclick: ctl.focusForm }))) : null,
      ui.zoom ? ui.zoom.bar(state) : null);
    const hintEl = hint ? h('p', { class: 'board-hint' }, hint, h('button', { type: 'button', class: 'hint-x', 'aria-label': 'İpucunu kapat', onclick: () => ctl.dispatch({ type: 'UI', patch: { hintDismissed: true } }) }, ui.icon('close', 14))) : null;

    return h('section', { class: 'board-wrap', 'aria-label': 'Pafta' },
      h('div', { class: 'gstrip' }, ui.glass.dial(state, d), ui.glass.dock(state, d, attn)),
      slot,
      h('div', { class: 'board-foot' }, hintEl, h('span', { class: 'board-scale', title: 'Daire alanı m² ile orantılıdır. Çok küçük mekânlar okunabilirlik için en az 24 birim yarıçapla çizilir.' }, 'daire alanı ∝ m²')));
  };
})();

/* ==========================================================================
   43-ui-sidebar.js — sol panel: mekân ekleme, şablon, mekân listesi, ilişki matrisi
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  const REL_BTN = [['none', '·', 'İlişkisiz'], ['strong', '●', 'Güçlü'], ['weak', '○', 'Zayıf'], ['avoid', '✕', 'Ayrı tut']];

  function statusOf(d, s) {
    const e = d.analysis.matched && d.analysis.matched.bySpace.get(s.id);
    if (!e) return null;
    if (e.min != null && s.area < e.min - 0.001) return { lvl: 'hata', label: 'min altı', tip: 'Asgari ' + U.fmt(e.min) + ' m² (' + e.src + ')' };
    if (s.area < e.typ[0] - 0.001) return { lvl: 'uyari', label: 'düşük', tip: 'Tipik ' + U.fmt(e.typ[0]) + '–' + U.fmt(e.typ[1]) + ' m²' };
    if (s.area > e.typ[1] * 1.8) return { lvl: 'oneri', label: 'büyük', tip: 'Tipik ' + U.fmt(e.typ[0]) + '–' + U.fmt(e.typ[1]) + ' m²' };
    return { lvl: 'ok', label: 'uygun', tip: 'Tipik ' + U.fmt(e.typ[0]) + '–' + U.fmt(e.typ[1]) + ' m²' };
  }

  function formView(state) {
    const ctl = App.ctl;
    const f = state.ui.form;
    const variant = App.kb.variant(state.project.meta.buildingType, state.project.meta.variant);
    return h('form', { class: 'panel add-form', onsubmit: (e) => { e.preventDefault(); ctl.addFromForm(); }, novalidate: true },
      h('h2', { class: 'panel-title' }, 'Mekan ekle'),
      h('div', { class: 'add-row' },
        h('div', { class: 'fld fld-grow' },
          h('label', { class: 'lbl', for: 'sp-name' }, 'Mekan adı'),
          h('input', { id: 'sp-name', class: 'inp', type: 'text', list: 'sp-list', placeholder: 'Örn. Salon', value: f.name, autocomplete: 'off', maxlength: 60, oninput: (e) => ctl.onNameInput(e.target.value) }),
          h('datalist', { id: 'sp-list' }, variant.entries.map((e) => h('option', { key: e.key, value: e.name })))),
        h('div', { class: 'fld fld-area' },
          h('label', { class: 'lbl', for: 'sp-area' }, 'Alan (m²)'),
          h('input', { id: 'sp-area', class: 'inp mono', type: 'number', inputmode: 'decimal', min: 0.5, step: 0.5, placeholder: '24', value: f.area, oninput: (e) => ctl.dispatch({ type: 'FORM', patch: { area: e.target.value, error: '' } }) }))),
      f.error ? h('p', { class: 'form-error', role: 'alert' }, f.error) : null,
      h('button', { type: 'submit', class: 'btn btn-primary btn-wide' }, ui.icon('plus', 18), h('span', {}, 'Mekanı ekle')));
  }

  function templateView(state) {
    const ctl = App.ctl;
    const t = App.kb.type(state.ui.tplType);
    return h('details', { class: 'panel tpl' },
      h('summary', { class: 'panel-title summary' }, 'Hazır bina programı'),
      h('div', { class: 'tpl-body' },
        h('div', { class: 'fld' },
          h('label', { class: 'lbl', for: 'tpl-type' }, 'Bina tipi'),
          h('select', { id: 'tpl-type', class: 'inp', value: state.ui.tplType, onchange: (e) => { const nt = App.kb.type(e.target.value); ctl.dispatch({ type: 'UI', patch: { tplType: nt.key, tplVariant: nt.variants[0].key } }); ctl.dispatch({ type: 'SET_META', patch: { buildingType: nt.key, variant: nt.variants[0].key } }); } },
            App.KB.TYPES.map((x) => h('option', { key: x.key, value: x.key }, x.label)))),
        h('div', { class: 'fld' },
          h('label', { class: 'lbl', for: 'tpl-var' }, 'Program'),
          h('select', { id: 'tpl-var', class: 'inp', value: state.ui.tplVariant, onchange: (e) => { ctl.dispatch({ type: 'UI', patch: { tplVariant: e.target.value } }); ctl.dispatch({ type: 'SET_META', patch: { variant: e.target.value } }); } },
            t.variants.map((v) => h('option', { key: v.key, value: v.key }, v.label)))),
        h('p', { class: 'note' }, 'Bina tipi, Akıllı öneri panelinin hangi programa göre kontrol yapacağını belirler. Şablonu yüklemek mevcut projenin yerine geçer (geri alınabilir).'),
        ui.btn('Şablonu yükle', { icon: 'newdoc', cls: 'btn-blue btn-wide', onclick: () => ctl.loadTemplate(state.ui.tplType, state.ui.tplVariant) })));
  }

  function relEditor(state, s) {
    const ctl = App.ctl;
    const others = state.project.spaces.filter((o) => o.id !== s.id);
    if (!others.length) return h('p', { class: 'note' }, 'İlişki kurmak için en az iki mekân gerekir.');
    return h('div', { class: 'rel-list' },
      others.map((o) => {
        const cur = state.project.relations[U.pairKey(s.id, o.id)] || 'none';
        return h('div', { class: 'rel-row', key: o.id },
          h('span', { class: 'rel-name' }, ui.spaceDot(o), h('span', {}, o.name)),
          h('div', { class: 'seg', role: 'group', 'aria-label': s.name + ' ile ' + o.name + ' ilişkisi' },
            REL_BTN.map((b) => h('button', { key: b[0], type: 'button', class: 'seg-btn seg-' + b[0] + (cur === b[0] ? ' on' : ''), title: b[2], 'aria-pressed': String(cur === b[0]), 'aria-label': b[2], onclick: () => ctl.dispatch({ type: 'SET_RELATION', a: s.id, b: o.id, rel: b[0] }) }, b[1]))));
      }));
  }

  function rowView(state, d, s) {
    const ctl = App.ctl;
    const sel = state.selectedId === s.id;
    const st = statusOf(d, s);
    return h('li', { key: s.id, class: 'row' + (sel ? ' sel' : ''), id: 'row-' + s.id },
      h('div', { class: 'row-main', onclick: () => ctl.dispatch({ type: 'SELECT', id: sel ? null : s.id }) },
        ui.spaceDot(s),
        h('span', { class: 'row-name' }, s.name),
        st ? h('span', { class: 'pill pill-' + st.lvl, title: st.tip }, st.label) : null,
        h('label', { class: 'area-wrap', onclick: (e) => e.stopPropagation() },
          h('span', { class: 'sr' }, s.name + ' alanı (m²)'),
          h('input', { class: 'inp area-inp mono', type: 'number', min: 0.5, step: 0.5, value: s.area, keep: true, 'data-id': s.id, onchange: (e) => ctl.dispatch({ type: 'UPDATE_SPACE', id: s.id, patch: { area: e.target.value } }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
          h('span', { class: 'unit' }, 'm²')),
        h('button', { type: 'button', class: 'icon-btn', title: s.name + ' sil', 'aria-label': s.name + ' sil', onclick: (e) => { e.stopPropagation(); ctl.dispatch({ type: 'REMOVE_SPACE', id: s.id }); } }, ui.icon('trash', 16))),
      sel ? h('div', { class: 'row-detail' },
        h('div', { class: 'detail-grid' },
          h('div', { class: 'fld' }, h('label', { class: 'lbl', for: 'ed-name' }, 'Ad'),
            h('input', { id: 'ed-name', class: 'inp', type: 'text', maxlength: 60, value: s.name, keep: true, onchange: (e) => { if (e.target.value.trim()) ctl.dispatch({ type: 'UPDATE_SPACE', id: s.id, patch: { name: e.target.value.trim() } }); } })),
          h('div', { class: 'fld' }, h('label', { class: 'lbl', for: 'ed-zone' }, 'Bölge'),
            h('select', { id: 'ed-zone', class: 'inp', value: s.zone, onchange: (e) => ctl.dispatch({ type: 'UPDATE_SPACE', id: s.id, patch: { zone: e.target.value } }) },
              App.ZONE_ORDER.map((z) => h('option', { key: z, value: z }, App.ZONES[z].label))))),
        ui.spaceColorField(state, s),
        h('h3', { class: 'sub-title' }, 'Diğer mekânlarla ilişkisi'),
        relEditor(state, s)) : null);
  }

  function listView(state, d) {
    const P = state.project;
    const total = U.sum(P.spaces, (s) => s.area);
    return h('div', { class: 'panel list-panel' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, 'Mekanlar'),
        h('span', { class: 'count mono' }, P.spaces.length + ' mekân · ' + U.fmt(total) + ' m²')),
      P.spaces.length
        ? h('ul', { class: 'rows' }, P.spaces.map((s) => rowView(state, d, s)))
        : h('p', { class: 'note' }, 'Henüz mekân yok. Yukarıdan ekleyin veya hazır bina programını yükleyin.'));
  }

  function matrixView(state, d) {
    const ctl = App.ctl;
    const P = state.project;
    const sp = P.spaces;
    if (sp.length < 2) return h('div', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'İlişki matrisi'), h('p', { class: 'note' }, 'Matris için en az iki mekân ekleyin.'));
    const sel = state.selectedId;
    return h('div', { class: 'panel matrix-panel' },
      h('h2', { class: 'panel-title' }, 'İlişki matrisi'),
      h('p', { class: 'note' }, 'Bir hücreye tıklayın: İlişkisiz → Güçlü → Zayıf → Ayrı tut. Her iki yönde aynıdır.'),
      h('ul', { class: 'legend' }, REL_BTN.map((b) => h('li', { key: b[0], class: 'legend-i' }, h('span', { class: 'mcell-sym sym-' + b[0] }, b[1]), ' ' + b[2]))),
      h('div', { class: 'matrix-scroll' },
        h('table', { class: 'matrix' },
          h('thead', {}, h('tr', {}, h('th', { class: 'corner' }, ''), sp.slice(0, -1).map((c) => h('th', { key: c.id, class: 'mh' + (sel === c.id ? ' on' : ''), scope: 'col' }, h('button', { type: 'button', class: 'mh-btn', onclick: () => ctl.dispatch({ type: 'SELECT', id: c.id }), title: c.name }, h('span', { class: 'vert' }, c.name)))))),
          h('tbody', {}, sp.slice(1).map((r, ri) => h('tr', { key: r.id },
            h('th', { class: 'rh' + (sel === r.id ? ' on' : ''), scope: 'row' }, h('button', { type: 'button', class: 'rh-btn', onclick: () => ctl.dispatch({ type: 'SELECT', id: r.id }), title: r.name }, ui.spaceDot(r), h('span', {}, r.name))),
            sp.slice(0, -1).map((c, ci) => {
              if (ci > ri) return h('td', { key: c.id, class: 'mc-empty' });
              const rel = P.relations[U.pairKey(r.id, c.id)] || 'none';
              const hot = sel === r.id || sel === c.id;
              return h('td', { key: c.id, class: 'mc' + (hot ? ' hot' : '') },
                h('button', { type: 'button', class: 'mcell mcell-' + rel, title: r.name + ' ↔ ' + c.name + ': ' + App.REL[rel].label, 'aria-label': r.name + ' ile ' + c.name + ': ' + App.REL[rel].label, onclick: () => ctl.dispatch({ type: 'CYCLE_RELATION', a: r.id, b: c.id }) },
                  h('span', { class: 'mcell-sym sym-' + rel }, REL_BTN.find((b) => b[0] === rel)[1])));
            })))))));
  }

  ui.sidebar = function (state, d) {
    const ctl = App.ctl;
    const tab = state.ui.tab;
    const cc = state.project.colors;
    const nCustom = cc && state.ui.color.on ? Object.keys(cc.zones).length + Object.keys(cc.spaces).length : 0;
    return h('aside', { class: 'sidebar', 'aria-label': 'Proje paneli' },
      h('div', { class: 'tabs', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', id: 'tab-spaces', 'aria-selected': String(tab === 'spaces'), class: 'tab' + (tab === 'spaces' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } }) }, 'Mekanlar', h('span', { class: 'tab-n' }, String(state.project.spaces.length))),
        h('button', { type: 'button', role: 'tab', id: 'tab-matrix', 'aria-selected': String(tab === 'matrix'), class: 'tab' + (tab === 'matrix' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { tab: 'matrix' } }) }, 'İlişki matrisi', h('span', { class: 'tab-n' }, String(Object.keys(state.project.relations).length))),
        h('button', { type: 'button', role: 'tab', id: 'tab-renk', 'aria-selected': String(tab === 'renk'), class: 'tab' + (tab === 'renk' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { tab: 'renk' } }) }, 'Renkler', nCustom ? h('span', { class: 'tab-n' }, String(nCustom)) : null)),
      h('div', { class: 'side-body', role: 'tabpanel' },
        tab === 'spaces' ? [formView(state), listView(state, d), templateView(state)] : tab === 'renk' ? ui.colorsPanel(state) : matrixView(state, d)));
  };
})();

/* ==========================================================================
   44-ui-assistant.js — Akıllı Öneri paneli (açılır/kapanır): analiz kartları + soru-cevap
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  function srcChips(list) {
    if (!list || !list.length) return null;
    return h('div', { class: 'src-row' }, h('span', { class: 'src-lbl' }, 'Kaynak'),
      list.filter((c) => App.KB.SOURCES[c]).map((c) => h('span', { key: c, class: 'src-chip', title: App.KB.SOURCES[c].label + ' · ' + App.KB.SOURCES[c].kind + ' · güvenilirlik: ' + App.KB.SOURCES[c].trust }, c)));
  }

  function actionBtns(actions) {
    if (!actions || !actions.length) return null;
    return h('div', { class: 'act-row' }, actions.map((a, i) => h('button', { key: i, type: 'button', class: 'act-btn', onclick: () => App.ctl.runAction(a) }, a.label)));
  }

  function card(item) {
    return h('li', { key: item.id, class: 'card card-' + item.level },
      h('div', { class: 'card-top' }, h('span', { class: 'lvl lvl-' + item.level }, ui.levelLabel[item.level]), h('h3', { class: 'card-title' }, item.title)),
      item.detail ? h('p', { class: 'card-detail' }, item.detail) : null,
      srcChips(item.src),
      actionBtns(item.actions));
  }

  ui.findingCard = card;
  ui.srcChips = srcChips;
  ui.actionBtns = actionBtns;

  function renderBlock(b, i) {
    if (b.t === 'p') return h('p', { key: i, class: 'msg-p' }, b.text);
    if (b.t === 'ul') return h('ul', { key: i, class: 'msg-ul' }, b.items.map((x, j) => h('li', { key: j }, x)));
    if (b.t === 'ol') return h('ol', { key: i, class: 'msg-ol' }, b.items.map((x, j) => h('li', { key: j }, x)));
    if (b.t === 'kv') return h('dl', { key: i, class: 'msg-kv' }, b.rows.map((r, j) => [h('dt', { key: 'k' + j }, r[0]), h('dd', { key: 'v' + j, class: 'mono' }, r[1])]));
    if (b.t === 'actions') return h('div', { key: i }, actionBtns(b.actions));
    return null;
  }

  function messageView(m, i) {
    if (m.role === 'user') return h('li', { key: i, class: 'msg msg-user' }, m.text);
    return h('li', { key: i, class: 'msg msg-bot' }, m.blocks.map(renderBlock), srcChips(m.src));
  }

  ui.assistant = function (state, d) {
    const ctl = App.ctl;
    const open = state.ui.assistantOpen;
    const tab = state.ui.asTab;
    const a = d.analysis;
    const issues = a.counts.hata + a.counts.uyari;
    const type = App.kb.type(state.project.meta.buildingType);
    const variant = App.kb.variant(state.project.meta.buildingType, state.project.meta.variant);
    const nMsg = state.ui.messages.length;

    const analysis = h('div', { class: 'as-body', id: 'as-analysis' },
      h('p', { class: 'as-context' }, h('b', {}, type.label), ' · ' + variant.label + ' programına göre kontrol edildi.'),
      h('div', { class: 'as-counts' },
        h('span', { class: 'cnt cnt-hata' }, h('b', {}, String(a.counts.hata)), ' hata'),
        h('span', { class: 'cnt cnt-uyari' }, h('b', {}, String(a.counts.uyari)), ' uyarı'),
        h('span', { class: 'cnt cnt-oneri' }, h('b', {}, String(a.counts.oneri)), ' öneri')),
      h('ul', { class: 'cards' }, a.items.map(card)));

    const ask = h('div', { class: 'as-body as-ask' },
      h('ul', { class: 'msgs', 'aria-live': 'polite' },
        nMsg ? state.ui.messages.map(messageView) : h('li', { class: 'msg msg-bot' }, h('p', { class: 'msg-p' }, 'Merhaba. Mekân alanları, komşuluk ilişkileri, sirkülasyon ve yönetmelik sorularınızı yanıtlarım. Aşağıdaki sorulardan birini seçin veya kendi sorunuzu yazın.'))),
      h('div', { class: 'qchips' }, App.assistant.chips.map((c) => h('button', { key: c, type: 'button', class: 'qchip', onclick: () => ctl.ask(c) }, c))),
      h('form', { class: 'ask-form', onsubmit: (e) => { e.preventDefault(); const inp = document.getElementById('ask-input'); const v = inp.value.trim(); if (v) { ctl.ask(v); inp.value = ''; } } },
        h('label', { class: 'sr', for: 'ask-input' }, 'Asistana soru yazın'),
        h('input', { id: 'ask-input', class: 'inp', type: 'text', placeholder: 'Örn. Banyo kaç m² olmalı?', autocomplete: 'off', keep: true }),
        h('button', { type: 'submit', class: 'btn btn-blue', 'aria-label': 'Gönder' }, ui.icon('send', 18))));

    return h('aside', { class: 'assistant' + (open ? ' open' : ''), 'aria-label': 'Akıllı öneri paneli', 'aria-hidden': String(!open) },
      h('div', { class: 'as-inner' },
        h('header', { class: 'as-head' },
          h('div', {}, h('h2', { class: 'as-title' }, 'Akıllı öneri'), h('p', { class: 'as-sub' }, 'Kitap analizleri ve yönetmelik verisine dayalı asistan')),
          h('button', { type: 'button', class: 'icon-btn', onclick: ctl.toggleAssistant, 'aria-label': 'Paneli kapat', title: 'Paneli kapat' }, ui.icon('close', 18))),
        h('div', { class: 'tabs tabs-sm', role: 'tablist' },
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'analysis'), class: 'tab' + (tab === 'analysis' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { asTab: 'analysis' } }) }, 'Analiz', issues ? h('span', { class: 'tab-n tab-n-warn' }, String(issues)) : null),
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'ask'), class: 'tab' + (tab === 'ask' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { asTab: 'ask' } }) }, 'Soru sor')),
        tab === 'analysis' ? analysis : ask));
  };
})();

/* ==========================================================================
   45-ui-colors.js — "Renkler" paneli: palet seç → arayüz o paletle boyanır; tonları kategoriye ya da tek daireye uygula
   Palet seçmek "Beni renklendir!" kipini açar. Veri: App.palettes · mantık: App.colors (31-state-colors.js) · renk üretimi: App.colortheme
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const PL = App.palettes;

  const dispatch = (a) => App.store.dispatch(a);
  const curPal = (state) => PL.get(state.ui.color.p) || PL.get(App.colortheme.DEFAULT) || PL.list[0];
  const colorOn = (state) => !!state.ui.color.on;

  /* bir paletin 5 tonu: tıkla → uygula. cur: şu an uygulanan hex (ya da null) */
  function tones(pal, cur, onpick, label) {
    return h('div', { class: 'tones', role: 'group', 'aria-label': label },
      pal.colors.map((hex, i) => h('button', {
        key: i, type: 'button', class: 'tone' + (cur && cur.toUpperCase() === hex.toUpperCase() ? ' on' : ''),
        style: { background: hex, color: PL.textOn(hex, App.PAL.ink, App.PAL.paper) },
        title: hex + ' · ' + pal.name, 'aria-label': label + ': ' + hex, 'aria-pressed': String(!!cur && cur.toUpperCase() === hex.toUpperCase()),
        onclick: () => onpick(i),
      }, h('span', { class: 'tone-hex mono' }, hex.slice(1)))));
  }

  const resetBtn = (disabled, label, fn) => h('button', { type: 'button', class: 'icon-btn tone-x', title: label, 'aria-label': label, disabled: !!disabled, onclick: fn }, ui.icon('reset', 15));

  function palCard(state, p) {
    const on = colorOn(state) && state.ui.color.p === p.id;
    return h('li', { key: p.id },
      h('button', { type: 'button', class: 'pal-card' + (on ? ' on' : ''), title: p.name + ' · ' + p.colors.join(' '), 'aria-pressed': String(on), 'aria-label': p.name, onclick: () => App.ctl.pickPalette(p.id) },
        h('span', { class: 'pal-strip', 'aria-hidden': 'true' }, p.colors.map((c, i) => h('i', { key: i, style: { background: c } }))),
        h('span', { class: 'pal-name mono' }, '#' + p.n)));
  }

  function zoneRow(state, pal, z) {
    const P = state.project;
    const n = P.spaces.filter((s) => s.zone === z).length;
    const c = App.colors.zone(P, z);
    const cur = c.custom ? c.fill : null;
    const label = App.ZONES[z].label;
    return h('li', { key: z, class: 'zrow' + (n ? '' : ' zempty') },
      h('div', { class: 'zrow-head' },
        h('span', { class: 'dot', style: { background: c.fill }, 'aria-hidden': 'true' }),
        h('span', { class: 'zrow-name' }, label),
        h('span', { class: 'zrow-n mono', title: n + ' mekân' }, String(n)),
        resetBtn(!cur, label + ' rengini sıfırla', () => dispatch({ type: 'COLOR_SET', scope: 'zone', keys: [z], ref: null }))),
      tones(pal, cur, (i) => dispatch({ type: 'COLOR_SET', scope: 'zone', keys: [z], ref: { p: pal.id, i: i } }), label + ' rengi'));
  }

  function targetCard(state, pal) {
    const P = state.project;
    const grp = ui.activeGroup(state);
    const ids = grp.length >= 2 ? grp : state.selectedId ? [state.selectedId] : [];
    if (!ids.length) return h('p', { class: 'note' }, 'Tek bir daire (ya da birkaçı) için: panoda daireye tıklayın veya kutu çizerek seçin; ardından bir ton seçin.');
    const list = ids.map((id) => P.spaces.find((s) => s.id === id)).filter(Boolean);
    if (!list.length) return null;
    const first = App.colors.space(P, list[0]);
    const same = list.every((s) => App.colors.space(P, s).fill === first.fill);
    const cur = same && list.every((s) => App.colors.sourceOf(P, s) === 'space') ? first.fill : null;
    const any = list.some((s) => App.colors.sourceOf(P, s) === 'space');
    const name = list.length === 1 ? list[0].name : list.length + ' mekân seçili';
    return h('div', { class: 'tcard' },
      h('div', { class: 'zrow-head' },
        list.length === 1 ? ui.spaceDot(list[0]) : h('span', { class: 'dot dot-multi', 'aria-hidden': 'true' }),
        h('span', { class: 'zrow-name' }, name),
        resetBtn(!any, name + ' özel rengini sıfırla', () => dispatch({ type: 'COLOR_SET', scope: 'space', keys: ids, ref: null }))),
      tones(pal, cur, (i) => dispatch({ type: 'COLOR_SET', scope: 'space', keys: ids, ref: { p: pal.id, i: i } }), name + ' rengi'),
      h('p', { class: 'note' }, 'Tek daire rengi, kategori renginin önüne geçer.'));
  }

  /* sol panelin "Renkler" sekmesi */
  ui.colorsPanel = function (state) {
    const P = state.project;
    const pal = curPal(state);
    const on = colorOn(state);
    const c = P.colors || { zones: {}, spaces: {} };
    const custom = Object.keys(c.zones).length + Object.keys(c.spaces).length;
    return h('div', { class: 'colors-tab' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('h2', { class: 'panel-title' }, 'Renk paleti'),
          h('span', { class: 'count mono' }, PL.list.length + ' palet')),
        h('p', { class: 'note' }, on ? 'Arayüz ve şema seçili paletle boyanır. Başka bir palet seçerek değiştirin.' : 'Şu an monokrom görünüm açık. Bir palet seçin: düğmeler aynı kalır, yalnızca renkler değişir.'),
        h('ul', { class: 'pal-grid', role: 'list' }, PL.list.map((p) => palCard(state, p))),
        h('p', { class: 'note pal-src' }, on ? 'Seçili: ' : 'Son seçilen: ', h('b', {}, pal.name), ' · kaynak: ', h('a', { href: pal.url, target: '_blank', rel: 'noopener noreferrer' }, 'colorpalettes.net')),
        on ? h('div', { class: 'pal-actions' },
          ui.btn('Kategorilere dağıt', { icon: 'palette', title: 'Seçili paletin renklerini projedeki kategorilere sırayla uygula', onclick: () => dispatch({ type: 'COLOR_DISTRIBUTE', palette: pal.id }) }),
          ui.btn('Sıfırla', { icon: 'reset', title: 'Tüm özel renkleri kaldır', disabled: !custom, onclick: () => dispatch({ type: 'COLOR_RESET', what: 'all' }) })) : null),
      on ? h('div', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Kategoriler'),
        h('p', { class: 'note' }, 'Bir kategoriye ton seçin; o kategorideki tüm daireler boyanır.'),
        h('ul', { class: 'zrows', role: 'list' }, App.ZONE_ORDER.map((z) => zoneRow(state, pal, z)))) : null,
      on ? h('div', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Tek daire'),
        targetCard(state, pal)) : null);
  };

  /* mekân satırının ayrıntısı için küçük renk seçici (Mekanlar sekmesi) */
  ui.spaceColorField = function (state, s) {
    if (!App.colors.active()) return null;
    const pal = curPal(state);
    const P = state.project;
    const own = App.colors.sourceOf(P, s) === 'space';
    const cur = own ? App.colors.space(P, s).fill : null;
    return h('div', { class: 'fld fld-color' },
      h('div', { class: 'fld-color-head' },
        h('span', { class: 'lbl' }, 'Renk'),
        h('button', { type: 'button', class: 'linkbtn', title: 'Palet seç', onclick: () => dispatch({ type: 'UI', patch: { tab: 'renk' } }) }, pal.name + ' ›'),
        resetBtn(!own, s.name + ' özel rengini sıfırla', () => dispatch({ type: 'COLOR_SET', scope: 'space', keys: [s.id], ref: null }))),
      tones(pal, cur, (i) => dispatch({ type: 'COLOR_SET', scope: 'space', keys: [s.id], ref: { p: pal.id, i: i } }), s.name + ' rengi'));
  };
})();

/* ==========================================================================
   46-ui-glass.js — "glass" teması için kabuk bileşenleri
   Üst bar (kapsül), skor kadranı, yüzen araç çubuğu ve "Beni renklendir!" anahtarı.
   Sol panel ve asistan aynı bileşenleri kullanır; görünümü CSS (styles.glass.css) belirler.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const glass = (ui.glass = {});

  /* --- yuvarlak ikon düğmesi (etiket ipucu olarak gösterilir) --- */
  function gbtn(icon, label, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'gb' + (opts.cls ? ' ' + opts.cls : ''), onclick: opts.onclick, disabled: !!opts.disabled, 'aria-label': label, 'data-tip': label, title: opts.title || label, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) },
      ui.icon(icon, opts.size || 18),
      opts.badge ? h('span', { class: 'badge' + (opts.badgePulse ? ' pulse-badge' : '') }, opts.badge) : null);
  }

  glass.gbtn = gbtn;

  // Sadeleştirilmiş logo: üç geometrik form, tek renk
  glass.logo = function () {
    return h('svg', { viewBox: '0 0 40 40', width: 34, height: 34, class: 'glogo', 'aria-hidden': 'true' },
      h('circle', { cx: 15, cy: 15, r: 9.5, fill: 'currentColor', opacity: 0.9 }),
      h('rect', { x: 19, y: 19, width: 17, height: 17, rx: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }),
      h('path', { d: 'M5 36l7-12 7 12z', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linejoin': 'round', opacity: 0.55 }));
  };

  /* --- "Beni renklendir!" anahtarı: aynı düğme, aynı yer; açıkken "Sadeleştir" olur ve noktalar palet renklerini gösterir --- */
  ui.themeToggle = function (state) {
    const on = !!state.ui.color.on;
    return h('button', { type: 'button', class: 'gcolor' + (on ? ' on' : ''), onclick: App.ctl.toggleColor, 'aria-pressed': String(on), title: on ? 'Renkleri kaldır, monokrom görünüme dön' : 'Şemayı ve arayüzü renk paletiyle boya' },
      h('span', { class: 'gcolor-dots', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
      h('span', {}, on ? 'Sadeleştir' : 'Beni renklendir!'));
  };

  glass.header = function (state, d) {
    const ctl = App.ctl;
    const meta = state.project.meta;
    const issues = d.analysis.counts.hata + d.analysis.counts.uyari;
    return h('header', { class: 'gh' },
      h('div', { class: 'gh-brand' },
        glass.logo(),
        h('h1', { class: 'gh-title' }, 'archtools')),
      ui.moduleNav ? ui.moduleNav(state) : null,
      h('div', { class: 'gh-name' },
        h('label', { class: 'sr', for: 'project-name' }, 'Proje adı'),
        h('input', { id: 'project-name', class: 'ginput', type: 'text', maxlength: 80, value: meta.name, keep: true, autocomplete: 'off', placeholder: 'Proje adı', onchange: (e) => ctl.dispatch({ type: 'SET_META', patch: { name: e.target.value.trim() || 'Adsız proje' } }) }),
        meta.example ? h('span', { class: 'gh-tag', title: 'Bu proje bir örnektir. Düzenlemeye başladığınızda kendi projeniz olur.' }, 'örnek') : null),
      h('div', { class: 'gh-actions', role: 'toolbar', 'aria-label': 'Proje işlemleri' },
        gbtn('newdoc', 'Yeni proje', { onclick: ctl.newProject, title: 'Boş proje başlat (geri alınabilir)' }),
        gbtn('save', 'Kaydet', { onclick: ctl.saveJSON, title: 'Projeyi bilgisayara JSON olarak indir' }),
        gbtn('open', 'Yükle', { onclick: ctl.pickFile, title: 'Kaydedilmiş JSON projesini yükle' }),
        h('span', { class: 'gh-sep', 'aria-hidden': 'true' }),
        h('div', { class: 'gseg', role: 'group', 'aria-label': 'Dışa aktar' },
          h('button', { type: 'button', onclick: ctl.exportPNG, disabled: !!state.ui.busy, title: 'Saf şemayı PNG resmi olarak indir' }, 'PNG'),
          h('button', { type: 'button', onclick: ctl.exportPDF, disabled: !!state.ui.busy, title: 'Saf şemayı A3 PDF olarak indir' }, 'PDF'),
          ctl.exportReport ? h('button', { type: 'button', onclick: () => ctl.exportReport(), disabled: !!state.ui.busy, title: 'Tüm modüllerden çok sayfalı proje raporu (PDF)' }, 'Rapor') : null),
        state.ui.module === 'islev' ? h('span', { class: 'gh-sep', 'aria-hidden': 'true' }) : null,
        state.ui.module === 'islev' ? h('button', { type: 'button', class: 'gpill' + (state.ui.assistantOpen ? ' on' : ''), onclick: ctl.toggleAssistant, 'aria-pressed': String(!!state.ui.assistantOpen), title: 'Akıllı öneri panelini aç / kapat' },
          ui.icon('spark', 16), h('span', {}, 'Akıllı öneri'),
          issues ? h('span', { class: 'badge' + (state.ui.assistantOpen ? '' : ' pulse-badge') }, String(issues)) : null) : null),
      ui.profileBtn && App.visit && App.visit.enabled() ? gbtn('user', 'Profilim ve gizlilik', { onclick: ui.profileBtn, title: 'Profil bilgilerim, gizlilik ve verilerimi silme' }) : null,
      ui.themeToggle(state),
      h('input', { id: 'file-load', class: 'sr', type: 'file', accept: '.json,application/json', tabindex: -1, onchange: ctl.onFile, 'aria-label': 'Proje dosyası seç' }));
  };

  /* --- skor kadranı: kabartmalı yüz, ince ibre (referans görseldeki saat gibi) ---
     o: { label, percent, msg, chips: [{label, value, tail, cls}], warn, issues, issuesText, okText, onIssues } */
  glass.meter = function (o) {
    const pc = o.percent;
    const R = 44, C = 2 * Math.PI * R, sweep = C * 0.75;
    const val = pc == null ? 0 : pc;
    const ticks = [];
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180;
      const major = i % 5 === 0;
      const r1 = 56, r2 = major ? 50 : 53;
      ticks.push(h('line', { key: 't' + i, x1: 60 + Math.sin(a) * r1, y1: 60 - Math.cos(a) * r1, x2: 60 + Math.sin(a) * r2, y2: 60 - Math.cos(a) * r2, stroke: 'currentColor', 'stroke-width': major ? 1.6 : 1, opacity: major ? 0.55 : 0.3, 'stroke-linecap': 'round' }));
    }
    const chip = (c) => h('li', { class: 'gchip', key: c.label }, h('i', { class: 'gsw gsw-' + (c.cls || 'plain') }), c.label + ' ', h('b', {}, c.value), c.tail ? ' ' + c.tail : '');
    const issues = o.issues || 0;
    return h('section', { class: 'gdial', 'aria-label': o.label },
      h('div', { class: 'gdial-face' },
        h('svg', { viewBox: '0 0 120 120', width: 112, height: 112, role: 'img', 'aria-label': pc == null ? 'Skor yok' : o.label + ' yüzde ' + pc },
          ticks,
          h('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, opacity: 0.12, 'stroke-linecap': 'round', 'stroke-dasharray': sweep + ' ' + C, transform: 'rotate(135 60 60)' }),
          h('circle', { class: 'gdial-arc', cx: 60, cy: 60, r: R, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': (sweep * val / 100) + ' ' + C, transform: 'rotate(135 60 60)' }),
          h('g', { class: 'gdial-needle', style: { transform: 'rotate(' + (-135 + 270 * val / 100) + 'deg)', transformOrigin: '60px 60px' } },
            h('line', { x1: 60, y1: 66, x2: 60, y2: 24, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' })),
          h('circle', { cx: 60, cy: 60, r: 4.5, fill: 'currentColor' }),
          h('circle', { cx: 60, cy: 60, r: 1.8, fill: 'var(--dial-pin, #fff)' }))),
      h('div', { class: 'gdial-info', 'aria-live': 'polite' },
        h('div', { class: 'gdial-num' }, pc == null ? '—' : '%' + pc),
        h('p', { class: 'gdial-msg' }, o.msg),
        h('ul', { class: 'gchips', 'aria-label': 'Skor ayrıntısı' }, (o.chips || []).map(chip), o.warn ? h('li', { class: 'gchip gchip-warn' }, o.warn) : null)),
      h('button', { type: 'button', class: 'gissues' + (issues ? ' has' : ''), onclick: o.onIssues, title: issues ? (o.issuesText || 'uyarı ve öneriler') : (o.okText || 'kritik sorun yok') },
        issues ? h('b', {}, String(issues)) : ui.icon('check', 15),
        h('span', {}, issues ? (o.issuesText || 'uyarı ve öneriler') : (o.okText || 'kritik sorun yok'))));
  };
  glass.dial = function (state, d) { return glass.meter(ui.meterFor(state, d)); };

  /* --- yüzen araç çubuğu --- */
  glass.dock = function (state, d, attn) {
    const ctl = App.ctl;
    const P = state.project;
    return h('div', { class: 'gdock', role: 'toolbar', 'aria-label': 'Yerleşim araçları' },
      h('button', { type: 'button', class: 'gpill gpill-strong' + (attn ? ' attn' : ''), onclick: ctl.autoLayout, disabled: !P.spaces.length, title: 'İlişkilere göre daireleri otomatik yerleştir' },
        ui.icon('layout', 16), h('span', {}, 'Otomatik yerleştir')),
      h('span', { class: 'gh-sep', 'aria-hidden': 'true' }),
      gbtn('undo', 'Geri al', { onclick: () => ctl.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' }),
      gbtn('redo', 'İleri al', { onclick: () => ctl.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' }));
  };
})();

/* ==========================================================================
   47-ui-shell.js — archtools kabuğu: modül gezgini, ortak skor kadranı verisi,
   araç çubuğu ve sayfa iskeleti. Modüller yalnızca kendi içeriğini üretir.
   Modül kimlikleri (state.ui.module ve #/rota): islev · kat · analiz · arsa · imar · yer · tasarim · fizibilite · vaziyet · kolaj · pafta
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  const ALL_MODULES = [
    { id: 'islev', n: '01', label: 'İşlev Şeması', sub: 'İşlev şeması · bubble diagram', shape: 'circle' },
    { id: 'kat', n: '02', label: 'Mekân Etüdü', sub: 'Mekân etüdü · şekil, boyut ve ilişki', shape: 'square' },
    { id: 'analiz', n: '03', label: 'Mekân Analizi', sub: 'Mekân analizi · patlatılmış izometrik', shape: 'triangle' },
    { id: 'arsa', n: '04', label: 'Arsa Analizi', sub: 'Arsa analizi · çevre, erişim, ulaşım', shape: 'diamond' },
    { id: 'imar', n: '05', label: 'İmar ve Kapasite', sub: 'İmar ve kapasite · parsel ve kütle', shape: 'plot' },
    { id: 'yer', n: '06', label: 'Yer Seçimi', sub: 'Yer seçimi · aday karşılaştırma ve tarama', shape: 'target' },
    { id: 'tasarim', n: '07', label: 'Tasarım Üretici', sub: 'Tasarım üretici · kütle, tipik kat ve otopark', shape: 'tower' },
    { id: 'fizibilite', n: '08', label: 'Maliyet ve Fizibilite', sub: 'Maliyet ve fizibilite · metraj, kâr, nakit akışı', shape: 'coin' },
    { id: 'vaziyet', n: '09', label: 'Vaziyet Planı', sub: 'Vaziyet planı · ölçekli yerleşim paftası', shape: 'sitemap' },
    { id: 'kolaj', n: '10', label: 'Kolaj Oluşturucu', sub: 'Kolaj oluşturucu · fotoğraf, kütle, siluet ve etiket', shape: 'collage' },
    { id: 'pafta', n: '11', label: 'Pafta Şablonu', sub: 'Pafta şablonu · araç çıktılarıyla jüri paftası', shape: 'layout' },
  ];
  // yalnızca açık modüller gezilir ve listelenir (App.config.modules)
  const ENABLED = (App.config && App.config.modules) || null;
  const MODULES = ENABLED ? ALL_MODULES.filter((m) => ENABLED.indexOf(m.id) >= 0) : ALL_MODULES;
  ui.MODULES = MODULES;
  ui.moduleInfo = (id) => MODULES.find((m) => m.id === id) || MODULES[0];
  ui.moduleSub = (state) => ui.moduleInfo(state.ui.module).sub;

  /* modül simgesi: daire · kare · üçgen (marka simgesinin üç parçası) + eşkenar dörtgen · parsel · hedef */
  function shapeIcon(shape) {
    const p = { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' };
    const q = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round' };
    let g;
    if (shape === 'circle') g = h('circle', Object.assign({ cx: 9, cy: 9, r: 6.2 }, p));
    else if (shape === 'square') g = h('rect', Object.assign({ x: 3, y: 3, width: 12, height: 12, rx: 2 }, p));
    else if (shape === 'diamond') g = h('path', Object.assign({ d: 'M9 2L16 9 9 16 2 9z' }, p));
    else if (shape === 'plot') g = h('path', Object.assign({ d: 'M2.6 6.6L9 2.4l6.4 4.6-2.2 8.2H5z' }, p));
    else if (shape === 'target') g = h('g', {}, h('circle', Object.assign({ cx: 9, cy: 9, r: 6.4 }, q)), h('circle', Object.assign({ cx: 9, cy: 9, r: 2.6 }, p)));
    else if (shape === 'tower') g = h('g', {}, h('rect', Object.assign({ x: 4.2, y: 2, width: 9.6, height: 14, rx: 1.2 }, p)), h('path', { d: 'M7 6h4M7 9h4M7 12h4', stroke: 'var(--on-ink, #fff)', 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round' }));
    else if (shape === 'stack') g = h('g', {}, h('rect', Object.assign({ x: 2.4, y: 9.6, width: 8.4, height: 6, rx: 1 }, p)), h('rect', Object.assign({ x: 7.2, y: 2.4, width: 8.4, height: 6, rx: 1 }, q)));
    else if (shape === 'sitemap') g = h('g', {}, h('rect', Object.assign({ x: 2.4, y: 2.4, width: 13.2, height: 13.2, rx: 1 }, q)), h('rect', Object.assign({ x: 5, y: 5.4, width: 4.6, height: 4.2, rx: 0.6 }, p)), h('path', { d: 'M2.6 12.6h12.8', stroke: 'currentColor', 'stroke-width': 1.6, fill: 'none' }), h('circle', Object.assign({ cx: 12.6, cy: 6.4, r: 1.7 }, p)));
    else if (shape === 'collage') g = h('g', {}, h('rect', Object.assign({ x: 2.4, y: 3.4, width: 9.6, height: 11.2, rx: 1 }, q)), h('circle', Object.assign({ cx: 11.4, cy: 6.8, r: 3.6 }, p)), h('path', { d: 'M8 14.6l3.2-3.6 4.4 3.6z', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));
    else if (shape === 'layout') g = h('g', {}, h('rect', Object.assign({ x: 2.4, y: 2.4, width: 13.2, height: 13.2, rx: 1 }, q)), h('rect', Object.assign({ x: 4.6, y: 4.6, width: 5.2, height: 5.6, rx: 0.5 }, p)), h('path', { d: 'M12 5h1.6M12 8h1.6M5 13h8', stroke: 'currentColor', 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round' }));
    else if (shape === 'coin') g = h('g', {}, h('circle', Object.assign({ cx: 9, cy: 9, r: 6.6 }, q)), h('path', { d: 'M9 5.2v7.6M6.8 7.4c0-1 .9-1.7 2.2-1.7s2.2.7 2.2 1.6c0 2.3-4.4 1.1-4.4 3.4 0 .9 1 1.7 2.2 1.7s2.2-.7 2.2-1.7', stroke: 'currentColor', 'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round' }));
    else g = h('path', Object.assign({ d: 'M2.5 15.2L9 3l6.5 12.2z' }, p));
    return h('svg', { viewBox: '0 0 18 18', width: 16, height: 16, class: 'msh msh-' + shape, 'aria-hidden': 'true' }, g);
  }

  ui.moduleNav = function (state) {
    if (MODULES.length < 2) return null; // tek modül açıkken gezgin gösterilmez
    const cur = state.ui.module;
    return h('nav', { class: 'mnav', 'aria-label': 'archtools modülleri' },
      MODULES.map((m) => h('button', { key: m.id, type: 'button', class: 'mnav-i mnav-' + m.id + (m.id === cur ? ' on' : ''), 'aria-current': m.id === cur ? 'page' : null, title: m.n + ' · ' + m.label, onclick: () => App.ctl.go(m.id) },
        shapeIcon(m.shape), h('span', { class: 'mnav-n mono' }, m.n), h('span', { class: 'mnav-l' }, m.label))));
  };

  /* ---------------- skor kadranı verileri (her modül kendi skorunu bildirir) ---------------- */
  const pc = (v) => (v == null ? '—' : '%' + Math.round(v * 100));
  const level = (p, msgs) => (p == null ? msgs[0] : p >= 85 ? msgs[1] : p >= 70 ? msgs[2] : p >= 40 ? msgs[3] : msgs[4]);

  function islevMeter(state, d) {
    const s = d.score, c = s.counts, p = s.percent;
    const issues = d.analysis.counts.hata + d.analysis.counts.uyari;
    return {
      label: 'Verimlilik skoru', percent: p,
      msg: level(p, ['İlişki ekleyerek skoru başlatın', 'Çok iyi yerleşim', 'İyi, birkaç ince ayar kaldı', 'Güçlü ilişkili daireleri yaklaştırın', 'Güçlü bağlar çok uzak']),
      chips: [
        { label: 'Güçlü', value: c.strong[0] ? c.strong[1] + '/' + c.strong[0] : '0', tail: 'yakın', cls: 'strong' },
        { label: 'Zayıf', value: c.weak[0] ? c.weak[1] + '/' + c.weak[0] : '0', tail: 'uygun', cls: 'weak' },
        { label: 'Ayrı', value: c.avoid[0] ? c.avoid[1] + '/' + c.avoid[0] : '0', tail: 'uzak', cls: 'avoid' },
      ],
      warn: s.overlaps.length ? 'Üst üste ' + s.overlaps.length : null,
      issues: issues, onIssues: App.ctl.openAnalysis,
    };
  }

  function planMeter(state) {
    const P = state.project, d = App.pe.derive(P), m = d.metrics, p = m.score, c = d.findings.counts;
    return {
      label: 'Plan skoru', percent: p,
      msg: !d.E.rooms.length ? 'Mekân ekleyerek ya da programdan plan oluşturarak başlayın' : level(p, ['Mekân ekleyerek planı başlatın', 'Plan erişim, ışık ve alan açısından çok iyi', 'İyi plan, birkaç ince ayar kaldı', 'Erişim, gün ışığı ya da alan uyumunu iyileştirin', 'Planda ciddi eksikler var']),
      chips: [
        { label: 'Erişim', value: pc(m.reach), cls: 'dot' },
        { label: 'Gün ışığı', value: pc(m.day), cls: 'dot' },
        { label: 'Alan uyumu', value: pc(m.areaFit), cls: 'dot' },
        { label: 'İlişki', value: pc(m.relFit), cls: 'dot' },
      ],
      issues: c.hata + c.uyari,
      issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.dispatch({ type: 'UI', patch: { peTab: 'bulgular' } }),
    };
  }

  function mekanMeter(state, tabKey) {
    const P = state.project;
    const fd = App.study.freeDerive(P), m = fd.metrics, p = m.score;
    return {
      label: 'Düzen skoru', percent: p,
      msg: !P.spaces.length ? 'Önce İşlev Şeması’nda mekân ekleyin' : level(p, ['Mekân ekleyerek etüdü başlatın', 'Mekânlar ilişkilere çok uyumlu', 'İyi yerleşim, birkaç ince ayar kaldı', 'Güçlü ilişkili mekânları yan yana alın', 'Mekânlar çakışıyor ya da ilişkilerden kopuk']),
      chips: [
        { label: 'Bitişik güçlü', value: m.strongTotal ? m.strongOk + '/' + m.strongTotal : '0', cls: 'dot' },
        { label: 'Çakışma', value: String(m.overlapCount), cls: 'dot' },
        { label: 'Alan uyumu', value: pc(m.areaFit), cls: 'dot' },
        { label: 'Kompaktlık', value: pc(m.compact), cls: 'dot' },
      ],
      issues: fd.findings.counts.hata + fd.findings.counts.uyari,
      issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.dispatch({ type: 'UI', patch: { [tabKey || 'stTab']: 'bulgular' } }),
    };
  }

  function katMeter(state) {
    const P = state.project;
    if (!P.study) return { label: 'Düzen skoru', percent: null, msg: '', chips: [], issues: 0 };
    if (App.study.modeOf && App.study.modeOf(state) === 'plan' && App.pe) return planMeter(state);
    if (App.study.modeOf && App.study.modeOf(state) === 'mekanlar') return mekanMeter(state);
    const sd = App.study.derive(P), m = sd.metrics, p = m.score;
    return {
      label: 'Kat skoru', percent: p,
      msg: !P.spaces.length ? 'Önce İşlev Şeması’nda mekân ekleyin' : level(p, ['İlişki tanımlayarak skoru başlatın', 'Katlar ilişkilere çok uyumlu', 'İyi dağılım, birkaç ince ayar kaldı', 'Güçlü ilişkili mekânları aynı kata alın', 'Güçlü bağlar katlara dağılmış']),
      chips: [
        { label: 'Aynı katta güçlü', value: m.strongTotal ? m.strongSame + '/' + m.strongTotal : '0', cls: 'dot' },
        { label: 'Kat dengesi', value: pc(m.balance), cls: 'dot' },
        { label: 'Islak hacim hizası', value: pc(m.wetAlign), cls: 'dot' },
        { label: 'Plak doluluğu', value: pc(m.fill), cls: 'dot' },
      ],
      issues: sd.findings.counts.hata + sd.findings.counts.uyari,
      issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.dispatch({ type: 'UI', patch: { stTab: 'bulgular' } }),
    };
  }

  function analizMeter(state) {
    const P = state.project;
    if (!P.study) return { label: 'Uyum skoru', percent: null, msg: '', chips: [], issues: 0 };
    if (state.ui.an && state.ui.an.mode === 'modules') return mekanMeter(state, 'anTab');
    const sd = App.study.derive(P), A = App.analysis.analyze(P, sd), p = A.score, st = A.stats;
    return {
      label: 'Uyum skoru', percent: p,
      msg: !P.spaces.length ? 'Önce İşlev Şeması’nda mekân ekleyin' : level(p, ['Mekân ekleyerek analizi başlatın', 'Düşey ve çevresel uyum çok iyi', 'İyi, birkaç ince ayar kaldı', 'Islak hacim ve cephe düzenini gözden geçirin', 'Düşey düzen ciddi şekilde çatışıyor']),
      chips: [
        { label: 'Gün ışığı', value: pc(st.daylight), cls: 'dot' },
        { label: 'Islak hacim hizası', value: pc(st.wetAlign), cls: 'dot' },
        { label: 'Gürültü çakışması', value: String(st.conflicts), cls: 'dot' },
        { label: 'Doluluk', value: pc(st.fill), cls: 'dot' },
      ],
      issues: A.counts.hata + A.counts.uyari,
      issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.dispatch({ type: 'UI', patch: { anTab: 'bulgular' } }),
    };
  }

  function vaziyetMeter(state) {
    const p = state.project.plan;
    if (!p || !App.plan) return { label: 'Yeşil oranı', percent: null, msg: '', chips: [], issues: 0 };
    const M = App.plan.metrics(p);
    return {
      label: 'Yeşil oranı', percent: M.greenShare == null ? null : Math.round(M.greenShare * 100),
      msg: !p.els.length ? 'Bir araç seçip çizmeye başlayın' : !M.hasBound ? '1/' + p.scale + ' · ' + p.els.length + ' öğe · TAKS ve KAKS için proje sınırı çizin' : '1/' + p.scale + ' · parsel ' + U.fmt(M.boundArea) + ' m² · TAKS ' + U.fmt(M.taks, 2) + ' · KAKS ' + U.fmt(M.kaks, 2),
      chips: [
        { label: 'Ölçek', value: '1/' + p.scale, cls: 'dot' },
        { label: 'TAKS', value: M.taks == null ? '–' : U.fmt(M.taks, 2), cls: 'dot' },
        { label: 'KAKS', value: M.kaks == null ? '–' : U.fmt(M.kaks, 2), cls: 'dot' },
        { label: 'Ağaç', value: String(M.trees), cls: 'dot' },
      ],
      issues: 0, issuesText: '', onIssues: null,
    };
  }

  function kolajMeter(state) {
    const c = state.project.collage;
    if (!c || !App.collage) return { label: 'Katman', percent: null, msg: '', chips: [], issues: 0 };
    const cnt = (t) => c.layers.filter((l) => l.t === t).length;
    return {
      label: 'Katman', percent: null,
      msg: !c.layers.length ? 'Bir fotoğraf yükleyip kolaja başlayın' : c.layers.length + ' katman · ' + App.collage.sizeOf(c).label + ' · vurgu ' + c.accent,
      chips: [
        { label: 'Fotoğraf', value: String(cnt('photo')), cls: 'dot' },
        { label: 'Şekil', value: String(cnt('shape')), cls: 'dot' },
        { label: 'Figür', value: String(cnt('fig')), cls: 'dot' },
        { label: 'Yazı', value: String(cnt('text')), cls: 'dot' },
      ],
      issues: 0, issuesText: '', onIssues: null,
    };
  }

  function paftaMeter(state) {
    const t = state.project.tpl;
    if (!t || !App.tpl) return { label: 'Panel', percent: null, msg: '', chips: [], issues: 0 };
    const cnt = (k) => t.panels.filter((p) => p.t === k).length;
    const refs = App.tpl.refsOf(t).length;
    return {
      label: 'Panel', percent: null,
      msg: !t.panels.length ? 'Bir şablon seçerek paftaya başlayın' : t.panels.length + ' panel · ' + App.tpl.sizeOf(t).label + ' · ' + refs + ' araç çıktısı',
      chips: [
        { label: 'Görsel', value: String(cnt('view')), cls: 'dot' },
        { label: 'Metin', value: String(cnt('text')), cls: 'dot' },
        { label: 'Araç', value: String(refs), cls: 'dot' },
        { label: 'Boyut', value: App.tpl.sizeOf(t).label.split(' ')[0], cls: 'dot' },
      ],
      issues: 0, issuesText: '', onIssues: null,
    };
  }

  ui.meterOpts = { islev: islevMeter, bubble: islevMeter, kat: katMeter, analiz: analizMeter, vaziyet: vaziyetMeter, kolaj: kolajMeter, pafta: paftaMeter };
  ui.meterFor = (state, d) => (ui.meterOpts[state.ui.module] || islevMeter)(state, d);

  /* ---------------- araç çubuğu ----------------
     items: { k:'btn', label, icon, onclick, disabled, strong, attn, title } | { k:'icon', ... } | { k:'sep' } | { k:'seg', ...ui.segmented } */
  ui.toolbar = function (items, extra) {
    const g = App.theme.name === 'glass';
    const nodes = items.filter(Boolean).map((it, i) => {
      if (it.k === 'sep') return g ? h('span', { key: 's' + i, class: 'gh-sep', 'aria-hidden': 'true' }) : null;
      if (it.k === 'seg') return h('div', { key: 'g' + i, class: 'tb-seg' }, ui.segmented(it));
      if (it.k === 'icon') {
        if (g) return ui.glass.gbtn(it.icon, it.label, { onclick: it.onclick, disabled: it.disabled, title: it.title, pressed: it.pressed });
        return ui.btn(it.label, { icon: it.icon, onclick: it.onclick, disabled: it.disabled, title: it.title || it.label, labelCls: 'lbl-hide', pressed: it.pressed });
      }
      if (g) return h('button', { key: 'b' + i, type: 'button', class: 'gpill' + (it.strong ? ' gpill-strong' : '') + (it.attn ? ' attn' : ''), onclick: it.onclick, disabled: !!it.disabled, title: it.title || null, 'aria-pressed': it.pressed == null ? null : String(!!it.pressed) }, it.icon ? ui.icon(it.icon, 16) : null, h('span', {}, it.label));
      return ui.btn(it.label, { icon: it.icon, onclick: it.onclick, disabled: it.disabled, title: it.title, cls: (it.strong ? 'btn-yellow' : '') + (it.attn ? ' attn' : ''), pressed: it.pressed });
    });
    if (g) return h('div', { class: 'gdock', role: 'toolbar', 'aria-label': 'Araçlar' }, nodes);
    return h('div', { class: 'board-bar', role: 'toolbar', 'aria-label': 'Araçlar' }, nodes, extra ? h('span', { class: 'board-scale' }, extra) : null);
  };

  /* Pafta bölümü iskeleti: glass'ta kadran + araç çubuğu üstte, Bauhaus'ta skor şeridi sayfa başında */
  ui.boardPage = function (state, d, o) {
    if (App.theme.name === 'glass') {
      return h('section', { class: 'board-wrap', 'aria-label': o.label },
        h('div', { class: 'gstrip' }, ui.glass.dial(state, d), ui.toolbar(o.tools)),
        o.stage,
        h('div', { class: 'board-foot' }, o.foot || h('span', {}), o.scale ? h('span', { class: 'board-scale' }, o.scale) : null));
    }
    return h('section', { class: 'board-wrap', 'aria-label': o.label },
      ui.toolbar(o.tools, o.scale),
      o.stage,
      o.foot || null);
  };

  /* Boş durum kartı: pafta üstünde */
  ui.emptyCard = function (title, text, actions, cls) {
    return h('div', { class: 'empty-card' + (cls ? ' ' + cls : '') },
      h('h2', { class: 'empty-title' }, title),
      h('p', {}, text),
      h('div', { class: 'empty-actions' }, actions));
  };

  /* Sol panel iskeleti (modül 2 ve 3) */
  ui.sideShell = function (key, label, tabs, body) {
    return h('aside', { key: key, class: 'sidebar', 'aria-label': label }, tabs, h('div', { class: 'side-body', role: 'tabpanel' }, body));
  };

  /* Sayfa gövdesi: modüle göre */
  ui.pageMain = function (state, d) {
    const m = state.ui.module;
    if (m === 'kat' && ui.floors) return h('main', { class: 'main main-kat', key: 'main-kat' }, ui.floors.sidebar(state, d), ui.floors.board(state, d));
    if (m === 'analiz' && ui.analysis) return h('main', { class: 'main main-analiz', key: 'main-analiz' }, ui.analysis.sidebar(state, d), ui.analysis.board(state, d));
    if (m === 'arsa' && ui.site) return h('main', { class: 'main main-arsa', key: 'main-arsa' }, ui.site.sidebar(state, d), ui.site.board(state, d));
    if (m === 'imar' && ui.imar) return h('main', { class: 'main main-imar', key: 'main-imar' }, ui.imar.sidebar(state, d), ui.imar.board(state, d));
    if (m === 'tasarim' && ui.design) return h('main', { class: 'main main-tasarim', key: 'main-tasarim' }, ui.design.sidebar(state, d), ui.design.board(state, d));
    if (m === 'fizibilite' && ui.fizb) return h('main', { class: 'main main-fizibilite', key: 'main-fizibilite' }, ui.fizb.sidebar(state, d), ui.fizb.board(state, d));
    if (m === 'vaziyet' && ui.plan) return h('main', { class: 'main main-vaziyet', key: 'main-vaziyet' }, ui.plan.sidebar(state, d), ui.plan.board(state, d));
    if (m === 'kolaj' && ui.col) return h('main', { class: 'main main-kolaj', key: 'main-kolaj' }, ui.col.sidebar(state, d), ui.col.board(state, d));
    if (m === 'pafta' && ui.tpl) return h('main', { class: 'main main-pafta', key: 'main-pafta' }, ui.tpl.sidebar(state, d), ui.tpl.board(state, d));
    if (m === 'yer' && ui.yer) return h('main', { class: 'main main-yer', key: 'main-yer' }, ui.yer.sidebar(state, d), ui.yer.board(state, d));
    return h('main', { class: 'main main-islev', key: 'main-islev' }, ui.sidebar(state, d), ui.board(state, d), ui.assistant(state, d));
  };
})();

/* ==========================================================================
   47-ui-zoom.js — sonsuz çalışma alanı: yakınlaştır / uzaklaştır / kaydır
   Tuval pencerenin TAMAMINI kaplar (kenardan kenara); paneller tuvalin üstünde yüzer. Pafta (levha) bu sonsuz düzlemin
   ortasındaki bir sayfadır; kullanıcı her yöne sınırsız kayabilir, daireleri düzlemin her yerine bırakabilir.
   Görünüm yalnızca arayüz durumudur (state.ui.view = null | { cx, cy, k }); projeye / JSON'a yazılmaz.
     tekerlek ........ imlecin olduğu noktaya yakınlaştır · Ctrl + tekerlek / dokunmatik yüzey kıstırma de aynı
     kaydırma ........ orta tuşla sürükle · Boşluk basılıyken sürükle · El aracı · ok tuşları (seçili grup yokken)
     kenara sürükleme  daire (ya da seçim kutusu) görünür alanın kenarına götürülünce tuval kendiliğinden kayar
     dokunmatik ...... iki parmakla kıstır + sürükle
     klavye .......... + / − yakınlaştır · 0 paftaya dön · Esc odak kipinden çık (dar ekranda tam ekran tuval)
   Dönüşüm: SVG pencere boyutundadır; "güvenli alan" (paneller dışında kalan, ui.vp) merkezine bakılan dünya noktası (cx, cy) oturur.
   Ekran ölçeği s = sfit · k; sfit = pafta güvenli alana sığma ölçeği. İstemci ↔ dünya dönüşümü çözümseldir (DOM'a bağlı değil).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const geo = App.geo;
  const clamp = App.util.clamp;
  const Z = (ui.zoom = {});

  const get = () => App.store.get();
  const dispatch = (a) => App.store.dispatch(a);
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEFAULT = () => ({ cx: geo.W / 2, cy: geo.H / 2, k: 1 });
  Z.cur = () => get().ui.view || DEFAULT();

  /* ---------- görünüm penceresi (vp): SVG boyutu + güvenli alan (px, SVG'ye göre) ---------- */
  // slotun altında yüzen araç çubuğuna ayrılan şerit (px): pafta bu şeridin altına sığdırılmaz, daireler çubuğun altında kalmaz
  const RAIL = 60;
  function fallbackVp() {
    const de = document.documentElement, w = de.clientWidth || 1200, hh = de.clientHeight || 800;
    return w >= 1024
      ? { w: w, h: hh, sx: 410, sy: 176, sw: Math.max(300, w - 434), sh: Math.max(260, hh - 246 - RAIL) }
      : { w: w, h: hh, sx: 0, sy: 0, sw: w, sh: Math.max(160, hh - RAIL) };
  }
  const VP = (S) => (S || get()).ui.vp || fallbackVp();
  // pafta güvenli alana sığarken bırakılan kenar boşluğu ve sığma ölçeği
  const padOf = (vp) => Math.max(8, Math.min(28, 0.04 * Math.min(vp.sw, vp.sh)));
  const fitOf = (vp) => Math.max(1e-6, Math.min((vp.sw - 2 * padOf(vp)) / geo.W, (vp.sh - 2 * padOf(vp)) / geo.H));
  Z.scale = (view, S) => fitOf(VP(S)) * (view ? view.k : 1);

  // SVG viewBox dizgesi (42-ui-board.js çizimde kullanır)
  Z.viewBox = function (view, S) {
    const vp = VP(S), v = view || DEFAULT(), s = fitOf(vp) * v.k;
    return (v.cx - (vp.sx + vp.sw / 2) / s) + ' ' + (v.cy - (vp.sy + vp.sh / 2) / s) + ' ' + (vp.w / s) + ' ' + (vp.h / s);
  };

  // güvenli alanı ve pencere boyutunu ölç; değiştiyse durumu güncelle (viewBox yeniden hesaplanır)
  let watched = null, ro = null, mq = false;
  Z.measure = function () {
    const el = ui.svgEl;
    const slot = el && el.closest ? el.closest('.board-slot') : null;
    if (!el || !el.isConnected || !slot) return;
    const r = el.getBoundingClientRect(), q = slot.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && q.width > 0 && q.height > 0)) return;
    const vp = { w: Math.round(r.width), h: Math.round(r.height), sx: Math.round(q.left - r.left), sy: Math.round(q.top - r.top), sw: Math.round(q.width), sh: Math.max(120, Math.round(q.height) - RAIL) };
    const o = get().ui.vp;
    if (o && o.w === vp.w && o.h === vp.h && o.sx === vp.sx && o.sy === vp.sy && o.sw === vp.sw && o.sh === vp.sh) return;
    dispatch({ type: 'UI', patch: { vp: vp } });
  };
  const measureSoon = App.raf(function () { mq = false; Z.measure(); });
  function watch(el) {
    const slot = el.closest ? el.closest('.board-slot') : null;
    if (!slot || watched === slot) return;
    watched = slot;
    if (window.ResizeObserver) {
      if (!ro) ro = new ResizeObserver(measureSoon);
      ro.disconnect();
      ro.observe(slot); ro.observe(el);
    }
    measureSoon();
  }
  window.addEventListener('resize', measureSoon);
  window.addEventListener('orientationchange', measureSoon);

  /* ---------- ekran ölçüleri ---------- */
  function metrics() {
    const el = ui.svgEl;
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const vp = VP();
    return { r: r, vp: vp, sfit: fitOf(vp), ax: r.left + vp.sx + vp.sw / 2, ay: r.top + vp.sy + vp.sh / 2 };
  }
  // güvenli alanın (paneller dışında kalan, görünür) dünya dikdörtgeni
  function visibleRect(v, m) {
    const s = m.sfit * v.k;
    const hw = m.vp.sw / (2 * s), hh = m.vp.sh / (2 * s);
    return { x0: v.cx - hw, y0: v.cy - hh, x1: v.cx + hw, y1: v.cy + hh, s: s };
  }
  Z.visible = () => { const m = metrics(); return m ? visibleRect(Z.cur(), m) : null; };
  // istemci (ekran) noktası → dünya
  Z.toWorld = function (x, y) {
    const m = metrics(), v = Z.cur();
    if (!m) return { x: v.cx, y: v.cy };
    const s = m.sfit * v.k;
    return { x: v.cx + (x - m.ax) / s, y: v.cy + (y - m.ay) / s };
  };

  /* ---------- daire sınırları (etiket payı dahil) ---------- */
  function bubbleBoxes(S, only) {
    const k = geo.scale(S.project.spaces);
    return S.project.spaces.filter((s) => !only || only.indexOf(s.id) >= 0).map((s) => {
      const r = geo.radius(s.area, k);
      return { x0: s.x - r - 14, y0: s.y - r - 14, x1: s.x + r + 14, y1: s.y + r + 14 + (r < 36 ? 64 : 0) };
    });
  }
  const union = (bs) => bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const SHEET = () => ({ x0: 0, y0: 0, x1: geo.W, y1: geo.H });
  const inside = (b, o) => b.x0 >= o.x0 && b.y0 >= o.y0 && b.x1 <= o.x1 && b.y1 <= o.y1;

  // dikdörtgeni (dünya) güvenli alana sığdıran görünüm
  function fitView(b, padPx, m) {
    const bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
    const k = Math.min(Math.max(m.vp.sw - 2 * padPx, 40) / bw, Math.max(m.vp.sh - 2 * padPx, 40) / bh) / m.sfit;
    return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, k: clamp(k, geo.ZOOM.min, geo.ZOOM.max) };
  }

  /* ---------- görünümü değiştir ---------- */
  let anim = null;
  Z.cancel = function () { if (anim) { cancelAnimationFrame(anim.raf); anim = null; } };
  Z.animating = () => !!anim;
  Z.set = function (v) { dispatch({ type: 'UI', patch: { view: geo.normView(v) } }); };

  // hedef görünüme yumuşak geçiş (log ölçekte yakınlaştırma); null = pafta
  Z.animateTo = function (t) {
    t = t || DEFAULT();
    const a = Z.cur();
    Z.cancel();
    if (reduceMotion()) { Z.set(t); return; }
    const t0 = performance.now(), D = 260;
    anim = { raf: 0, t: t };
    const step = function (now) {
      const p = clamp((now - t0) / D, 0, 1), e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { anim = null; Z.set(t); return; }
      Z.set({ cx: a.cx + (t.cx - a.cx) * e, cy: a.cy + (t.cy - a.cy) * e, k: a.k * Math.pow(t.k / a.k, e) });
      anim.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  };

  // (px, py) ekran noktası sabit kalacak şekilde çarpanla yakınlaştır
  Z.zoomAt = function (px, py, f, base) {
    const m = metrics();
    const v = base || Z.cur();
    const k2 = clamp(v.k * f, geo.ZOOM.min, geo.ZOOM.max);
    if (!m) { Z.set({ cx: v.cx, cy: v.cy, k: k2 }); return; }
    const s = m.sfit * v.k, s2 = m.sfit * k2;
    const dx = px - m.ax, dy = py - m.ay;
    Z.set({ cx: v.cx + dx / s - dx / s2, cy: v.cy + dy / s - dy / s2, k: k2 });
  };
  // art arda basılan + / − hedefi biriktirir (animasyon sürerken hedef görünümden devam edilir)
  Z.zoomBy = function (f) { const v = anim ? anim.t : Z.cur(); Z.animateTo({ cx: v.cx, cy: v.cy, k: clamp(v.k * f, geo.ZOOM.min, geo.ZOOM.max) }); };
  Z.home = function () { Z.animateTo(null); };

  // paftayı ve tüm daireleri birlikte göster
  Z.contentRect = (S) => union(bubbleBoxes(S).concat([SHEET()]));
  Z.fitAll = function () {
    const m = metrics();
    const S = get();
    const b = Z.contentRect(S);
    if (!m || inside(b, SHEET())) { Z.home(); return; } // her şey paftanın içindeyse varsayılan görünüm
    Z.animateTo(fitView(b, 36, m));
  };

  // bu daireler tamamen görünür değilse görünüme getir (listeden seçme, "yerini göster")
  Z.reveal = function (ids) {
    const m = metrics();
    if (!m) return;
    const S = get();
    const bs = bubbleBoxes(S, ids);
    if (!bs.length) return;
    const b = union(bs), v = Z.cur(), vis = visibleRect(v, m), pad = 16 / vis.s;
    if (b.x0 >= vis.x0 + pad && b.y0 >= vis.y0 + pad && b.x1 <= vis.x1 - pad && b.y1 <= vis.y1 - pad) return;
    const f = fitView(b, 80, m);
    Z.animateTo({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, k: Math.min(f.k, v.k) });
  };

  // görünüm dışında kalan daire sayısı ("N daire görünüm dışında" düğmesi)
  Z.offscreen = function (S) {
    const m = metrics();
    if (!m || !S.project.spaces.length) return 0;
    const vis = visibleRect(S.ui.view || DEFAULT(), m);
    return bubbleBoxes(S).filter((b) => b.x1 < vis.x0 || b.x0 > vis.x1 || b.y1 < vis.y0 || b.y0 > vis.y1).length;
  };

  /* ---------- sürüklerken kenara gelince otomatik kaydırma ---------- */
  let edge = null;
  const EDGE_ZONE = 56, EDGE_SPEED = 780; // px: kenardan içeri bölge · px/sn: en yüksek hız
  Z.stopEdge = function () { if (edge) { cancelAnimationFrame(edge.raf); edge = null; } };
  function edgeTick(now) {
    if (!edge) return;
    const dt = Math.min(0.05, Math.max(0, (now - edge.t) / 1000));
    edge.t = now;
    const m = metrics();
    if (m && (edge.vx || edge.vy)) {
      const v = Z.cur(), s = m.sfit * v.k;
      Z.set({ cx: v.cx + edge.vx * EDGE_SPEED * dt / s, cy: v.cy + edge.vy * EDGE_SPEED * dt / s, k: v.k });
      if (ui.redrag) ui.redrag(); // sürüklenen daire / seçim kutusu işaretçiyle birlikte kayar
    }
    edge.raf = requestAnimationFrame(edgeTick);
  }
  // sürükleme sırasında işaretçi konumu verilir; güvenli alanın kenarına yakınsa (ya da dışındaysa) tuval o yöne kayar
  Z.edgePan = function (x, y) {
    const m = metrics();
    if (!m) return;
    const L = m.r.left + m.vp.sx, T = m.r.top + m.vp.sy, R = L + m.vp.sw, B = T + m.vp.sh;
    const f = (d) => (d <= 0 ? 1.4 : d >= EDGE_ZONE ? 0 : 1 - d / EDGE_ZONE);
    const vx = f(R - x) - f(x - L), vy = f(B - y) - f(y - T);
    if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) { Z.stopEdge(); return; }
    if (!edge) { edge = { vx: vx, vy: vy, t: performance.now(), raf: 0 }; edge.raf = requestAnimationFrame(edgeTick); }
    else { edge.vx = vx; edge.vy = vy; }
  };

  /* ---------- tekerlek ---------- */
  let wh = null;
  function flushWheel() { const w = wh; wh = null; if (w) Z.zoomAt(w.x, w.y, w.f); }
  function onWheel(e) {
    if (get().ui.module !== 'islev') return;
    e.preventDefault();
    Z.cancel();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33; else if (e.deltaMode === 2) dy *= 400;
    const f = Math.exp(-clamp(dy, -400, 400) * (e.ctrlKey ? 0.01 : 0.0016));
    if (!wh) { wh = { x: e.clientX, y: e.clientY, f: 1 }; requestAnimationFrame(flushWheel); }
    wh.x = e.clientX; wh.y = e.clientY; wh.f *= f;
  }

  /* ---------- işaretçi: kaydırma + kıstırma (yakalama aşamasında; daire sürükleme / kutu seçiminden önce) ---------- */
  const pts = new Map();
  let pinch = null, pan = null, inBoard = false;
  Z.busy = () => !!(pan || pinch);
  Z.inBoard = () => inBoard;

  function mid2() {
    const a = Array.from(pts.values()).slice(0, 2);
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 };
  }
  function startPinch() {
    const m = metrics();
    if (!m) return;
    if (ui.cancelDrag) ui.cancelDrag();
    if (pan) endPan(pan.id);
    Z.cancel();
    const c = mid2();
    pinch = { d0: c.d, mid0: { x: c.x, y: c.y }, v0: Z.cur() };
  }
  function endPan(id) {
    if (!pan) return;
    try { ui.svgEl.releasePointerCapture(id); } catch (err) {}
    pan = null;
    dispatch({ type: 'UI', patch: { pn: false } });
  }

  function capDown(e) {
    inBoard = true;
    const S = get();
    if (S.ui.module !== 'islev') return;
    if (e.pointerType === 'touch') {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && !pinch) startPinch();
      if (pinch) { e.stopPropagation(); e.preventDefault(); return; }
    }
    const want = e.button === 1 || (e.button === 0 && (S.ui.sp || S.ui.tool === 'hand'));
    if (!want) return;
    e.stopPropagation();
    e.preventDefault();
    Z.cancel();
    pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, v: Z.cur() };
    try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    dispatch({ type: 'UI', patch: { pn: true } });
  }
  function capMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      e.stopPropagation(); e.preventDefault();
      const m = metrics();
      if (!m) return;
      const c = mid2(), v0 = pinch.v0;
      const k2 = clamp(v0.k * c.d / pinch.d0, geo.ZOOM.min, geo.ZOOM.max);
      const s0 = m.sfit * v0.k, s2 = m.sfit * k2;
      // ilk orta noktanın altındaki dünya noktası, şimdiki orta noktanın altında kalsın
      const wx = v0.cx + (pinch.mid0.x - m.ax) / s0, wy = v0.cy + (pinch.mid0.y - m.ay) / s0;
      Z.set({ cx: wx - (c.x - m.ax) / s2, cy: wy - (c.y - m.ay) / s2, k: k2 });
      return;
    }
    if (pan && e.pointerId === pan.id) {
      e.stopPropagation(); e.preventDefault();
      const m = metrics();
      if (!m) return;
      const s = m.sfit * pan.v.k;
      Z.set({ cx: pan.v.cx - (e.clientX - pan.sx) / s, cy: pan.v.cy - (e.clientY - pan.sy) / s, k: pan.v.k });
    }
  }
  function capUp(e) {
    pts.delete(e.pointerId);
    if (pinch && pts.size < 2) { pinch = null; e.stopPropagation(); }
    if (pan && e.pointerId === pan.id) { e.stopPropagation(); endPan(e.pointerId); }
    if (!pts.size && !pan) inBoard = false;
  }

  /* ---------- odak kipi (dar ekranda tam ekran tuval) ---------- */
  Z.focus = function (on) { dispatch({ type: 'UI', patch: { focus: on == null ? !get().ui.focus : !!on } }); };

  /* ---------- klavye ---------- */
  const typing = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const boardTarget = (t) => !t || t === document.body || t === document.documentElement || t === ui.svgEl;
  document.addEventListener('keydown', function (e) {
    const S = get();
    if (S.ui.module !== 'islev' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === 'Escape' && S.ui.focus) { Z.focus(false); return; }
    if (e.key === ' ' || e.code === 'Space') {
      if (!boardTarget(e.target)) return; // odaktaki düğme / daire kendi Boşluk davranışını korur
      e.preventDefault();
      if (!S.ui.sp) dispatch({ type: 'UI', patch: { sp: true } });
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); Z.zoomBy(1.25); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); Z.zoomBy(0.8); }
    else if (e.key === '0') { Z.home(); }
    else if (e.key.indexOf('Arrow') === 0 && boardTarget(e.target) && !ui.activeGroup(S).length) {
      const m = metrics();
      if (!m) return;
      e.preventDefault();
      const v = Z.cur(), n = (e.shiftKey ? 220 : 70) / (m.sfit * v.k);
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      Z.cancel();
      Z.set({ cx: v.cx + d[0] * n, cy: v.cy + d[1] * n, k: v.k });
    }
  });
  document.addEventListener('keyup', function (e) {
    if ((e.key === ' ' || e.code === 'Space') && get().ui.sp) dispatch({ type: 'UI', patch: { sp: false } });
  });
  window.addEventListener('blur', function () { if (get().ui.sp) dispatch({ type: 'UI', patch: { sp: false } }); });

  /* ---------- bağlama (svg ilk oluşturulduğunda bir kez; ref her çizimde çağırır) ---------- */
  let lastFocus = false;
  function onState(state, a) {
    const f = !!state.ui.focus;
    if (f !== lastFocus) { lastFocus = f; document.documentElement.classList.toggle('cv-lock', f); }
    if (!a) return;
    if (a.type === 'SELECT' && a.id && !inBoard) Z.reveal([a.id]);
    else if (a.type === 'HIGHLIGHT' && a.pair) Z.reveal([a.pair.a, a.pair.b]);
  }
  let subscribed = false;
  Z.wire = function (el) {
    if (!el) return;
    watch(el);
    if (el.__zw) return;
    el.__zw = true;
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', capDown, true);
    el.addEventListener('pointermove', capMove, true);
    el.addEventListener('pointerup', capUp, true);
    el.addEventListener('pointercancel', capUp, true);
    el.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); }); // orta tuşla otomatik kaydırma açılmasın
    if (!subscribed) { subscribed = true; App.store.subscribe(onState); }
  };

  /* ---------- arayüz: yakınlaştırma çubuğu (güvenli alanın sağ altında yüzer) ---------- */
  Z.bar = function (state) {
    const v = state.ui.view;
    const hand = state.ui.tool === 'hand';
    const away = Z.offscreen(state);
    const foc = !!state.ui.focus;
    const b = (icon, label, fn, pressed, cls) => ui.glass.gbtn(icon, label, { cls: 'gz' + (cls ? ' ' + cls : ''), onclick: fn, pressed: pressed, size: 17 });
    return h('div', { class: 'gz-dock' },
      away ? h('button', { type: 'button', class: 'gz-away', title: 'Görünüm dışındaki daireleri göster', onclick: Z.fitAll }, away + ' daire görünüm dışında') : null,
      h('div', { class: 'gzoom', role: 'toolbar', 'aria-label': 'Çalışma alanı: yakınlaştır, uzaklaştır, kaydır' },
        b('hand', hand ? 'El aracını kapat' : 'El aracı: sürükleyerek kaydır (Boşluk + sürükle de olur)', () => dispatch({ type: 'UI', patch: { tool: hand ? 'select' : 'hand' } }), hand),
        h('span', { class: 'gzoom-sep', 'aria-hidden': 'true' }),
        b('minus', 'Uzaklaştır (−)', () => Z.zoomBy(0.8)),
        h('button', { type: 'button', class: 'gz-pct mono', title: 'Başlangıç görünümüne dön (0)', 'aria-label': 'Yakınlaştırma yüzde ' + Math.round((v ? v.k : 1) * 100) + ', başlangıç görünümüne dönmek için tıkla', onclick: Z.home }, Math.round((v ? v.k : 1) * 100) + '%'),
        b('plus', 'Yakınlaştır (+)', () => Z.zoomBy(1.25)),
        h('span', { class: 'gzoom-sep', 'aria-hidden': 'true' }),
        b('fit', 'Tüm daireleri göster', Z.fitAll),
        b(foc ? 'shrink' : 'expand', foc ? 'Tam ekrandan çık (Esc)' : 'Tuvali tam ekran yap', () => Z.focus(), foc, 'gz-focus')));
  };

  // sonsuz beyaz pencere: her yerde ince nokta ızgarası (zemin kaydığını hissettirir; uzaklaşınca seyrekleşir, yaklaşınca sıklaşır)
  Z.grid = function (view, S) {
    const vp = VP(S), v = view || DEFAULT(), s = fitOf(vp) * v.k;
    const step = 50 * Math.pow(2, Math.ceil(Math.log2(30 / (50 * s)))); // ekranda ≈30–60 px arayla
    const x0 = v.cx - (vp.sx + vp.sw / 2) / s, y0 = v.cy - (vp.sy + vp.sh / 2) / s, w = vp.w / s, hh = vp.h / s;
    return [
      h('defs', { key: 'ws-defs' }, h('pattern', { id: 'ws-dots', patternUnits: 'userSpaceOnUse', x: -step / 2, y: -step / 2, width: step, height: step },
        h('circle', { cx: step / 2, cy: step / 2, r: 1.4 / s, fill: App.PAL.ink, opacity: 0.17 }))),
      h('rect', { key: 'ws-grid', x: x0 - step, y: y0 - step, width: w + 2 * step, height: hh + 2 * step, fill: 'url(#ws-dots)', 'pointer-events': 'none' }),
    ];
  };
})();

/* ==========================================================================
   48-ui-intro.js — açılış: marka simgesi çizilir, "archtools" harf harf belirir, sonra yumuşakça çözülür.
   Oturum başına bir kez gösterilir (?intro=1 ile zorlanır, ?intro=0 ile kapatılır).
   Herhangi bir tuş / tıklama / "Geç" ile atlanabilir. Hareket azaltma tercihinde kısa ve sakin.
   ========================================================================== */
(function () {
  const App = window.App;
  const KEY = 'archtools.intro.seen';

  function wantIntro() {
    try {
      const q = new URLSearchParams(location.search).get('intro');
      if (q === '0') return false;
      if (q === '1') return true;
      if (window.sessionStorage.getItem(KEY)) return false;
    } catch (e) {}
    return true;
  }

  App.intro = {
    active: false,
    // done: intro bitince çağrılır
    start: function (done) {
      const el = document.getElementById('intro');
      const root = document.getElementById('root');
      const finish = function () { if (typeof done === 'function') done(); };
      if (!el || !wantIntro()) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
        document.documentElement.removeAttribute('data-intro');
        finish();
        return;
      }
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const total = reduce ? 1500 : 4000;
      let closed = false, t1 = null, t2 = null;
      App.intro.active = true;
      el.classList.add('run');
      el.style.setProperty('--dur', total + 'ms');
      if (root) { root.setAttribute('inert', ''); root.setAttribute('aria-hidden', 'true'); }
      const skip = document.getElementById('intro-skip');
      if (skip) { try { skip.focus({ preventScroll: true }); } catch (e) {} }

      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(t1);
        try { window.sessionStorage.setItem(KEY, '1'); } catch (e) {}
        document.removeEventListener('keydown', onKey, true);
        el.removeEventListener('pointerdown', close);
        el.classList.add('out');
        if (root) { root.removeAttribute('inert'); root.removeAttribute('aria-hidden'); }
        App.intro.active = false;
        t2 = setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
          finish();
        }, reduce ? 200 : 950);
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') { e.preventDefault(); close(); }
      }
      document.addEventListener('keydown', onKey, true);
      el.addEventListener('pointerdown', close);
      t1 = setTimeout(close, total);
      App.intro.skip = close;
    },
  };
})();

/* ==========================================================================
   49-ui-controls.js — modüller arası ortak form kontrolleri
   Sınıf adları iki temada da (glass / Bauhaus) CSS ile ayrı giydirilir:
     .sgm  parçalı düğme grubu     .rng  etiketli kaydırıcı     .stp  artı/eksi adımlayıcı
     .tgl  aç/kapa düğmesi         .fld2 etiket + kontrol satırı
   Hepsi saf fonksiyondur: state almaz, değeri ve geri çağrıyı dışarıdan alır.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;

  /* Parçalı düğme grubu: o = { value, options: [{ v, label, title }], onchange(v), label, wide } */
  ui.segmented = function (o) {
    return h('div', { class: 'sgm' + (o.wide ? ' sgm-wide' : ''), role: 'group', 'aria-label': o.label || null },
      o.options.map((x) => h('button', { key: String(x.v), type: 'button', class: 'sgm-b' + (x.v === o.value ? ' on' : ''), 'aria-pressed': String(x.v === o.value), title: x.title || null, onclick: () => { if (x.v !== o.value) o.onchange(x.v); } }, x.label)));
  };

  /* Kaydırıcı: o = { id, label, value, min, max, step, text (gösterilen değer), oninput(v), onchange(v), hint } */
  ui.range = function (o) {
    const parse = (e) => parseFloat(e.target.value);
    return h('div', { class: 'rng' },
      h('div', { class: 'rng-top' },
        h('label', { class: 'rng-lbl', for: o.id }, o.label),
        h('output', { class: 'rng-val mono', for: o.id }, o.text == null ? String(o.value) : o.text)),
      h('input', { id: o.id, class: 'rng-in', type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value, keep: true, 'aria-valuetext': o.text == null ? null : String(o.text), oninput: o.oninput ? (e) => o.oninput(parse(e)) : null, onchange: o.onchange ? (e) => o.onchange(parse(e)) : null }),
      o.hint ? h('p', { class: 'rng-hint' }, o.hint) : null);
  };

  /* Artı / eksi adımlayıcı: o = { label, value, min, max, onchange(v), unit, id } */
  ui.stepper = function (o) {
    const set = (v) => { if (v >= o.min && v <= o.max && v !== o.value) o.onchange(v); };
    return h('div', { class: 'stp', role: 'group', 'aria-label': o.label },
      h('button', { type: 'button', class: 'stp-b', 'aria-label': o.label + ' azalt', disabled: o.value <= o.min, onclick: () => set(o.value - 1) }, '−'),
      h('span', { class: 'stp-v', id: o.id || null, 'aria-live': 'polite' }, h('b', { class: 'mono' }, String(o.value)), o.unit ? h('span', { class: 'stp-u' }, o.unit) : null),
      h('button', { type: 'button', class: 'stp-b', 'aria-label': o.label + ' artır', disabled: o.value >= o.max, onclick: () => set(o.value + 1) }, '+'));
  };

  /* Aç / kapa: o = { label, on, onclick, title } */
  ui.toggle = function (o) {
    return h('button', { type: 'button', class: 'tgl' + (o.on ? ' on' : ''), 'aria-pressed': String(!!o.on), title: o.title || null, onclick: o.onclick },
      h('i', { class: 'tgl-dot', 'aria-hidden': 'true' }), h('span', {}, o.label));
  };

  /* Etiket + kontrol: yan yana (dar), alt alta (geniş) */
  ui.fld2 = function (label, control, hint) {
    return h('div', { class: 'fld2' },
      h('span', { class: 'fld2-l' }, label),
      h('div', { class: 'fld2-c' }, control),
      hint ? h('p', { class: 'fld2-h' }, hint) : null);
  };

  /* Bölüm başlığı + gövde (sol panel kutusu) */
  ui.section = function (title, body, aside, key) {
    return h('section', { class: 'panel sec', key: key || title },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, title), aside ? h('span', { class: 'count mono' }, aside) : null),
      body);
  };

  /* Sol panel sekmeleri: tabs = [{ id, label, n, warn }] */
  ui.tabsBar = function (tabs, cur, onpick) {
    return h('div', { class: 'tabs', role: 'tablist' },
      tabs.map((t) => h('button', { key: t.id, type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-selected': String(cur === t.id), class: 'tab' + (cur === t.id ? ' on' : ''), onclick: () => onpick(t.id) },
        t.label, t.n != null ? h('span', { class: 'tab-n' + (t.warn ? ' tab-n-warn' : '') }, String(t.n)) : null)));
  };

  /* Bulgu kartları listesi (Modül 1 asistanıyla aynı kart) */
  ui.findingList = function (res, intro) {
    const c = res.counts;
    return h('div', { class: 'panel find-panel' },
      intro ? h('p', { class: 'note' }, intro) : null,
      h('div', { class: 'as-counts' },
        h('span', { class: 'cnt cnt-hata' }, 'Uyarı ', h('b', {}, String(c.hata + c.uyari))),
        h('span', { class: 'cnt' }, 'Öneri ', h('b', {}, String(c.oneri)))),
      h('ul', { class: 'cards' }, res.items.map((it) => ui.findingCard(it))));
  };
})();

/* ==========================================================================
   50-controller.js — yan etkiler: dışa aktarma, dosya yükleme, animasyon, asistan eylemleri
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;
  const ctl = (App.ctl = {});

  ctl.dispatch = (a) => App.store.dispatch(a);
  const get = () => App.store.get();
  const derived = () => App.state.derive(get());

  let toastTimer = null;
  ctl.toast = function (msg, kind) {
    ctl.dispatch({ type: 'TOAST', msg: msg, kind: kind });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ctl.dispatch({ type: 'CLEAR_TOAST' }), 3600);
  };

  ctl.toggleAssistant = () => ctl.dispatch({ type: 'UI', patch: { assistantOpen: !get().ui.assistantOpen } });
  ctl.openAnalysis = () => ctl.dispatch({ type: 'UI', patch: { assistantOpen: true, asTab: 'analysis' } });

  ctl.focusForm = function () {
    ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
    setTimeout(() => { const el = document.getElementById('sp-name'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); } }, 30);
  };

  /* ---------- renk kipi: "Beni renklendir!" ↔ "Sadeleştir" ----------
     Arayüz her zaman monokrom glass yerleşimidir; kip yalnızca renk değişkenlerini değiştirir (13-lib-colortheme.js).
     Tercih: state.ui.color = { on, p } — localStorage'a yalnızca bu iki değer yazılır. */
  const COLOR_KEY = 'archtools.color';
  ctl.setColor = function (patch) {
    const next = Object.assign({}, get().ui.color, patch);
    if (!App.palettes.get(next.p)) next.p = App.colortheme.DEFAULT;
    next.on = !!next.on;
    ctl.dispatch({ type: 'UI', patch: { color: next } });
    try { window.localStorage.setItem(COLOR_KEY, JSON.stringify({ on: next.on, p: next.p })); } catch (e) {}
    if (App.paintNow) App.paintNow();
  };
  // palet seç: renk kipini açar ve arayüzü o paletle boyar
  ctl.pickPalette = function (id) { ctl.setColor({ on: true, p: id }); };
  let switching = false;
  ctl.toggleColor = function (e) {
    if (switching) return;
    const turnOn = !get().ui.color.on;
    const apply = function () {
      ctl.setColor({ on: turnOn });
      if (turnOn) ctl.dispatch({ type: 'UI', patch: { tab: 'renk' } }); // palet seçimi hemen görünsün
    };
    const root = document.documentElement;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const btn = e && e.currentTarget;
    if (!document.startViewTransition || reduce) { apply(); return; }
    // açılan daire: düğmenin olduğu yerden tüm sayfaya yayılır
    const r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--vt-x', x + 'px');
    root.style.setProperty('--vt-y', y + 'px');
    root.style.setProperty('--vt-r', Math.ceil(rad) + 'px');
    root.classList.add('vt-reveal');
    switching = true;
    let vt;
    try { vt = document.startViewTransition(function () { apply(); if (App.paintNow) App.paintNow(); }); } catch (err) { switching = false; root.classList.remove('vt-reveal'); apply(); return; }
    const done = function () {
      switching = false;
      root.classList.remove('vt-reveal');
      if (turnOn) { // renklenirken daireler sırayla "açılır"
        root.classList.add('bloom');
        setTimeout(function () { root.classList.remove('bloom'); }, 1400);
      }
    };
    vt.finished.then(done, done);
  };

  /* ---------- mekân ekleme formu ---------- */
  ctl.onNameInput = function (value) {
    const f = get().ui.form;
    const patch = { name: value, error: '' };
    // bilgi tabanındaki bir ada denk gelirse tipik alanı öner
    if (!f.area || f.autoFilled) {
      const v = App.kb.variant(get().project.meta.buildingType, get().project.meta.variant);
      const hit = v.entries.find((e) => U.norm(e.name) === U.norm(value));
      if (hit) { patch.area = String(App.analyze.defaultArea(hit)); patch.autoFilled = true; }
      else if (f.autoFilled) { patch.area = ''; patch.autoFilled = false; }
    }
    ctl.dispatch({ type: 'FORM', patch: patch });
  };

  ctl.addFromForm = function () {
    const f = get().ui.form;
    const name = (f.name || '').trim();
    const area = parseFloat(String(f.area).replace(',', '.'));
    if (!name) { ctl.dispatch({ type: 'FORM', patch: { error: 'Mekân adını yazın.' } }); document.getElementById('sp-name').focus(); return; }
    if (!(area > 0)) { ctl.dispatch({ type: 'FORM', patch: { error: 'Alan 0’dan büyük bir sayı olmalı (m²).' } }); document.getElementById('sp-area').focus(); return; }
    if (area > 100000) { ctl.dispatch({ type: 'FORM', patch: { error: 'Alan en fazla 100.000 m² olabilir.' } }); return; }
    ctl.dispatch({ type: 'ADD_SPACES', list: [{ name: name, area: area }] });
    ctl.dispatch({ type: 'FORM', patch: { name: '', area: '', error: '', autoFilled: false } });
    ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
    ctl.toast('“' + name + '” eklendi (' + U.fmt(area) + ' m²)', 'success');
    setTimeout(() => { const el = document.getElementById('sp-name'); if (el) el.focus(); }, 30);
  };

  ctl.newProject = function () {
    ctl.dispatch({ type: 'LOAD_PROJECT', project: App.state.emptyProject() });
    ctl.toast('Yeni proje açıldı. Önceki proje için Geri al’ı kullanabilirsiniz.');
  };

  ctl.loadTemplate = function (typeKey, variantKey) {
    const p = App.state.createFromTemplate(typeKey, variantKey, {});
    ctl.dispatch({ type: 'LOAD_PROJECT', project: p });
    ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
    ctl.toast(p.meta.name + ' programı yüklendi · ' + p.spaces.length + ' mekân', 'success');
  };

  /* ---------- otomatik yerleştirme (animasyonlu) ---------- */
  let animating = false;
  ctl.autoLayout = function () {
    const st = get();
    if (!st.project.spaces.length || animating) return;
    const k = derived().k;
    const target = App.layout.auto(st.project.spaces, st.project.relations, k, {});
    const from = {};
    st.project.spaces.forEach((s) => (from[s.id] = { x: s.x, y: s.y }));
    ctl.dispatch({ type: 'SNAPSHOT' });
    if (get().ui.view && App.ui.zoom) App.ui.zoom.home(); // yerleşim paftaya yapılır: sonucu göster
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 650;
    const t0 = performance.now();
    animating = true;
    (function step(now) {
      const t = U.clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      const pos = {};
      Object.keys(target).forEach((id) => { if (from[id]) pos[id] = { x: from[id].x + (target[id].x - from[id].x) * e, y: from[id].y + (target[id].y - from[id].y) * e }; });
      ctl.dispatch({ type: 'SET_POSITIONS', positions: pos });
      if (t < 1) requestAnimationFrame(step);
      else {
        animating = false;
        const pc = derived().score.percent;
        ctl.toast(pc == null ? 'Daireler yerleştirildi. İlişki ekleyerek skoru başlatın.' : 'Otomatik yerleştirme tamamlandı · verimlilik %' + pc, 'success');
      }
    })(t0);
  };

  /* ---------- dışa aktarma / kaydet / yükle ---------- */
  function report(res, okMsg) {
    ctl.dispatch({ type: 'UI', patch: { busy: null } });
    if (res && res.ok) ctl.toast(okMsg, 'success');
    else if (res && res.code === 'declined') ctl.toast('İndirme iptal edildi.');
    else ctl.toast('Dosya indirilemedi' + (res && res.message ? ': ' + res.message : '.'), 'error');
  }
  ctl.report = report;
  // label: 'PNG' | 'PDF' · make(project, derived) → Promise<{ok}>
  ctl.runExport = function (label, make) {
    const st = get();
    if (!st.project.spaces.length) { ctl.toast('Önce İşlev Şeması’na en az bir mekân ekleyin.', 'error'); return; }
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    make(st.project, derived()).then((r) => report(r, label + ' hazır')).catch((e) => report({ ok: false, message: e && e.message }));
  };
  // modül başına dışa aktarıcı: ctl.exporters[modülKimliği](kind: 'png' | 'pdf')
  ctl.exporters = {
    islev: (kind) => ctl.runExport(kind === 'png' ? 'PNG' : 'PDF', (p, d) => (kind === 'png' ? App.files.exportPNG(p, d.k, d.score) : App.files.exportPDF(p, d.k, d.score))),
  };
  const exporter = (kind) => (ctl.exporters[get().ui.module] || ctl.exporters.islev)(kind);
  ctl.exportPNG = () => exporter('png');
  ctl.exportPDF = () => exporter('pdf');
  const JSON_SUFFIX = { islev: undefined, kat: 'kat-etudu', analiz: 'mekan-analizi', arsa: 'arsa-analizi', imar: 'imar-kapasite', yer: 'yer-secimi', tasarim: 'tasarim-uretici', fizibilite: 'maliyet-fizibilite', birim: 'birim-olusturucu', vaziyet: 'vaziyet-plani', kolaj: 'kolaj', pafta: 'pafta-sablonu' };
  ctl.saveJSON = function () {
    const st = get();
    const d = derived();
    App.files.exportJSON(st.project, d.k, d.score, d.analysis.circ, JSON_SUFFIX[st.ui.module]).then((r) => report(r, 'Proje kaydedildi (JSON)'));
  };
  ctl.pickFile = function () { const el = document.getElementById('file-load'); if (el) el.click(); };
  ctl.onFile = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = function () {
      try {
        const text = String(rd.result);
        const project = App.files.fromJSON(text);
        ctl.dispatch({ type: 'LOAD_PROJECT', project: project });
        // dosya renkli kaydedildiyse aynı görünümle açılır
        let ext = null; try { ext = JSON.parse(text).extensions; } catch (e2) {}
        const cu = App.colors.uiFromExt(ext);
        if (cu) ctl.setColor(cu);
        ctl.toast('“' + project.meta.name + '” yüklendi · ' + project.spaces.length + ' mekân', 'success');
      } catch (err) { ctl.toast(err.message, 'error'); }
    };
    rd.onerror = function () { ctl.toast('Dosya okunamadı.', 'error'); };
    rd.readAsText(file);
    e.target.value = '';
  };

  /* ---------- asistan ---------- */
  ctl.ask = function (q) {
    const st = get();
    ctl.dispatch({ type: 'UI', patch: { assistantOpen: true, asTab: 'ask' } });
    ctl.dispatch({ type: 'CHAT_ADD', msg: { role: 'user', text: q } });
    ctl.scrollChat();
    const d = derived();
    let res;
    try { res = App.assistant.answer(q, { project: st.project, k: d.k, score: d.score, analysis: d.analysis }); }
    catch (err) { res = { blocks: [{ t: 'p', text: 'Bu soruyu yanıtlarken bir sorun oluştu. Soruyu biraz farklı yazmayı deneyin.' }], src: [] }; }
    setTimeout(() => { ctl.dispatch({ type: 'CHAT_ADD', msg: { role: 'bot', blocks: res.blocks, src: res.src } }); ctl.scrollChat(); }, 120);
  };

  ctl.scrollChat = function () {
    setTimeout(() => { const el = document.querySelector('.msgs'); if (el) el.scrollTop = el.scrollHeight; }, 40);
  };

  let hlTimer = null;
  ctl.runAction = function (a) {
    if (a.type === 'addSpaces') {
      ctl.dispatch({ type: 'ADD_SPACES', list: a.list });
      ctl.toast(a.list.length === 1 ? '“' + a.list[0].name + '” eklendi' : a.list.length + ' mekân eklendi', 'success');
    } else if (a.type === 'setArea') {
      ctl.dispatch({ type: 'UPDATE_SPACE', id: a.id, patch: { area: a.area } });
      ctl.toast('Alan ' + U.fmt(a.area) + ' m² olarak güncellendi', 'success');
    } else if (a.type === 'select') {
      ctl.dispatch({ type: 'SELECT', id: a.id });
      ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
      setTimeout(() => { const el = document.getElementById('row-' + a.id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 40);
    } else if (a.type === 'locate') {
      ctl.dispatch({ type: 'SELECT', id: a.a });
      ctl.dispatch({ type: 'HIGHLIGHT', pair: { a: a.a, b: a.b } });
      clearTimeout(hlTimer);
      hlTimer = setTimeout(() => ctl.dispatch({ type: 'HIGHLIGHT', pair: null }), 3800);
    } else if (a.type === 'autolayout') ctl.autoLayout();
    else if (a.type === 'openMatrix') ctl.dispatch({ type: 'UI', patch: { tab: 'matrix' } });
    else if (a.type === 'focusForm') ctl.focusForm();
    else if (a.type === 'loadTemplate') ctl.loadTemplate(a.typeKey, a.variantKey);
  };

  /* ---------- klavye ---------- */
  ctl.onKey = function (e) {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); ctl.dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' }); }
    else if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); ctl.dispatch({ type: 'REDO' }); }
    else if (!typing && get().ui.module === 'islev' && (e.key === 'Delete' || e.key === 'Backspace') && get().selectedId) { e.preventDefault(); ctl.dispatch({ type: 'REMOVE_SPACE', id: get().selectedId }); }
    else if (e.key === 'Escape') { if (typing && tag === 'INPUT') e.target.blur(); else if (get().selectedId) ctl.dispatch({ type: 'SELECT', id: null }); }
  };
})();

/* ==========================================================================
   51-ui-gate.js — profil kapısı (ilk ziyaret) ve "Profilim ve gizlilik" penceresi
   Kapı zorunludur: ad soyad + e-posta (güvenilir sağlayıcı) olmadan site kullanılmaz. Google / e-posta doğrulaması yoktur; bilgiler kişinin beyanıdır.
   Pencere ayrı bir sanal-DOM kökünde (#gate-root) çizilir; açıkken uygulama (#root) etkileşime kapatılır (inert).
   Kullanım: App.ui.gate.open('form' | 'profile' | 'blocked')  ·  mantık ve ağ: App.visit (52-lib-visit.js)
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;

  const ROLES = [['mimar', 'Mimar'], ['ogrenci', 'Öğrenci'], ['akademisyen', 'Akademisyen'], ['ofis', 'Ofis / firma'], ['kamu', 'Kamu'], ['gayrimenkul', 'Gayrimenkul'], ['diger', 'Diğer']];
  const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,79}$/u;
  const EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]{3,190}$/;
  // güvenilir e-posta sağlayıcıları — api/_lib/validate.js ile AYNI liste (sunucu asıl denetimi yapar; tests/api.test.mjs eşitliği denetler)
  const MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.tr', 'outlook.com', 'outlook.com.tr', 'live.com', 'msn.com',
    'yahoo.com', 'yahoo.com.tr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'yandex.com', 'yandex.com.tr', 'proton.me', 'protonmail.com', 'pm.me', 'aol.com', 'mynet.com'];
  const MAIL_SUFFIXES = ['.edu.tr', '.edu', '.gov.tr'];
  const mailOk = (v) => {
    v = String(v || '').trim().toLowerCase();
    if (!EMAIL.test(v)) return false;
    const d = v.slice(v.lastIndexOf('@') + 1);
    if (d.indexOf('..') >= 0 || d[0] === '.' || d[d.length - 1] === '.') return false;
    return MAIL_DOMAINS.indexOf(d) >= 0 || MAIL_SUFFIXES.some((x) => d.length > x.length && d.slice(-x.length) === x);
  };
  const nameOk = (v) => { v = v.trim().replace(/\s+/g, ' '); return NAME.test(v) && v.split(' ').filter((w) => w.replace(/[^\p{L}]/gu, '').length >= 2).length >= 2; };
  const MSG = {
    name: 'Lütfen adınızı ve soyadınızı birlikte yazın (örn. Ayşe Yılmaz; rakam ve işaret kullanmayın).',
    email: 'E-posta zorunludur. Gmail, Hotmail / Outlook, Yahoo, iCloud, Yandex, Proton gibi güvenilir bir sağlayıcıdan ya da okul (.edu.tr) / kamu (.gov.tr) adresi girin.',
    rate: 'Kısa sürede çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
    offline: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.',
    server: 'Şu an kaydınız oluşturulamadı. Lütfen yeniden deneyin.',
    store_unavailable: 'Şu an kaydınız oluşturulamadı. Lütfen yeniden deneyin.',
  };
  let G = null; // { mode, busy, error, notice, loaded }
  let F = { name: '', org: '', email: '', role: '' };
  let paint = null, root = null, opener = null;

  const valid = () => nameOk(F.name) && mailOk(F.email);
  const redraw = () => { if (paint) paint(); };
  const inertApp = (on) => { const r = document.getElementById('root'); if (!r) return; if (on) { r.setAttribute('inert', ''); r.setAttribute('aria-hidden', 'true'); } else { r.removeAttribute('inert'); r.removeAttribute('aria-hidden'); } };

  function field(id, label, opts) {
    return h('div', { class: 'gate-fld' },
      h('label', { class: 'lbl', for: id }, label),
      h('input', { id: id, class: 'ginput', type: opts.type || 'text', maxlength: opts.max, value: F[opts.key], keep: true, autocomplete: opts.ac, inputmode: opts.im || null, placeholder: opts.ph || null,
        'aria-required': opts.req ? 'true' : null, 'aria-invalid': opts.invalid ? 'true' : null,
        oninput: (e) => { F[opts.key] = e.target.value; if (G.error) G.error = null; redraw(); } }));
  }

  function rolesRow() {
    return h('div', { class: 'gate-fld' },
      h('span', { class: 'lbl', id: 'g-role-l' }, 'Rolünüz (isteğe bağlı)'),
      h('div', { class: 'gate-roles', role: 'group', 'aria-labelledby': 'g-role-l' },
        ROLES.map((r) => h('button', { key: r[0], type: 'button', class: 'gate-chip' + (F.role === r[0] ? ' on' : ''), 'aria-pressed': String(F.role === r[0]), onclick: () => { F.role = F.role === r[0] ? '' : r[0]; redraw(); } }, r[1]))));
  }

  const contactLine = () => {
    const i = App.visit.info();
    return i.name || i.email ? 'Veri sorumlusu: ' + [i.name, i.email].filter(Boolean).join(' · ') : null;
  };

  function submit() {
    if (G.busy) return;
    const name = F.name.trim().replace(/\s+/g, ' ');
    if (!nameOk(name)) { G.error = 'name'; redraw(); return; }
    if (!mailOk(F.email)) { G.error = 'email'; redraw(); return; }
    const fields = { name: name, org: F.org.trim(), email: F.email.trim(), role: F.role };
    G.busy = true; G.error = null; redraw();
    const p = G.mode === 'form' ? App.visit.register(fields) : App.visit.update(fields);
    p.then(function (r) {
      G.busy = false;
      if (r.ok) { if (G.mode === 'profile') { G.saved = true; redraw(); setTimeout(function () { if (G && G.mode === 'profile') api.close(); }, 700); } else api.close(); return; }
      G.error = r.error || 'server'; redraw();
    });
  }

  function formCard() {
    const isForm = G.mode === 'form';
    if (!isForm && !G.loaded) return h('div', { class: 'gate-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Profilim ve gizlilik' }, h('h2', { class: 'gate-title' }, 'Profilim ve gizlilik'), h('p', { class: 'gate-lead' }, 'Yükleniyor…'));
    const err = G.error ? MSG[G.error] || MSG.server : null;
    const canSkip = isForm && (G.error === 'offline' || G.error === 'server' || G.error === 'store_unavailable');
    const cl = contactLine();
    return h('div', { class: 'gate-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title', 'aria-describedby': 'gate-lead' },
      h('div', { class: 'gate-head' },
        ui.glass ? ui.glass.logo() : null,
        h('span', { class: 'gate-brand' }, 'archtools')),
      h('h2', { id: 'gate-title', class: 'gate-title' }, isForm ? 'Hoş geldiniz' : 'Profilim ve gizlilik'),
      h('p', { id: 'gate-lead', class: 'gate-lead' }, isForm
        ? 'Başlamadan önce kısa bir profil oluşturun. Hesap açmanız ya da şifre belirlemeniz gerekmez. Bilgilerinizi yalnızca site yöneticisi görebilir.'
        : 'Bilgilerinizi ve konum paylaşımınızı buradan güncelleyebilirsiniz.'),
      G.notice ? h('p', { class: 'gate-notice', role: 'status' }, G.notice) : null,
      h('form', { class: 'gate-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
        field('g-name', 'Ad Soyad', { key: 'name', max: 80, ac: 'name', req: true, ph: 'Örn. Ayşe Yılmaz', invalid: G.error === 'name' }),
        field('g-org', 'Kurum / okul (isteğe bağlı)', { key: 'org', max: 80, ac: 'organization', ph: 'Örn. ODTÜ Mimarlık' }),
        field('g-mail', 'E-posta', { key: 'email', max: 120, ac: 'email', type: 'email', im: 'email', ph: 'ad@gmail.com', req: true, invalid: G.error === 'email' }),
        rolesRow(),
        err ? h('p', { class: 'gate-err', role: 'alert' }, err) : null,
        G.saved ? h('p', { class: 'gate-ok', role: 'status' }, 'Kaydedildi.') : null,
        h('div', { class: 'gate-actions' },
          h('button', { type: 'submit', class: 'btn btn-primary', disabled: G.busy || !valid() }, G.busy ? 'Kaydediliyor…' : isForm ? 'Devam et' : 'Kaydet'),
          !isForm ? h('button', { type: 'button', class: 'btn', onclick: () => api.close() }, 'Kapat') : null,
          canSkip ? h('button', { type: 'button', class: 'btn', onclick: () => { App.visit.skip(); api.close(); } }, 'Yine de devam et') : null)),
      cl ? h('p', { class: 'gate-meta' }, cl) : null);
  }


  function blockedCard() {
    return h('div', { class: 'gate-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title' },
      h('div', { class: 'gate-head' }, ui.glass ? ui.glass.logo() : null, h('span', { class: 'gate-brand' }, 'archtools')),
      h('h2', { id: 'gate-title', class: 'gate-title' }, 'Erişim kapalı'),
      h('p', { class: 'gate-lead' }, 'Bu profil için erişim site yöneticisi tarafından kapatıldı. Bir yanlışlık olduğunu düşünüyorsanız yöneticiyle iletişime geçin.'),
      contactLine() ? h('p', { class: 'gate-meta' }, contactLine()) : null);
  }

  function view() {
    return h('div', { class: 'gate-host' }, G ? h('div', { class: 'gate', key: 'gate' }, h('div', { class: 'gate-scrim' }), G.mode === 'blocked' ? blockedCard() : formCard()) : null);
  }

  const api = (ui.gate = {
    open: function (mode, o) {
      if (!root) {
        root = document.createElement('div'); root.id = 'gate-root'; document.body.appendChild(root);
        paint = App.mount(root, view);
        document.addEventListener('keydown', function (e) { if (G && G.mode === 'profile' && e.key === 'Escape') api.close(); });
      }
      if (!G || !opener) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      G = Object.assign({ mode: mode, busy: false, error: null, notice: null, saved: false, loaded: mode !== 'profile' }, o || {});
      inertApp(true);
      redraw();
      if (mode === 'profile') {
        App.visit.me().then(function (p) { if (!G || G.mode !== 'profile') return; if (p) { F.name = p.name; F.org = p.org; F.email = p.email; F.role = p.role; } G.loaded = true; redraw(); setTimeout(function () { const el = document.getElementById('g-name'); if (el) el.focus(); }, 30); });
      } else setTimeout(function () { const el = document.getElementById(mode === 'form' ? 'g-name' : 'gate-title'); if (el) el.focus(); }, 60);
    },
    close: function () {
      G = null; redraw(); inertApp(false);
      if (opener && document.body.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
      opener = null;
    },
    isOpen: function () { return !!G; },
  });

  // üst çubuktaki kişi düğmesi: yalnızca takip açıkken görünür
  ui.profileBtn = function () { if (App.visit.enabled()) api.open('profile'); };
})();

/* ==========================================================================
   52-lib-visit.js — ziyaretçi profili ve kullanım süresi (yalnızca yönetici görür)
   Akış: ilk ziyarette profil kapısı (ad + açık rıza) → /api/v 'reg' → { vid, token } bu tarayıcıda saklanır →
         her 30 sn'de bir 'ping' (etkin süre + izinli olaylar). Etkin süre = sekme görünür VE son 60 sn'de etkileşim var.
   Gizlilik: yalnızca allowlist'teki olay türleri gönderilir; şema içeriği (mekân adları, proje verisi) ASLA gönderilmez.
   Sunucu yapılandırılmamışsa ('enabled: false') kapı da takip de devre dışıdır (site olduğu gibi çalışır).
   ========================================================================== */
(function () {
  const App = window.App;
  const KEY = 'archtools.visitor';
  const CV = '2026-11'; // aydınlatma / rıza metni sürümü (sunucudaki CONSENT_VERSION ile aynı olmalı)
  const KINDS = ['start', 'color_on', 'color_off', 'palette', 'auto_layout', 'add_space', 'template', 'export_png', 'export_pdf', 'save_json', 'load_json'];
  const API = () => (App.config && App.config.api && App.config.api.visit) || '/api/v';
  const BEAT = 30000, IDLE = 60000;

  const rnd = (n) => { const a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };
  let cred = null, status = 'init'; // init | off | gate | ok | offline | blocked
  let info = { enabled: false, name: '', email: '', retentionDays: 180 };
  let sid = rnd(16), pending = 0, queue = [], lastActive = Date.now(), started = false, inflight = false;

  const read = () => { try { const o = JSON.parse(window.localStorage.getItem(KEY) || 'null'); return o && typeof o.vid === 'string' && typeof o.token === 'string' ? o : null; } catch (e) { return null; } };
  const write = (o) => { try { window.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const clear = () => { try { window.localStorage.removeItem(KEY); } catch (e) {} };

  function post(body, keepalive) {
    return fetch(API(), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AT': '1' }, body: JSON.stringify(body),
      keepalive: !!keepalive, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    }).then((r) => r.json().then((j) => ({ status: r.status, j: j || {} }), () => ({ status: r.status, j: {} })), () => ({ status: 0, j: {} }));
  }
  const auth = (o) => Object.assign({ vid: cred.vid, token: cred.token }, o);
  const gate = () => App.ui.gate;

  function env() {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return { tz: tz, lg: navigator.language || '', sw: screen.width || 0, sh: screen.height || 0, dpr: window.devicePixelRatio || 1 };
  }

  /* ---------- etkin süre sayacı + nabız ---------- */
  function startTimers() {
    if (started) return; started = true;
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'].forEach((e) => window.addEventListener(e, function () { lastActive = Date.now(); }, { passive: true, capture: true }));
    setInterval(function () { if (status === 'ok' && document.visibilityState === 'visible' && Date.now() - lastActive < IDLE && pending < 90) pending++; }, 1000);
    setInterval(function () { flush(false); }, BEAT);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
    window.addEventListener('pagehide', function () { flush(true); });
  }

  function onAuthFail(r) {
    if (r.status === 403 && r.j.error === 'blocked') { status = 'blocked'; gate().open('blocked'); return true; }
    if (r.status === 401) { clear(); cred = null; status = 'gate'; gate().open('form', { notice: 'Oturumunuz bulunamadı. Devam etmek için profilinizi yeniden oluşturun.' }); return true; }
    return false;
  }

  function flush(keepalive) {
    if (!cred || status !== 'ok' || inflight || (pending < 1 && !queue.length)) return Promise.resolve();
    const sec = Math.min(pending, 90), ev = queue.splice(0, 8);
    pending -= sec; inflight = !keepalive;
    return post(auth({ a: 'ping', sid: sid, sec: sec, ev: ev }), keepalive).then(function (r) {
      inflight = false;
      if (r.status === 200) return;
      if (onAuthFail(r)) return;
      pending += sec; ev.forEach(function (e) { if (queue.length < 40) queue.push(e); }); // ağ / sunucu hatası: sonraki nabızda yeniden dene
    });
  }

  // profil düğmesi gibi durum bağımlı arayüz, durum değişince yeniden çizilsin (ui.visitTick yalnızca yeniden çizim tetikler)
  function repaint() { try { if (App.store) App.store.dispatch({ type: 'UI', patch: { visitTick: Date.now() } }); } catch (e) {} }

  // tarayıcıda konum izni zaten verilmişse (kalıcı izin), oturum başında sessizce konum gönderilir; izin sorulmaz
  function autoLocate() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return;
      navigator.permissions.query({ name: 'geolocation' }).then(function (p) { if (p.state === 'granted') V.locate(); }, function () {});
    } catch (e) {}
  }

  function startSession() {
    status = 'ok'; startTimers(); autoLocate();
    queue.push({ k: 'start' });
    return post(auth({ a: 'ping', sid: sid, sec: 0, ev: queue.splice(0, 8) })).then(function (r) {
      if (r.status === 200) return;
      if (onAuthFail(r)) return;
      status = 'ok'; // geçici hata: nabız yeniden dener
    });
  }

  /* ---------- genel API ---------- */
  const V = (App.visit = {
    CV: CV,
    status: function () { return status; },
    enabled: function () { return status !== 'off' && status !== 'init'; },
    info: function () { return info; },
    KINDS: KINDS,

    init: function () {
      cred = read();
      return post({ a: 'contact' }).then(function (r) {
        if (r.status === 200) info = { enabled: r.j.enabled !== false, name: r.j.name || '', email: r.j.email || '', retentionDays: r.j.retentionDays || 180 };
        else info.enabled = false; // API yok / hata: site olduğu gibi çalışır (kapı ve takip kapalı)
        if (!info.enabled) { status = 'off'; return; }
        if (!cred) { status = 'gate'; repaint(); gate().open('form'); return; }
        return startSession().then(repaint);
      });
    },

    track: function (kind, detail) {
      if (KINDS.indexOf(kind) < 0 || status !== 'ok') return;
      if (queue.length < 40) queue.push({ k: kind, d: typeof detail === 'string' ? detail.slice(0, 24) : '' });
    },

    register: function (f) {
      return post(Object.assign({ a: 'reg' }, f, env())).then(function (r) {
        if (r.status === 200 && r.j.ok) { cred = { vid: r.j.vid, token: r.j.token }; write(cred); return startSession().then(function () { repaint(); setTimeout(function () { V.locate(); }, 400); return { ok: true }; }); } // kayıttan sonra tarayıcı konum izni sorulur (reddedilirse sorun yok)
        return { ok: false, error: r.status === 0 ? 'offline' : r.j.error || 'server' };
      });
    },
    // tarayıcı konumu: tarayıcı kendi izin penceresini gösterir; yalnızca izin verilirse yaklaşık konum gönderilir
    locate: function () {
      return new Promise(function (resolve) {
        if (!cred || !navigator.geolocation) return resolve({ ok: false, error: 'unsupported' });
        navigator.geolocation.getCurrentPosition(function (p) {
          post(auth({ a: 'loc', lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy })).then(function (r) { resolve(r.status === 200 ? { ok: true } : { ok: false, error: 'server' }); });
        }, function (e) { resolve({ ok: false, error: e && e.code === 1 ? 'denied' : 'unavailable' }); }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 });
      });
    },
    me: function () { return post(auth({ a: 'me' })).then(function (r) { return r.status === 200 ? r.j.profile : (onAuthFail(r), null); }); },
    update: function (f) {
      return post(auth(Object.assign({ a: 'upd' }, f))).then(function (r) {
        if (r.status === 200) return { ok: true };
        if (r.status === 401 || r.status === 403) onAuthFail(r);
        return { ok: false, error: r.status === 0 ? 'offline' : r.j.error || 'server' };
      });
    },
    // açık kalan oturumu kapat (yalnızca kapı "yine de devam et" derse)
    skip: function () { status = 'off'; repaint(); },
    flush: flush,

    // kullanım olaylarını denetleyici işlevlerine bağlar (allowlist; veri taşımaz)
    hook: function (ctl) {
      const wrap = function (fn, kind, detailFn) { const o = ctl[fn]; if (typeof o !== 'function') return; ctl[fn] = function () { try { V.track(kind, detailFn ? detailFn.apply(null, arguments) : ''); } catch (e) {} return o.apply(this, arguments); }; };
      wrap('exportPNG', 'export_png'); wrap('exportPDF', 'export_pdf'); wrap('saveJSON', 'save_json'); wrap('onFile', 'load_json');
      wrap('autoLayout', 'auto_layout'); wrap('loadTemplate', 'template'); wrap('pickPalette', 'palette', function (id) { return String(id || ''); });
      const tc = ctl.toggleColor;
      if (typeof tc === 'function') ctl.toggleColor = function () { try { V.track(App.store.get().ui.color.on ? 'color_off' : 'color_on'); } catch (e) {} return tc.apply(this, arguments); };
      const dp = ctl.dispatch;
      if (typeof dp === 'function') ctl.dispatch = function (a) { if (a && a.type === 'ADD_SPACES') { try { V.track('add_space'); } catch (e) {} } return dp.apply(this, arguments); };
    },
  });
})();

/* ==========================================================================
   90-router.js — modül gezintisi: #/islev · #/kat · #/analiz · #/arsa · #/imar · #/yer · #/tasarim · #/fizibilite · #/vaziyet · #/kolaj · #/pafta
   Geçiş: View Transitions varsa yumuşak çapraz solma, yoksa anında.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  // yalnızca açık modüller yönlendirilir (App.config.modules — build.py enjekte eder); gizli modüle adresten de gidilemez
  const ALL = ['islev', 'kat', 'analiz', 'arsa', 'imar', 'yer', 'tasarim', 'fizibilite', 'vaziyet', 'kolaj', 'pafta'];
  const ENABLED = (App.config && App.config.modules) || ALL;
  const IDS = ALL.filter((id) => ENABLED.indexOf(id) >= 0);
  const get = () => App.store.get();

  const fromHash = function () {
    const m = /^#\/?([a-z]+)/.exec(location.hash || '');
    return m && IDS.indexOf(m[1]) >= 0 ? m[1] : null;
  };
  App.route = { fromHash: fromHash, IDS: IDS };

  function setTitle(id) {
    document.title = 'archtools · ' + App.ui.moduleInfo(id).label;
  }
  App.route.setTitle = setTitle;

  function apply(id) {
    ctl.dispatch({ type: 'UI', patch: { module: id, xmenu: false } });
    setTitle(id);
    window.scrollTo(0, 0);
    if (App.paintNow) App.paintNow();
  }

  function switchTo(id) {
    if (get().ui.module === id) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce || (App.intro && App.intro.active)) { apply(id); return; }
    const root = document.documentElement;
    root.classList.add('vt-fade');
    const done = function () { root.classList.remove('vt-fade'); };
    try {
      const vt = document.startViewTransition(function () { apply(id); });
      vt.finished.then(done, done);
    } catch (e) { done(); apply(id); }
  }

  ctl.go = function (id) {
    if (IDS.indexOf(id) < 0 || get().ui.module === id) return;
    if (fromHash() !== id) { try { location.hash = '#/' + id; return; } catch (e) {} }
    switchTo(id);
  };

  window.addEventListener('hashchange', function () {
    switchTo(fromHash() || 'islev'); // boş adres = işlev şeması (geri düğmesiyle ilk sayfaya dönüş)
    if (ctl.hashSite) ctl.hashSite(); // #/arsa?lat=…&lon=… paylaşım bağlantısı
  });
})();

/* ==========================================================================
   99-main.js — archtools'u başlat: tema, ortak store, modül rotası, intro
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;

  // arayüz tabanı monokrom glass; "Beni renklendir!" kipi view() başında uygulanır (App.colortheme.sync)
  App.theme.reset();

  App.store = App.createStore(App.state.reducer, App.state.initialState());

  // ilk modül: adres çubuğundaki rota (#/kat ...)
  const first = App.route.fromHash();
  if (first && first !== App.store.get().ui.module) App.store.dispatch({ type: 'UI', patch: { module: first } });
  App.route.setTitle(App.store.get().ui.module);
  // yalnızca derlemeye giren modüllerin görünüm yükleyicileri vardır (gizli modüller pakete girmez)
  ['loadAnView', 'loadSiteView', 'loadImarView', 'loadDsnView', 'loadFizView', 'loadEtutView', 'loadPeView', 'loadPlanView', 'loadColView', 'loadColImages', 'loadTplView'].forEach(function (n) { if (App.ctl[n]) App.ctl[n](); });

  function view() {
    const state = App.store.get();
    App.colortheme.sync(state.ui.color); // renk kipi: CSS değişkenleri + pafta renkleri çizimden önce hazır olur
    const d = App.state.derive(state);
    const t = state.ui.toast;
    const mod = state.ui.module;
    return h('div', { class: 'app s-' + App.theme.name + ' m-' + mod + (mod === 'islev' && state.ui.assistantOpen ? ' as-open' : '') + (mod === 'islev' && state.ui.focus ? ' cv-focus' : '') },
      App.ui.header(state, d),
      App.ui.scorebar(state, d),
      App.ui.pageMain(state, d),
      h('div', { class: 'toast-zone', 'aria-live': 'polite', role: 'status' },
        t ? h('div', { key: t.id, class: 'toast toast-' + t.kind }, t.msg) : null),
      null);
  }

  const paint = App.mount(document.getElementById('root'), view);
  App.paintNow = paint;
  const schedule = App.raf(paint);

  let lastPct = null;
  let lastProject = App.store.get().project;
  let saveTimer = null;
  App.store.subscribe(function (state) {
    schedule();
    if (state.project === lastProject) return;
    lastProject = state.project;
    // otomatik kayıt (kişisel kolaylık): proje + kat etüdü ayarları birlikte
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { App.state.persist(state.project); }, 500);
    // skor eşiği kutlaması (işlev şeması)
    if (state.ui.module !== 'islev') return;
    const pc = App.state.derive(state).score.percent;
    if (lastPct != null && pc != null && lastPct < 90 && pc >= 90 && state.project.spaces.length >= 3 && !state.project.meta.example) App.ctl.toast('Harika yerleşim: verimlilik %' + pc, 'success');
    lastPct = pc;
  });

  App.visit.hook(App.ctl); // kullanım olayları (allowlist; veri taşımaz)
  document.addEventListener('keydown', App.ctl.onKey);
  // odak halkası yalnızca klavye gezintisinde görünür (paftada fareyle tıklayınca çerçeve çıkmasın)
  const rootEl = document.body;
  document.addEventListener('keydown', function (e) { if (e.key === 'Tab' || e.key.indexOf('Arrow') === 0) rootEl.classList.add('kbd'); }, true);
  document.addEventListener('pointerdown', function () { rootEl.classList.remove('kbd'); }, true);
  paint();
  if (App.ui.zoom) App.ui.zoom.measure(); // güvenli alan ilk karede ölçülür (sonraki çizim ilk ekran karesinden önce yapılır)
  lastPct = App.state.derive(App.store.get()).score.percent;

  // açılış animasyonu: uygulama altta hazır, intro yumuşakça çözülür
  App.intro.start(function () {
    if (App.store.get().restored) setTimeout(function () { App.ctl.toast('Son çalışmanız geri yüklendi.'); }, 250);
    App.visit.init(); // profil kapısı (ilk ziyaret) ya da oturum başlangıcı; sunucu yapılandırılmamışsa kapalı
  });
})();
