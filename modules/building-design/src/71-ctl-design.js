/* ==========================================================================
   71-ctl-design.js — Tasarım Üretici yan etkileri: görünüm, karma ve plan ayarları, alternatif seçimi, dışa aktarma
   Dışa aktarma: PNG · PDF · SVG · DXF (App.dxf) · IFC4 (App.ifc) · XLSX (App.xlsx) · GeoJSON.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const D = App.design;
  const get = () => App.store.get();

  /* ---------------- görünüm ---------------- */
  const DV = ctl.makeView('dsn', 'archtools.view.dsn', ['mode', 'grid', 'dims', 'yaw', 'pitch', 'zx']);
  ctl.dsnView = DV.set;
  ctl.loadDsnView = function () {
    DV.load(function (o) {
      const p = {};
      if (['vaziyet', 'tipik', 'bodrum', 'kutle', 'kiyas'].indexOf(o.mode) >= 0) p.mode = o.mode;
      ['grid', 'dims'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      if (typeof o.yaw === 'number') p.yaw = U.clamp(o.yaw, -85, 85);
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 20, 70);
      if (typeof o.zx === 'number') p.zx = U.clamp(o.zx, 1, 3);
      return p;
    });
  };

  /* ---------------- parametreler ---------------- */
  ctl.dsnSet = (patch) => ctl.dispatch({ type: 'DESIGN_SET', patch: patch });
  let live = false;
  ctl.dsnLive = function (patch) {
    if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); }
    ctl.dispatch({ type: 'DESIGN_SET_LIVE', patch: patch });
  };
  ctl.dsnLiveEnd = function () { live = false; };
  ctl.dsnSelect = function (id) { ctl.dsnSet({ sel: id }); };
  ctl.dsnArea = function (type, v) { ctl.dsnSet({ areas: { [type]: Math.round(v) } }); };
  // bir türün payını değiştirirken kalan türler oransal küçülür / büyür; toplam %100 kalır
  ctl.dsnMixLive = function (type, share) {
    const mix = (get().project.design || D.defaults()).mix;
    const ids = D.MIX_TYPES.map((t) => t.id);
    const v = U.clamp(share, 0, 1);
    const others = ids.filter((k) => k !== type);
    const sum = others.reduce((s, k) => s + (mix[k] || 0), 0);
    const out = {};
    ids.forEach((k) => { out[k] = k === type ? v : sum > 0 ? ((mix[k] || 0) / sum) * (1 - v) : (1 - v) / others.length; });
    ctl.dsnLive({ mix: out });
  };

  /* ---------------- dışa aktarma ---------------- */
  const blobText = (name, text, type) => ctl.saveText(name, text, type);

  // D.layers çıktısını DXF belgesine koy: üç pafta yan yana
  function dxfDoc(P, dc) {
    const alt = dc.alt;
    const doc = { title: P.meta.name, units: 'm', layers: {}, entities: [] };
    const style = D.LAYER_STYLE || {};
    Object.keys(style).forEach((k) => { doc.layers[k] = { color: style[k].color, label: style[k].label }; });
    doc.layers.YAZI = doc.layers.YAZI || { color: 7, label: 'Yazı' };
    let x = 0;
    [['vaziyet', 'VAZIYET'], ['tipik', 'TIPIK KAT'], ['bodrum', 'BODRUM KAT']].forEach((sh) => {
      const L = D.layers(alt, { sheet: sh[0], parcel: P.site.parcel });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      L.forEach((e) => (e.pts || (e.at ? [e.at] : [])).forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
      if (!isFinite(x0)) return;
      const dx = x - x0, dy = -y0;
      L.forEach((e) => {
        const o = Object.assign({}, e);
        if (e.pts) o.pts = e.pts.map((q) => [q[0] + dx, q[1] + dy]);
        if (e.at) o.at = [e.at[0] + dx, e.at[1] + dy];
        if (!doc.layers[o.layer]) doc.layers[o.layer] = { color: 7 };
        doc.entities.push(o);
      });
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [x, y1 - y0 + 4], text: sh[1] + ' · ' + alt.label, h: 1.2 });
      x += x1 - x0 + 40;
    });
    return doc;
  }

  function xlsxBook(P, dc) {
    const alt = dc.alt;
    const H = { b: true, fill: '#EDEEF1', border: 'thin' };
    const T = { b: true, size: 14 };
    const rows1 = [[{ v: P.meta.name + ' · ' + alt.label, s: T }], [{ v: 'Tasarım üretici · alan ve program tablosu · ' + U.today(), s: { i: true, color: '#666666' } }], [], [{ v: 'Grup', s: H }, { v: 'Kalem', s: H }, { v: 'Değer', s: H }, { v: 'Birim', s: H }]];
    dc.table.forEach((r) => rows1.push([r.g, r.k, { v: r.v, s: { fmt: r.u === 'm²' ? 'dec' : r.u === 'adet' ? 'int' : 'dec2' } }, r.u || '']));
    const ut = alt.unitTotals;
    const rows2 = [[{ v: 'Tür', s: H }, { v: 'Adet', s: H }, { v: 'Toplam brüt (m²)', s: H }, { v: 'Ortalama brüt (m²)', s: H }]];
    const types = Object.keys(ut.byType).sort();
    types.forEach((t, i) => {
      const r = i + 2;
      rows2.push([t, { v: ut.byType[t], s: { fmt: 'int' } }, { v: (ut.grossByType && ut.grossByType[t]) || 0, s: { fmt: 'dec' } }, { f: 'IF(B' + r + '=0,0,C' + r + '/B' + r + ')', s: { fmt: 'dec' } }]);
    });
    const last = types.length + 1;
    rows2.push([{ v: 'Toplam', s: { b: true } }, { f: 'SUM(B2:B' + last + ')', s: { b: true, fmt: 'int' } }, { f: 'SUM(C2:C' + last + ')', s: { b: true, fmt: 'dec' } }, { f: 'IF(B' + (last + 1) + '=0,0,C' + (last + 1) + '/B' + (last + 1) + ')', s: { b: true, fmt: 'dec' } }]);
    const rows3 = [['Seçenek', 'Skor', 'Not', 'Kat', 'Daire', 'Verim', 'Otopark (yer)', 'Otopark (gerekli)', 'TAKS', 'KAKS', 'İnşaat (m²)'].map((v) => ({ v: v, s: H }))];
    dc.alts.forEach((a) => rows3.push([a.label, { v: Math.round(a.score), s: { fmt: 'int' } }, a.grade, a.floors, a.unitTotals.total, { v: a.plan.areas.efficiency, s: { fmt: 'pct' } }, a.basement.capacity, a.basement.need, { v: a.metrics.taks, s: { fmt: 'dec2' } }, { v: a.metrics.kaks, s: { fmt: 'dec2' } }, { v: a.built, s: { fmt: 'dec' } }]));
    return {
      title: P.meta.name, author: 'archtools',
      sheets: [
        { name: 'Alan Programı', cols: [{ w: 14 }, { w: 40 }, { w: 14 }, { w: 8 }], rows: rows1, freeze: { row: 4, col: 0 } },
        { name: 'Daire Listesi', cols: [{ w: 12 }, { w: 10 }, { w: 20 }, { w: 22 }], rows: rows2 },
        { name: 'Alternatifler', cols: [{ w: 28 }, { w: 8 }, { w: 6 }, { w: 6 }, { w: 8 }, { w: 8 }, { w: 14 }, { w: 16 }, { w: 8 }, { w: 8 }, { w: 14 }], rows: rows3, freeze: { row: 1, col: 1 } },
      ],
    };
  }

  function geoFeatures(P, dc) {
    const F = [];
    const alt = dc.alt;
    const poly = (layer, pts, props) => ({ type: 'poly', layer: layer, pts: pts, props: props || {} });
    F.push(poly('parsel', P.site.parcel, { areaM2: Math.round(alt.R.A) }));
    if (alt.R.env) F.push(poly('zarf', alt.R.env));
    alt.R.pieces.forEach((p, i) => F.push(poly('kutle', p, { floors: alt.floors, heightM: Math.round(alt.height * 10) / 10, wing: i + 1 })));
    return F;
  }

  ctl.dsnExport = function (kind) {
    const st = get(), P = st.project;
    const dc = App.dsnCtx(P);
    if (!dc.ok) { ctl.toast('Önce parsel ve bir tasarım alternatifi gerekli.', 'error'); return; }
    const labels = { png: 'PNG', pdf: 'PDF', svg: 'SVG', dxf: 'DXF', ifc: 'IFC', xlsx: 'Excel', geojson: 'GeoJSON', kml: 'KML' };
    ctl.dispatch({ type: 'UI', patch: { busy: labels[kind] || kind } });
    let p;
    try { p = Promise.resolve(run(kind, P, dc, st)); } catch (e) { p = Promise.reject(e); }
    p.then((r) => ctl.report(r, (labels[kind] || kind) + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };

  function run(kind, P, dc, st) {
    const slug = U.slug(P.meta.name) + '-tasarim';
    const view = Object.assign({}, st.ui.dsn);
    if (kind === 'png' || kind === 'pdf' || kind === 'svg') {
      const sc = App.dsnScene.scene(P, dc, dc.alt, view, false);
      if (kind === 'svg') return blobText(slug + '.svg', App.geoExport.svg(sc.prims, sc.W, sc.H, P.meta.name), 'image/svg+xml');
      return App.sheet.exportScene(sc.prims, sc.W, sc.H, slug, kind);
    }
    if (kind === 'dxf') {
      if (!App.dxf) throw new Error('DXF yazıcısı yüklenemedi.');
      return blobText(slug + '.dxf', App.dxf.build(dxfDoc(P, dc)), 'application/dxf');
    }
    if (kind === 'ifc') {
      if (!App.ifc) throw new Error('IFC yazıcısı yüklenemedi.');
      return blobText(slug + '.ifc', App.ifc.build(D.toIfcModel(dc.alt, P)), 'application/x-step');
    }
    if (kind === 'xlsx') return App.xlsx.save(App.xlsx.build(xlsxBook(P, dc)), slug + '.xlsx');
    if (kind === 'geojson' || kind === 'kml') {
      const e = dc.e;
      const lat0 = e ? e.data.lat0 : P.site.loc.lat, lon0 = e ? e.data.lon0 : P.site.loc.lon;
      if (kind === 'kml') return blobText(slug + '.kml', App.geoExport.kml(geoFeatures(P, dc), lat0, lon0, P.meta.name), 'application/vnd.google-earth.kml+xml');
      return blobText(slug + '.geojson', App.geoExport.geojson(geoFeatures(P, dc), lat0, lon0, { module: 'tasarim-uretici', alternative: dc.alt.label }), 'application/geo+json');
    }
    throw new Error('Bilinmeyen biçim.');
  }
  ctl.exporters.tasarim = (kind) => ctl.dsnExport(kind === 'png' ? 'png' : 'pdf');

  /* kısayol: asistan eylemleri */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'dsnTab') { ctl.dsnView({ tab: a.tab }); return; }
    baseRun(a);
  };
})();
