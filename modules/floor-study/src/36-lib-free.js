/* ==========================================================================
   36-lib-free.js — Mekân Etüdü: serbest düzen (saf fonksiyonlar, arayüzden bağımsız)
   Her mekân kendi şekli (dikdörtgen / L / T / U), boyutu ve konumu ile bir "modül"dür.
   Girdi : Modül 1 projesi (mekânlar, m², bölge, ilişkiler, balon konumları) + project.study.free
   Çıktı : metre cinsinden çokgenler, mekânlar arası ilişki durumu (bitişik / yakın / uzak / çakışık),
           skor, bulgular
   Veri  : project.study.free = { v:2, snap, shapes:{ [mekânId]: { x, y, w, h, shape, rot, cut, seed, lv, nf, roof, furn[] } },
                                  extras[], site{}, ctx{}, map{}, org[], link, steps[], kat }
           x, y = sınırlayıcı kutunun sol-üst köşesi (m, y aşağı doğru) · w, h = kutu boyutu (m)
           shape = 32 şekil (geometrik · eğrisel · organik) · rot = 0..3 (90° adımlar) · cut = parametre (0.15–0.65) · seed = organik tohum
           lv = kat (0 = zemin) · nf = mekânın kat sayısı (yükseklik) · roof = 'plain' | 'green' · furn = donatı listesi
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const fmt = U.fmt;
  const st = (App.study = App.study || {});

  /* ---------- şekil kataloğu ----------
     g: geo (geometrik) · egri (eğrisel) · org (organik). prm: kesik/oran kaydırıcısı var mı · seed: "karıştır" var mı */
  const SHAPES = [
    { v: 'rect', label: 'Dikdörtgen', g: 'geo' }, { v: 'L', label: 'L', g: 'geo', prm: 'Kesik oranı' }, { v: 'T', label: 'T', g: 'geo', prm: 'Kesik oranı' }, { v: 'U', label: 'U', g: 'geo', prm: 'Kesik oranı' },
    { v: 'plus', label: 'Artı', g: 'geo', prm: 'Kol kalınlığı' }, { v: 'H', label: 'H', g: 'geo', prm: 'Boşluk' }, { v: 'Z', label: 'Z / basamak', g: 'geo', prm: 'Kayma' },
    { v: 'trap', label: 'Trapez', g: 'geo', prm: 'Daralma' }, { v: 'para', label: 'Paralelkenar', g: 'geo', prm: 'Eğim' }, { v: 'tri', label: 'Üçgen', g: 'geo', prm: 'Tepe konumu' },
    { v: 'pent', label: 'Beşgen', g: 'geo' }, { v: 'hex', label: 'Altıgen', g: 'geo' }, { v: 'oct', label: 'Sekizgen', g: 'geo' },
    { v: 'chev', label: 'Ok başı', g: 'geo', prm: 'Çentik' }, { v: 'step', label: 'Basamaklı', g: 'geo' },
    { v: 'circle', label: 'Daire / elips', g: 'egri' }, { v: 'half', label: 'Yarım daire', g: 'egri' }, { v: 'quarter', label: 'Çeyrek daire', g: 'egri' },
    { v: 'arch', label: 'Kemer', g: 'egri', prm: 'Kemer yüksekliği' }, { v: 'rrect', label: 'Yuvarlak köşe', g: 'egri', prm: 'Yuvarlaklık' }, { v: 'band', label: 'Kavisli bant', g: 'egri', prm: 'Bant kalınlığı' },
    { v: 'crescent', label: 'Hilal', g: 'egri', prm: 'Kalınlık' }, { v: 'sector', label: 'Daire dilimi', g: 'egri', prm: 'Açı' }, { v: 'wave', label: 'Dalgalı', g: 'egri', prm: 'Dalga boyu' },
    { v: 'blob', label: 'Serbest leke', g: 'org', prm: 'Düzensizlik', seed: true }, { v: 'amoeba', label: 'Amip', g: 'org', prm: 'Düzensizlik', seed: true }, { v: 'pebble', label: 'Çakıl', g: 'org', seed: true },
    { v: 'squircle', label: 'Yumuşak kare', g: 'org', prm: 'Yumuşaklık' }, { v: 'kidney', label: 'Böbrek', g: 'org', prm: 'Çukur derinliği' }, { v: 'drop', label: 'Damla', g: 'org', prm: 'Şişkinlik' },
    { v: 'leaf', label: 'Yaprak', g: 'org', prm: 'Doluluk' }, { v: 'cloud', label: 'Bulut', g: 'org', prm: 'Girinti sayısı' },
  ];
  const SHAPE_GROUPS = [{ g: 'geo', label: 'Geometrik' }, { g: 'egri', label: 'Eğrisel' }, { g: 'org', label: 'Organik' }];
  const SHAPE_IDS = SHAPES.map((s) => s.v);
  const SHAPE_BY = {};
  SHAPES.forEach((s) => { SHAPE_BY[s.v] = s; });
  const MIN_DIM = 0.6, MAX_DIM = 400;
  const r1 = (v) => Math.round(v * 10) / 10;
  const num = (v, d) => (isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
  const TAU = Math.PI * 2;

  function srng(seed) {
    let a = (Math.round(seed) >>> 0) + 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // noktaları birim kareye (0..1) oturt
  function norm(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    const w = x1 - x0 || 1, h = y1 - y0 || 1;
    return pts.map((p) => [(p[0] - x0) / w, (p[1] - y0) / h]);
  }
  const polar = (n, fr) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const r = fr(a); o.push([Math.cos(a) * r, Math.sin(a) * r]); } return norm(o); };
  const regular = (n, a0) => { const o = []; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; o.push([Math.cos(a), Math.sin(a)]); } return norm(o); };
  const arcPts = (cx, cy, rx, ry, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  function harmonics(seed, kmin, kmax, amp) {
    const R = srng(seed * 7 + 3);
    const hs = [];
    for (let k = kmin; k <= kmax; k++) hs.push({ k: k, a: (amp * (0.55 + R() * 0.7)) / (k - 0.6), p: R() * TAU });
    return (a) => { let r = 1; hs.forEach((q) => { r += q.a * Math.sin(q.k * a + q.p); }); return Math.max(0.35, r); };
  }

  /* birim kare içinde halka. c = kesik/oran (0.15–0.65), seed = organik şekil tohumu */
  function unitRing(shape, c, seed) {
    const t = (c - 0.15) / 0.5; // 0..1
    switch (shape) {
      case 'L': return [[0, 0], [1 - c, 0], [1 - c, c], [1, c], [1, 1], [0, 1]];
      case 'T': { const s = Math.max(0.25, 1 - 1.5 * c), tt = 0.42, a = (1 - s) / 2, b = (1 + s) / 2; return [[0, 0], [1, 0], [1, tt], [b, tt], [b, 1], [a, 1], [a, tt], [0, tt]]; }
      case 'U': { const a = (1 - c) / 2, b = (1 + c) / 2, d = 0.55; return [[0, 0], [a, 0], [a, d], [b, d], [b, 0], [1, 0], [1, 1], [0, 1]]; }
      case 'plus': { const s = 0.9 - c, a = (1 - s) / 2, b = (1 + s) / 2; return [[a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b], [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a]]; }
      case 'H': { const k = (1 - c) / 2; return [[0, 0], [k, 0], [k, 0.35], [1 - k, 0.35], [1 - k, 0], [1, 0], [1, 1], [1 - k, 1], [1 - k, 0.65], [k, 0.65], [k, 1], [0, 1]]; }
      case 'Z': { const o = c * 0.75; return [[0, 0], [1 - o, 0], [1 - o, 0.5], [1, 0.5], [1, 1], [o, 1], [o, 0.5], [0, 0.5]]; }
      case 'trap': { const i = c * 0.5; return [[i, 0], [1 - i, 0], [1, 1], [0, 1]]; }
      case 'para': { const i = c * 0.5; return [[i, 0], [1, 0], [1 - i, 1], [0, 1]]; }
      case 'tri': { const ax = U.clamp(0.5 + (c - 0.4), 0.1, 0.9); return [[ax, 0], [1, 1], [0, 1]]; }
      case 'pent': return regular(5, -Math.PI / 2);
      case 'hex': return regular(6, 0);
      case 'oct': return regular(8, Math.PI / 8);
      case 'chev': { const k = c * 0.6; return [[0, 0], [1 - k, 0], [1, 0.5], [1 - k, 1], [0, 1], [k, 0.5]]; }
      case 'step': return [[0, 0], [0.4, 0], [0.4, 0.34], [0.7, 0.34], [0.7, 0.67], [1, 0.67], [1, 1], [0, 1]];
      case 'circle': return polar(40, () => 1);
      case 'half': return norm(arcPts(0.5, 1, 0.5, 1, Math.PI, TAU, 26));
      case 'quarter': return norm([[0, 0]].concat(arcPts(0, 0, 1, 1, 0, Math.PI / 2, 22)));
      case 'arch': { const r = 0.25 + (c - 0.15) * 0.6; return norm([[0, 1], [0, r]].concat(arcPts(0.5, r, 0.5, r, Math.PI, TAU, 22), [[1, 1]])); }
      case 'rrect': { const r = 0.08 + t * 0.42; const o = []; [[r, r, Math.PI], [1 - r, r, 1.5 * Math.PI], [1 - r, 1 - r, 0], [r, 1 - r, 0.5 * Math.PI]].forEach((q) => arcPts(q[0], q[1], r, r, q[2], q[2] + Math.PI / 2, 8).forEach((p) => o.push(p))); return o; }
      case 'band': { const k = 1 - (0.2 + t * 0.35); return norm(arcPts(0.5, 1, 0.5, 1, Math.PI, TAU, 28).concat(arcPts(0.5, 1, 0.5 * k, k, TAU, Math.PI, 28))); }
      case 'crescent': {
        const m = 0.3 + (c - 0.15) * 1.2, r2 = Math.sqrt(m * m + 1), a0 = Math.atan2(1, -m);
        const outer = arcPts(0, 0, 1, 1, Math.PI / 2, 1.5 * Math.PI, 30);
        const inn = []; for (let i = 0; i <= 30; i++) { const b = TAU - a0 - ((TAU - 2 * a0) * i) / 30; inn.push([m + r2 * Math.cos(b), r2 * Math.sin(b)]); }
        return norm(outer.concat(inn.slice(1, -1)));
      }
      case 'sector': { const ang = (60 + t * 100) * Math.PI / 180, a0 = -Math.PI / 2 - ang / 2; return norm([[0, 0]].concat(arcPts(0, 0, 1, 1, a0, a0 + ang, 24))); }
      case 'wave': { const a = 0.04 + c * 0.22, f = 1 + Math.round(t * 2); const top = [], bot = []; for (let i = 0; i <= 28; i++) { const x = i / 28; top.push([x, a + a * Math.sin(x * TAU * f)]); bot.push([x, 1 - a + a * Math.sin(x * TAU * f)]); } return norm(top.concat(bot.reverse())); }
      case 'blob': { const fr = harmonics(seed, 2, 4, 0.5 + t * 1.1); return polar(48, fr); }
      case 'amoeba': { const fr = harmonics(seed + 11, 2, 6, 0.9 + t * 1.3); return polar(64, fr); }
      case 'pebble': { const fr = harmonics(seed + 5, 2, 3, 0.35); return polar(40, fr); }
      case 'squircle': { const n = 2.2 + (0.65 - c) * 5; const o = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, cs = Math.cos(a), sn = Math.sin(a); o.push([Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n), Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)]); } return norm(o); }
      case 'kidney': { const d = 0.2 + t * 0.35; return polar(56, (a) => 1 - d * Math.exp(-Math.pow(a - 1.5 * Math.PI, 2) / 0.3) - d * Math.exp(-Math.pow(a + 0.5 * Math.PI, 2) / 0.3)); }
      case 'drop': { const m = 0.6 + t * 1.3, o = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; o.push([Math.sin(a) * Math.pow(Math.sin(a / 2), m), -Math.cos(a)]); } return norm(o); }
      case 'leaf': { const q = 0.55 + t * 0.9, top = [], bot = []; for (let i = 0; i <= 26; i++) { const x = i / 26, sn = Math.pow(Math.sin(Math.PI * x), q); const tilt = 0.12 * (x - 0.5); top.push([x, 0.5 - 0.5 * sn + tilt]); bot.push([x, 0.5 + 0.5 * sn + tilt]); } return norm(top.concat(bot.reverse().slice(1, -1))); }
      case 'cloud': { const n = Math.round(4 + t * 6); return polar(72, (a) => 0.8 + 0.2 * Math.abs(Math.cos((n * a) / 2))); }
      default: return [[0, 0], [1, 0], [1, 1], [0, 1]];
    }
  }
  function rotUnit(p, r) {
    const x = p[0], y = p[1];
    if (r === 1) return [1 - y, x];
    if (r === 2) return [1 - x, 1 - y];
    if (r === 3) return [y, 1 - x];
    return [x, y];
  }
  function ringOf(f) {
    const ur = unitRing(f.shape, f.cut, f.seed || 1).map((p) => rotUnit(p, f.rot));
    return ur.map((p) => [f.x + p[0] * f.w, f.y + p[1] * f.h]);
  }
  function polyArea(r) {
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }
  function polyCentroid(r) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const k = p[0] * q[1] - q[0] * p[1];
      a += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k;
    }
    if (Math.abs(a) < 1e-9) return [r[0][0], r[0][1]];
    return [cx / (3 * a), cy / (3 * a)];
  }
  // kol kalınlığı (bu şekil için en dar kısım)
  function armFrac(shape, c) {
    if (shape === 'L') return 1 - c;
    if (shape === 'T') return Math.min(0.42, Math.max(0.25, 1 - 1.5 * c));
    if (shape === 'U') return Math.min((1 - c) / 2, 0.45);
    if (shape === 'plus') return 0.9 - c;
    if (shape === 'H') return (1 - c) / 2;
    if (shape === 'band') return 0.3;
    if (shape === 'crescent') return 0.35;
    if (shape === 'leaf' || shape === 'drop' || shape === 'tri' || shape === 'sector') return 0.7;
    return 1;
  }

  /* ---------- çokgen geometrisi ---------- */
  function pointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function segCross(p, q, a, b) {
    const d = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
    return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
  }
  function inPoly(x, y, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  }
  function ringDist(ra, rb) {
    let best = Infinity;
    for (let i = 0; i < ra.length; i++) {
      const p = ra[i];
      for (let j = 0; j < rb.length; j++) {
        const a = rb[j], b = rb[(j + 1) % rb.length];
        const d = pointSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
      }
    }
    for (let j = 0; j < rb.length; j++) {
      const p = rb[j];
      for (let i = 0; i < ra.length; i++) {
        const a = ra[i], b = ra[(i + 1) % ra.length];
        const d = pointSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
      }
    }
    return best;
  }
  function ringsCross(ra, rb) {
    for (let i = 0; i < ra.length; i++) {
      const p = ra[i], q = ra[(i + 1) % ra.length];
      for (let j = 0; j < rb.length; j++) if (segCross(p, q, rb[j], rb[(j + 1) % rb.length])) return true;
    }
    return false;
  }
  const bboxGap = (a, b) => {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return Math.hypot(dx, dy);
  };
  const olen = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

  /* şeklin içine sığan en büyük (kutu oranında) dikdörtgen: tepe noktasından başlayıp büyütülür */
  function insetRect(ring, bb) {
    let best = null, bd = -1;
    const N = 11;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const x = bb.x + (bb.w * i) / N, y = bb.y + (bb.h * j) / N;
      if (!inPoly(x, y, ring)) continue;
      let d = Infinity;
      for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; d = Math.min(d, pointSeg(x, y, a[0], a[1], b[0], b[1])); }
      if (d > bd) { bd = d; best = [x, y]; }
    }
    if (!best) return { x: bb.x + bb.w * 0.25, y: bb.y + bb.h * 0.25, w: bb.w * 0.5, h: bb.h * 0.5 };
    const fits = (k) => {
      const hw = (bb.w * k) / 2, hh = (bb.h * k) / 2;
      const x0 = best[0] - hw, x1 = best[0] + hw, y0 = best[1] - hh, y1 = best[1] + hh;
      for (let i = 0; i <= 4; i++) {
        const fx = x0 + ((x1 - x0) * i) / 4, fy = y0 + ((y1 - y0) * i) / 4;
        if (!inPoly(fx, y0, ring) || !inPoly(fx, y1, ring) || !inPoly(x0, fy, ring) || !inPoly(x1, fy, ring)) return false;
      }
      return !ring.some((p) => p[0] > x0 + 1e-6 && p[0] < x1 - 1e-6 && p[1] > y0 + 1e-6 && p[1] < y1 - 1e-6);
    };
    let lo = 0.05, hi = 1;
    for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    // aşırı küçük kalırsa en iyi noktanın çevresi
    return { x: best[0] - (bb.w * lo) / 2, y: best[1] - (bb.h * lo) / 2, w: bb.w * lo, h: bb.h * lo };
  }

  /* iki mekân arası: boşluk (m), ortak kenar uzunluğu (m), çakışma alanı (m²) */
  function pairInfo(A, B) {
    const bg = bboxGap(A, B);
    if (bg > 14) return { gap: bg, contact: 0, overlap: 0 };
    if (A.shape === 'rect' && B.shape === 'rect') {
      const ox = olen(A.x, A.x + A.w, B.x, B.x + B.w), oy = olen(A.y, A.y + A.h, B.y, B.y + B.h);
      if (ox > 1e-6 && oy > 1e-6) return { gap: 0, contact: 0, overlap: ox * oy };
      const contact = bg <= 0.2 ? Math.max(0, ox > 1e-6 ? ox : 0, oy > 1e-6 ? oy : 0) : 0;
      return { gap: bg, contact: contact, overlap: 0 };
    }
    // genel durum
    let inter = ringsCross(A.ring, B.ring);
    if (!inter) inter = inPoly(A.ring[0][0], A.ring[0][1], B.ring) || inPoly(B.ring[0][0], B.ring[0][1], A.ring);
    if (inter) {
      const x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w), y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
      let n = 0;
      const step = 0.25;
      for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) if (inPoly(x, y, A.ring) && inPoly(x, y, B.ring)) n++;
      return { gap: 0, contact: 0, overlap: n * step * step };
    }
    const gap = ringDist(A.ring, B.ring);
    let contact = 0;
    if (gap <= 0.2) {
      const step = 0.2;
      for (let i = 0; i < A.ring.length; i++) {
        const p = A.ring[i], q = A.ring[(i + 1) % A.ring.length];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const k = Math.max(1, Math.round(len / step));
        for (let m = 0; m < k; m++) {
          const t = (m + 0.5) / k, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
          let d = Infinity;
          for (let j = 0; j < B.ring.length; j++) { const a = B.ring[j], b = B.ring[(j + 1) % B.ring.length]; d = Math.min(d, pointSeg(x, y, a[0], a[1], b[0], b[1])); }
          if (d <= 0.2) contact += len / k;
        }
      }
    }
    return { gap: gap, contact: contact, overlap: 0 };
  }

  /* ---------- varsayılan şekil ve yerleşim ---------- */
  function defaultShape(s) {
    const asp = s.zone === 'sirkulasyon' ? 2.8 : 1.35;
    const w = Math.max(MIN_DIM, r1(Math.sqrt(s.area * asp)));
    const h = Math.max(MIN_DIM, r1(s.area / w));
    return { x: 0, y: 0, w: w, h: h, shape: 'rect', rot: 0, cut: 0.4, seed: 1, lv: 0, nf: 1, roof: 'plain', furn: [] };
  }

  /* kurucu yerleşim: mekânlar tek tek, daha önce yerleşenlerin kenarlarına dayanarak eklenir.
     Maliyet: güçlü ilişkide bitişiklik, "ayrı tut"ta mesafe, kutu çevresinin büyümesi (kompaktlık),
     balon konumuna yakınlık. Çakışma olmaz. fixed: yerinde kalacak kimlikler · fromBubbles: tercih konumu */
  function autoPlace(spaces, relations, shapes, o) {
    o = o || {};
    const fixed = o.fixed || new Set();
    const ids = spaces.map((s) => s.id);
    const P = {};
    ids.forEach((id) => { P[id] = Object.assign({}, shapes[id]); });
    // tercih konumları (balonlardan)
    const pref = {};
    if (o.fromBubbles && spaces.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      spaces.forEach((s) => { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); });
      const total = U.sum(spaces, (s) => s.area) || 1;
      const span = Math.max(maxX - minX, maxY - minY, 1);
      const k = (Math.sqrt(total) * 1.5) / span;
      spaces.forEach((s) => { pref[s.id] = [(s.x - (minX + maxX) / 2) * k, (s.y - (minY + maxY) / 2) * k]; });
    }
    const W = { strong: 3, weak: 1, avoid: 2 };
    const rel = {};
    ids.forEach((id) => { rel[id] = []; });
    Object.keys(relations).forEach((key) => {
      const q = key.split('|');
      if (!P[q[0]] || !P[q[1]] || !W[relations[key]]) return;
      rel[q[0]].push([q[1], relations[key]]); rel[q[1]].push([q[0], relations[key]]);
    });
    const placed = [];
    const isPlaced = new Set();
    ids.forEach((id) => { if (fixed.has(id)) { placed.push(id); isPlaced.add(id); } });
    const todo = ids.filter((id) => !fixed.has(id));
    const lvA = (q) => (q.lv || 0), topA = (q) => (q.lv || 0) + (q.nf || 1) - 1;
    const sameLv = (a, b) => lvA(a) <= topA(b) && lvA(b) <= topA(a);
    const ovl = (r, skip, me) => placed.some((id) => { if (id === skip) return false; const q = P[id]; if (me && !sameLv(me, q)) return false; return olen(r.x, r.x + r.w, q.x, q.x + q.w) > 0.01 && olen(r.y, r.y + r.h, q.y, q.y + q.h) > 0.01; });
    const bbox = () => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      placed.forEach((id) => { const q = P[id]; x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); });
      return [x0, y0, x1, y1];
    };
    while (todo.length) {
      // sıradaki: yerleşenlerle bağı en güçlü olan (yoksa en büyük)
      let bi = 0, bs = -1;
      todo.forEach((id, i) => {
        let sc = 0;
        rel[id].forEach((r) => { if (isPlaced.has(r[0]) && r[1] !== 'avoid') sc += W[r[1]]; });
        sc = sc * 1000 + P[id].w * P[id].h + (placed.length ? 0 : rel[id].length * 50);
        if (sc > bs) { bs = sc; bi = i; }
      });
      const id = todo.splice(bi, 1)[0];
      const f = P[id];
      if (!placed.length) { f.x = 0; f.y = 0; placed.push(id); isPlaced.add(id); continue; }
      const bb = bbox();
      const per0 = (bb[2] - bb[0]) + (bb[3] - bb[1]);
      let best = null;
      const cands = [];
      placed.forEach((qid) => {
        const q = P[qid];
        [q.y, q.y + q.h - f.h, q.y + (q.h - f.h) / 2].forEach((y) => { cands.push([q.x + q.w, y]); cands.push([q.x - f.w, y]); });
        [q.x, q.x + q.w - f.w, q.x + (q.w - f.w) / 2].forEach((x) => { cands.push([x, q.y + q.h]); cands.push([x, q.y - f.h]); });
        // ilişkili ortakla aynı hizada başlama
        rel[id].forEach((r) => {
          const t = P[r[0]];
          if (!t || !isPlaced.has(r[0])) return;
          cands.push([q.x + q.w, t.y]); cands.push([q.x - f.w, t.y]); cands.push([t.x, q.y + q.h]); cands.push([t.x, q.y - f.h]);
        });
      });
      cands.forEach((c) => {
        const r = { x: c[0], y: c[1], w: f.w, h: f.h };
        if (ovl(r, id, f)) return;
        let cost = 0;
        rel[id].forEach((e) => {
          if (!isPlaced.has(e[0])) return;
          const t = P[e[0]];
          const gap = bboxGap(r, t);
          if (!sameLv(f, t)) {
            // farklı katlar: üst üste oturmak iyi, planda uzak durmak kötü
            const stk = olen(r.x, r.x + r.w, t.x, t.x + t.w) > 0.5 && olen(r.y, r.y + r.h, t.y, t.y + t.h) > 0.5;
            if (e[1] === 'strong') cost += 3 * (stk ? 0.15 : 1 + gap * 0.25);
            else if (e[1] === 'weak') cost += stk ? 0 : 0.3 + 0.15 * gap;
            else cost += stk ? 1 : 0;
            return;
          }
          const contact = gap <= 0.2 ? Math.max(0, olen(r.x, r.x + r.w, t.x, t.x + t.w), olen(r.y, r.y + r.h, t.y, t.y + t.h)) : 0;
          if (e[1] === 'strong') cost += 3 * (contact >= 0.8 ? 0 : 2 + gap);
          else if (e[1] === 'weak') cost += gap <= 6 ? 0.1 * gap : 0.6 + 0.3 * gap;
          else cost += gap < 2.5 ? 2 * (6 - gap * 2) : 0;
        });
        const nx0 = Math.min(bb[0], r.x), ny0 = Math.min(bb[1], r.y), nx1 = Math.max(bb[2], r.x + r.w), ny1 = Math.max(bb[3], r.y + r.h);
        cost += 0.45 * ((nx1 - nx0) + (ny1 - ny0) - per0) + 0.08 * Math.abs((nx1 - nx0) - (ny1 - ny0));
        if (pref[id]) cost += 0.03 * Math.hypot(r.x + r.w / 2 - pref[id][0], r.y + r.h / 2 - pref[id][1]);
        if (!best || cost < best.cost - 1e-9) best = { cost: cost, x: r.x, y: r.y };
      });
      if (best) { f.x = best.x; f.y = best.y; } else { f.x = bb[2] + 1; f.y = bb[1]; }
      placed.push(id); isPlaced.add(id);
    }
    const out = {};
    ids.forEach((id) => { const q = P[id]; out[id] = Object.assign({}, q, { x: r1(q.x), y: r1(q.y) }); });
    if (!o.keepOrigin) {
      let mx = Infinity, my = Infinity;
      ids.forEach((id) => { mx = Math.min(mx, out[id].x); my = Math.min(my, out[id].y); });
      if (isFinite(mx)) ids.forEach((id) => { out[id].x = r1(out[id].x - mx); out[id].y = r1(out[id].y - my); });
    }
    return out;
  }

  function freeDefaults() {
    return { v: 2, snap: 0.5, shapes: {}, extras: [], site: { on: false, w: 40, d: 30, x: 0, y: 0 }, ctx: { mode: 'auto', seed: 3, dens: 0.7 }, map: App.basemap ? App.basemap.defaults() : { on: false }, org: [0, 0], link: null, steps: [], kat: false };
  }
  function freeInit(project) {
    const shapes = {};
    project.spaces.forEach((s) => { shapes[s.id] = defaultShape(s); });
    return Object.assign(freeDefaults(), { shapes: project.spaces.length ? autoPlace(project.spaces, project.relations, shapes, { fromBubbles: true }) : shapes });
  }

  /* bir mekân eklenince: mevcutlar yerinde, yeni olan ilişkilerine göre yerleşir */
  function freeAdd(project, free) {
    const shapes = Object.assign({}, free.shapes);
    const fresh = project.spaces.filter((s) => !shapes[s.id]);
    if (!fresh.length) return free;
    let x1 = 0, y0 = 0, y1 = 0;
    const have = project.spaces.filter((s) => shapes[s.id]);
    if (have.length) {
      x1 = Math.max.apply(null, have.map((s) => shapes[s.id].x + shapes[s.id].w));
      y0 = Math.min.apply(null, have.map((s) => shapes[s.id].y));
      y1 = Math.max.apply(null, have.map((s) => shapes[s.id].y + shapes[s.id].h));
    }
    fresh.forEach((s, i) => {
      const d = defaultShape(s);
      d.x = r1(x1 + 1.5); d.y = r1(y0 + ((y1 - y0) - d.h) / 2 + i * 0.5);
      shapes[s.id] = d;
    });
    const placed = autoPlace(project.spaces, project.relations, shapes, { fixed: new Set(have.map((s) => s.id)), iter: 90, keepOrigin: true });
    return Object.assign({}, free, { shapes: placed });
  }

  /* geçerli değerlere sıkıştır */
  function cleanFurn(list) {
    if (!Array.isArray(list)) return [];
    const ids = st.FURN_IDS || [];
    const out = [];
    list.slice(0, 120).forEach((q, i) => {
      if (!q || (ids.length && ids.indexOf(q.k) < 0)) return;
      out.push({ id: String(q.id || 'f' + i + Math.random().toString(36).slice(2, 5)).slice(0, 12), k: q.k, x: Math.round(num(q.x, 0) * 100) / 100, y: Math.round(num(q.y, 0) * 100) / 100, r: ((Math.round(num(q.r, 0)) % 4) + 4) % 4 });
    });
    return out;
  }
  function cleanShape(q, base) {
    const o = Object.assign({}, base || {}, q || {});
    return {
      x: r1(num(o.x, 0)), y: r1(num(o.y, 0)),
      w: U.clamp(r1(num(o.w, 3)), MIN_DIM, MAX_DIM), h: U.clamp(r1(num(o.h, 3)), MIN_DIM, MAX_DIM),
      shape: SHAPE_IDS.indexOf(o.shape) >= 0 ? o.shape : 'rect',
      rot: ((Math.round(num(o.rot, 0)) % 4) + 4) % 4,
      cut: U.clamp(Math.round(num(o.cut, 0.4) * 100) / 100, 0.15, 0.65),
      seed: U.clamp(Math.round(num(o.seed, 1)), 1, 99999),
      lv: U.clamp(Math.round(num(o.lv, 0)), 0, 5),
      nf: U.clamp(Math.round(num(o.nf, 1)), 1, 60),
      roof: o.roof === 'green' ? 'green' : 'plain',
      furn: cleanFurn(o.furn),
    };
  }

  /* hedef alana oturt: ölçeği kareköküyle düzelt (en boy oranı korunur), merkez sabit */
  function fitToTarget(f, target) {
    const items = makeItem({ id: 'x', name: '', zone: 'sosyal', area: target }, f);
    const k = Math.sqrt(target / Math.max(0.01, items.area));
    const w = U.clamp(r1(f.w * k), MIN_DIM, MAX_DIM), h = U.clamp(r1(f.h * k), MIN_DIM, MAX_DIM);
    return Object.assign({}, f, { w: w, h: h, x: r1(f.x + (f.w - w) / 2), y: r1(f.y + (f.h - h) / 2) });
  }

  /* bir mekânı diğerine bitiştir (away: aralarını aç) — kutular çakışmaz */
  function attach(f, other, away) {
    const ca = [f.x + f.w / 2, f.y + f.h / 2], cb = [other.x + other.w / 2, other.y + other.h / 2];
    const dx = ca[0] - cb[0], dy = ca[1] - cb[1];
    const gap = away ? 3 : 0;
    const horiz = Math.abs(dx) / (f.w + other.w) >= Math.abs(dy) / (f.h + other.h);
    let x = f.x, y = f.y;
    if (horiz) {
      x = dx >= 0 ? other.x + other.w + gap : other.x - f.w - gap;
      y = U.clamp(f.y, other.y - f.h + 1.2, other.y + other.h - 1.2);
      if (away) y = f.y;
    } else {
      y = dy >= 0 ? other.y + other.h + gap : other.y - f.h - gap;
      x = U.clamp(f.x, other.x - f.w + 1.2, other.x + other.w - 1.2);
      if (away) x = f.x;
    }
    return Object.assign({}, f, { x: r1(x), y: r1(y) });
  }

  /* ---------- türetilmiş mekân ---------- */
  const FH = 3.2; // kat yüksekliği (m)
  function makeItem(space, f) {
    const ring = ringOf(f);
    const area = polyArea(ring);
    const c = polyCentroid(ring);
    const arm = armFrac(f.shape, f.cut);
    const thick = Math.min(f.w, f.h) * (f.shape === 'rect' ? 1 : Math.max(arm, 0.3));
    const nf = f.nf || 1, lv = f.lv || 0;
    return {
      id: space.id, spaceId: space.id, name: space.name, zone: space.zone, target: space.area,
      x: f.x, y: f.y, w: f.w, h: f.h, shape: f.shape, rot: f.rot, cut: f.cut, seed: f.seed || 1,
      lv: lv, nf: nf, top: lv + nf - 1, roof: f.roof === 'green' ? 'green' : 'plain', furn: f.furn || [], height: nf * FH, gfa: area * nf,
      ring: ring, area: area, cx: c[0], cy: c[1], thick: thick, aspect: Math.max(f.w, f.h) / Math.max(0.01, Math.min(f.w, f.h)),
      dev: space.area ? (area - space.area) / space.area : 0,
    };
  }
  // iki mekânın kat aralıkları kesişiyor mu? farklıysa aradaki kat farkı (0 = aynı kat)
  const levelGap = (a, b) => (a.lv > b.top ? a.lv - b.top : b.lv > a.top ? b.lv - a.top : 0);
  // etiket / donatı için içe sığan dikdörtgen (yavaş olabilir: yalnızca gerektiğinde)
  function labelRectOf(it) {
    if (it.shape === 'rect') return { x: it.x, y: it.y, w: it.w, h: it.h };
    if (it._lr) return it._lr;
    it._lr = insetRect(it.ring, { x: it.x, y: it.y, w: it.w, h: it.h });
    return it._lr;
  }

  const STATE_LABEL = { adjacent: 'Bitişik', near: 'Yakın', far: 'Uzak', overlap: 'Çakışık', stacked: 'Üst üste', floor: 'Farklı kat' };
  function relEval(type, info) {
    if (info.dv) {
      const stk = info.stack > 0.4;
      let ok;
      if (type === 'strong') ok = stk ? (info.dv === 1 ? 0.9 : 0.6) : info.dv === 1 && info.gap <= 3 ? 0.5 : 0.2;
      else if (type === 'weak') ok = info.dv <= 1 && (stk || info.gap <= 6) ? 1 : 0.5;
      else ok = info.dv === 1 && stk ? 0.5 : 1;
      return { state: stk ? 'stacked' : 'floor', ok: ok };
    }
    const state = info.overlap > 0.4 ? 'overlap' : info.contact >= 0.8 ? 'adjacent' : info.gap <= 2.5 ? 'near' : 'far';
    let ok;
    if (type === 'strong') ok = state === 'adjacent' ? 1 : state === 'overlap' ? 0.5 : state === 'near' ? 0.55 : info.gap <= 6 ? 0.25 : 0;
    else if (type === 'weak') ok = info.gap <= 6 ? 1 : info.gap <= 12 ? 0.5 : 0;
    else ok = state === 'overlap' || state === 'adjacent' ? 0 : info.gap < 2 ? 0.4 : 1;
    return { state: state, ok: ok };
  }

  // kat farkını hesaba katan çift bilgisi
  function pairFull(A, B) {
    const dv = levelGap(A, B);
    const info = pairInfo(A, B);
    if (!dv) return info;
    return { gap: info.gap, contact: 0, overlap: 0, stack: info.overlap, dv: dv };
  }

  const LEVEL = { hata: 0, uyari: 1, oneri: 2, ok: 3 };

  /* ---------- ek öğeler: yeşil alan, boşluk (avlu), ağaç, ok ---------- */
  const AK = ['flow', 'through', 'entry'];
  const EXTRA_KINDS = [{ v: 'green', label: 'Yeşil alan' }, { v: 'void', label: 'Boşluk / avlu' }, { v: 'tree', label: 'Ağaç' }, { v: 'arrow', label: 'Ok' }];
  const ARROW_KINDS = [{ v: 'flow', label: 'Yaya akışı' }, { v: 'through', label: 'Geçit' }, { v: 'entry', label: 'Ana giriş' }];
  const uid = () => 'x' + Math.random().toString(36).slice(2, 8);
  function cleanExtra(el, patch) {
    const o = Object.assign({}, el, patch || {});
    const cl = (v, a, b, d) => U.clamp(num(v, d), a, b);
    const base = { id: String(o.id || uid()).slice(0, 12), t: o.t };
    if (o.t === 'green') return Object.assign(base, { x: r1(cl(o.x, -2000, 2000, 0)), y: r1(cl(o.y, -2000, 2000, 0)), w: r1(cl(o.w, 0.6, 400, 8)), h: r1(cl(o.h, 0.6, 400, 6)), round: o.round !== false, seed: Math.round(cl(o.seed, 1, 99999, 1)), organic: !!o.organic });
    if (o.t === 'void') return Object.assign(base, { x: r1(cl(o.x, -2000, 2000, 0)), y: r1(cl(o.y, -2000, 2000, 0)), w: r1(cl(o.w, 0.6, 400, 8)), h: r1(cl(o.h, 0.6, 400, 6)) });
    if (o.t === 'tree') return Object.assign(base, { x: r1(cl(o.x, -2000, 2000, 0)), y: r1(cl(o.y, -2000, 2000, 0)), r: r1(cl(o.r, 0.4, 12, 2)) });
    if (o.t === 'arrow') return Object.assign(base, { k: AK.indexOf(o.k) >= 0 ? o.k : 'flow', x1: r1(cl(o.x1, -2000, 2000, 0)), y1: r1(cl(o.y1, -2000, 2000, 0)), x2: r1(cl(o.x2, -2000, 2000, 4)), y2: r1(cl(o.y2, -2000, 2000, 0)) });
    return null;
  }
  // yeni ek öğe: görünür alanın ortasına
  function makeExtra(kind, at, n, k) {
    const cx = at ? at[0] : 10, cy = at ? at[1] : 8, o = (n || 0) * 1.5;
    if (kind === 'green') return cleanExtra({ t: 'green', x: cx - 4 + o, y: cy - 3 + o, w: 8, h: 6, round: true });
    if (kind === 'void') return cleanExtra({ t: 'void', x: cx - 3 + o, y: cy - 3 + o, w: 6, h: 6 });
    if (kind === 'tree') return cleanExtra({ t: 'tree', x: cx + o, y: cy + o, r: 2.2 });
    return cleanExtra({ t: 'arrow', k: k || 'flow', x1: cx - 5 + o, y1: cy + o, x2: cx + 5 + o, y2: cy + o });
  }
  // yeşil alanın halkası (yuvarlak = elips, organik = leke, aksi halde dikdörtgen)
  function extraRing(e) {
    if (e.t === 'green' && e.organic) return unitRing('blob', 0.5, e.seed || 1).map((p) => [e.x + p[0] * e.w, e.y + p[1] * e.h]);
    if (e.t === 'green' && e.round) return unitRing('circle', 0.4, 1).map((p) => [e.x + p[0] * e.w, e.y + p[1] * e.h]);
    return [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]];
  }

  /* ---------- parsel çokgeni ---------- */
  function siteRing(site) {
    if (!site || !site.on) return null;
    if (site.pts && site.pts.length >= 3) return site.pts;
    return [[site.x, site.y], [site.x + site.w, site.y], [site.x + site.w, site.y + site.d], [site.x, site.y + site.d]];
  }

  function ringDistPoint(p, poly) {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; d = Math.min(d, pointSeg(p[0], p[1], a[0], a[1], b[0], b[1])); }
    return d;
  }

  const memo = { k: null, v: null };
  function freeDerive(project) {
    const free = project.study && project.study.free;
    const key = [project.spaces, project.relations, free];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    const out = compute(project, free);
    memo.k = key; memo.v = out;
    return out;
  }

  function compute(project, free) {
    const items = [];
    const byId = new Map();
    project.spaces.forEach((s) => {
      const f = free && free.shapes[s.id] ? cleanShape(free.shapes[s.id]) : defaultShape(s);
      const it = makeItem(s, f);
      items.push(it); byId.set(it.id, it);
    });
    const extras = ((free && free.extras) || []).map((e) => cleanExtra(e)).filter(Boolean);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach((it) => { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); });
    const bounds = items.length ? { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 } : { x0: 0, y0: 0, x1: 20, y1: 12, w: 20, h: 12 };

    // çiftler: ilişkili olanlar + çakışanlar
    const pairs = [];
    const seen = new Set();
    Object.keys(project.relations).forEach((key) => {
      const q = key.split('|');
      const A = byId.get(q[0]), B = byId.get(q[1]);
      if (!A || !B) return;
      const type = project.relations[key];
      const info = pairFull(A, B);
      const ev = relEval(type, info);
      pairs.push({ key: key, a: A.id, b: B.id, type: type, gap: info.gap, contact: info.contact, overlap: info.overlap, dv: info.dv || 0, state: ev.state, ok: ev.ok });
      seen.add(key);
    });
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (bboxGap(A, B) > 0 || levelGap(A, B)) continue;
      const key = U.pairKey(A.id, B.id);
      const p = pairs.find((q) => q.key === key);
      const info = p ? p : pairInfo(A, B);
      if (info.overlap > 0.4) overlaps.push({ a: A.id, b: B.id, overlap: info.overlap });
    }

    // skor
    const W = { strong: 3, weak: 1, avoid: 2 };
    let rs = 0, rw = 0, strongOk = 0, strongTotal = 0;
    pairs.forEach((p) => { rs += W[p.type] * p.ok; rw += W[p.type]; if (p.type === 'strong') { strongTotal++; if (p.state === 'adjacent') strongOk++; } });
    const relScore = rw ? rs / rw : null;
    const total = U.sum(items, (it) => it.area);
    const ovArea = U.sum(overlaps, (o) => o.overlap);
    const ovScore = overlaps.length ? Math.max(0, 1 - ovArea / (0.05 * (total || 1))) : 1;
    const fit = items.length ? U.sum(items, (it) => 1 - Math.min(1, Math.abs(it.dev) / 0.3)) / items.length : 1;
    const compact = bounds.w * bounds.h ? Math.min(1, total / (bounds.w * bounds.h) / 0.55) : 1;
    const parts = relScore == null
      ? [{ k: 'Çakışmasızlık', v: ovScore, w: 0.45 }, { k: 'Alan uyumu', v: fit, w: 0.35 }, { k: 'Kompaktlık', v: compact, w: 0.2 }]
      : [{ k: 'İlişki uyumu', v: relScore, w: 0.5 }, { k: 'Çakışmasızlık', v: ovScore, w: 0.2 }, { k: 'Alan uyumu', v: fit, w: 0.2 }, { k: 'Kompaktlık', v: compact, w: 0.1 }];
    const score = items.length ? Math.round(parts.reduce((t, p) => t + p.v * p.w, 0) * 100) : null;
    const metrics = { score: score, parts: parts, relScore: relScore, strongOk: strongOk, strongTotal: strongTotal, overlapCount: overlaps.length, overlapArea: ovArea, areaFit: fit, total: total, target: U.sum(items, (it) => it.target), compact: compact, count: items.length };

    // kat, parsel, kabuk ölçüleri
    const levels = items.length ? Math.max.apply(null, items.map((it) => it.top)) + 1 : 1;
    const usedLv = items.some((it) => it.lv > 0 || it.nf > 1);
    const ring = siteRing(free && free.site);
    const siteA = ring ? polyArea(ring) : 0;
    const foot = U.sum(items.filter((it) => it.lv === 0), (it) => it.area);
    const gfa = U.sum(items, (it) => it.gfa);
    let greenA = 0, voidA = 0, trees = 0;
    extras.forEach((e) => { if (e.t === 'green') greenA += polyArea(extraRing(e)); else if (e.t === 'void') voidA += e.w * e.h; else if (e.t === 'tree') trees++; });
    const roofG = U.sum(items.filter((it) => it.roof === 'green' && it.top === it.lv + it.nf - 1), (it) => it.area);
    metrics.levels = levels; metrics.usedLevels = usedLv; metrics.siteArea = siteA; metrics.footprint = foot; metrics.gfa = gfa;
    metrics.taks = siteA ? foot / siteA : null; metrics.kaks = siteA ? gfa / siteA : null;
    metrics.green = greenA; metrics.voidArea = voidA; metrics.trees = trees; metrics.roofGreen = roofG;
    metrics.greenShare = siteA ? Math.min(1, (greenA + roofG) / siteA) : null;
    metrics.maxHeight = items.length ? Math.max.apply(null, items.map((it) => it.lv * FH + it.height)) : 0;
    const shell = free && free.link && free.link.shell && free.link.shell.length >= 3 ? free.link.shell : null;
    const outside = (poly) => items.filter((it) => it.ring.some((q) => !inPoly(q[0], q[1], poly) && ringDistPoint(q, poly) > 0.15));
    const outP = ring ? outside(ring) : [];
    const outS = shell ? outside(shell) : [];

    return { items: items, byId: byId, bounds: bounds, pairs: pairs, overlaps: overlaps, extras: extras, siteRing: ring, shell: shell, outParcel: outP, outShell: outS, metrics: metrics, findings: findings(project, items, byId, pairs, overlaps, metrics, { outP: outP, outS: outS, free: free }) };
  }

  function findings(project, items, byId, pairs, overlaps, m, ex) {
    const out = [];
    const nm = (id) => byId.get(id).name;
    if (!items.length) {
      out.push({ id: 'empty', level: 'oneri', title: 'Önce işlev şemasında mekân ekleyin', detail: 'Mekân etüdü, İşlev Şeması’ndaki mekânları ölçekli birimlere dönüştürür.', src: [], actions: [{ type: 'goto', module: 'islev', label: 'İşlev Şeması’na git' }] });
      return { items: out, counts: { hata: 0, uyari: 0, oneri: 1 } };
    }
    overlaps.slice(0, 5).forEach((o) => out.push({ id: 'ov-' + o.a + o.b, level: 'hata', title: nm(o.a) + ' ile ' + nm(o.b) + ' çakışıyor (≈ ' + fmt(o.overlap, 1) + ' m²)', detail: 'İki mekân aynı alanı kaplıyor. Birini kaydırın, küçültün ya da “Bitiştir” ile yan yana alın.', src: [], actions: [{ type: 'freeAttach', id: o.a, to: o.b, label: nm(o.a) + ' → yanına al' }, { type: 'select', id: o.a, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'avoid' && (p.state === 'adjacent' || p.state === 'overlap')).slice(0, 4).forEach((p) => out.push({ id: 'avoid-' + p.key, level: 'uyari', title: nm(p.a) + ' ile ' + nm(p.b) + ' bitişik ama ayrı tutulmalı', detail: 'Bu çift “ayrı tut” olarak işaretli (gürültü, koku, mahremiyet). Aralarını açın.', src: ['White'], actions: [{ type: 'freeAttach', id: p.a, to: p.b, away: true, label: nm(p.a) + ' → uzaklaştır' }, { type: 'select', id: p.a, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'strong' && p.state === 'far').slice(0, 5).forEach((p) => out.push({ id: 'far-' + p.key, level: 'uyari', title: nm(p.a) + ' ile ' + nm(p.b) + ' yakın olmalı ama ' + fmt(p.gap, 1) + ' m uzakta', detail: 'Güçlü ilişkili mekânlar bitişik ya da en fazla kısa bir geçişle ayrılmış olmalı.', src: ['White'], actions: [{ type: 'freeAttach', id: p.a, to: p.b, label: nm(p.a) + ' → bitiştir' }, { type: 'select', id: p.a, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'strong' && p.state === 'near').slice(0, 4).forEach((p) => out.push({ id: 'near-' + p.key, level: 'oneri', title: nm(p.a) + ' ile ' + nm(p.b) + ' arasında ' + fmt(p.gap, 1) + ' m boşluk var', detail: 'Aralarındaki küçük boşluğu kapatın ya da bir geçiş (koridor, kapı) tanımlayın.', src: ['White'], actions: [{ type: 'freeAttach', id: p.a, to: p.b, label: nm(p.a) + ' → bitiştir' }, { type: 'select', id: p.a, label: 'Göster' }] }));
    items.filter((it) => Math.abs(it.dev) > 0.15).slice(0, 4).forEach((it) => out.push({ id: 'dev-' + it.id, level: 'oneri', title: it.name + ' hedef alandan %' + Math.round(Math.abs(it.dev) * 100) + (it.dev > 0 ? ' büyük' : ' küçük') + ' (' + fmt(it.area, 1) + ' / ' + fmt(it.target, 1) + ' m²)', detail: 'İşlev şemasındaki alan programı ' + fmt(it.target, 1) + ' m². Hedefe oturtun ya da yeni alanı şemaya işleyin.', src: [], actions: [{ type: 'freeFit', id: it.id, label: 'Hedef alana oturt' }, { type: 'select', id: it.id, label: 'Göster' }] }));
    items.filter((it) => it.zone !== 'sirkulasyon' && (it.thick < 1.4 || it.aspect > 4)).slice(0, 3).forEach((it) => out.push({ id: 'thin-' + it.id, level: 'oneri', title: it.name + ' çok dar kalıyor (' + fmt(Math.min(it.w, it.h), 1) + ' × ' + fmt(Math.max(it.w, it.h), 1) + ' m)', detail: 'Bu oranda mekân kullanışlı olmaz. Boyutları ya da şekli değiştirin.', src: ['S'], actions: [{ type: 'select', id: it.id, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'strong' && p.state === 'floor').slice(0, 4).forEach((p) => out.push({ id: 'floor-' + p.key, level: 'oneri', title: nm(p.a) + ' ile ' + nm(p.b) + ' farklı katlarda ve planda ayrık', detail: 'Güçlü ilişkili mekânlar ya aynı katta bitişik ya da üst üste olmalı; düşey bağlantı (merdiven, asansör) planlayın.', src: ['White'], actions: [{ type: 'select', id: p.a, label: 'Göster' }] }));
    if (ex && ex.outP && ex.outP.length) out.push({ id: 'out-parcel', level: 'uyari', title: ex.outP.length + ' mekân parselin dışına taşıyor', detail: 'Parsel sınırı kesikli çizgidir. Mekânı içeri çekin ya da parsel ölçüsünü büyütün.', src: [], actions: [{ type: 'select', id: ex.outP[0].id, label: 'Göster' }] });
    if (ex && ex.outS && ex.outS.length) out.push({ id: 'out-shell', level: 'uyari', title: ex.outS.length + ' mekân vaziyetteki yapı kabuğunun dışında', detail: 'Mekânlar bağlı olduğu yapının sınırı içinde kalmalı. Kabuğa sığdırın ya da şekli değiştirin.', src: [], actions: [{ type: 'freeFitShell', label: 'Kabuğa sığdır' }, { type: 'select', id: ex.outS[0].id, label: 'Göster' }] });
    if (m.taks != null && m.taks > 0.8) out.push({ id: 'taks', level: 'hata', title: 'Taban alanı oranı çok yüksek (%' + Math.round(m.taks * 100) + ')', detail: 'Parselin neredeyse tamamı kapalı; avlu, boşluk ya da yeşil alanla açıklık sağlayın.', src: [], actions: [{ type: 'freeExtra', kind: 'void', label: 'Boşluk ekle' }] });
    else if (m.taks != null && m.taks > 0.65) out.push({ id: 'taks', level: 'uyari', title: 'Taban alanı oranı yüksek (%' + Math.round(m.taks * 100) + ')', detail: 'Işık ve hava için kütlede oyuk ya da avlu açmayı düşünün.', src: [], actions: [{ type: 'freeExtra', kind: 'void', label: 'Boşluk ekle' }] });
    if (m.siteArea && m.greenShare != null && m.greenShare < 0.1) out.push({ id: 'green', level: 'oneri', title: 'Yeşil alan az (%' + Math.round(m.greenShare * 100) + ')', detail: 'Avluya yeşil alan, çatıya yeşil çatı ya da parsele ağaç ekleyin.', src: [], actions: [{ type: 'freeExtra', kind: 'green', label: 'Yeşil alan ekle' }] });
    out.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    out.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    if (!counts.hata && !counts.uyari) out.unshift({ id: 'ok', level: 'ok', title: 'Mekânlar arası yerleşimde kritik sorun görünmüyor', detail: m.score != null ? 'Düzen skoru %' + m.score + '.' : 'İlişkileri tanımlayarak skoru başlatın.', src: [], actions: [] });
    return { items: out, counts: counts };
  }

  /* bir mekânın diğerleriyle ilişkileri (yan panel) */
  function relationsOf(project, fd, id) {
    const list = [];
    fd.items.forEach((o) => {
      if (o.id === id) return;
      const key = U.pairKey(id, o.id);
      const type = project.relations[key] || 'none';
      const p = fd.pairs.find((q) => q.key === key);
      let info;
      if (p) info = p; else { const a = fd.byId.get(id); info = Object.assign(pairInfo(a, o), {}); const ev = relEval('weak', info); info.state = ev.state; }
      list.push({ id: o.id, name: o.name, zone: o.zone, type: type, gap: info.gap, state: info.state, ok: p ? p.ok : null });
    });
    const rank = { strong: 0, avoid: 1, weak: 2, none: 3 };
    list.sort((a, b) => rank[a.type] - rank[b.type] || a.gap - b.gap);
    return list;
  }

  Object.assign(st, {
    SHAPES: SHAPES, SHAPE_GROUPS: SHAPE_GROUPS, SHAPE_BY: SHAPE_BY, shapeRing: unitRing, FH: FH, FREE_MIN: MIN_DIM, FREE_MAX: MAX_DIM, STATE_LABEL: STATE_LABEL,
    EXTRA_KINDS: EXTRA_KINDS, ARROW_KINDS: ARROW_KINDS, cleanExtra: cleanExtra, makeExtra: makeExtra, extraRing: extraRing, siteRing: siteRing, freeDefaults: freeDefaults,
    insetRect: insetRect, itemLabelRect: labelRectOf, levelGap: levelGap, srng: srng, inPoly: inPoly, pointSeg: pointSeg,
    freeInit: freeInit, freeAdd: freeAdd, freeAutoPlace: autoPlace, freeDefault: defaultShape, freeClean: cleanShape, freeFit: fitToTarget, freeAttach: attach,
    freeDerive: freeDerive, freeRelationsOf: relationsOf, freeRing: ringOf, freePairInfo: pairInfo, pairFull: pairFull, polyArea: polyArea, polyCentroid: polyCentroid,
  });
})();

/* çalışma kipi: 'mekanlar' (serbest düzen) | 'katlar' (kat planları) — tarayıcıda hatırlanır */
(function () {
  const App = window.App;
  App.study.modeOf = function (state) {
    const m = state.ui && state.ui.stMode;
    if (m === 'katlar' || m === 'mekanlar') return m;
    try { if (window.localStorage.getItem('archtools.study.mode') === 'katlar') return 'katlar'; } catch (e) {}
    return 'mekanlar';
  };
})();
