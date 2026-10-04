/* ==========================================================================
   73-ctl-fiz.js — Maliyet ve Fizibilite yan etkileri: görünüm, varsayım düzenleme, dışa aktarma
   Dışa aktarma: XLSX (canlı formüllü, App.cost.toWorkbook) · PNG · PDF · SVG · CSV.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const Cst = App.cost;
  const get = () => App.store.get();

  const FV = ctl.makeView('fiz', 'archtools.view.fiz', ['mode']);
  ctl.fizView = FV.set;
  ctl.loadFizView = function () {
    FV.load(function (o) { return ['ozet', 'nakit', 'duyarlilik', 'metraj'].indexOf(o.mode) >= 0 ? { mode: o.mode } : null; });
  };

  ctl.fizSet = (patch) => ctl.dispatch({ type: 'FIZ_SET', patch: patch });
  let live = false;
  ctl.fizLive = function (patch) {
    if (!live) { live = true; ctl.dispatch({ type: 'SNAPSHOT' }); }
    ctl.dispatch({ type: 'FIZ_SET_LIVE', patch: patch });
  };
  ctl.fizLiveEnd = function () { live = false; };

  function csv(f) {
    const r = f.res;
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [['archtools · Maliyet ve fizibilite (ÖRNEK varsayımlarla ön hesap)'], ['Poz', 'Kalem', 'Birim', 'Miktar', 'Birim fiyat', 'Tutar']];
    r.boq.forEach((b) => rows.push([b.poz, b.label, b.unit, Math.round(b.qty * 100) / 100, Math.round(b.price), Math.round(b.amount)]));
    rows.push(['', 'Doğrudan maliyet', '', '', '', Math.round(r.hard)]);
    r.softItems.forEach((s) => rows.push(['', s.label, '', '', Math.round(s.rate * 10000) / 100 + '%', Math.round(s.amount)]));
    rows.push(['', 'Arsa ve tapu harcı', '', '', '', Math.round(r.land + r.landTax)], ['', 'Finansman', '', '', '', Math.round(r.finance)], ['', 'TOPLAM MALİYET', '', '', '', Math.round(r.total)], ['', 'Net satış geliri', '', '', '', Math.round(r.revenue.net)], ['', 'Kâr', '', '', '', Math.round(r.profit)], [], [Cst.DISCLAIMER]);
    return '﻿' + rows.map((row) => row.map(q).join(';')).join('\r\n');
  }

  ctl.fizExport = function (kind) {
    const st = get(), P = st.project;
    const f = App.fizCtx(P);
    if (!f.ok) { ctl.toast('Önce bir tasarım alternatifi gerekli.', 'error'); return; }
    const labels = { xlsx: 'Excel', png: 'PNG', pdf: 'PDF', svg: 'SVG', csv: 'CSV' };
    ctl.dispatch({ type: 'UI', patch: { busy: labels[kind] || kind } });
    let p;
    try { p = Promise.resolve(run(kind, P, f, st)); } catch (e) { p = Promise.reject(e); }
    p.then((r) => ctl.report(r, (labels[kind] || kind) + ' hazır')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };

  function run(kind, P, f, st) {
    const slug = U.slug(P.meta.name) + '-fizibilite';
    if (kind === 'xlsx') {
      const wb = Cst.toWorkbook(f.d, f.a, f.res, { name: P.meta.name + ' · ' + f.dc.alt.label, date: U.today(), author: 'archtools' });
      return App.xlsx.save(App.xlsx.build(wb), slug + '.xlsx');
    }
    if (kind === 'csv') return ctl.saveText(slug + '.csv', csv(f), 'text/csv;charset=utf-8');
    const view = Object.assign({}, st.ui.fiz);
    const sc = App.fizScene.scene(P, f, view, false);
    if (kind === 'svg') return ctl.saveText(slug + '.svg', App.geoExport.svg(sc.prims, sc.W, sc.H, P.meta.name), 'image/svg+xml');
    return App.sheet.exportScene(sc.prims, sc.W, sc.H, slug, kind);
  }
  ctl.exporters.fizibilite = (kind) => ctl.fizExport(kind === 'png' ? 'png' : 'pdf');
})();
