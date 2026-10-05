/* ==========================================================================
   30-state.js — proje modeli, reducer (geri al/ileri al), türetilmiş veriler, otomatik kayıt
   Proje modeli: { meta, spaces: [{id,name,area,zone,x,y}], relations: {"idA|idB": "strong|weak|avoid"} }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;

  const STORE_KEY = 'islev-semasi:v1:autosave';

  /* ---------------- proje üretimi ---------------- */
  function createFromTemplate(typeKey, variantKey, opts) {
    opts = opts || {};
    const type = App.kb.type(typeKey);
    const v = App.kb.variant(typeKey, variantKey);
    const entries = v.entries.filter((e) => e.req);
    const idByKey = {};
    const spaces = entries.map((e) => {
      const id = U.uid() + e.key;
      idByKey[e.key] = id;
      return { id: id, name: e.name, area: App.analyze.defaultArea(e), zone: e.zone, x: geo.W / 2, y: geo.H / 2 };
    });
    const relations = {};
    v.relations.forEach((r) => {
      if (idByKey[r[0]] && idByKey[r[1]]) relations[U.pairKey(idByKey[r[0]], idByKey[r[1]])] = r[2];
    });
    const k = geo.scale(spaces);
    const pos = App.layout.auto(spaces, relations, k, {});
    spaces.forEach((s) => { if (pos[s.id]) { s.x = pos[s.id].x; s.y = pos[s.id].y; } });
    if (opts.messy && spaces.length > 3) {
      // örnek proje: bilerek dağınık başlar → "Otomatik yerleştir" farkı hemen gösterir
      const pts = spaces.map((s) => ({ x: s.x, y: s.y }));
      const n = spaces.length;
      let best = null;
      for (let shift = 1; shift < n; shift++) {
        const moved = spaces.map((s, i) => Object.assign({}, s, pts[(i + shift) % n]));
        const pc = App.score.evaluate(moved, relations, k).percent;
        if (pc != null && (best === null || pc < best.pc)) best = { pc: pc, shift: shift };
      }
      if (best) spaces.forEach((s, i) => { const q = pts[(i + best.shift) % n]; s.x = q.x; s.y = q.y; });
    }
    return {
      meta: { name: opts.name || (opts.messy ? 'Örnek: ' : '') + v.label + ' ' + type.label, buildingType: type.key, variant: v.key, createdAt: new Date().toISOString(), example: !!opts.messy },
      spaces: spaces,
      relations: relations,
    };
  }

  function emptyProject() {
    return { meta: { name: 'Yeni proje', buildingType: 'konut', variant: '2+1', createdAt: new Date().toISOString(), example: false }, spaces: [], relations: {} };
  }

  /* ---------------- otomatik kayıt (kişisel kolaylık) ---------------- */
  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return App.files.fromJSON(raw);
    } catch (e) { return null; }
  }
  function persist(project) {
    try {
      const k = geo.scale(project.spaces);
      window.localStorage.setItem(STORE_KEY, JSON.stringify(App.files.toJSON(project, k, null, null)));
    } catch (e) { /* depolama yoksa sessizce atla */ }
  }
  function clearSaved() { try { window.localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* ---------------- başlangıç durumu ---------------- */
  function initialState() {
    const saved = loadSaved();
    let project = saved || createFromTemplate('konut', '2+1', { messy: true });
    if (App.study && !project.study) project = Object.assign({}, project, { study: App.study.init(project) });
    if (App.site && !project.site) project = Object.assign({}, project, App.site.init());
    if (App.design && !project.design) project = Object.assign({}, project, { design: App.design.defaults() });
    if (App.cost && !project.fiz) project = Object.assign({}, project, { fiz: App.cost.defaults() });
    return {
      project: project,
      past: [], future: [],
      selectedId: null,
      restored: !!saved,
      ui: {
        module: 'islev', tab: 'spaces', assistantOpen: false, asTab: 'analysis', messages: [], toast: null, highlight: null,
        stTab: 'katlar', anTab: 'gorunum', an: App.analysisDefaults ? App.analysisDefaults() : {},
        site: App.siteUi ? App.siteUi.arsa() : {}, imar: App.siteUi ? App.siteUi.imar() : {}, yer: App.siteUi ? App.siteUi.yer() : {}, dsn: App.dsnUi ? App.dsnUi.dsn() : {}, fiz: App.dsnUi ? App.dsnUi.fiz() : {}, geo: { busy: null, msg: '', err: null },
        form: { name: '', area: '' }, tplType: project.meta.buildingType, tplVariant: project.meta.variant,
        busy: null, hintDismissed: false, style: App.theme.name, boardWide: readWide(),
      },
    };
  }

  function readWide() { try { return window.localStorage.getItem('archtools.boardwide') === '1'; } catch (e) { return false; } }

  /* ---------------- reducer ---------------- */
  const HISTORY = 60;
  // geri al/ileri al: kat etüdü (study), arsa / imar (site) ve aday konumlar (cand) da projeyle birlikte geri alınır
  function snap(project) { return { meta: project.meta, spaces: project.spaces, relations: project.relations, study: project.study, site: project.site, cand: project.cand, design: project.design, fiz: project.fiz }; }
  function withHistory(state, project) {
    const meta = project.meta.example ? Object.assign({}, project.meta, { example: false }) : project.meta;
    return Object.assign({}, state, {
      project: Object.assign({}, project, { meta: meta }),
      past: state.past.concat([snap(state.project)]).slice(-HISTORY),
      future: [],
    });
  }
  const setUi = (state, patch) => Object.assign({}, state, { ui: Object.assign({}, state.ui, patch) });

  function reducer(state, a) {
    const P = state.project;
    switch (a.type) {
      case 'ADD_SPACES': {
        const spaces = P.spaces.slice();
        const ids = [];
        a.list.forEach((it) => {
          const area = U.clamp(Number(it.area) || 10, 0.5, 100000);
          const item = { id: U.uid(), name: String(it.name || 'Mekân').slice(0, 60), area: area, zone: App.ZONES[it.zone] ? it.zone : App.match.zoneFor(it.name, P.meta.buildingType, P.meta.variant), x: geo.W / 2, y: geo.H / 2 };
          const k = geo.scale(spaces.concat(item));
          const pos = App.layout.freeSpot(spaces, area, k);
          item.x = pos.x; item.y = pos.y;
          spaces.push(item);
          ids.push(item.id);
        });
        if (a.list.length > 2) {
          const k = geo.scale(spaces);
          const pos = App.layout.auto(spaces, P.relations, k, { keep: true, iter: 260 });
          spaces.forEach((s) => { if (pos[s.id]) { s.x = pos[s.id].x; s.y = pos[s.id].y; } });
        }
        const next = withHistory(state, Object.assign({}, P, { spaces: spaces }));
        next.selectedId = ids[ids.length - 1];
        return next;
      }
      case 'UPDATE_SPACE': {
        const spaces = P.spaces.map((s) => {
          if (s.id !== a.id) return s;
          const patch = {};
          if (a.patch.name != null) patch.name = String(a.patch.name).slice(0, 60);
          if (a.patch.area != null) { const v = Number(a.patch.area); if (v > 0) patch.area = U.clamp(v, 0.5, 100000); }
          if (a.patch.zone != null && App.ZONES[a.patch.zone]) patch.zone = a.patch.zone;
          return Object.assign({}, s, patch);
        });
        return withHistory(state, Object.assign({}, P, { spaces: spaces }));
      }
      case 'REMOVE_SPACE': {
        const spaces = P.spaces.filter((s) => s.id !== a.id);
        const rel = {};
        Object.keys(P.relations).forEach((key) => { if (key.split('|').indexOf(a.id) < 0) rel[key] = P.relations[key]; });
        const next = withHistory(state, Object.assign({}, P, { spaces: spaces, relations: rel }));
        if (state.selectedId === a.id) next.selectedId = null;
        return next;
      }
      case 'DRAG_START': return Object.assign({}, state, { past: state.past.concat([snap(P)]).slice(-HISTORY), future: [], project: P.meta.example ? Object.assign({}, P, { meta: Object.assign({}, P.meta, { example: false }) }) : P });
      case 'SNAPSHOT': return Object.assign({}, state, { past: state.past.concat([snap(P)]).slice(-HISTORY), future: [] });
      case 'MOVE': {
        const spaces = P.spaces.map((s) => (s.id === a.id ? Object.assign({}, s, { x: a.x, y: a.y }) : s));
        return Object.assign({}, state, { project: Object.assign({}, P, { spaces: spaces }) });
      }
      case 'SET_POSITIONS': {
        const spaces = P.spaces.map((s) => (a.positions[s.id] ? Object.assign({}, s, { x: a.positions[s.id].x, y: a.positions[s.id].y }) : s));
        return Object.assign({}, state, { project: Object.assign({}, P, { spaces: spaces }) });
      }
      case 'SET_RELATION': {
        const key = U.pairKey(a.a, a.b);
        if (a.a === a.b) return state;
        const rel = Object.assign({}, P.relations);
        if (a.rel === 'none') delete rel[key]; else rel[key] = a.rel;
        if ((P.relations[key] || 'none') === a.rel) return state;
        return withHistory(state, Object.assign({}, P, { relations: rel }));
      }
      case 'CYCLE_RELATION': {
        const key = U.pairKey(a.a, a.b);
        const cur = P.relations[key] || 'none';
        const nxt = App.REL_CYCLE[(App.REL_CYCLE.indexOf(cur) + 1) % App.REL_CYCLE.length];
        return reducer(state, { type: 'SET_RELATION', a: a.a, b: a.b, rel: nxt });
      }
      case 'SET_META': return withHistory(state, Object.assign({}, P, { meta: Object.assign({}, P.meta, a.patch) }));
      case 'LOAD_PROJECT': {
        const next = withHistory(state, a.project);
        next.project = a.project;
        next.selectedId = null;
        next.ui = Object.assign({}, state.ui, { tplType: a.project.meta.buildingType, tplVariant: a.project.meta.variant });
        return next;
      }
      case 'UNDO': {
        if (!state.past.length) return state;
        const prev = state.past[state.past.length - 1];
        return Object.assign({}, state, { project: Object.assign({}, prev), past: state.past.slice(0, -1), future: [snap(P)].concat(state.future), selectedId: prev.spaces.some((s) => s.id === state.selectedId) ? state.selectedId : null });
      }
      case 'REDO': {
        if (!state.future.length) return state;
        const nx = state.future[0];
        return Object.assign({}, state, { project: Object.assign({}, nx), past: state.past.concat([snap(P)]), future: state.future.slice(1) });
      }
      case 'SELECT': return state.selectedId === a.id ? state : Object.assign({}, state, { selectedId: a.id });
      case 'UI': return setUi(state, a.patch);
      case 'FORM': return setUi(state, { form: Object.assign({}, state.ui.form, a.patch) });
      case 'TOAST': return setUi(state, { toast: { msg: a.msg, kind: a.kind || 'info', id: Date.now() } });
      case 'CLEAR_TOAST': return state.ui.toast ? setUi(state, { toast: null }) : state;
      case 'CHAT_ADD': return setUi(state, { messages: state.ui.messages.concat([a.msg]).slice(-30) });
      case 'HIGHLIGHT': return setUi(state, { highlight: a.pair });
      default: return state;
    }
  }

  /* ---------------- modül eklentileri ----------------
     Diğer modüller (kat etüdü vb.) kendi eylemlerini hook ile ekler: fn(next, action, prev) → yeni state | undefined */
  const hooks = [];
  function rootReducer(state, a) {
    let next = reducer(state, a);
    for (let i = 0; i < hooks.length; i++) { const r = hooks[i](next, a, state); if (r) next = r; }
    return next;
  }

  /* ---------------- türetilmiş veriler (önbellekli) ---------------- */
  let memo = { project: null, out: null };
  function derive(state) {
    if (memo.project === state.project) return memo.out;
    const k = geo.scale(state.project.spaces);
    const score = App.score.evaluate(state.project.spaces, state.project.relations, k);
    const analysis = App.analyze.run(state.project, k, score);
    memo = { project: state.project, out: { k: k, score: score, analysis: analysis } };
    return memo.out;
  }

  App.state = { createFromTemplate: createFromTemplate, emptyProject: emptyProject, initialState: initialState, reducer: rootReducer, derive: derive, persist: persist, clearSaved: clearSaved, hooks: hooks, withHistory: withHistory, snap: snap, setUi: setUi, HISTORY: HISTORY };
})();
