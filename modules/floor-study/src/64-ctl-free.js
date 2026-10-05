/* ==========================================================================
   64-ctl-free.js — Mekân Etüdü serbest düzen yan etkileri: canlı düzenleme, ekleme, dışa aktarma, eylem köprüsü
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const st = App.study;
  const get = () => App.store.get();

  ctl.stMode = function (mode) {
    try { window.localStorage.setItem('archtools.study.mode', mode); } catch (e) {}
    ctl.dispatch({ type: 'UI', patch: { stMode: mode, stTab: 'mekanlar' } });
  };

  /* sürükleme / kaydırıcı: ilk harekette tek bir geri-al noktası, sonrası canlı */
  let live = false;
  ctl.freeLiveBegin = function () { if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.freeLive = function (id, patch) { ctl.freeLiveBegin(); ctl.dispatch({ type: 'FREE_SET_LIVE', id: id, patch: patch }); };
  ctl.freeLiveEnd = function () { live = false; };

  ctl.freeSet = (id, patch) => ctl.dispatch({ type: 'FREE_SET', id: id, patch: patch });
  ctl.freeSnap = (v) => ctl.dispatch({ type: 'FREE_OPTS', patch: { snap: v } });
  ctl.freeRotate = function (id) {
    const f = get().project.study.free.shapes[id];
    if (!f) return;
    ctl.freeSet(id, { rot: f.rot + 1 });
  };
  ctl.freeAuto = function () {
    if (!get().project.spaces.length) { ctl.toast('Önce mekân ekleyin.', 'error'); return; }
    ctl.dispatch({ type: 'FREE_AUTO' });
    const m = st.freeDerive(get().project).metrics;
    ctl.toast(m.score == null ? 'Mekânlar yeniden dizildi.' : 'Mekânlar yeniden dizildi · düzen skoru %' + m.score, 'success');
  };
  ctl.freeFit = (id) => ctl.dispatch({ type: 'FREE_FIT', id: id });
  ctl.freeFitAll = function () { ctl.dispatch({ type: 'FREE_FIT_ALL' }); ctl.toast('Mekânlar hedef alanlara oturtuldu.', 'success'); };
  ctl.freeAttach = function (id, to, away) {
    ctl.dispatch({ type: 'FREE_ATTACH', id: id, to: to, away: !!away });
    const fd = st.freeDerive(get().project);
    const a = fd.byId.get(id), b = fd.byId.get(to);
    if (a && b) ctl.toast('“' + a.name + '” ' + (away ? 'uzaklaştırıldı' : '“' + b.name + '” yanına alındı'), 'success');
  };
  ctl.freeAddSpace = function (name, area) {
    name = String(name || '').trim();
    if (!name) { ctl.toast('Mekâna bir ad verin.', 'error'); return; }
    ctl.dispatch({ type: 'ADD_SPACES', list: [{ name: name, area: isFinite(area) && area > 0 ? area : 12 }] });
    ctl.toast('“' + name + '” eklendi.', 'success');
  };
  ctl.freeAreaToSchema = function (id) {
    const it = st.freeDerive(get().project).byId.get(id);
    if (!it) return;
    ctl.dispatch({ type: 'UPDATE_SPACE', id: id, patch: { area: Math.round(it.area * 10) / 10 } });
    ctl.toast('“' + it.name + '” alanı işlev şemasına işlendi: ' + U.fmt(it.area, 1) + ' m²', 'success');
  };
  ctl.freeRemove = function (id) {
    const s = get().project.spaces.find((x) => x.id === id);
    if (!s) return;
    ctl.dispatch({ type: 'REMOVE_SPACE', id: id });
    ctl.toast('“' + s.name + '” silindi.', 'info');
  };

  /* dışa aktarma */
  const baseKat = ctl.exporters.kat;
  ctl.exporters.kat = function (kind) {
    if (st.modeOf(get()) === 'katlar') { baseKat(kind); return; }
    ctl.runExport(kind === 'png' ? 'PNG' : 'PDF', (P) => {
      const sc = st.freeScene(P, st.freeDerive(P), { live: false });
      return App.sheet.exportScene(sc.prims, App.sheet.W, App.sheet.H, P.meta.name + '-mekan-etudu', kind);
    });
  };

  const ZONE_ACI = { sosyal: 40, ozel: 5, servis: 4, calisma: 3, sirkulasyon: 8, teknik: 9, acik: 2 };
  function dxfDoc(P, fd) {
    const doc = { title: P.meta.name, units: 'm', layers: { YAZI: { color: 7, label: 'Yazılar' }, OLCU: { color: 8, label: 'Ölçüler' } }, entities: [] };
    Object.keys(ZONE_ACI).forEach((z) => { doc.layers['MEKAN_' + z.toUpperCase()] = { color: ZONE_ACI[z], label: (App.ZONES[z] || {}).label || z }; });
    const H = fd.bounds.y1;
    const fy = (y) => H - y; // DXF'te y yukarı
    fd.items.forEach((it) => {
      const layer = 'MEKAN_' + String(it.zone || 'sosyal').toUpperCase();
      if (!doc.layers[layer]) doc.layers[layer] = { color: 7 };
      doc.entities.push({ layer: layer, kind: 'poly', closed: true, pts: it.ring.map((q) => [q[0], fy(q[1])]) });
      const lr = st.freeLabelRect(it);
      const fs = Math.max(0.25, Math.min(0.5, Math.min(lr.w, lr.h) / 7));
      const cx = lr.x + lr.w / 2, cy = lr.y + lr.h / 2;
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [cx, fy(cy) + fs * 0.7], text: it.name, h: fs, align: 'center' });
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [cx, fy(cy) - fs * 0.7], text: U.fmt(it.area, 1) + ' m2', h: fs * 0.8, align: 'center' });
    });
    return doc;
  }
  ctl.freeDxf = function () {
    ctl.runExport('DXF', (P) => {
      if (!App.dxf) return Promise.reject(new Error('DXF yazıcısı yüklenemedi.'));
      return ctl.saveText(U.slug(P.meta.name) + '-mekan-etudu.dxf', App.dxf.build(dxfDoc(P, st.freeDerive(P))), 'application/dxf');
    });
  };

  /* asistan kartları: bitiştir, hedef alana oturt, göster */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'freeAttach') { ctl.freeAttach(a.id, a.to, a.away); return; }
    if (a.type === 'freeFit') { ctl.freeFit(a.id); return; }
    if (a.type === 'select' && get().ui.module === 'kat' && st.modeOf(get()) === 'mekanlar') {
      ctl.dispatch({ type: 'SELECT', id: a.id });
      ctl.dispatch({ type: 'UI', patch: { stTab: 'mekanlar' } });
      setTimeout(() => { const el = document.getElementById('mrow-' + a.id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 40);
      return;
    }
    baseRun(a);
  };
})();
