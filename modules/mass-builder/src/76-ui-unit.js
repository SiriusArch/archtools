/* ==========================================================================
   76-ui-unit.js — Modül 9 arayüzü: Birim Oluşturucu
   Sol panel: Birim (ekle · seçili öğe · parsel ve çevre · öğe listesi) · Adımlar · Bulgular.
   Pafta: Plan (sürükle, tutamaçla boyutlandır) · İzometrik (döndür) · Süreç afişi (tüm adımlar yan yana).
   Mantık: bir yapı kütlesi kurulur; her yeni adım bir öncekinin kopyasıdır ve üzerinde değişiklik yapılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const unit = App.unit;
  const ctl = () => App.ctl;
  const bu = (ui.unit = {});

  App.unitDefaults = () => ({ tab: 'birim', mode: 'plan', yaw: 35, pitch: 45, zx: 1, ghost: true, dims: true, grid: true, stick: 0 });

  const SHAPE_ICON = { rect: 'rect', L: 'shapeL', T: 'shapeT', U: 'shapeU' };
  const TYPE_LABEL = { mass: 'Kütle', void: 'Boşluk', green: 'Yeşil alan', tree: 'Ağaç', arrow: 'Ok' };
  const curStep = (u) => u.steps[Math.min(u.cur, u.steps.length - 1)];

  /* ---------------- bulgular ---------------- */
  const sig = (s) => JSON.stringify(s.els.map((e) => Object.assign({}, e, { id: 0 })));
  unit.findings = function (u) {
    const items = [];
    const step = curStep(u);
    const M = unit.metrics(u, step);
    const add = (id, level, title, detail, actions) => items.push({ id: id, level: level, title: title, detail: detail || '', src: [], actions: actions || [] });
    const masses = step.els.filter((e) => e.t === 'mass');
    if (!masses.length) add('nomass', 'oneri', 'Bu adımda kütle yok', 'Bir kütle ekleyerek başlayın; şekil, kat sayısı ve boyutu sonradan istediğiniz gibi değiştirebilirsiniz.', [{ type: 'unitAdd', kind: 'mass', label: 'Kütle ekle' }]);
    const out = masses.filter((m) => m.x < -0.01 || m.y < -0.01 || m.x + m.w > u.site.w + 0.01 || m.y + m.d > u.site.d + 0.01);
    if (out.length) add('outside', 'uyari', out.length + ' kütle parselin dışına taşıyor', 'Parsel sınırı kesikli çizgidir. Kütleyi içeri çekin ya da parsel ölçüsünü büyütün.', [{ type: 'select', id: out[0].id, label: 'Göster' }]);
    let ov = null;
    for (let i = 0; i < masses.length && !ov; i++) for (let j = i + 1; j < masses.length && !ov; j++) {
      const a = masses[i], b = masses[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), d = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
      if (w > 0.5 && d > 0.5 && w * d > 0.2 * Math.min(a.w * a.d, b.w * b.d)) ov = a;
    }
    if (ov) add('overlap', 'uyari', 'Kütleler birbirinin içine giriyor', 'İki kütlenin sınırları belirgin şekilde çakışıyor. Birini kaydırın ya da “Böl” ile aralık bırakın.', [{ type: 'select', id: ov.id, label: 'Göster' }]);
    if (M.masses && M.taks > 0.8) add('taks', 'hata', 'Taban alanı oranı çok yüksek (%' + Math.round(M.taks * 100) + ')', 'Parselin neredeyse tamamı kapalı; avlu, boşluk ya da yeşil alanla açıklık sağlayın.', [{ type: 'unitAdd', kind: 'void', label: 'Boşluk ekle' }]);
    else if (M.masses && M.taks > 0.65) add('taks', 'uyari', 'Taban alanı oranı yüksek (%' + Math.round(M.taks * 100) + ')', 'Işık ve hava için kütlede oyuk ya da avlu açmayı düşünün.', [{ type: 'unitAdd', kind: 'void', label: 'Boşluk ekle' }]);
    if (M.masses && M.greenShare < 0.1) add('green', 'oneri', 'Yeşil alan az (%' + Math.round(M.greenShare * 100) + ')', 'Avluya yeşil alan, çatıya yeşil çatı ya da parsele ağaç ekleyin.', [{ type: 'unitAdd', kind: 'green', label: 'Yeşil alan ekle' }]);
    if (M.masses && !step.els.some((e) => e.t === 'arrow' && e.k === 'entry')) add('entry', 'oneri', 'Ana giriş işaretlenmedi', 'Giriş üçgeni, süreç afişinde yaya akışını okunur kılar.', [{ type: 'unitAdd', kind: 'entry', label: 'Giriş ekle' }]);
    if (u.cur > 0 && sig(step) === sig(u.steps[u.cur - 1])) add('same', 'oneri', 'Bu adım bir öncekiyle aynı', 'Süreç afişinde fark görünmesi için bu adımda bir şeyi değiştirin: kütleyi böl, boşluk aç, yeşil ekle…', []);
    if (u.steps.length === 1) add('onestep', 'oneri', 'Süreç tek adımdan oluşuyor', 'Yeni adım, mevcut durumun kopyasıdır; üzerinde değişiklik yaparak tasarımı adım adım şekillendirin.', [{ type: 'unitStepAdd', label: 'Adım ekle' }]);
    if (!step.desc) add('nodesc', 'oneri', 'Adıma açıklama yazılmadı', 'Kısa bir açıklama, süreç afişindeki panelin altında görünür.', [{ type: 'unitView', mode: 'surec', label: 'Afişe bak' }]);
    const c = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { c[i.level]++; });
    return { items: items, counts: c };
  };

  /* ---------------- sol panel ---------------- */
  function numField(label, id, val, o) {
    return h('label', { class: 'nfld', for: id },
      h('span', { class: 'nfld-l' }, label),
      h('span', { class: 'nfld-c' },
        h('input', { id: id, class: 'inp mono nfld-i', type: 'number', min: o.min, max: o.max, step: o.step, value: val, keep: true, onchange: (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) o.onchange(v); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'unit' }, o.unit || 'm')));
  }

  function addSection(state) {
    const c = ctl();
    const tool = (kind, label, icon, title) => ui.btn(label, { icon: icon, onclick: () => c.unitAdd(kind), title: title || label + ' ekle', cls: 'btn-tool' });
    return ui.section('Ekle', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-grid' },
        tool('mass', 'Kütle', 'rect'), tool('L', 'L kütle', 'shapeL'), tool('T', 'T kütle', 'shapeT'), tool('U', 'U kütle', 'shapeU'),
        tool('void', 'Boşluk', 'expand', 'Avlu / oyuk / boşluk'), tool('green', 'Yeşil', 'sun', 'Yeşil alan'),
        tool('tree', 'Ağaç', 'pin'), tool('flow', 'Akış', 'chevron', 'Yaya akışı oku'),
        tool('through', 'Geçit', 'link', 'Kütle boyunca geçit'), tool('entry', 'Giriş', 'target', 'Ana giriş işareti')),
      ui.btn('Ağaç serp', { icon: 'spark', onclick: () => c.unitTreesAround(), title: 'Kütlelerin dışında rastgele 8 ağaç ekle' }),
      h('p', { class: 'note' }, 'Öğe pafta ortasına gelir; sürükleyerek yerine alın, tutamaçlarla boyutlandırın.')), null, 'bu-add');
  }

  function selectedSection(state, u) {
    const c = ctl();
    const step = curStep(u);
    const el = step.els.find((e) => e.id === state.selectedId);
    if (!el) return ui.section('Seçili öğe', h('p', { class: 'note' }, 'Düzenlemek için pafta üzerinde ya da listeden bir öğe seçin.'), null, 'bu-sel');
    const snap = u.snap;
    const set = (patch) => c.unitSetEl(el.id, patch);
    const tail = h('div', { class: 'btn-row' },
      ui.btn('Çoğalt', { icon: 'copy', onclick: () => c.unitDup(el.id) }),
      ui.btn('Sil', { icon: 'trash', onclick: () => c.unitDel(el.id) }));
    const head = h('p', { class: 'fr-area' }, h('b', {}, TYPE_LABEL[el.t]));
    let body;
    if (el.t === 'mass') {
      body = [
        ui.fld2('Şekil', h('div', { class: 'fr-shape' },
          ui.segmented({ label: 'Kütle şekli', wide: true, value: el.shape, options: unit.SHAPES.map((s) => ({ v: s.v, title: s.label, label: h('span', { class: 'fr-ico' }, ui.icon(SHAPE_ICON[s.v], 18), h('span', { class: 'sr' }, s.label)) })), onchange: (v) => set({ shape: v }) }),
          ui.btn('90°', { icon: 'rotate', onclick: () => c.unitRotate(el.id), title: 'Şekli 90° döndür', disabled: el.shape === 'rect' }))),
        el.shape !== 'rect' ? ui.range({ id: 'bu-cut', label: 'Kesik oranı', min: 15, max: 65, step: 1, value: Math.round(el.cut * 100), text: '%' + Math.round(el.cut * 100), oninput: (v) => c.unitLive(el.id, { cut: v / 100 }), onchange: () => c.unitLiveEnd() }) : null,
        ui.fld2('Kat sayısı', ui.stepper({ label: 'Kat sayısı', value: el.floors, min: 1, max: 80, unit: 'kat', onchange: (v) => set({ floors: v }) }), 'Yükseklik ' + fmt(el.floors * unit.FH, 1) + ' m (kat yüksekliği ' + unit.FH + ' m)'),
        h('div', { class: 'nfld-grid' },
          numField('Genişlik', 'bu-w', el.w, { min: 1, max: 400, step: snap, onchange: (v) => set({ w: v }) }),
          numField('Derinlik', 'bu-d', el.d, { min: 1, max: 400, step: snap, onchange: (v) => set({ d: v }) }),
          numField('X', 'bu-x', el.x, { step: snap, onchange: (v) => set({ x: v }) }),
          numField('Y', 'bu-y', el.y, { step: snap, onchange: (v) => set({ y: v }) })),
        h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Yeşil çatı', on: el.roof === 'green', onclick: () => set({ roof: el.roof === 'green' ? 'plain' : 'green' }) })),
        h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(unit.massArea(el), 1) + ' m²'), ' taban · ', h('span', { class: 'mono' }, fmt(unit.massArea(el) * el.floors) + ' m²'), ' toplam'),
        ui.fld2('Böl', h('div', { class: 'btn-row' },
          ui.btn('Dikey kesit', { icon: 'layout', onclick: () => c.unitSplit(el.id, 'x', 0.5, 4), title: 'Kütleyi soldan sağa iki parçaya böl, aralarında 4 m boşluk bırak' }),
          ui.btn('Yatay kesit', { icon: 'layout', onclick: () => c.unitSplit(el.id, 'y', 0.5, 4), title: 'Kütleyi üstten alta iki parçaya böl, aralarında 4 m boşluk bırak' })),
          'Parçalar dikdörtgen olur; her parçanın katını ayrı ayarlayabilirsiniz.'),
      ];
    } else if (el.t === 'void' || el.t === 'green') {
      body = [
        h('div', { class: 'nfld-grid' },
          numField('Genişlik', 'bu-w', el.w, { min: 1, max: 400, step: snap, onchange: (v) => set({ w: v }) }),
          numField('Derinlik', 'bu-d', el.d, { min: 1, max: 400, step: snap, onchange: (v) => set({ d: v }) }),
          numField('X', 'bu-x', el.x, { step: snap, onchange: (v) => set({ x: v }) }),
          numField('Y', 'bu-y', el.y, { step: snap, onchange: (v) => set({ y: v }) })),
        el.t === 'green' ? h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Yuvarlak', on: el.round, onclick: () => set({ round: !el.round }) })) : null,
        h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(el.w * el.d * (el.t === 'green' && el.round ? Math.PI / 4 : 1), 1) + ' m²')),
      ];
    } else if (el.t === 'tree') {
      body = [
        ui.range({ id: 'bu-tr', label: 'Taç yarıçapı', min: 1, max: 8, step: 0.2, value: el.r, text: fmt(el.r, 1) + ' m', oninput: (v) => c.unitLive(el.id, { r: v }), onchange: () => c.unitLiveEnd() }),
        h('div', { class: 'nfld-grid' }, numField('X', 'bu-x', el.x, { step: snap, onchange: (v) => set({ x: v }) }), numField('Y', 'bu-y', el.y, { step: snap, onchange: (v) => set({ y: v }) })),
      ];
    } else {
      body = [
        ui.fld2('Tür', ui.segmented({ label: 'Ok türü', wide: true, value: el.k, options: unit.ARROW_KINDS.map((k) => ({ v: k.v, label: k.label })), onchange: (v) => set({ k: v }) })),
        h('div', { class: 'nfld-grid' },
          numField('X1', 'bu-x1', el.x1, { step: snap, onchange: (v) => set({ x1: v }) }), numField('Y1', 'bu-y1', el.y1, { step: snap, onchange: (v) => set({ y1: v }) }),
          numField('X2', 'bu-x2', el.x2, { step: snap, onchange: (v) => set({ x2: v }) }), numField('Y2', 'bu-y2', el.y2, { step: snap, onchange: (v) => set({ y2: v }) })),
      ];
    }
    return ui.section('Seçili öğe', h('div', { class: 'sec-box' }, head, body, tail), null, 'bu-sel');
  }

  function siteSection(state, u) {
    const c = ctl();
    return ui.section('Birim, parsel ve çevre', h('div', { class: 'sec-box' },
      ui.fld2('Birim adı', h('input', { id: 'bu-title', class: 'inp', type: 'text', maxlength: 60, placeholder: 'Örn. Yoğunluk + Boşluk', value: u.title, keep: true, onchange: (e) => c.unitSet({ title: e.target.value.trim() }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }), 'Süreç afişinin başlığıdır.'),
      h('div', { class: 'nfld-grid' },
        numField('Parsel en', 'bu-sw', u.site.w, { min: 10, max: 300, step: 1, onchange: (v) => c.unitSet({ site: { w: v, d: u.site.d } }) }),
        numField('Parsel boy', 'bu-sd', u.site.d, { min: 10, max: 300, step: 1, onchange: (v) => c.unitSet({ site: { w: u.site.w, d: v } }) })),
      ui.range({ id: 'bu-dens', label: 'Çevre yapı yoğunluğu', min: 0, max: 100, step: 5, value: Math.round(u.ctxDens * 100), text: '%' + Math.round(u.ctxDens * 100), oninput: (v) => c.unitSetLive({ ctxDens: v / 100 }), onchange: () => c.unitLiveEnd() }),
      h('div', { class: 'btn-row' }, ui.btn('Çevreyi yenile', { icon: 'reset', onclick: () => c.unitSet({ ctxSeed: u.ctxSeed + 1 }), title: 'Çevre yapı dokusunu yeniden üret' })),
      ui.fld2('Izgara yakalama', ui.segmented({ label: 'Izgara yakalama', wide: true, value: u.snap, options: [{ v: 0.5, label: '0,5 m' }, { v: 1, label: '1 m' }, { v: 2, label: '2 m' }], onchange: (v) => c.unitSet({ snap: v }) }), 'Taşıma ve boyutlandırma bu adımlarla yapılır; kenarlar komşu öğeye ve parsel sınırına yapışır (Alt: kapat).')), null, 'bu-site');
  }

  function listSection(state, u) {
    const step = curStep(u);
    const sel = state.selectedId;
    const rows = step.els.map((e, i) => {
      const nm = e.t === 'mass' ? e.floors + ' kat · ' + fmt(unit.massArea(e)) + ' m²' : e.t === 'arrow' ? (unit.ARROW_KINDS.find((k) => k.v === e.k) || {}).label : e.t === 'tree' ? 'r ' + fmt(e.r, 1) + ' m' : fmt(e.w * e.d) + ' m²';
      return h('li', { key: e.id, id: 'urow-' + e.id, class: 'row frow' + (sel === e.id ? ' sel' : '') },
        h('div', { class: 'row-main', onclick: () => ctl().dispatch({ type: 'SELECT', id: sel === e.id ? null : e.id }) },
          h('span', { class: 'ukind ukind-' + e.t, 'aria-hidden': 'true' }),
          h('span', { class: 'row-name' }, TYPE_LABEL[e.t] + ' ' + (step.els.slice(0, i + 1).filter((q) => q.t === e.t).length)),
          h('span', { class: 'frow-area mono' }, nm)));
    });
    return ui.section('Bu adımdaki öğeler', rows.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'note' }, 'Bu adım boş. Yukarıdan kütle ya da başka bir öğe ekleyin.'), step.els.length + ' öğe', 'bu-list');
  }

  function metricsSection(u) {
    const M = unit.metrics(u, curStep(u));
    const kv = (k, v) => h('div', {}, h('span', { class: 'kv-k' }, k), h('b', { class: 'kv-v mono' }, v));
    return ui.section('Bu adımın ölçüleri', h('div', { class: 'sec-box' },
      h('div', { class: 'kv-grid' },
        kv('Parsel', fmt(M.siteArea) + ' m²'), kv('Taban', fmt(M.footprint) + ' m²'),
        kv('TAKS', fmt(M.taks, 2)), kv('KAKS', fmt(M.kaks, 2)),
        kv('Kütle', String(M.masses)), kv('En yüksek', M.maxFloors + ' kat'),
        kv('Yeşil', '%' + Math.round(M.greenShare * 100)), kv('Ağaç', String(M.trees)))), null, 'bu-met');
  }

  function stepsTab(state, u) {
    const c = ctl();
    const step = curStep(u);
    const rows = u.steps.map((s, i) => h('li', { key: s.id, class: 'row ustep-row' + (i === u.cur ? ' sel' : '') },
      h('div', { class: 'row-main', onclick: () => c.unitGo(i) },
        h('span', { class: 'ustep-n mono' }, String(i + 1)),
        h('span', { class: 'ustep-txt' }, h('b', { class: 'ustep-t' }, s.title || 'Adım ' + (i + 1)), s.sub ? h('small', { class: 'ustep-s' }, s.sub) : null)),
      h('div', { class: 'ustep-act' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Adımı yukarı taşı', disabled: i === 0, onclick: () => c.unitStepMove(i, -1), title: 'Öne al' }, ui.icon('chevron', 14)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Adımı aşağı taşı', disabled: i === u.steps.length - 1, onclick: () => c.unitStepMove(i, 1), title: 'Sona al' }, ui.icon('chevron', 14)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Adımı sil', disabled: u.steps.length <= 1, onclick: () => c.unitStepDel(i), title: 'Sil' }, ui.icon('trash', 14)))));
    return [
      ui.section('Adımlar', h('div', { class: 'sec-box' },
        h('ul', { class: 'rows' }, rows),
        h('div', { class: 'btn-row' },
          ui.btn('Adım ekle', { icon: 'plus', cls: 'btn-yellow', onclick: () => c.unitStepAdd(false), title: 'Bu adımın kopyasını sonraya ekle; üzerinde değişiklik yapın', disabled: u.steps.length >= 12 }),
          ui.btn('Boş adım', { icon: 'newdoc', onclick: () => c.unitStepAdd(true), disabled: u.steps.length >= 12 })),
        h('p', { class: 'note' }, 'Yeni adım, seçili adımın kopyasıdır. Kütleyi bölün, boşluk açın, yeşil ekleyin; her adım süreç afişinde ayrı panel olur.')), u.steps.length + '/12', 'bu-steps'),
      ui.section('Seçili adım', h('div', { class: 'sec-box' },
        ui.fld2('Ad', h('input', { id: 'ustep-title', class: 'inp', type: 'text', maxlength: 40, value: step.title, keep: true, onchange: (e) => c.unitStepSet({ title: e.target.value.trim() || step.title }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
        ui.fld2('Alt başlık', h('input', { id: 'ustep-sub', class: 'inp', type: 'text', maxlength: 40, placeholder: 'Örn. Anla', value: step.sub, keep: true, onchange: (e) => c.unitStepSet({ sub: e.target.value.trim() }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
        ui.fld2('Açıklama', h('textarea', { id: 'ustep-desc', class: 'inp ustep-desc', rows: 4, maxlength: 400, placeholder: 'Bu adımda ne değişti, neden?', keep: true, value: step.desc, onchange: (e) => c.unitStepSet({ desc: e.target.value.trim() }) }), 'Süreç afişinde panelin altında görünür.')), null, 'bu-stepsel'),
      ui.section('Hazır akışlar', h('div', { class: 'sec-box' },
        ui.btn('Yoğunluk + Boşluk · 6 adım', { icon: 'layers', onclick: () => c.unitPreset('tam'), title: 'Bağlam → yoğunluk → boşluk → akış → peyzaj → aktivasyon' }),
        ui.btn('Kısa akış · 4 adım', { icon: 'layers', onclick: () => c.unitPreset('kisa') }),
        ui.btn('Boş başla', { icon: 'newdoc', onclick: () => c.unitPreset('bos') }),
        h('p', { class: 'note' }, 'Hazır akış mevcut adımların yerini alır; Geri al ile dönebilirsiniz.')), null, 'bu-pre'),
    ];
  }

  function viewSection(state, u) {
    const v = state.ui.unit, c = ctl();
    return ui.section('Görünüm', h('div', { class: 'sec-box' },
      v.mode === 'plan' ? h('div', { class: 'tgl-row' },
        ui.toggle({ label: 'Önceki adım', on: v.ghost, onclick: () => c.unitView({ ghost: !v.ghost }), title: 'Önceki adımın kütlelerini hayalet çizgiyle göster' }),
        ui.toggle({ label: 'Ölçüler', on: v.dims, onclick: () => c.unitView({ dims: !v.dims }) })) : null,
      v.mode === 'iso' ? ui.toggle({ label: 'Parsel ızgarası', on: v.grid, onclick: () => c.unitView({ grid: !v.grid }) }) : null,
      v.mode !== 'plan' ? [
        ui.range({ id: 'bu-yaw', label: 'Dönüş', min: -85, max: 85, step: 1, value: Math.round(v.yaw), text: Math.round(v.yaw) + '°', oninput: (x) => c.unitView({ yaw: x }, true), onchange: () => c.unitView({}) }),
        ui.range({ id: 'bu-pitch', label: 'Bakış yüksekliği', min: 20, max: 70, step: 1, value: Math.round(v.pitch), text: Math.round(v.pitch) + '°', oninput: (x) => c.unitView({ pitch: x }, true), onchange: () => c.unitView({}) }),
      ] : null), null, 'bu-view');
  }

  bu.sidebar = function (state, d) {
    const u = state.project.unit;
    const c = ctl();
    const f = unit.findings(u);
    const tab = ['birim', 'adimlar', 'bulgular'].indexOf(state.ui.unit.tab) >= 0 ? state.ui.unit.tab : 'birim';
    const tabs = ui.tabsBar([
      { id: 'birim', label: 'Birim', n: curStep(u).els.length },
      { id: 'adimlar', label: 'Adımlar', n: u.steps.length },
      { id: 'bulgular', label: 'Bulgular', n: f.counts.hata + f.counts.uyari + f.counts.oneri, warn: f.counts.hata + f.counts.uyari > 0 },
    ], tab, (id) => c.unitView({ tab: id }, true));
    let body;
    if (tab === 'birim') body = [addSection(state), selectedSection(state, u), metricsSection(u), listSection(state, u), siteSection(state, u), viewSection(state, u)];
    else if (tab === 'adimlar') body = stepsTab(state, u).concat([viewSection(state, u)]);
    else body = [ui.findingList(f, 'Bu adımın kütlesi, parsel uyumu, açıklık ve süreç akışı kontrolü.')];
    return ui.sideShell('sb-birim', 'Birim oluşturucu paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, v, frozen) {
    const key = [P.unit, P.meta.name, App.theme.name, frozen, v.mode, v.yaw, v.pitch, v.zx, v.ghost, v.dims, v.grid, App.sheet.W];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: unit.scene(P.unit, { live: true, frozen: frozen, mode: v.mode, yaw: v.yaw, pitch: v.pitch, zx: v.zx, ghost: v.ghost, dims: v.dims, grid: v.grid }) };
    return memo.v;
  }

  let gest = null, frozen = null, orbit = null;
  function toWorld(e, view) {
    const svg = bu.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [view.wx(q.x), view.wy(q.y)];
  }
  const snapTo = (v, s) => Math.round(Math.round(v / s) * s * 100) / 100;
  function pull(vals, cands, tol) {
    let best = null;
    vals.forEach((v) => cands.forEach((cv) => { const dd = cv - v; if (Math.abs(dd) <= tol && (best == null || Math.abs(dd) < Math.abs(best))) best = dd; }));
    return best;
  }
  const bbox = (e) => (e.t === 'tree' ? { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 } : e.t === 'arrow' ? { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1) } : { x: e.x, y: e.y, w: e.w, h: e.d });

  function down(e, el, view, handle) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const w = toWorld(e, view);
    frozen = view.win;
    gest = { id: el.id, handle: handle || null, sx: w[0], sy: w[1], cx: e.clientX, cy: e.clientY, orig: Object.assign({}, el), moved: false, view: view };
    try { bu.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    ctl().dispatch({ type: 'SELECT', id: el.id });
  }
  function move(e) {
    if (orbit) { orbitMove(e); return; }
    if (!gest) return;
    if (!gest.moved) {
      if (Math.hypot(e.clientX - gest.cx, e.clientY - gest.cy) < 3) return;
      gest.moved = true;
      ctl().unitLiveBegin();
    }
    const S = App.store.get();
    const u = S.project.unit;
    const step = curStep(u);
    const snap = u.snap;
    const w = toWorld(e, gest.view);
    const dx = w[0] - gest.sx, dy = w[1] - gest.sy;
    const o = gest.orig;
    const tol = Math.max(0.4, 9 / gest.view.s);
    const mag = !e.altKey;
    const others = step.els.filter((q) => q.id !== gest.id && (q.t === 'mass' || q.t === 'void' || q.t === 'green')).map(bbox);
    const xs = [0, u.site.w], ys = [0, u.site.d];
    others.forEach((q) => { xs.push(q.x, q.x + q.w); ys.push(q.y, q.y + q.h); });
    const adj = (v, cands) => { if (!mag) return v; const dd = pull([v], cands, tol); return dd == null ? v : v + dd; };
    if (o.t === 'arrow') {
      if (gest.handle === 'p1') { ctl().unitLive(o.id, { x1: snapTo(o.x1 + dx, snap), y1: snapTo(o.y1 + dy, snap) }); return; }
      if (gest.handle === 'p2') { ctl().unitLive(o.id, { x2: snapTo(o.x2 + dx, snap), y2: snapTo(o.y2 + dy, snap) }); return; }
      const sx = snapTo(dx, snap), sy = snapTo(dy, snap);
      ctl().unitLive(o.id, { x1: o.x1 + sx, y1: o.y1 + sy, x2: o.x2 + sx, y2: o.y2 + sy });
      return;
    }
    if (o.t === 'tree') { ctl().unitLive(o.id, { x: snapTo(o.x + dx, snap), y: snapTo(o.y + dy, snap) }); return; }
    if (!gest.handle) {
      let x = snapTo(o.x + dx, snap), y = snapTo(o.y + dy, snap);
      if (mag) {
        const cx = pull([x, x + o.w], xs, tol), cy = pull([y, y + o.d], ys, tol);
        if (cx != null) x += cx;
        if (cy != null) y += cy;
      }
      ctl().unitLive(o.id, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
      return;
    }
    const hd = gest.handle;
    let x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.d;
    if (hd.indexOf('w') >= 0) x0 = adj(snapTo(o.x + dx, snap), xs);
    if (hd.indexOf('e') >= 0) x1 = adj(snapTo(o.x + o.w + dx, snap), xs);
    if (hd.indexOf('n') >= 0) y0 = adj(snapTo(o.y + dy, snap), ys);
    if (hd.indexOf('s') >= 0) y1 = adj(snapTo(o.y + o.d + dy, snap), ys);
    if (x1 - x0 < 1) { if (hd.indexOf('w') >= 0) x0 = x1 - 1; else x1 = x0 + 1; }
    if (y1 - y0 < 1) { if (hd.indexOf('n') >= 0) y0 = y1 - 1; else y1 = y0 + 1; }
    ctl().unitLive(o.id, { x: x0, y: y0, w: x1 - x0, d: y1 - y0 });
  }
  function up(e) {
    if (orbit) { orbitUp(e); return; }
    if (!gest) return;
    try { bu.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    gest = null; frozen = null;
    ctl().unitLiveEnd();
    ctl().dispatch({ type: 'UI', patch: { unit: Object.assign({}, App.store.get().ui.unit, { stick: (App.store.get().ui.unit.stick || 0) + 1 }) } });
  }

  function orbitDown(e) {
    const v = App.store.get().ui.unit;
    if (v.mode === 'plan') { if (App.store.get().selectedId) ctl().dispatch({ type: 'SELECT', id: null }); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    orbit = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false };
  }
  function orbitMove(e) {
    const dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
    if (!orbit.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      orbit.moved = true;
      try { bu.svgEl.setPointerCapture(orbit.id); } catch (err) {}
    }
    ctl().unitView({ yaw: U.clamp(orbit.yaw + dx * 0.32, -85, 85), pitch: U.clamp(orbit.pitch + dy * 0.22, 20, 70) }, true);
  }
  function orbitUp(e) {
    const o = orbit;
    orbit = null;
    try { bu.svgEl.releasePointerCapture(o.id); } catch (err) {}
    if (o.moved) ctl().unitView({});
  }

  const HANDLES = [['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'], ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize']];

  function planHits(state, u, view) {
    const c = ctl();
    const step = curStep(u);
    const sel = state.selectedId;
    const g = App.theme.name === 'glass';
    const X = view.X, Y = view.Y;
    const hits = [];
    const kd = (e, el) => {
      const sn = u.snap * (e.shiftKey ? 5 : 1);
      const k = e.key;
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[k]) {
        e.preventDefault();
        const dv = dirs[k];
        if (el.t === 'arrow') c.unitSetEl(el.id, { x1: el.x1 + dv[0] * sn, y1: el.y1 + dv[1] * sn, x2: el.x2 + dv[0] * sn, y2: el.y2 + dv[1] * sn });
        else if (el.t === 'tree') c.unitSetEl(el.id, { x: el.x + dv[0] * sn, y: el.y + dv[1] * sn });
        else if ((e.ctrlKey || e.metaKey)) c.unitSetEl(el.id, { w: el.w + dv[0] * sn, d: el.d + dv[1] * sn });
        else c.unitSetEl(el.id, { x: el.x + dv[0] * sn, y: el.y + dv[1] * sn });
      } else if ((k === 'r' || k === 'R') && el.t === 'mass') { e.preventDefault(); c.unitRotate(el.id); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); c.unitDel(el.id); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); c.dispatch({ type: 'SELECT', id: el.id }); }
    };
    const aria = (el) => TYPE_LABEL[el.t] + (el.t === 'mass' ? ', ' + el.floors + ' kat. ' : '. ') + 'Ok tuşları taşır, Ctrl ile ok tuşları boyutlandırır, Delete siler' + (el.t === 'mass' ? ', R döndürür.' : '.');
    // yukarıdan aşağı: önce arkadaki (yeşil, boşluk), sonra kütle, ağaç, ok
    const order = { green: 0, void: 1, mass: 2, tree: 3, arrow: 4 };
    step.els.slice().sort((a, b) => order[a.t] - order[b.t]).forEach((el) => {
      const on = sel === el.id;
      const common = { class: 'uhit', fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': aria(el), onpointerdown: (e) => down(e, el, view, null), onkeydown: (e) => kd(e, el) };
      let node, ring;
      if (el.t === 'mass') {
        const pts = unit.ring(el).map((q) => X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1)).join(' ');
        node = h('polygon', Object.assign({ points: pts }, common));
        ring = on ? h('polygon', { points: pts, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6', 'stroke-linejoin': 'round', 'pointer-events': 'none' }) : null;
      } else if (el.t === 'tree') {
        node = h('circle', Object.assign({ cx: X(el.x), cy: Y(el.y), r: Math.max(8, el.r * view.s) }, common));
        ring = on ? h('circle', { cx: X(el.x), cy: Y(el.y), r: Math.max(8, el.r * view.s) + 3, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 2.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none' }) : null;
      } else if (el.t === 'arrow') {
        node = h('line', Object.assign({ x1: X(el.x1), y1: Y(el.y1), x2: X(el.x2), y2: Y(el.y2), stroke: 'transparent', 'stroke-width': 18, 'stroke-linecap': 'round' }, common, { fill: 'none' }));
        ring = on ? h('line', { x1: X(el.x1), y1: Y(el.y1), x2: X(el.x2), y2: Y(el.y2), stroke: App.PAL.ink, 'stroke-width': 8, 'stroke-opacity': 0.18, 'stroke-linecap': 'round', 'pointer-events': 'none' }) : null;
      } else {
        node = h('rect', Object.assign({ x: X(el.x), y: Y(el.y), width: el.w * view.s, height: el.d * view.s }, common));
        ring = on ? h('rect', { x: X(el.x), y: Y(el.y), width: el.w * view.s, height: el.d * view.s, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6', 'pointer-events': 'none' }) : null;
      }
      hits.push(h('g', { key: 'k' + el.id, class: 'uitem' + (on ? ' sel' : '') }, ring, node, h('title', {}, TYPE_LABEL[el.t])));
    });
    const cur = step.els.find((e) => e.id === sel);
    if (cur && (cur.t === 'mass' || cur.t === 'void' || cur.t === 'green')) {
      const hs = 11;
      const bx = X(cur.x), by = Y(cur.y), bw = cur.w * view.s, bh = cur.d * view.s;
      hits.push(h('g', { key: 'handles', class: 'fhandles' },
        h('rect', { x: bx, y: by, width: bw, height: bh, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 1, 'stroke-opacity': 0.35, 'pointer-events': 'none' }),
        HANDLES.map((q) => h('rect', { key: q[0], class: 'fhandle', x: bx + q[1] * bw - hs / 2, y: by + q[2] * bh - hs / 2, width: hs, height: hs, rx: g ? 3 : 0, style: { cursor: q[3] }, onpointerdown: (e) => down(e, cur, view, q[0]) }))));
    }
    if (cur && cur.t === 'arrow') {
      hits.push(h('g', { key: 'ah', class: 'fhandles' },
        [['p1', cur.x1, cur.y1], ['p2', cur.x2, cur.y2]].map((q) => h('circle', { key: q[0], class: 'fhandle', cx: X(q[1]), cy: Y(q[2]), r: 7, style: { cursor: 'move' }, onpointerdown: (e) => down(e, cur, view, q[0]) }))));
    }
    return hits;
  }

  function stepStrip(state, u) {
    const c = ctl();
    return h('div', { class: 'ustrip', role: 'tablist', 'aria-label': 'Adımlar' },
      u.steps.map((s, i) => h('button', { key: s.id, type: 'button', role: 'tab', class: 'uchip' + (i === u.cur ? ' on' : ''), 'aria-selected': String(i === u.cur), onclick: () => c.unitGo(i), title: s.title + (s.sub ? ' · ' + s.sub : '') },
        h('b', { class: 'mono' }, String(i + 1)), h('span', {}, s.title))),
      h('button', { type: 'button', class: 'uchip uchip-add', onclick: () => c.unitStepAdd(false), disabled: u.steps.length >= 12, title: 'Bu adımın kopyasını ekle' }, ui.icon('plus', 14), h('span', {}, 'Adım ekle')));
  }

  bu.board = function (state, d) {
    const P = state.project;
    const u = P.unit;
    const v = state.ui.unit;
    const c = ctl();
    const sc = sceneOf(P, v, v.mode === 'plan' ? frozen : null);
    const plan = v.mode === 'plan';
    const step = curStep(u);
    const svg = h('svg', {
      id: 'pafta-birim', class: 'board-svg board-svg-birim', viewBox: '0 0 ' + App.sheet.W + ' ' + App.sheet.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': 'Birim oluşturucu paftası: ' + (plan ? 'plan' : v.mode === 'iso' ? 'izometrik' : 'süreç afişi') + ', adım ' + (u.cur + 1) + '/' + u.steps.length,
      ref: (el) => { bu.svgEl = el; }, onpointerdown: orbitDown, onpointermove: move, onpointerup: up, onpointercancel: up,
    }, sc.prims.map((p) => App.board.primToV(p)), plan ? h('g', { class: 'uhits' }, planHits(state, u, sc.view)) : null);
    const cur = plan ? step.els.find((e) => e.id === state.selectedId) : null;
    const empty = plan && u.steps.length === 1 && !step.els.length;
    const stage = h('div', { class: 'board-stage' + (plan ? '' : ' is-orbit') }, svg,
      cur ? h('div', { class: 'an-chip' }, h('b', {}, TYPE_LABEL[cur.t]),
        cur.t === 'mass' ? h('span', { class: 'mono' }, fmt(cur.w, 1) + ' × ' + fmt(cur.d, 1) + ' m · ' + cur.floors + ' kat') : null,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.dispatch({ type: 'SELECT', id: null }) }, ui.icon('close', 14))) : null,
      empty ? ui.emptyCard('Önce bir birim oluşturun', 'Parsel üzerine bir yapı kütlesi koyun; sonra “Adım ekle” ile onu adım adım şekillendirin. Hazır “Yoğunluk + Boşluk” akışıyla da başlayabilirsiniz.', [
        ui.btn('Kütle ekle', { icon: 'rect', cls: 'btn-primary', onclick: () => c.unitAdd('mass') }),
        ui.btn('Hazır akışı yükle', { icon: 'layers', onclick: () => c.unitPreset('tam') })]) : null);

    const hint = plan
      ? 'Öğeyi sürükleyin · tutamaçlarla boyutlandırın · komşu kenarlara yapışır (Alt: kapat) · R döndürür · Delete siler'
      : v.mode === 'iso' ? 'Sürükleyerek döndürün · adımlar arasında gezinmek için alttaki şeridi kullanın' : 'Süreç afişi: tüm adımlar aynı ölçekte yan yana · sürükleyerek döndürün';
    return ui.boardPage(state, d, {
      label: 'Birim oluşturucu paftası',
      stage: stage,
      scale: plan ? 'Plan ölçekli · ızgara 1 m' : v.mode === 'iso' ? 'İzometrik · adım ' + (u.cur + 1) : u.steps.length + ' adımlı süreç',
      foot: h('div', { class: 'ufoot' }, stepStrip(state, u), h('p', { class: 'board-hint' }, hint)),
      tools: [
        { k: 'seg', label: 'Pafta görünümü', value: v.mode, options: [{ v: 'plan', label: 'Plan' }, { v: 'iso', label: 'İzometrik' }, { v: 'surec', label: 'Süreç' }], onchange: (m) => c.unitMode(m) },
        { k: 'sep' },
        { k: 'btn', label: 'Adım ekle', icon: 'plus', strong: true, onclick: () => c.unitStepAdd(false), disabled: u.steps.length >= 12, title: 'Bu adımın kopyasını ekle; üzerinde değişiklik yap' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
        { k: 'icon', label: 'Birimi sıfırla', icon: 'reset', onclick: () => c.unitReset(), title: 'Tüm adımları sil, boş birimle başla' },
      ],
    });
  };

  /* kabuk için çağrılar */
  bu.sidebarOf = bu.sidebar;
})();
