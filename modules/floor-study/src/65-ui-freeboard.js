/* ==========================================================================
   65-ui-freeboard.js — Mekân Etüdü paftası: Plan · İzometrik · Süreç
   Plan: mekân / donatı / ek öğe sürükleme, boyutlandırma, kat süzgeci, yakınlaştırma ve kaydırma.
   İzometrik ve Süreç: yörünge (sürükleyerek döndürme).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const st = App.study;
  const fl = ui.floors;
  const ctl = () => App.ctl;

  const EX_LABEL = { green: 'Yeşil alan', void: 'Boşluk / avlu', tree: 'Ağaç', arrow: 'Ok' };

  /* ---------------- sahne önbelleği ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, fd, v, frozen) {
    const key = [fd, P.plan, P.site, P.meta.name, App.theme.name, frozen, App.sheet.W, v.view, v.lv, v.furn, v.rel, v.grid, v.cam, v.yaw, v.pitch, v.zx, P.study.free.steps, P.spaces];
    if (memo.k && memo.k.length === key.length && memo.k.every((x, i) => x === key[i])) return memo.v;
    let sc;
    if (v.view === 'iso') sc = App.massing.isoScene(App.massing.doc(P, { live: true }), { live: true, yaw: v.yaw, pitch: v.pitch, zx: v.zx, grid: v.grid });
    else if (v.view === 'surec') sc = App.massing.processScene(App.massing.doc(P, {}), { live: true, yaw: v.yaw, pitch: v.pitch, zx: v.zx });
    else sc = st.freeScene(P, fd, { live: true, frozen: frozen, cam: v.cam, lv: v.lv, furn: v.furn, rel: v.rel, grid: v.grid, sel: null });
    memo = { k: key, v: sc };
    return sc;
  }

  /* ---------------- hareket ---------------- */
  let gest = null, frozen = null, orbit = null;
  const svgPt = (e) => {
    const svg = fl.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const toWorld = (e, view) => { const q = svgPt(e); return [view.wx(q.x), view.wy(q.y)]; };
  const snapTo = (v, s) => Math.round(Math.round(v / s) * s * 100) / 100;
  const r2 = (v) => Math.round(v * 100) / 100;

  function pull(vals, cands, tol) {
    let best = null;
    vals.forEach((v) => cands.forEach((c) => { const d = c - v; if (Math.abs(d) <= tol && (best == null || Math.abs(d) < Math.abs(best))) best = d; }));
    return best;
  }
  function magnetMove(r, others, tol) {
    const xs = [], ys = [];
    others.forEach((o) => {
      const yOv = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > -0.5, xOv = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > -0.5;
      if (yOv) { xs.push([r.x, o.x + o.w]); xs.push([r.x + r.w, o.x]); }
      xs.push([r.x, o.x]); xs.push([r.x + r.w, o.x + o.w]);
      if (xOv) { ys.push([r.y, o.y + o.h]); ys.push([r.y + r.h, o.y]); }
      ys.push([r.y, o.y]); ys.push([r.y + r.h, o.y + o.h]);
    });
    const best = (pairs) => { let b = null; pairs.forEach((p) => { const d = p[1] - p[0]; if (Math.abs(d) <= tol && (b == null || Math.abs(d) < Math.abs(b))) b = d; }); return b || 0; };
    return { dx: best(xs), dy: best(ys) };
  }
  const exBox = (e) => (e.t === 'tree' ? { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 } : e.t === 'arrow' ? { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1) } : { x: e.x, y: e.y, w: e.w, h: e.h });

  /* kind: 'space' | 'extra' | 'furn' */
  function down(e, kind, obj, view, handle, parent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const w = toWorld(e, view);
    frozen = view.win;
    gest = { kind: kind, id: obj.id, pid: parent ? parent.id : null, handle: handle || null, sx: w[0], sy: w[1], cx: e.clientX, cy: e.clientY, orig: Object.assign({}, obj), po: parent ? { x: parent.x, y: parent.y, w: parent.w, h: parent.h } : null, moved: false, view: view };
    try { fl.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    if (kind === 'space') ctl().freeSelect(obj.id);
    else if (kind === 'extra') ctl().freeSelEx(obj.id);
    else if (kind === 'furn') ctl().freeSelFurn(obj.id);
  }
  function bgDown(e) {
    const v = App.store.get().ui.etut;
    if (v.view !== 'plan') { orbitDown(e); return; }
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    const q = svgPt(e);
    gest = { kind: 'pan', sx: q.x, sy: q.y, cx: e.clientX, cy: e.clientY, cam: Object.assign({}, v.cam), moved: false, view: null };
    try { fl.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function move(e) {
    if (orbit) { orbitMove(e); return; }
    if (!gest) return;
    if (!gest.moved) {
      if (Math.hypot(e.clientX - gest.cx, e.clientY - gest.cy) < 3) return;
      gest.moved = true;
      if (gest.kind !== 'pan') ctl().freeLiveBegin();
    }
    const S = App.store.get();
    if (gest.kind === 'pan') {
      const view = panView;
      if (!view) return;
      const q = svgPt(e);
      ctl().freeCam({ dx: gest.cam.dx - (q.x - gest.sx) / view.s, dy: gest.cam.dy - (q.y - gest.sy) / view.s });
      return;
    }
    const free = S.project.study.free;
    const fd = st.freeDerive(S.project);
    const snap = free.snap;
    const w = toWorld(e, gest.view);
    const dx = w[0] - gest.sx, dy = w[1] - gest.sy;
    const o = gest.orig;
    const tol = Math.max(0.3, 9 / gest.view.s);
    const mag = !e.altKey;
    const c = ctl();

    if (gest.kind === 'furn') {
      const it = fd.byId.get(gest.pid);
      if (!it) return;
      const dm = st.furnDims(o);
      const x = U.clamp(snapTo(o.x + dx, 0.05), 0, Math.max(0, it.w - dm.w)), y = U.clamp(snapTo(o.y + dy, 0.05), 0, Math.max(0, it.h - dm.h));
      c.freeFurnLive(gest.pid, gest.id, { x: x, y: y });
      return;
    }

    if (gest.kind === 'extra') {
      if (o.t === 'arrow') {
        if (gest.handle === 'p1') { c.freeExLive(o.id, { x1: snapTo(o.x1 + dx, snap), y1: snapTo(o.y1 + dy, snap) }); return; }
        if (gest.handle === 'p2') { c.freeExLive(o.id, { x2: snapTo(o.x2 + dx, snap), y2: snapTo(o.y2 + dy, snap) }); return; }
        const sx = snapTo(dx, snap), sy = snapTo(dy, snap);
        c.freeExLive(o.id, { x1: o.x1 + sx, y1: o.y1 + sy, x2: o.x2 + sx, y2: o.y2 + sy });
        return;
      }
      if (o.t === 'tree') { c.freeExLive(o.id, { x: snapTo(o.x + dx, snap), y: snapTo(o.y + dy, snap) }); return; }
      const others = fd.items.map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h })).concat(fd.extras.filter((q) => q.id !== o.id && q.t !== 'arrow').map(exBox));
      if (!gest.handle) {
        let x = snapTo(o.x + dx, snap), y = snapTo(o.y + dy, snap);
        if (mag) { const m = magnetMove({ x: x, y: y, w: o.w, h: o.h }, others, tol); x = r2(x + m.dx); y = r2(y + m.dy); }
        c.freeExLive(o.id, { x: x, y: y });
        return;
      }
      resize(o.x, o.y, o.w, o.h, gest.handle, dx, dy, snap, mag, tol, others, S.ui.stLock, 0.6, (r) => c.freeExLive(o.id, r));
      return;
    }

    // mekân
    const sameVis = (q) => !gest.view.vis || gest.view.vis(q);
    const others = fd.items.filter((q) => q.id !== gest.id && sameVis(q));
    if (!gest.handle) {
      let x = snapTo(o.x + dx, snap), y = snapTo(o.y + dy, snap);
      if (mag) { const m = magnetMove({ x: x, y: y, w: o.w, h: o.h }, others, tol); x = r2(x + m.dx); y = r2(y + m.dy); }
      c.freeLive(gest.id, { x: x, y: y });
      return;
    }
    resize(o.x, o.y, o.w, o.h, gest.handle, dx, dy, snap, mag, tol, others, S.ui.stLock, st.FREE_MIN, (r) => c.freeLive(gest.id, r));
  }

  function resize(ox, oy, ow, oh, hd, dx, dy, snap, mag, tol, others, lock, MIN, emit) {
    let x0 = ox, x1 = ox + ow, y0 = oy, y1 = oy + oh;
    const edgeX = [], edgeY = [];
    others.forEach((q) => { edgeX.push(q.x, q.x + q.w); edgeY.push(q.y, q.y + q.h); });
    const adj = (v, edges) => { if (!mag) return v; const d = pull([v], edges, tol); return d == null ? v : v + d; };
    if (hd.indexOf('w') >= 0) x0 = adj(snapTo(ox + dx, snap), edgeX);
    if (hd.indexOf('e') >= 0) x1 = adj(snapTo(ox + ow + dx, snap), edgeX);
    if (hd.indexOf('n') >= 0) y0 = adj(snapTo(oy + dy, snap), edgeY);
    if (hd.indexOf('s') >= 0) y1 = adj(snapTo(oy + oh + dy, snap), edgeY);
    if (x1 - x0 < MIN) { if (hd.indexOf('w') >= 0) x0 = x1 - MIN; else x1 = x0 + MIN; }
    if (y1 - y0 < MIN) { if (hd.indexOf('n') >= 0) y0 = y1 - MIN; else y1 = y0 + MIN; }
    if (lock && hd.length === 2) {
      const r = ow / oh;
      let nw = x1 - x0, nh = y1 - y0;
      if (Math.abs(nw / ow - 1) >= Math.abs(nh / oh - 1)) nh = nw / r; else nw = nh * r;
      if (hd.indexOf('w') >= 0) x0 = x1 - nw; else x1 = x0 + nw;
      if (hd.indexOf('n') >= 0) y0 = y1 - nh; else y1 = y0 + nh;
    }
    emit({ x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) });
  }

  function up(e) {
    if (orbit) { orbitUp(e); return; }
    if (!gest) return;
    try { fl.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    const g = gest;
    gest = null; frozen = null;
    if (g.kind === 'pan') {
      if (!g.moved) {
        const S = App.store.get();
        if (S.selectedId) ctl().dispatch({ type: 'SELECT', id: null });
        if (S.ui.etut.ex || S.ui.etut.fu) ctl().etutView({ ex: null, fu: null }, true);
      }
      return;
    }
    ctl().freeLiveEnd();
    ctl().etutView({ stick: (App.store.get().ui.etut.stick || 0) + 1 }, true);
  }

  /* ---------------- yörünge (izometrik / süreç) ---------------- */
  function orbitDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = App.store.get().ui.etut;
    orbit = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false };
  }
  function orbitMove(e) {
    const dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
    if (!orbit.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      orbit.moved = true;
      try { fl.svgEl.setPointerCapture(orbit.id); } catch (err) {}
    }
    ctl().etutView({ yaw: U.clamp(orbit.yaw + dx * 0.32, -85, 85), pitch: U.clamp(orbit.pitch + dy * 0.22, 20, 70) }, true);
  }
  function orbitUp() {
    const o = orbit;
    orbit = null;
    try { fl.svgEl.releasePointerCapture(o.id); } catch (err) {}
    if (o.moved) ctl().etutView({});
  }

  /* ---------------- yakınlaştırma ---------------- */
  let panView = null;
  function zoomAt(view, cam, factor, px, py) {
    const k0 = cam.k || 1;
    const k = U.clamp(k0 * factor, 0.25, 12);
    if (k === k0) return;
    const win = view.win;
    const fx = px == null ? 0.5 : (px - view.ox) / (win.w * view.s), fy = py == null ? 0.5 : (py - view.oy) / (win.h * view.s);
    const wx = win.x0 + fx * win.w, wy = win.y0 + fy * win.h;
    const nw = win.w * k0 / k, nh = win.h * k0 / k;
    const cxN = wx - fx * nw + nw / 2, cyN = wy - fy * nh + nh / 2;
    const c0x = win.x0 + win.w / 2 - cam.dx, c0y = win.y0 + win.h / 2 - cam.dy;
    ctl().freeCam({ k: k, dx: cxN - c0x, dy: cyN - c0y });
  }
  function wheel(e) {
    const S = App.store.get();
    if (S.ui.etut.view !== 'plan' || !panView || gest) return;
    e.preventDefault();
    const q = svgPt(e);
    zoomAt(panView, S.ui.etut.cam, e.deltaY < 0 ? 1.15 : 1 / 1.15, q.x, q.y);
  }

  /* ---------------- tutamaçlar ---------------- */
  const HANDLES = [['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'], ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize']];
  const ptsOf = (view, ring) => ring.map((q) => view.X(q[0]).toFixed(1) + ',' + view.Y(q[1]).toFixed(1)).join(' ');
  const selStroke = { fill: 'none', 'stroke-width': 3, 'stroke-dasharray': '7 6', 'stroke-linejoin': 'round', 'pointer-events': 'none' };

  function handlesFor(view, key, box, onDown, g) {
    const hs = 11;
    const bx = view.X(box.x), by = view.Y(box.y), bw = box.w * view.s, bh = box.h * view.s;
    return h('g', { key: key, class: 'fhandles' },
      h('rect', { x: bx, y: by, width: bw, height: bh, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 1, 'stroke-opacity': 0.35, 'pointer-events': 'none' }),
      HANDLES.map((q) => h('rect', { key: q[0], class: 'fhandle', x: bx + q[1] * bw - hs / 2, y: by + q[2] * bh - hs / 2, width: hs, height: hs, rx: g ? 3 : 0, style: { cursor: q[3] }, onpointerdown: (e) => onDown(e, q[0]) })));
  }

  function planHits(state, fd, view) {
    const P = state.project;
    const free = P.study.free;
    const v = state.ui.etut;
    const sel = state.selectedId;
    const g = App.theme.name === 'glass';
    const c = ctl();
    const hits = [];
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

    // 1) yeşil ve boşluk (arkada)
    const exOf = (t) => fd.extras.filter((e) => e.t === t);
    const exKey = (e, el) => {
      const sn = free.snap * (e.shiftKey ? 5 : 1), k = e.key;
      if (dirs[k]) {
        e.preventDefault();
        const dv = dirs[k];
        if (el.t === 'arrow') c.freeExSet(el.id, { x1: el.x1 + dv[0] * sn, y1: el.y1 + dv[1] * sn, x2: el.x2 + dv[0] * sn, y2: el.y2 + dv[1] * sn });
        else if (el.t === 'tree') c.freeExSet(el.id, { x: el.x + dv[0] * sn, y: el.y + dv[1] * sn });
        else if (e.ctrlKey || e.metaKey) c.freeExSet(el.id, { w: el.w + dv[0] * sn, h: el.h + dv[1] * sn });
        else c.freeExSet(el.id, { x: el.x + dv[0] * sn, y: el.y + dv[1] * sn });
      } else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); c.freeExDel(el.id); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); c.freeSelEx(el.id); }
    };
    const exNode = (el) => {
      const on = v.ex === el.id;
      const common = { class: 'ehit', fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': EX_LABEL[el.t] + '. Ok tuşları taşır, Ctrl ile ok tuşları boyutlandırır, Delete siler.', onpointerdown: (e) => down(e, 'extra', el, view, null), onkeydown: (e) => exKey(e, el) };
      let node, ring;
      if (el.t === 'tree') {
        const r = Math.max(8, el.r * view.s);
        node = h('circle', Object.assign({ cx: view.X(el.x), cy: view.Y(el.y), r: r }, common));
        ring = on ? h('circle', { cx: view.X(el.x), cy: view.Y(el.y), r: r + 3, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 2.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none' }) : null;
      } else if (el.t === 'arrow') {
        const a = { x1: view.X(el.x1), y1: view.Y(el.y1), x2: view.X(el.x2), y2: view.Y(el.y2) };
        node = h('line', Object.assign({ stroke: 'transparent', 'stroke-width': 18, 'stroke-linecap': 'round' }, a, common, { fill: 'none' }));
        ring = on ? h('line', Object.assign({ stroke: App.PAL.ink, 'stroke-width': 8, 'stroke-opacity': 0.18, 'stroke-linecap': 'round', 'pointer-events': 'none' }, a)) : null;
      } else {
        const pts = ptsOf(view, st.extraRing(el));
        node = h('polygon', Object.assign({ points: pts }, common));
        ring = on ? h('polygon', Object.assign({ points: pts, stroke: App.PAL.ink }, selStroke)) : null;
      }
      return h('g', { key: 'x' + el.id, class: 'eitem' + (on ? ' sel' : '') }, ring, node, h('title', {}, EX_LABEL[el.t]));
    };
    exOf('green').concat(exOf('void')).forEach((el) => hits.push(exNode(el)));

    // 2) mekânlar
    const hidden = (it) => view.ghost && view.ghost(it);
    fd.items.slice().sort((a, b) => a.lv - b.lv || b.area - a.area).forEach((it) => {
      if (hidden(it)) return;
      const on = sel === it.id;
      const pts = ptsOf(view, it.ring);
      hits.push(h('g', { key: 'k' + it.id, class: 'fitem' + (on ? ' sel' : '') },
        on ? h('polygon', Object.assign({ class: 'sel-ring', points: pts, stroke: App.PAL.ink }, selStroke)) : null,
        h('polygon', {
          class: 'fitem-hit', points: pts, fill: 'transparent', tabindex: 0, role: 'button',
          'aria-label': it.name + ', ' + fmt(it.area) + ' metrekare. Ok tuşları taşır, Ctrl ile ok tuşları boyutlandırır, R döndürür.',
          onpointerdown: (e) => down(e, 'space', it, view, null),
          onkeydown: (e) => {
            const sn = free.snap * (e.shiftKey ? 5 : 1), k = e.key;
            if (dirs[k]) {
              e.preventDefault();
              const dv = dirs[k];
              if (e.ctrlKey || e.metaKey) c.freeSet(it.id, { w: it.w + dv[0] * sn, h: it.h + dv[1] * sn });
              else c.freeSet(it.id, { x: it.x + dv[0] * sn, y: it.y + dv[1] * sn });
            } else if (k === 'r' || k === 'R') { e.preventDefault(); c.freeRotate(it.id); }
            else if (k === 'Enter' || k === ' ') { e.preventDefault(); c.freeSelect(it.id); }
          },
        }, h('title', {}, it.name + ' — ' + fmt(it.area) + ' m²'))));
    });

    // 3) seçili mekânın donatısı
    const cur = sel ? fd.byId.get(sel) : null;
    if (cur && !hidden(cur) && v.furn && view.s >= 7) {
      cur.furn.forEach((f) => {
        const dm = st.furnDims(f);
        const x = view.X(cur.x + f.x), y = view.Y(cur.y + f.y), w = dm.w * view.s, hh = dm.h * view.s;
        const on = v.fu === f.id;
        const cat = st.FURN_BY[f.k];
        hits.push(h('g', { key: 'f' + f.id, class: 'fuitem' + (on ? ' sel' : '') },
          on ? h('rect', { x: x - 2, y: y - 2, width: w + 4, height: hh + 4, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 2, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }) : null,
          h('rect', {
            class: 'ehit', x: x, y: y, width: w, height: hh, fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': (cat ? cat.label : 'Donatı') + '. Ok tuşları taşır, R döndürür, Delete siler.',
            onpointerdown: (e) => down(e, 'furn', f, view, null, cur),
            onkeydown: (e) => {
              const sn = 0.05 * (e.shiftKey ? 10 : 2), k = e.key;
              if (dirs[k]) { e.preventDefault(); c.freeFurnSet(cur.id, f.id, { x: Math.max(0, f.x + dirs[k][0] * sn), y: Math.max(0, f.y + dirs[k][1] * sn) }); }
              else if (k === 'r' || k === 'R') { e.preventDefault(); c.freeFurnRot(cur.id, f.id); }
              else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); c.freeFurnDel(cur.id, f.id); }
            },
          }, h('title', {}, cat ? cat.label : 'Donatı'))));
      });
    }

    // 4) ağaç ve oklar (üstte)
    exOf('tree').concat(exOf('arrow')).forEach((el) => hits.push(exNode(el)));

    // 5) tutamaçlar
    if (cur && !hidden(cur)) hits.push(handlesFor(view, 'hs-' + cur.id, cur, (e, hd) => down(e, 'space', cur, view, hd), g));
    const ex = fd.extras.find((e) => e.id === v.ex);
    if (ex && (ex.t === 'green' || ex.t === 'void')) hits.push(handlesFor(view, 'hx-' + ex.id, ex, (e, hd) => down(e, 'extra', ex, view, hd), g));
    if (ex && ex.t === 'arrow') {
      hits.push(h('g', { key: 'ah', class: 'fhandles' }, [['p1', ex.x1, ex.y1], ['p2', ex.x2, ex.y2]].map((q) => h('circle', { key: q[0], class: 'fhandle', cx: view.X(q[1]), cy: view.Y(q[2]), r: 7, style: { cursor: 'move' }, onpointerdown: (e) => down(e, 'extra', ex, view, q[0]) }))));
    }
    return hits;
  }

  /* ---------------- adım şeridi ---------------- */
  function stepStrip(state) {
    const steps = state.project.study.free.steps || [];
    const c = ctl();
    if (!steps.length && !state.project.spaces.length) return null;
    return h('div', { class: 'estrip', role: 'group', 'aria-label': 'Kayıtlı adımlar' },
      steps.map((s, i) => h('button', { key: s.id, type: 'button', class: 'echip', onclick: () => c.freeStepLoad(i), title: (s.title || 'Adım') + (s.sub ? ' · ' + s.sub : '') + ' — düzeni yükle' },
        h('b', { class: 'mono' }, String(i + 1)), h('span', {}, s.title))),
      h('button', { type: 'button', class: 'echip echip-add', onclick: () => c.freeStepAdd(), disabled: steps.length >= 12 || !state.project.spaces.length, title: 'Güncel düzeni adım olarak kaydet' }, ui.icon('plus', 14), h('span', {}, 'Adım ekle')));
  }

  /* ---------------- pafta ---------------- */
  fl.freeBoard = function (state, d) {
    const P = state.project;
    const fd = st.freeDerive(P);
    const v = state.ui.etut;
    const c = ctl();
    const plan = v.view === 'plan';
    const m = fd.metrics;
    const lvOk = m.usedLevels && (v.lv === 'all' || v.lv < m.levels);
    const vv = lvOk ? v : Object.assign({}, v, { lv: 'all' });
    const sc = sceneOf(P, fd, vv, plan ? frozen : null);
    panView = plan ? sc.view : null;
    const cur = plan && state.selectedId ? fd.byId.get(state.selectedId) : null;
    const curEx = plan && v.ex ? fd.extras.find((e) => e.id === v.ex) : null;

    const svg = h('svg', {
      id: 'pafta-mekan', class: 'board-svg board-svg-mekan', viewBox: '0 0 ' + App.sheet.W + ' ' + App.sheet.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': 'Mekân etüdü paftası: ' + fd.items.length + ' mekân, ' + (plan ? 'plan' : v.view === 'iso' ? 'izometrik' : 'süreç afişi'),
      ref: (el) => { fl.svgEl = el; }, onpointerdown: bgDown, onpointermove: move, onpointerup: up, onpointercancel: up, onwheel: wheel,
    }, sc.prims.map((p) => App.board.primToV(p)), plan ? h('g', { class: 'fhits' }, planHits(state, fd, sc.view)) : null);

    const empty = !P.spaces.length;
    const stage = h('div', { class: 'board-stage' + (plan ? '' : ' is-orbit') }, svg,
      cur ? h('div', { class: 'an-chip' }, h('b', {}, cur.name), h('span', { class: 'mono' }, fmt(cur.w, 1) + ' × ' + fmt(cur.h, 1) + ' m · ' + fmt(cur.area, 1) + ' m²' + (cur.nf > 1 || cur.lv > 0 ? ' · ' + st.lvLabel(cur) : '')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.freeSelect(null) }, ui.icon('close', 14)))
        : curEx ? h('div', { class: 'an-chip' }, h('b', {}, EX_LABEL[curEx.t]),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.freeSelEx(null) }, ui.icon('close', 14))) : null,
      empty ? ui.emptyCard('Mekân etüdü için mekân gerekli', 'İşlev Şeması’nda mekân ekleyin, hazır bir bina programı yükleyin ya da sol panelden yeni mekân ekleyin.', [
        ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => c.loadTemplate('konut', '2+1') }),
        ui.btn('İşlev Şeması’na git', { icon: 'chevron', onclick: () => c.go('islev') })]) : null);

    const hint = plan
      ? 'Mekânı, donatıyı ya da öğeyi sürükleyin · tutamaçlarla boyutlandırın · kenarlara yapışır (Alt: kapat) · tekerlek yakınlaştırır, boşluğu sürükleyerek kaydırın · R döndürür'
      : 'Sürükleyerek döndürün' + (v.view === 'surec' ? ' · süreç afişi: kayıtlı tüm adımlar aynı ölçekte yan yana' : ' · çevre yapıları gri, mekânlar işlev rengiyle');

    const tools = [
      { k: 'seg', label: 'Pafta görünümü', value: v.view, options: [{ v: 'plan', label: 'Plan' }, { v: 'iso', label: 'İzometrik' }, { v: 'surec', label: 'Süreç' }], onchange: (x) => c.freeView(x) },
    ];
    if (plan && m.usedLevels) {
      const opts = [{ v: 'all', label: 'Tümü' }];
      for (let i = 0; i < m.levels; i++) opts.push({ v: i, label: i === 0 ? 'Zemin' : i + '. kat' });
      tools.push({ k: 'seg', label: 'Kat süzgeci', value: vv.lv, options: opts, onchange: (x) => c.freeLv(x) });
    }
    tools.push({ k: 'sep' });
    if (plan) {
      tools.push({ k: 'btn', label: 'Otomatik diz', icon: 'layout', strong: true, onclick: () => c.freeAuto(), disabled: !P.spaces.length, title: 'İlişkilere göre mekânları yeniden yerleştir' });
      tools.push({ k: 'icon', label: 'Donatı', icon: 'rect', pressed: !!v.furn, onclick: () => c.etutView({ furn: !v.furn }), title: 'Donatıyı göster / gizle (yakınlaştırınca görünür)' });
      tools.push({ k: 'icon', label: 'İlişkiler', icon: 'link', pressed: !!v.rel, onclick: () => c.etutView({ rel: !v.rel }), title: 'İlişki çizgilerini göster / gizle' });
      tools.push({ k: 'icon', label: 'Yakınlaştır', icon: 'plus', onclick: () => zoomAt(sc.view, v.cam, 1.4), title: 'Yakınlaştır' });
      tools.push({ k: 'icon', label: 'Uzaklaştır', icon: 'shrink', onclick: () => zoomAt(sc.view, v.cam, 1 / 1.4), title: 'Uzaklaştır' });
      tools.push({ k: 'icon', label: 'Sığdır', icon: 'expand', onclick: () => c.freeCamReset(), disabled: v.cam.k === 1 && !v.cam.dx && !v.cam.dy, title: 'Tüm çizimi sığdır' });
    } else {
      tools.push({ k: 'icon', label: 'Izgara', icon: 'grid', pressed: !!v.grid, onclick: () => c.etutView({ grid: !v.grid }), disabled: v.view === 'surec' });
    }
    tools.push({ k: 'sep' },
      { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
      { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      { k: 'sep' },
      { k: 'btn', label: 'DXF', icon: 'download', onclick: () => c.freeDxf(), disabled: !P.spaces.length || !!state.ui.busy, title: 'Mekânları katmanlı DXF (metre) olarak indir' });

    return ui.boardPage(state, d, {
      label: 'Mekân etüdü paftası',
      stage: stage,
      scale: plan ? 'Plan ölçekli · ızgara 1 m' + (v.cam.k !== 1 ? ' · ×' + fmt(v.cam.k, 1) : '') : v.view === 'iso' ? 'İzometrik · güncel düzen' : (P.study.free.steps || []).length + ' adımlı süreç',
      foot: h('div', { class: 'efoot' }, stepStrip(state), h('p', { class: 'board-hint' }, hint)),
      tools: tools,
    });
  };
})();
