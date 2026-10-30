/* legal.js — aydınlatma metnindeki veri sorumlusu bilgisini sunucudan (ortam değişkenlerinden) alır.
   Kişisel iletişim bilgisi depoda TUTULMAZ; yalnızca dağıtım ortamında tanımlanır. Tüm yazımlar textContent ile yapılır. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}$/;
  const unset = (n) => { n.textContent = 'Henüz tanımlanmadı (yönetici yapılandırmalıdır).'; n.classList.add('lg-unset'); };
  fetch('/api/v', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AT': '1' }, body: JSON.stringify({ a: 'contact' }), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then((r) => r.json())
    .then((j) => {
      if (!j || !j.ok) throw new Error('x');
      if (j.name) $('lg-name').textContent = String(j.name).slice(0, 120); else unset($('lg-name'));
      const m = $('lg-mail');
      if (j.email && MAIL.test(j.email)) {
        const a = document.createElement('a'); a.href = 'mailto:' + encodeURIComponent(j.email).replace(/%40/g, '@'); a.textContent = j.email; m.textContent = ''; m.append(a);
      } else unset(m);
      if (j.retentionDays) $('lg-ret').textContent = String(j.retentionDays);
      if (j.consentVersion) $('lg-ver').textContent = String(j.consentVersion);
      if (j.enabled === false) $('lg-off').hidden = false;
    })
    .catch(() => { unset($('lg-name')); unset($('lg-mail')); });
})();
