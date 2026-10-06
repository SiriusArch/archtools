/* ==========================================================================
   83-ctl-tpl.js — Pafta Şablonu yan etkileri: görünüm, canlı düzenleme, panel ekleme, görsel yükleme, dışa aktarma (PNG · PDF)
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const T = App.tpl;
  const get = () => App.store.get();
  const doc = () => get().project.tpl;

  /* ---------------- arayüz durumu ---------------- */
  const BV = ctl.makeView('tpl', 'archtools.view.pafta', ['tab', 'guides', 'tplSize']);
  ctl.tplView = BV.set;
  ctl.loadTplView = function () {
    BV.load(function (o) {
      const p = {};
      if (['sablon', 'ekle', 'panel'].indexOf(o.tab) >= 0) p.tab = o.tab;
      if (typeof o.guides === 'boolean') p.guides = o.guides;
      if (o.tplSize === 'auto' || T.SIZES[o.tplSize]) p.tplSize = o.tplSize;
      return p;
    });
  };

  /* araç çıktıları ya da görseller hazır olunca yeniden çiz */
  T.onChange = function () { if (get().ui.module === 'pafta') ctl.dispatch({ type: 'UI', patch: { tpl: Object.assign({}, get().ui.tpl, { stick: (get().ui.tpl.stick || 0) + 1 }) } }); };
  if (App.collage) {
    const prev = App.collage.onChange;
    App.collage.onChange = function () { if (prev) prev(); if (get().ui.module === 'pafta') T.onChange(); };
  }

  /* ---------------- belge ve paneller ---------------- */
  let liveOn = false;
  ctl.tplLiveBegin = function () { if (!liveOn) { liveOn = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.tplLiveEnd = function () { liveOn = false; };
  ctl.tplSet = (patch, rescale) => ctl.dispatch({ type: 'TPL_SET', patch: patch, rescale: !!rescale });
  ctl.tplSetP = (id, patch) => ctl.dispatch({ type: 'TPL_SET_P', id: id, patch: patch });
  ctl.tplLive = function (id, patch) { ctl.tplLiveBegin(); ctl.dispatch({ type: 'TPL_LIVE', id: id, patch: patch }); };
  ctl.tplDel = (id) => ctl.dispatch({ type: 'TPL_DEL', id: id });
  ctl.tplDup = (id) => ctl.dispatch({ type: 'TPL_DUP', id: id });
  ctl.tplOrder = (id, o) => ctl.dispatch({ type: 'TPL_ORDER', id: id, dir: o && o.dir, to: o && o.to });
  ctl.tplAlign = (id, how) => ctl.dispatch({ type: 'TPL_ALIGN', id: id, how: how });
  ctl.tplClear = function () { ctl.dispatch({ type: 'TPL_CLEAR' }); ctl.toast('Paftadaki paneller silindi. Geri al ile döndürebilirsiniz.', 'info'); };

  ctl.tplApply = function (id) {
    const st = get();
    const t = T.templateById(id);
    if (!t) return;
    const sel = st.ui.tpl.tplSize;
    const d = T.fromTemplate(id, { size: sel && sel !== 'auto' ? sel : null, avail: T.availableIds(st), name: st.project.meta.name, title: doc().title, accent: doc().accent, bg: doc().bg });
    ctl.dispatch({ type: 'TPL_APPLY', doc: d });
    ctl.tplView({ tab: 'panel' }, true);
    const used = d.panels.filter((p) => p.t === 'view' && p.src.k === 'mod').length, empty = d.panels.filter((p) => p.t === 'view' && p.src.k === 'none').length;
    ctl.toast('“' + t.label + '” uygulandı' + (used ? ' · ' + used + ' görsel alanına araç çıktısı yerleşti' : '') + (empty ? (used ? '; ' : ' · ') + empty + ' alan boş — panele tıklayıp çıktı seçin' : '') + '.', 'success');
  };

  /* ---------------- panel ekleme ---------------- */
  const sz = () => T.sizeOf(doc());
  const fs = (k) => Math.max(9, Math.round(sz().w * k));
  const jit = (n) => ((n * 41) % 120) - 60;
  const add = (p) => ctl.dispatch({ type: 'TPL_ADD', panel: p });
  const center = (w, h) => { const s = sz(), n = doc().panels.length; return [Math.round((s.w - w) / 2 + jit(n)), Math.round((s.h - h) / 2 + jit(n + 3))]; };
  ctl.tplAddView = function (src) {
    const s = sz();
    const w = Math.round(s.w * 0.36), h = Math.round(w * 0.72);
    const c = center(w, h);
    add(T.make.view(c[0], c[1], w, h, src || { k: 'none', id: '' }, { bd: 3, label: src && src.k === 'mod' ? T.srcInfo(src.id).label : '' }));
    ctl.tplView({ tab: 'panel' }, true);
  };
  ctl.tplAddMod = function (id) { ctl.tplAddView({ k: 'mod', id: id }); };
  ctl.tplAddText = function (kind) {
    const s = sz();
    const big = kind === 'title';
    const w = Math.round(s.w * (big ? 0.5 : 0.22)), h = Math.round(s.h * (big ? 0.09 : 0.14));
    const c = center(w, h);
    add(T.make.text(big ? (doc().title || get().project.meta.name || 'Başlık') : 'Proje kısa açıklaması buraya yazılır. Yaklaşımı ve kararları iki üç cümleyle anlatın.', c[0], c[1], w, h, big ? { size: Math.round(s.h * 0.055), fam: 'd', weight: 800, caps: true, lh: 1, valign: 'm' } : { size: fs(0.0125) }));
    ctl.tplView({ tab: 'panel' }, true);
    setTimeout(() => { const i = document.getElementById('tpl-text'); if (i) { i.focus(); i.select(); } }, 100);
  };
  ctl.tplAddTitle = function () {
    const s = sz(), m = doc().margin;
    const w = Math.round(s.w * 0.46), h = Math.round(s.h * 0.1);
    add(T.make.title(s.w - m - w, s.h - m - h, w, h, { name: '', sub: doc().title || 'Mimari ön proje', rows: [['Pafta', doc().title || ''], ['Ölçek', ''], ['Tarih', U.today()], ['No', '01']] }));
    ctl.tplView({ tab: 'panel' }, true);
  };
  ctl.tplAddLegend = function () { const s = sz(); const w = Math.round(s.w * 0.14), h = Math.round(s.h * 0.12); const c = center(w, h); add(T.make.legend(c[0], c[1], w, h, null, { size: fs(0.0115) })); ctl.tplView({ tab: 'panel' }, true); };
  ctl.tplAddFacts = function () { const s = sz(); const w = Math.round(s.w * 0.16), h = Math.round(s.h * 0.15); const c = center(w, h); add(T.make.facts(c[0], c[1], w, h, null, { size: fs(0.0115) })); ctl.tplView({ tab: 'panel' }, true); };
  ctl.tplAddBlock = function () { const s = sz(); const w = Math.round(s.w * 0.2), h = Math.round(s.h * 0.2); const c = center(w, h); add(T.make.block(c[0], c[1], w, h, doc().accent, { s: '', size: fs(0.016) })); ctl.tplView({ tab: 'panel' }, true); };
  ctl.tplAddLine = function (dir) { const s = sz(); const L = Math.round((dir === 'v' ? s.h : s.w) * 0.3); const c = center(dir === 'v' ? 20 : L, dir === 'v' ? L : 20); add(T.make.line(c[0], c[1], dir === 'v' ? 20 : L, dir === 'v' ? L : 20, { dir: dir, lw: Math.max(2, Math.round(s.w / 600)) })); ctl.tplView({ tab: 'panel' }, true); };
  ctl.tplAddNorth = function () { const s = sz(); const w = Math.round(s.w * 0.05); const c = center(w, w); add(T.make.north(c[0], c[1], w, w)); ctl.tplView({ tab: 'panel' }, true); };

  /* ---------------- görseller (Kolaj ile ortak kitaplık) ---------------- */
  ctl.tplPick = function () { const el = document.getElementById('tpl-file'); if (el) el.click(); };
  ctl.tplUseImage = function (imgId) {
    const st = get();
    const sel = doc().panels.find((p) => p.id === st.selectedId);
    if (sel && sel.t === 'view') { ctl.tplSetP(sel.id, { src: { k: 'img', id: imgId }, label: sel.label }); return; }
    ctl.tplAddView({ k: 'img', id: imgId });
  };
  ctl.tplFiles = function (files) {
    const C = App.collage;
    if (!C) return;
    let n = 0, last = null;
    files.reduce((p, f) => p.then(() => C.readFile(f).then((r) => { const im = C.addImg(r); last = im; n++; }).catch((e) => ctl.toast(e && e.message ? e.message : 'Görüntü eklenemedi.', 'error'))), Promise.resolve())
      .then(() => { if (n) { ctl.toast(n + ' görsel eklendi.', 'success'); if (last && files.length === 1) ctl.tplUseImage(last.id); } });
  };
  ctl.tplDelImg = function (id) {
    if (doc().panels.some((p) => p.t === 'view' && p.src.k === 'img' && p.src.id === id)) { ctl.toast('Bu görsel paftada kullanılıyor; önce panelini silin ya da kaynağını değiştirin.', 'error'); return; }
    if (App.collage.imgs[id] && get().project.collage.layers.some((l) => l.t === 'photo' && l.src === id)) { ctl.toast('Bu görsel Kolaj aracında da kullanılıyor; oradan kaldırmadan silinemez.', 'error'); return; }
    App.collage.delImg(id);
  };

  /* ---------------- dışa aktarma ---------------- */
  const blob = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), type, q));
  ctl.exporters.pafta = function (kind) {
    const label = kind === 'png' ? 'PNG' : 'PDF';
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    const st = get(), P = st.project, d = P.tpl;
    const nm = (d.title || P.meta.name) + '-pafta';
    const refs = T.refsOf(d);
    T.ensure(st, refs).then(() => {
      const sc = T.scene(d, { st: st, live: false, hi: true });
      const pre = App.collage ? App.collage.preload(sc.prims) : Promise.resolve();
      return pre.then(() => {
        const big = Math.max(sc.W, sc.H);
        const f = kind === 'png' ? Math.min(2, 5600 / big) : Math.min(2.2, 4800 / big);
        return App.board.primsToCanvas(sc.prims, sc.W, sc.H, f);
      });
    }).then((cv) => {
      if (kind === 'png') return blob(cv, 'image/png').then((b) => App.files.saveBlob(U.slug(nm) + '.png', b));
      return blob(cv, 'image/jpeg', 0.93).then((b) => b.arrayBuffer()).then((buf) => App.files.buildPdf(new Uint8Array(buf), cv.width, cv.height, nm)).then((b) => App.files.saveBlob(U.slug(nm) + '.pdf', b));
    }).then((r) => ctl.report(r, label + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };
})();
