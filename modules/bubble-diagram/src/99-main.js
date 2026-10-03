/* ==========================================================================
   99-main.js — uygulamayı başlat
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;

  App.store = App.createStore(App.state.reducer, App.state.initialState());

  function view() {
    const state = App.store.get();
    const d = App.state.derive(state);
    const t = state.ui.toast;
    return h('div', { class: 'app' + (state.ui.assistantOpen ? ' as-open' : '') },
      App.ui.header(state, d),
      App.ui.scorebar(state, d),
      h('main', { class: 'main' }, App.ui.sidebar(state, d), App.ui.board(state, d), App.ui.assistant(state, d)),
      h('div', { class: 'toast-zone', 'aria-live': 'polite', role: 'status' },
        t ? h('div', { key: t.id, class: 'toast toast-' + t.kind }, t.msg) : null));
  }

  const paint = App.mount(document.getElementById('root'), view);
  const schedule = App.raf(paint);

  let lastPct = null;
  let lastProject = App.store.get().project;
  let saveTimer = null;
  App.store.subscribe(function (state) {
    schedule();
    if (state.project === lastProject) return;
    lastProject = state.project;
    // otomatik kayıt (kişisel kolaylık)
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { App.state.persist(state.project); }, 500);
    // skor eşiği kutlaması
    const pc = App.state.derive(state).score.percent;
    if (lastPct != null && pc != null && lastPct < 90 && pc >= 90 && state.project.spaces.length >= 3 && !state.project.meta.example) App.ctl.toast('Harika yerleşim: verimlilik %' + pc, 'success');
    lastPct = pc;
  });

  document.addEventListener('keydown', App.ctl.onKey);
  paint();

  if (App.store.get().restored) setTimeout(function () { App.ctl.toast('Son çalışmanız geri yüklendi.'); }, 400);
  lastPct = App.state.derive(App.store.get()).score.percent;
})();
