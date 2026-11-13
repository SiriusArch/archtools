// Kentdoku - alan özeti: iklim, rüzgar, güneş, arazi, hava kalitesi, deprem
// Kaynaklar: Open-Meteo (ERA5 iklim, Copernicus DEM, CAMS hava kalitesi), USGS deprem kataloğu.

const DIRS = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
export const AYLAR = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];

const KOPPEN_AD = {
  Af: 'Tropikal yağmur ormanı', Am: 'Tropikal muson', Aw: 'Tropikal savan', As: 'Tropikal savan',
  BWh: 'Sıcak çöl', BWk: 'Soğuk çöl', BSh: 'Sıcak yarı kurak', BSk: 'Soğuk yarı kurak (step)',
  Csa: 'Sıcak yazlı Akdeniz', Csb: 'Ilık yazlı Akdeniz', Csc: 'Serin yazlı Akdeniz',
  Cfa: 'Nemli subtropikal', Cfb: 'Okyanusal', Cfc: 'Subpolar okyanusal', Cwa: 'Musonlu subtropikal', Cwb: 'Subtropikal yayla', Cwc: 'Serin subtropikal yayla',
  Dsa: 'Kuru sıcak yazlı karasal', Dsb: 'Kuru ılık yazlı karasal', Dsc: 'Kuru yazlı subarktik', Dsd: 'Kuru yazlı subarktik',
  Dfa: 'Sıcak yazlı nemli karasal', Dfb: 'Ilık yazlı nemli karasal', Dfc: 'Subarktik', Dfd: 'Aşırı soğuk subarktik',
  Dwa: 'Musonlu karasal', Dwb: 'Musonlu karasal', Dwc: 'Musonlu subarktik', Dwd: 'Musonlu subarktik',
  ET: 'Tundra', EF: 'Buzul'
};

export function koppen(T, P, lat) {
  const sum = a => a.reduce((x, y) => x + y, 0);
  const Tann = sum(T) / 12, Pann = sum(P), Thot = Math.max(...T), Tcold = Math.min(...T);
  const sm = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const wm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(i => !sm.includes(i));
  const Ps = sm.map(i => P[i]), Pw = wm.map(i => P[i]);
  const Pth = sum(Ps) >= 0.7 * Pann ? 2 * Tann + 28 : sum(Pw) >= 0.7 * Pann ? 2 * Tann : 2 * Tann + 14;
  let code;
  if (Pann < 10 * Pth) code = (Pann < 5 * Pth ? 'BW' : 'BS') + (Tann >= 18 ? 'h' : 'k');
  else if (Tcold >= 18) { const Pdry = Math.min(...P); code = Pdry >= 60 ? 'Af' : Pdry >= 100 - Pann / 25 ? 'Am' : 'Aw'; }
  else if (Thot <= 10) code = Thot > 0 ? 'ET' : 'EF';
  else {
    const main = Tcold > 0 ? 'C' : 'D';
    const Psdry = Math.min(...Ps), Pwdry = Math.min(...Pw), Pswet = Math.max(...Ps), Pwwet = Math.max(...Pw);
    const second = Psdry < 40 && Psdry < Pwwet / 3 ? 's' : Pwdry < Pswet / 10 ? 'w' : 'f';
    const warm = T.filter(t => t > 10).length;
    const third = Thot >= 22 ? 'a' : warm >= 4 ? 'b' : main === 'D' && Tcold < -38 ? 'd' : 'c';
    code = main + second + third;
  }
  return { code, ad: KOPPEN_AD[code] || code };
}

export function dayLength(lat, dayOfYear) {
  const rad = Math.PI / 180, dec = 23.44 * rad * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
  const c = -Math.tan(lat * rad) * Math.tan(dec);
  return c <= -1 ? 24 : c >= 1 ? 0 : 2 * Math.acos(c) / rad / 15;
}
export const fmtHours = h => `${Math.floor(h)} sa ${String(Math.round((h % 1) * 60)).padStart(2, '0')} dk`;

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}

async function climate(lat, lon) {
  const y = new Date().getFullYear() - 1;
  const j = await getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start_date=${y}-01-01&end_date=${y}-12-31&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_direction_10m_dominant,wind_speed_10m_max,shortwave_radiation_sum&timezone=auto`);
  const d = j.daily, m = Array.from({ length: 12 }, () => ({ t: [], tx: [], tn: [], p: 0 }));
  const cnt = new Array(16).fill(0), spd = new Array(16).fill(0);
  let hdd = 0, cdd = 0, solar = 0, n = 0, peak = 0, peakN = 0;
  d.time.forEach((t, i) => {
    const mo = +t.slice(5, 7) - 1, tm = d.temperature_2m_mean[i];
    if (tm != null) { m[mo].t.push(tm); hdd += Math.max(0, 18 - tm); cdd += Math.max(0, tm - 18); }
    if (d.temperature_2m_max[i] != null) m[mo].tx.push(d.temperature_2m_max[i]);
    if (d.temperature_2m_min[i] != null) m[mo].tn.push(d.temperature_2m_min[i]);
    m[mo].p += d.precipitation_sum[i] || 0;
    solar += (d.shortwave_radiation_sum[i] || 0) / 3.6;
    const wd = d.wind_direction_10m_dominant[i], ws = d.wind_speed_10m_max[i];
    if (wd != null && ws != null) { const k = Math.round(wd / 22.5) % 16; cnt[k]++; spd[k] += ws; n++; peak += ws; peakN++; }
  });
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const T = m.map(x => avg(x.t)), Tx = m.map(x => avg(x.tx)), Tn = m.map(x => avg(x.tn)), P = m.map(x => x.p);
  const freq = cnt.map(c => c / Math.max(1, n)), speed = spd.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
  const top = freq.indexOf(Math.max(...freq));
  return {
    year: y, T, Tx, Tn, P, tMean: avg(T), rain: P.reduce((a, b) => a + b, 0), hdd: Math.round(hdd), cdd: Math.round(cdd), solar: Math.round(solar),
    koppen: koppen(T, P, lat), wind: { freq, speed, top: DIRS[top], topShare: freq[top], peak: peakN ? peak / peakN : 0 }
  };
}

const TOPO_N = 10;
async function terrain(lat, lon, w, h) {
  const kx = 111320 * Math.cos(lat * Math.PI / 180), KY = 110574, N = TOPO_N;
  const las = [], los = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    las.push((lat + (r / (N - 1) - 0.5) * h / KY).toFixed(6));
    los.push((lon + (c / (N - 1) - 0.5) * w / kx).toFixed(6));
  }
  const j = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${las.join(',')}&longitude=${los.join(',')}`);
  const z = j.elevation, min = Math.min(...z), max = Math.max(...z);
  const dx = w / (N - 1), dy = h / (N - 1);
  let grade = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (c < N - 1) grade = Math.max(grade, Math.abs(z[r * N + c + 1] - z[r * N + c]) / dx);
    if (r < N - 1) grade = Math.max(grade, Math.abs(z[(r + 1) * N + c] - z[r * N + c]) / dy);
  }
  const mid = z[Math.floor(N / 2) * N + Math.floor(N / 2)];
  return { z, N, w, h, min, max, relief: max - min, grade: grade * 100, center: mid, contours: contours(z, N, w, h, min, max) };
}

// Bilineer büyütme + marching squares ile eşyükselti eğrileri
function contours(z, N, w, h, min, max) {
  const relief = max - min;
  const interval = relief < 6 ? 0.5 : relief < 15 ? 1 : relief < 40 ? 2 : relief < 100 ? 5 : relief < 300 ? 10 : 25;
  const UP = 5, M = (N - 1) * UP + 1, g = new Float32Array(M * M);
  for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) {
    const fr = r / UP, fc = c / UP, r0 = Math.min(N - 2, Math.floor(fr)), c0 = Math.min(N - 2, Math.floor(fc)), tr = fr - r0, tc = fc - c0;
    const s = t => t * t * (3 - 2 * t), a = s(tr), b = s(tc);
    g[r * M + c] = z[r0 * N + c0] * (1 - a) * (1 - b) + z[r0 * N + c0 + 1] * (1 - a) * b + z[(r0 + 1) * N + c0] * a * (1 - b) + z[(r0 + 1) * N + c0 + 1] * a * b;
  }
  const X = c => -w / 2 + c / (M - 1) * w, Y = r => -h / 2 + r / (M - 1) * h;
  const levels = [];
  for (let lv = Math.ceil(min / interval) * interval; lv <= max; lv += interval) {
    const segs = [];
    for (let r = 0; r < M - 1; r++) for (let c = 0; c < M - 1; c++) {
      const v = [g[r * M + c], g[r * M + c + 1], g[(r + 1) * M + c + 1], g[(r + 1) * M + c]];
      const P = [[X(c), Y(r)], [X(c + 1), Y(r)], [X(c + 1), Y(r + 1)], [X(c), Y(r + 1)]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < lv) !== (b < lv)) {
          const t = (lv - a) / (b - a), p = P[e], q = P[(e + 1) % 4];
          pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
      if (pts.length >= 2) segs.push([pts[0], pts[1]]);
      if (pts.length === 4) segs.push([pts[2], pts[3]]);
    }
    if (segs.length) levels.push({ z: Math.round(lv * 10) / 10, index: Math.round(lv / interval) % 5 === 0, segs });
  }
  return { interval, levels };
}

async function air(lat, lon) {
  const j = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=pm2_5&past_days=92&forecast_days=0`);
  const v = j.hourly.pm2_5.filter(x => x != null);
  return { pm25: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length) };
}
async function quakes(lat, lon) {
  const j = await getJSON(`https://earthquake.usgs.gov/fdsnws/event/1/count?format=geojson&starttime=1976-01-01&minmagnitude=4.5&latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&maxradiuskm=100`);
  return { count: j.count };
}

/** Tüm alan özeti verisi; başarısız olan kaynak null döner. */
export async function fetchSite(lat, lon, w, h) {
  const [c, t, a, q] = await Promise.allSettled([climate(lat, lon), terrain(lat, lon, w, h), air(lat, lon), quakes(lat, lon)]);
  const v = r => (r.status === 'fulfilled' ? r.value : null);
  return { climate: v(c), terrain: v(t), air: v(a), quakes: v(q), summer: dayLength(lat, 172), winter: dayLength(lat, 355) };
}

/** Veriden yapılaşma ölçütleri */
export function builtMetrics(data) {
  const { w, h } = data.meta, A = w * h;
  let foot = 0, floorArea = 0, hsum = 0;
  for (const b of data.buildings) {
    const kat = Math.max(1, b.floors || Math.round(b.height / 3.2));
    foot += b.area; floorArea += b.area * kat; hsum += b.height * b.area;
  }
  const green = data.green.filter(g => g.kind !== 'tarim').reduce((s, g) => s + mpArea(g.mp), 0);
  let roadLen = 0;
  for (const r of data.roads) if (r.subtype === 'road') for (let i = 1; i < r.coords.length; i++) roadLen += Math.hypot(r.coords[i][0] - r.coords[i - 1][0], r.coords[i][1] - r.coords[i - 1][1]);
  return {
    count: data.buildings.length, coverage: foot / A, far: floorArea / A, meanHeight: foot ? hsum / foot : 0,
    maxHeight: data.buildings.reduce((m, b) => Math.max(m, b.height), 0), green: Math.min(1, green / A), roadKm: roadLen / 1000, stops: data.stops.length, ha: A / 10000
  };
}
function mpArea(mp) {
  let s = 0;
  for (const poly of mp) poly.forEach((ring, i) => {
    let a = 0;
    for (let k = 0, n = ring.length; k < n; k++) { const p = ring[k], q = ring[(k + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    s += (i ? -1 : 1) * Math.abs(a / 2);
  });
  return s;
}

// ---------- özet paneli için küçük SVG çizimleri ----------
export function climateChart(c) {
  const W = 520, H = 220, L = 34, R = 34, T = 14, B = 26, iw = (W - L - R) / 12;
  const tmin = Math.floor(Math.min(...c.Tn, 0) / 5) * 5, tmax = Math.ceil(Math.max(...c.Tx) / 5) * 5;
  const pmax = Math.max(50, Math.ceil(Math.max(...c.P) / 50) * 50);
  const y = t => T + (H - T - B) * (1 - (t - tmin) / (tmax - tmin)), yp = p => H - B - (H - T - B) * (p / pmax);
  const x = i => L + iw * (i + 0.5);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aylık sıcaklık ve yağış">`;
  for (let t = tmin; t <= tmax; t += 5) s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="gl"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${t}°</text>`;
  s += `<text x="${W - R + 6}" y="${yp(pmax) + 4}" class="ax">${pmax} mm</text>`;
  c.P.forEach((p, i) => { s += `<rect x="${x(i) - iw * 0.3}" y="${yp(p)}" width="${iw * 0.6}" height="${H - B - yp(p)}" rx="3" fill="#BFD3F7"><title>${Math.round(p)} mm</title></rect>`; });
  s += `<path d="M${c.Tx.map((t, i) => `${x(i)} ${y(t)}`).join('L')}L${c.Tn.map((t, i) => `${x(i)} ${y(t)}`).reverse().join('L')}Z" fill="#F4B8A6" fill-opacity=".45"/>`;
  s += `<path d="M${c.T.map((t, i) => `${x(i)} ${y(t)}`).join('L')}" fill="none" stroke="#D8432B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  AYLAR.forEach((a, i) => { s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ax">${a}</text>`; });
  return s + '</svg>';
}
export function windRose(wd) {
  const R = 88, max = Math.max(...wd.freq, 0.001), half = Math.PI / 16 * 0.8;
  let s = `<svg viewBox="-120 -120 240 240" role="img" aria-label="Rüzgar gülü">`;
  for (const k of [0.33, 0.66, 1]) s += `<circle r="${R * k}" fill="none" class="gl"/>`;
  wd.freq.forEach((f, i) => {
    const a = i * Math.PI / 8, r = R * f / max, sp = wd.speed[i];
    const col = sp < 12 ? '#BFD3F7' : sp < 18 ? '#7FA4EE' : sp < 26 ? '#2F62D9' : '#17337A';
    s += `<path d="M0 0L${r * Math.sin(a - half)} ${-r * Math.cos(a - half)}A${r} ${r} 0 0 1 ${r * Math.sin(a + half)} ${-r * Math.cos(a + half)}Z" fill="${col}"><title>${DIRS[i]}: %${Math.round(f * 100)}, ${Math.round(sp)} km/sa</title></path>`;
  });
  [['K', 0, -104], ['D', 106, 4], ['G', 0, 112], ['B', -106, 4]].forEach(([t, x, y]) => { s += `<text x="${x}" y="${y}" text-anchor="middle" class="ax b">${t}</text>`; });
  return s + '</svg>';
}
export function sunDiagram(lat) {
  const R = 88, rad = Math.PI / 180;
  const pos = (day, hr) => {
    const phi = lat * rad, dec = 23.44 * rad * Math.sin(2 * Math.PI * (day - 81) / 365), H = 15 * (hr - 12) * rad;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
    return { alt: alt / rad, x: R * (1 - alt / rad / 90) * Math.sin(az), y: -R * (1 - alt / rad / 90) * Math.cos(az) };
  };
  let s = `<svg viewBox="-120 -120 240 240" role="img" aria-label="Güneş yolu">`;
  for (const k of [1 / 3, 2 / 3, 1]) s += `<circle r="${R * k}" fill="none" class="gl"/>`;
  for (const [day, col] of [[172, '#D8432B'], [80, '#E89B3C'], [355, '#2F62D9']]) {
    let d = '';
    for (let t = 3; t <= 21; t += 0.25) { const p = pos(day, t); if (p.alt >= 0) d += (d ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  for (const hr of [6, 9, 12, 15, 18]) { const p = pos(172, hr); if (p.alt > 0) s += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#D8432B"/><text x="${p.x}" y="${p.y - 7}" text-anchor="middle" class="ax">${hr}</text>`; }
  [['K', 0, -104], ['D', 106, 4], ['G', 0, 112], ['B', -106, 4]].forEach(([t, x, y]) => { s += `<text x="${x}" y="${y}" text-anchor="middle" class="ax b">${t}</text>`; });
  return s + '</svg>';
}
