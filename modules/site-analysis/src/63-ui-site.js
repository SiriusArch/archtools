/* ==========================================================================
   63-ui-site.js — Modül 4 arayüzü: Arsa Analizi (+ Modül 4/5/6 ortak parçalar)
   Ortak: konum arama, durum satırı, dışa aktarma menüsü, türetilmiş bağlam (analiz / imar / yer seçimi) ve skor kadranları.
   Sol panel: Konum (arama, ayarlar) · Görünüm (kip, katmanlar, güneş, izometrik) · Bulgular.
   Pafta: App.siteScene.arsa primitifleri; izometrik kipte sürükle = döndür, levhaya tıkla = öne çıkar.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const site = App.site;
  const osm = App.osm;
  const sel = App.select;
  const Z = App.zoning;

  const ctl = () => App.ctl;
  const here = App.here;
  const S = (ui.site = {});

  /* ---------------- görünüm varsayılanları (state.ui içinde) ---------------- */
  App.siteUi = {
    arsa: () => ({ mode: 'map', layers: ['erisim', 'yapi', 'yesil', 'ulasim', 'islev'], labels: true, sunDay: 'yaz', sunHour: 15, parcel: true, yaw: 35, pitch: 38, explode: 1, zx: 1.6, sel: null, tab: 'konum', qa: [], hexCat: 'all' }),
    imar: () => ({ mode: 'plan', shadow: true, labels: true, handles: true, yaw: 35, pitch: 45, zx: 1, tab: 'parsel', tool: null, draft: null, fixed: null }),
    yer: () => ({ tab: 'adaylar', pick: null, step: 120, n: 5 }),
  };
  S.GEO0 = { busy: null, msg: '', err: null, q: '', results: [], tick: 0 };

  const pc = (v) => (v == null ? '—' : '%' + Math.round(v * 100));
  const level = (p, msgs) => (p == null ? msgs[0] : p >= 85 ? msgs[1] : p >= 70 ? msgs[2] : p >= 40 ? msgs[3] : msgs[4]);

  /* ---------------- türetilmiş bağlam (bellekli) ---------------- */
  S.analysis = function (state) {
    const s = state.project.site;
    const e = site.entry(s);
    return e ? site.analyze(s, e) : null;
  };

  let mImar = { k: null, v: null };
  S.imarCtx = function (state) {
    const s = state.project.site;
    const e = site.entry(s);
    const A = e ? site.analyze(s, e) : null;
    const k = [s.parcel, s.imar, e, A];
    if (mImar.k && mImar.k.every((x, i) => x === k[i])) return mImar.v;
    let R;
    if (s.parcel) R = Z.compute(s.imar, s.parcel, e ? { data: e.data, A: A, lat: e.data.lat0, parcel: s.parcel } : null);
    else R = { ok: false, reason: 'parcel', edges: [], A: 0, Aenv: 0, im: s.imar, items: [], counts: { hata: 0, uyari: 0, oneri: 0 } };
    mImar = { k: k, v: { R: R, A: A, e: e } };
    return mImar.v;
  };

  let mYer = { k: null, v: null };
  S.yerCtx = function (state) {
    const P = state.project;
    const s = P.site;
    const g = state.ui.geo || S.GEO0;
    const k = [P.cand, s.radius, s.walkMin, s.template, g.tick];
    if (mYer.k && mYer.k.every((x, i) => x === k[i])) return mYer.v;
    const set = sel.settingsOf(s);
    const cmp = sel.compare(P.cand, set);
    mYer = { k: k, v: { cmp: cmp, set: set } };
    return mYer.v;
  };
  // tarama sonucu denetleyicide saklanır (hesap pahalı): anahtar eşleşirse döner
  S.scan = function (state) { return ctl().yerScanFor ? ctl().yerScanFor(state) : null; };

  /* ---------------- skor kadranları ---------------- */
  ui.meterOpts.arsa = function (state) {
    const A = S.analysis(state);
    const g = state.ui.geo || S.GEO0;
    if (!A) return { label: 'Konum skoru', percent: null, msg: g.busy ? 'Konum verisi alınıyor…' : 'Konum verisi bekleniyor', chips: [], issues: 0 };
    const p = A.score;
    return {
      label: 'Konum skoru', percent: p,
      msg: level(p, ['Konum seçin', 'Çok iyi bir konum', 'İyi, birkaç zayıf yön var', 'Orta: bazı ihtiyaçlara yürüyerek ulaşılamıyor', 'Zayıf: günlük yaşam araç gerektiriyor']),
      chips: A.parts.slice(0, 4).map((x) => ({ label: x.label, value: pc(x.v), cls: 'dot' })),
      issues: A.counts.hata + A.counts.uyari, issuesText: 'uyarı · bulgulara git',
      onIssues: () => ctl().siteView({ tab: 'bulgular' }),
    };
  };

  ui.meterOpts.imar = function (state) {
    const c = S.imarCtx(state);
    const R = c.R, im = state.project.site.imar;
    if (!R.ok) return { label: 'Emsal kullanımı', percent: null, msg: R.reason === 'parcel' ? 'Önce parsel çizin' : R.reason === 'cekme' ? 'Çekmeler parseli tüketiyor' : 'Yapılabilir alan çok küçük', chips: [], issues: R.counts ? R.counts.hata + R.counts.uyari : 0, issuesText: 'uyarı · bulgulara git', onIssues: () => ctl().imarView({ tab: 'bulgular' }) };
    const f = R.facts, p = Math.round(Math.min(1, f.emsalUse) * 100);
    const use = Z.use(im.use);
    return {
      label: 'Emsal kullanımı', percent: p,
      msg: level(p, ['—', 'Emsal neredeyse tam kullanılıyor', 'Emsalin büyük kısmı kullanılıyor', 'Emsalin bir bölümü açıkta kalıyor', 'Emsalin çoğu kullanılamıyor']),
      chips: [
        { label: 'TAKS', value: fmt(f.taksUsed, 2) + '/' + fmt(im.taks, 2), cls: 'dot' },
        { label: 'KAKS', value: fmt(f.kaksUsed, 2) + '/' + fmt(im.kaks, 2), cls: 'dot' },
        { label: 'Kat', value: R.floors + ' · ' + fmt(R.height, 1) + ' m', cls: 'dot' },
        { label: use.unitName.charAt(0).toLocaleUpperCase('tr') + use.unitName.slice(1), value: String(f.units), cls: 'dot' },
      ],
      issues: R.counts.hata + R.counts.uyari, issuesText: 'uyarı · bulgulara git',
      onIssues: () => ctl().imarView({ tab: 'bulgular' }),
    };
  };

  ui.meterOpts.yer = function (state) {
    const P = state.project;
    const c = S.yerCtx(state);
    const mode = P.cand.mode;
    const sc = S.scan(state);
    if (mode === 'bul') {
      if (!sc) return { label: 'En iyi nokta', percent: null, msg: 'Tarama için “Tara” düğmesine basın', chips: [], issues: 0 };
      const p = sc.peaks.length ? sc.peaks[0].score : sc.max;
      return {
        label: 'En iyi nokta', percent: p,
        msg: sc.peaks.length ? sc.peaks.length + ' öneri noktası · ' + sc.passN + '/' + sc.validN + ' hücre filtreleri geçti' : 'Filtreleri geçen nokta yok',
        chips: [{ label: 'Taranan hücre', value: String(sc.validN), cls: 'dot' }, { label: 'Geçen', value: String(sc.passN), cls: 'dot' }, { label: 'Skor aralığı', value: '%' + sc.min + '–%' + sc.max, cls: 'dot' }],
        issues: 0,
      };
    }
    const cmp = c.cmp, best = cmp.best || cmp.ranked[0];
    const items = sel.findings(cmp, P.cand);
    const n = items.filter((i) => i.level === 'hata' || i.level === 'uyari').length;
    if (!P.cand.list.length) return { label: 'Yer skoru', percent: null, msg: 'Aday konum ekleyerek başlayın', chips: [], issues: 0 };
    return {
      label: 'Yer skoru', percent: best ? best.score : null,
      msg: best ? best.c.name + (cmp.best ? ' önde' : ' en yüksek skorlu (filtreleri geçmiyor)') : 'Aday verileri bekleniyor',
      chips: [{ label: 'Aday', value: String(P.cand.list.length), cls: 'dot' }, { label: 'Filtreyi geçen', value: String(cmp.ranked.filter((r) => r.pass).length), cls: 'dot' }, { label: 'Veri bekleyen', value: String(cmp.rows.filter((r) => !r.ready).length), cls: 'dot' }],
      issues: n, issuesText: 'uyarı · bulgulara git',
      onIssues: () => ctl().yerView({ tab: 'bulgular' }),
    };
  };

  /* ---------------- ortak parçalar ---------------- */
  S.status = function (state) {
    const g = state.ui.geo || S.GEO0;
    if (g.busy) return h('p', { class: 'geo-status busy', role: 'status' }, h('i', { class: 'spin', 'aria-hidden': 'true' }), h('span', {}, g.msg || 'Çalışıyor…'));
    if (g.err) return h('p', { class: 'geo-status err', role: 'alert' }, h('span', {}, g.err), ' ', h('button', { type: 'button', class: 'linkbtn', onclick: () => ctl().geoClear() }, 'Kapat'));
    return null;
  };

  // o: { id, placeholder, onPick(result), pickLabel, extra }
  S.searchBox = function (state, o) {
    const g = state.ui.geo || S.GEO0;
    const busy = g.busy === 'search';
    const mine = g.owner === state.ui.module;
    const results = mine ? g.results || [] : [];
    return h('div', { class: 'geo' },
      h('form', { class: 'geo-form', onsubmit: (e) => { e.preventDefault(); const v = e.target.elements.q.value; ctl().geoSearch(v, o.onPick); } },
        h('label', { class: 'sr', for: o.id }, 'Konum ara'),
        h('input', { id: o.id, name: 'q', class: 'inp geo-in', type: 'search', placeholder: o.placeholder || 'Adres, mahalle ya da 41.0082, 28.9784', value: mine ? g.q || '' : '', keep: true, autocomplete: 'off', enterkeyhint: 'search' }),
        h('button', { type: 'submit', class: 'btn btn-primary geo-go', disabled: busy, title: 'Ara' }, ui.icon('search', 16), h('span', { class: 'lbl-hide' }, 'Ara'))),
      results.length ? h('ul', { class: 'geo-res', 'aria-label': 'Arama sonuçları' }, results.map((r, i) => h('li', { key: i },
        h('button', { type: 'button', class: 'geo-item', onclick: () => o.onPick(r) },
          h('span', { class: 'geo-item-name' }, r.name),
          h('span', { class: 'geo-item-sub mono' }, r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) + (r.kind ? ' · ' + r.kind : '')),
          h('span', { class: 'geo-item-act' }, o.pickLabel || 'Seç'))))) : null,
      mine && g.q && !results.length && !busy && !g.err && g.searched ? h('p', { class: 'note' }, 'Sonuç bulunamadı. Adı daha ayrıntılı yazın ya da koordinat girin.') : null,
      S.status(state));
  };

  // Dışa aktarma menüsü: items [{ k, label, sub }]
  S.exportMenu = function (state, items, onpick) {
    if (!state.ui.xmenu) return null;
    return h('div', { class: 'xmenu', role: 'menu', 'aria-label': 'Dışa aktar' },
      h('div', { class: 'xmenu-head' }, h('b', {}, 'Dışa aktar'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => ctl().xmenu(false) }, ui.icon('close', 14))),
      h('ul', {}, items.map((it) => h('li', { key: it.k }, h('button', { type: 'button', role: 'menuitem', class: 'xmenu-i' + (it.strong ? ' strong' : ''), disabled: !!state.ui.busy, onclick: () => { ctl().xmenu(false); onpick(it.k); } },
        h('span', { class: 'xmenu-k mono' }, it.tag), h('span', { class: 'xmenu-t' }, h('b', {}, it.label), h('small', {}, it.sub)))))));
  };

  S.EXPORTS = {
    arsa: [
      { k: 'png', tag: 'PNG', label: 'Pafta görseli', sub: 'Sunum için yüksek çözünürlüklü resim' },
      { k: 'pdf', tag: 'PDF', label: 'Pafta (A3)', sub: 'Baskıya uygun yatay A3' },
      { k: 'svg', tag: 'SVG', label: 'Vektör pafta', sub: 'Illustrator / Inkscape’te düzenlenir' },
      { k: 'dxf', tag: 'DXF', label: 'CAD çizimi', sub: 'Katmanlı, metre birimli (AutoCAD, Rhino, Revit)', strong: true },
      { k: 'geojson', tag: 'GEO', label: 'GeoJSON', sub: 'QGIS / ArcGIS için gerçek koordinatlı katmanlar', strong: true },
      { k: 'kml', tag: 'KML', label: 'Google Earth (KML)', sub: 'Katmanlar klasör olarak Google Earth’te açılır' },
      { k: 'csv', tag: 'CSV', label: 'Tablo', sub: 'Skorlar, erişim süreleri, işlev listesi (Excel)' },
    ],
    imar: [
      { k: 'png', tag: 'PNG', label: 'Pafta görseli', sub: 'Sunum için yüksek çözünürlüklü resim' },
      { k: 'pdf', tag: 'PDF', label: 'Pafta (A3)', sub: 'Baskıya uygun yatay A3' },
      { k: 'svg', tag: 'SVG', label: 'Vektör pafta', sub: 'Illustrator / Inkscape’te düzenlenir' },
      { k: 'dxf', tag: 'DXF', label: 'CAD çizimi', sub: 'Parsel, zarf, kütle ve çevre (metre)', strong: true },
      { k: 'geojson', tag: 'GEO', label: 'GeoJSON', sub: 'Parsel ve kütle gerçek koordinatlarla', strong: true },
      { k: 'kml', tag: 'KML', label: 'Google Earth (KML)', sub: 'Katmanlar klasör olarak Google Earth’te açılır' },
      { k: 'csv', tag: 'CSV', label: 'Tablo', sub: 'Parametreler, alanlar, senaryolar (Excel)' },
    ],
    yer: [
      { k: 'png', tag: 'PNG', label: 'Pafta görseli', sub: 'Sunum için yüksek çözünürlüklü resim' },
      { k: 'pdf', tag: 'PDF', label: 'Pafta (A3)', sub: 'Baskıya uygun yatay A3' },
      { k: 'svg', tag: 'SVG', label: 'Vektör pafta', sub: 'Illustrator / Inkscape’te düzenlenir' },
      { k: 'geojson', tag: 'GEO', label: 'GeoJSON', sub: 'Adaylar ve tarama hücreleri (QGIS / ArcGIS)', strong: true },
      { k: 'kml', tag: 'KML', label: 'Google Earth (KML)', sub: 'Katmanlar klasör olarak Google Earth’te açılır' },
      { k: 'csv', tag: 'CSV', label: 'Tablo', sub: 'Sıralama, ölçütler, tarama hücreleri (Excel)' },
    ],
  };

  /* SVG yüzeyi ortak yardımcıları */
  S.toWorld = function (svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const poly = (pts) => pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  S.poly = poly;

  S.locCard = function (state) {
    const P = state.project, s = P.site, g = state.ui.geo || S.GEO0;
    const e = site.entry(s);
    return h('div', { class: 'loc-card' },
      h('div', { class: 'loc-top' },
        ui.icon('pin', 18),
        h('div', { class: 'loc-t' }, h('b', { class: 'loc-name' }, s.loc.name), h('span', { class: 'loc-sub mono' }, s.loc.lat.toFixed(5) + ', ' + s.loc.lon.toFixed(5))),
        h('span', { class: 'loc-tag' + (s.loc.src === 'demo' ? ' demo' : '') }, s.loc.src === 'demo' ? 'demo' : e ? (S.sourceName(e) === 'OpenStreetMap' ? 'OSM' : S.sourceName(e)) : here.active() ? 'HERE' : 'OSM')),
      s.loc.src === 'demo' ? h('p', { class: 'note' }, 'Sentetik bir kent: gerçek bir yeri temsil etmez. Gerçek veriyle çalışmak için yukarıdan konum arayın.') : h('p', { class: 'note' }, e ? 'Harita verisi bu tarayıcıda hazır' + (e.climate ? ' · iklim verisi var' : ' · iklim verisi alınamadı') + (e.elev ? ' · yükselti var' : ' · yükselti alınamadı') + '.' : 'Bu konumun verisi bu tarayıcıda yok; “Verileri çek” ile ' + (here.active() ? 'HERE’den' : 'OpenStreetMap’ten') + ' alınır.'),
      h('div', { class: 'loc-act' },
        s.loc.src === 'demo' ? ui.btn('Konum ara', { icon: 'search', onclick: () => { const el = document.getElementById('site-q'); if (el) el.focus(); } }) : ui.btn(e ? 'Verileri yenile' : 'Verileri çek', { icon: 'reset', cls: e ? '' : 'btn-primary', onclick: () => ctl().siteFetch(true), disabled: !!g.busy }),
        s.loc.src !== 'demo' ? ui.btn('Demo bölge', { icon: 'layers', onclick: () => ctl().siteDemo(), title: 'Sentetik demo kente dön' }) : null));
  };

  /* ---------------- sol panel ---------------- */
  function konumTab(state) {
    const P = state.project, s = P.site, c = ctl();
    const T = site.template(s.template);
    return [
      ui.section('Konum', h('div', { class: 'sec-box' },
        S.searchBox(state, { id: 'site-q', pickLabel: 'Analiz et', onPick: (r) => c.siteSetLoc(r) }),
        S.locCard(state)), null, 'sloc'),
      S.sourceSection(state),
      ui.section('Analiz ayarları', h('div', { class: 'sec-box' },
        ui.range({ id: 'site-r', label: 'Yarıçap', min: 250, max: 1000, step: 50, value: s.radius, text: s.radius + ' m', oninput: (v) => c.siteLive({ radius: v }), onchange: () => c.siteLiveEnd() }),
        ui.fld2('Yürüme süresi', ui.segmented({ label: 'Yürüme süresi', wide: true, value: s.walkMin, options: [{ v: 5, label: '5 dk' }, { v: 10, label: '10 dk' }, { v: 15, label: '15 dk' }], onchange: (v) => c.siteSet({ walkMin: v }) }), 'Erişim bantları 5 / 10 / 15 dakikalık yürüme (80 m/dk) ile çizilir; seçili süre skorda öne çıkar.'),
        ui.fld2('Program (ağırlıklar)', h('select', { id: 'site-tpl', class: 'inp', value: s.template, onchange: (e) => c.siteSet({ template: e.target.value }) }, site.TEMPLATES.map((t) => h('option', { key: t.id, value: t.id }, t.label))), T.sub || null)), null, 'sset'),
    ];
  }

  /* ---------------- 15 dakikalık şehir karnesi + Sor ---------------- */
  function karneTab(state, A) {
    const v = state.ui.site, c = ctl();
    if (!A) return [h('p', { class: 'note' }, 'Karne için önce konum verisi gerekli.')];
    const K = site.karne(A);
    const rows = K.rows.map((r) => h('li', { key: r.id, class: 'kn-row kn-' + r.st },
      h('span', { class: 'kn-l' }, r.label),
      h('span', { class: 'kn-bar', 'aria-hidden': 'true' }, h('i', { style: { width: (r.min == null ? 0 : Math.max(6, Math.min(100, 100 - (r.min / 15) * 100 + 6))) + '%' } })),
      h('span', { class: 'kn-m mono' }, r.min == null ? '—' : (r.min < 10 ? fmt(r.min, 1) : Math.round(r.min)) + ' dk'),
      h('span', { class: 'kn-n' }, (r.name ? r.name + ' · ' : '') + site.KARNE_STATUS[r.st] + (r.c10 ? ' · 10 dk içinde ' + r.c10 : ''))));
    const qa = v.qa || [];
    const submit = () => { const el = document.getElementById('site-ask'); if (!el) return; const t = el.value.trim(); if (t) { c.siteAsk(t); el.value = ''; } };
    return [
      ui.section('15 dakikalık şehir karnesi', h('div', { class: 'sec-box' },
        h('div', { class: 'kn-head' }, h('b', { class: 'kn-grade' }, K.grade), h('div', {}, h('b', {}, '%' + K.pct + ' · ' + K.pass + '/' + K.total + ' ihtiyaç 15 dk içinde'), h('p', { class: 'note' }, K.label + '.'))),
        h('ul', { class: 'kn-list' }, rows),
        h('p', { class: 'note' }, 'Yürüme süresi gerçek yol ağı üzerinden, 80 m/dk ile hesaplanır. Harita verisinde eksik nokta olabilir.')), null, 'skarne'),
      ui.section('Sor', h('div', { class: 'sec-box' },
        h('p', { class: 'note' }, 'Çözümlenen veriden yanıtlayan kural tabanlı soru kutusu (yapay zekâ değildir; yalnızca hesaplanmış sayıları okur).'),
        h('div', { class: 'ask-row' },
          h('input', { id: 'site-ask', class: 'inp', type: 'text', maxlength: 120, placeholder: site.ASK_EXAMPLES[0], keep: true, autocomplete: 'off', 'aria-label': 'Soru', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } } }),
          ui.btn('Sor', { icon: 'check', cls: 'btn-primary', onclick: submit })),
        h('div', { class: 'ask-ex' }, site.ASK_EXAMPLES.map((q) => h('button', { key: q, type: 'button', class: 'chip', onclick: () => c.siteAsk(q) }, q))),
        qa.length ? h('ul', { class: 'ask-list', 'aria-live': 'polite' }, qa.slice().reverse().map((x) => h('li', { key: x.id, class: 'ask-i' },
          h('p', { class: 'ask-q' }, x.q), h('p', { class: 'ask-a' }, x.a),
          x.go ? h('button', { type: 'button', class: 'act-btn', onclick: () => c.siteGo(x.go) }, x.go.label) : null))) : null), null, 'sask'),
    ];
  }

  function gorunumTab(state, A) {
    const v = state.ui.site, c = ctl(), s = state.project.site;
    const iso = v.mode === 'iso';
    const secs = [
      ui.section('Görünüm', h('div', { class: 'sec-box' },
        ui.fld2('Kip', ui.segmented({ label: 'Görünüm kipi', wide: true, value: v.mode, options: [{ v: 'map', label: 'Harita', title: 'Düz plan, katmanlar üst üste' }, { v: 'iso', label: 'Katmanlar', title: 'İzometrik, her katman ayrı levha' }], onchange: (m) => c.siteMode(m) }),
          iso ? 'Seçili katmanlar levha levha açılır; sürükleyerek döndürün.' : 'Seçili katmanlar tek haritada üst üste çizilir.'),
        h('div', { class: 'tgl-row' },
          ui.toggle({ label: 'Etiketler', on: v.labels, onclick: () => c.siteView({ labels: !v.labels }), title: 'Yol ve işlev adları' }),
          s.parcel ? ui.toggle({ label: 'Parsel', on: v.parcel, onclick: () => c.siteView({ parcel: !v.parcel }) }) : null))),
      ui.section('Katmanlar', h('ul', { class: 'lyrs' }, site.LAYERS.map((l) => {
        const on = v.layers.indexOf(l.id) >= 0;
        return h('li', { key: l.id }, h('button', { type: 'button', class: 'lyr' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => c.siteLayer(l.id) },
          h('i', { class: 'lyr-box', 'aria-hidden': 'true' }, on ? ui.icon('check', 12) : null),
          h('span', { class: 'lyr-t' }, h('b', {}, l.name), h('small', {}, l.sub))));
      })), v.layers.length + '/' + site.LAYERS.length, 'slayers'),
    ];
    if (v.layers.indexOf('yogunluk') >= 0) {
      secs.push(ui.section('İşlev yoğunluğu', h('div', { class: 'sec-box' },
        ui.fld2('İşlev türü', h('select', { id: 'site-hexcat', class: 'inp', value: v.hexCat || 'all', onchange: (e) => c.siteView({ hexCat: e.target.value }) }, [h('option', { key: 'all', value: 'all' }, 'Tümü')].concat(App.osm.CATS.map((k) => h('option', { key: k.id, value: k.id }, k.label)))), 'Altıgen hücre başına işlev noktası sayısı; koyu hücreler daha yoğun.')), null, 'shex'));
    }
    if (v.layers.indexOf('gunes') >= 0) {
      secs.push(ui.section('Güneş', h('div', { class: 'sec-box' },
        ui.fld2('Gün', ui.segmented({ label: 'Gün', wide: true, value: v.sunDay, options: App.gis.SUN_DAYS.map((d) => ({ v: d.id, label: d.label })), onchange: (x) => c.siteView({ sunDay: x }) })),
        ui.range({ id: 'site-hour', label: 'Saat', min: 6, max: 19, step: 0.5, value: v.sunHour, text: fmt(v.sunHour, 1).replace(',0', '') + ':' + (v.sunHour % 1 ? '30' : '00'), oninput: (x) => c.siteView({ sunHour: x }, true), onchange: () => c.siteView({}) }),
        A ? h('p', { class: 'note' }, 'Binalar harita verisindeki yüksekliklere göre gölge düşürür; kat bilgisi olmayanlar tahmin edilir.') : null), null, 'ssun'));
    }
    if (iso) {
      secs.push(ui.section('İzometrik', h('div', { class: 'sec-box' },
        ui.range({ id: 'site-explode', label: 'Levha aralığı', min: 0, max: 100, step: 1, value: Math.round(v.explode * 100), text: '%' + Math.round(v.explode * 100), oninput: (x) => { c.siteCancel(); c.siteView({ explode: x / 100 }, true); }, onchange: () => c.siteView({}) }),
        ui.range({ id: 'site-yaw', label: 'Dönüş', min: -85, max: 85, step: 1, value: Math.round(v.yaw), text: Math.round(v.yaw) + '°', oninput: (x) => { c.siteCancel(); c.siteView({ yaw: x }, true); }, onchange: () => c.siteView({}) }),
        ui.range({ id: 'site-pitch', label: 'Bakış yüksekliği', min: 20, max: 70, step: 1, value: Math.round(v.pitch), text: Math.round(v.pitch) + '°', oninput: (x) => { c.siteCancel(); c.siteView({ pitch: x }, true); }, onchange: () => c.siteView({}) }),
        ui.range({ id: 'site-zx', label: 'Yükseklik abartısı', min: 1, max: 4, step: 0.1, value: v.zx, text: '×' + fmt(v.zx, 1), oninput: (x) => c.siteView({ zx: x }, true), onchange: () => c.siteView({}), hint: 'Bina ve arazi yüksekliğini görünür kılmak için büyütür.' }))), null, 'siso');
    }
    return secs;
  }

  S.sidebar = function (state) {
    const A = S.analysis(state);
    const v = state.ui.site;
    const tab = v.tab || 'konum';
    const c = A ? A.counts : { hata: 0, uyari: 0, oneri: 0 };
    const tabs = ui.tabsBar([
      { id: 'konum', label: 'Konum' },
      { id: 'gorunum', label: 'Görünüm' },
      { id: 'karne', label: 'Karne' },
      { id: 'bulgular', label: 'Bulgular', n: A ? c.hata + c.uyari + c.oneri : null, warn: c.hata + c.uyari > 0 },
    ], tab, (id) => ctl().siteView({ tab: id }));
    let body;
    if (tab === 'konum') body = konumTab(state);
    else if (tab === 'gorunum') body = gorunumTab(state, A);
    else if (tab === 'karne') body = karneTab(state, A);
    else body = A ? [ui.findingList({ items: A.items, counts: A.counts }, 'Yürüme erişimi, toplu taşıma, yeşil alan, gürültü göstergesi ve çevre dokusunun seçili programa göre kontrolü.')] : [h('p', { class: 'note' }, 'Bulgular için önce konum verisi gerekli.')];
    return ui.sideShell('sb-arsa', 'Arsa analizi paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, A, v, orbiting) {
    const key = [P.site, P.meta.name, A, App.theme.name, v, orbiting];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: App.siteScene.arsa(P, A, Object.assign({}, v, { lod: orbiting }), true) };
    return memo.v;
  }

  let orbit = null;
  function orbitDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const v = App.store.get().ui.site;
    if (v.mode !== 'iso') return;
    orbit = { sx: e.clientX, sy: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false, id: e.pointerId };
  }
  function orbitMove(e) {
    if (!orbit) return;
    const dx = e.clientX - orbit.sx, dy = e.clientY - orbit.sy;
    if (!orbit.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      orbit.moved = true;
      ctl().siteCancel();
      try { S.svgEl.setPointerCapture(orbit.id); } catch (err) {}
      S.orbiting = true;
    }
    ctl().siteOrbit(dx, dy, orbit);
  }
  function orbitUp() {
    if (!orbit) return;
    const o = orbit;
    orbit = null;
    S.orbiting = false;
    try { S.svgEl.releasePointerCapture(o.id); } catch (err) {}
    if (o.moved) ctl().siteView({}); // kalıcı kaydet + son (ayrıntılı) çizim
  }

  S.noData = function (state, title) {
    const P = state.project, s = P.site, g = state.ui.geo || S.GEO0;
    if (g.busy) return ui.emptyCard(g.busy === 'fetch' ? 'Konum verisi alınıyor' : 'Aranıyor', g.msg || 'Lütfen bekleyin…', []);
    return ui.emptyCard(title || 'Konum verisi yok', '“' + s.loc.name + '” için harita verisi bu tarayıcıda hazır değil. ' + (here.active() ? 'HERE’den (eksikse OpenStreetMap’ten)' : 'OpenStreetMap’ten') + ' alınır (yaklaşık ' + (site.fetchRadius(s)) + ' m yarıçap); birkaç saniye sürer.' + (g.err ? ' ' + g.err : ''), [
      ui.btn('Verileri çek', { icon: 'download', cls: 'btn-primary', onclick: () => ctl().siteFetch(true) }),
      ui.btn('Demo bölgeyi aç', { icon: 'layers', onclick: () => ctl().siteDemo() })]);
  };

  S.board = function (state, d) {
    const P = state.project, s = P.site, v = state.ui.site, c = ctl();
    const A = S.analysis(state);
    const iso = v.mode === 'iso';
    let stage;
    if (!A) {
      stage = h('div', { class: 'board-stage' }, h('div', { class: 'board-ghost' }), S.noData(state));
    } else {
      const sc = sceneOf(P, A, v, !!S.orbiting);
      let hits = null;
      if (sc.mode === 'iso') {
        hits = sc.hits.map((hi, i) => h('polygon', { key: 'h' + i, class: 'ahit ahit-slab click', points: poly(hi.pts), fill: 'transparent', onclick: () => c.siteView({ sel: v.sel === hi.id ? null : hi.id }) }));
      } else {
        hits = sc.hits.map((hi, i) => h('circle', { key: 'p' + i, class: 'ahit', cx: hi.x, cy: hi.y, r: hi.r, fill: 'transparent' }, h('title', {}, hi.label)));
      }
      const svg = h('svg', {
        id: 'pafta-arsa', class: 'board-svg board-svg-arsa' + (iso ? ' is-iso' : ''), viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', tabindex: 0,
        'aria-label': 'Arsa analizi paftası: ' + s.loc.name + ', konum skoru yüzde ' + A.score + (iso ? '. Ok tuşları döndürür.' : '.'),
        ref: (el) => { S.svgEl = el; },
        onpointerdown: orbitDown, onpointermove: orbitMove, onpointerup: orbitUp, onpointercancel: orbitUp,
        onkeydown: (e) => {
          if (!iso) return;
          const a = App.store.get().ui.site, k = e.key;
          if (k === 'ArrowLeft') { e.preventDefault(); c.siteView({ yaw: U.clamp(a.yaw - 4, -85, 85) }); }
          else if (k === 'ArrowRight') { e.preventDefault(); c.siteView({ yaw: U.clamp(a.yaw + 4, -85, 85) }); }
          else if (k === 'ArrowUp') { e.preventDefault(); c.siteView({ pitch: U.clamp(a.pitch + 3, 20, 70) }); }
          else if (k === 'ArrowDown') { e.preventDefault(); c.siteView({ pitch: U.clamp(a.pitch - 3, 20, 70) }); }
          else if (k === '+' || k === '=') { e.preventDefault(); c.siteCancel(); c.siteView({ explode: U.clamp(a.explode + 0.08, 0, 1) }); }
          else if (k === '-' || k === '_') { e.preventDefault(); c.siteCancel(); c.siteView({ explode: U.clamp(a.explode - 0.08, 0, 1) }); }
        },
      }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'ahits' }, hits));
      stage = h('div', { class: 'board-stage' + (iso ? ' is-layers' : '') }, svg,
        iso && v.sel ? h('div', { class: 'an-chip' }, h('b', {}, (site.LAYERS.find((l) => l.id === v.sel) || {}).name || ''), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Seçimi kaldır', onclick: () => c.siteView({ sel: null }) }, ui.icon('close', 14))) : null,
        S.exportMenu(state, S.EXPORTS.arsa, (k) => c.siteExport('arsa', k)));
    }
    return ui.boardPage(state, d, {
      label: 'Arsa analizi paftası',
      stage: stage,
      scale: A ? S.sourceFull(site.entry(state.project.site)) : 'Veri bekleniyor',
      foot: h('p', { class: 'board-hint' }, iso ? 'Sürükleyerek döndürün · bir levhaya tıklayarak öne çıkarın · ok ve +/− tuşları da çalışır' : 'Yuvarlak işaretlerin üzerine gelince ad ve yürüme süresi görünür · katmanları “Görünüm” sekmesinden açıp kapatın'),
      tools: [
        { k: 'seg', label: 'Görünüm kipi', value: v.mode, options: [{ v: 'map', label: 'Harita' }, { v: 'iso', label: 'Katmanlar' }], onchange: (m) => c.siteMode(m) },
        { k: 'sep' },
        iso ? { k: 'btn', label: v.explode > 0.5 ? 'Topla' : 'Aç', icon: 'layers', strong: true, onclick: () => c.siteToggleExplode(), title: 'Levhaları aç / kapat (animasyonlu)' } : null,
        iso ? { k: 'icon', label: 'Görünümü sıfırla', icon: 'reset', onclick: () => c.siteResetView(), title: 'Dönüş ve eğimi varsayılana al' } : null,
        S.here3dTool(),
        { k: 'btn', label: 'Dışa aktar', icon: 'download', onclick: () => c.xmenu(!state.ui.xmenu), disabled: !A, pressed: !!state.ui.xmenu, title: 'PNG, PDF, SVG, DXF, GeoJSON, CSV' },
        { k: 'icon', label: 'Bağlantıyı kopyala', icon: 'share', onclick: () => c.shareLink(), title: 'Bu konuma giden bağlantıyı kopyala' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ].filter(Boolean),
    });
  };
})();
