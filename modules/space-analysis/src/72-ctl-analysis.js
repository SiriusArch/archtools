/* ==========================================================================
   72-ctl-analysis.js — Mekân Analizi yan etkileri: görünüm durumu, animasyonlar, dışa aktarma
   Görünüm (kip, patlatma, yön, eğim, anahtarlar) state.ui.an içinde durur ve tarayıcıda hatırlanır.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const get = () => App.store.get();
  const VIEW_KEY = 'archtools.analysis.view';
  const PERSIST = ['mode', 'explode', 'yaw', 'pitch', 'labels', 'arrows', 'guides', 'volume', 'layers'];
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- görünüm durumu ---------- */
  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        const an = get().ui.an, o = {};
        PERSIST.forEach((k) => { o[k] = an[k]; });
        window.localStorage.setItem(VIEW_KEY, JSON.stringify(o));
      } catch (e) {}
    }, 350);
  }
  ctl.an = function (patch, silent) {
    ctl.dispatch({ type: 'UI', patch: { an: Object.assign({}, get().ui.an, patch) } });
    if (!silent) saveSoon();
  };
  ctl.loadAnView = function () {
    try {
      const o = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null');
      if (!o || typeof o !== 'object') return;
      const def = App.analysisDefaults(), p = {};
      if (o.mode === 'floors' || o.mode === 'layers') p.mode = o.mode;
      if (typeof o.explode === 'number') p.explode = U.clamp(o.explode, 0, 1);
      if (typeof o.yaw === 'number') p.yaw = U.clamp(o.yaw, -85, 85);
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 12, 75);
      ['labels', 'arrows', 'guides', 'volume'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      const ids = App.analysis.LAYERS.map((l) => l.id);
      if (Array.isArray(o.layers)) { const ls = o.layers.filter((x) => ids.indexOf(x) >= 0); if (ls.length) p.layers = ls; }
      ctl.dispatch({ type: 'UI', patch: { an: Object.assign({}, def, p) } });
    } catch (e) {}
  };

  /* ---------- animasyon ---------- */
  let raf = 0;
  ctl.anCancel = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  // props: { anahtar: hedef } → süre boyunca yumuşak geçiş; done: bitince
  function tween(props, dur, done) {
    ctl.anCancel();
    const an0 = get().ui.an, from = {};
    Object.keys(props).forEach((k) => { from[k] = an0[k]; });
    if (reduced() || dur <= 0) { ctl.an(props, true); if (done) done(); return; }
    const t0 = performance.now();
    (function step(now) {
      const t = U.clamp((now - t0) / dur, 0, 1), e = App.iso.easeInOut(t);
      const p = {};
      Object.keys(props).forEach((k) => { p[k] = from[k] + (props[k] - from[k]) * e; });
      ctl.an(p, true);
      if (t < 1) raf = requestAnimationFrame(step); else { raf = 0; if (done) done(); }
    })(t0);
  }

  ctl.anExplode = function (to) { tween({ explode: to }, 950, saveSoon); };
  ctl.anToggleExplode = function () { ctl.anExplode(get().ui.an.explode > 0.5 ? 0 : 1); };
  ctl.anResetView = function () { const d = App.analysisDefaults(); tween({ yaw: d.yaw, pitch: d.pitch }, 450, saveSoon); };

  // kip değişimi: levhalar toplanır, yeni küme açılır
  ctl.anMode = function (mode) {
    const an = get().ui.an;
    if (an.mode === mode) return;
    const target = an.explode < 0.1 ? 1 : an.explode;
    if (reduced()) { ctl.an({ mode: mode, sel: null }); return; }
    tween({ explode: 0 }, 360, function () {
      ctl.an({ mode: mode, sel: null }, true);
      tween({ explode: target }, 620, saveSoon);
    });
  };

  ctl.anSelect = function (floorId) { const an = get().ui.an; ctl.an({ sel: an.sel === floorId ? null : floorId }, true); };
  ctl.anToggleLayer = function (id) {
    const an = get().ui.an;
    const on = an.layers.indexOf(id) >= 0;
    if (on && an.layers.length === 1) { ctl.toast('En az bir katman açık kalmalı.'); return; }
    const order = App.analysis.LAYERS.map((l) => l.id);
    ctl.an({ layers: order.filter((x) => (x === id ? !on : an.layers.indexOf(x) >= 0)) });
  };
  ctl.anOrbit = function (dx, dy, base) {
    ctl.an({ yaw: U.clamp(base.yaw + dx * 0.32, -85, 85), pitch: U.clamp(base.pitch + dy * 0.22, 12, 75) }, true);
  };

  /* ---------- dışa aktarma ---------- */
  ctl.exporters.analiz = function (kind) {
    ctl.runExport(kind === 'png' ? 'PNG' : 'PDF', (P) => {
      const sd = App.study.derive(P);
      const view = Object.assign({}, get().ui.an, { sel: null });
      const sc = App.analysis.scene(P, sd, view, false);
      return App.sheet.exportScene(sc.prims, sc.W, sc.H, P.meta.name + '-mekan-analizi', kind);
    });
  };

  /* bulgu kartından seçim: ilgili katı da öne çıkar */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'select' && get().ui.module === 'analiz') {
      const P = get().project;
      const f = P.study && P.study.floors.find((x) => x.id === P.study.assign[a.id]);
      if (f && get().ui.an.mode === 'floors') ctl.an({ sel: f.id }, true);
    }
    baseRun(a);
  };
})();
