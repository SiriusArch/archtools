/* ==========================================================================
   39-state-plan.js — Vaziyet Planı eylemleri (reducer eklentisi) ve JSON uzantısı
   Veri project.plan içinde durur; geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır.
   Eylemler:
     PLAN_SET {patch}  PLAN_SET_LIVE {patch}     başlık, stil, gölge, ızgara, yakalama (ölçek ve görünüm: PLAN_VIEW)
     PLAN_VIEW {patch}                           ölçek, merkez (geri alma noktası açmaz)
     PLAN_EL_ADD {el}  PLAN_EL_ADD_MANY {els}  PLAN_EL_SET {id, patch}  PLAN_EL_SET_LIVE {id, patch}
     PLAN_EL_DEL {id}  PLAN_EL_DUP {id}  PLAN_EL_ORDER {id, dir}
     PLAN_LOAD {els, merge, fit}                 örnek / diğer modüllerden içe alma
     PLAN_CLEAR
   JSON uzantısı: extensions.sitePlan
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const plan = App.plan;

  const withPlan = (P, p) => Object.assign({}, P, { plan: p });
  const r1 = (v) => Math.round(v * 10) / 10;

  S.hooks.push(function (next, a, prev) {
    let P = next.project;
    let state = next;
    if (!plan) return undefined;
    if (!P.plan || !Array.isArray(P.plan.els)) { P = withPlan(P, plan.defaults()); state = Object.assign({}, state, { project: P }); }
    const same = () => (state === next ? undefined : state);
    if (!a.type || a.type.indexOf('PLAN_') !== 0) return same();
    const p = P.plan;
    const apply = (np, history) => (history ? Object.assign(S.withHistory(state, withPlan(P, np)), { selectedId: state.selectedId }) : Object.assign({}, state, { project: withPlan(P, np) }));
    const setEls = (els, history) => apply(Object.assign({}, p, { els: els.slice(0, 1800) }), history);

    switch (a.type) {
      case 'PLAN_SET':
      case 'PLAN_SET_LIVE': {
        const o = plan.cleanDoc(Object.assign({}, p, a.patch || {}, { els: p.els }));
        o.cx = p.cx; o.cy = p.cy; o.scale = p.scale;
        return apply(o, a.type === 'PLAN_SET');
      }
      case 'PLAN_VIEW': {
        const q = a.patch || {};
        const o = Object.assign({}, p);
        if (q.scale != null && plan.SCALES.indexOf(Number(q.scale)) >= 0) o.scale = Number(q.scale);
        if (q.cx != null) o.cx = r1(U.clamp(Number(q.cx) || 0, -8000, 8000));
        if (q.cy != null) o.cy = r1(U.clamp(Number(q.cy) || 0, -8000, 8000));
        if (o.scale === p.scale && o.cx === p.cx && o.cy === p.cy) return same();
        return apply(o, false);
      }
      case 'PLAN_EL_ADD': {
        const el = plan.clean(a.el);
        if (!el) return same();
        const r = setEls(p.els.concat([el]), true);
        r.selectedId = el.id;
        return r;
      }
      case 'PLAN_EL_ADD_MANY': {
        const els = (a.els || []).map((e) => plan.clean(e)).filter(Boolean);
        if (!els.length) return same();
        return setEls(p.els.concat(els), true);
      }
      case 'PLAN_EL_SET':
      case 'PLAN_EL_SET_LIVE': {
        const el = p.els.find((e) => e.id === a.id);
        if (!el) return same();
        const nx = plan.clean(el, a.patch);
        if (!nx) return same();
        if (Object.keys(nx).every((k) => nx[k] === el[k])) return same();
        return setEls(p.els.map((e) => (e.id === a.id ? nx : e)), a.type === 'PLAN_EL_SET');
      }
      case 'PLAN_EL_DEL': {
        if (!p.els.some((e) => e.id === a.id)) return same();
        const r = setEls(p.els.filter((e) => e.id !== a.id), true);
        if (state.selectedId === a.id) r.selectedId = null;
        return r;
      }
      case 'PLAN_EL_DUP': {
        const el = p.els.find((e) => e.id === a.id);
        if (!el) return same();
        const off = Math.max(2, p.snap * 3);
        const cp = plan.clean(Object.assign({}, el, { id: 'p' + Math.random().toString(36).slice(2, 8) }), plan.moveEl(el, off, off));
        const r = setEls(p.els.concat([cp]), true);
        r.selectedId = cp.id;
        return r;
      }
      case 'PLAN_EL_ORDER': {
        const i = p.els.findIndex((e) => e.id === a.id);
        const j = i + (a.dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= p.els.length) return same();
        const els = p.els.slice();
        const t = els[i]; els[i] = els[j]; els[j] = t;
        return setEls(els, true);
      }
      case 'PLAN_LOAD': {
        const incoming = (a.els || []).map((e) => plan.clean(e)).filter(Boolean);
        if (!incoming.length) return same();
        const els = a.merge ? p.els.concat(incoming) : incoming;
        const o = Object.assign({}, p, { els: els.slice(0, 1800) });
        if (a.fit !== false) { const f = plan.fit(o.els); o.cx = f.cx; o.cy = f.cy; }
        if (a.scale && plan.SCALES.indexOf(a.scale) >= 0) o.scale = a.scale;
        return Object.assign(apply(o, true), { selectedId: null });
      }
      case 'PLAN_CLEAR':
        return Object.assign(apply(Object.assign({}, plan.defaults(), { title: p.title, style: p.style }), true), { selectedId: null });
      default:
    }
    return same();
  });

  /* ---------- JSON uzantısı: extensions.sitePlan ---------- */
  const r2 = (v) => Math.round(v * 100) / 100;
  plan.toExt = function (project) {
    const p = project.plan;
    if (!p || !p.els.length) return {};
    const M = plan.metrics(p);
    return {
      sitePlan: {
        version: 1, unit: 'm', title: p.title, scale: p.scale, center: [p.cx, p.cy], style: p.style, snap: p.snap, grid: p.grid, shadow: p.shadow, labels: p.labels,
        elements: p.els.map((e) => {
          if (e.t === 'tree') return { type: 'tree', id: e.id, x: e.x, y: e.y, radius: e.r };
          if (e.t === 'text') return { type: 'text', id: e.id, x: e.x, y: e.y, text: e.s, size: e.size };
          const o = { type: e.t, id: e.id, points: e.pts.map((q) => [q[0], q[1]]) };
          if (e.t === 'bld') { o.floors = e.floors; o.kind = e.k; o.area = r2(plan.geo.area(e.pts)); }
          if (e.t === 'road') { o.width = e.w; o.kind = e.k; o.smooth = e.smooth; }
          if (e.t === 'green') { o.kind = e.k; o.smooth = e.smooth; }
          if (e.t === 'water' || e.t === 'plaza') o.smooth = e.smooth;
          return o;
        }),
        metrics: { parcelArea: r2(M.boundArea), newFootprint: r2(M.newFoot), newGrossFloorArea: r2(M.newGfa), coverageTaks: M.taks == null ? null : r2(M.taks), floorAreaKaks: M.kaks == null ? null : r2(M.kaks), greenArea: r2(M.green), roadLength: r2(M.roadLen), pathLength: r2(M.pathLen), treeCount: M.trees, newBuildings: M.nNew, existingBuildings: M.nOld },
      },
    };
  };
  App.extProviders.push(plan.toExt);

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext) {
    const x = ext && ext.sitePlan;
    if (!x || !Array.isArray(x.elements)) return {};
    const els = x.elements.map((e) => {
      const id = e.id ? String(e.id).slice(0, 12) : 'p' + Math.random().toString(36).slice(2, 8);
      if (e.type === 'tree') return { id: id, t: 'tree', x: e.x, y: e.y, r: e.radius };
      if (e.type === 'text') return { id: id, t: 'text', x: e.x, y: e.y, s: e.text, size: e.size };
      if (!plan.TYPES[e.type]) return null;
      return { id: id, t: e.type, pts: e.points, floors: e.floors, k: e.kind, w: e.width, smooth: e.smooth };
    }).filter(Boolean);
    const doc = plan.cleanDoc({ title: x.title, scale: x.scale, cx: x.center && x.center[0], cy: x.center && x.center[1], style: x.style, snap: x.snap, grid: x.grid, shadow: x.shadow, labels: x.labels, els: els });
    return { plan: doc };
  });
})();
