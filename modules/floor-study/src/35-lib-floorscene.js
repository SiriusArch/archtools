/* ==========================================================================
   35-lib-floorscene.js — kat etüdü paftası: kat planları yan yana (primitifler)
   Canlı SVG ve PNG/PDF çıktısı aynı listeden çizilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const sheet = App.sheet;
  const fmt = App.util.fmt;

  const HEAD = 46, DIM = 28, LEFT = 36;

  /* kat planlarının pafta üzerindeki yerleşimi (arayüz de bunu kullanır) */
  function boardLayout(plan) {
    const n = plan.floors.length;
    const tb = sheet.tb;
    const area = { x: 64, y: 54, w: sheet.W - 128, h: tb.y - 54 - 22 };
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const gx = 52, gy = 26;
      const cellW = (area.w - (cols - 1) * gx) / cols;
      const cellH = (area.h - (rows - 1) * gy) / rows - HEAD - DIM;
      const s = Math.min((cellW - LEFT) / plan.Wp, cellH / plan.Dp);
      if (!best || s > best.s) best = { s: s, cols: cols, rows: rows, gx: gx, gy: gy };
    }
    best.s = Math.max(2, Math.min(best.s, 72));
    const pw = plan.Wp * best.s, ph = plan.Dp * best.s;
    const cw = pw + LEFT, rh = ph + HEAD + DIM;
    const gridW = best.cols * cw + (best.cols - 1) * best.gx;
    const gridH = best.rows * rh + (best.rows - 1) * best.gy;
    const x0 = area.x + (area.w - gridW) / 2, y0 = area.y + (area.h - gridH) / 2;
    best.cells = plan.floors.map((f, i) => {
      const col = i % best.cols, row = Math.floor(i / best.cols);
      const cx = x0 + col * (cw + best.gx), cy = y0 + row * (rh + best.gy);
      return { id: f.id, index: i, cx: cx, cy: cy, cw: cw, rh: rh, ox: cx + LEFT, oy: cy + HEAD, pw: pw, ph: ph };
    });
    return best;
  }

  const glass = () => App.theme.name === 'glass';

  function floorPrims(f, cell, L, plan) {
    const P = [];
    const PAL = App.PAL;
    const ink = PAL.ink;
    const s = L.s;
    const g = glass();
    // başlık
    P.push({ t: 'text', x: cell.ox, y: cell.cy + 24, s: g ? f.name : f.name.toLocaleUpperCase('tr'), size: g ? 16 : 17, weight: g ? 400 : 700, fam: 'd', fill: ink, ls: g ? 0 : 1 });
    P.push({ t: 'text', x: cell.ox + cell.pw, y: cell.cy + 24, s: fmt(f.net) + ' m² net', size: 13, weight: 600, fam: g ? 'b' : 'm', fill: ink, opacity: 0.6, anchor: 'end' });
    P.push({ t: 'text', x: cell.ox, y: cell.cy + 40, s: f.spaces.length + ' mekân' + (f.void > 0.5 ? ' · boş ' + fmt(f.void) + ' m²' : ''), size: 12, weight: 500, fam: g ? 'b' : 'm', fill: ink, opacity: 0.5 });
    // plak
    if (g) P.push({ t: 'rect', x: cell.ox - 3, y: cell.oy - 3, w: cell.pw + 6, h: cell.ph + 6, rx: 8, fill: '#EDEEF2', stroke: 'rgba(23,24,27,.16)', sw: 1 });
    else P.push({ t: 'rect', x: cell.ox - 3, y: cell.oy - 3, w: cell.pw + 6, h: cell.ph + 6, fill: PAL.paperDark, stroke: ink, sw: 4 });
    f.blocks.forEach((b) => {
      const x = cell.ox + b.x * s, y = cell.oy + b.y * s, w = b.w * s, h = b.h * s;
      const z = App.ZONES[b.zone] || App.ZONES.sosyal;
      if (b.kind === 'void') {
        P.push({ t: 'rect', x: x + 2, y: y + 2, w: Math.max(0, w - 4), h: Math.max(0, h - 4), stroke: ink, sw: 1.4, dash: [6, 6], opacity: 0.35 });
        if (w > 70 && h > 30) P.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 4, s: 'Boş / teras', size: 12, weight: 600, fam: g ? 'b' : 'm', fill: ink, opacity: 0.45, anchor: 'middle' });
        return;
      }
      if (b.kind === 'core') {
        P.push({ t: 'rect', x: x, y: y, w: w, h: h, rx: g ? 5 : 0, fill: g ? '#2A2B30' : ink, stroke: g ? '#F6F7F9' : ink, sw: g ? 2 : 3 });
        const c = g ? '#F6F7F9' : PAL.paper;
        for (let k = 1; k < 4; k++) P.push({ t: 'line', x1: x + 4, y1: y + (h * k) / 4, x2: x + w - 4, y2: y + (h * k) / 4, stroke: c, sw: 1, opacity: 0.28 });
        if (w > 28) P.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 4, s: 'Çekirdek', size: 11, weight: 700, fam: g ? 'b' : 'm', fill: c, anchor: 'middle', xf: [0, -1, 1, 0] });
        return;
      }
      if (b.kind === 'corridor') {
        P.push({ t: 'rect', x: x, y: y, w: w, h: h, fill: g ? 'rgba(23,24,27,.06)' : PAL.paper, stroke: g ? undefined : ink, sw: 2 });
        P.push({ t: 'line', x1: x + 6, y1: y + h / 2, x2: x + w - 6, y2: y + h / 2, stroke: ink, sw: 1.4, dash: [7, 6], opacity: 0.4 });
        if (w > 90) P.push({ t: 'text', x: x + w / 2, y: y + h / 2 - 4, s: 'Koridor', size: 11, weight: 600, fam: g ? 'b' : 'm', fill: ink, opacity: 0.5, anchor: 'middle' });
        return;
      }
      P.push({ t: 'rect', x: x, y: y, w: w, h: h, rx: g ? 4 : 0, fill: z.fill, stroke: g ? '#F6F7F9' : ink, sw: g ? 2.4 : 3 });
      const lab = sheet.fitLabel(b.name, w, h, { withArea: true, max: 16 });
      if (lab) {
        const lh = lab.fs * 1.16, afs = Math.max(8, lab.fs * 0.82);
        const bh = lab.lines.length * lh + afs;
        let ty = y + h / 2 - bh / 2 + lab.fs * 0.84;
        lab.lines.forEach((ln, i) => P.push({ t: 'text', x: x + w / 2, y: ty + i * lh, s: ln, size: lab.fs, weight: 700, fam: 'l', fill: z.text, anchor: 'middle', ls: lab.ls }));
        P.push({ t: 'text', x: x + w / 2, y: ty + lab.lines.length * lh + 1, s: fmt(b.area) + ' m²', size: afs, weight: 500, fam: 'm', fill: z.text, anchor: 'middle', opacity: 0.75 });
      } else if (w > 26 && h > 18) {
        P.push({ t: 'text', x: x + w / 2, y: y + h / 2 + 3.5, s: fmt(b.area, 0), size: 10, weight: 700, fam: 'b', fill: z.text, anchor: 'middle', opacity: 0.8 });
      }
    });
    // ölçü çizgileri
    const by = cell.oy + cell.ph + 14, lx = cell.ox - 16;
    const dl = { stroke: ink, sw: 1, opacity: 0.35 };
    P.push(Object.assign({ t: 'line', x1: cell.ox, y1: by, x2: cell.ox + cell.pw, y2: by }, dl));
    P.push(Object.assign({ t: 'line', x1: cell.ox, y1: by - 4, x2: cell.ox, y2: by + 4 }, dl));
    P.push(Object.assign({ t: 'line', x1: cell.ox + cell.pw, y1: by - 4, x2: cell.ox + cell.pw, y2: by + 4 }, dl));
    P.push({ t: 'text', x: cell.ox + cell.pw / 2, y: by + 14, s: sheet.dimText(plan.Wp), size: 12, weight: 600, fam: g ? 'b' : 'm', fill: ink, opacity: 0.55, anchor: 'middle' });
    P.push(Object.assign({ t: 'line', x1: lx, y1: cell.oy, x2: lx, y2: cell.oy + cell.ph }, dl));
    P.push(Object.assign({ t: 'line', x1: lx - 4, y1: cell.oy, x2: lx + 4, y2: cell.oy }, dl));
    P.push(Object.assign({ t: 'line', x1: lx - 4, y1: cell.oy + cell.ph, x2: lx + 4, y2: cell.oy + cell.ph }, dl));
    P.push({ t: 'text', x: lx - 6, y: cell.oy + cell.ph / 2, s: sheet.dimText(plan.Dp), size: 12, weight: 600, fam: g ? 'b' : 'm', fill: ink, opacity: 0.55, anchor: 'middle', xf: [0, -1, 1, 0] });
    return P;
  }

  const TYP = { serbest: 'Serbest yerleşim', koridor: 'Orta koridorlu' };

  function scene(project, d, live) {
    const plan = d.plan, m = d.metrics;
    const L = boardLayout(plan);
    const zones = [];
    project.spaces.forEach((s) => { if (zones.indexOf(s.zone) < 0) zones.push(s.zone); });
    const info = {
      name: project.meta.name,
      subtitle: 'Kat etüdü · ' + plan.floors.length + ' kat · ' + TYP[plan.typology],
      legend: sheet.zoneLegend(zones),
      stats: [['Kat', String(plan.floors.length)], ['Net toplam', fmt(m.totalNet) + ' m²'], ['Plak', fmt(plan.Wp, 1) + ' × ' + fmt(plan.Dp, 1) + ' m']],
      scoreLabel: 'Kat skoru', percent: m.score,
    };
    const prims = sheet.frame(info, live);
    plan.floors.forEach((f, i) => floorPrims(f, L.cells[i], L, plan).forEach((p) => prims.push(p)));
    return { prims: prims, L: L };
  }

  App.study.boardLayout = boardLayout;
  App.study.scene = scene;
  App.study.TYPOLOGY = TYP;
})();
