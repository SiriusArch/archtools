/* ==========================================================================
   79-ctl-plan.js — Vaziyet Planı yan etkileri: görünüm, canlı düzenleme, içe alma, dışa aktarma (PNG · PDF · DXF)
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const plan = App.plan;
  const get = () => App.store.get();
  const cur = () => get().project.plan;

  /* ---------------- arayüz durumu ---------------- */
  const BV = ctl.makeView('plan', 'archtools.view.vaziyet', ['tab']);
  ctl.planView = BV.set;
  ctl.loadPlanView = function () {
    BV.load(function (o) { return ['cizim', 'sayfa', 'liste'].indexOf(o.tab) >= 0 ? { tab: o.tab } : null; });
  };
  ctl.planTool = function (id) { ctl.planView({ tool: id, draft: null }, true); };

  /* ---------------- belge ---------------- */
  let liveOn = false;
  ctl.planLiveBegin = function () { if (!liveOn) { liveOn = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.planLiveEnd = function () { liveOn = false; };
  ctl.planSet = (patch) => ctl.dispatch({ type: 'PLAN_SET', patch: patch });
  ctl.planVp = (patch) => ctl.dispatch({ type: 'PLAN_VIEW', patch: patch });
  ctl.planScale = function (s) {
    const P = cur();
    if (s === P.scale) return;
    ctl.planVp({ scale: s });
  };

  /* ölçek seç: verilen genişlik/yükseklik pafta alanına sığan en büyük ölçek */
  plan.pickScale = function (w, hh) {
    const a = plan.area();
    for (let i = 0; i < plan.SCALES.length; i++) {
      const ppm = plan.pxPerM(plan.SCALES[i]);
      if (w * ppm <= a.w * 0.82 && hh * ppm <= a.h * 0.82) return plan.SCALES[i];
    }
    return plan.SCALES[plan.SCALES.length - 1];
  };
  ctl.planFit = function () {
    const P = cur();
    if (!P.els.length) return;
    const f = plan.fit(P.els);
    ctl.planVp({ cx: f.cx, cy: f.cy, scale: plan.pickScale(f.w || 10, f.h || 10) });
  };

  /* ---------------- öğeler ---------------- */
  ctl.planAdd = function (el) { ctl.dispatch({ type: 'PLAN_EL_ADD', el: el }); };
  ctl.planSetEl = (id, patch) => ctl.dispatch({ type: 'PLAN_EL_SET', id: id, patch: patch });
  ctl.planLive = function (id, patch) { ctl.planLiveBegin(); ctl.dispatch({ type: 'PLAN_EL_SET_LIVE', id: id, patch: patch }); };
  ctl.planDel = (id) => ctl.dispatch({ type: 'PLAN_EL_DEL', id: id });
  ctl.planMoveMany = function (moves, live) { if (live) ctl.planLiveBegin(); ctl.dispatch({ type: 'PLAN_EL_MOVE_MANY', moves: moves, live: !!live }); };
  ctl.planDelMany = function (ids) { ctl.dispatch({ type: 'PLAN_EL_DEL_MANY', ids: ids }); ctl.planView({ ms: [] }, true); ctl.toast(ids.length + ' öğe silindi. Geri al ile döndürebilirsiniz.', 'info'); };
  ctl.planDup = (id) => ctl.dispatch({ type: 'PLAN_EL_DUP', id: id });
  ctl.planOrder = (id, dir) => ctl.dispatch({ type: 'PLAN_EL_ORDER', id: id, dir: dir });

  ctl.planRoadTrees = function (id) {
    const el = cur().els.find((e) => e.id === id);
    if (!el || el.t !== 'road') return;
    const trees = plan.alongRoad(el, 9, 2.6);
    if (!trees.length) { ctl.toast('Yol çok kısa; ağaç eklenemedi.', 'error'); return; }
    ctl.dispatch({ type: 'PLAN_EL_ADD_MANY', els: trees });
    ctl.toast(trees.length + ' ağaç yolun iki yanına dikildi.', 'success');
  };
  ctl.planScatter = function (id) {
    const P = cur();
    const el = P.els.find((e) => e.id === id);
    if (!el || !el.pts || el.t === 'road') return;
    const n = U.clamp(Math.round(plan.geo.area(el.pts) / 160), 4, 80);
    const avoid = P.els.filter((e) => e.t === 'bld').map((e) => e.pts);
    const trees = plan.scatterIn(el.pts, n, null, 2.4, 4.4, avoid);
    if (!trees.length) { ctl.toast('Bu alana ağaç sığmadı.', 'error'); return; }
    ctl.dispatch({ type: 'PLAN_EL_ADD_MANY', els: trees });
    ctl.toast(trees.length + ' ağaç serpildi.', 'success');
  };

  /* ---------------- içe alma ---------------- */
  function load(els, o) {
    const f = plan.fit(els);
    const scale = plan.pickScale(f.w || 10, f.h || 10);
    ctl.dispatch({ type: 'PLAN_LOAD', els: els, scale: o && o.scale ? o.scale : scale });
    ctl.planView({ tool: 'select', draft: null, tab: 'cizim' }, true);
  }
  ctl.planSample = function () {
    const els = plan.sample(Math.floor(Math.random() * 1e6) + 1);
    ctl.dispatch({ type: 'PLAN_LOAD', els: els, scale: 1000 });
    ctl.planView({ tool: 'select', draft: null }, true);
    ctl.toast('Örnek vaziyet yüklendi. Öğeleri sürükleyin, köşeleri çekin, kendi çiziminizi ekleyin.', 'success');
  };
  ctl.planFromStudy = function () {
    const els = plan.fromStudy(get().project);
    if (!els) { ctl.toast('Önce Mekân Etüdü’nde mekân ekleyin.', 'error'); return; }
    load(els, { scale: 500 });
    ctl.toast('Mekân Etüdü’ndeki düzen vaziyete aktarıldı (mekânlar tek yapı kütlesi olarak).', 'success');
  };
  ctl.planFromImar = function () {
    const els = plan.fromImar(get().project);
    if (!els) { ctl.toast('Önce Arsa / İmar modülünde bir parsel çizin.', 'error'); return; }
    load(els);
    ctl.toast('İmar parseli aktarıldı' + (els.length > 1 ? ' (' + (els.length - 1) + ' kütle parçasıyla).' : '.'), 'success');
  };
  ctl.planClear = function () { ctl.dispatch({ type: 'PLAN_CLEAR' }); ctl.toast('Vaziyet temizlendi. Geri al ile döndürebilirsiniz.', 'info'); };

  /* ---------------- dışa aktarma ---------------- */
  ctl.exporters.vaziyet = function (kind) {
    const label = kind === 'png' ? 'PNG' : 'PDF';
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    const P = get().project;
    const sc = plan.scene(P.plan, { live: false });
    App.basemap.preload(sc.prims).then((failed) => {
      if (failed) ctl.toast('Harita karoları bu sağlayıcıdan çıktıya eklenemedi; çıktıda harita boş görünebilir. Başka bir sağlayıcı deneyin.', 'error');
      return App.sheet.exportScene(sc.prims, App.sheet.W, App.sheet.H, P.meta.name + '-vaziyet-1-' + P.plan.scale, kind);
    }).then((r) => ctl.report(r, label + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };

  /* DXF: gerçek koordinat (m), y yukarı; her tür ayrı katman */
  const LAYERS = {
    SINIR: { color: 1, label: 'Proje sınırı' }, YAPI_YENI: { color: 7, label: 'Yeni yapılar' }, YAPI_MEVCUT: { color: 8, label: 'Mevcut yapılar' },
    YOL: { color: 9, label: 'Taşıt yolu (eksen)' }, YAYA: { color: 30, label: 'Yaya yolu (eksen)' }, YESIL: { color: 3, label: 'Yeşil alan' },
    SU: { color: 5, label: 'Su' }, MEYDAN: { color: 40, label: 'Meydan' }, OTOPARK: { color: 8, label: 'Otopark' }, AGAC: { color: 3, label: 'Ağaçlar' }, YAZI: { color: 7, label: 'Yazılar' },
  };
  function dxfDoc(P) {
    const p = P.plan;
    const doc = { title: P.meta.name, units: 'm', layers: LAYERS, entities: [] };
    const fy = (q) => [q[0], -q[1]];
    p.els.forEach((e) => {
      if (e.t === 'tree') { doc.entities.push({ layer: 'AGAC', kind: 'circle', at: fy([e.x, e.y]), r: e.r }); return; }
      if (e.t === 'text') { doc.entities.push({ layer: 'YAZI', kind: 'text', at: fy([e.x, e.y]), text: e.s, h: Math.max(1, e.size * p.scale / 3333 * 0.9), align: 'center' }); return; }
      const layer = e.t === 'bound' ? 'SINIR' : e.t === 'bld' ? (e.k === 'mevcut' ? 'YAPI_MEVCUT' : 'YAPI_YENI') : e.t === 'road' ? (e.k === 'yaya' ? 'YAYA' : 'YOL') : e.t === 'green' ? 'YESIL' : e.t === 'water' ? 'SU' : e.t === 'plaza' ? 'MEYDAN' : 'OTOPARK';
      doc.entities.push({ layer: layer, kind: 'poly', closed: e.t !== 'road', pts: e.pts.map(fy) });
      if (e.t === 'bld' && e.k === 'yeni') {
        const c = plan.geo.centroid(e.pts);
        doc.entities.push({ layer: 'YAZI', kind: 'text', at: fy(c), text: e.floors + ' kat', h: 1.2, align: 'center' });
      }
    });
    return doc;
  }
  ctl.planDxf = function () {
    ctl.runExport('DXF', (P) => {
      if (!App.dxf) return Promise.reject(new Error('DXF yazıcısı yüklenemedi.'));
      return ctl.saveText(U.slug(P.meta.name) + '-vaziyet.dxf', App.dxf.build(dxfDoc(P)), 'application/dxf');
    });
  };

  /* asistan kartı eylemleri */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'select' && get().ui.module === 'vaziyet') { ctl.dispatch({ type: 'SELECT', id: a.id }); ctl.planView({ tab: 'cizim' }, true); return; }
    baseRun(a);
  };
})();
