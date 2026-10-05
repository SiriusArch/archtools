/* ==========================================================================
   90-router.js — modül gezintisi: #/islev · #/kat · #/analiz · #/arsa · #/imar · #/yer · #/tasarim · #/fizibilite · #/birim
   Geçiş: View Transitions varsa yumuşak çapraz solma, yoksa anında.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const IDS = ['islev', 'kat', 'analiz', 'arsa', 'imar', 'yer', 'tasarim', 'fizibilite', 'birim'];
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
