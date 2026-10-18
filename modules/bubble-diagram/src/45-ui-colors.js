/* ==========================================================================
   45-ui-colors.js — "Renkler" paneli: palet seç → tonları kategoriye ya da tek daireye uygula
   Yalnızca Bauhaus ("Beni renklendir!") temasında görünür. Veri: App.palettes · mantık: App.colors (31-state-colors.js)
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const PL = App.palettes;

  const dispatch = (a) => App.store.dispatch(a);
  const curPal = (state) => PL.get(state.ui.pal) || PL.list[0];

  /* bir paletin 5 tonu: tıkla → uygula. cur: şu an uygulanan hex (ya da null) */
  function tones(pal, cur, onpick, label) {
    return h('div', { class: 'tones', role: 'group', 'aria-label': label },
      pal.colors.map((hex, i) => h('button', {
        key: i, type: 'button', class: 'tone' + (cur && cur.toUpperCase() === hex.toUpperCase() ? ' on' : ''),
        style: { background: hex, color: PL.textOn(hex, App.PAL.ink, App.PAL.paper) },
        title: hex + ' · ' + pal.name, 'aria-label': label + ': ' + hex, 'aria-pressed': String(!!cur && cur.toUpperCase() === hex.toUpperCase()),
        onclick: () => onpick(i),
      }, h('span', { class: 'tone-hex mono' }, hex.slice(1)))));
  }

  const resetBtn = (disabled, label, fn) => h('button', { type: 'button', class: 'icon-btn tone-x', title: label, 'aria-label': label, disabled: !!disabled, onclick: fn }, ui.icon('reset', 15));

  function palCard(state, p) {
    const on = state.ui.pal === p.id;
    return h('li', { key: p.id },
      h('button', { type: 'button', class: 'pal-card' + (on ? ' on' : ''), title: p.name + ' · ' + p.colors.join(' '), 'aria-pressed': String(on), 'aria-label': p.name, onclick: () => dispatch({ type: 'UI', patch: { pal: p.id } }) },
        h('span', { class: 'pal-strip', 'aria-hidden': 'true' }, p.colors.map((c, i) => h('i', { key: i, style: { background: c } }))),
        h('span', { class: 'pal-name mono' }, '#' + p.n)));
  }

  function zoneRow(state, pal, z) {
    const P = state.project;
    const n = P.spaces.filter((s) => s.zone === z).length;
    const c = App.colors.zone(P, z);
    const cur = c.custom ? c.fill : null;
    const label = App.ZONES[z].label;
    return h('li', { key: z, class: 'zrow' + (n ? '' : ' zempty') },
      h('div', { class: 'zrow-head' },
        h('span', { class: 'dot', style: { background: c.fill }, 'aria-hidden': 'true' }),
        h('span', { class: 'zrow-name' }, label),
        h('span', { class: 'zrow-n mono', title: n + ' mekân' }, String(n)),
        resetBtn(!cur, label + ' rengini sıfırla', () => dispatch({ type: 'COLOR_SET', scope: 'zone', keys: [z], ref: null }))),
      tones(pal, cur, (i) => dispatch({ type: 'COLOR_SET', scope: 'zone', keys: [z], ref: { p: pal.id, i: i } }), label + ' rengi'));
  }

  function targetCard(state, pal) {
    const P = state.project;
    const grp = ui.activeGroup(state);
    const ids = grp.length >= 2 ? grp : state.selectedId ? [state.selectedId] : [];
    if (!ids.length) return h('p', { class: 'note' }, 'Tek bir daire (ya da birkaçı) için: panoda daireye tıklayın veya kutu çizerek seçin; ardından bir ton seçin.');
    const list = ids.map((id) => P.spaces.find((s) => s.id === id)).filter(Boolean);
    if (!list.length) return null;
    const first = App.colors.space(P, list[0]);
    const same = list.every((s) => App.colors.space(P, s).fill === first.fill);
    const cur = same && list.every((s) => App.colors.sourceOf(P, s) === 'space') ? first.fill : null;
    const any = list.some((s) => App.colors.sourceOf(P, s) === 'space');
    const name = list.length === 1 ? list[0].name : list.length + ' mekân seçili';
    return h('div', { class: 'tcard' },
      h('div', { class: 'zrow-head' },
        list.length === 1 ? ui.spaceDot(list[0]) : h('span', { class: 'dot dot-multi', 'aria-hidden': 'true' }),
        h('span', { class: 'zrow-name' }, name),
        resetBtn(!any, name + ' özel rengini sıfırla', () => dispatch({ type: 'COLOR_SET', scope: 'space', keys: ids, ref: null }))),
      tones(pal, cur, (i) => dispatch({ type: 'COLOR_SET', scope: 'space', keys: ids, ref: { p: pal.id, i: i } }), name + ' rengi'),
      h('p', { class: 'note' }, 'Tek daire rengi, kategori renginin önüne geçer.'));
  }

  /* sol panelin "Renkler" sekmesi */
  ui.colorsPanel = function (state) {
    const P = state.project;
    const pal = curPal(state);
    const c = P.colors || { zones: {}, spaces: {} };
    const custom = Object.keys(c.zones).length + Object.keys(c.spaces).length;
    return h('div', { class: 'colors-tab' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('h2', { class: 'panel-title' }, 'Renk paleti'),
          h('span', { class: 'count mono' }, PL.list.length + ' palet')),
        h('ul', { class: 'pal-grid', role: 'list' }, PL.list.map((p) => palCard(state, p))),
        h('p', { class: 'note pal-src' }, 'Seçili: ', h('b', {}, pal.name), ' · kaynak: ', h('a', { href: pal.url, target: '_blank', rel: 'noopener noreferrer' }, 'colorpalettes.net')),
        h('div', { class: 'pal-actions' },
          ui.btn('Kategorilere dağıt', { icon: 'palette', cls: 'btn-yellow', title: 'Seçili paletin renklerini projedeki kategorilere sırayla uygula', onclick: () => dispatch({ type: 'COLOR_DISTRIBUTE', palette: pal.id }) }),
          ui.btn('Sıfırla', { icon: 'reset', title: 'Tüm özel renkleri kaldır', disabled: !custom, onclick: () => dispatch({ type: 'COLOR_RESET', what: 'all' }) }))),
      h('div', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Kategoriler'),
        h('p', { class: 'note' }, 'Bir kategoriye ton seçin; o kategorideki tüm daireler boyanır.'),
        h('ul', { class: 'zrows', role: 'list' }, App.ZONE_ORDER.map((z) => zoneRow(state, pal, z)))),
      h('div', { class: 'panel' },
        h('h2', { class: 'panel-title' }, 'Tek daire'),
        targetCard(state, pal)));
  };

  /* mekân satırının ayrıntısı için küçük renk seçici (Mekanlar sekmesi) */
  ui.spaceColorField = function (state, s) {
    if (!App.colors.active()) return null;
    const pal = curPal(state);
    const P = state.project;
    const own = App.colors.sourceOf(P, s) === 'space';
    const cur = own ? App.colors.space(P, s).fill : null;
    return h('div', { class: 'fld fld-color' },
      h('div', { class: 'fld-color-head' },
        h('span', { class: 'lbl' }, 'Renk'),
        h('button', { type: 'button', class: 'linkbtn', title: 'Palet seç', onclick: () => dispatch({ type: 'UI', patch: { tab: 'renk' } }) }, pal.name + ' ›'),
        resetBtn(!own, s.name + ' özel rengini sıfırla', () => dispatch({ type: 'COLOR_SET', scope: 'space', keys: [s.id], ref: null }))),
      tones(pal, cur, (i) => dispatch({ type: 'COLOR_SET', scope: 'space', keys: [s.id], ref: { p: pal.id, i: i } }), s.name + ' rengi'));
  };
})();
