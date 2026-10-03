/* ==========================================================================
   43-ui-sidebar.js — sol panel: mekân ekleme, şablon, mekân listesi, ilişki matrisi
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  const REL_BTN = [['none', '·', 'İlişkisiz'], ['strong', '●', 'Güçlü'], ['weak', '○', 'Zayıf'], ['avoid', '✕', 'Ayrı tut']];

  function statusOf(d, s) {
    const e = d.analysis.matched && d.analysis.matched.bySpace.get(s.id);
    if (!e) return null;
    if (e.min != null && s.area < e.min - 0.001) return { lvl: 'hata', label: 'min altı', tip: 'Asgari ' + U.fmt(e.min) + ' m² (' + e.src + ')' };
    if (s.area < e.typ[0] - 0.001) return { lvl: 'uyari', label: 'düşük', tip: 'Tipik ' + U.fmt(e.typ[0]) + '–' + U.fmt(e.typ[1]) + ' m²' };
    if (s.area > e.typ[1] * 1.8) return { lvl: 'oneri', label: 'büyük', tip: 'Tipik ' + U.fmt(e.typ[0]) + '–' + U.fmt(e.typ[1]) + ' m²' };
    return { lvl: 'ok', label: 'uygun', tip: 'Tipik ' + U.fmt(e.typ[0]) + '–' + U.fmt(e.typ[1]) + ' m²' };
  }

  function formView(state) {
    const ctl = App.ctl;
    const f = state.ui.form;
    const variant = App.kb.variant(state.project.meta.buildingType, state.project.meta.variant);
    return h('form', { class: 'panel add-form', onsubmit: (e) => { e.preventDefault(); ctl.addFromForm(); }, novalidate: true },
      h('h2', { class: 'panel-title' }, 'Mekan ekle'),
      h('div', { class: 'add-row' },
        h('div', { class: 'fld fld-grow' },
          h('label', { class: 'lbl', for: 'sp-name' }, 'Mekan adı'),
          h('input', { id: 'sp-name', class: 'inp', type: 'text', list: 'sp-list', placeholder: 'Örn. Salon', value: f.name, autocomplete: 'off', maxlength: 60, oninput: (e) => ctl.onNameInput(e.target.value) }),
          h('datalist', { id: 'sp-list' }, variant.entries.map((e) => h('option', { key: e.key, value: e.name })))),
        h('div', { class: 'fld fld-area' },
          h('label', { class: 'lbl', for: 'sp-area' }, 'Alan (m²)'),
          h('input', { id: 'sp-area', class: 'inp mono', type: 'number', inputmode: 'decimal', min: 0.5, step: 0.5, placeholder: '24', value: f.area, oninput: (e) => ctl.dispatch({ type: 'FORM', patch: { area: e.target.value, error: '' } }) }))),
      f.error ? h('p', { class: 'form-error', role: 'alert' }, f.error) : null,
      h('button', { type: 'submit', class: 'btn btn-primary btn-wide' }, ui.icon('plus', 18), h('span', {}, 'Mekanı ekle')));
  }

  function templateView(state) {
    const ctl = App.ctl;
    const t = App.kb.type(state.ui.tplType);
    return h('details', { class: 'panel tpl' },
      h('summary', { class: 'panel-title summary' }, 'Hazır bina programı'),
      h('div', { class: 'tpl-body' },
        h('div', { class: 'fld' },
          h('label', { class: 'lbl', for: 'tpl-type' }, 'Bina tipi'),
          h('select', { id: 'tpl-type', class: 'inp', value: state.ui.tplType, onchange: (e) => { const nt = App.kb.type(e.target.value); ctl.dispatch({ type: 'UI', patch: { tplType: nt.key, tplVariant: nt.variants[0].key } }); ctl.dispatch({ type: 'SET_META', patch: { buildingType: nt.key, variant: nt.variants[0].key } }); } },
            App.KB.TYPES.map((x) => h('option', { key: x.key, value: x.key }, x.label)))),
        h('div', { class: 'fld' },
          h('label', { class: 'lbl', for: 'tpl-var' }, 'Program'),
          h('select', { id: 'tpl-var', class: 'inp', value: state.ui.tplVariant, onchange: (e) => { ctl.dispatch({ type: 'UI', patch: { tplVariant: e.target.value } }); ctl.dispatch({ type: 'SET_META', patch: { variant: e.target.value } }); } },
            t.variants.map((v) => h('option', { key: v.key, value: v.key }, v.label)))),
        h('p', { class: 'note' }, 'Bina tipi, Akıllı öneri panelinin hangi programa göre kontrol yapacağını belirler. Şablonu yüklemek mevcut projenin yerine geçer (geri alınabilir).'),
        ui.btn('Şablonu yükle', { icon: 'newdoc', cls: 'btn-blue btn-wide', onclick: () => ctl.loadTemplate(state.ui.tplType, state.ui.tplVariant) })));
  }

  function relEditor(state, s) {
    const ctl = App.ctl;
    const others = state.project.spaces.filter((o) => o.id !== s.id);
    if (!others.length) return h('p', { class: 'note' }, 'İlişki kurmak için en az iki mekân gerekir.');
    return h('div', { class: 'rel-list' },
      others.map((o) => {
        const cur = state.project.relations[U.pairKey(s.id, o.id)] || 'none';
        return h('div', { class: 'rel-row', key: o.id },
          h('span', { class: 'rel-name' }, ui.zoneDot(o.zone), h('span', {}, o.name)),
          h('div', { class: 'seg', role: 'group', 'aria-label': s.name + ' ile ' + o.name + ' ilişkisi' },
            REL_BTN.map((b) => h('button', { key: b[0], type: 'button', class: 'seg-btn seg-' + b[0] + (cur === b[0] ? ' on' : ''), title: b[2], 'aria-pressed': String(cur === b[0]), 'aria-label': b[2], onclick: () => ctl.dispatch({ type: 'SET_RELATION', a: s.id, b: o.id, rel: b[0] }) }, b[1]))));
      }));
  }

  function rowView(state, d, s) {
    const ctl = App.ctl;
    const sel = state.selectedId === s.id;
    const st = statusOf(d, s);
    return h('li', { key: s.id, class: 'row' + (sel ? ' sel' : ''), id: 'row-' + s.id },
      h('div', { class: 'row-main', onclick: () => ctl.dispatch({ type: 'SELECT', id: sel ? null : s.id }) },
        ui.zoneDot(s.zone),
        h('span', { class: 'row-name' }, s.name),
        st ? h('span', { class: 'pill pill-' + st.lvl, title: st.tip }, st.label) : null,
        h('label', { class: 'area-wrap', onclick: (e) => e.stopPropagation() },
          h('span', { class: 'sr' }, s.name + ' alanı (m²)'),
          h('input', { class: 'inp area-inp mono', type: 'number', min: 0.5, step: 0.5, value: s.area, keep: true, 'data-id': s.id, onchange: (e) => ctl.dispatch({ type: 'UPDATE_SPACE', id: s.id, patch: { area: e.target.value } }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
          h('span', { class: 'unit' }, 'm²')),
        h('button', { type: 'button', class: 'icon-btn', title: s.name + ' sil', 'aria-label': s.name + ' sil', onclick: (e) => { e.stopPropagation(); ctl.dispatch({ type: 'REMOVE_SPACE', id: s.id }); } }, ui.icon('trash', 16))),
      sel ? h('div', { class: 'row-detail' },
        h('div', { class: 'detail-grid' },
          h('div', { class: 'fld' }, h('label', { class: 'lbl', for: 'ed-name' }, 'Ad'),
            h('input', { id: 'ed-name', class: 'inp', type: 'text', maxlength: 60, value: s.name, keep: true, onchange: (e) => { if (e.target.value.trim()) ctl.dispatch({ type: 'UPDATE_SPACE', id: s.id, patch: { name: e.target.value.trim() } }); } })),
          h('div', { class: 'fld' }, h('label', { class: 'lbl', for: 'ed-zone' }, 'Bölge (renk)'),
            h('select', { id: 'ed-zone', class: 'inp', value: s.zone, onchange: (e) => ctl.dispatch({ type: 'UPDATE_SPACE', id: s.id, patch: { zone: e.target.value } }) },
              App.ZONE_ORDER.map((z) => h('option', { key: z, value: z }, App.ZONES[z].label))))),
        h('h3', { class: 'sub-title' }, 'Diğer mekânlarla ilişkisi'),
        relEditor(state, s)) : null);
  }

  function listView(state, d) {
    const P = state.project;
    const total = U.sum(P.spaces, (s) => s.area);
    return h('div', { class: 'panel list-panel' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, 'Mekanlar'),
        h('span', { class: 'count mono' }, P.spaces.length + ' mekân · ' + U.fmt(total) + ' m²')),
      P.spaces.length
        ? h('ul', { class: 'rows' }, P.spaces.map((s) => rowView(state, d, s)))
        : h('p', { class: 'note' }, 'Henüz mekân yok. Yukarıdan ekleyin veya hazır bina programını yükleyin.'));
  }

  function matrixView(state, d) {
    const ctl = App.ctl;
    const P = state.project;
    const sp = P.spaces;
    if (sp.length < 2) return h('div', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'İlişki matrisi'), h('p', { class: 'note' }, 'Matris için en az iki mekân ekleyin.'));
    const sel = state.selectedId;
    return h('div', { class: 'panel matrix-panel' },
      h('h2', { class: 'panel-title' }, 'İlişki matrisi'),
      h('p', { class: 'note' }, 'Bir hücreye tıklayın: İlişkisiz → Güçlü → Zayıf → Ayrı tut. Her iki yönde aynıdır.'),
      h('ul', { class: 'legend' }, REL_BTN.map((b) => h('li', { key: b[0], class: 'legend-i' }, h('span', { class: 'mcell-sym sym-' + b[0] }, b[1]), ' ' + b[2]))),
      h('div', { class: 'matrix-scroll' },
        h('table', { class: 'matrix' },
          h('thead', {}, h('tr', {}, h('th', { class: 'corner' }, ''), sp.slice(0, -1).map((c) => h('th', { key: c.id, class: 'mh' + (sel === c.id ? ' on' : ''), scope: 'col' }, h('button', { type: 'button', class: 'mh-btn', onclick: () => ctl.dispatch({ type: 'SELECT', id: c.id }), title: c.name }, h('span', { class: 'vert' }, c.name)))))),
          h('tbody', {}, sp.slice(1).map((r, ri) => h('tr', { key: r.id },
            h('th', { class: 'rh' + (sel === r.id ? ' on' : ''), scope: 'row' }, h('button', { type: 'button', class: 'rh-btn', onclick: () => ctl.dispatch({ type: 'SELECT', id: r.id }), title: r.name }, ui.zoneDot(r.zone), h('span', {}, r.name))),
            sp.slice(0, -1).map((c, ci) => {
              if (ci > ri) return h('td', { key: c.id, class: 'mc-empty' });
              const rel = P.relations[U.pairKey(r.id, c.id)] || 'none';
              const hot = sel === r.id || sel === c.id;
              return h('td', { key: c.id, class: 'mc' + (hot ? ' hot' : '') },
                h('button', { type: 'button', class: 'mcell mcell-' + rel, title: r.name + ' ↔ ' + c.name + ': ' + App.REL[rel].label, 'aria-label': r.name + ' ile ' + c.name + ': ' + App.REL[rel].label, onclick: () => ctl.dispatch({ type: 'CYCLE_RELATION', a: r.id, b: c.id }) },
                  h('span', { class: 'mcell-sym sym-' + rel }, REL_BTN.find((b) => b[0] === rel)[1])));
            })))))));
  }

  ui.sidebar = function (state, d) {
    const ctl = App.ctl;
    const tab = state.ui.tab;
    return h('aside', { class: 'sidebar', 'aria-label': 'Proje paneli' },
      h('div', { class: 'tabs', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', id: 'tab-spaces', 'aria-selected': String(tab === 'spaces'), class: 'tab' + (tab === 'spaces' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } }) }, 'Mekanlar', h('span', { class: 'tab-n' }, String(state.project.spaces.length))),
        h('button', { type: 'button', role: 'tab', id: 'tab-matrix', 'aria-selected': String(tab === 'matrix'), class: 'tab' + (tab === 'matrix' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { tab: 'matrix' } }) }, 'İlişki matrisi', h('span', { class: 'tab-n' }, String(Object.keys(state.project.relations).length)))),
      h('div', { class: 'side-body', role: 'tabpanel' },
        tab === 'spaces' ? [formView(state), listView(state, d), templateView(state)] : matrixView(state, d)));
  };
})();
