/* ==========================================================================
   42-ui-board.js — canlı pafta (SVG): daireler, ilişki çizgileri, sürükle-bırak
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const geo = App.geo;

  let drag = null, lastPt = null;
  const ms = App.multi;
  /* çoklu seçim: kutu çizerek ya da Shift + tıkla birkaç mekân seç, birini sürükleyince hepsi birlikte taşınır */
  const activeMs = (S) => { const have = new Set(S.project.spaces.map((s) => s.id)); const r = (S.ui.ms || []).filter((id) => have.has(id)); return !S.selectedId && r.length >= 2 ? r : []; };
  ui.activeGroup = activeMs;
  const boxes = (S) => { const k = geo.scale(S.project.spaces); return S.project.spaces.map((s) => { const r = geo.radius(s.area, k); return { id: s.id, x0: s.x - r, y0: s.y - r, x1: s.x + r, y1: s.y + r, r: r }; }); };
  ui.multi = function (list) {
    if (list.length === 1) { App.ctl.dispatch({ type: 'UI', patch: { ms: [] } }); App.ctl.dispatch({ type: 'SELECT', id: list[0] }); return; }
    App.ctl.dispatch({ type: 'SELECT', id: null });
    App.ctl.dispatch({ type: 'UI', patch: { ms: list } });
  };

  // istemci noktası → dünya (çözümsel: görünüm durumundan; DOM güncellemesini beklemez, otomatik kaydırmada da doğru kalır)
  function toWorld(e) { return ui.zoom.toWorld(e.clientX, e.clientY); }

  // kıstırma / kaydırma başlayınca sürüklemeyi bırak (47-ui-zoom.js çağırır)
  ui.cancelDrag = function () {
    if (!drag) return;
    drag = null; ui.dragging = false; lastPt = null;
    if (ui.zoom) ui.zoom.stopEdge();
    App.ctl.dispatch({ type: 'UI', patch: { mq: null } });
  };
  const zoomBusy = () => !!(ui.zoom && ui.zoom.busy());

  /* Pencere sınırı. Tuval = beyaz pencerenin kendisi: daire merkezi görünür pencerenin içinde kalır (yarıçap + seçim halkası payıyla;
     küçük dairenin etiketi altta durduğu için alt pay daha geniştir). Pencere daireden darsa (çok yakınlaşınca) merkez pencerenin orta bandında kalır. Daire zaten dışarıdaysa
     (ör. yakınlaştırınca) yakalandığında zıplamaz: yalnızca içeri doğru hareket eder. Pencere ise sonsuzdur: daireyi kenara götürüp
     bekleyince tuval kayar (edgePan) ve daire kenarda kalarak onunla birlikte yeni boş alana ilerler. */
  function winBox(r, ox, oy) {
    const v = ui.zoom && ui.zoom.visible();
    if (!v) return { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    const pad = r + 10, bot = pad + (r < 36 ? 64 : 0);
    // pay, pencerenin en çok %40'ı: daire pencereden büyükse (çok yakınlaşınca) merkez ortadaki banda kıstırılır, takılıp kalmaz
    const span = (a0, a1, p0, p1, o) => {
      const cap = 0.4 * (a1 - a0);
      return [Math.min(a0 + Math.min(p0, cap), o), Math.max(a1 - Math.min(p1, cap), o)];
    };
    const sx = span(v.x0, v.x1, pad, pad, ox), sy = span(v.y0, v.y1, pad, bot, oy);
    return { x0: sx[0], x1: sx[1], y0: sy[0], y1: sy[1] };
  }
  // tek daire: istenen merkez (x, y) pencere ve dünya sınırı içinde kalacak biçimde kıstırılır; (ox, oy) sürükleme başındaki konum
  function fitPoint(x, y, r, ox, oy) {
    const b = winBox(r, ox, oy);
    return geo.clampWorld(Math.max(b.x0, Math.min(b.x1, x)), Math.max(b.y0, Math.min(b.y1, y)), r);
  }
  // grup: tüm daireleri aynı kaydırmayla taşıyan (dx, dy) değerini, hiçbir daire pencereden ya da dünyadan taşmayacak biçimde kıs
  function fitShift(items, dx, dy) {
    let lx = -Infinity, hx = Infinity, ly = -Infinity, hy = Infinity;
    items.forEach((q) => {
      const b = winBox(q.r, q.x, q.y);
      lx = Math.max(lx, b.x0 - q.x); hx = Math.min(hx, b.x1 - q.x);
      ly = Math.max(ly, b.y0 - q.y); hy = Math.min(hy, b.y1 - q.y);
    });
    let ax = Math.max(lx, Math.min(hx, dx)), ay = Math.max(ly, Math.min(hy, dy));
    items.forEach((q) => {
      const c0 = geo.clampWorld(q.x + ax, q.y + ay, q.r);
      ax = ax >= 0 ? Math.min(ax, c0.x - q.x) : Math.max(ax, c0.x - q.x);
      ay = ay >= 0 ? Math.min(ay, c0.y - q.y) : Math.max(ay, c0.y - q.y);
    });
    return { x: ax, y: ay };
  }

  function bubbleDown(e, s, r) {
    if (zoomBusy()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e);
    const S0 = App.store.get();
    if (e.shiftKey) {
      // Shift + tık: seçime ekle / çıkar · Shift + sürükle: dairenin üstünden de kutu seçimi başlar
      drag = { marq: true, add: true, tog: s.id, wx: w.x, wy: w.y, sx: e.clientX, sy: e.clientY, moved: false };
      try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    const list = activeMs(S0);
    if (list.length >= 2 && ms.has(list, s.id)) {
      const orig = {}, rad = {};
      boxes(S0).forEach((q) => { if (ms.has(list, q.id)) rad[q.id] = q.r; });
      S0.project.spaces.forEach((q) => { if (ms.has(list, q.id)) orig[q.id] = { x: q.x, y: q.y }; });
      const items = list.filter((id) => orig[id]).map((id) => ({ x: orig[id].x, y: orig[id].y, r: rad[id] }));
      drag = { group: true, id: s.id, ids: list, orig: orig, rad: rad, items: items, gx: w.x, gy: w.y, sx: e.clientX, sy: e.clientY, moved: false };
      try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    drag = { id: s.id, dx: s.x - w.x, dy: s.y - w.y, ox: s.x, oy: s.y, sx: e.clientX, sy: e.clientY, moved: false, r: r };
    try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    if ((S0.ui.ms || []).length) App.ctl.dispatch({ type: 'UI', patch: { ms: [] } });
    App.ctl.dispatch({ type: 'SELECT', id: s.id });
  }
  function bgDown(e) {
    if (zoomBusy()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const S = App.store.get();
    if (!e.shiftKey && S.selectedId) App.ctl.dispatch({ type: 'SELECT', id: null });
    const w = toWorld(e);
    // yakalama (pointer capture) sürükleme başlayınca alınır; böylece çizgiye tıklayıp ilişkiyi değiştirme bozulmaz
    drag = { marq: true, add: e.shiftKey, wx: w.x, wy: w.y, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
  }
  function svgMove(e) {
    if (!drag || zoomBusy()) return;
    lastPt = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
    if (drag.marq) {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        drag.moved = true;
        try { ui.svgEl.setPointerCapture(drag.pid != null ? drag.pid : e.pointerId); } catch (err) {}
      }
      const w1 = toWorld(e);
      App.ctl.dispatch({ type: 'UI', patch: { mq: ms.rect([drag.wx, drag.wy], [w1.x, w1.y]) } });
      if (ui.zoom) ui.zoom.edgePan(e.clientX, e.clientY);
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      App.ctl.dispatch({ type: 'DRAG_START' });
      ui.dragging = true;
    }
    const w = toWorld(e);
    if (drag.group) {
      // hiçbir daire beyaz pencerenin (ve dünyanın) dışına çıkmasın
      const a = fitShift(drag.items, w.x - drag.gx, w.y - drag.gy);
      const pos = {};
      drag.ids.forEach((id) => { pos[id] = { x: drag.orig[id].x + a.x, y: drag.orig[id].y + a.y }; });
      App.ctl.dispatch({ type: 'SET_POSITIONS', positions: pos });
      if (ui.zoom) ui.zoom.edgePan(e.clientX, e.clientY);
      return;
    }
    const c = fitPoint(w.x + drag.dx, w.y + drag.dy, drag.r, drag.ox, drag.oy);
    App.ctl.dispatch({ type: 'MOVE', id: drag.id, x: c.x, y: c.y });
    if (ui.zoom) ui.zoom.edgePan(e.clientX, e.clientY);
  }
  // otomatik kaydırma tuvali kaydırdığında sürüklenen öğeyi (işaretçi sabit) yeni dünya konumuna taşı
  ui.redrag = function () { if (drag && lastPt) svgMove(lastPt); };
  function svgUp(e) {
    if (!drag || zoomBusy()) return;
    try { ui.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    const g = drag;
    drag = null; lastPt = null;
    ui.dragging = false;
    if (ui.zoom) ui.zoom.stopEdge();
    if (g.marq) {
      const S = App.store.get();
      if (!g.moved) {
        if (g.tog) { const base = activeMs(S).length ? activeMs(S) : (S.selectedId ? [S.selectedId] : []); ui.multi(ms.toggle(base, g.tog)); }
        else if (!g.add && (S.ui.ms || []).length) App.ctl.dispatch({ type: 'UI', patch: { ms: [], mq: null } });
        return;
      }
      const ids = ms.hit(S.ui.mq || ms.rect([g.wx, g.wy], [g.wx, g.wy]), boxes(S));
      const base = g.add ? (activeMs(S).length ? activeMs(S) : (S.selectedId ? [S.selectedId] : [])) : [];
      App.ctl.dispatch({ type: 'UI', patch: { mq: null } });
      ui.multi(ms.merge(base, ids, g.add));
      return;
    }
    if (g.group && !g.moved) ui.multi([g.id]);
  }
  /* klavye: ok tuşları seçili grubu kaydırır, Esc bırakır, Ctrl+A hepsini seçer */
  document.addEventListener('keydown', function (e) {
    const S = App.store.get();
    if (S.ui.module !== 'islev') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { if (S.project.spaces.length > 1) { e.preventDefault(); ui.multi(S.project.spaces.map((s) => s.id)); } return; }
    const list = activeMs(S);
    if (!list.length) return;
    if (e.key === 'Escape') { e.preventDefault(); App.ctl.dispatch({ type: 'UI', patch: { ms: [] } }); return; }
    if (!ms.DIRS[e.key]) return;
    e.preventDefault();
    const n = e.shiftKey ? 20 : 4, dv = ms.DIRS[e.key];
    const rad = {};
    boxes(S).forEach((q) => { rad[q.id] = q.r; });
    const items = S.project.spaces.filter((s) => ms.has(list, s.id)).map((s) => ({ x: s.x, y: s.y, r: rad[s.id] }));
    const a = fitShift(items, dv[0] * n, dv[1] * n);
    App.ctl.dispatch({ type: 'DRAG_START' });
    const pos = {};
    S.project.spaces.forEach((s) => { if (ms.has(list, s.id)) pos[s.id] = { x: s.x + a.x, y: s.y + a.y }; });
    App.ctl.dispatch({ type: 'SET_POSITIONS', positions: pos });
  });

  ui.board = function (state, d) {
    const ctl = App.ctl;
    const P = state.project;
    const k = d.k;
    const by = new Map(P.spaces.map((s) => [s.id, s]));
    const farStrong = new Set(d.score.pairs.filter((p) => p.type === 'strong' && !p.ok).map((p) => p.key));
    const badAvoid = new Set(d.score.pairs.filter((p) => p.type === 'avoid' && !p.ok).map((p) => p.key));

    const view = state.ui.view;
    const hitW = Math.round(geo.clampHit(26 / (ui.zoom ? ui.zoom.scale(view, state) : 1)));

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
        h('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'rel-hit', stroke: 'transparent', 'stroke-width': hitW, onclick: (e) => { e.stopPropagation(); ctl.dispatch({ type: 'CYCLE_RELATION', a: a.id, b: b.id }); } }, h('title', {}, label))));
    });

    const hl = state.ui.highlight;
    const rings = [];
    if (hl) [hl.a, hl.b].forEach((id) => {
      const s = by.get(id);
      if (s) rings.push(h('circle', { key: 'hl' + id, class: 'locate-ring', cx: s.x, cy: s.y, r: geo.radius(s.area, k) + 14, fill: 'none', stroke: App.PAL.red, 'stroke-width': 5, 'stroke-dasharray': '10 8' }));
    });

    const grp = activeMs(state);
    const bubbles = P.spaces.map((s) => {
      const r = geo.radius(s.area, k);
      const grpOn = grp.length > 0 && ms.has(grp, s.id);
      const sel = state.selectedId === s.id || grpOn;
      return h('g', { key: 'b' + s.id, class: 'bubble' + (sel ? ' selected' : ''), role: 'button', tabindex: 0, 'aria-label': s.name + ', ' + App.util.fmt(s.area) + ' metrekare', onpointerdown: (e) => bubbleDown(e, s, r), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctl.dispatch({ type: 'SELECT', id: s.id }); } } },
        sel ? h('circle', { class: 'sel-ring', cx: s.x, cy: s.y, r: r + 10, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6' }) : null,
        App.board.bubblePrims(s, r, P).map((p) => App.board.primToV(p)),
        h('title', {}, s.name + ' — ' + App.util.fmt(s.area) + ' m²'));
    });

    const cls = 'board-svg' + (view ? ' moved' : '') + (state.ui.tool === 'hand' ? ' tool-hand' : '') + (state.ui.sp ? ' pan-ready' : '') + (state.ui.pn ? ' panning' : '');
    const svg = h('svg', {
      id: 'pafta', class: cls, style: { background: App.PAL.sheet }, viewBox: ui.zoom ? ui.zoom.viewBox(view, state) : '0 0 ' + geo.W + ' ' + geo.H, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Bubble diagram paftası (sonsuz çalışma alanı: tekerlekle yakınlaştır, Boşluk + sürükleyerek kaydır)',
      ref: (el) => { ui.svgEl = el; if (ui.zoom) ui.zoom.wire(el); }, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp,
      onpointerdown: bgDown,
    }, ui.zoom ? ui.zoom.grid(view, state) : null, h('g', { class: 'lines' }, lines), h('g', { class: 'bubbles' }, bubbles), h('g', { class: 'rings' }, rings),
    grp.length ? ms.frame(ms.bounds(boxes(state).filter((q) => ms.has(grp, q.id))), 16) : null,
    state.ui.mq ? ms.marquee(state.ui.mq) : null);

    const needHelp = P.spaces.length >= 3 && d.score.percent != null && d.score.percent < 60;
    const empty = !P.spaces.length;
    const hint = state.ui.hintDismissed ? null : 'Daireleri sürükleyin · Çizgiye tıklayarak ilişkiyi değiştirin · Boşlukta kutu çizerek birkaç daire seçin (Shift: ekle / çıkar) · Tekerlek: yakınlaştır / uzaklaştır · Boşluk + sürükle: kaydır · Daireyi pencere kenarında tutarsanız pencere onunla birlikte ilerler';

    const attn = needHelp || P.meta.example;
    // slot: paftanın "güvenli alanı" (paneller arasında kalan boşluk). Tuval (stage) pencerenin tamamını kaplar; slot yalnızca
    // yerleşimdeki boşluğu ayırır ve yüzen öğeleri (zoom çubuğu, seçim çipi, boş durum) tutar.
    const slot = h('div', { class: 'board-slot' },
      h('div', { class: 'board-stage' }, svg),
      grp.length ? ms.chip(grp.length, { noun: 'mekân', onclear: () => ctl.dispatch({ type: 'UI', patch: { ms: [] } }) }) : null,
      empty ? h('div', { class: 'empty-card' },
        h('h2', { class: 'empty-title' }, 'Pafta boş'),
        h('p', {}, 'Soldaki formdan mekân adı ve m² girin, ya da hazır bir bina programıyla başlayın.'),
        h('div', { class: 'empty-actions' },
          ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => ctl.loadTemplate('konut', '2+1') }),
          ui.btn('İlk mekânı ekle', { icon: 'plus', onclick: ctl.focusForm }))) : null,
      ui.zoom ? ui.zoom.bar(state) : null);
    const hintEl = hint ? h('p', { class: 'board-hint' }, hint, h('button', { type: 'button', class: 'hint-x', 'aria-label': 'İpucunu kapat', onclick: () => ctl.dispatch({ type: 'UI', patch: { hintDismissed: true } }) }, ui.icon('close', 14))) : null;

    return h('section', { class: 'board-wrap', 'aria-label': 'Pafta' },
      h('div', { class: 'gstrip' }, ui.glass.dial(state, d), ui.glass.dock(state, d, attn)),
      slot,
      h('div', { class: 'board-foot' }, hintEl, h('span', { class: 'board-scale', title: 'Daire alanı m² ile orantılıdır. Çok küçük mekânlar okunabilirlik için en az 24 birim yarıçapla çizilir.' }, 'daire alanı ∝ m²')));
  };
})();
