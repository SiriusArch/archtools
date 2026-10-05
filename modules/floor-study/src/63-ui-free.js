/* ==========================================================================
   63-ui-free.js — Mekân Etüdü arayüzü: serbest düzen kipi
   Sol panel: kip, düzen araçları, seçili mekân (şekil, boyut, konum), mekân listesi, ilişkiler, bulgular.
   Pafta: ölçekli mekân çokgenleri (App.study.freeScene) üzerine etkileşim katmanı:
          sürükle = taşı · tutamaç = boyutlandır · kenarlara otomatik yapışır (Alt: kapat).
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
  const SHAPE_ICON = { rect: 'rect', L: 'shapeL', T: 'shapeT', U: 'shapeU' };
  const REL_LABEL = { strong: 'Güçlü', weak: 'Zayıf', avoid: 'Ayrı tut', none: 'Yok' };
  const STATE_TXT = { adjacent: 'Bitişik', near: 'Yakın', far: 'Uzak', overlap: 'Çakışık' };

  /* ---------------- ortak: kip anahtarı ---------------- */
  fl.modeSection = function (state) {
    const m = st.modeOf(state);
    return ui.section('Çalışma kipi', h('div', { class: 'sec-box' },
      ui.segmented({ label: 'Çalışma kipi', wide: true, value: m, options: [{ v: 'mekanlar', label: 'Mekânlar', title: 'Her mekân serbest şekil, boyut ve konumla' }, { v: 'katlar', label: 'Katlar', title: 'Mekânları katlara dağıt' }], onchange: (v) => ctl().stMode(v) }),
      h('p', { class: 'note' }, m === 'mekanlar'
        ? 'Her mekân ayrı bir birimdir: şeklini, boyutunu ve yerini değiştirin; diğer mekânlarla ilişkisini canlı izleyin.'
        : 'Mekânlar katlara dağıtılır, her kat için ölçekli plan bloğu üretilir.')), null, 'stmode');
  };

  /* ---------------- sol panel ---------------- */
  function numField(label, id, val, o) {
    return h('label', { class: 'nfld', for: id },
      h('span', { class: 'nfld-l' }, label),
      h('span', { class: 'nfld-c' },
        h('input', { id: id, class: 'inp mono nfld-i', type: 'number', min: o.min, max: o.max, step: o.step, value: val, keep: true, onchange: (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) o.onchange(v); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'unit' }, 'm')));
  }

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
        ui.btn('Otomatik diz', { icon: 'layout', cls: 'btn-yellow', onclick: () => ctl().freeAuto(), disabled: !P.spaces.length, title: 'İlişkilere göre tüm mekânları yeniden yerleştir (şekiller korunur)' }),
        ui.btn('Hedef alanlara oturt', { icon: 'target', onclick: () => ctl().freeFitAll(), disabled: !P.spaces.length, title: 'Her mekânı işlev şemasındaki m²’ye getir' })),
      ui.fld2('Izgara yakalama',
        ui.segmented({ label: 'Izgara yakalama', wide: true, value: free.snap, options: [{ v: 0.1, label: '0,1 m' }, { v: 0.5, label: '0,5 m' }, { v: 1, label: '1 m' }], onchange: (v) => ctl().freeSnap(v) }),
        'Taşıma ve boyutlandırma bu adımlarla yapılır; kenarlar komşu mekâna otomatik yapışır.'),
      ui.fld2('Yeni mekân ekle', h('div', { class: 'fr-add' },
        h('input', { id: 'fr-add-n', class: 'inp', type: 'text', maxlength: 60, placeholder: 'Mekân adı', 'aria-label': 'Yeni mekân adı', keep: true, onkeydown: (e) => { if (e.key === 'Enter') add(); } }),
        h('label', { class: 'area-wrap' }, h('span', { class: 'sr' }, 'Alan (m²)'), h('input', { id: 'fr-add-a', class: 'inp area-inp mono', type: 'number', min: 1, step: 1, value: 12, keep: true, onkeydown: (e) => { if (e.key === 'Enter') add(); } }), h('span', { class: 'unit' }, 'm²')),
        ui.btn('', { icon: 'plus', cls: 'btn-icon', onclick: add, title: 'Mekânı işlev şemasına ve bu düzene ekle' }))),
      P.spaces.length ? h('p', { class: 'note' }, fd.items.length + ' mekân · ' + fmt(m.total) + ' m² (program ' + fmt(m.target) + ' m²) · kaplama ' + fmt(fd.bounds.w, 1) + ' × ' + fmt(fd.bounds.h, 1) + ' m') : null), null, 'frlay');
  }

  function selectedSection(state, fd) {
    const it = fd.byId.get(state.selectedId);
    if (!it) return ui.section('Seçili mekân', h('p', { class: 'note' }, 'Düzenlemek için pafta üzerinde ya da listeden bir mekân seçin.'), null, 'frsel');
    const free = state.project.study.free;
    const snap = free.snap;
    const lock = !!state.ui.stLock;
    const set = (patch) => ctl().freeSet(it.id, patch);
    const step = snap;
    const setW = (v) => {
      if (lock) { const k = it.h / it.w; set({ w: v, h: Math.round(v * k * 10) / 10 }); } else set({ w: v });
    };
    const setH = (v) => {
      if (lock) { const k = it.w / it.h; set({ h: v, w: Math.round(v * k * 10) / 10 }); } else set({ h: v });
    };
    const devTxt = Math.abs(it.dev) < 0.005 ? 'hedefte' : (it.dev > 0 ? '+' : '−') + '%' + Math.round(Math.abs(it.dev) * 100);
    return ui.section('Seçili mekân', h('div', { class: 'sec-box' },
      ui.fld2('Ad', h('input', { id: 'fr-name', class: 'inp', type: 'text', maxlength: 60, value: it.name, keep: true, onchange: (e) => { if (e.target.value.trim()) ctl().dispatch({ type: 'UPDATE_SPACE', id: it.id, patch: { name: e.target.value.trim() } }); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
      ui.fld2('İşlev bölgesi', h('select', { id: 'fr-zone', class: 'inp', value: it.zone, onchange: (e) => ctl().dispatch({ type: 'UPDATE_SPACE', id: it.id, patch: { zone: e.target.value } }) }, App.ZONE_ORDER.map((z) => h('option', { key: z, value: z }, App.ZONES[z].label)))),
      ui.fld2('Şekil', h('div', { class: 'fr-shape' },
        ui.segmented({ label: 'Mekân şekli', wide: true, value: it.shape, options: st.SHAPES.map((s) => ({ v: s.v, title: s.label, label: h('span', { class: 'fr-ico' }, ui.icon(SHAPE_ICON[s.v], 18), h('span', { class: 'sr' }, s.label)) })), onchange: (v) => set({ shape: v }) }),
        ui.btn('90°', { icon: 'rotate', onclick: () => ctl().freeRotate(it.id), title: 'Şekli 90° döndür (R)', disabled: it.shape === 'rect' && Math.abs(it.w - it.h) < 0.05 }))),
      it.shape !== 'rect' ? ui.range({ id: 'fr-cut', label: 'Kesik oranı', min: 15, max: 65, step: 1, value: Math.round(it.cut * 100), text: '%' + Math.round(it.cut * 100), oninput: (v) => ctl().freeLive(it.id, { cut: v / 100 }), onchange: () => ctl().freeLiveEnd() }) : null,
      h('div', { class: 'nfld-grid' },
        numField('Genişlik', 'fr-w', it.w, { min: st.FREE_MIN, max: st.FREE_MAX, step: step, onchange: setW }),
        numField('Derinlik', 'fr-h', it.h, { min: st.FREE_MIN, max: st.FREE_MAX, step: step, onchange: setH }),
        numField('X', 'fr-x', it.x, { step: step, onchange: (v) => set({ x: v }) }),
        numField('Y', 'fr-y', it.y, { step: step, onchange: (v) => set({ y: v }) })),
      h('div', { class: 'tgl-row' }, ui.toggle({ label: 'En-boy oranını koru', on: lock, onclick: () => ctl().dispatch({ type: 'UI', patch: { stLock: !lock } }), title: 'Genişlik, derinlik ve köşe tutamaçları oranı korur' })),
      h('p', { class: 'fr-area' }, h('b', { class: 'mono' }, fmt(it.area, 1) + ' m²'), ' · hedef ', h('span', { class: 'mono' }, fmt(it.target, 1) + ' m²'), ' · ', h('span', { class: 'fr-dev' + (Math.abs(it.dev) > 0.15 ? ' warn' : '') }, devTxt)),
      h('div', { class: 'btn-row' },
        ui.btn('Hedef alana oturt', { icon: 'target', onclick: () => ctl().freeFit(it.id), disabled: Math.abs(it.dev) < 0.005 }),
        ui.btn('Alanı şemaya işle', { icon: 'check', onclick: () => ctl().freeAreaToSchema(it.id), disabled: Math.abs(it.dev) < 0.005, title: 'İşlev şemasındaki alan programını bu mekânın m²’sine eşitle' }),
        ui.btn('Sil', { icon: 'trash', onclick: () => ctl().freeRemove(it.id), title: 'Mekânı işlev şemasından da kaldırır' }))), null, 'frsel');
  }

  function listSection(state, fd) {
    const sel = state.selectedId;
    const ovl = new Set();
    fd.overlaps.forEach((o) => { ovl.add(o.a); ovl.add(o.b); });
    const rows = fd.items.map((it) => h('li', { key: it.id, id: 'mrow-' + it.id, class: 'row frow' + (sel === it.id ? ' sel' : '') },
      h('div', { class: 'row-main', onclick: () => ctl().dispatch({ type: 'SELECT', id: sel === it.id ? null : it.id }) },
        ui.zoneDot(it.zone),
        h('span', { class: 'row-name' }, it.name),
        ovl.has(it.id) ? h('span', { class: 'fr-bad', title: 'Başka bir mekânla çakışıyor' }, '!') : null,
        h('span', { class: 'frow-area mono' }, fmt(it.area) + ' m²'))));
    return ui.section('Mekânlar', fd.items.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'note' }, 'Henüz mekân yok. İşlev Şeması’nda ya da yukarıdan ekleyin.'), fd.items.length + ' mekân', 'frlist');
  }

  function relSection(state, fd) {
    const P = state.project;
    const it = fd.byId.get(state.selectedId);
    if (!it) {
      const bad = fd.pairs.filter((p) => p.ok < 1).sort((a, b) => a.ok - b.ok).slice(0, 6);
      const nm = (id) => fd.byId.get(id).name;
      return ui.section('İlişkiler', h('div', {},
        h('p', { class: 'note' }, fd.pairs.length ? 'Bir mekân seçerek diğer mekânlarla ilişkisini görün. Aşağıda en zayıf eşleşmeler:' : 'İşlev Şeması’nda ilişki tanımlayın; burada bitişik / yakın / uzak durumları görünür.'),
        bad.length ? h('ul', { class: 'rows' }, bad.map((p) => h('li', { key: p.key, class: 'row frel' }, h('div', { class: 'row-main', onclick: () => ctl().dispatch({ type: 'SELECT', id: p.a }) },
          h('span', { class: 'row-name' }, nm(p.a) + ' ↔ ' + nm(p.b)),
          h('span', { class: 'rel-chip rel-' + p.type }, REL_LABEL[p.type]),
          h('span', { class: 'frow-area mono' }, STATE_TXT[p.state] + (p.state === 'near' || p.state === 'far' ? ' · ' + fmt(p.gap, 1) + ' m' : '')))))) : null), fd.pairs.length + ' ilişki', 'frrel');
    }
    const list = st.freeRelationsOf(P, fd, it.id);
    const shown = list.filter((o) => o.type !== 'none').concat(list.filter((o) => o.type === 'none').slice(0, 6));
    const rows = shown.map((o) => h('li', { key: o.id, class: 'row frel' },
      h('div', { class: 'row-main', onclick: () => ctl().dispatch({ type: 'SELECT', id: o.id }) },
        ui.zoneDot(o.zone),
        h('span', { class: 'row-name' }, o.name),
        h('span', { class: 'frow-area mono' }, STATE_TXT[o.state] + (o.state === 'near' || o.state === 'far' ? ' · ' + fmt(o.gap, 1) + ' m' : ''))),
      h('div', { class: 'frel-act' },
        h('button', { type: 'button', class: 'rel-chip rel-' + o.type, title: 'İlişki türünü değiştir (işlev şemasıyla ortak)', onclick: () => ctl().dispatch({ type: 'CYCLE_RELATION', a: it.id, b: o.id }) }, REL_LABEL[o.type]),
        o.type !== 'none' && o.type !== 'avoid' && o.state !== 'adjacent' && o.state !== 'overlap'
          ? h('button', { type: 'button', class: 'icon-btn', title: it.name + ' → ' + o.name + ' yanına bitiştir', 'aria-label': it.name + ' mekânını ' + o.name + ' yanına bitiştir', onclick: () => ctl().freeAttach(it.id, o.id, false) }, ui.icon('link', 16))
          : null)));
    return ui.section('İlişkiler · ' + it.name, h('div', {}, h('ul', { class: 'rows' }, rows), h('p', { class: 'note' }, 'Türe tıklayarak güçlü / zayıf / ayrı tut arasında geçiş yapın; değişiklik İşlev Şeması’na da işlenir.')), shown.length + '/' + list.length, 'frrel');
  }

  fl.freeSidebar = function (state, d) {
    const P = state.project;
    const fd = st.freeDerive(P);
    const c = fd.findings.counts;
    const tab = state.ui.stTab === 'bulgular' ? 'bulgular' : 'mekanlar';
    const tabs = ui.tabsBar([
      { id: 'mekanlar', label: 'Mekânlar', n: P.spaces.length },
      { id: 'bulgular', label: 'Bulgular', n: c.hata + c.uyari + c.oneri, warn: c.hata + c.uyari > 0 },
    ], tab, (id) => ctl().dispatch({ type: 'UI', patch: { stTab: id } }));
    const body = tab === 'mekanlar'
      ? [fl.modeSection(state), layoutSection(state, fd), selectedSection(state, fd), listSection(state, fd), relSection(state, fd)]
      : [ui.findingList(fd.findings, 'Mekânların birbirine göre konumu, çakışma, alan uyumu ve oran kontrolü.')];
    return ui.sideShell('sb-kat', 'Mekân etüdü paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, fd) {
    const key = [fd, P.meta.name, App.theme.name, fl.frozen, App.sheet.W];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: st.freeScene(P, fd, { live: true, frozen: fl.frozen }) };
    return memo.v;
  }

  let gest = null;
  function toWorld(e, view) {
    const svg = fl.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [view.wx(q.x), view.wy(q.y)];
  }
  const snapTo = (v, s) => Math.round(Math.round(v / s) * s * 100) / 100;

  /* kenar yapışması: aday değerlerden toleransı aşmayan en yakınının farkı */
  function pull(vals, cands, tol) {
    let best = null;
    vals.forEach((v) => cands.forEach((c) => { const d = c - v; if (Math.abs(d) <= tol && (best == null || Math.abs(d) < Math.abs(best))) best = d; }));
    return best;
  }
  function magnetMove(r, others, tol) {
    const xs = [], ys = [];
    others.forEach((o) => {
      const yOv = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > -0.5, xOv = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > -0.5;
      if (yOv) { xs.push([[r.x], [o.x + o.w]]); xs.push([[r.x + r.w], [o.x]]); }
      xs.push([[r.x], [o.x]]); xs.push([[r.x + r.w], [o.x + o.w]]);
      if (xOv) { ys.push([[r.y], [o.y + o.h]]); ys.push([[r.y + r.h], [o.y]]); }
      ys.push([[r.y], [o.y]]); ys.push([[r.y + r.h], [o.y + o.h]]);
    });
    const best = (pairs) => { let b = null; pairs.forEach((p) => { const d = p[1][0] - p[0][0]; if (Math.abs(d) <= tol && (b == null || Math.abs(d) < Math.abs(b))) b = d; }); return b || 0; };
    return { dx: best(xs), dy: best(ys) };
  }

  function down(e, it, view, handle) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const w = toWorld(e, view);
    fl.frozen = view.win;
    gest = { id: it.id, handle: handle || null, sx: w[0], sy: w[1], cx: e.clientX, cy: e.clientY, orig: { x: it.x, y: it.y, w: it.w, h: it.h }, moved: false, view: view };
    try { fl.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    ctl().dispatch({ type: 'SELECT', id: it.id });
  }
  function move(e) {
    if (!gest) return;
    if (!gest.moved) {
      if (Math.hypot(e.clientX - gest.cx, e.clientY - gest.cy) < 3) return;
      gest.moved = true;
      ctl().freeLiveBegin();
    }
    const S = App.store.get();
    const fd = st.freeDerive(S.project);
    const snap = S.project.study.free.snap;
    const w = toWorld(e, gest.view);
    const dx = w[0] - gest.sx, dy = w[1] - gest.sy;
    const o = gest.orig;
    const others = fd.items.filter((q) => q.id !== gest.id);
    const tol = Math.max(0.3, 9 / gest.view.s);
    const mag = !e.altKey;
    if (!gest.handle) {
      let x = snapTo(o.x + dx, snap), y = snapTo(o.y + dy, snap);
      if (mag) { const m = magnetMove({ x: x, y: y, w: o.w, h: o.h }, others, tol); x = Math.round((x + m.dx) * 100) / 100; y = Math.round((y + m.dy) * 100) / 100; }
      ctl().freeLive(gest.id, { x: x, y: y });
      return;
    }
    const hd = gest.handle;
    let x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h;
    const edgeX = [], edgeY = [];
    others.forEach((q) => { edgeX.push(q.x, q.x + q.w); edgeY.push(q.y, q.y + q.h); });
    const adj = (v, edges) => { if (!mag) return v; const d = pull([v], edges, tol); return d == null ? v : v + d; };
    if (hd.indexOf('w') >= 0) x0 = adj(snapTo(o.x + dx, snap), edgeX);
    if (hd.indexOf('e') >= 0) x1 = adj(snapTo(o.x + o.w + dx, snap), edgeX);
    if (hd.indexOf('n') >= 0) y0 = adj(snapTo(o.y + dy, snap), edgeY);
    if (hd.indexOf('s') >= 0) y1 = adj(snapTo(o.y + o.h + dy, snap), edgeY);
    const MIN = st.FREE_MIN;
    if (x1 - x0 < MIN) { if (hd.indexOf('w') >= 0) x0 = x1 - MIN; else x1 = x0 + MIN; }
    if (y1 - y0 < MIN) { if (hd.indexOf('n') >= 0) y0 = y1 - MIN; else y1 = y0 + MIN; }
    if (S.ui.stLock && hd.length === 2) {
      const r = o.w / o.h;
      let nw = x1 - x0, nh = y1 - y0;
      if (Math.abs(nw / o.w - 1) >= Math.abs(nh / o.h - 1)) nh = nw / r; else nw = nh * r;
      if (hd.indexOf('w') >= 0) x0 = x1 - nw; else x1 = x0 + nw;
      if (hd.indexOf('n') >= 0) y0 = y1 - nh; else y1 = y0 + nh;
    }
    ctl().freeLive(gest.id, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  function up(e) {
    if (!gest) return;
    try { fl.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    const moved = gest.moved;
    gest = null;
    fl.frozen = null;
    ctl().freeLiveEnd();
    ctl().dispatch({ type: 'UI', patch: { stTick: ((App.store.get().ui.stTick) || 0) + 1 } });
    return moved;
  }

  const HANDLES = [['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'], ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize']];

  fl.freeBoard = function (state, d) {
    const P = state.project;
    const fd = st.freeDerive(P);
    const sc = sceneOf(P, fd);
    const view = sc.view;
    const sel = state.selectedId;
    const free = P.study.free;
    const g = App.theme.name === 'glass';
    const ptsOf = (it) => it.ring.map((q) => view.X(q[0]).toFixed(1) + ',' + view.Y(q[1]).toFixed(1)).join(' ');

    const hits = [];
    fd.items.slice().sort((a, b) => b.area - a.area).forEach((it) => {
      const on = sel === it.id;
      hits.push(h('g', { key: 'k' + it.id, class: 'fitem' + (on ? ' sel' : '') },
        on ? h('polygon', { class: 'sel-ring', points: ptsOf(it), fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6', 'stroke-linejoin': 'round', 'pointer-events': 'none' }) : null,
        h('polygon', {
          class: 'fitem-hit', points: ptsOf(it), fill: 'transparent', tabindex: 0, role: 'button',
          'aria-label': it.name + ', ' + fmt(it.area) + ' metrekare. Ok tuşları taşır, Ctrl ile ok tuşları boyutlandırır, R döndürür.',
          onpointerdown: (e) => down(e, it, view, null),
          onkeydown: (e) => {
            const sn = free.snap * (e.shiftKey ? 5 : 1);
            const k = e.key;
            const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (dirs[k]) {
              e.preventDefault();
              const dv = dirs[k];
              if (e.ctrlKey || e.metaKey) ctl().freeSet(it.id, { w: it.w + dv[0] * sn, h: it.h + dv[1] * sn });
              else ctl().freeSet(it.id, { x: it.x + dv[0] * sn, y: it.y + dv[1] * sn });
            } else if (k === 'r' || k === 'R') { e.preventDefault(); ctl().freeRotate(it.id); }
            else if (k === 'Enter' || k === ' ') { e.preventDefault(); ctl().dispatch({ type: 'SELECT', id: it.id }); }
          },
        }, h('title', {}, it.name + ' — ' + fmt(it.area) + ' m²'))));
    });
    const cur = sel ? fd.byId.get(sel) : null;
    if (cur) {
      const hs = 11;
      const bx = view.X(cur.x), by = view.Y(cur.y), bw = cur.w * view.s, bh = cur.h * view.s;
      hits.push(h('g', { key: 'handles', class: 'fhandles' },
        h('rect', { x: bx, y: by, width: bw, height: bh, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 1, 'stroke-opacity': 0.35, 'pointer-events': 'none' }),
        HANDLES.map((q) => h('rect', {
          key: q[0], class: 'fhandle', x: bx + q[1] * bw - hs / 2, y: by + q[2] * bh - hs / 2, width: hs, height: hs, rx: g ? 3 : 0,
          style: { cursor: q[3] }, onpointerdown: (e) => down(e, cur, view, q[0]),
        }))));
    }

    const svg = h('svg', {
      id: 'pafta-mekan', class: 'board-svg board-svg-mekan', viewBox: '0 0 ' + App.sheet.W + ' ' + App.sheet.H, preserveAspectRatio: 'xMidYMid meet', role: 'group',
      'aria-label': 'Mekân etüdü paftası: ' + fd.items.length + ' mekân, serbest düzen',
      ref: (el) => { fl.svgEl = el; }, onpointermove: move, onpointerup: up, onpointercancel: up,
      onpointerdown: () => { if (state.selectedId) ctl().dispatch({ type: 'SELECT', id: null }); },
    }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'fhits' }, hits));

    const empty = !P.spaces.length;
    const stage = h('div', { class: 'board-stage' }, svg,
      cur ? h('div', { class: 'an-chip' }, h('b', {}, cur.name), h('span', { class: 'mono' }, fmt(cur.w, 1) + ' × ' + fmt(cur.h, 1) + ' m · ' + fmt(cur.area, 1) + ' m²'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => ctl().dispatch({ type: 'SELECT', id: null }) }, ui.icon('close', 14))) : null,
      empty ? ui.emptyCard('Mekân etüdü için mekân gerekli', 'İşlev Şeması’nda mekân ekleyin, hazır bir bina programı yükleyin ya da sol panelden yeni mekân ekleyin.', [
        ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => ctl().loadTemplate('konut', '2+1') }),
        ui.btn('İşlev Şeması’na git', { icon: 'chevron', onclick: () => ctl().go('islev') })]) : null);

    return ui.boardPage(state, d, {
      label: 'Mekân etüdü paftası',
      stage: stage,
      scale: 'Mekânlar ölçekli · ızgara 1 m',
      foot: h('p', { class: 'board-hint' }, 'Mekânı sürükleyin · tutamaçlarla boyutlandırın · komşu kenarlara yapışır (Alt: yapışmayı kapat) · R döndürür'),
      tools: [
        { k: 'seg', label: 'Çalışma kipi', value: 'mekanlar', options: [{ v: 'mekanlar', label: 'Mekânlar' }, { v: 'katlar', label: 'Katlar' }], onchange: (v) => ctl().stMode(v) },
        { k: 'sep' },
        { k: 'btn', label: 'Otomatik diz', icon: 'layout', strong: true, onclick: () => ctl().freeAuto(), disabled: !P.spaces.length, title: 'İlişkilere göre mekânları yeniden yerleştir' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => ctl().dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => ctl().dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
        { k: 'sep' },
        { k: 'btn', label: 'DXF', icon: 'download', onclick: () => ctl().freeDxf(), disabled: !P.spaces.length || !!state.ui.busy, title: 'Mekânları katmanlı DXF (metre) olarak indir' },
      ],
    });
  };

  /* kip yönlendirmesi: eski kat arayüzü 'katlar' kipinde çalışır */
  const baseSidebar = fl.sidebar, baseBoard = fl.board;
  fl.sidebar = (state, d) => (st.modeOf(state) === 'katlar' ? baseSidebar(state, d) : fl.freeSidebar(state, d));
  fl.board = (state, d) => (st.modeOf(state) === 'katlar' ? baseBoard(state, d) : fl.freeBoard(state, d));
})();
