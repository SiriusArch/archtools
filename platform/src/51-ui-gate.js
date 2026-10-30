/* ==========================================================================
   51-ui-gate.js — profil kapısı (ilk ziyaret) ve "Profilim ve gizlilik" penceresi
   Kapı zorunludur: ad + açık rıza olmadan site kullanılmaz. Google / e-posta doğrulaması yoktur; bilgiler kişinin beyanıdır.
   Pencere ayrı bir sanal-DOM kökünde (#gate-root) çizilir; açıkken uygulama (#root) etkileşime kapatılır (inert).
   Kullanım: App.ui.gate.open('form' | 'profile' | 'blocked')  ·  mantık ve ağ: App.visit (52-lib-visit.js)
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;

  const ROLES = [['mimar', 'Mimar'], ['ogrenci', 'Öğrenci'], ['akademisyen', 'Akademisyen'], ['ofis', 'Ofis / firma'], ['kamu', 'Kamu'], ['gayrimenkul', 'Gayrimenkul'], ['diger', 'Diğer']];
  const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,79}$/u;
  const EMAIL = /^[^\s@<>"'`]{1,64}@[^\s@<>"'`]{1,190}\.[^\s@<>"'`]{2,24}$/;
  const MSG = {
    name: 'Lütfen adınızı ve soyadınızı yazın (en az 2 harf; rakam ve işaret kullanmayın).',
    email: 'E-posta adresi geçerli görünmüyor. İsterseniz boş bırakabilirsiniz.',
    consent: 'Devam etmek için aydınlatma metnini onaylamanız gerekir.',
    rate: 'Kısa sürede çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
    offline: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.',
    server: 'Şu an kaydınız oluşturulamadı. Lütfen yeniden deneyin.',
    store_unavailable: 'Şu an kaydınız oluşturulamadı. Lütfen yeniden deneyin.',
  };

  let G = null; // { mode, busy, error, notice, confirmDelete, loaded }
  let F = { name: '', org: '', email: '', role: '', consent: false };
  let paint = null, root = null, opener = null;

  const valid = () => NAME.test(F.name.trim().replace(/\s+/g, ' ')) && (!F.email.trim() || EMAIL.test(F.email.trim())) && (G.mode === 'profile' || F.consent);
  const redraw = () => { if (paint) paint(); };
  const inertApp = (on) => { const r = document.getElementById('root'); if (!r) return; if (on) { r.setAttribute('inert', ''); r.setAttribute('aria-hidden', 'true'); } else { r.removeAttribute('inert'); r.removeAttribute('aria-hidden'); } };

  function field(id, label, opts) {
    return h('div', { class: 'gate-fld' },
      h('label', { class: 'lbl', for: id }, label),
      h('input', { id: id, class: 'ginput', type: opts.type || 'text', maxlength: opts.max, value: F[opts.key], keep: true, autocomplete: opts.ac, inputmode: opts.im || null, placeholder: opts.ph || null,
        'aria-required': opts.req ? 'true' : null, 'aria-invalid': opts.invalid ? 'true' : null,
        oninput: (e) => { F[opts.key] = e.target.value; if (G.error) G.error = null; redraw(); } }));
  }

  function rolesRow() {
    return h('div', { class: 'gate-fld' },
      h('span', { class: 'lbl', id: 'g-role-l' }, 'Rolünüz (isteğe bağlı)'),
      h('div', { class: 'gate-roles', role: 'group', 'aria-labelledby': 'g-role-l' },
        ROLES.map((r) => h('button', { key: r[0], type: 'button', class: 'gate-chip' + (F.role === r[0] ? ' on' : ''), 'aria-pressed': String(F.role === r[0]), onclick: () => { F.role = F.role === r[0] ? '' : r[0]; redraw(); } }, r[1]))));
  }

  const contactLine = () => {
    const i = App.visit.info();
    return i.name || i.email ? 'Veri sorumlusu: ' + [i.name, i.email].filter(Boolean).join(' · ') : null;
  };

  function submit() {
    if (G.busy) return;
    const name = F.name.trim().replace(/\s+/g, ' ');
    if (!NAME.test(name)) { G.error = 'name'; redraw(); return; }
    if (F.email.trim() && !EMAIL.test(F.email.trim())) { G.error = 'email'; redraw(); return; }
    if (G.mode === 'form' && !F.consent) { G.error = 'consent'; redraw(); return; }
    const fields = { name: name, org: F.org.trim(), email: F.email.trim(), role: F.role };
    G.busy = true; G.error = null; redraw();
    const p = G.mode === 'form' ? App.visit.register(fields) : App.visit.update(fields);
    p.then(function (r) {
      G.busy = false;
      if (r.ok) { if (G.mode === 'profile') { G.saved = true; redraw(); setTimeout(function () { if (G && G.mode === 'profile') api.close(); }, 700); } else api.close(); return; }
      G.error = r.error || 'server'; redraw();
    });
  }

  function formCard() {
    const isForm = G.mode === 'form';
    if (!isForm && !G.loaded) return h('div', { class: 'gate-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Profilim ve gizlilik' }, h('h2', { class: 'gate-title' }, 'Profilim ve gizlilik'), h('p', { class: 'gate-lead' }, 'Yükleniyor…'));
    const err = G.error ? MSG[G.error] || MSG.server : null;
    const canSkip = isForm && (G.error === 'offline' || G.error === 'server' || G.error === 'store_unavailable');
    const cl = contactLine();
    return h('div', { class: 'gate-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title', 'aria-describedby': 'gate-lead' },
      h('div', { class: 'gate-head' },
        ui.glass ? ui.glass.logo() : null,
        h('span', { class: 'gate-brand' }, 'archtools')),
      h('h2', { id: 'gate-title', class: 'gate-title' }, isForm ? 'Hoş geldiniz' : 'Profilim ve gizlilik'),
      h('p', { id: 'gate-lead', class: 'gate-lead' }, isForm
        ? 'Başlamadan önce kısa bir profil oluşturun. Hesap açmanız ya da şifre belirlemeniz gerekmez. Bilgilerinizi yalnızca site yöneticisi görebilir.'
        : 'Bilgilerinizi güncelleyebilir ya da tüm verilerinizi silebilirsiniz.'),
      G.notice ? h('p', { class: 'gate-notice', role: 'status' }, G.notice) : null,
      h('form', { class: 'gate-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
        field('g-name', 'Ad Soyad', { key: 'name', max: 80, ac: 'name', req: true, ph: 'Örn. Ayşe Yılmaz', invalid: G.error === 'name' }),
        field('g-org', 'Kurum / okul (isteğe bağlı)', { key: 'org', max: 80, ac: 'organization', ph: 'Örn. ODTÜ Mimarlık' }),
        field('g-mail', 'E-posta (isteğe bağlı)', { key: 'email', max: 120, ac: 'email', type: 'email', im: 'email', ph: 'ad@ornek.com', invalid: G.error === 'email' }),
        rolesRow(),
        isForm ? h('label', { class: 'gate-consent' },
          h('input', { type: 'checkbox', checked: !!F.consent, onchange: (e) => { F.consent = e.target.checked; if (G.error === 'consent') G.error = null; redraw(); }, 'aria-describedby': 'gate-consent-t' }),
          h('span', { id: 'gate-consent-t' }, 'Ad, kurum, e-posta, rol, kullanım süresi ve cihaz / yaklaşık konum bilgilerimin site yöneticisi tarafından işlenmesine açık rıza veriyorum. ',
            h('a', { href: '/gizlilik', target: '_blank', rel: 'noopener noreferrer' }, 'Aydınlatma metnini'), ' okudum.')) : null,
        err ? h('p', { class: 'gate-err', role: 'alert' }, err) : null,
        G.saved ? h('p', { class: 'gate-ok', role: 'status' }, 'Kaydedildi.') : null,
        h('div', { class: 'gate-actions' },
          h('button', { type: 'submit', class: 'btn btn-primary', disabled: G.busy || !valid() }, G.busy ? 'Kaydediliyor…' : isForm ? 'Devam et' : 'Kaydet'),
          !isForm ? h('button', { type: 'button', class: 'btn', onclick: () => api.close() }, 'Kapat') : null,
          canSkip ? h('button', { type: 'button', class: 'btn', onclick: () => { App.visit.skip(); api.close(); } }, 'Yine de devam et') : null)),
      !isForm ? h('div', { class: 'gate-danger' },
        G.confirmDelete
          ? h('div', { class: 'gate-confirm', role: 'alertdialog', 'aria-label': 'Silme onayı' },
              h('p', {}, 'Tüm profil ve kullanım verileriniz kalıcı olarak silinir. Siteyi kullanmaya devam etmek için profilinizi yeniden oluşturmanız gerekir.'),
              h('div', { class: 'gate-actions' },
                h('button', { type: 'button', class: 'btn btn-primary', disabled: G.busy, onclick: doDelete }, G.busy ? 'Siliniyor…' : 'Evet, verilerimi sil'),
                h('button', { type: 'button', class: 'btn', onclick: () => { G.confirmDelete = false; redraw(); } }, 'Vazgeç')))
          : h('button', { type: 'button', class: 'linkbtn', onclick: () => { G.confirmDelete = true; redraw(); } }, 'Verilerimi sil'),
        h('p', { class: 'gate-meta' }, 'Veriler son kullanımdan ', String(App.visit.info().retentionDays), ' gün sonra otomatik silinir. ', h('a', { href: '/gizlilik', target: '_blank', rel: 'noopener noreferrer' }, 'Aydınlatma metni'))) : null,
      cl ? h('p', { class: 'gate-meta' }, cl) : null);
  }

  function doDelete() {
    if (G.busy) return;
    G.busy = true; redraw();
    App.visit.remove().then(function (r) {
      G.busy = false;
      if (r.ok) { F = { name: '', org: '', email: '', role: '', consent: false }; api.open('form', { notice: 'Verileriniz silindi.' }); return; }
      G.error = r.error || 'server'; redraw();
    });
  }

  function blockedCard() {
    return h('div', { class: 'gate-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title' },
      h('div', { class: 'gate-head' }, ui.glass ? ui.glass.logo() : null, h('span', { class: 'gate-brand' }, 'archtools')),
      h('h2', { id: 'gate-title', class: 'gate-title' }, 'Erişim kapalı'),
      h('p', { class: 'gate-lead' }, 'Bu profil için erişim site yöneticisi tarafından kapatıldı. Bir yanlışlık olduğunu düşünüyorsanız yöneticiyle iletişime geçin.'),
      contactLine() ? h('p', { class: 'gate-meta' }, contactLine()) : null);
  }

  function view() {
    return h('div', { class: 'gate-host' }, G ? h('div', { class: 'gate', key: 'gate' }, h('div', { class: 'gate-scrim' }), G.mode === 'blocked' ? blockedCard() : formCard()) : null);
  }

  const api = (ui.gate = {
    open: function (mode, o) {
      if (!root) {
        root = document.createElement('div'); root.id = 'gate-root'; document.body.appendChild(root);
        paint = App.mount(root, view);
        document.addEventListener('keydown', function (e) { if (G && G.mode === 'profile' && e.key === 'Escape') api.close(); });
      }
      if (!G || !opener) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      G = Object.assign({ mode: mode, busy: false, error: null, notice: null, confirmDelete: false, saved: false, loaded: mode !== 'profile' }, o || {});
      inertApp(true);
      redraw();
      if (mode === 'profile') {
        App.visit.me().then(function (p) { if (!G || G.mode !== 'profile') return; if (p) { F.name = p.name; F.org = p.org; F.email = p.email; F.role = p.role; } G.loaded = true; redraw(); setTimeout(function () { const el = document.getElementById('g-name'); if (el) el.focus(); }, 30); });
      } else setTimeout(function () { const el = document.getElementById(mode === 'form' ? 'g-name' : 'gate-title'); if (el) el.focus(); }, 60);
    },
    close: function () {
      G = null; redraw(); inertApp(false);
      if (opener && document.body.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
      opener = null;
    },
    isOpen: function () { return !!G; },
  });

  // üst çubuktaki kişi düğmesi: yalnızca takip açıkken görünür
  ui.profileBtn = function () { if (App.visit.enabled()) api.open('profile'); };
})();
