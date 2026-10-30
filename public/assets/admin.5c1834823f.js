/* ==========================================================================
   admin.js — archtools yönetim paneli (yalnızca yönetici)
   Güvenlik: tüm dinamik içerik DOM'a textContent / createTextNode ile yazılır (innerHTML YOK → saklı XSS olmaz);
   oturum HttpOnly çerezdedir (bu betik token görmez); her istek X-AT başlığı taşır; çıkışta sunucu oturumu iptal eder.
   Saatler Europe/Istanbul'a göredir.
   ========================================================================== */
(function () {
  'use strict';
  const TZ = 'Europe/Istanbul';
  const dt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dts = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dday = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short' });
  let regionNames = null; try { regionNames = new Intl.DisplayNames(['tr'], { type: 'region' }); } catch (e) {}
  const ONLINE = 2 * 60 * 1000;

  /* ---------- küçük DOM yardımcısı: metin her zaman düz metindir ---------- */
  function el(tag, props) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v; /* CSSOM: katı CSP (style-src 'self') satır içi style özniteliğini engeller, cssText'i değil */
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e[k] = v;
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    const add = (c) => { if (Array.isArray(c)) c.forEach(add); else if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return e;
  }

  /* ---------- API ---------- */
  function api(a, body) {
    return fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AT': '1' }, body: JSON.stringify(Object.assign({ a: a }, body || {})),
      credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    }).then((r) => r.json().then((j) => ({ status: r.status, j: j || {} }), () => ({ status: r.status, j: {} })), () => ({ status: 0, j: {} }));
  }

  const S = { authed: false, totp: false, now: Date.now(), overview: null, items: [], more: false, q: '', sort: 'last', filter: 'all', detail: null, err: '', timer: null };
  const root = document.getElementById('adm-root');

  /* ---------- biçimler ---------- */
  const fmtDur = (s) => { s = Math.round(s || 0); if (s < 60) return s + ' sn'; const m = Math.round(s / 60); if (m < 60) return m + ' dk'; const h = Math.floor(m / 60); return h + ' sa ' + (m % 60) + ' dk'; };
  const fmtAgo = (t) => { if (!t) return '—'; const d = Math.max(0, S.now - t); if (d < ONLINE) return 'şimdi'; const m = Math.round(d / 60000); if (m < 60) return m + ' dk önce'; const h = Math.round(m / 60); if (h < 36) return h + ' sa önce'; return dt.format(t); };
  const country = (c) => (!c || c === '??' ? 'Bilinmiyor' : regionNames ? regionNames.of(c) || c : c);
  const ROLE = { mimar: 'Mimar', ogrenci: 'Öğrenci', akademisyen: 'Akademisyen', ofis: 'Ofis / firma', kamu: 'Kamu', gayrimenkul: 'Gayrimenkul', diger: 'Diğer', '-': 'Belirtmedi' };
  const EVT = { start: 'Oturum başladı', color_on: 'Renklendirmeyi açtı', color_off: 'Sadeleştirdi', palette: 'Palet seçti', auto_layout: 'Otomatik yerleştirdi', add_space: 'Mekân ekledi', template: 'Hazır program yükledi', export_png: 'PNG indirdi', export_pdf: 'PDF indirdi', save_json: 'JSON kaydetti', load_json: 'JSON yükledi' };
  const online = (v) => S.now - v.last < ONLINE;

  /* ---------- giriş ---------- */
  function renderLogin(msg) {
    const pw = el('input', { id: 'a-pw', class: 'ginput', type: 'password', autocomplete: 'current-password', required: true, maxlength: 256 });
    const code = el('input', { id: 'a-code', class: 'ginput', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '123456' });
    const err = el('p', { class: 'gate-err', role: 'alert', hidden: !msg }, msg || '');
    const btn = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Giriş yap');
    const form = el('form', { class: 'gate-form', onsubmit: function (e) {
      e.preventDefault(); btn.disabled = true; err.hidden = true;
      api('login', { password: pw.value, totp: code.value }).then(function (r) {
        pw.value = ''; code.value = ''; btn.disabled = false;
        if (r.status === 200) { load(); return; }
        err.textContent = r.status === 429 ? 'Çok fazla deneme. 15 dakika sonra yeniden deneyin.' : r.status === 503 ? 'Yönetici girişi henüz yapılandırılmadı (KURULUM.md).' : r.status === 0 ? 'Sunucuya ulaşılamadı.' : 'Giriş bilgileri geçersiz.';
        err.hidden = false;
      });
    } },
      el('div', { class: 'gate-fld' }, el('label', { class: 'lbl', for: 'a-pw' }, 'Parola'), pw),
      S.totp ? el('div', { class: 'gate-fld' }, el('label', { class: 'lbl', for: 'a-code' }, 'Doğrulama kodu (kimlik doğrulayıcı uygulama)'), code) : null,
      err, el('div', { class: 'gate-actions' }, btn));
    root.replaceChildren(el('div', { class: 'adm-login' }, el('div', { class: 'gate-card', role: 'main' },
      el('div', { class: 'gate-head' }, el('span', { class: 'gate-brand' }, 'archtools')),
      el('h1', { class: 'gate-title' }, 'Yönetim'), el('p', { class: 'gate-lead' }, 'Yalnızca site yöneticisi içindir.'), form)));
    pw.focus();
  }

  /* ---------- panel ---------- */
  function kpi(v, label, sub) { return el('div', { class: 'adm-card adm-kpi' }, el('b', {}, v), el('span', {}, label), sub ? el('small', {}, sub) : null); }

  function hoursCard(hours) {
    const vals = []; let max = 1;
    for (let i = 0; i < 24; i++) { const v = (hours && hours[String(i)]) || 0; vals.push(v); if (v > max) max = v; }
    const bars = vals.map((v, i) => el('div', { class: 'adm-bar', title: String(i).padStart(2, '0') + ':00–' + String(i).padStart(2, '0') + ':59 · ' + fmtDur(v) }, el('i', { class: v ? '' : 'zero', style: 'height:' + Math.max(2, Math.round((v / max) * 100)) + '%' })));
    const axis = vals.map((v, i) => el('span', {}, i % 3 === 0 ? String(i).padStart(2, '0') : ''));
    return el('section', { class: 'adm-card', 'aria-label': 'Saat dağılımı' }, el('h2', { class: 'adm-h' }, 'Sitede bulunulan saatler'), el('p', { class: 'adm-sub' }, 'Etkin kullanım süresi, İstanbul saatine göre'), el('div', { class: 'adm-bars' }, bars), el('div', { class: 'adm-axis' }, axis));
  }
  function trendCard(trend) {
    const max = Math.max(1, ...trend.map((d) => d.visitors));
    const bars = trend.map((d) => el('div', { class: 'adm-bar', title: dday.format(new Date(d.day + 'T12:00:00+03:00')) + ' · ' + d.visitors + ' ziyaretçi · ' + d.sessions + ' oturum · ' + fmtDur(d.sec) }, el('i', { class: d.visitors ? '' : 'zero', style: 'height:' + Math.max(2, Math.round((d.visitors / max) * 100)) + '%' })));
    const axis = trend.map((d, i) => el('span', {}, i % 2 === 0 ? d.day.slice(8) + '.' + d.day.slice(5, 7) : ''));
    return el('section', { class: 'adm-card', 'aria-label': 'Günlük ziyaretçi' }, el('h2', { class: 'adm-h' }, 'Son 14 gün'), el('p', { class: 'adm-sub' }, 'Günlük tekil ziyaretçi'), el('div', { class: 'adm-bars' }, bars), el('div', { class: 'adm-axis' }, axis));
  }
  function listCard(title, obj, label) {
    const rows = Object.keys(obj || {}).map((k) => [k, obj[k]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const tot = rows.reduce((s, r) => s + r[1], 0) || 1;
    return el('section', { class: 'adm-card' }, el('h2', { class: 'adm-h' }, title),
      rows.length ? el('ul', { class: 'adm-list' }, rows.map((r) => el('li', {}, el('span', { class: 'nm' }, label(r[0])), el('span', { class: 'v' }, String(r[1])), el('span', { class: 'tr' }, el('i', { style: 'width:' + Math.round((r[1] / tot) * 100) + '%' }))))) : el('p', { class: 'adm-empty' }, 'Henüz veri yok.'));
  }

  function visible() {
    const q = S.q.trim().toLocaleLowerCase('tr');
    let a = S.items.filter((v) => (S.filter === 'online' ? online(v) : S.filter === 'blocked' ? v.blocked : true));
    if (q) a = a.filter((v) => [v.name, v.org, v.email, v.label, v.city, country(v.country)].join(' ').toLocaleLowerCase('tr').indexOf(q) >= 0);
    if (S.sort === 'sec') a = a.slice().sort((x, y) => y.sec - x.sec);
    else if (S.sort === 'created') a = a.slice().sort((x, y) => y.created - x.created);
    else a = a.slice().sort((x, y) => y.last - x.last);
    return a;
  }

  function tableBody() {
    const a = visible();
    if (!a.length) return el('p', { class: 'adm-empty' }, S.items.length ? 'Filtreye uyan ziyaretçi yok.' : 'Henüz kayıtlı ziyaretçi yok.');
    const open = (v) => openDetail(v.id);
    return el('div', { class: 'adm-table-wrap' }, el('table', { class: 'adm-table' },
      el('thead', {}, el('tr', {}, ['Ziyaretçi', 'Kurum / rol', 'Konum', 'Cihaz', 'İlk kayıt', 'Son görülme', 'Süre', 'Ziyaret', ''].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, a.map((v) => el('tr', { class: 'row-b', tabindex: 0, role: 'button', 'aria-label': v.name + ' ayrıntısı', onclick: () => open(v), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(v); } } },
        el('td', {}, el('div', { class: 'nm' }, v.name), v.label ? el('div', { class: 'mu' }, v.label) : v.email ? el('div', { class: 'mu' }, v.email) : null),
        el('td', {}, v.org || '—', v.role ? el('div', { class: 'mu' }, ROLE[v.role] || v.role) : null),
        el('td', {}, country(v.country), v.city ? el('div', { class: 'mu' }, v.city) : null),
        el('td', {}, v.device || '—', el('div', { class: 'mu' }, [v.browser, v.os].filter(Boolean).join(' · '))),
        el('td', {}, dt.format(v.created)),
        el('td', {}, fmtAgo(v.last)),
        el('td', {}, fmtDur(v.sec)),
        el('td', {}, String(v.visits)),
        el('td', {}, v.blocked ? el('span', { class: 'adm-pill bad' }, 'engelli') : online(v) ? el('span', { class: 'adm-pill on' }, 'çevrimiçi') : null))))));
  }

  function renderDash() {
    const o = S.overview;
    const today = o && o.trend.length ? o.trend[o.trend.length - 1] : { visitors: 0, sessions: 0, sec: 0 };
    const avg = o && o.sessions ? o.sec / o.sessions : 0;
    const body = el('div', { class: 'adm-table-host' }, tableBody());
    const search = el('input', { class: 'ginput', type: 'search', placeholder: 'Ad, kurum, e-posta, şehir ara…', value: S.q, 'aria-label': 'Ziyaretçi ara', oninput: (e) => { S.q = e.target.value; body.replaceChildren(tableBody()); } });
    const sel = (opts, cur, fn, label) => { const s = el('select', { class: 'inp', 'aria-label': label, onchange: (e) => fn(e.target.value) }, opts.map((x) => el('option', { value: x[0], selected: x[0] === cur }, x[1]))); return s; };
    const rerender = () => body.replaceChildren(tableBody());
    root.replaceChildren(el('div', { class: 'adm-wrap' },
      el('header', { class: 'adm-top' },
        el('div', { class: 'adm-brand' }, el('h1', { class: 'adm-title' }, 'archtools'), el('span', { class: 'adm-title-sub' }, 'Yönetim')),
        el('span', { class: 'adm-live' + (o && o.online ? ' on' : ''), role: 'status' }, el('i', {}), (o ? o.online : 0) + ' çevrimiçi'),
        el('button', { type: 'button', class: 'btn', onclick: refresh }, 'Yenile'),
        el('button', { type: 'button', class: 'btn', onclick: doExport }, 'CSV indir'),
        el('button', { type: 'button', class: 'btn', onclick: openAudit }, 'Denetim kaydı'),
        el('button', { type: 'button', class: 'btn', onclick: doLogout }, 'Çıkış')),
      S.err ? el('p', { class: 'adm-err', role: 'alert' }, S.err) : null,
      o ? el('div', { class: 'adm-kpis' },
        kpi(String(o.total), 'Toplam ziyaretçi', 'kayıtlı profil'),
        kpi(String(o.online), 'Şu an çevrimiçi', 'son 2 dakika'),
        kpi(String(today.visitors), 'Bugün', today.sessions + ' oturum'),
        kpi(fmtDur(avg), 'Ortalama oturum', o.sessions + ' oturumdan'),
        kpi(fmtDur(o.sec), 'Toplam etkin süre', 'tüm ziyaretçiler')) : null,
      o ? el('div', { class: 'adm-grid' }, hoursCard(o.hours), trendCard(o.trend), listCard('Ülke', o.country, country), listCard('Cihaz', o.device, (k) => k), listCard('Rol', o.role, (k) => ROLE[k] || k), listCard('Özellik kullanımı', o.events, (k) => EVT[k] || k)) : null,
      el('section', { class: 'adm-card', 'aria-label': 'Ziyaretçiler' },
        el('h2', { class: 'adm-h' }, 'Ziyaretçiler'),
        el('div', { class: 'adm-tools' }, search,
          sel([['last', 'Son görülme'], ['created', 'İlk kayıt'], ['sec', 'Toplam süre']], S.sort, (v) => { S.sort = v; rerender(); }, 'Sırala'),
          sel([['all', 'Tümü'], ['online', 'Çevrimiçi'], ['blocked', 'Engelli']], S.filter, (v) => { S.filter = v; rerender(); }, 'Filtre')),
        body,
        S.more ? el('div', { class: 'adm-more' }, el('button', { type: 'button', class: 'btn', onclick: loadMore }, 'Daha fazla yükle')) : null)));
  }

  /* ---------- ayrıntı çekmecesi ---------- */
  function drawer(content, close) {
    const d = el('div', { class: 'adm-drawer', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'gate-scrim', onclick: close }), el('div', { class: 'adm-panel' }, content));
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(d);
    const pn = d.querySelector('.adm-panel'); pn.setAttribute('tabindex', '-1'); pn.focus({ preventScroll: true }); /* odak panele: ilk alana kaydırma yapmaz */
    return d;
  }
  function closeDrawer() { document.querySelectorAll('.adm-drawer').forEach((d) => d.remove()); S.detail = null; }

  function openDetail(id) {
    closeDrawer();
    api('visitor', { id: id }).then(function (r) {
      if (r.status === 401) return sessionLost();
      if (r.status !== 200) { S.err = 'Ayrıntı alınamadı.'; renderDash(); return; }
      S.now = r.j.now || Date.now();
      const d = r.j.detail, p = d.profile;
      const label = el('input', { class: 'ginput', maxlength: 40, value: p.label, placeholder: 'Etiket (örn. jüri üyesi)', 'aria-label': 'Etiket' });
      const note = el('textarea', { class: 'adm-note', maxlength: 500, placeholder: 'Yönetici notu (yalnızca siz görürsünüz)', 'aria-label': 'Not' }, p.note);
      const msg = el('p', { class: 'gate-ok', role: 'status' });
      const save = (blocked) => api('update', { id: p.id, label: label.value, note: note.value, blocked: typeof blocked === 'boolean' ? blocked : undefined }).then((x) => { msg.textContent = x.status === 200 ? 'Kaydedildi.' : 'Kaydedilemedi.'; if (x.status === 200 && typeof blocked === 'boolean') { closeDrawer(); refresh(); } });
      const del = el('button', { type: 'button', class: 'btn', onclick: () => { if (window.confirm('“' + p.name + '” profili ve tüm verileri kalıcı olarak silinsin mi?')) api('delete', { id: p.id }).then((x) => { if (x.status === 200) { closeDrawer(); refresh(); } }); } }, 'Profili sil');
      const hours = hoursCard(d.hours); hours.querySelector('h2').textContent = 'Bu ziyaretçinin saatleri';
      const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v || '—')];
      drawer([
        el('div', { class: 'adm-row2' }, el('h2', {}, p.name), p.blocked ? el('span', { class: 'adm-pill bad' }, 'engelli') : online(p) ? el('span', { class: 'adm-pill on' }, 'çevrimiçi') : null),
        el('dl', { class: 'adm-kv' }, kv('Kurum / okul', p.org), kv('E-posta', p.email), kv('Rol', ROLE[p.role] || p.role), kv('Konum', [p.city, country(p.country)].filter(Boolean).join(', ')),
          kv('Cihaz', [p.device, p.browser, p.os].filter(Boolean).join(' · ')), kv('Ekran', p.screen), kv('Saat dilimi / dil', [p.tz, p.lang].filter(Boolean).join(' · ')),
          kv('İlk kayıt', dt.format(p.created)), kv('Son görülme', dt.format(p.last)), kv('Toplam süre', fmtDur(p.sec)), kv('Ziyaret sayısı', String(p.visits)), kv('Rıza', p.consentAt ? dt.format(p.consentAt) + ' · sürüm ' + p.consent : '—')),
        hours,
        el('section', {}, el('h2', { class: 'adm-h' }, 'Oturumlar (İstanbul saati)'),
          d.sessions.length ? el('ul', { class: 'adm-sess' }, d.sessions.map((s) => el('li', {}, el('span', {}, dt.format(s.start), ' → ', dts.format(s.last)), el('b', {}, fmtDur(s.sec)), el('span', { class: 'mu' }, [s.device, [s.city, country(s.country)].filter(Boolean).join(', ')].filter(Boolean).join(' · '))))) : el('p', { class: 'adm-empty' }, 'Oturum yok.')),
        el('section', {}, el('h2', { class: 'adm-h' }, 'Son etkinlikler'),
          d.events.length ? el('ul', { class: 'adm-tl' }, d.events.slice(0, 60).map((e) => el('li', {}, el('time', {}, dts.format(e.t)), el('span', {}, (EVT[e.k] || e.k) + (e.d ? ' · ' + e.d : ''))))) : el('p', { class: 'adm-empty' }, 'Etkinlik kaydı yok.')),
        el('section', { class: 'gate-form' }, el('h2', { class: 'adm-h' }, 'Yönetici'), label, note,
          el('div', { class: 'adm-row2' },
            el('button', { type: 'button', class: 'btn btn-primary', onclick: () => save() }, 'Etiket ve notu kaydet'),
            el('button', { type: 'button', class: 'btn', onclick: () => save(!p.blocked) }, p.blocked ? 'Engeli kaldır' : 'Erişimi engelle'),
            del), msg),
        el('div', { class: 'adm-row2' }, el('button', { type: 'button', class: 'btn', onclick: closeDrawer }, 'Kapat')),
      ], closeDrawer);
    });
  }

  function openAudit() {
    closeDrawer();
    api('audit').then(function (r) {
      if (r.status === 401) return sessionLost();
      const A = { login: 'Giriş', login_fail: 'Başarısız giriş', logout: 'Çıkış', list: 'Liste görüntülendi', view: 'Profil görüntülendi', update: 'Profil güncellendi', delete: 'Profil silindi', export: 'CSV dışa aktarıldı' };
      drawer([el('h2', {}, 'Denetim kaydı'), el('p', { class: 'adm-sub' }, 'Son 200 yönetici işlemi (IP adresi saklanmaz; yalnızca tek yönlü özet).'),
        el('ul', { class: 'adm-tl adm-audit' }, (r.j.items || []).map((e) => el('li', {}, el('time', {}, dt.format(e.t)), el('span', {}, (A[e.a] || e.a) + (e.vid ? ' · ' + e.vid.slice(0, 6) + '…' : '') + (e.n != null ? ' · ' + e.n : ''))))),
        el('div', { class: 'adm-row2' }, el('button', { type: 'button', class: 'btn', onclick: closeDrawer }, 'Kapat'))], closeDrawer);
    });
  }

  /* ---------- işlemler ---------- */
  function sessionLost() { closeDrawer(); stopTimer(); S.authed = false; renderLogin('Oturum sona erdi. Lütfen yeniden giriş yapın.'); }
  function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  function refresh() {
    return Promise.all([api('overview'), api('visitors', { limit: 200, by: 'last' })]).then(function (rs) {
      if (rs[0].status === 401 || rs[1].status === 401) return sessionLost();
      if (rs[0].status !== 200 || rs[1].status !== 200) { S.err = rs[0].status === 503 ? 'Depo (Upstash) yapılandırılmamış — KURULUM.md.' : 'Veriler alınamadı.'; if (!S.overview) { renderDash(); } return; }
      S.err = ''; S.overview = rs[0].j.overview; S.now = rs[1].j.now || Date.now(); S.items = rs[1].j.items; S.more = rs[1].j.more;
      if (!document.querySelector('.adm-drawer')) renderDash();
    });
  }
  function loadMore() {
    api('visitors', { offset: S.items.length, limit: 200, by: 'last' }).then(function (r) {
      if (r.status === 401) return sessionLost();
      if (r.status === 200) { S.items = S.items.concat(r.j.items); S.more = r.j.more; renderDash(); }
    });
  }
  function doExport() {
    api('export').then(function (r) {
      if (r.status === 401) return sessionLost();
      if (r.status !== 200) { S.err = 'Dışa aktarma başarısız.'; renderDash(); return; }
      const a = el('a', { href: URL.createObjectURL(new Blob([r.j.csv], { type: 'text/csv;charset=utf-8' })), download: 'archtools-ziyaretciler-' + new Date().toISOString().slice(0, 10) + '.csv' });
      document.body.append(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }
  function doLogout() { api('logout').then(function () { stopTimer(); S.authed = false; S.overview = null; S.items = []; renderLogin(); }); }

  function load() {
    S.authed = true; S.err = '';
    refresh().then(function () {
      stopTimer();
      S.timer = setInterval(function () { if (document.visibilityState === 'visible' && S.authed) refresh(); }, 30000);
    });
  }

  api('session').then(function (r) {
    if (r.status === 503) { renderLogin('Yönetici girişi henüz yapılandırılmadı (KURULUM.md).'); return; }
    S.totp = !!r.j.totp;
    if (r.status === 200 && r.j.authed) load(); else renderLogin();
  });
})();
