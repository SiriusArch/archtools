/* ==========================================================================
   62-ctl-floors.js — Kat Etüdü yan etkileri: canlı kaydırıcı, taşıma, dışa aktarma, eylem köprüsü
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const get = () => App.store.get();

  /* kaydırıcı sürükleme: ilk harekette tek bir geri-al noktası, sonrası canlı */
  let live = false;
  ctl.studyLive = function (patch) {
    if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); }
    ctl.dispatch({ type: 'STUDY_SET_LIVE', patch: patch });
  };
  ctl.studyLiveEnd = function () { live = false; };
  ctl.studySet = (patch) => ctl.dispatch({ type: 'STUDY_SET', patch: patch });
  ctl.studyFloors = (n) => ctl.dispatch({ type: 'STUDY_FLOORS', count: n });
  ctl.studyRename = (id, name) => ctl.dispatch({ type: 'STUDY_RENAME', id: id, name: name });
  ctl.studyMove = (id, dir) => ctl.dispatch({ type: 'STUDY_MOVE_BY', id: id, dir: dir });

  ctl.studyAuto = function () {
    if (!get().project.spaces.length) { ctl.toast('Önce İşlev Şeması’na mekân ekleyin.', 'error'); return; }
    ctl.dispatch({ type: 'STUDY_AUTO' });
    const m = App.study.derive(get().project).metrics;
    ctl.toast(m.score == null ? 'Mekânlar katlara dağıtıldı.' : 'Mekânlar katlara dağıtıldı · kat skoru %' + m.score, 'success');
  };

  ctl.studyAssign = function (id, floorId) {
    const P = get().project;
    const s = P.spaces.find((x) => x.id === id);
    const f = P.study.floors.find((x) => x.id === floorId);
    if (!s || !f || P.study.assign[id] === floorId) return;
    ctl.dispatch({ type: 'STUDY_ASSIGN', id: id, floorId: floorId });
    ctl.toast('“' + s.name + '” → ' + f.name, 'success');
  };

  /* dışa aktarma: aynı primitif sahne PNG / PDF olarak çizilir */
  ctl.exporters.kat = function (kind) {
    ctl.runExport(kind === 'png' ? 'PNG' : 'PDF', (P) => {
      const sd = App.study.derive(P);
      const sc = App.study.scene(P, sd, false);
      return App.sheet.exportScene(sc.prims, App.sheet.W, App.sheet.H, P.meta.name + '-kat-etudu', kind);
    });
  };

  /* DXF: her kat yan yana; mekân blokları işlev bölgesine göre katmanlara ayrılır (metre) */
  const ZONE_ACI = { sosyal: 40, ozel: 5, servis: 4, calisma: 3, sirkulasyon: 8, teknik: 9, acik: 2 };
  function dxfDoc(P, sd) {
    const plan = sd.plan;
    const doc = { title: P.meta.name, units: 'm', layers: { PLAK: { color: 7, label: 'Kat plağı sınırı' }, YAZI: { color: 7, label: 'Yazılar' }, CEKIRDEK: { color: 30, label: 'Çekirdek' } }, entities: [] };
    Object.keys(ZONE_ACI).forEach((z) => { doc.layers['MEKAN_' + z.toUpperCase()] = { color: ZONE_ACI[z], label: (App.ZONES[z] || {}).label || z }; });
    const gap = 8;
    const D = plan.Dp;
    plan.floors.forEach((f, i) => {
      const ox = i * (plan.Wp + gap);
      const rect = (x, y, w, h) => [[ox + x, D - y - h], [ox + x + w, D - y - h], [ox + x + w, D - y], [ox + x, D - y]];
      doc.entities.push({ layer: 'PLAK', kind: 'poly', closed: true, pts: rect(0, 0, plan.Wp, D) });
      f.blocks.forEach((b) => {
        const layer = b.kind === 'core' ? 'CEKIRDEK' : b.kind === 'void' ? 'MEKAN_ACIK' : 'MEKAN_' + String(b.zone || 'sosyal').toUpperCase();
        if (!doc.layers[layer]) doc.layers[layer] = { color: 7 };
        doc.entities.push({ layer: layer, kind: 'poly', closed: true, pts: rect(b.x, b.y, b.w, b.h) });
        const fs = Math.max(0.25, Math.min(0.5, Math.min(b.w, b.h) / 7));
        doc.entities.push({ layer: 'YAZI', kind: 'text', at: [ox + b.x + b.w / 2, D - b.y - b.h / 2 + fs * 0.7], text: b.name, h: fs, align: 'center' });
        doc.entities.push({ layer: 'YAZI', kind: 'text', at: [ox + b.x + b.w / 2, D - b.y - b.h / 2 - fs * 0.7], text: U.fmt(b.area, 1) + ' m2', h: fs * 0.8, align: 'center' });
      });
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [ox, D + 1.2], text: f.name + ' · ' + U.fmt(plan.Wp, 1) + ' x ' + U.fmt(D, 1) + ' m', h: 0.6 });
    });
    return doc;
  }
  ctl.studyDxf = function () {
    ctl.runExport('DXF', (P) => {
      if (!App.dxf) return Promise.reject(new Error('DXF yazıcısı yüklenemedi.'));
      const sd = App.study.derive(P);
      return ctl.saveText(U.slug(P.meta.name) + '-kat-etudu.dxf', App.dxf.build(dxfDoc(P, sd)), 'application/dxf');
    });
  };

  /* asistan kartlarının eylemleri: modüller arası köprü */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    const mod = get().ui.module;
    if (a.type === 'goto') { ctl.go(a.module); return; }
    if (a.type === 'studyMove') { ctl.studyAssign(a.id, a.floorId); return; }
    if (a.type === 'studyAuto') { ctl.studyAuto(); return; }
    if (a.type === 'select' && mod !== 'islev') {
      ctl.dispatch({ type: 'SELECT', id: a.id });
      if (mod === 'kat') {
        ctl.dispatch({ type: 'UI', patch: { stTab: 'katlar' } });
        setTimeout(() => { const el = document.getElementById('frow-' + a.id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 40);
      }
      return;
    }
    baseRun(a);
  };
})();
