/* ==========================================================================
   35-lib-freescene.js — Mekân Etüdü paftası (serbest düzen): ölçekli mekân çokgenleri + donatı + ilişkiler + çevre
   Katmanlar (alttan üste): harita altlığı · ızgara · çevre (vaziyet ya da üretilmiş) · parsel · yapı kabuğu ·
                            yeşil / boşluk · mekânlar (kat süzgeci) · donatı · çakışma · ilişkiler · ağaç / ok · etiketler.
   Canlı SVG ve PNG/PDF çıktısı aynı primitif listesinden çizilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const sheet = App.sheet;
  const st = App.study;
  const U = App.util;
  const fmt = U.fmt;

  const glass = () => App.theme.name === 'glass';
  const AREA = () => ({ x: 64, y: 54, w: sheet.W - 128, h: sheet.tb.y - 54 - 22 });

  /* görüntülenecek dünya kutusu: mekânlar + ek öğeler + parsel + kabuk */
  function viewBounds(fd) {
    const b = fd.bounds;
    let x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1;
    const acc = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); };
    fd.extras.forEach((e) => {
      if (e.t === 'arrow') { acc(e.x1, e.y1); acc(e.x2, e.y2); } else if (e.t === 'tree') { acc(e.x - e.r, e.y - e.r); acc(e.x + e.r, e.y + e.r); } else { acc(e.x, e.y); acc(e.x + e.w, e.y + e.h); }
    });
    if (!fd.shell) (fd.siteRing || []).forEach((q) => acc(q[0], q[1]));
    (fd.shell || []).forEach((q) => acc(q[0], q[1]));
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  }

  /* dünya penceresi (metre) → paftaya ölçek: görünür sınırlar + kenar boşluğu, alan oranına uyar.
     frozen verilirse (sürükleme sırasında) pencere değişmez · cam = { k (yakınlaştırma), dx, dy (kaydırma, m) } */
  function freeView(fd, frozen, cam) {
    const area = AREA();
    let win = frozen;
    if (!win) {
      const b = viewBounds(fd);
      const pad = Math.max(3, (fd.shell ? 0.45 : 0.1) * Math.max(b.w, b.h));
      let x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
      let w = Math.max(x1 - x0, 22), h = Math.max(y1 - y0, 14);
      let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const ar = area.w / area.h;
      if (w / h < ar) w = h * ar; else h = w / ar;
      if (cam) { const k = U.clamp(cam.k || 1, 0.25, 12); w /= k; h /= k; cx += cam.dx || 0; cy += cam.dy || 0; }
      win = { x0: cx - w / 2, y0: cy - h / 2, w: w, h: h };
    }
    const s = Math.min(area.w / win.w, area.h / win.h);
    const ox = area.x + (area.w - win.w * s) / 2, oy = area.y + (area.h - win.h * s) / 2;
    return { area: area, win: win, s: s, ox: ox, oy: oy, X: (wx) => ox + (wx - win.x0) * s, Y: (wy) => oy + (wy - win.y0) * s, wx: (px) => win.x0 + (px - ox) / s, wy: (py) => win.y0 + (py - oy) / s };
  }

  /* etiket için mekânın içine sığan en geniş dikdörtgen (dünya, metre) */
  function labelRect(it) {
    const c = it.cut;
    let u;
    if (it.shape === 'L') {
      const col = [0, 0, 1 - c, 1], row = [0, c, 1, 1];
      const mc = Math.min((1 - c) * it.w, it.h), mr = Math.min(it.w, (1 - c) * it.h);
      u = mc >= mr ? col : row;
    } else if (it.shape === 'T') {
      const s = Math.max(0.25, 1 - 1.5 * c), t = 0.42;
      u = t >= (s * (1 - t)) ? [0, 0, 1, t] : [(1 - s) / 2, t, (1 + s) / 2, 1];
    } else if (it.shape === 'U') u = [0, 0.55, 1, 1];
    else if (it.shape === 'rect') u = [0, 0, 1, 1];
    else return st.itemLabelRect(it);
    const rot = (p, r) => (r === 1 ? [1 - p[1], p[0]] : r === 2 ? [1 - p[0], 1 - p[1]] : r === 3 ? [p[1], 1 - p[0]] : p);
    const a = rot([u[0], u[1]], it.rot), b = rot([u[2], u[3]], it.rot);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    return { x: it.x + x0 * it.w, y: it.y + y0 * it.h, w: (x1 - x0) * it.w, h: (y1 - y0) * it.h };
  }

  // iki merkez arasındaki doğrunun kutu kenarından çıktığı nokta
  function exitPoint(it, tx, ty) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const k = Math.min(dx ? (it.w / 2) / Math.abs(dx) : Infinity, dy ? (it.h / 2) / Math.abs(dy) : Infinity);
    return [cx + dx * k, cy + dy * k];
  }

  function colors() {
    const PAL = App.PAL, g = glass();
    return g
      ? { g: true, ink: PAL.ink, panel: '#F1F2F5', panelStroke: 'rgba(23,24,27,.16)', edge: '#F6F7F9', edgeW: 2.4, rel: PAL.ink, bad: PAL.ink, weak: PAL.ink, chipBg: '#F6F7F9', over: 'rgba(23,24,27,.32)',
        parcel: '#FFFFFF', ctx: '#D9DBE0', ctxEdge: 'rgba(23,24,27,.35)', green: '#AEB3BB', greenDk: '#8C9199', voidF: '#E9EAEE', flow: PAL.ink, thru: PAL.ink, entry: PAL.ink, shell: PAL.ink, fFill: '#FFFFFF', fSoft: 'rgba(23,24,27,.09)' }
      : { g: false, ink: PAL.ink, panel: PAL.paperDark, panelStroke: PAL.ink, edge: PAL.ink, edgeW: 3, rel: PAL.blue, bad: PAL.red, weak: PAL.ink, chipBg: PAL.paper, over: 'rgba(192,58,34,.45)',
        parcel: '#FBF3DC', ctx: '#BDB49C', ctxEdge: PAL.ink, green: PAL.green, greenDk: '#2C6330', voidF: PAL.paper, flow: PAL.ink, thru: PAL.blue, entry: PAL.yellow, shell: PAL.red, fFill: PAL.paper, fSoft: 'rgba(38,29,17,.14)' };
  }

  /* ---------- oklar (akış · geçit · giriş) ---------- */
  function headPoly(x, y, ux, uy, len, wid, fill, stroke, sw) {
    return { t: 'poly', pts: [[x, y], [x - ux * len - uy * wid, y - uy * len + ux * wid], [x - ux * len + uy * wid, y - uy * len - ux * wid]], fill: fill, stroke: stroke, sw: sw };
  }
  // ekranda ok: kind 'flow' dolu çizgi + ok başı · 'through' noktalı kesik çizgi · 'entry' üçgen işaret
  function arrowPrims(k, x1, y1, x2, y2, C, scale) {
    const P = [];
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const sc = scale || 1;
    if (k === 'entry') {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, s = 9 * sc;
      P.push({ t: 'poly', pts: [[mx + ux * s * 1.2, my + uy * s * 1.2], [mx - ux * s * 0.8 - uy * s, my - uy * s * 0.8 + ux * s], [mx - ux * s * 0.8 + uy * s, my - uy * s * 0.8 - ux * s]], fill: C.entry, stroke: C.ink, sw: 1.8 });
      return P;
    }
    if (k === 'through') {
      P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: C.thru, sw: 2.6 * sc, dash: [0.5, 7 * sc], cap: 'round' });
      return P;
    }
    const hl = 11 * sc;
    P.push({ t: 'line', x1: x1, y1: y1, x2: x2 - ux * hl * 0.5, y2: y2 - uy * hl * 0.5, stroke: C.flow, sw: 2.2 * sc, cap: 'round' });
    P.push(headPoly(x2, y2, ux, uy, hl, hl * 0.52, C.flow, C.flow, 1));
    return P;
  }

  function relationPrims(fd, C, view) {
    const P = [];
    const X = view.X, Y = view.Y, s = view.s;
    fd.pairs.forEach((p) => {
      const A = fd.byId.get(p.a), B = fd.byId.get(p.b);
      if (!A || !B || p.state === 'overlap') return;
      if (view.vis && (!view.vis(A) || !view.vis(B))) return;
      if (p.dv) {
        // farklı katlar: iki merkezi birleştiren noktalı çizgi + kat farkı rozeti
        const col = p.type === 'avoid' ? C.bad : p.type === 'strong' ? C.rel : C.weak;
        const x1 = X(A.cx), y1 = Y(A.cy), x2 = X(B.cx), y2 = Y(B.cy);
        const op = p.type === 'weak' ? 0.5 : 0.85;
        P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: col, sw: p.type === 'strong' ? 2.4 : 1.5, dash: [2, 5], cap: 'round', opacity: op });
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, txt = (p.state === 'stacked' ? 'üst üste ' : '') + '±' + p.dv + ' kat';
        if (view.chips && p.type !== 'weak') {
          const tw = sheet.tw(txt, 10.5, 700, 'm', 0) + 10;
          P.push({ t: 'rect', x: mx - tw / 2, y: my - 9, w: tw, h: 18, rx: C.g ? 9 : 0, fill: C.chipBg, stroke: col, sw: 1.2 });
          P.push({ t: 'text', x: mx, y: my + 4, s: txt, size: 10.5, weight: 700, fam: 'm', fill: C.ink, anchor: 'middle' });
        }
        return;
      }
      const ea = exitPoint(A, B.x + B.w / 2, B.y + B.h / 2), eb = exitPoint(B, A.x + A.w / 2, A.y + A.h / 2);
      // yakın / bitişik: temas noktası
      const mx = (ea[0] + eb[0]) / 2, my = (ea[1] + eb[1]) / 2;
      const x1 = X(ea[0]), y1 = Y(ea[1]), x2 = X(eb[0]), y2 = Y(eb[1]);
      const mxp = X(mx), myp = Y(my);
      const ok = p.ok >= 0.99, bad = p.ok < 0.5;
      const col = p.type === 'avoid' ? C.bad : p.type === 'strong' ? C.rel : C.weak;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (p.state === 'adjacent') {
        if (p.type === 'avoid') {
          P.push({ t: 'circle', cx: mxp, cy: myp, r: 8, fill: C.chipBg, stroke: col, sw: 2 });
          P.push({ t: 'line', x1: mxp - 3.4, y1: myp - 3.4, x2: mxp + 3.4, y2: myp + 3.4, stroke: col, sw: 2, cap: 'round' });
          P.push({ t: 'line', x1: mxp - 3.4, y1: myp + 3.4, x2: mxp + 3.4, y2: myp - 3.4, stroke: col, sw: 2, cap: 'round' });
        } else if (p.type === 'strong') {
          P.push({ t: 'circle', cx: mxp, cy: myp, r: 6.5, fill: col, stroke: C.chipBg, sw: 2 });
        } else {
          P.push({ t: 'circle', cx: mxp, cy: myp, r: 5, fill: C.chipBg, stroke: col, sw: 1.8 });
        }
        return;
      }
      const dash = p.type === 'strong' ? (ok ? undefined : [9, 6]) : p.type === 'weak' ? [6, 6] : [1.5, 6];
      const sw = p.type === 'strong' ? (bad ? 2.4 : 3.2) : p.type === 'weak' ? 1.6 : 2;
      const op = p.type === 'avoid' && ok ? 0.45 : p.type === 'weak' ? 0.65 : 0.95;
      P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: col, sw: sw, dash: dash, cap: 'round', opacity: op });
      [[x1, y1], [x2, y2]].forEach((q) => P.push({ t: 'circle', cx: q[0], cy: q[1], r: p.type === 'strong' ? 4 : 3, fill: col, opacity: op }));
      if (p.type === 'avoid' && !ok) {
        P.push({ t: 'circle', cx: mxp, cy: myp, r: 7, fill: C.chipBg, stroke: col, sw: 1.8 });
        P.push({ t: 'line', x1: mxp - 3, y1: myp - 3, x2: mxp + 3, y2: myp + 3, stroke: col, sw: 1.8, cap: 'round' });
        P.push({ t: 'line', x1: mxp - 3, y1: myp + 3, x2: mxp + 3, y2: myp - 3, stroke: col, sw: 1.8, cap: 'round' });
      } else if (view.chips && dist > 34 && p.type !== 'weak') {
        const txt = fmt(p.gap, 1) + ' m';
        const tw = sheet.tw(txt, 11, 700, 'm', 0) + 10;
        P.push({ t: 'rect', x: mxp - tw / 2, y: myp - 9, w: tw, h: 18, rx: C.g ? 9 : 0, fill: C.chipBg, stroke: col, sw: 1.4 });
        P.push({ t: 'text', x: mxp, y: myp + 4, s: txt, size: 11, weight: 700, fam: 'm', fill: C.ink, anchor: 'middle' });
      }
    });
    return P;
  }

  function itemPrims(it, C, view) {
    const P = [];
    const z = App.ZONES[it.zone] || App.ZONES.sosyal;
    const X = view.X, Y = view.Y, s = view.s;
    const gh = view.ghost && view.ghost(it);
    P.push({ t: 'poly', pts: it.ring.map((q) => [X(q[0]), Y(q[1])]), fill: gh ? undefined : z.fill, stroke: gh ? C.ink : C.edge, sw: gh ? 1.1 : C.edgeW, dash: gh ? [5, 5] : undefined, opacity: gh ? 0.4 : 1 });
    return P;
  }

  const lvLabel = (it) => (it.nf > 1 ? (it.lv === 0 ? 'Z' : it.lv + '.k') + '–' + (it.top === 0 ? 'Z' : it.top + '.k') : it.lv === 0 ? 'Zemin' : it.lv + '. kat');
  function labelPrims(it, C, view) {
    const P = [];
    if (view.ghost && view.ghost(it)) return P;
    const z = App.ZONES[it.zone] || App.ZONES.sosyal;
    const lr = labelRect(it);
    const x = view.X(lr.x), y = view.Y(lr.y), w = lr.w * view.s, h = lr.h * view.s;
    const lab = sheet.fitLabel(it.name, w, h, { withArea: true, max: 16 });
    if (lab) {
      const lh = lab.fs * 1.16, afs = Math.max(8, lab.fs * 0.82);
      const dim = h > 78 && w > 70;
      const bh = lab.lines.length * lh + afs + (dim ? afs : 0);
      const ty = y + h / 2 - bh / 2 + lab.fs * 0.84;
      lab.lines.forEach((ln, i) => P.push({ t: 'text', x: x + w / 2, y: ty + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: z.text, anchor: 'middle', ls: lab.ls }));
      P.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1, s: fmt(it.area) + ' m²' + (view.lvTag ? ' · ' + lvLabel(it) : ''), size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.78 });
      if (dim) P.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1 + afs, s: fmt(it.w, 1) + ' × ' + fmt(it.h, 1), size: afs - 0.5, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.55 });
    } else if (w > 24 && h > 16) {
      P.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 3.5, s: fmt(it.area, 0), size: 10, weight: 700, fam: 'b', fill: z.text, anchor: 'middle', opacity: 0.85 });
    }
    return P;
  }

  function gridPrims(view, C) {
    const P = [];
    const a = view.area, s = view.s, w = view.win;
    const minor = s >= 11 ? 1 : 0;
    const major = s >= 4.5 ? 5 : 10;
    const x0 = Math.ceil(w.x0), x1 = Math.floor(w.x0 + w.w), y0 = Math.ceil(w.y0), y1 = Math.floor(w.y0 + w.h);
    for (let x = x0; x <= x1; x++) {
      const isMaj = x % major === 0;
      if (!isMaj && !minor) continue;
      const px = view.X(x);
      if (px < a.x + 2 || px > a.x + a.w - 2) continue;
      P.push({ t: 'line', x1: px, y1: a.y + 2, x2: px, y2: a.y + a.h - 2, stroke: C.ink, sw: isMaj ? 0.9 : 0.6, opacity: isMaj ? 0.13 : 0.06 });
      if (isMaj) P.push({ t: 'text', x: px + 3, y: a.y + a.h - 6, s: String(x), size: 10, weight: 500, fam: 'm', fill: C.ink, opacity: 0.35 });
    }
    for (let y = y0; y <= y1; y++) {
      const isMaj = y % major === 0;
      if (!isMaj && !minor) continue;
      const py = view.Y(y);
      if (py < a.y + 2 || py > a.y + a.h - 2) continue;
      P.push({ t: 'line', x1: a.x + 2, y1: py, x2: a.x + a.w - 2, y2: py, stroke: C.ink, sw: isMaj ? 0.9 : 0.6, opacity: isMaj ? 0.13 : 0.06 });
      if (isMaj && py < a.y + a.h - 18) P.push({ t: 'text', x: a.x + 5, y: py - 3, s: String(y), size: 10, weight: 500, fam: 'm', fill: C.ink, opacity: 0.35 });
    }
    return P;
  }

  function scaleBar(view, C) {
    const P = [];
    const a = view.area;
    const m = view.s * 5 > 90 ? 5 : view.s * 10 > 90 ? 10 : 20;
    const len = m * view.s;
    const x1 = a.x + a.w - 22, x0 = x1 - len, y = a.y + 22;
    const st0 = { stroke: C.ink, sw: 2, opacity: 0.7 };
    P.push(Object.assign({ t: 'line', x1: x0, y1: y, x2: x1, y2: y }, st0));
    P.push(Object.assign({ t: 'line', x1: x0, y1: y - 5, x2: x0, y2: y + 5 }, st0));
    P.push(Object.assign({ t: 'line', x1: x1, y1: y - 5, x2: x1, y2: y + 5 }, st0));
    P.push({ t: 'text', x: (x0 + x1) / 2, y: y - 9, s: m + ' m', size: 11.5, weight: 700, fam: 'm', fill: C.ink, opacity: 0.7, anchor: 'middle' });
    return P;
  }

  function footprintDims(fd, C, view) {
    const P = [];
    const b = fd.bounds;
    const X = view.X, Y = view.Y;
    const dl = { stroke: C.ink, sw: 1, opacity: 0.4 };
    const by = Y(b.y1) + 16, lx = X(b.x0) - 16;
    const a = view.area;
    if (by < a.y + a.h - 22) {
      P.push(Object.assign({ t: 'line', x1: X(b.x0), y1: by, x2: X(b.x1), y2: by }, dl));
      P.push(Object.assign({ t: 'line', x1: X(b.x0), y1: by - 4, x2: X(b.x0), y2: by + 4 }, dl));
      P.push(Object.assign({ t: 'line', x1: X(b.x1), y1: by - 4, x2: X(b.x1), y2: by + 4 }, dl));
      P.push({ t: 'text', x: (X(b.x0) + X(b.x1)) / 2, y: by + 14, s: sheet.dimText(b.w), size: 12, weight: 600, fam: C.g ? 'b' : 'm', fill: C.ink, opacity: 0.6, anchor: 'middle' });
    }
    if (lx > a.x + 22) {
      P.push(Object.assign({ t: 'line', x1: lx, y1: Y(b.y0), x2: lx, y2: Y(b.y1) }, dl));
      P.push(Object.assign({ t: 'line', x1: lx - 4, y1: Y(b.y0), x2: lx + 4, y2: Y(b.y0) }, dl));
      P.push(Object.assign({ t: 'line', x1: lx - 4, y1: Y(b.y1), x2: lx + 4, y2: Y(b.y1) }, dl));
      P.push({ t: 'text', x: lx - 6, y: (Y(b.y0) + Y(b.y1)) / 2, s: sheet.dimText(b.h), size: 12, weight: 600, fam: C.g ? 'b' : 'm', fill: C.ink, opacity: 0.6, anchor: 'middle', xf: [0, -1, 1, 0] });
    }
    return P;
  }

  /* kat süzgeci: lv 'all' ya da kat numarası. Süzgeçte olmayan mekânlar hayalet çizilir */
  const levelFilter = (lv) => (lv == null || lv === 'all' ? null : (it) => !(it.lv <= lv && it.top >= lv));

  /* çevre: üretilmiş gri yapılar (parsel çevresinde) ya da vaziyet planı */
  function ctxPrims(project, fd, C, view, o, items) {
    const free = project.study.free;
    const org = free.org || [0, 0];
    let mode = (free.ctx && free.ctx.mode) || 'auto';
    const hasPlan = !!(App.plan && project.plan && project.plan.els && project.plan.els.length);
    if (mode === 'auto') mode = free.link && hasPlan ? 'plan' : fd.siteRing ? 'gen' : 'off';
    if (mode === 'plan' && hasPlan) {
      App.plan.ctxPrims(project.plan, { X: (wx) => view.X(wx - org[0]), Y: (wy) => view.Y(wy - org[1]), ppm: view.s, skip: free.link ? free.link.elId : null, win: { x0: view.win.x0 + org[0], y0: view.win.y0 + org[1], x1: view.win.x0 + view.win.w + org[0], y1: view.win.y0 + view.win.h + org[1] } }).forEach((p) => items.push(p));
    } else if (mode === 'gen' && free.site && free.site.on && App.massing) {
      const site = free.site;
      const w = { x0: view.win.x0, y0: view.win.y0, x1: view.win.x0 + view.win.w, y1: view.win.y0 + view.win.h };
      App.massing.genCtx({ w: site.w, d: site.d }, (free.ctx && free.ctx.seed) || 3, free.ctx && free.ctx.dens != null ? free.ctx.dens : 0.7).forEach((c) => {
        const x = c.x + site.x, y = c.y + site.y;
        if (x > w.x1 || x + c.w < w.x0 || y > w.y1 || y + c.d < w.y0) return;
        items.push({ t: 'rect', x: view.X(x), y: view.Y(y), w: c.w * view.s, h: c.d * view.s, fill: C.ctx, stroke: C.ctxEdge, sw: 1, opacity: 0.95 });
      });
    }
  }

  /* opts: { live, frozen (pencere), cam, chips, lv ('all' | kat), furn (donatı göster), sel (seçili mekân) } */
  function scene(project, fd, opts) {
    opts = opts || {};
    const C = colors();
    const free = project.study.free;
    const view = freeView(fd, opts.frozen, opts.cam);
    view.chips = opts.chips !== false;
    const gh = levelFilter(opts.lv);
    view.ghost = gh;
    view.vis = gh ? (it) => !gh(it) : null;
    view.lvTag = fd.metrics.usedLevels;
    const m = fd.metrics;
    const zones = [];
    project.spaces.forEach((sp) => { if (zones.indexOf(sp.zone) < 0) zones.push(sp.zone); });
    const lineLg = (label, stroke, sw, dash) => ({ label: label, line: { stroke: stroke, sw: sw, dash: dash, cap: 'round' } });
    const legend = sheet.zoneLegend(zones).slice(0, 5).concat([lineLg('Güçlü ilişki', C.rel, 3), lineLg('Ayrı tut', C.bad, 2, [1.5, 5])]);
    if (fd.extras.some((e) => e.t === 'green')) legend.push({ label: 'Yeşil alan', fill: C.green });
    const stats = m.siteArea
      ? [['Parsel', fmt(m.siteArea) + ' m²'], ['TAKS / KAKS', fmt(m.taks, 2) + ' / ' + fmt(m.kaks, 2)], ['Toplam alan', fmt(m.total) + ' m²']]
      : [['Mekân', String(fd.items.length)], ['Toplam alan', fmt(m.total) + ' m²'], ['Kaplama', fmt(fd.bounds.w, 1) + ' × ' + fmt(fd.bounds.h, 1) + ' m']];
    const lvTxt = opts.lv != null && opts.lv !== 'all' ? ' · ' + (opts.lv === 0 ? 'zemin kat' : opts.lv + '. kat') : (m.usedLevels ? ' · ' + m.levels + ' kat' : '');
    const info = {
      name: project.meta.name,
      subtitle: 'Mekân etüdü · ' + fd.items.length + ' mekân' + lvTxt,
      legend: legend.slice(0, 8),
      stats: stats,
      scoreLabel: 'Düzen skoru', percent: m.score,
    };
    const prims = sheet.frame(info, opts.live !== false);
    const a = view.area;
    const items = [];
    items.push({ t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: C.panel });
    // harita altlığı
    let bmAttr = '';
    const org = free.org || [0, 0];
    if (free.map && free.map.on) {
      const loc = opts.loc || App.basemap.loc(project);
      const r = App.basemap.prims({ loc: loc, cfg: free.map, ppm: view.s, win: { x0: view.win.x0 + org[0], y0: view.win.y0 + org[1], x1: view.win.x0 + view.win.w + org[0], y1: view.win.y0 + view.win.h + org[1] }, X: (wx) => view.X(wx - org[0]), Y: (wy) => view.Y(wy - org[1]) });
      r.prims.forEach((q) => items.push(q));
      bmAttr = r.attrib;
    }
    if (opts.grid !== false) gridPrims(view, C).forEach((p) => items.push(p));
    ctxPrims(project, fd, C, view, opts, items);
    // parsel
    if (fd.siteRing) {
      items.push({ t: 'poly', pts: fd.siteRing.map((q) => [view.X(q[0]), view.Y(q[1])]), fill: C.parcel, opacity: free.map && free.map.on ? 0.25 : 0.7 });
      items.push({ t: 'poly', pts: fd.siteRing.map((q) => [view.X(q[0]), view.Y(q[1])]), stroke: C.ink, sw: 1.7, dash: [9, 6] });
    }
    // yapı kabuğu (vaziyet planındaki yapı)
    if (fd.shell) {
      const sp = fd.shell.map((q) => [view.X(q[0]), view.Y(q[1])]);
      items.push({ t: 'poly', pts: sp, fill: C.shell, opacity: 0.07 });
      items.push({ t: 'poly', pts: sp, stroke: C.shell, sw: 3.4 });
    }
    // zemin düzeyi: yeşil, boşluk
    fd.extras.filter((e) => e.t === 'green').forEach((e) => items.push({ t: 'poly', pts: st.extraRing(e).map((q) => [view.X(q[0]), view.Y(q[1])]), fill: C.green, stroke: C.greenDk, sw: 1.4, opacity: 0.9 }));
    fd.extras.filter((e) => e.t === 'void').forEach((e) => {
      items.push({ t: 'rect', x: view.X(e.x), y: view.Y(e.y), w: e.w * view.s, h: e.h * view.s, fill: C.voidF, stroke: C.ink, sw: 1.6, dash: [3, 5], opacity: 0.95 });
      if (e.w * view.s > 60 && e.h * view.s > 30) items.push({ t: 'text', x: view.X(e.x + e.w / 2), y: view.Y(e.y + e.h / 2) + 4, s: 'Boşluk', size: 11, weight: 600, fam: 'b', fill: C.ink, opacity: 0.45, anchor: 'middle', pe: false });
    });
    // mekânlar: alt katlar önce, büyükler önce
    const sorted = fd.items.slice().sort((p, q) => p.lv - q.lv || q.area - p.area);
    sorted.forEach((it) => itemPrims(it, C, view).forEach((p) => items.push(p)));
    // donatı
    if (opts.furn !== false && view.s >= 7) {
      sorted.forEach((it) => {
        if (!it.furn.length || (gh && gh(it))) return;
        st.furnPrims(it.furn, { ox: it.x, oy: it.y, X: view.X, Y: view.Y, s: view.s, fill: C.fFill, stroke: C.ink, soft: C.fSoft, sw: view.s >= 18 ? 1 : 0.8, opacity: 0.92, hi: opts.furnHi }).forEach((p) => items.push(p));
      });
    }
    // çakışmalar
    fd.overlaps.forEach((o) => {
      const A = fd.byId.get(o.a), B = fd.byId.get(o.b);
      if (view.vis && (!view.vis(A) || !view.vis(B))) return;
      const x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w), y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
      if (x1 > x0 && y1 > y0) items.push({ t: 'rect', x: view.X(x0), y: view.Y(y0), w: (x1 - x0) * view.s, h: (y1 - y0) * view.s, fill: C.over, stroke: C.bad, sw: 1.6, dash: [5, 4] });
    });
    if (opts.rel !== false) relationPrims(fd, C, view).forEach((p) => items.push(p));
    // ağaçlar ve oklar
    fd.extras.filter((e) => e.t === 'tree').forEach((e) => {
      items.push({ t: 'circle', cx: view.X(e.x), cy: view.Y(e.y), r: Math.max(2.5, e.r * view.s), fill: C.green, stroke: C.greenDk, sw: 1, opacity: 0.8 });
      items.push({ t: 'circle', cx: view.X(e.x), cy: view.Y(e.y), r: 1.4, fill: C.ink, opacity: 0.6 });
    });
    fd.extras.filter((e) => e.t === 'arrow').forEach((e) => arrowPrims(e.k, view.X(e.x1), view.Y(e.y1), view.X(e.x2), view.Y(e.y2), C, 1).forEach((p) => items.push(p)));
    sorted.forEach((it) => labelPrims(it, C, view).forEach((p) => items.push(p)));
    // parsel ve kabuk yazıları
    if (fd.siteRing && fd.siteRing.length === 4 && !free.site.pts) {
      const s0 = free.site;
      items.push({ t: 'text', x: view.X(s0.x + s0.w / 2), y: view.Y(s0.y + s0.d) + 17, s: 'Parsel ' + fmt(s0.w, 1) + ' × ' + fmt(s0.d, 1) + ' m', size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.62, anchor: 'middle' });
    }
    if (fd.shell && free.link) {
      const bx = fd.shell.reduce((q, p) => Math.min(q, p[0]), Infinity), by = fd.shell.reduce((q, p) => Math.min(q, p[1]), Infinity);
      items.push({ t: 'text', x: view.X(bx), y: view.Y(by) - 8, s: free.link.name + ' · yapı kabuğu · ' + free.link.floors + ' kat', size: 12, weight: 700, fam: 'b', fill: C.shell, opacity: 0.9 });
    }
    if (!free.site || !free.site.on) footprintDims(fd, C, view).forEach((p) => items.push(p));
    prims.push(C.g
      ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, fill: C.panel, stroke: C.panelStroke, sw: 1 }
      : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: C.panel, stroke: C.ink, sw: 4 });
    prims.push({ t: 'g', clip: { id: 'etut-area', x: a.x, y: a.y, w: a.w, h: a.h }, items: items });
    prims.push(C.g
      ? { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, rx: 8, stroke: C.panelStroke, sw: 1 }
      : { t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, stroke: C.ink, sw: 4 });
    scaleBar(view, C).forEach((p) => prims.push(p));
    if (bmAttr) prims.push({ t: 'text', x: a.x + a.w - 10, y: a.y + a.h - 8, s: bmAttr, size: 10.5, weight: 600, fam: 'm', fill: C.ink, opacity: 0.7, anchor: 'end' });
    return { prims: prims, view: view };
  }

  st.freeView = freeView;
  st.freeScene = scene;
  st.freeExitPoint = exitPoint;
  st.freeLabelRect = labelRect;
  st.arrowPrims = arrowPrims;
  st.freeColors = colors;
  st.freeViewBounds = viewBounds;
  st.lvLabel = lvLabel;
})();
