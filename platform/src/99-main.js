/* ==========================================================================
   99-main.js — archtools'u başlat: tema, ortak store, modül rotası, intro
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;

  // tema: URL (?style=bauhaus) > kayıtlı tercih > glass
  (function () {
    let name = 'glass';
    try {
      const q = new URLSearchParams(location.search).get('style');
      const sv = window.localStorage.getItem('archtools.style') || window.localStorage.getItem('archtools.bubble.style');
      name = q || sv || 'glass';
    } catch (e) {}
    if (!App.THEMES[name]) name = 'glass';
    App.theme.set(name);
    document.documentElement.setAttribute('data-style', name);
  })();

  App.store = App.createStore(App.state.reducer, App.state.initialState());

  // ilk modül: adres çubuğundaki rota (#/kat ...)
  const first = App.route.fromHash();
  if (first && first !== App.store.get().ui.module) App.store.dispatch({ type: 'UI', patch: { module: first } });
  App.route.setTitle(App.store.get().ui.module);
  App.ctl.loadAnView();
  App.ctl.loadSiteView();
  App.ctl.loadImarView();
  App.ctl.loadDsnView();
  App.ctl.loadFizView();
  App.ctl.loadUnitView();
  const fromLink = App.ctl.hashSite(); // #/arsa?lat=…&lon=… paylaşım bağlantısı

  function view() {
    const state = App.store.get();
    const d = App.state.derive(state);
    const t = state.ui.toast;
    const mod = state.ui.module;
    return h('div', { class: 'app s-' + App.theme.name + ' m-' + mod + (mod === 'islev' && state.ui.assistantOpen ? ' as-open' : '') + (state.ui.boardWide ? ' bw-wide' : '') },
      App.ui.header(state, d),
      App.ui.scorebar(state, d),
      App.ui.pageMain(state, d),
      h('div', { class: 'toast-zone', 'aria-live': 'polite', role: 'status' },
        t ? h('div', { key: t.id, class: 'toast toast-' + t.kind }, t.msg) : null),
      App.ui.welcome ? App.ui.welcome(state) : null);
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

  document.addEventListener('keydown', App.ctl.onKey);
  // odak halkası yalnızca klavye gezintisinde görünür (paftada fareyle tıklayınca çerçeve çıkmasın)
  const rootEl = document.body;
  document.addEventListener('keydown', function (e) { if (e.key === 'Tab' || e.key.indexOf('Arrow') === 0) rootEl.classList.add('kbd'); }, true);
  document.addEventListener('pointerdown', function () { rootEl.classList.remove('kbd'); }, true);
  paint();
  lastPct = App.state.derive(App.store.get()).score.percent;

  // açılış animasyonu: uygulama altta hazır, intro yumuşakça çözülür
  App.intro.start(function () {
    if (App.store.get().restored) setTimeout(function () { App.ctl.toast('Son çalışmanız geri yüklendi.'); }, 250);
    if (!fromLink && App.welcome) App.welcome.maybe(); // ilk açılış soruları
  });
})();
