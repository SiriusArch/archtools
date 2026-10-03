/* ==========================================================================
   00-core.js — ortak yardımcılar, mini sanal-DOM (h/patch), store
   Tüm modüller window.App altında toplanır; mantık katmanları (lib/*) arayüzden
   bağımsızdır ve ileride React vb. bir arayüze olduğu gibi taşınabilir.
   ========================================================================== */
(function () {
  const App = (window.App = window.App || {});
  const U = (App.util = {});

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  U.pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  U.norm = (s) =>
    String(s == null ? '' : s)
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/â/g, 'a')
      .replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  U.slug = (s) => U.norm(s).replace(/ /g, '-').replace(/[^a-z0-9+-]/g, '') || 'proje';
  U.fmt = (n, d) => {
    if (n == null || isNaN(n)) return '—';
    const r = Math.round(n * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d);
    return r.toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 1 : d });
  };
  U.sum = (arr, f) => arr.reduce((t, x) => t + (f ? f(x) : x), 0);
  U.mid = (r) => (r[0] + r[1]) / 2;
  U.round5 = (n) => Math.round(n * 2) / 2;
  U.today = () => {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  };

  /* ---------- mini sanal DOM ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function h(tag, props) {
    props = props || {};
    const kids = [];
    (function flat(a) {
      for (let i = 0; i < a.length; i++) {
        const k = a[i];
        if (Array.isArray(k)) flat(k);
        else if (k === null || k === undefined || k === false || k === true) continue;
        else if (typeof k === 'object') kids.push(k);
        else kids.push({ text: String(k) });
      }
    })(Array.prototype.slice.call(arguments, 2));
    return { tag: tag, props: props, children: kids, key: props.key };
  }

  const BOOL = { checked: 1, disabled: 1, selected: 1, hidden: 1, readOnly: 1 };

  function setProps(el, o, n, svg) {
    for (const k in o) if (!(k in n) && k !== 'key' && k !== 'ref' && k !== 'value' && k !== 'keep') clearProp(el, k, svg);
    for (const k in n) {
      if (k === 'key' || k === 'value' || k === 'keep') continue;
      const v = n[k];
      if (k === 'ref') { if (typeof v === 'function') v(el); continue; }
      if (k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110 && typeof v === 'function') { el[k.toLowerCase()] = v; continue; }
      if (o[k] === v && k !== 'style') continue;
      if (k === 'class') { if (svg) el.setAttribute('class', v || ''); else el.className = v || ''; }
      else if (k === 'style') {
        if (v && typeof v === 'object') {
          let css = '';
          for (const s in v) if (v[s] != null && v[s] !== false) css += s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + v[s] + ';';
          if (el.getAttribute('style') !== css) el.setAttribute('style', css);
        } else if (v) el.setAttribute('style', v); else el.removeAttribute('style');
      } else if (BOOL[k]) el[k] = !!v;
      else if (k === 'html') el.innerHTML = v;
      else if (v === false || v == null) el.removeAttribute(k);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  function clearProp(el, k, svg) {
    if (k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110) el[k.toLowerCase()] = null;
    else if (k === 'class') { if (svg) el.removeAttribute('class'); else el.className = ''; }
    else if (BOOL[k]) el[k] = false;
    else el.removeAttribute(k);
  }
  function applyValue(el, props) {
    if ('value' in props) {
      const v = props.value == null ? '' : String(props.value);
      if (el.value !== v && !(props.keep && document.activeElement === el)) el.value = v;
    }
  }

  function create(v, svg) {
    if (v.tag === undefined) { v.el = document.createTextNode(v.text); return v.el; }
    const isSvg = svg || v.tag === 'svg';
    const el = isSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
    setProps(el, {}, v.props, isSvg);
    const childSvg = isSvg && v.tag !== 'foreignObject';
    for (let i = 0; i < v.children.length; i++) el.appendChild(create(v.children[i], childSvg));
    applyValue(el, v.props);
    v.el = el;
    return el;
  }

  function patchEl(el, o, n, svg) {
    const isSvg = svg || n.tag === 'svg';
    setProps(el, o.props, n.props, isSvg);
    patchChildren(el, o.children, n.children, isSvg && n.tag !== 'foreignObject');
    applyValue(el, n.props);
    n.el = el;
  }

  function patchChildren(parent, oc, nc, svg) {
    const keyed = new Map();
    for (let i = 0; i < oc.length; i++) if (oc[i].key != null) keyed.set(oc[i].key, oc[i]);
    const used = new Set();
    const els = [];
    for (let i = 0; i < nc.length; i++) {
      const n = nc[i];
      let o = null;
      if (n.key != null) o = keyed.get(n.key) || null;
      else if (oc[i] && oc[i].key == null) o = oc[i];
      if (o && !used.has(o) && o.tag === n.tag) {
        used.add(o);
        if (n.tag === undefined) { if (o.text !== n.text) o.el.nodeValue = n.text; n.el = o.el; }
        else patchEl(o.el, o, n, svg);
      } else create(n, svg);
      els.push(n.el);
    }
    for (let i = 0; i < oc.length; i++) {
      const o = oc[i];
      if (!used.has(o) && o.el && o.el.parentNode === parent) parent.removeChild(o.el);
    }
    let ref = parent.firstChild;
    for (let i = 0; i < els.length; i++) {
      if (els[i] === ref) ref = ref.nextSibling;
      else parent.insertBefore(els[i], ref);
    }
  }

  App.h = h;
  App.mount = function (container, render) {
    let prev = null;
    return function paint() {
      const next = render();
      if (!prev || prev.tag !== next.tag) { container.textContent = ''; container.appendChild(create(next, false)); }
      else patchEl(prev.el, prev, next, false);
      prev = next;
    };
  };
  App.raf = function (fn) {
    let queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    };
  };

  /* ---------- store ---------- */
  App.createStore = function (reducer, initial) {
    let state = initial;
    const subs = new Set();
    return {
      get: () => state,
      dispatch(a) {
        const next = reducer(state, a);
        if (next !== state) { state = next; subs.forEach((f) => f(state, a)); }
      },
      subscribe(f) { subs.add(f); return () => subs.delete(f); },
    };
  };
})();
