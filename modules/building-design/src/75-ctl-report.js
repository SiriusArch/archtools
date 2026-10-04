/* ==========================================================================
   75-ctl-report.js — Proje raporu: tüm modüllerin paftalarını tek PDF'te toplar
   Sayfalar: kapak (içindekiler + özet) · işlev şeması · kat etüdü · mekân analizi · arsa analizi ·
   imar ve kapasite (plan + izometri) · tasarım (5 pafta) · maliyet ve fizibilite (4 pafta) · yöntem ve kaynaklar.
   Yalnızca verisi olan modüller dahil edilir; bir sayfa çizilemezse atlanır ve yöntem sayfasında belirtilir.
   Hiçbir API anahtarı rapora girmez. Rapor bir ön çalışma çıktısıdır; yöntem sayfası varsayımları açıkça yazar.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const U = App.util;
  const get = () => App.store.get();

  const W = () => App.sheet.W, H = () => App.sheet.H;
  const T = (x, y, s, o) => Object.assign({ t: 'text', x: x, y: y, s: s, size: 14, weight: 500, fam: 'b', pe: false }, o);

  // basit sözcük kaydırma
  function wrap(text, maxChars) {
    const out = [];
    String(text).split('\n').forEach((para) => {
      const words = para.split(/\s+/);
      let cur = '';
      words.forEach((w) => {
        if ((cur + ' ' + w).trim().length > maxChars && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
      });
      out.push(cur);
    });
    return out;
  }

  function cols() { return App.siteDraw.cols(); }

  /* ---------------- sayfa tanımları ---------------- */
  function plan(st) {
    const P = st.project;
    const pages = [];
    const skipped = [];
    const add = (id, title, make) => pages.push({ id: id, title: title, make: make });

    if (P.spaces.length) {
      add('islev', 'İşlev şeması', () => { const d = App.state.derive(st); return App.board.toCanvas(P, d.k, d.score, 1.8); });
      if (P.study) {
        add('kat', 'Kat etüdü', () => { const sd = App.study.derive(P); const sc = App.study.scene(P, sd, false); return sc; });
        add('analiz', 'Mekân analizi', () => { const sd = App.study.derive(P); const sc = App.analysis.scene(P, sd, Object.assign({}, st.ui.an, { sel: null }), false); return sc; });
      }
    }
    const s = P.site;
    const e = s && App.site.entry(s);
    if (e) {
      const A = App.site.analyze(s, e);
      add('arsa', 'Arsa analizi', () => App.siteScene.arsa(P, A, Object.assign({}, st.ui.site, { sel: null, lod: false }), false));
    }
    if (s && s.parcel) {
      const cx = App.ui.site.imarCtx(st);
      ['plan', 'iso'].forEach((mode) => add('imar-' + mode, 'İmar ve kapasite · ' + (mode === 'iso' ? 'izometrik' : 'plan'), () => {
        const view = Object.assign({}, st.ui.imar, { mode: mode, fixed: null, tool: null, draft: null, lod: false });
        return App.imarScene.scene(P, cx.A, cx.R, view, false);
      }));
      const dc = App.dsnCtx(P);
      if (dc.ok) {
        [['vaziyet', 'Vaziyet planı'], ['tipik', 'Tipik kat planı'], ['bodrum', 'Bodrum otopark'], ['kutle', 'Kütle'], ['kiyas', 'Alternatif karşılaştırma']].forEach((m) => add('tasarim-' + m[0], 'Tasarım · ' + m[1], () => App.dsnScene.scene(P, dc, dc.alt, Object.assign({}, st.ui.dsn, { mode: m[0] }), false)));
        const f = App.fizCtx(P);
        if (f.ok) {
          [['ozet', 'Özet'], ['nakit', 'Nakit akışı'], ['duyarlilik', 'Duyarlılık'], ['metraj', 'Metraj']].forEach((m) => add('fiz-' + m[0], 'Fizibilite · ' + m[1], () => App.fizScene.scene(P, f, Object.assign({}, st.ui.fiz, { mode: m[0] }), false)));
        }
      } else skipped.push('Tasarım ve fizibilite: parselde üretilebilir tasarım yok');
    } else skipped.push('İmar, tasarım ve fizibilite: parsel çizilmedi');
    if (!P.spaces.length) skipped.push('İşlev şeması, kat etüdü, mekân analizi: mekân eklenmedi');
    if (s && !e) skipped.push('Arsa analizi: konum verisi alınmadı');
    return { pages: pages, skipped: skipped };
  }

  /* ---------------- kapak ve yöntem sayfaları ---------------- */
  function frameInfo(P, subtitle, stats, label, percent) {
    return { name: P.meta.name, subtitle: subtitle, legend: [], stats: stats, scoreLabel: label, percent: percent };
  }

  function coverScene(st, list, total) {
    const P = st.project, C = cols(), tb = App.sheet.tb;
    const prims = App.sheet.frame(frameInfo(P, 'Proje raporu · ' + U.today(), [['Sayfa', String(total)], ['Tarih', U.today()], ['Araç', 'archtools']], 'Sayfa', null), false);
    const ink = C.ink;
    prims.push(T(70, 130, 'PROJE RAPORU', { size: 15, weight: 700, fam: 'm', fill: ink, ls: 3, opacity: 0.6 }));
    wrap(P.meta.name, 26).slice(0, 3).forEach((ln, i) => prims.push(T(70, 200 + i * 62, ln, { size: 52, weight: 800, fam: 'd', fill: ink })));
    const loc = P.site && P.site.loc && P.site.loc.name;
    if (loc) prims.push(T(70, 380, loc, { size: 18, weight: 600, fill: ink, opacity: 0.75 }));
    // içindekiler
    prims.push(T(70, 440, 'İÇİNDEKİLER', { size: 13, weight: 700, fam: 'm', fill: ink, ls: 2, opacity: 0.6 }));
    const colN = list.length > 12 ? 2 : 1, per = Math.ceil(list.length / colN);
    list.forEach((p, i) => {
      const c = Math.floor(i / per), r = i % per;
      const x = 70 + c * 440, y = 478 + r * 26;
      prims.push(T(x, y, String(p.no).padStart(2, '0'), { size: 13, weight: 700, fam: 'm', fill: ink, opacity: 0.55 }));
      prims.push(T(x + 36, y, p.title, { size: 15, weight: 600, fill: ink }));
    });
    // sağ sütun: özet göstergeler
    const rows = [];
    const sp = P.spaces.length;
    if (sp) rows.push(['Mekân sayısı', String(sp)]);
    if (P.study) rows.push(['Kat sayısı (etüt)', String(P.study.floors.length)]);
    if (P.site && P.site.parcel) {
      const dc = App.dsnCtx(P);
      rows.push(['Parsel alanı', U.fmt(Math.abs(App.gis.area(P.site.parcel)), 0) + ' m²']);
      if (dc.ok) {
        rows.push(['Seçili alternatif', dc.alt.label], ['Kat · yükseklik', dc.alt.floors + ' kat · ' + U.fmt(dc.alt.height, 1) + ' m'], ['Daire sayısı', String(dc.alt.unitTotals.total)], ['Zemin üstü inşaat', U.fmt(dc.alt.built, 0) + ' m²']);
        const f = App.fizCtx(P);
        if (f.ok) rows.push(['Toplam maliyet (ÖRNEK)', App.fizScene.money(f.res.total, f.a.currency)], ['Kâr marjı (ÖRNEK)', (f.res.margin < 0 ? '−' : '') + '%' + U.fmt(Math.abs(f.res.margin) * 100, 1)]);
      }
    }
    prims.push(T(1018, 130, 'ÖZET', { size: 13, weight: 700, fam: 'm', fill: ink, ls: 2, opacity: 0.6 }));
    rows.forEach((r, i) => App.siteScene.kv(1018, 168 + i * 24, 340, r[0], r[1], C).forEach((p) => prims.push(p)));
    prims.push(T(70, tb.y - 22, 'Bu rapor, girilen varsayımlara dayalı bir ön çalışma çıktısıdır; resmî belge, ruhsat veya yatırım tavsiyesi değildir.', { size: 12, weight: 600, fill: ink, opacity: 0.65 }));
    return { prims: prims, W: W(), H: H() };
  }

  function methodScene(st, plan, no, total) {
    const P = st.project, C = cols(), tb = App.sheet.tb, ink = C.ink;
    const prims = App.sheet.frame(frameInfo(P, 'Proje raporu · yöntem ve kaynaklar', [['Sayfa', no + ' / ' + total], ['Tarih', U.today()], ['Araç', 'archtools']], 'Sayfa', null), false);
    const e = P.site && App.site.entry(P.site);
    const srcName = e ? (e.demo ? 'Demo (sentetik kent; gerçek veri değildir)' : App.ui.site.sourceName(e)) : null;
    const sec = [];
    sec.push(['Veri kaynakları', [
      srcName ? 'Çevre verisi (bina, yol, yeşil, su, toplu taşıma): ' + srcName + '. Her iki kaynakta da veri tamlığı bölgeye göre değişir; saha doğrulaması gerekir.' : 'Konum verisi alınmadığı için çevre analizi rapora girmedi.',
      'İklim ve güneş göstergeleri: Open-Meteo arşiv verisi (konum verisi alındıysa).',
      'İmar değerleri (TAKS, KAKS, yençok, çekmeler, bodrum): kullanıcı girdisidir; plan notları ve yürürlükteki yönetmeliklerle teyit edilmelidir.',
    ]]);
    sec.push(['Yöntem', [
      'Arsa ve yer seçimi: yürüme erişimi, toplu taşıma, yeşil alan, gürültü göstergesi ve çevre dokusu için ağırlıklı skorlar; tüm ağırlıklar arayüzden değiştirilebilir.',
      'İmar ve kapasite: parselden çekme zarfı, TAKS/KAKS ile taban ve toplam inşaat alanı, yençok ile kat sayısı; çevreye gölge ve gün ışığı göstergeleri.',
      'Tasarım üretici: seçilen daire karmasına göre kat planı ve bodrum otoparkı için kural tabanlı üretim; alternatifler skorlanır. Bu bir ön yerleşim önerisidir, uygulama projesi değildir.',
      'Maliyet ve fizibilite: metraj kalemleri × birim fiyat, dolaylı giderler, finansman ve nakit akışı; duyarlılık tabloları aynı modelle yeniden hesaplanır.',
    ]]);
    sec.push(['Sınırlar ve uyarılar', [
      'Varsayılan birim maliyetler ve satış fiyatları ÖRNEKtir; gerçek piyasa verisi değildir. Kendi değerlerinizle değiştirmeden karar vermeyin.',
      'Statik, mekanik, elektrik, yangın, erişilebilirlik ve deprem yönetmeliği kontrolleri bu aracın kapsamında değildir.',
      'Rapordaki sonuçlar, girdiler değiştikçe değişir; sayfalar rapor üretildiği andaki durumu gösterir (' + U.today() + ').',
    ]]);
    if (plan.skipped.length) sec.push(['Rapora girmeyen bölümler', plan.skipped]);
    let y = 110;
    sec.forEach((s) => {
      prims.push(T(70, y, s[0].toLocaleUpperCase('tr'), { size: 13, weight: 800, fam: 'm', fill: ink, ls: 2, opacity: 0.7 }));
      y += 26;
      s[1].forEach((b) => {
        wrap(b, 118).forEach((ln, i) => { if (y < tb.y - 18) prims.push(T(i ? 90 : 70, y, (i ? '' : '• ') + ln, { size: 13.5, weight: 500, fill: ink, opacity: 0.9 })); y += 20; });
        y += 4;
      });
      y += 12;
    });
    return { prims: prims, W: W(), H: H() };
  }

  /* ---------------- üretim ---------------- */
  const blobOf = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), 'image/jpeg', 0.9));

  function render(item, no, total) {
    return Promise.resolve(item.make()).then((r) => {
      if (r && typeof r.getContext === 'function') return r; // zaten tuval
      r.W = r.W || W(); r.H = r.H || H();
      r.prims.push(T(r.W - 26, r.H - 12, no + ' / ' + total, { size: 10.5, weight: 600, fam: 'm', fill: cols().ink, anchor: 'end', opacity: 0.55 }));
      return App.board.primsToCanvas(r.prims, r.W, r.H, 1.8);
    });
  }

  ctl.exportReport = function () {
    const st = get(), P = st.project;
    const pl = plan(st);
    if (!pl.pages.length) { ctl.toast('Rapor için önce bir mekân ekleyin ya da parsel çizin.', 'error'); return; }
    ctl.dispatch({ type: 'UI', patch: { busy: 'Rapor' } });
    const total = pl.pages.length + 2;
    const items = [{ id: 'cover', title: 'Kapak', make: null }].concat(pl.pages).concat([{ id: 'method', title: 'Yöntem ve kaynaklar', make: null }]);
    const toc = pl.pages.map((p, i) => ({ no: i + 2, title: p.title })).concat([{ no: total, title: 'Yöntem ve kaynaklar' }]);
    items[0].make = () => coverScene(st, toc, total);
    items[items.length - 1].make = () => methodScene(st, pl, total, total);
    const out = [];
    let chain = Promise.resolve();
    items.forEach((it, i) => {
      chain = chain.then(() => render(it, i + 1, total).then((cv) => blobOf(cv).then((b) => b.arrayBuffer()).then((buf) => { out.push({ jpeg: new Uint8Array(buf), w: cv.width, h: cv.height, title: it.title }); })));
    });
    chain.then(() => {
      const blob = App.pdf.build(out, { title: P.meta.name + ' · proje raporu', author: 'archtools', subject: 'Mimari ön çalışma raporu' });
      return App.files.saveBlob(U.slug(P.meta.name) + '-proje-raporu.pdf', blob);
    }).then((r) => ctl.report(r, 'Proje raporu hazır (' + total + ' sayfa)')).catch((e) => ctl.report({ ok: false, message: e && e.message }));
  };
})();
