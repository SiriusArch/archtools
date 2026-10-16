/* ==========================================================================
   39-lib-pe-scene.js — Plan Editörü: 2B plan paftası (primitif listesi)
   Katmanlar (alttan üste): levha · ızgara · alt kat izi · oda zemini (+ kaplama deseni) · duvarlar (kesit dolgusu) · açıklıklar (kapı yayı, pencere)
   · nesne sembolleri · merdiven · korkuluk · etiketler · mekân adı ve ölçüleri · ölçü çizgileri · ölçek çubuğu ve kuzey oku.
   Çizim kuralı (Türk mimari çizim alışkanlığı): kesilen duvar dolu poşe, kapı kanadı ve yayı ince, pencere üç çizgi, ölçüler metre.
   Canlı SVG ve PNG / PDF / Pafta Şablonu aynı primitif listesinden çizilir (App.board.primToV / primsToCanvas).
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const sheet = App.sheet;
  const pe = App.pe;
  const C = pe;
  const fmt = U.fmt;

  const glass = () => App.theme.name === 'glass';
  const AREA = () => ({ x: 64, y: 54, w: sheet.W - 128, h: sheet.tb.y - 54 - 22 });

  function colors() {
    const PAL = App.PAL, g = glass();
    return g
      ? { g: true, ink: PAL.ink, paper: '#FAFAFB', panel: '#F1F2F5', panelStroke: 'rgba(23,24,27,.16)', wall: PAL.ink, floor: '#FFFFFF', floorEdge: 'rgba(23,24,27,.10)', grid: 'rgba(23,24,27,.07)', grid5: 'rgba(23,24,27,.14)', fFill: '#FFFFFF', fSoft: 'rgba(23,24,27,.09)', bad: '#B3261E', warn: '#B3261E', sel: '#2F6BFF', dim: 'rgba(23,24,27,.55)', ghost: 'rgba(23,24,27,.13)', glassLn: 'rgba(23,24,27,.8)', zones: false }
      : { g: false, ink: PAL.ink, paper: '#FBF3DC', panel: PAL.paperDark, panelStroke: PAL.ink, wall: PAL.ink, floor: '#FBF3DC', floorEdge: 'rgba(38,29,17,.18)', grid: 'rgba(38,29,17,.10)', grid5: 'rgba(38,29,17,.22)', fFill: PAL.paper, fSoft: 'rgba(38,29,17,.14)', bad: PAL.red, warn: PAL.red, sel: PAL.blue, dim: 'rgba(38,29,17,.6)', ghost: 'rgba(38,29,17,.16)', glassLn: PAL.ink, zones: true };
  }

  /* ---------------- görünüm penceresi ---------------- */
  function planView(D, frozen, cam) {
    const area = AREA();
    let win = frozen;
    if (!win) {
      const b = D.bounds;
      const pad = Math.max(2.5, 0.12 * Math.max(b.w, b.h));
      let w = Math.max(b.w + 2 * pad, 18), h = Math.max(b.h + 2 * pad, 12);
      let cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
      const ar = area.w / area.h;
      if (w / h < ar) w = h * ar; else h = w / ar;
      if (cam) { const k = U.clamp(cam.k || 1, 0.2, 14); w /= k; h /= k; cx += cam.dx || 0; cy += cam.dy || 0; }
      win = { x0: cx - w / 2, y0: cy - h / 2, w: w, h: h };
    }
    const s = Math.min(area.w / win.w, area.h / win.h);
    const ox = area.x + (area.w - win.w * s) / 2, oy = area.y + (area.h - win.h * s) / 2;
    return { area: area, win: win, s: s, ox: ox, oy: oy, X: (wx) => ox + (wx - win.x0) * s, Y: (wy) => oy + (wy - win.y0) * s, wx: (px) => win.x0 + (px - ox) / s, wy: (py) => win.y0 + (py - oy) / s };
  }

  /* ---------------- nesne sembolleri (yerel koordinat 0..w, 0..d; arka = üst kenar) ---------------- */
  function symOf(k, w, d, this_rd) {
    const o = [];
    const R = (x, y, ww, hh, t) => o.push(['r', x, y, ww, hh, t || 0]);
    const Ci = (x, y, r, t) => o.push(['c', x, y, r, t || 0]);
    const E = (x, y, rx, ry, t) => o.push(['e', x, y, rx, ry, t || 0]);
    const L = (a, b, c, e) => o.push(['l', a, b, c, e]);
    switch (k) {
      case 'kose_kanepe': R(0, 0, w, d * 0.5); R(0, 0, w * 0.45, d); R(0, 0, w, d * 0.14, 1); R(0, 0, w * 0.14, d, 1); L(w * 0.45, d * 0.14, w * 0.45, d * 0.5); L(w * 0.7, d * 0.14, w * 0.7, d * 0.5); L(w * 0.14, d * 0.75, w * 0.45, d * 0.75); break;
      case 'yan_sehpa': R(0, 0, w, d); R(w * 0.18, d * 0.18, w * 0.64, d * 0.64, 2); break;
      case 'konsol': R(0, 0, w, d); break;
      case 'vitrin': R(0, 0, w, d); L(0, 0, w, d); L(w, 0, 0, d); break;
      case 'yatak_king': R(0, 0, w, d); R(w * 0.05, d * 0.04, w * 0.42, d * 0.13, 1); R(w * 0.53, d * 0.04, w * 0.42, d * 0.13, 1); L(0, d * 0.36, w, d * 0.36); break;
      case 'sifonyer': R(0, 0, w, d); L(0, d / 2, w, d / 2); L(w / 3, 0, w / 3, d); L((2 * w) / 3, 0, (2 * w) / 3, d); break;
      case 'puf': Ci(w / 2, d / 2, Math.min(w, d) / 2); Ci(w / 2, d / 2, Math.min(w, d) * 0.28, 2); break;
      case 'lavabo2': R(0, 0, w, d); E(w * 0.27, d * 0.56, w * 0.19, d * 0.3, 1); E(w * 0.73, d * 0.56, w * 0.19, d * 0.3, 1); break;
      case 'bulasik': R(0, 0, w, d); R(w * 0.12, d * 0.12, w * 0.76, d * 0.5, 2); L(w * 0.12, d * 0.8, w * 0.88, d * 0.8); break;
      case 'bar_tabure': Ci(w / 2, d / 2, Math.min(w, d) / 2); break;
      case 'bilardo': R(0, 0, w, d); R(w * 0.06, d * 0.1, w * 0.88, d * 0.8, 1); [[0, 0], [0.5, 0], [1, 0], [0, 1], [0.5, 1], [1, 1]].forEach((p) => Ci(w * (0.03 + p[0] * 0.94), d * (0.05 + p[1] * 0.9), Math.min(w, d) * 0.04, 0)); break;
      case 'pinpon': R(0, 0, w, d); L(w / 2, 0, w / 2, d); L(0, d / 2, w, d / 2, 0); break;
      case 'kosu_bandi': R(0, 0, w, d); R(w * 0.1, d * 0.12, w * 0.8, d * 0.76, 1); L(w * 0.1, d * 0.5, w * 0.9, d * 0.5); break;
      case 'ayakkabilik': R(0, 0, w, d); L(w / 2, 0, w / 2, d); break;
      case 'portmanto': Ci(w / 2, d / 2, Math.min(w, d) / 2); L(w * 0.2, d / 2, w * 0.8, d / 2); L(w / 2, d * 0.2, w / 2, d * 0.8); break;
      case 'depo_dolap': R(0, 0, w, d); L(w / 2, 0, w / 2, d); L(0, 0, w, d); break;
      case 'kurutma': R(0, 0, w, d); Ci(w / 2, d * 0.55, w * 0.3, 1); L(w * 0.15, d * 0.15, w * 0.35, d * 0.15); break;
      case 'kombi': R(0, 0, w, d); Ci(w * 0.5, d * 0.5, Math.min(w, d) * 0.25, 2); break;
      case 'boyler': Ci(w / 2, d / 2, Math.min(w, d) / 2); Ci(w / 2, d / 2, Math.min(w, d) * 0.22, 2); break;
      case 'bahce_masa': Ci(w / 2, d / 2, Math.min(w, d) / 2); Ci(w / 2, d / 2, Math.min(w, d) * 0.08, 1); break;
      case 'bahce_sandalye': R(0, 0, w, d); R(0, 0, w, d * 0.22, 1); break;
      case 'sezlong': R(0, 0, w, d); R(w * 0.08, d * 0.04, w * 0.84, d * 0.3, 1); L(0, d * 0.4, w, d * 0.4); break;
      case 'mangal': Ci(w / 2, d / 2, Math.min(w, d) / 2); L(w * 0.15, d / 2, w * 0.85, d / 2); break;
      case 'agac': Ci(w / 2, d / 2, Math.min(w, d) / 2, 1); Ci(w / 2, d / 2, Math.min(w, d) * 0.32, 1); Ci(w / 2, d / 2, Math.min(w, d) * 0.06, 0); break;
      case 'lambader': Ci(w / 2, d / 2, Math.min(w, d) / 2, 1); Ci(w / 2, d / 2, Math.min(w, d) * 0.15, 0); break;
      case 'kolon': R(0, 0, w, d); L(0, 0, w, d); L(w, 0, 0, d); break;
      case 'kolon_yuvarlak': Ci(w / 2, d / 2, Math.min(w, d) / 2); L(w * 0.15, d / 2, w * 0.85, d / 2); L(w / 2, d * 0.15, w / 2, d * 0.85); break;
      case 'ozel': if (this_rd) { Ci(w / 2, d / 2, Math.min(w, d) / 2); } else { R(0, 0, w, d); } break;
      default: return App.study.furnSym(k, w, d);
    }
    return o;
  }

  /* nesne sembolünü primitiflere çevir. o: nesne (x, y merkez, rot, w, d), view, st: { fill, stroke, soft, sw, opacity } */
  function objPrims(o, view, st) {
    const P = [];
    const ops = symOf(o.k, o.w, o.d, o.rd);
    const a = (o.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const tr = (lx, ly) => { const dx = lx - o.w / 2, dy = ly - o.d / 2; return [view.X(o.x + dx * ca - dy * sa), view.Y(o.y + dx * sa + dy * ca)]; };
    ops.forEach((q) => {
      const kind = q[0];
      const fill = (t) => (t === 2 ? undefined : t === 1 ? st.soft : st.fill);
      if (kind === 'r') { const x = q[1], y = q[2], w = q[3], h = q[4]; P.push({ t: 'poly', pts: [tr(x, y), tr(x + w, y), tr(x + w, y + h), tr(x, y + h)], fill: fill(q[5]), stroke: st.stroke, sw: st.sw, opacity: st.opacity }); }
      else if (kind === 'c') { const p = tr(q[1], q[2]); P.push({ t: 'circle', cx: p[0], cy: p[1], r: Math.max(0.8, q[3] * view.s), fill: fill(q[4]), stroke: st.stroke, sw: st.sw, opacity: st.opacity }); }
      else if (kind === 'e') { const pts = []; for (let i = 0; i < 20; i++) { const t = (i / 20) * Math.PI * 2; pts.push(tr(q[1] + Math.cos(t) * q[3], q[2] + Math.sin(t) * q[4])); } P.push({ t: 'poly', pts: pts, fill: fill(q[5]), stroke: st.stroke, sw: st.sw, opacity: st.opacity }); }
      else { const p = tr(q[1], q[2]), r = tr(q[3], q[4]); P.push({ t: 'line', x1: p[0], y1: p[1], x2: r[0], y2: r[1], stroke: st.stroke, sw: st.sw * 0.8, opacity: (st.opacity == null ? 1 : st.opacity) * 0.8 }); }
    });
    return P;
  }

  /* ---------------- ızgara, ölçek ve kuzey oku ---------------- */
  function gridPrims(view, Cc, snap) {
    const P = [];
    const a = view.area;
    let step = 1;
    if (view.s < 9) step = 5; else if (view.s > 48) step = 0.5; else if (view.s > 110) step = 0.1;
    const x0 = Math.floor(view.win.x0 / step) * step, y0 = Math.floor(view.win.y0 / step) * step;
    for (let x = x0; x <= view.win.x0 + view.win.w + 1e-6; x += step) {
      const px = view.X(x);
      if (px < a.x || px > a.x + a.w) continue;
      const major = Math.abs(x / 5 - Math.round(x / 5)) < 1e-6;
      P.push({ t: 'line', x1: px, y1: a.y, x2: px, y2: a.y + a.h, stroke: major ? Cc.grid5 : Cc.grid, sw: major ? 1 : 0.7 });
    }
    for (let y = y0; y <= view.win.y0 + view.win.h + 1e-6; y += step) {
      const py = view.Y(y);
      if (py < a.y || py > a.y + a.h) continue;
      const major = Math.abs(y / 5 - Math.round(y / 5)) < 1e-6;
      P.push({ t: 'line', x1: a.x, y1: py, x2: a.x + a.w, y2: py, stroke: major ? Cc.grid5 : Cc.grid, sw: major ? 1 : 0.7 });
    }
    return P;
  }
  function scaleBar(view, Cc, unit) {
    const P = [];
    const a = view.area;
    const nice = [0.5, 1, 2, 5, 10, 20, 50];
    let m = 5;
    for (let i = 0; i < nice.length; i++) { if (nice[i] * view.s >= 110) { m = nice[i]; break; } m = nice[i]; }
    const len = m * view.s;
    const x1 = a.x + a.w - 22, x0 = x1 - len, y = a.y + a.h - 24;
    const st0 = { stroke: Cc.ink, sw: 2, opacity: 0.75 };
    P.push(Object.assign({ t: 'line', x1: x0, y1: y, x2: x1, y2: y }, st0));
    P.push(Object.assign({ t: 'line', x1: x0, y1: y - 5, x2: x0, y2: y + 5 }, st0));
    P.push(Object.assign({ t: 'line', x1: x1, y1: y - 5, x2: x1, y2: y + 5 }, st0));
    P.push({ t: 'text', x: (x0 + x1) / 2, y: y - 9, s: unit === 'ft' ? fmt(m * 3.28084, 0) + ' ft' : m + ' m', size: 11.5, weight: 700, fam: 'm', fill: Cc.ink, opacity: 0.75, anchor: 'middle' });
    return P;
  }
  function northArrow(view, Cc) {
    const a = view.area, x = a.x + 34, y = a.y + 46;
    return [
      { t: 'circle', cx: x, cy: y, r: 17, stroke: Cc.ink, sw: 1.2, opacity: 0.55 },
      { t: 'poly', pts: [[x, y - 14], [x + 5.5, y + 8], [x, y + 3], [x - 5.5, y + 8]], fill: Cc.ink, opacity: 0.8 },
      { t: 'text', x: x, y: y - 22, s: 'K', size: 11, weight: 700, fam: 'm', fill: Cc.ink, opacity: 0.75, anchor: 'middle' },
    ];
  }

  /* ---------------- kaplama deseni (oda zemini) ---------------- */
  function floorPattern(r, mat, view, Cc) {
    const P = [];
    const x0 = view.X(r.net.x), y0 = view.Y(r.net.y), w = r.net.w * view.s, h = r.net.d * view.s;
    const ln = (x1, y1, x2, y2, op) => P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: Cc.ink, sw: 0.7, opacity: op });
    if (mat.pat === 'parke') {
      const sp = Math.max(6, 0.14 * view.s);
      if (sp > 40) return P;
      for (let y = y0 + sp; y < y0 + h; y += sp) ln(x0, y, x0 + w, y, 0.16);
      const sx = sp * 7;
      let row = 0;
      for (let y = y0; y < y0 + h; y += sp, row++) for (let x = x0 + ((row * 3) % 7) * sp; x < x0 + w; x += sx) ln(x, y, x, Math.min(y + sp, y0 + h), 0.14);
    } else if (mat.pat === 'karo') {
      const sp = Math.max(9, 0.6 * view.s);
      if (w / sp * (h / sp) > 1800) return P;
      for (let x = x0 + sp; x < x0 + w; x += sp) ln(x, y0, x, y0 + h, 0.16);
      for (let y = y0 + sp; y < y0 + h; y += sp) ln(x0, y, x0 + w, y, 0.16);
    } else if (mat.pat === 'tas') {
      const sp = Math.max(14, 0.9 * view.s);
      for (let k = sp; k < w + h; k += sp) ln(x0 + Math.min(k, w), y0 + Math.max(0, k - w), x0 + Math.max(0, k - h), y0 + Math.min(k, h), 0.1);
    } else if (mat.pat === 'hali') {
      P.push({ t: 'rect', x: x0 + 6, y: y0 + 6, w: Math.max(0, w - 12), h: Math.max(0, h - 12), stroke: Cc.ink, sw: 0.9, dash: [3, 3], opacity: 0.35 });
    } else if (mat.pat === 'beton') {
      const sp = Math.max(18, 1.2 * view.s);
      for (let x = x0 + sp; x < x0 + w; x += sp) for (let y = y0 + sp; y < y0 + h; y += sp) P.push({ t: 'circle', cx: x + ((y * 7) % 5), cy: y, r: 0.9, fill: Cc.ink, opacity: 0.22 });
    }
    return P;
  }

  /* ---------------- açıklık (kapı / pencere) çizimi ---------------- */
  function openingPrims(o, view, Cc) {
    const P = [];
    const X = view.X, Y = view.Y, s = view.s;
    const def = C.OP_BY[o.k + ':' + o.sub] || {};
    const ax = o.ax, ay = o.ay, bx = o.bx, by = o.by;
    const ux = o.ux, uy = o.uy, nx = o.nx, ny = o.ny;
    const t = o.t, hw = t / 2;
    // duvarı oy: kâğıt renginde dikdörtgen (kalınlık boyunca biraz taşar)
    const cut = [[ax + nx * hw, ay + ny * hw], [bx + nx * hw, by + ny * hw], [bx - nx * hw, by - ny * hw], [ax - nx * hw, ay - ny * hw]];
    P.push({ t: 'poly', pts: cut.map((q) => [X(q[0]), Y(q[1])]), fill: Cc.paper });
    const sw = Math.max(1, Math.min(2.2, s * 0.04));
    const jam = (px, py) => P.push({ t: 'line', x1: X(px + nx * hw), y1: Y(py + ny * hw), x2: X(px - nx * hw), y2: Y(py - ny * hw), stroke: Cc.wall, sw: sw });
    jam(ax, ay); jam(bx, by);
    const sg = o.flip ? -1 : 1;
    const H = o.mir ? [bx, by] : [ax, ay];
    const Eend = o.mir ? [ax, ay] : [bx, by];
    const dirE = o.mir ? -1 : 1;
    const leaf = (hx, hy, len, sgn, ex, ey, dashed) => {
      const lx = hx + nx * sgn * len, ly = hy + ny * sgn * len;
      P.push({ t: 'line', x1: X(hx), y1: Y(hy), x2: X(lx), y2: Y(ly), stroke: Cc.ink, sw: Math.max(1.4, sw * 1.2), cap: 'round' });
      const r = len * s;
      const vx1 = X(lx) - X(hx), vy1 = Y(ly) - Y(hy), vx2 = X(ex) - X(hx), vy2 = Y(ey) - Y(hy);
      const sweep = vx1 * vy2 - vy1 * vx2 > 0 ? 1 : 0;
      P.push({ t: 'path', d: 'M ' + X(lx) + ' ' + Y(ly) + ' A ' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + X(ex) + ' ' + Y(ey), stroke: Cc.ink, sw: 0.9, dash: dashed ? [4, 3] : undefined, opacity: 0.7 });
    };
    if (o.k === 'kapi') {
      if (def.open) { /* geçiş: yalnız söve çizgileri */ }
      else if (def.slide && !def.pocket) {
        const off = hw * 0.55;
        P.push({ t: 'line', x1: X(ax + nx * off), y1: Y(ay + ny * off), x2: X(bx + nx * off), y2: Y(by + ny * off), stroke: Cc.ink, sw: sw * 1.1 });
        P.push({ t: 'line', x1: X(ax - nx * off + ux * o.w * 0.5), y1: Y(ay - ny * off + uy * o.w * 0.5), x2: X(bx - nx * off + ux * o.w * 0.5), y2: Y(by - ny * off + uy * o.w * 0.5), stroke: Cc.ink, sw: sw * 0.8, opacity: 0.5, dash: [4, 3] });
      } else if (def.pocket) {
        P.push({ t: 'line', x1: X(ax), y1: Y(ay), x2: X(bx), y2: Y(by), stroke: Cc.ink, sw: sw * 1.2 });
        P.push({ t: 'line', x1: X(bx), y1: Y(by), x2: X(bx + ux * o.w), y2: Y(by + uy * o.w), stroke: Cc.ink, sw: sw * 0.8, dash: [4, 3], opacity: 0.6 });
      } else if (def.fold) {
        const n = 4, pts = [];
        for (let i = 0; i <= n; i++) { const f = i / n; pts.push([X(ax + ux * o.w * f + nx * sg * (i % 2 ? 0.14 : 0)), Y(ay + uy * o.w * f + ny * sg * (i % 2 ? 0.14 : 0))]); }
        P.push({ t: 'poly', pts: pts, stroke: Cc.ink, sw: sw });
        P.push({ t: 'line', x1: pts[0][0], y1: pts[0][1], x2: pts[n][0], y2: pts[n][1], stroke: Cc.ink, sw: sw * 0.7, opacity: 0.5 });
      } else if (def.leaves === 2) {
        const half = o.w / 2;
        leaf(ax, ay, half, sg, ax + ux * half, ay + uy * half);
        leaf(bx, by, half, sg, bx - ux * half, by - uy * half);
      } else if (o.sub === 'garaj') {
        P.push({ t: 'line', x1: X(ax + nx * sg * 0.12), y1: Y(ay + ny * sg * 0.12), x2: X(bx + nx * sg * 0.12), y2: Y(by + ny * sg * 0.12), stroke: Cc.ink, sw: sw, dash: [8, 4] });
      } else {
        leaf(H[0], H[1], o.w, sg, Eend[0], Eend[1]);
      }
      void dirE;
    } else {
      // pencere: kesit içinde üç çizgi
      const lines = [hw * 0.7, 0, -hw * 0.7];
      lines.forEach((off, i) => P.push({ t: 'line', x1: X(ax + nx * off), y1: Y(ay + ny * off), x2: X(bx + nx * off), y2: Y(by + ny * off), stroke: Cc.wall, sw: i === 1 ? sw * 0.8 : sw }));
      if (!def.fixed && !def.slide && def.door) {
        // cam kapı: ince kanat yayı
        if (def.leaves === 2) { const half = o.w / 2; leaf(ax, ay, half, sg, ax + ux * half, ay + uy * half, true); leaf(bx, by, half, sg, bx - ux * half, by - uy * half, true); }
        else leaf(H[0], H[1], o.w, sg, Eend[0], Eend[1], true);
      } else if (!def.fixed && !def.slide && def.leaves === 2) {
        P.push({ t: 'line', x1: X(ax + ux * o.w / 2 - nx * hw), y1: Y(ay + uy * o.w / 2 - ny * hw), x2: X(ax + ux * o.w / 2 + nx * hw), y2: Y(ay + uy * o.w / 2 + ny * hw), stroke: Cc.wall, sw: sw * 0.8 });
      }
    }
    return P;
  }

  /* ---------------- merdiven çizimi ---------------- */
  function stairPrims(s, fh, view, Cc, st) {
    const P = [];
    const g = pe.stairSteps(s, fh);
    const tr = (lx, ly) => { const r = pe.rotPt(lx, ly, s.rot); return [view.X(s.x + r[0]), view.Y(s.y + r[1])]; };
    g.steps.forEach((q) => {
      P.push({ t: 'poly', pts: [tr(q.x0, q.y0), tr(q.x1, q.y0), tr(q.x1, q.y1), tr(q.x0, q.y1)], fill: q.landing ? st.soft : st.fill, stroke: st.stroke, sw: st.sw, opacity: st.opacity });
    });
    // çıkış oku: ilk basamak ortasından son basamağa
    const first = g.steps[0], last = g.steps[g.steps.length - 1];
    if (first && last) {
      const c1 = [(first.x0 + first.x1) / 2, (first.y0 + first.y1) / 2], c2 = [(last.x0 + last.x1) / 2, (last.y0 + last.y1) / 2];
      const a = tr(c1[0], c1[1]), b = tr(c2[0], c2[1]);
      P.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: st.stroke, sw: 1.2, opacity: 0.8 });
      P.push({ t: 'circle', cx: a[0], cy: a[1], r: 2.6, fill: st.stroke, opacity: 0.85 });
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      P.push({ t: 'poly', pts: [[b[0], b[1]], [b[0] - 9 * Math.cos(ang - 0.45), b[1] - 9 * Math.sin(ang - 0.45)], [b[0] - 9 * Math.cos(ang + 0.45), b[1] - 9 * Math.sin(ang + 0.45)]], fill: st.stroke, opacity: 0.85 });
    }
    return P;
  }

  /* duvarın dolgu çokgeni (uçlar köşeyi kapatmak için t/2 uzar) */
  function wallPoly(w, ext) {
    const hw = w.t / 2, e = ext == null ? hw : ext;
    const ax = w.x1 - w.ux * e, ay = w.y1 - w.uy * e, bx = w.x2 + w.ux * e, by = w.y2 + w.uy * e;
    const nx = -w.uy, ny = w.ux;
    return [[ax + nx * hw, ay + ny * hw], [bx + nx * hw, by + ny * hw], [bx - nx * hw, by - ny * hw], [ax - nx * hw, ay - ny * hw]];
  }

  /* ---------------- sahne ----------------
     opts: { fid, cam, frozen, fin (kaplama göster), grid, dims, names, objs, live, below (alt kat izi), sel } */
  function scene(P, opts) {
    opts = opts || {};
    const d = pe.derive(P), E = d.E;
    const fid = opts.fid && d.by[opts.fid] ? opts.fid : E.floors[0].id;
    const D = d.by[fid];
    const Cc = colors();
    const view = planView(D, opts.frozen, opts.cam);
    const a = view.area;
    const unit = E.unit;
    const M = d.metrics;
    const idx = pe.floorIndex(E, fid);
    const info = {
      name: P.meta.name,
      subtitle: 'Plan editörü · ' + D.f.name + ' · ' + D.rooms.length + ' mekân',
      legend: [{ label: 'Duvar', fill: Cc.wall }, { label: 'Kapı / pencere', line: { stroke: Cc.ink, sw: 1.6 } }, { label: 'Nesne', fill: Cc.fFill }],
      stats: [['Net alan', pe.fmtArea(D.rooms.reduce((t, r) => t + r.area, 0), unit)], ['Brüt alan', pe.fmtArea(D.rooms.reduce((t, r) => t + r.gross, 0), unit)], ['Kapı / pencere', M.doors + ' / ' + M.windows]],
      scoreLabel: 'Plan skoru', percent: M.score,
    };
    const prims = sheet.frame(info, opts.live !== false);
    const items = [];
    items.push({ t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: Cc.panel });
    if (opts.grid !== false) gridPrims(view, Cc, E.snap).forEach((p) => items.push(p));
    // alt kat izi
    if (opts.below !== false && idx > 0) {
      const Lw = d.floors[idx - 1];
      Lw.walls.forEach((w) => items.push({ t: 'poly', pts: wallPoly(w).map((q) => [view.X(q[0]), view.Y(q[1])]), fill: Cc.ghost }));
    }
    const showFin = !!opts.fin;
    const sorted = D.rooms.slice().sort((p, q) => q.gross - p.gross);
    // oda zeminleri
    sorted.forEach((r) => {
      const zn = App.ZONES[r.zone] || App.ZONES.sosyal;
      const matK = pe.finOf(E, D.f, r, 'zemin'), mat = C.MAT_BY[matK] || C.MAT_BY.mese_parke;
      const base = showFin ? mat.c : (Cc.zones ? zn.fill : Cc.floor);
      const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]].map((q) => [view.X(q[0]), view.Y(q[1])]);
      items.push({ t: 'poly', pts: pts, fill: base, opacity: showFin ? 1 : (Cc.zones ? 0.9 : 1) });
      if (showFin) {
        const pat = floorPattern(r, mat, view, Cc);
        if (pat.length) items.push({ t: 'g', clip: { id: 'pe-' + r.id, pts: [[r.net.x, r.net.y], [r.net.x + r.net.w, r.net.y], [r.net.x + r.net.w, r.net.y + r.net.d], [r.net.x, r.net.y + r.net.d]].map((q) => [view.X(q[0]), view.Y(q[1])]) }, items: pat });
      }
      if (r.overlap) items.push({ t: 'poly', pts: pts, fill: Cc.bad, opacity: 0.16 });
    });
    // duvarlar
    D.walls.forEach((w) => items.push({ t: 'poly', pts: wallPoly(w).map((q) => [view.X(q[0]), view.Y(q[1])]), fill: Cc.wall }));
    // açıklıklar
    D.ops.forEach((o) => {
      if (o.orphan) {
        items.push({ t: 'circle', cx: view.X(o.x), cy: view.Y(o.y), r: Math.max(6, o.w * view.s * 0.5), stroke: Cc.bad, sw: 1.6, dash: [4, 3] });
        return;
      }
      openingPrims(o, view, Cc).forEach((p) => items.push(p));
    });
    // nesneler
    const sw = view.s >= 18 ? 1 : 0.8;
    const tintOf = (st) => (showFin && st ? st.tint : null);
    const sty = C.STYLE_BY[E.style];
    if (opts.objs !== false && view.s >= 5) {
      D.objs.slice().sort((p, q) => ((p.cat && p.cat.flat) ? 0 : 1) - ((q.cat && q.cat.flat) ? 0 : 1) || q.w * q.d - p.w * p.d).forEach((o) => {
        const fillC = o.fin && C.MAT_BY[o.fin] ? C.MAT_BY[o.fin].c : tintOf(C.STYLE_BY[pe.styleOf(E, D.f, D.roomBy[o.room])] || sty) || Cc.fFill;
        objPrims(o, view, { fill: fillC, stroke: o.hit ? Cc.bad : Cc.ink, soft: Cc.fSoft, sw: sw, opacity: 0.95 }).forEach((p) => items.push(p));
      });
    }
    D.stairs.forEach((s) => stairPrims(s, D.f.h, view, Cc, { fill: Cc.fFill, soft: Cc.fSoft, stroke: Cc.ink, sw: sw, opacity: 0.95 }).forEach((p) => items.push(p)));
    D.rails.forEach((r) => {
      items.push({ t: 'line', x1: view.X(r.x1), y1: view.Y(r.y1), x2: view.X(r.x2), y2: view.Y(r.y2), stroke: Cc.ink, sw: 2.2, cap: 'round' });
      [[r.x1, r.y1], [r.x2, r.y2]].forEach((q) => items.push({ t: 'circle', cx: view.X(q[0]), cy: view.Y(q[1]), r: 2.6, fill: Cc.ink }));
    });
    // mekân adı ve ölçüleri
    if (opts.names !== false) {
      sorted.forEach((r) => {
        const x = view.X(r.net.x), y = view.Y(r.net.y), w = r.net.w * view.s, h = r.net.d * view.s;
        const lab = sheet.fitLabel(r.name, w * 0.9, Math.min(h, 90), { withArea: true, max: 15, min: 8 });
        const objsIn = D.objs.filter((o) => o.room === r.id && !(o.cat && o.cat.flat));
        if (lab) {
          const lh = lab.fs * 1.16, afs = Math.max(8, lab.fs * 0.82);
          const showDims = opts.dims !== false && h > 66 && w > 96 && !(objsIn.length > 1);
          const bh = lab.lines.length * lh + afs + (showDims ? afs : 0) + 2;
          const lw = Math.min(w * 0.92, Math.max.apply(null, lab.lines.map((ln) => ln.length)) * lab.fs * 0.6 + 8);
          // etiketi donatıyla en az çakışan yere koy: orta · üst · alt
          let yc = y + h / 2, bestOv = Infinity;
          [y + h / 2, y + bh / 2 + 5, y + h - bh / 2 - 5].forEach((cy) => {
            if (cy - bh / 2 < y - 1 || cy + bh / 2 > y + h + 1) return;
            let ov = 0;
            objsIn.forEach((o) => {
              const xs = o.fp.map((q) => view.X(q[0])), ys = o.fp.map((q) => view.Y(q[1]));
              const ix = Math.min(Math.max.apply(null, xs), x + w / 2 + lw / 2) - Math.max(Math.min.apply(null, xs), x + w / 2 - lw / 2), iy = Math.min(Math.max.apply(null, ys), cy + bh / 2) - Math.max(Math.min.apply(null, ys), cy - bh / 2);
              if (ix > 0 && iy > 0) ov += ix * iy;
            });
            if (ov < bestOv - 1) { bestOv = ov; yc = cy; }
          });
          const ty = yc - bh / 2 + lab.fs * 0.84;
          lab.lines.forEach((ln, i) => items.push({ t: 'text', x: x + w / 2, y: ty + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: Cc.ink, anchor: 'middle', ls: lab.ls, opacity: objsIn.length > 1 ? 0.85 : 0.95, pe: false }));
          items.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1, s: pe.fmtArea(r.area, unit), size: afs, weight: 600, fam: 'm', fill: Cc.ink, anchor: 'middle', opacity: 0.7, pe: false });
          if (showDims) items.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1 + afs, s: pe.fmtLen(r.net.w, unit) + ' × ' + pe.fmtLen(r.net.d, unit), size: afs - 0.5, weight: 500, fam: 'm', fill: Cc.ink, anchor: 'middle', opacity: 0.5, pe: false });
        } else if (w > 22 && h > 14) items.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 3.5, s: fmt(r.area, 0), size: 10, weight: 700, fam: 'b', fill: Cc.ink, anchor: 'middle', opacity: 0.85, pe: false });
      });
    }
    D.labels.forEach((l) => items.push({ t: 'text', x: view.X(l.x), y: view.Y(l.y), s: l.text, size: 13, weight: 700, fam: 'b', fill: Cc.ink, anchor: 'middle', pe: false }));
    // toplam ölçü çizgileri
    if (opts.dims !== false && !D.bounds.empty) {
      const b = D.bounds;
      const dl = { stroke: Cc.ink, sw: 1, opacity: 0.45 };
      const by = view.Y(b.y1) + 18, lx = view.X(b.x0) - 18;
      if (by < a.y + a.h - 26) {
        items.push(Object.assign({ t: 'line', x1: view.X(b.x0), y1: by, x2: view.X(b.x1), y2: by }, dl));
        items.push(Object.assign({ t: 'line', x1: view.X(b.x0), y1: by - 4, x2: view.X(b.x0), y2: by + 4 }, dl));
        items.push(Object.assign({ t: 'line', x1: view.X(b.x1), y1: by - 4, x2: view.X(b.x1), y2: by + 4 }, dl));
        items.push({ t: 'text', x: (view.X(b.x0) + view.X(b.x1)) / 2, y: by + 14, s: pe.fmtLen(b.w, unit), size: 12, weight: 600, fam: 'm', fill: Cc.ink, opacity: 0.6, anchor: 'middle' });
      }
      if (lx > a.x + 26) {
        items.push(Object.assign({ t: 'line', x1: lx, y1: view.Y(b.y0), x2: lx, y2: view.Y(b.y1) }, dl));
        items.push(Object.assign({ t: 'line', x1: lx - 4, y1: view.Y(b.y0), x2: lx + 4, y2: view.Y(b.y0) }, dl));
        items.push(Object.assign({ t: 'line', x1: lx - 4, y1: view.Y(b.y1), x2: lx + 4, y2: view.Y(b.y1) }, dl));
        items.push({ t: 'text', x: lx - 6, y: (view.Y(b.y0) + view.Y(b.y1)) / 2, s: pe.fmtLen(b.h, unit), size: 12, weight: 600, fam: 'm', fill: Cc.ink, opacity: 0.6, anchor: 'middle', xf: [0, -1, 1, 0] });
      }
    }
    prims.push(Cc.g ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, fill: Cc.panel, stroke: Cc.panelStroke, sw: 1 } : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: Cc.panel, stroke: Cc.ink, sw: 4 });
    prims.push({ t: 'g', clip: { id: 'pe-area', x: a.x, y: a.y, w: a.w, h: a.h }, items: items });
    prims.push(Cc.g ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, stroke: Cc.panelStroke, sw: 1 } : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, stroke: Cc.ink, sw: 4 });
    scaleBar(view, Cc, unit).forEach((p) => prims.push(p));
    northArrow(view, Cc).forEach((p) => prims.push(p));
    return { prims: prims, view: view, D: D, d: d };
  }

  Object.assign(pe, { planView: planView, scene: scene, colors: colors, symOf: symOf, objPrims: objPrims, wallPoly: wallPoly, openingPrims: openingPrims, stairPrims: stairPrims, gridPrims: gridPrims });
})();
