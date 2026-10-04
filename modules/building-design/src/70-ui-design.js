/* ==========================================================================
   70-ui-design.js — Modül 7 arayüzü: Tasarım Üretici
   Sol panel: Program (daire karması, plan kurgusu, otopark) · Seçenekler (üretilen alternatifler) · Görünüm · Bulgular.
   Pafta: seçili alternatifin vaziyeti, tipik katı, bodrumu, kütlesi ya da tüm alternatiflerin karşılaştırması.
   Parsel ve imar değerleri İmar ve Kapasite modülünden gelir (project.site); bu modül yalnızca project.design'ı değiştirir.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const D = App.design;
  const ctl = () => App.ctl;
  const Dz = (ui.design = {});

  App.dsnUi = Object.assign(App.dsnUi || {}, {
    dsn: () => ({ tab: 'program', mode: 'vaziyet', variant: 0, grid: true, dims: true, yaw: 35, pitch: 45, zx: 1 }),
  });

  const ACCESS = [{ v: 'auto', label: 'Otomatik' }, { v: 'koridor', label: 'Koridor' }, { v: 'nokta', label: 'Merkezi' }];
  const GROUND = [{ v: 'konut', label: 'Konut' }, { v: 'ticari', label: 'Ticari' }, { v: 'pilotis', label: 'Pilotis' }];
  const MODES = [{ v: 'vaziyet', label: 'Vaziyet' }, { v: 'tipik', label: 'Tipik kat' }, { v: 'bodrum', label: 'Bodrum' }, { v: 'kutle', label: 'Kütle' }, { v: 'kiyas', label: 'Karşılaştır' }];

  /* ---------------- sol panel ---------------- */
  function needParcel(state) {
    const c = ctl();
    return [h('div', { class: 'panel' },
      h('p', { class: 'note' }, 'Tasarım üretici, İmar ve Kapasite modülündeki parsel ve imar değerlerini kullanır. Önce bir parsel çizin; alternatifler otomatik oluşur.'),
      h('div', { class: 'here-act' },
        ui.btn('İmar ve Kapasite’ye git', { icon: 'parcel', cls: 'btn-primary', onclick: () => c.go('imar') }),
        ui.btn('20 × 30 m parsel koy', { icon: 'plus', onclick: () => c.imarParcelRect(20, 30, 0) })))];
  }

  function programTab(state, dc) {
    const P = state.project, dsn = P.design || D.defaults(), im = P.site.imar, c = ctl();
    const num = (id, label, min, max, step, value, onset, unit) => h('label', { class: 'nf', for: id },
      h('span', { class: 'nf-l' }, label),
      h('span', { class: 'nf-c' }, h('input', { id: id, class: 'inp mono nf-in', type: 'number', min: min, max: max, step: step, value: value, keep: true, inputmode: 'decimal', onchange: (e) => { const x = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(x)) onset(x); } }), unit ? h('span', { class: 'unit' }, unit) : null));
    const mixRows = D.MIX_TYPES.map((t) => {
      const share = dsn.mix[t.id] || 0;
      const area = dsn.areas[t.id] || t.area;
      return h('div', { key: t.id, class: 'mix-row' },
        ui.range({ id: 'dz-mix-' + t.id, label: t.label + ' · pay', min: 0, max: 100, step: 5, value: Math.round(share * 100), text: '%' + Math.round(share * 100), oninput: (x) => c.dsnMixLive(t.id, x / 100), onchange: () => c.dsnLiveEnd() }),
        num('dz-area-' + t.id, t.label + ' brüt alan', Math.round(t.area * 0.7), Math.round(t.area * 1.35), 1, area, (x) => c.dsnArea(t.id, x), 'm²'));
    });
    const out = [];
    out.push(ui.section('İmar girdileri', h('div', { class: 'sec-box' },
      h('div', { class: 'kv-grid' },
        h('div', {}, h('span', { class: 'kv-k' }, 'TAKS'), h('b', { class: 'kv-v mono' }, fmt(im.taks, 2))),
        h('div', {}, h('span', { class: 'kv-k' }, 'KAKS'), h('b', { class: 'kv-v mono' }, fmt(im.kaks, 2))),
        h('div', {}, h('span', { class: 'kv-k' }, 'Yençok'), h('b', { class: 'kv-v mono' }, fmt(im.hmax, 1) + ' m')),
        h('div', {}, h('span', { class: 'kv-k' }, 'Bodrum'), h('b', { class: 'kv-v mono' }, im.basement + ' kat'))),
      h('p', { class: 'note' }, 'Bu değerler İmar ve Kapasite modülünden gelir. Değiştirmek için oraya dönün; alternatifler yeniden üretilir.'),
      ui.btn('İmar değerlerini düzenle', { icon: 'parcel', onclick: () => c.go('imar') })), null, 'dz-imar'));
    out.push(ui.section('Daire karması', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Payları kaydırın; toplam her zaman %100 kalır. Brüt alan, duvarlar dahil daire alanıdır (ortak alanlar hariç).'),
      mixRows), null, 'dz-mix'));
    out.push(ui.section('Plan kurgusu', h('div', { class: 'sec-box' },
      ui.fld2('Kat erişimi', ui.segmented({ label: 'Kat erişimi', wide: true, value: dsn.access, options: ACCESS, onchange: (v) => c.dsnSet({ access: v }) }), 'Otomatik: kanat derinliğine göre koridor ya da merkezi çekirdek seçilir.'),
      ui.range({ id: 'dz-bay', label: 'Taşıyıcı aks aralığı', min: 3.5, max: 9, step: 0.1, value: dsn.bay, text: fmt(dsn.bay, 1) + ' m', oninput: (x) => c.dsnLive({ bay: x }), onchange: () => c.dsnLiveEnd(), hint: 'Daire genişlikleri akslara oturtulur; 5–7 m betonarme için ekonomiktir.' }),
      ui.range({ id: 'dz-travel', label: 'En uzak daireden merdivene', min: 15, max: 45, step: 1, value: dsn.travel, text: dsn.travel + ' m', oninput: (x) => c.dsnLive({ travel: x }), onchange: () => c.dsnLiveEnd(), hint: 'Kaçış mesafesi; mevzuattaki sınırı kendi projenize göre girin.' }),
      ui.fld2('Zemin kat', ui.segmented({ label: 'Zemin kat kullanımı', wide: true, value: dsn.ground, options: GROUND, onchange: (v) => c.dsnSet({ ground: v }) }), dsn.ground === 'ticari' ? 'Zemin katta dükkânlar; konut sayısı üst katlardan hesaplanır.' : dsn.ground === 'pilotis' ? 'Zemin kat açık: yalnızca çekirdek ve kolonlar.' : null),
      ui.toggle({ label: 'Taşıyıcı aks ve kolonlar', on: dsn.grid, onclick: () => c.dsnSet({ grid: !dsn.grid }) })), null, 'dz-plan'));
    out.push(ui.section('Otopark', h('div', { class: 'sec-box' },
      ui.fld2('Bodrum kat sayısı', ui.stepper({ label: 'Bodrum kat sayısı', value: im.basement, min: 0, max: 4, unit: 'kat', onchange: (x) => c.imarSet({ basement: x }) }), 'Bodrum sayısı imar girdisidir; otopark kapasitesi buna göre hesaplanır.'),
      ui.range({ id: 'dz-cars', label: 'Daire başına araç', min: 0, max: 3, step: 0.1, value: dsn.park.perUnit == null ? im.cars : dsn.park.perUnit, text: fmt(dsn.park.perUnit == null ? im.cars : dsn.park.perUnit, 1) + (dsn.park.perUnit == null ? ' (imar)' : ''), oninput: (x) => c.dsnLive({ park: { perUnit: x } }), onchange: () => c.dsnLiveEnd() }),
      dsn.park.perUnit != null ? ui.btn('İmar değerini kullan', { icon: 'reset', onclick: () => c.dsnSet({ park: { perUnit: null } }) }) : null,
      h('p', { class: 'note' }, 'Araç yeri ' + fmt(dsn.park.stall[0], 1) + ' × ' + fmt(dsn.park.stall[1], 1) + ' m, sürüş yolu ' + fmt(dsn.park.aisle, 1) + ' m, rampa ' + fmt(dsn.park.ramp, 1) + ' m.')), null, 'dz-park'));
    void dc;
    return out;
  }

  function optionsTab(state, dc) {
    const c = ctl();
    if (!dc.ok) return [h('p', { class: 'note' }, dc.reason === 'parcel' ? 'Önce parsel çizin.' : 'Bu parsel ve imar değerleriyle üretilebilir bir kütle yok. Çekmeleri ya da TAKS / KAKS değerlerini gözden geçirin.')];
    const rows = dc.alts.map((a) => {
      const on = dc.alt && a.id === dc.alt.id;
      return h('li', { key: a.id, class: 'scn alt-card' + (on ? ' alt-on' : '') },
        h('div', { class: 'scn-top' },
          h('b', { class: 'scn-n' }, a.label),
          h('span', { class: 'alt-score mono' }, '%' + Math.round(a.score) + ' · ' + a.grade),
          h('button', { type: 'button', class: 'icon-btn', title: on ? 'Seçili' : 'Bu seçeneği seç', 'aria-label': a.label + (on ? ' seçili' : ' seç'), 'aria-pressed': String(on), onclick: () => c.dsnSelect(a.id) }, ui.icon(on ? 'check' : 'plus', 15))),
        h('div', { class: 'kv-grid' },
          h('div', {}, h('span', { class: 'kv-k' }, 'Kat'), h('b', { class: 'kv-v mono' }, String(a.floors))),
          h('div', {}, h('span', { class: 'kv-k' }, 'Daire'), h('b', { class: 'kv-v mono' }, String(a.unitTotals.total))),
          h('div', {}, h('span', { class: 'kv-k' }, 'Verim'), h('b', { class: 'kv-v mono' }, '%' + Math.round(a.plan.areas.efficiency * 100))),
          h('div', {}, h('span', { class: 'kv-k' }, 'Otopark'), h('b', { class: 'kv-v mono' }, a.basement.capacity + '/' + a.basement.need))));
    });
    return [ui.section('Üretilen seçenekler', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Her seçenek aynı imar değerleriyle farklı kütle biçimi ve taban alanı denemesidir. Puan: verim, emsal kullanımı, gün ışığı, otopark, açık alan, gölge ve taşıyıcı düzen.'),
      h('ul', { class: 'scns' }, rows),
      ui.btn('Yan yana karşılaştır', { icon: 'layers', onclick: () => c.dsnView({ mode: 'kiyas' }) })), dc.alts.length + ' seçenek', 'dz-alts')];
  }

  function viewTab(state) {
    const v = state.ui.dsn, c = ctl();
    const plan = state.project.design;
    const dc = App.dsnCtx(state.project);
    const nv = dc.ok && dc.alt.plan.variants ? dc.alt.plan.variants.length : 1;
    return [ui.section('Görünüm', h('div', { class: 'sec-box' },
      ui.fld2('Pafta', ui.segmented({ label: 'Pafta görünümü', wide: true, value: v.mode, options: MODES.slice(0, 4), onchange: (m) => c.dsnView({ mode: m }) })),
      h('div', { class: 'tgl-row' },
        ui.toggle({ label: 'Aks / kolon', on: plan.grid, onclick: () => c.dsnSet({ grid: !plan.grid }) }),
        ui.toggle({ label: 'Ölçüler', on: v.dims, onclick: () => c.dsnView({ dims: !v.dims }) })),
      nv > 1 && v.mode === 'tipik' ? ui.fld2('Plan tipi', ui.stepper({ label: 'Plan tipi', value: Math.min(nv, (v.variant || 0) + 1), min: 1, max: nv, unit: '/ ' + nv, onchange: (x) => c.dsnView({ variant: x - 1 }) }), 'Katlar arasında daire karması farklı plan tipleriyle sağlanır.') : null,
      v.mode === 'kutle' ? [
        ui.range({ id: 'dz-yaw', label: 'Dönüş', min: -85, max: 85, step: 1, value: Math.round(v.yaw), text: Math.round(v.yaw) + '°', oninput: (x) => c.dsnView({ yaw: x }, true), onchange: () => c.dsnView({}) }),
        ui.range({ id: 'dz-pitch', label: 'Bakış yüksekliği', min: 20, max: 70, step: 1, value: Math.round(v.pitch), text: Math.round(v.pitch) + '°', oninput: (x) => c.dsnView({ pitch: x }, true), onchange: () => c.dsnView({}) }),
        ui.range({ id: 'dz-zx', label: 'Yükseklik abartısı', min: 1, max: 3, step: 0.1, value: v.zx, text: '×' + fmt(v.zx, 1), oninput: (x) => c.dsnView({ zx: x }, true), onchange: () => c.dsnView({}) }),
      ] : null), null, 'dz-view')];
  }

  function findingsOf(dc) {
    const items = [];
    const a = dc.alt;
    (a.notes || []).forEach((t, i) => {
      const bad = /yetersiz|eksik|aşıl|aşıyor|sapıyor|uzak|dar|derin|fazla|geçiyor/i.test(t);
      items.push({ id: 'dn' + i, level: bad ? 'uyari' : 'oneri', title: t.length > 70 ? t.slice(0, 68) + '…' : t, detail: t.length > 70 ? t : '', src: ['imar'], actions: [] });
    });
    if (a.basement.shortage > 0) items.unshift({ id: 'dpark', level: 'uyari', title: 'Otopark ' + a.basement.shortage + ' araç eksik', detail: 'Bodrum kat sayısını artırın ya da daire başına araç değerini imar şartnamenize göre gözden geçirin.', src: ['imar'], actions: [] });
    (a.R.items || []).forEach((it) => { if (it.level !== 'ok' && ['otopark', 'otopark-ok'].indexOf(it.id) < 0) items.push(it); });
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    return { items: items, counts: counts };
  }

  Dz.findings = function (state) { const dc = App.dsnCtx(state.project); return dc.ok ? findingsOf(dc) : { items: [], counts: { hata: 0, uyari: 0, oneri: 0 } }; };

  Dz.sidebar = function (state) {
    const dc = App.dsnCtx(state.project);
    const v = state.ui.dsn;
    const tab = v.tab || 'program';
    const fd = dc.ok ? findingsOf(dc) : { items: [], counts: { hata: 0, uyari: 0, oneri: 0 } };
    const tabs = ui.tabsBar([
      { id: 'program', label: 'Program' },
      { id: 'secenek', label: 'Seçenek', n: dc.ok ? dc.alts.length : null },
      { id: 'gorunum', label: 'Pafta' },
      { id: 'bulgular', label: 'Bulgular', n: fd.items.length ? fd.counts.hata + fd.counts.uyari + fd.counts.oneri : null, warn: fd.counts.hata + fd.counts.uyari > 0 },
    ], tab, (id) => ctl().dsnView({ tab: id }));
    let body;
    if (!state.project.site.parcel) body = needParcel(state);
    else if (tab === 'program') body = programTab(state, dc);
    else if (tab === 'secenek') body = optionsTab(state, dc);
    else if (tab === 'gorunum') body = viewTab(state);
    else body = fd.items.length ? [ui.findingList(fd, 'Seçili alternatifin imar, plan ve otopark açısından kontrolü.')] : [h('p', { class: 'note' }, 'Bulgular için önce bir alternatif gerekli.')];
    return ui.sideShell('sb-dsn', 'Tasarım üretici paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, dc, v) {
    const key = [P.meta.name, dc, App.theme.name, v.mode, v.variant, P.design.grid, v.dims, v.yaw, v.pitch, v.zx, P.site.loc];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: App.dsnScene.scene(P, dc, dc.alt, v, true) };
    return memo.v;
  }
  Dz.EXPORTS = [
    { k: 'png', tag: 'PNG', label: 'Pafta görseli', sub: 'Sunum için yüksek çözünürlüklü resim' },
    { k: 'pdf', tag: 'PDF', label: 'Pafta (A3)', sub: 'Baskıya uygun yatay A3' },
    { k: 'dxf', tag: 'DXF', label: 'CAD çizimi', sub: 'Vaziyet, tipik kat ve bodrum; katmanlı, metre birimli', strong: true },
    { k: 'ifc', tag: 'IFC', label: 'BIM modeli (IFC4)', sub: 'Katlar, duvarlar, mekânlar, kolonlar (Revit, ArchiCAD)', strong: true },
    { k: 'xlsx', tag: 'XLS', label: 'Alan ve program tablosu', sub: 'Excel: alanlar, daire listesi, alternatifler' },
    { k: 'svg', tag: 'SVG', label: 'Vektör pafta', sub: 'Illustrator / Inkscape’te düzenlenir' },
    { k: 'geojson', tag: 'GEO', label: 'GeoJSON', sub: 'Parsel ve kütle gerçek koordinatlarla (QGIS)' },
    { k: 'kml', tag: 'KML', label: 'Google Earth (KML)', sub: 'Parsel ve kütle Google Earth’te açılır' },
  ];

  Dz.board = function (state, d) {
    const P = state.project, v = state.ui.dsn, c = ctl();
    const dc = App.dsnCtx(P);
    const S = ui.site;
    const noParcel = !P.site.parcel;
    let stage;
    if (!dc.ok) {
      const msg = noParcel ? ['Önce parsel gerekli', 'Tasarım üretici, İmar ve Kapasite modülünde çizilen parsel ve imar değerleriyle çalışır. Parseli çizin ya da hızlıca örnek bir parsel koyun.'] : ['Bu parselde kütle üretilemedi', 'Çekme mesafeleri ya da TAKS / KAKS değerleri yapılabilir bir kütleye izin vermiyor. İmar değerlerini gözden geçirin.'];
      stage = h('div', { class: 'board-stage' }, ui.emptyCard(msg[0], msg[1], [
        ui.btn('İmar ve Kapasite’ye git', { icon: 'parcel', cls: 'btn-primary', onclick: () => c.go('imar') }),
        noParcel ? ui.btn('20 × 30 m parsel koy', { icon: 'plus', onclick: () => c.imarParcelRect(20, 30, 0) }) : null], 'at-map'));
    } else {
      const sc = sceneOf(P, dc, v);
      const hits = v.mode === 'kiyas' ? sc.hits.map((hi) => h('rect', { key: 'k' + hi.i, class: 'ahit click', x: hi.x0, y: hi.y0, width: hi.x1 - hi.x0, height: hi.y1 - hi.y0, fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': 'Alternatifi seç: ' + dc.alts[hi.i].label, onclick: () => c.dsnSelect(hi.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.dsnSelect(hi.id); } } }, h('title', {}, dc.alts[hi.i].label))) : null;
      const svg = h('svg', {
        id: 'pafta-dsn', class: 'board-svg board-svg-dsn', viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', tabindex: 0,
        'aria-label': 'Tasarım paftası: ' + dc.alt.label + ', ' + dc.alt.floors + ' kat, ' + dc.alt.unitTotals.total + ' daire, skor yüzde ' + Math.round(dc.alt.score),
      }, sc.prims.map((p) => App.board.primToV(p)), hits ? h('g', { class: 'ahits' }, hits) : null);
      stage = h('div', { class: 'board-stage' }, svg, S.exportMenu(state, Dz.EXPORTS, (k) => c.dsnExport(k)));
    }
    const hint = !dc.ok ? '' : v.mode === 'kiyas' ? 'Bir seçeneğe tıklayarak seçin' : v.mode === 'tipik' ? 'Daire türleri tonla gösterilir; çekirdek koyu, kolonlar kare işaretlidir' : v.mode === 'bodrum' ? 'Kesikli çizgi bina izdüşümüdür' : v.mode === 'kutle' ? 'Görünüm sekmesinden döndürün' : 'Parsel, çekme zarfı ve seçili kütle';
    return ui.boardPage(state, d, {
      label: 'Tasarım paftası',
      stage: stage,
      scale: dc.ok ? dc.alt.label + ' · ' + dc.alt.floors + ' kat · ' + dc.alt.unitTotals.total + ' daire' : 'Parsel bekleniyor',
      foot: h('p', { class: 'board-hint' }, hint),
      tools: [
        dc.ok ? { k: 'seg', label: 'Pafta görünümü', value: v.mode, options: MODES, onchange: (m) => c.dsnView({ mode: m }) } : null,
        { k: 'sep' },
        { k: 'btn', label: 'Dışa aktar', icon: 'download', onclick: () => c.xmenu(!state.ui.xmenu), disabled: !dc.ok, pressed: !!state.ui.xmenu, title: 'PNG, PDF, DXF, IFC, Excel, SVG, GeoJSON' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ].filter(Boolean),
    });
  };
})();

/* ---------------- skor göstergesi (üst şerit / kadran) ---------------- */
(function () {
  const App = window.App;
  const ui = App.ui;
  const fmt = App.util.fmt;
  const level = (p, msgs) => (p == null ? msgs[0] : p >= 85 ? msgs[1] : p >= 70 ? msgs[2] : p >= 40 ? msgs[3] : msgs[4]);
  ui.meterOpts.tasarim = function (state) {
    const dc = App.dsnCtx(state.project);
    if (!dc.ok) return { label: 'Tasarım skoru', percent: null, msg: dc.reason === 'parcel' ? 'Önce İmar ve Kapasite’de parsel çizin' : 'Bu parselde kütle üretilemedi', chips: [], issues: 0 };
    const a = dc.alt, p = Math.round(a.score), fd = ui.design.findings(state);
    return {
      label: 'Tasarım skoru', percent: p,
      msg: level(p, ['—', 'Çok dengeli bir seçenek', 'İyi, birkaç ince ayar kaldı', 'Verim ya da otopark zayıf', 'Seçenek ciddi sorunlar taşıyor']),
      chips: [
        { label: 'Kat', value: a.floors + ' · ' + fmt(a.height, 1) + ' m', cls: 'dot' },
        { label: 'Daire', value: String(a.unitTotals.total), cls: 'dot' },
        { label: 'Verim', value: '%' + Math.round(a.plan.areas.efficiency * 100), cls: 'dot' },
        { label: 'Otopark', value: a.basement.capacity + '/' + a.basement.need, cls: 'dot' },
      ],
      issues: fd.counts.hata + fd.counts.uyari, issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.dsnView({ tab: 'bulgular' }),
    };
  };
})();
