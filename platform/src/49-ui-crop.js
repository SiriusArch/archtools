/* ==========================================================================
   49-ui-crop.js — ortak görsel kırpma düzenleyicisi (Kolaj ve Pafta Şablonu)
   ui.cropEditor({ id, src, w, h, region?{x,y,w,h}, crop:{l,t,r,b}, gray, onlive(crop), oncommit(crop) })
   Kırpma, kaynak görselin her kenarından kesilen oran (0–0.9). Küçük resim üzerinde köşe / kenar
   tutamaçlarını ya da çerçevenin içini sürükleyin; klavyeyle odaklanıp ok tuşlarını kullanın.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  const MIN = 0.06;
  const clean = (c) => {
    const o = c || {};
    const f = (v) => (isFinite(v) ? U.clamp(Math.round(v * 1000) / 1000, 0, 0.9) : 0);
    let l = f(o.l), t = f(o.t), r = f(o.r), b = f(o.b);
    if (l + r > 1 - MIN) { const k = (1 - MIN) / (l + r); l *= k; r *= k; }
    if (t + b > 1 - MIN) { const k = (1 - MIN) / (t + b); t *= k; b *= k; }
    return { l: l, t: t, r: r, b: b };
  };
  ui.cropClean = clean;
  ui.cropIsEmpty = (c) => !c || (!c.l && !c.t && !c.r && !c.b);

  let gest = null;

  function ptOf(e, svg, VW, VH) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x / VW, q.y / VH];
  }

  ui.cropEditor = function (o) {
    const VW = 264;
    const rg = o.region || { x: 0, y: 0, w: o.w, h: o.h };
    const VH = Math.round(U.clamp(VW * (rg.h / Math.max(1, rg.w)), 70, 230));
    const kx = VW / Math.max(1, rg.w), ky = VH / Math.max(1, rg.h);
    const c = clean(o.crop);
    const x0 = c.l * VW, y0 = c.t * VH, x1 = (1 - c.r) * VW, y1 = (1 - c.b) * VH;
    const hs = 12;
    const HANDLES = [['nw', x0, y0, 'nwse-resize'], ['n', (x0 + x1) / 2, y0, 'ns-resize'], ['ne', x1, y0, 'nesw-resize'], ['e', x1, (y0 + y1) / 2, 'ew-resize'], ['se', x1, y1, 'nwse-resize'], ['s', (x0 + x1) / 2, y1, 'ns-resize'], ['sw', x0, y1, 'nesw-resize'], ['w', x0, (y0 + y1) / 2, 'ew-resize']];

    const apply = (e) => {
      const g = gest;
      const p = ptOf(e, g.svg, VW, VH);
      const dx = p[0] - g.p0[0], dy = p[1] - g.p0[1];
      const s = g.c0;
      let l = s.l, t = s.t, r = s.r, b = s.b;
      const hd = g.hd;
      if (hd === 'm') {
        const w = 1 - s.l - s.r, hh = 1 - s.t - s.b;
        l = U.clamp(s.l + dx, 0, 1 - w); r = 1 - w - l;
        t = U.clamp(s.t + dy, 0, 1 - hh); b = 1 - hh - t;
      } else {
        if (hd.indexOf('w') >= 0) l = U.clamp(s.l + dx, 0, 1 - s.r - MIN);
        if (hd.indexOf('e') >= 0) r = U.clamp(s.r - dx, 0, 1 - l - MIN);
        if (hd.indexOf('n') >= 0) t = U.clamp(s.t + dy, 0, 1 - s.b - MIN);
        if (hd.indexOf('s') >= 0) b = U.clamp(s.b - dy, 0, 1 - t - MIN);
      }
      return clean({ l: l, t: t, r: r, b: b });
    };
    const down = (e, hd) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
      gest = { hd: hd, svg: svg, p0: ptOf(e, svg, VW, VH), c0: c, last: c };
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const move = (e) => { if (!gest) return; gest.last = apply(e); if (o.onlive) o.onlive(gest.last); };
    const up = (e) => {
      if (!gest) return;
      try { gest.svg.releasePointerCapture(e.pointerId); } catch (err) {}
      const last = gest.last;
      gest = null;
      if (o.oncommit) o.oncommit(last);
    };
    const key = (e) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      // oklar kırpılan alanı kaydırır; Ctrl ile sağ-alt kenarı, Alt ile sol-üst kenarı hareket ettirir
      let { l, t, r, b } = c;
      if (e.ctrlKey || e.metaKey) { r -= d[0] * step; b -= d[1] * step; }
      else if (e.altKey) { l += d[0] * step; t += d[1] * step; }
      else { const w = 1 - l - r, hh = 1 - t - b; l = U.clamp(l + d[0] * step, 0, 1 - w); r = 1 - w - l; t = U.clamp(t + d[1] * step, 0, 1 - hh); b = 1 - hh - t; }
      const n = clean({ l: l, t: t, r: r, b: b });
      if (o.onlive) o.onlive(n);
      if (o.oncommit) o.oncommit(n);
    };

    return h('div', { class: 'crop-ed' },
      h('svg', {
        id: o.id || null, class: 'crop-svg', viewBox: '0 0 ' + VW + ' ' + VH, width: '100%', role: 'group', tabindex: 0,
        'aria-label': 'Görsel kırpma. Ok tuşları kırpılan alanı kaydırır; Ctrl ile ok tuşları sağ-alt kenarı, Alt ile ok tuşları sol-üst kenarı taşır.',
        onpointermove: move, onpointerup: up, onpointercancel: up, onkeydown: key,
      },
        h('rect', { x: 0, y: 0, width: VW, height: VH, fill: '#C9CACD' }),
        o.src ? h('image', { href: o.src, x: -rg.x * kx, y: -rg.y * ky, width: o.w * kx, height: o.h * ky, preserveAspectRatio: 'none', style: o.gray ? { filter: 'grayscale(1)' } : null }) : null,
        h('path', { d: 'M0 0H' + VW + 'V' + VH + 'H0Z M' + x0 + ' ' + y0 + 'V' + y1 + 'H' + x1 + 'V' + y0 + 'Z', fill: '#17181B', 'fill-opacity': 0.58, 'fill-rule': 'evenodd', 'pointer-events': 'none' }),
        h('rect', { class: 'crop-body', x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), fill: 'transparent', stroke: '#FFFFFF', 'stroke-width': 1.5, style: { cursor: 'move' }, onpointerdown: (e) => down(e, 'm') }),
        h('path', { d: 'M' + (x0 + (x1 - x0) / 3) + ' ' + y0 + 'V' + y1 + 'M' + (x0 + (x1 - x0) * 2 / 3) + ' ' + y0 + 'V' + y1 + 'M' + x0 + ' ' + (y0 + (y1 - y0) / 3) + 'H' + x1 + 'M' + x0 + ' ' + (y0 + (y1 - y0) * 2 / 3) + 'H' + x1, stroke: '#FFFFFF', 'stroke-opacity': 0.45, 'stroke-width': 0.8, fill: 'none', 'pointer-events': 'none' }),
        HANDLES.map((q) => h('rect', { key: q[0], class: 'crop-h', x: q[1] - hs / 2, y: q[2] - hs / 2, width: hs, height: hs, fill: '#FFFFFF', stroke: '#17181B', 'stroke-width': 1.5, style: { cursor: q[3] }, onpointerdown: (e) => down(e, q[0]) }))),
      h('p', { class: 'crop-info mono' }, Math.round((1 - c.l - c.r) * 100) + '% × ' + Math.round((1 - c.t - c.b) * 100) + '%' + (ui.cropIsEmpty(c) ? ' · kırpma yok' : '')));
  };
})();
