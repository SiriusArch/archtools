// Kentdoku - 2B pafta (SVG) üretici
// SVG birimi metredir; x doğu, y güney (SVG) - veri y'si kuzey olduğu için işaret çevrilir.

import { STYLES, ROAD_W, PATH_CLASSES, HEIGHT_BINS, USE_COLORS, useKey, TRANSPORT, transportKey, LANDUSE, landuseKey } from './styles.js';

const f2 = n => Math.round(n * 100) / 100;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function mpPath(mp) {
  let d = '';
  for (const poly of mp) for (const ring of poly) {
    d += 'M';
    for (let i = 0; i < ring.length - 1; i++) d += (i ? 'L' : '') + f2(ring[i][0]) + ' ' + f2(-ring[i][1]);
    d += 'Z';
  }
  return d;
}
const linePath = c => 'M' + c.map(p => f2(p[0]) + ' ' + f2(-p[1])).join('L');

export const DEFAULT_LAYERS = { binalar: true, yollar: true, yaya: true, ray: true, su: true, yesil: true, topo: false, pafta: true };

const DIRS = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];

function sunPos(latDeg, dayOfYear, hour) {
  const rad = Math.PI / 180, phi = latDeg * rad;
  const dec = 23.44 * rad * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
  const H = 15 * (hour - 12) * rad;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { alt: alt / rad, az: az / rad }; // az: kuzeyden saat yönünde
}

/**
 * @param data loadArea çıktısı
 * @param o { style, layers, mode, wind }
 */
export function buildSVG(data, o = {}) {
  const st = STYLES[o.style] || STYLES.klasik;
  const L = { ...DEFAULT_LAYERS, ...(o.layers || {}) };
  const mode = o.mode || 'plan';
  const { w, h, lat } = data.meta;
  const u = Math.min(w, h) / 100;
  const font = 'font-family="Helvetica, Arial, sans-serif"';
  const P = [];
  let legend = null, legendTitle = '';

  P.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${w}" height="${h}" data-w="${w}" data-h="${h}">`);
  P.push(`<title>Kentdoku pafta</title><defs><clipPath id="kd-cerceve"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}"/></clipPath></defs>`);
  P.push(`<g id="zemin"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${st.bg}"/></g>`);
  P.push('<g clip-path="url(#kd-cerceve)">');

  // --- arazi kullanımı / yeşil ---
  if (mode === 'arazi') {
    legendTitle = 'Arazi kullanımı'; legend = [];
    const seen = new Set();
    P.push('<g id="arazi-kullanimi">');
    const sorted = [...data.landuse].sort((a, b) => (a.subtype === 'residential' ? -1 : 0) - (b.subtype === 'residential' ? -1 : 0));
    for (const f of sorted) {
      const k = landuseKey(f.subtype); seen.add(k);
      P.push(`<path d="${mpPath(f.mp)}" fill="${LANDUSE[k][0]}" fill-rule="evenodd"/>`);
    }
    P.push('</g>');
    for (const k in LANDUSE) if (seen.has(k)) legend.push(LANDUSE[k]);
  } else if (L.yesil) {
    P.push('<g id="yesil-alanlar">');
    const order = { tarim: 0, cim: 1, park: 2, orman: 3 };
    for (const f of [...data.green].sort((a, b) => order[a.kind] - order[b.kind]))
      P.push(`<path d="${mpPath(f.mp)}" fill="${f.kind === 'tarim' ? st.farm : st.green}" fill-rule="evenodd"/>`);
    P.push('</g>');
  }

  // --- su ---
  if (L.su) {
    P.push('<g id="su">');
    for (const f of data.water) P.push(`<path d="${mpPath(f.mp)}" fill="${st.water}" fill-rule="evenodd"/>`);
    for (const f of data.waterLines) P.push(`<path d="${linePath(f.coords)}" fill="none" stroke="${st.water}" stroke-width="${f.subtype === 'canal' ? 3 : 2}" stroke-linecap="round" stroke-linejoin="round"/>`);
    P.push('</g>');
  }

  // --- eşyükselti eğrileri ---
  if (L.topo && o.topo && o.topo.contours) {
    P.push(`<g id="esyukselti" fill="none" stroke="${st.ink}" stroke-linecap="round" ${font}>`);
    for (const lv of o.topo.contours.levels) {
      let d = '';
      for (const [a, b] of lv.segs) d += `M${f2(a[0])} ${f2(-a[1])}L${f2(b[0])} ${f2(-b[1])}`;
      P.push(`<path d="${d}" stroke-width="${lv.index ? f2(u * 0.16) : f2(u * 0.08)}" stroke-opacity="${lv.index ? 0.6 : 0.35}" data-kot="${lv.z}"/>`);
      if (lv.index && lv.segs.length) {
        const m = lv.segs[Math.floor(lv.segs.length / 2)][0];
        P.push(`<text x="${f2(m[0])}" y="${f2(-m[1])}" font-size="${f2(u * 1.1)}" fill="${st.ink}" stroke="${st.bg}" stroke-width="${f2(u * 0.35)}" paint-order="stroke" fill-opacity="0.8" text-anchor="middle">${lv.z} m</text>`);
      }
    }
    P.push('</g>');
  }

  // --- yollar ---
  const roads = data.roads.filter(r => r.subtype === 'road');
  const rails = data.roads.filter(r => r.subtype === 'rail');
  const wOf = r => ROAD_W[r.cls] || 4;
  if (mode === 'ulasim') {
    legendTitle = 'Ulaşım ağı'; legend = [];
    const seen = new Set();
    const mult = { ana: 1.5, ikincil: 1.2, yerel: 0.8, yaya: 1, ray: 1 };
    P.push('<g id="ulasim-agi" fill="none" stroke-linecap="round" stroke-linejoin="round">');
    const order = ['yerel', 'yaya', 'ikincil', 'ana', 'ray'];
    const all = [...roads, ...rails].map(r => ({ r, k: transportKey(r) })).sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
    for (const { r, k } of all) {
      seen.add(k);
      const sw = k === 'ray' ? Math.max(2.5, u * 0.35) : k === 'yaya' ? Math.max(1.6, u * 0.22) : Math.max(wOf(r) * mult[k], u * 0.3);
      const dash = k === 'yaya' ? ` stroke-dasharray="${f2(sw * 2)} ${f2(sw * 2)}"` : k === 'ray' ? ` stroke-dasharray="${f2(sw * 4)} ${f2(sw * 2)}"` : '';
      P.push(`<path d="${linePath(r.coords)}" stroke="${TRANSPORT[k][0]}" stroke-width="${f2(sw)}"${dash}/>`);
    }
    P.push('</g>');
    for (const k of ['ana', 'ikincil', 'yerel', 'yaya', 'ray']) if (seen.has(k)) legend.push(TRANSPORT[k]);
    if (data.stops.length) legend.push(TRANSPORT.durak);
  } else {
    if (L.yollar) {
      const cars = roads.filter(r => !PATH_CLASSES.has(r.cls)).sort((a, b) => wOf(a) - wOf(b));
      P.push('<g id="yollar-kenar" fill="none" stroke-linecap="round" stroke-linejoin="round">');
      if (st.casing !== st.road) for (const r of cars) P.push(`<path d="${linePath(r.coords)}" stroke="${st.casing}" stroke-width="${f2(wOf(r) + 1.6)}"/>`);
      P.push('</g><g id="yollar" fill="none" stroke-linecap="round" stroke-linejoin="round">');
      for (const r of cars) P.push(`<path d="${linePath(r.coords)}" stroke="${st.road}" stroke-width="${wOf(r)}" data-sinif="${r.cls}"/>`);
      P.push('</g>');
    }
    if (L.yaya) {
      P.push('<g id="yaya-yollari" fill="none" stroke-linecap="round" stroke-linejoin="round">');
      for (const r of roads.filter(r => PATH_CLASSES.has(r.cls))) P.push(`<path d="${linePath(r.coords)}" stroke="${st.path}" stroke-width="${f2(wOf(r) * 0.7)}" stroke-dasharray="3 2.5"/>`);
      P.push('</g>');
    }
    if (L.ray && rails.length) {
      P.push('<g id="rayli-sistem" fill="none" stroke-linejoin="round">');
      for (const r of rails) P.push(`<path d="${linePath(r.coords)}" stroke="${st.rail}" stroke-width="1.8" stroke-dasharray="7 4"/>`);
      P.push('</g>');
    }
  }

  // --- binalar ---
  if (L.binalar) {
    P.push(`<g id="binalar" stroke-linejoin="round">`);
    if (mode === 'yukseklik') {
      legendTitle = 'Bina yüksekliği'; legend = HEIGHT_BINS.map(b => [b.color, b.label]);
      for (const b of data.buildings) {
        const c = HEIGHT_BINS.find(x => b.height < x.max).color;
        P.push(`<path d="${mpPath(b.mp)}" fill="${c}" stroke="#00000055" stroke-width="0.25" fill-rule="evenodd" data-yukseklik="${b.height}"/>`);
      }
    } else if (mode === 'kat' || mode === 'taban') {
      const bins = mode === 'kat'
        ? [[1, '#E3ECFB', '1 kat'], [3, '#B4CBF5', '2–3 kat'], [5, '#7FA4EE', '4–5 kat'], [8, '#2F62D9', '6–8 kat'], [Infinity, '#17337A', '9 kat +']]
        : [[100, '#E6F1E4', '< 100 m²'], [250, '#BFDDB8', '100–250 m²'], [500, '#8CC283', '250–500 m²'], [1500, '#4E9A52', '500–1500 m²'], [Infinity, '#1F5E33', '1500 m² +']];
      legendTitle = mode === 'kat' ? 'Kat adedi (yaklaşık)' : 'Bina taban alanı';
      legend = bins.map(b => [b[1], b[2]]);
      for (const b of data.buildings) {
        const v = mode === 'kat' ? Math.max(1, b.floors || Math.round(b.height / 3.2)) : b.area;
        const c = bins.find(x => (mode === 'kat' ? v <= x[0] : v < x[0]))[1];
        P.push(`<path d="${mpPath(b.mp)}" fill="${c}" stroke="#00000044" stroke-width="0.25" fill-rule="evenodd"/>`);
      }
    } else if (mode === 'islev') {
      legendTitle = 'Bina işlevi'; legend = [];
      const seen = new Set();
      for (const b of data.buildings) {
        const k = useKey(b.subtype); seen.add(k);
        P.push(`<path d="${mpPath(b.mp)}" fill="${USE_COLORS[k][0]}" stroke="#00000044" stroke-width="0.25" fill-rule="evenodd"/>`);
      }
      for (const k in USE_COLORS) if (seen.has(k)) legend.push(USE_COLORS[k]);
    } else {
      const muted = mode === 'ulasim' || mode === 'arazi' || mode === 'gunes' || mode === 'ruzgar';
      const fill = st.bld === 'none' ? 'none' : st.bld;
      const op = muted && fill !== 'none' ? ' fill-opacity="0.35" stroke-opacity="0.35"' : '';
      for (const b of data.buildings)
        P.push(`<path d="${mpPath(b.mp)}" fill="${fill}" stroke="${st.bldStroke}" stroke-width="${fill === 'none' ? 0.6 : 0.25}" fill-rule="evenodd"${op}/>`);
    }
    P.push('</g>');
  }

  if (mode === 'ulasim' && data.stops.length) {
    P.push('<g id="duraklar">');
    for (const s of data.stops) P.push(`<circle cx="${f2(s.p[0])}" cy="${f2(-s.p[1])}" r="${f2(u * 0.7)}" fill="${TRANSPORT.durak[0]}" stroke="#fff" stroke-width="${f2(u * 0.18)}"/>`);
    P.push('</g>');
  }

  // --- güneş yolu diyagramı ---
  if (mode === 'gunes') {
    const R = Math.min(w, h) * 0.4;
    const pt = (alt, az) => {
      const r = R * (1 - alt / 90), a = az * Math.PI / 180;
      return [f2(r * Math.sin(a)), f2(-r * Math.cos(a))];
    };
    P.push(`<g id="gunes-yolu" ${font}>`);
    P.push(`<circle r="${R}" fill="#FFFFFF" fill-opacity="0.55" stroke="${st.ink}" stroke-width="${f2(u * 0.12)}"/>`);
    for (const alt of [30, 60]) P.push(`<circle r="${f2(R * (1 - alt / 90))}" fill="none" stroke="#333" stroke-opacity="0.35" stroke-width="${f2(u * 0.08)}" stroke-dasharray="${f2(u * 0.6)} ${f2(u * 0.6)}"/>`);
    for (let a = 0; a < 360; a += 45) { const [x, y] = pt(0, a); P.push(`<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="#333" stroke-opacity="0.25" stroke-width="${f2(u * 0.08)}"/>`); }
    const days = [[172, '#D8432B', '21 Haziran'], [80, '#E89B3C', '21 Mart / 23 Eylül'], [355, '#1F5FBF', '21 Aralık']];
    for (const [day, color] of days) {
      let d = '';
      for (let t = 3; t <= 21.001; t += 0.25) {
        const s = sunPos(lat, day, t);
        if (s.alt < 0) continue;
        const [x, y] = pt(s.alt, s.az);
        d += (d ? 'L' : 'M') + x + ' ' + y;
      }
      P.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${f2(u * 0.35)}" stroke-linecap="round"/>`);
      for (let t = 5; t <= 20; t++) {
        const s = sunPos(lat, day, t);
        if (s.alt < 1) continue;
        const [x, y] = pt(s.alt, s.az);
        P.push(`<circle cx="${x}" cy="${y}" r="${f2(u * 0.5)}" fill="${color}"/>`);
        if (day === 172 && t % 2 === 0) P.push(`<text x="${x}" y="${f2(y - u * 0.9)}" font-size="${f2(u * 1.3)}" text-anchor="middle" fill="#222">${t}:00</text>`);
      }
    }
    for (const [lbl, a] of [['K', 0], ['D', 90], ['G', 180], ['B', 270]]) {
      const r = R + u * 2.2, x = f2(r * Math.sin(a * Math.PI / 180)), y = f2(-r * Math.cos(a * Math.PI / 180) + u * 0.7);
      P.push(`<text x="${x}" y="${y}" font-size="${f2(u * 2)}" font-weight="700" text-anchor="middle" fill="${st.ink}">${lbl}</text>`);
    }
    P.push('</g>');
    legendTitle = 'Güneş yolu (güneş saati)'; legend = days.map(d => [d[1], d[2]]);
  }

  // --- rüzgar gülü ---
  if (mode === 'ruzgar') {
    const R = Math.min(w, h) * 0.38;
    P.push(`<g id="ruzgar-gulu" ${font}>`);
    P.push(`<circle r="${R}" fill="#FFFFFF" fill-opacity="0.55" stroke="${st.ink}" stroke-width="${f2(u * 0.12)}"/>`);
    if (o.wind && o.wind.freq) {
      const max = Math.max(...o.wind.freq, 0.0001);
      const ringStep = max > 0.2 ? 0.1 : 0.05;
      for (let v = ringStep; v < max; v += ringStep) {
        const r = f2(R * v / max);
        P.push(`<circle r="${r}" fill="none" stroke="#333" stroke-opacity="0.3" stroke-width="${f2(u * 0.08)}" stroke-dasharray="${f2(u * 0.6)} ${f2(u * 0.6)}"/>`);
        P.push(`<text x="${f2(u * 0.5)}" y="${f2(-r - u * 0.4)}" font-size="${f2(u * 1.2)}" fill="#444">%${Math.round(v * 100)}</text>`);
      }
      const half = Math.PI / 16 * 0.82;
      o.wind.freq.forEach((fr, i) => {
        const a = i * Math.PI / 8, r = R * fr / max;
        const p1 = [f2(r * Math.sin(a - half)), f2(-r * Math.cos(a - half))], p2 = [f2(r * Math.sin(a + half)), f2(-r * Math.cos(a + half))];
        const sp = o.wind.speed[i];
        const color = sp < 8 ? '#9CC4DD' : sp < 14 ? '#4C8DAE' : sp < 20 ? '#1F5FBF' : '#12356E';
        P.push(`<path d="M0 0L${p1[0]} ${p1[1]}A${f2(r)} ${f2(r)} 0 0 1 ${p2[0]} ${p2[1]}Z" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="${f2(u * 0.1)}"/>`);
      });
      const top = o.wind.freq.indexOf(Math.max(...o.wind.freq));
      legendTitle = `Hakim rüzgar: ${DIRS[top]} (%${Math.round(o.wind.freq[top] * 100)})`;
      legend = [['#9CC4DD', '< 8 km/sa'], ['#4C8DAE', '8–14 km/sa'], ['#1F5FBF', '14–20 km/sa'], ['#12356E', '20 km/sa +']];
    } else {
      P.push(`<text y="${f2(u)}" font-size="${f2(u * 2)}" text-anchor="middle" fill="#333">${esc(o.windError || 'Rüzgar verisi yükleniyor…')}</text>`);
    }
    for (let i = 0; i < 16; i += 2) {
      const a = i * Math.PI / 8, r = R + u * 2.2;
      P.push(`<text x="${f2(r * Math.sin(a))}" y="${f2(-r * Math.cos(a) + u * 0.7)}" font-size="${f2(u * (i % 4 ? 1.5 : 2))}" font-weight="700" text-anchor="middle" fill="${st.ink}">${DIRS[i]}</text>`);
    }
    P.push('</g>');
  }

  P.push('</g>'); // clip sonu

  // --- pafta ögeleri: ölçek çubuğu, kuzey oku, lejant, kaynak ---
  if (L.pafta) {
    const fs = u * 1.5, m = u * 3;
    P.push(`<g id="pafta-ogeleri" ${font}>`);
    // ölçek çubuğu
    const target = w / 5;
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const bx = -w / 2 + m, by = h / 2 - m;
    P.push(`<g id="olcek-cubugu"><rect x="${f2(bx - u)}" y="${f2(by - u * 4.2)}" width="${f2(nice + u * 2)}" height="${f2(u * 5.4)}" fill="${st.bg}" fill-opacity="0.85"/>`);
    P.push(`<rect x="${f2(bx)}" y="${f2(by - u * 1.1)}" width="${nice / 2}" height="${f2(u * 0.8)}" fill="${st.ink}"/>`);
    P.push(`<rect x="${f2(bx + nice / 2)}" y="${f2(by - u * 1.1)}" width="${nice / 2}" height="${f2(u * 0.8)}" fill="none" stroke="${st.ink}" stroke-width="${f2(u * 0.12)}"/>`);
    P.push(`<text x="${f2(bx)}" y="${f2(by - u * 1.9)}" font-size="${f2(fs)}" fill="${st.ink}">0</text>`);
    P.push(`<text x="${f2(bx + nice)}" y="${f2(by - u * 1.9)}" font-size="${f2(fs)}" fill="${st.ink}" text-anchor="end">${nice} m</text></g>`);
    // kuzey oku
    const nx = w / 2 - m - u * 2, ny = -h / 2 + m + u * 3;
    P.push(`<g id="kuzey-oku"><circle cx="${f2(nx)}" cy="${f2(ny)}" r="${f2(u * 3.4)}" fill="${st.bg}" fill-opacity="0.85"/>`);
    P.push(`<path d="M${f2(nx)} ${f2(ny - u * 2.6)}L${f2(nx + u * 1.3)} ${f2(ny + u * 1.6)}L${f2(nx)} ${f2(ny + u * 0.8)}L${f2(nx - u * 1.3)} ${f2(ny + u * 1.6)}Z" fill="${st.ink}"/>`);
    P.push(`<text x="${f2(nx)}" y="${f2(ny + u * 3)}" font-size="${f2(u * 1.2)}" font-weight="700" text-anchor="middle" fill="${st.ink}">K</text></g>`);
    // lejant
    if (legend && legend.length) {
      const row = u * 2.4, lw = u * 26, lh = row * legend.length + u * 4.2;
      const lx = -w / 2 + m - u, ly = -h / 2 + m - u;
      P.push(`<g id="lejant"><rect x="${f2(lx)}" y="${f2(ly)}" width="${f2(lw)}" height="${f2(lh)}" fill="#FFFFFF" fill-opacity="0.92" stroke="#00000022" stroke-width="${f2(u * 0.1)}"/>`);
      P.push(`<text x="${f2(lx + u * 1.4)}" y="${f2(ly + u * 2.6)}" font-size="${f2(u * 1.55)}" font-weight="700" fill="#1b1b1b">${esc(legendTitle)}</text>`);
      legend.forEach(([c, label], i) => {
        const y = ly + u * 4.4 + i * row;
        P.push(`<rect x="${f2(lx + u * 1.4)}" y="${f2(y - u * 1.1)}" width="${f2(u * 2.2)}" height="${f2(u * 1.4)}" fill="${c}"/>`);
        P.push(`<text x="${f2(lx + u * 4.6)}" y="${f2(y)}" font-size="${f2(u * 1.4)}" fill="#1b1b1b">${esc(label)}</text>`);
      });
      P.push('</g>');
    }
    P.push(`<text id="kaynak" x="${f2(w / 2 - u)}" y="${f2(h / 2 - u)}" font-size="${f2(u * 1.05)}" text-anchor="end" fill="${st.ink}" fill-opacity="0.7">© OpenStreetMap, Overture Maps</text>`);
    P.push('</g>');
  }
  P.push('</svg>');
  return P.join('');
}
