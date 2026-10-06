/* ==========================================================================
   37-state-free.js — Mekân Etüdü: eylemler (reducer eklentisi) ve JSON uzantısı
   Veri project.study.free içinde durur; geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır.
   Mekân (şekil · boyut · konum · kat · donatı)
     FREE_SET {id, patch} · FREE_SET_LIVE {id, patch} · FREE_MOVE_MANY {spaces, extras, live} · FREE_OPTS {patch} · FREE_AUTO · FREE_RESET
     FREE_FIT {id} · FREE_FIT_ALL · FREE_ATTACH {id, to, away} · FREE_SPREAD {n} (katlara dağıt) · FREE_XFORM {k, ox, oy, nx, ny}
   Donatı
     FREE_FURN_ADD {id, k} · FREE_FURN_SET {id, fid, patch} · FREE_FURN_SET_LIVE · FREE_FURN_DEL {id, fid} · FREE_FURN_AUTO {id} · FREE_FURN_CLEAR {id}
   Ek öğeler (yeşil alan, boşluk, ağaç, ok)
     FREE_EX_ADD {el} · FREE_EX_MANY {els} · FREE_EX_SET {id, patch} · FREE_EX_SET_LIVE · FREE_EX_DEL {id} · FREE_EX_DUP {id}
   Çevre
     FREE_SITE {patch} · FREE_SITE_LIVE · FREE_CTX {patch} · FREE_MAP {patch} · FREE_MAP_LIVE · FREE_LINK {link, org} · FREE_UNLINK
   Adımlar (anlık görüntüler)
     FREE_STEP_ADD {title} · FREE_STEP_SET {i, patch} · FREE_STEP_UPD {i} · FREE_STEP_LOAD {i} · FREE_STEP_DEL {i} · FREE_STEP_MOVE {i, dir}
   Kat eşlemesi: mekânın katı (lv) tek doğrudur; eski "Kat blokları" planının kat listesi ve ataması ondan türetilir,
   o kipte yapılan kat değişiklikleri de lv'ye geri yazılır.
   JSON uzantısı: extensions.spaceStudy (sürüm 2)
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const st = App.study;

  const withFree = (P, free) => Object.assign({}, P, { study: Object.assign({}, P.study, { free: free }) });
  const bm = () => App.basemap;

  /* ---------- kat ↔ eski kat planı eşlemesi ---------- */
  function lvToLegacy(P) {
    const Sd = P.study;
    const free = Sd && Sd.free;
    if (!free || !free.shapes) return P;
    let n = 1;
    P.spaces.forEach((s) => { const f = free.shapes[s.id]; if (f) n = Math.max(n, (f.lv || 0) + 1); });
    n = Math.min(6, n);
    const floors = Sd.floors.length === n ? Sd.floors : st.makeFloors(n, Sd.floors);
    const assign = {};
    P.spaces.forEach((s) => {
      if (n > 1 && st.isCore(s)) return;
      const f = free.shapes[s.id];
      assign[s.id] = floors[Math.min(n - 1, (f && f.lv) || 0)].id;
    });
    const same = floors === Sd.floors && Object.keys(assign).length === Object.keys(Sd.assign).length && Object.keys(assign).every((k) => Sd.assign[k] === assign[k]);
    return same ? P : Object.assign({}, P, { study: Object.assign({}, Sd, { floors: floors, assign: assign }) });
  }
  function legacyToLv(P) {
    const Sd = P.study;
    const free = Sd && Sd.free;
    if (!free || !free.shapes) return P;
    let shapes = null;
    P.spaces.forEach((s) => {
      if (Sd.floors.length > 1 && st.isCore(s)) return;
      const idx = Sd.floors.findIndex((f) => f.id === Sd.assign[s.id]);
      const f = free.shapes[s.id];
      if (idx >= 0 && f && (f.lv || 0) !== idx) { shapes = shapes || Object.assign({}, free.shapes); shapes[s.id] = Object.assign({}, f, { lv: idx }); }
    });
    return shapes ? withFree(P, Object.assign({}, free, { shapes: shapes })) : P;
  }

  /* mekân listesi değişince serbest düzeni eşitle */
  function needsSync(P) {
    const f = P.study.free;
    if (!f || !f.shapes || f.v !== 2) return true;
    let n = 0;
    for (let i = 0; i < P.spaces.length; i++) { if (!f.shapes[P.spaces[i].id]) return true; n++; }
    return Object.keys(f.shapes).length !== n;
  }
  function sync(P) {
    let free = P.study.free && P.study.free.shapes ? P.study.free : null;
    if (!free) return withFree(P, st.freeInit(P));
    const ids = new Set(P.spaces.map((s) => s.id));
    const shapes = {};
    Object.keys(free.shapes).forEach((id) => { if (ids.has(id)) shapes[id] = st.freeClean(free.shapes[id]); });
    free = Object.assign(st.freeDefaults(), free, { v: 2, shapes: shapes });
    free = st.freeAdd(P, free);
    return withFree(P, free);
  }

  const snapOf = (free) => ({ shapes: free.shapes, extras: free.extras });
  const newStepId = () => 's' + Math.random().toString(36).slice(2, 7);

  S.hooks.push(function (next, a) {
    let P = next.project;
    let state = next;
    if (!P.study) return undefined; // kat etüdü kancası oluşturur
    if (needsSync(P)) { P = sync(P); state = Object.assign({}, state, { project: P }); }
    if (/^STUDY_(ASSIGN|MOVE_BY|AUTO|FLOORS)$/.test(a.type)) { const P2 = legacyToLv(P); if (P2 !== P) { P = P2; state = Object.assign({}, state, { project: P }); } }
    const fin = (project, history) => {
      project = lvToLegacy(project);
      return history ? Object.assign(S.withHistory(state, project), { selectedId: state.selectedId }) : Object.assign({}, state, { project: project });
    };
    const same = () => {
      const P2 = lvToLegacy(P);
      if (P2 !== P) return Object.assign({}, state, { project: P2 });
      return state === next ? undefined : state;
    };
    const free = P.study.free;
    const setOne = (id, patch, history) => {
      const sp = P.spaces.find((s) => s.id === id);
      if (!sp || !free.shapes[id]) return null;
      const cur = free.shapes[id];
      const nxt = st.freeClean(patch, cur);
      if (Object.keys(nxt).every((k) => nxt[k] === cur[k])) return null;
      return fin(withFree(P, Object.assign({}, free, { shapes: Object.assign({}, free.shapes, { [id]: nxt }) })), history);
    };
    const upd = (patch, history) => fin(withFree(P, Object.assign({}, free, patch)), history);
    const setShape = (id, fn, history) => {
      const cur = free.shapes[id];
      if (!cur) return null;
      return upd({ shapes: Object.assign({}, free.shapes, { [id]: st.freeClean(fn(cur), cur) }) }, history);
    };
    const exs = free.extras || [];

    switch (a.type) {
      case 'FREE_SET': { const r = setOne(a.id, a.patch, true); return r || same(); }
      case 'FREE_SET_LIVE': { const r = setOne(a.id, a.patch, false); return r || same(); }
      case 'FREE_MOVE_MANY': {
        // seçili mekân ve ek öğeleri birlikte taşı (a.spaces {id: yama}, a.extras {id: yama}); a.live → geri-al noktası açmaz
        const shapes = Object.assign({}, free.shapes);
        let ch = false;
        Object.keys(a.spaces || {}).forEach((id) => {
          const cur = shapes[id];
          if (!cur) return;
          const nxt = st.freeClean(a.spaces[id], cur);
          if (Object.keys(nxt).some((k) => nxt[k] !== cur[k])) { shapes[id] = nxt; ch = true; }
        });
        const ex2 = a.extras ? exs.map((e) => { if (!a.extras[e.id]) return e; ch = true; return st.cleanExtra(e, a.extras[e.id]); }) : exs;
        return ch ? upd({ shapes: shapes, extras: ex2 }, !a.live) : same();
      }
      case 'FREE_OPTS': {
        const patch = {};
        if (a.patch && [0.1, 0.5, 1].indexOf(a.patch.snap) >= 0) patch.snap = a.patch.snap;
        if (a.patch && typeof a.patch.kat === 'boolean') patch.kat = a.patch.kat;
        return upd(patch, false);
      }
      case 'FREE_AUTO': return upd({ shapes: st.freeAutoPlace(P.spaces, P.relations, free.shapes) }, true);
      case 'FREE_RESET': {
        const fresh = st.freeInit(P).shapes;
        Object.keys(fresh).forEach((id) => { const o = free.shapes[id]; if (o) fresh[id] = Object.assign({}, fresh[id], { lv: o.lv, nf: o.nf }); });
        return upd({ shapes: fresh }, true);
      }
      case 'FREE_FIT': {
        const sp = P.spaces.find((x) => x.id === a.id);
        if (!sp || !free.shapes[a.id]) return same();
        return upd({ shapes: Object.assign({}, free.shapes, { [a.id]: st.freeClean(st.freeFit(free.shapes[a.id], sp.area), free.shapes[a.id]) }) }, true);
      }
      case 'FREE_FIT_ALL': {
        const shapes = {};
        P.spaces.forEach((sp) => { shapes[sp.id] = st.freeClean(st.freeFit(free.shapes[sp.id], sp.area), free.shapes[sp.id]); });
        return upd({ shapes: shapes }, true);
      }
      case 'FREE_ATTACH': {
        const f = free.shapes[a.id], o = free.shapes[a.to];
        if (!f || !o || a.id === a.to) return same();
        return upd({ shapes: Object.assign({}, free.shapes, { [a.id]: st.freeClean(st.freeAttach(f, o, !!a.away), f) }) }, true);
      }
      case 'FREE_SPREAD': {
        const n = U.clamp(Math.round(a.n), 1, 6);
        const floors = st.makeFloors(n, P.study.floors);
        const asg = st.autoAssign(P.spaces, P.relations, floors);
        const shapes = {};
        P.spaces.forEach((sp) => {
          const idx = Math.max(0, floors.findIndex((f) => f.id === asg[sp.id]));
          shapes[sp.id] = Object.assign({}, free.shapes[sp.id], { lv: st.isCore(sp) && n > 1 ? 0 : idx });
        });
        // merdiven / asansör gibi çekirdekler tüm katları kapsasın
        P.spaces.forEach((sp) => { if (st.isCore(sp) && n > 1) shapes[sp.id] = Object.assign({}, shapes[sp.id], { lv: 0, nf: n }); });
        return upd({ shapes: shapes, kat: n > 1 ? true : free.kat }, true);
      }

      case 'FREE_XFORM': {
        // tüm mekânları ölçekle ve taşı (yapı kabuğuna sığdırma)
        const k = U.clamp(Number(a.k) || 1, 0.1, 5);
        const shapes = {};
        P.spaces.forEach((sp) => {
          const f = free.shapes[sp.id];
          shapes[sp.id] = st.freeClean({ x: (f.x - a.ox) * k + a.nx, y: (f.y - a.oy) * k + a.ny, w: f.w * k, h: f.h * k, furn: (f.furn || []).map((q) => Object.assign({}, q, { x: q.x * k, y: q.y * k })) }, f);
        });
        return upd({ shapes: shapes }, true);
      }

      /* ----- donatı ----- */
      case 'FREE_FURN_ADD': {
        const it = st.freeDerive(P).byId.get(a.id);
        const f = it && st.newFurn(it, a.k);
        if (!f) return same();
        return setShape(a.id, (cur) => ({ furn: (cur.furn || []).concat([f]) }), true);
      }
      case 'FREE_FURN_SET': case 'FREE_FURN_SET_LIVE':
        return setShape(a.id, (cur) => ({ furn: (cur.furn || []).map((q) => (q.id === a.fid ? Object.assign({}, q, a.patch) : q)) }), a.type === 'FREE_FURN_SET') || same();
      case 'FREE_FURN_DEL': return setShape(a.id, (cur) => ({ furn: (cur.furn || []).filter((q) => q.id !== a.fid) }), true) || same();
      case 'FREE_FURN_CLEAR': return setShape(a.id, () => ({ furn: [] }), true) || same();
      case 'FREE_FURN_AUTO': {
        const fd = st.freeDerive(P);
        const ids = a.id ? [a.id] : P.spaces.map((sp) => sp.id);
        const shapes = Object.assign({}, free.shapes);
        ids.forEach((id) => { const it = fd.byId.get(id); if (it && shapes[id]) shapes[id] = st.freeClean({ furn: st.autoFurnish(it) }, shapes[id]); });
        return upd({ shapes: shapes }, true);
      }

      /* ----- ek öğeler ----- */
      case 'FREE_EX_ADD': { const e = st.cleanExtra(a.el); return e ? upd({ extras: exs.concat([e]) }, true) : same(); }
      case 'FREE_EX_MANY': return upd({ extras: exs.concat((a.els || []).map((e) => st.cleanExtra(e)).filter(Boolean)) }, true);
      case 'FREE_EX_SET': case 'FREE_EX_SET_LIVE': {
        if (!exs.some((e) => e.id === a.id)) return same();
        return upd({ extras: exs.map((e) => (e.id === a.id ? st.cleanExtra(e, a.patch) : e)) }, a.type === 'FREE_EX_SET');
      }
      case 'FREE_EX_DEL': return upd({ extras: exs.filter((e) => e.id !== a.id) }, true);
      case 'FREE_EX_DUP': {
        const e = exs.find((x) => x.id === a.id);
        if (!e) return same();
        const c = Object.assign({}, e, { id: undefined });
        if (c.t === 'arrow') { c.x1 += 2; c.x2 += 2; c.y1 += 2; c.y2 += 2; } else { c.x += 2; c.y += 2; }
        return upd({ extras: exs.concat([st.cleanExtra(c)]) }, true);
      }

      /* ----- çevre ----- */
      case 'FREE_SITE': case 'FREE_SITE_LIVE': {
        const cur = free.site || {};
        const o = Object.assign({}, cur, a.patch);
        const site = { on: !!o.on, w: U.clamp(Math.round((Number(o.w) || 40) * 2) / 2, 5, 600), d: U.clamp(Math.round((Number(o.d) || 30) * 2) / 2, 5, 600), x: Math.round((Number(o.x) || 0) * 10) / 10, y: Math.round((Number(o.y) || 0) * 10) / 10 };
        if (o.pts && o.pts.length >= 3) site.pts = o.pts.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
        return upd({ site: site }, a.type === 'FREE_SITE');
      }
      case 'FREE_CTX': {
        const o = Object.assign({}, free.ctx, a.patch);
        const ctx = { mode: ['auto', 'gen', 'plan', 'off'].indexOf(o.mode) >= 0 ? o.mode : 'auto', seed: Math.max(1, Math.round(Number(o.seed) || 1)), dens: U.clamp(Number(o.dens), 0, 1) };
        if (!isFinite(ctx.dens)) ctx.dens = 0.7;
        return upd({ ctx: ctx }, false);
      }
      case 'FREE_MAP': case 'FREE_MAP_LIVE': return upd({ map: bm().clean(Object.assign({}, free.map, a.patch)) }, a.type === 'FREE_MAP');
      case 'FREE_LINK': {
        const l = a.link;
        if (!l || !l.shell || l.shell.length < 3) return same();
        const link = { elId: String(l.elId || ''), name: String(l.name || 'Yapı').slice(0, 60), floors: Math.max(1, Math.round(Number(l.floors) || 1)), shell: l.shell.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]) };
        return upd({ link: link, org: a.org || free.org }, true);
      }
      case 'FREE_UNLINK': return upd({ link: null }, true);
      case 'FREE_ORG': return upd({ org: [Number(a.org[0]) || 0, Number(a.org[1]) || 0] }, false);

      /* ----- adımlar ----- */
      case 'FREE_STEP_ADD': {
        const steps = free.steps || [];
        if (steps.length >= 12) return same();
        const step = Object.assign({ id: newStepId(), title: String(a.title || 'Adım ' + (steps.length + 1)).slice(0, 40), sub: String(a.sub || '').slice(0, 40), desc: String(a.desc || '').slice(0, 400) }, snapOf(free));
        return upd({ steps: steps.concat([step]) }, true);
      }
      case 'FREE_STEP_SET': {
        const steps = (free.steps || []).map((s, i) => (i === a.i ? Object.assign({}, s, { title: a.patch.title != null ? String(a.patch.title).slice(0, 40) : s.title, sub: a.patch.sub != null ? String(a.patch.sub).slice(0, 40) : s.sub, desc: a.patch.desc != null ? String(a.patch.desc).slice(0, 400) : s.desc }) : s));
        return upd({ steps: steps }, true);
      }
      case 'FREE_STEP_UPD': return upd({ steps: (free.steps || []).map((s, i) => (i === a.i ? Object.assign({}, s, snapOf(free)) : s)) }, true);
      case 'FREE_STEP_LOAD': {
        const s = (free.steps || [])[a.i];
        if (!s) return same();
        const shapes = {};
        P.spaces.forEach((sp) => { shapes[sp.id] = st.freeClean(s.shapes[sp.id] || free.shapes[sp.id], free.shapes[sp.id]); });
        return upd({ shapes: shapes, extras: (s.extras || []).slice() }, true);
      }
      case 'FREE_STEP_DEL': return upd({ steps: (free.steps || []).filter((s, i) => i !== a.i) }, true);
      case 'FREE_STEP_MOVE': {
        const steps = (free.steps || []).slice();
        const j = a.i + a.dir;
        if (j < 0 || j >= steps.length) return same();
        const t = steps[a.i]; steps[a.i] = steps[j]; steps[j] = t;
        return upd({ steps: steps }, true);
      }
      default:
    }
    return same();
  });

  /* ---------- JSON uzantısı: extensions.spaceStudy ---------- */
  const r2 = (v) => Math.round(v * 100) / 100;
  const spaceOut = (it) => ({
    spaceId: it.id, name: it.name, zone: it.zone, programArea: r2(it.target), area: r2(it.area),
    shape: it.shape, rotation: it.rot * 90, cut: it.cut, seed: it.seed, x: r2(it.x), y: r2(it.y), width: r2(it.w), depth: r2(it.h),
    level: it.lv, floors: it.nf, height: r2(it.height), roof: it.roof,
    polygon: it.ring.map((p) => [r2(p[0]), r2(p[1])]),
    furniture: (it.furn || []).map((f) => ({ id: f.id, type: f.k, x: r2(f.x), y: r2(f.y), rotation: f.r * 90 })),
  });
  const extraOut = (e) => Object.assign({}, e);
  const rawShape = (f) => ({ x: f.x, y: f.y, width: f.w, depth: f.h, shape: f.shape, rotation: f.rot * 90, cut: f.cut, seed: f.seed, level: f.lv, floors: f.nf, roof: f.roof });
  st.toFreeExt = function (project) {
    if (!project.study || !project.study.free) return {};
    const free = project.study.free;
    const d = st.freeDerive(project);
    const m = d.metrics;
    return {
      spaceStudy: {
        version: 2,
        unit: 'm',
        snap: free.snap,
        useLevels: !!free.kat,
        levels: m.levels,
        spaces: d.items.map(spaceOut),
        relations: d.pairs.map((p) => ({ a: p.a, b: p.b, type: p.type, state: p.state, gap: r2(p.gap), contact: r2(p.contact), levelDiff: p.dv || 0 })),
        extras: d.extras.map(extraOut),
        site: free.site && free.site.on ? { width: free.site.w, depth: free.site.d, x: free.site.x, y: free.site.y, polygon: d.siteRing ? d.siteRing.map((p) => [r2(p[0]), r2(p[1])]) : null } : null,
        context: free.ctx,
        basemap: free.map,
        origin: free.org,
        link: free.link ? { planElementId: free.link.elId, name: free.link.name, floors: free.link.floors, shell: free.link.shell } : null,
        steps: (free.steps || []).map((s) => ({ title: s.title, subtitle: s.sub, description: s.desc, spaces: Object.keys(s.shapes).filter((id) => project.spaces.some((sp) => sp.id === id)).map((id) => Object.assign({ spaceId: id }, rawShape(s.shapes[id]))), extras: (s.extras || []).map(extraOut) })),
        metrics: {
          spaceStudyScore: m.score, relationFit: m.relScore == null ? null : r2(m.relScore), overlapCount: m.overlapCount, overlapArea: r2(m.overlapArea), areaFit: r2(m.areaFit), totalArea: r2(m.total),
          footprint: { width: r2(d.bounds.w), depth: r2(d.bounds.h) }, grossFloorArea: r2(m.gfa), siteArea: r2(m.siteArea), taks: m.taks == null ? null : r2(m.taks), kaks: m.kaks == null ? null : r2(m.kaks), greenShare: m.greenShare == null ? null : r2(m.greenShare), maxHeight: r2(m.maxHeight),
        },
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
    // eski dosyalarda kat bilgisi floorStudy uzantısındaydı
    const legacyLv = {};
    const fs = ext.floorStudy;
    if (fs && Array.isArray(fs.floors) && Array.isArray(fs.assignments)) fs.assignments.forEach((q) => { const i = fs.floors.findIndex((f) => f.id === q.floorId); if (i >= 0) legacyLv[String(q.spaceId)] = i; });
    const parseShape = (q) => ({ x: q.x, y: q.y, w: q.width, h: q.depth, shape: q.shape, rot: Math.round((Number(q.rotation) || 0) / 90), cut: q.cut, seed: q.seed, lv: q.level != null ? q.level : legacyLv[String(q.spaceId)] || 0, nf: q.floors, roof: q.roof });
    const shapes = {};
    x.spaces.forEach((q) => {
      if (!q || !ids.has(String(q.spaceId))) return;
      const sh = st.freeClean(parseShape(q));
      sh.furn = st.freeClean({ furn: (q.furniture || []).map((f) => ({ id: f.id, k: f.type, x: f.x, y: f.y, r: Math.round((Number(f.rotation) || 0) / 90) })) }).furn;
      shapes[String(q.spaceId)] = sh;
    });
    const def = st.freeDefaults();
    const snap = [0.1, 0.5, 1].indexOf(Number(x.snap)) >= 0 ? Number(x.snap) : 0.5;
    const extras = (x.extras || []).map((e) => st.cleanExtra(e)).filter(Boolean).slice(0, 400);
    let site = def.site;
    if (x.site && Number(x.site.width) > 0) {
      site = { on: true, w: Number(x.site.width), d: Number(x.site.depth) || 30, x: Number(x.site.x) || 0, y: Number(x.site.y) || 0 };
      if (Array.isArray(x.site.polygon) && x.site.polygon.length >= 3 && x.site.polygon.length !== 4) site.pts = x.site.polygon.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]);
    }
    const ctxIn = x.context || {};
    const ctx = { mode: ['auto', 'gen', 'plan', 'off'].indexOf(ctxIn.mode) >= 0 ? ctxIn.mode : 'auto', seed: Math.max(1, Math.round(Number(ctxIn.seed) || 3)), dens: isFinite(Number(ctxIn.dens)) ? U.clamp(Number(ctxIn.dens), 0, 1) : 0.7 };
    let link = null;
    if (x.link && Array.isArray(x.link.shell) && x.link.shell.length >= 3) link = { elId: String(x.link.planElementId || ''), name: String(x.link.name || 'Yapı').slice(0, 60), floors: Math.max(1, Math.round(Number(x.link.floors) || 1)), shell: x.link.shell.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]) };
    const steps = (x.steps || []).slice(0, 12).map((s) => {
      const sh = {};
      (s.spaces || []).forEach((q) => { if (ids.has(String(q.spaceId))) sh[String(q.spaceId)] = st.freeClean(parseShape(q), shapes[String(q.spaceId)]); });
      return { id: newStepId(), title: String(s.title || 'Adım').slice(0, 40), sub: String(s.subtitle || '').slice(0, 40), desc: String(s.description || '').slice(0, 400), shapes: Object.assign({}, shapes, sh), extras: (s.extras || []).map((e) => st.cleanExtra(e)).filter(Boolean) };
    });
    const free = Object.assign(def, {
      snap: snap, shapes: shapes, extras: extras, site: site, ctx: ctx, map: App.basemap.clean(x.basemap), steps: steps, link: link, kat: !!x.useLevels,
      org: Array.isArray(x.origin) ? [Number(x.origin[0]) || 0, Number(x.origin[1]) || 0] : [0, 0],
    });
    return { study: Object.assign({}, base, { free: free }) };
  });
})();
