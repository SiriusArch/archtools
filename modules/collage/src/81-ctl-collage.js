/* ==========================================================================
   81-ctl-collage.js — Kolaj yan etkileri: görünüm, canlı düzenleme, dosya ekleme, dışa aktarma (PNG · PDF)
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const C = App.collage;
  const get = () => App.store.get();
  const doc = () => get().project.collage;

  /* ---------------- arayüz durumu ---------------- */
  const BV = ctl.makeView('col', 'archtools.view.kolaj', ['tab']);
  ctl.colView = BV.set;
  ctl.loadColView = function () { BV.load(function (o) { return ['ekle', 'katman', 'sayfa'].indexOf(o.tab) >= 0 ? { tab: o.tab } : null; }); };
  ctl.colTool = function (v) { ctl.colView({ tool: v, draft: null }, true); };

  /* görseller IndexedDB'den gelince ya da çözülünce yeniden çiz */
  C.onChange = function () { if (get().ui.module === 'kolaj') ctl.dispatch({ type: 'UI', patch: { col: Object.assign({}, get().ui.col, { stick: (get().ui.col.stick || 0) + 1 }) } }); };
  ctl.loadColImages = function () { C.loadStore(); };

  /* ---------------- belge ve katmanlar ---------------- */
  let liveOn = false;
  ctl.colLiveBegin = function () { if (!liveOn) { liveOn = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.colLiveEnd = function () { liveOn = false; };
  ctl.colSet = (patch) => ctl.dispatch({ type: 'COL_SET', patch: patch });
  ctl.colSetL = (id, patch) => ctl.dispatch({ type: 'COL_SET_L', id: id, patch: patch });
  ctl.colLive = function (id, patch) { ctl.colLiveBegin(); ctl.dispatch({ type: 'COL_LIVE', id: id, patch: patch }); };
  /* kırpma: kutu, kaynak görselin ölçeğini koruyarak kırpılan bölgeye uyar (zoom 1 iken); yoksa görsel kutuyu doldurur */
  let cropStart = null;
  ctl.colCrop = function (id, crop, commit) {
    const l = doc().layers.find((q) => q.id === id);
    if (!l) return;
    const im = C.imgs[l.src];
    if (!cropStart || cropStart.id !== id) cropStart = { id: id, crop: l.crop, x: l.x, y: l.y, w: l.w, h: l.h, zoom: l.zoom };
    const c0 = cropStart;
    const nc = C.cleanCrop(crop);
    let patch = { crop: nc };
    if (im && c0.zoom <= 1.001) {
      const r0 = C.cropRegion(im, c0.crop), r1 = C.cropRegion(im, nc);
      const s0 = Math.max(c0.w / r0.w, c0.h / r0.h);
      const w = Math.max(24, Math.round(r1.w * s0)), h = Math.max(24, Math.round(r1.h * s0));
      patch = Object.assign(patch, { x: Math.round(c0.x + c0.w / 2 - w / 2), y: Math.round(c0.y + c0.h / 2 - h / 2), w: w, h: h, zoom: 1, ox: 0.5, oy: 0.5 });
    }
    ctl.colLive(id, patch);
    if (commit) { cropStart = null; ctl.colLiveEnd(); }
  };
  ctl.colCropReset = function (id) { cropStart = null; ctl.colCrop(id, { l: 0, t: 0, r: 0, b: 0 }, true); };
  ctl.colDel = (id) => ctl.dispatch({ type: 'COL_DEL', id: id });
  ctl.colMoveMany = function (moves, live) { if (live) ctl.colLiveBegin(); ctl.dispatch({ type: 'COL_MOVE_MANY', moves: moves, live: !!live }); };
  ctl.colDelMany = function (ids) { ctl.dispatch({ type: 'COL_DEL_MANY', ids: ids }); ctl.colView({ ms: [] }, true); ctl.toast(ids.length + ' katman silindi. Geri al ile döndürebilirsiniz.', 'info'); };
  ctl.colDup = (id) => ctl.dispatch({ type: 'COL_DUP', id: id });
  ctl.colOrder = (id, o) => ctl.dispatch({ type: 'COL_ORDER', id: id, dir: o && o.dir, to: o && o.to });
  ctl.colAccentAll = function () { ctl.dispatch({ type: 'COL_ACCENT_ALL', col: doc().accent }); ctl.toast('Tüm şekiller vurgu rengine çevrildi.', 'success'); };
  ctl.colClear = function () { ctl.dispatch({ type: 'COL_CLEAR' }); ctl.toast('Kolaj temizlendi. Geri al ile döndürebilirsiniz.', 'info'); };
  ctl.colSample = function () { ctl.dispatch({ type: 'COL_LOAD', doc: C.sample() }); ctl.colView({ tool: 'select', draft: null }, true); ctl.toast('Örnek kolaj yüklendi. Her şeyi sürükleyip değiştirebilirsiniz.', 'success'); };

  const add = (layer) => ctl.dispatch({ type: 'COL_ADD', layer: layer });
  const cv = () => C.sizeOf(doc());
  const jit = (n) => ((n * 53) % 140) - 70;

  ctl.colAddPhoto = function (imgId) {
    const im = C.imgs[imgId];
    if (!im) return;
    const s = cv();
    const hasPhoto = doc().layers.some((l) => l.t === 'photo');
    let x = 0, y = 0, w = s.w, h = s.h;
    if (hasPhoto) {
      w = Math.round(s.w * 0.5); h = Math.round(w * (im.h / im.w));
      if (h > s.h * 0.8) { h = Math.round(s.h * 0.8); w = Math.round(h * (im.w / im.h)); }
      x = Math.round((s.w - w) / 2 + jit(doc().layers.length)); y = Math.round((s.h - h) / 2 + jit(doc().layers.length + 3));
    }
    add(C.make.photo(imgId, x, y, w, h));
  };
  ctl.colPick = function () { const el = document.getElementById('col-file'); if (el) el.click(); };
  ctl.colFiles = function (files) {
    ctl.colView({ tab: 'ekle' }, true);
    let n = 0;
    files.reduce((p, f) => p.then(() => C.readFile(f).then((r) => { const im = C.addImg(r); ctl.colAddPhoto(im.id); n++; }).catch((e) => ctl.toast(e && e.message ? e.message : 'Görüntü eklenemedi.', 'error'))), Promise.resolve())
      .then(() => { if (n) ctl.toast(n + ' fotoğraf eklendi (siyah-beyaz). Kontrastı panelden ayarlayın.', 'success'); });
  };
  ctl.colDemo = function (kind) { const im = C.addImg(C.demoPhoto(kind, Math.floor(Math.random() * 1e5) + 1)); ctl.colAddPhoto(im.id); };
  ctl.colDelImg = function (id) {
    if (doc().layers.some((l) => l.t === 'photo' && l.src === id)) { ctl.toast('Bu görsel kolajda kullanılıyor; önce katmanını silin.', 'error'); return; }
    C.delImg(id);
  };

  ctl.colAddShape = function (kind) {
    const s = cv();
    const n = doc().layers.length;
    const w = Math.round(kind === 'rect' ? s.w * 0.3 : s.w * 0.24), h = Math.round(kind === 'rect' ? s.h * 0.55 : kind === 'arch' ? s.h * 0.5 : s.w * 0.24);
    add(C.make.shape(kind, Math.round((s.w - w) / 2 + jit(n)), Math.round((s.h - h) / 2 + jit(n + 5)), w, h, doc().accent, { op: 0.92, blend: 'normal' }));
  };
  ctl.colAddPoly = function (pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    const w = Math.max(10, x1 - x0), h = Math.max(10, y1 - y0);
    add(C.make.shape('poly', x0, y0, w, h, doc().accent, { np: pts.map((p) => [(p[0] - x0) / w, (p[1] - y0) / h]), op: 0.92, blend: 'normal' }));
  };
  ctl.colAddFig = function (kind) {
    const s = cv();
    const n = doc().layers.length;
    const f = C.FIGS[kind];
    const w = { p1: 64, p2: 70, p3: 64, p4: 52, p5: 76, grp: 200, t1: 170, t2: 120, t3: 100, bush: 170, bird: 90, flock: 190, sun: 150, sky: Math.round(s.w * 0.6) }[kind] || 90;
    const h = w * (f.vh / f.vw);
    const ground = kind.charAt(0) === 'p' || kind === 'grp' || kind.charAt(0) === 't' || kind === 'bush';
    const x = Math.round(s.w * 0.2 + ((n * 197) % Math.round(s.w * 0.6)));
    const y = ground ? Math.round(s.h * 0.88 - h) : kind === 'sky' ? Math.round(s.h * 0.9 - h) : Math.round(s.h * 0.15 + ((n * 83) % Math.round(s.h * 0.3)));
    add(C.make.fig(kind, x, y, w));
  };
  ctl.colAddLine = function (kind, pts) {
    const l = C.make.line(kind, pts, { col: doc().bg === 'ink' ? '#FFFFFF' : '#17181B', w: kind === 'free' ? 4 : 3 });
    add(l);
  };
  ctl.colAddText = function (x, y) {
    const l = C.make.text('Etiket', x, y, { size: 24, bg: 'white', col: '#17181B' });
    add(l);
    ctl.colTool('select');
    ctl.colView({ tab: 'ekle' }, true);
    setTimeout(() => { const i = document.getElementById('col-text'); if (i) { i.focus(); i.select(); } }, 100);
  };
  ctl.colAddTitle = function () {
    const s = cv();
    add(C.make.text('Başlık', Math.round(s.w * 0.06), Math.round(s.h * 0.08), { size: 72, fam: 'd', bg: 'none', col: doc().bg === 'ink' ? '#FFFFFF' : '#17181B', caps: true }));
  };

  /* ---------------- dışa aktarma ---------------- */
  ctl.exporters.kolaj = function (kind) {
    const label = kind === 'png' ? 'PNG' : 'PDF';
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    const P = get().project;
    const sc = C.scene(P.collage, { live: false });
    const nm = (P.collage.title || P.meta.name) + '-kolaj';
    C.preload(sc.prims).then(() => App.sheet.exportScene(sc.prims, sc.W, sc.H, nm, kind)).then((r) => ctl.report(r, label + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };

  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'select' && get().ui.module === 'kolaj') { ctl.dispatch({ type: 'SELECT', id: a.id }); ctl.colView({ tab: 'katman' }, true); return; }
    baseRun(a);
  };
})();
