/* ==========================================================================
   68-ctl-yer.js — Yer Seçimi yan etkileri: aday yönetimi, ağırlık / filtre kaydırıcıları, ızgara taraması,
   eksik veri çekme, dışa aktarma.
   Tarama sonucu (pahalı) denetleyicide saklanır; ayarlar değişince "eski" sayılır, yeniden tara denir.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const site = App.site;
  const osm = App.osm;
  const sel = App.select;
  const GX = App.geoExport;
  const get = () => App.store.get();
  const S = () => App.ui.site;

  const YV = ctl.makeView('yer', 'archtools.view.yer', []);
  ctl.yerView = YV.set;
  ctl.yerPick = (p) => YV.set({ pick: p }, true);

  /* ---------------- aday yönetimi ---------------- */
  ctl.candMode = function (m) { ctl.dispatch({ type: 'CAND_SET', patch: { mode: m } }); ctl.yerView({ pick: null }, true); };
  ctl.candSelect = function (id) { if (get().project.cand.sel !== id) ctl.dispatch({ type: 'CAND_SET', patch: { sel: id } }); };
  ctl.candRename = function (id, name) { const n = String(name || '').trim(); if (n) ctl.dispatch({ type: 'CAND_UPDATE', id: id, patch: { name: n.slice(0, 60) } }); };
  ctl.candRemove = function (id) { ctl.dispatch({ type: 'CAND_REMOVE', id: id }); };
  ctl.candClear = function () { ctl.dispatch({ type: 'CAND_CLEAR' }); ctl.toast('Adaylar temizlendi. Geri al ile döndürebilirsiniz.'); };

  function newCand(o) { return { id: U.uid(), name: o.name, lat: o.lat, lon: o.lon, src: o.src, dx: o.dx || 0, dy: o.dy || 0, note: '' }; }

  ctl.candAdd = function (r) {
    const P = get().project;
    if (P.cand.list.length >= 8) { ctl.toast('En çok sekiz aday eklenebilir.', 'error'); return; }
    const before = P.cand.list.length;
    ctl.dispatch({ type: 'CAND_ADD', c: { name: String(r.name || '').split(',').slice(0, 2).join(',').trim() || r.lat.toFixed(4) + ', ' + r.lon.toFixed(4), lat: r.lat, lon: r.lon, src: r.kind ? 'osm' : 'koordinat' } });
    ctl.geo({ results: [], q: '', searched: false, err: null });
    const list = get().project.cand.list;
    if (list.length === before) { ctl.toast('Bu konum zaten aday olarak ekli.'); return; }
    ctl.toast('Aday eklendi', 'success');
    ctl.selFetch([list[list.length - 1].id]);
  };
  ctl.candAddSite = function () {
    const s = get().project.site, loc = s.loc;
    if (get().project.cand.list.length >= 8) { ctl.toast('En çok sekiz aday eklenebilir.', 'error'); return; }
    ctl.dispatch({ type: 'CAND_ADD', c: { name: loc.name.split(',').slice(0, 2).join(',').trim(), lat: loc.lat, lon: loc.lon, src: loc.src === 'demo' ? 'demo' : loc.src, dx: loc.dx || 0, dy: loc.dy || 0 } });
    const list = get().project.cand.list, last = list[list.length - 1];
    if (last && loc.src !== 'demo') ctl.selFetch([last.id]);
  };
  ctl.candDemo = function () {
    const P = get().project;
    const room = 8 - P.cand.list.length;
    if (room <= 0) { ctl.toast('En çok sekiz aday eklenebilir.', 'error'); return; }
    const spots = [[0, 0, 'Merkez'], [420, 300, 'Kuzeydoğu'], [-380, -260, 'Güneybatı'], [-340, 330, 'Kuzeybatı']].filter((p) => !P.cand.list.some((x) => x.src === 'demo' && x.dx === p[0] && x.dy === p[1])).slice(0, Math.min(3, room));
    if (!spots.length) { ctl.toast('Demo adaylar zaten ekli.'); return; }
    const add = spots.map((p) => { const l = osm.demoLoc(p[0], p[1], p[2]); return newCand({ name: 'Demo · ' + p[2], lat: l.lat, lon: l.lon, src: 'demo', dx: p[0], dy: p[1] }); });
    ctl.dispatch({ type: 'CAND_SET', patch: { list: P.cand.list.concat(add), sel: add[0].id, mode: 'karsilastir' }, history: true });
    ctl.toast(add.length + ' demo aday eklendi', 'success');
  };
  // adayı Arsa Analizi'nde aç: aday konum, projenin konumu olur
  ctl.candOpen = function (id) {
    const c = get().project.cand.list.find((x) => x.id === id);
    if (!c) return;
    const loc = c.src === 'demo' ? osm.demoLoc(c.dx, c.dy, c.name) : { lat: c.lat, lon: c.lon, name: c.name, src: c.src === 'tarama' ? 'koordinat' : c.src };
    ctl.dispatch({ type: 'SITE_SET', patch: { loc: loc, parcel: null } });
    ctl.go('arsa');
    ctl.siteFetch(false);
  };
  ctl.yerPeakToCand = function (i) {
    const st = get(), P = st.project, sc = ctl.yerScanFor(st);
    if (!sc || !sc.peaks[i]) return;
    if (P.cand.list.length >= 8) { ctl.toast('En çok sekiz aday eklenebilir.', 'error'); return; }
    const p = sc.peaks[i], loc = P.site.loc;
    const ll = sc.proj.inv(p.x, p.y);
    const name = 'Öneri ' + (i + 1) + ' (%' + p.score + ')';
    let c;
    if (loc.src === 'demo') { const dl = osm.demoLoc((loc.dx || 0) + p.x, (loc.dy || 0) + p.y, name); c = newCand({ name: name, lat: dl.lat, lon: dl.lon, src: 'demo', dx: Math.round((loc.dx || 0) + p.x), dy: Math.round((loc.dy || 0) + p.y) }); }
    else c = newCand({ name: name, lat: Math.round(ll[0] * 1e6) / 1e6, lon: Math.round(ll[1] * 1e6) / 1e6, src: 'tarama' });
    ctl.dispatch({ type: 'CAND_SET', patch: { list: P.cand.list.concat([c]), sel: c.id }, history: true });
    ctl.toast('Öneri aday olarak eklendi; karşılaştırma kipinde sıralanır.', 'success');
    if (c.src !== 'demo') ctl.selFetch([c.id]);
  };

  /* ---------------- eksik veriyi çek (sırayla) ---------------- */
  let fetching = false;
  ctl.selFetch = function (ids) {
    if (fetching) return;
    const st = get(), P = st.project, set = sel.settingsOf(P.site);
    const todo = P.cand.list.filter((c) => c.src !== 'demo' && (!ids || ids.indexOf(c.id) >= 0) && !sel.entryOf(c, set));
    if (!todo.length) { ctl.geo({ tick: (get().ui.geo.tick || 0) + 1 }); return; }
    fetching = true;
    const Rf = osm.needRadius(set.radius, set.walkMin);
    let i = 0;
    const next = function () {
      if (i >= todo.length) { fetching = false; ctl.geo({ busy: null, msg: '', tick: (get().ui.geo.tick || 0) + 1 }); ctl.toast('Aday verileri hazır', 'success'); return; }
      const c = todo[i++];
      ctl.geo({ busy: 'fetch', msg: 'Aday ' + i + '/' + todo.length + ': ' + c.name.slice(0, 28) + ' verisi alınıyor…', err: null });
      osm.fetchAll(c.lat, c.lon, Rf, (m) => ctl.geo({ msg: 'Aday ' + i + '/' + todo.length + ': ' + m })).then(function () {
        ctl.geo({ tick: (get().ui.geo.tick || 0) + 1 });
        next();
      }).catch(function (e) {
        fetching = false;
        ctl.geo({ busy: null, msg: '', err: (e && e.message && App.osm.netMsg(e)) || 'Veri alınamadı.', tick: (get().ui.geo.tick || 0) + 1 });
      });
    };
    next();
  };

  /* ---------------- ağırlık ve filtre ---------------- */
  let live = false;
  const liveStart = function () { if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.candLiveEnd = function () { live = false; };
  ctl.candWeightLive = function (id, v) {
    liveStart();
    const P = get().project;
    const w = Object.assign({}, sel.weights(P.cand, P.site.template));
    w[id] = v;
    ctl.dispatch({ type: 'CAND_SET_LIVE', patch: { w: w } });
  };
  ctl.candWeightReset = function () { ctl.dispatch({ type: 'CAND_SET', patch: { w: null }, history: true }); };
  ctl.candFilter = function (id, o) {
    const f = get().project.cand.f;
    ctl.dispatch({ type: 'CAND_SET', patch: { f: { on: Object.assign({}, f.on, 'on' in o ? { [id]: o.on } : {}), v: Object.assign({}, f.v, 'v' in o ? { [id]: o.v } : {}) } }, history: true });
  };
  ctl.candFilterLive = function (id, v) {
    liveStart();
    const f = get().project.cand.f;
    ctl.dispatch({ type: 'CAND_SET_LIVE', patch: { f: { on: f.on, v: Object.assign({}, f.v, { [id]: v }) } } });
  };
  ctl.candScanLive = function (patch) {
    liveStart();
    ctl.dispatch({ type: 'CAND_SET_LIVE', patch: { scan: Object.assign({}, get().project.cand.scan, patch) } });
  };

  /* ---------------- ızgara taraması ---------------- */
  let scanRes = null; // { key, res }
  const scanKey = function (st) {
    const P = st.project, s = P.site;
    return JSON.stringify([s.loc.lat, s.loc.lon, s.loc.src, s.loc.dx || 0, s.loc.dy || 0, s.radius, s.walkMin, s.template, P.cand.f, P.cand.w, P.cand.scan.step, P.cand.scan.n]);
  };
  // tarama yalnızca anahtarı eşleşirse geçerli (ayar değişince eski sonuç gösterilmez)
  ctl.yerScanFor = function (st) {
    if (!scanRes) return null;
    // yalnızca "veri tick"i değil ayarlar da eşleşmeli; tick, tarama sonrası değişmediyse aynıdır
    return scanRes.key === scanKey(st) ? scanRes.res : null;
  };
  ctl.yerScanStale = (st) => !!scanRes && scanRes.key !== scanKey(st);
  ctl.yerRun = function () {
    const st = get(), P = st.project, s = P.site;
    const e = site.entry(s);
    if (!e) { ctl.toast('Önce konum verisi gerekli.', 'error'); return; }
    if (st.ui.geo.busy) return;
    ctl.geo({ busy: 'scan', msg: 'Hücreler hesaplanıyor…', err: null });
    ctl.yerPick(null);
    setTimeout(function () {
      try {
        const cur = get();
        const set = sel.settingsOf(cur.project.site);
        const res = sel.scan(e, set, { step: cur.project.cand.scan.step, n: cur.project.cand.scan.n, w: sel.weights(cur.project.cand, set.template), f: cur.project.cand.f });
        ctl.geo({ busy: null, msg: '' });
        scanRes = { key: scanKey(get()), res: res };
        ctl.geo({ tick: (get().ui.geo.tick || 0) }); // yeniden çiz
        ctl.toast(res.peaks.length ? 'Tarama tamamlandı · ' + res.peaks.length + ' öneri noktası' : 'Tarama tamamlandı · filtreleri geçen nokta yok', res.peaks.length ? 'success' : 'info');
      } catch (err) {
        ctl.geo({ busy: null, msg: '', err: 'Tarama yapılamadı: ' + (err && err.message ? err.message : 'beklenmeyen hata') });
      }
    }, 40);
  };

  /* ---------------- dışa aktarma ---------------- */
  ctl.siteExporters.yer = function (kind) {
    const st = get(), P = st.project, s = P.site;
    const cx = S().yerCtx(st);
    const mode = P.cand.mode;
    const scan = ctl.yerScanFor(st);
    if (mode === 'bul' && !scan) throw new Error('Önce taramayı çalıştırın.');
    if (mode !== 'bul' && !cx.cmp.ranked.length) throw new Error('Karşılaştırma için en az bir adayın verisi hazır olmalı.');
    const entry = site.entry(s);
    const sc = App.selScene.scene(P, { cmp: cx.cmp, scan: mode === 'bul' ? scan : null, entry: entry }, { mode: mode, pick: null }, false);
    const fctx = { cmp: cx.cmp, scan: scan };
    const ref = GX.yerRef(P, fctx);
    return ctl.siteWrite(kind, {
      name: P.meta.name + '-yer-secimi', prims: sc.prims, W: sc.W, H: sc.H,
      features: () => GX.collectYer(P, fctx), lat0: ref[0], lon0: ref[1],
      meta: { module: 'yer-secimi', program: site.template(s.template).label },
      csv: () => GX.csvYer(P, fctx),
    });
  };
  ctl.exporters.yer = (kind) => ctl.siteExport('yer', kind === 'png' ? 'png' : 'pdf');

  /* ---------------- eylemler ---------------- */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'selFetch') { ctl.selFetch(); return; }
    if (a.type === 'selTab') { ctl.yerView({ tab: a.tab }); return; }
    baseRun(a);
  };
})();
