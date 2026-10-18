/* ==========================================================================
   38-lib-pe-faces.js — Plan Editörü: çokgen geometri (serbest çizgilerden kapalı alan / "çizilen mekân" bulma)
   pe.faces(segs)       → kapalı bölgeler [{pts, ts, area, free, cx, cy}] (iç taraf solda, pts saat yönünün tersine)
   pe.offsetPoly        → duvar yarı kalınlığı kadar içe öteleme (net alan)
   pe.labelRect         → çokgenin içine sığan en büyük eksen hizalı dikdörtgen (etiket / donatı için)
   pe.triangulate       → kulak kesme ile üçgenleme (3B döşeme için)
   Hepsi metre cinsinden, DOM'dan bağımsız ve saf fonksiyondur.
   ========================================================================== */
(function () {
  const App = window.App;
  const pe = App.pe;

  const area = (p) => { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
  function inPoly(x, y, p) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i], b = p[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function bboxOf(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    p.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 };
  }
  function centroid(p) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n], f = p[i][0] * q[1] - q[0] * p[i][1]; a += f; cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f; }
    if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
    return [cx / (3 * a), cy / (3 * a)];
  }

  /* ---------------- planar bölgeler ----------------
     segs: [{x1,y1,x2,y2,t,free}] — kesişen / T birleşen çizgiler kesilir, ardından yarım-kenar dolaşımıyla bölgeler çıkarılır. */
  function faces(segs, tol) {
    tol = tol || 0.03;
    const nodes = [], grid = {};
    const cell = tol * 2;
    const gk = (i, j) => i + ',' + j;
    function nodeAt(x, y) {
      const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const l = grid[gk(i, j)];
        if (l) for (let k = 0; k < l.length; k++) { const n = nodes[l[k]]; if (Math.abs(n.x - x) <= tol && Math.abs(n.y - y) <= tol) return l[k]; }
      }
      const id = nodes.length;
      nodes.push({ x: x, y: y, out: [] });
      (grid[gk(ci, cj)] = grid[gk(ci, cj)] || []).push(id);
      return id;
    }
    const edges = {};
    const S = segs.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > tol);
    S.forEach((a, i) => {
      const rx = a.x2 - a.x1, ry = a.y2 - a.y1, L = Math.hypot(rx, ry);
      const ts = [0, 1];
      S.forEach((b, j) => {
        if (i === j) return;
        // b'nin uçları a üzerinde mi (T birleşim)
        [[b.x1, b.y1], [b.x2, b.y2]].forEach((e) => {
          const t = ((e[0] - a.x1) * rx + (e[1] - a.y1) * ry) / (L * L);
          if (t <= 0 || t >= 1) return;
          const dx = a.x1 + rx * t - e[0], dy = a.y1 + ry * t - e[1];
          if (Math.hypot(dx, dy) <= tol) ts.push(t);
        });
        // gerçek kesişim
        const sx = b.x2 - b.x1, sy = b.y2 - b.y1, den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) return;
        const qx = b.x1 - a.x1, qy = b.y1 - a.y1;
        const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
        const eT = tol / L, eU = tol / Math.hypot(sx, sy);
        if (t > eT && t < 1 - eT && u > -eU && u < 1 + eU) ts.push(t);
      });
      ts.sort((p, q) => p - q);
      let prev = nodeAt(a.x1, a.y1);
      for (let k = 1; k < ts.length; k++) {
        const t = ts[k];
        const cur = k === ts.length - 1 ? nodeAt(a.x2, a.y2) : nodeAt(a.x1 + rx * t, a.y1 + ry * t);
        if (cur !== prev) {
          const key = prev < cur ? prev + '_' + cur : cur + '_' + prev;
          const e = edges[key];
          if (e) { e.t = Math.max(e.t, a.t || 0.1); e.free = e.free || !!a.free; } else edges[key] = { u: prev < cur ? prev : cur, v: prev < cur ? cur : prev, t: a.t || 0.1, free: !!a.free };
        }
        prev = cur;
      }
    });
    const hes = [];
    Object.keys(edges).forEach((k) => {
      const e = edges[k];
      const A = nodes[e.u], B = nodes[e.v];
      const h1 = { from: e.u, to: e.v, ang: Math.atan2(B.y - A.y, B.x - A.x), e: e, seen: false };
      const h2 = { from: e.v, to: e.u, ang: Math.atan2(A.y - B.y, A.x - B.x), e: e, seen: false };
      h1.twin = h2; h2.twin = h1;
      A.out.push(h1); B.out.push(h2); hes.push(h1, h2);
    });
    nodes.forEach((n) => n.out.sort((p, q) => p.ang - q.ang));
    const out = [];
    hes.forEach((h0) => {
      if (h0.seen) return;
      const loop = [];
      let cur = h0, guard = 0;
      while (!cur.seen && guard++ < 5000) {
        cur.seen = true; loop.push(cur);
        const v = nodes[cur.to], idx = v.out.indexOf(cur.twin), nxt = v.out[(idx - 1 + v.out.length) % v.out.length];
        cur = nxt;
      }
      if (cur !== h0 || loop.length < 3) return;
      // sivri uçları (aynı kenardan gidip dönen) ayıkla
      let ids = loop.map((h) => h.from), ets = loop.map((h) => h.e);
      let changed = true;
      while (changed && ids.length >= 3) {
        changed = false;
        for (let i = 0; i < ids.length; i++) {
          const n = ids.length, a = ids[(i - 1 + n) % n], c = ids[(i + 1) % n];
          if (a === c) { ids.splice(i, 1); ets.splice(i, 1); const j = i % ids.length; ids.splice(j, 1); ets.splice(j, 1); changed = true; break; }
        }
      }
      if (ids.length < 3) return;
      let pts = ids.map((i) => [nodes[i].x, nodes[i].y]);
      let ts = ets.map((e) => e.t), fr = ets.map((e) => e.free);
      // doğrusal köşeleri sadeleştir
      for (let i = 0; i < pts.length && pts.length > 3;) {
        const n = pts.length, a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
        const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
        const cr = ux * vy - uy * vx, ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
        if (Math.abs(cr) / (ul * vl || 1) < 0.002 && ux * vx + uy * vy > 0) {
          const pi = (i - 1 + n) % n;
          ts[pi] = Math.max(ts[pi], ts[i]); fr[pi] = fr[pi] || fr[i];
          pts.splice(i, 1); ts.splice(i, 1); fr.splice(i, 1);
        } else i++;
      }
      const ar = area(pts);
      if (ar <= 0.05 || pts.length < 3) return;
      const c = centroid(pts);
      out.push({ pts: pts, ts: ts, area: ar, free: fr.some(Boolean), cx: c[0], cy: c[1] });
    });
    return out;
  }

  /* ---------------- içe öteleme (kenar başına kalınlık / 2) ---------------- */
  function offsetPoly(pts, ts) {
    const n = pts.length;
    if (n < 3) return pts;
    const L = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const d = (ts[i] || 0.1) / 2;
      L.push({ x: a[0] - (dy / l) * d, y: a[1] + (dx / l) * d, dx: dx / l, dy: dy / l });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const A = L[(i - 1 + n) % n], B = L[i];
      const den = A.dx * B.dy - A.dy * B.dx;
      if (Math.abs(den) < 1e-6) { out.push([B.x, B.y]); continue; }
      const s = ((B.x - A.x) * B.dy - (B.y - A.y) * B.dx) / den;
      let x = A.x + A.dx * s, y = A.y + A.dy * s;
      const md = Math.hypot(x - pts[i][0], y - pts[i][1]);
      if (md > 1.5) { const f = 1.5 / md; x = pts[i][0] + (x - pts[i][0]) * f; y = pts[i][1] + (y - pts[i][1]) * f; }
      out.push([x, y]);
    }
    const a0 = area(pts), a1 = area(out);
    return a1 > 0.02 && a1 <= a0 + 1e-6 ? out : pts;
  }

  /* ---------------- içe sığan en büyük eksen hizalı dikdörtgen ---------------- */
  function labelRect(poly) {
    const b = bboxOf(poly);
    const s = Math.max(0.06, Math.max(b.w, b.d) / 70);
    const nx = Math.max(1, Math.ceil(b.w / s)), ny = Math.max(1, Math.ceil(b.d / s));
    const hgt = new Array(nx).fill(0);
    let best = { a: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) hgt[i] = inPoly(b.x + (i + 0.5) * s, b.y + (j + 0.5) * s, poly) ? hgt[i] + 1 : 0;
      const st = [];
      for (let i = 0; i <= nx; i++) {
        const cur = i === nx ? 0 : hgt[i];
        let start = i;
        while (st.length && st[st.length - 1].h >= cur) {
          const t = st.pop(), a = t.h * (i - t.i);
          if (a > best.a) best = { a: a, x0: t.i, x1: i, y0: j - t.h + 1, y1: j + 1 };
          start = t.i;
        }
        st.push({ i: start, h: cur });
      }
    }
    if (!best.a) return { x: b.x + b.w * 0.35, y: b.y + b.d * 0.35, w: Math.max(0.2, b.w * 0.3), d: Math.max(0.2, b.d * 0.3) };
    return { x: b.x + best.x0 * s, y: b.y + best.y0 * s, w: (best.x1 - best.x0) * s, d: (best.y1 - best.y0) * s };
  }

  /* ---------------- üçgenleme (kulak kesme; pts saat yönünün tersine) ---------------- */
  function triangulate(pts) {
    const n = pts.length;
    if (n < 3) return [];
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    if (area(pts) < 0) idx.reverse();
    const tris = [];
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inTri = (p, a, b, c) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
    let guard = 0;
    while (idx.length > 3 && guard++ < 4000) {
      let cut = false;
      for (let k = 0; k < idx.length; k++) {
        const ia = idx[(k - 1 + idx.length) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
        const a = pts[ia], b = pts[ib], c = pts[ic];
        if (cross(a, b, c) <= 1e-9) continue;
        let ok = true;
        for (let m = 0; m < idx.length; m++) { const q = idx[m]; if (q === ia || q === ib || q === ic) continue; if (inTri(pts[q], a, b, c)) { ok = false; break; } }
        if (!ok) continue;
        tris.push([ia, ib, ic]); idx.splice(k, 1); cut = true; break;
      }
      if (!cut) { tris.push([idx[0], idx[1], idx[2]]); idx.splice(1, 1); }
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }

  Object.assign(pe, { faces: faces, offsetPoly: offsetPoly, labelRect: labelRect, triangulate: triangulate, polyArea: area, inPoly: inPoly, polyBox: bboxOf, polyCentroid: centroid });
})();
