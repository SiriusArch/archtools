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
