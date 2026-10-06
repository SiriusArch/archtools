/* ==========================================================================
   38-lib-mass.js — Mekân Etüdü: kütle belgesi (izometrik görünüm ve süreç afişi için)
   Etüt verisi (mekânlar + ek öğeler + adımlar) çizim kütüphanesinin beklediği düz bir belgeye çevrilir:
     doc = { title, site{w,d}, siteOn, ctx[{id,x,y,w,d,h}], steps[{id,title,sub,desc,els[]}], cur }
     el  = mass { t:'mass', id, name, zone, x, y, w, d, shape, rot, cut, seed, lv, floors, roof }
         | void { x, y, w, d } | green { x, y, w, d, round, organic, seed } | tree { x, y, r } | arrow { k, x1, y1, x2, y2 }
   Koordinat: metre, x = doğu, y = güney; parsel (ya da çizim kutusu) sol-üst köşesi (0, 0).
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const st = (App.study = App.study || {});
  const mass = (App.massing = {});

  const FH = 3.2; // kat yüksekliği (m)
  mass.FH = FH;
  const r1 = (v) => Math.round(v * 10) / 10;
  const uid = () => 'c' + Math.random().toString(36).slice(2, 8);

  /* ---------- tohumlu rastgele ---------- */
  function rng(seed) {
    let a = (seed >>> 0) + 0x6d2b79f5;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  mass.rng = rng;

  /* ---------- çevre: parselin çevresinde gri mevcut yapılar (parsel yerel koordinatı) ---------- */
  function genCtx(site, seed, dens) {
    const R = rng(seed * 7919 + 13);
    const out = [];
    const street = 6, gap = 4, reach = 48;
    const span = (len, cell) => {
      const cols = [];
      const n = Math.max(1, Math.round((len + 2 * street) / (cell + gap)));
      const cw = (len + 2 * street - (n - 1) * gap) / n;
      for (let i = 0; i < n; i++) cols.push({ a: -street + i * (cw + gap), b: -street + i * (cw + gap) + cw, mid: true });
      for (let k = 0; k * (cell + gap) < reach; k++) {
        cols.push({ a: -street - k * (cell + gap) - cell, b: -street - k * (cell + gap), mid: false });
        cols.push({ a: len + street + k * (cell + gap), b: len + street + k * (cell + gap) + cell, mid: false });
      }
      return cols;
    };
    const cx = span(site.w, 18), cy = span(site.d, 16);
    cx.forEach((c) => cy.forEach((r) => {
      if (c.mid && r.mid) return; // parsel + sokak şeridi
      if (R() > dens) return;
      const cw = c.b - c.a, rd = r.b - r.a;
      const w = r1(cw * (0.6 + R() * 0.4)), d = r1(rd * (0.55 + R() * 0.45));
      const x = r1(c.a + (cw - w) * R()), y = r1(r.a + (rd - d) * R());
      out.push({ id: uid(), x: x, y: y, w: w, d: d, h: r1(FH * (2 + Math.floor(R() * 5))) });
    }));
    return out;
  }
  mass.genCtx = genCtx;

  /* ---------- geometri ---------- */
  mass.ring = function (m) { return st.freeRing({ x: m.x, y: m.y, w: m.w, h: m.d, shape: m.shape, rot: m.rot, cut: m.cut, seed: m.seed }); };
  mass.area = (m) => st.polyArea(mass.ring(m));

  /* ---------- ölçüler (adım başına) ---------- */
  mass.metrics = function (u, step) {
    const site = u.site;
    const A = Math.max(1, site.w * site.d);
    let foot = 0, gfa = 0, maxF = 0, maxH = 0, n = 0, green = 0, roofG = 0, voidA = 0, trees = 0;
    step.els.forEach((e) => {
      if (e.t === 'mass') {
        const a = mass.area(e);
        if (e.lv === 0) foot += a;
        gfa += a * e.floors; n++;
        maxF = Math.max(maxF, e.lv + e.floors); maxH = Math.max(maxH, (e.lv + e.floors) * FH);
        if (e.roof === 'green') roofG += a;
      } else if (e.t === 'green') green += st.polyArea(st.extraRing({ t: 'green', x: e.x, y: e.y, w: e.w, h: e.d, round: e.round, organic: e.organic, seed: e.seed }));
      else if (e.t === 'void') voidA += e.w * e.d;
      else if (e.t === 'tree') trees++;
    });
    const greenAll = Math.min(A, green + roofG);
    return { siteArea: A, footprint: foot, gfa: gfa, taks: foot / A, kaks: gfa / A, maxFloors: maxF, maxHeight: maxH, masses: n, green: green, roofGreen: roofG, greenShare: greenAll / A, voidArea: voidA, trees: trees };
  };

  /* ---------- belge üretimi ---------- */
  function elsOf(project, shapes, extras, off) {
    const els = [];
    project.spaces.forEach((sp) => {
      const raw = shapes[sp.id];
      if (!raw) return;
      const f = st.freeClean(raw);
      els.push({ t: 'mass', id: sp.id, name: sp.name, zone: sp.zone, x: f.x - off[0], y: f.y - off[1], w: f.w, d: f.h, shape: f.shape, rot: f.rot, cut: f.cut, seed: f.seed, lv: f.lv, floors: f.nf, roof: f.roof });
    });
    (extras || []).forEach((e) => {
      if (e.t === 'green') els.push({ t: 'green', id: e.id, x: e.x - off[0], y: e.y - off[1], w: e.w, d: e.h, round: e.round, organic: e.organic, seed: e.seed });
      else if (e.t === 'void') els.push({ t: 'void', id: e.id, x: e.x - off[0], y: e.y - off[1], w: e.w, d: e.h });
      else if (e.t === 'tree') els.push({ t: 'tree', id: e.id, x: e.x - off[0], y: e.y - off[1], r: e.r });
      else if (e.t === 'arrow') els.push({ t: 'arrow', id: e.id, k: e.k, x1: e.x1 - off[0], y1: e.y1 - off[1], x2: e.x2 - off[0], y2: e.y2 - off[1] });
    });
    return els;
  }

  function frame(project) {
    const free = project.study.free;
    const fd = st.freeDerive(project);
    let site, siteOn = false, off;
    if (fd.siteRing) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      fd.siteRing.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
      off = [x0, y0]; site = { w: x1 - x0, d: y1 - y0 }; siteOn = true;
    } else {
      const b = st.freeViewBounds(fd);
      off = [b.x0 - 3, b.y0 - 3]; site = { w: Math.max(10, b.w + 6), d: Math.max(10, b.h + 6) };
    }
    // çevre yapıları
    let ctx = [];
    let mode = (free.ctx && free.ctx.mode) || 'auto';
    const planOk = !!(project.plan && project.plan.els && project.plan.els.length);
    if (mode === 'auto') mode = free.link && planOk ? 'plan' : siteOn ? 'gen' : 'off';
    if (mode === 'plan' && planOk) {
      const org = free.org || [0, 0];
      project.plan.els.forEach((e) => {
        if (e.t !== 'bld' || !e.pts || e.id === (free.link && free.link.elId)) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        e.pts.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
        ctx.push({ id: e.id, x: x0 - org[0] - off[0], y: y0 - org[1] - off[1], w: x1 - x0, d: y1 - y0, h: FH * Math.max(1, Math.min(14, Math.round(e.floors || 3))) });
      });
    } else if (mode === 'gen' && siteOn) ctx = genCtx(site, (free.ctx && free.ctx.seed) || 3, free.ctx && free.ctx.dens != null ? free.ctx.dens : 0.7);
    return { fd: fd, free: free, site: site, siteOn: siteOn, off: off, ctx: ctx };
  }

  /* o: { live: tek adım olarak güncel durum | steps: kayıtlı adımlar (yoksa güncel durum) } */
  mass.doc = function (project, o) {
    o = o || {};
    const F = frame(project);
    const live = { id: 'live', title: 'Güncel durum', sub: '', desc: '', els: elsOf(project, F.free.shapes, F.fd.extras, F.off) };
    let steps = [live];
    if (!o.live && F.free.steps && F.free.steps.length) {
      steps = F.free.steps.map((s) => ({ id: s.id, title: s.title, sub: s.sub, desc: s.desc, els: elsOf(project, Object.assign({}, F.free.shapes, s.shapes), s.extras, F.off) }));
    }
    return { title: project.meta.name, site: F.site, siteOn: F.siteOn, ctx: F.ctx, steps: steps, cur: steps.length - 1 };
  };
})();
