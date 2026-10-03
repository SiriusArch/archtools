/* ==========================================================================
   49-ui-controls.js — modüller arası ortak form kontrolleri
   Sınıf adları iki temada da (glass / Bauhaus) CSS ile ayrı giydirilir:
     .sgm  parçalı düğme grubu     .rng  etiketli kaydırıcı     .stp  artı/eksi adımlayıcı
     .tgl  aç/kapa düğmesi         .fld2 etiket + kontrol satırı
   Hepsi saf fonksiyondur: state almaz, değeri ve geri çağrıyı dışarıdan alır.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;

  /* Parçalı düğme grubu: o = { value, options: [{ v, label, title }], onchange(v), label, wide } */
  ui.segmented = function (o) {
    return h('div', { class: 'sgm' + (o.wide ? ' sgm-wide' : ''), role: 'group', 'aria-label': o.label || null },
      o.options.map((x) => h('button', { key: String(x.v), type: 'button', class: 'sgm-b' + (x.v === o.value ? ' on' : ''), 'aria-pressed': String(x.v === o.value), title: x.title || null, onclick: () => { if (x.v !== o.value) o.onchange(x.v); } }, x.label)));
  };

  /* Kaydırıcı: o = { id, label, value, min, max, step, text (gösterilen değer), oninput(v), onchange(v), hint } */
  ui.range = function (o) {
    const parse = (e) => parseFloat(e.target.value);
    return h('div', { class: 'rng' },
      h('div', { class: 'rng-top' },
        h('label', { class: 'rng-lbl', for: o.id }, o.label),
        h('output', { class: 'rng-val mono', for: o.id }, o.text == null ? String(o.value) : o.text)),
      h('input', { id: o.id, class: 'rng-in', type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value, keep: true, 'aria-valuetext': o.text == null ? null : String(o.text), oninput: o.oninput ? (e) => o.oninput(parse(e)) : null, onchange: o.onchange ? (e) => o.onchange(parse(e)) : null }),
      o.hint ? h('p', { class: 'rng-hint' }, o.hint) : null);
  };

  /* Artı / eksi adımlayıcı: o = { label, value, min, max, onchange(v), unit, id } */
  ui.stepper = function (o) {
    const set = (v) => { if (v >= o.min && v <= o.max && v !== o.value) o.onchange(v); };
    return h('div', { class: 'stp', role: 'group', 'aria-label': o.label },
      h('button', { type: 'button', class: 'stp-b', 'aria-label': o.label + ' azalt', disabled: o.value <= o.min, onclick: () => set(o.value - 1) }, '−'),
      h('span', { class: 'stp-v', id: o.id || null, 'aria-live': 'polite' }, h('b', { class: 'mono' }, String(o.value)), o.unit ? h('span', { class: 'stp-u' }, o.unit) : null),
      h('button', { type: 'button', class: 'stp-b', 'aria-label': o.label + ' artır', disabled: o.value >= o.max, onclick: () => set(o.value + 1) }, '+'));
  };

  /* Aç / kapa: o = { label, on, onclick, title } */
  ui.toggle = function (o) {
    return h('button', { type: 'button', class: 'tgl' + (o.on ? ' on' : ''), 'aria-pressed': String(!!o.on), title: o.title || null, onclick: o.onclick },
      h('i', { class: 'tgl-dot', 'aria-hidden': 'true' }), h('span', {}, o.label));
  };

  /* Etiket + kontrol: yan yana (dar), alt alta (geniş) */
  ui.fld2 = function (label, control, hint) {
    return h('div', { class: 'fld2' },
      h('span', { class: 'fld2-l' }, label),
      h('div', { class: 'fld2-c' }, control),
      hint ? h('p', { class: 'fld2-h' }, hint) : null);
  };

  /* Bölüm başlığı + gövde (sol panel kutusu) */
  ui.section = function (title, body, aside, key) {
    return h('section', { class: 'panel sec', key: key || title },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, title), aside ? h('span', { class: 'count mono' }, aside) : null),
      body);
  };

  /* Sol panel sekmeleri: tabs = [{ id, label, n, warn }] */
  ui.tabsBar = function (tabs, cur, onpick) {
    return h('div', { class: 'tabs', role: 'tablist' },
      tabs.map((t) => h('button', { key: t.id, type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-selected': String(cur === t.id), class: 'tab' + (cur === t.id ? ' on' : ''), onclick: () => onpick(t.id) },
        t.label, t.n != null ? h('span', { class: 'tab-n' + (t.warn ? ' tab-n-warn' : '') }, String(t.n)) : null)));
  };

  /* Bulgu kartları listesi (Modül 1 asistanıyla aynı kart) */
  ui.findingList = function (res, intro) {
    const c = res.counts;
    return h('div', { class: 'panel find-panel' },
      intro ? h('p', { class: 'note' }, intro) : null,
      h('div', { class: 'as-counts' },
        h('span', { class: 'cnt cnt-hata' }, 'Uyarı ', h('b', {}, String(c.hata + c.uyari))),
        h('span', { class: 'cnt' }, 'Öneri ', h('b', {}, String(c.oneri)))),
      h('ul', { class: 'cards' }, res.items.map((it) => ui.findingCard(it))));
  };
})();
