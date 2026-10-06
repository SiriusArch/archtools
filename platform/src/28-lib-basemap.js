/* ==========================================================================
   28-lib-basemap.js — Ortak harita altlığı (OpenStreetMap · HERE · Yandex)
   Vaziyet Planı ve Mekân Etüdü, seçili konumun (project.site.loc) raster haritasını çizimin altına serer;
   çizim aynı metre ölçeğinde harita üzerinde yapılır. Kuzey yukarıdadır.
   Kullanım : App.basemap.prims({ loc, cfg, X, Y, win })  → { prims, attrib }
              App.basemap.preload(prims)                 → Promise (dışa aktarma için karoları tuvale hazırlar)
   Veri     : cfg = { on, prov: 'yandex'|'osm'|'here', view: '2d'|'3d', sat, op, gray }   (her aracın belgesinde durur; JSON'a girer)
   Öncelik  : Yandex → OpenStreetMap → HERE (sağlayıcı sırası ve varsayılan budur).
   2B / 3B  : Yandex için. 2B = düz plan karosu (binalar yalnızca taban izi; çizimle birebir örter).
              3B = Yandex'in bina gövdeli (hacimli) karosu; gövde yana yattığı için taban izi çizimle kaymış görünür. Uydu yalnızca 2B.
   Dünya    : (x doğu, y güney) metre, başlangıç = loc. (Vaziyet Planı ile aynı yön: y aşağı.)
   Anahtarlar yalnızca bu tarayıcının localStorage'ında durur (HERE: archtools.here.key · Yandex: archtools.yandex.key);
   proje dosyasına yazılmaz.
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const bm = (App.basemap = {});
  const D2R = Math.PI / 180;

  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch (e) { /* yok say */ } };
  bm.hereKey = () => (App.here && App.here.getKey ? App.here.getKey() : String(lsGet('archtools.here.key') || '').trim());
  bm.setHereKey = (k) => { if (App.here && App.here.setKey) App.here.setKey(k); else lsSet('archtools.here.key', String(k || '').trim()); };
  bm.yandexKey = () => String(lsGet('archtools.yandex.key') || '').trim();
  bm.setYandexKey = (k) => lsSet('archtools.yandex.key', String(k || '').trim());

  /* ---------- sağlayıcılar ---------- */
  const E = 0.0818191908426; // WGS84 birinci dış merkezkaçlık (Yandex: eliptik Mercator, EPSG:3395)
  bm.PROVIDERS = [
    { id: 'yandex', label: 'Yandex Haritalar', short: 'Yandex', max: 19, merc: 'ell', attr: '© Yandex', sat: true, key: 'yandex', keyOptional: true, views: true },
    { id: 'osm', label: 'OpenStreetMap', short: 'OSM', max: 19, merc: 'sph', attr: '© OpenStreetMap katkıcıları', sat: false },
    { id: 'here', label: 'HERE', short: 'HERE', max: 20, merc: 'sph', attr: '© HERE', sat: true, key: 'here' },
  ];
  // sıradaki (öncelik sırasına göre) sağlayıcı: açılmayan sağlayıcıdan sonra denenecek olan
  bm.nextProvider = (id) => { const i = bm.PROVIDERS.findIndex((p) => p.id === id); return bm.PROVIDERS[i + 1] || null; };
  bm.provider = (id) => bm.PROVIDERS.find((p) => p.id === id) || bm.PROVIDERS[0];
  bm.VIEWS = [{ v: '2d', label: '2B' }, { v: '3d', label: '3B' }];

  bm.defaults = () => ({ on: false, prov: 'yandex', view: '2d', sat: false, op: 0.8, gray: false });
  bm.clean = function (m) {
    const d = bm.defaults();
    const o = Object.assign({}, d, m || {});
    o.on = !!o.on;
    o.prov = bm.PROVIDERS.some((p) => p.id === o.prov) ? o.prov : d.prov;
    o.view = o.view === '3d' && bm.provider(o.prov).views ? '3d' : '2d';
    o.sat = !!o.sat && bm.provider(o.prov).sat && o.view === '2d';
    o.op = U.clamp(Math.round((Number(o.op) || d.op) * 20) / 20, 0.2, 1);
    o.gray = !!o.gray;
    return o;
  };

  const urlOf = function (cfg, z, x, y) {
    const p = bm.provider(cfg.prov);
    if (p.id === 'osm') return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    if (p.id === 'here') {
      const k = bm.hereKey();
      if (!k) return null;
      return 'https://maps.hereapi.com/v3/base/mc/' + z + '/' + x + '/' + y + '/png8?style=' + (cfg.sat ? 'satellite.day' : 'explore.day') + '&lang=tr&apiKey=' + encodeURIComponent(k);
    }
    // Yandex — elipsoidal Mercator (EPSG:3395). Karo sunucusu 1–4 arasında dağıtılır.
    const sv = ((x + y) % 4) + 1;
    if (cfg.sat) return 'https://sat0' + sv + '.maps.yandex.net/tiles?l=sat&x=' + x + '&y=' + y + '&z=' + z + '&lang=tr_TR';
    if (cfg.view === '2d') return 'https://vec0' + sv + '.maps.yandex.net/tiles?l=map&x=' + x + '&y=' + y + '&z=' + z + '&scale=1&lang=tr_TR';
    // 3B: bina gövdeli (hacimli) harita; anahtar varsa resmî Karo API'si, yoksa genel çizici
    const k = bm.yandexKey();
    if (k) return 'https://tiles.api-maps.yandex.ru/v1/tiles/?l=map&x=' + x + '&y=' + y + '&z=' + z + '&lang=tr_TR&projection=wgs84_mercator&apikey=' + encodeURIComponent(k);
    return 'https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x=' + x + '&y=' + y + '&z=' + z + '&scale=1&lang=tr_TR';
  };
  // anahtar gerekiyor ama yok mu?
  bm.needsKey = (cfg) => (cfg.prov === 'here' && !bm.hereKey());

  /* ---------- Mercator (küresel ve eliptik) karo ↔ enlem/boylam ---------- */
  const atanh = (v) => 0.5 * Math.log((1 + v) / (1 - v));
  function llToTile(merc, lat, lon, z) {
    const n = Math.pow(2, z);
    const x = ((lon + 180) / 360) * n;
    const phi = lat * D2R;
    let psi = Math.log(Math.tan(Math.PI / 4 + phi / 2));
    if (merc === 'ell') psi -= E * atanh(E * Math.sin(phi));
    return [x, ((1 - psi / Math.PI) / 2) * n];
  }
  function tileToLL(merc, x, y, z) {
    const n = Math.pow(2, z);
    const lon = (x / n) * 360 - 180;
    const psi = Math.PI * (1 - (2 * y) / n);
    if (merc !== 'ell') return [Math.atan(Math.sinh(psi)) / D2R, lon];
    const t = Math.exp(-psi);
    let phi = Math.PI / 2 - 2 * Math.atan(t);
    for (let i = 0; i < 8; i++) {
      const s = E * Math.sin(phi);
      phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - s) / (1 + s), E / 2));
    }
    return [phi / D2R, lon];
  }
  bm.llToTile = llToTile; bm.tileToLL = tileToLL;

  /* ---------- karo primitifleri ----------
     o: { loc:{lat,lon}, cfg, ppm (px / metre), win:{x0,y0,x1,y1} (dünya, m), X(wx), Y(wy) } */
  bm.prims = function (o) {
    const cfg = bm.clean(o.cfg);
    const loc = o.loc;
    if (!cfg.on || !loc || loc.src === 'demo' || !isFinite(loc.lat) || !isFinite(loc.lon)) return { prims: [], attrib: '', ok: false };
    const pv = bm.provider(cfg.prov);
    if (bm.needsKey(cfg)) return { prims: [], attrib: '', ok: false, reason: 'key' };
    const proj = App.gis.makeProj(loc.lat, loc.lon);
    const toLL = (wx, wy) => proj.inv(wx, -wy);              // dünya (doğu, güney) → [lat, lon]
    const toW = (lat, lon) => { const q = proj.fwd(lat, lon); return [q[0], -q[1]]; };
    const metersPerPx0 = 156543.03392 * Math.cos(loc.lat * D2R);
    let z = Math.ceil(Math.log2(Math.max(1e-6, metersPerPx0 * o.ppm * (o.sharp || 1))));
    z = U.clamp(z, 3, pv.max);
    const w = o.win;
    let a, b, x0, x1, y0, y1;
    for (let guard = 0; guard < 8; guard++) {
      const nw = toLL(w.x0, w.y0), se = toLL(w.x1, w.y1);
      a = llToTile(pv.merc, nw[0], nw[1], z); b = llToTile(pv.merc, se[0], se[1], z);
      x0 = Math.floor(Math.min(a[0], b[0])); x1 = Math.floor(Math.max(a[0], b[0]));
      y0 = Math.floor(Math.min(a[1], b[1])); y1 = Math.floor(Math.max(a[1], b[1]));
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 64 || z <= 3) break;
      z--;
    }
    const n = Math.pow(2, z);
    const prims = [];
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx++) {
        const txw = ((tx % n) + n) % n;
        const href = urlOf(cfg, z, txw, ty);
        if (!href) continue;
        const A = toW.apply(null, tileToLL(pv.merc, tx, ty, z)), B = toW.apply(null, tileToLL(pv.merc, tx + 1, ty + 1, z));
        const px = o.X(A[0]), py = o.Y(A[1]), pw = o.X(B[0]) - px, ph = o.Y(B[1]) - py;
        prims.push({ t: 'img', bm: true, href: href, ik: 'bm:' + href, x: px - 0.3, y: py - 0.3, w: pw + 0.6, h: ph + 0.6, opacity: cfg.op, gray: cfg.gray });
      }
    }
    return { prims: prims, attrib: pv.attr, ok: true, z: z };
  };

  /* ---------- dışa aktarma için karoları tuvale hazırla ---------- */
  bm.failed = 0;
  bm.preload = function (prims) {
    const list = [];
    const seen = {};
    const walk = (ps) => ps.forEach((p) => {
      if (p.t === 'g' && p.items) walk(p.items);
      else if (p.t === 'img' && p.bm && !seen[p.ik]) { seen[p.ik] = 1; list.push(p); }
    });
    walk(prims);
    bm.failed = 0;
    if (!list.length) return Promise.resolve(0);
    const cache = App.board.imgCache;
    const jobs = list.map((p) => {
      const have = cache[p.ik];
      if (have && have.complete && have.naturalWidth) return Promise.resolve();
      return new Promise((res) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => { cache[p.ik] = el; res(); };
        el.onerror = () => { bm.failed++; res(); };
        el.src = p.href;
      });
    });
    return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 15000))]).then(() => bm.failed);
  };

  /* ---------- durum yoklaması: tek karo yüklenebiliyor mu? ---------- */
  bm.state = {};
  bm.probe = function (cfg, loc, done) {
    cfg = bm.clean(cfg);
    if (!loc || loc.src === 'demo') return;
    const pv = bm.provider(cfg.prov);
    const t = llToTile(pv.merc, loc.lat, loc.lon, 15);
    const href = urlOf(cfg, 15, Math.floor(t[0]), Math.floor(t[1]));
    if (!href) return;
    const key = cfg.prov + (cfg.sat ? ':sat' : '') + ':' + (cfg.prov === 'yandex' ? cfg.view + (bm.yandexKey() ? 'k' : 'nk') : '') + ':' + (cfg.prov === 'here' ? bm.hereKey().slice(0, 4) : '');
    if (bm.state[key] && bm.state[key].display !== 'wait') { return; }
    bm.state[key] = { display: 'wait', cors: 'wait' };
    const fin = () => { if (done) done(); };
    const a = new Image();
    a.onload = () => { bm.state[key].display = 'ok'; fin(); };
    a.onerror = () => { bm.state[key].display = 'err'; fin(); };
    a.src = href;
    const b = new Image();
    b.crossOrigin = 'anonymous';
    b.onload = () => { bm.state[key].cors = 'ok'; fin(); };
    b.onerror = () => { bm.state[key].cors = 'err'; fin(); };
    b.src = href;
  };
  bm.status = function (cfg) {
    cfg = bm.clean(cfg);
    const key = cfg.prov + (cfg.sat ? ':sat' : '') + ':' + (cfg.prov === 'yandex' ? cfg.view + (bm.yandexKey() ? 'k' : 'nk') : '') + ':' + (cfg.prov === 'here' ? bm.hereKey().slice(0, 4) : '');
    return bm.state[key] || null;
  };

  /* ---------- seçili konum ---------- */
  bm.loc = function (P) {
    const s = P && P.site;
    return s && s.loc && s.loc.src !== 'demo' && isFinite(s.loc.lat) ? s.loc : null;
  };
})();
