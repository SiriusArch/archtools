/* ==========================================================================
   47-ui-shell.js — archtools kabuğu: modül gezgini, ortak skor kadranı verisi,
   araç çubuğu ve sayfa iskeleti. Modüller yalnızca kendi içeriğini üretir.
   Modül kimlikleri (state.ui.module ve #/rota): islev · kat · analiz
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  const MODULES = [
    { id: 'islev', n: '01', label: 'İşlev Şeması', sub: 'İşlev şeması · bubble diagram', shape: 'circle' },
    { id: 'kat', n: '02', label: 'Kat Etüdü', sub: 'Kat etüdü · plan blokları', shape: 'square' },
    { id: 'analiz', n: '03', label: 'Mekân Analizi', sub: 'Mekân analizi · patlatılmış izometrik', shape: 'triangle' },
  ];
  ui.MODULES = MODULES;
  ui.moduleInfo = (id) => MODULES.find((m) => m.id === id) || MODULES[0];
  ui.moduleSub = (state) => ui.moduleInfo(state.ui.module).sub;

  /* modül simgesi: daire · kare · üçgen (marka simgesinin üç parçası) */
  function shapeIcon(shape) {
    const p = { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' };
    const g = shape === 'circle' ? h('circle', Object.assign({ cx: 9, cy: 9, r: 6.2 }, p))
      : shape === 'square' ? h('rect', Object.assign({ x: 3, y: 3, width: 12, height: 12, rx: 2 }, p))
        : h('path', Object.assign({ d: 'M2.5 15.2L9 3l6.5 12.2z' }, p));
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

  function katMeter(state) {
    const P = state.project;
    if (!P.study) return { label: 'Kat skoru', percent: null, msg: '', chips: [], issues: 0 };
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

  ui.meterOpts = { islev: islevMeter, bubble: islevMeter, kat: katMeter, analiz: analizMeter };
  ui.meterFor = (state, d) => (ui.meterOpts[state.ui.module] || islevMeter)(state, d);

  /* ---------------- araç çubuğu ----------------
     items: { k:'btn', label, icon, onclick, disabled, strong, attn, title } | { k:'icon', ... } | { k:'sep' } | { k:'seg', ...ui.segmented } */
  ui.toolbar = function (items, extra) {
    const g = App.theme.name === 'glass';
    const nodes = items.map((it, i) => {
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
  ui.emptyCard = function (title, text, actions) {
    return h('div', { class: 'empty-card' },
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
    return h('main', { class: 'main main-islev', key: 'main-islev' }, ui.sidebar(state, d), ui.board(state, d), ui.assistant(state, d));
  };
})();
