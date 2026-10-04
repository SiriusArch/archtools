/* ==========================================================================
   39-state-design.js — Tasarım Üretici (Modül 7) ve Maliyet / Fizibilite (Modül 8) durumu
   Proje içinde: project.design (App.design.defaults biçimi) ve project.fiz (App.cost.defaults biçimi).
   Geri al / ileri al, otomatik kayıt ve JSON içe/dışa aktarma diğer modüllerle aynı akışı kullanır.
   Eylemler: DESIGN_SET / DESIGN_SET_LIVE {patch} · FIZ_SET / FIZ_SET_LIVE {patch (iç içe birleştirilir)} · FIZ_RESET
   Türetilmiş bağlam: App.dsnCtx(project) (tasarım alternatifleri) · App.fizCtx(project) (maliyet ve fizibilite sonucu)
   JSON uzantıları: extensions.design · extensions.feasibility
   ========================================================================== */
(function () {
  const App = window.App;
  const S = App.state;
  const D = App.design;
  const Cst = App.cost;

  /* ---------------- ek alanlar ---------------- */
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  function merge(a, b) {
    const o = Object.assign({}, a);
    Object.keys(b || {}).forEach((k) => { o[k] = isObj(b[k]) && isObj(a && a[k]) ? merge(a[k], b[k]) : b[k]; });
    return o;
  }
  const withDesign = (P, patch) => Object.assign({}, P, { design: D.clamp(merge(P.design || D.defaults(), patch)) });
  const withFiz = (P, patch) => Object.assign({}, P, { fiz: Cst.clamp(merge(P.fiz || Cst.defaults(), patch)) });

  S.hooks.push(function (next, a) {
    let P = next.project;
    let state = next;
    if (!P.design || !P.fiz) {
      P = Object.assign({}, P, { design: P.design || D.defaults(), fiz: P.fiz || Cst.defaults() });
      state = Object.assign({}, state, { project: P });
    }
    const apply = (project, history) => (history ? Object.assign(S.withHistory(state, project), { selectedId: state.selectedId }) : Object.assign({}, state, { project: project }));
    switch (a.type) {
      case 'DESIGN_SET': return apply(withDesign(P, a.patch), true);
      case 'DESIGN_SET_LIVE': return apply(withDesign(P, a.patch), false);
      case 'FIZ_SET': return apply(withFiz(P, a.patch), true);
      case 'FIZ_SET_LIVE': return apply(withFiz(P, a.patch), false);
      case 'FIZ_RESET': return apply(Object.assign({}, P, { fiz: Cst.defaults() }), true);
      default:
    }
    return state === next ? undefined : state;
  });

  /* ---------------- türetilmiş bağlam (bellekli) ---------------- */
  const same = (a, b) => a && a.length === b.length && a.every((x, i) => x === b[i]);
  let mD = { k: null, v: null };
  App.dsnCtx = function (project) {
    const s = project.site;
    const e = App.site.entry(s);
    const A = e ? App.site.analyze(s, e) : null;
    const dsn = project.design || D.defaults();
    const k = [s.parcel, s.imar, e, A, dsn];
    if (same(mD.k, k)) return mD.v;
    let v;
    if (!s.parcel) v = { ok: false, reason: 'parcel', res: { alts: [] } };
    else {
      const zctx = e ? { data: e.data, A: A, lat: e.data.lat0, parcel: s.parcel } : null;
      let res;
      try { res = D.generate(s.imar, s.parcel, zctx, dsn); } catch (err) { res = { ok: false, reason: 'hata', alts: [], error: String(err && err.message) }; }
      const alts = res.alts || [];
      const alt = alts.find((x) => x.id === dsn.sel) || alts.find((x) => x.id === res.best) || alts[0] || null;
      v = { ok: !!alt, reason: alt ? null : (res.reason || 'kucuk'), im: s.imar, parcel: s.parcel, e: e, A: A, res: res, alts: alts, alt: alt, table: alt ? D.areaTable(alt, s.imar) : [], dsn: dsn };
    }
    mD = { k: k, v: v };
    return v;
  };

  let mF = { k: null, v: null };
  App.fizCtx = function (project) {
    const dc = App.dsnCtx(project);
    const fz = project.fiz || Cst.defaults();
    const k = [dc, fz];
    if (same(mF.k, k)) return mF.v;
    let v;
    if (!dc.ok) v = { ok: false, dc: dc };
    else {
      const parcelArea = Math.abs(App.gis.area(project.site.parcel));
      const d = Cst.fromDesign(dc.alt, dc.im, parcelArea);
      const res = Cst.compute(d, fz);
      v = { ok: true, dc: dc, d: d, res: res, a: fz, sens: null };
    }
    mF = { k: k, v: v };
    return v;
  };
  // duyarlılık hesabı pahalı: yalnızca istendiğinde ve sonuca bağlı olarak bellekte tutulur
  App.fizSens = function (project) {
    const f = App.fizCtx(project);
    if (!f.ok) return null;
    if (!f.sens) f.sens = Cst.sensitivity(f.d, f.a);
    return f.sens;
  };

  /* ---------------- JSON uzantıları ---------------- */
  App.extProviders.push(function (project) {
    const out = {};
    if (!project.site || !project.site.parcel || !project.design) return out;
    const dc = App.dsnCtx(project);
    if (dc.ok) {
      out.design = {
        version: 1,
        parameters: project.design,
        selected: dc.alt.id,
        result: D.summary(dc.alt),
        alternatives: dc.alts.map((x) => D.summary(x)),
      };
      if (project.fiz) {
        const f = App.fizCtx(project);
        if (f.ok) out.feasibility = { version: 1, assumptions: project.fiz, result: Cst.summary(f.res, project.fiz), disclaimer: Cst.DISCLAIMER };
      }
    } else {
      out.design = { version: 1, parameters: project.design };
      if (project.fiz) out.feasibility = { version: 1, assumptions: project.fiz };
    }
    return out;
  });

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext) {
    const out = {};
    if (ext.design && ext.design.parameters) out.design = D.clamp(ext.design.parameters);
    if (ext.feasibility && ext.feasibility.assumptions) out.fiz = Cst.clamp(ext.feasibility.assumptions);
    return out;
  });
})();
