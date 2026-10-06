/* ==========================================================================
   39-state-tpl.js — Pafta Şablonu eylemleri (reducer eklentisi) ve JSON uzantısı
   Veri project.tpl içinde durur; geri al / ileri al, otomatik kayıt ve JSON akışı Modül 1 ile ortaktır.
   Eylemler:
     TPL_SET {patch, rescale}               başlık, sayfa boyutu, zemin, vurgu, kenar boşluğu, aralık, yaslama
     TPL_ADD {panel}  TPL_ADD_MANY {panels}
     TPL_SET_P {id, patch}  TPL_LIVE {id, patch}   (canlı: geri alma noktası açmaz)
     TPL_DEL {id}  TPL_DUP {id}  TPL_ORDER {id, dir | to}  TPL_ALIGN {id, how}
     TPL_APPLY {doc}  (şablon uygula)   TPL_LOAD {doc}   TPL_CLEAR
   JSON uzantısı: extensions.boardTemplate (yüklenen görseller dahil; otomatik kayıtta görseller atlanır)
   ========================================================================== */
(function () {
  const App = window.App;
  const S = App.state;
  const T = App.tpl;

  const withT = (P, t) => Object.assign({}, P, { tpl: t });

  S.hooks.push(function (next, a) {
    let P = next.project;
    let state = next;
    if (!T) return undefined;
    if (!P.tpl || !Array.isArray(P.tpl.panels)) { P = withT(P, T.defaults()); state = Object.assign({}, state, { project: P }); }
    const same = () => (state === next ? undefined : state);
    if (!a.type || a.type.indexOf('TPL_') !== 0) return same();
    const c = P.tpl;
    const apply = (nc, history) => (history ? Object.assign(S.withHistory(state, withT(P, nc)), { selectedId: state.selectedId }) : Object.assign({}, state, { project: withT(P, nc) }));
    const setPanels = (panels, history) => apply(Object.assign({}, c, { panels: panels.slice(0, 120) }), history);

    switch (a.type) {
      case 'TPL_SET': {
        const patch = a.patch || {};
        let panels = c.panels;
        if (patch.size && patch.size !== c.size && T.SIZES[patch.size] && a.rescale) {
          const o = T.SIZES[c.size], n = T.SIZES[patch.size];
          const kx = n.w / o.w, ky = n.h / o.h, kf = Math.min(kx, ky);
          panels = panels.map((p) => {
            const q = Object.assign({}, p, { x: p.x * kx, y: p.y * ky, w: p.w * kx, h: p.h * ky, pad: Math.round(p.pad * kf) });
            if (p.t === 'text' || p.t === 'legend' || p.t === 'facts' || p.t === 'block') q.size = Math.round(p.size * kf);
            if (p.t === 'line') q.lw = p.lw * kf;
            return T.clean(q) || p;
          });
          patch.margin = Math.round(c.margin * kx); patch.gutter = Math.round(c.gutter * kx);
        }
        const o = T.cleanDoc(Object.assign({}, c, patch, { panels: panels }));
        return apply(o, true);
      }
      case 'TPL_ADD': {
        const l = T.clean(a.panel);
        if (!l) return same();
        const r = setPanels(c.panels.concat([l]), true);
        r.selectedId = l.id;
        return r;
      }
      case 'TPL_ADD_MANY': {
        const ls = (a.panels || []).map((l) => T.clean(l)).filter(Boolean);
        if (!ls.length) return same();
        return setPanels(c.panels.concat(ls), true);
      }
      case 'TPL_SET_P':
      case 'TPL_LIVE': {
        const l = c.panels.find((q) => q.id === a.id);
        if (!l) return same();
        const nx = T.clean(l, a.patch);
        if (!nx) return same();
        if (Object.keys(nx).every((k) => nx[k] === l[k] || (typeof nx[k] === 'object' && JSON.stringify(nx[k]) === JSON.stringify(l[k])))) return same();
        return setPanels(c.panels.map((q) => (q.id === a.id ? nx : q)), a.type === 'TPL_SET_P');
      }
      case 'TPL_DEL': {
        if (!c.panels.some((q) => q.id === a.id)) return same();
        const r = setPanels(c.panels.filter((q) => q.id !== a.id), true);
        if (state.selectedId === a.id) r.selectedId = null;
        return r;
      }
      case 'TPL_DUP': {
        const l = c.panels.find((q) => q.id === a.id);
        if (!l) return same();
        const cp = T.clean(Object.assign({}, l, { id: 'p' + Math.random().toString(36).slice(2, 8), locked: false, x: l.x + 30, y: l.y + 30 }));
        const i = c.panels.findIndex((q) => q.id === a.id);
        const r = setPanels(c.panels.slice(0, i + 1).concat([cp], c.panels.slice(i + 1)), true);
        r.selectedId = cp.id;
        return r;
      }
      case 'TPL_ORDER': {
        const i = c.panels.findIndex((q) => q.id === a.id);
        if (i < 0) return same();
        let j = i + (a.dir < 0 ? -1 : 1);
        if (a.to === 'top') j = c.panels.length - 1; else if (a.to === 'bottom') j = 0;
        if (j < 0 || j >= c.panels.length || j === i) return same();
        const ls = c.panels.slice();
        const it = ls.splice(i, 1)[0];
        ls.splice(j, 0, it);
        return setPanels(ls, true);
      }
      case 'TPL_ALIGN': {
        const l = c.panels.find((q) => q.id === a.id);
        if (!l) return same();
        const patch = T.alignTo(l, c, a.how);
        const nx = T.clean(l, patch);
        if (!nx) return same();
        return setPanels(c.panels.map((q) => (q.id === a.id ? nx : q)), true);
      }
      case 'TPL_APPLY':
      case 'TPL_LOAD': {
        const doc = T.cleanDoc(a.doc);
        return Object.assign(apply(doc, true), { selectedId: null });
      }
      case 'TPL_CLEAR':
        return Object.assign(apply(Object.assign({}, c, { panels: [] }), true), { selectedId: null });
      default:
    }
    return same();
  });

  /* ---------- JSON uzantısı: extensions.boardTemplate ---------- */
  T.toExt = function (project) {
    const c = project.tpl;
    if (!c || !c.panels.length) return {};
    const sz = T.sizeOf(c);
    const out = {
      version: 1, title: c.title, size: c.size, canvas: { width: sz.w, height: sz.h, unit: 'px' }, background: c.bg, accent: c.accent, monochrome: { on: !!(c.mono && c.mono.on), color: c.mono ? c.mono.col : T.MONO_DEFAULT },
      margin: c.margin, gutter: c.gutter, snap: c.snap, panels: c.panels.map((l) => JSON.parse(JSON.stringify(l))),
    };
    if (!App.autosaving && App.collage) {
      out.images = {};
      c.panels.forEach((l) => {
        if (l.t === 'view' && l.src.k === 'img' && App.collage.imgs[l.src.id] && !out.images[l.src.id]) { const im = App.collage.imgs[l.src.id]; out.images[l.src.id] = { name: im.name, width: im.w, height: im.h, data: im.src }; }
      });
    }
    return { boardTemplate: out };
  };
  App.extProviders.push(T.toExt);

  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext) {
    const x = ext && ext.boardTemplate;
    if (!x || !Array.isArray(x.panels)) return {};
    if (x.images && typeof x.images === 'object' && App.collage) {
      Object.keys(x.images).forEach((id) => {
        const r = x.images[id];
        if (r && typeof r.data === 'string' && /^data:image\//.test(r.data) && !App.collage.imgs[id]) App.collage.addImg({ id: id, name: r.name, w: Number(r.width) || 1000, h: Number(r.height) || 700, src: r.data });
      });
    }
    return { tpl: T.cleanDoc({ title: x.title, size: x.size, bg: x.background, accent: x.accent, mono: x.monochrome ? { on: x.monochrome.on, col: x.monochrome.color } : null, margin: x.margin, gutter: x.gutter, snap: x.snap, panels: x.panels }) };
  });
})();
