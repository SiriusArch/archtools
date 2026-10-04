/* ==========================================================================
   67-ui-yer.js — Modül 6 arayüzü: Yer Seçimi
   İki kip (project.cand.mode):
     Karşılaştır — aday konumlar Arsa Analizi ölçütleriyle sıralanır; filtre ve ağırlıkla elenir/ağırlanır.
     Konum bul   — seçili konumun çevresinde ızgara taraması: skor ısı haritası ve en iyi noktalar.
   Sol panel: Adaylar · Ölçütler · Bulgular. Pafta: App.selScene (çoklu harita + sıralama ya da ısı haritası).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const site = App.site;
  const sel = App.select;
  const ctl = () => App.ctl;
  const S = ui.site;
  const Y = (ui.yer = {});

  const NOISE = { sessiz: 'Sessiz', orta: 'Orta', gurultulu: 'Gürültülü' };
  const srcLabel = (c) => (c.src === 'demo' ? 'demo' : c.src === 'tarama' ? 'tarama önerisi' : c.src === 'osm' ? 'adres' : 'koordinat');

  /* ---------------- aday kartı ---------------- */
  function candCard(state, row) {
    const P = state.project, c = row.c, on = P.cand.sel === c.id;
    const rank = row.rank;
    const body = row.ready
      ? h('div', { class: 'cc-res' },
        h('b', { class: 'cc-score mono' }, '%' + row.score),
        h('span', { class: 'cc-state ' + (row.pass ? 'ok' : 'bad') }, row.pass ? 'Filtreleri geçti' : 'Elendi'),
        row.fail.length ? h('p', { class: 'cc-fail' }, row.fail.join(' · ')) : null,
        row.strong && row.strong.length ? h('p', { class: 'cc-sw good' }, '▲ ' + row.strong.map((x) => x.label).join(', ')) : null,
        row.weak && row.weak.length ? h('p', { class: 'cc-sw weak' }, '▼ ' + row.weak.map((x) => x.label).join(', ')) : null)
      : h('div', { class: 'cc-res' }, h('span', { class: 'cc-state wait' }, 'Veri bekliyor'),
        ui.btn('Verileri çek', { icon: 'download', onclick: () => ctl().selFetch([c.id]), disabled: !!(state.ui.geo && state.ui.geo.busy) }));
    return h('li', { key: c.id, class: 'cc' + (on ? ' sel' : '') + (row.ready && !row.pass ? ' out' : '') },
      h('div', { class: 'cc-top' },
        h('span', { class: 'cc-rank mono' + (rank === 1 && row.pass ? ' first' : '') }, rank ? String(rank) : '–'),
        h('label', { class: 'sr', for: 'cn-' + c.id }, 'Aday adı'),
        h('input', { id: 'cn-' + c.id, class: 'inp cc-name', type: 'text', maxlength: 60, value: c.name, keep: true, onfocus: () => ctl().candSelect(c.id), onchange: (e) => ctl().candRename(c.id, e.target.value), onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('button', { type: 'button', class: 'icon-btn', title: 'Adayı sil', 'aria-label': c.name + ' adayını sil', onclick: () => ctl().candRemove(c.id) }, ui.icon('trash', 15))),
      h('p', { class: 'cc-sub mono' }, c.lat.toFixed(4) + ', ' + c.lon.toFixed(4) + ' · ' + srcLabel(c)),
      body,
      h('div', { class: 'cc-act' }, ui.btn('Arsa analizinde aç', { icon: 'chevron', onclick: () => ctl().candOpen(c.id), title: 'Bu adayı Arsa Analizi’nde ayrıntılı incele' })));
  }

  function candidatesSection(state, cx) {
    const P = state.project, rows = cx.cmp.rows;
    const g = state.ui.geo || S.GEO0;
    return ui.section('Adaylar', h('div', { class: 'sec-box' },
      rows.length ? h('ul', { class: 'cands' }, rows.map((r) => candCard(state, r))) : h('p', { class: 'note' }, 'Henüz aday yok. Bir adres arayın, mevcut konumu ekleyin ya da demo adaylarla deneyin.'),
      rows.length && rows.some((r) => !r.ready) ? ui.btn('Eksik verileri çek', { icon: 'download', cls: 'btn-wide', onclick: () => ctl().selFetch(), disabled: !!g.busy }) : null,
      rows.length >= 2 ? ui.btn('Tümünü temizle', { icon: 'trash', cls: 'btn-wide', onclick: () => ctl().candClear() }) : null), rows.length + '/8', 'ycands');
  }

  function addSection(state) {
    const P = state.project, s = P.site, c = ctl();
    const full = P.cand.list.length >= 8;
    const already = P.cand.list.some((x) => (s.loc.src === 'demo' ? x.src === 'demo' && x.dx === s.loc.dx && x.dy === s.loc.dy : Math.abs(x.lat - s.loc.lat) < 1e-4 && Math.abs(x.lon - s.loc.lon) < 1e-4));
    return ui.section('Aday ekle', h('div', { class: 'sec-box' },
      S.searchBox(state, { id: 'yer-q', pickLabel: full ? 'Dolu' : 'Aday ekle', placeholder: 'Aday adres ya da koordinat', onPick: (r) => c.candAdd(r) }),
      h('div', { class: 'tool-row' },
        ui.btn('Arsa konumunu ekle', { icon: 'pin', onclick: () => c.candAddSite(), disabled: full || already, title: 'Arsa Analizi’ndeki geçerli konum: ' + s.loc.name }),
        ui.btn('Demo adaylar', { icon: 'layers', onclick: () => c.candDemo(), disabled: full, title: 'Sentetik kentte üç aday ekle' })),
      full ? h('p', { class: 'note' }, 'En çok sekiz aday karşılaştırılır.') : null), null, 'yadd');
  }

  function scanSection(state, cx) {
    const P = state.project, s = P.site, c = ctl();
    const e = site.entry(s);
    const g = state.ui.geo || S.GEO0;
    const sc = c.yerScanFor(state), stale = c.yerScanStale(state);
    const peaks = sc ? sc.peaks : [];
    return ui.section('Konum tarama', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Tarama, “' + s.loc.name + '” çevresinde ızgara hücrelerinin yaklaşık skorunu hesaplar (yürüme ağına dayalı). Merkezi değiştirmek için Arsa Analizi’nde konum seçin.'),
      ui.range({ id: 'yer-step', label: 'Izgara aralığı', min: 60, max: 250, step: 10, value: P.cand.scan.step, text: P.cand.scan.step + ' m', oninput: (x) => c.candScanLive({ step: x }), onchange: () => c.candLiveEnd(), hint: 'Küçük aralık daha ayrıntılı, daha yavaş.' }),
      ui.range({ id: 'yer-n', label: 'Öneri sayısı', min: 1, max: 8, step: 1, value: P.cand.scan.n, text: String(P.cand.scan.n), oninput: (x) => c.candScanLive({ n: x }), onchange: () => c.candLiveEnd() }),
      ui.btn(sc && !stale ? 'Yeniden tara' : 'Tara', { icon: 'target', cls: 'btn-primary btn-wide', onclick: () => c.yerRun(), disabled: !e || !!g.busy, title: e ? 'Izgara taramasını başlat' : 'Önce konum verisi gerekli' }),
      stale ? h('p', { class: 'note warn' }, 'Ayarlar değişti; sonuç eski. Yeniden tarayın.') : null,
      sc && !stale ? h('div', { class: 'kv-grid' },
        h('div', {}, h('span', { class: 'kv-k' }, 'Hücre'), h('b', { class: 'kv-v mono' }, String(sc.validN))),
        h('div', {}, h('span', { class: 'kv-k' }, 'Filtreyi geçen'), h('b', { class: 'kv-v mono' }, String(sc.passN))),
        h('div', {}, h('span', { class: 'kv-k' }, 'Skor'), h('b', { class: 'kv-v mono' }, '%' + sc.min + '–%' + sc.max))) : null,
      sc && !stale ? (peaks.length ? h('ul', { class: 'peaks' }, peaks.map((p, i) => h('li', { key: i, class: 'peak' },
        h('span', { class: 'cc-rank mono' + (i === 0 ? ' first' : '') }, String(i + 1)),
        h('span', { class: 'peak-s mono' }, '%' + p.score),
        h('span', { class: 'peak-xy mono' }, Math.round(p.x) + ', ' + Math.round(p.y) + ' m'),
        h('button', { type: 'button', class: 'btn', onclick: () => c.yerPick({ x: p.x, y: p.y }), title: 'Haritada ayrıntıyı göster' }, 'Göster'),
        h('button', { type: 'button', class: 'btn', onclick: () => c.yerPeakToCand(i), disabled: P.cand.list.length >= 8, title: 'Aday olarak ekle ve karşılaştırmaya al' }, 'Aday yap')))) : h('p', { class: 'note' }, 'Filtreleri geçen nokta yok. “Ölçütler” sekmesinden eşikleri gevşetin.')) : null), null, 'yscan');
  }

  function adaylarTab(state, cx) {
    const P = state.project, c = ctl();
    const out = [ui.section('Kip', h('div', { class: 'sec-box' },
      ui.segmented({ label: 'Yer seçimi kipi', wide: true, value: P.cand.mode, options: [{ v: 'karsilastir', label: 'Karşılaştır', title: 'Aday konumları sırala' }, { v: 'bul', label: 'Konum bul', title: 'Çevrede en uygun noktayı tara' }], onchange: (m) => c.candMode(m) }),
      h('p', { class: 'note' }, P.cand.mode === 'bul' ? 'Seçili konumun çevresini tarar; en uygun noktaları ısı haritasında gösterir.' : 'Aday konumların aynı ölçütlerle puanlanıp sıralanmasını sağlar.')), null, 'ymode')];
    if (P.cand.mode === 'bul') out.push(scanSection(state, cx));
    out.push(addSection(state));
    out.push(candidatesSection(state, cx));
    return out;
  }

  /* ---------------- ölçütler ---------------- */
  function olcutTab(state, cx) {
    const P = state.project, s = P.site, c = ctl(), cand = P.cand;
    const w = cx.cmp.w;
    const T = site.template(s.template);
    const out = [];
    out.push(S.sourceSection(state));
    out.push(ui.section('Analiz ayarları', h('div', { class: 'sec-box' },
      ui.fld2('Program', h('select', { id: 'yer-tpl', class: 'inp', value: s.template, onchange: (e) => c.siteSet({ template: e.target.value }) }, site.TEMPLATES.map((t) => h('option', { key: t.id, value: t.id }, t.label))), T.desc),
      ui.range({ id: 'yer-r', label: 'Yarıçap', min: 250, max: 1000, step: 50, value: s.radius, text: s.radius + ' m', oninput: (x) => c.siteLive({ radius: x }), onchange: () => c.siteLiveEnd() }),
      ui.fld2('Yürüme süresi', ui.segmented({ label: 'Yürüme süresi', wide: true, value: s.walkMin, options: [{ v: 5, label: '5 dk' }, { v: 10, label: '10 dk' }, { v: 15, label: '15 dk' }], onchange: (v) => c.siteSet({ walkMin: v }) })),
      h('p', { class: 'note' }, 'Bu ayarlar Arsa Analizi ile ortaktır; tüm adaylara aynı ölçüde uygulanır.')), null, 'yset'));
    out.push(ui.section('Ağırlıklar', h('div', { class: 'sec-box' },
      site.PARTS.map((p) => ui.range({ id: 'yw-' + p.id, label: p.label, min: 0, max: 100, step: 5, value: Math.round((w[p.id] || 0) * 100), text: '%' + Math.round((w[p.id] || 0) * 100), hint: null, oninput: (x) => c.candWeightLive(p.id, x / 100), onchange: () => c.candLiveEnd() })),
      h('p', { class: 'note' }, 'Ağırlıklar toplamı otomatik 1’e oranlanır. ' + (cand.w ? 'Özel ağırlıklar kullanılıyor.' : '“' + T.label + '” programının ağırlıkları kullanılıyor.')),
      cand.w ? ui.btn('Programdan al', { icon: 'reset', cls: 'btn-wide', onclick: () => c.candWeightReset() }) : null), cand.w ? 'özel' : null, 'yw'));
    out.push(ui.section('Filtreler', h('div', { class: 'sec-box' },
      h('p', { class: 'note' }, 'Açık filtreler eşiği geçemeyen adayları (ve tarama hücrelerini) eler.'),
      sel.FILTERS.map((fl) => {
        const on = !!cand.f.on[fl.id], v = cand.f.v[fl.id];
        const text = fl.ord ? NOISE[sel.NOISE_ORD[Math.round(v)]] : fl.id === 'skor' ? '%' + Math.round(v) : Math.round(v) + ' dk';
        return h('div', { key: fl.id, class: 'flt' + (on ? ' on' : '') },
          ui.toggle({ label: fl.label, on: on, onclick: () => c.candFilter(fl.id, { on: !on }), title: fl.sub }),
          on ? ui.range({ id: 'yf-' + fl.id, label: fl.id === 'skor' ? 'En az' : 'En çok', min: fl.id === 'gurultu' ? 0 : fl.id === 'skor' ? 0 : 1, max: fl.max, step: fl.step, value: v, text: text, hint: null, oninput: (x) => c.candFilterLive(fl.id, x), onchange: () => c.candLiveEnd() }) : null);
      })), null, 'yflt'));
    return out;
  }

  Y.sidebar = function (state) {
    const cx = S.yerCtx(state);
    const P = state.project;
    const items = sel.findings(cx.cmp, P.cand);
    const cn = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { if (cn[i.level] != null) cn[i.level]++; });
    const tab = state.ui.yer.tab || 'adaylar';
    const tabs = ui.tabsBar([
      { id: 'adaylar', label: 'Adaylar', n: P.cand.list.length || null },
      { id: 'olcut', label: 'Ölçütler' },
      { id: 'bulgular', label: 'Bulgular', n: P.cand.list.length ? cn.hata + cn.uyari + cn.oneri : null, warn: cn.hata + cn.uyari > 0 },
    ], tab, (id) => ctl().yerView({ tab: id }));
    let body;
    if (tab === 'adaylar') body = adaylarTab(state, cx);
    else if (tab === 'olcut') body = olcutTab(state, cx);
    else body = [ui.findingList({ items: items, counts: cn }, 'Aday konumların sıralaması, filtre sonuçları ve karar için dikkat edilecek noktalar.')];
    return ui.sideShell('sb-yer', 'Yer seçimi paneli', tabs, body);
  };

  /* ---------------- pafta ---------------- */
  let memo = { k: null, v: null };
  function sceneOf(P, cx, scan, entry, view) {
    const key = [P.site, P.cand, P.meta.name, cx.cmp, scan, entry, App.theme.name, view];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    memo = { k: key, v: App.selScene.scene(P, { cmp: cx.cmp, scan: scan, entry: entry }, view, true) };
    return memo.v;
  }

  Y.board = function (state, d) {
    const P = state.project, s = P.site, cand = P.cand, c = ctl();
    const cx = S.yerCtx(state);
    const mode = cand.mode;
    const entry = site.entry(s);
    const scan = mode === 'bul' ? c.yerScanFor(state) : null;
    const g = state.ui.geo || S.GEO0;
    let stage;
    if (mode === 'bul' && !entry) stage = h('div', { class: 'board-stage' }, h('div', { class: 'board-ghost' }), S.noData(state, 'Tarama için konum verisi gerekli'));
    else {
      const view = { mode: mode, pick: state.ui.yer.pick };
      const sc = sceneOf(P, cx, scan, entry, view);
      Y.geom = sc.geom;
      const hits = (sc.hits || []).map((hi, i) => {
        if (hi.kind === 'cand') return h('rect', { key: 'c' + i, class: 'ahit click', x: hi.x0, y: hi.y0, width: hi.x1 - hi.x0, height: hi.y1 - hi.y0, fill: 'transparent', onclick: () => c.candSelect(hi.id) });
        if (hi.kind === 'peak') return h('circle', { key: 'p' + i, class: 'ahit click', cx: hi.x, cy: hi.y, r: Math.max(hi.r, 10), fill: 'transparent', onclick: (e) => { e.stopPropagation(); c.yerPick({ x: hi.cx, y: hi.cy }); } });
        return null;
      });
      const svg = h('svg', {
        id: 'pafta-yer', class: 'board-svg board-svg-yer', viewBox: '0 0 ' + sc.W + ' ' + sc.H, preserveAspectRatio: 'xMidYMid meet', role: 'group', tabindex: 0,
        'aria-label': mode === 'bul' ? 'Yer seçimi paftası: ' + s.loc.name + ' çevresinde konum taraması' : 'Yer seçimi paftası: ' + cand.list.length + ' aday karşılaştırması',
        ref: (el) => { Y.svgEl = el; },
        onclick: (e) => {
          if (mode !== 'bul' || !scan || !sc.geom) return;
          const w = S.toWorld(Y.svgEl, e), gm = sc.geom;
          const px = (w.x - gm.cx) / gm.s, py = -(w.y - gm.cy) / gm.s;
          if (Math.hypot(px, py) > gm.R) { if (state.ui.yer.pick) c.yerPick(null); return; }
          const half = scan.step / 2;
          const cell = scan.cells.find((q) => q.score != null && Math.abs(q.x - px) <= half && Math.abs(q.y - py) <= half);
          c.yerPick(cell ? { x: cell.x, y: cell.y } : null);
        },
      }, sc.prims.map((p) => App.board.primToV(p)), h('g', { class: 'ahits' }, hits));
      let overlay = null;
      if (mode === 'karsilastir' && !cand.list.length) {
        overlay = ui.emptyCard('Karşılaştırılacak aday yok', 'Aday konumları adres ya da koordinatla ekleyin; aynı ölçütlerle puanlanıp sıralanır. Hemen denemek için demo adaylar da var.', [
          ui.btn('Demo adayları ekle', { icon: 'layers', cls: 'btn-primary', onclick: () => c.candDemo() }),
          ui.btn('Arsa konumunu ekle', { icon: 'pin', onclick: () => c.candAddSite() })], 'at-map');
      } else if (mode === 'bul' && !scan && !g.busy) {
        overlay = ui.emptyCard('Konum taraması', '“' + s.loc.name + '” çevresinde ızgara hücrelerinin skorunu hesaplar; en uygun noktaları ısı haritasında gösterir.', [
          ui.btn('Taramayı başlat', { icon: 'target', cls: 'btn-primary', onclick: () => c.yerRun() })], 'at-map');
      } else if (g.busy === 'scan') {
        overlay = ui.emptyCard('Taranıyor', g.msg || 'Hücreler hesaplanıyor…', [], 'at-map');
      }
      stage = h('div', { class: 'board-stage' }, svg, overlay, S.exportMenu(state, S.EXPORTS.yer, (k) => c.siteExport('yer', k)));
    }
    const best = cx.cmp.best || cx.cmp.ranked[0];
    return ui.boardPage(state, d, {
      label: 'Yer seçimi paftası',
      stage: stage,
      scale: mode === 'bul' ? (scan ? 'Izgara ' + scan.step + ' m · ' + scan.validN + ' hücre' : 'Tarama bekleniyor') : cand.list.length + ' aday' + (best ? ' · en iyi %' + best.score : ''),
      foot: h('p', { class: 'board-hint' }, mode === 'bul' ? 'Haritada bir hücreye tıklayarak ayrıntısını görün · numaralı noktalar en uygun öneriler' : 'Bir aday kartına tıklayarak vurgulayın · sıralama ağırlık ve filtrelere göre güncellenir'),
      tools: [
        { k: 'seg', label: 'Yer seçimi kipi', value: mode, options: [{ v: 'karsilastir', label: 'Karşılaştır' }, { v: 'bul', label: 'Konum bul' }], onchange: (m) => c.candMode(m) },
        { k: 'sep' },
        mode === 'bul' ? { k: 'btn', label: scan ? 'Yeniden tara' : 'Tara', icon: 'target', strong: true, onclick: () => c.yerRun(), disabled: !entry || !!g.busy, title: 'Izgara taramasını çalıştır' } : { k: 'btn', label: 'Aday ekle', icon: 'plus', strong: true, onclick: () => { c.yerView({ tab: 'adaylar' }); setTimeout(() => { const el = document.getElementById('yer-q'); if (el) el.focus(); }, 40); }, title: 'Aday konum ekle' },
        S.here3dTool(),
        { k: 'btn', label: 'Dışa aktar', icon: 'download', onclick: () => c.xmenu(!state.ui.xmenu), disabled: mode === 'bul' ? !scan : !cx.cmp.ranked.length, pressed: !!state.ui.xmenu, title: 'PNG, PDF, SVG, GeoJSON, CSV' },
        { k: 'icon', label: 'Bağlantıyı kopyala', icon: 'share', onclick: () => c.shareLink(), title: 'Bu konuma giden bağlantıyı kopyala' },
        { k: 'sep' },
        { k: 'icon', label: 'Geri al', icon: 'undo', onclick: () => c.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' },
        { k: 'icon', label: 'İleri al', icon: 'redo', onclick: () => c.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' },
      ],
    });
  };
})();
