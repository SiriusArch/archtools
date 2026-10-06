/* ==========================================================================
   38-lib-collage.js — Modül 11 · Kolaj Oluşturucu: veri modeli, figür kitaplığı, görsel deposu
   Kolaj; siyah-beyaz fotoğraf, tek vurgu renkli kütleler, beyaz siluetler, elle çizilmiş çizgiler ve etiketlerden oluşur.
   Veri project.collage içinde durur (görseller değil, yalnızca görsel kimlikleri); görseller App.collage.imgs ve IndexedDB'dedir.
   Model:
     project.collage = { v, title, size: 'a3l|a3p|sq|wide', bg: 'white|paper|grey|ink|accent', accent: '#hex', layers: [layer] }
     layer = { id, t, name, hidden, locked, ... }
       photo { src, x, y, w, h, zoom, ox, oy, bw, con, bri, op, mask: 'rect|ellipse|arch', flip }
       shape { kind: 'rect|ellipse|tri|arch|poly', x, y, w, h, rot, col, op, blend: 'normal|multiply', np?: [[0..1, 0..1]] }
       fig   { kind, x, y, w, rot, flip, col, op }                     (yükseklik w × kitaplık oranı)
       line  { kind: 'free|line|arrow', pts: [[x, y]], col, w, dash: 0|1|2, op, hand }
       text  { s, x, y, size, col, bg: 'none|white|ink|col', fam, caps, rot, weight }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const C = (App.collage = {});

  const num = (v, d) => (isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
  const uid = () => 'k' + Math.random().toString(36).slice(2, 8);
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  C.SIZES = {
    a3l: { w: 1400, h: 990, label: 'A3 yatay' },
    a3p: { w: 990, h: 1400, label: 'A3 dikey' },
    sq: { w: 1200, h: 1200, label: 'Kare' },
    wide: { w: 1600, h: 900, label: '16:9' },
  };
  C.BGS = { white: '#FFFFFF', paper: '#EFECE4', grey: '#D5D6D8', ink: '#17181B' };
  C.SWATCHES = [
    { v: '#D93A1F', label: 'Kırmızı' }, { v: '#F26B1D', label: 'Turuncu' }, { v: '#F2B705', label: 'Sarı' }, { v: '#2F8F4E', label: 'Yeşil' },
    { v: '#1F4FD8', label: 'Mavi' }, { v: '#4B3FA0', label: 'Çivit' }, { v: '#E58FB0', label: 'Pembe' }, { v: '#17181B', label: 'Siyah' }, { v: '#FFFFFF', label: 'Beyaz' },
  ];
  C.FONT_OPTS = [{ v: 'm', label: 'Mono' }, { v: 'b', label: 'Gövde' }, { v: 'd', label: 'Başlık' }];
  C.hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toUpperCase() : d);
  C.sizeOf = (c) => C.SIZES[c.size] || C.SIZES.a3l;
  C.bgColor = (c) => (c.bg === 'accent' ? c.accent : C.BGS[c.bg] || '#FFFFFF');

  /* ---------- geometri ---------- */
  C.rot = function (px, py, cx, cy, deg) {
    if (!deg) return [px, py];
    const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    const dx = px - cx, dy = py - cy;
    return [cx + dx * co - dy * si, cy + dx * si + dy * co];
  };
  C.boxPts = (x, y, w, h, deg) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((q) => C.rot(q[0], q[1], x + w / 2, y + h / 2, deg));
  function ellipsePts(x, y, w, h, n) {
    const o = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push([x + w / 2 + Math.cos(a) * w / 2, y + h / 2 + Math.sin(a) * h / 2]); }
    return o;
  }
  function archPts(x, y, w, h) {
    const o = [];
    const r = w / 2, cy = y + Math.min(r, h);
    for (let i = 0; i <= 40; i++) { const a = Math.PI + (i / 40) * Math.PI; o.push([x + w / 2 + Math.cos(a) * r, cy + Math.sin(a) * Math.min(r, h)]); }
    o.push([x + w, y + h], [x, y + h]);
    return o;
  }
  /* kutuya göre çokgen (döndürmesiz); np: serbest çokgen (0..1 normalleştirilmiş) */
  C.shapePts = function (kind, x, y, w, h, np) {
    if (kind === 'ellipse') return ellipsePts(x, y, w, h, Math.max(32, Math.min(120, Math.round((w + h) / 8))));
    if (kind === 'tri') return [[x + w / 2, y], [x + w, y + h], [x, y + h]];
    if (kind === 'arch') return archPts(x, y, w, h);
    if (kind === 'poly' && np && np.length >= 3) return np.map((q) => [x + q[0] * w, y + q[1] * h]);
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  };
  C.maskPts = function (mask, x, y, w, h) { return mask === 'ellipse' || mask === 'arch' ? C.shapePts(mask, x, y, w, h) : null; };

  /* serbest çizgi: nokta seyrelt + Catmull-Rom → kübik Bezier */
  C.simplify = function (pts, tol) {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    let last = pts[0];
    for (let i = 1; i < pts.length - 1; i++) { if (Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) >= tol) { out.push(pts[i]); last = pts[i]; } }
    out.push(pts[pts.length - 1]);
    return out;
  };
  C.smoothPath = function (pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1) + ' L' + pts[1][0].toFixed(1) + ' ' + pts[1][1].toFixed(1);
    let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + c1[0].toFixed(1) + ' ' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ' ' + c2[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  };
  function rng(seed) {
    let a = (seed >>> 0) + 0x6d2b79f5;
    return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  C.rng = rng;
  const hashId = (id) => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; };
  /* elle çizilmiş düz çizgi: hafif eğri + uçlarda taşma; okta kol çizgileri */
  C.handLine = function (a, b, hand, id) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    if (!hand) return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
    const R = rng(hashId(id || 'x'));
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const ov = Math.min(5, L * 0.03);
    const s = [a[0] - ux * ov * R(), a[1] - uy * ov * R()], e = [b[0] + ux * ov * R(), b[1] + uy * ov * R()];
    const k = Math.min(7, L * 0.025);
    const m1 = [s[0] + dx * 0.33 + nx * (R() - 0.5) * 2 * k, s[1] + dy * 0.33 + ny * (R() - 0.5) * 2 * k];
    const m2 = [s[0] + dx * 0.66 + nx * (R() - 0.5) * 2 * k, s[1] + dy * 0.66 + ny * (R() - 0.5) * 2 * k];
    return 'M' + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + ' C' + m1[0].toFixed(1) + ' ' + m1[1].toFixed(1) + ' ' + m2[0].toFixed(1) + ' ' + m2[1].toFixed(1) + ' ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1);
  };

  /* ---------- figür kitaplığı (beyaz siluetler) ---------- */
  function blob(cx, cy, rx, ry, seed, n, jit) {
    const R = rng(seed);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const k = 1 - (jit || 0.12) * R(); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + ' Z';
  }
  const head = (cx, cy, r) => 'M' + cx + ' ' + (cy - r) + ' C' + (cx + r * 0.55) + ' ' + (cy - r) + ' ' + (cx + r) + ' ' + (cy - r * 0.55) + ' ' + (cx + r) + ' ' + cy + ' C' + (cx + r) + ' ' + (cy + r * 0.55) + ' ' + (cx + r * 0.55) + ' ' + (cy + r) + ' ' + cx + ' ' + (cy + r) + ' C' + (cx - r * 0.55) + ' ' + (cy + r) + ' ' + (cx - r) + ' ' + (cy + r * 0.55) + ' ' + (cx - r) + ' ' + cy + ' C' + (cx - r) + ' ' + (cy - r * 0.55) + ' ' + (cx - r * 0.55) + ' ' + (cy - r) + ' ' + cx + ' ' + (cy - r) + ' Z';
  /* yol metnini ötele (yalnızca mutlak M L C Z) */
  function shift(d, dx, dy) {
    let k = 0;
    return d.replace(/-?\d*\.?\d+/g, (m) => { const v = parseFloat(m) + (k % 2 === 0 ? dx : dy); k++; return String(Math.round(v * 100) / 100); });
  }
  const P_STAND = head(20, 9, 7.5) + ' M12 20 C14 18 17 18 20 18 C23 18 26 18 28 20 C31 22 32 26 32 31 L33 52 C33 54 31 54 31 52 L30 37 L29 37 L29 56 L28.5 98 C28.5 99.5 24.5 99.5 24.5 98 L21 62 L19 62 L15.5 98 C15.5 99.5 11.5 99.5 11.5 98 L11 56 L11 37 L10 37 L9 52 C9 54 7 54 7 52 L8 31 C8 26 9 22 12 20 Z';
  const P_WALK = head(23, 9, 7.5) + ' M15 20 C17 18 20 18 23 18 C26 18 29 18.5 31 20.5 C34 23 35 27 35 32 L38 50 C38.3 52 36 52.6 35.5 50.8 L32 38 L31 38 L31.5 54 L40 97 C40.4 99 36.4 99.8 35.8 98 L26 66 L22 64 L15 97 C14.6 99 10.6 99.5 10.2 97.6 L16 62 L14.5 54 L14.5 38 L13.5 38 L10 52 C9.5 54 7.2 53.5 7.5 51.5 L10.5 32 C10.5 27 11.5 23 15 20 Z';
  const P_DRESS = head(20, 9, 7.2) + ' M13 20 C15 18 17.5 18 20 18 C22.5 18 25 18 27 20 C29.5 22 30 25 29.5 30 L31.5 46 C32 48 29.8 48.4 29.4 46.6 L27.5 34 L27 40 L34 70 L6 70 L13 40 L12.5 34 L10.6 46.6 C10.2 48.4 8 48 8.5 46 L10.5 30 C10 25 10.5 22 13 20 Z M15 70 L18.6 70 L18 97.5 C18 99 14.6 99 14.7 97.5 Z M21.4 70 L25 70 L25.3 97.5 C25.4 99 22 99 22 97.5 Z';
  const P_CHILD = head(15, 8, 6.4) + ' M9.5 16.5 C11 15 13 14.8 15 14.8 C17 14.8 19 15 20.5 16.5 C22.5 18 23 21 22.6 25 L23.4 38 C23.5 39.4 21.8 39.4 21.7 38 L21 28 L20 28 L20 44 L19.6 60 C19.6 61.4 16.4 61.4 16.4 60 L15 46 L15 46 L13.6 60 C13.6 61.4 10.4 61.4 10.4 60 L10 44 L10 28 L9 28 L8.3 38 C8.2 39.4 6.5 39.4 6.6 38 L7.4 25 C7 21 7.5 18 9.5 16.5 Z';
  const P_ARMSUP = head(24, 9, 7.5) + ' M14 22 L8 4 C7.5 2.6 9.6 2 10.1 3.3 L17 17 C19 16.5 21.5 16.5 24 16.5 C26.5 16.5 29 16.5 31 17 L37.9 3.3 C38.4 2 40.5 2.6 40 4 L34 22 C35.5 24 36 27 36 31 L36 52 C36 54 32 54 32 52 L31.5 40 L31 40 L31 56 L30 98 C30 99.6 25.6 99.6 25.6 98 L24.4 64 L23.6 64 L22.4 98 C22.4 99.6 18 99.6 18 98 L17 56 L17 40 L16.5 40 L16 52 C16 54 12 54 12 52 L12 31 C12 27 12.5 24 14 22 Z';
  const crown = (cx, cy, rx, ry, seed) => blob(cx, cy, rx, ry, seed, 9, 0.16);
  C.FIGS = {
    p1: { label: 'Ayakta', vw: 40, vh: 100, d: P_STAND },
    p2: { label: 'Yürüyen', vw: 46, vh: 100, d: P_WALK },
    p3: { label: 'Elbiseli', vw: 40, vh: 100, d: P_DRESS },
    p4: { label: 'Çocuk', vw: 30, vh: 62, d: P_CHILD },
    p5: { label: 'Kollar yukarı', vw: 48, vh: 100, d: P_ARMSUP },
    grp: { label: 'Grup', vw: 128, vh: 100, d: P_STAND + ' ' + shift(P_WALK, 36, 0) + ' ' + shift(P_DRESS, 84, 0) },
    t1: { label: 'Ağaç', vw: 100, vh: 132, d: crown(50, 46, 46, 44, 11) + ' M46 86 L54 86 L55.5 132 L44.5 132 Z' },
    t2: { label: 'Çam', vw: 70, vh: 134, d: 'M35 2 L57 38 L47 38 L63 68 L52 68 L68 98 L2 98 L18 68 L7 68 L23 38 L13 38 Z M31 98 L39 98 L39 134 L31 134 Z' },
    t3: { label: 'İnce ağaç', vw: 64, vh: 130, d: crown(32, 32, 28, 30, 5) + ' M30.4 60 L33.6 60 L34 130 L30 130 Z' },
    bush: { label: 'Çalı', vw: 110, vh: 52, d: crown(36, 30, 34, 22, 21) + ' ' + crown(72, 28, 36, 24, 22) },
    bird: { label: 'Kuş', vw: 100, vh: 36, d: 'M0 22 C14 4 34 4 50 26 C66 4 86 4 100 22 C86 14 66 18 50 36 C34 18 14 14 0 22 Z' },
    flock: { label: 'Kuş sürüsü', vw: 150, vh: 80, d: 'M0 22 C14 4 34 4 50 26 C66 4 86 4 100 22 C86 14 66 18 50 36 C34 18 14 14 0 22 Z ' + shift('M0 22 C14 4 34 4 50 26 C66 4 86 4 100 22 C86 14 66 18 50 36 C34 18 14 14 0 22 Z'.replace(/-?\d*\.?\d+/g, (m) => String(Math.round(parseFloat(m) * 0.5 * 100) / 100)), 92, 8) + ' ' + shift('M0 22 C14 4 34 4 50 26 C66 4 86 4 100 22 C86 14 66 18 50 36 C34 18 14 14 0 22 Z'.replace(/-?\d*\.?\d+/g, (m) => String(Math.round(parseFloat(m) * 0.38 * 100) / 100)), 40, 50) },
    sun: { label: 'Güneş', vw: 100, vh: 100, d: head(50, 50, 50) },
    sky: { label: 'Silüet', vw: 300, vh: 90, d: 'M0 90 L0 52 L18 52 L18 30 L40 30 L40 60 L58 60 L58 14 L84 14 L84 46 L104 46 L104 70 L124 70 L124 24 L132 24 L132 4 L146 4 L146 24 L154 24 L154 66 L178 66 L178 38 L204 38 L204 56 L222 56 L222 20 L248 20 L248 48 L268 48 L268 64 L300 64 L300 90 Z' },
  };
  C.FIG_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5', 'grp', 't1', 't2', 't3', 'bush', 'bird', 'flock', 'sun', 'sky'];
  C.figAr = (k) => { const f = C.FIGS[k] || C.FIGS.p1; return f.vh / f.vw; };
  /* silüet yolu: kutuya ölçekle, çevir, döndür */
  C.figPath = function (l) {
    const f = C.FIGS[l.kind] || C.FIGS.p1;
    const s = l.w / f.vw, h = l.w * (f.vh / f.vw);
    const cx = l.x + l.w / 2, cy = l.y + h / 2;
    let k = 0, px = 0;
    return f.d.replace(/-?\d*\.?\d+/g, (m) => {
      const v = parseFloat(m);
      if (k++ % 2 === 0) { px = v; return '\u0000'; }
      let X = l.x + (l.flip ? f.vw - px : px) * s, Y = l.y + v * s;
      if (l.rot) { const q = C.rot(X, Y, cx, cy, l.rot); X = q[0]; Y = q[1]; }
      return X.toFixed(1) + ' ' + Y.toFixed(1);
    }).replace(/\u0000 ?/g, '');
  };

  /* ---------- katman fabrikaları ---------- */
  const base = (t) => ({ id: uid(), t: t, name: '', hidden: false, locked: false });
  C.make = {
    photo: (src, x, y, w, h, o) => Object.assign(base('photo'), { src: src, x: x, y: y, w: w, h: h, zoom: 1, ox: 0.5, oy: 0.5, crop: { l: 0, t: 0, r: 0, b: 0 }, bw: true, con: 1.15, bri: 0, op: 1, mask: 'rect', flip: false }, o || {}),
    shape: (kind, x, y, w, h, col, o) => Object.assign(base('shape'), { kind: kind, x: x, y: y, w: w, h: h, rot: 0, col: col || '#D93A1F', op: 0.92, blend: 'normal' }, o || {}),
    fig: (kind, x, y, w, o) => Object.assign(base('fig'), { kind: kind, x: x, y: y, w: w, rot: 0, flip: false, col: '#FFFFFF', op: 1 }, o || {}),
    line: (kind, pts, o) => Object.assign(base('line'), { kind: kind, pts: pts, col: '#17181B', w: 3, dash: 0, op: 1, hand: true }, o || {}),
    text: (s, x, y, o) => Object.assign(base('text'), { s: s, x: x, y: y, size: 26, col: '#17181B', bg: 'none', fam: 'm', caps: true, rot: 0, weight: 700 }, o || {}),
  };
  C.LAYER_LABEL = { photo: 'Fotoğraf', shape: 'Şekil', fig: 'Figür', line: 'Çizgi', text: 'Yazı' };
  C.layerName = function (l) {
    if (l.name) return l.name;
    if (l.t === 'fig') return (C.FIGS[l.kind] || {}).label || 'Figür';
    if (l.t === 'text') return l.s.length > 22 ? l.s.slice(0, 21) + '…' : l.s;
    if (l.t === 'shape') return { rect: 'Dikdörtgen', ellipse: 'Elips', tri: 'Üçgen', arch: 'Kemer', poly: 'Çokgen' }[l.kind] || 'Şekil';
    if (l.t === 'line') return { free: 'Elle çizim', line: 'Çizgi', arrow: 'Ok' }[l.kind] || 'Çizgi';
    const im = C.imgs[l.src];
    return im && im.name ? im.name.slice(0, 22) : 'Fotoğraf';
  };

  /* ---------- temizleme ---------- */
  const clampBox = (o) => ({ x: r1(U.clamp(num(o.x, 0), -4000, 6000)), y: r1(U.clamp(num(o.y, 0), -4000, 6000)), w: r1(U.clamp(num(o.w, 100), 8, 6000)), h: r1(U.clamp(num(o.h, 100), 8, 6000)) });
  /* kırpma: kaynak görselin her kenarından kesilen oran (0–0.9; karşılıklı kenarların toplamı en çok %94) */
  C.cleanCrop = function (c) {
    const o = c && typeof c === 'object' ? c : {};
    const f = (v) => { v = Number(v); return isFinite(v) ? Math.round(U.clamp(v, 0, 0.9) * 1000) / 1000 : 0; };
    let l = f(o.l), t = f(o.t), r = f(o.r), b = f(o.b);
    if (l + r > 0.94) { const k = 0.94 / (l + r); l *= k; r *= k; }
    if (t + b > 0.94) { const k = 0.94 / (t + b); t *= k; b *= k; }
    return { l: l, t: t, r: r, b: b };
  };
  /* görünen kaynak bölgesi (kaynak piksel) */
  C.cropRegion = function (im, c) {
    const k = c || { l: 0, t: 0, r: 0, b: 0 };
    return { x: im.w * k.l, y: im.h * k.t, w: Math.max(2, im.w * (1 - k.l - k.r)), h: Math.max(2, im.h * (1 - k.t - k.b)) };
  };
  C.clean = function (l, patch) {
    const o = Object.assign({}, l, patch || {});
    const b = { id: o.id, t: o.t, name: String(o.name || '').slice(0, 40), hidden: !!o.hidden, locked: !!o.locked };
    const op = (v, d) => r2(U.clamp(num(v, d), 0.05, 1));
    if (o.t === 'photo') {
      return Object.assign(b, clampBox(o), { src: String(o.src || ''), zoom: r2(U.clamp(num(o.zoom, 1), 1, 5)), ox: r2(U.clamp(num(o.ox, 0.5), 0, 1)), oy: r2(U.clamp(num(o.oy, 0.5), 0, 1)), crop: C.cleanCrop(o.crop), bw: o.bw !== false, con: r2(U.clamp(num(o.con, 1.15), 0.5, 2.2)), bri: r2(U.clamp(num(o.bri, 0), -0.4, 0.4)), op: op(o.op, 1), mask: ['rect', 'ellipse', 'arch'].indexOf(o.mask) >= 0 ? o.mask : 'rect', flip: !!o.flip });
    }
    if (o.t === 'shape') {
      const kind = ['rect', 'ellipse', 'tri', 'arch', 'poly'].indexOf(o.kind) >= 0 ? o.kind : 'rect';
      const r = Object.assign(b, clampBox(o), { kind: kind, rot: r1(num(o.rot, 0) % 360), col: C.hex(o.col, '#D93A1F'), op: op(o.op, 0.92), blend: o.blend === 'multiply' ? 'multiply' : 'normal' });
      if (kind === 'poly') { r.np = (Array.isArray(o.np) ? o.np : []).slice(0, 200).map((q) => [r2(num(q && q[0], 0)), r2(num(q && q[1], 0))]); if (r.np.length < 3) r.kind = 'rect'; }
      return r;
    }
    if (o.t === 'fig') {
      if (!C.FIGS[o.kind]) return null;
      return Object.assign(b, { kind: o.kind, x: r1(U.clamp(num(o.x, 0), -4000, 6000)), y: r1(U.clamp(num(o.y, 0), -4000, 6000)), w: r1(U.clamp(num(o.w, 100), 6, 4000)), rot: r1(num(o.rot, 0) % 360), flip: !!o.flip, col: C.hex(o.col, '#FFFFFF'), op: op(o.op, 1) });
    }
    if (o.t === 'line') {
      const pts = (Array.isArray(o.pts) ? o.pts : []).slice(0, 1200).map((q) => [r1(U.clamp(num(q && q[0], 0), -4000, 6000)), r1(U.clamp(num(q && q[1], 0), -4000, 6000))]);
      if (pts.length < 2) return null;
      const kind = ['free', 'line', 'arrow'].indexOf(o.kind) >= 0 ? o.kind : 'free';
      return Object.assign(b, { kind: kind, pts: kind === 'free' ? pts : [pts[0], pts[pts.length - 1]], col: C.hex(o.col, '#17181B'), w: r1(U.clamp(num(o.w, 3), 1, 24)), dash: [0, 1, 2].indexOf(o.dash) >= 0 ? o.dash : 0, op: op(o.op, 1), hand: o.hand !== false });
    }
    if (o.t === 'text') {
      return Object.assign(b, { s: String(o.s == null ? '' : o.s).slice(0, 120) || 'Etiket', x: r1(U.clamp(num(o.x, 0), -4000, 6000)), y: r1(U.clamp(num(o.y, 0), -4000, 6000)), size: Math.round(U.clamp(num(o.size, 26), 8, 220)), col: C.hex(o.col, '#17181B'), bg: ['none', 'white', 'ink', 'col'].indexOf(o.bg) >= 0 ? o.bg : 'none', fam: ['d', 'b', 'm'].indexOf(o.fam) >= 0 ? o.fam : 'm', caps: !!o.caps, rot: r1(num(o.rot, 0) % 360), weight: num(o.weight, 700) >= 600 ? 700 : 500 });
    }
    return null;
  };
  C.defaults = function () { return { v: 1, title: '', size: 'a3l', bg: 'white', accent: '#D93A1F', layers: [] }; };
  C.cleanDoc = function (p) {
    const d = C.defaults();
    const o = Object.assign({}, d, p || {});
    o.title = String(o.title || '').slice(0, 60);
    o.size = C.SIZES[o.size] ? o.size : 'a3l';
    o.bg = ['white', 'paper', 'grey', 'ink', 'accent'].indexOf(o.bg) >= 0 ? o.bg : 'white';
    o.accent = C.hex(o.accent, '#D93A1F');
    o.layers = (Array.isArray(o.layers) ? o.layers : []).slice(0, 300).map((l) => C.clean(l)).filter(Boolean);
    return o;
  };
  /* kutu merkezi (döndürme ekseni) ve sınır kutusu */
  C.boxOf = function (l, doc) {
    if (l.t === 'fig') return { x: l.x, y: l.y, w: l.w, h: l.w * C.figAr(l.kind) };
    if (l.t === 'text') { const m = C.textMetrics(l); return { x: l.x, y: l.y, w: m.w, h: m.h }; }
    if (l.t === 'line') { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; l.pts.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
    void doc;
    return { x: l.x, y: l.y, w: l.w, h: l.h };
  };
  C.textMetrics = function (l) {
    const s = l.caps ? l.s.toUpperCase() : l.s;
    const ls = l.caps ? Math.round(l.size * 0.06 * 10) / 10 : 0;
    const tw = App.sheet.tw(s, l.size, l.weight, l.fam, ls);
    const padX = l.bg === 'none' ? 0 : Math.round(l.size * 0.45), padY = l.bg === 'none' ? 0 : Math.round(l.size * 0.28);
    return { s: s, ls: ls, tw: tw, padX: padX, padY: padY, w: tw + padX * 2, h: l.size * 1.2 + padY * 2 };
  };

  /* ---------- görsel deposu (bellek + IndexedDB) ---------- */
  C.imgs = {};
  C.version = 0;
  C.onChange = null;
  const bump = () => { C.version++; if (C.onChange) C.onChange(); };
  const idb = {
    db: null,
    open: function () {
      return new Promise((res) => {
        try {
          const rq = window.indexedDB.open('archtools-collage', 1);
          rq.onupgradeneeded = () => { rq.result.createObjectStore('imgs', { keyPath: 'id' }); };
          rq.onsuccess = () => { idb.db = rq.result; res(idb.db); };
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
    },
    put: function (rec) { idb.open().then((db) => { if (!db) return; try { db.transaction('imgs', 'readwrite').objectStore('imgs').put(rec); } catch (e) { /* yok say */ } }); },
    del: function (id) { idb.open().then((db) => { if (!db) return; try { db.transaction('imgs', 'readwrite').objectStore('imgs').delete(id); } catch (e) { /* yok say */ } }); },
    all: function () {
      return idb.open().then((db) => (db ? new Promise((res) => { try { const rq = db.transaction('imgs').objectStore('imgs').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); } catch (e) { res([]); } }) : []));
    },
  };
  function attach(im) {
    const el = new Image();
    el.onload = () => { im.el = el; bump(); };
    el.src = im.src;
    im.el = el;
  }
  C.addImg = function (rec, noSave) {
    const id = rec.id || 'g' + Math.random().toString(36).slice(2, 8);
    const im = { id: id, name: String(rec.name || 'Fotoğraf').slice(0, 60), w: rec.w, h: rec.h, src: rec.src };
    C.imgs[id] = im;
    attach(im);
    if (!noSave) idb.put({ id: id, name: im.name, w: im.w, h: im.h, src: im.src });
    bump();
    return im;
  };
  C.delImg = function (id) { delete C.imgs[id]; idb.del(id); bump(); };
  C.loadStore = function () { return idb.all().then((rows) => { rows.forEach((r) => { if (!C.imgs[r.id]) C.addImg(r, true); }); }); };

  /* dosyadan oku: en uzun kenar ≤ 1800 px, JPEG */
  C.readFile = function (file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) { rej(new Error('Yalnızca görüntü dosyaları eklenebilir.')); return; }
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('Dosya okunamadı.'));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => rej(new Error('Görüntü çözülemedi: ' + file.name));
        im.onload = () => {
          const k = Math.min(1, 1800 / Math.max(im.naturalWidth, im.naturalHeight));
          const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const cx = cv.getContext('2d');
          cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
          cx.drawImage(im, 0, 0, w, h);
          res({ name: file.name.replace(/\.[^.]+$/, ''), w: w, h: h, src: cv.toDataURL('image/jpeg', 0.88) });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  /* siyah-beyaz + kontrast + parlaklık (piksel işleme); sonuç önbelleğe alınır */
  const procCache = new Map();
  C.processed = function (l) {
    const im = C.imgs[l.src];
    if (!im) return null;
    const key = [l.src, l.bw ? 1 : 0, Math.round(l.con * 100), Math.round(l.bri * 100), l.flip ? 1 : 0].join('|');
    if (procCache.has(key)) return procCache.get(key);
    if (!im.el || !im.el.complete || !im.el.naturalWidth) return { href: im.src, ik: 'raw|' + l.src, w: im.w, h: im.h };
    const cv = document.createElement('canvas');
    cv.width = im.w; cv.height = im.h;
    const cx = cv.getContext('2d');
    if (l.flip) { cx.translate(im.w, 0); cx.scale(-1, 1); }
    cx.drawImage(im.el, 0, 0, im.w, im.h);
    const id = cx.getImageData(0, 0, im.w, im.h), d = id.data;
    const con = l.con, off = l.bri * 255;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (l.bw) { r = g = b = 0.299 * r + 0.587 * g + 0.114 * b; }
      d[i] = (r - 128) * con + 128 + off; d[i + 1] = (g - 128) * con + 128 + off; d[i + 2] = (b - 128) * con + 128 + off;
    }
    cx.putImageData(id, 0, 0);
    const out = { href: cv.toDataURL('image/jpeg', 0.9), ik: key, w: im.w, h: im.h };
    procCache.set(key, out);
    if (procCache.size > 14) procCache.delete(procCache.keys().next().value);
    return out;
  };
  /* dışa aktarma öncesi: görüntü öğelerini canvas'ın okuyacağı önbelleğe yükle */
  C.preload = function (prims) {
    const jobs = [];
    const walk = (list) => list.forEach((p) => {
      if (p.t === 'g') walk(p.items);
      else if (p.t === 'img') {
        const k = p.ik || p.href;
        if (!App.board.imgCache[k]) jobs.push(new Promise((res) => { const el = new Image(); el.onload = () => res(); el.onerror = () => res(); el.src = p.href; App.board.imgCache[k] = el; }));
      }
    });
    walk(prims);
    return Promise.all(jobs);
  };

  /* ---------- örnek kolaj ---------- */
  C.sample = function () {
    const ph = C.addImg(C.demoPhoto('cephe', 11));
    const doc = C.defaults();
    doc.size = 'a3l'; doc.bg = 'white'; doc.accent = '#D93A1F'; doc.title = 'Kent ve yoğunluk';
    const W = 1400, H = 990;
    const L = doc.layers;
    L.push(C.make.photo(ph.id, 0, 0, W, H, { zoom: 1, con: 1.05, bri: 0.14 }));
    L.push(C.make.shape('rect', 420, 70, 560, 700, '#D93A1F', { op: 0.94, blend: 'multiply' }));
    L.push(C.make.shape('ellipse', 1010, 560, 250, 250, '#17181B', { op: 0.9 }));
    const fx = [[160, 720, 90], [250, 740, 80], [330, 725, 95], [1060, 700, 85], [1150, 715, 92]];
    const kinds = ['p1', 'p2', 'p3', 'p5', 'p1'];
    fx.forEach((f, i) => L.push(C.make.fig(kinds[i], f[0], f[1], f[2] * 0.42, { flip: i % 2 === 1 })));
    L.push(C.make.fig('t1', 60, 560, 160));
    L.push(C.make.fig('flock', 760, 120, 170));
    L.push(C.make.line('free', [[120, 330], [190, 300], [270, 330], [350, 290], [440, 320]], { col: '#17181B', w: 4 }));
    L.push(C.make.line('arrow', [[1040, 180], [1210, 120]], { col: '#17181B', w: 3 }));
    L.push(C.make.text('Yoğunluk', 1050, 190, { size: 30, bg: 'white', col: '#17181B' }));
    L.push(C.make.text('Kamusal boşluk', 90, 880, { size: 24, bg: 'ink', col: '#FFFFFF' }));
    L.push(C.make.text('01 · Kent ölçeği', 1020, 910, { size: 20, bg: 'none', col: '#FFFFFF' }));
    return C.cleanDoc(doc);
  };
})();
