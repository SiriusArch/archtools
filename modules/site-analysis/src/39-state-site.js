/* ==========================================================================
   39-state-site.js — Arsa / İmar / Yer Seçimi eylemleri (reducer eklentisi) ve JSON uzantıları
   Proje içinde: project.site { loc, radius, walkMin, template, parcel, imar } ve project.cand { list, w, f, sel, mode, scan }
   Böylece geri al/ileri al, otomatik kayıt ve JSON içe/dışa aktarma Modül 1 ile aynı akışı kullanır.
   Eylemler: SITE_SET / SITE_SET_LIVE {patch} · IMAR_SET / IMAR_SET_LIVE {patch} · IMAR_EDGE {i, kind}
             IMAR_SCN_SAVE {name} · IMAR_SCN_DEL {id} · IMAR_SCN_APPLY {id}
             CAND_ADD {c} · CAND_REMOVE {id} · CAND_SET {patch} · CAND_UPDATE {id, patch} · CAND_CLEAR
   JSON uzantıları: extensions.siteAnalysis · extensions.zoning · extensions.siteSelection
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const site = App.site;
  const Z = App.zoning;
  const sel = App.select;

  /* ---------------- ek alanlar ---------------- */
  site.init = function () { return { site: site.defaults(), cand: sel.defaults() }; };

  const withSite = (P, patch) => Object.assign({}, P, { site: Object.assign({}, P.site, patch) });
  const withImar = (P, patch) => withSite(P, { imar: Z.clampImar(Object.assign({}, P.site.imar, patch)) });
  const withCand = (P, patch) => Object.assign({}, P, { cand: sel.clamp(Object.assign({}, P.cand, patch)) });

  function cleanSite(P, patch) {
    const o = Object.assign({}, patch);
    if (o.radius != null) o.radius = U.clamp(Math.round(o.radius / 50) * 50, 250, 1000);
    if (o.walkMin != null) o.walkMin = [5, 10, 15].indexOf(o.walkMin) >= 0 ? o.walkMin : P.site.walkMin;
    if (o.template != null && !site.TEMPLATES.some((t) => t.id === o.template)) o.template = P.site.template;
    if ('parcel' in o && o.parcel != null) o.parcel = Z.cleanParcel(o.parcel) || null;
    return o;
  }

  S.hooks.push(function (next, a, prev) {
    let P = next.project;
    let state = next;
    if (!P.site || !P.cand) {
      P = Object.assign({}, P, { site: P.site || site.defaults(), cand: P.cand || sel.defaults() });
      state = Object.assign({}, state, { project: P });
    }
    if (!P.site.imar) { P = withSite(P, { imar: Z.defaults() }); state = Object.assign({}, state, { project: P }); }
    const apply = (project, history) => (history ? Object.assign(S.withHistory(state, project), { selectedId: state.selectedId }) : Object.assign({}, state, { project: project }));
    const same = () => (state === next ? undefined : state);

    switch (a.type) {
      case 'SITE_SET': return apply(withSite(P, cleanSite(P, a.patch)), true);
      case 'SITE_SET_LIVE': return apply(withSite(P, cleanSite(P, a.patch)), false);
      case 'IMAR_SET': return apply(withImar(P, a.patch), true);
      case 'IMAR_SET_LIVE': return apply(withImar(P, a.patch), false);
      case 'IMAR_EDGE': {
        const ek = Object.assign({}, P.site.imar.ek);
        if (a.kind) ek[a.i] = a.kind; else delete ek[a.i];
        return apply(withImar(P, { ek: ek }), true);
      }
      case 'IMAR_PRESET': return apply(withImar(P, a.patch), true);
      case 'IMAR_SCN_SAVE': {
        const im = P.site.imar;
        const scn = im.scn.concat([{ id: U.uid(), name: String(a.name || 'Senaryo').slice(0, 24), p: a.p, sum: a.sum }]).slice(-4);
        return apply(withImar(P, { scn: scn }), true);
      }
      case 'IMAR_SCN_DEL': return apply(withImar(P, { scn: P.site.imar.scn.filter((s) => s.id !== a.id) }), true);
      case 'IMAR_SCN_APPLY': {
        const s = P.site.imar.scn.find((x) => x.id === a.id);
        if (!s) return same();
        return apply(withImar(P, Object.assign({}, s.p, { scn: P.site.imar.scn })), true);
      }
      case 'CAND_ADD': {
        const c = a.c;
        if (P.cand.list.length >= 8) return same();
        if (P.cand.list.some((x) => x.src !== 'demo' && Math.abs(x.lat - c.lat) < 1e-4 && Math.abs(x.lon - c.lon) < 1e-4)) return same();
        const item = { id: U.uid(), name: String(c.name || 'Aday').slice(0, 60), lat: c.lat, lon: c.lon, src: c.src || 'koordinat', dx: c.dx || 0, dy: c.dy || 0, note: c.note || '' };
        return apply(withCand(P, { list: P.cand.list.concat([item]), sel: item.id }), true);
      }
      case 'CAND_REMOVE': return apply(withCand(P, { list: P.cand.list.filter((x) => x.id !== a.id), sel: P.cand.sel === a.id ? null : P.cand.sel }), true);
      case 'CAND_UPDATE': return apply(withCand(P, { list: P.cand.list.map((x) => (x.id === a.id ? Object.assign({}, x, a.patch) : x)) }), true);
      case 'CAND_SET': return apply(withCand(P, a.patch), !!a.history);
      case 'CAND_SET_LIVE': return apply(withCand(P, a.patch), false);
      case 'CAND_CLEAR': return apply(withCand(P, { list: [], sel: null }), true);
      default:
    }
    return same();
  });

  /* ---------------- JSON uzantıları ---------------- */
  const r1 = (v) => Math.round(v * 10) / 10;
  const baseToExt = site.toExt;
  site.toExt = function (project) {
    const out = baseToExt(project);
    const s = project.site;
    if (!s || !out.siteAnalysis) return out;
    if (s.parcel) out.siteAnalysis.parcel = { unit: 'm', origin: 'site-center (x east, y north)', ring: s.parcel.map((q) => [r1(q[0]), r1(q[1])]), area: Math.round(Math.abs(App.gis.area(s.parcel)) * 10) / 10 };
    return out;
  };
  const baseFromExt = site.fromExt;
  site.fromExt = function (x, project) {
    const d = baseFromExt(x, project);
    if (x && x.parcel && Array.isArray(x.parcel.ring)) d.parcel = Z.cleanParcel(x.parcel.ring);
    return d;
  };
  // ext sağlayıcıyı yenisiyle değiştir (39-lib-site.js eskisini ekledi)
  const pi = App.extProviders.indexOf(baseToExt);
  if (pi >= 0) App.extProviders[pi] = (p) => site.toExt(p);

  Z.toExt = function (project) {
    const s = project.site;
    if (!s || !s.parcel) return {};
    const im = s.imar;
    const e = site.entry(s);
    let ctx = null;
    if (e) { const A = site.analyze(s, e); ctx = { data: e.data, A: A, lat: e.data.lat0, parcel: s.parcel }; }
    const R = Z.compute(im, s.parcel, ctx);
    return {
      zoning: {
        version: 1,
        parameters: { use: im.use, taks: im.taks, kaks: im.kaks, maxHeightM: im.hmax, floorHeightM: im.floorH, setbacksM: im.setback, edgeOverrides: im.ek, form: im.form, efficiency: im.eff, avgUnitNetM2: im.unit, carsPerUnit: im.cars, personsPerUnit: im.per, basementFloors: im.basement },
        result: Z.summary(R, im),
        scenarios: im.scn.map((c) => ({ name: c.name, parameters: c.p, result: c.sum })),
      },
    };
  };
  App.extProviders.push(Z.toExt);

  sel.toExt = function (project) {
    const c = project.cand;
    if (!c || !c.list.length) return {};
    const s = project.site;
    const set = { radius: s.radius, walkMin: s.walkMin, template: s.template };
    const cmp = sel.compare(c, set);
    return {
      siteSelection: {
        version: 1,
        candidates: c.list.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, source: x.src, offsetM: x.src === 'demo' ? [x.dx, x.dy] : undefined, note: x.note || undefined })),
        weights: cmp.w, filters: c.f, settings: set,
        ranking: cmp.ranked.map((r) => ({ id: r.id, rank: r.rank, score: r.score, passes: r.pass, parts: r.parts.reduce((o, p) => { o[p.id] = Math.round(p.v * 1000) / 1000; return o; }, {}) })),
      },
    };
  };
  App.extProviders.push(sel.toExt);

  /* içe aktarma: fromJSON bu işlevleri çağırır; dönen alanlar projeye eklenir */
  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext, project) {
    const out = {};
    if (ext.siteAnalysis) {
      const s = site.fromExt(ext.siteAnalysis, project);
      s.imar = Z.clampImar(ext.zoning && ext.zoning.parameters ? {
        use: ext.zoning.parameters.use, taks: ext.zoning.parameters.taks, kaks: ext.zoning.parameters.kaks, hmax: ext.zoning.parameters.maxHeightM, floorH: ext.zoning.parameters.floorHeightM,
        setback: ext.zoning.parameters.setbacksM, ek: ext.zoning.parameters.edgeOverrides, form: ext.zoning.parameters.form, eff: ext.zoning.parameters.efficiency, unit: ext.zoning.parameters.avgUnitNetM2,
        cars: ext.zoning.parameters.carsPerUnit, per: ext.zoning.parameters.personsPerUnit, basement: ext.zoning.parameters.basementFloors,
        scn: (ext.zoning.scenarios || []).map((c, i) => ({ id: 'k' + i, name: c.name, p: c.parameters, sum: c.result })),
      } : null);
      out.site = s;
    }
    if (ext.siteSelection) {
      const x = ext.siteSelection;
      out.cand = sel.clamp({
        list: (x.candidates || []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, src: c.source, dx: c.offsetM ? c.offsetM[0] : 0, dy: c.offsetM ? c.offsetM[1] : 0, note: c.note })),
        w: x.weights, f: x.filters,
      });
    }
    return out;
  });
})();
