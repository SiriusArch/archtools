/* ==========================================================================
   78-ui-plan.js — Modül 10 arayüzü: Vaziyet Planı
   Sol panel: Çizim (araçlar · seçili öğe · başlangıç) · Sayfa (ölçek, stil, çıktı) · Liste (alanlar, öğeler).
   Pafta: ölçekli A3 vaziyet planı. Seç aracı: öğeyi sürükle, köşe tutamacını çek, ortadaki + ile köşe ekle,
   sağ tık / Alt+tık köşe siler, boş yeri sürükleyerek kaydır, tekerlekle ölçek değiştir.
   Çizim araçları: sürükleyerek dikdörtgen ya da köşeleri tıklayarak çokgen/çizgi; çift tık / Enter bitirir, Esc iptal eder.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const plan = App.plan;
  const G = plan.geo;
  const ctl = () => App.ctl;
  const pl = (ui.plan = {});
  const get = () => App.store.get();

  App.planDefaults = () => ({ tab: 'cizim', tool: 'select', draft: null, floors: 4, treeR: 3, stick: 0 });

  /* araç tanımları: poly (çokgen), line (çizgi), pt (tek tık) */
  const TOOLS = [
    { id: 'select', label: 'Seç', icon: 'target', hint: 'Öğeyi tıklayıp sürükleyin · köşe tutamaçlarını çekin · ortadaki + köşe ekler · sağ tık köşe siler · boş yeri sürükleyerek kaydırın · tekerlek ölçeği değiştirir' },
    { id: 'yeni', label: 'Yeni yapı', icon: 'rect', kind: 'poly', hint: 'Sürükleyerek dikdörtgen çizin ya da köşeleri tıklayın · çift tık veya Enter bitirir · Backspace son köşeyi siler · Esc iptal' },
    { id: 'mevcut', label: 'Mevcut', full: 'Mevcut yapı', icon: 'cube', kind: 'poly', hint: 'Çevredeki mevcut yapıyı çizin: sürükleyerek dikdörtgen ya da köşeleri tıklayarak · çift tık veya Enter bitirir' },
    { id: 'road', label: 'Yol', icon: 'draw', kind: 'line', hint: 'Yol eksenini noktalarla çizin · çift tık veya Enter bitirir · genişlik panelden ayarlanır' },
    { id: 'yaya', label: 'Yaya yolu', icon: 'link', kind: 'line', hint: 'Yaya yolu eksenini noktalarla çizin · çift tık veya Enter bitirir' },
    { id: 'green', label: 'Yeşil alan', icon: 'sun', kind: 'poly', hint: 'Sürükleyin ya da köşeleri tıklayın · köşeli çizilen yeşil alan yumuşatılmış olur' },
    { id: 'water', label: 'Su', icon: 'layers', kind: 'poly', hint: 'Su yüzeyini sürükleyin ya da köşeleri tıklayın' },
    { id: 'plaza', label: 'Meydan', icon: 'grid', kind: 'poly', hint: 'Meydan / sert zemini sürükleyin ya da köşeleri tıklayın' },
    { id: 'park', label: 'Otopark', icon: 'layout', kind: 'poly', hint: 'Otopark alanını sürükleyin ya da köşeleri tıklayın; park çizgileri otomatik eklenir' },
    { id: 'bound', label: 'Sınır', full: 'Proje sınırı', icon: 'parcel', kind: 'poly', hint: 'Parsel / proje sınırını çizin; TAKS, KAKS ve yeşil oranı buna göre hesaplanır' },
    { id: 'tree', label: 'Ağaç', icon: 'pin', kind: 'pt', hint: 'Tıklayarak ağaç dikin; yarıçap panelden ayarlanır' },
    { id: 'text', label: 'Yazı', icon: 'newdoc', kind: 'pt', hint: 'Yazının yerini tıklayın; metni panelden değiştirin' },
  ];
  const toolOf = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];
  const NAME = { bound: 'Proje sınırı', bld: 'Bina', road: 'Yol', green: 'Yeşil alan', water: 'Su', plaza: 'Meydan', park: 'Otopark', tree: 'Ağaç', text: 'Yazı' };
  const nameOf = (e) => (e.t === 'bld' ? (e.k === 'mevcut' ? 'Mevcut yapı' : 'Yeni yapı') : e.t === 'road' && e.k === 'yaya' ? 'Yaya yolu' : NAME[e.t]);
  const minPts = (tool) => (toolOf(tool).kind === 'line' ? 2 : 3);

  /* ---------------- yardımcılar ---------------- */
  function numField(label, id, val, o) {
    return h('label', { class: 'nfld', for: id },
      h('span', { class: 'nfld-l' }, label),
      h('span', { class: 'nfld-c' },
        h('input', { id: id, class: 'inp mono nfld-i', type: 'number', min: o.min, max: o.max, step: o.step, value: val, keep: true, onchange: (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) o.onchange(v); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'unit' }, o.unit || 'm')));
  }
  const areaOf = (e) => (e.pts && e.t !== 'road' ? G.area(e.pts) : 0);

  /* ---------------- sol panel ---------------- */
  function toolsSection(state) {
    const c = ctl();
    const cur = state.ui.plan.tool;
    return ui.section('Çizim araçları', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-grid ptools' }, TOOLS.map((t) => ui.btn(t.label, { icon: t.icon, cls: 'btn-tool ptool' + (cur === t.id ? ' on' : ''), pressed: cur === t.id, title: (t.full || t.label) + ' aracı', onclick: () => c.planTool(t.id) }))),
      h('p', { class: 'note' }, toolOf(cur).hint)), null, 'pl-tools');
  }

  function selectedSection(state, p) {
    const c = ctl();
    const el = p.els.find((e) => e.id === state.selectedId);
    if (!el) return ui.section('Seçili öğe', h('p', { class: 'note' }, 'Düzenlemek için pafta üzerinde ya da Liste sekmesinden bir öğe seçin.'), null, 'pl-sel');
    const set = (patch) => c.planSetEl(el.id, patch);
    const live = (patch) => c.planLive(el.id, patch);
    const tail = h('div', { class: 'btn-row' },
      ui.btn('Çoğalt', { icon: 'copy', onclick: () => c.planDup(el.id) }),
      ui.btn('Sil', { icon: 'trash', onclick: () => c.planDel(el.id) }));
    const order = h('div', { class: 'btn-row' },
      ui.btn('Öne al', { onclick: () => c.planOrder(el.id, 1), title: 'Aynı türdeki öğelerin önüne al' }),
      ui.btn('Arkaya al', { onclick: () => c.planOrder(el.id, -1) }));
    const smooth = h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Yumuşat', on: !!el.smooth, onclick: () => set({ smooth: !el.smooth }), title: 'Köşeleri eğri çizgiyle birleştir' }));
    const head = h('p', { class: 'fr-area' }, h('b', {}, nameOf(el)));
    let body = [];
    if (el.t === 'bld') {
      const a = areaOf(el);
      body = [
        ui.fld2('Tür', ui.segmented({ label: 'Yapı türü', wide: true, value: el.k, options: [{ v: 'yeni', label: 'Yeni' }, { v: 'mevcut', label: 'Mevcut' }], onchange: (v) => set({ k: v }) })),
        ui.fld2('Kat sayısı', ui.stepper({ label: 'Kat sayısı', value: el.floors, min: 1, max: 80, unit: 'kat', onchange: (v) => set({ floors: v }) }), 'Gölge uzunluğu kat sayısıyla büyür.'),
        h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(a, 1) + ' m²'), ' taban · ', h('span', { class: 'mono' }, fmt(a * el.floors) + ' m²'), ' toplam'),
        ui.btn('İçini Mekân Etüdü’nde aç', { icon: 'layout', cls: 'btn-yellow', onclick: () => c.freeLinkEl(el.id), title: 'Bu yapının içini mekân mekân tasarla; çevre (yollar, komşu yapılar, harita) etütte de görünür' }),
      ];
    } else if (el.t === 'road') {
      body = [
        ui.fld2('Tür', ui.segmented({ label: 'Yol türü', wide: true, value: el.k, options: plan.ROAD_KINDS.map((k) => ({ v: k.v, label: k.label })), onchange: (v) => set({ k: v, w: v === 'yaya' ? 2.5 : 8 }) })),
        ui.range({ id: 'pl-rw', label: 'Genişlik', min: 1, max: 30, step: 0.5, value: el.w, text: fmt(el.w, 1) + ' m', oninput: (v) => live({ w: v }), onchange: () => c.planLiveEnd() }),
        smooth,
        h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(G.polyLen(el.pts)) + ' m'), ' uzunluk'),
        ui.btn('Yol ağacı dik', { icon: 'pin', onclick: () => c.planRoadTrees(el.id), title: 'Yolun iki yanına sıralı ağaç ekle' }),
      ];
    } else if (el.t === 'green') {
      body = [
        ui.fld2('Tür', ui.segmented({ label: 'Yeşil alan türü', wide: true, value: el.k, options: [{ v: 'cim', label: 'Çim' }, { v: 'orman', label: 'Orman' }], onchange: (v) => set({ k: v }) })),
        smooth,
        h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(areaOf(el)) + ' m²')),
        ui.btn('Ağaç serp', { icon: 'spark', onclick: () => c.planScatter(el.id), title: 'Alanın içine rastgele ağaç ekle' }),
      ];
    } else if (el.t === 'water' || el.t === 'plaza') {
      body = [smooth, h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(areaOf(el)) + ' m²')), el.t === 'plaza' ? ui.btn('Ağaç serp', { icon: 'spark', onclick: () => c.planScatter(el.id) }) : null];
    } else if (el.t === 'park' || el.t === 'bound') {
      body = [h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(areaOf(el)) + ' m²')), el.t === 'bound' ? ui.btn('Ağaç serp', { icon: 'spark', onclick: () => c.planScatter(el.id), title: 'Parselin boş yerlerine ağaç ekle' }) : null];
    } else if (el.t === 'tree') {
      body = [
        ui.range({ id: 'pl-tr', label: 'Taç yarıçapı', min: 1, max: 12, step: 0.5, value: el.r, text: fmt(el.r, 1) + ' m', oninput: (v) => live({ r: v }), onchange: () => c.planLiveEnd() }),
        h('div', { class: 'nfld-grid' }, numField('X', 'pl-x', el.x, { step: p.snap, onchange: (v) => set({ x: v }) }), numField('Y', 'pl-y', el.y, { step: p.snap, onchange: (v) => set({ y: v }) })),
      ];
    } else if (el.t === 'text') {
      body = [
        ui.fld2('Metin', h('input', { id: 'pl-text', class: 'inp', type: 'text', maxlength: 80, value: el.s, keep: true, onchange: (e) => set({ s: e.target.value.trim() || 'Yazı' }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
        ui.range({ id: 'pl-ts', label: 'Boyut', min: 8, max: 48, step: 1, value: el.size, text: el.size + ' px', oninput: (v) => live({ size: v }), onchange: () => c.planLiveEnd() }),
      ];
    }
    return ui.section('Seçili öğe', h('div', { class: 'sec-box' }, head, body, el.t === 'tree' || el.t === 'text' ? null : order, tail), null, 'pl-sel');
  }

  function startSection(state, p) {
    const c = ctl();
    const P = state.project;
    const hasParcel = !!(P.site && P.site.parcel && P.site.parcel.length >= 3);
    const hasStudy = !!P.spaces.length;
    return ui.section('Başlangıç', h('div', { class: 'sec-box' },
      ui.btn('Örnek vaziyet', { icon: 'play', onclick: () => c.planSample(), title: 'Mahalle dokusu, yollar, yeşil alan ve proje parseliyle dolu örnek' }),
      ui.btn('Mekân Etüdü’nden al', { icon: 'cube', disabled: !hasStudy, onclick: () => c.planFromStudy(), title: hasStudy ? 'Modül 02’deki mekân düzenini tek yapı kütlesi olarak vaziyet planına aktar' : 'Önce Mekân Etüdü’nde mekân ekleyin' }),
      ui.btn('İmar parselinden al', { icon: 'parcel', disabled: !hasParcel, onclick: () => c.planFromImar(), title: hasParcel ? 'Modül 05’teki parseli ve kütle parçalarını aktar' : 'Önce Arsa / İmar modülünde bir parsel çizin' }),
      p.els.length ? ui.btn('Temizle', { icon: 'trash', onclick: () => c.planClear(), title: 'Tüm öğeleri sil (Geri al ile döndürülebilir)' }) : null,
      h('p', { class: 'note' }, 'Aktarılan öğeler üst üste eklenmez; mevcut çizimin yerini alır. Geri al ile dönebilirsiniz.')), null, 'pl-start');
  }

  function pageTab(state, p) {
    const c = ctl();
    const dxf = () => c.planDxf();
    return [
      ui.basemapSection(state, p.map, { key: 'plan', onSet: (patch, live) => c.dispatch({ type: live ? 'PLAN_SET_LIVE' : 'PLAN_SET', patch: { map: Object.assign({}, p.map, patch) } }) }),
      ui.section('Sayfa', h('div', { class: 'sec-box' },
        ui.fld2('Pafta başlığı', h('input', { id: 'pl-title', class: 'inp', type: 'text', maxlength: 60, placeholder: 'Örn. Vaziyet planı', value: p.title, keep: true, onchange: (e) => c.planSet({ title: e.target.value.trim() }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }), 'Boş bırakılırsa proje adı kullanılır.'),
        ui.fld2('Ölçek', ui.segmented({ label: 'Pafta ölçeği', wide: true, value: p.scale, options: plan.SCALES.map((s) => ({ v: s, label: '1/' + s })), onchange: (v) => c.planScale(v) }), 'A3 yatay: 1/1000’de pafta yaklaşık ' + fmt(plan.area().w / plan.pxPerM(1000)) + ' m genişliğindedir. Tekerlek de ölçeği değiştirir.'),
        h('div', { class: 'btn-row' }, ui.btn('Çizime sığdır', { icon: 'expand', onclick: () => c.planFit(), disabled: !p.els.length }))), null, 'pl-page'),
      ui.section('Görünüm', h('div', { class: 'sec-box' },
        ui.fld2('Stil', ui.segmented({ label: 'Çizim stili', wide: true, value: p.style, options: [{ v: 'auto', label: 'Tema' }, { v: 'sade', label: 'Sade' }, { v: 'renkli', label: 'Renkli' }], onchange: (v) => c.planSet({ style: v }) }), '“Tema” seçiliyken stil, uygulama temasına göre belirlenir.'),
        h('div', { class: 'tgl-row' },
          ui.toggle({ label: 'Gölgeler', on: p.shadow, onclick: () => c.planSet({ shadow: !p.shadow }) }),
          ui.toggle({ label: 'Izgara', on: p.grid, onclick: () => c.planSet({ grid: !p.grid }) }),
          ui.toggle({ label: 'Kat etiketi', on: p.labels, onclick: () => c.planSet({ labels: !p.labels }) })),
        ui.fld2('Yakalama', ui.segmented({ label: 'Izgara yakalama', wide: true, value: p.snap, options: [{ v: 0.5, label: '0,5 m' }, { v: 1, label: '1 m' }, { v: 2, label: '2 m' }, { v: 5, label: '5 m' }], onchange: (v) => c.planSet({ snap: v }) }), 'Çizim ve taşıma bu adımlarla yapılır; köşeler komşu köşelere yapışır (Alt: kapat).')), null, 'pl-look'),
      ui.section('Çıktı', h('div', { class: 'sec-box' },
        ui.btn('DXF olarak indir', { icon: 'download', onclick: dxf, disabled: !p.els.length, title: 'Gerçek koordinatlı (m) katmanlı DXF: AutoCAD, Rhino, Revit' }),
        h('p', { class: 'note' }, 'PNG ve PDF için üstteki Dışa aktar düğmesini kullanın. DXF’te her tür ayrı katmandır (YAPI_YENI, YAPI_MEVCUT, YOL, YESIL…).')), null, 'pl-out'),
    ];
  }

  function listTab(state, p) {
    const c = ctl();
    const M = plan.metrics(p);
    const sel = state.selectedId;
    const kv = (k, v) => h('div', {}, h('span', { class: 'kv-k' }, k), h('b', { class: 'kv-v mono' }, v));
    const rows = p.els.map((e, i) => {
      const nm = e.t === 'bld' ? e.floors + ' kat · ' + fmt(areaOf(e)) + ' m²' : e.t === 'road' ? fmt(G.polyLen(e.pts)) + ' m · ' + fmt(e.w, 1) + ' m' : e.t === 'tree' ? 'r ' + fmt(e.r, 1) + ' m' : e.t === 'text' ? e.s : fmt(areaOf(e)) + ' m²';
      return h('li', { key: e.id, id: 'prow-' + e.id, class: 'row frow' + (sel === e.id ? ' sel' : '') },
        h('div', { class: 'row-main', onclick: () => c.dispatch({ type: 'SELECT', id: sel === e.id ? null : e.id }) },
          h('span', { class: 'pkind pkind-' + e.t + (e.k ? ' pk-' + e.k : ''), 'aria-hidden': 'true' }),
          h('span', { class: 'row-name' }, nameOf(e) + ' ' + (p.els.slice(0, i + 1).filter((q) => nameOf(q) === nameOf(e)).length)),
          h('span', { class: 'frow-area mono' }, nm)));
    });
    const shown = rows.slice(0, 80);
    return [
      ui.section('Alan ve oranlar', h('div', { class: 'sec-box' },
        M.hasBound ? h('div', { class: 'kv-grid' },
          kv('Parsel', fmt(M.boundArea) + ' m²'), kv('Yeni taban', fmt(M.newFoot) + ' m²'),
          kv('Yeni inşaat', fmt(M.newGfa) + ' m²'), kv('En yüksek', M.maxFloors + ' kat'),
          kv('TAKS', fmt(M.taks, 2)), kv('KAKS', fmt(M.kaks, 2)),
          kv('Yeşil', fmt(M.green) + ' m²'), kv('Yeşil oranı', '%' + Math.round(M.greenShare * 100)),
          kv('Ağaç', String(M.trees)), kv('Otopark', fmt(M.park) + ' m²'))
          : h('p', { class: 'note' }, 'TAKS, KAKS ve yeşil oranı için “Proje sınırı” aracıyla parseli çizin. Sınırın içinde kalan yeni yapılar ve yeşil alanlar hesaba katılır.'),
        h('div', { class: 'kv-grid' }, kv('Yeni yapı', String(M.nNew)), kv('Mevcut yapı', String(M.nOld)), kv('Yol', fmt(M.roadLen) + ' m'), kv('Yaya yolu', fmt(M.pathLen) + ' m'))), null, 'pl-met'),
      ui.section('Öğeler', rows.length ? h('ul', { class: 'rows' }, shown) : h('p', { class: 'note' }, 'Henüz öğe yok. Çizim sekmesinden bir araç seçin ya da “Örnek vaziyet” ile başlayın.'), p.els.length + ' öğe' + (rows.length > 80 ? ' · ilk 80' : ''), 'pl-list'),
    ];
  }

  pl.sidebar = function (state, d) {
    const p = state.project.plan;
    const c = ctl();
    const tab = ['cizim', 'sayfa', 'liste'].indexOf(state.ui.plan.tab) >= 0 ? state.ui.plan.tab : 'cizim';
    const tabs = ui.tabsBar([
      { id: 'cizim', label: 'Çizim' },
      { id: 'sayfa', label: 'Sayfa', n: '1/' + p.scale },
      { id: 'liste', label: 'Liste', n: p.els.length },
    ], tab, (id) => c.planView({ tab: id }, true));
    let body;
    if (tab === 'cizim') body = [toolsSection(state), selectedSection(state, p), startSection(state, p)];
    else if (tab === 'sayfa') body = pageTab(state, p);
    else body = listTab(state, p);
    return ui.sideShell('sb-vaziyet', 'Vaziyet planı paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P) {
    const key = [P.plan, P.meta.name, App.theme.name, App.sheet.W];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: plan.scene(P.plan, { live: true }) };
    return memo.v;
  }

  let gest = null;
  pl.svgEl = null;
  function toSvg(e) {
    const svg = pl.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  const viewNow = () => plan.view(get().project.plan);
  const r2 = (v) => Math.round(v * 100) / 100;
  const gridSnap = (v, s) => r2(Math.round(v / s) * s);

  /* yakalama: önce komşu köşe (9 px), sonra ızgara */
  function snapPt(sx, sy, o) {
    const P = get().project.plan;
    const v = plan.view(P);
    const w = [v.wx(sx), v.wy(sy)];
    if (o && o.alt) return { p: [r2(w[0]), r2(w[1])], v: false };
    let best = null, bd = 10;
    const test = (q) => { const d = Math.hypot(v.X(q[0]) - sx, v.Y(q[1]) - sy); if (d < bd) { bd = d; best = q; } };
    P.els.forEach((e) => { if (e.pts && e.id !== (o && o.skip)) e.pts.forEach(test); });
    const dr = get().ui.plan.draft;
    if (dr) dr.pts.forEach(test);
    if (best) return { p: [best[0], best[1]], v: true };
    return { p: [gridSnap(w[0], P.snap), gridSnap(w[1], P.snap)], v: false };
  }

  function makeEl(tool, pts, rect) {
    const f = get().ui.plan;
    if (tool === 'yeni') return plan.make.bld(pts, { k: 'yeni', floors: f.floors || 4 });
    if (tool === 'mevcut') return plan.make.bld(pts, { k: 'mevcut', floors: 3 });
    if (tool === 'road') return plan.make.road(pts, { k: 'arac', w: 8 });
    if (tool === 'yaya') return plan.make.road(pts, { k: 'yaya', w: 2.5 });
    if (tool === 'green') return plan.make.green(pts, { smooth: !rect });
    if (tool === 'water') return plan.make.water(pts, { smooth: !rect });
    if (tool === 'plaza') return plan.make.plaza(pts);
    if (tool === 'park') return plan.make.park(pts);
    if (tool === 'bound') return plan.make.bound(pts);
    return null;
  }

  function overlayEls() {
    const q = (id) => document.getElementById(id);
    return { rub: q('pd-rub'), rect: q('pd-rect'), cur: q('pd-cur') };
  }
  function showRub(pts) {
    const o = overlayEls();
    if (o.rub) o.rub.setAttribute('points', pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' '));
  }
  function hideAll() {
    const o = overlayEls();
    if (o.rub) o.rub.setAttribute('points', '');
    if (o.rect) o.rect.setAttribute('visibility', 'hidden');
    if (o.cur) o.cur.setAttribute('visibility', 'hidden');
  }

  function drawDown(e) {
    const st = get().ui.plan;
    const t = toolOf(st.tool);
    const s = toSvg(e);
    const v = viewNow();
    const sn = snapPt(s.x, s.y, { alt: e.altKey });
    if (t.kind === 'pt') {
      e.preventDefault();
      if (t.id === 'tree') ctl().planAdd(plan.make.tree(sn.p[0], sn.p[1], st.treeR || 3));
      else {
        ctl().planAdd(plan.make.text(sn.p[0], sn.p[1], 'Yazı'));
        ctl().planTool('select');
        setTimeout(() => { const i = document.getElementById('pl-text'); if (i) { i.focus(); i.select(); } }, 90);
      }
      return;
    }
    gest = { t: 'draw', sx: s.x, sy: s.y, start: sn.p, moved: false, view: v, pid: e.pointerId };
    try { pl.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }

  function selectBgDown(e) {
    const s = toSvg(e);
    const P = get().project.plan;
    gest = { t: 'pan', sx: s.x, sy: s.y, cx: P.cx, cy: P.cy, ppm: plan.pxPerM(P.scale), moved: false, pid: e.pointerId, cX: e.clientX, cY: e.clientY };
    try { pl.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }

  function svgDown(e) {
    const st = get().ui.plan;
    if (e.pointerType === 'mouse' && e.button === 2) return;
    if (e.pointerType === 'mouse' && e.button === 1) { e.preventDefault(); selectBgDown(e); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (st.tool !== 'select') { drawDown(e); return; }
    if (get().selectedId) ctl().dispatch({ type: 'SELECT', id: null });
    selectBgDown(e);
  }

  function elDown(e, el) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (get().ui.plan.tool !== 'select') return; // çizim araçlarında olay svg'ye düşer
    e.stopPropagation(); e.preventDefault();
    const s = toSvg(e);
    gest = { t: 'move', id: el.id, sx: s.x, sy: s.y, orig: el, moved: false, cX: e.clientX, cY: e.clientY, view: viewNow() };
    try { pl.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    ctl().dispatch({ type: 'SELECT', id: el.id });
  }

  function vtxDown(e, el, i, insert) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const s = toSvg(e);
    if (!insert && e.altKey) { deleteVertex(el, i); return; }
    gest = { t: 'vtx', id: el.id, i: i, orig: el, moved: false, cX: e.clientX, cY: e.clientY, view: viewNow(), insert: insert || null, sx: s.x, sy: s.y };
    try { pl.svgEl.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  }
  function deleteVertex(el, i) {
    const min = el.t === 'road' ? 2 : 3;
    if (!el.pts || el.pts.length <= min) { ctl().toast(nameOf(el) + ' için en az ' + min + ' köşe gerekir.', 'error'); return; }
    ctl().planSetEl(el.id, { pts: el.pts.filter((q, k) => k !== i) });
  }

  function svgMove(e) {
    if (!gest) {
      const st = get().ui.plan;
      const t = toolOf(st.tool);
      if (t.id === 'select' || t.kind === 'pt') { if (t.kind === 'pt') cursorOnly(e); return; }
      cursorOnly(e);
      if (st.draft && st.draft.pts.length) {
        const v = viewNow();
        const s = toSvg(e);
        const sn = snapPt(s.x, s.y, { alt: e.altKey });
        const pts = st.draft.pts.map((q) => [v.X(q[0]), v.Y(q[1])]);
        pts.push([v.X(sn.p[0]), v.Y(sn.p[1])]);
        showRub(pts);
      }
      return;
    }
    const s = toSvg(e);
    if (gest.t === 'pan') {
      if (!gest.moved && Math.hypot(e.clientX - gest.cX, e.clientY - gest.cY) < 3) return;
      gest.moved = true;
      ctl().planVp({ cx: gest.cx - (s.x - gest.sx) / gest.ppm, cy: gest.cy - (s.y - gest.sy) / gest.ppm });
      return;
    }
    if (gest.t === 'draw') {
      const st = get().ui.plan;
      const t = toolOf(st.tool);
      const o = overlayEls();
      if (!gest.moved && Math.hypot(s.x - gest.sx, s.y - gest.sy) < 7) return;
      gest.moved = true;
      const hasDraft = st.draft && st.draft.pts.length;
      if (t.kind === 'poly' && !hasDraft) {
        const sn = snapPt(s.x, s.y, { alt: e.altKey });
        const v = gest.view;
        const x0 = Math.min(v.X(gest.start[0]), v.X(sn.p[0])), y0 = Math.min(v.Y(gest.start[1]), v.Y(sn.p[1]));
        const w = Math.abs(v.X(sn.p[0]) - v.X(gest.start[0])), hh = Math.abs(v.Y(sn.p[1]) - v.Y(gest.start[1]));
        if (o.rect) { o.rect.setAttribute('x', x0); o.rect.setAttribute('y', y0); o.rect.setAttribute('width', w); o.rect.setAttribute('height', hh); o.rect.setAttribute('visibility', 'visible'); }
        gest.end = sn.p;
      }
      return;
    }
    if (gest.t === 'move') {
      if (!gest.moved) {
        if (Math.hypot(e.clientX - gest.cX, e.clientY - gest.cY) < 3) return;
        gest.moved = true;
        ctl().planLiveBegin();
      }
      const P = get().project.plan;
      const ppm = gest.view.ppm;
      let dx = (s.x - gest.sx) / ppm, dy = (s.y - gest.sy) / ppm;
      if (!e.altKey) { dx = gridSnap(dx, P.snap); dy = gridSnap(dy, P.snap); }
      ctl().planLive(gest.id, plan.moveEl(gest.orig, dx, dy));
      return;
    }
    if (gest.t === 'vtx') {
      if (!gest.moved) {
        if (Math.hypot(e.clientX - gest.cX, e.clientY - gest.cY) < 3) return;
        gest.moved = true;
        ctl().planLiveBegin();
        if (gest.insert) {
          const pts = gest.orig.pts.slice();
          pts.splice(gest.i, 0, gest.insert);
          gest.orig = Object.assign({}, gest.orig, { pts: pts });
          ctl().planLive(gest.id, { pts: pts });
        }
      }
      const sn = snapPt(s.x, s.y, { alt: e.altKey, skip: gest.id });
      const cur = get().project.plan.els.find((q) => q.id === gest.id);
      if (!cur) return;
      const pts = cur.pts.slice();
      pts[gest.i] = sn.p;
      ctl().planLive(gest.id, { pts: pts });
    }
  }

  function cursorOnly(e) {
    const o = overlayEls();
    if (!o.cur) return;
    const s = toSvg(e);
    const v = viewNow();
    const sn = snapPt(s.x, s.y, { alt: e.altKey });
    o.cur.setAttribute('cx', v.X(sn.p[0])); o.cur.setAttribute('cy', v.Y(sn.p[1]));
    o.cur.setAttribute('r', sn.v ? 7 : 4);
    o.cur.setAttribute('visibility', 'visible');
  }

  function addDraftPt(tool, p) {
    const st = get().ui.plan;
    const pts = st.draft && st.draft.tool === tool ? st.draft.pts : [];
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.01) return;
    ctl().planView({ draft: { tool: tool, pts: pts.concat([p]) } }, true);
  }

  function svgUp(e) {
    const g = gest;
    if (!g) return;
    gest = null;
    try { pl.svgEl.releasePointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    if (g.t === 'pan') { return; }
    if (g.t === 'move' || g.t === 'vtx') { ctl().planLiveEnd(); return; }
    if (g.t === 'draw') {
      const st = get().ui.plan;
      const t = toolOf(st.tool);
      hideAll();
      const hasDraft = st.draft && st.draft.pts.length;
      if (g.moved && t.kind === 'poly' && !hasDraft && g.end) {
        const a = g.start, b = g.end;
        if (Math.abs(a[0] - b[0]) > 0.4 && Math.abs(a[1] - b[1]) > 0.4) {
          const el = makeEl(t.id, G.rectPts(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])), true);
          if (el) ctl().planAdd(el);
        }
        return;
      }
      const s = toSvg(e);
      const sn = snapPt(s.x, s.y, { alt: e.altKey });
      // ilk köşeye tıklamak çokgeni kapatır
      if (hasDraft && st.draft.pts.length >= 3 && t.kind === 'poly') {
        const f = st.draft.pts[0];
        if (Math.hypot(g.view.X(f[0]) - s.x, g.view.Y(f[1]) - s.y) < 11) { finishDraft(); return; }
      }
      addDraftPt(t.id, sn.p);
    }
  }

  function finishDraft() {
    const st = get().ui.plan;
    const d = st.draft;
    if (!d) return;
    if (d.pts.length < minPts(d.tool)) { ctl().toast((toolOf(d.tool).full || toolOf(d.tool).label) + ' için en az ' + minPts(d.tool) + ' nokta gerekir.', 'error'); return; }
    const el = makeEl(d.tool, d.pts, false);
    ctl().planView({ draft: null }, true);
    hideAll();
    if (el) ctl().planAdd(el);
  }
  pl.finishDraft = finishDraft;

  /* tekerlek: imleç altındaki nokta sabit kalacak şekilde ölçek değiştir */
  let wheelAt = 0;
  function svgWheel(e) {
    e.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 220) return;
    const P = get().project.plan;
    const i = plan.SCALES.indexOf(P.scale);
    const j = U.clamp(i + (e.deltaY > 0 ? 1 : -1), 0, plan.SCALES.length - 1);
    if (j === i) return;
    wheelAt = now;
    const s = toSvg(e);
    const v = plan.view(P);
    const wx = v.wx(s.x), wy = v.wy(s.y);
    const a = v.area, ppm2 = plan.pxPerM(plan.SCALES[j]);
    ctl().planVp({ scale: plan.SCALES[j], cx: wx - (s.x - a.x - a.w / 2) / ppm2, cy: wy - (s.y - a.y - a.h / 2) / ppm2 });
  }

  /* klavye (yalnızca bu modülde, yazı alanı odakta değilken) */
  document.addEventListener('keydown', function (e) {
    const S = get();
    if (S.ui.module !== 'vaziyet') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    const st = S.ui.plan;
    const c = ctl();
    if (e.key === 'Enter' && st.draft) { e.preventDefault(); finishDraft(); }
    else if (e.key === 'Escape') {
      if (st.draft) { c.planView({ draft: null }, true); hideAll(); }
      else if (S.selectedId) c.dispatch({ type: 'SELECT', id: null });
      else if (st.tool !== 'select') c.planTool('select');
    } else if (e.key === 'Backspace' && st.draft) { e.preventDefault(); const pts = st.draft.pts.slice(0, -1); c.planView({ draft: pts.length ? { tool: st.draft.tool, pts: pts } : null }, true); hideAll(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedId && st.tool === 'select') { e.preventDefault(); c.planDel(S.selectedId); }
    else if (S.selectedId && st.tool === 'select' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      const el = S.project.plan.els.find((q) => q.id === S.selectedId);
      if (!el) return;
      e.preventDefault();
      const sn = S.project.plan.snap * (e.shiftKey ? 5 : 1);
      const dv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      c.planSetEl(el.id, plan.moveEl(el, dv[0] * sn, dv[1] * sn));
    }
  });

  /* seçim katmanı: öğelerin üzerindeki görünmez hedefler, seçili öğenin tutamaçları */
  const HIT_ORDER = ['water', 'green', 'plaza', 'park', 'road', 'bld', 'bound', 'tree', 'text'];
  function hitsLayer(state, P, view) {
    const sel = state.selectedId;
    const X = view.X, Y = view.Y;
    const out = [];
    const px = (el) => el.pts.map((q) => [X(q[0]), Y(q[1])]);
    const base = (el) => ({ key: 'h' + el.id, class: 'phit', fill: 'transparent', onpointerdown: (e) => elDown(e, el) });
    const els = P.els.slice().sort((a, b) => HIT_ORDER.indexOf(a.t) - HIT_ORDER.indexOf(b.t) || 0);
    els.forEach((el) => {
      let node;
      if (el.t === 'tree') node = h('circle', Object.assign(base(el), { cx: X(el.x), cy: Y(el.y), r: Math.max(8, el.r * view.ppm) }));
      else if (el.t === 'text') node = h('rect', Object.assign(base(el), { x: X(el.x) - Math.max(20, el.s.length * el.size * 0.32), y: Y(el.y) - el.size * 0.7, width: Math.max(40, el.s.length * el.size * 0.64), height: el.size * 1.3 }));
      else if (el.t === 'road') node = h('path', Object.assign(base(el), { d: el.smooth ? plan.smoothPath(px(el), false) : plan.linePath(px(el), false), fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(16, el.w * view.ppm), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      else if (el.t === 'bound') node = h('path', Object.assign(base(el), { d: plan.linePath(px(el), true), fill: 'none', stroke: 'transparent', 'stroke-width': 14 }));
      else node = h('path', Object.assign(base(el), { d: el.smooth && (el.t === 'green' || el.t === 'water' || el.t === 'plaza') ? plan.smoothPath(px(el), true) : plan.linePath(px(el), true) }));
      out.push(node);
    });
    const el = P.els.find((e) => e.id === sel);
    if (el) {
      const ink = App.PAL.ink;
      if (el.pts) {
        const pp = px(el);
        const closed = el.t !== 'road';
        out.push(h('path', { key: 'selring', d: plan.linePath(pp, closed), fill: 'none', stroke: ink, 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
        const n = pp.length;
        const segs = closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
          const a = pp[i], b = pp[(i + 1) % n];
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 26) continue;
          const mp = [(el.pts[i][0] + el.pts[(i + 1) % n][0]) / 2, (el.pts[i][1] + el.pts[(i + 1) % n][1]) / 2];
          out.push(h('circle', { key: 'mid' + i, class: 'pmid', cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, r: 4.5, onpointerdown: (e) => vtxDown(e, el, i + 1, [r2(mp[0]), r2(mp[1])]) }));
        }
        pp.forEach((q, i) => out.push(h('circle', { key: 'v' + i, class: 'pvtx', cx: q[0], cy: q[1], r: 6.5, onpointerdown: (e) => vtxDown(e, el, i), oncontextmenu: (e) => { e.preventDefault(); deleteVertex(el, i); } })));
      } else if (el.t === 'tree') {
        out.push(h('circle', { key: 'selring', cx: X(el.x), cy: Y(el.y), r: Math.max(8, el.r * view.ppm) + 3, fill: 'none', stroke: ink, 'stroke-width': 2.2, 'stroke-dasharray': '5 4', 'pointer-events': 'none' }));
      } else if (el.t === 'text') {
        const w = Math.max(40, el.s.length * el.size * 0.64);
        out.push(h('rect', { key: 'selring', x: X(el.x) - w / 2 - 4, y: Y(el.y) - el.size * 0.7, width: w + 8, height: el.size * 1.3, fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'pointer-events': 'none' }));
      }
    }
    return out;
  }

  function draftLayer(state, view) {
    const dr = state.ui.plan.draft;
    const out = [];
    const ink = App.PAL.ink;
    if (dr && dr.pts.length) {
      const pp = dr.pts.map((q) => [view.X(q[0]), view.Y(q[1])]);
      out.push(h('polyline', { key: 'dl', points: pp.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' '), fill: 'none', stroke: ink, 'stroke-width': 2.4, 'pointer-events': 'none' }));
      pp.forEach((q, i) => out.push(h('circle', { key: 'dp' + i, cx: q[0], cy: q[1], r: i === 0 && pp.length >= 3 && toolOf(dr.tool).kind === 'poly' ? 7 : 4, fill: i === 0 ? App.PAL.yellow : '#fff', stroke: ink, 'stroke-width': 2, 'pointer-events': 'none' })));
    }
    out.push(h('polyline', { key: 'rub', id: 'pd-rub', points: '', fill: 'none', stroke: ink, 'stroke-width': 1.8, 'stroke-dasharray': '6 5', 'pointer-events': 'none' }));
    out.push(h('rect', { key: 'rct', id: 'pd-rect', x: 0, y: 0, width: 0, height: 0, fill: 'rgba(0,0,0,.06)', stroke: ink, 'stroke-width': 1.8, 'stroke-dasharray': '6 5', visibility: 'hidden', 'pointer-events': 'none' }));
    out.push(h('circle', { key: 'cur', id: 'pd-cur', cx: 0, cy: 0, r: 4, fill: 'none', stroke: ink, 'stroke-width': 1.8, visibility: 'hidden', 'pointer-events': 'none' }));
    return out;
  }

  pl.board = function (state, d) {
    const P = state.project;
    const p = P.plan;
    const st = state.ui.plan;
    const c = ctl();
    const sc = sceneOf(P);
    const t = toolOf(st.tool);
    const dr = st.draft;
    const sel = p.els.find((e) => e.id === state.selectedId);
    const svg = h('svg', {
      id: 'pafta-vaziyet', class: 'board-svg board-svg-plan tool-' + st.tool, viewBox: '0 0 ' + App.sheet.W + ' ' + App.sheet.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': 'Vaziyet planı paftası, ölçek 1/' + p.scale + ', ' + p.els.length + ' öğe',
      ref: (el) => { pl.svgEl = el; }, onpointerdown: svgDown, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp, onwheel: svgWheel, ondblclick: () => { if (get().ui.plan.draft) finishDraft(); }, oncontextmenu: (e) => e.preventDefault(),
    }, sc.prims.map((q) => App.board.primToV(q)),
    h('g', { class: 'phits' }, st.tool === 'select' ? hitsLayer(state, p, sc.view) : null),
    h('g', { class: 'pdraft' }, draftLayer(state, sc.view)));
    const empty = !p.els.length && !dr;
    const chipTxt = t.id === 'select' ? null : (t.full || t.label);
    const stage = h('div', { class: 'board-stage' }, svg,
      chipTxt ? h('div', { class: 'pl-chip' }, h('b', {}, chipTxt + (dr ? ' · ' + dr.pts.length + ' nokta' : '')),
        dr && dr.pts.length >= minPts(dr.tool) ? h('button', { type: 'button', class: 'btn btn-yellow pl-fin', onclick: finishDraft }, 'Bitir') : null,
        dr ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Çizimi iptal et', title: 'İptal (Esc)', onclick: () => { c.planView({ draft: null }, true); hideAll(); } }, ui.icon('close', 14)) : h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seç aracına dön', title: 'Seç aracına dön (Esc)', onclick: () => c.planTool('select') }, ui.icon('close', 14)))
        : (sel ? h('div', { class: 'pl-chip' }, h('b', {}, nameOf(sel)),
          sel.t === 'bld' ? h('span', { class: 'mono' }, fmt(areaOf(sel)) + ' m² · ' + sel.floors + ' kat') : sel.t === 'road' ? h('span', { class: 'mono' }, fmt(G.polyLen(sel.pts)) + ' m · ' + fmt(sel.w, 1) + ' m') : sel.pts && sel.t !== 'road' ? h('span', { class: 'mono' }, fmt(areaOf(sel)) + ' m²') : null,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.dispatch({ type: 'SELECT', id: null }) }, ui.icon('close', 14))) : null),
      empty ? ui.emptyCard('Önce bir vaziyet çizin', 'Soldan bir araç seçip paftada çizin ya da hazır bir başlangıçla ilerleyin: örnek mahalle, Mekân Etüdü’ndeki düzeniniz ya da İmar modülündeki parseliniz.', [
        ui.btn('Örnek vaziyet', { icon: 'play', cls: 'btn-primary', onclick: () => c.planSample() }),
        ui.btn('Yeni yapı çiz', { icon: 'rect', onclick: () => c.planTool('yeni') })]) : null);

    return ui.boardPage(state, d, {
      label: 'Vaziyet planı paftası',
      stage: stage,
      scale: 'Ölçek 1/' + p.scale + ' · A3 · 1 cm = ' + fmt(p.scale / 100, p.scale < 500 ? 1 : 0) + ' m',
      foot: h('p', { class: 'board-hint' }, t.hint),
      tools: [
        { k: 'seg', label: 'Pafta ölçeği', value: p.scale, options: plan.SCALES.map((s) => ({ v: s, label: '1/' + s })), onchange: (v) => c.planScale(v) },
        { k: 'sep' },
        { k: 'btn', label: 'Sığdır', icon: 'expand', onclick: () => c.planFit(), disabled: !p.els.length, title: 'Çizimi pafta ortasına ve uygun ölçeğe getir' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ],
    });
  };
})();
