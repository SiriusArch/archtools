/* ==========================================================================
   42-ui-board.js — canlı pafta (SVG): daireler, ilişki çizgileri, sürükle-bırak
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const geo = App.geo;

  let drag = null;

  function toWorld(e) {
    const svg = ui.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function bubbleDown(e, s, r) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e);
    drag = { id: s.id, dx: s.x - w.x, dy: s.y - w.y, sx: e.clientX, sy: e.clientY, moved: false, r: r };
    try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    App.ctl.dispatch({ type: 'SELECT', id: s.id });
  }
  function svgMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      App.ctl.dispatch({ type: 'DRAG_START' });
      ui.dragging = true;
    }
    const w = toWorld(e);
    const c = geo.clampPos(w.x + drag.dx, w.y + drag.dy, drag.r);
    App.ctl.dispatch({ type: 'MOVE', id: drag.id, x: c.x, y: c.y });
  }
  function svgUp(e) {
    if (!drag) return;
    try { ui.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    drag = null;
    ui.dragging = false;
  }

  ui.board = function (state, d) {
    const ctl = App.ctl;
    const P = state.project;
    const k = d.k;
    const by = new Map(P.spaces.map((s) => [s.id, s]));
    const farStrong = new Set(d.score.pairs.filter((p) => p.type === 'strong' && !p.ok).map((p) => p.key));
    const badAvoid = new Set(d.score.pairs.filter((p) => p.type === 'avoid' && !p.ok).map((p) => p.key));
    const info = App.board.infoOf(P, d.score);

    const stat = App.board.staticPrims(info).map((p) => App.board.primToV(p));

    const lines = [];
    Object.keys(P.relations).forEach((key) => {
      const ids = key.split('|');
      const a = by.get(ids[0]), b = by.get(ids[1]);
      if (!a || !b) return;
      const type = P.relations[key];
      const prims = App.board.relLinePrims(a, b, type, geo.radius(a.area, k), geo.radius(b.area, k));
      const cls = type === 'strong' && farStrong.has(key) ? 'far-strong' : type === 'avoid' && badAvoid.has(key) ? 'far-avoid' : '';
      const label = a.name + ' ↔ ' + b.name + ': ' + App.REL[type].label + ' (tıkla: değiştir)';
      lines.push(h('g', { key: 'r' + key, class: 'rel ' + cls },
        prims.map((p, i) => App.board.primToV(p, i === 0 && cls ? { class: cls } : null)),
        h('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'rel-hit', stroke: 'transparent', 'stroke-width': 26, onclick: (e) => { e.stopPropagation(); ctl.dispatch({ type: 'CYCLE_RELATION', a: a.id, b: b.id }); } }, h('title', {}, label))));
    });

    const hl = state.ui.highlight;
    const rings = [];
    if (hl) [hl.a, hl.b].forEach((id) => {
      const s = by.get(id);
      if (s) rings.push(h('circle', { key: 'hl' + id, class: 'locate-ring', cx: s.x, cy: s.y, r: geo.radius(s.area, k) + 14, fill: 'none', stroke: App.PAL.red, 'stroke-width': 5, 'stroke-dasharray': '10 8' }));
    });

    const bubbles = P.spaces.map((s) => {
      const r = geo.radius(s.area, k);
      const sel = state.selectedId === s.id;
      return h('g', { key: 'b' + s.id, class: 'bubble' + (sel ? ' selected' : ''), role: 'button', tabindex: 0, 'aria-label': s.name + ', ' + App.util.fmt(s.area) + ' metrekare', onpointerdown: (e) => bubbleDown(e, s, r), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctl.dispatch({ type: 'SELECT', id: s.id }); } } },
        sel ? h('circle', { class: 'sel-ring', cx: s.x, cy: s.y, r: r + 10, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6' }) : null,
        App.board.bubblePrims(s, r).map((p) => App.board.primToV(p)),
        h('title', {}, s.name + ' — ' + App.util.fmt(s.area) + ' m²'));
    });

    const svg = h('svg', {
      id: 'pafta', class: 'board-svg', viewBox: '0 0 ' + geo.W + ' ' + geo.H, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Bubble diagram paftası',
      ref: (el) => { ui.svgEl = el; }, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp,
      onpointerdown: () => { if (state.selectedId) ctl.dispatch({ type: 'SELECT', id: null }); },
    }, stat, h('g', { class: 'lines' }, lines), h('g', { class: 'bubbles' }, bubbles), h('g', { class: 'rings' }, rings));

    const needHelp = P.spaces.length >= 3 && d.score.percent != null && d.score.percent < 60;
    const empty = !P.spaces.length;
    const hint = state.ui.hintDismissed ? null : 'Daireleri sürükleyin · Çizgiye tıklayarak ilişkiyi değiştirin · Daireye tıklayıp soldan ilişkilerini düzenleyin';

    return h('section', { class: 'board-wrap', 'aria-label': 'Pafta' },
      h('div', { class: 'board-bar' },
        ui.btn('Otomatik yerleştir', { icon: 'layout', onclick: ctl.autoLayout, cls: 'btn-yellow' + (needHelp || P.meta.example ? ' attn' : ''), title: 'İlişkilere göre daireleri otomatik yerleştir', disabled: !P.spaces.length }),
        ui.btn('Geri al', { icon: 'undo', onclick: () => ctl.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)', labelCls: 'lbl-hide' }),
        ui.btn('İleri al', { icon: 'redo', onclick: () => ctl.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)', labelCls: 'lbl-hide' }),
        h('span', { class: 'board-scale', title: 'Daire alanı m² ile orantılıdır. Çok küçük mekânlar okunabilirlik için en az 24 birim yarıçapla çizilir.' }, 'Daire alanı ∝ m²')),
      h('div', { class: 'board-stage' },
        svg,
        empty ? h('div', { class: 'empty-card' },
          h('h2', { class: 'empty-title' }, 'Pafta boş'),
          h('p', {}, 'Soldaki formdan mekân adı ve m² girin, ya da hazır bir bina programıyla başlayın.'),
          h('div', { class: 'empty-actions' },
            ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => ctl.loadTemplate('konut', '2+1') }),
            ui.btn('İlk mekânı ekle', { icon: 'plus', onclick: ctl.focusForm }))) : null),
      hint ? h('p', { class: 'board-hint' }, hint, h('button', { type: 'button', class: 'hint-x', 'aria-label': 'İpucunu kapat', onclick: () => ctl.dispatch({ type: 'UI', patch: { hintDismissed: true } }) }, ui.icon('close', 14))) : null);
  };
})();
