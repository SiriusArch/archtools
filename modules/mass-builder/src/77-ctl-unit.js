/* ==========================================================================
   77-ctl-unit.js — Birim Oluşturucu yan etkileri: görünüm, canlı düzenleme, adımlar, dışa aktarma
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const unit = App.unit;
  const get = () => App.store.get();
  const cur = () => get().project.unit;

  /* ---------------- görünüm ---------------- */
  const BV = ctl.makeView('unit', 'archtools.view.birim', ['mode', 'yaw', 'pitch', 'zx', 'ghost', 'dims', 'grid', 'tool']);
  ctl.unitView = BV.set;
  ctl.loadUnitView = function () {
    BV.load(function (o) {
      const p = {};
      if (['plan', 'iso', 'surec'].indexOf(o.mode) >= 0) p.mode = o.mode;
      ['ghost', 'dims', 'grid'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      if (typeof o.yaw === 'number') p.yaw = U.clamp(o.yaw, -85, 85);
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 20, 70);
      if (typeof o.zx === 'number') p.zx = U.clamp(o.zx, 1, 3);
      return p;
    });
  };
  ctl.unitMode = (m) => ctl.unitView({ mode: m });

  /* ---------------- birim ve parsel ---------------- */
  let liveOn = false;
  ctl.unitLiveBegin = function () { if (!liveOn) { liveOn = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.unitLiveEnd = function () { liveOn = false; };
  ctl.unitSet = (patch) => ctl.dispatch({ type: 'UNIT_SET', patch: patch });
  ctl.unitSetLive = function (patch) { ctl.unitLiveBegin(); ctl.dispatch({ type: 'UNIT_SET_LIVE', patch: patch }); };

  /* ---------------- adımlar ---------------- */
  ctl.unitGo = (i) => ctl.dispatch({ type: 'UNIT_GO', i: i });
  ctl.unitStepAdd = function (blank) {
    const u = cur();
    if (u.steps.length >= 12) { ctl.toast('En çok 12 adım eklenebilir.', 'error'); return; }
    ctl.dispatch({ type: 'UNIT_STEP_ADD', blank: !!blank });
    ctl.toast(blank ? 'Boş adım eklendi.' : 'Adım, önceki adımın kopyası olarak eklendi — üzerinde değişiklik yapın.', 'success');
    setTimeout(() => { const el = document.getElementById('ustep-title'); if (el) { el.focus(); el.select(); } }, 80);
  };
  ctl.unitStepDel = function (i) {
    const u = cur();
    if (u.steps.length <= 1) { ctl.toast('Son adım silinemez.', 'error'); return; }
    ctl.dispatch({ type: 'UNIT_STEP_DEL', i: i });
    ctl.toast('Adım silindi. Geri al ile döndürebilirsiniz.', 'info');
  };
  ctl.unitStepMove = (i, dir) => ctl.dispatch({ type: 'UNIT_STEP_MOVE', i: i, dir: dir });
  ctl.unitStepSet = (patch) => ctl.dispatch({ type: 'UNIT_STEP_SET', patch: patch });
  ctl.unitPreset = function (kind) {
    ctl.dispatch({ type: 'UNIT_PRESET', kind: kind });
    ctl.toast(kind === 'bos' ? 'Boş akış hazırlandı.' : kind === 'kisa' ? '4 adımlı akış yüklendi.' : '6 adımlı “Yoğunluk + Boşluk” akışı yüklendi.', 'success');
    if (kind !== 'bos') ctl.unitView({ mode: 'surec' });
  };
  ctl.unitReset = function () { ctl.dispatch({ type: 'UNIT_RESET' }); ctl.toast('Birim sıfırlandı. Geri al ile döndürebilirsiniz.', 'info'); ctl.unitView({ mode: 'plan' }); };

  /* ---------------- öğeler ---------------- */
  ctl.unitAdd = function (kind, extra) {
    const u = cur();
    const step = u.steps[Math.min(u.cur, u.steps.length - 1)];
    const n = step.els.filter((e) => e.t === (kind === 'L' || kind === 'T' || kind === 'U' ? 'mass' : kind)).length;
    let el;
    if (kind === 'mass') el = unit.make.mass('rect', u.site, n);
    else if (kind === 'L' || kind === 'T' || kind === 'U') el = unit.make.mass(kind, u.site, n);
    else if (kind === 'void') el = unit.make.void(u.site, n);
    else if (kind === 'green') el = unit.make.green(u.site, n);
    else if (kind === 'tree') el = unit.make.tree(u.site, n);
    else if (kind === 'flow' || kind === 'through' || kind === 'entry') el = unit.make.arrow(kind, u.site, n);
    if (!el) return;
    if (extra) Object.assign(el, extra);
    ctl.dispatch({ type: 'UNIT_EL_ADD', el: el });
    ctl.unitView({ mode: 'plan' }, true);
  };
  ctl.unitSetEl = (id, patch) => ctl.dispatch({ type: 'UNIT_EL_SET', id: id, patch: patch });
  ctl.unitLive = function (id, patch) { ctl.unitLiveBegin(); ctl.dispatch({ type: 'UNIT_EL_SET_LIVE', id: id, patch: patch }); };
  ctl.unitDel = (id) => ctl.dispatch({ type: 'UNIT_EL_DEL', id: id });
  ctl.unitDup = (id) => ctl.dispatch({ type: 'UNIT_EL_DUP', id: id });
  ctl.unitSplit = (id, axis, ratio, gap) => ctl.dispatch({ type: 'UNIT_EL_SPLIT', id: id, axis: axis, ratio: ratio, gap: gap });
  ctl.unitRotate = function (id) {
    const u = cur();
    const e = u.steps[Math.min(u.cur, u.steps.length - 1)].els.find((x) => x.id === id);
    if (e && e.t === 'mass') ctl.unitSetEl(id, { rot: e.rot + 1 });
  };
  ctl.unitTreesAround = function () {
    const u = cur();
    const R = unit.rng(Math.floor(Math.random() * 1e6));
    const out = [];
    const step = u.steps[Math.min(u.cur, u.steps.length - 1)];
    const masses = step.els.filter((e) => e.t === 'mass');
    let guard = 0;
    while (out.length < 8 && guard++ < 300) {
      const x = Math.round(R() * u.site.w * 10) / 10, y = Math.round(R() * u.site.d * 10) / 10;
      if (masses.some((m) => x > m.x - 2 && x < m.x + m.w + 2 && y > m.y - 2 && y < m.y + m.d + 2)) continue;
      out.push({ id: 'u' + Math.random().toString(36).slice(2, 8), t: 'tree', x: x, y: y, r: Math.round((1.6 + R() * 1.6) * 10) / 10 });
    }
    ctl.dispatch({ type: 'UNIT_EL_ADD_MANY', els: out });
    ctl.toast(out.length + ' ağaç serpildi.', 'success');
  };

  /* ---------------- dışa aktarma ---------------- */
  function sceneOpts(kind) {
    const v = get().ui.unit;
    return { live: false, mode: v.mode, yaw: v.yaw, pitch: v.pitch, zx: v.zx, ghost: v.ghost, dims: v.dims, grid: v.grid, kind: kind };
  }
  ctl.exporters.birim = function (kind) {
    const label = kind === 'png' ? 'PNG' : 'PDF';
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    const P = get().project;
    const o = sceneOpts(kind);
    const sc = unit.scene(P.unit, o);
    const nm = P.meta.name + '-birim-' + (o.mode === 'surec' ? 'surec' : o.mode === 'iso' ? 'izometrik' : 'plan');
    App.sheet.exportScene(sc.prims, App.sheet.W, App.sheet.H, nm, kind).then((r) => ctl.report(r, label + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };

  /* bulgu kartı eylemleri */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'unitGo') { ctl.unitGo(a.i); return; }
    if (a.type === 'unitView') { ctl.unitView({ mode: a.mode }); return; }
    if (a.type === 'unitAdd') { ctl.unitAdd(a.kind); return; }
    if (a.type === 'unitStepAdd') { ctl.unitStepAdd(false); return; }
    if (a.type === 'select' && get().ui.module === 'birim') {
      ctl.dispatch({ type: 'SELECT', id: a.id });
      ctl.unitView({ mode: 'plan' }, true);
      return;
    }
    baseRun(a);
  };
})();
