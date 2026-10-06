/* ==========================================================================
   39-lib-tplsrc.js — Modül 12 · diğer araçların çıktısını pafta paneline getirir
   Her kaynak, ilgili modülün sahnesini (primitif listesi) üretir; sahne bir tuvale çizilir ve görüntü olarak önbelleğe alınır.
   Çıktılar canlı bağlıdır: proje verisi değişince önbellek geçersiz olur ve yeniden üretilir. Veri JSON'a yazılmaz, yalnızca bağlantı yazılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const T = App.tpl;
  const U = App.util;

  /* ---------- kaynaklar: kullanılabilirlik ve üretim ---------- */
  function ctxs(st) {
    const P = st.project;
    const s = P.site;
    const e = s && App.site ? App.site.entry(s) : null;
    return { P: P, s: s, e: e, hasParcel: !!(s && s.parcel) };
  }
  const MAKERS = {
    islev: { ok: (c) => c.P.spaces.length > 0, make: (st) => { const d = App.state.derive(st); return App.board.toCanvas(st.project, d.k, d.score, F()); } },
    kat: { ok: (c) => c.P.spaces.length > 0 && !!c.P.study, make: (st) => { const P = st.project; return sc(App.study.scene(P, App.study.derive(P), false)); } },
    analiz: { ok: (c) => c.P.spaces.length > 0 && !!c.P.study, make: (st) => { const P = st.project; return sc(App.analysis.scene(P, App.study.derive(P), Object.assign({}, st.ui.an, { sel: null }), false)); } },
    arsa: { ok: (c) => !!c.e, make: (st) => { const c = ctxs(st); const A = App.site.analyze(c.s, c.e); return sc(App.siteScene.arsa(c.P, A, Object.assign({}, st.ui.site, { sel: null, lod: false }), false)); } },
    'imar-plan': { ok: (c) => c.hasParcel, make: (st) => imar(st, 'plan') },
    'imar-iso': { ok: (c) => c.hasParcel, make: (st) => imar(st, 'iso') },
    'tasarim-vaziyet': { ok: dsnOk, make: (st) => dsn(st, 'vaziyet') },
    'tasarim-tipik': { ok: dsnOk, make: (st) => dsn(st, 'tipik') },
    'tasarim-bodrum': { ok: dsnOk, make: (st) => dsn(st, 'bodrum') },
    'tasarim-kutle': { ok: dsnOk, make: (st) => dsn(st, 'kutle') },
    'tasarim-kiyas': { ok: dsnOk, make: (st) => dsn(st, 'kiyas') },
    'fiz-ozet': { ok: fizOk, make: (st) => fiz(st, 'ozet') },
    'fiz-nakit': { ok: fizOk, make: (st) => fiz(st, 'nakit') },
    'fiz-duyarlilik': { ok: fizOk, make: (st) => fiz(st, 'duyarlilik') },
    'fiz-metraj': { ok: fizOk, make: (st) => fiz(st, 'metraj') },
    'birim-plan': { ok: unitOk, make: (st) => unit(st, 'plan') },
    'birim-iso': { ok: unitOk, make: (st) => unit(st, 'iso') },
    'birim-surec': { ok: (c) => unitOk(c) && c.P.unit.steps.length > 1, make: (st) => unit(st, 'surec') },
    vaziyet: { ok: (c) => !!(c.P.plan && c.P.plan.els && c.P.plan.els.length), make: (st) => sc(App.plan.scene(st.project.plan, { live: false })) },
    kolaj: { ok: (c) => !!(c.P.collage && c.P.collage.layers && c.P.collage.layers.length), make: (st) => sc(App.collage.scene(st.project.collage, { live: false })) },
  };
  let hiRes = false;
  const F = () => (hiRes ? 2 : 1.25);
  function sc(scene) { return scene; }
  function dsnOk(c) { try { return c.hasParcel && App.dsnCtx(c.P).ok; } catch (e) { return false; } }
  function fizOk(c) { try { return dsnOk(c) && App.fizCtx(c.P).ok; } catch (e) { return false; } }
  function unitOk(c) { const u = c.P.unit; return !!(u && u.steps && u.steps.some((s) => s.els && s.els.some((e) => e.t === 'mass'))); }
  function imar(st, mode) {
    const cx = App.ui.site.imarCtx(st);
    const view = Object.assign({}, st.ui.imar, { mode: mode, fixed: null, tool: null, draft: null, lod: false });
    return sc(App.imarScene.scene(st.project, cx.A, cx.R, view, false));
  }
  function dsn(st, mode) {
    const P = st.project, dc = App.dsnCtx(P);
    return sc(App.dsnScene.scene(P, dc, Object.assign({}, st.ui.dsn, { mode: mode, sel: null }), false));
  }
  function fiz(st, mode) {
    const P = st.project, f = App.fizCtx(P);
    return sc(App.fizScene.scene(P, f, Object.assign({}, st.ui.fiz, { mode: mode }), false));
  }
  function unit(st, mode) {
    const o = Object.assign({}, App.unitDefaults ? App.unitDefaults() : {}, { live: false, mode: mode, kind: 'png' });
    return sc(App.unit.scene(st.project.unit, o));
  }

  T.available = function (st) {
    const c = ctxs(st);
    const out = {};
    T.SOURCES.forEach((s) => { let ok = false; try { ok = !!MAKERS[s.id].ok(c); } catch (e) { ok = false; } out[s.id] = ok; });
    return out;
  };
  T.availableIds = (st) => { const a = T.available(st); return T.SOURCES.filter((s) => a[s.id]).map((s) => s.id); };

  /* ---------- damga: proje verisi değişince önbellek geçersiz olur ---------- */
  const ids = new WeakMap();
  let seq = 0;
  const idOf = (o) => { if (o == null || typeof o !== 'object') return String(o); let v = ids.get(o); if (!v) { v = ++seq; ids.set(o, v); } return v; };
  T.stamp = function (st) {
    const P = st.project;
    const u = st.ui;
    return [P.meta, P.spaces, P.relations, P.study, P.site, P.cand, P.design, P.fiz, P.unit, P.plan, P.collage, u.an, u.site, u.imar, u.dsn, u.fiz, App.collage ? App.collage.version : 0, App.theme.name].map(idOf).join('.');
  };

  /* ---------- tuvale çizim ve önbellek ---------- */
  const cache = new Map(); // anahtar → { status: 'busy'|'ok'|'err', href, ik, W, H, msg }
  T.onChange = null;
  const pending = [];
  let running = false;
  const keyOf = (id, stamp, hi) => id + '|' + stamp + '|' + (hi ? 'h' : 'l');

  function drain() {
    if (running) return;
    const job = pending.shift();
    if (!job) return;
    running = true;
    const done = () => { running = false; const w = job.entry.waiters || []; job.entry.waiters = []; w.forEach((f) => { try { f(job.entry); } catch (e) { /* yok say */ } }); if (T.onChange) T.onChange(); setTimeout(drain, 0); };
    let out;
    try { hiRes = job.hi; out = Promise.resolve(MAKERS[job.id].make(job.st)); } catch (e) { out = Promise.reject(e); }
    out.then((r) => {
      if (r && typeof r.getContext === 'function') return { cv: r, W: App.sheet.W, H: App.sheet.H };
      const W = r.W || App.sheet.W, H = r.H || App.sheet.H;
      const pre = App.collage ? App.collage.preload(r.prims) : Promise.resolve();
      return pre.then(() => App.board.primsToCanvas(r.prims, W, H, job.hi ? 2 : 1.25)).then((cv) => ({ cv: cv, W: W, H: H }));
    }).then((o) => {
      const href = o.cv.toDataURL('image/jpeg', job.hi ? 0.92 : 0.86);
      const ik = 'tp|' + job.key;
      const el = new Image();
      el.onload = () => { App.board.imgCache[ik] = el; job.entry.status = 'ok'; done(); };
      el.onerror = () => { job.entry.status = 'err'; job.entry.msg = 'Görüntü çözülemedi.'; done(); };
      Object.assign(job.entry, { href: href, ik: ik, W: o.W, H: o.H });
      el.src = href;
    }).catch((e) => { job.entry.status = 'err'; job.entry.msg = (e && e.message) || 'Çıktı alınamadı.'; done(); }).then(() => { hiRes = false; });
  }
  function evict() {
    if (cache.size <= 26) return;
    const k = cache.keys().next().value;
    const e = cache.get(k);
    if (e && e.ik) delete App.board.imgCache[e.ik];
    cache.delete(k);
  }
  /* kaynağı iste: hazırsa girdiyi, değilse null döner (arka planda üretilir; bitince T.onChange çağrılır) */
  T.want = function (st, id, hi, cb) {
    if (!MAKERS[id]) return null;
    const stamp = T.stamp(st);
    const key = keyOf(id, stamp, hi);
    let e = cache.get(key);
    if (e) { cache.delete(key); cache.set(key, e); if (e.status === 'busy' && cb) e.waiters.push(cb); return e.status === 'busy' ? null : e; }
    e = { status: 'busy', waiters: cb ? [cb] : [] };
    cache.set(key, e);
    evict();
    pending.push({ id: id, st: st, key: key, entry: e, hi: !!hi });
    setTimeout(drain, 0);
    return null;
  };
  T.entryState = function (st, id) {
    const e = cache.get(keyOf(id, T.stamp(st), false)) || cache.get(keyOf(id, T.stamp(st), true));
    return e ? e.status : 'none';
  };
  /* dışa aktarma: gerekli tüm kaynaklar yüksek çözünürlükte hazır olana kadar bekle */
  T.ensure = function (st, srcIds) {
    const uniq = srcIds.filter((x, i, a) => a.indexOf(x) === i && MAKERS[x]);
    return Promise.all(uniq.map((id) => new Promise((res) => {
      const e = T.want(st, id, true, () => res());
      if (e) res();
    })));
  };
  T.entryFor = function (st, id, hi) {
    const e = cache.get(keyOf(id, T.stamp(st), hi));
    return e && e.status === 'ok' ? e : null;
  };
  T.errorFor = function (st, id) {
    const e = cache.get(keyOf(id, T.stamp(st), false));
    return e && e.status === 'err' ? e.msg : null;
  };

  /* çerçeveli sahnelerde kenarlık ve künye dışarıda kalacak kırpma bölgesi (sahne birimi) */
  T.frameRegion = function (W, H) {
    const F = App.sheet.F, tb = App.sheet.tb;
    return { x: F + 9, y: F + 9, w: W - F * 2 - 18, h: tb.y - F - 18 };
  };
})();
