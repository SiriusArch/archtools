/* ==========================================================================
   63-ui-free.js — Mekân Etüdü arayüzü: sol panel
   Sekmeler: Mekânlar (düzen · kat · seçili mekân · donatı · ek öğeler · liste · ilişkiler) · Çevre (harita · parsel · çevre · vaziyet bağlantısı)
             · Adımlar (süreç afişi) · Bulgular.
   Pafta ve etkileşim: 65-ui-freeboard.js
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const st = App.study;
  const fl = ui.floors;

  const ctl = () => App.ctl;
  const REL_LABEL = { strong: 'Güçlü', weak: 'Zayıf', avoid: 'Ayrı tut', none: 'Yok' };
  const STATE_TXT = st.STATE_LABEL;
  const LV_NAMES = ['Zemin kat', '1. kat', '2. kat', '3. kat', '4. kat', '5. kat'];
  const EX_LABEL = { green: 'Yeşil alan', void: 'Boşluk / avlu', tree: 'Ağaç', arrow: 'Ok' };

  /* ---------------- ortak: kip anahtarı ---------------- */
  fl.modeSection = function (state) {
    const m = st.modeOf(state);
    return ui.section('Çalışma kipi', h('div', { class: 'sec-box' },
      ui.segmented({ label: 'Çalışma kipi', wide: true, value: m, options: [{ v: 'mekanlar', label: 'Mekânlar', title: 'Her mekân serbest şekil, boyut, kat ve donatıyla' }, { v: 'katlar', label: 'Kat blokları', title: 'Mekânların kat atamasından türetilen blok planı' }], onchange: (v) => ctl().stMode(v) }),
      h('p', { class: 'note' }, m === 'mekanlar'
        ? 'Mekânlar ağırlıklıdır: her mekân ayrı bir birimdir; şeklini, yerini, isterseniz katını ve donatısını değiştirin.'
        : 'Mekânlar, bulundukları kata göre ölçekli plan bloklarına dizilir. Katı Mekânlar kipinde ya da burada değiştirebilirsiniz.')), null, 'stmode');
  };

  /* ---------------- küçük bileşenler ---------------- */
  function numField(label, id, val, o) {
    return h('label', { class: 'nfld', for: id },
      h('span', { class: 'nfld-l' }, label),
      h('span', { class: 'nfld-c' },
        h('input', { id: id, class: 'inp mono nfld-i', type: 'number', min: o.min, max: o.max, step: o.step, value: val, keep: true, onchange: (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) o.onchange(v); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'unit' }, o.unit || 'm')));
  }

  /* şekil düğmesi: küçük çokgen önizleme */
  function shapeBtn(s, on, seed, onclick) {
    const ring = st.shapeRing(s.v, 0.4, seed || 1);
    const pts = ring.map((q) => (2 + q[0] * 20).toFixed(1) + ',' + (2 + q[1] * 20).toFixed(1)).join(' ');
    return h('button', { key: s.v, type: 'button', class: 'shp' + (on ? ' on' : ''), title: s.label, 'aria-label': s.label, 'aria-pressed': String(on), onclick: onclick },
      h('svg', { class: 'shp-svg', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('polygon', { points: pts, fill: 'currentColor', 'fill-opacity': 0.2, stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' })));
  }
  function shapePicker(value, seed, onpick) {
    return h('div', { class: 'shp-wrap' }, st.SHAPE_GROUPS.map((g) => h('div', { key: g.g, class: 'shp-grp' },
      h('span', { class: 'shp-cap' }, g.label),
      h('div', { class: 'shp-grid', role: 'group', 'aria-label': g.label + ' şekiller' }, st.SHAPES.filter((s) => s.g === g.g).map((s) => shapeBtn(s, value === s.v, seed, () => onpick(s.v)))))));
  }

  /* ---------------- düzen ---------------- */
  function layoutSection(state, fd) {
    const P = state.project;
    const free = P.study.free;
    const m = fd.metrics;
    const add = () => {
      const n = document.getElementById('fr-add-n'), a = document.getElementById('fr-add-a');
      if (!n) return;
      ctl().freeAddSpace(n.value, parseFloat(a && a.value));
      n.value = '';
    };
    return ui.section('Düzen', h('div', { class: 'sec-box' },
      h('div', { class: 'btn-row' },
        ui.btn('Otomatik diz', { icon: 'layout', cls: 'btn-yellow', onclick: () => ctl().freeAuto(), disabled: !P.spaces.length, title: 'İlişkilere göre tüm mekânları yeniden yerleştir (şekiller, katlar ve donatı korunur)' }),
        ui.btn('Hedef alanlara oturt', { icon: 'target', onclick: () => ctl().freeFitAll(), disabled: !P.spaces.length, title: 'Her mekânı işlev şemasındaki m²’ye getir' })),
      ui.fld2('Izgara yakalama',
        ui.segmented({ label: 'Izgara yakalama', wide: true, value: free.snap, options: [{ v: 0.1, label: '0,1 m' }, { v: 0.5, label: '0,5 m' }, { v: 1, label: '1 m' }], onchange: (v) => ctl().freeSnap(v) }),
        'Taşıma ve boyutlandırma bu adımlarla yapılır; kenarlar komşu mekâna otomatik yapışır.'),
      ui.fld2('Yeni mekân ekle', h('div', { class: 'fr-add' },
        h('input', { id: 'fr-add-n', class: 'inp', type: 'text', maxlength: 60, placeholder: 'Mekân adı', 'aria-label': 'Yeni mekân adı', keep: true, onkeydown: (e) => { if (e.key === 'Enter') add(); } }),
        h('label', { class: 'area-wrap' }, h('span', { class: 'sr' }, 'Alan (m²)'), h('input', { id: 'fr-add-a', class: 'inp area-inp mono', type: 'number', min: 1, step: 1, value: 12, keep: true, onkeydown: (e) => { if (e.key === 'Enter') add(); } }), h('span', { class: 'unit' }, 'm²')),
        ui.btn('', { icon: 'plus', cls: 'btn-icon', onclick: add, title: 'Mekânı işlev şemasına ve bu düzene ekle' }))),
      P.spaces.length ? h('p', { class: 'note' }, fd.items.length + ' mekân · ' + fmt(m.total) + ' m² (program ' + fmt(m.target) + ' m²) · kaplama ' + fmt(fd.bounds.w, 1) + ' × ' + fmt(fd.bounds.h, 1) + ' m' + (m.usedLevels ? ' · ' + m.levels + ' kat' : '')) : null), null, 'frlay');
  }

  /* ---------------- katlar ---------------- */
  function levelsSection(state, fd) {
    const P = state.project;
    const m = fd.metrics;
    const sug = st.suggestCount ? st.suggestCount(P) : 2;
    const n = Math.max(1, Math.min(6, state.ui.etut.spreadN || Math.max(m.levels, sug)));
    return ui.section('Katlar', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, m.usedLevels
        ? 'Kat isteğe bağlıdır: mekâna kat verdiğinizde plan kat süzgeci, izometrik görünüm ve ilişki denetimi buna göre çalışır. Şu an ' + m.levels + ' kat kullanılıyor.'
        : 'Her mekân tek katlı başlar. Bir mekâna kat sayısı ya da bulunduğu kat verebilir, ya da programı bir seferde katlara dağıtabilirsiniz.'),
      ui.fld2('Katlara dağıt', h('div', { class: 'fr-add' },
        ui.stepper({ label: 'Kat sayısı', value: n, min: 1, max: 6, unit: 'kat', onchange: (v) => ctl().etutView({ spreadN: v }, true) }),
        ui.btn('Dağıt', { icon: 'layers', onclick: () => ctl().freeSpread(n), disabled: !P.spaces.length, title: 'Mekânları ilişkilerine ve işlevine göre katlara böl' }))),
      m.usedLevels ? ui.btn('Hepsini zemine al', { icon: 'reset', onclick: () => ctl().freeSpread(1), title: 'Tüm katları sıfırla' }) : null), null, 'frlv');
  }

  /* ---------------- seçili mekân ---------------- */
  function selectedSection(state, fd) {
    const it = fd.byId.get(state.selectedId);
    if (!it) return ui.section('Seçili mekân', h('p', { class: 'note' }, 'Düzenlemek için pafta üzerinde ya da listeden bir mekân seçin.'), null, 'frsel');
    const free = state.project.study.free;
    const snap = free.snap;
    const lock = !!state.ui.stLock;
    const set = (patch) => ctl().freeSet(it.id, patch);
    const sh = st.SHAPE_BY[it.shape] || st.SHAPE_BY.rect;
    const setW = (v) => { if (lock) { const k = it.h / it.w; set({ w: v, h: Math.round(v * k * 10) / 10 }); } else set({ w: v }); };
    const setH = (v) => { if (lock) { const k = it.w / it.h; set({ h: v, w: Math.round(v * k * 10) / 10 }); } else set({ h: v }); };
    const devTxt = Math.abs(it.dev) < 0.005 ? 'hedefte' : (it.dev > 0 ? '+' : '−') + '%' + Math.round(Math.abs(it.dev) * 100);
    const sqish = it.shape === 'rect' || it.shape === 'circle' || it.shape === 'hex' || it.shape === 'oct';
    return ui.section('Seçili mekân', h('div', { class: 'sec-box' },
      ui.fld2('Ad', h('input', { id: 'fr-name', class: 'inp', type: 'text', maxlength: 60, value: it.name, keep: true, onchange: (e) => { if (e.target.value.trim()) ctl().dispatch({ type: 'UPDATE_SPACE', id: it.id, patch: { name: e.target.value.trim() } }); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
      ui.fld2('İşlev bölgesi', h('select', { id: 'fr-zone', class: 'inp', value: it.zone, onchange: (e) => ctl().dispatch({ type: 'UPDATE_SPACE', id: it.id, patch: { zone: e.target.value } }) }, App.ZONE_ORDER.map((z) => h('option', { key: z, value: z }, App.ZONES[z].label)))),
      ui.fld2('Şekil · ' + sh.label, h('div', { class: 'fr-shape' },
        shapePicker(it.shape, it.seed, (v) => set({ shape: v })),
        h('div', { class: 'btn-row' },
          ui.btn('90°', { icon: 'rotate', onclick: () => ctl().freeRotate(it.id), title: 'Şekli 90° döndür (R)', disabled: sqish && Math.abs(it.w - it.h) < 0.05 }),
          sh.seed ? ui.btn('Karıştır', { icon: 'spark', onclick: () => ctl().freeShuffle(it.id), title: 'Aynı kutu içinde yeni bir organik biçim üret' }) : null))),
      sh.prm ? ui.range({ id: 'fr-cut', label: sh.prm, min: 15, max: 65, step: 1, value: Math.round(it.cut * 100), text: '%' + Math.round(it.cut * 100), oninput: (v) => ctl().freeLive(it.id, { cut: v / 100 }), onchange: () => ctl().freeLiveEnd() }) : null,
      h('div', { class: 'nfld-grid' },
        numField('Genişlik', 'fr-w', it.w, { min: st.FREE_MIN, max: st.FREE_MAX, step: snap, onchange: setW }),
        numField('Derinlik', 'fr-h', it.h, { min: st.FREE_MIN, max: st.FREE_MAX, step: snap, onchange: setH }),
        numField('X', 'fr-x', it.x, { step: snap, onchange: (v) => set({ x: v }) }),
        numField('Y', 'fr-y', it.y, { step: snap, onchange: (v) => set({ y: v }) })),
      h('div', { class: 'tgl-row' }, ui.toggle({ label: 'En-boy oranını koru', on: lock, onclick: () => ctl().dispatch({ type: 'UI', patch: { stLock: !lock } }), title: 'Genişlik, derinlik ve köşe tutamaçları oranı korur' })),
      ui.fld2('Kat (isteğe bağlı)', h('div', { class: 'fr-lv' },
        h('select', { id: 'fr-lv', class: 'inp', value: String(it.lv), 'aria-label': 'Bulunduğu kat', onchange: (e) => set({ lv: parseInt(e.target.value, 10) }) }, LV_NAMES.map((n, i) => h('option', { key: i, value: String(i) }, n))),
        ui.stepper({ label: 'Mekânın kat sayısı', value: it.nf, min: 1, max: 60, unit: 'kat', onchange: (v) => set({ nf: v }) })),
        it.nf > 1 || it.lv > 0 ? 'Yükseklik ' + fmt(it.height, 1) + ' m · ' + st.lvLabel(it) + '. Kat vermezseniz mekân tek katlı zemindedir.' : 'Mekâna kat eklemek zorunlu değil. Üst kata almak ya da çok katlı yapmak için değiştirin.'),
      h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Yeşil çatı', on: it.roof === 'green', onclick: () => set({ roof: it.roof === 'green' ? 'plain' : 'green' }), title: 'İzometrikte ve yeşil oranında çatı yeşil sayılır' })),
      h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(it.area, 1) + ' m²'), ' · hedef ', h('span', { class: 'mono' }, fmt(it.target, 1) + ' m²'), ' · ', h('span', { class: 'fr-dev' + (Math.abs(it.dev) > 0.15 ? ' warn' : '') }, devTxt), it.nf > 1 ? h('span', { class: 'mono' }, ' · toplam ' + fmt(it.gfa) + ' m²') : null),
      h('div', { class: 'btn-row' },
        ui.btn('Hedef alana oturt', { icon: 'target', onclick: () => ctl().freeFit(it.id), disabled: Math.abs(it.dev) < 0.005 }),
        ui.btn('Alanı şemaya işle', { icon: 'check', onclick: () => ctl().freeAreaToSchema(it.id), disabled: Math.abs(it.dev) < 0.005, title: 'İşlev şemasındaki alan programını bu mekânın m²’sine eşitle' }),
        ui.btn('Sil', { icon: 'trash', onclick: () => ctl().freeRemove(it.id), title: 'Mekânı işlev şemasından da kaldırır' }))), null, 'frsel');
  }

  /* ---------------- donatı ---------------- */
  function furnSection(state, fd) {
    const it = fd.byId.get(state.selectedId);
    if (!it) return null;
    const c = ctl();
    const fu = state.ui.etut.fu;
    const cur = it.furn.find((q) => q.id === fu);
    const snap = 0.05;
    const opts = st.FURN_GROUPS.map((g) => h('optgroup', { key: g, label: g }, st.FURN.filter((q) => q.g === g).map((q) => h('option', { key: q.k, value: q.k }, q.label + ' · ' + q.w + '×' + q.d))));
    const add = () => { const el = document.getElementById('fu-k'); if (el) c.freeFurnAdd(it.id, el.value); };
    const rows = it.furn.map((f) => {
      const cat = st.FURN_BY[f.k];
      return h('li', { key: f.id, class: 'row frow' + (fu === f.id ? ' sel' : '') },
        h('div', { class: 'row-main', onclick: () => c.freeSelFurn(fu === f.id ? null : f.id) }, h('span', { class: 'row-name' }, cat ? cat.label : f.k), h('span', { class: 'frow-area mono' }, cat ? cat.w + '×' + cat.d : '')),
        h('div', { class: 'frel-act' },
          h('button', { type: 'button', class: 'icon-btn', title: 'Döndür', 'aria-label': (cat ? cat.label : 'Donatı') + ' döndür', onclick: () => c.freeFurnRot(it.id, f.id) }, ui.icon('rotate', 16)),
          h('button', { type: 'button', class: 'icon-btn', title: 'Sil', 'aria-label': (cat ? cat.label : 'Donatı') + ' sil', onclick: () => c.freeFurnDel(it.id, f.id) }, ui.icon('trash', 16))));
    });
    return ui.section('Donatı · ' + it.name, h('div', { class: 'sec-box' },
      h('div', { class: 'btn-row' },
        ui.btn('Otomatik döşe', { icon: 'spark', cls: 'btn-yellow', onclick: () => c.freeFurnAuto(it.id), title: 'Mekânın adına ve işlevine göre uygun donatıyı yerleştir' }),
        ui.btn('Tümünü döşe', { icon: 'layers', onclick: () => c.freeFurnAuto(null), title: 'Bütün mekânları adlarına göre döşe' }),
        ui.btn('Temizle', { icon: 'trash', onclick: () => c.freeFurnClear(it.id), disabled: !it.furn.length })),
      ui.fld2('Donatı ekle', h('div', { class: 'fr-add' }, h('select', { id: 'fu-k', class: 'inp', 'aria-label': 'Donatı türü' }, opts), ui.btn('', { icon: 'plus', cls: 'btn-icon', onclick: add, title: 'Seçili mekâna ekle' }))),
      it.furn.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'note' }, 'Bu mekânda donatı yok. “Otomatik döşe” ad ve işleve göre yerleştirir; sonra paftada sürükleyerek düzeltin.'),
      cur ? h('div', { class: 'nfld-grid' }, numField('X', 'fu-x', cur.x, { step: snap, onchange: (v) => c.freeFurnSet(it.id, cur.id, { x: v }) }), numField('Y', 'fu-y', cur.y, { step: snap, onchange: (v) => c.freeFurnSet(it.id, cur.id, { y: v }) })) : null,
      h('p', { class: 'note' }, 'Donatı mekânla birlikte taşınır; ölçüler gerçek mobilya ölçüleridir. Paftada yakınlaştırınca görünür.')), it.furn.length + ' parça', 'fufurn');
  }

  /* ---------------- ek öğeler ---------------- */
  function addSection(state) {
    const c = ctl();
    const tool = (label, icon, fn, title) => ui.btn(label, { icon: icon, onclick: fn, title: title || label + ' ekle', cls: 'btn-tool' });
    return ui.section('Ekle', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-grid' },
        tool('Yeşil alan', 'sun', () => c.freeAddExtra('green')), tool('Organik yeşil', 'spark', () => c.freeAddExtra('green', null, { round: false, organic: true, seed: Math.floor(Math.random() * 9999) + 1 }), 'Serbest leke biçimli yeşil alan'),
        tool('Boşluk / avlu', 'expand', () => c.freeAddExtra('void'), 'Avlu, oyuk ya da boşluk'), tool('Ağaç', 'pin', () => c.freeAddExtra('tree')),
        tool('Akış oku', 'chevron', () => c.freeAddExtra('arrow', 'flow'), 'Yaya akışı oku'), tool('Geçit', 'link', () => c.freeAddExtra('arrow', 'through'), 'Geçit (noktalı)'),
        tool('Ana giriş', 'target', () => c.freeAddExtra('arrow', 'entry'), 'Ana giriş işareti')),
      ui.btn('Ağaç serp', { icon: 'spark', onclick: () => c.freeTrees(), title: 'Mekânların dışında rastgele 8 ağaç ekle' }),
      h('p', { class: 'note' }, 'Öğe pafta ortasına gelir; sürükleyerek yerine alın, tutamaçlarla boyutlandırın.')), null, 'fr-add-x');
  }
  function extraSection(state, fd) {
    const el = fd.extras.find((e) => e.id === state.ui.etut.ex);
    if (!el) return null;
    const c = ctl();
    const snap = state.project.study.free.snap;
    const set = (patch) => c.freeExSet(el.id, patch);
    let body;
    if (el.t === 'green' || el.t === 'void') {
      body = [
        h('div', { class: 'nfld-grid' },
          numField('Genişlik', 'ex-w', el.w, { min: 0.6, max: 400, step: snap, onchange: (v) => set({ w: v }) }), numField('Derinlik', 'ex-h', el.h, { min: 0.6, max: 400, step: snap, onchange: (v) => set({ h: v }) }),
          numField('X', 'ex-x', el.x, { step: snap, onchange: (v) => set({ x: v }) }), numField('Y', 'ex-y', el.y, { step: snap, onchange: (v) => set({ y: v }) })),
        el.t === 'green' ? ui.fld2('Biçim', ui.segmented({ label: 'Yeşil alan biçimi', wide: true, value: el.organic ? 'org' : el.round ? 'round' : 'rect', options: [{ v: 'rect', label: 'Dikdörtgen' }, { v: 'round', label: 'Elips' }, { v: 'org', label: 'Organik' }], onchange: (v) => set({ organic: v === 'org', round: v === 'round' }) })) : null,
        el.t === 'green' && el.organic ? ui.btn('Karıştır', { icon: 'spark', onclick: () => set({ seed: Math.floor(Math.random() * 9999) + 1 }) }) : null,
        h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(st.polyArea(st.extraRing(el)), 1) + ' m²')),
      ];
    } else if (el.t === 'tree') {
      body = [
        ui.range({ id: 'ex-r', label: 'Taç yarıçapı', min: 1, max: 8, step: 0.2, value: el.r, text: fmt(el.r, 1) + ' m', oninput: (v) => c.freeExLive(el.id, { r: v }), onchange: () => c.freeLiveEnd() }),
        h('div', { class: 'nfld-grid' }, numField('X', 'ex-x', el.x, { step: snap, onchange: (v) => set({ x: v }) }), numField('Y', 'ex-y', el.y, { step: snap, onchange: (v) => set({ y: v }) })),
      ];
    } else {
      body = [
        ui.fld2('Tür', ui.segmented({ label: 'Ok türü', wide: true, value: el.k, options: st.ARROW_KINDS.map((k) => ({ v: k.v, label: k.label })), onchange: (v) => set({ k: v }) })),
        h('div', { class: 'nfld-grid' },
          numField('X1', 'ex-x1', el.x1, { step: snap, onchange: (v) => set({ x1: v }) }), numField('Y1', 'ex-y1', el.y1, { step: snap, onchange: (v) => set({ y1: v }) }),
          numField('X2', 'ex-x2', el.x2, { step: snap, onchange: (v) => set({ x2: v }) }), numField('Y2', 'ex-y2', el.y2, { step: snap, onchange: (v) => set({ y2: v }) })),
      ];
    }
    return ui.section('Seçili öğe · ' + EX_LABEL[el.t], h('div', { class: 'sec-box' }, body,
      h('div', { class: 'btn-row' }, ui.btn('Çoğalt', { icon: 'copy', onclick: () => c.freeExDup(el.id) }), ui.btn('Sil', { icon: 'trash', onclick: () => c.freeExDel(el.id) }))), null, 'frex');
  }

  /* ---------------- liste ve ilişkiler ---------------- */
  function listSection(state, fd) {
    const sel = state.selectedId;
    const ovl = new Set();
    fd.overlaps.forEach((o) => { ovl.add(o.a); ovl.add(o.b); });
    const used = fd.metrics.usedLevels;
    const rows = fd.items.map((it) => h('li', { key: it.id, id: 'mrow-' + it.id, class: 'row frow' + (sel === it.id ? ' sel' : '') },
      h('div', { class: 'row-main', onclick: () => ctl().freeSelect(sel === it.id ? null : it.id) },
        ui.zoneDot(it.zone),
        h('span', { class: 'row-name' }, it.name),
        ovl.has(it.id) ? h('span', { class: 'fr-bad', title: 'Başka bir mekânla çakışıyor' }, '!') : null,
        used ? h('span', { class: 'frow-lv mono', title: 'Kat' }, it.nf > 1 ? it.lv + '–' + it.top : it.lv === 0 ? 'Z' : String(it.lv)) : null,
        h('span', { class: 'frow-area mono' }, fmt(it.area) + ' m²'))));
    const ex = fd.extras.map((e) => h('li', { key: e.id, class: 'row frow' + (state.ui.etut.ex === e.id ? ' sel' : '') },
      h('div', { class: 'row-main', onclick: () => ctl().freeSelEx(state.ui.etut.ex === e.id ? null : e.id) }, h('span', { class: 'ekind ekind-' + e.t }), h('span', { class: 'row-name' }, EX_LABEL[e.t] + (e.t === 'arrow' ? ' · ' + (st.ARROW_KINDS.find((k) => k.v === e.k) || {}).label : '')))));
    return ui.section('Mekânlar', fd.items.length ? [h('ul', { class: 'rows' }, rows), ex.length ? h('ul', { class: 'rows' }, ex) : null] : h('p', { class: 'note' }, 'Henüz mekân yok. İşlev Şeması’nda ya da yukarıdan ekleyin.'), fd.items.length + ' mekân' + (ex.length ? ' · ' + ex.length + ' öğe' : ''), 'frlist');
  }

  function relSection(state, fd) {
    const P = state.project;
    const it = fd.byId.get(state.selectedId);
    if (!it) {
      const bad = fd.pairs.filter((p) => p.ok < 1).sort((a, b) => a.ok - b.ok).slice(0, 6);
      const nm = (id) => fd.byId.get(id).name;
      return ui.section('İlişkiler', h('div', {},
        h('p', { class: 'note' }, fd.pairs.length ? 'Bir mekân seçerek diğer mekânlarla ilişkisini görün. Aşağıda en zayıf eşleşmeler:' : 'İşlev Şeması’nda ilişki tanımlayın; burada bitişik / yakın / uzak durumları görünür.'),
        bad.length ? h('ul', { class: 'rows' }, bad.map((p) => h('li', { key: p.key, class: 'row frel' }, h('div', { class: 'row-main', onclick: () => ctl().freeSelect(p.a) },
          h('span', { class: 'row-name' }, nm(p.a) + ' ↔ ' + nm(p.b)),
          h('span', { class: 'rel-chip rel-' + p.type }, REL_LABEL[p.type]),
          h('span', { class: 'frow-area mono' }, STATE_TXT[p.state] + (p.state === 'near' || p.state === 'far' ? ' · ' + fmt(p.gap, 1) + ' m' : '') + (p.dv ? ' · ±' + p.dv + ' kat' : '')))))) : null), fd.pairs.length + ' ilişki', 'frrel');
    }
    const list = st.freeRelationsOf(P, fd, it.id);
    const shown = list.filter((o) => o.type !== 'none').concat(list.filter((o) => o.type === 'none').slice(0, 6));
    const rows = shown.map((o) => h('li', { key: o.id, class: 'row frel' },
      h('div', { class: 'row-main', onclick: () => ctl().freeSelect(o.id) },
        ui.zoneDot(o.zone),
        h('span', { class: 'row-name' }, o.name),
        h('span', { class: 'frow-area mono' }, STATE_TXT[o.state] + (o.state === 'near' || o.state === 'far' ? ' · ' + fmt(o.gap, 1) + ' m' : '') + (o.dv ? ' · ±' + o.dv + ' kat' : ''))),
      h('div', { class: 'frel-act' },
        h('button', { type: 'button', class: 'rel-chip rel-' + o.type, title: 'İlişki türünü değiştir (işlev şemasıyla ortak)', onclick: () => ctl().dispatch({ type: 'CYCLE_RELATION', a: it.id, b: o.id }) }, REL_LABEL[o.type]),
        o.type !== 'none' && o.type !== 'avoid' && o.state !== 'adjacent' && o.state !== 'overlap' && !o.dv
          ? h('button', { type: 'button', class: 'icon-btn', title: it.name + ' → ' + o.name + ' yanına bitiştir', 'aria-label': it.name + ' mekânını ' + o.name + ' yanına bitiştir', onclick: () => ctl().freeAttach(it.id, o.id, false) }, ui.icon('link', 16))
          : null)));
    return ui.section('İlişkiler · ' + it.name, h('div', {}, h('ul', { class: 'rows' }, rows), h('p', { class: 'note' }, 'Türe tıklayarak güçlü / zayıf / ayrı tut arasında geçiş yapın; değişiklik İşlev Şeması’na da işlenir.')), shown.length + '/' + list.length, 'frrel');
  }

  /* ---------------- çevre sekmesi ---------------- */
  function siteSection(state, fd) {
    const free = state.project.study.free;
    const s = free.site;
    const c = ctl();
    const m = fd.metrics;
    return ui.section('Parsel', h('div', { class: 'sec-box' },
      h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Parsel sınırını göster', on: s.on, onclick: () => (s.on ? c.freeSite({ on: false }) : c.freeSiteAuto()), title: 'Çizimin parselini kesikli çizgiyle işaretle; TAKS / KAKS hesaplanır' })),
      s.on ? [
        s.pts ? h('p', { class: 'note' }, 'Parsel, vaziyet planındaki proje sınırından alındı (' + fmt(m.siteArea) + ' m²). Boyutları dikdörtgen olarak yeniden tanımlamak için aşağıdan değiştirin.') : null,
        h('div', { class: 'nfld-grid' },
          numField('Parsel en', 'ps-w', s.w, { min: 5, max: 600, step: 1, onchange: (v) => c.freeSite({ w: v, pts: null }) }), numField('Parsel boy', 'ps-d', s.d, { min: 5, max: 600, step: 1, onchange: (v) => c.freeSite({ d: v, pts: null }) }),
          numField('X', 'ps-x', s.x, { step: 1, onchange: (v) => c.freeSite({ x: v, pts: null }) }), numField('Y', 'ps-y', s.y, { step: 1, onchange: (v) => c.freeSite({ y: v, pts: null }) })),
        ui.btn('Mekânlardan oluştur', { icon: 'target', onclick: () => c.freeSiteAuto(), title: 'Parseli mekânların çevresine 4 m payla çiz' }),
        h('div', { class: 'mini-metrics' },
          h('div', {}, h('span', {}, 'Parsel'), h('b', { class: 'mono' }, fmt(m.siteArea) + ' m²')),
          h('div', {}, h('span', {}, 'TAKS'), h('b', { class: 'mono' }, fmt(m.taks, 2))),
          h('div', {}, h('span', {}, 'KAKS'), h('b', { class: 'mono' }, fmt(m.kaks, 2))),
          h('div', {}, h('span', {}, 'Yeşil'), h('b', { class: 'mono' }, '%' + Math.round((m.greenShare || 0) * 100)))),
      ] : h('p', { class: 'note' }, 'Parseli açınca TAKS / KAKS, yeşil oranı ve “parsel dışına taşma” denetimi çalışır; çevre dokusu da parselin çevresine üretilir.')), null, 'ps');
  }

  function ctxSection(state, fd) {
    const free = state.project.study.free;
    const c = ctl();
    const mode = free.ctx.mode;
    const hasPlan = !!(state.project.plan && state.project.plan.els.length);
    return ui.section('Çevre dokusu', h('div', { class: 'sec-box' },
      ui.fld2('Kaynak', ui.segmented({ label: 'Çevre kaynağı', wide: true, value: mode, options: [{ v: 'auto', label: 'Otomatik' }, { v: 'gen', label: 'Üretilmiş' }, { v: 'plan', label: 'Vaziyet', title: hasPlan ? 'Vaziyet planındaki yollar, yapılar, su ve yeşil' : 'Vaziyet planı boş' }, { v: 'off', label: 'Yok' }], onchange: (v) => c.freeCtx({ mode: v }) }),
        mode === 'auto' ? 'Vaziyetten yapı bağlıysa vaziyetin çevresi, değilse parsel varsa üretilmiş çevre kullanılır.' : null),
      mode === 'gen' || mode === 'auto' ? [
        ui.range({ id: 'cx-dens', label: 'Çevre yapı yoğunluğu', min: 0, max: 100, step: 5, value: Math.round(free.ctx.dens * 100), text: '%' + Math.round(free.ctx.dens * 100), oninput: (v) => c.freeCtx({ dens: v / 100 }), onchange: () => {} }),
        ui.btn('Çevreyi yenile', { icon: 'reset', onclick: () => c.freeCtx({ seed: free.ctx.seed + 1 }), title: 'Üretilmiş çevre dokusunu değiştir' }),
      ] : null,
      h('p', { class: 'note' }, 'Çevre çizimde hep görünür: mekânları düzenlerken komşu yapıları, yolları ve parseli aynı ölçekte görürsünüz.')), null, 'cxs');
  }

  function linkSection(state, fd) {
    const P = state.project;
    const free = P.study.free;
    const c = ctl();
    const blds = P.plan ? P.plan.els.filter((e) => e.t === 'bld' && e.pts && e.pts.length >= 3) : [];
    const lk = free.link;
    const opts = blds.map((e, i) => h('option', { key: e.id, value: e.id }, (e.name || 'Yapı ' + (i + 1)) + ' · ' + (e.k === 'yeni' ? 'yeni' : 'mevcut') + ' · ' + (e.floors || 1) + ' kat · ' + fmt(App.plan.geo.area(e.pts)) + ' m²'));
    return ui.section('Vaziyet bağlantısı', h('div', { class: 'sec-box' },
      lk ? [
        h('p', { class: 'fr-area' }, h('b', {}, lk.name), ' · ', h('span', { class: 'mono' }, lk.floors + ' kat · kabuk ' + fmt(st.polyArea(lk.shell)) + ' m²')),
        h('p', { class: 'note' }, 'Mekânlar vaziyet planındaki bu yapının kabuğu içinde düzenlenir. Çevresindeki yollar, komşu yapılar ve harita aynı konumda görünür.'),
        h('div', { class: 'btn-row' },
          ui.btn('Kabuğa sığdır', { icon: 'target', onclick: () => c.freeFitShell(), title: 'Tüm mekânları kabuğun içine ölçekle ve ortala' }),
          ui.btn('Vaziyette göster', { icon: 'chevron', onclick: () => c.go('vaziyet'), title: 'Vaziyet Planı’na git' }),
          ui.btn('Bağlantıyı kaldır', { icon: 'close', onclick: () => c.freeUnlink() })),
        lk.floors > fd.metrics.levels ? h('p', { class: 'note' }, 'Vaziyetteki yapı ' + lk.floors + ' katlı; etütte ' + fd.metrics.levels + ' kat kullanılıyor. Katlara dağıt ile kat sayısını eşitleyebilirsiniz.') : null,
      ] : blds.length ? [
        ui.fld2('Vaziyetten yapı seç', h('div', { class: 'fr-add' }, h('select', { id: 'lk-el', class: 'inp', 'aria-label': 'Vaziyet planındaki yapı' }, opts), ui.btn('İçini aç', { icon: 'chevron', cls: 'btn-yellow', onclick: () => { const el = document.getElementById('lk-el'); if (el) c.freeLinkEl(el.value, { stay: true }); }, title: 'Yapının kabuğunu al, mekânları içine yerleştir' })), 'Vaziyet Planı’nda çizdiğiniz bir binanın içini burada mekân mekân tasarlayın.'),
      ] : [h('p', { class: 'note' }, 'Vaziyet Planı’nda bir yapı çizin ya da örnek vaziyeti yükleyin; sonra o yapının içini burada düzenleyebilirsiniz.'), ui.btn('Vaziyet Planı’na git', { icon: 'chevron', onclick: () => c.go('vaziyet') })]), null, 'lks');
  }

  function mapSection(state, fd) {
    const free = state.project.study.free;
    const c = ctl();
    const sec = ui.basemapSection(state, free.map, { key: 'etut', onSet: (patch, liveOn) => { if (liveOn) c.freeMapLive(patch); else { c.freeLiveEnd(); c.freeMap(patch); } } });
    const org = free.org || [0, 0];
    const move = free.map.on && !free.link;
    return [sec, move ? ui.section('Çizimin haritadaki konumu', h('div', { class: 'sec-box' },
      h('div', { class: 'nfld-grid' },
        numField('Doğu', 'og-x', org[0], { step: 1, onchange: (v) => c.freeOrg([v, org[1]]) }), numField('Güney', 'og-y', org[1], { step: 1, onchange: (v) => c.freeOrg([org[0], v]) })),
      h('p', { class: 'note' }, 'Çizimin başlangıç noktası (0, 0), seçili konuma göre bu kadar metre kaydırılır. Yapıyı haritadaki doğru yere oturtmak için kullanın; vaziyetten yapı bağladıysanız konum otomatik gelir.')), null, 'og') : null];
  }

  function envTab(state, fd) {
    return [mapSection(state, fd), siteSection(state, fd), ctxSection(state, fd), linkSection(state, fd)];
  }

  /* ---------------- adımlar sekmesi ---------------- */
  function stepsTab(state, fd) {
    const free = state.project.study.free;
    const c = ctl();
    const steps = free.steps || [];
    const rows = steps.map((s, i) => h('li', { key: s.id, class: 'estep' },
      h('div', { class: 'estep-head' },
        h('span', { class: 'estep-n mono' }, String(i + 1)),
        h('input', { id: 'es-t-' + s.id, class: 'inp', type: 'text', maxlength: 40, value: s.title, 'aria-label': 'Adım başlığı', keep: true, onchange: (e) => c.freeStepSet(i, { title: e.target.value.trim() || 'Adım ' + (i + 1) }) })),
      h('input', { id: 'es-s-' + s.id, class: 'inp', type: 'text', maxlength: 40, value: s.sub, placeholder: 'Alt başlık (isteğe bağlı)', 'aria-label': 'Adım alt başlığı', keep: true, onchange: (e) => c.freeStepSet(i, { sub: e.target.value.trim() }) }),
      h('textarea', { id: 'es-d-' + s.id, class: 'inp estep-desc', maxlength: 400, rows: 3, placeholder: 'Bu adımda ne değişti? (süreç afişinde görünür)', 'aria-label': 'Adım açıklaması', keep: true, onchange: (e) => c.freeStepSet(i, { desc: e.target.value.trim() }) }, s.desc),
      h('div', { class: 'btn-row' },
        ui.btn('Yükle', { icon: 'undo', onclick: () => c.freeStepLoad(i), title: 'Bu adımın düzenini çalışma alanına getir' }),
        ui.btn('Güncelle', { icon: 'check', onclick: () => c.freeStepUpd(i), title: 'Bu adımı güncel düzenle değiştir' }),
        h('span', { class: 'estep-act' },
          h('button', { type: 'button', class: 'icon-btn', title: 'Yukarı', 'aria-label': 'Adımı öne al', disabled: i === 0, onclick: () => c.freeStepMove(i, -1) }, ui.icon('chevron', 16)),
          h('button', { type: 'button', class: 'icon-btn', title: 'Aşağı', 'aria-label': 'Adımı geriye al', disabled: i === steps.length - 1, onclick: () => c.freeStepMove(i, 1) }, ui.icon('chevron', 16)),
          h('button', { type: 'button', class: 'icon-btn', title: 'Sil', 'aria-label': 'Adımı sil', onclick: () => c.freeStepDel(i) }, ui.icon('trash', 16))))));
    return [ui.section('Adımlar', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Düzeni adım adım şekillendirin: her adım, o andaki mekân düzeninin kaydıdır. “Süreç” görünümü adımları aynı ölçekte yan yana, izometrik olarak sunum afişine dizer.'),
      h('div', { class: 'btn-row' },
        ui.btn('Mevcut düzeni adım olarak ekle', { icon: 'plus', cls: 'btn-yellow', onclick: () => c.freeStepAdd(), disabled: steps.length >= 12 || !fd.items.length }),
        ui.btn('Süreç afişini aç', { icon: 'layers', onclick: () => { c.freeView('surec'); }, disabled: !steps.length }))), steps.length + '/12', 'esteps'),
    steps.length ? ui.section('Adım listesi', h('ul', { class: 'rows estep-list' }, rows), null, 'eslist') : null];
  }

  fl.freeSidebar = function (state, d) {
    const P = state.project;
    const fd = st.freeDerive(P);
    const c = fd.findings.counts;
    const tabId = ['mekanlar', 'cevre', 'adimlar', 'bulgular'].indexOf(state.ui.stTab) >= 0 ? state.ui.stTab : 'mekanlar';
    const tabs = ui.tabsBar([
      { id: 'mekanlar', label: 'Mekânlar' },
      { id: 'cevre', label: 'Çevre', n: state.project.study.free.link ? 1 : undefined },
      { id: 'adimlar', label: 'Adımlar', n: (state.project.study.free.steps || []).length || undefined },
      { id: 'bulgular', label: 'Bulgular', n: c.hata + c.uyari + c.oneri || undefined, warn: c.hata + c.uyari > 0 },
    ], tabId, (id) => ctl().dispatch({ type: 'UI', patch: { stTab: id } }));
    let body;
    if (tabId === 'mekanlar') body = [fl.modeSection(state), layoutSection(state, fd), levelsSection(state, fd), selectedSection(state, fd), furnSection(state, fd), extraSection(state, fd), addSection(state), listSection(state, fd), relSection(state, fd)];
    else if (tabId === 'cevre') body = envTab(state, fd);
    else if (tabId === 'adimlar') body = stepsTab(state, fd);
    else body = [ui.findingList(fd.findings, 'Mekânların birbirine göre konumu, çakışma, alan uyumu, kat, parsel ve oran kontrolü.')];
    return ui.sideShell('sb-kat', 'Mekân etüdü paneli', tabs, body);
  };

  /* kip yönlendirmesi: eski kat arayüzü 'katlar' kipinde çalışır */
  const baseSidebar = fl.sidebar, baseBoard = fl.board;
  fl.sidebar = (state, d) => (st.modeOf(state) === 'katlar' ? baseSidebar(state, d) : fl.freeSidebar(state, d));
  fl.board = (state, d) => (st.modeOf(state) === 'katlar' ? baseBoard(state, d) : fl.freeBoard(state, d));
})();
