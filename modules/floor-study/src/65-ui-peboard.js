/* ==========================================================================
   65-ui-peboard.js — Plan Editörü paftası
   2B plan: seç · taşı · boyutlandır · döndür · yerleştir (mekân, nesne, kapı / pencere, merdiven, not) · duvar ve korkuluk çiz · kamera yerleştir.
   3B: kesit alınmış izometrik · yürüyüş · kütle (WebGL). Yüzen araç çubuğu, kat seçici ve görünüm anahtarı.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const st = App.study;
  const pe = App.pe;
  const fl = ui.floors;
  const ctl = () => App.ctl;
  const ic = (n, s) => pe.ic(n, s);

  const KIND = { r: 'rooms', o: 'ops', n: 'objs', m: 'stairs', g: 'rails', t: 'labels', w: 'walls' };
  const r3 = pe.r3;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 < 1e-9 ? 0 : U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return dist(px, py, ax + dx * t, ay + dy * t);
  }
  const E0 = () => pe.get(App.store.get().project);
  const S0 = () => App.store.get();

  /* ---------------- ortam ---------------- */
  let curView = null, curD = null, frozenWin = null;
  const svgPt = (e) => {
    const svg = fl.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const toWorld = (e) => { const q = svgPt(e); return [curView.wx(q.x), curView.wy(q.y)]; };
  const snapG = (v, alt) => (alt ? r3(v) : pe.snapV(v, E0().snap));

  /* ---------------- sahne önbelleği ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, v, fid, frozen) {
    const dd = pe.derive(P);
    const key = [dd, fid, v.cam, frozen, v.fin, v.grid, v.names, v.dims, v.objs, App.theme.name, P.meta.name, App.sheet.W];
    if (memo.k && memo.k.length === key.length && memo.k.every((x, i) => x === key[i])) return memo.v;
    const sc = pe.scene(P, { fid: fid, cam: v.cam, frozen: frozen, fin: v.fin, grid: v.grid, names: v.names, dims: v.dims, objs: v.objs, live: true });
    memo = { k: key, v: sc };
    return sc;
  }

  /* ---------------- mıknatıslar ---------------- */
  function edgeSnap(D, val, axis, tol, skipId) {
    let best = null;
    D.rooms.forEach((r) => {
      if (r.id === skipId) return;
      (axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.d]).forEach((c) => { const d = c - val; if (Math.abs(d) <= tol && (best == null || Math.abs(d) < Math.abs(best))) best = d; });
    });
    return best;
  }
  const snapAxis = (D, val, axis, alt, skipId, tol) => { if (!alt) { const d = edgeSnap(D, val, axis, tol == null ? 0.3 : tol, skipId); if (d != null) return r3(val + d); } return snapG(val, alt); };
  function snapPt(D, x, y, alt) {
    if (!alt) {
      let best = null;
      const cand = (cx, cy) => { const d = dist(x, y, cx, cy); if (d < 0.28 && (!best || d < best.d)) best = { d: d, x: cx, y: cy }; };
      D.rooms.forEach((r) => { cand(r.x, r.y); cand(r.x + r.w, r.y); cand(r.x, r.y + r.d); cand(r.x + r.w, r.y + r.d); });
      D.walls.forEach((w) => { if (w.src === 'free') { cand(w.x1, w.y1); cand(w.x2, w.y2); } });
      if (best) return [best.x, best.y];
    }
    return [snapG(x, alt), snapG(y, alt)];
  }
  /* nesneyi en yakın duvara sırtını vererek yasla */
  function wallMagnet(D, o, x, y) {
    let best = null;
    D.walls.forEach((w) => {
      const px = x - w.x1, py = y - w.y1;
      const s = px * w.ux + py * w.uy;
      if (s < -0.1 || s > w.len + 0.1) return;
      const sd = -px * w.uy + py * w.ux; // işaretli dik uzaklık (n = (−uy, ux) yönünde)
      const ext = Math.max(o.w, o.d) / 2;
      const gap = Math.abs(sd) - w.t / 2;
      if (gap > ext + 0.22 || gap < -0.4) return;
      if (!best || Math.abs(sd) < Math.abs(best.sd)) best = { w: w, s: s, sd: sd };
    });
    if (!best) return null;
    const w = best.w, sg = best.sd >= 0 ? 1 : -1;
    const nx = -w.uy * sg, ny = w.ux * sg; // nesnenin bulunduğu taraf (içeri)
    const rot = ((Math.atan2(-nx, ny) * 180) / Math.PI + 360) % 360;
    // sırt duvara döner: yerel +y (ön) içeri bakar → ön vektörü (−sin r, cos r) = (nx, ny)
    const a = (rot * Math.PI) / 180;
    const fx = -Math.sin(a), fy = Math.cos(a);
    void fx; void fy;
    const sRound = U.clamp(best.s, 0, w.len);
    const cx = w.x1 + w.ux * sRound + nx * (w.t / 2 + o.d / 2 + 0.005), cy = w.y1 + w.uy * sRound + ny * (w.t / 2 + o.d / 2 + 0.005);
    return { x: r3(cx), y: r3(cy), rot: Math.round(rot) % 360 };
  }
  function objPlace(D, o, x, y, alt) {
    const c = pe.FURN_BY[o.k] || {};
    if (!alt && !c.flat && c.g !== 'dis') { const m = wallMagnet(D, o, x, y); if (m) return m; }
    return { x: r3(alt ? x : pe.snapV(x, 0.05)), y: r3(alt ? y : pe.snapV(y, 0.05)), rot: o.rot };
  }
  const fakeOp = (k, sub, hit) => {
    const def = pe.OP_BY[k + ':' + sub], w = hit.wall;
    const hw = def.w / 2;
    const s = U.clamp(hit.s, hw, Math.max(hw, w.len - hw));
    const cx = w.x1 + w.ux * s, cy = w.y1 + w.uy * s;
    return { k: k, sub: sub, w: def.w, h: def.h, t: w.t, ux: w.ux, uy: w.uy, nx: -w.uy, ny: w.ux, cx: cx, cy: cy, ax: cx - w.ux * hw, ay: cy - w.uy * hw, bx: cx + w.ux * hw, by: cy + w.uy * hw, flip: false, mir: false, x: cx, y: cy };
  };

  /* ---------------- isabet ---------------- */
  function inBox(o, cx, cy, hw, hd, rot, x, y) {
    const r = pe.rotPt(x - cx, y - cy, -rot);
    return Math.abs(r[0]) <= hw && Math.abs(r[1]) <= hd;
  }
  function hitTest(D, wx, wy, tol) {
    // 1) açıklıklar
    let best = null, bd = 1e9;
    D.ops.forEach((o) => { const d = segDist(wx, wy, o.ax, o.ay, o.bx, o.by); if (d <= Math.max(tol, o.t / 2 + 0.04) && d < bd) { bd = d; best = 'o:' + o.id; } });
    if (best) return best;
    // 2) merdiven
    for (let i = D.stairs.length - 1; i >= 0; i--) {
      const s = D.stairs[i], g = pe.stairSteps(s, D.f.h);
      if (inBox(s, s.x, s.y, g.bw / 2, g.bd / 2, s.rot, wx, wy)) return 'm:' + s.id;
    }
    // 3) nesneler (küçük önce, düz halı en altta)
    const os = D.objs.filter((o) => inBox(o, o.x, o.y, o.w / 2, o.d / 2, o.rot, wx, wy)).sort((p, q) => ((p.cat && p.cat.flat) ? 1 : 0) - ((q.cat && q.cat.flat) ? 1 : 0) || p.w * p.d - q.w * q.d);
    if (os.length) return 'n:' + os[0].id;
    // 4) etiket, korkuluk, serbest duvar
    for (const l of D.labels) if (dist(wx, wy, l.x, l.y) < Math.max(tol * 2, 0.45)) return 't:' + l.id;
    for (const r of D.rails) if (segDist(wx, wy, r.x1, r.y1, r.x2, r.y2) < Math.max(tol, 0.1)) return 'g:' + r.id;
    for (const w of D.walls) if (w.src === 'free' && segDist(wx, wy, w.x1, w.y1, w.x2, w.y2) < Math.max(tol, w.t / 2 + 0.05)) return 'w:' + w.id;
    // 5) odalar: en küçük
    const rs = D.rooms.filter((r) => wx >= r.x - r.ins.w && wx <= r.x + r.w + r.ins.e && wy >= r.y - r.ins.n && wy <= r.y + r.d + r.ins.s).sort((p, q) => p.gross - q.gross);
    return rs.length ? 'r:' + rs[0].id : null;
  }
  const HANDLES = [['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'], ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize']];
  function handleHit(D, key, wx, wy, px) {
    const E = E0();
    const k = key.charAt(0), id = key.slice(2), tol = 9 / curView.s;
    if (k === 'r') {
      const r = E.rooms.find((q) => q.id === id);
      if (!r) return null;
      for (const q of HANDLES) if (dist(wx, wy, r.x + q[1] * r.w, r.y + q[2] * r.d) <= tol) return { t: 'rsz', id: id, hd: q[0] };
    } else if (k === 'n') {
      const o = E.objs.find((q) => q.id === id);
      if (o) { const p = pe.rotPt(0, -(o.d / 2 + 0.55), o.rot); if (dist(wx, wy, o.x + p[0], o.y + p[1]) <= tol * 1.1) return { t: 'rot', id: id }; }
    } else if (k === 'm') {
      const s = E.stairs.find((q) => q.id === id);
      if (s) { const g = pe.stairSteps(s, D.f.h); const p = pe.rotPt(0, -(g.bd / 2 + 0.55), s.rot); if (dist(wx, wy, s.x + p[0], s.y + p[1]) <= tol * 1.1) return { t: 'rotS', id: id }; }
    } else if (k === 'g' || k === 'w') {
      const o = (k === 'g' ? E.rails : E.walls).find((q) => q.id === id);
      if (o) { if (dist(wx, wy, o.x1, o.y1) <= tol) return { t: 'end', kind: KIND[k], id: id, which: 1 }; if (dist(wx, wy, o.x2, o.y2) <= tol) return { t: 'end', kind: KIND[k], id: id, which: 2 }; }
    }
    void px;
    return null;
  }

  /* ---------------- hareketler (2B) ---------------- */
  let g = null;
  const cap = (e) => { try { fl.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok */ } };
  let hoverRaf = 0;
  function setHover(x, y) {
    const hv = S0().ui.pe.hover;
    if (hv && hv.x === x && hv.y === y) return;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; ctl().peUi({ hover: { x: x, y: y } }, true); });
  }
  function placementAt(v, D, wx, wy, alt) {
    const pl = v.place;
    if (!pl) return null;
    if (pl.t === 'obj') {
      const c = pe.FURN_BY[pl.k], base = Object.assign({ k: pl.k, w: c.w, d: c.d, h: c.h, rot: 0 }, pl.extra || {});
      return Object.assign({ o: base }, objPlace(D, base, wx, wy, alt));
    }
    if (pl.t === 'op') {
      const hit = pe.nearestWall(D, wx, wy, 0.9);
      return hit ? { hit: hit } : null;
    }
    if (pl.t === 'stairs' || pl.t === 'label') return { x: r3(alt ? wx : pe.snapV(wx, E0().snap)), y: r3(alt ? wy : pe.snapV(wy, E0().snap)), rot: 0 };
    return null;
  }

  function down(e) {
    const S = S0(), v = S.ui.pe;
    if (v.view !== '2d' || !curView) return;
    if (e.pointerType === 'mouse' && e.button === 2) { if (v.draft) ctl().peUi({ draft: null }, true); return; }
    if (e.pointerType === 'mouse' && e.button > 1) return;
    const D = curD, alt = e.altKey;
    const [wx, wy] = toWorld(e);
    const q = svgPt(e);
    const panning = e.button === 1 || v.tool === 'pan';
    if (panning) { g = { k: 'pan', sx: q.x, sy: q.y, cam: Object.assign({}, v.cam), view: curView }; cap(e); return; }
    e.preventDefault();
    cap(e);
    const tool = v.tool;
    if (tool === 'wall' || tool === 'rail') {
      const p = snapPt(D, wx, wy, alt);
      if (!v.draft) { ctl().peUi({ draft: { k: tool, x1: p[0], y1: p[1], x2: p[0], y2: p[1] } }, true); return; }
      const d = ortho(v.draft, p, alt);
      ctl().peLineAdd(tool === 'wall' ? 'walls' : 'rails', v.draft.x1, v.draft.y1, d[0], d[1]);
      ctl().peUi({ draft: e.detail >= 2 ? null : { k: tool, x1: d[0], y1: d[1], x2: d[0], y2: d[1] } }, true);
      return;
    }
    if (tool === 'cam') { g = { k: 'cam', x: wx, y: wy }; ctl().peUi({ walk: { x: wx, y: wy, yaw: 0, pitch: 0 } }, true); return; }
    if (tool === 'place' && v.place) {
      const pl = v.place;
      if (pl.t === 'room') { const p = [snapAxis(D, wx, 'x', alt), snapAxis(D, wy, 'y', alt)]; frozenWin = curView.win; g = { k: 'draw', x0: p[0], y0: p[1] }; ctl().peUi({ draft: { k: 'room', x0: p[0], y0: p[1], x1: p[0], y1: p[1] } }, true); return; }
      const pa = placementAt(v, D, wx, wy, alt);
      const keep = e.shiftKey;
      if (pl.t === 'obj' && pa) { ctl().peObjAt(pl.k, pa.x, pa.y, pa.rot, pl.extra); }
      else if (pl.t === 'op' && pa) { ctl().peOpAt(pl.k, pl.sub, pa.hit); }
      else if (pl.t === 'stairs' && pa) { ctl().peStairAt(pl.sub, pa.x, pa.y, 0); }
      else if (pl.t === 'label' && pa) { ctl().peLabelAt(pa.x, pa.y, 'Not'); }
      else return;
      if (!keep) ctl().peUi({ tool: 'sel', place: null }, true);
      return;
    }
    // seç
    const sel = v.sel;
    if (sel.length === 1) {
      const hd = handleHit(D, sel[0], wx, wy, q);
      if (hd) {
        const E = E0();
        frozenWin = curView.win;
        if (hd.t === 'rsz') { const r = E.rooms.find((x) => x.id === hd.id); g = { k: 'rsz', id: hd.id, hd: hd.hd, o: { x: r.x, y: r.y, w: r.w, d: r.d }, moved: false }; }
        else if (hd.t === 'rot') g = { k: 'rot', id: hd.id, kind: 'objs', moved: false };
        else if (hd.t === 'rotS') g = { k: 'rot', id: hd.id, kind: 'stairs', moved: false };
        else g = { k: 'end', kind: hd.kind, id: hd.id, which: hd.which, moved: false };
        return;
      }
    }
    const key = handleless(D, wx, wy);
    if (!key) {
      g = { k: 'mq', sx: wx, sy: wy, add: e.shiftKey };
      if (!e.shiftKey && sel.length) ctl().peSel([]);
      return;
    }
    if (e.shiftKey) { ctl().peSel(sel.indexOf(key) >= 0 ? sel.filter((x) => x !== key) : sel.concat([key])); g = null; return; }
    if (sel.indexOf(key) < 0) ctl().peSel([key]);
    const E = E0(), k = key.charAt(0), id = key.slice(2), kd = KIND[k];
    const obj = E[kd].find((x) => x.id === id);
    if (!obj) return;
    frozenWin = curView.win;
    g = { k: 'mov', kind: kd, id: id, wx: wx, wy: wy, sx: wx, sy: wy, o: Object.assign({}, obj), moved: false, cx: e.clientX, cy: e.clientY };
  }
  const handleless = (D, wx, wy) => hitTest(D, wx, wy, 7 / curView.s);
  function ortho(d, p, alt) {
    if (alt) return p;
    const dx = p[0] - d.x1, dy = p[1] - d.y1, a = Math.atan2(dy, dx), n = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(a - n) < 0.09) return Math.abs(Math.cos(n)) > 0.5 ? [p[0], d.y1] : [d.x1, p[1]];
    return p;
  }

  function move(e) {
    const S = S0(), v = S.ui.pe;
    if (v.view === '3d') { move3(e); return; }
    if (!curView) return;
    const D = curD, alt = e.altKey;
    if (!g) {
      if (v.tool !== 'sel' && v.tool !== 'pan') {
        const [wx, wy] = toWorld(e);
        if (v.tool === 'place' && v.place && v.place.t !== 'op') { const pa = placementAt(v, D, wx, wy, alt); setHover(pa ? pa.x : wx, pa ? pa.y : wy); }
        else if (v.tool === 'wall' || v.tool === 'rail') {
          const p = snapPt(D, wx, wy, alt);
          if (v.draft) { const d = ortho(v.draft, p, alt); ctl().peUi({ draft: Object.assign({}, v.draft, { x2: d[0], y2: d[1] }), hover: { x: d[0], y: d[1] } }, true); }
          else setHover(p[0], p[1]);
        } else setHover(wx, wy);
      }
      return;
    }
    if (g.k === 'pan') {
      const q = svgPt(e), win = g.view.win, s = g.view.s;
      ctl().peUi({ cam: { k: g.cam.k, dx: g.cam.dx - (q.x - g.sx) / s, dy: g.cam.dy - (q.y - g.sy) / s } }, true);
      return;
    }
    const [wx, wy] = toWorld(e);
    if (g.k === 'cam') { ctl().peUi({ walk: { x: g.x, y: g.y, yaw: Math.atan2(wx - g.x, -(wy - g.y)), pitch: 0 } }, true); return; }
    if (g.k === 'draw') { ctl().peUi({ draft: { k: 'room', x0: g.x0, y0: g.y0, x1: snapAxis(D, wx, 'x', alt), y1: snapAxis(D, wy, 'y', alt) } }, true); return; }
    if (g.k === 'mq') { ctl().peUi({ mq: { x0: Math.min(g.sx, wx), y0: Math.min(g.sy, wy), x1: Math.max(g.sx, wx), y1: Math.max(g.sy, wy) } }, true); return; }
    if (!g.moved && g.cx != null && dist(e.clientX, e.clientY, g.cx, g.cy) < 3) return;
    g.moved = true;
    ctl().peLiveBegin();
    const E = E0();
    if (g.k === 'rsz') {
      const o = g.o, hd = g.hd;
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.d;
      if (hd.indexOf('w') >= 0) x0 = Math.min(snapAxis(D, wx, 'x', alt, g.id), x1 - pe.MIN);
      if (hd.indexOf('e') >= 0) x1 = Math.max(snapAxis(D, wx, 'x', alt, g.id), x0 + pe.MIN);
      if (hd.indexOf('n') >= 0) y0 = Math.min(snapAxis(D, wy, 'y', alt, g.id), y1 - pe.MIN);
      if (hd.indexOf('s') >= 0) y1 = Math.max(snapAxis(D, wy, 'y', alt, g.id), y0 + pe.MIN);
      ctl().dispatch({ type: 'PE_ROOM_RESIZE_LIVE', id: g.id, nr: { x: x0, y: y0, w: x1 - x0, d: y1 - y0 } });
      return;
    }
    if (g.k === 'rot') {
      const o = E[g.kind].find((x) => x.id === g.id);
      if (!o) return;
      let a = (Math.atan2(wy - o.y, wx - o.x) * 180) / Math.PI + 90;
      a = ((a % 360) + 360) % 360;
      if (!alt) a = Math.round(a / 15) * 15 % 360;
      ctl().dispatch({ type: 'PE_SET_LIVE', kind: g.kind, id: g.id, patch: { rot: a } });
      return;
    }
    if (g.k === 'end') {
      const p = snapPt(D, wx, wy, alt);
      ctl().dispatch({ type: 'PE_SET_LIVE', kind: g.kind, id: g.id, patch: g.which === 1 ? { x1: p[0], y1: p[1] } : { x2: p[0], y2: p[1] } });
      return;
    }
    if (g.k === 'mov') {
      const dx = wx - g.sx, dy = wy - g.sy, o = g.o;
      if (g.kind === 'rooms') {
        const cur = E.rooms.find((x) => x.id === g.id);
        if (!cur) return;
        let nx = o.x + dx, ny = o.y + dy;
        if (!alt) {
          const ex = [edgeSnap(D, nx, 'x', 0.3, g.id), edgeSnap(D, nx + o.w, 'x', 0.3, g.id)].filter((x) => x != null).sort((p, q) => Math.abs(p) - Math.abs(q))[0];
          const ey = [edgeSnap(D, ny, 'y', 0.3, g.id), edgeSnap(D, ny + o.d, 'y', 0.3, g.id)].filter((x) => x != null).sort((p, q) => Math.abs(p) - Math.abs(q))[0];
          nx = ex != null ? nx + ex : snapG(nx, false); ny = ey != null ? ny + ey : snapG(ny, false);
        } else { nx = r3(nx); ny = r3(ny); }
        if (nx !== cur.x || ny !== cur.y) ctl().dispatch({ type: 'PE_ROOM_MOVE_LIVE', id: g.id, dx: r3(nx - cur.x), dy: r3(ny - cur.y) });
      } else if (g.kind === 'objs') {
        const pa = objPlace(D, o, o.x + dx, o.y + dy, alt);
        ctl().dispatch({ type: 'PE_SET_LIVE', kind: 'objs', id: g.id, patch: pa });
      } else if (g.kind === 'ops') {
        const hit = pe.nearestWall(D, wx, wy, 1.0);
        if (hit) ctl().dispatch({ type: 'PE_SET_LIVE', kind: 'ops', id: g.id, patch: { x: r3(hit.x), y: r3(hit.y), rot: hit.rot } });
      } else if (g.kind === 'stairs' || g.kind === 'labels') {
        ctl().dispatch({ type: 'PE_SET_LIVE', kind: g.kind, id: g.id, patch: { x: r3(snapG(o.x + dx, alt)), y: r3(snapG(o.y + dy, alt)) } });
      } else if (g.kind === 'rails' || g.kind === 'walls') {
        const sx = snapG(dx, alt), sy = snapG(dy, alt);
        ctl().dispatch({ type: 'PE_SET_LIVE', kind: g.kind, id: g.id, patch: { x1: r3(o.x1 + sx), y1: r3(o.y1 + sy), x2: r3(o.x2 + sx), y2: r3(o.y2 + sy) } });
      }
    }
  }

  function up(e) {
    const S = S0(), v = S.ui.pe;
    if (v.view === '3d') { up3(e); return; }
    const gg = g;
    g = null;
    frozenWin = null;
    ctl().peLiveEnd();
    try { fl.svgEl.releasePointerCapture(e.pointerId); } catch (err) { /* yok */ }
    if (!gg) return;
    const D = curD;
    if (gg.k === 'pan') { ctl().peUi({}, false); return; }
    if (gg.k === 'cam') { ctl().peWalk({}, true); ctl().peUi({ tool: 'sel', view: '3d', v3: 'walk', menu: null }, false); return; }
    if (gg.k === 'draw') {
      const d = v.draft;
      ctl().peUi({ draft: null }, true);
      if (!d) return;
      const w = Math.abs(d.x1 - d.x0), dd = Math.abs(d.y1 - d.y0);
      const type = v.place.type, rt = pe.ROOM_BY[type];
      if (w < 0.6 || dd < 0.6) ctl().peRoomAt(type, d.x0 + rt.def[0] / 2, d.y0 + rt.def[1] / 2, rt.def[0], rt.def[1]);
      else {
        const r = pe.newRoom(E0(), { f: ctl().peFid(), type: type, x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: w, d: dd });
        ctl().dispatch({ type: 'PE_ADD', kind: 'rooms', items: [r] });
        ctl().peSel(['r:' + r.id]);
      }
      if (!e.shiftKey) ctl().peUi({ tool: 'sel', place: null }, true);
      return;
    }
    if (gg.k === 'mq') {
      const m = v.mq;
      ctl().peUi({ mq: null }, true);
      if (!m || (m.x1 - m.x0 < 0.15 && m.y1 - m.y0 < 0.15)) return;
      const inside = (x, y) => x >= m.x0 && x <= m.x1 && y >= m.y0 && y <= m.y1;
      const keys = D.rooms.filter((r) => r.x >= m.x0 && r.x + r.w <= m.x1 && r.y >= m.y0 && r.y + r.d <= m.y1).map((r) => 'r:' + r.id)
        .concat(D.objs.filter((o) => inside(o.x, o.y)).map((o) => 'n:' + o.id), D.stairs.filter((s) => inside(s.x, s.y)).map((s) => 'm:' + s.id), D.labels.filter((l) => inside(l.x, l.y)).map((l) => 't:' + l.id));
      ctl().peSel(gg.add ? Array.from(new Set(v.sel.concat(keys))) : keys);
      return;
    }
    ctl().peUi({}, false);
  }
  function dbl(e) {
    const v = S0().ui.pe;
    if (v.view !== '2d' || !curView || v.tool !== 'sel') return;
    const [wx, wy] = toWorld(e);
    const key = handleless(curD, wx, wy);
    if (key && key.charAt(0) === 'r') { ctl().dispatch({ type: 'UI', patch: { peTab: 'plan' } }); const el = document.getElementById('pe-rname'); if (el) { el.focus(); el.select(); } }
  }
  function wheel(e) {
    const v = S0().ui.pe;
    if (v.view !== '2d' || !curView) return;
    e.preventDefault();
    const q = svgPt(e), k0 = v.cam.k || 1, k = U.clamp(k0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.25, 14);
    if (k === k0) return;
    const win = curView.win, fx = (q.x - curView.ox) / (win.w * curView.s), fy = (q.y - curView.oy) / (win.h * curView.s);
    const wx = win.x0 + fx * win.w, wy = win.y0 + fy * win.h, nw = win.w * k0 / k, nh = win.h * k0 / k;
    const c0x = win.x0 + win.w / 2 - v.cam.dx, c0y = win.y0 + win.h / 2 - v.cam.dy;
    ctl().peCam2d({ k: k, dx: wx - fx * nw + nw / 2 - c0x, dy: wy - fy * nh + nh / 2 - c0y });
  }
  const zoomBtn = (f) => { const v = S0().ui.pe; ctl().peCam2d({ k: U.clamp((v.cam.k || 1) * f, 0.25, 14) }); };

  /* ---------------- 2B kaplama katmanı (seçim, hayalet, taslak) ---------------- */
  function overlay(state, D, view, E) {
    const v = state.ui.pe, Cc = pe.colors(), X = view.X, Y = view.Y, out = [];
    const sc = Cc.sel;
    const hs = 9;
    const hnd = (x, y) => out.push({ t: 'rect', x: X(x) - hs / 2, y: Y(y) - hs / 2, w: hs, h: hs, fill: '#FFFFFF', stroke: sc, sw: 1.8 });
    const poly = (pts, extra) => out.push(Object.assign({ t: 'poly', pts: pts.map((q) => [X(q[0]), Y(q[1])]), stroke: sc, sw: 2, dash: [6, 4] }, extra || {}));
    const tag = (x, y, s) => {
      const w = Math.max(40, s.length * 6.4 + 12);
      out.push({ t: 'rect', x: X(x) - w / 2, y: Y(y) - 11, w: w, h: 18, rx: 4, fill: sc }, { t: 'text', x: X(x), y: Y(y) + 2, s: s, size: 11, weight: 700, fam: 'm', fill: '#FFFFFF', anchor: 'middle', pe: false });
    };
    const u = E.unit;
    v.sel.forEach((k) => {
      const id = k.slice(2), kd = KIND[k.charAt(0)];
      const o = E[kd] && E[kd].find((q) => q.id === id);
      if (!o) return;
      if (kd === 'rooms') {
        poly([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.d], [o.x, o.y + o.d]]);
        if (v.sel.length === 1) HANDLES.forEach((q) => hnd(o.x + q[1] * o.w, o.y + q[2] * o.d));
        if (g && (g.k === 'rsz' || g.k === 'mov') && g.moved) tag(o.x + o.w / 2, o.y + o.d + 0.45, pe.fmtLen(o.w, u) + ' × ' + pe.fmtLen(o.d, u));
      } else if (kd === 'objs') {
        const ob = D.objs.find((q) => q.id === id);
        if (ob) poly(ob.fp);
        if (v.sel.length === 1 && ob) {
          const p = pe.rotPt(0, -(o.d / 2 + 0.55), o.rot), e1 = pe.rotPt(0, -o.d / 2, o.rot);
          out.push({ t: 'line', x1: X(o.x + e1[0]), y1: Y(o.y + e1[1]), x2: X(o.x + p[0]), y2: Y(o.y + p[1]), stroke: sc, sw: 1.4 }, { t: 'circle', cx: X(o.x + p[0]), cy: Y(o.y + p[1]), r: 6, fill: '#FFFFFF', stroke: sc, sw: 1.8 });
        }
      } else if (kd === 'stairs') {
        const gm = pe.stairSteps(o, D.f.h), pts = [[-gm.bw / 2, -gm.bd / 2], [gm.bw / 2, -gm.bd / 2], [gm.bw / 2, gm.bd / 2], [-gm.bw / 2, gm.bd / 2]].map((q) => { const r = pe.rotPt(q[0], q[1], o.rot); return [o.x + r[0], o.y + r[1]]; });
        poly(pts);
        if (v.sel.length === 1) {
          const p = pe.rotPt(0, -(gm.bd / 2 + 0.55), o.rot), e1 = pe.rotPt(0, -gm.bd / 2, o.rot);
          out.push({ t: 'line', x1: X(o.x + e1[0]), y1: Y(o.y + e1[1]), x2: X(o.x + p[0]), y2: Y(o.y + p[1]), stroke: sc, sw: 1.4 }, { t: 'circle', cx: X(o.x + p[0]), cy: Y(o.y + p[1]), r: 6, fill: '#FFFFFF', stroke: sc, sw: 1.8 });
        }
      } else if (kd === 'ops') {
        const d = D.ops.find((q) => q.id === id);
        if (d) out.push({ t: 'line', x1: X(d.ax), y1: Y(d.ay), x2: X(d.bx), y2: Y(d.by), stroke: sc, sw: Math.max(5, d.t * view.s + 4), opacity: 0.35, cap: 'round' });
      } else if (kd === 'rails' || kd === 'walls') {
        out.push({ t: 'line', x1: X(o.x1), y1: Y(o.y1), x2: X(o.x2), y2: Y(o.y2), stroke: sc, sw: 5, opacity: 0.35, cap: 'round' });
        if (v.sel.length === 1) { hnd(o.x1, o.y1); hnd(o.x2, o.y2); }
      } else if (kd === 'labels') {
        out.push({ t: 'circle', cx: X(o.x), cy: Y(o.y), r: 14, stroke: sc, sw: 1.8, dash: [4, 3] });
      }
    });
    // taslak oda / çizgi
    const dr = v.draft;
    if (dr && dr.k === 'room') {
      const x0 = Math.min(dr.x0, dr.x1), y0 = Math.min(dr.y0, dr.y1), w = Math.abs(dr.x1 - dr.x0), d = Math.abs(dr.y1 - dr.y0);
      out.push({ t: 'rect', x: X(x0), y: Y(y0), w: w * view.s, h: d * view.s, fill: sc, opacity: 0.12 }, { t: 'rect', x: X(x0), y: Y(y0), w: w * view.s, h: d * view.s, stroke: sc, sw: 2, dash: [6, 4] });
      tag(x0 + w / 2, y0 + d + 0.45, pe.fmtLen(w, u) + ' × ' + pe.fmtLen(d, u));
    } else if (dr && (dr.k === 'wall' || dr.k === 'rail')) {
      out.push({ t: 'line', x1: X(dr.x1), y1: Y(dr.y1), x2: X(dr.x2), y2: Y(dr.y2), stroke: sc, sw: dr.k === 'wall' ? Math.max(4, E.wall.int * view.s) : 3, opacity: 0.6, cap: 'round' });
      out.push({ t: 'circle', cx: X(dr.x1), cy: Y(dr.y1), r: 4, fill: sc });
      if (dist(dr.x1, dr.y1, dr.x2, dr.y2) > 0.05) tag((dr.x1 + dr.x2) / 2, (dr.y1 + dr.y2) / 2 - 0.4, pe.fmtLen(dist(dr.x1, dr.y1, dr.x2, dr.y2), u));
    }
    // hayalet (yerleştirme)
    const hv = v.hover;
    if (v.tool === 'place' && v.place && hv) {
      const pl = v.place, gh = { fill: sc, stroke: sc, soft: sc, sw: 1.4, opacity: 0.55 };
      if (pl.t === 'room') {
        const rt = pe.ROOM_BY[pl.type], x = hv.x - rt.def[0] / 2, y = hv.y - rt.def[1] / 2;
        out.push({ t: 'rect', x: X(x), y: Y(y), w: rt.def[0] * view.s, h: rt.def[1] * view.s, fill: sc, opacity: 0.12 }, { t: 'rect', x: X(x), y: Y(y), w: rt.def[0] * view.s, h: rt.def[1] * view.s, stroke: sc, sw: 2, dash: [6, 4] });
        tag(hv.x, y + rt.def[1] + 0.45, rt.label + ' · ' + pe.fmtLen(rt.def[0], u) + ' × ' + pe.fmtLen(rt.def[1], u));
      } else if (pl.t === 'obj') {
        const c = pe.FURN_BY[pl.k], base = Object.assign({ k: pl.k, w: c.w, d: c.d, h: c.h }, pl.extra || {});
        const pa = objPlace(D, base, hv.x, hv.y, false);
        pe.objPrims(Object.assign({}, base, { x: pa.x, y: pa.y, rot: pa.rot }), view, { fill: sc, stroke: sc, soft: sc, sw: 1.6, opacity: 0.5 }).forEach((p) => out.push(p));
      } else if (pl.t === 'stairs') {
        const s = { sub: pl.sub, x: hv.x, y: hv.y, rot: 0, w: (pe.STAIRS.find((q) => q.sub === pl.sub) || { w: 1.1 }).w, steps: 0 };
        pe.stairPrims(s, D.f.h, view, Cc, gh).forEach((p) => out.push(p));
      } else if (pl.t === 'label') out.push({ t: 'circle', cx: X(hv.x), cy: Y(hv.y), r: 14, stroke: sc, sw: 1.8, dash: [4, 3] });
    }
    if (v.tool === 'place' && v.place && v.place.t === 'op' && hv) {
      const hit = pe.nearestWall(D, hv.x, hv.y, 0.9);
      if (hit) {
        const fo = fakeOp(v.place.k, v.place.sub, hit);
        out.push({ t: 'line', x1: X(fo.ax), y1: Y(fo.ay), x2: X(fo.bx), y2: Y(fo.by), stroke: sc, sw: Math.max(6, fo.t * view.s + 6), opacity: 0.3, cap: 'round' });
        pe.openingPrims(fo, view, Cc).forEach((p) => out.push(p));
      } else out.push({ t: 'circle', cx: X(hv.x), cy: Y(hv.y), r: 7, stroke: sc, sw: 1.6, dash: [3, 3] });
    }
    if (v.tool === 'cam' && hv && !g) out.push({ t: 'circle', cx: X(hv.x), cy: Y(hv.y), r: 8, stroke: sc, sw: 2 });
    // kutu seçim
    if (v.mq) out.push({ t: 'rect', x: X(v.mq.x0), y: Y(v.mq.y0), w: (v.mq.x1 - v.mq.x0) * view.s, h: (v.mq.y1 - v.mq.y0) * view.s, fill: sc, opacity: 0.1 }, { t: 'rect', x: X(v.mq.x0), y: Y(v.mq.y0), w: (v.mq.x1 - v.mq.x0) * view.s, h: (v.mq.y1 - v.mq.y0) * view.s, stroke: sc, sw: 1.4, dash: [5, 4] });
    // kamera işareti
    const w = v.walk;
    if (w && (v.tool === 'cam' || v.v3 === 'walk')) {
      const cx = X(w.x), cy = Y(w.y), R = 3.2 * view.s, fov = (72 * Math.PI) / 180;
      const a0 = w.yaw - fov / 2 - Math.PI / 2, a1 = w.yaw + fov / 2 - Math.PI / 2;
      out.push({ t: 'path', d: 'M ' + cx + ' ' + cy + ' L ' + (cx + Math.cos(a0) * R) + ' ' + (cy + Math.sin(a0) * R) + ' A ' + R + ' ' + R + ' 0 0 1 ' + (cx + Math.cos(a1) * R) + ' ' + (cy + Math.sin(a1) * R) + ' Z', fill: sc, opacity: 0.18 },
        { t: 'circle', cx: cx, cy: cy, r: 7, fill: sc, stroke: '#FFFFFF', sw: 2 });
    }
    return out;
  }

  /* ---------------- 3B tuval ---------------- */
  let cv = null, rend = null, raf3 = 0, ro = null, lastInfo = null, g3 = null;
  function draw3() {
    raf3 = 0;
    if (!cv || !document.body.contains(cv)) { drop3(); return; }
    const S = S0(), v = S.ui.pe;
    if (v.view !== '3d' || !rend) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, Math.round(cv.clientWidth * dpr)), hh = Math.max(2, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    const gl = App.theme.name === 'glass';
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (document.documentElement.getAttribute('data-theme') !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const bg = dark ? (gl ? '#1B1D22' : '#1C1710') : gl ? '#ECEEF2' : '#F1E6CB';
    const wk = v.walk || { x: 0, y: 0, yaw: 0, pitch: 0 };
    try {
      lastInfo = rend.draw(S.project, { mode: v.v3, fid: ctl().peFid(S), yaw: v.yaw, pitch: v.pitch, zoom: v.zoom, tx: v.tx, tz: v.tz, cam: wk, bg: bg, ground: bg });
    } catch (err) { if (window.console) window.console.error(err); }
  }
  const sched3 = () => { if (!raf3) raf3 = requestAnimationFrame(draw3); };
  function drop3() {
    if (ro) { try { ro.disconnect(); } catch (err) { /* yok */ } ro = null; }
    if (rend) { try { rend.dispose(); } catch (err) { /* yok */ } }
    rend = null; cv = null; pe.cur3d = null;
  }
  function mount3(el) {
    if (!el) return;
    if (el !== cv) {
      drop3();
      cv = el;
      try { rend = pe.gl.create(el); } catch (err) { rend = null; if (window.console) window.console.error(err); }
      pe.cur3d = rend ? { capture: () => { draw3(); return rend.capture(); } } : null;
      if (window.ResizeObserver) { ro = new ResizeObserver(sched3); ro.observe(el); }
    }
    sched3();
  }
  function down3(e) {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    const v = S0().ui.pe;
    g3 = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey, v: Object.assign({}, v), moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* yok */ }
    e.preventDefault();
  }
  function move3(e) {
    if (!g3) return;
    const dx = e.clientX - g3.x, dy = e.clientY - g3.y, v0 = g3.v;
    g3.moved = true;
    if (v0.v3 === 'walk') { ctl().peWalk({ yaw: (v0.walk ? v0.walk.yaw : 0) + dx * 0.005, pitch: (v0.walk ? v0.walk.pitch || 0 : 0) - dy * 0.004 }, false); return; }
    if (g3.pan) {
      const R = (lastInfo ? lastInfo.R : 8) * 1.18 / (v0.zoom || 1), k = (2 * R) / Math.max(1, cv.clientHeight);
      const yaw = v0.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      ctl().peUi({ tx: v0.tx - dx * k * rx + dy * k * fx / Math.max(0.3, Math.sin(v0.pitch)), tz: v0.tz - dx * k * rz + dy * k * fz / Math.max(0.3, Math.sin(v0.pitch)) }, true);
      return;
    }
    ctl().peUi({ yaw: v0.yaw - dx * 0.008, pitch: U.clamp(v0.pitch + dy * 0.006, 0.12, 1.5) }, true);
  }
  function up3(e) {
    if (!g3) return;
    g3 = null;
    try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* yok */ }
    ctl().peUi({}, false);
  }
  function wheel3(e) {
    const v = S0().ui.pe;
    e.preventDefault();
    if (v.v3 === 'walk') {
      const w = v.walk || { x: 0, y: 0, yaw: 0, pitch: 0 }, st0 = e.deltaY < 0 ? 0.3 : -0.3;
      ctl().peWalk({ x: w.x + Math.sin(w.yaw) * st0, y: w.y - Math.cos(w.yaw) * st0 }, true);
      return;
    }
    ctl().peUi({ zoom: U.clamp(v.zoom * Math.exp(-e.deltaY * 0.0012), 0.3, 6) }, false);
  }

  /* ---------------- küçük resimler ve menüler ---------------- */
  function thumb(k, w, d, rd) {
    const ops = pe.symOf(k, w, d, rd);
    const s = 34 / Math.max(w, d), ox = (40 - w * s) / 2, oy = (40 - d * s) / 2;
    const T = (v, off) => off + v * s;
    return h('svg', { viewBox: '0 0 40 40', width: 40, height: 40, class: 'pe-thumb', 'aria-hidden': 'true' }, ops.map((q, i) => {
      const fill = q[q.length - 1] === 1 ? 'currentColor' : 'none';
      const common = { key: i, stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-linejoin': 'round' };
      if (q[0] === 'r') return h('rect', Object.assign({ x: T(q[1], ox), y: T(q[2], oy), width: q[3] * s, height: q[4] * s, fill: fill, 'fill-opacity': fill === 'none' ? 0 : 0.18 }, common));
      if (q[0] === 'c') return h('circle', Object.assign({ cx: T(q[1], ox), cy: T(q[2], oy), r: q[3] * s, fill: q[4] === 1 ? 'currentColor' : 'none', 'fill-opacity': q[4] === 1 ? 0.18 : 0 }, common));
      if (q[0] === 'e') return h('ellipse', Object.assign({ cx: T(q[1], ox), cy: T(q[2], oy), rx: q[3] * s, ry: q[4] * s, fill: 'none' }, common));
      return h('line', Object.assign({ x1: T(q[1], ox), y1: T(q[2], oy), x2: T(q[3], ox), y2: T(q[4], oy) }, common, { 'stroke-opacity': 0.7 }));
    }));
  }
  const norm = (s) => U.norm(s || '');
  function searchBox(v, ph) {
    return h('div', { class: 'pe-search' }, ic('search', 15), h('input', { id: 'pe-q', class: 'inp', type: 'search', placeholder: ph, value: v.q || '', keep: true, 'aria-label': ph, oninput: (e) => ctl().peUi({ q: e.target.value }, true) }));
  }
  const arm = (place) => ctl().peTool('place', place);

  function roomsPop(v) {
    const q = norm(v.q);
    const groups = pe.ROOM_GROUPS.map((g0) => {
      const items = pe.ROOMS.filter((r) => r.g === g0.g && (!q || norm(r.label).indexOf(q) >= 0));
      if (!items.length) return null;
      return h('div', { key: g0.g, class: 'pe-grp' }, h('h4', {}, g0.label), h('div', { class: 'pe-items' }, items.map((r) => {
        const zn = App.ZONES[r.zone] || App.ZONES.sosyal;
        return h('button', { key: r.k, type: 'button', class: 'pe-item' + (v.place && v.place.type === r.k ? ' on' : ''), onclick: () => arm({ t: 'room', type: r.k }), title: r.label + ' · ' + r.def[0] + ' × ' + r.def[1] + ' m' },
          h('i', { class: 'pe-zone', style: { background: zn.fill } }), h('span', { class: 'pe-item-n' }, r.label), h('small', { class: 'mono' }, r.def[0] + '×' + r.def[1]));
      })));
    });
    return h('div', { class: 'pe-pop-in' }, searchBox(v, 'Mekân ara'), h('div', { class: 'pe-scroll' }, groups, h('p', { class: 'note' }, 'Bir mekân seçin; plana tıklayın (varsayılan ölçü) ya da sürükleyerek boyutunu çizin. Shift ile art arda yerleştirin.')));
  }
  function objsPop(v) {
    const q = norm(v.q);
    const gsel = v.og || 'yasama';
    const subs = {};
    const list = pe.FURN.filter((f) => !f.hidden && (q ? norm(f.label).indexOf(q) >= 0 : f.g === gsel));
    list.forEach((f) => { (subs[f.sub] = subs[f.sub] || []).push(f); });
    const custom = v.custom || { name: 'Özel nesne', w: 1, d: 0.6, h: 0.8, rd: false, col: '#B08A5E' };
    const createOwn = h('div', { key: 'own', class: 'pe-own' },
      h('h4', {}, 'Kendi nesneni oluştur'),
      h('div', { class: 'pe-own-grid' },
        h('label', { class: 'nfld' }, h('span', { class: 'nfld-l' }, 'Ad'), h('input', { id: 'pe-cn', class: 'inp', type: 'text', maxlength: 40, value: custom.name, keep: true, onchange: (e) => ctl().peUi({ custom: Object.assign({}, custom, { name: e.target.value }) }, true) })),
        [['w', 'Genişlik'], ['d', 'Derinlik'], ['h', 'Yükseklik']].map((f0) => h('label', { key: f0[0], class: 'nfld' }, h('span', { class: 'nfld-l' }, f0[1]), h('span', { class: 'nfld-c' }, h('input', { id: 'pe-c' + f0[0], class: 'inp mono nfld-i', type: 'number', min: 0.05, max: 12, step: 0.05, value: custom[f0[0]], keep: true, onchange: (e) => { const x = parseFloat(e.target.value); if (isFinite(x) && x > 0) ctl().peUi({ custom: Object.assign({}, custom, { [f0[0]]: x }) }, true); } }), h('span', { class: 'unit' }, 'm')))),
        h('label', { class: 'nfld' }, h('span', { class: 'nfld-l' }, 'Renk'), h('input', { id: 'pe-cc', class: 'inp pe-col', type: 'color', value: custom.col, keep: true, onchange: (e) => ctl().peUi({ custom: Object.assign({}, custom, { col: e.target.value }) }, true) }))),
      h('div', { class: 'btn-row' },
        ui.toggle({ label: 'Yuvarlak', on: !!custom.rd, onclick: () => ctl().peUi({ custom: Object.assign({}, custom, { rd: !custom.rd }) }, true) }),
        ui.btn('Yerleştir', { icon: 'plus', cls: 'btn-yellow', onclick: () => arm({ t: 'obj', k: 'ozel', extra: { name: custom.name || 'Özel nesne', w: custom.w, d: custom.d, h: custom.h, rd: !!custom.rd, col: custom.col } }) })));
    return h('div', { class: 'pe-pop-in' }, searchBox(v, 'Nesne ara'),
      q ? null : h('div', { class: 'pe-gtabs', role: 'tablist' }, pe.FURN_GROUPS.map((g0) => h('button', { key: g0.g, type: 'button', role: 'tab', class: 'pe-gtab' + (gsel === g0.g ? ' on' : ''), 'aria-selected': String(gsel === g0.g), onclick: () => ctl().peUi({ og: g0.g }, true) }, g0.label))),
      h('div', { class: 'pe-scroll' },
        Object.keys(subs).map((sub) => h('div', { key: sub, class: 'pe-grp' }, h('h4', {}, sub), h('div', { class: 'pe-items pe-items-o' }, subs[sub].map((f) =>
          h('button', { key: f.k, type: 'button', class: 'pe-item pe-item-o' + (v.place && v.place.k === f.k ? ' on' : ''), onclick: () => arm({ t: 'obj', k: f.k }), title: f.label + ' · ' + f.w + ' × ' + f.d + ' × ' + f.h + ' m' },
            thumb(f.k, f.w, f.d), h('span', { class: 'pe-item-n' }, f.label), h('small', { class: 'mono' }, f.w + '×' + f.d)))))),
        !list.length ? h('p', { class: 'note' }, 'Eşleşen nesne yok. Aşağıdan kendi nesnenizi oluşturabilirsiniz.') : null,
        createOwn));
  }
  function opsPop(v) {
    const q = norm(v.q);
    const sec = (title, list, k) => {
      const items = list.filter((d0) => !q || norm(d0.label).indexOf(q) >= 0);
      if (!items.length) return null;
      return h('div', { key: k, class: 'pe-grp' }, h('h4', {}, title), h('div', { class: 'pe-items' }, items.map((d0) => h('button', { key: d0.sub, type: 'button', class: 'pe-item' + (v.place && v.place.k === k && v.place.sub === d0.sub ? ' on' : ''), onclick: () => arm({ t: 'op', k: k, sub: d0.sub }), title: d0.label },
        ic(k === 'kapi' ? 'door' : 'window', 16), h('span', { class: 'pe-item-n' }, d0.label), h('small', { class: 'mono' }, d0.w + '×' + d0.h)))));
    };
    return h('div', { class: 'pe-pop-in' }, searchBox(v, 'Kapı / pencere ara'), h('div', { class: 'pe-scroll' }, sec('Kapılar', pe.DOORS, 'kapi'), sec('Pencereler', pe.WINDOWS, 'pencere'), h('p', { class: 'note' }, 'Duvarın üzerine getirin; tıklayınca yerleşir. Sonra duvar boyunca sürükleyin; F yönü, M menteşeyi çevirir.')));
  }
  function stairsPop(v) {
    return h('div', { class: 'pe-pop-in' }, h('div', { class: 'pe-scroll' }, h('div', { class: 'pe-grp' }, h('h4', {}, 'Merdivenler'), h('div', { class: 'pe-items' }, pe.STAIRS.map((s) => h('button', { key: s.sub, type: 'button', class: 'pe-item' + (v.place && v.place.t === 'stairs' && v.place.sub === s.sub ? ' on' : ''), onclick: () => arm({ t: 'stairs', sub: s.sub }) }, ic('stairs', 16), h('span', { class: 'pe-item-n' }, s.label), h('small', { class: 'mono' }, s.w + ' m'))))),
      h('p', { class: 'note' }, 'Merdiven bulunduğu kattan bir üst kata çıkar; üst kat döşemesinde boşluk otomatik açılır.')));
  }

  /* ---------------- pafta ---------------- */
  fl.peBoard = function (state, d) {
    const P = state.project, dd = pe.derive(P), E = dd.E, v = state.ui.pe;
    const fid = ctl().peFid(state), D = dd.by[fid], M = dd.metrics;
    const is2 = v.view === '2d';
    const has = E.rooms.length > 0;
    let stageMain, sc = null;
    curD = D;
    if (is2) {
      if (!g) frozenWin = null;
      sc = sceneOf(P, v, fid, frozenWin);
      curView = sc.view;
      const ov = overlay(state, D, sc.view, E);
      stageMain = h('svg', {
        id: 'pafta-plan', class: 'board-svg board-svg-plan pe-svg tool-' + v.tool, viewBox: '0 0 ' + App.sheet.W + ' ' + App.sheet.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
        'aria-label': 'Plan editörü paftası: ' + D.f.name + ', ' + D.rooms.length + ' mekân',
        ref: (el) => { fl.svgEl = el; }, onpointerdown: down, onpointermove: move, onpointerup: up, onpointercancel: up, onwheel: wheel, ondblclick: dbl, oncontextmenu: (e) => e.preventDefault(),
      }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'pe-ov', 'pointer-events': 'none' }, ov.map((p) => App.board.primToV(p))));
    } else if (!pe.gl.supported()) {
      stageMain = h('div', { class: 'pe-nogl' }, h('p', {}, 'Bu tarayıcı WebGL’i desteklemiyor; 3B görünüm açılamadı. 2B plan çalışmaya devam eder.'));
    } else {
      stageMain = h('canvas', { key: 'pe3d', class: 'pe-canvas', tabindex: 0, 'aria-label': '3B görünüm: ' + (v.v3 === 'walk' ? 'yürüyüş' : v.v3 === 'mass' ? 'kütle' : 'kesit alınmış izometrik'), ref: mount3, onpointerdown: down3, onpointermove: move3, onpointerup: up3, onpointercancel: up3, onwheel: wheel3, oncontextmenu: (e) => e.preventDefault() });
    }

    /* yüzen araç çubuğu */
    const tl = v.tool;
    const dockBtn = (key, icon, label, on, onclick, title) => h('button', { key: key, type: 'button', class: 'pe-db' + (on ? ' on' : ''), 'aria-pressed': String(!!on), title: title || label, onclick: onclick }, ic(icon, 20), h('span', {}, label));
    const dock = is2 ? h('div', { class: 'pe-dock', role: 'toolbar', 'aria-label': 'Çizim araçları' },
      dockBtn('sel', 'sel', 'Seç', tl === 'sel', () => ctl().peTool('sel'), 'Seç ve taşı (V)'),
      h('span', { class: 'pe-dsep', 'aria-hidden': 'true' }),
      dockBtn('rooms', 'room', 'Mekânlar', v.menu === 'rooms' || (tl === 'place' && v.place && v.place.t === 'room'), () => ctl().peMenu('rooms')),
      dockBtn('objs', 'sofa', 'Nesneler', v.menu === 'objs' || (tl === 'place' && v.place && v.place.t === 'obj'), () => ctl().peMenu('objs')),
      dockBtn('ops', 'door', 'Kapı / pencere', v.menu === 'ops' || (tl === 'place' && v.place && v.place.t === 'op'), () => ctl().peMenu('ops')),
      dockBtn('stairs', 'stairs', 'Merdiven', v.menu === 'stairs' || (tl === 'place' && v.place && v.place.t === 'stairs'), () => ctl().peMenu('stairs')),
      h('span', { class: 'pe-dsep', 'aria-hidden': 'true' }),
      dockBtn('wall', 'wall', 'Duvar', tl === 'wall', () => ctl().peTool('wall'), 'Serbest duvar çiz (W) · çift tık / Esc bitirir'),
      dockBtn('rail', 'rail', 'Korkuluk', tl === 'rail', () => ctl().peTool('rail'), 'Korkuluk çiz (G)'),
      dockBtn('label', 'label', 'Not', tl === 'place' && v.place && v.place.t === 'label', () => arm({ t: 'label' })),
      dockBtn('cam', 'cam', 'Kamera', tl === 'cam', () => ctl().peTool('cam'), 'Plana tıklayıp sürükleyin: bakış yönünü belirler ve yürüyüş görünümünü açar'),
      dockBtn('pan', 'pan', 'Kaydır', tl === 'pan', () => ctl().peTool('pan'), 'Kaydır (H) · orta tuş her zaman kaydırır')) : null;
    const pop = is2 && v.menu ? h('div', { class: 'pe-pop', role: 'dialog', 'aria-label': 'Katalog' },
      h('button', { type: 'button', class: 'icon-btn pe-pop-x', 'aria-label': 'Kapat', onclick: () => ctl().peUi({ menu: null }, true) }, ui.icon('close', 14)),
      v.menu === 'rooms' ? roomsPop(v) : v.menu === 'objs' ? objsPop(v) : v.menu === 'ops' ? opsPop(v) : stairsPop(v)) : null;
    const floors = h('div', { class: 'pe-floors', role: 'group', 'aria-label': 'Katlar' },
      E.floors.slice().reverse().map((f) => {
        const i = pe.floorIndex(E, f.id);
        return h('button', { key: f.id, type: 'button', class: 'pe-fl' + (f.id === fid ? ' on' : ''), 'aria-pressed': String(f.id === fid), title: f.name, onclick: () => ctl().peSetFid(f.id) }, i === 0 ? 'Z' : String(i));
      }),
      h('button', { type: 'button', class: 'pe-fl pe-fl-add', title: 'Kat ekle', 'aria-label': 'Kat ekle', disabled: E.floors.length >= pe.LIM.floors, onclick: () => ctl().peFloorAdd(false) }, '+'));
    const viewTog = h('div', { class: 'pe-vt' },
      ui.segmented({ label: 'Görünüm', value: v.view, options: [{ v: '2d', label: '2B' }, { v: '3d', label: '3B' }], onchange: (x) => ctl().peView(x) }),
      !is2 ? ui.segmented({ label: '3B görünüm', value: v.v3, options: [{ v: 'iso', label: 'İzometrik', title: 'Kesit alınmış izometrik' }, { v: 'walk', label: 'Yürüyüş', title: 'Perspektif · W A S D / oklar / fare' }, { v: 'mass', label: 'Kütle' }], onchange: (x) => ctl().peV3(x) }) : null);
    const sel1 = v.sel.length === 1 ? v.sel[0] : null;
    let chipTxt = null;
    if (is2 && sel1) {
      const kd = KIND[sel1.charAt(0)], o = E[kd] && E[kd].find((q) => q.id === sel1.slice(2));
      if (o && kd === 'rooms') { const r = D.roomBy[o.id]; chipTxt = [o.name, r ? pe.fmtArea(r.area, E.unit) + ' · ' + pe.fmtLen(r.net.w, E.unit) + ' × ' + pe.fmtLen(r.net.d, E.unit) : '']; }
      else if (o && kd === 'objs') chipTxt = [o.k === 'ozel' ? o.name : (pe.FURN_BY[o.k] || {}).label, pe.fmtLen(o.w, E.unit) + ' × ' + pe.fmtLen(o.d, E.unit)];
      else if (o && kd === 'ops') chipTxt = [(pe.OP_BY[o.k + ':' + o.sub] || {}).label, pe.fmtLen(o.w, E.unit) + ' × ' + pe.fmtLen(o.h, E.unit)];
    }
    const chip = chipTxt ? h('div', { class: 'an-chip pe-chip' }, h('b', {}, chipTxt[0]), h('span', { class: 'mono' }, chipTxt[1]),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => ctl().peSel([]) }, ui.icon('close', 14))) : v.sel.length > 1 && is2 ? h('div', { class: 'an-chip pe-chip' }, h('b', {}, v.sel.length + ' öğe seçili'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => ctl().peSel([]) }, ui.icon('close', 14))) : null;
    const empty = !has && is2 ? ui.emptyCard('Plan boş', P.spaces.length ? 'İşlev Şeması’ndaki mekânları ölçülü plana dönüştürün ya da aşağıdaki araç çubuğundan mekân ekleyerek sıfırdan çizin.' : 'Aşağıdaki araç çubuğundan “Mekânlar” menüsünü açın, bir mekân seçip plana tıklayın.', [
      ui.btn('Programdan plan oluştur', { icon: 'layout', cls: 'btn-primary', onclick: () => ctl().peFromProgram(), disabled: !P.spaces.length }),
      ui.btn('Mekân ekle', { icon: 'plus', onclick: () => ctl().peMenu('rooms') })], 'pe-empty') : null;
    const bot = Math.max(2, ((App.sheet.H - (App.sheet.tb.y - 22)) / App.sheet.H) * 100);
    const stage = h('div', { class: 'board-stage pe-stage' + (is2 ? '' : ' is-3d'), key: 'pe-stage', style: { '--pe-bot': (is2 ? bot : 0).toFixed(2) + '%' } }, stageMain, floors, viewTog, chip, empty, pop, dock,
      is2 && (v.place || v.tool === 'wall' || v.tool === 'rail' || v.tool === 'cam') ? h('div', { class: 'pe-hint-chip', role: 'status' }, v.tool === 'wall' || v.tool === 'rail' ? 'Başlangıç noktasına tıklayın, sonra uç noktalara · çift tık / Esc bitirir · Alt: yakalama kapalı'
        : v.tool === 'cam' ? 'Kameranın duracağı yere tıklayıp bakış yönüne sürükleyin'
          : v.place && v.place.t === 'room' ? 'Plana tıklayın ya da sürükleyerek boyutlandırın · Shift: art arda · Esc: vazgeç'
            : v.place && v.place.t === 'op' ? 'Duvarın üzerine tıklayın · Esc: vazgeç'
              : 'Yerleştirmek için tıklayın · Shift: art arda · Alt: duvara yaslama kapalı · Esc: vazgeç') : null);

    const tools = [];
    tools.push({ k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => ctl().dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
      { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => ctl().dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' }, { k: 'sep' });
    if (is2) {
      tools.push({ k: 'icon', label: 'Yakınlaştır', icon: 'plus', onclick: () => zoomBtn(1.4), title: 'Yakınlaştır' },
        { k: 'icon', label: 'Uzaklaştır', icon: 'shrink', onclick: () => zoomBtn(1 / 1.4), title: 'Uzaklaştır' },
        { k: 'icon', label: 'Sığdır', icon: 'expand', onclick: () => ctl().peCamReset(), disabled: v.cam.k === 1 && !v.cam.dx && !v.cam.dy, title: 'Tüm planı sığdır' }, { k: 'sep' },
        { k: 'icon', label: 'Kaplamalar', icon: 'image', pressed: !!v.fin, onclick: () => ctl().peUi({ fin: !v.fin }), title: 'Zemin kaplamalarını renk ve desenle göster' },
        { k: 'icon', label: 'Izgara', icon: 'grid', pressed: !!v.grid, onclick: () => ctl().peUi({ grid: !v.grid }) },
        { k: 'icon', label: 'Nesneler', icon: 'rect', pressed: !!v.objs, onclick: () => ctl().peUi({ objs: !v.objs }), title: 'Mobilya ve donatıyı göster / gizle' },
        { k: 'icon', label: 'Adlar', icon: 'draw', pressed: !!v.names, onclick: () => ctl().peUi({ names: !v.names }), title: 'Mekân adlarını göster / gizle' },
        { k: 'icon', label: 'Ölçüler', icon: 'link', pressed: !!v.dims, onclick: () => ctl().peUi({ dims: !v.dims }), title: 'Toplam ölçü çizgilerini göster / gizle' }, { k: 'sep' },
        { k: 'icon', label: 'Hepsini seç', icon: 'selall', onclick: () => ctl().peSel(D.rooms.map((r) => 'r:' + r.id).concat(D.objs.map((o) => 'n:' + o.id))), disabled: !D.rooms.length, title: 'Ctrl+A' },
        { k: 'icon', label: 'Sil', icon: 'trash', onclick: () => ctl().peDelSel(), disabled: !v.sel.length, title: 'Seçileni sil (Delete)' });
    } else {
      tools.push({ k: 'icon', label: 'Görünümü sıfırla', icon: 'reset', onclick: () => ctl().peUi({ yaw: 0.6, pitch: 0.62, zoom: 1, tx: 0, tz: 0 }), title: 'Kamerayı sıfırla' });
    }
    tools.push({ k: 'sep' }, { k: 'btn', label: 'DXF', icon: 'download', onclick: () => ctl().peDxf(), disabled: !has || !!state.ui.busy, title: 'Plan DXF (metre): duvar, kapı, pencere, mobilya, merdiven katmanları' });

    return ui.boardPage(state, d, {
      label: 'Plan editörü paftası',
      stage: stage,
      scale: is2 ? D.f.name + ' · ' + (M.score == null ? 'plan boş' : 'skor %' + M.score) + (v.cam.k !== 1 ? ' · ×' + fmt(v.cam.k, 1) : '') : D.f.name + ' · ' + (v.v3 === 'walk' ? 'yürüyüş' : v.v3 === 'mass' ? 'kütle' : 'kesit izometrik'),
      foot: h('p', { class: 'board-hint' }, is2
        ? 'Mekânı ya da nesneyi sürükleyin · tutamaçlarla boyutlandırın, yuvarlak tutamaçla döndürün · kapı ve pencere duvar boyunca kayar · R döndürür, F / M kapıyı çevirir · Delete siler · Ctrl+D çoğaltır · tekerlek yakınlaştırır'
        : v.v3 === 'walk' ? 'Fareyle etrafa bakın · W A S D / oklar ile yürüyün (Shift hızlı) · tekerlek ileri-geri' : 'Sürükleyerek döndürün · Shift / sağ tuş ile kaydırın · tekerlek yakınlaştırır · yakın cepheler kesitle alçaltılır'),
      tools: tools,
    });
  };
})();
