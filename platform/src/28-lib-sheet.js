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
    let name = String(info.name || 'Adsız proje');
    const fs = name.length > 26 ? 18 : name.length > 20 ? 22 : 27;
    const maxCh = Math.floor(500 / (fs * 0.82));
    if (name.length > maxCh) name = name.slice(0, maxCh - 1) + '…';
    const x0 = tb.x + 36;
    P.push({ t: 'text', x: x0, y: tb.y + 56, s: name, size: fs, weight: 400, fam: 'd', fill: ink });
    P.push({ t: 'text', x: x0, y: tb.y + 84, s: info.subtitle || '', size: 15, weight: 600, fam: 'b', fill: ink, opacity: 0.5 });
    // gösterge (bölge renkleri): iki sütun
    const lg = (info.legend || []).slice(0, 8);
    lg.forEach((it, i) => {
      const col = i < 4 ? 0 : 1, row = i % 4;
      const x = 560 + col * 215, y = tb.y + 29 + row * 21;
      P.push({ t: 'circle', cx: x, cy: y - 4.5, r: 6.5, fill: it.fill, stroke: 'rgba(23,24,27,.28)', sw: 1.2 });
      P.push({ t: 'text', x: x + 16, y: y, s: it.label, size: 13, weight: 600, fam: 'b', fill: ink, opacity: 0.82 });
    });
    // istatistik
    const sx = 1000, ex = 1170;
    (info.stats || []).slice(0, 3).forEach((r, i) => {
      const y = tb.y + 40 + i * 25;
      P.push({ t: 'text', x: sx, y: y, s: r[0], size: 13, weight: 500, fam: 'b', fill: ink, opacity: 0.5 });
      P.push({ t: 'text', x: ex, y: y, s: r[1], size: 15, weight: 700, fam: 'b', fill: ink, anchor: 'end' });
    });
    const rx = tb.x + tb.w - 36;
    P.push({ t: 'text', x: rx, y: tb.y + 36, s: info.scoreLabel || 'Skor', size: 13, weight: 600, fam: 'b', fill: ink, opacity: 0.5, anchor: 'end' });
    P.push({ t: 'text', x: rx, y: tb.y + 84, s: info.percent == null ? '—' : '%' + info.percent, size: 50, weight: 300, fam: 'd', fill: ink, anchor: 'end' });
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
    const xs = [tb.x + tb.h, 700, 1000, 1190];
    xs.forEach((x) => P.push({ t: 'line', x1: x, y1: tb.y, x2: x, y2: tb.y + tb.h, stroke: PAL.ink, sw: 4 }));
    let name = String(info.name || 'Adsız proje').toLocaleUpperCase('tr');
    const fs = name.length > 26 ? 24 : name.length > 20 ? 30 : 36;
    const maxCh = Math.floor(540 / (fs * 0.66));
    if (name.length > maxCh) name = name.slice(0, maxCh - 1) + '…';
    P.push({ t: 'text', x: xs[0] + 22, y: tb.y + 54, s: name, size: fs, weight: 700, fam: 'd', fill: PAL.ink, ls: 1 });
    P.push({ t: 'text', x: xs[0] + 22, y: tb.y + 84, s: String(info.subtitle || '').toLocaleUpperCase('tr'), size: 15, weight: 600, fam: 'b', fill: PAL.ink, ls: 2.5, opacity: 0.8 });
    (info.legend || []).slice(0, 8).forEach((it, i) => {
      const col = i < 4 ? 0 : 1, row = i % 4;
      const x = xs[1] + 20 + col * 140, y = tb.y + 26 + row * 22;
      P.push({ t: 'rect', x: x, y: y - 12, w: 14, h: 14, fill: it.fill, stroke: PAL.ink, sw: 2 });
      P.push({ t: 'text', x: x + 22, y: y, s: String(it.label).toLocaleUpperCase('tr'), size: 11.5, weight: 600, fam: 'b', fill: PAL.ink, ls: 1 });
    });
    const sx = xs[2] + 20, ex = xs[3] - 20;
    (info.stats || []).slice(0, 3).forEach((r, i) => {
      const y = tb.y + 34 + i * 28;
      P.push({ t: 'text', x: sx, y: y, s: String(r[0]).toLocaleUpperCase('tr'), size: 12, weight: 500, fam: 'm', fill: PAL.ink, ls: 1.5, opacity: 0.7 });
      P.push({ t: 'text', x: ex, y: y, s: r[1], size: 17, weight: 700, fam: 'd', fill: PAL.ink, anchor: 'end' });
    });
    const pc = info.percent;
    const bg = pc == null ? PAL.paperDark : pc >= 70 ? PAL.green : pc >= 40 ? PAL.yellow : PAL.red;
    const fg = pc == null ? PAL.ink : pc >= 70 ? PAL.paper : pc >= 40 ? PAL.ink : PAL.paper;
    P.push({ t: 'rect', x: xs[3], y: tb.y, w: tb.x + tb.w - xs[3], h: tb.h, fill: bg });
    P.push({ t: 'text', x: xs[3] + 20, y: tb.y + 30, s: String(info.scoreLabel || 'Skor').toLocaleUpperCase('tr'), size: 13, weight: 500, fam: 'm', fill: fg, ls: 2 });
    P.push({ t: 'text', x: xs[3] + 20, y: tb.y + 88, s: pc == null ? '—' : '%' + pc, size: 58, weight: 700, fam: 'd', fill: fg });
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
