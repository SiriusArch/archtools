/* ==========================================================================
   37-lib-z-here3d.js — HERE Maps API for JavaScript 3.1 (HARP motoru) ile eğik / 3B bina haritası
   Resmî HERE Platform kitaplığı, kullanıcının KENDİ API anahtarıyla dinamik yüklenir (wego.here.com kullanılmaz).
   Anahtar yalnızca bu çağrılara parametre olarak geçer; hiçbir yerde saklanmaz ve dışa aktarılmaz.

   DÜRÜSTLÜK NOTU: geliştirme ortamında HERE JS API yüklenemedi (ağ kapalı, anahtar yok). Bu dosya HERE belgelerine
   göre elle yazıldı ve H nesnesinin elle yazılmış bir SAHTESİ (stub) ile birim sınandı (çağrı sırası + dönüşümler).
   GERÇEK HERE ile doğrulanmadı.

   API:
     here3d.load(key)               → Promise<H>  (betikler sırayla: core, service, harp, ui, mapevents + ui.css)
     here3d.create(el, opts)        → denetleyici { setView, setOverlays, resize, dispose, raw }
        opts: { lat, lon, zoom:17, tilt:60, heading:0, key, onError }
     ctl.setView({ lat, lon, zoom, tilt, heading }[, animate])
     ctl.setOverlays({ parcel:[[x,y]…], env:[[x,y]…], iso:{5:[ring…],10:[…],15:[…]}, radius:m,
                       markers:[{lat,lon,label}], origin:{lat,lon}, originMarker:true })
        Halkalar yerel metredir (x doğu / y kuzey); origin = yerel koordinatın başlangıcı (gis.makeProj(origin).inv ile enlem-boylama çevrilir).
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const here3d = (App.here3d = {});

  const BASE = 'https://js.api.here.com/v3/3.1/';
  const SCRIPTS = ['mapsjs-core.js', 'mapsjs-service.js', 'mapsjs-harp.js', 'mapsjs-ui.js', 'mapsjs-mapevents.js'];
  const CSS = 'mapsjs-ui.css';
  here3d.BASE = BASE;
  here3d.SCRIPTS = SCRIPTS.slice();
  here3d.TIMEOUT = 20000;

  // yer paleti: yarı saydam dolgu + belirgin çizgi (iz sürülebilir; Tailwind benzeri kırmızı / mavi / yeşil-turuncu tonlar)
  here3d.STYLE = {
    parcel: { fill: 'rgba(220,38,38,0.32)', stroke: '#DC2626', lw: 3 },
    env: { fill: 'rgba(37,99,235,0.20)', stroke: '#2563EB', lw: 2 },
    iso: { 5: { fill: 'rgba(22,163,74,0.22)', stroke: '#16A34A', lw: 1.5 }, 10: { fill: 'rgba(234,179,8,0.18)', stroke: '#CA8A04', lw: 1.5 }, 15: { fill: 'rgba(234,88,12,0.14)', stroke: '#EA580C', lw: 1.5 } },
    radius: { fill: 'rgba(0,0,0,0)', stroke: '#475569', lw: 1.5, dash: [4, 4] },
    origin: { fill: 'rgba(15,23,42,0.9)', stroke: '#FFFFFF', lw: 2 },
  };

  const hasH = () => {
    const H = window.H;
    return !!(H && H.service && H.Map && H.Map.EngineType && H.mapevents && H.ui && H.geo && H.map);
  };
  here3d.loaded = hasH;

  /* ---------------- yükleme ---------------- */
  let loading = null;
  function addScript(src, ms, made) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      let done = false;
      const fin = (err) => { if (done) return; done = true; clearTimeout(tm); if (err) { try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) { /* yok say */ } reject(err); } else resolve(); };
      const name = src.slice(src.lastIndexOf('/') + 1);
      const tm = setTimeout(() => fin(new Error('HERE harita betiği zaman aşımına uğradı (' + name + '). Bağlantınızı kontrol edip yeniden deneyin.')), ms);
      s.async = false;
      s.src = src;
      s.setAttribute('data-here3d', '1');
      s.onload = () => fin(null);
      s.onerror = () => fin(new Error('HERE harita betiği yüklenemedi (' + name + '). Ağ bağlantınızı ya da içerik engelleyicinizi kontrol edin.'));
      made.push(s);
      document.head.appendChild(s);
    });
  }
  here3d.load = function (key) {
    key = String(key == null ? '' : key).trim();
    if (!key) return Promise.reject(new Error('HERE API anahtarı girilmedi.'));
    if (hasH()) return Promise.resolve(window.H);
    if (loading) return loading;
    const made = [];
    try {
      if (!document.querySelector || !document.querySelector('link[data-here3d]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = BASE + CSS; l.setAttribute('data-here3d', '1');
        document.head.appendChild(l);
      }
    } catch (e) { /* stil yüklenemese de harita çalışır */ }
    let p = Promise.resolve();
    SCRIPTS.forEach((n) => { p = p.then(() => addScript(BASE + n, here3d.TIMEOUT, made)); });
    loading = p.then(() => {
      if (!hasH()) throw new Error('HERE harita kitaplığı yüklendi ama beklenen nesneler (H.service, H.Map, H.mapevents, H.ui) bulunamadı.');
      return window.H;
    }).catch((e) => { loading = null; throw e; });
    return loading;
  };

  /* ---------------- yardımcılar ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function noopController() {
    const n = function () {};
    return { setView: n, setOverlays: n, resize: n, dispose: n, raw: () => null, dead: true };
  }

  /* ---------------- harita ---------------- */
  here3d.create = function (el, o) {
    o = o || {};
    const fail = (e) => {
      if (typeof o.onError === 'function') { try { o.onError(e); } catch (x) { /* yok say */ } return noopController(); }
      throw e;
    };
    if (!el) return fail(new Error('HERE haritası için bir kapsayıcı öğe gerekli.'));
    if (!hasH()) return fail(new Error('HERE harita kitaplığı yüklenmedi. Önce here3d.load(anahtar) çağrılmalı.'));
    const key = String(o.key == null ? '' : o.key).trim();
    if (!key) return fail(new Error('HERE API anahtarı girilmedi.'));
    const H = window.H;
    const lat0 = num(o.lat, 0), lon0 = num(o.lon, 0);
    const view = { lat: lat0, lon: lon0, zoom: clamp(num(o.zoom, 17), 2, 22), tilt: clamp(num(o.tilt, 60), 0, 75), heading: ((num(o.heading, 0) % 360) + 360) % 360 };
    let map = null, behavior = null, ui = null, group = null, bubble = null, ro = null, onWin = null, onTap = null, dead = false;

    const disposeAll = () => {
      dead = true;
      const safe = (fn) => { try { fn(); } catch (e) { /* yok say */ } };
      if (onWin) safe(() => window.removeEventListener('resize', onWin));
      if (ro) safe(() => ro.disconnect());
      if (group) { safe(() => { if (onTap) group.removeEventListener('tap', onTap); }); safe(() => group.removeAll()); if (map) safe(() => map.removeObject(group)); }
      if (ui && ui.dispose) safe(() => ui.dispose());
      if (behavior && behavior.dispose) safe(() => behavior.dispose());
      if (map && map.dispose) safe(() => map.dispose());
      group = bubble = ro = onWin = onTap = ui = behavior = map = null;
    };

    try {
      const engineType = H.Map.EngineType['HARP'];
      const platform = new H.service.Platform({ apikey: key });
      const layers = platform.createDefaultLayers({ engineType: engineType });
      map = new H.Map(el, layers.vector.normal.map, { engineType: engineType, zoom: view.zoom, center: { lat: view.lat, lng: view.lon }, pixelRatio: window.devicePixelRatio || 1 });
      map.getViewModel().setLookAtData({ position: { lat: view.lat, lng: view.lon }, zoom: view.zoom, tilt: view.tilt, heading: view.heading });
      behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
      ui = H.ui.UI.createDefault(map, layers);
      onWin = function () { if (map) map.getViewPort().resize(); };
      window.addEventListener('resize', onWin);
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onWin); ro.observe(el); }
    } catch (e) {
      disposeAll();
      return fail(new Error('HERE haritası kurulamadı: ' + (e && e.message ? e.message : e)));
    }

    const ctl = {
      setView: function (v, animate) {
        if (dead) return;
        v = v || {};
        if (typeof v.lat === 'number' && isFinite(v.lat)) view.lat = v.lat;
        if (typeof v.lon === 'number' && isFinite(v.lon)) view.lon = v.lon;
        if (typeof v.zoom === 'number' && isFinite(v.zoom)) view.zoom = clamp(v.zoom, 2, 22);
        if (typeof v.tilt === 'number' && isFinite(v.tilt)) view.tilt = clamp(v.tilt, 0, 75);
        if (typeof v.heading === 'number' && isFinite(v.heading)) view.heading = ((v.heading % 360) + 360) % 360;
        map.getViewModel().setLookAtData({ position: { lat: view.lat, lng: view.lon }, zoom: view.zoom, tilt: view.tilt, heading: view.heading }, !!animate);
      },

      setOverlays: function (ov) {
        if (dead) return;
        ov = ov || {};
        if (group) { try { if (onTap) group.removeEventListener('tap', onTap); group.removeAll(); map.removeObject(group); } catch (e) { /* yok say */ } }
        if (bubble && ui) { try { ui.removeBubble(bubble); } catch (e) { /* yok say */ } bubble = null; }
        group = new H.map.Group();
        map.addObject(group);
        const org = ov.origin && isFinite(ov.origin.lat) && isFinite(ov.origin.lon) ? ov.origin : { lat: lat0, lon: lon0 };
        const proj = gis.makeProj(org.lat, org.lon);
        const S = here3d.STYLE;
        let z = 0;
        const add = (obj) => { obj.setZIndex(z++); group.addObject(obj); };
        const ring = (pts) => {
          const ls = new H.geo.LineString();
          pts.forEach((p) => { const q = proj.inv(p[0], p[1]); ls.pushLatLngAlt(q[0], q[1], 0); });
          return ls;
        };
        const poly = (pts, st) => {
          if (!pts || pts.length < 3) return;
          add(new H.map.Polygon(new H.geo.Polygon(ring(pts)), { style: { fillColor: st.fill, strokeColor: st.stroke, lineWidth: st.lw } }));
        };
        // büyükten küçüğe: 15 dk altta, 5 dk üstte
        if (ov.iso) [15, 10, 5].forEach((m) => { (ov.iso[m] || []).forEach((r) => poly(r, S.iso[m])); });
        if (ov.radius > 0) {
          add(new H.map.Circle({ lat: org.lat, lng: org.lon }, ov.radius, { style: { fillColor: S.radius.fill, strokeColor: S.radius.stroke, lineWidth: S.radius.lw, lineDash: S.radius.dash } }));
        }
        poly(ov.env, S.env);
        poly(ov.parcel, S.parcel);
        if (ov.originMarker !== false && ov.origin) {
          add(new H.map.Circle({ lat: org.lat, lng: org.lon }, 4, { style: { fillColor: S.origin.fill, strokeColor: S.origin.stroke, lineWidth: S.origin.lw } }));
        }
        (ov.markers || []).forEach((m) => {
          if (!m || !isFinite(m.lat) || !isFinite(m.lon)) return;
          const mk = new H.map.Marker({ lat: m.lat, lng: m.lon });
          mk.setData(m.label == null ? '' : String(m.label));
          add(mk);
        });
        onTap = function (evt) {
          const t = evt && evt.target;
          const label = t && t.getData ? t.getData() : null;
          if (!label || !ui) return;
          if (bubble) { try { ui.removeBubble(bubble); } catch (e) { /* yok say */ } }
          bubble = new H.ui.InfoBubble(t.getGeometry(), { content: '<div style="font:13px/1.35 system-ui,sans-serif;padding:2px 4px">' + esc(label) + '</div>' });
          ui.addBubble(bubble);
        };
        group.addEventListener('tap', onTap);
      },

      resize: function () { if (!dead && map) map.getViewPort().resize(); },
      dispose: function () { if (!dead) disposeAll(); },
      raw: function () { return map; },
    };
    return ctl;
  };
})();
