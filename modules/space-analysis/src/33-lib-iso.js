/* ==========================================================================
   33-lib-iso.js — izometrik / aksonometrik izdüşüm motoru (Modül 3)
   Plan koordinatı (u, v, z) metre → ekran (X, Y) piksel.
   Dönüş (yaw) planı z ekseni etrafında çevirir, eğim (pitch) bakış yüksekliğidir.
   Metin düzleme oturur: izdüşüm matrisi ile eğik çizilir, her dönüşte okunur kalır.
   Çıktı primitif listesidir (poly, line, path, text); SVG ve Canvas aynı listeden çizer.
   ========================================================================== */
(function () {
  const App = window.App;
  const iso = (App.iso = {});

  /* ---------- renk ---------- */
  function hex2rgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // f < 1 koyulaştırır, f > 1 açar
  iso.shade = function (color, f) {
    const c = hex2rgb(color);
    if (!c) return color;
    const t = f < 1 ? 0 : 255, a = f < 1 ? 1 - f : f - 1;
    const o = c.map((v) => Math.round(v + (t - v) * Math.min(1, a)));
    return 'rgb(' + o.join(',') + ')';
  };

  /* ---------- izdüşüm ---------- */
  // opts: yaw, pitch (derece), s (px / m), cx, cy (ekranda plak merkezinin zemin noktası), center: [u, v] plan merkezi
  iso.make = function (o) {
    const th = (o.yaw * Math.PI) / 180, ph = (o.pitch * Math.PI) / 180;
    const c = Math.cos(th), sn = Math.sin(th), sp = Math.sin(ph), cp = Math.cos(ph);
    const cu = o.center ? o.center[0] : 0, cv = o.center ? o.center[1] : 0;
    const I = { s: o.s, c: c, sn: sn, sp: sp, cp: cp, eye: [sn, c] };
    I.proj = (u, v, z) => {
      const du = u - cu, dv = v - cv;
      const ur = du * c - dv * sn, vr = du * sn + dv * c;
      return [o.cx + o.s * ur, o.cy + o.s * (vr * sp - (z || 0) * cp)];
    };
    I.dir = (du, dv) => [du * c - dv * sn, (du * sn + dv * c) * sp]; // birim vektörün (ölçeksiz) izdüşümü
    I.depth = (u, v) => (u - cu) * sn + (v - cv) * c;
    return I;
  };

  /* ---------- katı (prizma): yalnızca görünen yüzler ---------- */
  const EDGES = [
    { a: 0, b: 1, n: [0, -1] }, { a: 1, b: 2, n: [1, 0] }, { a: 2, b: 3, n: [0, 1] }, { a: 3, b: 0, n: [-1, 0] },
  ];
  // o: stroke, sw, opacity, topFill
  iso.prism = function (I, x, y, w, h, z0, z1, fill, o) {
    o = o || {};
    const P = [];
    const cs = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const stroke = o.stroke || 'rgba(23,24,27,.28)';
    const sw = o.sw || 1;
    const op = o.opacity;
    if (z1 > z0 + 1e-6) {
      EDGES.forEach((e) => {
        if (e.n[0] * I.eye[0] + e.n[1] * I.eye[1] <= 1e-6) return;
        const nxs = e.n[0] * I.c - e.n[1] * I.sn;
        const f = Math.abs(nxs) < 0.02 ? 0.84 : nxs > 0 ? 0.72 : 0.9;
        const a = cs[e.a], b = cs[e.b];
        P.push({ t: 'poly', pts: [I.proj(a[0], a[1], z1), I.proj(b[0], b[1], z1), I.proj(b[0], b[1], z0), I.proj(a[0], a[1], z0)], fill: iso.shade(fill, f), stroke: stroke, sw: sw, opacity: op });
      });
    }
    P.push({ t: 'poly', pts: cs.map((q) => I.proj(q[0], q[1], z1)), fill: o.topFill || fill, stroke: stroke, sw: sw, opacity: op });
    return P;
  };


  /* ---------- çokgen katı (herhangi bir halka): görünen yan yüzler + çatı ---------- */
  // ring: plan koordinatında (u, v) halka · dönüş: { walls: [{ pts, f }], roof } — f: yüz parlaklık çarpanı
  iso.extrudeFaces = function (I, ring, z0, z1) {
    const n = ring.length;
    let a = 0;
    for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    const sgn = a >= 0 ? 1 : -1;
    const walls = [];
    if (z1 > z0 + 1e-6) {
      for (let i = 0; i < n; i++) {
        const p = ring[i], q = ring[(i + 1) % n];
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const l = Math.hypot(dx, dy);
        if (l < 1e-6) continue;
        const nx = (sgn * dy) / l, ny = (-sgn * dx) / l;
        if (nx * I.eye[0] + ny * I.eye[1] <= 1e-6) continue;
        const nxs = nx * I.c - ny * I.sn;
        const f = Math.abs(nxs) < 0.02 ? 0.84 : nxs > 0 ? 0.72 : 0.9;
        walls.push({ pts: [I.proj(p[0], p[1], z1), I.proj(q[0], q[1], z1), I.proj(q[0], q[1], z0), I.proj(p[0], p[1], z0)], f: f });
      }
    }
    return { walls: walls, roof: ring.map((q) => I.proj(q[0], q[1], z1)) };
  };
  iso.extrude = function (I, ring, z0, z1, fill, o) {
    o = o || {};
    const F = iso.extrudeFaces(I, ring, z0, z1);
    const stroke = o.stroke || 'rgba(23,24,27,.28)', sw = o.sw || 1;
    const P = F.walls.map((w) => ({ t: 'poly', pts: w.pts, fill: iso.shade(fill, w.f), stroke: stroke, sw: sw, opacity: o.opacity }));
    P.push({ t: 'poly', pts: F.roof, fill: o.topFill || fill, stroke: stroke, sw: sw, opacity: o.opacity });
    return P;
  };

  /* ---------- düzlemde çizgi, tarama, ızgara ---------- */
  iso.seg = function (I, u0, v0, u1, v1, z, st) {
    const a = I.proj(u0, v0, z), b = I.proj(u1, v1, z);
    return Object.assign({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, st);
  };

  iso.grid = function (I, W, D, z, step, st) {
    const P = [];
    for (let u = step; u < W - 1e-6; u += step) P.push(iso.seg(I, u, 0, u, D, z, st));
    for (let v = step; v < D - 1e-6; v += step) P.push(iso.seg(I, 0, v, W, v, z, st));
    return P;
  };

  // 45° tarama (dikdörtgene kırpılmış)
  iso.hatch = function (I, x, y, w, h, z, gap, st) {
    const P = [];
    for (let k = gap; k < w + h; k += gap) {
      // doğru: u - x + v - y = k  (u + v = const)
      const u0 = Math.max(x, x + k - h), u1 = Math.min(x + w, x + k);
      if (u1 <= u0) continue;
      P.push(iso.seg(I, u0, y + k - (u0 - x), u1, y + k - (u1 - x), z, st));
    }
    return P;
  };

  /* ---------- düzleme oturan yazı ---------- */
  // (u, v): satır bloğunun merkezi · fsM: yazı boyu (metre) · lines: satırlar · o.dir 'u' | 'v'
  iso.planText = function (I, u, v, z, lines, fsM, o) {
    o = o || {};
    let b = o.dir === 'v' ? [0, -1] : [1, 0];
    let dn = [-b[1], b[0]];
    let bx = I.dir(b[0], b[1]);
    if (bx[0] < 0) { b = [-b[0], -b[1]]; dn = [-dn[0], -dn[1]]; bx = I.dir(b[0], b[1]); }
    const dx = I.dir(dn[0], dn[1]);
    const k = (fsM * I.s) / 20;
    const xf = [bx[0] * k, bx[1] * k, dx[0] * k, dx[1] * k];
    const lh = fsM * (o.lh || 1.18);
    const P = [];
    lines.forEach((ln, i) => {
      const off = (i - (lines.length - 1) / 2) * lh + fsM * 0.34 + (o.shift || 0);
      const q = I.proj(u + dn[0] * off, v + dn[1] * off, z);
      const s = typeof ln === 'string' ? { s: ln } : ln;
      P.push(Object.assign({ t: 'text', x: q[0], y: q[1], size: 20, weight: o.weight || 700, fam: o.fam || 'l', fill: o.fill, anchor: o.anchor || 'middle', xf: xf, opacity: o.opacity, ls: o.ls, pe: false }, s));
    });
    return P;
  };

  /* ---------- ok: düzlemde ikinci derece eğri + ok başı ---------- */
  // p0, p1 (kontrol), p2: plan noktaları [u, v]; afin dönüşüm Bezier'i koruduğu için kontrol noktaları doğrudan izdüşürülür
  iso.arrow = function (I, p0, p1, p2, z, st) {
    const a = I.proj(p0[0], p0[1], z), c = I.proj(p1[0], p1[1], z), b = I.proj(p2[0], p2[1], z);
    const P = [];
    const tx = b[0] - c[0], ty = b[1] - c[1];
    const len = Math.hypot(tx, ty) || 1;
    const ux = tx / len, uy = ty / len;
    const hl = st.head || 11, hw = hl * 0.62;
    const bx = b[0] - ux * hl * 0.4, by = b[1] - uy * hl * 0.4;
    P.push({ t: 'path', d: 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' Q' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1), stroke: st.stroke, sw: st.sw, cap: 'round', dash: st.dash, opacity: st.opacity });
    P.push({ t: 'poly', pts: [[b[0], b[1]], [b[0] - ux * hl - uy * hw, b[1] - uy * hl + ux * hw], [b[0] - ux * hl + uy * hw, b[1] - uy * hl - ux * hw]], fill: st.stroke, opacity: st.opacity });
    return P;
  };

  // ekran noktaları arasında oklu eğri (kat arası bağlar için)
  iso.arrowScreen = function (a, c, b, st) {
    const P = [];
    const tx = b[0] - c[0], ty = b[1] - c[1];
    const len = Math.hypot(tx, ty) || 1;
    const ux = tx / len, uy = ty / len;
    const hl = st.head || 10, hw = hl * 0.6;
    const bx = b[0] - ux * hl * 0.4, by = b[1] - uy * hl * 0.4;
    P.push({ t: 'path', d: 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' Q' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1), stroke: st.stroke, sw: st.sw, cap: 'round', dash: st.dash, opacity: st.opacity });
    P.push({ t: 'poly', pts: [[b[0], b[1]], [b[0] - ux * hl - uy * hw, b[1] - uy * hl + ux * hw], [b[0] - ux * hl + uy * hw, b[1] - uy * hl - ux * hw]], fill: st.stroke, opacity: st.opacity });
    return P;
  };

  iso.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
})();
