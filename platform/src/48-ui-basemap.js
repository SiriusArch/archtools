/* ==========================================================================
   48-ui-basemap.js — Harita altlığı sol panel bölümü (Vaziyet Planı, Mekân Etüdü)
   ui.basemapSection(state, cfg, { key, onSet(patch) }) · ctl.mapSetLoc(sonuç)
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const bm = App.basemap;
  const get = () => App.store.get();

  const mapSetLoc = function (r) {
    if (!r || !(Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180)) return;
    const s = get().project.site;
    const loc = { lat: r.lat, lon: r.lon, name: String(r.name || r.lat.toFixed(5) + ', ' + r.lon.toFixed(5)).slice(0, 120), src: r.kind ? 'osm' : 'koordinat' };
    App.ctl.dispatch({ type: 'SITE_SET', patch: Object.assign({ loc: loc }, s.parcel ? { parcel: null } : {}) });
    App.ctl.dispatch({ type: 'UI', patch: { geo: Object.assign({}, get().ui.geo, { results: [], q: '', searched: false, err: null }) } });
    if (s.parcel) App.ctl.toast('Konum değişti: İmar parseli sıfırlandı. Geri al ile döndürebilirsiniz.');
  };

  const STATUS = {
    ok: 'Harita karoları yüklendi.',
    wait: 'Harita karoları denetleniyor…',
  };

  ui.basemapSection = function (state, cfg, o) {
    const ctl = App.ctl;
    if (!ctl.mapSetLoc) ctl.mapSetLoc = mapSetLoc;
    cfg = bm.clean(cfg);
    const loc = bm.loc(state.project);
    const pv = bm.provider(cfg.prov);
    const set = (patch) => {
      o.onSet(patch);
      setTimeout(() => bm.probe(Object.assign({}, cfg, patch), bm.loc(get().project), () => ctl.dispatch({ type: 'UI', patch: { mapTick: Date.now() } })), 0);
    };
    if (cfg.on && loc && !bm.status(cfg) && !bm.needsKey(cfg)) setTimeout(() => bm.probe(cfg, loc, () => ctl.dispatch({ type: 'UI', patch: { mapTick: Date.now() } })), 0);
    const st = cfg.on && loc && !bm.needsKey(cfg) ? bm.status(cfg) : null;
    let note = null;
    if (cfg.on && !loc) note = 'Demo konumunda gerçek harita yoktur. Aşağıdan bir konum arayın; harita o noktada açılır.';
    else if (cfg.on && bm.needsKey(cfg)) note = 'HERE haritası için API anahtarı gerekir. Anahtar yalnızca bu tarayıcıda saklanır.';
    else if (st && st.display === 'err') note = 'Harita karoları bu sağlayıcıdan alınamadı (ağ, anahtar ya da erişim izni).' + (bm.nextProvider(cfg.prov) ? '' : ' Başka bir sağlayıcı deneyin.');
    else if (cfg.on && pv.views && cfg.view === '3d') note = '3B görünümde Yandex binaları hacimli çizer; hacim yana yattığı için bina tabanı çizimle kaymış görünür. Ölçülü çalışmak için 2B kullanın.';
    else if (st && st.display === 'ok' && st.cors === 'err') note = 'Harita ekranda görünür ama bu sağlayıcı PNG / PDF çıktısına eklenmeye izin vermiyor; çıktıda harita olmayabilir.';
    else if (st && st.display === 'wait') note = STATUS.wait;
    const keyForm = cfg.on && ((cfg.prov === 'here' && !bm.hereKey()) || (cfg.prov === 'yandex' && cfg.view === '3d'))
      ? h('form', { class: 'here-form', onsubmit: (e) => { e.preventDefault(); const v = e.target.elements.k.value.trim(); if (cfg.prov === 'here') bm.setHereKey(v); else bm.setYandexKey(v); set({}); ctl.toast('Anahtar bu tarayıcıya kaydedildi.', 'success'); } },
        h('label', { class: 'sr', for: 'bm-key' }, pv.label + ' API anahtarı'),
        h('input', { id: 'bm-key', name: 'k', class: 'inp mono', type: 'password', placeholder: (cfg.prov === 'here' ? bm.hereKey() : bm.yandexKey()) ? '•••••••• (kayıtlı)' : pv.label + ' API anahtarı' + (pv.keyOptional ? ' (isteğe bağlı)' : ''), autocomplete: 'off', spellcheck: 'false', keep: true }),
        ui.btn('Kaydet', { icon: 'check', onclick: () => { const el = document.getElementById('bm-key'); if (!el) return; if (cfg.prov === 'here') bm.setHereKey(el.value); else bm.setYandexKey(el.value); set({}); ctl.toast('Anahtar bu tarayıcıya kaydedildi.', 'success'); } }))
      : null;
    return ui.section('Harita altlığı', h('div', { class: 'sec-box' },
      h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Haritayı altlık olarak aç', on: cfg.on, onclick: () => set({ on: !cfg.on }), title: 'Seçili konumun haritasını çizimin altına ölçekli olarak sererek çalış' })),
      cfg.on ? [
        ui.fld2('Sağlayıcı', ui.segmented({ label: 'Harita sağlayıcı', wide: true, value: cfg.prov, options: bm.PROVIDERS.map((p) => ({ v: p.id, label: p.short, title: p.label + (p === bm.PROVIDERS[0] ? ' (öncelikli)' : '') })), onchange: (v) => set({ prov: v, sat: false, view: '2d' }) })),
        pv.views ? ui.fld2('Görünüm', ui.segmented({ label: 'Harita görünümü 2B / 3B', value: cfg.view, options: bm.VIEWS.map((v) => ({ v: v.v, label: v.label, title: v.v === '2d' ? 'Düz plan: binalar yalnızca taban izi, çizimle birebir örter' : 'Bina gövdeli harita: hacim görünür ama taban izi kayar' })), onchange: (v) => set({ view: v, sat: false }) })) : null,
        pv.sat && cfg.view === '2d' ? h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Uydu görüntüsü', on: cfg.sat, onclick: () => set({ sat: !cfg.sat }) })) : null,
        ui.range({ id: 'bm-op', label: 'Harita görünürlüğü', min: 20, max: 100, step: 5, value: Math.round(cfg.op * 100), text: '%' + Math.round(cfg.op * 100), oninput: (v) => o.onSet({ op: v / 100 }, true) }),
        h('div', { class: 'tgl-row' }, ui.toggle({ label: 'Gri ton harita', on: cfg.gray, onclick: () => set({ gray: !cfg.gray }), title: 'Haritayı siyah-beyaz yap; çizim öne çıkar' })),
        keyForm,
        note ? h('p', { class: 'note' }, note) : null,
        st && st.display === 'err' && bm.nextProvider(cfg.prov) ? ui.btn(bm.nextProvider(cfg.prov).short + ' haritasına geç', { icon: 'pin', onclick: () => set({ prov: bm.nextProvider(cfg.prov).id, sat: false, view: '2d' }) }) : null,
        h('div', { class: 'loc-top bm-loc' }, ui.icon('pin', 16), h('div', { class: 'loc-t' }, h('b', { class: 'loc-name' }, loc ? loc.name : 'Konum seçilmedi'), loc ? h('span', { class: 'loc-sub mono' }, loc.lat.toFixed(5) + ', ' + loc.lon.toFixed(5)) : null)),
        ui.site && ui.site.searchBox ? ui.site.searchBox(state, { id: 'bm-q-' + o.key, placeholder: 'Konum ara: adres ya da 41.0082, 28.9784', pickLabel: 'Haritayı buraya aç', onPick: (r) => { ctl.mapSetLoc(r); setTimeout(() => set({}), 0); } }) : null,
        h('p', { class: 'note' }, 'Çizimin başlangıç noktası (0, 0) bu konuma denk gelir; harita metre ölçeğinde çizimle birlikte kayar ve ölçeklenir. Konum Arsa Analizi ile ortaktır.'),
      ] : h('p', { class: 'note' }, 'Seçili konumun Yandex, OpenStreetMap ya da HERE haritasını çizimin altına sererek yer üstünde çalışın.')), cfg.on ? pv.short : null, 'bm-' + o.key);
  };
})();
