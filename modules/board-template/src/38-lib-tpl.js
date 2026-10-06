/* ==========================================================================
   38-lib-tpl.js — Modül 12 · Pafta Şablonu: veri modeli, hazır şablonlar, bilgi (veri) kaynakları
   Pafta; serbestçe yerleştirilen panellerden oluşur. Paneller diğer araçların çıktısını (canlı bağlantılı),
   yüklenen görselleri, metin, künye, lejant, veri satırları ve renk bloklarını gösterir.
   Model:
     project.tpl = { v, title, size: 'a3l|a3p|a2l|a1l|a1p|a0l|a0p', bg: 'white|paper|grey|ink|accent', accent: '#hex',
                     margin, gutter, snap: bool, panels: [panel] }
     panel = { id, t, name, hidden, locked, x, y, w, h, bg: 'none|white|paper|grey|ink|accent', bd: 0..8, bdc: '#hex', pad, ... }
       view   { src: { k: 'mod'|'img'|'none', id }, fit: 'cover'|'contain', zoom, ox, oy, trim, bw, label }
       text   { s, size, weight, fam, col, align: 'l|c|r', valign: 't|m|b', caps, lh }
       title  { name, sub, rows: [[anahtar, değer] × ≤4] }
       legend { items: [{ col, label }], size, col }
       facts  { keys: [id], size, col }
       block  { col, op, s, size, tcol }
       line   { dir: 'h|v', lw, col, dash: 0|1|2 }
       north  { col }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const T = (App.tpl = {});

  const num = (v, d) => (isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
  const uid = () => 'p' + Math.random().toString(36).slice(2, 8);
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  T.SIZES = {
    a3l: { w: 1400, h: 990, label: 'A3 yatay' },
    a3p: { w: 990, h: 1400, label: 'A3 dikey' },
    a2l: { w: 1800, h: 1273, label: 'A2 yatay' },
    a1l: { w: 2400, h: 1697, label: 'A1 yatay' },
    a1p: { w: 1697, h: 2400, label: 'A1 dikey' },
    a0l: { w: 3200, h: 2263, label: 'A0 yatay' },
    a0p: { w: 2263, h: 3200, label: 'A0 dikey' },
  };
  T.SIZE_ORDER = ['a3l', 'a3p', 'a2l', 'a1l', 'a1p', 'a0l', 'a0p'];
  T.BGS = { white: '#FFFFFF', paper: '#EFECE4', grey: '#D5D6D8', ink: '#17181B' };
  T.PANEL_BGS = ['none', 'white', 'paper', 'grey', 'ink', 'accent'];
  T.SWATCHES = [
    { v: '#D93A1F', label: 'Kırmızı' }, { v: '#F26B1D', label: 'Turuncu' }, { v: '#F2B705', label: 'Sarı' }, { v: '#2F8F4E', label: 'Yeşil' },
    { v: '#1F4FD8', label: 'Mavi' }, { v: '#4B3FA0', label: 'Çivit' }, { v: '#E58FB0', label: 'Pembe' }, { v: '#17181B', label: 'Siyah' }, { v: '#FFFFFF', label: 'Beyaz' },
  ];
  T.FONT_OPTS = [{ v: 'b', label: 'Gövde' }, { v: 'd', label: 'Başlık' }, { v: 'm', label: 'Mono' }];
  T.hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toUpperCase() : d);
  T.sizeOf = (d) => T.SIZES[d.size] || T.SIZES.a1l;
  T.bgColor = (d) => (d.bg === 'accent' ? d.accent : T.BGS[d.bg] || '#FFFFFF');
  T.panelBg = (p, d) => (p.bg === 'none' ? null : p.bg === 'accent' ? d.accent : T.BGS[p.bg] || null);
  T.lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  T.contrast = (hex) => (T.lum(hex) > 0.6 ? '#17181B' : '#FFFFFF');
  T.PANEL_LABEL = { view: 'Görsel', text: 'Metin', title: 'Künye', legend: 'Lejant', facts: 'Veriler', block: 'Blok', line: 'Çizgi', north: 'Kuzey oku' };

  /* ---------- diğer araçlardan alınabilen çıktılar (kaynaklar) ---------- */
  T.SOURCES = [
    { id: 'kolaj', label: 'Kolaj', mod: 'kolaj', framed: false },
    { id: 'vaziyet', label: 'Vaziyet planı', mod: 'vaziyet', framed: true },
    { id: 'islev', label: 'İşlev şeması', mod: 'islev', framed: true },
    { id: 'kat', label: 'Mekân etüdü · plan', mod: 'kat', framed: true },
    { id: 'etut-iso', label: 'Mekân etüdü · izometrik', mod: 'kat', framed: true },
    { id: 'etut-surec', label: 'Mekân etüdü · süreç', mod: 'kat', framed: true },
    { id: 'analiz', label: 'Mekân analizi', mod: 'analiz', framed: true },
    { id: 'arsa', label: 'Arsa analizi', mod: 'arsa', framed: true },
    { id: 'imar-plan', label: 'İmar · plan', mod: 'imar', framed: true },
    { id: 'imar-iso', label: 'İmar · izometrik', mod: 'imar', framed: true },
    { id: 'tasarim-vaziyet', label: 'Tasarım · vaziyet', mod: 'tasarim', framed: true },
    { id: 'tasarim-tipik', label: 'Tasarım · tipik kat', mod: 'tasarim', framed: true },
    { id: 'tasarim-bodrum', label: 'Tasarım · bodrum', mod: 'tasarim', framed: true },
    { id: 'tasarim-kutle', label: 'Tasarım · kütle', mod: 'tasarim', framed: true },
    { id: 'tasarim-kiyas', label: 'Tasarım · karşılaştırma', mod: 'tasarim', framed: true },
    { id: 'fiz-ozet', label: 'Fizibilite · özet', mod: 'fizibilite', framed: true },
    { id: 'fiz-nakit', label: 'Fizibilite · nakit akışı', mod: 'fizibilite', framed: true },
    { id: 'fiz-duyarlilik', label: 'Fizibilite · duyarlılık', mod: 'fizibilite', framed: true },
    { id: 'fiz-metraj', label: 'Fizibilite · metraj', mod: 'fizibilite', framed: true },
  ];
  T.srcInfo = (id) => T.SOURCES.find((s) => s.id === id) || null;
  /* otomatik doldururken tercih sırası */
  T.SRC_PREF = ['kolaj', 'vaziyet', 'imar-iso', 'islev', 'etut-iso', 'tasarim-kutle', 'tasarim-vaziyet', 'kat', 'analiz', 'arsa', 'imar-plan', 'tasarim-tipik', 'etut-surec', 'tasarim-kiyas', 'fiz-ozet', 'tasarim-bodrum'];

  /* ---------- veri satırları (bilgi paneli) ---------- */
  T.FACT_KEYS = [
    { id: 'mekan', label: 'Mekân sayısı' }, { id: 'parsel', label: 'Parsel alanı' }, { id: 'taks', label: 'TAKS' }, { id: 'kaks', label: 'KAKS' },
    { id: 'yesil', label: 'Yeşil oranı' }, { id: 'kat', label: 'Kat sayısı' }, { id: 'daire', label: 'Daire sayısı' }, { id: 'insaat', label: 'İnşaat alanı' },
    { id: 'maliyet', label: 'Toplam maliyet (ÖRNEK)' }, { id: 'marj', label: 'Kâr marjı (ÖRNEK)' },
  ];
  T.facts = function (P) {
    const out = {};
    const set = (id, v) => { if (v != null && v !== '') out[id] = v; };
    const f0 = (v) => U.fmt(v, 0), f2 = (v) => U.fmt(v, 2);
    try { if (P.spaces && P.spaces.length) set('mekan', String(P.spaces.length)); } catch (e) { /* yok say */ }
    try {
      if (P.site && P.site.parcel && App.gis) set('parsel', f0(Math.abs(App.gis.area(P.site.parcel))) + ' m²');
      const M = App.plan && P.plan ? App.plan.metrics(P.plan) : null;
      if (M && M.hasBound) {
        if (!out.parsel) set('parsel', f0(M.boundArea) + ' m²');
        set('taks', f2(M.taks)); set('kaks', f2(M.kaks)); set('yesil', '%' + Math.round((M.greenShare || 0) * 100));
        if (M.maxFloors) set('kat', String(M.maxFloors));
      }
    } catch (e) { /* yok say */ }
    try {
      const dc = App.dsnCtx ? App.dsnCtx(P) : null;
      if (dc && dc.ok) {
        set('kat', dc.alt.floors + ' kat · ' + U.fmt(dc.alt.height, 1) + ' m'); set('daire', String(dc.alt.unitTotals.total)); set('insaat', f0(dc.alt.built) + ' m²');
        const f = App.fizCtx(P);
        if (f && f.ok) { set('maliyet', App.fizScene.money(f.res.total, f.a.currency)); set('marj', (f.res.margin < 0 ? '−' : '') + '%' + U.fmt(Math.abs(f.res.margin) * 100, 1)); }
      }
    } catch (e) { /* yok say */ }
    return out;
  };

  /* ---------- panel fabrikaları ---------- */
  const base = (t) => ({ id: uid(), t: t, name: '', hidden: false, locked: false, bg: 'none', bd: 0, bdc: '#17181B', pad: 14 });
  T.make = {
    view: (x, y, w, h, src, o) => Object.assign(base('view'), { x: x, y: y, w: w, h: h, src: src || { k: 'none', id: '' }, fit: 'cover', zoom: 1, ox: 0.5, oy: 0.5, crop: { l: 0, t: 0, r: 0, b: 0 }, trim: true, bw: false, label: '', pad: 0 }, o || {}),
    text: (s, x, y, w, h, o) => Object.assign(base('text'), { x: x, y: y, w: w, h: h, s: s, size: 22, weight: 500, fam: 'b', col: '#17181B', align: 'l', valign: 't', caps: false, lh: 1.3, pad: 0 }, o || {}),
    title: (x, y, w, h, o) => Object.assign(base('title'), { x: x, y: y, w: w, h: h, name: '', sub: '', rows: [['Pafta', ''], ['Ölçek', ''], ['Tarih', U.today()], ['No', '01']], bd: 3, bg: 'white', pad: 0 }, o || {}),
    legend: (x, y, w, h, items, o) => Object.assign(base('legend'), { x: x, y: y, w: w, h: h, items: items || [{ col: '#D93A1F', label: 'Yeni yapı' }, { col: '#17181B', label: 'Mevcut yapı' }, { col: '#2F8F4E', label: 'Yeşil alan' }], size: 17, col: '#17181B', pad: 0 }, o || {}),
    facts: (x, y, w, h, keys, o) => Object.assign(base('facts'), { x: x, y: y, w: w, h: h, keys: keys || ['parsel', 'taks', 'kaks', 'kat'], size: 18, col: '#17181B', pad: 0 }, o || {}),
    block: (x, y, w, h, col, o) => Object.assign(base('block'), { x: x, y: y, w: w, h: h, col: col || '#D93A1F', op: 1, s: '', size: 22, tcol: '#FFFFFF', pad: 14 }, o || {}),
    line: (x, y, w, h, o) => Object.assign(base('line'), { x: x, y: y, w: w, h: h, dir: 'h', lw: 3, col: '#17181B', dash: 0, pad: 0 }, o || {}),
    north: (x, y, w, h, o) => Object.assign(base('north'), { x: x, y: y, w: w, h: h, col: '#17181B', pad: 0 }, o || {}),
  };
  T.panelName = function (p) {
    if (p.name) return p.name;
    if (p.t === 'view') { const si = p.src && p.src.k === 'mod' ? T.srcInfo(p.src.id) : null; return si ? si.label : p.src && p.src.k === 'img' ? ((App.collage && App.collage.imgs[p.src.id] && App.collage.imgs[p.src.id].name) || 'Görsel') : 'Görsel (boş)'; }
    if (p.t === 'text') { const s = String(p.s || '').replace(/\s+/g, ' ').trim(); return s ? (s.length > 24 ? s.slice(0, 23) + '…' : s) : 'Metin'; }
    if (p.t === 'block') return p.s ? p.s.slice(0, 22) : 'Renk bloğu';
    return T.PANEL_LABEL[p.t] || 'Panel';
  };

  /* ---------- temizleme ---------- */
  const bgOf = (v) => (T.PANEL_BGS.indexOf(v) >= 0 ? v : 'none');
  T.clean = function (l, patch) {
    const o = Object.assign({}, l, patch || {});
    if (!T.PANEL_LABEL[o.t]) return null;
    const b = {
      id: String(o.id || uid()), t: o.t, name: String(o.name || '').slice(0, 40), hidden: !!o.hidden, locked: !!o.locked,
      x: r1(U.clamp(num(o.x, 0), -2000, 9000)), y: r1(U.clamp(num(o.y, 0), -2000, 9000)), w: r1(U.clamp(num(o.w, 200), 8, 9000)), h: r1(U.clamp(num(o.h, 120), 8, 9000)),
      bg: bgOf(o.bg), bd: r1(U.clamp(num(o.bd, 0), 0, 12)), bdc: T.hex(o.bdc, '#17181B'), pad: Math.round(U.clamp(num(o.pad, 0), 0, 200)),
    };
    const col = (v, d) => T.hex(v, d);
    if (o.t === 'view') {
      const s = o.src && typeof o.src === 'object' ? Object.assign({}, o.src) : {};
      if (s.k === 'mod') s.id = { 'birim-plan': 'kat', 'birim-iso': 'etut-iso', 'birim-surec': 'etut-surec' }[s.id] || s.id; // eski Birim Oluşturucu kaynakları
      const k = s.k === 'mod' && T.srcInfo(String(s.id)) ? 'mod' : s.k === 'img' && s.id ? 'img' : 'none';
      return Object.assign(b, { src: { k: k, id: k === 'none' ? '' : String(s.id).slice(0, 40) }, fit: o.fit === 'contain' ? 'contain' : 'cover', zoom: r2(U.clamp(num(o.zoom, 1), 0.2, 6)), ox: r2(U.clamp(num(o.ox, 0.5), 0, 1)), oy: r2(U.clamp(num(o.oy, 0.5), 0, 1)), crop: T.cleanCrop(o.crop), trim: o.trim !== false, bw: !!o.bw, label: String(o.label || '').slice(0, 60) });
    }
    if (o.t === 'text') {
      return Object.assign(b, { s: String(o.s == null ? '' : o.s).slice(0, 2400), size: Math.round(U.clamp(num(o.size, 22), 6, 400)), weight: [300, 400, 500, 600, 700, 800].indexOf(Number(o.weight)) >= 0 ? Number(o.weight) : 500, fam: ['b', 'd', 'm', 'l'].indexOf(o.fam) >= 0 ? o.fam : 'b', col: col(o.col, '#17181B'), align: ['l', 'c', 'r'].indexOf(o.align) >= 0 ? o.align : 'l', valign: ['t', 'm', 'b'].indexOf(o.valign) >= 0 ? o.valign : 't', caps: !!o.caps, lh: r2(U.clamp(num(o.lh, 1.3), 0.9, 2.4)) });
    }
    if (o.t === 'title') {
      const rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, 4).map((r) => [String((r && r[0]) || '').slice(0, 24), String((r && r[1]) || '').slice(0, 48)]);
      return Object.assign(b, { name: String(o.name || '').slice(0, 80), sub: String(o.sub || '').slice(0, 120), rows: rows });
    }
    if (o.t === 'legend') {
      const items = (Array.isArray(o.items) ? o.items : []).slice(0, 14).map((it) => ({ col: col(it && it.col, '#17181B'), label: String((it && it.label) || '').slice(0, 40) }));
      return Object.assign(b, { items: items, size: Math.round(U.clamp(num(o.size, 17), 8, 120)), col: col(o.col, '#17181B') });
    }
    if (o.t === 'facts') {
      const keys = (Array.isArray(o.keys) ? o.keys : []).filter((k) => T.FACT_KEYS.some((f) => f.id === k)).filter((k, i, a) => a.indexOf(k) === i);
      return Object.assign(b, { keys: keys, size: Math.round(U.clamp(num(o.size, 18), 8, 120)), col: col(o.col, '#17181B') });
    }
    if (o.t === 'block') return Object.assign(b, { col: col(o.col, '#D93A1F'), op: r2(U.clamp(num(o.op, 1), 0.05, 1)), s: String(o.s || '').slice(0, 80), size: Math.round(U.clamp(num(o.size, 22), 8, 300)), tcol: col(o.tcol, '#FFFFFF') });
    if (o.t === 'line') return Object.assign(b, { dir: o.dir === 'v' ? 'v' : 'h', lw: r1(U.clamp(num(o.lw, 3), 0.5, 40)), col: col(o.col, '#17181B'), dash: [0, 1, 2].indexOf(Number(o.dash)) >= 0 ? Number(o.dash) : 0 });
    if (o.t === 'north') return Object.assign(b, { col: col(o.col, '#17181B') });
    return null;
  };
  /* kırpma: kaynak görselin her kenarından kesilen oran (0–0.9; karşılıklı kenarların toplamı en çok %94) */
  T.cleanCrop = function (c) {
    const o = c && typeof c === 'object' ? c : {};
    const f = (v) => { v = Number(v); return isFinite(v) ? Math.round(U.clamp(v, 0, 0.9) * 1000) / 1000 : 0; };
    let l = f(o.l), t = f(o.t), r = f(o.r), b = f(o.b);
    if (l + r > 0.94) { const k = 0.94 / (l + r); l *= k; r *= k; }
    if (t + b > 0.94) { const k = 0.94 / (t + b); t *= k; b *= k; }
    return { l: l, t: t, r: r, b: b };
  };
  T.MONO_DEFAULT = '#1F3A5F';
  T.defaults = function () { return { v: 1, title: '', size: 'a1l', bg: 'white', accent: '#D93A1F', mono: { on: false, col: T.MONO_DEFAULT }, margin: 72, gutter: 29, snap: true, panels: [] }; };
  T.cleanDoc = function (p) {
    const d = T.defaults();
    const o = Object.assign({}, d, p || {});
    o.title = String(o.title || '').slice(0, 60);
    o.size = T.SIZES[o.size] ? o.size : d.size;
    o.bg = ['white', 'paper', 'grey', 'ink', 'accent'].indexOf(o.bg) >= 0 ? o.bg : 'white';
    o.accent = T.hex(o.accent, d.accent);
    o.mono = { on: !!(o.mono && o.mono.on), col: T.hex(o.mono && o.mono.col, T.MONO_DEFAULT) };
    o.margin = Math.round(U.clamp(num(o.margin, 72), 0, 400));
    o.gutter = Math.round(U.clamp(num(o.gutter, 29), 0, 200));
    o.snap = o.snap !== false;
    o.panels = (Array.isArray(o.panels) ? o.panels : []).slice(0, 120).map((l) => T.clean(l)).filter(Boolean);
    return o;
  };

  /* ---------- hazır şablonlar ---------- */
  /* ctx: { W, H, pick(i) → kaynak kimliği | null, name, today, accent } */
  const I = (v) => Math.round(v);
  function mk(ctx) {
    const W = ctx.W, H = ctx.H;
    let n = 0;
    const m = I(W * 0.03), g = I(W * 0.012);
    const ctxO = {
      W: W, H: H, m: m, g: g,
      view: (x, y, w, h, o) => { const id = ctx.pick(n++); return T.make.view(I(x), I(y), I(w), I(h), id ? { k: 'mod', id: id } : { k: 'none', id: '' }, Object.assign({ label: id ? T.srcInfo(id).label : '' }, o || {})); },
      text: (s, x, y, w, h, o) => T.make.text(s, I(x), I(y), I(w), I(h), o),
      title: (x, y, w, h, o) => T.make.title(I(x), I(y), I(w), I(h), Object.assign({ name: ctx.name, sub: ctx.title || 'Mimari ön proje', rows: [['Pafta', ctx.title || 'Vaziyet ve kütle'], ['Ölçek', '1/500'], ['Tarih', ctx.today], ['No', '01']] }, o || {})),
      block: (x, y, w, h, col, o) => T.make.block(I(x), I(y), I(w), I(h), col, o),
      line: (x, y, w, h, o) => T.make.line(I(x), I(y), I(w), I(h), o),
      legend: (x, y, w, h, items, o) => T.make.legend(I(x), I(y), I(w), I(h), items, o),
      facts: (x, y, w, h, keys, o) => T.make.facts(I(x), I(y), I(w), I(h), keys, o),
      north: (x, y, w, h, o) => T.make.north(I(x), I(y), I(w), I(h), o),
      fs: (k) => Math.max(9, I(W * k)),
    };
    return ctxO;
  }
  const LOREM = 'Proje kısa açıklaması buraya yazılır. Yaklaşımı, kararları ve bölgeyle kurduğu ilişkiyi iki üç cümleyle anlatın.';
  const heading = (c, s, x, y, w) => c.text(s, x, y, w, c.fs(0.014) * 1.8, { size: c.fs(0.0125), fam: 'm', weight: 700, caps: true, lh: 1.1 });

  T.TEMPLATES = [
    {
      id: 'juri', label: 'Jüri paftası', size: 'a1l', desc: 'Büyük ana görsel, sağda üç yardımcı görsel, altta metin ve künye',
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, m = c.m, g = c.g, o = [];
        const hh = I(H * 0.085);
        o.push(c.text((ctx.title || ctx.name || 'Proje adı'), m, m, W - m * 2, hh, { size: I(H * 0.058), fam: 'd', weight: 800, caps: true, lh: 1, valign: 'm' }));
        o.push(c.text('Mimari ön proje · ' + ctx.today, m, m + hh, W - m * 2, I(H * 0.03), { size: c.fs(0.0105), fam: 'm', weight: 600, caps: true, lh: 1.1 }));
        const y0 = m + hh + I(H * 0.045), sh = I(H * 0.2), y1 = H - m - sh - g;
        const hw = I((W - m * 2 - g) * 0.6);
        o.push(c.view(m, y0, hw, y1 - y0, { bd: 3 }));
        const rx = m + hw + g, rw = W - m - rx, rh = I((y1 - y0 - g * 2) / 3);
        for (let i = 0; i < 3; i++) o.push(c.view(rx, y0 + i * (rh + g), rw, rh, { bd: 3 }));
        const sy = H - m - sh, tw = W - m * 2 - g * 3;
        const w1 = I(tw * 0.22), w2 = I(tw * 0.22), w3 = I(tw * 0.18), w4 = tw - w1 - w2 - w3;
        o.push(heading(c, 'Kavram', m, sy, w1)); o.push(c.text(LOREM, m, sy + c.fs(0.026), w1, sh - c.fs(0.026), { size: c.fs(0.0115) }));
        o.push(heading(c, 'Program', m + w1 + g, sy, w2)); o.push(c.text('Mekân programı, alan dağılımı ve işlevsel kurgu burada özetlenir.', m + w1 + g, sy + c.fs(0.026), w2, sh - c.fs(0.026), { size: c.fs(0.0115) }));
        o.push(c.facts(m + w1 + w2 + g * 2, sy, w3, sh, ['parsel', 'taks', 'kaks', 'kat', 'daire'], { size: c.fs(0.0115), bd: 0 }));
        o.push(c.title(W - m - w4, sy, w4, sh));
        return o;
      },
    },
    {
      id: 'afis', label: 'Dikey afiş', size: 'a1p', desc: 'Üstte başlık, büyük görsel, ikili görsel sırası, metin sütunları ve künye',
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, m = c.m, g = c.g, o = [];
        o.push(c.block(0, 0, W, I(H * 0.12), ctx.accent, { tcol: '#FFFFFF' }));
        o.push(c.text((ctx.title || ctx.name || 'Proje adı'), m, I(H * 0.018), W - m * 2, I(H * 0.085), { size: I(H * 0.042), fam: 'd', weight: 800, caps: true, lh: 1, valign: 'm', col: T.contrast(ctx.accent) }));
        const y0 = I(H * 0.12) + g, hh = I(H * 0.38);
        o.push(c.view(m, y0, W - m * 2, hh, { bd: 3 }));
        const y1 = y0 + hh + g, rh = I(H * 0.19), cw = I((W - m * 2 - g) / 2);
        o.push(c.view(m, y1, cw, rh, { bd: 3 })); o.push(c.view(m + cw + g, y1, cw, rh, { bd: 3 }));
        const y2 = y1 + rh + g, th = H - m - y2 - I(H * 0.1) - g;
        const w3 = I((W - m * 2 - g * 2) / 3);
        ['Kavram', 'Program', 'Kararlar'].forEach((s, i) => { const x = m + i * (w3 + g); o.push(heading(c, s, x, y2, w3)); o.push(c.text(LOREM, x, y2 + c.fs(0.026), w3, th - c.fs(0.026), { size: c.fs(0.0175) })); });
        o.push(c.title(m, H - m - I(H * 0.1), W - m * 2, I(H * 0.1)));
        return o;
      },
    },
    {
      id: 'izgara', label: 'Izgara 3 × 2', size: 'a3l', desc: 'Eşit altı hücre, üstte başlık şeridi, altta künye', 
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, m = I(W * 0.025), g = I(W * 0.01), o = [];
        const hh = I(H * 0.08);
        o.push(c.text((ctx.title || ctx.name || 'Proje adı'), m, m, W - m * 2, hh, { size: I(H * 0.055), fam: 'd', weight: 800, caps: true, lh: 1, valign: 'm' }));
        const ty = H - m - I(H * 0.095), y0 = m + hh + g;
        const cw = I((W - m * 2 - g * 2) / 3), ch = I((ty - g - y0 - g) / 2);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) o.push(c.view(m + i * (cw + g), y0 + j * (ch + g), cw, ch, { bd: 2 }));
        o.push(c.title(m, ty, W - m * 2, I(H * 0.095)));
        return o;
      },
    },
    {
      id: 'kolaj-vaziyet', label: 'Kolaj + vaziyet', size: 'a2l', desc: 'Solda geniş kolaj, sağda vaziyet planı, lejant, kuzey oku ve metin',
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, m = c.m, g = c.g, o = [];
        const th = I(H * 0.1), y1 = H - m - th - g;
        const lw = I((W - m * 2 - g) * 0.58);
        o.push(c.view(m, m, lw, y1 - m, { bd: 3 }));
        const rx = m + lw + g, rw = W - m - rx;
        const vh = I((y1 - m) * 0.56);
        o.push(c.view(rx, m, rw, vh, { bd: 3, bg: 'white' }));
        o.push(c.north(rx + rw - I(W * 0.05) - 10, m + 10, I(W * 0.05), I(W * 0.05), { bd: 0 }));
        const ly = m + vh + g;
        o.push(heading(c, 'Açıklama', rx, ly, rw));
        o.push(c.text(LOREM, rx, ly + c.fs(0.026), rw, I((y1 - ly) * 0.5), { size: c.fs(0.0125) }));
        o.push(c.legend(rx, ly + I((y1 - ly) * 0.55), rw, I((y1 - ly) * 0.45), null, { size: c.fs(0.0115) }));
        o.push(c.title(m, H - m - th, W - m * 2, th));
        return o;
      },
    },
    {
      id: 'surec', label: 'Süreç şeridi', size: 'a1l', desc: 'Beş adımlı yatay görsel dizisi, numaralı başlıklar ve açıklamalar',
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, m = c.m, g = c.g, o = [];
        const hh = I(H * 0.09);
        o.push(c.text((ctx.title || ctx.name || 'Proje adı'), m, m, W * 0.7, hh, { size: I(H * 0.06), fam: 'd', weight: 800, caps: true, lh: 1, valign: 'm' }));
        o.push(c.line(m, m + hh + I(H * 0.01), W - m * 2, 8, { lw: 4 }));
        const n = 5, cw = I((W - m * 2 - g * (n - 1)) / n), y0 = m + hh + I(H * 0.04), ch = I(H * 0.46);
        for (let i = 0; i < n; i++) {
          const x = m + i * (cw + g);
          o.push(c.text(String(i + 1).padStart(2, '0'), x, y0, cw, c.fs(0.03), { size: c.fs(0.026), fam: 'd', weight: 800, col: ctx.accent, lh: 1 }));
          o.push(c.view(x, y0 + c.fs(0.034), cw, ch, { bd: 2 }));
          o.push(c.text(LOREM, x, y0 + c.fs(0.034) + ch + g, cw, I(H * 0.14), { size: c.fs(0.0105) }));
        }
        const ty = H - m - I(H * 0.1);
        o.push(c.title(m, ty, W - m * 2, I(H * 0.1)));
        return o;
      },
    },
    {
      id: 'tek', label: 'Tek görsel', size: 'a3l', desc: 'Tüm sayfayı kaplayan görsel, üstünde başlık bloğu ve altta künye',
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, o = [];
        o.push(c.view(0, 0, W, H, { pad: 0 }));
        const bw = I(W * 0.46), bh = I(H * 0.2), m = I(W * 0.03);
        o.push(c.block(m, m, bw, bh, '#17181B', { s: '', pad: 0 }));
        o.push(c.text((ctx.title || ctx.name || 'Proje adı'), m + I(W * 0.02), m + I(bh * 0.1), bw - I(W * 0.04), I(bh * 0.55), { size: I(H * 0.062), fam: 'd', weight: 800, caps: true, lh: 1, valign: 'm', col: '#FFFFFF' }));
        o.push(c.text('Mimari ön proje · ' + ctx.today, m + I(W * 0.02), m + I(bh * 0.68), bw - I(W * 0.04), I(bh * 0.2), { size: c.fs(0.0105), fam: 'm', weight: 600, caps: true, col: '#FFFFFF', lh: 1.1 }));
        const th = I(H * 0.09);
        o.push(c.title(m, H - m - th, W - m * 2, th, { bg: 'white' }));
        return o;
      },
    },
    {
      id: 'bos', label: 'Boş pafta', size: 'a1l', desc: 'Yalnızca künye; gerisini siz yerleştirin',
      build: function (ctx) {
        const c = mk(ctx), W = c.W, H = c.H, m = c.m;
        return [c.title(m, H - m - I(H * 0.1), W - m * 2, I(H * 0.1))];
      },
    },
  ];
  T.templateById = (id) => T.TEMPLATES.find((t) => t.id === id) || null;

  /* şablon uygula: belge (sayfa boyutu şablonun, ya da verilen) + paneller; kullanılabilir kaynaklar tercih sırasıyla yerleşir */
  T.fromTemplate = function (id, o) {
    o = o || {};
    const tpl = T.templateById(id);
    if (!tpl) return null;
    const size = o.size && T.SIZES[o.size] ? o.size : tpl.size;
    const sz = T.SIZES[size];
    const avail = (o.avail || []).slice().sort((a, b) => {
      const ia = T.SRC_PREF.indexOf(a), ib = T.SRC_PREF.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const ctx = { W: sz.w, H: sz.h, name: o.name || 'Proje adı', title: o.title || '', today: U.today(), accent: o.accent || '#D93A1F', pick: (i) => avail[i] || null };
    const m = I(sz.w * 0.03);
    return T.cleanDoc({ v: 1, title: o.title || '', size: size, bg: o.bg || 'white', accent: ctx.accent, margin: m, gutter: I(sz.w * 0.012), snap: true, panels: tpl.build(ctx) });
  };

  /* panelin sınır kutusu ve hizalama yardımcıları */
  T.alignTo = function (p, doc, how) {
    const s = T.sizeOf(doc), m = doc.margin;
    const o = {};
    if (how === 'left') o.x = m; else if (how === 'right') o.x = s.w - m - p.w; else if (how === 'hcenter') o.x = Math.round((s.w - p.w) / 2);
    else if (how === 'top') o.y = m; else if (how === 'bottom') o.y = s.h - m - p.h; else if (how === 'vcenter') o.y = Math.round((s.h - p.h) / 2);
    else if (how === 'fill') { o.x = m; o.y = m; o.w = s.w - m * 2; o.h = s.h - m * 2; }
    else if (how === 'fillw') { o.x = m; o.w = s.w - m * 2; }
    else if (how === 'fillh') { o.y = m; o.h = s.h - m * 2; }
    return o;
  };
})();
