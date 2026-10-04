/* ==========================================================================
   65-ui-imar.js — Modül 5 arayüzü: İmar ve Kapasite
   Sol panel: Parsel (konum, çizim araçları, kenarlar, görünüm) · Kurallar (TAKS, KAKS, yençok, çekmeler, biçim, program)
              · Senaryolar · Bulgular.
   Pafta: parsel çevresinde ölçekli plan (kenara tıkla = ön/yan/arka, köşe tutamacı sürükle = parseli düzenle)
          ya da izometrik kütle (sürükle = döndür). Çizim araçları: çokgen, dikdörtgen.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const Z = App.zoning;
  const gis = App.gis;
  const ctl = () => App.ctl;
  const S = ui.site;
  const I = (ui.imar = {});

  const KIND = { on: 'Ön', yan: 'Yan', arka: 'Arka' };
  const cap = (s) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);

  /* ---------------- sol panel ---------------- */
  function rectForm(state) {
    const v = state.ui.imar;
    const f = v.rect || { w: 20, d: 30, rot: 0 };
    const set = (k, val) => ctl().imarView({ rect: Object.assign({}, f, { [k]: val }) }, true);
    const num = (id, label, min, max, step, k, unit) => h('label', { class: 'nf', for: id },
      h('span', { class: 'nf-l' }, label),
      h('span', { class: 'nf-c' }, h('input', { id: id, class: 'inp mono nf-in', type: 'number', min: min, max: max, step: step, value: f[k], keep: true, inputmode: 'decimal', onchange: (e) => { const x = parseFloat(String(e.target.value).replace(',', '.')); set(k, U.clamp(Number.isFinite(x) ? x : f[k], min, max)); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); ctl().imarRectForm(); } } }), h('span', { class: 'unit' }, unit)));
    return h('div', { class: 'rect-form' },
      h('div', { class: 'nf-row' }, num('rf-w', 'Genişlik', 4, 400, 1, 'w', 'm'), num('rf-d', 'Derinlik', 4, 400, 1, 'd', 'm'), num('rf-r', 'Açı', -90, 90, 1, 'rot', '°')),
      ui.btn(state.project.site.parcel ? 'Parseli bu ölçülerle değiştir' : 'Parsel oluştur', { icon: 'parcel', cls: 'btn-wide', onclick: () => ctl().imarRectForm() }));
  }

  function edgeList(state, R) {
    const im = state.project.site.imar;
    if (!R.edges || !R.edges.length) return null;
    return h('ul', { class: 'edges', 'aria-label': 'Parsel kenarları' }, R.edges.map((ed) => {
      const manual = !!im.ek[ed.i];
      return h('li', { key: ed.i, class: 'edge-row' },
        h('span', { class: 'edge-n mono' }, String(ed.i + 1)),
        h('span', { class: 'edge-len mono' }, fmt(ed.len, 1) + ' m'),
        h('span', { class: 'edge-road' }, ed.roadName || (ed.kind === 'on' ? 'yola cephe' : '')),
        h('button', { type: 'button', class: 'edge-kind k-' + ed.kind + (manual ? ' manual' : ''), title: 'Kenar türünü değiştir: ön → yan → arka → otomatik', onclick: () => ctl().imarEdge(ed.i) },
          KIND[ed.kind] + ' · ' + fmt(ed.kind === 'on' ? im.setback.on : ed.kind === 'arka' ? im.setback.arka : im.setback.yan, 1) + ' m', manual ? h('i', { class: 'edge-man', 'aria-hidden': 'true' }, '✎') : null));
    }));
  }

  function parcelTab(state, cx) {
    const s = state.project.site, v = state.ui.imar, c = ctl(), R = cx.R, g = state.ui.geo || S.GEO0;
    const out = [];
    out.push(ui.section('Konum', h('div', { class: 'sec-box' },
      S.searchBox(state, { id: 'imar-q', pickLabel: 'Buraya git', onPick: (r) => c.siteSetLoc(r) }),
      S.locCard(state)), null, 'iloc'));
    out.push(S.sourceSection(state));
    const area = s.parcel ? Math.abs(gis.area(s.parcel)) : 0;
    out.push(ui.section('Parsel', h('div', { class: 'sec-box' },
      h('div', { class: 'tool-row', role: 'group', 'aria-label': 'Parsel çizim araçları' },
        ui.btn('Çokgen çiz', { icon: 'draw', cls: v.tool === 'draw' ? 'btn-primary' : '', pressed: v.tool === 'draw', onclick: () => c.imarTool(v.tool === 'draw' ? null : 'draw'), title: 'Köşelere tıklayın; ilk noktaya tıklayın ya da çift tıklayın' }),
        ui.btn('Dikdörtgen', { icon: 'parcel', cls: v.tool === 'rect' ? 'btn-primary' : '', pressed: v.tool === 'rect', onclick: () => c.imarTool(v.tool === 'rect' ? null : 'rect'), title: 'Paftada köşeden köşeye sürükleyin' }),
        s.parcel ? ui.btn('Sil', { icon: 'trash', onclick: () => c.imarClear(), title: 'Parseli kaldır' }) : null),
      v.tool === 'draw' ? h('p', { class: 'note' }, 'Paftada köşelere tıklayın. Bitirmek için ilk noktaya tıklayın, çift tıklayın ya da Enter’a basın. Geri almak için Backspace, vazgeçmek için Esc.') : null,
      v.tool === 'rect' ? h('p', { class: 'note' }, 'Paftada bir köşeden karşı köşeye sürükleyin. Döndürmek için aşağıdaki açı alanını kullanın.') : null,
      !v.tool && !s.parcel ? h('p', { class: 'note' }, 'Parseli çizin ya da ölçülerini yazın. Ölçüler metre cinsindendir; parsel konumun merkezine yerleşir.') : null,
      rectForm(state),
      s.parcel ? h('div', { class: 'kv-grid' },
        h('div', {}, h('span', { class: 'kv-k' }, 'Alan'), h('b', { class: 'kv-v mono' }, fmt(area, 0) + ' m²')),
        h('div', {}, h('span', { class: 'kv-k' }, 'Çevre'), h('b', { class: 'kv-v mono' }, fmt((R.edges || []).reduce((t, e) => t + e.len, 0), 0) + ' m')),
        h('div', {}, h('span', { class: 'kv-k' }, 'Köşe'), h('b', { class: 'kv-v mono' }, String(s.parcel.length)))) : null,
      !cx.e && s.loc.src !== 'demo' ? h('p', { class: 'note' }, 'Çevre verisi yok: yol cephesi, çevre yapıları ve gölge hesaplanamaz. “Konum” bölümünden verileri çekin.') : null,
      edgeList(state, R)), s.parcel ? s.parcel.length + ' köşe' : null, 'iparcel'));
    out.push(ui.section('Görünüm', h('div', { class: 'sec-box' },
      s.parcel ? ui.fld2('Kip', ui.segmented({ label: 'Görünüm kipi', wide: true, value: v.mode, options: [{ v: 'plan', label: 'Plan' }, { v: 'iso', label: 'Kütle' }], onchange: (m) => c.imarView({ mode: m }) }), v.mode === 'iso' ? 'Sürükleyerek döndürün.' : 'Kenarlara tıklayarak ön / yan / arka türünü değiştirin.') : null,
      h('div', { class: 'tgl-row' },
        ui.toggle({ label: 'Gölge', on: v.shadow, onclick: () => c.imarView({ shadow: !v.shadow }), title: 'Yeni kütlenin gölgesi' }),
        ui.toggle({ label: 'Etiketler', on: v.labels, onclick: () => c.imarView({ labels: !v.labels }) }),
        v.mode === 'plan' ? ui.toggle({ label: 'Köşe tutamaçları', on: v.handles, onclick: () => c.imarView({ handles: !v.handles }) }) : null),
      v.shadow ? [
        ui.fld2('Gün', ui.segmented({ label: 'Gölge günü', wide: true, value: s.imar.day, options: gis.SUN_DAYS.map((d) => ({ v: d.id, label: d.label })), onchange: (x) => c.imarSet({ day: x }) })),
        ui.range({ id: 'imar-hour', label: 'Saat', min: 8, max: 17, step: 0.5, value: s.imar.hour, text: Math.floor(s.imar.hour) + ':' + (s.imar.hour % 1 ? '30' : '00'), oninput: (x) => c.imarLive({ hour: x }), onchange: () => c.imarLiveEnd() }),
      ] : null,
      v.mode === 'iso' && s.parcel ? [
        ui.range({ id: 'imar-yaw', label: 'Dönüş', min: -85, max: 85, step: 1, value: Math.round(v.yaw), text: Math.round(v.yaw) + '°', oninput: (x) => c.imarView({ yaw: x }, true), onchange: () => c.imarView({}) }),
        ui.range({ id: 'imar-pitch', label: 'Bakış yüksekliği', min: 20, max: 70, step: 1, value: Math.round(v.pitch), text: Math.round(v.pitch) + '°', oninput: (x) => c.imarView({ pitch: x }, true), onchange: () => c.imarView({}) }),
        ui.range({ id: 'imar-zx', label: 'Yükseklik abartısı', min: 1, max: 3, step: 0.1, value: v.zx, text: '×' + fmt(v.zx, 1), oninput: (x) => c.imarView({ zx: x }, true), onchange: () => c.imarView({}) }),
      ] : null), null, 'iview'));
    void g;
    return out;
  }

  function rulesTab(state, cx) {
    const s = state.project.site, im = s.imar, c = ctl(), R = cx.R;
    const use = Z.use(im.use);
    const L = (key, id, label, min, max, step, text, hint) => ui.range({ id: id, label: label, min: min, max: max, step: step, value: im[key], text: text, hint: hint, oninput: (x) => c.imarLive({ [key]: x }), onchange: () => c.imarLiveEnd() });
    const SB = (key, id, label) => ui.range({ id: id, label: label, min: 0, max: 20, step: 0.5, value: im.setback[key], text: fmt(im.setback[key], 1) + ' m', oninput: (x) => c.imarLive({ setback: Object.assign({}, im.setback, { [key]: x }) }), onchange: () => c.imarLiveEnd() });
    const nl = R.ok ? Math.floor(im.hmax / im.floorH + 1e-6) : null;
    return [
      ui.section('Program', h('div', { class: 'sec-box' },
        ui.fld2('Yapı türü', h('select', { id: 'imar-use', class: 'inp', value: im.use, onchange: (e) => c.imarUse(e.target.value) }, Z.USES.map((u) => h('option', { key: u.id, value: u.id }, u.label))), 'Tür değişince kat yüksekliği, verim ve birim büyüklüğü önerilen değerlere çekilir.'),
        h('div', { class: 'presets', role: 'group', 'aria-label': 'Hazır imar değerleri' }, Z.PRESETS.map((p) => h('button', { key: p.id, type: 'button', class: 'preset', disabled: p.ctx && !cx.A, title: p.ctx ? 'Çevredeki binaların taban alanı, emsal ve ortalama yüksekliği' : 'TAKS ' + fmt(p.v.taks, 2) + ' · KAKS ' + fmt(p.v.kaks, 2) + ' · ' + fmt(p.v.hmax, 1) + ' m', onclick: () => c.imarPreset(p.id) }, p.label)))), null, 'iprog'),
      ui.section('İmar koşulları', h('div', { class: 'sec-box' },
        h('p', { class: 'note' }, 'Değerleri parselinizin imar durumu belgesinden girin. Uygulama imar planı verisi içermez; hesaplar girdiğiniz değerlere dayanır.'),
        L('taks', 'imar-taks', 'TAKS (taban alanı)', 0.05, 1, 0.01, fmt(im.taks, 2)),
        L('kaks', 'imar-kaks', 'KAKS (emsal)', 0.1, 8, 0.05, fmt(im.kaks, 2)),
        L('hmax', 'imar-hmax', 'Yençok (en çok yükseklik)', 3, 80, 0.5, fmt(im.hmax, 1) + ' m', nl ? 'En çok ' + nl + ' kat (' + fmt(im.floorH, 1) + ' m kat yüksekliği ile)' : null),
        L('floorH', 'imar-fh', 'Kat yüksekliği', 2.4, 6, 0.1, fmt(im.floorH, 1) + ' m')), null, 'irules'),
      ui.section('Çekme mesafeleri', h('div', { class: 'sec-box' },
        SB('on', 'imar-sb-on', 'Ön bahçe'), SB('yan', 'imar-sb-yan', 'Yan bahçe'), SB('arka', 'imar-sb-arka', 'Arka bahçe'),
        h('p', { class: 'note' }, 'Kenarların ön / yan / arka olması, parselin yola göre konumundan otomatik bulunur; paftada kenara tıklayarak değiştirebilirsiniz.')), null, 'isb'),
      ui.section('Kütle biçimi', h('ul', { class: 'lyrs forms' }, Z.FORMS.map((f) => {
        const on = im.form === f.id;
        return h('li', { key: f.id }, h('button', { type: 'button', class: 'lyr' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => c.imarSet({ form: f.id }) },
          h('i', { class: 'lyr-box', 'aria-hidden': 'true' }, on ? ui.icon('check', 12) : null),
          h('span', { class: 'lyr-t' }, h('b', {}, f.label), h('small', {}, f.sub))));
      })), null, 'iform'),
      ui.section('Kapasite varsayımları', h('div', { class: 'sec-box' },
        L('eff', 'imar-eff', 'Net / brüt verim', 0.4, 0.95, 0.01, '%' + Math.round(im.eff * 100)),
        L('unit', 'imar-unit', 'Ortalama ' + use.unitName + ' (net)', 15, 300, 1, fmt(im.unit, 0) + ' m²'),
        L('cars', 'imar-cars', 'Birim başına araç', 0, 3, 0.1, fmt(im.cars, 1)),
        L('per', 'imar-per', 'Birim başına ' + use.perName, 0.5, 20, 0.1, fmt(im.per, 1)),
        ui.fld2('Bodrum kat sayısı', ui.stepper({ label: 'Bodrum kat sayısı', value: im.basement, min: 0, max: 4, unit: 'kat', onchange: (x) => c.imarSet({ basement: x }) }), 'Otopark kapasitesi bodrum sayısıyla hesaplanır (araç başına ~28 m²).')), null, 'icap'),
    ];
  }

  function scenarioTab(state, cx) {
    const s = state.project.site, im = s.imar, c = ctl(), R = cx.R;
    const use = Z.use(im.use);
    const cur = R.ok ? Z.summary(R, im) : null;
    const form = h('form', { class: 'scn-form', onsubmit: (e) => { e.preventDefault(); const el = e.target.elements.nm; c.imarScnSave(el.value); el.value = ''; } },
      h('label', { class: 'sr', for: 'scn-name' }, 'Senaryo adı'),
      h('input', { id: 'scn-name', name: 'nm', class: 'inp', type: 'text', maxlength: 24, placeholder: 'Senaryo adı (örn. Yüksek yoğunluk)', autocomplete: 'off', keep: true }),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: !R.ok || im.scn.length >= 4, title: R.ok ? 'Geçerli değerleri senaryo olarak sakla' : 'Önce geçerli bir parsel ve kütle gerekli' }, ui.icon('plus', 16), h('span', {}, 'Kaydet')));
    const rows = im.scn.map((sc) => {
      const m = sc.sum || {};
      const d = m.ok && cur ? m.built - cur.built : null;
      return h('li', { key: sc.id, class: 'scn' },
        h('div', { class: 'scn-top' }, h('b', { class: 'scn-n' }, sc.name),
          h('button', { type: 'button', class: 'icon-btn', title: 'Bu senaryoyu uygula', 'aria-label': sc.name + ' senaryosunu uygula', onclick: () => c.imarScnApply(sc.id) }, ui.icon('reset', 15)),
          h('button', { type: 'button', class: 'icon-btn', title: 'Senaryoyu sil', 'aria-label': sc.name + ' senaryosunu sil', onclick: () => c.imarScnDel(sc.id) }, ui.icon('trash', 15))),
        m.ok ? h('div', { class: 'kv-grid' },
          h('div', {}, h('span', { class: 'kv-k' }, 'Kat'), h('b', { class: 'kv-v mono' }, String(m.floors))),
          h('div', {}, h('span', { class: 'kv-k' }, 'Emsal'), h('b', { class: 'kv-v mono' }, fmt(m.kaks, 2))),
          h('div', {}, h('span', { class: 'kv-k' }, cap(use.unitName)), h('b', { class: 'kv-v mono' }, String(m.units))),
          h('div', {}, h('span', { class: 'kv-k' }, 'İnşaat'), h('b', { class: 'kv-v mono' }, fmt(m.built, 0) + ' m²'))) : h('p', { class: 'note' }, 'Bu senaryoda yapılabilir kütle yok.'),
        d != null ? h('p', { class: 'scn-d' }, d === 0 ? 'Geçerli ayarla aynı' : (d > 0 ? '+' : '−') + fmt(Math.abs(d), 0) + ' m² geçerli ayara göre') : null);
    });
    return [ui.section('Senaryolar', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Geçerli imar değerlerini ve kütle biçimini en çok dört senaryo olarak saklayıp paftada yan yana karşılaştırın.'),
      form,
      rows.length ? h('ul', { class: 'scns' }, rows) : h('p', { class: 'note' }, 'Henüz senaryo yok.')), im.scn.length + '/4', 'iscn')];
  }

  I.sidebar = function (state) {
    const cx = S.imarCtx(state);
    const R = cx.R;
    const v = state.ui.imar;
    const tab = v.tab || 'parsel';
    const cn = R.counts || { hata: 0, uyari: 0, oneri: 0 };
    const tabs = ui.tabsBar([
      { id: 'parsel', label: 'Parsel' },
      { id: 'kurallar', label: 'Kurallar' },
      { id: 'senaryo', label: 'Senaryo', n: state.project.site.imar.scn.length || null },
      { id: 'bulgular', label: 'Bulgular', n: R.items && R.items.length ? cn.hata + cn.uyari + cn.oneri : null, warn: cn.hata + cn.uyari > 0 },
    ], tab, (id) => ctl().imarView({ tab: id }));
    let body;
    if (tab === 'parsel') body = parcelTab(state, cx);
    else if (tab === 'kurallar') body = rulesTab(state, cx);
    else if (tab === 'senaryo') body = scenarioTab(state, cx);
    else body = R.items && R.items.length ? [ui.findingList({ items: R.items, counts: cn }, 'Girdiğiniz imar koşullarının parsel, çevre ve kapasite açısından kontrolü.')] : [h('p', { class: 'note' }, 'Bulgular için önce bir parsel çizin.')];
    return ui.sideShell('sb-imar', 'İmar ve kapasite paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, A, R, v, orbiting) {
    const key = [P.site, P.meta.name, A, R, App.theme.name, v, orbiting];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: App.imarScene.scene(P, A, R, Object.assign({}, v, { lod: orbiting }), true) };
    return memo.v;
  }

  let geom = null;
  let drag = null; // { kind:'pv', i } | { kind:'orbit', ... }
  const planPt = function (e) {
    const g = geom, w = S.toWorld(I.svgEl, e);
    return [Math.round(((w.x - g.cx) / g.s + g.c[0]) * 10) / 10, Math.round((-(w.y - g.cy) / g.s + g.c[1]) * 10) / 10];
  };
  const scr = (p) => [geom.cx + (p[0] - geom.c[0]) * geom.s, geom.cy - (p[1] - geom.c[1]) * geom.s];

  function svgDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = App.store.get().ui.imar, c = ctl();
    if (v.mode === 'iso' && App.store.get().project.site.parcel) { drag = { kind: 'orbit', sx: e.clientX, sy: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false, id: e.pointerId }; return; }
    if (!geom || !v.tool) return;
    e.preventDefault();
    try { I.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    const p = planPt(e);
    if (v.tool === 'rect') { c.imarView({ draft: { a: p, b: p } }, true); drag = { kind: 'rect', id: e.pointerId }; return; }
    // çokgen
    const d = v.draft && v.draft.pts ? v.draft : { pts: [], cur: null };
    if (d.pts.length >= 3) {
      const f = scr(d.pts[0]), w = S.toWorld(I.svgEl, e);
      if (Math.hypot(f[0] - w.x, f[1] - w.y) < 14) { c.imarFinish(); return; }
    }
    c.imarView({ draft: { pts: d.pts.concat([p]), cur: p } }, true);
  }
  function svgMove(e) {
    const v = App.store.get().ui.imar, c = ctl();
    if (drag && drag.kind === 'orbit') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        try { I.svgEl.setPointerCapture(drag.id); } catch (err) {}
        I.orbiting = true;
      }
      c.imarView({ yaw: U.clamp(drag.yaw + dx * 0.32, -85, 85), pitch: U.clamp(drag.pitch - dy * 0.22, 20, 70) }, true);
      return;
    }
    if (!geom) return;
    if (drag && drag.kind === 'pv') { c.imarDragMove(drag.i, planPt(e)); return; }
    if (drag && drag.kind === 'rect' && v.draft && v.draft.a) { c.imarView({ draft: { a: v.draft.a, b: planPt(e) } }, true); return; }
    if (v.tool === 'draw' && v.draft && v.draft.pts && v.draft.pts.length) c.imarView({ draft: { pts: v.draft.pts, cur: planPt(e) } }, true);
  }
  function svgUp(e) {
    const c = ctl();
    const d = drag;
    drag = null;
    if (!d) return;
    try { I.svgEl.releasePointerCapture(d.id != null ? d.id : e.pointerId); } catch (err) {}
    if (d.kind === 'orbit') { I.orbiting = false; if (d.moved) c.imarView({}); return; }
    if (d.kind === 'pv') { c.imarDragEnd(); return; }
    if (d.kind === 'rect') {
      const v = App.store.get().ui.imar;
      if (v.draft && v.draft.a) c.imarRect(v.draft.a, planPt(e));
    }
  }
  function vertexDown(e, i) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = App.store.get().ui.imar;
    if (v.tool) return;
    e.stopPropagation();
    e.preventDefault();
    drag = { kind: 'pv', i: i, id: e.pointerId };
    try { I.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    ctl().imarDragStart(geom);
  }

  function draftNodes(v, C) {
    if (!geom || !v.draft) return null;
    const ink = App.PAL.ink, col = App.theme.name === 'glass' ? '#2A6BFF' : App.PAL.red;
    const out = [];
    if (v.draft.pts) {
      const pts = v.draft.pts.map(scr);
      const all = v.draft.cur && pts.length ? pts.concat([scr(v.draft.cur)]) : pts;
      if (all.length > 1) out.push(h('polyline', { key: 'dl', points: S.poly(all), fill: 'none', stroke: col, 'stroke-width': 2.4, 'stroke-dasharray': '7 5', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
      pts.forEach((q, i) => out.push(h('circle', { key: 'dc' + i, cx: q[0], cy: q[1], r: i === 0 && pts.length >= 3 ? 8 : 5, fill: i === 0 ? '#fff' : col, stroke: col, 'stroke-width': 2.2, 'pointer-events': 'none' })));
    } else if (v.draft.a) {
      const a = v.draft.a, b = v.draft.b;
      const p0 = scr(a), p1 = scr([b[0], b[1]]);
      out.push(h('rect', { key: 'dr', x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), width: Math.abs(p1[0] - p0[0]), height: Math.abs(p1[1] - p0[1]), fill: 'rgba(42,107,255,.12)', stroke: col, 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }));
      const w = Math.abs(b[0] - a[0]), d = Math.abs(b[1] - a[1]);
      out.push(h('text', { key: 'dt', x: (p0[0] + p1[0]) / 2, y: Math.min(p0[1], p1[1]) - 8, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: ink, 'font-family': 'var(--f-body)', 'pointer-events': 'none' }, fmt(w, 1) + ' × ' + fmt(d, 1) + ' m'));
    }
    void C;
    return h('g', { class: 'idraft' }, out);
  }

  I.board = function (state, d) {
    const P = state.project, s = P.site, v = state.ui.imar, c = ctl();
    const cx = S.imarCtx(state);
    const R = cx.R, A = cx.A;
    const mode = v.mode === 'iso' && s.parcel ? 'iso' : 'plan';
    const iso = mode === 'iso';
    const vv = Object.assign({}, v, { mode: mode });
    const sc = sceneOf(P, A, R, vv, !!I.orbiting);
    geom = sc.geom;
    const tool = v.tool;
    let hits = null;
    if (!iso && !tool) {
      hits = sc.hits.map((hi, i) => (hi.kind === 'edge'
        ? h('rect', { key: 'e' + i, class: 'ahit ahit-edge click', x: hi.x0, y: hi.y0, width: hi.x1 - hi.x0, height: hi.y1 - hi.y0, fill: 'transparent', onclick: () => c.imarEdge(hi.i) }, h('title', {}, 'Kenar ' + (hi.i + 1) + ': tıklayarak ön / yan / arka değiştir'))
        : h('circle', { key: 'v' + i, class: 'ahit ahit-pv', cx: hi.x, cy: hi.y, r: hi.r, fill: 'transparent', onpointerdown: (e) => vertexDown(e, hi.i) }, h('title', {}, 'Köşe ' + (hi.i + 1) + ': sürükleyerek taşı'))));
    }
    const noData = !cx.e && s.loc.src !== 'demo';
    const svg = h('svg', {
      id: 'pafta-imar', class: 'board-svg board-svg-imar' + (iso ? ' is-iso' : '') + (tool ? ' tool-' + tool : ''), viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', tabindex: 0,
      'aria-label': 'İmar ve kapasite paftası: ' + s.loc.name + (R.ok ? ', ' + R.floors + ' kat, emsal kullanımı yüzde ' + Math.round(Math.min(1, R.facts.emsalUse) * 100) : ', parsel bekleniyor'),
      ref: (el) => { I.svgEl = el; },
      onpointerdown: svgDown, onpointermove: svgMove, onpointerup: svgUp, onpointercancel: svgUp,
      ondblclick: () => { if (tool === 'draw') c.imarFinish(); },
      onkeydown: (e) => {
        const a = App.store.get().ui.imar, k = e.key;
        if (a.tool || !iso) return; // çizim tuşlarını belge düzeyindeki dinleyici yönetir
        if (k === 'ArrowLeft') { e.preventDefault(); c.imarView({ yaw: U.clamp(a.yaw - 4, -85, 85) }); }
        else if (k === 'ArrowRight') { e.preventDefault(); c.imarView({ yaw: U.clamp(a.yaw + 4, -85, 85) }); }
        else if (k === 'ArrowUp') { e.preventDefault(); c.imarView({ pitch: U.clamp(a.pitch + 3, 20, 70) }); }
        else if (k === 'ArrowDown') { e.preventDefault(); c.imarView({ pitch: U.clamp(a.pitch - 3, 20, 70) }); }
      },
    }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'ahits' }, hits), draftNodes(v));

    let overlay = null;
    if (!s.parcel && !tool) {
      overlay = ui.emptyCard('Parseli çizin', 'İmar ve kapasite hesabı için parsel gerekir. Paftada çizebilir ya da ölçülerini yazabilirsiniz; TAKS, KAKS, çekmeler ve yençok kütleyi otomatik oluşturur.', [
        ui.btn('Çokgen çiz', { icon: 'draw', cls: 'btn-primary', onclick: () => c.imarTool('draw') }),
        ui.btn('Dikdörtgen çiz', { icon: 'parcel', onclick: () => c.imarTool('rect') }),
        ui.btn('20 × 30 m parsel koy', { icon: 'plus', onclick: () => c.imarParcelRect(20, 30, 0) })], 'at-map');
    }
    const stage = h('div', { class: 'board-stage' + (tool ? ' tooling' : '') }, svg, overlay,
      noData && s.parcel && !overlay ? h('div', { class: 'an-chip warn' }, h('span', {}, 'Çevre verisi yok: yol cephesi ve gölge hesaplanamıyor'), ui.btn('Verileri çek', { icon: 'download', onclick: () => c.siteFetch(true) })) : null,
      S.exportMenu(state, S.EXPORTS.imar, (k) => c.siteExport('imar', k)));

    const hint = tool === 'draw' ? 'Köşelere tıklayın · ilk noktaya tıklayın, çift tıklayın ya da Enter ile bitirin · Backspace geri alır · Esc vazgeçer'
      : tool === 'rect' ? 'Bir köşeden karşı köşeye sürükleyin · Esc vazgeçer'
        : iso ? 'Sürükleyerek döndürün · ok tuşları da çalışır'
          : 'Yuvarlak köşe tutamaçlarını sürükleyerek parseli düzenleyin · kenar etiketine tıklayarak ön / yan / arka seçin';
    return ui.boardPage(state, d, {
      label: 'İmar ve kapasite paftası',
      stage: stage,
      scale: s.parcel ? 'Parsel ' + fmt(Math.abs(gis.area(s.parcel)), 0) + ' m² · ' + (cx.A && cx.A.demo ? 'demo veri' : cx.e ? S.sourceName(cx.e) : 'çevre verisi yok') : 'Parsel bekleniyor',
      foot: h('p', { class: 'board-hint' }, hint),
      tools: [
        { k: 'btn', label: 'Çokgen', icon: 'draw', onclick: () => c.imarTool(tool === 'draw' ? null : 'draw'), pressed: tool === 'draw', strong: tool === 'draw', title: 'Parsel çiz (çokgen)' },
        { k: 'btn', label: 'Dikdörtgen', icon: 'parcel', onclick: () => c.imarTool(tool === 'rect' ? null : 'rect'), pressed: tool === 'rect', strong: tool === 'rect', title: 'Parsel çiz (dikdörtgen)' },
        { k: 'sep' },
        s.parcel ? { k: 'seg', label: 'Görünüm kipi', value: mode, options: [{ v: 'plan', label: 'Plan' }, { v: 'iso', label: 'Kütle' }], onchange: (m) => c.imarView({ mode: m }) } : null,
        { k: 'btn', label: 'Gölge', icon: 'sun', onclick: () => c.imarView({ shadow: !v.shadow }), pressed: !!v.shadow, title: 'Gölgeyi göster / gizle' },
        S.here3dTool(),
        { k: 'btn', label: 'Dışa aktar', icon: 'download', onclick: () => c.xmenu(!state.ui.xmenu), disabled: !s.parcel, pressed: !!state.ui.xmenu, title: 'PNG, PDF, SVG, DXF, GeoJSON, CSV' },
        { k: 'icon', label: 'Bağlantıyı kopyala', icon: 'share', onclick: () => c.shareLink(), title: 'Bu konuma giden bağlantıyı kopyala' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ].filter(Boolean),
    });
  };
})();
