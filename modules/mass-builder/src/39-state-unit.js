/* ==========================================================================
   39-state-unit.js — Birim Oluşturucu eylemleri (reducer eklentisi) ve JSON uzantısı
   Veri project.unit içinde durur; geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır.
   Eylemler:
     UNIT_SET {patch}  UNIT_SET_LIVE {patch}        başlık, parsel ölçüsü, çevre dokusu, yakalama
     UNIT_GO {i}                                    adıma git (geri alma noktası açmaz)
     UNIT_STEP_ADD {blank}  UNIT_STEP_DEL {i}  UNIT_STEP_MOVE {i, dir}  UNIT_STEP_SET {i, patch}
     UNIT_EL_ADD {el}  UNIT_EL_SET {id, patch}  UNIT_EL_SET_LIVE {id, patch}  UNIT_EL_DEL {id}
     UNIT_EL_DUP {id}  UNIT_EL_SPLIT {id, axis, ratio, gap}  UNIT_EL_ORDER {id, dir}
     UNIT_PRESET {kind}  UNIT_RESET
   JSON uzantısı: extensions.massBuilder
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const unit = App.unit;

  const r1 = (v) => Math.round(v * 10) / 10;
  const withUnit = (P, u) => Object.assign({}, P, { unit: u });
  const curStep = (u) => u.steps[Math.min(u.cur, u.steps.length - 1)];
  const setStep = (u, i, fn) => Object.assign({}, u, { steps: u.steps.map((s, k) => (k === i ? fn(s) : s)) });
  const setCur = (u, fn) => setStep(u, Math.min(u.cur, u.steps.length - 1), fn);

  /* parsel ölçüsü / tohum / yoğunluk → çevre dokusu yeniden üretilir */
  function cleanSite(u, patch) {
    const o = Object.assign({}, u);
    if (patch.title != null) o.title = String(patch.title).slice(0, 60);
    if (patch.snap != null) o.snap = [0.1, 0.5, 1, 2].indexOf(patch.snap) >= 0 ? patch.snap : u.snap;
    let regen = false;
    if (patch.site) {
      const w = U.clamp(Math.round(Number(patch.site.w) * 2) / 2 || u.site.w, 10, 300);
      const d = U.clamp(Math.round(Number(patch.site.d) * 2) / 2 || u.site.d, 10, 300);
      if (w !== u.site.w || d !== u.site.d) { o.site = { w: w, d: d }; regen = true; }
    }
    if (patch.ctxSeed != null && patch.ctxSeed !== u.ctxSeed) { o.ctxSeed = Math.max(1, Math.round(patch.ctxSeed)); regen = true; }
    if (patch.ctxDens != null && patch.ctxDens !== u.ctxDens) { o.ctxDens = U.clamp(Number(patch.ctxDens), 0, 1); regen = true; }
    if (regen) o.ctx = unit.genCtx(o.site, o.ctxSeed, o.ctxDens);
    return o;
  }

  S.hooks.push(function (next, a, prev) {
    let P = next.project;
    let state = next;
    if (!unit) return undefined;
    if (!P.unit || !P.unit.steps || !P.unit.steps.length) { P = withUnit(P, unit.init(P)); state = Object.assign({}, state, { project: P }); }
    const same = () => (state === next ? undefined : state);
    if (!a.type || a.type.indexOf('UNIT_') !== 0) return same();
    const u = P.unit;
    const apply = (nu, history) => (history ? Object.assign(S.withHistory(state, withUnit(P, nu)), { selectedId: state.selectedId }) : Object.assign({}, state, { project: withUnit(P, nu) }));
    const ci = Math.min(u.cur, u.steps.length - 1);
    const step = u.steps[ci];

    switch (a.type) {
      case 'UNIT_SET': return apply(cleanSite(u, a.patch), true);
      case 'UNIT_SET_LIVE': return apply(cleanSite(u, a.patch), false);
      case 'UNIT_GO': {
        const i = U.clamp(Math.round(a.i), 0, u.steps.length - 1);
        if (i === u.cur) return same();
        return Object.assign(apply(Object.assign({}, u, { cur: i }), false), { selectedId: null });
      }
      case 'UNIT_STEP_ADD': {
        const ns = unit.newStep('Adım ' + (u.steps.length + 1), '', '', a.blank ? [] : unit.cloneEls(step.els));
        const steps = u.steps.slice(0, ci + 1).concat([ns], u.steps.slice(ci + 1)).slice(0, 12);
        if (steps.length === u.steps.length) return same();
        return Object.assign(apply(Object.assign({}, u, { steps: steps, cur: ci + 1 }), true), { selectedId: null });
      }
      case 'UNIT_STEP_DEL': {
        if (u.steps.length <= 1) return same();
        const i = U.clamp(a.i == null ? ci : a.i, 0, u.steps.length - 1);
        const steps = u.steps.filter((s, k) => k !== i);
        return Object.assign(apply(Object.assign({}, u, { steps: steps, cur: i < u.cur ? u.cur - 1 : Math.min(u.cur, steps.length - 1) }), true), { selectedId: null });
      }
      case 'UNIT_STEP_MOVE': {
        const i = a.i == null ? ci : a.i, j = i + (a.dir < 0 ? -1 : 1);
        if (j < 0 || j >= u.steps.length) return same();
        const steps = u.steps.slice();
        const t = steps[i]; steps[i] = steps[j]; steps[j] = t;
        return apply(Object.assign({}, u, { steps: steps, cur: u.cur === i ? j : u.cur === j ? i : u.cur }), true);
      }
      case 'UNIT_STEP_SET': {
        const i = a.i == null ? ci : a.i;
        const p = a.patch || {};
        return apply(setStep(u, i, (s) => Object.assign({}, s, p.title != null ? { title: String(p.title).slice(0, 40) } : {}, p.sub != null ? { sub: String(p.sub).slice(0, 40) } : {}, p.desc != null ? { desc: String(p.desc).slice(0, 400) } : {})), !a.live);
      }
      case 'UNIT_EL_ADD': {
        const el = unit.clean(a.el);
        if (!el) return same();
        const r = apply(setCur(u, (s) => Object.assign({}, s, { els: s.els.concat([el]).slice(0, 400) })), true);
        r.selectedId = el.id;
        return r;
      }
      case 'UNIT_EL_ADD_MANY': {
        const els = (a.els || []).map((e) => unit.clean(e)).filter(Boolean);
        if (!els.length) return same();
        return apply(setCur(u, (s) => Object.assign({}, s, { els: s.els.concat(els).slice(0, 400) })), true);
      }
      case 'UNIT_EL_SET':
      case 'UNIT_EL_SET_LIVE': {
        const el = step.els.find((e) => e.id === a.id);
        if (!el) return same();
        const nx = unit.clean(el, a.patch);
        if (Object.keys(nx).every((k) => nx[k] === el[k])) return same();
        return apply(setCur(u, (s) => Object.assign({}, s, { els: s.els.map((e) => (e.id === a.id ? nx : e)) })), a.type === 'UNIT_EL_SET');
      }
      case 'UNIT_EL_DEL': {
        if (!step.els.some((e) => e.id === a.id)) return same();
        const r = apply(setCur(u, (s) => Object.assign({}, s, { els: s.els.filter((e) => e.id !== a.id) })), true);
        if (state.selectedId === a.id) r.selectedId = null;
        return r;
      }
      case 'UNIT_EL_DUP': {
        const el = step.els.find((e) => e.id === a.id);
        if (!el) return same();
        const off = u.snap >= 1 ? 3 : 2;
        const cp = unit.clean(Object.assign({}, el, { id: 'u' + Math.random().toString(36).slice(2, 8) }), el.t === 'arrow' ? { x1: el.x1 + off, y1: el.y1 + off, x2: el.x2 + off, y2: el.y2 + off } : { x: el.x + off, y: el.y + off });
        const r = apply(setCur(u, (s) => Object.assign({}, s, { els: s.els.concat([cp]) })), true);
        r.selectedId = cp.id;
        return r;
      }
      case 'UNIT_EL_SPLIT': {
        const el = step.els.find((e) => e.id === a.id);
        if (!el || el.t !== 'mass') return same();
        const parts = unit.split(el, a.axis, a.ratio, a.gap).map((p) => unit.clean(p));
        const r = apply(setCur(u, (s) => Object.assign({}, s, { els: s.els.filter((e) => e.id !== a.id).concat(parts) })), true);
        r.selectedId = parts[0].id;
        return r;
      }
      case 'UNIT_EL_ORDER': {
        const i = step.els.findIndex((e) => e.id === a.id);
        const j = i + (a.dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= step.els.length) return same();
        const els = step.els.slice();
        const t = els[i]; els[i] = els[j]; els[j] = t;
        return apply(setCur(u, (s) => Object.assign({}, s, { els: els })), true);
      }
      case 'UNIT_PRESET': {
        const steps = unit.preset(a.kind, u);
        return Object.assign(apply(Object.assign({}, u, { steps: steps, cur: 0 }), true), { selectedId: null });
      }
      case 'UNIT_RESET': {
        const nu = unit.init(P);
        nu.title = u.title;
        return Object.assign(apply(nu, true), { selectedId: null });
      }
      default:
    }
    return same();
  });

  /* ---------- JSON uzantısı: extensions.massBuilder ---------- */
  const r2 = (v) => Math.round(v * 100) / 100;
  unit.toExt = function (project) {
    const u = project.unit;
    if (!u) return {};
    const hasWork = u.steps.length > 1 || u.steps[0].els.length > 0;
    if (!hasWork) return {};
    return {
      massBuilder: {
        version: 1,
        unit: 'm',
        title: u.title,
        site: { width: u.site.w, depth: u.site.d },
        context: { seed: u.ctxSeed, density: u.ctxDens, buildings: u.ctx.map((c) => ({ x: c.x, y: c.y, width: c.w, depth: c.d, height: c.h })) },
        snap: u.snap,
        currentStep: u.cur,
        steps: u.steps.map((s) => {
          const M = unit.metrics(u, s);
          return {
            title: s.title, subtitle: s.sub, description: s.desc,
            elements: s.els.map((e) => {
              if (e.t === 'mass') return { type: 'mass', id: e.id, x: e.x, y: e.y, width: e.w, depth: e.d, shape: e.shape, rotation: e.rot * 90, cut: e.cut, floors: e.floors, roof: e.roof, height: r2(e.floors * unit.FH), area: r2(unit.massArea(e)), polygon: unit.ring(e).map((q) => [r2(q[0]), r2(q[1])]) };
              if (e.t === 'arrow') return { type: 'arrow', id: e.id, kind: e.k, from: [e.x1, e.y1], to: [e.x2, e.y2] };
              if (e.t === 'tree') return { type: 'tree', id: e.id, x: e.x, y: e.y, radius: e.r };
              if (e.t === 'green') return { type: 'green', id: e.id, x: e.x, y: e.y, width: e.w, depth: e.d, round: e.round };
              return { type: 'void', id: e.id, x: e.x, y: e.y, width: e.w, depth: e.d };
            }),
            metrics: { siteArea: r2(M.siteArea), footprint: r2(M.footprint), grossFloorArea: r2(M.gfa), coverageTaks: r2(M.taks), floorAreaKaks: r2(M.kaks), maxFloors: M.maxFloors, maxHeight: r2(M.maxHeight), massCount: M.masses, greenShare: r2(M.greenShare), openArea: r2(M.openArea), treeCount: M.trees },
          };
        }),
      },
    };
  };
  App.extProviders.push(unit.toExt);

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext, project) {
    const x = ext && ext.massBuilder;
    if (!x || !Array.isArray(x.steps) || !x.steps.length) return {};
    const site = { w: U.clamp(Number(x.site && x.site.width) || 60, 10, 300), d: U.clamp(Number(x.site && x.site.depth) || 60, 10, 300) };
    const seed = x.context && x.context.seed ? Math.max(1, Math.round(x.context.seed)) : 3;
    const dens = x.context && isFinite(x.context.density) ? U.clamp(Number(x.context.density), 0, 1) : 0.7;
    const ctx = x.context && Array.isArray(x.context.buildings) && x.context.buildings.length
      ? x.context.buildings.map((c) => ({ id: 'c' + Math.random().toString(36).slice(2, 7), x: Number(c.x) || 0, y: Number(c.y) || 0, w: Number(c.width) || 10, d: Number(c.depth) || 10, h: Number(c.height) || 9.6 }))
      : unit.genCtx(site, seed, dens);
    const steps = x.steps.slice(0, 12).map((s) => unit.newStep(s.title, s.subtitle, s.description, (s.elements || []).map((e) => {
      const id = e.id ? String(e.id).slice(0, 12) : 'u' + Math.random().toString(36).slice(2, 8);
      if (e.type === 'mass') return unit.clean({ id: id, t: 'mass' }, { x: e.x, y: e.y, w: e.width, d: e.depth, shape: e.shape, rot: Math.round((Number(e.rotation) || 0) / 90), cut: e.cut, floors: e.floors, roof: e.roof });
      if (e.type === 'arrow') return unit.clean({ id: id, t: 'arrow' }, { k: e.kind, x1: e.from && e.from[0], y1: e.from && e.from[1], x2: e.to && e.to[0], y2: e.to && e.to[1] });
      if (e.type === 'tree') return unit.clean({ id: id, t: 'tree' }, { x: e.x, y: e.y, r: e.radius });
      if (e.type === 'green') return unit.clean({ id: id, t: 'green' }, { x: e.x, y: e.y, w: e.width, d: e.depth, round: e.round });
      if (e.type === 'void') return unit.clean({ id: id, t: 'void' }, { x: e.x, y: e.y, w: e.width, d: e.depth });
      return null;
    }).filter(Boolean)));
    return { unit: { v: 1, title: String(x.title || '').slice(0, 60), site: site, ctxSeed: seed, ctxDens: dens, ctx: ctx, steps: steps, cur: U.clamp(Math.round(Number(x.currentStep) || 0), 0, steps.length - 1), snap: [0.1, 0.5, 1, 2].indexOf(Number(x.snap)) >= 0 ? Number(x.snap) : 1 } };
  });
  void r1;
})();
