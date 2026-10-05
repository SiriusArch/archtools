/* ==========================================================================
   47-ui-shell.js — archtools kabuğu: modül gezgini, ortak skor kadranı verisi,
   araç çubuğu ve sayfa iskeleti. Modüller yalnızca kendi içeriğini üretir.
   Modül kimlikleri (state.ui.module ve #/rota): islev · kat · analiz · arsa · imar · yer · tasarim · fizibilite · birim
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  const MODULES = [
    { id: 'islev', n: '01', label: 'İşlev Şeması', sub: 'İşlev şeması · bubble diagram', shape: 'circle' },
    { id: 'kat', n: '02', label: 'Mekân Etüdü', sub: 'Mekân etüdü · şekil, boyut ve ilişki', shape: 'square' },
    { id: 'analiz', n: '03', label: 'Mekân Analizi', sub: 'Mekân analizi · patlatılmış izometrik', shape: 'triangle' },
    { id: 'arsa', n: '04', label: 'Arsa Analizi', sub: 'Arsa analizi · çevre, erişim, ulaşım', shape: 'diamond' },
    { id: 'imar', n: '05', label: 'İmar ve Kapasite', sub: 'İmar ve kapasite · parsel ve kütle', shape: 'plot' },
    { id: 'yer', n: '06', label: 'Yer Seçimi', sub: 'Yer seçimi · aday karşılaştırma ve tarama', shape: 'target' },
    { id: 'tasarim', n: '07', label: 'Tasarım Üretici', sub: 'Tasarım üretici · kütle, tipik kat ve otopark', shape: 'tower' },
    { id: 'fizibilite', n: '08', label: 'Maliyet ve Fizibilite', sub: 'Maliyet ve fizibilite · metraj, kâr, nakit akışı', shape: 'coin' },
    { id: 'birim', n: '09', label: 'Birim Oluşturucu', sub: 'Birim oluşturucu · adım adım kütle şekillendirme', shape: 'stack' },
  ];
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
    else if (shape === 'coin') g = h('g', {}, h('circle', Object.assign({ cx: 9, cy: 9, r: 6.6 }, q)), h('path', { d: 'M9 5.2v7.6M6.8 7.4c0-1 .9-1.7 2.2-1.7s2.2.7 2.2 1.6c0 2.3-4.4 1.1-4.4 3.4 0 .9 1 1.7 2.2 1.7s2.2-.7 2.2-1.7', stroke: 'currentColor', 'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round' }));
    else g = h('path', Object.assign({ d: 'M2.5 15.2L9 3l6.5 12.2z' }, p));
    return h('svg', { viewBox: '0 0 18 18', width: 16, height: 16, class: 'msh msh-' + shape, 'aria-hidden': 'true' }, g);
  }

  ui.moduleNav = function (state) {
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

  function birimMeter(state) {
    const P = state.project;
    const u = P.unit;
    if (!u || !App.unit) return { label: 'Açık alan', percent: null, msg: '', chips: [], issues: 0 };
    const step = u.steps[Math.min(u.cur, u.steps.length - 1)];
    const M = App.unit.metrics(u, step);
    const f = App.unit.findings(u);
    const p = M.masses ? Math.round((1 - M.taks) * 100) : null;
    return {
      label: 'Açık alan', percent: p,
      msg: !M.masses ? 'Bir kütle ekleyerek başlayın' : 'Adım ' + (u.cur + 1) + '/' + u.steps.length + ' · ' + step.title + ' · TAKS ' + U.fmt(M.taks, 2) + ' · KAKS ' + U.fmt(M.kaks, 2),
      chips: [
        { label: 'TAKS', value: U.fmt(M.taks, 2), cls: 'dot' },
        { label: 'KAKS', value: U.fmt(M.kaks, 2), cls: 'dot' },
        { label: 'Yeşil', value: '%' + Math.round(M.greenShare * 100), cls: 'dot' },
        { label: 'Kat', value: String(M.maxFloors), cls: 'dot' },
      ],
      issues: f.counts.hata + f.counts.uyari,
      issuesText: 'uyarı · bulgulara git',
      onIssues: () => App.ctl.dispatch({ type: 'UI', patch: { unit: Object.assign({}, state.ui.unit, { tab: 'bulgular' }) } }),
    };
  }

  ui.meterOpts = { islev: islevMeter, bubble: islevMeter, kat: katMeter, analiz: analizMeter, birim: birimMeter };
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
    if (m === 'birim' && ui.unit) return h('main', { class: 'main main-birim', key: 'main-birim' }, ui.unit.sidebar(state, d), ui.unit.board(state, d));
    if (m === 'yer' && ui.yer) return h('main', { class: 'main main-yer', key: 'main-yer' }, ui.yer.sidebar(state, d), ui.yer.board(state, d));
    return h('main', { class: 'main main-islev', key: 'main-islev' }, ui.sidebar(state, d), ui.board(state, d), ui.assistant(state, d));
  };
})();
