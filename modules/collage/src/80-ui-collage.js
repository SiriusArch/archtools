/* ==========================================================================
   80-ui-collage.js — Modül 11 arayüzü: Kolaj Oluşturucu
   Sol panel: Ekle (fotoğraf, şekil, figür, çizgi, yazı) · Katman (seçili özellikler, sıralama) · Sayfa (boyut, zemin, vurgu rengi).
   Pafta: seç / taşı / boyutlandır / döndür; elle çiz, çizgi, ok, çokgen kütle ve yazı araçları; sürükle-bırak ile fotoğraf.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const C = App.collage;
  const ctl = () => App.ctl;
  const co = (ui.col = {});
  const get = () => App.store.get();

  App.collageDefaults = () => ({ tab: 'ekle', tool: 'select', draft: null, stick: 0 });

  const TOOLS = [
    { v: 'select', label: 'Seç', hint: 'Katmanı tıklayıp sürükleyin · köşe tutamaçlarıyla boyutlandırın · üstteki yuvarlak tutamaçla döndürün · Delete siler · ok tuşları taşır' },
    { v: 'free', label: 'Elle çiz', hint: 'Basılı tutup sürükleyerek elle çizin; çizgi serbest bırakınca yumuşatılır' },
    { v: 'line', label: 'Çizgi', hint: 'Sürükleyerek çizgi çekin (elle çizilmiş gibi hafif eğrilir; panelden kapatılabilir)' },
    { v: 'arrow', label: 'Ok', hint: 'Sürükleyerek ok çizin; ok ucu bıraktığınız noktadadır' },
    { v: 'poly', label: 'Çokgen', hint: 'Köşeleri tıklayarak vurgu renkli serbest kütle çizin · çift tık veya Enter bitirir · Esc iptal' },
    { v: 'text', label: 'Yazı', hint: 'Etiketin yerini tıklayın; metni panelden değiştirin' },
  ];
  const toolOf = (v) => TOOLS.find((t) => t.v === v) || TOOLS[0];

  /* ---------------- küçük bileşenler ---------------- */
  function swatches(cur, onpick, o) {
    o = o || {};
    const all = C.SWATCHES;
    return h('div', { class: 'kswatches' },
      all.map((s) => h('button', { key: s.v, type: 'button', class: 'kswatch' + (cur && cur.toUpperCase() === s.v ? ' on' : ''), style: { background: s.v }, title: s.label, 'aria-label': s.label, 'aria-pressed': String(!!cur && cur.toUpperCase() === s.v), onclick: () => onpick(s.v) })),
      h('input', { class: 'kswatch-in', type: 'color', value: cur || '#D93A1F', 'aria-label': 'Özel renk', title: 'Özel renk', keep: true, onchange: (e) => onpick(e.target.value.toUpperCase()) }));
  }
  function numRange(id, label, min, max, step, val, text, live, end) {
    return ui.range({ id: id, label: label, min: min, max: max, step: step, value: val, text: text, oninput: live, onchange: end });
  }

  /* ---------------- seçili katman paneli ---------------- */
  function selectedPanel(state, doc) {
    const c = ctl();
    const l = doc.layers.find((q) => q.id === state.selectedId);
    if (!l) return null;
    const set = (patch) => c.colSetL(l.id, patch);
    const live = (patch) => c.colLive(l.id, patch);
    const end = () => c.colLiveEnd();
    const head = h('p', { class: 'fr-area' }, h('b', {}, C.LAYER_LABEL[l.t] + ' · ' + C.layerName(l)), l.locked ? h('span', { class: 'lock-tag' }, ' kilitli') : null);
    let body = [];
    if (l.t === 'photo') {
      body = [
        (C.imgs[l.src] ? ui.fld2('Kırp', h('div', { class: 'crop-wrap' },
          ui.cropEditor({ id: 'col-crop', src: C.imgs[l.src].src, w: C.imgs[l.src].w, h: C.imgs[l.src].h, gray: l.bw, crop: l.crop, onlive: (n) => c.colCrop(l.id, n, false), oncommit: (n) => c.colCrop(l.id, n, true) }),
          ui.btn('Kırpmayı sıfırla', { icon: 'reset', onclick: () => c.colCropReset(l.id), disabled: ui.cropIsEmpty(l.crop) })),
          'Çerçeveyi ya da köşeleri sürükleyin; kutu kırpılan bölgeye uyar, özgün görsel korunur.') : null),
        ui.fld2('Kesim', ui.segmented({ label: 'Fotoğraf maskesi', wide: true, value: l.mask, options: [{ v: 'rect', label: 'Dikdörtgen' }, { v: 'ellipse', label: 'Elips' }, { v: 'arch', label: 'Kemer' }], onchange: (v) => set({ mask: v }) })),
        h('div', { class: 'tgl-row' },
          ui.toggle({ label: 'Siyah-beyaz', on: l.bw, onclick: () => set({ bw: !l.bw }) }),
          ui.toggle({ label: 'Yatay çevir', on: l.flip, onclick: () => set({ flip: !l.flip }) })),
        numRange('col-con', 'Kontrast', 50, 220, 5, Math.round(l.con * 100), '%' + Math.round(l.con * 100), (v) => live({ con: v / 100 }), end),
        numRange('col-bri', 'Parlaklık', -40, 40, 2, Math.round(l.bri * 100), (l.bri > 0 ? '+' : '') + Math.round(l.bri * 100), (v) => live({ bri: v / 100 }), end),
        numRange('col-zoom', 'Yakınlaştır', 100, 500, 5, Math.round(l.zoom * 100), '%' + Math.round(l.zoom * 100), (v) => live({ zoom: v / 100 }), end),
        l.zoom > 1.001 ? [
          numRange('col-ox', 'Yatay konum', 0, 100, 1, Math.round(l.ox * 100), '%' + Math.round(l.ox * 100), (v) => live({ ox: v / 100 }), end),
          numRange('col-oy', 'Dikey konum', 0, 100, 1, Math.round(l.oy * 100), '%' + Math.round(l.oy * 100), (v) => live({ oy: v / 100 }), end),
        ] : null,
        numRange('col-op', 'Opaklık', 10, 100, 5, Math.round(l.op * 100), '%' + Math.round(l.op * 100), (v) => live({ op: v / 100 }), end),
        ui.btn('Tuvale sığdır', { icon: 'expand', onclick: () => { const s = C.sizeOf(doc); set({ x: 0, y: 0, w: s.w, h: s.h }); } }),
      ];
    } else if (l.t === 'shape') {
      body = [
        ui.fld2('Renk', swatches(l.col, (v) => set({ col: v }))),
        h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Çarp (fotoğraf görünsün)', on: l.blend === 'multiply', onclick: () => set({ blend: l.blend === 'multiply' ? 'normal' : 'multiply' }), title: 'Renk, altındaki fotoğrafla çarpılır; dokular renkli kütlenin içinden okunur' })),
        numRange('col-op', 'Opaklık', 10, 100, 2, Math.round(l.op * 100), '%' + Math.round(l.op * 100), (v) => live({ op: v / 100 }), end),
        numRange('col-rot', 'Döndür', -180, 180, 1, Math.round(l.rot > 180 ? l.rot - 360 : l.rot), Math.round(l.rot > 180 ? l.rot - 360 : l.rot) + '°', (v) => live({ rot: v }), end),
        h('p', { class: 'fr-area' }, h('span', { class: 'mono' }, fmt(l.w) + ' × ' + fmt(l.h) + ' px')),
      ];
    } else if (l.t === 'fig') {
      body = [
        ui.fld2('Renk', swatches(l.col, (v) => set({ col: v }))),
        numRange('col-fw', 'Boyut', 20, 1200, 2, Math.round(l.w), Math.round(l.w) + ' px', (v) => live({ w: v }), end),
        numRange('col-rot', 'Döndür', -180, 180, 1, Math.round(l.rot > 180 ? l.rot - 360 : l.rot), Math.round(l.rot > 180 ? l.rot - 360 : l.rot) + '°', (v) => live({ rot: v }), end),
        numRange('col-op', 'Opaklık', 10, 100, 5, Math.round(l.op * 100), '%' + Math.round(l.op * 100), (v) => live({ op: v / 100 }), end),
        h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Yatay çevir', on: l.flip, onclick: () => set({ flip: !l.flip }) })),
      ];
    } else if (l.t === 'line') {
      body = [
        ui.fld2('Renk', swatches(l.col, (v) => set({ col: v }))),
        numRange('col-lw', 'Kalınlık', 1, 16, 0.5, l.w, fmt(l.w, 1) + ' px', (v) => live({ w: v }), end),
        ui.fld2('Çizgi tipi', ui.segmented({ label: 'Çizgi tipi', wide: true, value: l.dash, options: [{ v: 0, label: 'Düz' }, { v: 1, label: 'Kesik' }, { v: 2, label: 'Nokta' }], onchange: (v) => set({ dash: v }) })),
        l.kind !== 'free' ? h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Elle çizilmiş', on: l.hand, onclick: () => set({ hand: !l.hand }) })) : null,
        numRange('col-op', 'Opaklık', 10, 100, 5, Math.round(l.op * 100), '%' + Math.round(l.op * 100), (v) => live({ op: v / 100 }), end),
      ];
    } else if (l.t === 'text') {
      body = [
        ui.fld2('Metin', h('input', { id: 'col-text', class: 'inp', type: 'text', maxlength: 120, value: l.s, keep: true, onchange: (e) => set({ s: e.target.value.trim() || 'Etiket' }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
        numRange('col-ts', 'Boyut', 10, 160, 1, l.size, l.size + ' px', (v) => live({ size: v }), end),
        ui.fld2('Zemin', ui.segmented({ label: 'Etiket zemini', wide: true, value: l.bg, options: [{ v: 'none', label: 'Yok' }, { v: 'white', label: 'Beyaz' }, { v: 'ink', label: 'Siyah' }, { v: 'col', label: 'Renk' }], onchange: (v) => set({ bg: v }) })),
        ui.fld2(l.bg === 'col' ? 'Zemin rengi' : 'Yazı rengi', swatches(l.col, (v) => set({ col: v }))),
        ui.fld2('Yazı tipi', ui.segmented({ label: 'Yazı tipi', wide: true, value: l.fam, options: C.FONT_OPTS.map((f) => ({ v: f.v, label: f.label })), onchange: (v) => set({ fam: v }) })),
        h('div', { class: 'tgl-row' }, ui.toggle({ label: 'BÜYÜK HARF', on: l.caps, onclick: () => set({ caps: !l.caps }) }), ui.toggle({ label: 'Kalın', on: l.weight >= 700, onclick: () => set({ weight: l.weight >= 700 ? 500 : 700 }) })),
        numRange('col-rot', 'Döndür', -180, 180, 1, Math.round(l.rot > 180 ? l.rot - 360 : l.rot), Math.round(l.rot > 180 ? l.rot - 360 : l.rot) + '°', (v) => live({ rot: v }), end),
      ];
    }
    const order = h('div', { class: 'btn-row' },
      ui.btn('Öne al', { onclick: () => c.colOrder(l.id, { to: 'top' }), title: 'En üste getir' }),
      ui.btn('Arkaya al', { onclick: () => c.colOrder(l.id, { to: 'bottom' }), title: 'En alta gönder' }));
    const tail = h('div', { class: 'btn-row' },
      ui.btn('Çoğalt', { icon: 'copy', onclick: () => c.colDup(l.id) }),
      ui.btn(l.locked ? 'Kilidi aç' : 'Kilitle', { onclick: () => set({ locked: !l.locked }) }),
      ui.btn('Sil', { icon: 'trash', onclick: () => c.colDel(l.id) }));
    return ui.section('Seçili katman', h('div', { class: 'sec-box' }, head, body, order, tail), null, 'col-sel');
  }

  /* ---------------- hazır fotoğraflar ---------------- */
  let stockTab = 'cephe';
  function stockGrid(c) {
    const groups = C.STOCK_GROUPS;
    const list = C.STOCK.filter((s) => s.g === stockTab);
    return h('div', { class: 'stock' },
      h('p', { class: 'stock-cap' }, 'Hazır fotoğraflar · ' + C.STOCK.length + ' çeşit'),
      h('div', { class: 'stock-tabs', role: 'tablist', 'aria-label': 'Fotoğraf türü' }, groups.map((g) => h('button', { key: g.g, type: 'button', role: 'tab', class: 'stock-tab' + (stockTab === g.g ? ' on' : ''), 'aria-selected': String(stockTab === g.g), onclick: () => { stockTab = g.g; c.dispatch({ type: 'UI', patch: { col: Object.assign({}, App.store.get().ui.col, { stick: (App.store.get().ui.col.stick || 0) + 1 }) } }); } }, g.label))),
      h('div', { class: 'stock-grid' }, list.map((s) => h('button', { key: s.k, type: 'button', class: 'stock-btn', title: s.label + ' — kolaja ekle (her tıklamada farklı bir görüntü üretilir)', 'aria-label': s.label + ' fotoğrafını ekle', onclick: () => c.colDemo(s.k) },
        h('img', { src: C.stockThumb(s.k), alt: '', draggable: false }), h('span', {}, s.label)))));
  }

  /* ---------------- Ekle sekmesi ---------------- */
  function photoSection(state, doc) {
    const c = ctl();
    const imgs = Object.keys(C.imgs).map((k) => C.imgs[k]);
    return ui.section('Fotoğraf', h('div', { class: 'sec-box' },
      ui.btn('Fotoğraf yükle', { icon: 'image', cls: 'btn-yellow', onclick: () => c.colPick(), title: 'Bir ya da birden çok fotoğraf seçin; sürükleyip paftaya bırakabilir ya da panodan yapıştırabilirsiniz' }),
      stockGrid(c),
      imgs.length ? h('div', { class: 'imgs' }, imgs.map((im) => h('div', { key: im.id, class: 'img-tile' },
        h('button', { type: 'button', class: 'img-btn', title: im.name + ' — kolaja ekle', 'aria-label': im.name + ' görselini kolaja ekle', onclick: () => c.colAddPhoto(im.id) },
          h('img', { src: im.src, alt: '', draggable: false })),
        h('button', { type: 'button', class: 'img-del', title: 'Kitaplıktan sil', 'aria-label': 'Görseli kitaplıktan sil', onclick: () => c.colDelImg(im.id) }, ui.icon('close', 12)))))
        : h('p', { class: 'note' }, 'Fotoğraflar siyah-beyaza çevrilir; kontrast ve parlaklık panelden ayarlanır. Görseller bu tarayıcıda saklanır; JSON dosyasına da gömülür.'),
      h('input', { id: 'col-file', class: 'sr', type: 'file', accept: 'image/*', multiple: true, tabindex: -1, 'aria-label': 'Fotoğraf seç', onchange: (e) => { c.colFiles(Array.prototype.slice.call(e.target.files || [])); e.target.value = ''; } })), imgs.length ? String(imgs.length) : null, 'col-photo');
  }

  function shapeSection(state, doc) {
    const c = ctl();
    const add = (kind, label, icon) => ui.btn(label, { icon: icon, cls: 'btn-tool', onclick: () => c.colAddShape(kind) });
    return ui.section('Şekil ve renk', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-grid' }, add('rect', 'Dörtgen', 'rect'), add('ellipse', 'Elips', 'target'), add('tri', 'Üçgen', 'shapeT'), add('arch', 'Kemer', 'shapeU'),
        ui.btn('Çokgen', { icon: 'poly', cls: 'btn-tool', onclick: () => c.colTool('poly') })),
      ui.fld2('Vurgu rengi', swatches(doc.accent, (v) => c.colSet({ accent: v })), 'Yeni şekiller bu renkte eklenir.'),
      ui.btn('Tüm şekillere uygula', { icon: 'spark', onclick: () => c.colAccentAll(), disabled: !doc.layers.some((l) => l.t === 'shape') })), null, 'col-shape');
  }

  function figSection(state, doc) {
    const c = ctl();
    return ui.section('Figürler', h('div', { class: 'sec-box' },
      h('div', { class: 'figs' }, C.FIG_ORDER.map((k) => {
        const f = C.FIGS[k];
        const t = C.figThumbPath(k, 60);
        const vh = Math.max(60, t.h);
        return h('button', { key: k, type: 'button', class: 'fig-tile', title: f.label + ' ekle', 'aria-label': f.label + ' ekle', onclick: () => c.colAddFig(k) },
          h('svg', { viewBox: '0 0 60 ' + vh, width: 46, height: 46, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' }, h('path', { d: t.d, fill: '#fff', transform: 'translate(0 ' + ((vh - t.h) / 2).toFixed(1) + ')' })));
      })),
      h('p', { class: 'note' }, 'Beyaz siluetler fotoğraf üzerinde okunur; rengi, boyutu ve dönüşü panelden değişir.')), null, 'col-fig');
  }

  function drawSection(state, doc) {
    const c = ctl();
    const cur = state.ui.col.tool;
    const t = (v, label, icon) => ui.btn(label, { icon: icon, cls: 'btn-tool' + (cur === v ? ' on' : ''), pressed: cur === v, onclick: () => c.colTool(v) });
    return ui.section('Çizgi ve yazı', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-grid' }, t('free', 'Elle çiz', 'draw'), t('line', 'Çizgi', 'link'), t('arrow', 'Ok', 'send'), t('text', 'Etiket', 'newdoc')),
      h('div', { class: 'btn-row' }, ui.btn('Başlık ekle', { onclick: () => c.colAddTitle() })),
      h('p', { class: 'note' }, toolOf(cur).hint)), null, 'col-draw');
  }

  /* ---------------- Katman sekmesi ---------------- */
  function layerList(state, doc) {
    const c = ctl();
    const sel = state.selectedId;
    const rows = doc.layers.slice().reverse().map((l) => h('li', { key: l.id, id: 'krow-' + l.id, class: 'row krow' + (sel === l.id ? ' sel' : '') + (l.hidden ? ' off' : '') },
      h('div', { class: 'row-main', onclick: () => c.dispatch({ type: 'SELECT', id: sel === l.id ? null : l.id }) },
        h('span', { class: 'kkind kkind-' + l.t, 'aria-hidden': 'true' }),
        h('span', { class: 'row-name' }, C.layerName(l)),
        h('span', { class: 'frow-area' }, C.LAYER_LABEL[l.t])),
      h('div', { class: 'krow-act' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': l.hidden ? 'Katmanı göster' : 'Katmanı gizle', title: l.hidden ? 'Göster' : 'Gizle', onclick: () => c.colSetL(l.id, { hidden: !l.hidden }) }, ui.icon(l.hidden ? 'close' : 'check', 14)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Yukarı taşı', title: 'Öne', onclick: () => c.colOrder(l.id, { dir: 1 }) }, ui.icon('chevron', 14)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Aşağı taşı', title: 'Arkaya', onclick: () => c.colOrder(l.id, { dir: -1 }) }, ui.icon('chevron', 14)))));
    return ui.section('Katmanlar', rows.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'note' }, 'Henüz katman yok. Ekle sekmesinden fotoğraf, şekil, figür ya da yazı ekleyin.'), doc.layers.length + ' katman · üstteki en önde', 'col-list');
  }

  /* ---------------- Sayfa sekmesi ---------------- */
  function pageTab(state, doc) {
    const c = ctl();
    return [
      ui.section('Sayfa', h('div', { class: 'sec-box' },
        ui.fld2('Başlık', h('input', { id: 'col-title', class: 'inp', type: 'text', maxlength: 60, placeholder: 'Örn. Kent ve yoğunluk', value: doc.title, keep: true, onchange: (e) => c.colSet({ title: e.target.value.trim() }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }), 'Dosya adında kullanılır.'),
        ui.fld2('Boyut', ui.segmented({ label: 'Kolaj boyutu', wide: true, value: doc.size, options: Object.keys(C.SIZES).map((k) => ({ v: k, label: C.SIZES[k].label })), onchange: (v) => c.colSet({ size: v }) }), C.sizeOf(doc).w + ' × ' + C.sizeOf(doc).h + ' px'),
        ui.fld2('Zemin', ui.segmented({ label: 'Zemin rengi', wide: true, value: doc.bg, options: [{ v: 'white', label: 'Beyaz' }, { v: 'paper', label: 'Kâğıt' }, { v: 'grey', label: 'Gri' }, { v: 'ink', label: 'Siyah' }, { v: 'accent', label: 'Vurgu' }], onchange: (v) => c.colSet({ bg: v }) }))), null, 'col-page'),
      ui.section('Vurgu rengi', h('div', { class: 'sec-box' },
        swatches(doc.accent, (v) => c.colSet({ accent: v })),
        ui.btn('Tüm şekillere uygula', { icon: 'spark', onclick: () => c.colAccentAll(), disabled: !doc.layers.some((l) => l.t === 'shape') }),
        h('p', { class: 'note' }, 'Tek vurgu rengi kolajı birleştirir: kütleler, etiketler ve zemin aynı renkten türesin.')), null, 'col-acc'),
      ui.section('Başlangıç', h('div', { class: 'sec-box' },
        ui.btn('Örnek kolaj', { icon: 'play', onclick: () => c.colSample(), title: 'Fotoğraf, kütle, siluet, çizgi ve etiketlerle dolu örnek' }),
        doc.layers.length ? ui.btn('Temizle', { icon: 'trash', onclick: () => c.colClear(), title: 'Tüm katmanları sil (Geri al ile döndürülebilir)' }) : null,
        h('p', { class: 'note' }, 'PNG ve PDF için üstteki Dışa aktar düğmelerini kullanın; JSON, görselleri de içerir.')), null, 'col-start'),
    ];
  }

  co.sidebar = function (state, d) {
    const doc = state.project.collage;
    const c = ctl();
    const tab = ['ekle', 'katman', 'sayfa'].indexOf(state.ui.col.tab) >= 0 ? state.ui.col.tab : 'ekle';
    const tabs = ui.tabsBar([{ id: 'ekle', label: 'Ekle' }, { id: 'katman', label: 'Katman', n: doc.layers.length }, { id: 'sayfa', label: 'Sayfa' }], tab, (id) => c.colView({ tab: id }, true));
    const sel = selectedPanel(state, doc);
    let body;
    if (tab === 'ekle') body = [sel, photoSection(state, doc), shapeSection(state, doc), figSection(state, doc), drawSection(state, doc)];
    else if (tab === 'katman') body = [sel, layerList(state, doc)];
    else body = pageTab(state, doc);
    return ui.sideShell('sb-kolaj', 'Kolaj oluşturucu paneli', tabs, body);
  };

  /* ---------------- pafta etkileşimi ---------------- */
  let gest = null;
  co.svgEl = null;
  function toSvg(e) {
    const svg = co.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  const docNow = () => get().project.collage;
  const layerNow = (id) => docNow().layers.find((q) => q.id === id);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function elDown(e, l) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (get().ui.col.tool !== 'select') return;
    e.stopPropagation(); e.preventDefault();
    const s = toSvg(e);
    ctl().dispatch({ type: 'SELECT', id: l.id });
    if (l.locked) return;
    gest = { t: 'move', id: l.id, sx: s.x, sy: s.y, orig: l, moved: false, cX: e.clientX, cY: e.clientY };
    try { co.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }
  function handleDown(e, l, hd) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    gest = { t: 'handle', id: l.id, hd: hd, orig: l, moved: false, cX: e.clientX, cY: e.clientY };
    try { co.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }
  function bgDown(e) {
    const st = get().ui.col;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = toSvg(e);
    if (st.tool === 'select') { if (get().selectedId) ctl().dispatch({ type: 'SELECT', id: null }); return; }
    if (st.tool === 'text') {
      e.preventDefault();
      ctl().colAddText(Math.round(s.x), Math.round(s.y));
      return;
    }
    e.preventDefault();
    gest = { t: 'draw', tool: st.tool, pts: [[s.x, s.y]], sx: s.x, sy: s.y, moved: false };
    try { co.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }

  const q = (id) => document.getElementById(id);
  function showPath(d) { const el = q('cd-path'); if (el) { el.setAttribute('d', d); el.setAttribute('visibility', d ? 'visible' : 'hidden'); } }

  function svgMove(e) {
    const st = get().ui.col;
    if (!gest) {
      if (st.tool === 'poly' && st.draft && st.draft.length) {
        const s = toSvg(e);
        showPath('M' + st.draft.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + s.x.toFixed(1) + ' ' + s.y.toFixed(1));
      }
      return;
    }
    const s = toSvg(e);
    const g = gest;
    if (g.t === 'draw') {
      if (!g.moved && Math.hypot(s.x - g.sx, s.y - g.sy) < 3) return;
      g.moved = true;
      if (g.tool === 'free') {
        const last = g.pts[g.pts.length - 1];
        if (Math.hypot(s.x - last[0], s.y - last[1]) >= 2.5) g.pts.push([s.x, s.y]);
        showPath(C.smoothPath(g.pts));
      } else if (g.tool === 'line' || g.tool === 'arrow') {
        let ex = s.x, ey = s.y;
        if (e.shiftKey) { if (Math.abs(ex - g.sx) > Math.abs(ey - g.sy)) ey = g.sy; else ex = g.sx; }
        g.end = [ex, ey];
        showPath('M' + g.sx.toFixed(1) + ' ' + g.sy.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1));
      }
      return;
    }
    if (!g.moved) { if (Math.hypot(e.clientX - g.cX, e.clientY - g.cY) < 3) return; g.moved = true; ctl().colLiveBegin(); }
    const o = g.orig;
    if (g.t === 'move') {
      let dx = s.x - g.sx, dy = s.y - g.sy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (o.t === 'line') ctl().colLive(o.id, { pts: o.pts.map((p) => [p[0] + dx, p[1] + dy]) });
      else ctl().colLive(o.id, { x: o.x + dx, y: o.y + dy });
      return;
    }
    if (g.t === 'handle') { handleMove(g, s, e); }
  }

  /* tutamaçlar: döndürülmüş çerçevede boyutlandırma */
  function handleMove(g, s, e) {
    const o = g.orig;
    if (o.t === 'line') {
      const pts = o.pts.slice();
      pts[g.hd === 'p1' ? 0 : 1] = [s.x, s.y];
      ctl().colLive(o.id, { pts: pts });
      return;
    }
    const b = C.boxOf(o);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rot = o.rot || 0;
    if (g.hd === 'rot') {
      let ang = (Math.atan2(s.y - cy, s.x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      ang = ((ang % 360) + 540) % 360 - 180;
      ctl().colLive(o.id, { rot: Math.round(ang * 10) / 10 });
      return;
    }
    const local = C.rot(s.x, s.y, cx, cy, -rot);
    const px = local[0] - cx, py = local[1] - cy;
    const hx = g.hd.indexOf('e') >= 0 ? 1 : g.hd.indexOf('w') >= 0 ? -1 : 0;
    const hy = g.hd.indexOf('s') >= 0 ? 1 : g.hd.indexOf('n') >= 0 ? -1 : 0;
    const uniform = o.t === 'fig' || o.t === 'text';
    let l = -b.w / 2, r = b.w / 2, t = -b.h / 2, bt = b.h / 2;
    const MIN = 12;
    if (uniform) {
      const ar = b.h / b.w;
      const ax = hx > 0 ? -b.w / 2 : b.w / 2, ay = hy > 0 ? -b.h / 2 : b.h / 2;
      let nw = Math.max(MIN, Math.abs(px - ax));
      nw = Math.max(nw, Math.abs(py - ay) / ar);
      const nh = nw * ar;
      const ncx = ax + (hx > 0 ? nw / 2 : -nw / 2), ncy = ay + (hy > 0 ? nh / 2 : -nh / 2);
      const wc = C.rot(cx + ncx, cy + ncy, cx, cy, rot);
      if (o.t === 'fig') ctl().colLive(o.id, { w: nw, x: wc[0] - nw / 2, y: wc[1] - nh / 2 });
      else {
        const size = Math.max(8, Math.min(220, Math.round(o.size * (nw / b.w))));
        const m = C.textMetrics(Object.assign({}, o, { size: size }));
        ctl().colLive(o.id, { size: size, x: wc[0] - m.w / 2, y: wc[1] - m.h / 2 });
      }
      return;
    }
    if (hx > 0) r = Math.max(l + MIN, px); else if (hx < 0) l = Math.min(r - MIN, px);
    if (hy > 0) bt = Math.max(t + MIN, py); else if (hy < 0) t = Math.min(bt - MIN, py);
    const nw = r - l, nh = bt - t;
    const wc = C.rot(cx + (l + r) / 2, cy + (t + bt) / 2, cx, cy, rot);
    ctl().colLive(o.id, { x: wc[0] - nw / 2, y: wc[1] - nh / 2, w: nw, h: nh });
  }

  function svgUp(e) {
    const g = gest;
    if (!g) return;
    gest = null;
    try { co.svgEl.releasePointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    if (g.t === 'move' || g.t === 'handle') { ctl().colLiveEnd(); return; }
    if (g.t === 'draw') {
      showPath('');
      const st = get().ui.col;
      const s = toSvg(e);
      if (g.tool === 'free' && g.moved && g.pts.length >= 3) { ctl().colAddLine('free', C.simplify(g.pts, 2.5)); return; }
      if ((g.tool === 'line' || g.tool === 'arrow') && g.moved && g.end && dist([g.sx, g.sy], g.end) > 8) { ctl().colAddLine(g.tool, [[g.sx, g.sy], g.end]); return; }
      if (g.tool === 'poly') {
        const pts = st.draft || [];
        if (pts.length >= 3 && dist(pts[0], [s.x, s.y]) < 12) { finishPoly(); return; }
        ctl().colView({ draft: pts.concat([[Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10]]) }, true);
      }
    }
  }
  function finishPoly() {
    const st = get().ui.col;
    const pts = st.draft;
    if (!pts || pts.length < 3) { ctl().toast('Çokgen için en az 3 nokta gerekir.', 'error'); return; }
    ctl().colView({ draft: null }, true);
    showPath('');
    ctl().colAddPoly(pts);
  }

  document.addEventListener('keydown', function (e) {
    const S = get();
    if (S.ui.module !== 'kolaj') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    const st = S.ui.col;
    const c = ctl();
    if (e.key === 'Enter' && st.draft) { e.preventDefault(); finishPoly(); }
    else if (e.key === 'Escape') {
      if (st.draft) { c.colView({ draft: null }, true); showPath(''); }
      else if (S.selectedId) c.dispatch({ type: 'SELECT', id: null });
      else if (st.tool !== 'select') c.colTool('select');
    } else if (e.key === 'Backspace' && st.draft) { e.preventDefault(); const p = st.draft.slice(0, -1); c.colView({ draft: p.length ? p : null }, true); showPath(''); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedId && st.tool === 'select') { e.preventDefault(); c.colDel(S.selectedId); }
    else if (S.selectedId && st.tool === 'select' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      const l = layerNow(S.selectedId);
      if (!l || l.locked) return;
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      const dv = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
      c.colSetL(l.id, l.t === 'line' ? { pts: l.pts.map((p) => [p[0] + dv[0], p[1] + dv[1]]) } : { x: l.x + dv[0], y: l.y + dv[1] });
    }
  });
  document.addEventListener('paste', function (e) {
    if (get().ui.module !== 'kolaj') return;
    const items = (e.clipboardData && e.clipboardData.files) || [];
    const files = Array.prototype.slice.call(items).filter((f) => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); ctl().colFiles(files); }
  });

  /* ---------------- hedefler ve tutamaçlar ---------------- */
  function hitPoly(l) {
    if (l.t === 'photo') { const mp = C.maskPts(l.mask, l.x, l.y, l.w, l.h); return mp || C.boxPts(l.x, l.y, l.w, l.h, 0); }
    if (l.t === 'shape') return C.shapePts(l.kind, l.x, l.y, l.w, l.h, l.np).map((p) => C.rot(p[0], p[1], l.x + l.w / 2, l.y + l.h / 2, l.rot));
    const b = C.boxOf(l);
    return C.boxPts(b.x, b.y, b.w, b.h, l.rot || 0);
  }
  const ptsStr = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  function hitsLayer(state, doc) {
    const out = [];
    const ink = '#17181B';
    doc.layers.forEach((l) => {
      if (l.hidden) return;
      const base = { key: 'h' + l.id, class: 'khit' + (l.locked ? ' locked' : ''), fill: 'transparent', onpointerdown: (e) => elDown(e, l) };
      if (l.t === 'line') {
        const d = l.kind === 'free' ? C.smoothPath(C.simplify(l.pts, 2.5)) : 'M' + l.pts[0][0] + ' ' + l.pts[0][1] + ' L' + l.pts[1][0] + ' ' + l.pts[1][1];
        out.push(h('path', Object.assign(base, { d: d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(16, l.w + 10), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
      } else out.push(h('polygon', Object.assign(base, { points: ptsStr(hitPoly(l)) })));
    });
    const l = doc.layers.find((x) => x.id === state.selectedId);
    if (l && !l.hidden) {
      const b = C.boxOf(l);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const rot = l.rot || 0;
      const hs = 11;
      if (l.t === 'line') {
        out.push(h('path', { key: 'selring', d: l.kind === 'free' ? C.smoothPath(C.simplify(l.pts, 2.5)) : 'M' + l.pts[0][0] + ' ' + l.pts[0][1] + ' L' + l.pts[1][0] + ' ' + l.pts[1][1], fill: 'none', stroke: ink, 'stroke-width': Math.max(8, l.w + 6), 'stroke-opacity': 0.14, 'stroke-linecap': 'round', 'pointer-events': 'none' }));
        if (l.kind !== 'free' && !l.locked) [['p1', l.pts[0]], ['p2', l.pts[1]]].forEach((p) => out.push(h('circle', { key: p[0], class: 'kvtx', cx: p[1][0], cy: p[1][1], r: 7, onpointerdown: (e) => handleDown(e, l, p[0]) })));
      } else {
        const quad = C.boxPts(b.x, b.y, b.w, b.h, rot);
        out.push(h('polygon', { key: 'selring', points: ptsStr(quad), fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }));
        if (!l.locked) {
          const H = l.t === 'fig' || l.t === 'text' ? [['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1]] : l.t === 'photo' || l.t === 'shape' ? [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]] : [];
          H.forEach((hh) => {
            const p = C.rot(b.x + hh[1] * b.w, b.y + hh[2] * b.h, cx, cy, rot);
            out.push(h('rect', { key: 'hd' + hh[0], class: 'khandle', x: p[0] - hs / 2, y: p[1] - hs / 2, width: hs, height: hs, onpointerdown: (e) => handleDown(e, l, hh[0]) }));
          });
          if (l.t === 'shape' || l.t === 'fig' || l.t === 'text') {
            const top = C.rot(cx, b.y - 30, cx, cy, rot), tp = C.rot(cx, b.y, cx, cy, rot);
            out.push(h('line', { key: 'rl', x1: tp[0], y1: tp[1], x2: top[0], y2: top[1], stroke: ink, 'stroke-width': 1.4, 'pointer-events': 'none' }));
            out.push(h('circle', { key: 'rh', class: 'kvtx', cx: top[0], cy: top[1], r: 7, onpointerdown: (e) => handleDown(e, l, 'rot') }));
          }
        }
      }
    }
    return out;
  }

  function draftLayer(state) {
    const dr = state.ui.col.draft;
    const out = [];
    const ink = '#17181B';
    if (dr && dr.length) {
      out.push(h('polyline', { key: 'dl', points: ptsStr(dr), fill: 'none', stroke: ink, 'stroke-width': 2, 'pointer-events': 'none' }));
      dr.forEach((p, i) => out.push(h('circle', { key: 'dp' + i, cx: p[0], cy: p[1], r: i === 0 ? 7 : 4, fill: i === 0 ? '#F2B705' : '#fff', stroke: ink, 'stroke-width': 2, 'pointer-events': 'none' })));
    }
    out.push(h('path', { key: 'cd', id: 'cd-path', d: '', fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '6 5', visibility: 'hidden', 'pointer-events': 'none' }));
    return out;
  }

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(doc) {
    const key = [doc, C.version];
    if (memo.k && memo.k[0] === key[0] && memo.k[1] === key[1]) return memo.v;
    memo = { k: key, v: C.scene(doc, { live: true }) };
    return memo.v;
  }

  co.board = function (state, d) {
    const doc = state.project.collage;
    const st = state.ui.col;
    const c = ctl();
    const sc = sceneOf(doc);
    const t = toolOf(st.tool);
    const sel = doc.layers.find((l) => l.id === state.selectedId);
    const svg = h('svg', {
      id: 'pafta-kolaj', class: 'board-svg board-svg-kolaj tool-' + st.tool, viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': 'Kolaj paftası, ' + doc.layers.length + ' katman',
      ref: (el) => { co.svgEl = el; }, onpointerdown: bgDown, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp, ondblclick: () => { if (get().ui.col.draft) finishPoly(); },
    }, sc.prims.map((p) => App.board.primToV(p)),
    h('g', { class: 'khits' }, st.tool === 'select' ? hitsLayer(state, doc) : null),
    h('g', { class: 'kdraft' }, draftLayer(state)));
    const chipTxt = st.tool === 'select' ? null : t.label;
    const stage = h('div', { class: 'board-stage kstage', ondragover: (e) => { e.preventDefault(); }, ondrop: (e) => { e.preventDefault(); const f = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []); if (f.length) c.colFiles(f); } }, svg,
      chipTxt ? h('div', { class: 'pl-chip' }, h('b', {}, chipTxt + (st.draft ? ' · ' + st.draft.length + ' nokta' : '')),
        st.draft && st.draft.length >= 3 ? h('button', { type: 'button', class: 'btn btn-yellow pl-fin', onclick: finishPoly }, 'Bitir') : null,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seç aracına dön', title: 'Seç aracına dön (Esc)', onclick: () => { c.colView({ draft: null }, true); c.colTool('select'); } }, ui.icon('close', 14)))
        : (sel ? h('div', { class: 'pl-chip' }, h('b', {}, C.LAYER_LABEL[sel.t]), h('span', { class: 'mono' }, C.layerName(sel)),
          h('button', { type: 'button', class: 'btn pl-fin', onclick: () => c.colView({ tab: sel ? 'katman' : 'ekle' }, true) }, 'Düzenle'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.dispatch({ type: 'SELECT', id: null }) }, ui.icon('close', 14))) : null),
      !doc.layers.length ? ui.emptyCard('Boş bir kolajla başlıyorsunuz', 'Bir fotoğraf yükleyin (siyah-beyaz olur), üzerine tek renkli kütleler, beyaz siluetler, elle çizgiler ve etiketler ekleyin. Hazır bir örnekle de başlayabilirsiniz.', [
        ui.btn('Örnek kolaj', { icon: 'play', cls: 'btn-primary', onclick: () => c.colSample() }),
        ui.btn('Fotoğraf yükle', { icon: 'image', onclick: () => c.colPick() })]) : null);

    return ui.boardPage(state, d, {
      label: 'Kolaj paftası',
      stage: stage,
      scale: C.sizeOf(doc).label + ' · ' + sc.W + ' × ' + sc.H + ' px',
      foot: h('p', { class: 'board-hint' }, t.hint),
      tools: [
        { k: 'seg', label: 'Araç', value: st.tool, options: TOOLS.map((x) => ({ v: x.v, label: x.label })), onchange: (v) => c.colTool(v) },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ],
    });
  };
})();
