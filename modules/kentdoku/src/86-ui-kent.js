/* ==========================================================================
   86-ui-kent.js — Modül 12 arayüzü: Kent Dokusu
   Haritadan seçilen alanın bina, yol, su ve yeşil verisinden vaziyet paftası, analiz haritaları,
   3B bağlam modeli ve alan özeti üretir.
   Sol panel: Konum · Görünüm · Dışa aktar. Pafta: Harita · Pafta · 3B · Özet.
   Harita (Leaflet), SVG pafta ve 3B tuval sanal DOM dışında yaşar; ref ile bağlanır (bkz. 87-ctl-kent.js).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const kent = App.kent;
  const rt = kent.rt;
  const ctl = () => App.ctl;
  const K = (ui.kent = {});

  const nf = (v, d) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const note = (t, cls) => h('p', { class: 'note' + (cls ? ' ' + cls : '') }, t);

  /* ---------------- skor kadranı ---------------- */
  ui.meterOpts.kent = function (state) {
    const k = kent.of(state), m = rt.metrics, d = rt.data;
    if (!d || !m) return { label: 'Taban alanı oranı', percent: null, msg: k.busy ? k.busy.msg : 'Haritadan bir alan seçip paftayı oluşturun', chips: [], issues: 0 };
    return {
      label: 'Taban alanı oranı', percent: Math.round(m.coverage * 100),
      msg: nf(m.count) + ' bina · ' + d.meta.w + '×' + d.meta.h + ' m · ' + nf(m.ha, 1) + ' hektar',
      chips: [
        { label: 'Bina', value: nf(m.count), cls: 'dot' },
        { label: 'Yoğunluk', value: nf(m.far, 2), cls: 'dot' },
        { label: 'Ort. yükseklik', value: nf(m.meanHeight, 1) + ' m', cls: 'dot' },
        { label: 'Yeşil', value: '%' + nf(m.green * 100), cls: 'dot' },
      ],
      issues: 0, issuesText: '', onIssues: null,
    };
  };

  /* ---------------- sol panel: Konum ---------------- */
  function konumTab(state, k) {
    const c = ctl(), d = kent.dims(k);
    const res = k.results;
    return [
      ui.section('Konum', h('div', { class: 'sec-box' },
        h('label', { class: 'sr', for: 'kent-q' }, 'Adres, mahalle, şehir ya da koordinat'),
        h('input', { id: 'kent-q', class: 'inp', type: 'search', autocomplete: 'off', placeholder: 'örn. Kaleiçi, Edirne', value: k.q, keep: true,
          oninput: (e) => c.kentQuery(e.target.value), onkeydown: (e) => { if (e.key === 'Enter') c.kentQuery(e.target.value, true); } }),
        k.searching ? note('Aranıyor…') : null,
        res && !res.length ? note('Sonuç bulunamadı. Haritayı sürükleyerek de konum seçebilirsiniz.') : null,
        res && res.length ? h('ul', { class: 'kent-res' }, res.map((r, i) => h('li', { key: i },
          h('button', { type: 'button', class: 'kent-res-b', onclick: () => c.kentPick(r) }, h('b', {}, r.name), h('span', {}, r.label))))) : null,
        note(k.lat.toFixed(5) + '° K, ' + k.lon.toFixed(5) + '° D', 'mono')), null, 'kloc'),
      ui.section('Alan', h('div', { class: 'sec-box' },
        ui.fld2('Genişlik', h('select', { id: 'kent-size', class: 'inp', value: String(k.size), onchange: (e) => c.kentArea({ size: Number(e.target.value) }) },
          kent.SIZES.map((s) => h('option', { key: s, value: String(s) }, s + ' m')))),
        ui.fld2('Oran', ui.segmented({ label: 'Pafta oranı', wide: true, value: k.ratio, options: kent.RATIOS, onchange: (v) => c.kentArea({ ratio: v }) })),
        ui.fld2('Altlık', ui.segmented({ label: 'Harita altlığı', wide: true, value: k.base, options: [{ v: 'sokak', label: 'Sokak' }, { v: 'uydu', label: 'Uydu' }], onchange: (v) => c.kentBase(v) })),
        note('Çizilecek alan: ' + d.w + ' × ' + d.h + ' m. Haritadaki çerçeve bu alanı gösterir.'),
        ui.btn(k.has ? 'Paftayı yeniden oluştur' : 'Paftayı oluştur', { icon: 'target', cls: 'btn-primary btn-wide', onclick: () => c.kentGenerate(), disabled: !!k.busy })), d.w + '×' + d.h, 'karea'),
    ];
  }

  /* ---------------- sol panel: Görünüm ---------------- */
  function swatch(id, st, on) {
    const bld = st.bld === 'none' ? st.bldStroke : st.bld;
    return h('button', { key: id, type: 'button', class: 'kent-sw' + (on ? ' on' : ''), 'aria-pressed': String(on), title: st.ad, onclick: () => ctl().kentStyle(id) },
      h('span', { class: 'kent-sw-c', 'aria-hidden': 'true' },
        h('i', { style: { background: st.bg } }), h('i', { style: { background: bld } }), h('i', { style: { background: st.water } })),
      h('span', { class: 'kent-sw-l' }, st.ad));
  }
  function gorunumTab(state, k) {
    const c = ctl(), eng = rt.eng;
    const cur = kent.MODES.find((m) => m[0] === k.mode) || kent.MODES[0];
    return [
      ui.section('Harita türü', h('div', { class: 'sec-box' },
        h('div', { class: 'kent-chips', role: 'group', 'aria-label': 'Harita türü' },
          kent.MODES.map((m) => h('button', { key: m[0], type: 'button', class: 'sgm-b kent-chip' + (m[0] === k.mode ? ' on' : ''), 'aria-pressed': String(m[0] === k.mode), onclick: () => c.kentMode(m[0]) }, m[1]))),
        note(cur[2])), null, 'kmode'),
      ui.section('Pafta stili', h('div', { class: 'sec-box' },
        eng ? h('div', { class: 'kent-sws' }, Object.keys(eng.STYLES).map((id) => swatch(id, eng.STYLES[id], id === k.style))) : note('Stiller yükleniyor…')), null, 'kstyle'),
      ui.section('Katmanlar', h('div', { class: 'sec-box' },
        h('div', { class: 'tgl-row' }, kent.LAYERS.map((l) => ui.toggle({ label: l[1], on: !!k.layers[l[0]], onclick: () => c.kentLayer(l[0]) }))),
        k.layers.topo && rt.data && !(rt.site && rt.site.terrain) ? note(rt.site ? 'Yükseklik verisi alınamadı.' : 'Yükseklik verisi yükleniyor…') : null), null, 'klayers'),
    ];
  }

  /* ---------------- sol panel: Dışa aktar ---------------- */
  function aktarTab(state, k) {
    const c = ctl(), m = rt.data ? rt.data.meta : kent.dims(k);
    const off = !k.has || !!k.busy;
    return [
      ui.section('Dışa aktar', h('div', { class: 'sec-box' },
        ui.fld2('PDF ölçeği', h('select', { id: 'kent-scale', class: 'inp', value: String(k.scale), onchange: (e) => c.kentSet({ scale: Number(e.target.value) }) },
          kent.SCALES.map((s) => h('option', { key: s, value: String(s) }, '1:' + s))),
          'PDF sayfası: ' + Math.round(m.w * 1000 / k.scale) + ' × ' + Math.round(m.h * 1000 / k.scale) + ' mm'),
        h('div', { class: 'kent-exp' }, kent.EXPORTS.map((x) => h('button', { key: x[0], type: 'button', class: 'btn kent-exp-b', disabled: off, title: x[1] + ' · ' + x[2], onclick: () => c.kentExport(x[0]) },
          h('b', {}, x[1]), h('span', {}, x[2])))),
        note(k.has ? 'Pafta çıktıları (SVG, PDF, PNG) ekrandaki harita türü ve stille iner. Model birimi metredir.' : 'Dışa aktarmak için önce paftayı oluşturun.')), null, 'kexp'),
      ui.section('Veri kaynakları', h('div', { class: 'sec-box' },
        note('Binalar: Overture Maps ve GlobalBuildingAtlas (TU Münih). Yol, su ve yeşil: Overture Maps, © OpenStreetMap katkıcıları. İklim, yükseklik ve hava: Open-Meteo. Deprem: USGS.'),
        note('Bina yükseklikleri uydu görüntüsünden kestirilir ve ticari olmayan kullanım lisansıyla yayımlanmıştır; kesin ölçü gereken işlerde yerinde doğrulayın.')), null, 'ksrc'),
    ];
  }

  K.sidebar = function (state) {
    const k = kent.of(state), c = ctl();
    const tabs = ui.tabsBar([
      { id: 'konum', label: 'Konum' },
      { id: 'gorunum', label: 'Görünüm' },
      { id: 'aktar', label: 'Dışa aktar' },
    ], k.tab, (id) => c.kentSet({ tab: id }));
    const body = k.tab === 'gorunum' ? gorunumTab(state, k) : k.tab === 'aktar' ? aktarTab(state, k) : konumTab(state, k);
    return ui.sideShell('sb-kent', 'Kent dokusu paneli', tabs, body);
  };

  /* ---------------- alan özeti ---------------- */
  const dot = (color, label) => h('span', { class: 'kent-lg' }, h('i', { class: 'kent-dot', style: { background: color } }), label);
  function metric(label, value, sub) {
    return h('div', { class: 'kent-metric', key: label }, h('span', { class: 'kent-mk' }, label), h('b', { class: 'kent-mv' }, value), h('span', { class: 'kent-ms' }, sub));
  }
  function ozet(state, k) {
    const eng = rt.eng, S = eng.Site, m = rt.data.meta, bm = rt.metrics, st = rt.site;
    const cl = st && st.climate, t = st && st.terrain;
    const wait = st ? 'veri alınamadı' : 'yükleniyor…';
    const pills = [];
    if (cl) pills.push(cl.koppen.code + ' · ' + cl.koppen.ad, nf(cl.tMean, 1) + ' °C ortalama, ' + nf(cl.rain) + ' mm yağış', 'Hakim rüzgar ' + cl.wind.top);
    pills.push('Yazın ' + S.fmtHours(S.dayLength(m.lat, 172)) + ' gün ışığı');
    if (t) pills.push('Deniz seviyesinden ' + nf(t.center) + ' m');
    if (!st) pills.push('İklim ve arazi verisi yükleniyor…');
    return h('div', { class: 'kent-oz' },
      h('header', { class: 'kent-oz-head' },
        h('h2', { class: 'kent-oz-title' }, k.name || 'Seçili alan'),
        h('span', { class: 'kent-oz-coord mono' }, m.lat.toFixed(4) + ', ' + m.lon.toFixed(4) + ' · ' + m.w + '×' + m.h + ' m')),
      h('div', { class: 'kent-pills' }, pills.map((p, i) => h('span', { key: i, class: 'kent-pill' }, p))),
      h('div', { class: 'kent-cards' },
        h('section', { class: 'kent-card kent-card-wide' }, h('h3', { class: 'panel-title' }, 'İklim' + (cl ? ', ' + cl.year : '')),
          cl ? h('div', { class: 'kent-chart', html: S.climateChart(cl) }) : note(wait),
          cl ? h('div', { class: 'kent-lgs' }, dot('#D8432B', 'Ortalama sıcaklık'), dot('#F4B8A6', 'Günlük aralık'), dot('#BFD3F7', 'Yağış')) : null),
        h('section', { class: 'kent-card' }, h('h3', { class: 'panel-title' }, 'Rüzgar gülü'),
          cl ? h('div', { class: 'kent-chart', html: S.windRose(cl.wind) }) : note(wait),
          cl ? note('Çoğunlukla ' + cl.wind.top + ' yönünden (günlerin %' + nf(cl.wind.topShare * 100) + ' kadarı). Günlük en yüksek hız ortalaması ' + nf(cl.wind.peak) + ' km/sa.') : null),
        h('section', { class: 'kent-card' }, h('h3', { class: 'panel-title' }, 'Güneş yolu'),
          h('div', { class: 'kent-chart', html: S.sunDiagram(m.lat) }),
          h('div', { class: 'kent-lgs' }, dot('#D8432B', '21 Haziran'), dot('#E89B3C', 'Ekinoks'), dot('#2F62D9', '21 Aralık')))),
      h('div', { class: 'kent-metrics' },
        metric('Yapılaşma', nf(bm.count) + ' bina', nf(bm.ha, 1) + ' hektarda'),
        metric('Taban alanı oranı', '%' + nf(bm.coverage * 100), 'TAKS benzeri, alanın tamamına göre'),
        metric('Yapı yoğunluğu', nf(bm.far, 2), 'KAKS benzeri (toplam kat alanı / alan)'),
        metric('Ortalama bina yüksekliği', nf(bm.meanHeight, 1) + ' m', 'en yüksek ' + nf(bm.maxHeight) + ' m'),
        metric('Yeşil alan', '%' + nf(bm.green * 100), 'park, koru ve çim alanlar'),
        metric('Yol ağı', nf(bm.roadKm, 1) + ' km', bm.stops + ' durak'),
        metric('İklim tipi', cl ? cl.koppen.code : '—', cl ? cl.koppen.ad : wait),
        metric('Isıtma · soğutma', cl ? nf(cl.hdd) + ' · ' + nf(cl.cdd) : '—', cl ? 'derece-gün, 18 °C taban' : wait),
        metric('Güneş enerjisi', cl ? nf(cl.solar) + ' kWh/m²' : '—', cl ? 'yıllık, yatay yüzeyde' : wait),
        metric('Arazi', t ? nf(t.relief) + ' m kot farkı' : '—', t ? 'en dik eğim %' + nf(t.grade, 1) + ', zemin ' + nf(t.min) + '–' + nf(t.max) + ' m' : wait),
        metric('Hava kalitesi', st && st.air ? nf(st.air.pm25, 1) + ' µg/m³' : '—', st && st.air ? 'PM2.5, son 92 gün · DSÖ kılavuzunun ' + nf(st.air.pm25 / 5, 1) + ' katı' : wait),
        metric('Deprem geçmişi', st && st.quakes ? nf(st.quakes.count) + ' deprem' : '—', st && st.quakes ? '100 km içinde, M4.5+, 1976 sonrası' : wait)),
      note('Oranlar çizilen alanın tamamına göre hesaplanır; imar durumu yerine geçmez. Bina verisi: ' + m.source + '.'));
  }

  /* ---------------- pafta ---------------- */
  K.board = function (state, d) {
    const k = kent.of(state), c = ctl(), has = !!rt.data, view = k.view;
    const cls = (id) => 'kent-view kent-' + id + (view === id ? ' on' : '');
    let overlay = null;
    if (k.busy) {
      overlay = ui.emptyCard(k.busy.title || 'Hazırlanıyor', k.busy.msg || '', [
        h('div', { class: 'kent-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round((k.busy.frac || 0) * 100) }, h('i', { style: { width: Math.round((k.busy.frac || 0) * 100) + '%' } }))], 'kent-busy');
    } else if (!has && view !== 'map') {
      overlay = ui.emptyCard('Önce bir alan seçin', 'Haritada konumu bulun, çerçeveyi arsanın üzerine getirin ve paftayı oluşturun.', [
        ui.btn('Haritaya dön', { icon: 'pin', cls: 'btn-primary', onclick: () => c.kentView('map') })]);
    }
    const stage = h('div', { class: 'kent-slot' },
      h('div', { key: 'kv-map', class: cls('map'), ref: (el) => c.kentMapRef(el) }),
      h('div', { key: 'kv-plan', class: cls('plan'), ref: (el) => { rt.planEl = el; }, onwheel: c.kentWheel, onpointerdown: c.kentDown, onpointermove: c.kentDrag, onpointerup: c.kentUp, onpointercancel: c.kentUp },
        h('div', { class: 'kent-paper', ref: (el) => { rt.paperEl = el; c.kentApplyPZ(); }, html: rt.svg || '' })),
      h('div', { key: 'kv-model', class: cls('model'), ref: (el) => c.kentModelRef(el) }),
      h('div', { key: 'kv-ozet', class: cls('ozet') }, view === 'ozet' && has && rt.eng ? ozet(state, k) : null),
      overlay);

    const m = has ? rt.data.meta : null;
    const hint = view === 'map' ? 'Haritayı sürükleyin; çerçeve çizilecek alandır · “Paftayı oluştur” ile veriyi indirin'
      : view === 'plan' ? 'Tekerlek ile yakınlaştırın, sürükleyerek kaydırın · harita türü ve stil sol panelde'
        : view === 'model' ? 'Sol tuş: döndür · sağ tuş: kaydır · tekerlek: yakınlaştır'
          : 'İklim, arazi ve yapılaşma özeti seçili alan için hesaplanır';
    return ui.boardPage(state, d, {
      label: 'Kent dokusu paftası',
      stage: stage,
      scale: m ? nf(rt.data.buildings.length) + ' bina · ' + m.w + '×' + m.h + ' m' : 'Alan seçilmedi',
      foot: h('p', { class: 'board-hint' }, hint),
      tools: [
        { k: 'seg', label: 'Görünüm', value: view, options: [{ v: 'map', label: 'Harita' }, { v: 'plan', label: 'Pafta' }, { v: 'model', label: '3B' }, { v: 'ozet', label: 'Özet' }], onchange: (v) => c.kentView(v) },
        { k: 'sep' },
        { k: 'btn', label: has ? 'Yeniden oluştur' : 'Paftayı oluştur', icon: 'target', strong: true, onclick: () => c.kentGenerate(), disabled: !!k.busy, title: 'Çerçevedeki alanın verisini indir ve çiz' },
        view === 'plan' ? { k: 'icon', label: 'Sığdır', icon: 'expand', onclick: () => c.kentFit(), disabled: !has, title: 'Paftayı ekrana sığdır' } : null,
        view === 'model' ? { k: 'btn', label: 'Aksonometrik', icon: 'cube', onclick: () => c.kentAxo(), disabled: !has, pressed: !!k.axo, title: 'Perspektif / aksonometrik' } : null,
        view === 'model' ? { k: 'icon', label: 'Görünümü sıfırla', icon: 'reset', onclick: () => c.kentReset3d(), disabled: !has, title: 'Kamerayı başlangıç konumuna al' } : null,
        view === 'model' ? { k: 'icon', label: 'Görüntü al', icon: 'copy', onclick: () => c.kentShot(), disabled: !has, title: '3B görünümü PNG olarak indir' } : null,
        { k: 'sep' },
        { k: 'btn', label: 'Dışa aktar', icon: 'download', onclick: () => c.kentSet({ tab: 'aktar' }), disabled: !has, title: 'SVG, PDF, PNG, DXF, OBJ, GLB, STL, GeoJSON' },
      ],
    });
  };
})();
