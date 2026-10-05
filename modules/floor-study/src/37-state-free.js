/* ==========================================================================
   37-state-free.js — Mekân Etüdü serbest düzen: eylemler (reducer eklentisi) ve JSON uzantısı
   Veri project.study.free içinde durur; geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır.
   Eylemler: FREE_SET {id, patch} · FREE_SET_LIVE {id, patch} · FREE_OPTS {patch}
             FREE_AUTO · FREE_RESET · FREE_FIT {id} · FREE_FIT_ALL · FREE_ATTACH {id, to, away}
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const st = App.study;

  const withFree = (P, free) => Object.assign({}, P, { study: Object.assign({}, P.study, { free: free }) });

  /* mekân listesi değişince serbest düzeni eşitle */
  function needsSync(P) {
    const f = P.study.free;
    if (!f || !f.shapes) return true;
    let n = 0;
    for (let i = 0; i < P.spaces.length; i++) { if (!f.shapes[P.spaces[i].id]) return true; n++; }
    return Object.keys(f.shapes).length !== n;
  }
  function sync(P) {
    let free = P.study.free && P.study.free.shapes ? P.study.free : null;
    if (!free) return withFree(P, st.freeInit(P));
    const ids = new Set(P.spaces.map((s) => s.id));
    const shapes = {};
    Object.keys(free.shapes).forEach((id) => { if (ids.has(id)) shapes[id] = free.shapes[id]; });
    free = Object.assign({}, free, { shapes: shapes });
    free = st.freeAdd(P, free);
    return withFree(P, free);
  }

  S.hooks.push(function (next, a, prev) {
    let P = next.project;
    let state = next;
    if (!P.study) return undefined; // kat etüdü kancası oluşturur
    if (needsSync(P)) { P = sync(P); state = Object.assign({}, state, { project: P }); }
    const apply = (project, history) => (history ? Object.assign(S.withHistory(state, project), { selectedId: state.selectedId }) : Object.assign({}, state, { project: project }));
    const free = P.study.free;
    const setOne = (id, patch, history) => {
      const spaces = P.spaces.find((s) => s.id === id);
      if (!spaces || !free || !free.shapes[id]) return null;
      const cur = free.shapes[id];
      const nxt = st.freeClean(patch, cur);
      if (Object.keys(nxt).every((k) => nxt[k] === cur[k])) return null;
      return apply(withFree(P, Object.assign({}, free, { shapes: Object.assign({}, free.shapes, { [id]: nxt }) })), history);
    };

    switch (a.type) {
      case 'FREE_SET': { const r = setOne(a.id, a.patch, true); return r || (state === next ? undefined : state); }
      case 'FREE_SET_LIVE': { const r = setOne(a.id, a.patch, false); return r || (state === next ? undefined : state); }
      case 'FREE_OPTS': {
        const snap = a.patch && [0.1, 0.5, 1].indexOf(a.patch.snap) >= 0 ? a.patch.snap : free.snap;
        return apply(withFree(P, Object.assign({}, free, { snap: snap })), false);
      }
      case 'FREE_AUTO': return apply(withFree(P, Object.assign({}, free, { shapes: st.freeAutoPlace(P.spaces, P.relations, free.shapes) })), true);
      case 'FREE_RESET': return apply(withFree(P, Object.assign({}, st.freeInit(P), { snap: free.snap })), true);
      case 'FREE_FIT': {
        const s = P.spaces.find((x) => x.id === a.id);
        if (!s || !free.shapes[a.id]) return state === next ? undefined : state;
        return apply(withFree(P, Object.assign({}, free, { shapes: Object.assign({}, free.shapes, { [a.id]: st.freeClean(st.freeFit(free.shapes[a.id], s.area)) }) })), true);
      }
      case 'FREE_FIT_ALL': {
        const shapes = {};
        P.spaces.forEach((s) => { shapes[s.id] = st.freeClean(st.freeFit(free.shapes[s.id], s.area)); });
        return apply(withFree(P, Object.assign({}, free, { shapes: shapes })), true);
      }
      case 'FREE_ATTACH': {
        const f = free.shapes[a.id], o = free.shapes[a.to];
        if (!f || !o || a.id === a.to) return state === next ? undefined : state;
        return apply(withFree(P, Object.assign({}, free, { shapes: Object.assign({}, free.shapes, { [a.id]: st.freeClean(st.freeAttach(f, o, !!a.away)) }) })), true);
      }
      default:
    }
    return state === next ? undefined : state;
  });

  /* ---------- JSON uzantısı: extensions.spaceStudy ---------- */
  const r2 = (v) => Math.round(v * 100) / 100;
  st.toFreeExt = function (project) {
    if (!project.study || !project.study.free) return {};
    const d = st.freeDerive(project);
    const m = d.metrics;
    return {
      spaceStudy: {
        version: 1,
        unit: 'm',
        snap: project.study.free.snap,
        spaces: d.items.map((it) => ({
          spaceId: it.id, name: it.name, zone: it.zone, programArea: r2(it.target), area: r2(it.area),
          shape: it.shape, rotation: it.rot * 90, cut: it.cut, x: r2(it.x), y: r2(it.y), width: r2(it.w), depth: r2(it.h),
          polygon: it.ring.map((p) => [r2(p[0]), r2(p[1])]),
        })),
        relations: d.pairs.map((p) => ({ a: p.a, b: p.b, type: p.type, state: p.state, gap: r2(p.gap), contact: r2(p.contact) })),
        metrics: { spaceStudyScore: m.score, relationFit: m.relScore == null ? null : r2(m.relScore), overlapCount: m.overlapCount, overlapArea: r2(m.overlapArea), areaFit: r2(m.areaFit), totalArea: r2(m.total), footprint: { width: r2(d.bounds.w), depth: r2(d.bounds.h) } },
      },
    };
  };
  App.extProviders.push(st.toFreeExt);

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext, project) {
    const x = ext && ext.spaceStudy;
    if (!x || !Array.isArray(x.spaces)) return {};
    const base = project.study || st.init(project);
    const ids = new Set(project.spaces.map((s) => s.id));
    const shapes = {};
    x.spaces.forEach((q) => {
      if (!q || !ids.has(String(q.spaceId))) return;
      shapes[String(q.spaceId)] = st.freeClean({ x: q.x, y: q.y, w: q.width, h: q.depth, shape: q.shape, rot: Math.round((Number(q.rotation) || 0) / 90), cut: q.cut });
    });
    const snap = [0.1, 0.5, 1].indexOf(Number(x.snap)) >= 0 ? Number(x.snap) : 0.5;
    return { study: Object.assign({}, base, { free: { snap: snap, shapes: shapes } }) };
  });
})();
