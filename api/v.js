'use strict';
/* /api/v — ziyaretçi uç noktası (POST, JSON). İşlemler (a):
     reg      profil oluştur  → { vid, token }
     ping     etkin süre + olay nabzı (30 sn'de bir; oturum başlangıcı da buradan)
     loc      tarayıcı konumu (yalnızca kullanıcı izin verirse; yaklaşık) ya da { clear: true } ile sil
     me       kendi profilini getir     upd  kendi profilini güncelle     del  tüm verilerimi sil
     contact  veri sorumlusu iletişim bilgisi (ortam değişkeninden; depoda tutulmaz)
   Kimlik: vid + token (token yalnızca ziyaretçide; sunucuda SHA-256 özeti). Ham IP / User-Agent saklanmaz. */
const { send, fail, guard, ipKey } = require('./_lib/http');
const store = require('./_lib/store');
const V = require('./_lib/validate');
const D = require('./_lib/visitors');

module.exports = async function handler(req, res) {
  const b = guard(req, res);
  if (!b) return;
  try {
    const a = String(b.a || '');
    if (a === 'contact') { // veri depolama gerektirmez
      return send(res, 200, { ok: true, enabled: store.configured(), name: process.env.PRIVACY_CONTACT_NAME || '', email: process.env.PRIVACY_CONTACT_EMAIL || '', retentionDays: Math.round(D.RET() / 86400), consentVersion: V.CONSENT_VERSION });
    }
    if (!store.configured()) return fail(res, 503, 'store_unavailable');

    if (a === 'reg') {
      const p = V.profile(b);
      if (p.error) return fail(res, 400, p.error);
      const ik = ipKey(req);
      if (!(await D.limit('reg:' + ik, 8, 3600)) || !(await D.limit('reg:all:' + new Date().toISOString().slice(0, 10), 3000, 86400))) return fail(res, 429, 'rate');
      const r = await D.register(p.value, V.env(b), req);
      return send(res, 200, { ok: true, vid: r.vid, token: r.token });
    }

    // aşağıdaki işlemler kimlik gerektirir
    const au = await D.authenticate(b.vid, b.token);
    if (!au.ok) return fail(res, au.status, au.error);
    if (!(await D.limit('v:' + b.vid, 40, 60))) return fail(res, 429, 'rate');

    if (a === 'ping') {
      const r = await D.ping(b.vid, b, req);
      return r.ok ? send(res, 200, { ok: true }) : fail(res, r.status, r.error);
    }
    if (a === 'loc') {
      if (b.clear === true) { await D.setLocation(b.vid, null); return send(res, 200, { ok: true }); }
      const l = V.location(b);
      if (l.error) return fail(res, 400, l.error);
      await D.setLocation(b.vid, l.value);
      return send(res, 200, { ok: true });
    }
    if (a === 'me') return send(res, 200, { ok: true, profile: await D.me(b.vid) });
    if (a === 'upd') {
      const p = V.profile(b);
      if (p.error) return fail(res, 400, p.error);
      await D.update(b.vid, p.value);
      return send(res, 200, { ok: true });
    }
    if (a === 'del') {
      await D.remove(b.vid);
      return send(res, 200, { ok: true });
    }
    return fail(res, 400, 'action');
  } catch (e) {
    return fail(res, e && e.code === 'store_unavailable' ? 503 : 500, e && e.code === 'store_unavailable' ? 'store_unavailable' : 'server'); // ayrıntı istemciye / günlüğe yazılmaz
  }
};
