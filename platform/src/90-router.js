/* ==========================================================================
   90-router.js — modül gezintisi: #/islev · #/kat · #/analiz · #/arsa · #/imar · #/yer · #/tasarim · #/fizibilite · #/vaziyet · #/kolaj · #/pafta · #/kent
   Geçiş: View Transitions varsa yumuşak çapraz solma, yoksa anında.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  // yalnızca açık modüller yönlendirilir (App.config.modules — build.py enjekte eder); gizli modüle adresten de gidilemez
  const ALL = ['islev', 'kat', 'analiz', 'arsa', 'imar', 'yer', 'tasarim', 'fizibilite', 'vaziyet', 'kolaj', 'pafta', 'kent'];
  const ENABLED = (App.config && App.config.modules) || ALL;
  const CLOSED_MSG = 'Bu araç şu an bakımda ve geçici olarak kapalı.';
  const isClosed = (id) => !!(App.ui && App.ui.isClosed && App.ui.isClosed(id));
  const IDS = ALL.filter((id) => ENABLED.indexOf(id) >= 0 && !isClosed(id)); // kapalı araçlar yönlendirilmez
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

  let instant = false; // araç galerisi kendi geçiş animasyonunu oynatır: çapraz solma beklenmez
  function switchTo(id) {
    if (get().ui.module === id) return;
    if (instant || document.hidden) { instant = false; apply(id); return; }
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

  ctl.go = function (id, opts) {
    if (isClosed(id)) { if (ctl.toast) ctl.toast(App.ui.moduleInfo(id).label + ': ' + CLOSED_MSG, 'warn'); return; }
    if (IDS.indexOf(id) < 0 || get().ui.module === id) return;
    instant = !!(opts && opts.instant);
    if (fromHash() !== id) { try { location.hash = '#/' + id; return; } catch (e) {} }
    switchTo(id);
  };

  // kapalı bir araca adresle gelinirse işlev şemasına dönülür ve kısa bir uyarı gösterilir
  function closedNotice() {
    const m = /^#\/?([a-z]+)/.exec(location.hash || '');
    if (!m || !isClosed(m[1])) return false;
    try { history.replaceState(null, '', '#/islev'); } catch (e) {}
    if (ctl.toast) setTimeout(function () { ctl.toast(App.ui.moduleInfo(m[1]).label + ': ' + CLOSED_MSG, 'warn'); }, 0);
    return true;
  }
  App.route.closedNotice = closedNotice;
  App.route.CLOSED_MSG = CLOSED_MSG;

  window.addEventListener('hashchange', function () {
    closedNotice();
    switchTo(fromHash() || 'islev'); // boş adres = işlev şeması (geri düğmesiyle ilk sayfaya dönüş)
    if (ctl.hashSite) ctl.hashSite(); // #/arsa?lat=…&lon=… paylaşım bağlantısı
  });
})();
