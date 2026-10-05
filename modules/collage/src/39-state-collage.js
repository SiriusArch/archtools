/* ==========================================================================
   39-state-collage.js — Kolaj eylemleri (reducer eklentisi) ve JSON uzantısı
   Veri project.collage içinde durur; geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır.
   Eylemler:
     COL_SET {patch}                      başlık, boyut, zemin, vurgu rengi
     COL_ADD {layer}  COL_ADD_MANY {layers}
     COL_SET_L {id, patch}  COL_LIVE {id, patch}   (canlı: geri alma noktası açmaz)
     COL_DEL {id}  COL_DUP {id}  COL_ORDER {id, dir | to}
     COL_ACCENT_ALL {col}                 tüm şekillerin rengini değiştir
     COL_LOAD {doc}  COL_CLEAR
   JSON uzantısı: extensions.collage (görseller dahil; otomatik kayıtta görseller atlanır)
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const S = App.state;
  const C = App.collage;

  const withCol = (P, c) => Object.assign({}, P, { collage: c });

  S.hooks.push(function (next, a) {
    let P = next.project;
    let state = next;
    if (!C) return undefined;
    if (!P.collage || !Array.isArray(P.collage.layers)) { P = withCol(P, C.defaults()); state = Object.assign({}, state, { project: P }); }
    const same = () => (state === next ? undefined : state);
    if (!a.type || a.type.indexOf('COL_') !== 0) return same();
    const c = P.collage;
    const apply = (nc, history) => (history ? Object.assign(S.withHistory(state, withCol(P, nc)), { selectedId: state.selectedId }) : Object.assign({}, state, { project: withCol(P, nc) }));
    const setLayers = (layers, history) => apply(Object.assign({}, c, { layers: layers.slice(0, 300) }), history);

    switch (a.type) {
      case 'COL_SET': {
        const o = C.cleanDoc(Object.assign({}, c, a.patch || {}, { layers: c.layers }));
        return apply(o, true);
      }
      case 'COL_ADD': {
        const l = C.clean(a.layer);
        if (!l) return same();
        const r = setLayers(c.layers.concat([l]), true);
        r.selectedId = l.id;
        return r;
      }
      case 'COL_ADD_MANY': {
        const ls = (a.layers || []).map((l) => C.clean(l)).filter(Boolean);
        if (!ls.length) return same();
        return setLayers(c.layers.concat(ls), true);
      }
      case 'COL_SET_L':
      case 'COL_LIVE': {
        const l = c.layers.find((q) => q.id === a.id);
        if (!l) return same();
        const nx = C.clean(l, a.patch);
        if (!nx) return same();
        if (Object.keys(nx).every((k) => nx[k] === l[k] || (Array.isArray(nx[k]) && JSON.stringify(nx[k]) === JSON.stringify(l[k])))) return same();
        return setLayers(c.layers.map((q) => (q.id === a.id ? nx : q)), a.type === 'COL_SET_L');
      }
      case 'COL_DEL': {
        if (!c.layers.some((q) => q.id === a.id)) return same();
        const r = setLayers(c.layers.filter((q) => q.id !== a.id), true);
        if (state.selectedId === a.id) r.selectedId = null;
        return r;
      }
      case 'COL_DUP': {
        const l = c.layers.find((q) => q.id === a.id);
        if (!l) return same();
        const off = 24;
        const patch = l.t === 'line' ? { pts: l.pts.map((q) => [q[0] + off, q[1] + off]) } : { x: l.x + off, y: l.y + off };
        const cp = C.clean(Object.assign({}, l, { id: 'k' + Math.random().toString(36).slice(2, 8), locked: false }), patch);
        const i = c.layers.findIndex((q) => q.id === a.id);
        const layers = c.layers.slice(0, i + 1).concat([cp], c.layers.slice(i + 1));
        const r = setLayers(layers, true);
        r.selectedId = cp.id;
        return r;
      }
      case 'COL_ORDER': {
        const i = c.layers.findIndex((q) => q.id === a.id);
        if (i < 0) return same();
        let j = i + (a.dir < 0 ? -1 : 1);
        if (a.to === 'top') j = c.layers.length - 1; else if (a.to === 'bottom') j = 0;
        if (j < 0 || j >= c.layers.length || j === i) return same();
        const ls = c.layers.slice();
        const it = ls.splice(i, 1)[0];
        ls.splice(j, 0, it);
        return setLayers(ls, true);
      }
      case 'COL_ACCENT_ALL': {
        const col = C.hex(a.col, c.accent);
        return apply(Object.assign({}, c, { accent: col, layers: c.layers.map((l) => (l.t === 'shape' ? Object.assign({}, l, { col: col }) : l)) }), true);
      }
      case 'COL_LOAD': {
        const doc = C.cleanDoc(a.doc);
        return Object.assign(apply(doc, true), { selectedId: null });
      }
      case 'COL_CLEAR':
        return Object.assign(apply(Object.assign({}, C.defaults(), { title: c.title, size: c.size, bg: c.bg, accent: c.accent }), true), { selectedId: null });
      default:
    }
    return same();
  });

  /* ---------- JSON uzantısı: extensions.collage ---------- */
  C.toExt = function (project) {
    const c = project.collage;
    if (!c || !c.layers.length) return {};
    const out = { version: 1, title: c.title, size: c.size, canvas: { width: C.sizeOf(c).w, height: C.sizeOf(c).h, unit: 'px' }, background: c.bg, accent: c.accent, layers: c.layers.map((l) => Object.assign({}, l)) };
    if (!App.autosaving) {
      out.images = {};
      c.layers.forEach((l) => { if (l.t === 'photo' && C.imgs[l.src] && !out.images[l.src]) { const im = C.imgs[l.src]; out.images[l.src] = { name: im.name, width: im.w, height: im.h, data: im.src }; } });
    }
    return { collage: out };
  };
  App.extProviders.push(C.toExt);

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext) {
    const x = ext && ext.collage;
    if (!x || !Array.isArray(x.layers)) return {};
    if (x.images && typeof x.images === 'object') {
      Object.keys(x.images).forEach((id) => {
        const r = x.images[id];
        if (r && typeof r.data === 'string' && /^data:image\//.test(r.data) && !C.imgs[id]) C.addImg({ id: id, name: r.name, w: Number(r.width) || 1000, h: Number(r.height) || 700, src: r.data });
      });
    }
    return { collage: C.cleanDoc({ title: x.title, size: x.size, bg: x.background, accent: x.accent, layers: x.layers }) };
  });
})();
