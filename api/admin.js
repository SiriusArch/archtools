'use strict';
/* /api/admin — yalnızca yöneticiye açık uç nokta (POST, JSON).
   Giriş: parola (scrypt özeti, ADMIN_PASSWORD_HASH) + isteğe bağlı TOTP (ADMIN_TOTP_SECRET).
   Oturum: HMAC imzalı, HttpOnly + Secure + SameSite=Strict çerez (__Host- önekli) + Redis'te sunucu tarafı oturum (çıkışta iptal).
   Savunma: IP özeti başına giriş sınırı, başarısız girişte gecikme, TOTP tekrar kullanım engeli, CSRF (X-AT + Origin), denetim kaydı.
   İşlemler (a): login logout session overview visitors visitor update delete export audit */
const { send, fail, guard, ipKey } = require('./_lib/http');
const store = require('./_lib/store');
const C = require('./_lib/crypto');
const V = require('./_lib/validate');
const D = require('./_lib/visitors');

const DEV = process.env.AT_DEV === '1';
const COOKIE = DEV ? 'at_admin' : '__Host-at_admin';
const SESSION_SEC = 8 * 3600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secret = () => process.env.ADMIN_SESSION_SECRET || '';

function cookieOf(req) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE.replace(/[-_]/g, '\\$&') + '=([^;]+)').exec(String(req.headers.cookie || ''));
  return m ? m[1] : '';
}
const setCookie = (res, value, maxAge) => res.setHeader('Set-Cookie', COOKIE + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (DEV ? '' : '; Secure'));

async function audit(a, extra, req) {
  try {
    const rec = Object.assign({ t: Date.now(), a: a, ip: ipKey(req) }, extra || {});
    await store.pipe([['LPUSH', 'at:audit', JSON.stringify(rec)], ['LTRIM', 'at:audit', 0, 499], ['EXPIRE', 'at:audit', 400 * 86400]]);
  } catch (e) { /* denetim kaydı yazılamazsa işlem engellenmez ama hata yutulmaz: yanıt kodu değişmez */ }
}

async function session(req) {
  if (!secret()) return null;
  const v = C.readSigned(secret(), cookieOf(req));
  if (!v || typeof v.sid !== 'string' || !(v.exp > Date.now())) return null;
  const live = await store.cmd('GET', 'at:adm:' + v.sid);
  return live ? v : null;
}

const csvCell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const iso = (t) => (t ? new Date(t).toISOString() : '');

module.exports = async function handler(req, res) {
  const b = guard(req, res);
  if (!b) return;
  try {
    if (!store.configured() || !secret() || !process.env.ADMIN_PASSWORD_HASH) return fail(res, 503, 'not_configured');
    const a = String(b.a || '');

    if (a === 'login') {
      const ik = ipKey(req);
      if (!(await D.limit('login:' + ik, 6, 900))) return fail(res, 429, 'rate');
      const okPw = await C.verifyPassword(String(b.password || '').slice(0, 256), process.env.ADMIN_PASSWORD_HASH);
      const ts = process.env.ADMIN_TOTP_SECRET;
      let okTotp = true;
      if (ts) {
        const code = String(b.totp || '').replace(/\s/g, '');
        okTotp = C.verifyTotp(ts, code);
        if (okTotp && okPw) { // aynı kod 90 sn içinde bir daha kullanılamaz (yalnızca parola da doğruysa tüketilir)
          const used = await store.pipe([['GET', 'at:totp:' + code], ['SET', 'at:totp:' + code, '1', 'EX', 90]]);
          if (used[0]) okTotp = false;
        }
      }
      if (!(okPw && okTotp)) { await audit('login_fail', null, req); await sleep(600); return fail(res, 401, 'credentials'); }
      const sid = C.randomId(18);
      await store.cmd('SET', 'at:adm:' + sid, ik, 'EX', SESSION_SEC);
      setCookie(res, C.signValue(secret(), { sid: sid, exp: Date.now() + SESSION_SEC * 1000 }), SESSION_SEC);
      await audit('login', null, req);
      return send(res, 200, { ok: true });
    }

    const s = await session(req);
    if (a === 'session') return send(res, 200, { ok: true, authed: !!s, totp: !!process.env.ADMIN_TOTP_SECRET });
    if (!s) return fail(res, 401, 'auth');

    if (a === 'logout') {
      await store.cmd('DEL', 'at:adm:' + s.sid);
      setCookie(res, '', 0);
      await audit('logout', null, req);
      return send(res, 200, { ok: true });
    }
    if (a === 'overview') return send(res, 200, { ok: true, now: Date.now(), overview: await D.overview() });
    if (a === 'visitors') {
      const r = await D.list(V.int(b.offset, 0, 100000), V.int(b.limit || 100, 1, 200), b.by === 'created' ? 'created' : 'last');
      await audit('list', { n: r.items.length }, req);
      return send(res, 200, { ok: true, now: Date.now(), items: r.items, more: r.more });
    }
    if (a === 'visitor') {
      if (!V.VID.test(String(b.id || ''))) return fail(res, 400, 'id');
      const d = await D.detail(b.id);
      if (!d) return fail(res, 404, 'notfound');
      await audit('view', { vid: b.id }, req);
      return send(res, 200, { ok: true, now: Date.now(), detail: d });
    }
    if (a === 'update') {
      if (!V.VID.test(String(b.id || ''))) return fail(res, 400, 'id');
      const ok = await D.adminUpdate(b.id, { label: b.label, note: b.note, blocked: typeof b.blocked === 'boolean' ? b.blocked : null });
      if (!ok) return fail(res, 404, 'notfound');
      await audit('update', { vid: b.id, blocked: typeof b.blocked === 'boolean' ? b.blocked : undefined }, req);
      return send(res, 200, { ok: true });
    }
    if (a === 'delete') {
      if (!V.VID.test(String(b.id || ''))) return fail(res, 400, 'id');
      await D.remove(b.id);
      await audit('delete', { vid: b.id }, req);
      return send(res, 200, { ok: true });
    }
    if (a === 'export') {
      const rows = await D.exportAll(5000);
      const head = ['id', 'ad', 'kurum', 'eposta', 'rol', 'ulke', 'sehir', 'cihaz', 'tarayici', 'isletim_sistemi', 'ilk_kayit_utc', 'son_gorulme_utc', 'oturum', 'toplam_sure_sn', 'etiket', 'not', 'engelli', 'riza_surumu'];
      const lines = [head.join(',')].concat(rows.map((r) => [r.id, r.name, r.org, r.email, r.role, r.country, r.city, r.device, r.browser, r.os, iso(r.created), iso(r.last), r.visits, r.sec, r.label, r.note, r.blocked ? 1 : 0, r.consent].map(csvCell).join(',')));
      await audit('export', { n: rows.length }, req);
      return send(res, 200, { ok: true, csv: '﻿' + lines.join('\r\n') });
    }
    if (a === 'audit') {
      const rows = (await store.cmd('LRANGE', 'at:audit', 0, 199)) || [];
      return send(res, 200, { ok: true, items: rows.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean) });
    }
    return fail(res, 400, 'action');
  } catch (e) {
    return fail(res, e && e.code === 'store_unavailable' ? 503 : 500, e && e.code === 'store_unavailable' ? 'store_unavailable' : 'server');
  }
};
