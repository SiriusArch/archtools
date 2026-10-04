/* ==========================================================================
   69-ui-here.js — Harita veri kaynağı seçimi (OpenStreetMap / HERE), HERE API anahtarı alanı ve
   "HERE 3B" eğik harita penceresi. Arayüz kabuğu vdom dışındadır: pencere document.body'ye eklenir.
   Anahtar yalnızca bu tarayıcıda (localStorage) durur; proje JSON'una, paylaşım bağlantısına ya da dışa aktarmaya yazılmaz.
   ========================================================================== */
(function () {
  const App = window.App;
  const ctl = App.ctl;
  const ui = App.ui;
  const h = App.h;
  const here = App.here;
  const site = App.site;
  const S = ui.site;
  const get = () => App.store.get();

  /* ---------------- kaynak etiketi (arayüz, pafta, dışa aktarma) ---------------- */
  S.sourceName = function (ent) {
    if (ent && ent.demo) return 'Demo';
    return here.sourceLabel(ent);
  };
  S.sourceFull = function (ent) {
    if (!ent) return 'Veri bekleniyor';
    if (ent.demo) return 'Demo veri · sentetik kent';
    return 'Veri: ' + S.sourceName(ent) + ' · Open-Meteo';
  };

  /* ---------------- denetleyici ---------------- */
  ctl.geoSource = function (src) {
    if (src === 'here' && !here.getKey()) { here.setSource('osm'); ctl.toast('Önce HERE API anahtarınızı girin.', 'error'); ctl.dispatch({ type: 'UI', patch: { hereKeyOpen: true } }); return; }
    here.setSource(src === 'here' ? 'here' : 'osm');
    ctl.geo({ err: null, tick: (get().ui.geo.tick || 0) + 1 });
    const s = get().project.site;
    if (s.loc.src !== 'demo' && !site.entry(s)) ctl.siteFetch(false);
    else if (s.loc.src !== 'demo') ctl.toast(src === 'here' ? 'HERE verisine geçildi' : 'OpenStreetMap verisine geçildi');
  };
  ctl.hereKeySave = function (value) {
    const k = String(value || '').trim();
    if (!k) { here.setKey(''); if (here.source() === 'here') here.setSource('osm'); ctl.toast('HERE anahtarı silindi.'); }
    else if (!here.keyOk(k)) { ctl.toast('Anahtar biçimi geçersiz görünüyor. HERE Platform’dan aldığınız API anahtarını yapıştırın.', 'error'); return; }
    else { here.setKey(k); here.setSource('here'); ctl.toast('Anahtar bu tarayıcıya kaydedildi; harita verisi HERE’ye geçti.', 'success'); }
    ctl.dispatch({ type: 'UI', patch: { hereKeyOpen: false } });
    ctl.geo({ err: null, tick: (get().ui.geo.tick || 0) + 1 });
  };

  /* ---------------- sol panel bölümü ---------------- */
  S.sourceSection = function (state) {
    const g = state.ui.geo || S.GEO0;
    const act = here.active();
    const hasKey = !!here.getKey();
    const open = !!state.ui.hereKeyOpen || (here.source() === 'here' && !hasKey);
    const ent = site.entry(state.project.site);
    return ui.section('Harita verisi', h('div', { class: 'sec-box' },
      ui.fld2('Kaynak', ui.segmented({
        label: 'Harita veri kaynağı', wide: true, value: act ? 'here' : 'osm',
        options: [{ v: 'osm', label: 'OpenStreetMap', title: 'Anahtarsız, açık veri' }, { v: 'here', label: 'HERE', title: 'HERE Platform (kendi API anahtarınız)' }],
        onchange: (v) => ctl.geoSource(v),
      }), act ? 'Adres, işlev noktaları, yürüme izolinleri ve harita karoları HERE’den alınır.' : 'Anahtarsız, açık veri. HERE için API anahtarınızı girin.'),
      ent && !ent.demo ? h('p', { class: 'note mono' }, 'Yüklü veri: ' + S.sourceName(ent) + (ent.source === 'here+osm' ? ' (kısmen yedek kaynak)' : '')) : null,
      h('div', { class: 'here-key' },
        open ? h('form', { class: 'here-form', onsubmit: (e) => { e.preventDefault(); ctl.hereKeySave(e.target.elements.k.value); } },
          h('label', { class: 'sr', for: 'here-key' }, 'HERE API anahtarı'),
          h('input', { id: 'here-key', name: 'k', class: 'inp mono', type: 'password', placeholder: hasKey ? '•••••••• (kayıtlı)' : 'HERE API anahtarı', autocomplete: 'off', spellcheck: 'false', keep: true }),
          h('div', { class: 'here-act' }, ui.btn('Kaydet', { cls: 'btn-primary', icon: 'check', onclick: () => { const el = document.getElementById('here-key'); ctl.hereKeySave(el ? el.value : ''); } }),
            hasKey ? ui.btn('Sil', { icon: 'trash', onclick: () => ctl.hereKeySave('') }) : null,
            ui.btn('Kapat', { onclick: () => ctl.dispatch({ type: 'UI', patch: { hereKeyOpen: false } }) })))
          : h('div', { class: 'here-act' }, ui.btn(hasKey ? 'Anahtarı değiştir' : 'API anahtarı gir', { icon: 'pin', onclick: () => ctl.dispatch({ type: 'UI', patch: { hereKeyOpen: true } }) }),
            act ? ui.btn('HERE 3B harita', { cls: 'btn-primary', icon: 'layers', onclick: () => ctl.hereOpen3d(), title: 'Eğik, üç boyutlu HERE haritasında parseli ve çevreyi gör' }) : null)),
      h('p', { class: 'note' }, 'Anahtarınız yalnızca bu tarayıcıda saklanır; proje dosyasına, bağlantıya ya da dışa aktarmalara yazılmaz. ', h('a', { href: 'https://developer.here.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Anahtar alın (developer.here.com)'), '.'),
      act ? h('p', { class: 'note' }, here.NOTE) : null,
      g.err && g.err.indexOf('HERE') >= 0 ? h('p', { class: 'note' }, 'Anahtar ya da kota sorunu olabilir; anahtarınızı ve HERE hesabınızdaki kullanım durumunu kontrol edin.') : null), null, 'ssource');
  };

  /* ---------------- HERE 3B penceresi ---------------- */
  let dlg = null, map = null, esc = null;

  function overlaysFor(state) {
    const P = state.project, s = P.site, mod = state.ui.module;
    const ent = site.entry(s);
    const o = { origin: { lat: s.loc.lat, lon: s.loc.lon }, radius: s.radius, originMarker: true, markers: [] };
    if (ent && ent.iso) o.iso = ent.iso;
    if (s.parcel) {
      o.parcel = s.parcel;
      try { const cx = S.imarCtx(state); if (cx && cx.R && cx.R.env) o.env = cx.R.env; } catch (e) { /* zarf yok */ }
    }
    if (mod === 'yer') {
      P.cand.list.forEach((c, i) => { if (c.src !== 'demo' || ent) o.markers.push({ lat: c.lat, lon: c.lon, label: (i + 1) + '. ' + c.name }); });
    }
    return o;
  }

  function close() {
    if (esc) { document.removeEventListener('keydown', esc); esc = null; }
    if (map) { try { map.dispose(); } catch (e) { /* yok say */ } map = null; }
    if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
    dlg = null;
  }
  ctl.hereClose3d = close;

  ctl.hereOpen3d = function () {
    if (!here.active()) { ctl.toast('HERE 3B için kaynağı HERE yapın ve API anahtarınızı girin.', 'error'); ctl.dispatch({ type: 'UI', patch: { hereKeyOpen: true } }); return; }
    if (dlg) return;
    const st = get(), s = st.project.site;
    if (s.loc.src === 'demo') { ctl.toast('Demo bölge sentetiktir; HERE haritasında gösterilecek gerçek bir konum yok. Bir adres arayın.'); return; }
    const key = here.getKey();
    dlg = document.createElement('div');
    dlg.className = 'h3d';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'HERE 3B harita');
    const stateEl = document.createElement('p');
    stateEl.className = 'h3d-state';
    stateEl.setAttribute('role', 'status');
    stateEl.textContent = 'HERE harita kitaplığı yükleniyor…';
    const box = document.createElement('div');
    box.className = 'h3d-map';
    const head = document.createElement('div');
    head.className = 'h3d-head';
    const title = document.createElement('b');
    title.textContent = 'HERE 3B · ' + s.loc.name;
    const tools = document.createElement('div');
    tools.className = 'h3d-tools';
    const mk = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); return b; };
    const view = { tilt: 60, heading: 0, zoom: 17 };
    const apply = () => { if (map) map.setView({ lat: s.loc.lat, lon: s.loc.lon, zoom: view.zoom, tilt: view.tilt, heading: view.heading }, true); };
    tools.appendChild(mk('Üstten', () => { view.tilt = 0; view.heading = 0; apply(); }));
    tools.appendChild(mk('Eğik', () => { view.tilt = 60; apply(); }));
    tools.appendChild(mk('Çevir', () => { view.heading = (view.heading + 90) % 360; apply(); }));
    tools.appendChild(mk('Yakın', () => { view.zoom = Math.min(20, view.zoom + 1); apply(); }));
    tools.appendChild(mk('Uzak', () => { view.zoom = Math.max(13, view.zoom - 1); apply(); }));
    const x = mk('Kapat', close, 'btn-primary');
    x.setAttribute('aria-label', 'HERE 3B penceresini kapat');
    head.appendChild(title); head.appendChild(tools); head.appendChild(x);
    const foot = document.createElement('p');
    foot.className = 'h3d-foot';
    foot.textContent = here.ATTRIBUTION + ' · Parsel kırmızı, imar zarfı mavi, yürüme izolinleri yeşil-sarı-turuncu, kesikli halka analiz yarıçapıdır.';
    dlg.appendChild(head); dlg.appendChild(box); dlg.appendChild(stateEl); dlg.appendChild(foot);
    document.body.appendChild(dlg);
    esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', esc);
    x.focus();

    App.here3d.load(key).then(function () {
      if (!dlg) return;
      map = App.here3d.create(box, { lat: s.loc.lat, lon: s.loc.lon, zoom: view.zoom, tilt: view.tilt, heading: 0, key: key, onError: function (e) { stateEl.textContent = (e && e.message) || 'HERE haritası kurulamadı.'; stateEl.className = 'h3d-state err'; } });
      if (map && !map.dead) {
        map.setOverlays(overlaysFor(get()));
        stateEl.textContent = '';
        stateEl.className = 'h3d-state';
      }
    }).catch(function (e) {
      stateEl.textContent = (e && e.message) ? e.message + ' Anahtarınızı kontrol edin.' : 'HERE harita kitaplığı yüklenemedi. Anahtarınızı ve ağ bağlantınızı kontrol edin.';
      stateEl.className = 'h3d-state err';
    });
  };

  /* araç çubuğu düğmesi (Arsa / İmar / Yer) */
  S.here3dTool = function () {
    if (!here.active()) return null;
    return { k: 'btn', label: 'HERE 3B', icon: 'layers', onclick: () => ctl.hereOpen3d(), title: 'Eğik, üç boyutlu HERE haritası' };
  };
})();
