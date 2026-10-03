/* ==========================================================================
   66-ctl-imar.js — İmar ve Kapasite yan etkileri: parsel çizimi / düzenleme, parametre kaydırıcıları,
   senaryolar, hazır değerler, dışa aktarma.
   Parsel koordinatları konum merkezine göre metredir (x doğu, y kuzey); proje JSON'una bu biçimle yazılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const Z = App.zoning;
  const site = App.site;
  const gis = App.gis;
  const GX = App.geoExport;
  const get = () => App.store.get();
  const S = () => App.ui.site;

  /* ---------------- görünüm ---------------- */
  const IV = ctl.makeView('imar', 'archtools.view.imar', ['mode', 'shadow', 'labels', 'handles', 'yaw', 'pitch', 'zx']);
  ctl.imarView = IV.set;
  ctl.loadImarView = function () {
    IV.load(function (o) {
      const p = {};
      if (o.mode === 'plan' || o.mode === 'iso') p.mode = o.mode;
      ['shadow', 'labels', 'handles'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      if (typeof o.yaw === 'number') p.yaw = U.clamp(o.yaw, -85, 85);
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 20, 70);
      if (typeof o.zx === 'number') p.zx = U.clamp(o.zx, 1, 3);
      return p;
    });
  };

  /* ---------------- parsel ---------------- */
  const fmt = U.fmt;
  function setParcel(pts, verb) {
    const raw = Z.cleanParcel(pts);
    if (!raw) { ctl.toast('Parsel geçersiz: alan en az 20 m² olmalı ve köşeler üst üste binmemeli.', 'error'); return false; }
    if (Z.selfIntersects(raw)) { ctl.toast('Parselin kenarları birbirini kesiyor. Köşeleri sırayla, çizgiler çaprazlanmadan işaretleyin.', 'error'); return false; }
    const im = get().project.site.imar;
    ctl.dispatch({ type: 'SITE_SET', patch: { parcel: raw, imar: Z.clampImar(Object.assign({}, im, { ek: {} })) } });
    ctl.imarView({ tool: null, draft: null, tab: 'parsel' }, true);
    ctl.toast('Parsel ' + verb + ' · ' + fmt(Math.abs(gis.area(raw)), 0) + ' m²', 'success');
    return true;
  }
  ctl.imarTool = function (tool) {
    ctl.imarView({ tool: tool, draft: null, mode: tool ? 'plan' : get().ui.imar.mode }, true);
    if (tool) ctl.imarView({ tab: 'parsel' }, true);
    setTimeout(function () { const el = document.getElementById('pafta-imar'); if (tool && el) el.focus({ preventScroll: true }); }, 30);
  };
  ctl.imarFinish = function () {
    const d = get().ui.imar.draft;
    if (!d || !d.pts || d.pts.length < 3) { ctl.toast('Çokgen için en az üç köşe işaretleyin.'); return; }
    setParcel(d.pts, 'oluşturuldu');
  };
  ctl.imarUndoPoint = function () {
    const d = get().ui.imar.draft;
    if (!d || !d.pts) return;
    ctl.imarView({ draft: d.pts.length > 1 ? { pts: d.pts.slice(0, -1), cur: d.cur } : null }, true);
  };
  ctl.imarRect = function (a, b) {
    const w = Math.abs(b[0] - a[0]), d = Math.abs(b[1] - a[1]);
    if (w < 3 || d < 3 || w * d < 20) { ctl.imarView({ draft: null }, true); ctl.toast('Dikdörtgen çok küçük: sürükleyerek daha büyük bir alan seçin.'); return; }
    setParcel(Z.rectParcel(w, d, 0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), 'oluşturuldu');
  };
  ctl.imarParcelRect = function (w, d, rot) {
    const p = get().project.site.parcel;
    const c = p ? gis.centroid(p) : [0, 0];
    setParcel(Z.rectParcel(w, d, rot, c[0], c[1]), p ? 'güncellendi' : 'oluşturuldu');
  };
  ctl.imarRectForm = function () {
    const f = get().ui.imar.rect || { w: 20, d: 30, rot: 0 };
    ctl.imarParcelRect(f.w, f.d, f.rot);
  };
  ctl.imarClear = function () {
    ctl.dispatch({ type: 'SITE_SET', patch: { parcel: null } });
    ctl.imarView({ draft: null }, true);
    ctl.toast('Parsel kaldırıldı. Geri al ile döndürebilirsiniz.');
  };
  ctl.imarEdge = function (i) {
    const im = get().project.site.imar;
    const order = [undefined, 'on', 'yan', 'arka'];
    const nxt = order[(order.indexOf(im.ek[i]) + 1) % order.length];
    ctl.dispatch({ type: 'IMAR_EDGE', i: i, kind: nxt || null });
  };

  /* köşe sürükleme: görünüm donar (parsel kayarken pafta yeniden ölçeklenmez), tek geri-al noktası */
  ctl.imarDragStart = function (geom) {
    ctl.dispatch({ type: 'SNAPSHOT' });
    ctl.imarView({ fixed: { c: geom.c.slice(), Rv: geom.Rv } }, true);
  };
  ctl.imarDragMove = function (i, pt) {
    const st = get(), p = st.project.site.parcel, fx = st.ui.imar.fixed;
    if (!p || !fx || !p[i]) return;
    let q = pt;
    const dx = q[0] - fx.c[0], dy = q[1] - fx.c[1], lim = fx.Rv * 0.97, dl = Math.hypot(dx, dy);
    if (dl > lim) q = [Math.round((fx.c[0] + (dx / dl) * lim) * 10) / 10, Math.round((fx.c[1] + (dy / dl) * lim) * 10) / 10];
    if (p[i][0] === q[0] && p[i][1] === q[1]) return;
    const np = p.map((x, k) => (k === i ? q : x));
    if (Z.selfIntersects(np)) return;
    const cl = Z.cleanParcel(np);
    if (!cl || cl.length !== np.length) return;
    ctl.dispatch({ type: 'SITE_SET_LIVE', patch: { parcel: np } });
  };
  ctl.imarDragEnd = function () { ctl.imarView({ fixed: null }, true); };

  /* ---------------- parametreler ---------------- */
  ctl.imarSet = (patch) => ctl.dispatch({ type: 'IMAR_SET', patch: patch });
  let live = false;
  ctl.imarLive = function (patch) {
    if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); }
    ctl.dispatch({ type: 'IMAR_SET_LIVE', patch: patch });
  };
  ctl.imarLiveEnd = function () { live = false; };

  ctl.imarUse = function (id) {
    const u = Z.use(id);
    ctl.imarSet({ use: u.id, floorH: u.floorH, eff: u.eff, unit: u.unit, cars: u.cars, per: u.per });
  };
  ctl.imarPreset = function (id) {
    const P = Z.PRESETS.find((x) => x.id === id);
    if (!P) return;
    const st = get(), im = st.project.site.imar;
    if (P.ctx) {
      const cx = S().imarCtx(st), A = cx.A, f = cx.R && cx.R.facts;
      if (!A || !A.built.count) { ctl.toast('Çevre ortalaması için konum verisi gerekli.', 'error'); return; }
      const hh = f && f.ctxH ? f.ctxH : A.built.avgLevels ? A.built.avgLevels * im.floorH : null;
      const patch = { taks: Math.round(U.clamp(A.built.coverage, 0.1, 0.9) * 20) / 20, kaks: Math.round(U.clamp(A.built.far, 0.2, 8) * 10) / 10 };
      if (hh) patch.hmax = Math.max(3, Math.round(hh * 2) / 2);
      ctl.dispatch({ type: 'IMAR_PRESET', patch: patch });
      ctl.toast('Çevre ortalaması uygulandı · TAKS ' + fmt(patch.taks, 2) + ' · KAKS ' + fmt(patch.kaks, 2) + (patch.hmax ? ' · ' + fmt(patch.hmax, 1) + ' m' : ''), 'success');
      return;
    }
    const patch = Object.assign({}, P.v);
    if (P.v.use !== im.use) { const u = Z.use(P.v.use); Object.assign(patch, { eff: u.eff, unit: u.unit, cars: u.cars, per: u.per }); }
    ctl.dispatch({ type: 'IMAR_PRESET', patch: patch });
    ctl.toast(P.label + ' değerleri uygulandı', 'success');
  };

  /* ---------------- senaryolar ---------------- */
  ctl.imarScnSave = function (name) {
    const st = get(), s = st.project.site, im = s.imar;
    const cx = S().imarCtx(st);
    if (!cx.R.ok) { ctl.toast('Önce geçerli bir parsel ve kütle gerekli.', 'error'); return; }
    if (im.scn.length >= 4) { ctl.toast('En çok dört senaryo saklanır; birini silin.', 'error'); return; }
    const p = { use: im.use, taks: im.taks, kaks: im.kaks, hmax: im.hmax, floorH: im.floorH, setback: im.setback, ek: im.ek, form: im.form, eff: im.eff, unit: im.unit, cars: im.cars, per: im.per, basement: im.basement };
    const nm = String(name || '').trim() || 'Senaryo ' + (im.scn.length + 1);
    ctl.dispatch({ type: 'IMAR_SCN_SAVE', name: nm, p: p, sum: Z.summary(cx.R, im) });
    ctl.toast('“' + nm + '” kaydedildi', 'success');
  };
  ctl.imarScnApply = function (id) { ctl.dispatch({ type: 'IMAR_SCN_APPLY', id: id }); ctl.toast('Senaryo uygulandı', 'success'); };
  ctl.imarScnDel = function (id) { ctl.dispatch({ type: 'IMAR_SCN_DEL', id: id }); };

  /* ---------------- dışa aktarma ---------------- */
  ctl.siteExporters.imar = function (kind) {
    const st = get(), P = st.project, s = P.site;
    if (!s.parcel) throw new Error('Önce bir parsel çizin.');
    const cx = S().imarCtx(st), R = cx.R, A = cx.A, e = cx.e;
    const view = Object.assign({}, st.ui.imar, { mode: st.ui.imar.mode === 'iso' ? 'iso' : 'plan', fixed: null, tool: null, draft: null, lod: false });
    const sc = App.imarScene.scene(P, A, R, view, false);
    return ctl.siteWrite(kind, {
      name: P.meta.name + '-imar-kapasite', prims: sc.prims, W: sc.W, H: sc.H,
      features: () => GX.collectImar(P, A, R), lat0: e ? e.data.lat0 : s.loc.lat, lon0: e ? e.data.lon0 : s.loc.lon,
      meta: { module: 'imar-kapasite', location: s.loc.name, note: 'İmar değerleri kullanıcı girdisidir.' },
      csv: () => GX.csvImar(P, R),
    });
  };
  ctl.exporters.imar = (kind) => ctl.siteExport('imar', kind === 'png' ? 'png' : 'pdf');

  /* ---------------- eylemler ve klavye ---------------- */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'imarTab') { ctl.imarView({ tab: a.tab }); return; }
    if (a.type === 'imarShadow') { ctl.imarView({ shadow: true, tab: 'parsel' }); return; }
    baseRun(a);
  };
  document.addEventListener('keydown', function (e) {
    const st = get();
    if (st.ui.module !== 'imar' || !st.ui.imar.tool) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') { e.preventDefault(); ctl.imarTool(null); }
    else if (st.ui.imar.tool === 'draw' && e.key === 'Enter') { e.preventDefault(); ctl.imarFinish(); }
    else if (st.ui.imar.tool === 'draw' && e.key === 'Backspace') { e.preventDefault(); ctl.imarUndoPoint(); }
  });
})();
