/* ==========================================================================
   22-lib-layout.js — otomatik yerleştirme (kuvvet tabanlı)
   Güçlü ilişki: çekme • Zayıf: yumuşak çekme • Ayrı tut: itme • Hepsi: çarpışma önleme
   Başlangıç konumu bağlantı derecesine göre merkezden spiral (deterministik).
   ========================================================================== */
(function () {
  const App = window.App;
  const geo = App.geo;

  function autoLayout(spaces, relations, k, opts) {
    opts = opts || {};
    const n = spaces.length;
    const out = {};
    if (!n) return out;
    const a = geo.area;
    const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;

    const deg = {};
    spaces.forEach((s) => (deg[s.id] = 0));
    Object.keys(relations).forEach((key) => {
      const t = relations[key];
      const ids = key.split('|');
      const w = t === 'strong' ? 3 : t === 'weak' ? 1 : 0.5;
      if (deg[ids[0]] != null) deg[ids[0]] += w;
      if (deg[ids[1]] != null) deg[ids[1]] += w;
    });

    const P = spaces
      .map((s) => ({ id: s.id, r: geo.radius(s.area, k), x: s.x, y: s.y, d: deg[s.id] || 0 }))
      .sort((p, q) => q.d + q.r * 0.01 - (p.d + p.r * 0.01));

    if (!opts.keep) {
      const golden = 2.399963;
      P.forEach((p, i) => {
        const rr = 36 * Math.sqrt(i + 0.5) * (k / 28) * 2.4;
        p.x = cx + Math.cos(i * golden) * rr * 1.45;
        p.y = cy + Math.sin(i * golden) * rr * 0.95;
      });
    }
    const idx = new Map();
    P.forEach((p, i) => idx.set(p.id, i));
    const rels = [];
    Object.keys(relations).forEach((key) => {
      const ids = key.split('|');
      if (idx.has(ids[0]) && idx.has(ids[1])) rels.push([idx.get(ids[0]), idx.get(ids[1]), relations[key]]);
    });
    const relMap = new Map();
    rels.forEach((r) => relMap.set(r[0] + '_' + r[1], r[2]));

    const ITER = opts.iter != null ? opts.iter : 520;
    for (let it = 0; it < ITER; it++) {
      const alpha = 1 - it / ITER;
      const step = 0.25 + 0.75 * alpha;
      const dx = new Array(n).fill(0), dy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const A = P[i], B = P[j];
          let vx = B.x - A.x, vy = B.y - A.y;
          let d = Math.hypot(vx, vy);
          if (d < 0.01) { vx = Math.cos(i * 7 + j); vy = Math.sin(i * 5 + j); d = 1; }
          const ux = vx / d, uy = vy / d;
          const rr = A.r + B.r;
          const type = relMap.get(i + '_' + j) || relMap.get(j + '_' + i);
          let f = 0; // + çekme, − itme
          if (d < rr + 10) f -= (rr + 10 - d) * 0.55; // çarpışma
          if (type === 'strong') { const target = rr + 3; if (d > target) f += (d - target) * 0.09; }
          else if (type === 'weak') { const target = rr * 1.3 + 16; f += (d - target) * 0.025; }
          else if (type === 'avoid') { const need = rr + 0.6 * rr + 80; if (d < need) f -= (need - d) * 0.06; }
          const ma = B.r / (A.r + B.r), mb = A.r / (A.r + B.r);
          dx[i] += ux * f * ma * 2; dy[i] += uy * f * ma * 2;
          dx[j] -= ux * f * mb * 2; dy[j] -= uy * f * mb * 2;
        }
      }
      for (let i = 0; i < n; i++) {
        const p = P[i];
        dx[i] += (cx - p.x) * 0.006; dy[i] += (cy - p.y) * 0.006;
        p.x += dx[i] * step; p.y += dy[i] * step;
        const c = geo.clampPos(p.x, p.y, p.r);
        p.x = c.x; p.y = c.y;
      }
    }
    // dizilimi çizim alanının ortasına al
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    P.forEach((p) => { minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r); minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r); });
    const sx = cx - (minX + maxX) / 2, sy = cy - (minY + maxY) / 2;
    P.forEach((p) => {
      const c = geo.clampPos(p.x + sx, p.y + sy, p.r);
      out[p.id] = { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 };
    });
    return out;
  }

  // Boş bir noktaya yeni balon yerleştir (mevcutlarla çakışmayan en yakın nokta)
  function freeSpot(spaces, area, k) {
    const a = geo.area;
    const r = geo.radius(area, k);
    const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;
    let best = { x: cx, y: cy }, bestScore = -Infinity;
    for (let i = 0; i < 260; i++) {
      const ang = i * 2.399963;
      const rr = 14 * Math.sqrt(i) * 2.2;
      const p = geo.clampPos(cx + Math.cos(ang) * rr * 1.4, cy + Math.sin(ang) * rr, r);
      let minGap = Infinity;
      spaces.forEach((s) => {
        const g = Math.hypot(s.x - p.x, s.y - p.y) - geo.radius(s.area, k) - r;
        if (g < minGap) minGap = g;
      });
      if (minGap >= 6) return p;
      if (minGap > bestScore) { bestScore = minGap; best = p; }
    }
    return best;
  }

  App.layout = { auto: autoLayout, freeSpot: freeSpot };
})();
