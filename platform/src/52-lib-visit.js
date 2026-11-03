/* ==========================================================================
   52-lib-visit.js — ziyaretçi profili ve kullanım süresi (yalnızca yönetici görür)
   Akış: ilk ziyarette profil kapısı (ad + açık rıza) → /api/v 'reg' → { vid, token } bu tarayıcıda saklanır →
         her 30 sn'de bir 'ping' (etkin süre + izinli olaylar). Etkin süre = sekme görünür VE son 60 sn'de etkileşim var.
   Gizlilik: yalnızca allowlist'teki olay türleri gönderilir; şema içeriği (mekân adları, proje verisi) ASLA gönderilmez.
   Sunucu yapılandırılmamışsa ('enabled: false') kapı da takip de devre dışıdır (site olduğu gibi çalışır).
   ========================================================================== */
(function () {
  const App = window.App;
  const KEY = 'archtools.visitor';
  const CV = '2026-11'; // aydınlatma / rıza metni sürümü (sunucudaki CONSENT_VERSION ile aynı olmalı)
  const KINDS = ['start', 'color_on', 'color_off', 'palette', 'auto_layout', 'add_space', 'template', 'export_png', 'export_pdf', 'save_json', 'load_json'];
  const API = () => (App.config && App.config.api && App.config.api.visit) || '/api/v';
  const BEAT = 30000, IDLE = 60000;

  const rnd = (n) => { const a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };
  let cred = null, status = 'init'; // init | off | gate | ok | offline | blocked
  let info = { enabled: false, name: '', email: '', retentionDays: 180 };
  let sid = rnd(16), pending = 0, queue = [], lastActive = Date.now(), started = false, inflight = false;

  const read = () => { try { const o = JSON.parse(window.localStorage.getItem(KEY) || 'null'); return o && typeof o.vid === 'string' && typeof o.token === 'string' ? o : null; } catch (e) { return null; } };
  const write = (o) => { try { window.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const clear = () => { try { window.localStorage.removeItem(KEY); } catch (e) {} };

  function post(body, keepalive) {
    return fetch(API(), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AT': '1' }, body: JSON.stringify(body),
      keepalive: !!keepalive, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    }).then((r) => r.json().then((j) => ({ status: r.status, j: j || {} }), () => ({ status: r.status, j: {} })), () => ({ status: 0, j: {} }));
  }
  const auth = (o) => Object.assign({ vid: cred.vid, token: cred.token }, o);
  const gate = () => App.ui.gate;

  function env() {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return { tz: tz, lg: navigator.language || '', sw: screen.width || 0, sh: screen.height || 0, dpr: window.devicePixelRatio || 1 };
  }

  /* ---------- etkin süre sayacı + nabız ---------- */
  function startTimers() {
    if (started) return; started = true;
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'].forEach((e) => window.addEventListener(e, function () { lastActive = Date.now(); }, { passive: true, capture: true }));
    setInterval(function () { if (status === 'ok' && document.visibilityState === 'visible' && Date.now() - lastActive < IDLE && pending < 90) pending++; }, 1000);
    setInterval(function () { flush(false); }, BEAT);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
    window.addEventListener('pagehide', function () { flush(true); });
  }

  function onAuthFail(r) {
    if (r.status === 403 && r.j.error === 'blocked') { status = 'blocked'; gate().open('blocked'); return true; }
    if (r.status === 401) { clear(); cred = null; status = 'gate'; gate().open('form', { notice: 'Oturumunuz bulunamadı. Devam etmek için profilinizi yeniden oluşturun.' }); return true; }
    return false;
  }

  function flush(keepalive) {
    if (!cred || status !== 'ok' || inflight || (pending < 1 && !queue.length)) return Promise.resolve();
    const sec = Math.min(pending, 90), ev = queue.splice(0, 8);
    pending -= sec; inflight = !keepalive;
    return post(auth({ a: 'ping', sid: sid, sec: sec, ev: ev }), keepalive).then(function (r) {
      inflight = false;
      if (r.status === 200) return;
      if (onAuthFail(r)) return;
      pending += sec; ev.forEach(function (e) { if (queue.length < 40) queue.push(e); }); // ağ / sunucu hatası: sonraki nabızda yeniden dene
    });
  }

  // profil düğmesi gibi durum bağımlı arayüz, durum değişince yeniden çizilsin (ui.visitTick yalnızca yeniden çizim tetikler)
  function repaint() { try { if (App.store) App.store.dispatch({ type: 'UI', patch: { visitTick: Date.now() } }); } catch (e) {} }

  function startSession() {
    status = 'ok'; startTimers();
    queue.push({ k: 'start' });
    return post(auth({ a: 'ping', sid: sid, sec: 0, ev: queue.splice(0, 8) })).then(function (r) {
      if (r.status === 200) return;
      if (onAuthFail(r)) return;
      status = 'ok'; // geçici hata: nabız yeniden dener
    });
  }

  /* ---------- genel API ---------- */
  const V = (App.visit = {
    CV: CV,
    status: function () { return status; },
    enabled: function () { return status !== 'off' && status !== 'init'; },
    info: function () { return info; },
    KINDS: KINDS,

    init: function () {
      cred = read();
      return post({ a: 'contact' }).then(function (r) {
        if (r.status === 200) info = { enabled: r.j.enabled !== false, name: r.j.name || '', email: r.j.email || '', retentionDays: r.j.retentionDays || 180 };
        else info.enabled = false; // API yok / hata: site olduğu gibi çalışır (kapı ve takip kapalı)
        if (!info.enabled) { status = 'off'; return; }
        if (!cred) { status = 'gate'; repaint(); gate().open('form'); return; }
        return startSession().then(repaint);
      });
    },

    track: function (kind, detail) {
      if (KINDS.indexOf(kind) < 0 || status !== 'ok') return;
      if (queue.length < 40) queue.push({ k: kind, d: typeof detail === 'string' ? detail.slice(0, 24) : '' });
    },

    register: function (f) {
      return post(Object.assign({ a: 'reg', consent: true, cv: CV }, f, env())).then(function (r) {
        if (r.status === 200 && r.j.ok) { cred = { vid: r.j.vid, token: r.j.token }; write(cred); return startSession().then(function () { repaint(); setTimeout(function () { V.locate(); }, 400); return { ok: true }; }); } // kayıttan sonra tarayıcı konum izni sorulur (reddedilirse sorun yok)
        return { ok: false, error: r.status === 0 ? 'offline' : r.j.error || 'server' };
      });
    },
    // tarayıcı konumu: tarayıcı kendi izin penceresini gösterir; yalnızca izin verilirse yaklaşık konum gönderilir
    locate: function () {
      return new Promise(function (resolve) {
        if (!cred || !navigator.geolocation) return resolve({ ok: false, error: 'unsupported' });
        navigator.geolocation.getCurrentPosition(function (p) {
          post(auth({ a: 'loc', lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy })).then(function (r) { resolve(r.status === 200 ? { ok: true } : { ok: false, error: 'server' }); });
        }, function (e) { resolve({ ok: false, error: e && e.code === 1 ? 'denied' : 'unavailable' }); }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 });
      });
    },
    clearLocation: function () { return post(auth({ a: 'loc', clear: true })).then(function (r) { return { ok: r.status === 200 }; }); },
    me: function () { return post(auth({ a: 'me' })).then(function (r) { return r.status === 200 ? r.j.profile : (onAuthFail(r), null); }); },
    update: function (f) {
      return post(auth(Object.assign({ a: 'upd' }, f))).then(function (r) {
        if (r.status === 200) return { ok: true };
        if (r.status === 401 || r.status === 403) onAuthFail(r);
        return { ok: false, error: r.status === 0 ? 'offline' : r.j.error || 'server' };
      });
    },
    remove: function () {
      return post(auth({ a: 'del' })).then(function (r) {
        if (r.status === 200) { clear(); cred = null; status = 'gate'; repaint(); return { ok: true }; }
        return { ok: false, error: r.status === 0 ? 'offline' : r.j.error || 'server' };
      });
    },
    // açık kalan oturumu kapat (yalnızca kapı "yine de devam et" derse)
    skip: function () { status = 'off'; repaint(); },
    flush: flush,

    // kullanım olaylarını denetleyici işlevlerine bağlar (allowlist; veri taşımaz)
    hook: function (ctl) {
      const wrap = function (fn, kind, detailFn) { const o = ctl[fn]; if (typeof o !== 'function') return; ctl[fn] = function () { try { V.track(kind, detailFn ? detailFn.apply(null, arguments) : ''); } catch (e) {} return o.apply(this, arguments); }; };
      wrap('exportPNG', 'export_png'); wrap('exportPDF', 'export_pdf'); wrap('saveJSON', 'save_json'); wrap('onFile', 'load_json');
      wrap('autoLayout', 'auto_layout'); wrap('loadTemplate', 'template'); wrap('pickPalette', 'palette', function (id) { return String(id || ''); });
      const tc = ctl.toggleColor;
      if (typeof tc === 'function') ctl.toggleColor = function () { try { V.track(App.store.get().ui.color.on ? 'color_off' : 'color_on'); } catch (e) {} return tc.apply(this, arguments); };
      const dp = ctl.dispatch;
      if (typeof dp === 'function') ctl.dispatch = function (a) { if (a && a.type === 'ADD_SPACES') { try { V.track('add_space'); } catch (e) {} } return dp.apply(this, arguments); };
    },
  });
})();
