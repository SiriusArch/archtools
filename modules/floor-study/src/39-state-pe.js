/* ==========================================================================
   39-state-pe.js — Plan Editörü: eylemler (reducer eklentisi) ve JSON uzantısı
   Veri project.study.pe içinde durur (geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır).
   Eylemler (*_LIVE: geri-al noktası açmaz; sürükleme sırasında önce SNAPSHOT gönderilir)
     PE_PATCH {patch} · PE_PATCH_LIVE — genel ayar (snap, unit, wall, style, fin)
     PE_ADD {kind, items[]} — kind: rooms | walls | ops | objs | stairs | rails | labels
     PE_SET {kind, id, patch} · PE_SET_LIVE · PE_SET_MANY {kind, ids[], patch} · PE_DEL {kind, ids[]}
     PE_ROOM_MOVE {id, dx, dy} · PE_ROOM_MOVE_LIVE · PE_ROOM_RESIZE {id, nr} · PE_ROOM_RESIZE_LIVE
     PE_FLOOR_ADD · PE_FLOOR_SET {id, patch} · PE_FLOOR_DEL {id} · PE_FLOOR_FIN {id, slot, mat}
     PE_FURNISH {rid} (rid yoksa tüm kat) · PE_UNFURNISH {rid, fid} · PE_AUTO_OPS {fid} · PE_FROM_PROGRAM {opts} · PE_CLEAR {fid}
     PE_CAM {patch}
   JSON uzantısı: extensions.planEditor (sürüm 1)
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const pe = App.pe;

  const withPe = (P, E) => Object.assign({}, P, { study: Object.assign({}, P.study, { pe: E }) });
  const KINDS = ['rooms', 'walls', 'ops', 'objs', 'stairs', 'rails', 'labels'];

  S.hooks.push(function (next, a) {
    if (!/^PE_/.test(a.type)) return undefined;
    const P = next.project;
    if (!P.study) return undefined;
    const E = pe.get(P);
    const live = /_LIVE$/.test(a.type);
    const out = (E2, history) => {
      if (E2 === E) return next;
      const P2 = withPe(P, pe.clean(E2));
      return history ? Object.assign(S.withHistory(next, P2), { selectedId: next.selectedId }) : Object.assign({}, next, { project: P2 });
    };
    const mapKind = (kind, fn) => (KINDS.indexOf(kind) < 0 ? null : Object.assign({}, E, { [kind]: fn(E[kind]) }));

    switch (a.type) {
      case 'PE_PATCH': case 'PE_PATCH_LIVE': {
        const p = a.patch || {};
        const E2 = Object.assign({}, E, p);
        if (p.wall) E2.wall = Object.assign({}, E.wall, p.wall);
        return out(E2, !live);
      }
      case 'PE_ADD': {
        const items = (a.items || []).filter(Boolean);
        const E2 = mapKind(a.kind, (arr) => arr.concat(items));
        return E2 ? out(E2, true) : next;
      }
      case 'PE_SET': case 'PE_SET_LIVE': {
        const E2 = mapKind(a.kind, (arr) => arr.map((q) => (q.id === a.id ? Object.assign({}, q, a.patch) : q)));
        return E2 ? out(E2, !live) : next;
      }
      case 'PE_SET_MANY': {
        const ids = new Set(a.ids || []);
        const E2 = mapKind(a.kind, (arr) => arr.map((q) => (ids.has(q.id) ? Object.assign({}, q, a.patch) : q)));
        return E2 ? out(E2, true) : next;
      }
      case 'PE_DEL': {
        const ids = new Set(a.ids || (a.id ? [a.id] : []));
        let E2 = mapKind(a.kind, (arr) => arr.filter((q) => !ids.has(q.id)));
        if (!E2) return next;
        if (a.kind === 'rooms') {
          // silinen odanın duvarına bağlı açıklıklar yetim kalır; kullanıcı görür. Ayrıca kat başına en az bir kat kalır.
          E2 = Object.assign({}, E2);
        }
        return out(E2, true);
      }
      case 'PE_DEL_ROOM': {
        // odayı sil: içindeki nesne / merdiven / etiket ve yalnız bu odaya ait duvarlardaki açıklıklar da gider
        const ids = new Set(a.ids || []);
        const rooms = E.rooms.filter((r) => ids.has(r.id));
        if (!rooms.length) return next;
        const d = pe.derive(P);
        const dropOps = new Set(), dropObjs = new Set();
        d.floors.forEach((D) => {
          D.ops.forEach((o) => { if (o.orphan) return; const w = D.walls.find((q) => q.id === o.wall); if (w && w.rooms.length && w.rooms.every((id) => ids.has(id))) dropOps.add(o.id); });
          D.objs.forEach((o) => { if (o.room && ids.has(o.room)) dropObjs.add(o.id); });
        });
        const inAny = (q) => rooms.some((r) => r.f === q.f && pe.inRect(q.x, q.y, r));
        return out(Object.assign({}, E, {
          rooms: E.rooms.filter((r) => !ids.has(r.id)), ops: E.ops.filter((o) => !dropOps.has(o.id)), objs: E.objs.filter((o) => !dropObjs.has(o.id)),
          stairs: E.stairs.filter((s) => !inAny(s)), labels: E.labels.filter((l) => !inAny(l)),
        }), true);
      }
      case 'PE_ROOM_MOVE': case 'PE_ROOM_MOVE_LIVE': return out(pe.moveRoom(E, a.id, a.dx, a.dy), !live);
      case 'PE_ROOM_RESIZE': case 'PE_ROOM_RESIZE_LIVE': return out(pe.resizeRoom(E, a.id, a.nr), !live);

      case 'PE_FLOOR_ADD': {
        if (E.floors.length >= pe.LIM.floors) return next;
        const id = 'k' + Math.random().toString(36).slice(2, 5);
        const base = E.floors[E.floors.length - 1];
        const fl = { id: id, name: E.floors.length + '. kat', h: base ? base.h : 3, style: null, fin: {} };
        let E2 = Object.assign({}, E, { floors: E.floors.concat([fl]) });
        if (a.copy && base) {
          const dup = (arr) => arr.filter((q) => q.f === base.id).map((q) => Object.assign({}, q, { id: pe.nid(q.id.charAt(0)), f: id }));
          const rooms = dup(E.rooms).map((r) => Object.assign(r, { space: null }));
          E2 = Object.assign(E2, { rooms: E.rooms.concat(rooms), walls: E.walls.concat(dup(E.walls)), ops: E.ops.concat(dup(E.ops).filter((o) => o.k === 'pencere')), objs: E.objs });
        }
        const res = out(E2, true);
        return res === next ? next : Object.assign({}, res, { ui: Object.assign({}, res.ui, { pe: Object.assign({}, res.ui.pe, { fid: id, sel: [] }) }) });
      }
      case 'PE_FLOOR_SET': return out(Object.assign({}, E, { floors: E.floors.map((f) => (f.id === a.id ? Object.assign({}, f, a.patch) : f)) }), true);
      case 'PE_FLOOR_DEL': {
        if (E.floors.length < 2) return next;
        const keep = (arr) => arr.filter((q) => q.f !== a.id);
        return out(Object.assign({}, E, { floors: E.floors.filter((f) => f.id !== a.id), rooms: keep(E.rooms), walls: keep(E.walls), ops: keep(E.ops), objs: keep(E.objs), stairs: keep(E.stairs), rails: keep(E.rails), labels: keep(E.labels) }), true);
      }
      case 'PE_FLOOR_FIN': {
        const fin = (o) => { const f = Object.assign({}, o.fin); if (a.mat) f[a.slot] = a.mat; else delete f[a.slot]; return f; };
        if (a.scope === 'room') return out(Object.assign({}, E, { rooms: E.rooms.map((r) => (r.id === a.id ? Object.assign({}, r, { fin: fin(r) }) : r)) }), true);
        if (a.scope === 'all') return out(Object.assign({}, E, { fin: fin(E) }), true);
        return out(Object.assign({}, E, { floors: E.floors.map((f) => (f.id === a.id ? Object.assign({}, f, { fin: fin(f) }) : f)) }), true);
      }

      case 'PE_FURNISH': {
        const fid = a.fid || (E.rooms.find((r) => r.id === a.rid) || {}).f || E.floors[0].id;
        const D = pe.derive(P).by[fid];
        if (!D) return next;
        const ids = a.rid ? [a.rid] : D.rooms.filter((r) => !r.rt.corridor || true).map((r) => r.id);
        const drop = new Set(ids);
        // yalnızca otomatik yerleştirilmiş eski nesneleri değiştir; elle eklenenler kalır
        let objs = E.objs.filter((o) => !(o.auto && o.f === fid && drop.has((D.objs.find((q) => q.id === o.id) || {}).room)));
        ids.forEach((rid) => { objs = objs.concat(pe.furnishRoom(E, D, rid)); });
        return out(Object.assign({}, E, { objs: objs.slice(0, pe.LIM.objs) }), true);
      }
      case 'PE_UNFURNISH': {
        const fid = a.fid || E.floors[0].id;
        const D = pe.derive(P).by[fid];
        if (!D) return next;
        const room = a.rid;
        const rm = new Set(D.objs.filter((o) => (room ? o.room === room : true)).map((o) => o.id));
        return out(Object.assign({}, E, { objs: E.objs.filter((o) => !(o.f === fid && rm.has(o.id))) }), true);
      }
      case 'PE_AUTO_OPS': return out(Object.assign({}, E, { ops: pe.autoOpenings(P, E, a.fid || E.floors[0].id) }), true);
      case 'PE_FROM_PROGRAM': {
        if (!P.spaces || !P.spaces.length) return next;
        let E2 = pe.fromProgram(P, a.opts || {});
        E2.floors.forEach((f) => { E2 = Object.assign({}, E2, { ops: pe.autoOpenings(P, E2, f.id) }); });
        const res = out(E2, true);
        return res === next ? next : Object.assign({}, res, { ui: Object.assign({}, res.ui, { pe: Object.assign({}, res.ui.pe, { fid: E2.floors[0].id, sel: [] }) }) });
      }
      case 'PE_CLEAR': {
        const fid = a.fid;
        const keep = (arr) => (fid ? arr.filter((q) => q.f !== fid) : []);
        return out(Object.assign({}, E, { rooms: keep(E.rooms), walls: keep(E.walls), ops: keep(E.ops), objs: keep(E.objs), stairs: keep(E.stairs), rails: keep(E.rails), labels: keep(E.labels) }), true);
      }
      case 'PE_CAM': return out(Object.assign({}, E, { cam: Object.assign({}, E.cam, a.patch) }), false);
      default: return next;
    }
  });

  /* ---------------- JSON ---------------- */
  const r2 = pe.r2;
  App.extProviders.push(function (project) {
    const E = project.study && project.study.pe;
    if (!E || !E.rooms || !E.rooms.length) return {};
    const d = pe.derive(project), M = d.metrics;
    const FD = pe.takeoff(project);
    const s2 = (o, keys) => { const out = {}; keys.forEach((k) => { out[k] = o[k]; }); return out; };
    return {
      planEditor: {
        version: 1,
        units: 'm',
        displayUnit: E.unit,
        grid: E.snap,
        wallThickness: E.wall,
        style: E.style,
        finishes: E.fin,
        floors: E.floors.map((f) => ({ id: f.id, name: f.name, height: f.h, style: f.style, finishes: f.fin, elevation: r2(pe.elevOf(E, f.id)) })),
        rooms: E.rooms.map((r) => ({ id: r.id, floorId: r.f, type: r.type, name: r.name, x: r.x, y: r.y, width: r.w, depth: r.d, style: r.style, finishes: r.fin, spaceId: r.space })),
        walls: E.walls.map((w) => ({ id: w.id, floorId: w.f, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, thickness: w.t })),
        openings: E.ops.map((o) => ({ id: o.id, floorId: o.f, kind: o.k === 'kapi' ? 'door' : 'window', subtype: o.sub, x: o.x, y: o.y, rotation: o.rot, width: o.w, height: o.h, sill: o.sill, flip: o.flip, mirror: o.mir, finish: o.fin })),
        objects: E.objs.map((o) => ({ id: o.id, floorId: o.f, type: o.k, x: o.x, y: o.y, rotation: o.rot, width: o.w, depth: o.d, height: o.h, finish: o.fin, auto: o.auto, name: o.name, shape: o.rd, color: o.col })),
        stairs: E.stairs.map((s) => s2(s, ['id', 'f', 'sub', 'x', 'y', 'rot', 'w', 'steps'])),
        railings: E.rails.map((r) => s2(r, ['id', 'f', 'x1', 'y1', 'x2', 'y2', 'h'])),
        labels: E.labels.map((l) => s2(l, ['id', 'f', 'x', 'y', 'text'])),
        camera: E.cam,
        metrics: { planScore: M.score, rooms: M.rooms, netArea: r2(M.net), grossArea: r2(M.gross), doors: M.doors, windows: M.windows, reachability: M.reach == null ? null : r2(M.reach), daylight: M.day == null ? null : r2(M.day), areaFit: M.areaFit == null ? null : r2(M.areaFit), relationFit: M.relFit == null ? null : r2(M.relFit) },
        takeoff: { floors: FD.floors.map((f) => ({ name: f.name, net: r2(f.net), gross: r2(f.gross), wallLength: r2(f.wallLen), exteriorWallLength: r2(f.extLen) })), doors: FD.doors, windows: FD.windows, floorFinishArea: FD.floorArea, wallFinishArea: FD.wallArea },
      },
    };
  });

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext, project) {
    const x = ext && ext.planEditor;
    if (!x || !Array.isArray(x.rooms)) return {};
    const base = project.study || App.study.init(project);
    const E = pe.clean({
      snap: x.grid, unit: x.displayUnit, wall: x.wallThickness, style: x.style, fin: x.finishes,
      floors: (x.floors || []).map((f) => ({ id: f.id, name: f.name, h: f.height, style: f.style, fin: f.finishes })),
      rooms: x.rooms.map((r) => ({ id: r.id, f: r.floorId, type: r.type, name: r.name, x: r.x, y: r.y, w: r.width, d: r.depth, style: r.style, fin: r.finishes, space: r.spaceId })),
      walls: (x.walls || []).map((w) => ({ id: w.id, f: w.floorId, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, t: w.thickness })),
      ops: (x.openings || []).map((o) => ({ id: o.id, f: o.floorId, k: o.kind === 'window' ? 'pencere' : 'kapi', sub: o.subtype, x: o.x, y: o.y, rot: o.rotation, w: o.width, h: o.height, sill: o.sill, flip: o.flip, mir: o.mirror, fin: o.finish })),
      objs: (x.objects || []).map((o) => ({ id: o.id, f: o.floorId, k: o.type, x: o.x, y: o.y, rot: o.rotation, w: o.width, d: o.depth, h: o.height, fin: o.finish, auto: o.auto, name: o.name, rd: o.shape, col: o.color })),
      stairs: x.stairs, rails: x.railings, labels: x.labels, cam: x.camera,
    });
    return { study: Object.assign({}, base, { pe: E }) };
  });
})();
