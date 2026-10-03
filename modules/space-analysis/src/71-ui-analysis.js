/* ==========================================================================
   71-ui-analysis.js — Modül 3 arayüzü: Mekân Analizi (patlatılmış izometrik)
   Sol panel: görünüm (kip, patlatma, yön, eğim), kat / katman seçimi, ölçüler, bulgular.
   Pafta: App.analysis.scene primitifleri + etkileşim: sürükle = döndür, tıkla = kat seç.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;

  const ctl = () => App.ctl;
  const an = (ui.analysis = {});
  let orbit = null;

  const pct = (v) => (v == null ? '—' : '%' + Math.round(v * 100));

  /* ---------------- sol panel ---------------- */
  function viewSection(state) {
    const v = state.ui.an;
    const c = ctl();
    return ui.section('Görünüm', h('div', { class: 'sec-box' },
      ui.fld2('Kip',
        ui.segmented({ label: 'Görünüm kipi', wide: true, value: v.mode, options: [{ v: 'floors', label: 'Katlar', title: 'Her kat bir levha' }, { v: 'layers', label: 'Katmanlar', title: 'Seçili katın analiz katmanları' }], onchange: (m) => c.anMode(m) }),
        v.mode === 'floors' ? 'Her kat ayrı bir levha olarak yukarı doğru açılır.' : 'Seçili katın plan, işlev, dolaşım gibi katmanları üst üste açılır.'),
      ui.range({ id: 'an-explode', label: 'Patlatma', min: 0, max: 100, step: 1, value: Math.round(v.explode * 100), text: '%' + Math.round(v.explode * 100), oninput: (x) => { c.anCancel(); c.an({ explode: x / 100 }); } }),
      ui.range({ id: 'an-yaw', label: 'Dönüş', min: -85, max: 85, step: 1, value: Math.round(v.yaw), text: Math.round(v.yaw) + '°', oninput: (x) => { c.anCancel(); c.an({ yaw: x }); } }),
      ui.range({ id: 'an-pitch', label: 'Bakış yüksekliği', min: 12, max: 75, step: 1, value: Math.round(v.pitch), text: Math.round(v.pitch) + '°', oninput: (x) => { c.anCancel(); c.an({ pitch: x }); } }),
      h('div', { class: 'tgl-row' },
        ui.toggle({ label: 'Etiketler', on: v.labels, onclick: () => c.an({ labels: !v.labels }) }),
        ui.toggle({ label: 'Oklar', on: v.arrows, onclick: () => c.an({ arrows: !v.arrows }), title: 'Düşey dolaşım ve ilişki okları' }),
        ui.toggle({ label: 'Kılavuzlar', on: v.guides, onclick: () => c.an({ guides: !v.guides }), title: 'Levhaları bağlayan köşe çizgileri' }),
        ui.toggle({ label: 'Hacim', on: v.volume, onclick: () => c.an({ volume: !v.volume }), title: 'Mekânları yükselti olarak çiz' }))));
  }

  function mixBar(m) {
    return h('span', { class: 'mixbar', 'aria-hidden': 'true' }, m.zones.map((z) => h('i', { key: z.zone, style: { width: (z.share * 100) + '%', background: (App.ZONES[z.zone] || App.ZONES.sosyal).fill }, title: (App.ZONES[z.zone] || App.ZONES.sosyal).label + ' %' + Math.round(z.share * 100) })));
  }

  function floorsSection(state, sd, A) {
    const v = state.ui.an;
    const plan = sd.plan;
    const rows = plan.floors.slice().reverse().map((f) => {
      const mix = A.mix.find((m) => m.id === f.id);
      const on = v.sel === f.id;
      return h('li', { key: f.id, class: 'row aflr' + (on ? ' sel' : '') },
        h('button', { type: 'button', class: 'row-main aflr-btn', 'aria-pressed': String(on), onclick: () => ctl().anSelect(f.id) },
          h('span', { class: 'aflr-top' },
            h('span', { class: 'row-name' }, f.name),
            h('span', { class: 'frow-area mono' }, fmt(f.net) + ' m² · ' + f.spaces.length + ' mekân')),
          mix ? mixBar(mix) : null));
    });
    return ui.section('Katlar', h('div', {}, h('ul', { class: 'rows' }, rows), h('p', { class: 'note aflr-note' }, 'Bir kata tıklayın: diğer katlar soluklaşır. Tekrar tıklayınca seçim kalkar.')), plan.floors.length + ' kat', 'afloors');
  }

  function layersSection(state, sd) {
    const v = state.ui.an;
    const plan = sd.plan;
    const cur = plan.floors.find((f) => f.id === v.floorId) || plan.floors[0];
    const c = ctl();
    return [
      ui.section('Kat', h('div', { class: 'sec-box' },
        ui.fld2('Analiz edilen kat', h('select', { id: 'an-floor', class: 'inp', value: cur.id, onchange: (e) => c.an({ floorId: e.target.value }, true) }, plan.floors.slice().reverse().map((f) => h('option', { key: f.id, value: f.id }, f.name + ' · ' + fmt(f.net) + ' m²')))))
      , null, 'afloor'),
      ui.section('Katmanlar', h('ul', { class: 'lyrs' }, App.analysis.LAYERS.map((l) => {
        const on = v.layers.indexOf(l.id) >= 0;
        return h('li', { key: l.id }, h('button', { type: 'button', class: 'lyr' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => c.anToggleLayer(l.id) },
          h('i', { class: 'lyr-box', 'aria-hidden': 'true' }, on ? ui.icon('check', 12) : null),
          h('span', { class: 'lyr-t' }, h('b', {}, l.name), h('small', {}, l.sub))));
      })), v.layers.length + '/' + App.analysis.LAYERS.length, 'alayers'),
    ];
  }

  function statsSection(A) {
    const s = A.stats;
    const rows = [
      ['Gün ışığı (cepheli yaşama mekânı)', s.nHab ? s.nHabExt + '/' + s.nHab + ' · ' + pct(s.daylight) : '—'],
      ['Sirkülasyon payı', pct(s.circShare)],
      ['Islak hacim hizası', pct(s.wetAlign)],
      ['Gürültü çakışması', String(s.conflicts)],
      ['Plak doluluğu', pct(s.fill)],
    ];
    return ui.section('Ölçüler', h('dl', { class: 'stats' }, rows.map((r) => [h('dt', { key: 'k' + r[0] }, r[0]), h('dd', { key: 'v' + r[0], class: 'mono' }, r[1])])), null, 'astats');
  }

  an.sidebar = function (state, d) {
    const P = state.project;
    const sd = App.study.derive(P);
    const A = App.analysis.analyze(P, sd);
    const v = state.ui.an;
    const tab = state.ui.anTab || 'gorunum';
    const c = A.counts;
    const tabs = ui.tabsBar([
      { id: 'gorunum', label: 'Görünüm' },
      { id: 'bulgular', label: 'Bulgular', n: c.hata + c.uyari + c.oneri, warn: c.hata + c.uyari > 0 },
    ], tab, (id) => ctl().dispatch({ type: 'UI', patch: { anTab: id } }));
    const body = tab === 'gorunum'
      ? [viewSection(state), v.mode === 'floors' ? floorsSection(state, sd, A) : layersSection(state, sd), statsSection(A)]
      : [ui.findingList({ items: A.items, counts: A.counts }, 'Düşey düzen, cephe teması, gürültü ve dolaşım kontrolleri. Bilgi tabanı: işlev şeması bina tipi.')];
    return ui.sideShell('sb-analiz', 'Mekân analizi paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, sd, v) {
    const key = [sd.plan, P.spaces, P.meta.name, App.theme.name, v];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: App.analysis.scene(P, sd, v, true) };
    return memo.v;
  }

  function orbitDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = App.store.get().ui.an;
    orbit = { sx: e.clientX, sy: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false, id: e.pointerId };
  }
  function orbitMove(e) {
    if (!orbit) return;
    const dx = e.clientX - orbit.sx, dy = e.clientY - orbit.sy;
    if (!orbit.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      orbit.moved = true;
      ctl().anCancel();
      try { an.svgEl.setPointerCapture(orbit.id); } catch (err) {}
      ui.orbiting = true;
    }
    ctl().anOrbit(dx, dy, orbit);
  }
  function orbitUp(e) {
    if (!orbit) return;
    const o = orbit;
    orbit = null;
    ui.orbiting = false;
    try { an.svgEl.releasePointerCapture(o.id); } catch (err) {}
    if (o.moved) ctl().an({}); // kalıcı kaydet
  }

  const poly = (pts) => pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');

  an.board = function (state, d) {
    const P = state.project;
    const sd = App.study.derive(P);
    const v = state.ui.an;
    const sc = sceneOf(P, sd, v);
    const c = ctl();
    const floors = v.mode === 'floors';
    const sel = state.selectedId;

    const hits = sc.hits.map((hi, i) => {
      if (hi.kind === 'slab') {
        return h('polygon', { key: 'h' + i, class: 'ahit ahit-slab' + (floors ? ' click' : ''), points: poly(hi.pts), fill: 'transparent', onclick: floors ? () => c.anSelect(hi.id) : null });
      }
      const on = sel === hi.id;
      return h('polygon', {
        key: 'h' + i, class: 'ahit ahit-block' + (on ? ' sel' : ''), points: poly(hi.pts), fill: 'transparent',
        onclick: (e) => { e.stopPropagation(); c.dispatch({ type: 'SELECT', id: on ? null : hi.id }); if (floors) c.an({ sel: hi.floorId }, true); },
      }, h('title', {}, hi.name + ' — ' + fmt(hi.area) + ' m²'));
    });

    const plan = sd.plan;
    const selFloor = floors && v.sel ? plan.floors.find((f) => f.id === v.sel) : null;

    const svg = h('svg', {
      id: 'pafta-analiz', class: 'board-svg board-svg-analiz', viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', tabindex: 0,
      'aria-label': 'Mekân analizi paftası. Ok tuşları döndürür, artı ve eksi tuşları patlatmayı değiştirir.',
      ref: (el) => { an.svgEl = el; },
      onpointerdown: orbitDown, onpointermove: orbitMove, onpointerup: orbitUp, onpointercancel: orbitUp,
      onkeydown: (e) => {
        const a = App.store.get().ui.an;
        const k = e.key;
        if (k === 'ArrowLeft') { e.preventDefault(); c.an({ yaw: U.clamp(a.yaw - 4, -85, 85) }); }
        else if (k === 'ArrowRight') { e.preventDefault(); c.an({ yaw: U.clamp(a.yaw + 4, -85, 85) }); }
        else if (k === 'ArrowUp') { e.preventDefault(); c.an({ pitch: U.clamp(a.pitch + 3, 12, 75) }); }
        else if (k === 'ArrowDown') { e.preventDefault(); c.an({ pitch: U.clamp(a.pitch - 3, 12, 75) }); }
        else if (k === '+' || k === '=') { e.preventDefault(); c.anCancel(); c.an({ explode: U.clamp(a.explode + 0.08, 0, 1) }); }
        else if (k === '-' || k === '_') { e.preventDefault(); c.anCancel(); c.an({ explode: U.clamp(a.explode - 0.08, 0, 1) }); }
      },
    }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'ahits' }, hits));

    const empty = !P.spaces.length;
    const stage = h('div', { class: 'board-stage' + (floors ? '' : ' is-layers') }, svg,
      selFloor ? h('div', { class: 'an-chip' }, h('b', {}, selFloor.name), h('span', { class: 'mono' }, fmt(selFloor.net) + ' m² · ' + selFloor.spaces.length + ' mekân'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.an({ sel: null }, true) }, ui.icon('close', 14))) : null,
      empty ? ui.emptyCard('Analiz için mekân gerekli', 'İşlev Şeması’nda mekân ekleyin; Kat Etüdü katlara dağıtır, burada patlatılmış izometrik olarak incelersiniz.', [
        ui.btn('Örnek konutu yükle', { icon: 'newdoc', cls: 'btn-primary', onclick: () => c.loadTemplate('konut', '2+1') }),
        ui.btn('İşlev Şeması’na git', { icon: 'chevron', onclick: () => c.go('islev') })]) : null);

    return ui.boardPage(state, d, {
      label: 'Mekân analizi paftası',
      stage: stage,
      scale: 'Patlatılmış izometrik · plan ölçekli',
      foot: h('p', { class: 'board-hint' }, 'Sürükleyerek döndürün · bir kata tıklayarak öne çıkarın · ok ve +/− tuşları da çalışır'),
      tools: [
        { k: 'seg', label: 'Görünüm kipi', value: v.mode, options: [{ v: 'floors', label: 'Katlar' }, { v: 'layers', label: 'Katmanlar' }], onchange: (m) => c.anMode(m) },
        { k: 'sep' },
        { k: 'btn', label: v.explode > 0.5 ? 'Topla' : 'Patlat', icon: 'layers', strong: true, onclick: () => c.anToggleExplode(), title: 'Levhaları aç / kapat (animasyonlu)' },
        { k: 'icon', label: 'Görünümü sıfırla', icon: 'reset', onclick: () => c.anResetView(), title: 'Dönüş ve eğimi varsayılana al' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ],
    });
  };
})();
