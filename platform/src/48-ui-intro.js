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
