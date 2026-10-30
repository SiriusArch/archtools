'use strict';
/* visitors.js — ziyaretçi profili, oturum ve süre verisi (Upstash Redis).
   Anahtarlar (önek at:):
     v:<vid>      HASH  profil + sayaçlar (name org email role th co ci dev br os tz lg sw sh dpr cat fs ls nv ts lab nt bl cv ca)
     vs / vc      ZSET  son görülme / kayıt zamanına göre ziyaretçi dizini
     ss:<vid>     ZSET  oturum listesi (skor = başlangıç)   s:<sid> HASH {vid,start,last,sec}   ev:<sid> LIST olaylar (en çok 200)
     hr:<vid>     HASH  İstanbul saatine göre etkin saniye   hr:all genel   tot HASH toplamlar   day:<g> HASH  dayv:<g> SET
     cnt:country / cnt:device / cnt:role / evc  HASH  yalnızca toplu sayaçlar (kişisel veri içermez)
   Saklama: kişisel anahtarlar son etkinlikten RETENTION_DAYS (varsayılan 180) gün sonra otomatik silinir. */
const store = require('./store');
const C = require('./crypto');
const V = require('./validate');
const { parseUA } = require('./ua');
const { hourTR, dayTR } = require('./http');

const RET = () => Math.max(7, Math.min(3650, Number(process.env.RETENTION_DAYS) || 180)) * 86400;
const k = {
  v: (id) => 'at:v:' + id, ss: (id) => 'at:ss:' + id, s: (sid) => 'at:s:' + sid, ev: (sid) => 'at:ev:' + sid, hr: (id) => 'at:hr:' + id,
  day: (d) => 'at:day:' + d, dayv: (d) => 'at:dayv:' + d,
};
const ONLINE_MS = 2 * 60 * 1000;

/* ---------------- hız sınırı: INCR + EXPIRE (sabit pencere) ---------------- */
async function limit(key, max, windowSec) {
  const r = await store.pipe([['INCR', 'at:rl:' + key], ['EXPIRE', 'at:rl:' + key, windowSec]]);
  return Number(r[0]) <= max;
}

/* ---------------- kayıt ---------------- */
async function register(p, env, req) {
  const now = Date.now();
  const vid = C.randomId(12), token = C.randomId(32);
  const ua = parseUA(req.headers['user-agent']);
  const g = require('./http').geo(req);
  const row = {
    name: p.name, org: p.org, email: p.email, role: p.role, th: C.sha256(token),
    co: g.country, ci: g.city, dev: ua.dev, br: ua.br, os: ua.os, tz: env.tz, lg: env.lg, sw: env.sw, sh: env.sh, dpr: env.dpr,
    cat: now, fs: now, ls: now, nv: 0, ts: 0, bl: 0, cv: V.CONSENT_VERSION, ca: now,
  };
  const flat = []; Object.keys(row).forEach((x) => flat.push(x, row[x]));
  const ttl = RET();
  const cmds = [
    ['HSET', k.v(vid)].concat(flat), ['EXPIRE', k.v(vid), ttl],
    ['ZADD', 'at:vc', now, vid], ['ZADD', 'at:vs', now, vid],
    ['HINCRBY', 'at:cnt:country', g.country || '??', 1], ['HINCRBY', 'at:cnt:device', ua.dev, 1], ['HINCRBY', 'at:cnt:role', p.role || '-', 1],
    ['HINCRBY', 'at:tot', 'visitors', 1],
  ];
  await store.pipe(cmds);
  return { vid: vid, token: token };
}

/* ---------------- kimlik doğrulama (vid + token) ---------------- */
async function authenticate(vid, token) {
  if (!V.VID.test(String(vid || '')) || !V.TOKEN.test(String(token || ''))) return { status: 401, error: 'unknown' };
  const r = await store.cmd('HMGET', k.v(vid), 'th', 'bl');
  if (!r || !r[0]) return { status: 401, error: 'unknown' };
  if (!C.timingEq(C.sha256(token), r[0])) return { status: 401, error: 'unknown' };
  if (r[1] === '1') return { status: 403, error: 'blocked' };
  return { ok: true };
}

/* ---------------- nabız: oturum + etkin süre + olaylar ---------------- */
async function ping(vid, b, req) {
  const now = Date.now();
  const sid = String(b.sid || '');
  if (!V.SID.test(sid)) return { status: 400, error: 'sid' };
  const sec = V.int(b.sec, 0, 90);
  const evs = V.events(b.ev);
  const ttl = RET();
  // oturum başka bir ziyaretçiye ait olamaz
  const first = await store.pipe([['HSETNX', k.s(sid), 'vid', vid], ['HGET', k.s(sid), 'vid']]);
  if (first[1] !== vid) return { status: 403, error: 'sid' };
  const isNew = Number(first[0]) === 1;
  const hh = String(hourTR(now)), day = dayTR(now);
  const cmds = [];
  if (isNew) {
    const ua = parseUA(req.headers['user-agent']);
    const g = require('./http').geo(req);
    cmds.push(['HSET', k.s(sid), 'start', now, 'last', now, 'sec', 0, 'dev', ua.dev, 'co', g.country, 'ci', g.city]);
    cmds.push(['ZADD', k.ss(vid), now, sid]);
    cmds.push(['HINCRBY', k.v(vid), 'nv', 1]);
    cmds.push(['HSET', k.v(vid), 'co', g.country, 'ci', g.city, 'dev', ua.dev, 'br', ua.br, 'os', ua.os]);
    cmds.push(['HINCRBY', 'at:tot', 'sessions', 1], ['HINCRBY', k.day(day), 'sessions', 1], ['SADD', k.dayv(day), vid], ['EXPIRE', k.day(day), 400 * 86400], ['EXPIRE', k.dayv(day), 400 * 86400]);
  }
  cmds.push(['HSET', k.s(sid), 'last', now], ['HSET', k.v(vid), 'ls', now], ['ZADD', 'at:vs', now, vid]);
  if (sec > 0) {
    cmds.push(['HINCRBY', k.s(sid), 'sec', sec], ['HINCRBY', k.v(vid), 'ts', sec], ['HINCRBY', k.hr(vid), hh, sec], ['HINCRBY', 'at:hr:all', hh, sec],
      ['HINCRBY', 'at:tot', 'sec', sec], ['HINCRBY', k.day(day), 'sec', sec]);
  }
  evs.forEach((e) => {
    cmds.push(['LPUSH', k.ev(sid), JSON.stringify({ t: now, k: e.k, d: e.d })], ['HINCRBY', 'at:evc', e.k, 1]);
  });
  if (evs.length) cmds.push(['LTRIM', k.ev(sid), 0, 199]);
  cmds.push(['EXPIRE', k.v(vid), ttl], ['EXPIRE', k.ss(vid), ttl], ['EXPIRE', k.hr(vid), ttl], ['EXPIRE', k.s(sid), ttl], ['EXPIRE', k.ev(sid), ttl]);
  await store.pipe(cmds);
  return { ok: true };
}

/* ---------------- kendi profili ---------------- */
async function me(vid) {
  const o = store.toObj(await store.cmd('HGETALL', k.v(vid)));
  return { name: o.name || '', org: o.org || '', email: o.email || '', role: o.role || '', consentAt: Number(o.ca) || 0, consentVersion: o.cv || '' };
}
async function update(vid, p) {
  await store.pipe([['HSET', k.v(vid), 'name', p.name, 'org', p.org, 'email', p.email, 'role', p.role], ['EXPIRE', k.v(vid), RET()]]);
}

/* ---------------- silme (KVKK m.11: silinmesini isteme) ---------------- */
async function remove(vid) {
  const sess = (await store.cmd('ZREVRANGE', k.ss(vid), 0, 499)) || [];
  const cmds = [['DEL', k.v(vid)], ['DEL', k.ss(vid)], ['DEL', k.hr(vid)], ['ZREM', 'at:vs', vid], ['ZREM', 'at:vc', vid]];
  sess.forEach((s) => { cmds.push(['DEL', k.s(s)], ['DEL', k.ev(s)]); });
  await store.pipe(cmds);
}

/* ---------------- yönetici: özet ---------------- */
async function overview() {
  const now = Date.now();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dayTR(now - i * 86400000));
  const cmds = [
    ['ZCARD', 'at:vc'], ['ZCOUNT', 'at:vs', now - ONLINE_MS, '+inf'], ['HGETALL', 'at:tot'], ['HGETALL', 'at:hr:all'],
    ['HGETALL', 'at:cnt:country'], ['HGETALL', 'at:cnt:device'], ['HGETALL', 'at:cnt:role'], ['HGETALL', 'at:evc'],
  ];
  days.forEach((d) => { cmds.push(['SCARD', k.dayv(d)], ['HGETALL', k.day(d)]); });
  const r = await store.pipe(cmds);
  const tot = store.toObj(r[2]);
  const num = (o) => { const x = {}; Object.keys(o).forEach((y) => { x[y] = Number(o[y]); }); return x; };
  const trend = days.map((d, i) => { const h = store.toObj(r[9 + i * 2]); return { day: d, visitors: Number(r[8 + i * 2]) || 0, sessions: Number(h.sessions) || 0, sec: Number(h.sec) || 0 }; });
  return {
    total: Number(r[0]) || 0, online: Number(r[1]) || 0,
    sessions: Number(tot.sessions) || 0, sec: Number(tot.sec) || 0,
    hours: num(store.toObj(r[3])), country: num(store.toObj(r[4])), device: num(store.toObj(r[5])), role: num(store.toObj(r[6])), events: num(store.toObj(r[7])),
    trend: trend,
  };
}

/* ---------------- yönetici: liste ---------------- */
function shape(id, o, ls) {
  return {
    id: id, name: o.name || '', org: o.org || '', email: o.email || '', role: o.role || '', country: o.co || '', city: o.ci || '', device: o.dev || '', browser: o.br || '', os: o.os || '',
    created: Number(o.cat) || 0, last: Number(o.ls) || Number(ls) || 0, visits: Number(o.nv) || 0, sec: Number(o.ts) || 0, label: o.lab || '', note: o.nt || '', blocked: o.bl === '1',
    tz: o.tz || '', lang: o.lg || '', screen: o.sw && o.sh ? o.sw + '×' + o.sh + (o.dpr ? ' @' + o.dpr + 'x' : '') : '', consent: o.cv ? o.cv : '', consentAt: Number(o.ca) || 0,
  };
}
async function list(offset, limit, by) {
  const idx = by === 'created' ? 'at:vc' : 'at:vs';
  const ids = store.toPairs(await store.cmd('ZREVRANGE', idx, offset, offset + limit - 1, 'WITHSCORES'));
  if (!ids.length) return { items: [], more: false };
  const rows = await store.pipe(ids.map((x) => ['HGETALL', k.v(x.m)]));
  const items = [], dead = [];
  ids.forEach((x, i) => { const o = store.toObj(rows[i]); if (!o.name) dead.push(x.m); else items.push(shape(x.m, o, x.s)); });
  if (dead.length) await store.pipe(dead.map((d) => ['ZREM', idx, d])); // süresi dolan kayıtların dizin artıkları
  return { items: items, more: ids.length === limit };
}

/* ---------------- yönetici: ayrıntı ---------------- */
async function detail(vid) {
  const o = store.toObj(await store.cmd('HGETALL', k.v(vid)));
  if (!o.name) return null;
  const sids = (await store.cmd('ZREVRANGE', k.ss(vid), 0, 29)) || [];
  const cmds = [['HGETALL', k.hr(vid)]];
  sids.forEach((s, i) => { cmds.push(['HGETALL', k.s(s)]); if (i < 8) cmds.push(['LRANGE', k.ev(s), 0, 59]); });
  const r = await store.pipe(cmds);
  const sessions = [], events = [];
  let p = 1;
  sids.forEach((s, i) => {
    const so = store.toObj(r[p++]);
    sessions.push({ id: s, start: Number(so.start) || 0, last: Number(so.last) || 0, sec: Number(so.sec) || 0, device: so.dev || '', country: so.co || '', city: so.ci || '' });
    if (i < 8) (r[p++] || []).forEach((e) => { try { const j = JSON.parse(e); events.push({ t: j.t, k: j.k, d: j.d, s: s }); } catch (x) { /* bozuk kayıt */ } });
  });
  events.sort((a, b) => b.t - a.t);
  const hours = {}; const hr = store.toObj(r[0]); Object.keys(hr).forEach((h) => { hours[h] = Number(hr[h]); });
  return { profile: shape(vid, o), sessions: sessions, events: events.slice(0, 150), hours: hours };
}

async function adminUpdate(vid, patch) {
  const f = [];
  if (patch.label != null) f.push('lab', V.clean(String(patch.label), 40));
  if (patch.note != null) f.push('nt', V.clean(String(patch.note), 500));
  if (patch.blocked != null) f.push('bl', patch.blocked ? '1' : '0');
  if (!f.length) return false;
  if (!(await store.cmd('HGET', k.v(vid), 'name'))) return false;
  await store.cmd.apply(null, ['HSET', k.v(vid)].concat(f));
  return true;
}

async function exportAll(max) {
  const out = []; let off = 0;
  for (;;) { const r = await list(off, 200, 'created'); out.push.apply(out, r.items); if (!r.more || out.length >= max) break; off += 200; }
  return out.slice(0, max);
}

module.exports = { limit, register, authenticate, ping, me, update, remove, overview, list, detail, adminUpdate, exportAll, ONLINE_MS, RET };
