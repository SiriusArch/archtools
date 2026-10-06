/* ==========================================================================
   82-ui-tpl.js — Modül 12 arayüzü: Pafta Şablonu
   Sol panel: Şablon (hazır şablonlar, sayfa) · Ekle (araç çıktıları, görseller, metin ve işaretler) · Panel (seçili panel, katman sırası).
   Pafta: seç / taşı / boyutlandır; kenar ve ortalara yaslanma kılavuzları; ok tuşlarıyla ince taşıma; sürükle-bırak ile görsel.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const T = App.tpl;
  const ctl = () => App.ctl;
  const tp = (ui.tpl = {});
  const get = () => App.store.get();

  App.tplDefaults = () => ({ tab: 'sablon', guides: true, tplSize: 'auto', stick: 0 });

  /* ---------------- küçük bileşenler ---------------- */
  function swatches(cur, onpick) {
    return h('div', { class: 'kswatches' },
      T.SWATCHES.map((s) => h('button', { key: s.v, type: 'button', class: 'kswatch' + (cur && cur.toUpperCase() === s.v ? ' on' : ''), style: { background: s.v }, title: s.label, 'aria-label': s.label, 'aria-pressed': String(!!cur && cur.toUpperCase() === s.v), onclick: () => onpick(s.v) })),
      h('input', { class: 'kswatch-in', type: 'color', value: cur || '#17181B', 'aria-label': 'Özel renk', title: 'Özel renk', keep: true, onchange: (e) => onpick(e.target.value.toUpperCase()) }));
  }
  const numRange = (id, label, min, max, step, val, text, live, end) => ui.range({ id: id, label: label, min: min, max: max, step: step, value: val, text: text, oninput: live, onchange: end });
  const BG_OPTS = [{ v: 'none', label: 'Yok' }, { v: 'white', label: 'Beyaz' }, { v: 'paper', label: 'Kâğıt' }, { v: 'grey', label: 'Gri' }, { v: 'ink', label: 'Siyah' }, { v: 'accent', label: 'Vurgu' }];
  const textInp = (id, val, ph, max, on) => h('input', { id: id, class: 'inp', type: 'text', maxlength: max, placeholder: ph || '', value: val, keep: true, onchange: (e) => on(e.target.value) });

  /* ---------------- şablon küçük resmi ---------------- */
  const thumbMemo = {};
  function thumb(t) {
    if (!thumbMemo[t.id]) thumbMemo[t.id] = T.fromTemplate(t.id, { avail: [], name: 'Proje', title: '' });
    const d = thumbMemo[t.id];
    const s = T.sizeOf(d);
    const parts = [h('rect', { key: 'bg', x: 0, y: 0, width: s.w, height: s.h, fill: '#fff' })];
    d.panels.forEach((p, i) => {
      const k = 'p' + i;
      if (p.t === 'view') parts.push(h('rect', { key: k, x: p.x, y: p.y, width: p.w, height: p.h, fill: '#B9BCC1' }), h('path', { key: k + 'x', d: 'M' + p.x + ' ' + p.y + 'L' + (p.x + p.w) + ' ' + (p.y + p.h) + 'M' + (p.x + p.w) + ' ' + p.y + 'L' + p.x + ' ' + (p.y + p.h), stroke: '#fff', 'stroke-width': s.w / 160, opacity: 0.55 }));
      else if (p.t === 'block') parts.push(h('rect', { key: k, x: p.x, y: p.y, width: p.w, height: p.h, fill: p.col }));
      else if (p.t === 'title') parts.push(h('rect', { key: k, x: p.x, y: p.y, width: p.w, height: p.h, fill: '#fff', stroke: '#17181B', 'stroke-width': s.w / 190 }), h('rect', { key: k + 'm', x: p.x, y: p.y, width: p.h, height: p.h, fill: '#17181B' }));
      else if (p.t === 'text') { const n = Math.max(1, Math.min(5, Math.floor(p.h / (p.size * 1.6)))); for (let j = 0; j < n; j++) parts.push(h('rect', { key: k + j, x: p.x, y: p.y + (p.valign === 'm' ? p.h * 0.3 : 0) + j * p.size * 1.5, width: p.w * (j === n - 1 ? 0.6 : 1) * (p.size > s.h * 0.03 ? 0.9 : 0.9), height: Math.max(s.h / 130, p.size * (p.size > s.h * 0.03 ? 0.7 : 0.32)), fill: '#17181B', opacity: p.size > s.h * 0.03 ? 0.85 : 0.5 })); }
      else if (p.t === 'line') parts.push(h('rect', { key: k, x: p.x, y: p.y + p.h / 2 - p.lw / 2, width: p.w, height: p.lw, fill: '#17181B' }));
      else parts.push(h('rect', { key: k, x: p.x, y: p.y, width: p.w, height: p.h, fill: '#17181B', opacity: 0.18 }));
    });
    return h('svg', { viewBox: '0 0 ' + s.w + ' ' + s.h, class: 'tpl-thumb', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' }, parts);
  }

  /* ---------------- Şablon sekmesi ---------------- */
  function templatesSection(state, doc) {
    const c = ctl();
    const sel = state.ui.tpl.tplSize || 'auto';
    return ui.section('Hazır şablonlar', h('div', { class: 'sec-box' },
      h('div', { class: 'tpl-grid' }, T.TEMPLATES.map((t) => h('button', { key: t.id, type: 'button', class: 'tpl-card', title: t.desc, 'aria-label': t.label + ' şablonunu uygula — ' + t.desc, onclick: () => c.tplApply(t.id) },
        thumb(t), h('span', { class: 'tpl-card-n' }, t.label), h('span', { class: 'tpl-card-s mono' }, T.SIZES[t.size].label)))),
      ui.fld2('Şablon boyutu', h('select', { id: 'tpl-tsize', class: 'inp', value: sel, onchange: (e) => c.tplView({ tplSize: e.target.value }) },
        [h('option', { key: 'auto', value: 'auto' }, 'Şablonun kendi boyutu')].concat(T.SIZE_ORDER.map((k) => h('option', { key: k, value: k }, T.SIZES[k].label + ' · ' + T.SIZES[k].w + ' × ' + T.SIZES[k].h)))), 'Şablon uygulanınca araç çıktıları boş alanlara tercih sırasıyla yerleşir; sonra hepsini değiştirebilirsiniz.'),
      h('p', { class: 'note' }, 'Şablon uygulamak mevcut panelleri değiştirir; Geri al ile döndürebilirsiniz.')), null, 'tpl-templates');
  }

  function pageSection(state, doc) {
    const c = ctl();
    const mo = doc.mono || { on: false, col: T.MONO_DEFAULT };
    return ui.section('Sayfa', h('div', { class: 'sec-box' },
      h('div', { class: 'mono-box' },
        ui.toggle({ label: 'Tek renk (monokrom)', on: mo.on, onclick: () => c.tplMono({ on: !mo.on }), title: 'Paftadaki her araç çıktısını, fotoğrafı ve yazıyı seçilen rengin tonlarına çevirir' }),
        swatches(mo.col, (v) => c.tplMono({ on: true, col: v })),
        h('p', { class: 'note' }, mo.on ? 'Tüm paftada yalnızca bu rengin tonları kullanılıyor. Kapatınca her çalışma kendi renklerine döner.' : 'Her çalışmanın rengi farklıysa tek tuşla paftayı tek renge çevirin; rengi aşağıdan seçin.')),
      ui.fld2('Pafta başlığı', textInp('tpl-title', doc.title, 'Örn. Vaziyet ve kütle', 60, (v) => c.tplSet({ title: v.trim() }))),
      ui.fld2('Boyut', h('select', { id: 'tpl-size', class: 'inp', value: doc.size, onchange: (e) => c.tplSet({ size: e.target.value }, true) },
        T.SIZE_ORDER.map((k) => h('option', { key: k, value: k }, T.SIZES[k].label + ' · ' + T.SIZES[k].w + ' × ' + T.SIZES[k].h))), 'Boyut değişince paneller oranla ölçeklenir.'),
      ui.fld2('Zemin', ui.segmented({ label: 'Pafta zemini', wide: true, value: doc.bg, options: [{ v: 'white', label: 'Beyaz' }, { v: 'paper', label: 'Kâğıt' }, { v: 'grey', label: 'Gri' }, { v: 'ink', label: 'Siyah' }, { v: 'accent', label: 'Vurgu' }], onchange: (v) => c.tplSet({ bg: v }) })),
      ui.fld2('Vurgu rengi', swatches(doc.accent, (v) => c.tplSet({ accent: v })), 'Şablonlardaki başlık bandı ve numaralar bu renkte gelir.'),
      numRange('tpl-margin', 'Kenar boşluğu', 0, 200, 2, doc.margin, doc.margin + ' px', (v) => c.tplSet({ margin: v }), () => {}),
      numRange('tpl-gutter', 'Panel aralığı', 0, 100, 1, doc.gutter, doc.gutter + ' px', (v) => c.tplSet({ gutter: v }), () => {}),
      h('div', { class: 'tgl-row' },
        ui.toggle({ label: 'Kenarlara yaslan', on: doc.snap, onclick: () => c.tplSet({ snap: !doc.snap }), title: 'Taşırken panel kenarlarına, ortalara ve kenar boşluğuna yaslanır (Alt basılıyken kapalı)' }),
        ui.toggle({ label: 'Kılavuz çizgileri', on: state.ui.tpl.guides !== false, onclick: () => c.tplView({ guides: state.ui.tpl.guides === false }), title: 'Kenar boşluğu çizgisini göster (dışa aktarılmaz)' }))), null, 'tpl-page');
  }

  function startSection(state, doc) {
    const c = ctl();
    return ui.section('Başlangıç', h('div', { class: 'sec-box' },
      ui.btn('Boş pafta', { onclick: () => c.tplApply('bos') }),
      doc.panels.length ? ui.btn('Panelleri temizle', { icon: 'trash', onclick: () => c.tplClear() }) : null,
      h('p', { class: 'note' }, 'Her panel serbestçe taşınır, boyutlandırılır, kopyalanır ve sıralanır. PNG ve PDF için üstteki Dışa aktar düğmelerini kullanın; JSON, paftayı ve yüklenen görselleri içerir.')), null, 'tpl-start');
  }

  /* ---------------- Ekle sekmesi ---------------- */
  function sourcesSection(state, doc) {
    const c = ctl();
    const av = T.available(state);
    return ui.section('Araç çıktıları', h('div', { class: 'sec-box' },
      h('div', { class: 'src-grid' }, T.SOURCES.map((s) => h('button', { key: s.id, type: 'button', class: 'src-btn' + (av[s.id] ? '' : ' off'), title: av[s.id] ? s.label + ' çıktısını panel olarak ekle' : s.label + ': ilgili araçta henüz veri yok', onclick: () => c.tplAddMod(s.id) },
        h('span', { class: 'src-dot', 'aria-hidden': 'true' }), h('span', { class: 'src-n' }, s.label)))),
      h('p', { class: 'note' }, 'Çıktılar canlı bağlıdır: ilgili araçta değişiklik yaptığınızda paftadaki panel de güncellenir. Soluk olanlarda henüz veri yok; yine de eklenip sonra dolabilir.')), Object.keys(av).filter((k) => av[k]).length + ' hazır', 'tpl-src');
  }

  function imagesSection(state, doc) {
    const c = ctl();
    const C = App.collage;
    const imgs = C ? Object.keys(C.imgs).map((k) => C.imgs[k]) : [];
    return ui.section('Görseller', h('div', { class: 'sec-box' },
      ui.btn('Görsel yükle', { icon: 'image', cls: 'btn-yellow', onclick: () => c.tplPick(), title: 'Fotoğraf, çizim ya da render seçin; sürükleyip paftaya bırakabilir ya da panodan yapıştırabilirsiniz' }),
      imgs.length ? h('div', { class: 'imgs' }, imgs.map((im) => h('div', { key: im.id, class: 'img-tile' },
        h('button', { type: 'button', class: 'img-btn img-btn-col', title: im.name + ' — panele ekle', 'aria-label': im.name + ' görselini ekle', onclick: () => c.tplUseImage(im.id) }, h('img', { src: im.src, alt: '', draggable: false })),
        h('button', { type: 'button', class: 'img-del', title: 'Kitaplıktan sil', 'aria-label': 'Görseli kitaplıktan sil', onclick: () => c.tplDelImg(im.id) }, ui.icon('close', 12)))))
        : h('p', { class: 'note' }, 'Görseller bu tarayıcıda saklanır (Kolaj aracıyla ortak kitaplık); JSON dosyasına da gömülür. Görsel panel seçiliyken bir görsele tıklamak onu o panele atar.'),
      h('input', { id: 'tpl-file', class: 'sr', type: 'file', accept: 'image/*', multiple: true, tabindex: -1, 'aria-label': 'Görsel seç', onchange: (e) => { c.tplFiles(Array.prototype.slice.call(e.target.files || [])); e.target.value = ''; } })), imgs.length ? String(imgs.length) : null, 'tpl-img');
  }

  function itemsSection(state, doc) {
    const c = ctl();
    const b = (label, icon, fn, title) => ui.btn(label, { icon: icon, cls: 'btn-tool', onclick: fn, title: title });
    return ui.section('Metin ve işaretler', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-grid' },
        b('Metin', 'newdoc', () => c.tplAddText('text'), 'Açıklama metni'), b('Büyük başlık', 'spark', () => c.tplAddText('title'), 'Pafta başlığı'),
        b('Künye', 'layout', () => c.tplAddTitle(), 'Proje adı, ölçek, tarih ve pafta no'), b('Lejant', 'layers', () => c.tplAddLegend(), 'Renk-anlam listesi'),
        b('Veriler', 'check', () => c.tplAddFacts(), 'Parsel alanı, TAKS, KAKS, kat sayısı… araçlardan otomatik'), b('Renk bloğu', 'rect', () => c.tplAddBlock(), 'Düz renkli alan, isteğe bağlı yazı'),
        b('Yatay çizgi', 'link', () => c.tplAddLine('h'), 'Ayırıcı çizgi'), b('Dikey çizgi', 'link', () => c.tplAddLine('v'), 'Ayırıcı çizgi'),
        b('Kuzey oku', 'target', () => c.tplAddNorth(), 'Kuzey işareti'))), null, 'tpl-items');
  }

  /* kırpma: kaynak görselin küçük resmi üzerinde sürüklenen çerçeve */
  function cropField(state, p, set) {
    let src = null, w = 0, h2 = 0, region = null, gray = false;
    if (p.src.k === 'mod') {
      const e = T.entryFor(state, p.src.id, false);
      const info = T.srcInfo(p.src.id);
      if (e) { src = e.href; w = e.W; h2 = e.H; region = info && info.framed && p.trim ? T.frameRegion(e.W, e.H) : null; }
    } else if (p.src.k === 'img') {
      const im = App.collage && App.collage.imgs[p.src.id];
      if (im) { src = im.src; w = im.w; h2 = im.h; gray = !!p.bw; }
    }
    if (!src) return null;
    const c = p.crop || { l: 0, t: 0, r: 0, b: 0 };
    return ui.fld2('Kırp', h('div', { class: 'crop-wrap' },
      ui.cropEditor({ id: 'tpl-crop', src: src, w: w, h: h2, region: region, gray: gray, crop: c, onlive: (n) => ctl().tplLive(p.id, { crop: n }), oncommit: (n) => { ctl().tplLive(p.id, { crop: n }); ctl().tplLiveEnd(); } }),
      ui.btn('Kırpmayı sıfırla', { icon: 'reset', onclick: () => set({ crop: { l: 0, t: 0, r: 0, b: 0 } }), disabled: ui.cropIsEmpty(c) })),
    'Çerçeveyi ya da köşeleri sürükleyin; görselin dışarıda kalan kısmı panelde görünmez. Özgün görsel korunur.');
  }

  /* ---------------- seçili panel ---------------- */
  function selectedPanel(state, doc) {
    const c = ctl();
    const p = doc.panels.find((q) => q.id === state.selectedId);
    if (!p) return null;
    const set = (patch) => c.tplSetP(p.id, patch);
    const live = (patch) => c.tplLive(p.id, patch);
    const end = () => c.tplLiveEnd();
    const head = h('p', { class: 'fr-area' }, h('b', {}, T.PANEL_LABEL[p.t] + ' · ' + T.panelName(p)), p.locked ? h('span', { class: 'lock-tag' }, ' kilitli') : null);
    let body = [];
    if (p.t === 'view') {
      const av = T.available(state);
      const C = App.collage;
      const cur = p.src.k === 'none' ? 'none' : p.src.k + ':' + p.src.id;
      const opts = [h('option', { key: 'none', value: 'none' }, '— Boş —')]
        .concat(T.SOURCES.map((s) => h('option', { key: 'm' + s.id, value: 'mod:' + s.id }, s.label + (av[s.id] ? '' : ' (veri yok)'))))
        .concat(C ? Object.keys(C.imgs).map((k) => h('option', { key: 'i' + k, value: 'img:' + k }, 'Görsel · ' + C.imgs[k].name)) : []);
      const stt = p.src.k === 'mod' ? T.entryState(state, p.src.id) : null;
      const err = p.src.k === 'mod' ? T.errorFor(state, p.src.id) : null;
      body = [
        ui.fld2('Kaynak', h('select', { id: 'tpl-src-sel', class: 'inp', value: cur, onchange: (e) => { const v = e.target.value; if (v === 'none') set({ src: { k: 'none', id: '' } }); else { const i = v.indexOf(':'); const k = v.slice(0, i), id = v.slice(i + 1); const lab = k === 'mod' ? T.srcInfo(id).label : ''; set({ src: { k: k, id: id }, label: p.label && p.label !== (p.src.k === 'mod' ? (T.srcInfo(p.src.id) || {}).label : '') ? p.label : lab }); } } }, opts),
          p.src.k === 'mod' ? (!av[p.src.id] ? 'Bu araçta henüz veri yok.' : stt === 'busy' ? 'Hazırlanıyor…' : err ? 'Çıktı alınamadı: ' + err : 'Canlı bağlı: araçtaki değişiklikler buraya yansır.') : null),
        cropField(state, p, set),
        ui.fld2('Yerleşim', ui.segmented({ label: 'Görsel yerleşimi', wide: true, value: p.fit, options: [{ v: 'cover', label: 'Doldur' }, { v: 'contain', label: 'Sığdır' }], onchange: (v) => set({ fit: v }) })),
        numRange('tpl-zoom', 'Yakınlaştır', 20, 600, 5, Math.round(p.zoom * 100), '%' + Math.round(p.zoom * 100), (v) => live({ zoom: v / 100 }), end),
        numRange('tpl-ox', 'Yatay konum', 0, 100, 1, Math.round(p.ox * 100), '%' + Math.round(p.ox * 100), (v) => live({ ox: v / 100 }), end),
        numRange('tpl-oy', 'Dikey konum', 0, 100, 1, Math.round(p.oy * 100), '%' + Math.round(p.oy * 100), (v) => live({ oy: v / 100 }), end),
        h('div', { class: 'tgl-row' },
          p.src.k === 'mod' ? ui.toggle({ label: 'Çerçeve ve künyeyi kırp', on: p.trim, onclick: () => set({ trim: !p.trim }), title: 'Araç paftasının kendi çerçevesini ve künyesini çıkarır; yalnızca çizim kalır' }) : null,
          p.src.k === 'img' ? ui.toggle({ label: 'Siyah-beyaz', on: p.bw, onclick: () => set({ bw: !p.bw }) }) : null),
        ui.fld2('Etiket', textInp('tpl-label', p.label, 'Örn. 01 · Vaziyet', 60, (v) => set({ label: v.trim() })), 'Görselin köşesinde küçük bir şerit olarak görünür.'),
      ];
    } else if (p.t === 'text') {
      body = [
        ui.fld2('Metin', h('textarea', { id: 'tpl-text', class: 'inp tpl-ta', rows: 6, maxlength: 2400, value: p.s, keep: true, onchange: (e) => set({ s: e.target.value }) })),
        numRange('tpl-ts', 'Boyut', 6, 220, 1, p.size, p.size + ' px', (v) => live({ size: v }), end),
        ui.fld2('Yazı tipi', ui.segmented({ label: 'Yazı tipi', wide: true, value: p.fam, options: T.FONT_OPTS, onchange: (v) => set({ fam: v }) })),
        ui.fld2('Hizalama', ui.segmented({ label: 'Yatay hizalama', wide: true, value: p.align, options: [{ v: 'l', label: 'Sol' }, { v: 'c', label: 'Orta' }, { v: 'r', label: 'Sağ' }], onchange: (v) => set({ align: v }) })),
        ui.fld2('Dikey', ui.segmented({ label: 'Dikey hizalama', wide: true, value: p.valign, options: [{ v: 't', label: 'Üst' }, { v: 'm', label: 'Orta' }, { v: 'b', label: 'Alt' }], onchange: (v) => set({ valign: v }) })),
        h('div', { class: 'tgl-row' }, ui.toggle({ label: 'BÜYÜK HARF', on: p.caps, onclick: () => set({ caps: !p.caps }) }), ui.toggle({ label: 'Kalın', on: p.weight >= 700, onclick: () => set({ weight: p.weight >= 700 ? 500 : 800 }) })),
        numRange('tpl-lh', 'Satır aralığı', 90, 240, 5, Math.round(p.lh * 100), '×' + fmt(p.lh, 2), (v) => live({ lh: v / 100 }), end),
        ui.fld2('Yazı rengi', swatches(p.col, (v) => set({ col: v }))),
      ];
    } else if (p.t === 'title') {
      body = [
        ui.fld2('Proje adı', textInp('tpl-tname', p.name, state.project.meta.name || 'Proje adı', 80, (v) => set({ name: v.trim() })), 'Boş bırakırsanız projenin adı kullanılır.'),
        ui.fld2('Alt başlık', textInp('tpl-tsub', p.sub, 'Örn. Mimari ön proje', 120, (v) => set({ sub: v.trim() }))),
        h('div', { class: 'tpl-rows' }, [0, 1, 2, 3].map((i) => { const r = p.rows[i] || ['', '']; return h('div', { key: i, class: 'tpl-row2' },
          h('input', { class: 'inp', type: 'text', maxlength: 24, placeholder: 'Alan', value: r[0], 'aria-label': 'Alan adı ' + (i + 1), keep: true, onchange: (e) => { const rows = p.rows.slice(); while (rows.length <= i) rows.push(['', '']); rows[i] = [e.target.value, rows[i][1]]; set({ rows: rows }); } }),
          h('input', { class: 'inp', type: 'text', maxlength: 48, placeholder: 'Değer', value: r[1], 'aria-label': 'Alan değeri ' + (i + 1), keep: true, onchange: (e) => { const rows = p.rows.slice(); while (rows.length <= i) rows.push(['', '']); rows[i] = [rows[i][0], e.target.value]; set({ rows: rows }); } })); })),
      ];
    } else if (p.t === 'legend') {
      const items = p.items;
      body = [
        h('div', { class: 'tpl-rows' }, items.map((it, i) => h('div', { key: i, class: 'tpl-row2 tpl-leg' },
          h('input', { class: 'kswatch-in', type: 'color', value: it.col, 'aria-label': 'Renk ' + (i + 1), keep: true, onchange: (e) => { const n = items.slice(); n[i] = { col: e.target.value.toUpperCase(), label: it.label }; set({ items: n }); } }),
          h('input', { class: 'inp', type: 'text', maxlength: 40, value: it.label, 'aria-label': 'Açıklama ' + (i + 1), keep: true, onchange: (e) => { const n = items.slice(); n[i] = { col: it.col, label: e.target.value }; set({ items: n }); } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Öğeyi sil', title: 'Sil', onclick: () => set({ items: items.filter((_, j) => j !== i) }) }, ui.icon('close', 14))))),
        ui.btn('Öğe ekle', { icon: 'plus', onclick: () => set({ items: items.concat([{ col: '#D93A1F', label: 'Yeni öğe' }]) }), disabled: items.length >= 14 }),
        numRange('tpl-ls', 'Yazı boyutu', 8, 90, 1, p.size, p.size + ' px', (v) => live({ size: v }), end),
        ui.fld2('Yazı rengi', swatches(p.col, (v) => set({ col: v }))),
      ];
    } else if (p.t === 'facts') {
      const F = T.facts(state.project);
      body = [
        h('div', { class: 'tpl-facts' }, T.FACT_KEYS.map((f) => { const on = p.keys.indexOf(f.id) >= 0; return h('button', { key: f.id, type: 'button', class: 'chip-tgl' + (on ? ' on' : ''), 'aria-pressed': String(on), title: F[f.id] != null ? f.label + ': ' + F[f.id] : f.label + ': veri yok', onclick: () => set({ keys: on ? p.keys.filter((k) => k !== f.id) : p.keys.concat([f.id]) }) }, f.label, h('b', { class: 'mono' }, F[f.id] != null ? F[f.id] : '—')); })),
        h('p', { class: 'note' }, 'Değerler Vaziyet planı, Tasarım ve Fizibilite araçlarından otomatik gelir; veri yoksa “—” görünür.'),
        numRange('tpl-fs', 'Yazı boyutu', 8, 90, 1, p.size, p.size + ' px', (v) => live({ size: v }), end),
        ui.fld2('Yazı rengi', swatches(p.col, (v) => set({ col: v }))),
      ];
    } else if (p.t === 'block') {
      body = [
        ui.fld2('Renk', swatches(p.col, (v) => set({ col: v, tcol: T.contrast(v) }))),
        numRange('tpl-bop', 'Opaklık', 5, 100, 5, Math.round(p.op * 100), '%' + Math.round(p.op * 100), (v) => live({ op: v / 100 }), end),
        ui.fld2('Yazı', textInp('tpl-bs', p.s, 'İsteğe bağlı', 80, (v) => set({ s: v }))),
        p.s ? numRange('tpl-bsz', 'Yazı boyutu', 8, 200, 1, p.size, p.size + ' px', (v) => live({ size: v }), end) : null,
        p.s ? ui.fld2('Yazı rengi', swatches(p.tcol, (v) => set({ tcol: v }))) : null,
      ];
    } else if (p.t === 'line') {
      body = [
        ui.fld2('Yön', ui.segmented({ label: 'Çizgi yönü', wide: true, value: p.dir, options: [{ v: 'h', label: 'Yatay' }, { v: 'v', label: 'Dikey' }], onchange: (v) => set({ dir: v }) })),
        numRange('tpl-lw', 'Kalınlık', 1, 30, 0.5, p.lw, fmt(p.lw, 1) + ' px', (v) => live({ lw: v }), end),
        ui.fld2('Çizgi tipi', ui.segmented({ label: 'Çizgi tipi', wide: true, value: p.dash, options: [{ v: 0, label: 'Düz' }, { v: 1, label: 'Kesik' }, { v: 2, label: 'Nokta' }], onchange: (v) => set({ dash: v }) })),
        ui.fld2('Renk', swatches(p.col, (v) => set({ col: v }))),
      ];
    } else if (p.t === 'north') body = [ui.fld2('Renk', swatches(p.col, (v) => set({ col: v })))];

    const frame = p.t === 'line' || p.t === 'north' ? null : [
      ui.fld2('Zemin', h('select', { id: 'tpl-pbg', class: 'inp', value: p.bg, onchange: (e) => set({ bg: e.target.value }) }, BG_OPTS.map((o) => h('option', { key: o.v, value: o.v }, o.label)))),
      ui.fld2('Kenarlık', ui.segmented({ label: 'Kenarlık kalınlığı', wide: true, value: p.bd <= 0 ? 0 : p.bd <= 1.5 ? 1 : p.bd <= 3 ? 3 : 6, options: [{ v: 0, label: 'Yok' }, { v: 1, label: 'İnce' }, { v: 3, label: 'Orta' }, { v: 6, label: 'Kalın' }], onchange: (v) => set({ bd: v }) })),
      p.bd > 0 ? ui.fld2('Kenarlık rengi', swatches(p.bdc, (v) => set({ bdc: v }))) : null,
      p.t === 'text' || p.t === 'block' || p.t === 'legend' || p.t === 'facts' || p.t === 'view' ? numRange('tpl-pad', 'İç boşluk', 0, 120, 1, p.pad, p.pad + ' px', (v) => live({ pad: v }), end) : null,
    ];
    const nf = (id, label, key, min) => h('label', { class: 'tpl-num', for: id }, h('span', {}, label),
      h('input', { id: id, class: 'inp', type: 'number', step: 1, min: min, value: Math.round(p[key]), keep: true, onchange: (e) => { const v = Number(e.target.value); if (isFinite(v)) set({ [key]: Math.max(min, Math.round(v)) }); } }));
    const geo = h('div', { class: 'tpl-xywh' }, nf('tpl-x', 'X', 'x', -2000), nf('tpl-y', 'Y', 'y', -2000), nf('tpl-w', 'Genişlik', 'w', 8), nf('tpl-h', 'Yükseklik', 'h', 8));
    const al = (how, label, title) => ui.btn(label, { onclick: () => c.tplAlign(p.id, how), title: title, cls: 'btn-sm' });
    const aligns = h('div', { class: 'btn-row tpl-al' },
      al('left', 'Sol', 'Sol kenar boşluğuna'), al('hcenter', 'Orta', 'Sayfa ortasına (yatay)'), al('right', 'Sağ', 'Sağ kenar boşluğuna'),
      al('top', 'Üst', 'Üst kenar boşluğuna'), al('vcenter', 'Orta', 'Sayfa ortasına (dikey)'), al('bottom', 'Alt', 'Alt kenar boşluğuna'));
    const fills = h('div', { class: 'btn-row' }, al('fillw', 'Genişliğe yay', 'Kenar boşlukları arasında yatay doldur'), al('fillh', 'Yüksekliğe yay', 'Kenar boşlukları arasında dikey doldur'), al('fill', 'Sayfayı kapla', 'Kenar boşluklarına kadar doldur'));
    const order = h('div', { class: 'btn-row' }, ui.btn('Öne al', { onclick: () => c.tplOrder(p.id, { to: 'top' }) }), ui.btn('Arkaya al', { onclick: () => c.tplOrder(p.id, { to: 'bottom' }) }));
    const tail = h('div', { class: 'btn-row' },
      ui.btn('Çoğalt', { icon: 'copy', onclick: () => c.tplDup(p.id) }),
      ui.btn(p.locked ? 'Kilidi aç' : 'Kilitle', { onclick: () => set({ locked: !p.locked }) }),
      ui.btn('Sil', { icon: 'trash', onclick: () => c.tplDel(p.id) }));
    return [
      ui.section('Seçili panel', h('div', { class: 'sec-box' }, head, body), null, 'tpl-sel'),
      frame ? ui.section('Zemin ve kenarlık', h('div', { class: 'sec-box' }, frame), null, 'tpl-frame') : null,
      ui.section('Konum ve boyut', h('div', { class: 'sec-box' }, geo, aligns, fills, order, tail), null, 'tpl-geo'),
    ];
  }

  function panelList(state, doc) {
    const c = ctl();
    const sel = state.selectedId;
    const rows = doc.panels.slice().reverse().map((p) => h('li', { key: p.id, id: 'trow-' + p.id, class: 'row krow' + (sel === p.id ? ' sel' : '') + (p.hidden ? ' off' : '') },
      h('div', { class: 'row-main', onclick: () => c.dispatch({ type: 'SELECT', id: sel === p.id ? null : p.id }) },
        h('span', { class: 'kkind tkind-' + p.t, 'aria-hidden': 'true' }),
        h('span', { class: 'row-name' }, T.panelName(p)),
        h('span', { class: 'frow-area' }, T.PANEL_LABEL[p.t])),
      h('div', { class: 'krow-act' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': p.hidden ? 'Paneli göster' : 'Paneli gizle', title: p.hidden ? 'Göster' : 'Gizle', onclick: () => c.tplSetP(p.id, { hidden: !p.hidden }) }, ui.icon(p.hidden ? 'close' : 'check', 14)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Öne taşı', title: 'Öne', onclick: () => c.tplOrder(p.id, { dir: 1 }) }, ui.icon('chevron', 14)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Arkaya taşı', title: 'Arkaya', onclick: () => c.tplOrder(p.id, { dir: -1 }) }, ui.icon('chevron', 14)))));
    return ui.section('Paneller', rows.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'note' }, 'Henüz panel yok. Şablon sekmesinden bir şablon seçin ya da Ekle sekmesinden panel ekleyin.'), doc.panels.length + ' panel · üstteki en önde', 'tpl-list');
  }

  tp.sidebar = function (state, d) {
    const doc = state.project.tpl;
    const c = ctl();
    const tab = ['sablon', 'ekle', 'panel'].indexOf(state.ui.tpl.tab) >= 0 ? state.ui.tpl.tab : 'sablon';
    const tabs = ui.tabsBar([{ id: 'sablon', label: 'Şablon' }, { id: 'ekle', label: 'Ekle' }, { id: 'panel', label: 'Panel', n: doc.panels.length }], tab, (id) => c.tplView({ tab: id }, true));
    let body;
    if (tab === 'sablon') body = [templatesSection(state, doc), pageSection(state, doc), startSection(state, doc)];
    else if (tab === 'ekle') body = [sourcesSection(state, doc), imagesSection(state, doc), itemsSection(state, doc)];
    else body = (selectedPanel(state, doc) || []).concat([panelList(state, doc)]);
    return ui.sideShell('sb-pafta', 'Pafta şablonu paneli', tabs, body);
  };

  /* ---------------- pafta etkileşimi ---------------- */
  let gest = null;
  tp.svgEl = null;
  function toSvg(e) {
    const svg = tp.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  const docNow = () => get().project.tpl;
  const panelNow = (id) => docNow().panels.find((q) => q.id === id);
  const q = (id) => document.getElementById(id);

  function elDown(e, p) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const s = toSvg(e);
    ctl().dispatch({ type: 'SELECT', id: p.id });
    if (p.locked) return;
    gest = { t: 'move', id: p.id, sx: s.x, sy: s.y, orig: p, moved: false, cX: e.clientX, cY: e.clientY };
    try { tp.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }
  function handleDown(e, p, hd) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    gest = { t: 'handle', id: p.id, hd: hd, orig: p, moved: false, cX: e.clientX, cY: e.clientY };
    try { tp.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }
  function bgDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (get().selectedId) ctl().dispatch({ type: 'SELECT', id: null });
  }

  /* yaslama: sayfa kenarı/ortası, kenar boşluğu ve diğer panellerin kenar-orta çizgileri */
  function snapLines(exceptId) {
    const d = docNow(), s = T.sizeOf(d), m = d.margin;
    const xs = [0, m, s.w / 2, s.w - m, s.w], ys = [0, m, s.h / 2, s.h - m, s.h];
    d.panels.forEach((p) => { if (p.id === exceptId || p.hidden) return; xs.push(p.x, p.x + p.w / 2, p.x + p.w); ys.push(p.y, p.y + p.h / 2, p.y + p.h); });
    return { xs: xs, ys: ys };
  }
  function best(vals, cands, thr) {
    let b = null;
    vals.forEach((v) => cands.forEach((c) => { const dd = c - v; if (Math.abs(dd) <= thr && (b === null || Math.abs(dd) < Math.abs(b.d))) b = { d: dd, at: c }; }));
    return b;
  }
  function guide(id, a, b, c2, d2) {
    const el = q(id);
    if (!el) return;
    if (a == null) { el.setAttribute('visibility', 'hidden'); return; }
    el.setAttribute('x1', a); el.setAttribute('y1', b); el.setAttribute('x2', c2); el.setAttribute('y2', d2); el.setAttribute('visibility', 'visible');
  }
  const threshold = () => { const r = tp.svgEl.getBoundingClientRect(); const s = T.sizeOf(docNow()); return 8 * (s.w / Math.max(1, r.width)); };
  const hideGuides = () => { guide('tpg-v'); guide('tpg-h'); };

  function svgMove(e) {
    if (!gest) return;
    const g = gest;
    const s = toSvg(e);
    if (!g.moved) { if (Math.hypot(e.clientX - g.cX, e.clientY - g.cY) < 3) return; g.moved = true; ctl().tplLiveBegin(); }
    const o = g.orig, d = docNow(), S = T.sizeOf(d);
    const snapOn = d.snap && !e.altKey;
    const L = snapOn ? snapLines(o.id) : null, thr = snapOn ? threshold() : 0;
    if (g.t === 'move') {
      let dx = s.x - g.sx, dy = s.y - g.sy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      let nx = o.x + dx, ny = o.y + dy;
      let gx = null, gy = null;
      if (snapOn) {
        const bx = best([nx, nx + o.w / 2, nx + o.w], L.xs, thr), by = best([ny, ny + o.h / 2, ny + o.h], L.ys, thr);
        if (bx) { nx += bx.d; gx = bx.at; }
        if (by) { ny += by.d; gy = by.at; }
      }
      guide('tpg-v', gx, 0, gx, S.h); guide('tpg-h', 0, gy, S.w, gy);
      if (gx == null) guide('tpg-v'); if (gy == null) guide('tpg-h');
      ctl().tplLive(o.id, { x: nx, y: ny });
      return;
    }
    let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
    const hx = g.hd.indexOf('e') >= 0 ? 1 : g.hd.indexOf('w') >= 0 ? -1 : 0, hy = g.hd.indexOf('s') >= 0 ? 1 : g.hd.indexOf('n') >= 0 ? -1 : 0;
    let px = s.x, py = s.y, gx = null, gy = null;
    if (snapOn) {
      if (hx) { const b = best([px], L.xs, thr); if (b) { px = b.at; gx = b.at; } }
      if (hy) { const b = best([py], L.ys, thr); if (b) { py = b.at; gy = b.at; } }
    }
    const MIN = 20;
    if (hx > 0) x1 = Math.max(x0 + MIN, px); else if (hx < 0) x0 = Math.min(x1 - MIN, px);
    if (hy > 0) y1 = Math.max(y0 + MIN, py); else if (hy < 0) y0 = Math.min(y1 - MIN, py);
    if (e.shiftKey && hx && hy) {
      const ar = o.w / o.h;
      const nw = x1 - x0, nh = y1 - y0;
      if (nw / nh > ar) { const w2 = nh * ar; if (hx > 0) x1 = x0 + w2; else x0 = x1 - w2; } else { const h2 = nw / ar; if (hy > 0) y1 = y0 + h2; else y0 = y1 - h2; }
    }
    guide('tpg-v', gx, 0, gx, S.h); guide('tpg-h', 0, gy, S.w, gy);
    if (gx == null) guide('tpg-v'); if (gy == null) guide('tpg-h');
    ctl().tplLive(o.id, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  function svgUp(e) {
    const g = gest;
    if (!g) return;
    gest = null;
    try { tp.svgEl.releasePointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    hideGuides();
    ctl().tplLiveEnd();
  }

  document.addEventListener('keydown', function (e) {
    const S = get();
    if (S.ui.module !== 'pafta') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    const c = ctl();
    if (e.key === 'Escape') { if (S.selectedId) c.dispatch({ type: 'SELECT', id: null }); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedId) { e.preventDefault(); const p = panelNow(S.selectedId); if (p && !p.locked) c.tplDel(S.selectedId); }
    else if (S.selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      const p = panelNow(S.selectedId);
      if (!p || p.locked) return;
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      const dv = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
      c.tplSetP(p.id, { x: p.x + dv[0], y: p.y + dv[1] });
    }
  });
  document.addEventListener('paste', function (e) {
    if (get().ui.module !== 'pafta') return;
    const items = (e.clipboardData && e.clipboardData.files) || [];
    const files = Array.prototype.slice.call(items).filter((f) => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); ctl().tplFiles(files); }
  });

  /* ---------------- hedefler ve tutamaçlar ---------------- */
  function hitsLayer(state, doc) {
    const out = [];
    const ink = '#17181B';
    doc.panels.forEach((p) => {
      if (p.hidden) return;
      out.push(h('rect', { key: 'h' + p.id, class: 'thit' + (p.locked ? ' locked' : ''), x: p.x, y: p.y, width: p.w, height: p.h, fill: 'transparent', onpointerdown: (e) => elDown(e, p), ondblclick: (e) => { e.stopPropagation(); ctl().tplView({ tab: 'panel' }, true); setTimeout(() => { const i = q('tpl-text') || q('tpl-tname') || q('tpl-src-sel'); if (i) i.focus(); }, 80); } }));
    });
    const p = doc.panels.find((x) => x.id === state.selectedId);
    if (p && !p.hidden) {
      const sw = Math.max(2, T.sizeOf(doc).w / 700);
      out.push(h('rect', { key: 'selring', x: p.x, y: p.y, width: p.w, height: p.h, fill: 'none', stroke: ink, 'stroke-width': sw, 'stroke-dasharray': (sw * 4) + ' ' + (sw * 3), 'pointer-events': 'none' }));
      out.push(h('rect', { key: 'selring2', x: p.x - sw, y: p.y - sw, width: p.w + sw * 2, height: p.h + sw * 2, fill: 'none', stroke: '#fff', 'stroke-width': sw * 0.6, opacity: 0.8, 'pointer-events': 'none' }));
      if (!p.locked) {
        const hs = Math.max(11, T.sizeOf(doc).w / 120);
        [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]].forEach((hh) => {
          out.push(h('rect', { key: 'hd' + hh[0], class: 'thandle', x: p.x + hh[1] * p.w - hs / 2, y: p.y + hh[2] * p.h - hs / 2, width: hs, height: hs, 'stroke-width': hs / 5, onpointerdown: (e) => handleDown(e, p, hh[0]) }));
        });
      }
    }
    return out;
  }

  /* ---------------- pafta ---------------- */
  tp.board = function (state, d) {
    const doc = state.project.tpl;
    const c = ctl();
    const sc = T.scene(doc, { st: state, live: true });
    const S = T.sizeOf(doc);
    const sel = doc.panels.find((p) => p.id === state.selectedId);
    const showG = state.ui.tpl.guides !== false;
    const svg = h('svg', {
      id: 'pafta-sablon', class: 'board-svg board-svg-tpl', viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': 'Pafta şablonu, ' + doc.panels.length + ' panel',
      ref: (el) => { tp.svgEl = el; }, onpointerdown: bgDown, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp,
    }, sc.prims.map((p) => App.board.primToV(p)),
    showG && doc.margin > 0 ? h('rect', { key: 'mg', class: 'tmargin', x: doc.margin, y: doc.margin, width: sc.W - doc.margin * 2, height: sc.H - doc.margin * 2, fill: 'none', 'pointer-events': 'none' }) : null,
    h('g', { class: 'thits' }, hitsLayer(state, doc)),
    h('line', { key: 'gv', id: 'tpg-v', class: 'tguide', x1: 0, y1: 0, x2: 0, y2: S.h, visibility: 'hidden', 'pointer-events': 'none' }),
    h('line', { key: 'gh', id: 'tpg-h', class: 'tguide', x1: 0, y1: 0, x2: S.w, y2: 0, visibility: 'hidden', 'pointer-events': 'none' }));
    const refsBusy = T.refsOf(doc).some((id) => { const s = T.entryState(state, id); return s === 'busy' || s === 'none'; });
    const stage = h('div', { class: 'board-stage tstage', ondragover: (e) => { e.preventDefault(); }, ondrop: (e) => { e.preventDefault(); const f = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []); if (f.length) c.tplFiles(f); } }, svg,
      sel ? h('div', { class: 'pl-chip' }, h('b', {}, T.PANEL_LABEL[sel.t]), T.panelName(sel) !== T.PANEL_LABEL[sel.t] ? h('span', { class: 'mono' }, T.panelName(sel)) : null,
        h('button', { type: 'button', class: 'btn pl-fin', onclick: () => c.tplView({ tab: 'panel' }, true) }, 'Düzenle'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.dispatch({ type: 'SELECT', id: null }) }, ui.icon('close', 14))) : null,
      refsBusy ? h('div', { class: 'tpl-busy mono', role: 'status' }, 'Araç çıktıları hazırlanıyor…') : null,
      !doc.panels.length ? ui.emptyCard('Boş bir paftayla başlıyorsunuz', 'Soldaki Şablon sekmesinden bir şablon seçin: araçlardan yaptıklarınız (vaziyet, kolaj, işlev şeması, birim, tasarım…) boş alanlara otomatik yerleşir. Sonra her paneli taşıyıp boyutlandırabilir, metinleri ve künyeyi değiştirebilirsiniz.', [
        ui.btn('Jüri paftası', { icon: 'play', cls: 'btn-primary', onclick: () => c.tplApply('juri') }),
        ui.btn('Izgara 3 × 2', { onclick: () => c.tplApply('izgara') }),
        ui.btn('Boş pafta', { onclick: () => c.tplApply('bos') })]) : null);

    return ui.boardPage(state, d, {
      label: 'Pafta şablonu',
      stage: stage,
      scale: T.sizeOf(doc).label + ' · ' + sc.W + ' × ' + sc.H + ' px',
      foot: h('p', { class: 'board-hint' }, 'Paneli tıklayıp sürükleyin · kenar tutamaçlarıyla boyutlandırın · Shift: eksen / oran korur · Alt: yaslamayı kapatır · ok tuşları taşır · Delete siler'),
      tools: [
        { k: 'btn', label: 'Monokrom', icon: 'sun', pressed: !!(doc.mono && doc.mono.on), onclick: () => c.tplMono({ on: !(doc.mono && doc.mono.on) }), title: 'Tüm paftayı tek rengin tonlarına çevir / özgün renklere dön' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ],
    });
  };
})();
