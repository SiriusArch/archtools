/* ==========================================================================
   72-ui-fiz.js — Modül 8 arayüzü: Maliyet ve Fizibilite
   Sol panel: Girdiler (arsa, satış, dolaylı giderler, finansman) · Birim fiyatlar (metraj kalemleri) · Bulgular.
   Pafta: özet paneli, nakit akışı, duyarlılık (ısı haritası ve kasırga), metraj tablosu.
   Tasarım seçili alternatiften gelir (project.design.sel); varsayımlar project.fiz'de saklanır.
   Varsayılan birim fiyatlar ÖRNEKtir: kullanıcı kendi değerlerini girmelidir.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const Cst = App.cost;
  const ctl = () => App.ctl;
  const Fz = (ui.fizb = {});

  App.dsnUi = Object.assign(App.dsnUi || {}, {
    fiz: () => ({ tab: 'girdi', mode: 'ozet' }),
  });

  const MODES = [{ v: 'ozet', label: 'Özet' }, { v: 'nakit', label: 'Nakit' }, { v: 'duyarlilik', label: 'Duyarlılık' }, { v: 'metraj', label: 'Metraj' }];
  const money = (v, c) => App.fizScene.money(v, c);

  const num = (id, label, min, max, step, value, onset, unit, hint) => h('label', { class: 'nf', for: id },
    h('span', { class: 'nf-l' }, label),
    h('span', { class: 'nf-c' }, h('input', { id: id, class: 'inp mono nf-in', type: 'number', min: min, max: max, step: step, value: value == null ? '' : value, keep: true, inputmode: 'decimal', placeholder: hint || '', onchange: (e) => { const t = String(e.target.value).trim(); if (t === '') { onset(null); return; } const x = parseFloat(t.replace(',', '.')); if (isFinite(x)) onset(x); } }), unit ? h('span', { class: 'unit' }, unit) : null));

  function needDesign(state, dc) {
    const c = ctl();
    return [h('div', { class: 'panel' },
      h('p', { class: 'note' }, !state.project.site.parcel
        ? 'Maliyet ve fizibilite, Tasarım Üretici’nin seçili alternatifini kullanır. Önce İmar ve Kapasite modülünde bir parsel çizin.'
        : 'Bu parselde üretilebilir bir tasarım yok. İmar değerlerini gözden geçirin.'),
      h('div', { class: 'here-act' },
        ui.btn('İmar ve Kapasite’ye git', { icon: 'parcel', cls: 'btn-primary', onclick: () => c.go('imar') }),
        state.project.site.parcel ? ui.btn('Tasarım Üretici’ye git', { icon: 'layers', onclick: () => c.go('tasarim') }) : ui.btn('20 × 30 m parsel koy', { icon: 'plus', onclick: () => c.imarParcelRect(20, 30, 0) })))];
  }

  function inputTab(state, f) {
    const a = state.project.fiz || Cst.defaults(), c = ctl(), cur = a.currency;
    const rng = (key, id, label, min, max, step, text, patch) => ui.range({ id: id, label: label, min: min, max: max, step: step, value: key, text: text, oninput: (x) => c.fizLive(patch(x)), onchange: () => c.fizLiveEnd() });
    const types = Object.keys(f.d.unitTotals.byType).sort();
    const out = [];
    out.push(ui.section('Arsa', h('div', { class: 'sec-box' },
      num('fz-land', 'Arsa bedeli', 0, 1e13, 100000, a.land.cost || '', (x) => c.fizSet({ land: { cost: x == null ? 0 : x } }), cur, '0'),
      h('p', { class: 'note' }, a.land.cost > 0 ? 'Arsa bedeli maliyete eklenir; “Arsa için üst sınır” kartı bu bedeli karşılaştırır.' : 'Arsa bedelini girmezseniz kâr arsa hariç görünür. Bedel bilinmiyorsa “artık arsa değeri” hedef marjla ödenebilecek üst sınırı verir.'),
      rng(a.land.tapuHarc, 'fz-tapu', 'Tapu harcı ve masrafları', 0, 0.1, 0.005, pct(a.land.tapuHarc), (x) => ({ land: { tapuHarc: x } }))), null, 'fz-land'));
    out.push(ui.section('Satış varsayımları', h('div', { class: 'sec-box' },
      h('p', { class: 'note warn' }, 'Varsayılan fiyatlar ÖRNEKtir; bölgenizdeki emsal satışlarla değiştirin.'),
      num('fz-base', 'Temel satış fiyatı (brüt m²)', 0, 1e8, 500, a.sales.base, (x) => c.fizSet({ sales: { base: x == null ? 0 : x } }), cur + '/m²'),
      types.map((t) => num('fz-p-' + t, t + ' için fiyat', 0, 1e8, 500, a.sales.price[t], (x) => c.fizSet({ sales: { price: { [t]: x } } }), cur + '/m²', 'temel')),
      rng(a.sales.floorPremium, 'fz-fp', 'Kat primi (her üst kat)', 0, 0.05, 0.0025, pct(a.sales.floorPremium, 2), (x) => ({ sales: { floorPremium: x } })),
      rng(a.sales.ground, 'fz-gr', 'Zemin kat çarpanı', 0.6, 1.4, 0.05, '×' + fmt(a.sales.ground, 2), (x) => ({ sales: { ground: x } })),
      f.d.groundCommercialArea > 0 ? num('fz-com', 'Ticari alan fiyatı (m²)', 0, 1e8, 500, a.sales.commercialPrice, (x) => c.fizSet({ sales: { commercialPrice: x } }), cur + '/m²', 'temel') : null,
      num('fz-park', 'Otopark yeri fiyatı', 0, 1e9, 10000, a.sales.parkingPrice, (x) => c.fizSet({ sales: { parkingPrice: x == null ? 0 : x } }), cur + '/yer'),
      ui.fld2('KDV', ui.segmented({ label: 'KDV kipi', wide: true, value: a.sales.vatMode, options: [{ v: 'net', label: 'Fiyatlar KDV dahil' }, { v: 'gross', label: 'KDV ayrı' }], onchange: (v) => c.fizSet({ sales: { vatMode: v } }) })),
      rng(a.sales.vat, 'fz-vat', 'KDV oranı', 0, 0.3, 0.01, pct(a.sales.vat, 0), (x) => ({ sales: { vat: x } }))), null, 'fz-sales'));
    out.push(ui.section('Dolaylı giderler', h('div', { class: 'sec-box' },
      Cst.SOFT_DEFS.map((s) => rng(a.soft[s.id], 'fz-s-' + s.id, s.label + (s.base === 'revenue' ? ' (gelirin)' : ' (maliyetin)'), 0, 0.15, 0.0025, pct(a.soft[s.id], 2), (x) => ({ soft: { [s.id]: x } })))), null, 'fz-soft'));
    out.push(ui.section('Finansman ve zaman', h('div', { class: 'sec-box' },
      rng(a.finance.rate, 'fz-rate', 'Kredi faizi (yıllık)', 0, 1.2, 0.01, pct(a.finance.rate, 0), (x) => ({ finance: { rate: x } })),
      rng(a.finance.equity, 'fz-eq', 'Özkaynak oranı', 0, 1, 0.05, pct(a.finance.equity, 0), (x) => ({ finance: { equity: x } })),
      ui.fld2('Yapım süresi', ui.stepper({ label: 'Yapım süresi', value: a.finance.months, min: 3, max: 120, unit: 'ay', onchange: (x) => c.fizSet({ finance: { months: x } }) })),
      ui.fld2('Satış başlangıcı', ui.stepper({ label: 'Satış başlangıcı', value: a.finance.salesStart, min: 0, max: a.finance.months, unit: '. ay', onchange: (x) => c.fizSet({ finance: { salesStart: x } }) })),
      rng(a.finance.presale, 'fz-pre', 'Tamamlanmadan satılan pay', 0, 1, 0.05, pct(a.finance.presale, 0), (x) => ({ finance: { presale: x } })),
      rng(a.finance.disc, 'fz-disc', 'İskonto oranı (NPV, yıllık)', 0, 1.2, 0.01, pct(a.finance.disc, 0), (x) => ({ finance: { disc: x } })),
      rng(a.targetMargin, 'fz-tm', 'Hedef kâr marjı', 0, 0.6, 0.01, pct(a.targetMargin, 0), (x) => ({ targetMargin: x }))), null, 'fz-fin'));
    return out;
  }
  const pct = (v, d) => (v < 0 ? '−' : '') + '%' + fmt(Math.abs(v) * 100, d == null ? 1 : d);

  function priceTab(state, f) {
    const a = state.project.fiz || Cst.defaults(), c = ctl();
    const rows = Cst.CLASSES.map((k) => {
      const eff = Cst.unitPrice(k.id, a);
      const own = a.prices[k.id] != null;
      return h('div', { key: k.id, class: 'price-row' },
        num('fz-c-' + k.id, k.poz + ' ' + k.label + ' (' + k.unit + ')', 0, 1e9, 100, own ? a.prices[k.id] : Math.round(eff), (x) => c.fizSet({ prices: { [k.id]: x } }), a.currency));
    });
    return [
      ui.section('Ön ayar', h('div', { class: 'sec-box' },
        ui.fld2('Kalite düzeyi', ui.segmented({ label: 'Kalite düzeyi', wide: true, value: a.preset, options: Cst.PRESETS.map((p) => ({ v: p.id, label: p.label.replace(' (örnek)', '') })), onchange: (v) => c.fizSet({ preset: v }) }), 'İnce işler ve tesisat kalemlerini çarpar; kendi girdiğiniz fiyatlar aynen kullanılır.'),
        h('p', { class: 'note warn' }, 'Birim fiyatlar ÖRNEKtir. Bakanlığın yıllık yaklaşık birim maliyetleri tebliği ve yerel yüklenici tekliflerinden kendi değerlerinizi girin.'),
        Object.keys(a.prices).length ? ui.btn('Kendi fiyatlarımı sıfırla', { icon: 'reset', onclick: () => c.fizSet({ prices: Object.keys(a.prices).reduce((o, k) => { o[k] = null; return o; }, {}) }) }) : null), null, 'fz-pre'),
      ui.section('Metraj kalemleri', h('div', { class: 'sec-box' }, rows), Cst.CLASSES.length + ' kalem', 'fz-prices'),
    ];
  }

  function findingsTab(state, f) {
    const fd = Fz.findings(state);
    return fd.items.length ? [ui.findingList(fd, 'Varsayımlarınızın tutarlılık kontrolü. ' + Cst.DISCLAIMER)] : [h('p', { class: 'note' }, Cst.DISCLAIMER)];
  }

  Fz.findings = function (state) {
    const f = App.fizCtx(state.project);
    if (!f.ok) return { items: [], counts: { hata: 0, uyari: 0, oneri: 0 } };
    const items = (f.res.warnings || []).map((w, i) => ({ id: 'fw' + i, level: /ÖRNEK|sağlanam|zarar|negatif|aşıl|aşıyor/i.test(w) ? 'uyari' : 'oneri', title: w.split(/[;:]/)[0].replace(/\s*\(gerçek değildir\)/, '').trim().slice(0, 80), detail: w.length > 80 ? w.slice(w.split(/[;:]/)[0].length).replace(/^[;:\s]+/, '').replace(/^./, (c) => c.toUpperCase()) : '', src: [], actions: [] }));
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { counts[i.level]++; });
    return { items: items, counts: counts };
  };

  Fz.sidebar = function (state) {
    const f = App.fizCtx(state.project);
    const v = state.ui.fiz;
    const tab = v.tab || 'girdi';
    const fd = Fz.findings(state);
    const tabs = ui.tabsBar([
      { id: 'girdi', label: 'Girdiler' },
      { id: 'fiyat', label: 'Birim fiyat' },
      { id: 'bulgular', label: 'Bulgular', n: fd.items.length || null, warn: fd.counts.uyari + fd.counts.hata > 0 },
    ], tab, (id) => ctl().fizView({ tab: id }));
    let body;
    if (!f.ok) body = needDesign(state, f.dc);
    else if (tab === 'girdi') body = inputTab(state, f);
    else if (tab === 'fiyat') body = priceTab(state, f);
    else body = findingsTab(state, f);
    return ui.sideShell('sb-fiz', 'Maliyet ve fizibilite paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  Fz.EXPORTS = [
    { k: 'xlsx', tag: 'XLS', label: 'Excel (canlı formüllü)', sub: 'Varsayımları değiştirince yeniden hesaplanır; metraj, gelir, nakit akışı', strong: true },
    { k: 'png', tag: 'PNG', label: 'Pafta görseli', sub: 'Sunum için yüksek çözünürlüklü resim' },
    { k: 'pdf', tag: 'PDF', label: 'Pafta (A3)', sub: 'Baskıya uygun yatay A3' },
    { k: 'csv', tag: 'CSV', label: 'Metraj tablosu', sub: 'Kalemler ve tutarlar (Excel)' },
    { k: 'svg', tag: 'SVG', label: 'Vektör pafta', sub: 'Illustrator / Inkscape’te düzenlenir' },
  ];

  let memo = { k: null, v: null };
  function sceneOf(P, f, v) {
    const key = [P.meta.name, f, App.theme.name, v.mode, f.ok && v.mode === 'duyarlilik' ? 1 : 0];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: App.fizScene.scene(P, f, v, true) };
    return memo.v;
  }

  Fz.board = function (state, d) {
    const P = state.project, v = state.ui.fiz, c = ctl();
    const f = App.fizCtx(P);
    let stage;
    if (!f.ok) {
      stage = h('div', { class: 'board-stage' }, ui.emptyCard('Önce bir tasarım gerekli', 'Maliyet ve fizibilite, Tasarım Üretici’nin seçili alternatifinden alan ve daire sayılarını alır. Parseli çizin; tasarım otomatik üretilir.', [
        ui.btn('İmar ve Kapasite’ye git', { icon: 'parcel', cls: 'btn-primary', onclick: () => c.go('imar') }),
        P.site.parcel ? ui.btn('Tasarım Üretici’ye git', { icon: 'layers', onclick: () => c.go('tasarim') }) : ui.btn('20 × 30 m parsel koy', { icon: 'plus', onclick: () => c.imarParcelRect(20, 30, 0) })], 'at-map'));
    } else {
      const sc = sceneOf(P, f, v);
      const svg = h('svg', {
        id: 'pafta-fiz', class: 'board-svg board-svg-fiz', viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', tabindex: 0,
        'aria-label': 'Maliyet ve fizibilite paftası: toplam maliyet ' + money(f.res.total, f.a.currency) + ', net gelir ' + money(f.res.revenue.net, f.a.currency) + ', kâr ' + money(f.res.profit, f.a.currency),
      }, sc.prims.map((p) => App.board.primToV(p)));
      stage = h('div', { class: 'board-stage' }, svg, ui.site.exportMenu(state, Fz.EXPORTS, (k) => c.fizExport(k)));
    }
    return ui.boardPage(state, d, {
      label: 'Maliyet ve fizibilite paftası',
      stage: stage,
      scale: f.ok ? 'Örnek varsayımlar · ' + f.dc.alt.label : 'Tasarım bekleniyor',
      foot: h('p', { class: 'board-hint' }, 'Ön fizibilite: sonuçlar girdiğiniz varsayımlara bağlıdır; yatırım ya da değerleme tavsiyesi değildir.'),
      tools: [
        f.ok ? { k: 'seg', label: 'Pafta görünümü', value: v.mode, options: MODES, onchange: (m) => c.fizView({ mode: m }) } : null,
        { k: 'sep' },
        { k: 'btn', label: 'Dışa aktar', icon: 'download', onclick: () => c.xmenu(!state.ui.xmenu), disabled: !f.ok, pressed: !!state.ui.xmenu, title: 'Excel, PNG, PDF, CSV, SVG' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ].filter(Boolean),
    });
  };
})();

/* ---------------- skor göstergesi ---------------- */
(function () {
  const App = window.App;
  const ui = App.ui;
  const fmt = App.util.fmt;
  const level = (p, msgs) => (p == null ? msgs[0] : p >= 100 ? msgs[1] : p >= 70 ? msgs[2] : p >= 30 ? msgs[3] : msgs[4]);
  ui.meterOpts.fizibilite = function (state) {
    const f = App.fizCtx(state.project);
    if (!f.ok) return { label: 'Hedef marj', percent: null, msg: 'Önce bir tasarım gerekli', chips: [], issues: 0 };
    const r = f.res, a = f.a;
    const p = a.targetMargin > 0 ? Math.max(0, Math.min(100, Math.round((r.margin / a.targetMargin) * 100))) : (r.margin > 0 ? 100 : 0);
    const fd = ui.fizb.findings(state);
    const m = (v) => App.fizScene.money(v, '');
    return {
      label: 'Hedef marj karşılama', percent: p,
      msg: level(p, ['—', 'Hedef kâr marjı sağlanıyor', 'Hedefe yakın', 'Marj hedefin altında', r.profit < 0 ? 'Proje zarar ediyor' : 'Marj çok düşük']),
      chips: [
        { label: 'Maliyet', value: m(r.total), cls: 'dot' },
        { label: 'Gelir', value: m(r.revenue.net), cls: 'dot' },
        { label: 'Kâr', value: m(r.profit), cls: 'dot' },
        { label: 'Marj', value: (r.margin < 0 ? '−' : '') + '%' + fmt(Math.abs(r.margin) * 100, 1), cls: 'dot' },
      ],
      issues: fd.counts.hata + fd.counts.uyari, issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.fizView({ tab: 'bulgular' }),
    };
  };
})();
