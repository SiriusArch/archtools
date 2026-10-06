/* ==========================================================================
   64-ctl-free.js — Mekân Etüdü yan etkileri: görünüm, canlı düzenleme, ekleme, donatı, çevre, adımlar,
   vaziyet bağlantısı, dışa aktarma (PNG · PDF · DXF) ve eylem köprüsü
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const st = App.study;
  const get = () => App.store.get();
  const cur = () => get().project.study.free;

  /* ---------------- görünüm durumu ---------------- */
  App.etutDefaults = () => ({ view: 'plan', lv: 'all', furn: true, rel: true, grid: true, yaw: 35, pitch: 45, zx: 1, cam: { k: 1, dx: 0, dy: 0 }, ex: null, fu: null, stick: 0, ms: [], mq: null, tool: 'sel' });
  const EV = ctl.makeView('etut', 'archtools.view.etut', ['view', 'furn', 'rel', 'grid', 'yaw', 'pitch', 'zx']);
  ctl.etutView = EV.set;
  ctl.loadEtutView = function () {
    EV.load(function (o) {
      const p = {};
      if (['plan', 'iso', 'surec'].indexOf(o.view) >= 0) p.view = o.view;
      ['furn', 'rel', 'grid'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      if (typeof o.yaw === 'number') p.yaw = U.clamp(o.yaw, -85, 85);
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 20, 70);
      if (typeof o.zx === 'number') p.zx = U.clamp(o.zx, 1, 3);
      return p;
    });
  };
  ctl.freeView = (v) => ctl.etutView({ view: v });
  ctl.freeLv = (v) => ctl.etutView({ lv: v }, true);
  ctl.freeCam = function (patch) { ctl.etutView({ cam: Object.assign({}, get().ui.etut.cam, patch) }, true); };
  ctl.freeCamReset = () => ctl.etutView({ cam: { k: 1, dx: 0, dy: 0 } }, true);

  ctl.stMode = function (mode) {
    try { window.localStorage.setItem('archtools.study.mode', mode); } catch (e) {}
    ctl.dispatch({ type: 'UI', patch: { stMode: mode, stTab: 'mekanlar' } });
  };

  /* ---------------- seçim ---------------- */
  ctl.freeSelect = function (id) { ctl.dispatch({ type: 'SELECT', id: id }); const v = get().ui.etut; if (v.ex || v.fu || (v.ms && v.ms.length)) ctl.etutView({ ex: null, fu: null, ms: [] }, true); };
  ctl.freeSelEx = function (id) { ctl.dispatch({ type: 'SELECT', id: null }); ctl.etutView({ ex: id, fu: null, ms: [] }, true); };
  /* çoklu seçim: anahtarlar 's:<mekânId>' ve 'x:<öğeId>' */
  ctl.freeMulti = function (list) {
    list = (list || []).slice();
    if (list.length === 1) { const k = list[0]; if (k.charAt(0) === 'x') ctl.freeSelEx(k.slice(2)); else ctl.freeSelect(k.slice(2)); return; }
    ctl.dispatch({ type: 'SELECT', id: null });
    ctl.etutView({ ms: list, ex: null, fu: null }, true);
  };
  ctl.freeSelectAll = function (view) {
    const fd = st.freeDerive(get().project);
    const ids = fd.items.filter((it) => !(view && view.ghost && view.ghost(it))).map((it) => 's:' + it.id).concat(fd.extras.map((e) => 'x:' + e.id));
    ctl.freeMulti(ids);
  };
  ctl.freeMoveMany = function (spaces, extras, live) {
    if (live) ctl.freeLiveBegin();
    ctl.dispatch({ type: 'FREE_MOVE_MANY', spaces: spaces, extras: extras, live: !!live });
  };
  ctl.freeDelMany = function (list) {
    const ids = (list || []).filter((k) => k.charAt(0) === 'x').map((k) => k.slice(2));
    const nSp = (list || []).length - ids.length;
    ids.forEach((id) => ctl.dispatch({ type: 'FREE_EX_DEL', id: id }));
    ctl.etutView({ ms: [], ex: null }, true);
    ctl.toast(ids.length ? ids.length + ' öğe silindi' + (nSp ? '. Mekânlar silinmedi; işlev şemasından kalkacakları için tek tek silin.' : '.') : 'Mekânlar toplu silinmez; işlev şemasından kalkacakları için tek tek silin.', ids.length ? 'info' : 'error');
  };
  ctl.freeSelFurn = (fid) => ctl.etutView({ fu: fid }, true);

  /* sürükleme / kaydırıcı: ilk harekette tek bir geri-al noktası, sonrası canlı */
  let live = false;
  ctl.freeLiveBegin = function () { if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.freeLiveEnd = function () { live = false; };
  ctl.freeLive = function (id, patch) { ctl.freeLiveBegin(); ctl.dispatch({ type: 'FREE_SET_LIVE', id: id, patch: patch }); };
  ctl.freeExLive = function (id, patch) { ctl.freeLiveBegin(); ctl.dispatch({ type: 'FREE_EX_SET_LIVE', id: id, patch: patch }); };
  ctl.freeFurnLive = function (id, fid, patch) { ctl.freeLiveBegin(); ctl.dispatch({ type: 'FREE_FURN_SET_LIVE', id: id, fid: fid, patch: patch }); };
  ctl.freeSiteLive = function (patch) { ctl.freeLiveBegin(); ctl.dispatch({ type: 'FREE_SITE_LIVE', patch: patch }); };
  ctl.freeMapLive = function (patch) { ctl.freeLiveBegin(); ctl.dispatch({ type: 'FREE_MAP_LIVE', patch: patch }); };

  /* ---------------- mekân ---------------- */
  ctl.freeSet = (id, patch) => ctl.dispatch({ type: 'FREE_SET', id: id, patch: patch });
  ctl.freeSnap = (v) => ctl.dispatch({ type: 'FREE_OPTS', patch: { snap: v } });
  ctl.freeRotate = function (id) {
    const f = cur().shapes[id];
    if (!f) return;
    ctl.freeSet(id, { rot: f.rot + 1 });
  };
  ctl.freeShuffle = function (id) {
    const f = cur().shapes[id];
    if (f) ctl.freeSet(id, { seed: Math.floor(Math.random() * 99998) + 1 });
  };
  ctl.freeAuto = function () {
    if (!get().project.spaces.length) { ctl.toast('Önce mekân ekleyin.', 'error'); return; }
    ctl.dispatch({ type: 'FREE_AUTO' });
    if (cur().link) ctl.freeFitShell(true, true);
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
  ctl.freeSpread = function (n) {
    ctl.dispatch({ type: 'FREE_SPREAD', n: n });
    ctl.toast(n > 1 ? 'Mekânlar ' + n + ' kata dağıtıldı. Katları “Kat” alanından tek tek değiştirebilirsiniz.' : 'Tüm mekânlar zemin kata alındı.', 'success');
  };

  /* ---------------- donatı ---------------- */
  ctl.freeFurnAdd = function (id, k) { ctl.dispatch({ type: 'FREE_FURN_ADD', id: id, k: k }); };
  ctl.freeFurnSet = (id, fid, patch) => ctl.dispatch({ type: 'FREE_FURN_SET', id: id, fid: fid, patch: patch });
  ctl.freeFurnDel = function (id, fid) { ctl.dispatch({ type: 'FREE_FURN_DEL', id: id, fid: fid }); ctl.etutView({ fu: null }, true); };
  ctl.freeFurnRot = function (id, fid) {
    const it = st.freeDerive(get().project).byId.get(id);
    const f = it && it.furn.find((q) => q.id === fid);
    if (f) ctl.freeFurnSet(id, fid, { r: (f.r + 1) % 4 });
  };
  ctl.freeFurnAuto = function (id) {
    const P = get().project;
    ctl.dispatch({ type: 'FREE_FURN_AUTO', id: id || null });
    const n = id ? (st.freeDerive(get().project).byId.get(id) || { furn: [] }).furn.length : U.sum(st.freeDerive(get().project).items, (it) => it.furn.length);
    ctl.toast(n ? n + ' donatı yerleştirildi. Sürükleyerek yerini değiştirin.' : 'Bu mekân için önerilecek donatı bulunamadı (çok küçük ya da sirkülasyon).', n ? 'success' : 'info');
    void P;
  };
  ctl.freeFurnClear = (id) => ctl.dispatch({ type: 'FREE_FURN_CLEAR', id: id });

  /* ---------------- ek öğeler ---------------- */
  ctl.freeAddExtra = function (kind, k, extra) {
    const fd = st.freeDerive(get().project);
    const b = st.freeViewBounds(fd);
    const at = [b.x0 + b.w / 2, b.y0 + b.h / 2];
    const n = fd.extras.filter((e) => e.t === kind).length;
    const el = st.makeExtra(kind, at, n, k);
    if (!el) return;
    if (extra) Object.assign(el, extra);
    ctl.dispatch({ type: 'FREE_EX_ADD', el: el });
    const added = (cur().extras || []).slice(-1)[0];
    if (added) ctl.freeSelEx(added.id);
    ctl.etutView({ view: 'plan' }, true);
  };
  ctl.freeExSet = (id, patch) => ctl.dispatch({ type: 'FREE_EX_SET', id: id, patch: patch });
  ctl.freeExDel = function (id) { ctl.dispatch({ type: 'FREE_EX_DEL', id: id }); ctl.etutView({ ex: null }, true); };
  ctl.freeExDup = function (id) { ctl.dispatch({ type: 'FREE_EX_DUP', id: id }); const l = (cur().extras || []).slice(-1)[0]; if (l) ctl.freeSelEx(l.id); };
  ctl.freeTrees = function () {
    const fd = st.freeDerive(get().project);
    const R = App.massing.rng(Math.floor(Math.random() * 1e6));
    const ring = fd.siteRing;
    const b = ring ? ring.reduce((q, p) => ({ x0: Math.min(q.x0, p[0]), y0: Math.min(q.y0, p[1]), x1: Math.max(q.x1, p[0]), y1: Math.max(q.y1, p[1]) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) : (() => { const v = st.freeViewBounds(fd); return { x0: v.x0 - 3, y0: v.y0 - 3, x1: v.x1 + 3, y1: v.y1 + 3 }; })();
    const out = [];
    let guard = 0;
    while (out.length < 8 && guard++ < 400) {
      const x = Math.round((b.x0 + R() * (b.x1 - b.x0)) * 10) / 10, y = Math.round((b.y0 + R() * (b.y1 - b.y0)) * 10) / 10;
      if (ring && !st.inPoly(x, y, ring)) continue;
      if (fd.items.some((it) => x > it.x - 2 && x < it.x + it.w + 2 && y > it.y - 2 && y < it.y + it.h + 2)) continue;
      out.push({ t: 'tree', x: x, y: y, r: Math.round((1.6 + R() * 1.6) * 10) / 10 });
    }
    if (!out.length) { ctl.toast('Ağaç için boş yer bulunamadı.', 'error'); return; }
    ctl.dispatch({ type: 'FREE_EX_MANY', els: out });
    ctl.toast(out.length + ' ağaç serpildi.', 'success');
  };

  /* ---------------- çevre: parsel, çevre dokusu, harita ---------------- */
  ctl.freeSite = (patch) => ctl.dispatch({ type: 'FREE_SITE', patch: patch });
  ctl.freeSiteAuto = function () {
    const fd = st.freeDerive(get().project);
    const b = fd.bounds;
    ctl.freeSite({ on: true, x: Math.floor(b.x0 - 4), y: Math.floor(b.y0 - 4), w: Math.ceil(b.w + 8), d: Math.ceil(b.h + 8), pts: null });
  };
  ctl.freeCtx = (patch) => ctl.dispatch({ type: 'FREE_CTX', patch: patch });
  ctl.freeMap = (patch, liveOn) => (liveOn ? ctl.freeMapLive(patch) : ctl.dispatch({ type: 'FREE_MAP', patch: patch }));
  ctl.freeOrg = (org) => ctl.dispatch({ type: 'FREE_ORG', org: org });

  /* ---------------- adımlar ---------------- */
  ctl.freeStepAdd = function () {
    const n = (cur().steps || []).length;
    if (n >= 12) { ctl.toast('En çok 12 adım eklenebilir.', 'error'); return; }
    ctl.dispatch({ type: 'FREE_STEP_ADD', title: 'Adım ' + (n + 1) });
    ctl.toast('Mevcut düzen adım olarak kaydedildi. Düzeni değiştirip yeni adım ekleyin; “Süreç” görünümü adımları yan yana gösterir.', 'success');
  };
  ctl.freeStepSet = (i, patch) => ctl.dispatch({ type: 'FREE_STEP_SET', i: i, patch: patch });
  ctl.freeStepUpd = function (i) { ctl.dispatch({ type: 'FREE_STEP_UPD', i: i }); ctl.toast('Adım, güncel düzenle değiştirildi.', 'success'); };
  ctl.freeStepLoad = function (i) { ctl.dispatch({ type: 'FREE_STEP_LOAD', i: i }); ctl.toast('Adım düzene yüklendi. Geri al ile önceki düzene dönebilirsiniz.', 'info'); };
  ctl.freeStepDel = function (i) { ctl.dispatch({ type: 'FREE_STEP_DEL', i: i }); ctl.toast('Adım silindi. Geri al ile döndürebilirsiniz.', 'info'); };
  ctl.freeStepMove = (i, dir) => ctl.dispatch({ type: 'FREE_STEP_MOVE', i: i, dir: dir });

  /* ---------------- vaziyet bağlantısı ---------------- */
  const bboxOf = (pts) => pts.reduce((q, p) => ({ x0: Math.min(q.x0, p[0]), y0: Math.min(q.y0, p[1]), x1: Math.max(q.x1, p[0]), y1: Math.max(q.y1, p[1]) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  ctl.freeLinkEl = function (elId, o) {
    const P = get().project;
    const el = P.plan && P.plan.els.find((e) => e.id === elId && e.t === 'bld');
    if (!el) { ctl.toast('Vaziyet planında bu yapı bulunamadı.', 'error'); return false; }
    const b = bboxOf(el.pts);
    const org = [Math.round(b.x0 * 10) / 10, Math.round(b.y0 * 10) / 10];
    const shell = el.pts.map((q) => [q[0] - org[0], q[1] - org[1]]);
    ctl.dispatch({ type: 'FREE_LINK', org: org, link: { elId: el.id, name: el.name || 'Yapı', floors: el.floors || 1, shell: shell } });
    // vaziyetteki harita ve proje sınırı birlikte gelir
    const pm = P.plan.map;
    if (pm && pm.on) ctl.dispatch({ type: 'FREE_MAP', patch: Object.assign({}, pm) });
    const bound = P.plan.els.find((e) => e.t === 'bound');
    if (bound) {
      const bb = bboxOf(bound.pts);
      ctl.dispatch({ type: 'FREE_SITE', patch: { on: true, x: bb.x0 - org[0], y: bb.y0 - org[1], w: bb.x1 - bb.x0, d: bb.y1 - bb.y0, pts: bound.pts.map((q) => [q[0] - org[0], q[1] - org[1]]) } });
    }
    ctl.freeFitShell(true, true);
    if (!(o && o.stay)) { ctl.go('kat'); ctl.dispatch({ type: 'UI', patch: { stMode: 'mekanlar', stTab: 'cevre' } }); }
    ctl.etutView({ view: 'plan' }, true);
    ctl.toast('“' + (el.name || 'Yapı') + '” kabuğu Mekân Etüdü’ne bağlandı. Çevre (yollar, komşu yapılar, harita) çizimde görünür; mekânlar kabuk içinde düzenlenir.', 'success');
    return true;
  };
  ctl.freeUnlink = function () { ctl.dispatch({ type: 'FREE_UNLINK' }); ctl.toast('Vaziyet bağlantısı kaldırıldı.', 'info'); };
  ctl.freeFitShell = function (quiet, noGrow) {
    const fd = st.freeDerive(get().project);
    if (!fd.shell || !fd.items.length) { if (!quiet) ctl.toast('Önce vaziyet planından bir yapı bağlayın.', 'error'); return; }
    const sb = bboxOf(fd.shell), lb = fd.bounds;
    const scx = (sb.x0 + sb.x1) / 2, scy = (sb.y0 + sb.y1) / 2, lcx = lb.x0 + lb.w / 2, lcy = lb.y0 + lb.h / 2;
    let k = Math.min(noGrow ? 1 : 1.6, ((sb.x1 - sb.x0) * 0.92) / Math.max(1, lb.w), ((sb.y1 - sb.y0) * 0.92) / Math.max(1, lb.h));
    for (let i = 0; i < 16; i++) {
      const ok = fd.items.every((it) => it.ring.every((q) => st.inPoly((q[0] - lcx) * k + scx, (q[1] - lcy) * k + scy, fd.shell)));
      if (ok) break;
      k *= 0.93;
    }
    ctl.dispatch({ type: 'FREE_XFORM', k: k, ox: lcx, oy: lcy, nx: scx, ny: scy });
    ctl.etutView({ cam: { k: 1, dx: 0, dy: 0 } }, true);
    if (!quiet) ctl.toast('Mekânlar yapı kabuğuna sığdırıldı' + (k < 0.99 ? ' (%' + Math.round(k * 100) + ' ölçekle)' : '') + '.', 'success');
  };

  /* ---------------- dışa aktarma ---------------- */
  function sceneFor(P, v) {
    const fd = st.freeDerive(P);
    if (v.view === 'iso') return App.massing.isoScene(App.massing.doc(P, { live: true }), { live: false, yaw: v.yaw, pitch: v.pitch, zx: v.zx, grid: v.grid });
    if (v.view === 'surec') return App.massing.processScene(App.massing.doc(P, {}), { live: false, yaw: v.yaw, pitch: v.pitch, zx: v.zx });
    return st.freeScene(P, fd, { live: false, lv: v.lv, furn: v.furn, rel: v.rel, grid: v.grid });
  }
  const baseKat = ctl.exporters.kat;
  ctl.exporters.kat = function (kind) {
    if (st.modeOf(get()) === 'katlar') { baseKat(kind); return; }
    ctl.runExport(kind === 'png' ? 'PNG' : 'PDF', (P) => {
      const v = get().ui.etut;
      const sc = sceneFor(P, v);
      const nm = P.meta.name + '-mekan-etudu' + (v.view === 'iso' ? '-izometrik' : v.view === 'surec' ? '-surec' : '');
      return App.basemap.preload(sc.prims).then((failed) => {
        if (failed) ctl.toast('Harita karoları bu sağlayıcıdan çıktıya eklenemedi; çıktıda harita boş görünebilir. Başka bir sağlayıcı deneyin.', 'error');
        return App.sheet.exportScene(sc.prims, App.sheet.W, App.sheet.H, nm, kind);
      });
    });
  };

  const ZONE_ACI = { sosyal: 40, ozel: 5, servis: 4, calisma: 3, sirkulasyon: 8, teknik: 9, acik: 2 };
  function dxfDoc(P, fd) {
    const doc = { title: P.meta.name, units: 'm', layers: { YAZI: { color: 7, label: 'Yazılar' }, OLCU: { color: 8, label: 'Ölçüler' }, DONATI: { color: 8, label: 'Donatı' }, PARSEL: { color: 1, label: 'Parsel' }, KABUK: { color: 1, label: 'Yapı kabuğu' }, YESIL: { color: 3, label: 'Yeşil alan' }, AGAC: { color: 3, label: 'Ağaçlar' }, BOSLUK: { color: 9, label: 'Boşluk / avlu' } }, entities: [] };
    Object.keys(ZONE_ACI).forEach((z) => { doc.layers['MEKAN_' + z.toUpperCase()] = { color: ZONE_ACI[z], label: (App.ZONES[z] || {}).label || z }; });
    const b = st.freeViewBounds(fd);
    const H = b.y1;
    const fy = (y) => H - y; // DXF'te y yukarı
    const fp = (q) => [q[0], fy(q[1])];
    if (fd.siteRing) doc.entities.push({ layer: 'PARSEL', kind: 'poly', closed: true, pts: fd.siteRing.map(fp) });
    if (fd.shell) doc.entities.push({ layer: 'KABUK', kind: 'poly', closed: true, pts: fd.shell.map(fp) });
    fd.extras.forEach((e) => {
      if (e.t === 'green') doc.entities.push({ layer: 'YESIL', kind: 'poly', closed: true, pts: st.extraRing(e).map(fp) });
      else if (e.t === 'void') doc.entities.push({ layer: 'BOSLUK', kind: 'poly', closed: true, pts: [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]].map(fp) });
      else if (e.t === 'tree') doc.entities.push({ layer: 'AGAC', kind: 'circle', at: fp([e.x, e.y]), r: e.r });
    });
    fd.items.forEach((it) => {
      const layer = 'MEKAN_' + String(it.zone || 'sosyal').toUpperCase();
      if (!doc.layers[layer]) doc.layers[layer] = { color: 7 };
      doc.entities.push({ layer: layer, kind: 'poly', closed: true, pts: it.ring.map(fp) });
      const lr = st.itemLabelRect(it);
      const fs = Math.max(0.25, Math.min(0.5, Math.min(lr.w, lr.h) / 7));
      const cx = lr.x + lr.w / 2, cy = lr.y + lr.h / 2;
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [cx, fy(cy) + fs * 0.7], text: it.name, h: fs, align: 'center' });
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [cx, fy(cy) - fs * 0.7], text: U.fmt(it.area, 1) + ' m2' + (fd.metrics.usedLevels ? ' / kat ' + it.lv : ''), h: fs * 0.8, align: 'center' });
      it.furn.forEach((f) => {
        const c = st.FURN_BY[f.k];
        if (!c) return;
        const dm = st.furnDims(f);
        doc.entities.push({ layer: 'DONATI', kind: 'poly', closed: true, pts: [[it.x + f.x, it.y + f.y], [it.x + f.x + dm.w, it.y + f.y], [it.x + f.x + dm.w, it.y + f.y + dm.h], [it.x + f.x, it.y + f.y + dm.h]].map(fp) });
      });
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
    if (a.type === 'freeFitShell') { ctl.freeFitShell(); return; }
    if (a.type === 'freeExtra') { ctl.freeAddExtra(a.kind, a.k); return; }
    if (a.type === 'select' && get().ui.module === 'kat' && st.modeOf(get()) === 'mekanlar') {
      ctl.freeSelect(a.id);
      ctl.dispatch({ type: 'UI', patch: { stTab: 'mekanlar' } });
      setTimeout(() => { const el = document.getElementById('mrow-' + a.id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 40);
      return;
    }
    baseRun(a);
  };
})();
