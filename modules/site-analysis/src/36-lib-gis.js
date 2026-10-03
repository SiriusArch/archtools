/* ==========================================================================
   36-lib-gis.js — coğrafi geometri çekirdeği (Modül 4–6 ortak)
   Saf fonksiyonlar, arayüzden bağımsız. Yerel koordinat: x = doğu, y = kuzey (metre),
   başlangıç = çalışma noktası. Projeksiyon küçük alanlar için eşdikdörtgen (≤ 3 km'de hata < %0,1).
   İçerik: projeksiyon · çokgen işlemleri (alan, kırpma, içeri öteleme, sadeleştirme) ·
           yol grafı + en kısa yol (izokron) · güneş konumu ve gölge.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = (App.gis = {});
  const D2R = Math.PI / 180;

  /* ---------------- projeksiyon ---------------- */
  gis.makeProj = function (lat0, lon0) {
    const mLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * D2R) + 1.175 * Math.cos(4 * lat0 * D2R);
    const mLon = 111412.84 * Math.cos(lat0 * D2R) - 93.5 * Math.cos(3 * lat0 * D2R);
    return {
      lat0: lat0, lon0: lon0, mLat: mLat, mLon: mLon,
      fwd: (lat, lon) => [(lon - lon0) * mLon, (lat - lat0) * mLat],
      inv: (x, y) => [lat0 + y / mLat, lon0 + x / mLon],
    };
  };

  gis.haversine = function (lat1, lon1, lat2, lon2) {
    const dφ = (lat2 - lat1) * D2R, dλ = (lon2 - lon1) * D2R;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dλ / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  /* ---------------- temel vektör / çokgen ---------------- */
  gis.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // işaretli alan: saat yönünün tersi (CCW) pozitif
  gis.area = function (p) {
    let s = 0;
    for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
    return s / 2;
  };
  gis.ccw = (p) => (gis.area(p) >= 0 ? p : p.slice().reverse());

  gis.centroid = function (p) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const u = p[i], v = p[(i + 1) % n], c = u[0] * v[1] - v[0] * u[1];
      a += c; cx += (u[0] + v[0]) * c; cy += (u[1] + v[1]) * c;
    }
    if (Math.abs(a) < 1e-9) { // dejenere: ortalama
      let sx = 0, sy = 0;
      p.forEach((q) => { sx += q[0]; sy += q[1]; });
      return [sx / p.length, sy / p.length];
    }
    return [cx / (3 * a), cy / (3 * a)];
  };

  gis.bbox = function (p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i++) { const q = p[i]; if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  };

  gis.pointInPoly = function (pt, p) {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i], b = p[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };

  // nokta → doğru parçası: en yakın nokta { x, y, t, d }
  gis.nearestOnSeg = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = ax + dx * t, y = ay + dy * t;
    return { x: x, y: y, t: t, d: Math.hypot(px - x, py - y) };
  };

  gis.distToPoly = function (pt, p, closed) {
    let best = Infinity;
    const n = p.length;
    for (let i = 0; i < (closed === false ? n - 1 : n); i++) {
      const a = p[i], b = p[(i + 1) % n];
      const q = gis.nearestOnSeg(pt[0], pt[1], a[0], a[1], b[0], b[1]);
      if (q.d < best) best = q.d;
    }
    return best;
  };

  // iki doğru (nokta + yön) kesişimi; paralelse null
  function lineX(p, d, q, e) {
    const cr = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(cr) < 1e-9) return null;
    const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / cr;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }

  gis.polyPath = function (p, close) {
    let s = '';
    for (let i = 0; i < p.length; i++) s += (i ? 'L' : 'M') + p[i][0].toFixed(1) + ' ' + p[i][1].toFixed(1);
    return s + (close === false ? '' : 'Z');
  };

  /* Douglas–Peucker (yinelemesiz) */
  gis.simplify = function (pts, tol) {
    const n = pts.length;
    if (n <= 2 || !(tol > 0)) return pts;
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const se = stack.pop(), s = se[0], e = se[1];
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const d = gis.nearestOnSeg(pts[i][0], pts[i][1], pts[s][0], pts[s][1], pts[e][0], pts[e][1]).d;
        if (d > md) { md = d; mi = i; }
      }
      if (mi >= 0 && md > tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out;
  };

  /* ---------------- daire kırpma (çalışma yarıçapı) ---------------- */
  gis.circlePoly = function (r, n) {
    n = n || 72;
    const p = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return p;
  };

  // Sutherland–Hodgman: kırpma çokgeni dışbükey ve CCW olmalı
  gis.clipPoly = function (subject, clip) {
    let out = subject;
    for (let i = 0; i < clip.length && out.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length];
      const inp = out;
      out = [];
      const side = (q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      for (let j = 0; j < inp.length; j++) {
        const cur = inp[j], prev = inp[(j + inp.length - 1) % inp.length];
        const sc = side(cur), sp = side(prev);
        if (sc >= 0) {
          if (sp < 0) { const x = lineX(prev, [cur[0] - prev[0], cur[1] - prev[1]], a, [b[0] - a[0], b[1] - a[1]]); if (x) out.push(x); }
          out.push(cur);
        } else if (sp >= 0) { const x = lineX(prev, [cur[0] - prev[0], cur[1] - prev[1]], a, [b[0] - a[0], b[1] - a[1]]); if (x) out.push(x); }
      }
    }
    return out;
  };

  // çoklu çizgiyi daireye kırp → parça listesi
  gis.clipLineToCircle = function (pts, r) {
    const out = [];
    let cur = null;
    const r2 = r * r;
    for (let i = 0; i < pts.length; i++) {
      const b = pts[i];
      const bin = b[0] * b[0] + b[1] * b[1] <= r2;
      if (i === 0) { if (bin) cur = [b]; continue; }
      const a = pts[i - 1];
      const ain = a[0] * a[0] + a[1] * a[1] <= r2;
      if (ain && bin) { cur.push(b); continue; }
      // kesişim(ler)
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const A = dx * dx + dy * dy, B = 2 * (a[0] * dx + a[1] * dy), C = a[0] * a[0] + a[1] * a[1] - r2;
      const disc = B * B - 4 * A * C;
      const ts = [];
      if (A > 1e-12 && disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A);
        if (t1 > 0 && t1 < 1) ts.push(t1);
        if (t2 > 0 && t2 < 1) ts.push(t2);
      }
      const at = (t) => [a[0] + dx * t, a[1] + dy * t];
      if (ain && !bin) { if (ts.length) { cur.push(at(ts[0])); } out.push(cur); cur = null; }
      else if (!ain && bin) { cur = ts.length ? [at(ts[ts.length - 1]), b] : [b]; }
      else if (ts.length === 2) { out.push([at(ts[0]), at(ts[1])]); }
    }
    if (cur && cur.length > 1) out.push(cur);
    return out.filter((s) => s.length > 1);
  };

  /* ---------------- içeri öteleme (çekme mesafeleri) ----------------
     p: açık halka (ilk nokta tekrarlanmaz) · dists: tek sayı ya da kenar başına dizi (kenar i: p[i] → p[i+1])
     Dönüş: yeni halka (CCW) ya da null (mesafe parseli tüketiyorsa) */
  gis.offsetPoly = function (p, dists) {
    const n = p.length;
    if (n < 3) return null;
    const P = gis.area(p) >= 0 ? p : p.slice().reverse();
    const rev = P !== p;
    // ters çevrildiğinde kenar eşlemesi: ters halkada j. kenar = özgün (n-2-j). kenar
    const dArr = [];
    for (let i = 0; i < n; i++) {
      if (!Array.isArray(dists)) dArr.push(dists);
      else dArr.push(rev ? dists[(n - 2 - i + n * 2) % n] : dists[i]);
    }
    const lines = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l; // sol normal = iç yön (CCW)
      lines.push({ p: [a[0] + nx * dArr[i], a[1] + ny * dArr[i]], d: [dx / l, dy / l], n: [nx, ny], dist: dArr[i], a: a });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const L0 = lines[(i + n - 1) % n], L1 = lines[i];
      let v = lineX(L0.p, L0.d, L1.p, L1.d);
      const lim = 6 * Math.max(Math.abs(L0.dist), Math.abs(L1.dist), 1);
      if (!v || Math.hypot(v[0] - P[i][0], v[1] - P[i][1]) > lim) v = [P[i][0] + L1.n[0] * L1.dist, P[i][1] + L1.n[1] * L1.dist];
      out.push(v);
    }
    // geçerlilik: alan pozitif ve kenar yönleri korunmuş
    const a0 = gis.area(P), a1 = gis.area(out);
    if (!(a1 > 0.25) || a1 > a0 * (dArr.some((d) => d < 0) ? 1e9 : 1.0001)) return null;
    for (let i = 0; i < n; i++) {
      const o0 = out[i], o1 = out[(i + 1) % n];
      const dx = o1[0] - o0[0], dy = o1[1] - o0[1];
      if (dx * lines[i].d[0] + dy * lines[i].d[1] <= 0) return null;
    }
    return out;
  };

  /* ---------------- dışbükey zarf ---------------- */
  gis.hull = function (pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    p.forEach((q) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    const up = [];
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  };

  /* ---------------- yol grafı + en kısa yol ---------------- */
  /* roads: [{ pts: [[x,y]...], cls, nf }] → graf { nodes: [[x,y]], adj: [[to, len, edge]], edges: [{ a, b, len, cls }], grid } */
  gis.buildGraph = function (roads, canWalk) {
    const idx = new Map();
    const nodes = [], adj = [], edges = [];
    const node = (q) => {
      const k = Math.round(q[0] * 10) + '|' + Math.round(q[1] * 10);
      let i = idx.get(k);
      if (i === undefined) { i = nodes.length; idx.set(k, i); nodes.push([q[0], q[1]]); adj.push([]); }
      return i;
    };
    roads.forEach((r) => {
      if (canWalk && !canWalk(r)) return;
      for (let i = 1; i < r.pts.length; i++) {
        const a = node(r.pts[i - 1]), b = node(r.pts[i]);
        if (a === b) continue;
        const len = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
        const e = edges.length;
        edges.push({ a: a, b: b, len: len, cls: r.cls });
        adj[a].push([b, len, e]);
        adj[b].push([a, len, e]);
      }
    });
    // ızgara dizini (60 m hücre): en yakın kenar sorguları için
    const cell = 60, grid = new Map();
    edges.forEach((e, ei) => {
      const A = nodes[e.a], B = nodes[e.b];
      const x0 = Math.floor(Math.min(A[0], B[0]) / cell), x1 = Math.floor(Math.max(A[0], B[0]) / cell);
      const y0 = Math.floor(Math.min(A[1], B[1]) / cell), y1 = Math.floor(Math.max(A[1], B[1]) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = gx + ',' + gy;
        const l = grid.get(k);
        if (l) l.push(ei); else grid.set(k, [ei]);
      }
    });
    return { nodes: nodes, adj: adj, edges: edges, grid: grid, cell: cell };
  };

  // (x, y) noktasına en yakın kenar: { e, t, d, x, y } ya da null
  gis.snap = function (g, x, y, maxD) {
    const cell = g.cell;
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let best = null;
    const rings = Math.ceil((maxD || 400) / cell);
    for (let r = 0; r <= rings; r++) {
      for (let ix = gx - r; ix <= gx + r; ix++) for (let iy = gy - r; iy <= gy + r; iy++) {
        if (Math.max(Math.abs(ix - gx), Math.abs(iy - gy)) !== r) continue;
        const l = g.grid.get(ix + ',' + iy);
        if (!l) continue;
        for (let k = 0; k < l.length; k++) {
          const e = g.edges[l[k]], A = g.nodes[e.a], B = g.nodes[e.b];
          const q = gis.nearestOnSeg(x, y, A[0], A[1], B[0], B[1]);
          if (!best || q.d < best.d) best = { e: l[k], t: q.t, d: q.d, x: q.x, y: q.y };
        }
      }
      if (best && best.d <= r * cell) break; // daha dış halka daha yakın olamaz
    }
    return best && best.d <= (maxD || 400) ? best : null;
  };

  /* Dijkstra: kaynak = kenar üzerindeki bir nokta (sanal başlangıç); dönüş: Float64Array mesafe (m, düğüm başına) */
  gis.shortest = function (g, src, maxLen) {
    const n = g.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const heap = []; // [mesafe, düğüm]
    const push = (d, v) => {
      heap.push([d, v]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top;
    };
    dist.src = src; // aynı kenardaki hedefler için doğrudan yol (gis.reach)
    const e = g.edges[src.e];
    const da = src.d + src.t * e.len, db = src.d + (1 - src.t) * e.len;
    if (da <= maxLen) { dist[e.a] = da; push(da, e.a); }
    if (db <= maxLen && db < dist[e.b]) { dist[e.b] = db; push(db, e.b); }
    while (heap.length) {
      const top = pop(), d = top[0], v = top[1];
      if (d > dist[v]) continue;
      const nb = g.adj[v];
      for (let i = 0; i < nb.length; i++) {
        const nd = d + nb[i][1];
        if (nd <= maxLen && nd < dist[nb[i][0]]) { dist[nb[i][0]] = nd; push(nd, nb[i][0]); }
      }
    }
    return dist;
  };

  // bir (x, y) noktasının, mesafe dizisine göre yürüme mesafesi (m); ulaşılamazsa Infinity
  gis.reach = function (g, dist, x, y, maxSnap) {
    const s = gis.snap(g, x, y, maxSnap || 150);
    if (!s) return Infinity;
    const e = g.edges[s.e];
    let w = Math.min(dist[e.a] + s.t * e.len, dist[e.b] + (1 - s.t) * e.len) + s.d;
    if (dist.src && dist.src.e === s.e) w = Math.min(w, Math.abs(s.t - dist.src.t) * e.len + dist.src.d + s.d);
    return w;
  };

  /* izokron bandı: D (m) içinde kalan kenar parçaları → [[x1,y1,x2,y2]] */
  gis.bandSegments = function (g, dist, D) {
    const out = [];
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i], da = dist[e.a], db = dist[e.b];
      const A = g.nodes[e.a], B = g.nodes[e.b];
      const ra = da <= D, rb = db <= D;
      if (ra && rb) out.push([A[0], A[1], B[0], B[1]]);
      else if (ra) { const t = Math.min(1, (D - da) / e.len); if (t > 0) out.push([A[0], A[1], A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      else if (rb) { const t = Math.min(1, (D - db) / e.len); if (t > 0) out.push([B[0], B[1], B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t]); }
    }
    return out;
  };

  /* segmentlerin etrafında w (m) yarıçaplı tampon kapsama alanı (m²) — ızgara örnekleme */
  gis.bufferArea = function (segs, w, R) {
    if (!segs.length) return 0;
    const cs = Math.max(8, w * 0.5);
    const grid = new Map();
    const key = (ix, iy) => ix + ',' + iy;
    segs.forEach((s, i) => {
      const x0 = Math.floor((Math.min(s[0], s[2]) - w) / cs), x1 = Math.floor((Math.max(s[0], s[2]) + w) / cs);
      const y0 = Math.floor((Math.min(s[1], s[3]) - w) / cs), y1 = Math.floor((Math.max(s[1], s[3]) + w) / cs);
      for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) { const k = key(ix, iy); const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
    });
    let cnt = 0;
    grid.forEach((list, k) => {
      const q = k.split(',');
      const cx = (Number(q[0]) + 0.5) * cs, cy = (Number(q[1]) + 0.5) * cs;
      if (cx * cx + cy * cy > R * R) return;
      for (let i = 0; i < list.length; i++) {
        const s = segs[list[i]];
        if (gis.nearestOnSeg(cx, cy, s[0], s[1], s[2], s[3]).d <= w) { cnt++; return; }
      }
    });
    return cnt * cs * cs;
  };

  /* ---------------- güneş ----------------
     Güneş saati (12 = güneş öğlesi) ve yılın günü ile; saat dilimi / yaz saati gerekmez. */
  gis.sunPos = function (latDeg, doy, solarHour) {
    const φ = latDeg * D2R;
    const δ = 23.45 * D2R * Math.sin(((360 / 365) * (284 + doy)) * D2R);
    const H = 15 * (solarHour - 12) * D2R;
    const sa = Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sa)));
    let ca = (Math.sin(δ) - Math.sin(alt) * Math.sin(φ)) / (Math.cos(alt) * Math.cos(φ) || 1e-9);
    ca = Math.max(-1, Math.min(1, ca));
    let az = Math.acos(ca);
    if (H > 0) az = 2 * Math.PI - az;
    return { alt: alt / D2R, az: az / D2R };
  };
  gis.dayLength = function (latDeg, doy) {
    const φ = latDeg * D2R;
    const δ = 23.45 * D2R * Math.sin(((360 / 365) * (284 + doy)) * D2R);
    const x = -Math.tan(φ) * Math.tan(δ);
    if (x >= 1) return 0;
    if (x <= -1) return 24;
    return (2 * Math.acos(x)) / D2R / 15;
  };
  // temsilci günler: 21 Mart, 21 Haziran, 22 Eylül, 21 Aralık
  gis.SUN_DAYS = [
    { id: 'kis', label: '21 Aralık', doy: 355 },
    { id: 'ekinoks', label: '21 Mart / 22 Eylül', doy: 80 },
    { id: 'yaz', label: '21 Haziran', doy: 172 },
  ];

  /* bina gölgeleri: her bina için taban + her kenarın süpürdüğü dörtgen → tek path altında birleşir.
     buildings: [{ pts, hgt }] · dönüş: [[x,y]...] çokgen listesi */
  gis.shadows = function (buildings, alt, az) {
    if (alt <= 1.5) return [];
    const t = Math.tan(alt * D2R);
    const ux = -Math.sin(az * D2R), uy = -Math.cos(az * D2R);
    const polys = [];
    buildings.forEach((b) => {
      const L = Math.min(b.hgt / t, 160);
      const dx = ux * L, dy = uy * L;
      const p = b.pts;
      polys.push(p);
      for (let i = 0, n = p.length; i < n; i++) {
        const a = p[i], c = p[(i + 1) % n];
        polys.push([a, c, [c[0] + dx, c[1] + dy], [a[0] + dx, a[1] + dy]]);
      }
    });
    return polys;
  };

  /* ---------------- küçük yardımcılar ---------------- */
  gis.walkMin = (m) => m / 80; // 4,8 km/sa ≈ 80 m/dk
  gis.compass = function (deg) {
    const n = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
    return n[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  };
  // sembolik ölçek çubuğu uzunluğu (m): 1-2-5 dizisi
  gis.niceLen = function (m) {
    const e = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / e;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * e;
  };
})();
