/* ==========================================================================
   39-lib-i-fizscene.js — Maliyet ve Fizibilite paftası (Modül 8)
   Kipler: ozet (gösterge paneli) · nakit (aylık nakit akışı) · duyarlilik (ısı haritası + kasırga) · metraj (kalem tablosu)
   Girdi: project, ctx = App.fizCtx(project) ({ res, d, a, dc }), view, live. Çıktı: { prims, hits, W, H }.
   Birim fiyatlar kullanıcıya aittir; varsayılanlar ÖRNEK etiketiyle uyarı bandında gösterilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const fmt = U.fmt;
  const FS = (App.fizScene = {});
  const SD = () => App.siteDraw;
  const SS = () => App.siteScene;
  const sheet = () => App.sheet;

  FS.money = function (v, cur) {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    const n = a >= 1e9 ? fmt(a / 1e9, 2) + ' Mr' : a >= 1e6 ? fmt(a / 1e6, 2) + ' Mn' : a >= 1e4 ? fmt(a / 1e3, 0) + ' bin' : fmt(a, 0);
    return s + n + (cur ? ' ' + cur : '');
  };
  const money = FS.money;
  const pct = (v, d) => (v < 0 ? '−' : '') + '%' + fmt(Math.abs(v) * 100, d == null ? 1 : d);
  const GROUP = { kaba: 'Kaba yapı', ince: 'İnce işler ve cephe', tesisat: 'Tesisat ve asansör', dis: 'Çevre ve otopark' };

  function info(project, f, C, mode) {
    const r = f.res, a = f.a;
    const nm = { ozet: 'özet', nakit: 'nakit akışı', duyarlilik: 'duyarlılık', metraj: 'metraj ve maliyet' }[mode];
    const cov = a.targetMargin > 0 ? Math.max(0, Math.min(100, Math.round((r.margin / a.targetMargin) * 100))) : (r.margin > 0 ? 100 : 0);
    return {
      name: project.meta.name,
      subtitle: 'Maliyet ve fizibilite · ' + nm + ' · ' + f.dc.alt.label,
      legend: [{ label: 'Maliyet', fill: C.glass ? C.ink : App.PAL.red }, { label: 'Gelir', fill: C.glass ? '#878B94' : App.PAL.blue }, { label: 'Kâr / nakit', fill: C.glass ? '#4E5159' : App.PAL.green }],
      stats: [['Mal./m²', money(r.costPerM2, '')], ['Satış/m²', money(r.salePerM2, '')], ['Marj', pct(r.margin, 1)]],
      scoreLabel: 'Hedef marj', percent: cov,
    };
  }

  /* kart zemini */
  function card(x, y, w, h, C) {
    return C.glass
      ? [{ t: 'rect', x: x, y: y, w: w, h: h, rx: 22, fill: '#FFFFFF', stroke: C.ink, sw: 1, opacity: 1 }]
      : [{ t: 'rect', x: x, y: y, w: w, h: h, fill: C.paper, stroke: C.ink, sw: 3 }];
  }
  const txt = (x, y, s, o) => Object.assign({ t: 'text', x: x, y: y, s: s, size: 12.5, weight: 600, fam: 'b', fill: '#000' }, o || {});

  function title(x, y, w, s, C) { return SS().panelTitle(x, y, w, s, C); }

  /* sağ sütun: temel göstergeler */
  function rightColumn(f, C) {
    const P = [];
    const X = 1018, W = 340, r = f.res, a = f.a, cur = a.currency;
    title(X, 56, W, 'Temel göstergeler', C).forEach((p) => P.push(p));
    const rows = [
      ['Toplam inşaat alanı', fmt(f.d.built + f.d.basementArea, 0) + ' m²'],
      ['Satılabilir alan', fmt(r.revenue.sellable || 0, 0) + ' m²'],
      ['Doğrudan maliyet', money(r.hard, cur)],
      ['Dolaylı giderler', money(r.soft, cur)],
      ['Arsa + tapu', money(r.land + r.landTax, cur)],
      ['Finansman gideri', money(r.finance, cur)],
      ['Maliyet / m² (brüt)', money(r.costPerM2, cur)],
      ['Net satış / m²', money(r.salePerM2, cur)],
      ['Kâr', money(r.profit, cur)],
      ['Kâr marjı (gelire göre)', pct(r.margin)],
      ['Getiri (maliyete göre)', pct(r.roiOnCost)],
      ['Başabaş satış fiyatı', money(r.breakEven.pricePerM2, cur + '/m²')],
      ['Artık arsa değeri', r.residualLand > 0 ? money(r.residualLand, cur) : '—'],
      ['Özkaynak / kredi', money(r.equity, '') + ' / ' + money(r.debt, cur)],
      ['Zirve fonlama', money(r.peakFunding, cur)],
      ['NPV (iskonto %' + Math.round(a.finance.disc * 100) + ')', money(r.npv, cur)],
      ['IRR (yıllık)', r.irr == null ? '—' : pct(r.irr)],
      ['Geri ödeme', r.paybackMonth == null ? '—' : r.paybackMonth + '. ay'],
    ];
    rows.forEach((q, i) => SS().kv(X, 84 + i * 21, W, q[0], q[1], C).forEach((p) => P.push(p)));
    let y = 84 + rows.length * 21 + 22;
    title(X, y, W, 'Uyarılar', C).forEach((p) => P.push(p));
    y += 24;
    (r.warnings || []).slice(0, 5).forEach((w) => {
      const lines = wrap(w, 52);
      lines.slice(0, 3).forEach((ln, i) => { if (y < 842) P.push(txt(X, y + i * 14, (i ? '' : '• ') + ln, { size: 11, weight: 500, fill: C.ink, opacity: 0.8 })); });
      y += Math.min(3, lines.length) * 14 + 4;
    });
    return P;
  }
  function wrap(s, n) {
    const words = String(s).split(' '), out = [];
    let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) out.push(cur);
    return out;
  }

  /* örnek-fiyat bandı */
  function banner(f, C, y) {
    const r = f.res;
    const sample = !r.changed || !r.changed.length;
    const s = sample ? 'ÖRNEK birim fiyatlar ve varsayımlar kullanılıyor: kendi değerlerinizle değiştirmeden karar vermeyin. ' + (r.disclaimer || '') : (r.disclaimer || '');
    // ölçülü iki satır: ikincisi sığmazsa kısaltılır
    const MAXW = 1316, words = s.split(/\s+/).filter(Boolean), lines = [''];
    words.forEach((wd) => { const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd; if (App.sheet.tw(t, 11.5, 700, 'b', 0) <= MAXW || !lines[lines.length - 1]) lines[lines.length - 1] = t; else lines.push(wd); });
    const out = lines.slice(0, 2);
    if (lines.length > 2) out[1] = App.sheet.clip(lines.slice(1).join(' '), MAXW, 11.5, 700, 'b', 0);
    const st = { size: 11.5, weight: 700, fill: sample ? (C.glass ? C.ink : App.PAL.red) : C.ink, opacity: sample ? 1 : 0.6 };
    return out.map((ln, i) => txt(40, y - (out.length - 1 - i) * 15, ln, st));
  }

  /* ---------------- ÖZET ---------------- */
  FS.ozet = function (project, f, view, live) {
    const C = SD().cols(), tb = sheet().tb, D = SD();
    const r = f.res, a = f.a, cur = a.currency;
    const prims = sheet().frame(info(project, f, C, 'ozet'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    // KPI karoları
    const tiles = [
      ['Toplam maliyet', money(r.total, cur), fmt(r.costPerM2, 0) + ' ' + cur + '/m²', false],
      ['Net satış geliri', money(r.revenue.net, cur), 'ortalama ' + fmt(r.salePerM2, 0) + ' ' + cur + '/m²', false],
      [r.profit >= 0 ? 'Kâr' : 'Zarar', money(r.profit, cur), 'marj ' + pct(r.margin) + ' · hedef ' + pct(a.targetMargin, 0), r.profit < 0],
      ['Başabaş satış fiyatı', fmt(r.breakEven.pricePerM2, 0) + ' ' + cur, (r.breakEven.uplift >= 0 ? 'ortalamanın %' + fmt(r.breakEven.uplift * 100, 0) + ' üzerinde gerek' : 'ortalamanın %' + fmt(-r.breakEven.uplift * 100, 0) + ' altında'), false],
    ];
    const tw = (940 - 3 * 14) / 4;
    tiles.forEach((t, i) => {
      const x = 40 + i * (tw + 14), y = 64;
      add(card(x, y, tw, 100, C));
      add([txt(x + 16, y + 26, t[0], { size: 12, weight: 600, fill: C.ink, opacity: 0.6 }), txt(x + 16, y + 62, t[1], { size: 24, weight: 800, fill: t[3] ? (C.glass ? C.ink : App.PAL.red) : C.ink, fam: C.glass ? 'b' : 'd' }), txt(x + 16, y + 84, t[2], { size: 11.5, weight: 600, fill: C.ink, opacity: 0.65 })]);
    });
    // maliyet dağılımı
    const groups = {};
    r.boq.forEach((q) => { groups[q.group] = (groups[q.group] || 0) + q.amount; });
    const items = [];
    Object.keys(GROUP).forEach((g) => { if (groups[g]) items.push([GROUP[g], groups[g], 0]); });
    r.softItems.forEach((s) => { if (s.amount > 0) items.push([s.label, s.amount, 1]); });
    if (r.land + r.landTax > 0) items.push(['Arsa ve tapu harcı', r.land + r.landTax, 2]);
    if (r.finance > 0) items.push(['Finansman', r.finance, 3]);
    const cx = 40, cy = 180, cw = 460, ch = 28 + items.length * 21 + 18;
    add(card(cx, cy, cw, ch, C));
    title(cx + 16, cy + 24, cw - 32, 'Maliyet dağılımı', C).forEach((p) => prims.push(p));
    const maxA = Math.max.apply(null, items.map((q) => q[1]).concat([1]));
    const tone = C.glass ? ['#2E3036', '#80848E', '#B4B7BF', '#4E5159'] : [App.PAL.red, App.PAL.blue, App.PAL.yellow, App.PAL.green];
    items.forEach((q, i) => {
      const y = cy + 54 + i * 21;
      add([txt(cx + 16, y, q[0].length > 28 ? q[0].slice(0, 27) + '…' : q[0], { size: 12, fill: C.ink, opacity: 0.85 })]);
      add(D.bar(cx + 196, y - 9, 130, 9, q[1] / maxA, C, { fill: tone[q[2]] }));
      add([txt(cx + cw - 16, y, money(q[1], '') + '  ' + pct(q[1] / r.total, 0), { size: 12, weight: 700, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
    });
    // gelir kalemleri
    const ry = cy + ch + 14, rows = [];
    r.revenue.rows.forEach((q) => rows.push([q.type + ' · ' + q.count + ' adet × ' + fmt(q.unitGross, 0) + ' m²', q.amount]));
    if (r.revenue.commercial > 0) rows.push(['Ticari alan · ' + fmt(r.revenue.commercialArea || 0, 0) + ' m²', r.revenue.commercial]);
    if (r.revenue.parking > 0) rows.push(['Otopark · ' + (r.revenue.stalls || 0) + ' yer', r.revenue.parking]);
    if (r.revenue.vat > 0) rows.push(['KDV (düşülen)', -r.revenue.vat]);
    const rh = 28 + (rows.length + 1) * 21 + 16;
    add(card(cx, ry, cw, rh, C));
    title(cx + 16, ry + 24, cw - 32, 'Gelir kalemleri', C).forEach((p) => prims.push(p));
    rows.forEach((q, i) => {
      const y = ry + 54 + i * 21;
      add([txt(cx + 16, y, q[0].length > 40 ? q[0].slice(0, 39) + '…' : q[0], { size: 12, fill: C.ink, opacity: 0.85 }), txt(cx + cw - 16, y, money(q[1], cur), { size: 12, weight: 700, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
    });
    const ny = ry + 54 + rows.length * 21 + 4;
    add([{ t: 'line', x1: cx + 16, y1: ny - 15, x2: cx + cw - 16, y2: ny - 15, stroke: C.ink, sw: 0.8, opacity: 0.4 }]);
    add([txt(cx + 16, ny, 'Net gelir', { size: 12.5, weight: 800, fill: C.ink }), txt(cx + cw - 16, ny, money(r.revenue.net, cur), { size: 12.5, weight: 800, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
    // nakit akışı grafiği
    const gx = 520, gy = 180, gw = 460, gh = 300;
    add(card(gx, gy, gw, gh, C));
    title(gx + 16, gy + 24, gw - 32, 'Kümülatif nakit akışı', C).forEach((p) => prims.push(p));
    add(cashChart(gx + 24, gy + 44, gw - 48, gh - 74, r, C, { lines: true, cur: cur }));
    // artık arsa / başabaş kartı
    const kx = 520, ky = gy + gh + 14, kh = 136;
    add(card(kx, ky, gw, kh, C));
    title(kx + 16, ky + 24, gw - 32, 'Arsa için üst sınır', C).forEach((p) => prims.push(p));
    const land = a.land.cost;
    add([
      txt(kx + 16, ky + 54, 'Hedef marjla ödenebilecek en yüksek arsa bedeli', { size: 12, fill: C.ink, opacity: 0.7 }),
      txt(kx + 16, ky + 88, r.residualLand > 0 ? money(r.residualLand, cur) : 'Hedef marj sağlanamıyor', { size: 24, weight: 800, fill: C.ink, fam: C.glass ? 'b' : 'd' }),
      txt(kx + 16, ky + 112, land > 0 ? 'Girilen arsa bedeli ' + money(land, cur) + (r.residualLand > 0 ? (land <= r.residualLand ? ' · sınırın altında' : ' · sınırın üstünde') : '') : 'Arsa bedeli girilmedi: kâr arsa hariç (Girdiler › Arsa)', { size: 11.5, weight: 600, fill: C.ink, opacity: 0.7 }),
    ]);
    add(banner(f, C, tb.y - 14));
    add(rightColumn(f, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* aylık nakit grafiği: çubuk = aylık net, çizgi = kümülatif (kaldıraçlı) */
  function cashChart(x, y, w, h, r, C, o) {
    const P = [];
    const Y0 = y, H0 = h;
    y = Y0 + 26; h = Math.max(60, H0 - 26 - 40); // üstte: başlık/son değer payı, altta: en düşük nokta + eksen etiketi payı
    const c = r.cash, n = c.months.length;
    const cum = c.cumLev, net = c.net;
    const vmax = Math.max.apply(null, cum.concat(net.map((v) => Math.abs(v))).concat([1])), vmin = Math.min.apply(null, cum.concat([0]).concat(net));
    const top = Math.max(vmax, 1), bot = Math.min(vmin, 0);
    const sx = (i) => x + (i / Math.max(1, n - 1)) * w;
    const sy = (v) => y + h - ((v - bot) / (top - bot || 1)) * h;
    P.push({ t: 'line', x1: x, y1: sy(0), x2: x + w, y2: sy(0), stroke: C.ink, sw: 1, opacity: 0.5 });
    const bw = Math.max(2, (w / n) * 0.62);
    if (o.bars !== false) net.forEach((v, i) => { if (Math.abs(v) < 1) return; const y0 = sy(0), y1 = sy(v); P.push({ t: 'rect', x: sx(i) - bw / 2, y: Math.min(y0, y1), w: bw, h: Math.abs(y1 - y0), fill: v >= 0 ? (C.glass ? '#B4B7BF' : App.PAL.blue) : (C.glass ? '#4E5159' : App.PAL.red), opacity: 0.7 }); });
    let d = '';
    cum.forEach((v, i) => { d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1); });
    P.push({ t: 'path', d: d, stroke: C.ink, sw: C.glass ? 2.4 : 3.2, cap: 'round' });
    // en düşük nokta (zirve fonlama)
    let mi = 0;
    cum.forEach((v, i) => { if (v < cum[mi]) mi = i; });
    if (cum[mi] < 0) {
      P.push({ t: 'circle', cx: sx(mi), cy: sy(cum[mi]), r: 5, fill: C.glass ? '#fff' : C.paper, stroke: C.ink, sw: 2 });
      P.push(txt(sx(mi) + 8, sy(cum[mi]) + 16, 'en düşük ' + money(cum[mi], ''), { size: 11, weight: 700, fill: C.ink }));
    }
    P.push({ t: 'circle', cx: sx(n - 1), cy: sy(cum[n - 1]), r: 5, fill: C.ink });
    P.push(txt(sx(n - 1) - 8, sy(cum[n - 1]) - 10, money(cum[n - 1], ''), { size: 11.5, weight: 800, fill: C.ink, anchor: 'end' }));
    // eksen etiketleri
    const ticks = [0, 6, 12, 18, 24, 30, 36, 48].filter((m) => m < n);
    ticks.forEach((m, i) => P.push(txt(sx(m), y + h + 34, String(m) + (i === ticks.length - 1 ? ' ay' : ''), { size: 10.5, weight: 600, fill: C.ink, opacity: 0.6, anchor: i === ticks.length - 1 ? 'end' : 'middle' })));
    P.push(txt(x, Y0 + 10, o.cur ? 'nakit (' + o.cur + ')' : '', { size: 10.5, weight: 600, fill: C.ink, opacity: 0.5 }));
    // inşaat bitişi
    if (r.horizon && c.months.length > 0) {
      const mEnd = Math.min(n - 1, c.months.length - 1 - 0);
      void mEnd;
    }
    return P;
  }

  /* ---------------- NAKİT ---------------- */
  FS.nakit = function (project, f, view, live) {
    const C = SD().cols(), tb = sheet().tb;
    const r = f.res, a = f.a, cur = a.currency;
    const prims = sheet().frame(info(project, f, C, 'nakit'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    add(card(40, 64, 940, 470, C));
    title(56, 90, 908, 'Aylık nakit akışı · çubuk: aylık net, çizgi: kümülatif (' + cur + ')', C).forEach((p) => prims.push(p));
    add(cashChart(70, 120, 880, 380, r, C, { cur: cur }));
    // özet kutuları
    const k = [
      ['Yapım süresi', a.finance.months + ' ay'], ['Satış başlangıcı', a.finance.salesStart + '. ay'], ['Ön satış payı', pct(a.finance.presale, 0)],
      ['Özkaynak', money(r.equity, cur)], ['Kredi (en çok)', money(r.debt, cur)], ['Finansman gideri', money(r.finance, cur)],
    ];
    k.forEach((q, i) => {
      const x = 40 + (i % 3) * 316, y = 556 + Math.floor(i / 3) * 88;
      add(card(x, y, 308, 76, C));
      add([txt(x + 16, y + 28, q[0], { size: 12, weight: 600, fill: C.ink, opacity: 0.6 }), txt(x + 16, y + 58, q[1], { size: 20, weight: 800, fill: C.ink, fam: C.glass ? 'b' : 'd' })]);
    });
    add(banner(f, C, tb.y - 14));
    add(rightColumn(f, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* ---------------- DUYARLILIK ---------------- */
  FS.duyarlilik = function (project, f, view, live) {
    const C = SD().cols(), tb = sheet().tb;
    const r = f.res, a = f.a, cur = a.currency;
    const sens = App.fizSens(project);
    const prims = sheet().frame(info(project, f, C, 'duyarlilik'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    // ısı haritası
    const hx = 40, hy = 64, hw = 560, hh = 340;
    add(card(hx, hy, hw, hh, C));
    title(hx + 16, hy + 24, hw - 32, 'Kâr: satış fiyatı × maliyet değişimi', C).forEach((p) => prims.push(p));
    const g = sens.grid, n = g.costs.length;
    const cw = (hw - 130) / n, chh = (hh - 110) / n;
    const maxA = Math.max.apply(null, [].concat.apply([], g.profit).map(Math.abs).concat([1]));
    g.costs.forEach((cv, j) => add([txt(hx + 110 + j * cw + cw / 2, hy + 62, (cv > 0 ? '+' : '') + Math.round(cv * 100) + '%', { size: 11.5, weight: 700, fill: C.ink, anchor: 'middle' })]));
    add([txt(hx + 110 + (n * cw) / 2, hy + 46, 'maliyet değişimi →', { size: 11, weight: 600, fill: C.ink, opacity: 0.55, anchor: 'middle' })]);
    for (let ii = 0; ii < n; ii++) {
      const i = n - 1 - ii; // üstte en yüksek fiyat
      const pv = g.prices[i];
      add([txt(hx + 100, hy + 88 + ii * chh + chh / 2 + 4, (pv > 0 ? '+' : '') + Math.round(pv * 100) + '%', { size: 11.5, weight: 700, fill: C.ink, anchor: 'end' })]);
      for (let j = 0; j < n; j++) {
        const v = g.profit[i][j];
        const x = hx + 110 + j * cw, y = hy + 76 + ii * chh;
        const base = i === (n - 1) / 2 && j === (n - 1) / 2;
        const al = 0.12 + 0.6 * Math.min(1, Math.abs(v) / maxA);
        const col = v >= 0 ? (C.glass ? '#2E3036' : App.PAL.green) : (C.glass ? '#B4B7BF' : App.PAL.red);
        add([{ t: 'rect', x: x + 2, y: y + 2, w: cw - 4, h: chh - 4, rx: C.glass ? 10 : 0, fill: col, opacity: al, stroke: base ? C.ink : undefined, sw: base ? 2.6 : 0 }]);
        if (v < 0) add([{ t: 'rect', x: x + 2, y: y + 2, w: cw - 4, h: chh - 4, rx: C.glass ? 10 : 0, stroke: C.ink, sw: 1, dash: [4, 3], opacity: 0.6 }]);
        add([txt(x + cw / 2, y + chh / 2 + 4, money(v, ''), { size: 11.5, weight: 700, fill: C.ink, anchor: 'middle', fam: C.glass ? 'b' : 'm' })]);
      }
    }
    add([txt(hx + 16, hy + hh - 12, 'Kesikli çerçeve = zarar · kalın çerçeve = mevcut varsayım · satırlar satış fiyatı değişimi', { size: 10.5, weight: 600, fill: C.ink, opacity: 0.6 })]);
    // kasırga
    const tx = 620, ty = 64, tw = 360;
    add(card(tx, ty, tw, hh, C));
    title(tx + 16, ty + 24, tw - 32, 'Kâr üzerinde etki (±%10)', C).forEach((p) => prims.push(p));
    const tor = (sens.tornado || []).slice(0, 7);
    const swing = Math.max.apply(null, tor.map((t) => Math.max(Math.abs(t.low - t.base), Math.abs(t.high - t.base))).concat([1]));
    const cxm = tx + tw / 2 + 20, half = 100;
    tor.forEach((t, i) => {
      const y = ty + 58 + i * 38;
      add([txt(tx + 16, y + 4, t.label.length > 18 ? t.label.slice(0, 17) + '…' : t.label, { size: 11.5, weight: 600, fill: C.ink, opacity: 0.85 })]);
      const dl = (t.low - t.base) / swing * half, dh = (t.high - t.base) / swing * half;
      [[dl, 0], [dh, 1]].forEach((q) => {
        const x0 = cxm, x1 = cxm + q[0];
        add([{ t: 'rect', x: Math.min(x0, x1), y: y - 10, w: Math.abs(x1 - x0), h: 18, fill: q[0] >= 0 ? (C.glass ? '#2E3036' : App.PAL.green) : (C.glass ? '#B4B7BF' : App.PAL.red), opacity: 0.8 }]);
      });
      add([txt(cxm - half - 6, y + 14, money(Math.min(t.low, t.high) - t.base, ''), { size: 10, weight: 600, fill: C.ink, opacity: 0.6, anchor: 'start' }), txt(cxm + half + 6, y + 14, '+' + money(Math.max(t.low, t.high) - t.base, ''), { size: 10, weight: 600, fill: C.ink, opacity: 0.6, anchor: 'end' })]);
    });
    add([{ t: 'line', x1: cxm, y1: ty + 44, x2: cxm, y2: ty + hh - 20, stroke: C.ink, sw: 1.4 }]);
    // başabaş ve artık arsa
    const by = hy + hh + 14;
    add(card(40, by, 940, 150, C));
    title(56, by + 24, 908, 'Başabaş ve arsa üst sınırı', C).forEach((p) => prims.push(p));
    const tiles = [
      ['Başabaş satış fiyatı', fmt(r.breakEven.pricePerM2, 0) + ' ' + cur + '/m²'],
      ['Mevcut ortalama', fmt(r.breakEven.currentPricePerM2 || r.salePerM2, 0) + ' ' + cur + '/m²'],
      ['Güvenlik payı', r.breakEven.uplift >= 0 ? '−' + pct(r.breakEven.uplift / (1 + r.breakEven.uplift), 0) : '+' + pct(-r.breakEven.uplift / (1 + Math.abs(r.breakEven.uplift)), 0)],
      ['Arsa üst sınırı (hedef marj)', r.residualLand > 0 ? money(r.residualLand, cur) : 'sağlanamıyor'],
    ];
    tiles.forEach((q, i) => add([txt(56 + i * 228, by + 62, q[0], { size: 12, weight: 600, fill: C.ink, opacity: 0.6 }), txt(56 + i * 228, by + 96, q[1], { size: 19, weight: 800, fill: C.ink, fam: C.glass ? 'b' : 'd' })]));
    add([txt(56, by + 130, 'Güvenlik payı: satış fiyatı bu kadar düşse kâr sıfırlanır (diğer varsayımlar sabit).', { size: 11.5, weight: 600, fill: C.ink, opacity: 0.6 })]);
    add(banner(f, C, tb.y - 14));
    add(rightColumn(f, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  /* ---------------- METRAJ ---------------- */
  FS.metraj = function (project, f, view, live) {
    const C = SD().cols(), tb = sheet().tb;
    const r = f.res, a = f.a, cur = a.currency;
    const prims = sheet().frame(info(project, f, C, 'metraj'), live);
    const add = (L) => L.forEach((p) => prims.push(p));
    add(card(40, 64, 940, 36 + (r.boq.length + 1) * 24 + (r.softItems.length + 4) * 24 + 40, C));
    const X = [56, 110, 440, 520, 650, 790, 962];
    const head = ['Poz', 'Kalem', 'Birim', 'Miktar', 'Birim fiyat', 'Tutar'];
    head.forEach((s, i) => add([txt(i < 3 ? X[i] : X[i + 1] - (i === 3 ? 0 : 0), 92, s, { size: 11, weight: 700, fill: C.ink, opacity: 0.6, anchor: i < 3 ? 'start' : 'end' })]));
    let y = 94;
    add([{ t: 'line', x1: 56, y1: y, x2: 964, y2: y, stroke: C.ink, sw: 1.4 }]);
    y += 20;
    r.boq.forEach((q) => {
      add([txt(X[0], y, q.poz, { size: 11.5, weight: 600, fam: 'm', fill: C.ink, opacity: 0.6 }), txt(X[1], y, q.label.length > 46 ? q.label.slice(0, 45) + '…' : q.label, { size: 12, fill: C.ink }), txt(X[2], y, q.unit, { size: 11.5, fill: C.ink, opacity: 0.7 }),
        txt(630, y, fmt(q.qty, 0), { size: 12, weight: 600, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' }), txt(770, y, fmt(q.price, 0), { size: 12, weight: 600, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' }), txt(962, y, money(q.amount, ''), { size: 12, weight: 700, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
      y += 24;
    });
    add([{ t: 'line', x1: 56, y1: y - 14, x2: 964, y2: y - 14, stroke: C.ink, sw: 1 }, txt(X[1], y + 2, 'Doğrudan maliyet', { size: 12.5, weight: 800, fill: C.ink }), txt(962, y + 2, money(r.hard, cur), { size: 12.5, weight: 800, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
    y += 30;
    r.softItems.forEach((s) => {
      add([txt(X[1], y, s.label + ' (' + pct(s.rate, 1) + ')', { size: 12, fill: C.ink }), txt(962, y, money(s.amount, ''), { size: 12, weight: 700, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
      y += 24;
    });
    [['Arsa ve tapu harcı', r.land + r.landTax], ['Finansman', r.finance], ['TOPLAM MALİYET', r.total]].forEach((q, i) => {
      add([txt(X[1], y, q[0], { size: i === 2 ? 13 : 12, weight: i === 2 ? 800 : 500, fill: C.ink }), txt(962, y, money(q[1], cur), { size: i === 2 ? 13 : 12, weight: 800, fill: C.ink, anchor: 'end', fam: C.glass ? 'b' : 'm' })]);
      y += 24;
    });
    add(banner(f, C, tb.y - 14));
    add(rightColumn(f, C));
    return { prims: prims, hits: [], W: sheet().W, H: sheet().H };
  };

  FS.scene = function (project, f, view, live) {
    const fn = FS[view.mode] || FS.ozet;
    return fn(project, f, view, live);
  };
})();
