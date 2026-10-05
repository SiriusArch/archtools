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
    layers: ['M12 2.5l9 4.7-9 4.7-9-4.7z', 'M3 12l9 4.7 9-4.7', 'M3 16.8l9 4.7 9-4.7'],
    reset: ['M3 12a9 9 0 103-6.7', 'M3 4v5h5'],
    play: ['M7 4l13 8-13 8z'],
    search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M21 21l-5-5'],
    share: ['M4 12v7h16v-7', 'M12 3v12', 'M8 7l4-4 4 4'],
    help: [{ c: [12, 12, 9] }, 'M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4', 'M12 17.5v.01'],
    target: [{ c: [12, 12, 8] }, { c: [12, 12, 2.5] }, 'M12 2v4M12 18v4M2 12h4M18 12h4'],
    parcel: ['M4 9l8-5 8 6-3 10H6z'],
    draw: ['M4 20l4-1 11-11-3-3L5 16z'],
    rect: ['M4 6.5h16v11H4z'],
    expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
    shrink: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
    poly: ['M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z'],
    shapeL: ['M5 4h8v7h6v9H5z'],
    shapeT: ['M4 4h16v6h-5v10H9v-10H4z'],
    shapeU: ['M4 4h5v10h6V4h5v16H4z'],
    rotate: ['M20 12a8 8 0 11-2.7-6', 'M20 4v5h-5'],
    link: ['M10 14l4-4', 'M8 12l-2 2a3.5 3.5 0 005 5l2-2', 'M16 12l2-2a3.5 3.5 0 00-5-5l-2 2'],
    grid: ['M4 4h16v16H4z', 'M4 12h16M12 4v16'],
    cube: ['M12 2.5l8 4.5v10l-8 4.5-8-4.5V7z', 'M4 7l8 4.5L20 7', 'M12 11.5v10'],
    sun: [{ c: [12, 12, 4] }, 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'],
    copy: ['M8 8h11v12H8z', 'M5 16V4h11'],
    compare: ['M4 6h7v12H4z', 'M13 9h7v9h-7z'],
    download: ['M12 4v11m0 0l-4-4m4 4l4-4', 'M4 20h16'],
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
