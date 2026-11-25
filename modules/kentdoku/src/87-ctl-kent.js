/* ==========================================================================
   87-ctl-kent.js — Modül 12 (Kent Dokusu) denetleyicisi
   Motor yükleme, harita bağlama, veri indirme, yeniden çizim, 3B, dışa aktarım, arama.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const kent = App.kent;
  const rt = kent.rt;

  const get = () => kent.of(App.store.get());
  const set = (patch) => ctl.dispatch({ type: 'UI', patch: { kent: Object.assign({}, get(), patch) } });
  const bump = (patch) => set(Object.assign({ rev: get().rev + 1 }, patch || {}));
  ctl.kentSet = set;

  /* ---------------- motor ---------------- */
  let enginePromise = null;
  ctl.kentEngine = function () {
    if (!enginePromise) {
      const cfg = App.config && App.config.kent;
      enginePromise = (cfg && cfg.engine ? import(cfg.engine) : Promise.reject(new Error('Kent Dokusu motoru bu derlemede yok')))
        .then(function (m) { rt.eng = m; bump(); return m; })
        .catch(function (e) { enginePromise = null; throw e; });
    }
    return enginePromise;
  };

  /* ---------------- harita ---------------- */
  ctl.kentMapRef = function (el) {
    if (rt.mapEl === el) return;
    rt.mapEl = el;
    if (rt.map) { try { rt.map.remove(); } catch (e) { /* kapsayıcı DOM'dan çıkmış */ } rt.map = null; }
    ctl.kentEngine().then(function (m) {
      if (rt.mapEl !== el || rt.map) return;
      const k = get(), d = kent.dims(k);
      rt.map = m.createMap(el, { lat: k.lat, lon: k.lon, w: d.w, h: d.h, base: k.base, onMove: function (lat, lon) { set({ lat: lat, lon: lon }); } });
    }).catch(function () { ctl.toast('Harita motoru yüklenemedi. Bağlantınızı kontrol edin.', 'error'); });
  };
  ctl.kentArea = function (patch) {
    set(patch);
    const d = kent.dims(get());
    if (rt.map) rt.map.setFrame(d.w, d.h);
  };
  ctl.kentBase = function (b) { set({ base: b }); if (rt.map) rt.map.setBase(b); };

  /* ---------------- arama ---------------- */
  let searchT = null, searchSeq = 0;
  function runSearch() {
    const q = get().q.trim();
    if (q.length < 3) { set({ results: null, searching: false }); return; }
    const seq = ++searchSeq;
    set({ searching: true });
    ctl.kentEngine().then(function (m) { return m.geocode(q); }).then(function (list) {
      if (seq === searchSeq) set({ results: list.slice(0, 6), searching: false });
    }).catch(function () { if (seq === searchSeq) set({ results: [], searching: false }); });
  }
  ctl.kentQuery = function (v, now) {
    set({ q: v });
    clearTimeout(searchT);
    searchT = setTimeout(runSearch, now ? 0 : 450);
  };
  ctl.kentPick = function (r) {
    clearTimeout(searchT); searchSeq++;
    set({ name: r.name, q: r.name, results: null, searching: false, lat: r.lat, lon: r.lon, view: 'map' });
    if (rt.map) { rt.map.setView(r.lat, r.lon, 16); setTimeout(function () { rt.map.invalidate(); }, 40); }
  };

  /* ---------------- çizim ---------------- */
  function redraw(k) {
    if (!rt.data || !rt.eng) return;
    const cl = rt.site && rt.site.climate;
    rt.svg = rt.eng.buildSVG(rt.data, { style: k.style, layers: k.layers, mode: k.mode, wind: cl ? cl.wind : null, windError: rt.site && !cl ? 'Rüzgar verisi alınamadı' : null, topo: rt.site && rt.site.terrain });
  }
  function change(patch, opts) {
    const k = Object.assign({}, get(), patch);
    redraw(k);
    if (opts && opts.model) rt.dirty3d = true;
    bump(patch);
    if (opts && opts.model && k.view === 'model') ensure3d();
  }
  ctl.kentStyle = function (id) { change({ style: id }, { model: true }); };
  ctl.kentMode = function (id) { change(rt.data && get().view !== 'plan' ? { mode: id, view: 'plan' } : { mode: id }); if (rt.data) setTimeout(ctl.kentFitIfIdle, 30); };
  ctl.kentLayer = function (id) { const l = Object.assign({}, get().layers); l[id] = !l[id]; change({ layers: l }); };

  /* ---------------- veri ---------------- */
  ctl.kentGenerate = function (at) {
    const k0 = get();
    if (k0.busy) return;
    const c = at || (rt.map ? rt.map.center() : { lat: k0.lat, lon: k0.lon });
    const d = kent.dims(k0);
    const seq = ++rt.seq;
    set({ busy: { title: 'Veri indiriliyor', msg: 'Hazırlanıyor…', frac: 0.02 }, lat: c.lat, lon: c.lon, results: null });
    ctl.kentEngine().then(function (m) {
      return m.loadArea({ lat: c.lat, lon: c.lon, w: d.w, h: d.h }, function (a, n) {
        if (seq === rt.seq) set({ busy: { title: 'Veri indiriliyor', msg: a + ' / ' + n + ' veri parçası', frac: 0.05 + 0.9 * a / n } });
      }).then(function (data) {
        if (seq !== rt.seq) return;
        rt.data = data; rt.site = null; rt.dirty3d = true;
        rt.metrics = m.Site.builtMetrics(data);
        rt.pz.touched = false;
        redraw(get());
        bump({ busy: null, has: true, view: 'plan' });
        setTimeout(ctl.kentFit, 30);
        if (!data.buildings.length) ctl.toast('Bu alanda bina verisi bulunamadı. Başka bir konum deneyin.');
        m.Site.fetchSite(data.meta.lat, data.meta.lon, data.meta.w, data.meta.h).then(function (site) {
          if (seq !== rt.seq) return;
          rt.site = site;
          const k = get();
          if (k.layers.topo || k.mode === 'ruzgar') redraw(k);
          bump();
        });
      });
    }).catch(function (e) {
      if (seq !== rt.seq) return;
      set({ busy: null });
      ctl.toast((e && e.message) || 'Veri alınırken bir hata oluştu.', 'error');
    });
  };

  /* ---------------- görünüm ---------------- */
  ctl.kentView = function (v) {
    if (get().view === v) return;
    set({ view: v });
    if (v === 'map') setTimeout(function () { if (rt.map) rt.map.invalidate(); }, 40);
    if (v === 'plan') setTimeout(ctl.kentFitIfIdle, 30);
    if (v === 'model') setTimeout(ensure3d, 30);
  };

  // 2B pafta: kaydır / yakınlaştır (store'a yazılmaz; doğrudan CSSOM)
  ctl.kentApplyPZ = function () {
    const el = rt.paperEl, p = rt.pz;
    if (el) el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) scale(' + p.k + ')';
  };
  ctl.kentFit = function () {
    const vp = rt.planEl;
    if (!vp || !rt.data) return;
    const r = vp.getBoundingClientRect(), m = rt.data.meta, p = rt.pz;
    if (!r.width || !r.height) return;
    p.k = Math.min(r.width / m.w, r.height / m.h) * 0.9;
    p.x = -m.w * p.k / 2; p.y = -m.h * p.k / 2; p.touched = false;
    ctl.kentApplyPZ();
  };
  ctl.kentFitIfIdle = function () { if (!rt.pz.touched) ctl.kentFit(); };
  ctl.kentWheel = function (e) {
    if (!rt.data) return;
    e.preventDefault();
    const r = rt.planEl.getBoundingClientRect(), p = rt.pz;
    const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const nk = Math.min(40, Math.max(0.05, p.k * Math.exp(-e.deltaY * 0.0015)));
    p.x = mx - (mx - p.x) * nk / p.k; p.y = my - (my - p.y) * nk / p.k; p.k = nk; p.touched = true;
    ctl.kentApplyPZ();
  };
  let drag = null;
  ctl.kentDown = function (e) {
    if (!rt.data) return;
    drag = { x: e.clientX - rt.pz.x, y: e.clientY - rt.pz.y };
    try { rt.planEl.setPointerCapture(e.pointerId); } catch (err) { /* yok */ }
    rt.planEl.classList.add('drag');
  };
  ctl.kentDrag = function (e) {
    if (!drag) return;
    rt.pz.x = e.clientX - drag.x; rt.pz.y = e.clientY - drag.y; rt.pz.touched = true;
    ctl.kentApplyPZ();
  };
  ctl.kentUp = function () { drag = null; if (rt.planEl) rt.planEl.classList.remove('drag'); };
  window.addEventListener('resize', function () { if (App.store && App.store.get().ui.module === 'kent' && get().view === 'plan') ctl.kentFitIfIdle(); });

  /* ---------------- 3B ---------------- */
  ctl.kentModelRef = function (el) {
    if (rt.modelEl === el) return;
    rt.modelEl = el;
    if (rt.v3 && rt.v3.ready()) rt.v3.attach(el);
  };
  function ensure3d() {
    if (!rt.data || !rt.eng || !rt.modelEl) return Promise.resolve(null);
    const first = !rt.v3;
    if (first || rt.dirty3d) set({ busy: { title: '3B model', msg: first ? 'Görüntüleyici yükleniyor…' : 'Binalar yükseltiliyor…', frac: first ? 0.3 : 0.7 } });
    return (rt.v3 ? Promise.resolve(rt.v3) : rt.eng.load3d().then(function (v) { rt.v3 = v; return v; })).then(function (v) {
      return new Promise(function (res) { setTimeout(function () { res(v); }, 30); });
    }).then(function (v) {
      v.init(rt.modelEl);
      if (rt.dirty3d) { v.build(rt.data, get().style); v.setOrtho(!!get().axo); rt.dirty3d = false; }
      v.render();
      set({ busy: null });
      return v;
    }).catch(function (e) {
      set({ busy: null });
      ctl.toast('3B görüntüleyici yüklenemedi.', 'error');
      return null;
    });
  }
  ctl.kentAxo = function () { const on = !get().axo; set({ axo: on }); if (rt.v3 && rt.v3.ready()) rt.v3.setOrtho(on); };
  ctl.kentReset3d = function () { if (rt.v3 && rt.v3.ready()) rt.v3.resetView(); };

  /* ---------------- dışa aktarım ---------------- */
  const TR = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };
  function fileBase() {
    const k = get();
    return 'archtools_kent_' + (k.name || k.lat.toFixed(4) + '_' + k.lon.toFixed(4)).toLowerCase().replace(/[çğıöşü]/g, function (c) { return TR[c]; }).replace(/[^a-z0-9._-]+/g, '_').slice(0, 50);
  }
  /* SketchUp: .skp kapalı (lisanslı) bir biçimdir, tarayıcıda yazılamaz. SketchUp'ın doğrudan içe aktardığı COLLADA (.dae)
     üretilir: OBJ çıktısı (üçgenler, metre, Y yukarı) katman adlarıyla ayrı geometrilere ve renkli malzemelere çevrilir. */
  const DAE_COL = { Zemin: '#EDEDEA', Binalar: '#D9D7D2', Yollar: '#BDBDBD', Yaya_Yollari: '#CFCBC2', Rayli_Sistem: '#8A8A8A', Su: '#9CC3DE', Yesil_Alan: '#B5CFA0', Tarim: '#DCD6B0' };
  function objToDae(obj) {
    const lines = obj.split('\n'), V = [], groups = [];
    let g = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.charCodeAt(0) === 118 && l.charCodeAt(1) === 32) { const t = l.split(' '); V.push(+t[1], +t[2], +t[3]); } // "v "
      else if (l.charCodeAt(0) === 102 && l.charCodeAt(1) === 32) { // "f "
        if (!g) { g = { name: 'Model', idx: [] }; groups.push(g); }
        const t = l.split(' '), a = [];
        for (let j = 1; j < t.length; j++) if (t[j]) { const n = parseInt(t[j], 10); a.push(n < 0 ? V.length / 3 + n : n - 1); }
        for (let j = 1; j + 1 < a.length; j++) g.idx.push(a[0], a[j], a[j + 1]); // çokgeni üçgen yelpazesine böl
      } else if (l.charCodeAt(0) === 111 && l.charCodeAt(1) === 32) { g = { name: l.slice(2).trim().replace(/[^A-Za-z0-9_]/g, '_') || 'Model', idx: [] }; groups.push(g); } // "o "
    }
    const esc = (x) => x.replace(/[^A-Za-z0-9_]/g, '_');
    const rgb = (hx) => [1, 3, 5].map((i) => (parseInt(hx.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
    const used = groups.filter((q) => q.idx.length);
    const out = [];
    out.push('<?xml version="1.0" encoding="utf-8"?>',
      '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
      '<asset><contributor><authoring_tool>archtools Kent Dokusu</authoring_tool></contributor><created>' + new Date().toISOString() + '</created><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>',
      '<library_effects>');
    used.forEach((q) => { const n = esc(q.name); out.push('<effect id="fx_' + n + '"><profile_COMMON><technique sid="c"><lambert><diffuse><color>' + rgb(DAE_COL[q.name] || '#D9D7D2') + ' 1</color></diffuse></lambert></technique></profile_COMMON></effect>'); });
    out.push('</library_effects><library_materials>');
    used.forEach((q) => { const n = esc(q.name); out.push('<material id="mat_' + n + '" name="' + n + '"><instance_effect url="#fx_' + n + '"/></material>'); });
    out.push('</library_materials><library_geometries>');
    used.forEach((q) => {
      // her katman yalnızca kullandığı köşeleri taşır (dosya küçük kalır)
      const map = new Map(), P = [], T = new Array(q.idx.length);
      for (let i = 0; i < q.idx.length; i++) {
        const o = q.idx[i]; let n = map.get(o);
        if (n === undefined) { n = map.size; map.set(o, n); P.push(+V[o * 3].toFixed(3), +V[o * 3 + 1].toFixed(3), +V[o * 3 + 2].toFixed(3)); }
        T[i] = n;
      }
      const n = esc(q.name);
      out.push('<geometry id="g_' + n + '" name="' + n + '"><mesh>',
        '<source id="g_' + n + '_p"><float_array id="g_' + n + '_pa" count="' + P.length + '">' + P.join(' ') + '</float_array>',
        '<technique_common><accessor source="#g_' + n + '_pa" count="' + P.length / 3 + '" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>',
        '<vertices id="g_' + n + '_v"><input semantic="POSITION" source="#g_' + n + '_p"/></vertices>',
        '<triangles material="m" count="' + T.length / 3 + '"><input semantic="VERTEX" source="#g_' + n + '_v" offset="0"/><p>' + T.join(' ') + '</p></triangles>',
        '</mesh></geometry>');
    });
    out.push('</library_geometries><library_visual_scenes><visual_scene id="Kentdoku" name="Kentdoku">');
    used.forEach((q) => { const n = esc(q.name); out.push('<node id="n_' + n + '" name="' + n + '"><instance_geometry url="#g_' + n + '"><bind_material><technique_common><instance_material symbol="m" target="#mat_' + n + '"/></technique_common></bind_material></instance_geometry></node>'); });
    out.push('</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Kentdoku"/></scene></COLLADA>');
    return out.join('\n');
  }
  ctl.kentObjToDae = objToDae; // test için

  ctl.kentExport = function (kind) {
    if (!rt.data || !rt.eng || get().busy) return;
    const X = rt.eng.X, m = rt.data.meta, base = fileBase(), k = get(), topo = rt.site && rt.site.terrain;
    let job;
    if (kind === 'svg') job = Promise.resolve(X.download(base + '.svg', X.exportSVG(rt.svg)));
    else if (kind === 'png') job = X.exportPNG(rt.svg, m.w, m.h).then(function (b) { X.download(base + '.png', b); });
    else if (kind === 'pdf' && Math.max(m.w, m.h) * 1000 / k.scale > kent.PDF_MAX_MM) {
      ctl.toast('1:' + k.scale + ' ölçeğinde sayfa ' + Math.round(Math.max(m.w, m.h) * 1000 / k.scale) + ' mm olur; PDF en çok ' + kent.PDF_MAX_MM + ' mm olabilir. Alanı küçültün ya da ölçeği büyütün.', 'error');
      return;
    } else if (kind === 'pdf') {
      set({ busy: { title: 'PDF hazırlanıyor', msg: 'Vektör çizim dönüştürülüyor…', frac: 0.5 } });
      job = new Promise(function (res) { setTimeout(res, 40); }).then(function () { return X.exportPDF(rt.svg, m.w, m.h, k.scale); }).then(function (b) { X.download(base + '_1-' + k.scale + '.pdf', b); });
    } else if (kind === 'dxf') job = Promise.resolve(X.download(base + '.dxf', X.exportDXF(rt.data, { topo: topo })));
    else if (kind === 'geojson') job = Promise.resolve(X.download(base + '.geojson', X.exportGeoJSON(rt.data, topo)));
    else job = ensure3d().then(function (v) {
      if (!v) throw new Error('3B model hazırlanamadı');
      if (kind === 'obj') return X.download(base + '.obj', v.exportOBJ(), 'text/plain');
      if (kind === 'stl') return v.exportSTL().then(function (buf) { X.download(base + '.stl', new Blob([buf], { type: 'model/stl' })); });
      if (kind === 'skp') return X.download(base + '_sketchup.dae', new Blob([objToDae(v.exportOBJ())], { type: 'model/vnd.collada+xml' }));
      return v.exportGLB().then(function (buf) { X.download(base + '.glb', new Blob([buf], { type: 'model/gltf-binary' })); });
    });
    job.then(function () { set({ busy: null }); ctl.toast(kind === 'skp' ? 'SketchUp dosyası (.dae) indirildi. SketchUp\'ta Dosya › İçe aktar ile açın.' : kind.toUpperCase() + ' dosyası indirildi.', 'success'); })
      .catch(function (e) { set({ busy: null }); ctl.toast('Dışa aktarım başarısız: ' + ((e && e.message) || e), 'error'); });
  };
  ctl.kentShot = function () {
    if (!rt.v3 || !rt.v3.ready() || !rt.eng) return;
    // data: adresi fetch ile okunamaz (CSP connect-src 'self'); elle çözülür
    const bin = atob(rt.v3.snapshot().split(',')[1]), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    rt.eng.X.download(fileBase() + '_3b.png', new Blob([a], { type: 'image/png' }));
  };
})();
