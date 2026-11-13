/* ==========================================================================
   53-ctl-view.js — modüller arası ortak "görünüm durumu" yardımcısı
   ctl.makeView(uiKey, storeKey, persist): state.ui[uiKey] nesnesini yamalar ve seçili alanları
   bu tarayıcının localStorage'ında saklar (proje JSON'una girmez).
   Önceden Arsa Analizi denetleyicisindeydi; Mekân Etüdü gibi modüller o modül olmadan da
   yayınlanabilsin diye platforma alındı.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const get = () => App.store.get();
  const timers = {};

  ctl.makeView = function (uiKey, storeKey, persist) {
    const save = function () {
      clearTimeout(timers[uiKey]);
      timers[uiKey] = setTimeout(function () {
        try {
          const v = get().ui[uiKey], o = {};
          persist.forEach((k) => { o[k] = v[k]; });
          window.localStorage.setItem(storeKey, JSON.stringify(o));
        } catch (e) {}
      }, 350);
    };
    const set = function (patch, silent) {
      ctl.dispatch({ type: 'UI', patch: { [uiKey]: Object.assign({}, get().ui[uiKey], patch) } });
      if (!silent) save();
    };
    const load = function (clean) {
      try {
        const o = JSON.parse(window.localStorage.getItem(storeKey) || 'null');
        if (!o || typeof o !== 'object') return;
        const p = clean(o);
        if (p) ctl.dispatch({ type: 'UI', patch: { [uiKey]: Object.assign({}, get().ui[uiKey], p) } });
      } catch (e) {}
    };
    return { set: set, load: load, save: save };
  };
})();
