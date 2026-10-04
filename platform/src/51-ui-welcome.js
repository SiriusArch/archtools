/* ==========================================================================
   51-ui-welcome.js — ilk açılış soruları: "Çalışmanızı en iyi tanımlayan nedir?" ve "İlk olarak ne yapmak istersiniz?"
   Yanıtlar yalnızca bu tarayıcıda (archtools.profile) saklanır; rol varsayılan programı, hedef de açılacak modülü seçer.
   Intro bitince bir kez gösterilir; üst çubuktaki "?" ile yeniden açılır. ?welcome=0 kapatır, ?welcome=1 zorlar.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const KEY = 'archtools.profile';

  const ROLES = [
    { id: 'planlama', label: 'Şehir Planlama ve Tasarım', sub: 'Mahalle, kent ve çevre ölçeğinde çalışırım.', tpl: 'karma', icon: 'layers' },
    { id: 'gayrimenkul', label: 'Gayrimenkul ve Geliştirme', sub: 'Arsa değerlendirir, proje fizibilitesi yaparım.', tpl: 'konut', icon: 'parcel' },
    { id: 'kamu', label: 'Hükümet ve Kamu Sektörü', sub: 'Belediye, kurum ya da kamu yatırımları için çalışırım.', tpl: 'kamu', icon: 'pin' },
    { id: 'egitim', label: 'Öğrenci veya Eğitimci', sub: 'Okuyor, öğretiyor ya da araştırma yapıyorum.', tpl: 'serbest', icon: 'draw' },
    { id: 'mimar', label: 'Mimarlık ve Yapı Tasarımı', sub: 'Bina programı, plan ve kütle üzerinde çalışırım.', tpl: 'konut', icon: 'newdoc' },
  ];
  const GOALS = [
    { id: 'analiz', label: 'Bir siteyi analiz edin', sub: 'Konumu seçin; yürüme erişimi, ulaşım, yeşil alan ve gürültüyü görün.', icon: 'search' },
    { id: 'yer', label: 'Konumları bulun veya karşılaştırın', sub: 'Adayları aynı ölçütlerle sıralayın ya da çevrede en uygun noktayı tarayın.', icon: 'compare' },
    { id: 'sunum', label: 'Sunum için haritalar hazırlayın', sub: 'Katman katman izometrik pafta; PNG, PDF ve SVG olarak alın.', icon: 'image' },
    { id: 'cad', label: 'Verileri CAD veya GIS’e aktarın', sub: 'DXF, GeoJSON ve CSV: gerçek koordinatlı, metre birimli katmanlar.', icon: 'download' },
    { id: 'imar', label: 'Parselin imar kapasitesini hesaplayın', sub: 'TAKS, KAKS, çekmeler ve yençok ile kütleyi ve birim sayısını görün.', icon: 'parcel' },
    { id: 'tasarim', label: 'Parsele bina tasarımı üretin', sub: 'Kütle alternatifleri, tipik kat planı, daire karması ve otopark; CAD, IFC ve Excel çıktısı.', icon: 'layers' },
    { id: 'fizibilite', label: 'Maliyet ve fizibilite hesaplayın', sub: 'Metraj, maliyet, satış geliri, kâr, başabaş fiyat ve nakit akışı.', icon: 'compare' },
    { id: 'bina', label: 'Bina programı kurgulayın', sub: 'İşlev şeması, kat etüdü ve mekân analizi ile bina içini tasarlayın.', icon: 'layout' },
    { id: 'kesif', label: 'Sadece keşfediyorum', sub: 'Örnek verilerle gezin; istediğiniz modülü üst çubuktan açın.', icon: 'spark' },
  ];

  const read = function () { try { const o = JSON.parse(window.localStorage.getItem(KEY) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
  const write = function (o) { try { window.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const get = () => App.store.get();
  const ctl = () => App.ctl;

  let opener = null;

  const W = (App.welcome = {
    ROLES: ROLES, GOALS: GOALS, profile: read,
    wanted: function () {
      try {
        const q = new URLSearchParams(location.search).get('welcome');
        if (q === '0') return false;
        if (q === '1') return true;
      } catch (e) {}
      return !read();
    },
    open: function (step) {
      opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      ctl().dispatch({ type: 'UI', patch: { welcome: { step: step || 1, role: (read() || {}).role || null } } });
      setTimeout(function () { const el = document.getElementById('wc-first'); if (el) el.focus(); }, 60);
    },
    close: function () {
      ctl().dispatch({ type: 'UI', patch: { welcome: null } });
      if (opener && document.body.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
      opener = null;
    },
    maybe: function () { if (W.wanted()) W.open(1); },
    pickRole: function (id) {
      const w = get().ui.welcome;
      if (!w) return;
      ctl().dispatch({ type: 'UI', patch: { welcome: { step: 2, role: id } } });
      setTimeout(function () { const el = document.getElementById('wc-first'); if (el) el.focus(); }, 60);
    },
    skip: function () {
      const w = get().ui.welcome;
      write(Object.assign({}, read() || {}, { role: (w && w.role) || (read() || {}).role || null, skipped: true, t: Date.now() }));
      W.close();
    },
    pickGoal: function (id) {
      const w = get().ui.welcome, c = ctl();
      const role = ROLES.find((r) => r.id === (w && w.role)) || null;
      write({ role: role ? role.id : null, goal: id, t: Date.now() });
      W.close();
      // rol → varsayılan program (ağırlıklar); yalnızca ilk kez ve geri alınabilir geçmişe girmeden
      if (role && c.dispatch && get().project.site && get().project.site.template !== role.tpl) c.dispatch({ type: 'SITE_SET_LIVE', patch: { template: role.tpl } });
      const later = (fn, ms) => setTimeout(fn, ms || 140);
      if (id === 'analiz') { c.go('arsa'); later(function () { const el = document.getElementById('site-q'); if (el) el.focus(); }, 260); }
      else if (id === 'yer') { c.go('yer'); later(function () { if (get().project.cand.list.length === 0) c.toast('Demo adaylarla başlayabilir ya da bir adres arayabilirsiniz.'); }, 260); }
      else if (id === 'sunum') { c.go('arsa'); later(function () { c.siteMode && c.siteMode('iso'); c.toast('Katmanlar “Görünüm” sekmesinden seçilir; “Dışa aktar” ile PNG, PDF ve SVG alın.'); }); }
      else if (id === 'cad') { c.go('arsa'); later(function () { c.xmenu && c.xmenu(true); }, 300); }
      else if (id === 'imar') { c.go('imar'); }
      else if (id === 'tasarim') { c.go('tasarim'); }
      else if (id === 'fizibilite') { c.go('fizibilite'); }
      else if (id === 'bina') { c.go('islev'); }
      else c.toast('İyi keşifler: üst çubuktan sekiz modül arasında gezinebilirsiniz.');
    },
  });
  ui.helpBtn = function () { W.open(1); };

  /* ---------------- bileşen ---------------- */
  function opt(o, i, on, onclick) {
    return h('button', { key: o.id, type: 'button', id: i === 0 ? 'wc-first' : null, class: 'wc-opt' + (on ? ' on' : ''), 'aria-pressed': on == null ? null : String(!!on), onclick: onclick },
      h('span', { class: 'wc-ico', 'aria-hidden': 'true' }, ui.icon(o.icon, 20)),
      h('span', { class: 'wc-t' }, h('b', {}, o.label), h('small', {}, o.sub)));
  }

  function trap(e) {
    if (e.key === 'Escape') { e.preventDefault(); W.skip(); return; }
    if (e.key !== 'Tab') return;
    const box = e.currentTarget;
    const f = Array.prototype.slice.call(box.querySelectorAll('button:not([disabled])'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  ui.welcome = function (state) {
    const w = state.ui.welcome;
    if (!w) return null;
    const prof = read() || {};
    const step = w.step === 2 ? 2 : 1;
    const q = step === 1 ? 'Çalışmalarınızı en iyi tanımlayan kelime nedir?' : 'İlk olarak ne yapmak istersiniz?';
    const list = step === 1
      ? ROLES.map((r, i) => opt(r, i, w.role === r.id, () => W.pickRole(r.id)))
      : GOALS.map((g, i) => opt(g, i, null, () => W.pickGoal(g.id)));
    return h('div', { class: 'wc', key: 'welcome' },
      h('div', { class: 'wc-scrim', onclick: () => W.skip() }),
      h('section', { class: 'wc-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wc-q', onkeydown: trap },
        h('div', { class: 'wc-head' },
          h('span', { class: 'wc-step mono' }, step + ' / 2'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', title: 'Şimdilik geç', onclick: () => W.skip() }, ui.icon('close', 16))),
        h('p', { class: 'wc-hello' }, step === 1 ? 'archtools’a hoş geldiniz' : (ROLES.find((r) => r.id === w.role) || { label: 'Hoş geldiniz' }).label),
        h('h2', { id: 'wc-q', class: 'wc-q' }, q),
        h('div', { class: 'wc-list wc-list-' + step, role: 'group', 'aria-labelledby': 'wc-q' }, list),
        h('div', { class: 'wc-foot' },
          step === 2 ? h('button', { type: 'button', class: 'btn', onclick: () => ctl().dispatch({ type: 'UI', patch: { welcome: { step: 1, role: w.role } } }) }, h('span', { class: 'wc-flip' }, ui.icon('chevron', 14)), h('span', { class: 'wc-back' }, 'Geri')) : h('span', {}),
          h('button', { type: 'button', class: 'btn', onclick: () => W.skip() }, prof.role || prof.skipped ? 'Kapat' : 'Şimdilik geç')),
        h('p', { class: 'wc-note' }, 'Yanıtlar yalnızca bu tarayıcıda saklanır; varsayılan programı ve ilk açılan modülü seçmek için kullanılır.')));
  };
})();
