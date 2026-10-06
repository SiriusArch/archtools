/* ==========================================================================
   29-lib-multisel.js — Ortak çoklu seçim (kutu seçimi) ve toplu taşıma yardımcıları
   Kütle / öğe çizen her araç (Mekân Etüdü, Vaziyet Planı, Kolaj, Pafta Şablonu, İşlev Şeması) aynı davranışı kullanır:
     boş alanda sürükle → kutu çizilir, kutuya değen öğeler seçilir · Shift+tık → seçime ekle / çıkar
     seçili öğelerden birini sürükle → hepsi birlikte taşınır · ok tuşları → hepsini kaydırır · Esc → seçimi bırak
   Bu dosya yalnızca ortak geometri ve çizimi içerir; öğe kaydı her aracın kendi durumunda tutulur.
   Kutu kayıtları: { id, x0, y0, x1, y1 } (aracın kendi koordinat sisteminde).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ms = (App.multi = {});

  /* a: başlangıç, b: şimdiki nokta. Sağdan sola çizilen kutu (cross) değen her şeyi, soldan sağa çizilen kutu yalnızca tamamen içindekileri seçer (CAD kuralı) */
  ms.rect = (a, b) => ({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), cross: b[0] < a[0] });
  ms.hit = (r, boxes) => boxes.filter((q) => (r.cross
    ? q.x1 >= r.x0 && q.x0 <= r.x1 && q.y1 >= r.y0 && q.y0 <= r.y1
    : q.x0 >= r.x0 - 0.01 && q.x1 <= r.x1 + 0.01 && q.y0 >= r.y0 - 0.01 && q.y1 <= r.y1 + 0.01)).map((q) => q.id);
  ms.bounds = function (boxes) {
    if (!boxes.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    boxes.forEach((q) => { x0 = Math.min(x0, q.x0); y0 = Math.min(y0, q.y0); x1 = Math.max(x1, q.x1); y1 = Math.max(y1, q.y1); });
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  };
  ms.toggle = (list, id) => (list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat([id]));
  ms.merge = (list, ids, add) => (add ? list.concat(ids.filter((x) => list.indexOf(x) < 0)) : ids.slice());
  ms.has = (list, id) => list.indexOf(id) >= 0;
  ms.DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  /* ekran (SVG px) koordinatında seçim kutusu */
  ms.marquee = function (r) {
    return h('rect', { key: 'ms-box', class: 'ms-rect', x: r.x0, y: r.y0, width: Math.max(0, r.x1 - r.x0), height: Math.max(0, r.y1 - r.y0), fill: App.PAL.ink, 'fill-opacity': r.cross ? 0.05 : 0.09, stroke: App.PAL.ink, 'stroke-width': 1.5, 'stroke-dasharray': r.cross ? '6 4' : null, 'pointer-events': 'none' });
  };
  /* ekran koordinatında grup çerçevesi (taşınabilir olduğunu gösterir) */
  ms.frame = function (r, pad) {
    pad = pad == null ? 6 : pad;
    return h('rect', { key: 'ms-frame', class: 'ms-frame', x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + pad * 2, height: r.y1 - r.y0 + pad * 2, fill: 'none', stroke: App.PAL.ink, 'stroke-opacity': 0.55, 'stroke-width': 1.2, 'pointer-events': 'none' });
  };
  /* üstteki "N öğe seçili" çipi (arayüz bileşeni) */
  ms.HINT = 'Kutuyu soldan sağa çizerseniz yalnızca tamamen içine alınanlar, sağdan sola çizerseniz değenler seçilir';
  ms.chip = function (n, o) {
    return h('div', { class: 'an-chip ms-chip', role: 'status' }, h('b', {}, n + ' ' + (o.noun || 'öğe') + ' seçili'), h('span', { class: 'mono' }, 'sürükleyerek birlikte taşıyın · ok tuşları · Esc bırakır'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: o.onclear }, App.ui.icon('close', 14)));
  };
})();
