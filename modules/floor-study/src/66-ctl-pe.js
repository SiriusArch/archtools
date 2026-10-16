/* ==========================================================================
   66-ctl-pe.js — Plan Editörü yan etkileri: görünüm durumu, seçim, ekleme / silme / çoğaltma, döşeme, kapı-pencere otomatiği,
   klavye kısayolları, dışa aktarma (PNG · PDF · 3B PNG · DXF) ve eylem köprüsü
   Seçim anahtarları: 'r:' oda · 'o:' açıklık · 'n:' nesne · 'm:' merdiven · 'g:' korkuluk · 't:' etiket · 'w:' serbest duvar
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const pe = App.pe;
  const get = () => App.store.get();
  const KIND = { r: 'rooms', o: 'ops', n: 'objs', m: 'stairs', g: 'rails', t: 'labels', w: 'walls' };
  const PFX = { rooms: 'r', ops: 'o', objs: 'n', stairs: 'm', rails: 'g', labels: 't', walls: 'w' };

  /* ---------------- görünüm durumu ---------------- */
  App.peDefaults = () => ({
    fid: null, sel: [], tool: 'sel', place: null, view: '2d', v3: 'iso', cam: { k: 1, dx: 0, dy: 0 },
    yaw: 0.6, pitch: 0.62, zoom: 1, tx: 0, tz: 0, walk: null,
    fin: true, grid: true, names: true, dims: true, objs: true, menu: null, q: '', tab: 'plan', hover: null, draft: null, mq: null,
  });
  const PV = ctl.makeView('pe', 'archtools.view.pe', ['view', 'v3', 'fin', 'grid', 'names', 'dims', 'objs', 'yaw', 'pitch', 'zoom']);
  ctl.peUi = PV.set;
  ctl.loadPeView = function () {
    PV.load(function (o) {
      const p = {};
      if (o.view === '2d' || o.view === '3d') p.view = o.view;
      if (['iso', 'walk', 'mass'].indexOf(o.v3) >= 0) p.v3 = o.v3;
      ['fin', 'grid', 'names', 'dims', 'objs'].forEach((k) => { if (typeof o[k] === 'boolean') p[k] = o[k]; });
      if (typeof o.yaw === 'number') p.yaw = o.yaw;
      if (typeof o.pitch === 'number') p.pitch = U.clamp(o.pitch, 0.15, 1.45);
      if (typeof o.zoom === 'number') p.zoom = U.clamp(o.zoom, 0.3, 6);
      return p;
    });
  };
  const E = () => pe.get(get().project);
  const fidOf = (S) => { const v = (S || get()).ui.pe || {}; const e = pe.get((S || get()).project); return e.floors.some((f) => f.id === v.fid) ? v.fid : e.floors[0].id; };
  ctl.peFid = fidOf;
  ctl.peSetFid = (id) => ctl.peUi({ fid: id, sel: [], draft: null }, true);
  ctl.peSel = (list) => ctl.peUi({ sel: list || [] }, true);
  ctl.peMenu = (m) => ctl.peUi({ menu: get().ui.pe.menu === m ? null : m, q: '' }, true);
  ctl.peTool = (tool, place) => ctl.peUi({ tool: tool, place: place || null, draft: null, menu: null, sel: tool === 'sel' && !place ? get().ui.pe.sel : [] }, true);
  ctl.peView = (v) => ctl.peUi({ view: v, menu: null }, false);
  /* yürüyüş başlangıcı: en büyük mekânın merkezi, en uzun boş bakış doğrultusu */
  function bestWalk(D) {
    const room = D.rooms.slice().sort((a, b) => b.area - a.area)[0];
    if (!room) return { x: 0, y: 0, yaw: 0, pitch: 0 };
    const clear = (yaw) => {
      const dx = Math.sin(yaw), dy = -Math.cos(yaw);
      for (let t = 0.2; t < 25; t += 0.1) {
        const x = room.cx + dx * t, y = room.cy + dy * t;
        if (D.walls.some((w) => { const l2 = w.len * w.len; const s = l2 < 1e-9 ? 0 : U.clamp(((x - w.x1) * w.ux + (y - w.y1) * w.uy) / w.len, 0, w.len); return Math.hypot(x - (w.x1 + w.ux * s), y - (w.y1 + w.uy * s)) < w.t / 2; })) return t;
      }
      return 25;
    };
    // köşeden odanın merkezine bak: en uzun görüş mesafesi
    let best = null;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((q) => {
      const x = room.cx + q[0] * Math.max(0.2, room.net.w / 2 - 0.7), y = room.cy + q[1] * Math.max(0.2, room.net.d / 2 - 0.7);
      const yaw = Math.atan2(room.cx - x, -(room.cy - y));
      let d = 0; for (let t = 0.2; t < 25; t += 0.1) { const px = x + Math.sin(yaw) * t, py = y - Math.cos(yaw) * t; if (D.walls.some((w) => { const s2 = U.clamp(((px - w.x1) * w.ux + (py - w.y1) * w.uy), 0, w.len); return Math.hypot(px - (w.x1 + w.ux * s2), py - (w.y1 + w.uy * s2)) < w.t / 2; })) break; d = t; }
      if (!best || d > best.d) best = { x: x, y: y, yaw: yaw, pitch: 0, d: d };
    });
    return { x: best.x, y: best.y, yaw: best.yaw, pitch: 0 };
  }
  ctl.peV3 = (m) => {
    const S = get(), v = S.ui.pe;
    const patch = { view: '3d', v3: m, menu: null };
    if (m === 'walk' && !v.walk) {
      const d = pe.derive(S.project), D = d.by[fidOf(S)];
      const e = pe.get(S.project);
      const c = e.cam && e.cam.f === fidOf(S) && (e.cam.x || e.cam.y) ? e.cam : null;
      patch.walk = c ? { x: c.x, y: c.y, yaw: c.yaw, pitch: 0 } : bestWalk(D);
    }
    ctl.peUi(patch, false);
  };
  ctl.peWalk = function (patch, persist) {
    const S = get(), w = Object.assign({}, S.ui.pe.walk || { x: 0, y: 0, yaw: 0, pitch: 0 }, patch);
    w.pitch = U.clamp(w.pitch || 0, -1.2, 1.2);
    ctl.peUi({ walk: w }, true);
    if (persist) ctl.dispatch({ type: 'PE_CAM', patch: { x: pe.r2(w.x), y: pe.r2(w.y), yaw: w.yaw, f: fidOf(S) } });
  };
  ctl.peCam2d = (patch) => ctl.peUi({ cam: Object.assign({}, get().ui.pe.cam, patch) }, true);
  ctl.peCamReset = () => ctl.peUi({ cam: { k: 1, dx: 0, dy: 0 } }, true);

  /* ---------------- canlı düzenleme: ilk harekette tek geri-al noktası ---------------- */
  let live = false;
  ctl.peLiveBegin = function () { if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); } };
  ctl.peLiveEnd = function () { live = false; };

  /* ---------------- ekleme ---------------- */
  const snapV = (v) => pe.snapV(v, E().snap);
  ctl.peRoomAt = function (type, cx, cy, w, d) {
    const S = get(), e = E(), t = pe.ROOM_BY[type];
    if (!t) return null;
    const ww = w || t.def[0], dd = d || t.def[1];
    const r = pe.newRoom(e, { f: fidOf(S), type: type, x: snapV(cx - ww / 2), y: snapV(cy - dd / 2), w: ww, d: dd });
    ctl.dispatch({ type: 'PE_ADD', kind: 'rooms', items: [r] });
    ctl.peSel(['r:' + r.id]);
    return r;
  };
  ctl.peObjAt = function (k, x, y, rot, extra) {
    const c = pe.FURN_BY[k];
    if (!c) return null;
    const o = Object.assign({ id: pe.nid('n'), f: fidOf(), k: k, x: pe.r3(x), y: pe.r3(y), rot: rot || 0, w: c.w, d: c.d, h: c.h, fin: null, auto: false }, extra || {});
    ctl.dispatch({ type: 'PE_ADD', kind: 'objs', items: [o] });
    ctl.peSel(['n:' + o.id]);
    return o;
  };
  ctl.peOpAt = function (k, sub, hit) {
    const def = pe.OP_BY[k + ':' + sub];
    if (!def || !hit) return null;
    const o = { id: pe.nid('o'), f: fidOf(), k: k, sub: sub, x: pe.r3(hit.x), y: pe.r3(hit.y), rot: hit.rot, w: def.w, h: def.h, sill: def.sill, flip: false, mir: false, fin: null };
    ctl.dispatch({ type: 'PE_ADD', kind: 'ops', items: [o] });
    ctl.peSel(['o:' + o.id]);
    return o;
  };
  ctl.peStairAt = function (sub, x, y, rot) {
    const s = { id: pe.nid('m'), f: fidOf(), sub: sub, x: pe.r3(x), y: pe.r3(y), rot: rot || 0, w: (pe.STAIRS.find((q) => q.sub === sub) || { w: 1.1 }).w, steps: 0 };
    ctl.dispatch({ type: 'PE_ADD', kind: 'stairs', items: [s] });
    ctl.peSel(['m:' + s.id]);
    return s;
  };
  ctl.peLineAdd = function (kind, x1, y1, x2, y2) {
    const f = fidOf();
    if (Math.hypot(x2 - x1, y2 - y1) < 0.1) return;
    if (kind === 'walls') ctl.dispatch({ type: 'PE_ADD', kind: 'walls', items: [{ id: pe.nid('w'), f: f, x1: x1, y1: y1, x2: x2, y2: y2, t: E().wall.int }] });
    else ctl.dispatch({ type: 'PE_ADD', kind: 'rails', items: [{ id: pe.nid('g'), f: f, x1: x1, y1: y1, x2: x2, y2: y2, h: 1.0 }] });
  };
  ctl.peLabelAt = function (x, y, text) { const t = { id: pe.nid('t'), f: fidOf(), x: pe.r3(x), y: pe.r3(y), text: text || 'Not' }; ctl.dispatch({ type: 'PE_ADD', kind: 'labels', items: [t] }); ctl.peSel(['t:' + t.id]); };

  /* ---------------- güncelleme · silme · çoğaltma ---------------- */
  ctl.peSet = (kind, id, patch) => ctl.dispatch({ type: 'PE_SET', kind: kind, id: id, patch: patch });
  ctl.peSetLive = function (kind, id, patch) { ctl.peLiveBegin(); ctl.dispatch({ type: 'PE_SET_LIVE', kind: kind, id: id, patch: patch }); };
  const split = (sel) => { const m = {}; (sel || []).forEach((k) => { const kd = KIND[k.charAt(0)]; if (kd) (m[kd] = m[kd] || []).push(k.slice(2)); }); return m; };
  ctl.peDelSel = function () {
    const sel = get().ui.pe.sel;
    if (!sel.length) return;
    const m = split(sel);
    if (m.rooms) ctl.dispatch({ type: 'PE_DEL_ROOM', ids: m.rooms });
    Object.keys(m).forEach((kd) => { if (kd !== 'rooms') ctl.dispatch({ type: 'PE_DEL', kind: kd, ids: m[kd] }); });
    ctl.peSel([]);
  };
  ctl.peDup = function () {
    const S = get(), sel = S.ui.pe.sel, e = E();
    const out = [];
    const m = split(sel);
    const sh = 0.6;
    Object.keys(m).forEach((kd) => {
      const items = e[kd].filter((q) => m[kd].indexOf(q.id) >= 0);
      if (kd === 'ops') return;
      const cp = items.map((q) => {
        const n = Object.assign({}, q, { id: pe.nid(PFX[kd]) });
        if (kd === 'walls' || kd === 'rails') { n.x1 += sh; n.x2 += sh; n.y1 += sh; n.y2 += sh; } else { n.x = pe.r3(q.x + sh); n.y = pe.r3(q.y + sh); }
        if (kd === 'rooms') n.space = null;
        return n;
      });
      if (cp.length) { ctl.dispatch({ type: 'PE_ADD', kind: kd, items: cp }); cp.forEach((q) => out.push(PFX[kd] + ':' + q.id)); }
    });
    if (out.length) ctl.peSel(out);
  };
  ctl.peRotate = function () {
    const S = get(), sel = S.ui.pe.sel, e = E();
    sel.forEach((k) => {
      const id = k.slice(2), kd = KIND[k.charAt(0)];
      if (kd === 'objs') { const o = e.objs.find((q) => q.id === id); if (o) ctl.peSet('objs', id, { rot: (o.rot + 90) % 360 }); }
      else if (kd === 'stairs') { const o = e.stairs.find((q) => q.id === id); if (o) ctl.peSet('stairs', id, { rot: (o.rot + 90) % 360 }); }
      else if (kd === 'rooms') {
        const r = e.rooms.find((q) => q.id === id);
        if (r) { const cx = r.x + r.w / 2, cy = r.y + r.d / 2; ctl.dispatch({ type: 'PE_ROOM_RESIZE', id: id, nr: { x: snapV(cx - r.d / 2), y: snapV(cy - r.w / 2), w: r.d, d: r.w } }); }
      }
    });
  };
  ctl.peFlip = function (mir) {
    const e = E();
    get().ui.pe.sel.forEach((k) => { if (k.charAt(0) !== 'o') return; const o = e.ops.find((q) => q.id === k.slice(2)); if (o) ctl.peSet('ops', o.id, mir ? { mir: !o.mir } : { flip: !o.flip }); });
  };
  ctl.peNudge = function (dx, dy) {
    const S = get(), e = E(), sn = e.snap;
    ctl.peLiveBegin();
    S.ui.pe.sel.forEach((k) => {
      const id = k.slice(2), kd = KIND[k.charAt(0)];
      if (kd === 'rooms') ctl.dispatch({ type: 'PE_ROOM_MOVE_LIVE', id: id, dx: dx * sn, dy: dy * sn });
      else if (kd === 'objs' || kd === 'stairs' || kd === 'labels') { const o = e[kd].find((q) => q.id === id); if (o) ctl.dispatch({ type: 'PE_SET_LIVE', kind: kd, id: id, patch: { x: pe.r3(o.x + dx * sn), y: pe.r3(o.y + dy * sn) } }); }
    });
    ctl.peLiveEnd();
  };

  /* ---------------- kat ---------------- */
  ctl.peFloorAdd = function (copy) { ctl.dispatch({ type: 'PE_FLOOR_ADD', copy: !!copy }); ctl.toast('Yeni kat eklendi.', 'success'); };
  ctl.peFloorDel = function (id) {
    const e = E();
    if (e.floors.length < 2) return;
    ctl.dispatch({ type: 'PE_FLOOR_DEL', id: id });
    ctl.peUi({ fid: null, sel: [] }, true);
    ctl.toast('Kat silindi. Geri al ile döndürebilirsiniz.', 'info');
  };
  ctl.peFloorSet = (id, patch) => ctl.dispatch({ type: 'PE_FLOOR_SET', id: id, patch: patch });
  ctl.peFin = (scope, id, slot, mat) => ctl.dispatch({ type: 'PE_FLOOR_FIN', scope: scope, id: id, slot: slot, mat: mat });
  ctl.peStyleApply = function (style, scope, id) {
    if (scope === 'room') ctl.peSet('rooms', id, { style: style, fin: {} });
    else if (scope === 'floor') ctl.dispatch({ type: 'PE_FLOOR_SET', id: id, patch: { style: style, fin: {} } });
    else ctl.dispatch({ type: 'PE_PATCH', patch: { style: style, fin: {} } });
    // genel stilde kat ve oda üstüne yazmaları temizle
    if (scope === 'all') {
      const e = E();
      ctl.dispatch({ type: 'PE_SET_MANY', kind: 'rooms', ids: e.rooms.map((r) => r.id), patch: { style: null, fin: {} } });
      e.floors.forEach((f) => ctl.dispatch({ type: 'PE_FLOOR_SET', id: f.id, patch: { style: null, fin: {} } }));
    }
  };

  /* ---------------- otomatikler ---------------- */
  ctl.peFurnish = function (rid) {
    const S = get(), before = E().objs.length;
    ctl.dispatch({ type: 'PE_FURNISH', rid: rid || null, fid: fidOf(S) });
    const n = E().objs.length - before;
    ctl.toast(n > 0 ? n + ' nesne yerleştirildi. Sürükleyerek yerini değiştirin.' : 'Bu mekân için yerleştirilecek nesne bulunamadı.', n > 0 ? 'success' : 'info');
  };
  ctl.peUnfurnish = function (rid) { ctl.dispatch({ type: 'PE_UNFURNISH', rid: rid || null, fid: fidOf() }); ctl.toast('Nesneler kaldırıldı.', 'info'); };
  ctl.peAutoOps = function () {
    ctl.dispatch({ type: 'PE_AUTO_OPS', fid: fidOf() });
    const m = pe.derive(get().project).metrics;
    ctl.toast('Kapı ve pencereler yerleştirildi · ' + m.doors + ' kapı, ' + m.windows + ' pencere.', 'success');
  };
  ctl.peFromProgram = function () {
    const P = get().project;
    if (!P.spaces.length) { ctl.toast('Önce İşlev Şeması’nda mekân ekleyin.', 'error'); return; }
    ctl.dispatch({ type: 'PE_FROM_PROGRAM', opts: {} });
    ctl.peUi({ view: '2d', cam: { k: 1, dx: 0, dy: 0 } }, true);
    ctl.toast('Program plana dönüştürüldü: ' + E().rooms.length + ' mekân, kapı ve pencereler yerleştirildi. Geri al ile önceki plana dönebilirsiniz.', 'success');
  };
  ctl.peClear = function (floorOnly) { ctl.dispatch({ type: 'PE_CLEAR', fid: floorOnly ? fidOf() : null }); ctl.peSel([]); ctl.toast('Plan temizlendi. Geri al ile döndürebilirsiniz.', 'info'); };
  ctl.peSettings = (patch) => ctl.dispatch({ type: 'PE_PATCH', patch: patch });
  ctl.peShow = function (t) {
    if (!t) return;
    if (t.f) ctl.peUi({ fid: t.f }, true);
    const pfx = t.k === 'op' ? 'o' : t.k === 'obj' ? 'n' : 'r';
    ctl.peUi({ fid: t.f || fidOf(), view: '2d', sel: [pfx + ':' + t.id] }, true);
  };

  /* ---------------- klavye ---------------- */
  document.addEventListener('keydown', function (e) {
    const S = get();
    if (S.ui.module !== 'kat' || App.study.modeOf(S) !== 'plan') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    const v = S.ui.pe, k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    if (v.view === '3d') {
      if (v.v3 !== 'walk') return;
      const w = v.walk || { x: 0, y: 0, yaw: 0, pitch: 0 };
      const st = e.shiftKey ? 0.7 : 0.25, fx = Math.sin(w.yaw), fy = -Math.cos(w.yaw), sx = Math.cos(w.yaw), sy = Math.sin(w.yaw);
      let p = null;
      if (lk === 'w' || k === 'ArrowUp') p = { x: w.x + fx * st, y: w.y + fy * st };
      else if (lk === 's' || k === 'ArrowDown') p = { x: w.x - fx * st, y: w.y - fy * st };
      else if (lk === 'a') p = { x: w.x - sx * st, y: w.y - sy * st };
      else if (lk === 'd') p = { x: w.x + sx * st, y: w.y + sy * st };
      else if (k === 'ArrowLeft' || lk === 'q') p = { yaw: w.yaw - 0.12 };
      else if (k === 'ArrowRight' || lk === 'e') p = { yaw: w.yaw + 0.12 };
      if (p) { e.preventDefault(); ctl.peWalk(p, true); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && lk === 'd') { e.preventDefault(); ctl.peDup(); return; }
    if ((e.ctrlKey || e.metaKey) && lk === 'a') {
      e.preventDefault();
      const D = pe.derive(S.project).by[fidOf(S)];
      ctl.peSel(D.rooms.map((r) => 'r:' + r.id).concat(D.objs.map((o) => 'n:' + o.id)));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'Escape') { if (v.draft || v.place || v.tool !== 'sel' || v.menu) ctl.peUi({ draft: null, place: null, tool: 'sel', menu: null }, true); else ctl.peSel([]); return; }
    if (k === 'Delete' || k === 'Backspace') { if (v.sel.length) { e.preventDefault(); ctl.peDelSel(); } return; }
    if (lk === 'r') { e.preventDefault(); ctl.peRotate(); return; }
    if (lk === 'f') { ctl.peFlip(false); return; }
    if (lk === 'm') { ctl.peFlip(true); return; }
    if (lk === 'v') { ctl.peTool('sel'); return; }
    if (lk === 'w') { ctl.peTool('wall'); return; }
    if (lk === 'g') { ctl.peTool('rail'); return; }
    if (lk === 'h') { ctl.peTool('pan'); return; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[k] && v.sel.length) { e.preventDefault(); ctl.peNudge(dirs[k][0] * (e.shiftKey ? 5 : 1), dirs[k][1] * (e.shiftKey ? 5 : 1)); }
  });

  /* ---------------- dışa aktarma ---------------- */
  function run(label, make) {
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    let p;
    try { p = make(get().project); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then((r) => ctl.report(r, label + ' hazır')).catch((err) => ctl.report({ ok: false, message: err && err.message }));
  }
  const baseKat = ctl.exporters.kat;
  ctl.exporters.kat = function (kind) {
    if (App.study.modeOf(get()) !== 'plan') { baseKat(kind); return; }
    const S = get(), v = S.ui.pe;
    if (!pe.get(S.project).rooms.length) { ctl.toast('Önce plana mekân ekleyin.', 'error'); return; }
    if (v.view === '3d' && kind === 'png' && pe.cur3d) {
      run('PNG', (P) => {
        const url = pe.cur3d.capture();
        return fetch(url).then((r) => r.blob()).then((b) => App.files.saveBlob(U.slug(P.meta.name) + '-plan-3b-' + v.v3 + '.png', b));
      });
      return;
    }
    run(kind === 'png' ? 'PNG' : 'PDF', (P) => {
      const sc = pe.scene(P, { fid: fidOf(S), fin: v.fin, grid: false, names: v.names, dims: v.dims, objs: v.objs, live: false });
      return App.sheet.exportScene(sc.prims, App.sheet.W, App.sheet.H, P.meta.name + '-plan-' + (pe.get(P).floors.find((f) => f.id === fidOf(S)) || { name: 'kat' }).name, kind);
    });
  };

  const DXF_LAYERS = {
    ZEMIN: { color: 8, label: 'Mekân sınırları (net)' }, DUVAR: { color: 7, label: 'Duvarlar' }, KAPI: { color: 3, label: 'Kapılar' }, PENCERE: { color: 5, label: 'Pencereler' },
    MOBILYA: { color: 8, label: 'Mobilya ve donatı' }, MERDIVEN: { color: 4, label: 'Merdivenler' }, KORKULUK: { color: 6, label: 'Korkuluklar' }, YAZI: { color: 7, label: 'Yazılar' }, OLCU: { color: 8, label: 'Ölçüler' },
  };
  function dxfDoc(P) {
    const d = pe.derive(P), E0 = d.E;
    const doc = { title: P.meta.name, units: 'm', layers: DXF_LAYERS, entities: [] };
    let ox = 0;
    d.floors.forEach((D) => {
      const b = D.bounds;
      const H = b.y1;
      const fp = (x, y) => [x - b.x0 + ox, H - y];
      const poly = (layer, pts, closed) => doc.entities.push({ layer: layer, kind: 'poly', closed: closed !== false, pts: pts.map((q) => fp(q[0], q[1])) });
      const line = (layer, a, c) => doc.entities.push({ layer: layer, kind: 'line', pts: [fp(a[0], a[1]), fp(c[0], c[1])] });
      D.rooms.forEach((r) => {
        poly('ZEMIN', [[r.net.x, r.net.y], [r.net.x + r.net.w, r.net.y], [r.net.x + r.net.w, r.net.y + r.net.d], [r.net.x, r.net.y + r.net.d]]);
        const fs = Math.max(0.15, Math.min(0.3, Math.min(r.net.w, r.net.d) / 9));
        const c = fp(r.cx, r.cy);
        doc.entities.push({ layer: 'YAZI', kind: 'text', at: [c[0], c[1] + fs * 0.7], text: r.name, h: fs, align: 'center' });
        doc.entities.push({ layer: 'YAZI', kind: 'text', at: [c[0], c[1] - fs * 0.7], text: U.fmt(r.area, 1) + ' m2', h: fs * 0.8, align: 'center' });
      });
      D.walls.forEach((w) => poly('DUVAR', pe.wallPoly(w)));
      D.ops.forEach((o) => {
        if (o.orphan) return;
        if (o.k === 'pencere') {
          [0.3, 0, -0.3].forEach((f) => line('PENCERE', [o.ax + o.nx * o.t * f, o.ay + o.ny * o.t * f], [o.bx + o.nx * o.t * f, o.by + o.ny * o.t * f]));
          return;
        }
        const hx = o.mir ? o.bx : o.ax, hy = o.mir ? o.by : o.ay, sg = o.flip ? -1 : 1;
        line('KAPI', [hx, hy], [hx + o.nx * sg * o.w, hy + o.ny * sg * o.w]);
        const a0 = Math.atan2(o.nx * sg, o.ny * 0 + 0) * 0;
        void a0;
        const ex = o.mir ? o.ax : o.bx, ey = o.mir ? o.ay : o.by;
        const pts = [];
        const v1 = [o.nx * sg, o.ny * sg], v2 = [(ex - hx) / o.w, (ey - hy) / o.w];
        for (let i = 0; i <= 12; i++) {
          const t = (i / 12) * Math.PI / 2;
          pts.push([hx + (v1[0] * Math.cos(t) + v2[0] * Math.sin(t)) * o.w, hy + (v1[1] * Math.cos(t) + v2[1] * Math.sin(t)) * o.w]);
        }
        poly('KAPI', pts, false);
      });
      D.objs.forEach((o) => poly('MOBILYA', o.fp));
      D.stairs.forEach((s) => {
        pe.stairSteps(s, D.f.h).steps.forEach((q) => {
          poly('MERDIVEN', [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]].map((p) => { const r = pe.rotPt(p[0], p[1], s.rot); return [s.x + r[0], s.y + r[1]]; }));
        });
      });
      D.rails.forEach((r) => line('KORKULUK', [r.x1, r.y1], [r.x2, r.y2]));
      D.labels.forEach((l) => { const c = fp(l.x, l.y); doc.entities.push({ layer: 'YAZI', kind: 'text', at: c, text: l.text, h: 0.25, align: 'center' }); });
      const t = fp(b.x0, b.y0);
      doc.entities.push({ layer: 'YAZI', kind: 'text', at: [t[0], t[1] + 0.8], text: D.f.name + ' (kot ' + U.fmt(D.elev, 2) + ')', h: 0.4 });
      ox += b.w + 6;
    });
    void E0;
    return doc;
  }
  ctl.peDxf = function () {
    const P = get().project;
    if (!pe.get(P).rooms.length) { ctl.toast('Önce plana mekân ekleyin.', 'error'); return; }
    run('DXF', (p) => (App.dxf ? ctl.saveText(U.slug(p.meta.name) + '-plan.dxf', App.dxf.build(dxfDoc(p)), 'application/dxf') : Promise.reject(new Error('DXF yazıcısı yüklenemedi.'))));
  };

  /* asistan kartı eylemi */
  const baseRun = ctl.runAction;
  ctl.runAction = function (a) {
    if (a.type === 'peShow') { ctl.peShow(a.target); return; }
    baseRun(a);
  };
})();
