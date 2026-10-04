/* ==========================================================================
   64-ctl-site.js — Modül 4/5/6 ortak yan etkiler + Arsa Analizi denetleyicisi
   Ortak: konum arama (Nominatim), veri çekme (Overpass / Open-Meteo), görünüm kalıcılığı, animasyon,
          dışa aktarma altyapısı (PNG · PDF · SVG · DXF · GeoJSON · CSV), paylaşım bağlantısı, eylem köprüsü.
   Ağ istekleri yalnızca kullanıcı bir konum seçtiğinde ya da “Verileri çek” dediğinde yapılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const site = App.site;
  const osm = App.osm;
  const GX = App.geoExport;
  const get = () => App.store.get();
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- ortak: coğrafi durum (state.ui.geo) ---------------- */
  const GEO = (patch) => ctl.dispatch({ type: 'UI', patch: { geo: Object.assign({}, get().ui.geo, patch) } });
  ctl.geo = GEO;
  ctl.geoClear = () => GEO({ err: null });
  const bump = () => GEO({ tick: (get().ui.geo.tick || 0) + 1 });

  let searchTok = 0;
  ctl.geoSearch = function (q, onPick) {
    q = String(q || '').trim();
    const mod = get().ui.module;
    if (!q) { GEO({ q: '', results: [], err: null, searched: false, owner: mod }); return; }
    const tok = ++searchTok;
    GEO({ busy: 'search', msg: 'Aranıyor…', err: null, q: q, results: [], searched: false, owner: mod });
    osm.geocode(q).then(function (list) {
      if (tok !== searchTok) return;
      if (osm.parseCoord(q) && onPick) { GEO({ busy: null, msg: '', results: [], searched: false }); onPick(list[0]); return; }
      GEO({ busy: null, msg: '', results: list, searched: true });
    }).catch(function (e) {
      if (tok !== searchTok) return;
      GEO({ busy: null, msg: '', err: e && e.message ? (App.osm.netMsg ? 'Arama yapılamadı: ' + App.osm.netMsg(e) : e.message) : 'Arama yapılamadı.', searched: false });
    });
  };

  /* ---------------- veri çekme ---------------- */
  let fetchTok = 0;
  // c: { lat, lon } · Rf: yarıçap · done(entry) · hedef konum değişirse eski yanıt yok sayılır
  function fetchOne(c, Rf, say) { return osm.fetchAll(c.lat, c.lon, Rf, say); }

  ctl.siteFetch = function (force) {
    const s = get().project.site;
    if (s.loc.src === 'demo') return;
    const Rf = site.fetchRadius(s);
    if (!force && osm.cacheGet(s.loc.lat, s.loc.lon, Rf)) { bump(); return; }
    const tok = ++fetchTok;
    const key = osm.key(s.loc.lat, s.loc.lon);
    GEO({ busy: 'fetch', msg: (App.here && App.here.active() ? 'HERE' : 'OpenStreetMap') + '’e bağlanılıyor…', err: null });
    fetchOne(s.loc, Rf, function (m) { if (tok === fetchTok) GEO({ msg: m }); }).then(function (ent) {
      if (tok !== fetchTok) return;
      GEO({ busy: null, msg: '', tick: (get().ui.geo.tick || 0) + 1 });
      const c = osm.counts(ent.data);
      const cur = get().project.site.loc;
      if (osm.key(cur.lat, cur.lon) === key) ctl.toast('Veri alındı: ' + c.bina + ' bina · ' + c.yol + ' yol · ' + c.isl + ' işlev noktası', 'success');
    }).catch(function (e) {
      if (tok !== fetchTok) return;
      GEO({ busy: null, msg: '', err: e && e.message ? App.osm.netMsg(e) : 'Veri alınamadı.' });
    });
  };
  function ensureData() {
    const s = get().project.site;
    if (s.loc.src !== 'demo' && !site.entry(s) && !get().ui.geo.busy) ctl.siteFetch(false);
  }
  ctl.siteEnsure = ensureData;

  /* ---------------- konum ve ayarlar (project.site) ---------------- */
  ctl.siteSetLoc = function (r) {
    if (!r || !(Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180)) return;
    const had = !!get().project.site.parcel;
    const loc = { lat: r.lat, lon: r.lon, name: String(r.name || r.lat.toFixed(5) + ', ' + r.lon.toFixed(5)).slice(0, 120), src: r.kind ? 'osm' : 'koordinat' };
    ctl.dispatch({ type: 'SITE_SET', patch: { loc: loc, parcel: null } });
    GEO({ results: [], q: '', searched: false, err: null });
    if (had) ctl.toast('Konum değişti: parsel sıfırlandı. Geri al ile döndürebilirsiniz.');
    ctl.siteFetch(false);
    if (loc.src === 'koordinat') {
      osm.reverse(r.lat, r.lon).then(function (nm) {
        const cur = get().project.site.loc;
        if (nm && cur.lat === loc.lat && cur.lon === loc.lon && cur.src === 'koordinat') ctl.dispatch({ type: 'SITE_SET_LIVE', patch: { loc: Object.assign({}, cur, { name: nm.slice(0, 120) }) } });
      });
    }
  };
  ctl.siteDemo = function () {
    ctl.dispatch({ type: 'SITE_SET', patch: { loc: osm.demoLoc(0, 0), parcel: null } });
    GEO({ err: null });
  };
  ctl.siteSet = function (patch) { ctl.dispatch({ type: 'SITE_SET', patch: patch }); ensureData(); };

  // kaydırıcı: ilk harekette tek geri-al noktası; veri önbelleği yetmiyorsa yarıçap bırakınca uygulanır
  let live = false, pending = null;
  const covered = (s, patch) => s.loc.src === 'demo' || !!osm.cacheGet(s.loc.lat, s.loc.lon, site.fetchRadius(Object.assign({}, s, patch)));
  ctl.siteLive = function (patch) {
    if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); }
    pending = Object.assign(pending || {}, patch);
    if (covered(get().project.site, pending)) ctl.dispatch({ type: 'SITE_SET_LIVE', patch: patch });
  };
  ctl.siteLiveEnd = function () {
    live = false;
    if (pending) { ctl.dispatch({ type: 'SITE_SET_LIVE', patch: pending }); pending = null; ensureData(); }
  };

  /* ---------------- görünüm durumu: kalıcı ve animasyonlu ---------------- */
  const timers = {};
  function makeView(uiKey, storeKey, persist) {
    const save = function () {
      clearTimeout(timers[uiKey]);
      timers[uiKey] = setTimeout(function () {
        try {
          const v = get().ui[uiKey], o = {};
          persist.forEach((k) => { o[k] = v[k]; });
          window.localStorage.setItem(storeKey, JSON.stringify(o));
        } catch (e) {}
      }, 350);
    };
    const set = function (patch, silent) {
      ctl.dispatch({ type: 'UI', patch: { [uiKey]: Object.assign({}, get().ui[uiKey], patch) } });
      if (!silent) save();
    };
    const load = function (clean) {
      try {
        const o = JSON.parse(window.localStorage.getItem(storeKey) || 'null');
        if (!o || typeof o !== 'object') return;
        const p = clean(o);
        if (p) ctl.dispatch({ type: 'UI', patch: { [uiKey]: Object.assign({}, get().ui[uiKey], p) } });
      } catch (e) {}
    };
    return { set: set, load: load, save: save };
  }
  ctl.makeView = makeView;

  let raf = 0;
  function tween(setter, getter, props, dur, done) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const from = {}, cur = getter();
    Object.keys(props).forEach((k) => { from[k] = cur[k]; });
    if (reduced() || dur <= 0) { setter(props, true); if (done) done(); return; }
    const t0 = performance.now();
    (function step(now) {
      const t = U.clamp((now - t0) / dur, 0, 1), e = App.iso.easeInOut(t);
      const p = {};
      Object.keys(props).forEach((k) => { p[k] = from[k] + (props[k] - from[k]) * e; });
      setter(p, true);
      if (t < 1) raf = requestAnimationFrame(step); else { raf = 0; if (done) done(); }
    })(t0);
  }
  const cancel = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  ctl.tweenView = tween;
  ctl.tweenCancel = cancel;

  /* ---------------- Arsa Analizi görünümü ---------------- */
  const AV = makeView('site', 'archtools.view.arsa', ['mode', 'layers', 'labels', 'sunDay', 'sunHour', 'parcel', 'yaw', 'pitch', 'explode', 'zx']);
  ctl.siteView = AV.set;
  ctl.siteCancel = cancel;
  const arsaTween = (props, dur, done) => tween(AV.set, () => get().ui.site, props, dur, done);

  ctl.loadSiteView = function () {
    AV.load(function (o) {
      const p = {};
      if (o.mode === 'map' || o.mode === 'iso') p.mode = o.mode;
      if (Array.isArray(o.layers)) { const ids = site.LAYERS.map((l) => l.id); const ls = o.layers.filter((x) => ids.indexOf(x) >= 0); if (ls.length) p.layers = ls; }
      ['labels', 'parcel'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      if (App.gis.SUN_DAYS.some((d) => d.id === o.sunDay)) p.sunDay = o.sunDay;
      if (typeof o.sunHour === 'number') p.sunHour = U.clamp(o.sunHour, 6, 19);
      if (typeof o.yaw === 'number') p.yaw = U.clamp(o.yaw, -85, 85);
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 20, 70);
      if (typeof o.explode === 'number') p.explode = U.clamp(o.explode, 0, 1);
      if (typeof o.zx === 'number') p.zx = U.clamp(o.zx, 1, 4);
      return p;
    });
  };

  ctl.siteOrbit = function (dx, dy, base) {
    AV.set({ yaw: U.clamp(base.yaw + dx * 0.32, -85, 85), pitch: U.clamp(base.pitch - dy * 0.22, 20, 70) }, true);
  };
  ctl.siteMode = function (mode) {
    const v = get().ui.site;
    if (v.mode === mode) return;
    if (mode === 'iso' && !reduced()) {
      AV.set({ mode: 'iso', explode: 0, sel: null }, true);
      arsaTween({ explode: 1 }, 760, AV.save);
    } else AV.set({ mode: mode, sel: null, explode: mode === 'iso' ? 1 : v.explode });
  };
  ctl.siteToggleExplode = function () { arsaTween({ explode: get().ui.site.explode > 0.5 ? 0 : 1 }, 950, AV.save); };
  ctl.siteResetView = function () { const d = App.siteUi.arsa(); arsaTween({ yaw: d.yaw, pitch: d.pitch }, 450, AV.save); };
  ctl.siteLayer = function (id) {
    const v = get().ui.site;
    const on = v.layers.indexOf(id) >= 0;
    if (on && v.layers.length === 1) { ctl.toast('En az bir katman açık kalmalı.'); return; }
    const order = site.LAYERS.map((l) => l.id);
    AV.set({ layers: order.filter((x) => (x === id ? !on : v.layers.indexOf(x) >= 0)), sel: v.sel === id && on ? null : v.sel });
  };

  /* ---------------- Sor (kural tabanlı) ---------------- */
  ctl.siteAsk = function (text) {
    const st = get(), s = st.project.site, e = site.entry(s), A = e ? site.analyze(s, e) : null;
    const r = site.ask(A, s, text);
    const qa = (st.ui.site.qa || []).concat([{ id: Date.now() + Math.random(), q: text, a: r.a, go: r.go }]).slice(-5);
    AV.set({ qa: qa });
  };
  ctl.siteGo = function (go) {
    if (!go) return;
    if (go.layer) {
      const v = get().ui.site;
      if (v.layers.indexOf(go.layer) < 0) ctl.siteLayer(go.layer);
      if (v.mode !== 'map') AV.set({ mode: 'map' });
    }
    if (go.tab) AV.set({ tab: go.tab });
  };

  /* ---------------- dışa aktarma altyapısı ---------------- */
  ctl.xmenu = function (open) { ctl.dispatch({ type: 'UI', patch: { xmenu: !!open } }); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && get().ui.xmenu) ctl.xmenu(false); });

  const blob = (text, type) => new Blob([text], { type: type });
  ctl.saveText = function (filename, text, type) { return App.files.saveBlob(filename, blob(text, type)); };

  // fn(kind) → Promise<{ok}> | {ok} ; hata fırlatırsa kullanıcıya iletilir
  ctl.siteExporters = {};
  ctl.siteExport = function (mod, kind) {
    const fn = ctl.siteExporters[mod];
    if (!fn) return;
    const label = kind === 'geojson' ? 'GeoJSON' : kind.toUpperCase();
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    let p;
    try { p = Promise.resolve(fn(kind)); } catch (e) { p = Promise.reject(e); }
    p.then((r) => ctl.report(r, label + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };

  // ortak biçim dağıtıcı: build() → { prims, W, H, features, lat0, lon0, csv, name }
  ctl.siteWrite = function (kind, o) {
    const slug = U.slug(o.name);
    if (kind === 'png' || kind === 'pdf') return App.sheet.exportScene(o.prims, o.W, o.H, o.name, kind);
    if (kind === 'svg') return ctl.saveText(slug + '.svg', GX.svg(o.prims, o.W, o.H, o.name), 'image/svg+xml');
    if (kind === 'dxf') return ctl.saveText(slug + '.dxf', GX.dxf(o.features()), 'application/dxf');
    if (kind === 'geojson') return ctl.saveText(slug + '.geojson', GX.geojson(o.features(), o.lat0, o.lon0, o.meta), 'application/geo+json');
    if (kind === 'kml') return ctl.saveText(slug + '.kml', GX.kml(o.features(), o.lat0, o.lon0, o.name), 'application/vnd.google-earth.kml+xml');
    if (kind === 'csv') return ctl.saveText(slug + '.csv', o.csv(), 'text/csv;charset=utf-8');
    return Promise.reject(new Error('Bilinmeyen biçim.'));
  };

  ctl.siteExporters.arsa = function (kind) {
    const st = get(), P = st.project, s = P.site, e = site.entry(s);
    if (!e) throw new Error('Önce konum verisi gerekli.');
    const A = site.analyze(s, e);
    const sc = App.siteScene.arsa(P, A, Object.assign({}, st.ui.site, { sel: null, lod: false }), false);
    return ctl.siteWrite(kind, {
      name: P.meta.name + '-arsa-analizi', prims: sc.prims, W: sc.W, H: sc.H,
      features: () => GX.collectArsa(P, A), lat0: e.data.lat0, lon0: e.data.lon0,
      meta: { module: 'arsa-analizi', location: s.loc.name, source: A.demo ? 'demo (sentetik)' : App.ui.site.sourceName(site.entry(s)), score: A.score },
      csv: () => GX.csvArsa(P, A),
    });
  };
  ctl.exporters.arsa = (kind) => ctl.siteExport('arsa', kind === 'png' ? 'png' : 'pdf');

  /* ---------------- paylaşım bağlantısı ---------------- */
  function copyText(t) {
    const fallback = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => fallback());
    } catch (e) {}
    return Promise.resolve(fallback());
  }
  ctl.shareLink = function () {
    const st = get(), s = st.project.site, mod = st.ui.module;
    if (s.loc.src === 'demo') { ctl.toast('Demo bölge için bağlantı oluşturulmaz; gerçek bir konum arayın.'); return; }
    const q = new URLSearchParams({ lat: s.loc.lat.toFixed(5), lon: s.loc.lon.toFixed(5), r: String(s.radius), w: String(s.walkMin), t: s.template, n: s.loc.name.slice(0, 80) });
    const url = location.href.split('#')[0] + '#/' + mod + '?' + q.toString();
    try { history.replaceState(null, '', url); } catch (e) {}
    copyText(url).then((ok) => ctl.toast(ok ? 'Bağlantı kopyalandı: aynı konum, yarıçap ve program açılır.' : 'Bağlantı adres çubuğuna yazıldı; oradan kopyalayabilirsiniz.', ok ? 'success' : 'info'));
  };

  // #/arsa?lat=…&lon=… biçimindeki bağlantıyı uygula (yalnızca konum farklıysa)
  ctl.hashSite = function () {
    const m = /^#\/?[a-z]+\?(.*)$/.exec(location.hash || '');
    if (!m) return false;
    const q = new URLSearchParams(m[1]);
    const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) return false;
    const s = get().project.site;
    if (s.loc.src !== 'demo' && Math.abs(s.loc.lat - lat) < 1e-5 && Math.abs(s.loc.lon - lon) < 1e-5) return false;
    const patch = { loc: { lat: lat, lon: lon, name: String(q.get('n') || lat.toFixed(5) + ', ' + lon.toFixed(5)).slice(0, 120), src: 'koordinat' }, parcel: null };
    const r = parseInt(q.get('r'), 10), w = parseInt(q.get('w'), 10), t = q.get('t');
    if (r >= 250 && r <= 1000) patch.radius = r;
    if ([5, 10, 15].indexOf(w) >= 0) patch.walkMin = w;
    if (t && site.TEMPLATES.some((x) => x.id === t)) patch.template = t;
    ctl.dispatch({ type: 'SITE_SET_LIVE', patch: patch });
    ctl.siteFetch(false);
    return true;
  };

  /* ---------------- eylem köprüsü (bulgu kartları) ---------------- */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'siteLayer') {
      const v = get().ui.site;
      if (v.layers.indexOf(a.id) < 0) ctl.siteLayer(a.id);
      ctl.siteView({ tab: 'gorunum' });
      return;
    }
    if (a.type === 'siteTab') { ctl.siteView({ tab: a.tab }); return; }
    baseRun(a);
  };
})();
