/* ==========================================================================
   40-ui-common.js — ikonlar ve ortak arayüz yardımcıları
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = (App.ui = App.ui || {});

  const ICONS = {
    save: ['M12 3v12m0 0l-4-4m4 4l4-4', 'M4 20h16'],
    open: ['M12 16V4m0 0L8 8m4-4l4 4', 'M4 20h16'],
    image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', { c: [9, 9, 1.5] }],
    pdf: ['M6 3h8l4 4v14H6z', 'M14 3v5h4', 'M9 14h6M9 17h6'],
    undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 010 12h-4'],
    redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 000 12h4'],
    layout: ['M3 12a9 9 0 0115-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 01-15 6.7L3 16', 'M3 21v-5h5'],
    plus: ['M12 5v14M5 12h14'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
    close: ['M6 6l12 12M18 6L6 18'],
    chevron: ['M9 6l6 6-6 6'],
    newdoc: ['M6 3h8l4 4v14H6z', 'M14 3v5h4', 'M12 11v6M9 14h6'],
    spark: ['M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z'],
    send: ['M4 12l16-8-6 16-3-7z'],
    pin: ['M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z', { c: [12, 10, 2.5] }],
    check: ['M5 12l5 5 9-10'],
  };

  ui.icon = function (name, size) {
    const s = size || 18;
    const kids = (ICONS[name] || []).map((d) => (typeof d === 'string' ? h('path', { d: d }) : h('circle', { cx: d.c[0], cy: d.c[1], r: d.c[2] })));
    return h('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ico' }, kids);
  };

  // Bauhaus üçlüsü: daire, kare, üçgen
  ui.logo = function () {
    if (App.theme.name === 'glass' && ui.glass) return ui.glass.logo();
    return h('svg', { viewBox: '0 0 48 48', width: 44, height: 44, class: 'logo', 'aria-hidden': 'true' }, [
      h('rect', { x: 2, y: 2, width: 44, height: 44, fill: App.PAL.blue, stroke: App.PAL.ink, 'stroke-width': 3 }),
      h('circle', { cx: 17, cy: 17, r: 9, fill: App.PAL.yellow, stroke: App.PAL.ink, 'stroke-width': 2.5 }),
      h('rect', { x: 24, y: 24, width: 16, height: 16, fill: App.PAL.red, stroke: App.PAL.ink, 'stroke-width': 2.5 }),
      h('polygon', { points: '8,40 20,40 14,27', fill: App.PAL.paper, stroke: App.PAL.ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    ]);
  };

  ui.btn = function (label, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'btn ' + (opts.cls || ''), onclick: opts.onclick, title: opts.title || null, disabled: !!opts.disabled, id: opts.id || null, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) },
      opts.icon ? ui.icon(opts.icon, opts.iconSize) : null,
      label ? h('span', { class: opts.labelCls || '' }, label) : null,
      opts.badge ? h('span', { class: 'badge' + (opts.badgePulse ? ' pulse-badge' : '') }, opts.badge) : null);
  };

  ui.levelLabel = { hata: 'Hata', uyari: 'Uyarı', oneri: 'Öneri', ok: 'Tamam' };

  ui.zoneDot = function (zone) {
    const z = App.ZONES[zone] || App.ZONES.sosyal;
    return h('span', { class: 'dot', style: { background: z.fill }, title: z.label });
  };
})();
