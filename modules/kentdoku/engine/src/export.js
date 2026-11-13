// Kentdoku - dışa aktarım: SVG, PNG, PDF, DXF (OBJ/GLB view3d.js içinde)

import { ROAD_W, PATH_CLASSES } from './styles.js';

export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function exportSVG(svgString) {
  return new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgString], { type: 'image/svg+xml' });
}

export async function exportPNG(svgString, wM, hM, longSidePx = 4000) {
  const k = longSidePx / Math.max(wM, hM);
  const W = Math.round(wM * k), H = Math.round(hM * k);
  const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG görüntüye çevrilemedi')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, 0, 0, W, H);
    return await new Promise(res => c.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

const TR = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U', '–': '-', '…': '...' };
const ascii = s => s.replace(/[çÇğĞıİöÖşŞüÜ–…]/g, c => TR[c]);

/** Vektör PDF. Sayfa boyutu = alan / ölçek (ör. 1000 m, 1:2000 -> 500 mm). */
export async function exportPDF(svgString, wM, hM, scale) {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');
  const mmW = wM * 1000 / scale, mmH = hM * 1000 / scale;
  const doc = new jsPDF({ unit: 'mm', format: [mmW, mmH], orientation: mmW > mmH ? 'landscape' : 'portrait', compress: true });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML = svgString;
  document.body.appendChild(holder);
  try {
    const svg = holder.querySelector('svg');
    // standart PDF yazı tipleri Türkçe harfleri içermez; etiketler sadeleştirilir
    svg.querySelectorAll('text').forEach(t => { t.textContent = ascii(t.textContent); });
    await doc.svg(svg, { x: 0, y: 0, width: mmW, height: mmH });
  } finally { holder.remove(); }
  return doc.output('blob');
}

/** AutoCAD R12 DXF. Birim metre. Binalar "kalınlık" (thickness) ile yükseklik taşır. */
export function exportDXF(data, { withHeights = true, topo = null } = {}) {
  const o = [];
  const p = (c, v) => o.push(c, v);
  const layers = [['ZEMIN', 8], ['BINALAR', 7], ['YOLLAR', 9], ['YAYA_YOLLARI', 8], ['RAYLI_SISTEM', 6], ['SU', 5], ['YESIL', 3], ['TARIM', 2], ['DURAKLAR', 4], ['ESYUKSELTI', 30]];
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES');
  p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 1);
  p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, '0.0');
  p(0, 'ENDTAB');
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, layers.length);
  for (const [n, c] of layers) { p(0, 'LAYER'); p(2, n); p(70, 0); p(62, c); p(6, 'CONTINUOUS'); }
  p(0, 'ENDTAB'); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'ENTITIES');
  const f = n => (Math.round(n * 1000) / 1000).toString();
  const poly = (layer, pts, closed, thickness, width) => {
    if (pts.length < 2) return;
    p(0, 'POLYLINE'); p(8, layer); p(66, 1); p(70, closed ? 1 : 0);
    if (thickness) p(39, f(thickness));
    if (width) { p(40, f(width)); p(41, f(width)); }
    for (const q of pts) { p(0, 'VERTEX'); p(8, layer); p(10, f(q[0])); p(20, f(q[1])); p(30, '0.0'); }
    p(0, 'SEQEND'); p(8, layer);
  };
  const rings = (layer, mp, thickness) => {
    for (const pg of mp) for (const ring of pg) poly(layer, ring.slice(0, -1), true, thickness);
  };
  const { w, h } = data.meta;
  poly('ZEMIN', [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], true);
  for (const g of data.green) rings(g.kind === 'tarim' ? 'TARIM' : 'YESIL', g.mp);
  for (const g of data.water) rings('SU', g.mp);
  for (const l of data.waterLines) poly('SU', l.coords, false);
  for (const r of data.roads) {
    const layer = r.subtype === 'rail' ? 'RAYLI_SISTEM' : PATH_CLASSES.has(r.cls) ? 'YAYA_YOLLARI' : 'YOLLAR';
    poly(layer, r.coords, false, 0, layer === 'YOLLAR' ? (ROAD_W[r.cls] || 4) : 0);
  }
  for (const b of data.buildings) rings('BINALAR', b.mp, withHeights ? b.height : 0);
  for (const s of data.stops) { p(0, 'POINT'); p(8, 'DURAKLAR'); p(10, f(s.p[0])); p(20, f(s.p[1])); p(30, '0.0'); }
  if (topo && topo.contours) for (const lv of topo.contours.levels) for (const [a, b] of lv.segs) {
    p(0, 'LINE'); p(8, 'ESYUKSELTI'); p(10, f(a[0])); p(20, f(a[1])); p(30, f(lv.z)); p(11, f(b[0])); p(21, f(b[1])); p(31, f(lv.z));
  }
  p(0, 'ENDSEC'); p(0, 'EOF');
  return new Blob([o.join('\r\n') + '\r\n'], { type: 'application/dxf' });
}

/** GeoJSON (WGS84). QGIS / ArcGIS için; her özellik "katman" alanı taşır. */
export function exportGeoJSON(data, topo) {
  const { lat, lon } = data.meta, kx = 111320 * Math.cos(lat * Math.PI / 180), KY = 110574;
  const ll = p => [+(p[0] / kx + lon).toFixed(7), +(p[1] / KY + lat).toFixed(7)];
  const poly = (mp, props) => ({ type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: mp.map(pg => pg.map(r => r.map(ll))) } });
  const line = (c, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: c.map(ll) } });
  const f = [];
  for (const b of data.buildings) f.push(poly(b.mp, { katman: 'bina', yukseklik_m: b.height, yukseklik_tahmini: b.est, taban_alani_m2: Math.round(b.area), islev: b.subtype, ad: b.name }));
  for (const r of data.roads) f.push(line(r.coords, { katman: r.subtype === 'rail' ? 'rayli_sistem' : 'yol', sinif: r.cls, ad: r.name }));
  for (const g of data.green) f.push(poly(g.mp, { katman: 'yesil', tur: g.kind }));
  for (const g of data.water) f.push(poly(g.mp, { katman: 'su' }));
  for (const l of data.waterLines) f.push(line(l.coords, { katman: 'su' }));
  for (const u of data.landuse) f.push(poly(u.mp, { katman: 'arazi_kullanimi', tur: u.subtype }));
  for (const s of data.stops) f.push({ type: 'Feature', properties: { katman: 'durak', ad: s.name }, geometry: { type: 'Point', coordinates: ll(s.p) } });
  if (topo && topo.contours) for (const lv of topo.contours.levels)
    f.push({ type: 'Feature', properties: { katman: 'esyukselti', kot_m: lv.z }, geometry: { type: 'MultiLineString', coordinates: lv.segs.map(s => s.map(ll)) } });
  return new Blob([JSON.stringify({ type: 'FeatureCollection', features: f })], { type: 'application/geo+json' });
}

/** Open-Meteo arşivinden son bir yılın saatlik rüzgarı -> 16 yönlü rüzgar gülü */
export async function fetchWind(lat, lon) {
  const end = new Date(Date.now() - 8 * 864e5), start = new Date(end.getTime() - 365 * 864e5);
  const d = x => x.toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start_date=${d(start)}&end_date=${d(end)}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Rüzgar verisi alınamadı');
  const j = await r.json();
  const sp = j.hourly.wind_speed_10m, dir = j.hourly.wind_direction_10m;
  const cnt = new Array(16).fill(0), sum = new Array(16).fill(0);
  let n = 0;
  for (let i = 0; i < sp.length; i++) {
    if (sp[i] == null || dir[i] == null || sp[i] < 1) continue;
    const k = Math.round(dir[i] / 22.5) % 16;
    cnt[k]++; sum[k] += sp[i]; n++;
  }
  return { freq: cnt.map(c => c / Math.max(n, 1)), speed: sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0)), from: d(start), to: d(end) };
}
