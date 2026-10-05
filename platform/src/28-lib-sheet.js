/* ==========================================================================
   28-lib-sheet.js — ortak pafta çerçevesi ve etiket sığdırma (Modül 2 ve 3 kullanır)
   Çerçeve: levha + nokta ızgara + künye (başlık, gösterge, istatistik, skor).
   Çıktı primitif listesidir; ekranda SVG, dışa aktarmada Canvas aynı listeden çizilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const PAL = App.PAL;
  const geo = App.geo;
  const fmt = App.util.fmt;

  const sheet = (App.sheet = { W: geo.W, H: geo.H, F: geo.FRAME, tb: geo.titleBlock });

  /* ---------- etiket sığdırma: kutuya (px) ad satırları + boyut ---------- */
  sheet.fitLabel = function (name, w, h, o) {
    o = o || {};
    const T = App.theme.cur().label;
    const text = T.upper ? String(name || '').toLocaleUpperCase('tr') : String(name || '');
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const extra = o.withArea ? 1 : 0;
    const maxFs = Math.min(o.max || 17, h * 0.34);
    for (let fs = maxFs; fs >= (o.min || 8); fs -= 0.5) {
      const cap = Math.max(2, Math.floor((w * 0.92) / (fs * T.cw)));
      const lines = [];
      let cur = '', ok = true;
      for (let i = 0; i < words.length; i++) {
        const wd = words[i];
        if (wd.length > cap) { ok = false; break; }
        const next = cur ? cur + ' ' + wd : wd;
        if (next.length <= cap) cur = next; else { lines.push(cur); cur = wd; }
      }
      if (!ok) continue;
      if (cur) lines.push(cur);
      const need = lines.length * fs * 1.16 + extra * fs * 0.95;
      if (need <= h * 0.9) return { lines: lines, fs: fs, ls: T.upper ? 0.4 : 0 };
    }
    return null;
  };

  sheet.dimText = (m) => fmt(m, m < 10 ? 2 : 1) + ' m';

  /* ---------- metin ölçümü: sabit sütun yerine gerçek genişliğe göre yerleşim ---------- */
  let _cx = null;
  sheet.tw = function (s, size, weight, fam, ls) {
    s = String(s == null ? '' : s);
    let w;
    try {
      if (!_cx) _cx = document.createElement('canvas').getContext('2d');
      _cx.font = (weight || 400) + ' ' + size + 'px ' + App.FONTS[fam || 'b'];
      w = _cx.measureText(s).width;
    } catch (e) { w = s.length * size * 0.6; }
    return w + (ls || 0) * s.length;
  };
  // Sığmayan metni "…" ile kısalt
  sheet.clip = function (s, maxW, size, weight, fam, ls) {
    s = String(s == null ? '' : s);
    if (sheet.tw(s, size, weight, fam, ls) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (sheet.tw(s.slice(0, mid).trimEnd() + '…', size, weight, fam, ls) <= maxW) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, lo).trimEnd() + '…';
  };
  // Tek satır: boyutu küçülterek sığdır, olmazsa kısalt → { s, size }
  sheet.fitLine = function (s, maxW, size, min, weight, fam, ls) {
    s = String(s == null ? '' : s);
    for (let fs = size; fs >= min; fs -= 0.5) if (sheet.tw(s, fs, weight, fam, ls) <= maxW) return { s: s, size: fs };
    return { s: sheet.clip(s, maxW, min, weight, fam, ls), size: min };
  };
  // İki satıra dengeli böl (kelime sınırında); büyükten küçüğe boyut dene → { lines, size } | null
  sheet.wrap2 = function (s, maxW, size, min, weight, fam, ls) {
    const words = String(s || '').split(/\s+/).filter(Boolean);
    for (let fs = size; fs >= min; fs -= 0.5) {
      let best = null, bw = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const m = Math.max(sheet.tw(a, fs, weight, fam, ls), sheet.tw(b, fs, weight, fam, ls));
        if (m <= maxW && m < bw) { bw = m; best = [a, b]; }
      }
      if (best) return { lines: best, size: fs };
    }
    return null;
  };

  /* Künye yerleşimi (iki tema ortak): sağdan sola ölçerek bloklar arasına boşluk bırakır.
     th: temaya göre yazı özellikleri; sonuç: sütun konumları ve gösterge/istatistik ölçüleri. */
  function measureBlocks(info, th) {
    const stats = (info.stats || []).slice(0, 3);
    const lg = (info.legend || []).slice(0, 8);
    const rows = Math.min(4, lg.length);
    const cols = lg.length > 4 ? 2 : (lg.length ? 1 : 0);
    const colW = [0, 0];
    lg.forEach((it, i) => {
      const c = i < 4 ? 0 : 1;
      const lab = th.up ? String(it.label).toLocaleUpperCase('tr') : String(it.label);
      const sw = it.line ? th.lineW : th.swW;
      it._lab = lab; it._sw = sw;
      colW[c] = Math.max(colW[c], sw + th.swGap + sheet.tw(lab, th.lg.size, th.lg.weight, th.lg.fam, th.lg.ls));
    });
    const legW = cols ? colW[0] + (cols === 2 ? th.colGap + colW[1] : 0) : 0;
    let lw = 0, vw = 0;
    stats.forEach((r) => {
      const l = th.up ? String(r[0]).toLocaleUpperCase('tr') : String(r[0]);
      r._l = l;
      lw = Math.max(lw, sheet.tw(l, th.sl.size, th.sl.weight, th.sl.fam, th.sl.ls));
      vw = Math.max(vw, sheet.tw(r[1], th.sv.size, th.sv.weight, th.sv.fam, 0));
    });
    const stW = stats.length ? lw + th.stGap + vw : 0;
    const pcTxt = info.percent == null ? '—' : '%' + info.percent;
    const scL = th.up ? String(info.scoreLabel || 'Skor').toLocaleUpperCase('tr') : String(info.scoreLabel || 'Skor');
    const scW = Math.max(sheet.tw(pcTxt, th.sc.size, th.sc.weight, th.sc.fam, 0), sheet.tw(scL, th.scl.size, th.scl.weight, th.scl.fam, th.scl.ls));
    return { stats: stats, lg: lg, rows: rows, cols: cols, colW: colW, legW: legW, lw: lw, vw: vw, stW: stW, pcTxt: pcTxt, scL: scL, scW: scW };
  }

  // Ad + alt başlık: verilen genişliğe sığdır (gerekirse alt başlığı iki satıra böl)
  function titleBlock(P, info, x0, w, o) {
    const nm = sheet.fitLine(o.up ? String(info.name || 'Adsız proje').toLocaleUpperCase('tr') : String(info.name || 'Adsız proje'), w, o.nameMax, o.nameMin, o.nameW, 'd', o.nameLs);
    const sub = o.up ? String(info.subtitle || '').toLocaleUpperCase('tr') : String(info.subtitle || '');
    const tb = sheet.tb;
    let one = sheet.fitLine(sub, w, o.subSize, o.subMin, 600, 'b', o.subLs);
    const fits1 = sheet.tw(sub, one.size, 600, 'b', o.subLs) <= w;
    if (!fits1) {
      const two = sheet.wrap2(sub, w, Math.min(o.subSize, 13), o.subMin, 600, 'b', o.subLs);
      if (two) {
        const nf = Math.min(nm.size, 26);
        P.push({ t: 'text', x: x0, y: tb.y + 44, s: sheet.clip(nm.s, w, nf, o.nameW, 'd', o.nameLs), size: nf, weight: o.nameW, fam: 'd', fill: o.ink, ls: o.nameLs });
        two.lines.forEach((ln, i) => P.push({ t: 'text', x: x0, y: tb.y + 68 + i * (two.size + 6), s: ln, size: two.size, weight: 600, fam: 'b', fill: o.ink, ls: o.subLs, opacity: o.subOp }));
        return;
      }
    }
    P.push({ t: 'text', x: x0, y: tb.y + 56, s: nm.s, size: nm.size, weight: o.nameW, fam: 'd', fill: o.ink, ls: o.nameLs });
    P.push({ t: 'text', x: x0, y: tb.y + 84, s: one.s, size: one.size, weight: 600, fam: 'b', fill: o.ink, ls: o.subLs, opacity: o.subOp });
  }

  // Gösterge öğesi çizimi: it.fill (renkli işaret) ya da it.line (çizgi örneği)
  function legendItems(P, m, th, x0, tb) {
    const r = m.rows;
    const first = tb.y + 52 - (r - 1) * th.rowH / 2;
    m.lg.forEach((it, i) => {
      const c = i < 4 ? 0 : 1, row = i % 4;
      const x = x0 + (c ? m.colW[0] + th.colGap : 0);
      const cy = first + row * th.rowH, by = cy + th.lg.size * 0.36;
      if (it.line) {
        const L = it.line;
        P.push({ t: 'line', x1: x, y1: cy, x2: x + th.lineW, y2: cy, stroke: L.stroke, sw: L.sw, dash: L.dash, cap: L.cap, opacity: L.opacity });
        if (L.inner) P.push({ t: 'line', x1: x, y1: cy, x2: x + th.lineW, y2: cy, stroke: L.inner.stroke, sw: L.inner.sw });
      } else if (th.round) {
        P.push({ t: 'circle', cx: x + th.swW / 2, cy: cy, r: th.swW / 2, fill: it.fill, stroke: 'rgba(23,24,27,.28)', sw: 1.2 });
      } else {
        P.push({ t: 'rect', x: x, y: cy - th.swW / 2, w: th.swW, h: th.swW, fill: it.fill, stroke: PAL.ink, sw: 2 });
      }
      P.push({ t: 'text', x: x + it._sw + th.swGap, y: by, s: it._lab, size: th.lg.size, weight: th.lg.weight, fam: th.lg.fam, fill: th.ink, ls: th.lg.ls, opacity: th.lgOp });
    });
  }

  function statItems(P, m, th, sx, ex, tb) {
    const n = m.stats.length;
    const first = tb.y + 52 - (n - 1) * th.stH / 2;
    m.stats.forEach((r, i) => {
      const y = first + i * th.stH + th.sv.size * 0.36;
      P.push({ t: 'text', x: sx, y: y, s: r._l, size: th.sl.size, weight: th.sl.weight, fam: th.sl.fam, fill: th.ink, ls: th.sl.ls, opacity: th.slOp });
      P.push({ t: 'text', x: ex, y: y, s: r[1], size: th.sv.size, weight: th.sv.weight, fam: th.sv.fam, fill: th.ink, anchor: 'end' });
    });
  }

  /* ---------- çerçeve ---------- */
  function baseGlass(live) {
    const P = [];
    const W = sheet.W, H = sheet.H, F = sheet.F, tb = sheet.tb, ink = PAL.ink;
    if (!live) P.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#E9EAEE' });
    const fill = live ? 'rgba(249,250,252,.9)' : '#F6F7F9';
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, fill: fill, shadow: { dx: 10, dy: 14, blur: 30, color: 'rgba(46,52,68,.22)', css: 'var(--sheet-lo, rgba(46,52,68,.22))' } });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, fill: fill, shadow: { dx: -8, dy: -8, blur: 20, color: 'rgba(255,255,255,.9)', css: 'var(--sheet-hi, rgba(255,255,255,.9))' } });
    for (let x = F + 50; x < W - F; x += 50) for (let y = F + 50; y < tb.y; y += 50) P.push({ t: 'circle', cx: x, cy: y, r: 1.5, fill: ink, opacity: 0.1 });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, rx: 40, stroke: ink, sw: 1.5, opacity: 0.1 });
    P.push({ t: 'line', x1: tb.x + 30, y1: tb.y, x2: tb.x + tb.w - 30, y2: tb.y, stroke: ink, sw: 1.5, opacity: 0.14 });
    return P;
  }

  function frameGlass(info, live) {
    const P = baseGlass(live);
    const tb = sheet.tb, ink = PAL.ink;
    const th = { ink: ink, up: false, round: true, swW: 13, lineW: 44, swGap: 9, colGap: 26, stGap: 22, rowH: 21, stH: 26, lgOp: 0.82, slOp: 0.5,
      lg: { size: 13, weight: 600, fam: 'b', ls: 0 }, sl: { size: 13, weight: 500, fam: 'b', ls: 0 }, sv: { size: 15, weight: 700, fam: 'b' },
      sc: { size: 50, weight: 300, fam: 'd' }, scl: { size: 13, weight: 600, fam: 'b', ls: 0 } };
    const m = measureBlocks(info, th);
    const GAP = 36;
    const rx = tb.x + tb.w - 36;
    const scX0 = rx - m.scW;
    let edge = scX0 - GAP;
    const stX1 = edge, stX0 = stX1 - m.stW;
    if (m.stW) edge = stX0 - GAP;
    const lgX0 = edge - m.legW;
    if (m.legW) edge = lgX0 - GAP;
    const x0 = tb.x + 36;
    titleBlock(P, info, x0, Math.max(160, edge - x0), { ink: ink, up: false, nameMax: 27, nameMin: 16, nameW: 400, nameLs: 0, subSize: 15, subMin: 12, subLs: 0, subOp: 0.5 });
    legendItems(P, m, th, lgX0, tb);
    statItems(P, m, th, stX0, stX1, tb);
    P.push({ t: 'text', x: rx, y: tb.y + 36, s: m.scL, size: 13, weight: 600, fam: 'b', fill: ink, opacity: 0.5, anchor: 'end' });
    P.push({ t: 'text', x: rx, y: tb.y + 84, s: m.pcTxt, size: 50, weight: 300, fam: 'd', fill: ink, anchor: 'end' });
    return P;
  }

  function frameBauhaus(info, live) {
    const P = [];
    const W = sheet.W, H = sheet.H, F = sheet.F, tb = sheet.tb;
    P.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: PAL.paper });
    for (let x = F + 50; x < W - F; x += 50) P.push({ t: 'line', x1: x, y1: F, x2: x, y2: tb.y, stroke: PAL.ink, sw: 1, opacity: 0.07 });
    for (let y = F + 50; y < tb.y; y += 50) P.push({ t: 'line', x1: F, y1: y, x2: W - F, y2: y, stroke: PAL.ink, sw: 1, opacity: 0.07 });
    P.push({ t: 'rect', x: F, y: F, w: W - F * 2, h: H - F * 2, stroke: PAL.ink, sw: 6 });
    P.push({ t: 'line', x1: F, y1: tb.y, x2: W - F, y2: tb.y, stroke: PAL.ink, sw: 5 });
    P.push({ t: 'rect', x: tb.x, y: tb.y, w: tb.h, h: tb.h, fill: PAL.blue });
    P.push({ t: 'circle', cx: tb.x + 36, cy: tb.y + 36, r: 20, fill: PAL.yellow, stroke: PAL.ink, sw: 3 });
    P.push({ t: 'rect', x: tb.x + 54, y: tb.y + 50, w: 36, h: 36, fill: PAL.red, stroke: PAL.ink, sw: 3 });
    P.push({ t: 'poly', pts: [[tb.x + 14, tb.y + 90], [tb.x + 46, tb.y + 90], [tb.x + 30, tb.y + 58]], fill: PAL.paper, stroke: PAL.ink, sw: 3 });
    const th = { ink: PAL.ink, up: true, round: false, swW: 14, lineW: 54, swGap: 9, colGap: 22, stGap: 26, rowH: 22, stH: 28, lgOp: 1, slOp: 0.7,
      lg: { size: 11.5, weight: 600, fam: 'b', ls: 1 }, sl: { size: 12, weight: 500, fam: 'm', ls: 1.5 }, sv: { size: 17, weight: 700, fam: 'd' },
      sc: { size: 58, weight: 700, fam: 'd' }, scl: { size: 13, weight: 500, fam: 'm', ls: 2 } };
    const m = measureBlocks(info, th);
    const PAD = 20;
    const xs0 = tb.x + tb.h;
    const xs3 = tb.x + tb.w - Math.max(150, m.scW + PAD * 2);
    const xs2 = m.stW ? xs3 - (m.stW + PAD * 2) : xs3;
    const xs1 = m.legW ? xs2 - (m.legW + PAD * 2) : xs2;
    [xs0, xs1, xs2, xs3].forEach((x, i) => { if (i === 0 || i === 3 || (i === 1 && m.legW) || (i === 2 && m.stW)) P.push({ t: 'line', x1: x, y1: tb.y, x2: x, y2: tb.y + tb.h, stroke: PAL.ink, sw: 4 }); });
    titleBlock(P, info, xs0 + 22, Math.max(160, xs1 - xs0 - 44), { ink: PAL.ink, up: true, nameMax: 36, nameMin: 18, nameW: 700, nameLs: 1, subSize: 15, subMin: 11, subLs: 2, subOp: 0.8 });
    legendItems(P, m, th, xs1 + PAD, tb);
    statItems(P, m, th, xs2 + PAD, xs3 - PAD, tb);
    const pc = info.percent;
    const bg = pc == null ? PAL.paperDark : pc >= 70 ? PAL.green : pc >= 40 ? PAL.yellow : PAL.red;
    const fg = pc == null ? PAL.ink : pc >= 70 ? PAL.paper : pc >= 40 ? PAL.ink : PAL.paper;
    P.push({ t: 'rect', x: xs3, y: tb.y, w: tb.x + tb.w - xs3, h: tb.h, fill: bg });
    P.push({ t: 'text', x: xs3 + PAD, y: tb.y + 30, s: m.scL, size: 13, weight: 500, fam: 'm', fill: fg, ls: 2 });
    P.push({ t: 'text', x: xs3 + PAD, y: tb.y + 88, s: m.pcTxt, size: 58, weight: 700, fam: 'd', fill: fg });
    P.push({ t: 'rect', x: tb.x, y: tb.y, w: tb.w, h: tb.h, stroke: PAL.ink, sw: 4 });
    return P;
  }

  sheet.frame = function (info, live) { return App.theme.name === 'glass' ? frameGlass(info, live) : frameBauhaus(info, live); };

  // Bölge göstergesi: yalnızca projede bulunan bölgeler
  sheet.zoneLegend = function (zones) {
    return App.ZONE_ORDER.filter((z) => zones.indexOf(z) >= 0).map((z) => ({ label: App.ZONES[z].label, fill: App.ZONES[z].fill }));
  };

  // Sahneyi (primitifler) PNG / PDF olarak indir
  sheet.exportScene = function (prims, W, H, baseName, kind) {
    const U = App.util;
    if (kind === 'png') return App.board.primsToCanvas(prims, W, H, 2).then((cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), 'image/png'))).then((blob) => App.files.saveBlob(U.slug(baseName) + '.png', blob));
    return App.board.primsToCanvas(prims, W, H, 2.5).then((cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), 'image/jpeg', 0.93)).then((b) => b.arrayBuffer()).then((buf) => App.files.buildPdf(new Uint8Array(buf), cv.width, cv.height, baseName))).then((blob) => App.files.saveBlob(U.slug(baseName) + '.pdf', blob));
  };
})();
