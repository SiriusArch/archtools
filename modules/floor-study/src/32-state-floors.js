/* ==========================================================================
   32-state-floors.js — kat etüdü eylemleri (reducer eklentisi) ve JSON uzantısı
   Kat etüdü verisi proje içinde project.study olarak durur; böylece geri al/ileri al,
   otomatik kayıt ve JSON içe/dışa aktarma Modül 1 ile aynı akışı kullanır.
   Eylemler: STUDY_FLOORS {count} · STUDY_SET / STUDY_SET_LIVE {patch} · STUDY_ASSIGN {id, floorId}
             STUDY_MOVE_BY {id, dir} · STUDY_AUTO · STUDY_RENAME {id, name}
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const st = App.study;

  /* ---------- mekân listesi değişince atamaları eşitle ---------- */
  function needsSync(P) {
    const a = P.study.assign;
    const floorIds = P.study.floors.map((f) => f.id);
    const one = floorIds.length === 1;
    let count = 0;
    for (let i = 0; i < P.spaces.length; i++) {
      const s = P.spaces[i];
      const has = s.id in a;
      if (!one && st.isCore(s)) { if (has) return true; continue; }
      if (!has || floorIds.indexOf(a[s.id]) < 0) return true;
      count++;
    }
    return Object.keys(a).length !== count;
  }

  function syncProject(P) {
    const study = P.study;
    const floors = study.floors;
    const one = floors.length === 1;
    const ids = new Set(P.spaces.map((s) => s.id));
    const assign = {};
    Object.keys(study.assign).forEach((id) => { if (ids.has(id) && floors.some((f) => f.id === study.assign[id])) assign[id] = study.assign[id]; });
    if (one) P.spaces.forEach((s) => { assign[s.id] = floors[0].id; });
    else {
      P.spaces.forEach((s) => { if (st.isCore(s)) delete assign[s.id]; });
      const fresh = P.spaces.filter((s) => !(s.id in assign) && !st.isCore(s));
      if (fresh.length) {
        const all = st.autoAssign(P.spaces, P.relations, floors);
        fresh.forEach((s) => { assign[s.id] = all[s.id]; });
      }
    }
    return Object.assign({}, P, { study: Object.assign({}, study, { assign: assign }) });
  }

  const withStudy = (P, patch) => Object.assign({}, P, { study: Object.assign({}, P.study, patch) });

  S.hooks.push(function (next, a, prev) {
    let P = next.project;
    let state = next;
    if (!P.study) { P = Object.assign({}, P, { study: st.init(P) }); state = Object.assign({}, state, { project: P }); }
    const apply = (project, history) => (history ? Object.assign(S.withHistory(state, project), { selectedId: state.selectedId }) : Object.assign({}, state, { project: project }));

    switch (a.type) {
      case 'STUDY_FLOORS': {
        const n = U.clamp(Math.round(a.count), 1, 6);
        if (n === P.study.floors.length) return state === next ? undefined : state;
        const floors = st.makeFloors(n, P.study.floors);
        return apply(withStudy(P, { floors: floors, assign: st.autoAssign(P.spaces, P.relations, floors), auto: false }), true);
      }
      case 'STUDY_SET': return apply(withStudy(P, a.patch), true);
      case 'STUDY_SET_LIVE': return apply(withStudy(P, a.patch), false);
      case 'STUDY_AUTO': return apply(withStudy(P, { assign: st.autoAssign(P.spaces, P.relations, P.study.floors) }), true);
      case 'STUDY_ASSIGN': {
        if (!P.study.floors.some((f) => f.id === a.floorId) || P.study.assign[a.id] === a.floorId) return state === next ? undefined : state;
        return apply(withStudy(P, { assign: Object.assign({}, P.study.assign, { [a.id]: a.floorId }) }), true);
      }
      case 'STUDY_MOVE_BY': {
        const fl = P.study.floors;
        const cur = fl.findIndex((f) => f.id === P.study.assign[a.id]);
        const to = U.clamp(cur + a.dir, 0, fl.length - 1);
        if (to === cur) return state === next ? undefined : state;
        return apply(withStudy(P, { assign: Object.assign({}, P.study.assign, { [a.id]: fl[to].id }) }), true);
      }
      case 'STUDY_RENAME': {
        const name = String(a.name || '').trim().slice(0, 24);
        return apply(withStudy(P, { floors: P.study.floors.map((f) => (f.id === a.id ? Object.assign({}, f, { name: name || st.floorName(P.study.floors.indexOf(f)) }) : f)) }), true);
      }
      default:
    }
    if (needsSync(P)) { P = syncProject(P); return Object.assign({}, state, { project: P }); }
    return state === next ? undefined : state;
  });

  /* ---------- JSON uzantısı: extensions.floorStudy ---------- */
  const r2 = (v) => Math.round(v * 100) / 100;
  st.toExt = function (project) {
    if (!project.study) return {};
    const d = st.derive(project);
    const p = d.plan, m = d.metrics;
    return {
      floorStudy: {
        version: 1,
        floors: project.study.floors.map((f) => ({ id: f.id, name: f.name })),
        assignments: Object.keys(project.study.assign).map((id) => ({ spaceId: id, floorId: project.study.assign[id] })),
        typology: project.study.typology, plateRatio: project.study.ratio,
        core: { auto: !!project.study.core.auto, area: r2(project.study.core.area) },
        plan: {
          unit: 'm', width: r2(p.Wp), depth: r2(p.Dp), plateArea: r2(p.plateArea), coreArea: r2(p.coreArea),
          floors: p.floors.map((f) => ({
            id: f.id, name: f.name, netArea: r2(f.net), voidArea: r2(f.void),
            blocks: f.blocks.map((b) => ({ id: b.id, kind: b.kind, spaceId: b.spaceId || null, name: b.name, zone: b.zone, area: r2(b.area), x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h) })),
          })),
        },
        metrics: { floorStudyScore: m.score, floorBalance: r2(m.balance), fillRatio: r2(m.fill), wetStackAlignment: m.wetAlign == null ? null : r2(m.wetAlign), strongRelationsSameFloor: m.strongSame, strongRelationsTotal: m.strongTotal },
      },
    };
  };

  App.extProviders.push(st.toExt);

  st.fromExt = function (x, project) {
    try {
      const fl = Array.isArray(x.floors) ? x.floors.slice(0, 6) : [];
      if (!fl.length) throw new Error('kat yok');
      const floors = fl.map((f, i) => ({ id: String(f.id || 'f' + i), name: String(f.name || st.floorName(i)).slice(0, 24) }));
      if (new Set(floors.map((f) => f.id)).size !== floors.length) throw new Error('kat kimlikleri tekrarlı');
      const assign = {};
      (x.assignments || []).forEach((q) => { if (floors.some((f) => f.id === q.floorId)) assign[String(q.spaceId)] = q.floorId; });
      return {
        floors: floors, assign: assign,
        typology: x.typology === 'koridor' ? 'koridor' : 'serbest',
        ratio: U.clamp(Number(x.plateRatio) || 1.5, 1, 3),
        core: { auto: x.core ? x.core.auto !== false : true, area: U.clamp(Number(x.core && x.core.area) || 16, 4, 200) },
        auto: false,
      };
    } catch (e) { return st.init(project); }
  };
})();
