// API testleri: bellek içi depo ile (ağ yok). Çalıştır: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

process.env.AT_STORE = 'memory';
process.env.AT_DEV = '1';
process.env.ADMIN_SESSION_SECRET = 'test-secret-test-secret-test-secret-12345';
process.env.IP_SALT = 'salt';
const C = require('../api/_lib/crypto.js');
process.env.ADMIN_PASSWORD_HASH = await C.hashPassword('dogru parola cumlesi 123');
process.env.ADMIN_TOTP_SECRET = C.base32Encode(Buffer.from('12345678901234567890'));
process.env.PRIVACY_CONTACT_EMAIL = 'iletisim@example.test';

const v = require('../api/v.js');
const admin = require('../api/admin.js');
const store = require('../api/_lib/store.js');

function call(h, body, { headers = {}, method = 'POST', raw } = {}) {
  return new Promise((resolve) => {
    const req = { method, headers: Object.assign({ 'x-at': '1', 'content-type': 'application/json', host: 'site.test', origin: 'https://site.test', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', 'x-forwarded-for': '203.0.113.9', 'x-vercel-ip-country': 'TR', 'x-vercel-ip-city': '%C4%B0zmir' }, headers), body: raw !== undefined ? raw : body };
    const out = { status: 0, headers: {}, body: '' };
    const res = { statusCode: 200, setHeader(k, val) { out.headers[k.toLowerCase()] = val; }, end(s) { out.status = res.statusCode; out.body = s; resolve(Object.assign(out, { json: s ? JSON.parse(s) : null })); } };
    h(req, res);
  });
}
const reg = (extra) => call(v, Object.assign({ a: 'reg', name: 'Şule Ağaoğlu', org: 'ODTÜ', email: 'sule@gmail.com', role: 'ogrenci', consent: true, cv: '2026-11', tz: 'Europe/Istanbul', lg: 'tr-TR', sw: 1440, sh: 900, dpr: 2 }, extra));

let ipN = 0; // kayıt hız sınırını (IP başına saatte 8) aşmamak için her çağrıya ayrı IP
const regIp = (extra) => call(v, Object.assign({ a: 'reg', name: 'Şule Ağaoğlu', org: 'ODTÜ', email: 'sule@gmail.com', role: 'ogrenci', consent: true, cv: '2026-11' }, extra), { headers: { 'x-forwarded-for': '198.51.100.' + (++ipN) } });

test('CSRF ve biçim korumaları', async () => {
  assert.equal((await call(v, { a: 'contact' }, { method: 'GET' })).status, 405);
  assert.equal((await call(v, { a: 'contact' }, { headers: { 'x-at': '' } })).status, 403);
  assert.equal((await call(v, { a: 'contact' }, { headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call(v, { a: 'contact' }, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await call(v, { a: 'contact' }, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call(v, { a: 'contact' }, { headers: { 'content-length': '99999' } })).status, 413);
  assert.equal((await call(v, null, { raw: '[1]' })).status, 400);
  const c = await call(v, { a: 'contact' });
  assert.equal(c.status, 200); assert.equal(c.json.email, 'iletisim@example.test');
  assert.match(c.headers['cache-control'], /no-store/);
});

test('kayıt: girdi doğrulanır, token yalnızca özet olarak saklanır', async () => {
  assert.equal((await reg({ name: '<img onerror=x>' })).json.error, 'name');
  assert.equal((await reg({ email: 'bozuk' })).json.error, 'email');
  assert.equal((await reg({ role: 'hacker' })).json.error, 'role');
  const r = await reg();
  assert.equal(r.status, 200);
  assert.match(r.json.vid, /^[\w-]{16}$/); assert.match(r.json.token, /^[\w-]{43}$/);
  const row = store.toObj(await store.cmd('HGETALL', 'at:v:' + r.json.vid));
  assert.equal(row.name, 'Şule Ağaoğlu'); assert.equal(row.ci, 'İzmir'); assert.equal(row.co, 'TR'); assert.equal(row.dev, 'masaüstü'); assert.equal(row.br, 'Chrome');
  assert.notEqual(row.th, r.json.token); assert.equal(row.th, C.sha256(r.json.token));
  assert.ok(!JSON.stringify(row).includes('203.0.113.9'), 'ham IP saklanmamalı');
  assert.ok(!JSON.stringify(row).includes('Mozilla'), 'ham User-Agent saklanmamalı');
});

test('e-posta zorunlu ve yalnızca güvenilir sağlayıcı; ad soyad zorunlu', async () => {
  for (const e of ['', 'sirket@firma.com', 'a@gmail.com.evil.test', 'a@evil.test', 'a b@gmail.com', 'a@gmail..com', '<x>@gmail.com']) assert.equal((await regIp({ email: e })).json.error, 'email', 'reddedilmeli: ' + e);
  for (const e of ['x@gmail.com', 'X@Hotmail.com', 'x@outlook.com.tr', 'x@yahoo.com', 'x@icloud.com', 'x@yandex.com', 'x@itu.edu.tr', 'x@bilgi.edu.tr', 'x@belediye.gov.tr']) assert.equal((await regIp({ email: e })).status, 200, 'kabul edilmeli: ' + e);
  assert.equal((await regIp({ name: 'Ayşe' })).json.error, 'name'); // yalnızca ad
  assert.equal((await regIp({ name: 'A B' })).json.error, 'name');
  assert.equal((await regIp({ name: '' })).json.error, 'name');
  // istemci listesi sunucudakiyle aynı
  const V = await import('../api/_lib/validate.js');
  const gate = (await import('node:fs')).readFileSync(new URL('../platform/src/51-ui-gate.js', import.meta.url), 'utf8');
  (V.default || V).MAIL_DOMAINS.forEach((d) => assert.ok(gate.includes("'" + d + "'"), 'istemci listesinde yok: ' + d));
  (V.default || V).MAIL_SUFFIXES.forEach((d) => assert.ok(gate.includes("'" + d + "'"), 'istemci uzantı listesinde yok: ' + d));
});

test('konum: yalnızca kimlikli ve geçerli; yaklaşık saklanır; silinebilir; yönetici listesinde görünür', async () => {
  const a = (await regIp()).json;
  const ok = (extra) => call(v, Object.assign({ a: 'loc', vid: a.vid, token: a.token }, extra));
  assert.equal((await call(v, { a: 'loc', vid: a.vid, token: 'x'.repeat(43), lat: 41, lon: 29 })).status, 401);
  assert.equal((await ok({ lat: 91, lon: 0 })).json.error, 'loc');
  assert.equal((await ok({ lat: 'abc', lon: 0 })).json.error, 'loc');
  assert.equal((await ok({ lat: 41.0123456, lon: 28.9784321, acc: 37 })).status, 200);
  const row = store.toObj(await store.cmd('HGETALL', 'at:v:' + a.vid));
  assert.equal(row.la, '41.012'); assert.equal(row.lo, '28.978'); assert.equal(row.lc, '40');
  assert.equal((await call(v, { a: 'me', vid: a.vid, token: a.token })).json.profile.loc.lat, 41.012);
  const D = require('../api/_lib/visitors.js');
  const dd = await D.detail(a.vid);
  assert.equal(dd.profile.lat, 41.012); assert.equal(dd.profile.lon, 28.978); assert.ok(dd.profile.locAt > 0);
  assert.equal((await ok({ clear: true })).status, 200);
  assert.equal((await D.detail(a.vid)).profile.lat, null);
  const row2 = store.toObj(await store.cmd('HGETALL', 'at:v:' + a.vid));
  assert.equal(row2.la, undefined); assert.equal(row2.lo, undefined);
});

test('nabız: süre birikir, sınırlanır, olaylar yalnızca izinli türlerle kaydolur; oturum çalınamaz', async () => {
  const a = (await reg()).json, b = (await reg({ name: 'Başka Kişi' })).json;
  const sid = 'sidsidsidsid1234';
  assert.equal((await call(v, { a: 'ping', vid: a.vid, token: 'x'.repeat(43), sid, sec: 10 })).status, 401);
  let r = await call(v, { a: 'ping', vid: a.vid, token: a.token, sid, sec: 30, ev: [{ k: 'start' }, { k: 'palette', d: 'cp4811' }, { k: '<script>' }, { k: 'export_png', d: 'a b<c' }] });
  assert.equal(r.status, 200);
  r = await call(v, { a: 'ping', vid: a.vid, token: a.token, sid, sec: 99999 });
  const row = store.toObj(await store.cmd('HGETALL', 'at:v:' + a.vid));
  assert.equal(Number(row.ts), 30 + 90); assert.equal(Number(row.nv), 1);
  const ev = (await store.cmd('LRANGE', 'at:ev:' + sid, 0, 50)).map((x) => JSON.parse(x));
  assert.deepEqual(ev.map((e) => e.k).sort(), ['export_png', 'palette', 'start']);
  assert.equal(ev.find((e) => e.k === 'export_png').d, 'abc');
  assert.equal((await call(v, { a: 'ping', vid: b.vid, token: b.token, sid, sec: 5 })).status, 403); // başkasının oturumu
});

test('engelleme, kendi verisini görme / düzeltme / silme', async () => {
  const a = (await reg()).json;
  assert.equal((await call(v, { a: 'me', vid: a.vid, token: a.token })).json.profile.org, 'ODTÜ');
  assert.equal((await call(v, { a: 'upd', vid: a.vid, token: a.token, name: 'Yeni Ad Soyad', org: '', email: 'yeni@hotmail.com', role: '' })).status, 200);
  assert.equal((await call(v, { a: 'me', vid: a.vid, token: a.token })).json.profile.name, 'Yeni Ad Soyad');
  await store.cmd('HSET', 'at:v:' + a.vid, 'bl', '1');
  assert.equal((await call(v, { a: 'ping', vid: a.vid, token: a.token, sid: 'blockblockblock1', sec: 1 })).json.error, 'blocked');
  await store.cmd('HSET', 'at:v:' + a.vid, 'bl', '0');
  assert.equal((await call(v, { a: 'del', vid: a.vid, token: a.token })).status, 200);
  assert.equal((await call(v, { a: 'me', vid: a.vid, token: a.token })).status, 401);
  assert.equal(await store.cmd('ZCARD', 'at:vc') >= 1, true);
  assert.equal((await store.cmd('HGETALL', 'at:v:' + a.vid)).length, 0);
});

test('kayıt hız sınırı', async () => {
  const hdr = { 'x-forwarded-for': '198.51.100.77' };
  let last;
  for (let i = 0; i < 9; i++) last = await call(v, { a: 'reg', name: 'Ali Veli', email: 'ali@gmail.com', consent: true, cv: '2026-11' }, { headers: hdr });
  assert.equal(last.status, 429);
});

test('yönetici: giriş, parola + TOTP, çerez bayrakları, oturum, çıkış', async () => {
  const hdr = { 'x-forwarded-for': '198.51.100.20' };
  assert.equal((await call(admin, { a: 'overview' }, { headers: hdr })).status, 401);
  const totp = C.totp(process.env.ADMIN_TOTP_SECRET);
  assert.equal((await call(admin, { a: 'login', password: 'yanlis', totp }, { headers: hdr })).status, 401);
  assert.equal((await call(admin, { a: 'login', password: 'dogru parola cumlesi 123', totp: '000000' }, { headers: hdr })).status, 401);
  const ok = await call(admin, { a: 'login', password: 'dogru parola cumlesi 123', totp }, { headers: hdr });
  assert.equal(ok.status, 200);
  const sc = ok.headers['set-cookie']; assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  const cookie = sc.split(';')[0];
  const again = await call(admin, { a: 'login', password: 'dogru parola cumlesi 123', totp }, { headers: hdr });
  assert.equal(again.status, 401, 'aynı TOTP kodu tekrar kullanılamaz');
  const ses = await call(admin, { a: 'session' }, { headers: { cookie } });
  assert.equal(ses.json.authed, true);
  const forged = cookie.replace(/\.[^.]*$/, '.AAAA');
  assert.equal((await call(admin, { a: 'overview' }, { headers: { cookie: forged } })).status, 401);
  assert.equal((await call(admin, { a: 'logout' }, { headers: { cookie } })).status, 200);
  assert.equal((await call(admin, { a: 'overview' }, { headers: { cookie } })).status, 401, 'çıkış sunucu tarafında oturumu iptal eder');
});

test('yönetici: giriş denemesi sınırı', async () => {
  const hdr = { 'x-forwarded-for': '198.51.100.30' };
  let last;
  for (let i = 0; i < 7; i++) last = await call(admin, { a: 'login', password: 'yanlis' }, { headers: hdr });
  assert.equal(last.status, 429);
}, { timeout: 20000 });

test('yönetici: özet, liste, ayrıntı, not/engel, CSV dışa aktarma, silme, denetim kaydı', async () => {
  const a = (await reg({ name: 'Zeynep Kaya', org: '=HYPERLINK("x")' })).json;
  await call(v, { a: 'ping', vid: a.vid, token: a.token, sid: 'adminadminadmin1', sec: 45, ev: [{ k: 'color_on' }] });
  const hdr = { 'x-forwarded-for': '198.51.100.40' };
  const totp = C.totp(process.env.ADMIN_TOTP_SECRET, Date.now() + 30000);
  const login = await call(admin, { a: 'login', password: 'dogru parola cumlesi 123', totp }, { headers: hdr });
  assert.equal(login.status, 200);
  const h = { cookie: login.headers['set-cookie'].split(';')[0] };
  const ov = (await call(admin, { a: 'overview' }, { headers: h })).json.overview;
  assert.ok(ov.total >= 1 && ov.sec >= 45); assert.equal(ov.trend.length, 14); assert.ok(ov.online >= 1);
  const li = (await call(admin, { a: 'visitors', limit: 50 }, { headers: h })).json;
  const me = li.items.find((x) => x.id === a.vid); assert.equal(me.name, 'Zeynep Kaya'); assert.equal(me.sec, 45);
  const de = (await call(admin, { a: 'visitor', id: a.vid }, { headers: h })).json.detail;
  assert.equal(de.sessions.length, 1); assert.equal(de.events[0].k, 'color_on'); assert.equal(de.profile.country, 'TR');
  assert.equal((await call(admin, { a: 'visitor', id: '../etc/passwd' }, { headers: h })).status, 400);
  assert.equal((await call(admin, { a: 'update', id: a.vid, label: 'Jüri üyesi', note: 'x', blocked: true }, { headers: h })).status, 200);
  assert.equal((await call(v, { a: 'ping', vid: a.vid, token: a.token, sid: 'adminadminadmin1', sec: 1 })).json.error, 'blocked');
  const csv = (await call(admin, { a: 'export' }, { headers: h })).json.csv;
  assert.match(csv, /Zeynep Kaya/); assert.ok(csv.includes('"\'=HYPERLINK'), 'CSV formül enjeksiyonu etkisiz hale getirilmeli');
  assert.equal((await call(admin, { a: 'delete', id: a.vid }, { headers: h })).status, 200);
  const au = (await call(admin, { a: 'audit' }, { headers: h })).json.items.map((x) => x.a);
  for (const need of ['login', 'list', 'view', 'update', 'export', 'delete']) assert.ok(au.includes(need), need + ' denetim kaydında yok');
  assert.ok(!JSON.stringify(au).includes('198.51.100.40'));
});

test('yapılandırma eksikse yönetici uç noktası kapalıdır', async () => {
  const keep = process.env.ADMIN_PASSWORD_HASH; delete process.env.ADMIN_PASSWORD_HASH;
  assert.equal((await call(admin, { a: 'session' })).status, 503);
  process.env.ADMIN_PASSWORD_HASH = keep;
});

test('parola özeti ve TOTP (RFC 6238 test vektörü)', async () => {
  assert.equal(await C.verifyPassword('abc', 'scrypt$999999999$8$1$AAAA$AAAA'), false);
  assert.equal(await C.verifyPassword('abc', 'bozuk'), false);
  assert.equal(C.totp(C.base32Encode(Buffer.from('12345678901234567890')), 59000), '287082');
  assert.equal(C.verifyTotp(C.base32Encode(Buffer.from('12345678901234567890')), '287082', 59000), true);
});
