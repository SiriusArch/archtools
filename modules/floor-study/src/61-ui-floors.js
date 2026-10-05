/* ==========================================================================
   61-ui-floors.js — Modül 2 arayüzü: Mekân Etüdü · kat kipi (mekânlar katlara dağıtılır)
   Sol panel: kat kurgusu + katlara göre mekân listeleri + bulgular.
   Pafta: ölçekli kat planları (App.study.scene) üzerine görünmez etkileşim katmanı;
          bir mekân bloğu başka bir kata sürüklenebilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const st = App.study;

  const ctl = () => App.ctl;
  const fl = (ui.floors = {});
  let drag = null;

  /* ---------------- sol panel ---------------- */
  /* plan alternatifleri galerisi: küçük resimler aynı kat atamasıyla farklı düzen ve oranlar */
  function altView(state, sd) {
    const P = state.project, S = P.study;
    const list = st.alternatives(P);
    if (!list.length) return null;
    const g = App.theme.name === 'glass';
    const cards = list.map((a, i) => {
      // en dolu katı göster
      const fl0 = a.plan.floors.reduce((m, f) => (f.net > m.net ? f : m), a.plan.floors[0]);
      const cur = S.typology === a.typology && Math.abs((S.ratio || 1.5) - a.ratio) < 0.01;
      const W = a.plan.Wp, D = a.plan.Dp;
      const rects = fl0.blocks.map((b) => {
        const z = App.ZONES[b.zone] || App.ZONES.sosyal;
        return h('rect', { key: b.id, x: b.x, y: b.y, width: b.w, height: b.h, fill: z.fill, stroke: App.PAL.ink, 'stroke-width': Math.max(W, D) / 160, 'stroke-opacity': 0.8 });
      });
      return h('li', { key: i, class: 'altc' + (cur ? ' on' : '') },
        h('button', { type: 'button', class: 'altc-b', 'aria-pressed': String(cur), title: (a.typology === 'koridor' ? 'Orta koridor' : 'Serbest') + ' · 1 : ' + fmt(a.ratio, 2) + ' — uygula', onclick: () => ctl().studySet({ typology: a.typology, ratio: a.ratio }) },
          h('svg', { class: 'altc-svg', viewBox: '-0.5 -0.5 ' + (W + 1) + ' ' + (D + 1), role: 'img', 'aria-label': 'Plan küçük resmi' }, h('rect', { x: 0, y: 0, width: W, height: D, fill: 'none', stroke: App.PAL.ink, 'stroke-width': Math.max(W, D) / 90 }), rects),
          h('span', { class: 'altc-t' }, (a.typology === 'koridor' ? 'Koridor' : 'Serbest') + ' · 1 : ' + fmt(a.ratio, 1)),
          h('span', { class: 'altc-s mono' }, (a.score == null ? '—' : '%' + a.score) + ' · ' + fmt(W, 0) + '×' + fmt(D, 0) + ' m'),
          a.best ? h('span', { class: 'altc-best' }, 'en iyi') : null,
          a.thin ? h('span', { class: 'altc-w' }, a.thin + ' dar mekân') : null));
    });
    return ui.section('Plan alternatifleri', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Aynı kat ataması için düzen ve plak oranı seçenekleri; skor ilişki, kat dengesi ve ıslak hacim hizasından gelir. Birine tıklayarak uygulayın.'),
      h('ul', { class: 'altc-grid' }, cards)), list.length + ' seçenek', 'stalt');
  }

  function setupView(state, sd) {
    const P = state.project;
    const S = P.study;
    const n = S.floors.length;
    const plan = sd.plan;
    const sug = st.suggestCount(P);
    const single = n === 1;
    return ui.section('Kat kurgusu', h('div', { class: 'sec-box' },
      ui.fld2('Kat sayısı',
        ui.stepper({ label: 'Kat sayısı', value: n, min: 1, max: 6, unit: n === 1 ? 'kat' : 'kat', onchange: (v) => ctl().studyFloors(v) }),
        P.spaces.length ? (sug !== n ? 'Program büyüklüğüne göre önerilen: ' + sug + ' kat' : 'Program büyüklüğüne uygun kat sayısı') : null),
      ui.fld2('Yerleşim düzeni',
        ui.segmented({ label: 'Yerleşim düzeni', wide: true, value: S.typology, options: [{ v: 'serbest', label: 'Serbest' }, { v: 'koridor', label: 'Orta koridor' }], onchange: (v) => ctl().studySet({ typology: v }) }),
        S.typology === 'koridor' ? 'Mekânlar 1,5 m’lik orta koridorun iki yanına dizilir.' : 'Mekânlar işlev şemasındaki konumlarına göre dizilir.'),
      ui.range({
        id: 'st-ratio', label: 'Plak oranı (en : boy)', min: 1, max: 3, step: 0.05, value: S.ratio, text: '1 : ' + fmt(S.ratio, 2),
        hint: 'Tüm katlar aynı plağı kullanır: ' + fmt(plan.Wp, 1) + ' × ' + fmt(plan.Dp, 1) + ' m · ' + fmt(plan.plateArea) + ' m²',
        oninput: (v) => ctl().studyLive({ ratio: v }), onchange: () => ctl().studyLiveEnd(),
      }),
      single ? h('p', { class: 'note' }, 'Tek katta ortak çekirdek kullanılmaz; merdiven ve asansör mekânları kendi blokları olarak çizilir.') : ui.fld2('Çekirdek (merdiven · asansör · şaft)',
        h('div', { class: 'core-row' },
          ui.toggle({ label: 'Otomatik boyut', on: !!S.core.auto, onclick: () => ctl().studySet({ core: Object.assign({}, S.core, { auto: !S.core.auto }) }) }),
          S.core.auto ? h('span', { class: 'core-val mono' }, fmt(plan.coreArea) + ' m²') : h('label', { class: 'area-wrap' },
            h('span', { class: 'sr' }, 'Çekirdek alanı (m²)'),
            h('input', { class: 'inp area-inp mono', type: 'number', min: 4, max: 200, step: 1, value: S.core.area, keep: true, onchange: (e) => ctl().studySet({ core: Object.assign({}, S.core, { area: U.clamp(parseFloat(e.target.value) || S.core.area, 4, 200) }) }), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
            h('span', { class: 'unit' }, 'm²')))),
      ui.btn('Otomatik dağıt', { icon: 'layout', cls: 'btn-yellow btn-wide', onclick: () => ctl().studyAuto(), disabled: !P.spaces.length, title: 'Mekânları işlev bölgesine ve ilişkilere göre katlara dağıt' })));
  }

  function rowView(state, f, s) {
    const P = state.project;
    const sel = state.selectedId === s.id;
    const n = P.study.floors.length;
    const idx = f.index;
    return h('li', { key: s.id, id: 'frow-' + s.id, class: 'row frow' + (sel ? ' sel' : '') },
      h('div', { class: 'row-main', onclick: () => ctl().dispatch({ type: 'SELECT', id: sel ? null : s.id }) },
        ui.zoneDot(s.zone),
        h('span', { class: 'row-name' }, s.name),
        h('span', { class: 'frow-area mono' }, fmt(s.area) + ' m²'),
        h('span', { class: 'frow-mv' },
          h('button', { type: 'button', class: 'icon-btn', title: s.name + ' bir üst kata', 'aria-label': s.name + ' bir üst kata taşı', disabled: idx >= n - 1, onclick: (e) => { e.stopPropagation(); ctl().studyMove(s.id, 1); } }, h('span', { class: 'rot-up' }, ui.icon('chevron', 16))),
          h('button', { type: 'button', class: 'icon-btn', title: s.name + ' bir alt kata', 'aria-label': s.name + ' bir alt kata taşı', disabled: idx <= 0, onclick: (e) => { e.stopPropagation(); ctl().studyMove(s.id, -1); } }, h('span', { class: 'rot-down' }, ui.icon('chevron', 16))))));
  }

  function floorsView(state, sd) {
    const plan = sd.plan;
    const P = state.project;
    const list = plan.floors.slice().reverse().map((f) => h('section', { key: f.id, class: 'flr' },
      h('div', { class: 'flr-head' },
        h('label', { class: 'sr', for: 'fn-' + f.id }, f.name + ' adı'),
        h('input', { id: 'fn-' + f.id, class: 'inp flr-name', type: 'text', maxlength: 24, value: f.name, keep: true, onchange: (e) => ctl().studyRename(f.id, e.target.value), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'count mono' }, fmt(f.net) + ' m² · ' + f.spaces.length + ' mekân')),
      f.spaces.length
        ? h('ul', { class: 'rows' }, f.spaces.map((s) => rowView(state, f, s)))
        : h('p', { class: 'note flr-empty' }, 'Bu katta mekân yok. Bir mekânı buraya sürükleyin.')));
    const coreSp = P.spaces.filter((s) => st.isCore(s));
    return ui.section('Katlara göre mekânlar', h('div', { class: 'flr-list' }, list,
      plan.floors.length > 1 && coreSp.length ? h('p', { class: 'note' }, 'Dikey dolaşım mekânları (' + coreSp.map((s) => s.name).join(', ') + ') her katta ortak çekirdek bloğuna dönüşür.') : null),
      P.spaces.length + ' mekân', 'floors');
  }

  fl.sidebar = function (state, d) {
    const P = state.project;
    const sd = st.derive(P);
    const c = sd.findings.counts;
    const tab = state.ui.stTab === 'bulgular' ? 'bulgular' : 'katlar';
    const tabs = ui.tabsBar([
      { id: 'katlar', label: 'Katlar', n: P.study.floors.length },
      { id: 'bulgular', label: 'Bulgular', n: c.hata + c.uyari + c.oneri, warn: c.hata + c.uyari > 0 },
    ], tab, (id) => ctl().dispatch({ type: 'UI', patch: { stTab: id } }));
    const body = tab === 'katlar'
      ? [fl.modeSection(state), setupView(state, sd), altView(state, sd), floorsView(state, sd)].filter(Boolean)
      : [ui.findingList(sd.findings, 'Kat dağılımının ilişkilere, ıslak hacim hizasına ve plak dengesine göre kontrolü.')];
    return ui.sideShell('sb-kat', 'Mekân etüdü paneli · katlar', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, sd) {
    const key = [sd.plan, P.spaces, P.meta.name, App.theme.name];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: st.scene(P, sd, true) };
    return memo.v;
  }

  function toWorld(e) {
    const svg = fl.svgEl;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function cellAt(L, w) {
    return L.cells.find((c) => w.x >= c.cx - 8 && w.x <= c.cx + c.cw + 8 && w.y >= c.cy - 8 && w.y <= c.cy + c.rh + 8) || null;
  }

  function blockDown(e, b, floorId, L, plan) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e);
    drag = { id: b.spaceId, name: b.name, from: floorId, sx: e.clientX, sy: e.clientY, moved: false, bw: b.w * L.s, bh: b.h * L.s, zone: b.zone, area: b.area };
    try { fl.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    ctl().dispatch({ type: 'SELECT', id: b.spaceId });
  }
  function svgMove(e, L, plan) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
    }
    const w = toWorld(e);
    const cell = cellAt(L, w);
    const over = cell ? plan.floors[cell.index].id : null;
    ctl().dispatch({ type: 'UI', patch: { stDrag: { id: drag.id, x: w.x, y: w.y, bw: drag.bw, bh: drag.bh, name: drag.name, zone: drag.zone, from: drag.from, over: over } } });
  }
  function svgUp(e, L, plan) {
    if (!drag) return;
    try { fl.svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    const d = drag;
    drag = null;
    if (d.moved) {
      const cell = cellAt(L, toWorld(e));
      ctl().dispatch({ type: 'UI', patch: { stDrag: null } });
      if (cell) ctl().studyAssign(d.id, plan.floors[cell.index].id);
    }
  }

  fl.board = function (state, d) {
    const P = state.project;
    const sd = st.derive(P);
    const plan = sd.plan;
    const sc = sceneOf(P, sd);
    const L = sc.L;
    const dr = state.ui.stDrag;
    const sel = state.selectedId;

    const hits = [];
    plan.floors.forEach((f, i) => {
      const c = L.cells[i];
      const isOver = dr && dr.over === f.id && dr.from !== f.id;
      hits.push(h('g', { key: 'c' + f.id, class: 'fcell' + (isOver ? ' over' : '') },
        h('rect', { class: 'fcell-hit', x: c.cx, y: c.cy, width: c.cw, height: c.rh, rx: 14, fill: 'transparent' }),
        isOver ? h('rect', { class: 'fdrop sel-ring', x: c.ox - 10, y: c.oy - 10, width: c.pw + 20, height: c.ph + 20, rx: 12, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 2.5, 'stroke-dasharray': '9 7' }) : null));
      f.blocks.forEach((b) => {
        if (b.kind !== 'space') return;
        const x = c.ox + b.x * L.s, y = c.oy + b.y * L.s, w = b.w * L.s, hh = b.h * L.s;
        const on = sel === b.spaceId;
        const dragging = dr && dr.id === b.spaceId;
        hits.push(h('g', { key: 'k' + b.id, class: 'fblock' + (on ? ' sel' : '') + (dragging ? ' dragging' : '') },
          dragging ? h('rect', { x: x, y: y, width: w, height: hh, fill: 'rgba(255,255,255,.62)', 'pointer-events': 'none' }) : null,
          on ? h('rect', { class: 'sel-ring', x: x - 3, y: y - 3, width: w + 6, height: hh + 6, rx: App.theme.name === 'glass' ? 6 : 0, fill: 'none', stroke: App.PAL.ink, 'stroke-width': 3, 'stroke-dasharray': '7 6', 'pointer-events': 'none' }) : null,
          h('rect', {
            class: 'fblock-hit', x: x, y: y, width: w, height: hh, fill: 'transparent', tabindex: 0, role: 'button',
            'aria-label': b.name + ', ' + fmt(b.area) + ' metrekare, ' + f.name + '. Yukarı ve aşağı ok tuşlarıyla kat değiştirin.',
            onpointerdown: (e) => blockDown(e, b, f.id, L, plan),
            onkeydown: (e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); ctl().studyMove(b.spaceId, 1); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); ctl().studyMove(b.spaceId, -1); }
              else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctl().dispatch({ type: 'SELECT', id: b.spaceId }); }
            },
          }, h('title', {}, b.name + ' — ' + fmt(b.area) + ' m² — ' + f.name))));
      });
    });

    let ghost = null;
    if (dr) {
      const z = App.ZONES[dr.zone] || App.ZONES.sosyal;
      const g = App.theme.name === 'glass';
      const gw = Math.max(54, dr.bw), gh = Math.max(30, dr.bh);
      ghost = h('g', { key: 'ghost', class: 'fghost', 'pointer-events': 'none', transform: 'translate(' + (dr.x - gw / 2) + ' ' + (dr.y - gh / 2) + ')' },
        h('rect', { width: gw, height: gh, rx: g ? 6 : 0, fill: z.fill, stroke: App.PAL.ink, 'stroke-width': g ? 1.6 : 3, opacity: 0.9 }),
        h('text', { x: gw / 2, y: gh / 2 + 4.5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: z.text, 'font-family': 'var(--f-body)' }, dr.name.length > 16 ? dr.name.slice(0, 15) + '…' : dr.name));
    }

    const svg = h('svg', {
      id: 'pafta-kat', class: 'board-svg board-svg-kat', viewBox: '0 0 ' + App.sheet.W + ' ' + App.sheet.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', 'aria-label': 'Mekân etüdü paftası (katlar): ' + plan.floors.length + ' kat planı',
      ref: (el) => { fl.svgEl = el; }, onpointermove: (e) => svgMove(e, L, plan), onpointerup: (e) => svgUp(e, L, plan), onpointercancel: (e) => svgUp(e, L, plan),
      onpointerdown: () => { if (state.selectedId) ctl().dispatch({ type: 'SELECT', id: null }); },
    }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'fhits' }, hits), ghost);

    const empty = !P.spaces.length;
    const stage = h('div', { class: 'board-stage' }, svg,
      empty ? ui.emptyCard('Mekân etüdü için mekân gerekli', 'İşlev Şeması modülünde mekân ekleyin ya da hazır bir bina programı yükleyin. Mekânlar otomatik olarak katlara dağıtılır.', [
        ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => ctl().loadTemplate('konut', '2+1') }),
        ui.btn('İşlev Şeması’na git', { icon: 'chevron', onclick: () => ctl().go('islev') })]) : null);

    return ui.boardPage(state, d, {
      label: 'Mekân etüdü paftası · katlar',
      stage: stage,
      scale: 'Bloklar m² ile orantılı · ölçekli plan',
      foot: h('p', { class: 'board-hint' }, 'Bir mekân bloğunu başka bir kata sürükleyin · seçili blokta ▲▼ ok tuşları katı değiştirir'),
      tools: [
        { k: 'seg', label: 'Çalışma kipi', value: 'katlar', options: [{ v: 'mekanlar', label: 'Mekânlar' }, { v: 'katlar', label: 'Katlar' }], onchange: (v) => ctl().stMode(v) },
        { k: 'sep' },
        { k: 'btn', label: 'Otomatik dağıt', icon: 'layout', strong: true, onclick: () => ctl().studyAuto(), disabled: !P.spaces.length, title: 'Mekânları işlev bölgesine ve ilişkilere göre katlara dağıt' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => ctl().dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => ctl().dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
        { k: 'sep' },
        { k: 'btn', label: 'DXF', icon: 'download', onclick: () => ctl().studyDxf(), disabled: !P.spaces.length || !!state.ui.busy, title: 'Kat planlarını katmanlı DXF (metre) olarak indir' },
      ],
    });
  };
})();
