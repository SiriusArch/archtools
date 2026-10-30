'use strict';
/* store.js — Upstash Redis REST istemcisi (bağımlılıksız, yalnızca fetch).
   Ortam: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (Vercel Marketplace "Upstash Redis" bunları KV_REST_API_URL / KV_REST_API_TOKEN adıyla da verir).
   Test / yerel önizleme: AT_STORE=memory → bellek içi sahte depo (aynı RESP biçimiyle yanıt verir).
   Yalnızca aşağıdaki komutlar kullanılır: GET SET DEL INCR EXPIRE HSET HSETNX HGET HMGET HGETALL HINCRBY ZADD ZREM ZREVRANGE ZCARD ZCOUNT LPUSH LTRIM LRANGE SADD SCARD */

const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

const configured = () => process.env.AT_STORE === 'memory' || !!(URL_() && TOKEN());

/* ---------------- bellek içi sahte depo ---------------- */
const mem = { data: new Map(), exp: new Map() };
function alive(k) { const e = mem.exp.get(k); if (e && e <= Date.now()) { mem.data.delete(k); mem.exp.delete(k); return false; } return mem.data.has(k); }
const S = (v) => String(v);
function memExec(args) {
  const c = String(args[0]).toUpperCase(); const k = args[1] == null ? null : S(args[1]); const a = args.slice(2);
  if (k != null) alive(k);
  const get = (type) => { const v = mem.data.get(k); if (v && v.t !== type) throw new Error('WRONGTYPE'); return v; };
  switch (c) {
    case 'GET': { const v = mem.data.get(k); return v ? v.v : null; }
    case 'SET': { mem.data.set(k, { t: 's', v: S(a[0]) }); const i = a.findIndex((x) => String(x).toUpperCase() === 'EX'); if (i >= 0) mem.exp.set(k, Date.now() + Number(a[i + 1]) * 1000); else mem.exp.delete(k); return 'OK'; }
    case 'DEL': { let n = 0; args.slice(1).forEach((x) => { if (mem.data.delete(S(x))) n++; mem.exp.delete(S(x)); }); return n; }
    case 'INCR': { const v = mem.data.get(k); const n = (v ? Number(v.v) : 0) + 1; mem.data.set(k, { t: 's', v: S(n) }); return n; }
    case 'EXPIRE': { if (!mem.data.has(k)) return 0; mem.exp.set(k, Date.now() + Number(a[0]) * 1000); return 1; }
    case 'HSET': { let v = get('h'); if (!v) { v = { t: 'h', v: new Map() }; mem.data.set(k, v); } let n = 0; for (let i = 0; i < a.length; i += 2) { if (!v.v.has(S(a[i]))) n++; v.v.set(S(a[i]), S(a[i + 1])); } return n; }
    case 'HSETNX': { let v = get('h'); if (!v) { v = { t: 'h', v: new Map() }; mem.data.set(k, v); } if (v.v.has(S(a[0]))) return 0; v.v.set(S(a[0]), S(a[1])); return 1; }
    case 'HGET': { const v = get('h'); return v && v.v.has(S(a[0])) ? v.v.get(S(a[0])) : null; }
    case 'HMGET': { const v = get('h'); return a.map((f) => (v && v.v.has(S(f)) ? v.v.get(S(f)) : null)); }
    case 'HGETALL': { const v = get('h'); const o = []; if (v) v.v.forEach((val, f) => o.push(f, val)); return o; }
    case 'HINCRBY': { let v = get('h'); if (!v) { v = { t: 'h', v: new Map() }; mem.data.set(k, v); } const n = Number(v.v.get(S(a[0])) || 0) + Number(a[1]); v.v.set(S(a[0]), S(n)); return n; }
    case 'ZADD': { let v = get('z'); if (!v) { v = { t: 'z', v: new Map() }; mem.data.set(k, v); } let n = 0; for (let i = 0; i < a.length; i += 2) { if (!v.v.has(S(a[i + 1]))) n++; v.v.set(S(a[i + 1]), Number(a[i])); } return n; }
    case 'ZREM': { const v = get('z'); let n = 0; if (v) a.forEach((m) => { if (v.v.delete(S(m))) n++; }); return n; }
    case 'ZCARD': { const v = get('z'); return v ? v.v.size : 0; }
    case 'ZCOUNT': { const v = get('z'); if (!v) return 0; const lo = a[0] === '-inf' ? -Infinity : Number(a[0]); const hi = a[1] === '+inf' ? Infinity : Number(a[1]); let n = 0; v.v.forEach((s) => { if (s >= lo && s <= hi) n++; }); return n; }
    case 'ZREVRANGE': { const v = get('z'); if (!v) return []; const arr = Array.from(v.v.entries()).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1)); let s = Number(a[0]), e = Number(a[1]); if (e < 0) e = arr.length + e; const out = []; arr.slice(s, e + 1).forEach(([m, sc]) => { out.push(m); if (String(a[2] || '').toUpperCase() === 'WITHSCORES') out.push(S(sc)); }); return out; }
    case 'LPUSH': { let v = get('l'); if (!v) { v = { t: 'l', v: [] }; mem.data.set(k, v); } a.forEach((x) => v.v.unshift(S(x))); return v.v.length; }
    case 'LTRIM': { const v = get('l'); if (v) { let s = Number(a[0]), e = Number(a[1]); if (e < 0) e = v.v.length + e; v.v = v.v.slice(s, e + 1); } return 'OK'; }
    case 'LRANGE': { const v = get('l'); if (!v) return []; let s = Number(a[0]), e = Number(a[1]); if (e < 0) e = v.v.length + e; return v.v.slice(s, e + 1); }
    case 'SADD': { let v = get('set'); if (!v) { v = { t: 'set', v: new Set() }; mem.data.set(k, v); } let n = 0; a.forEach((x) => { if (!v.v.has(S(x))) { v.v.add(S(x)); n++; } }); return n; }
    case 'SCARD': { const v = get('set'); return v ? v.v.size : 0; }
    default: throw new Error('desteklenmeyen komut: ' + c);
  }
}

/* ---------------- Upstash REST ---------------- */
async function run(cmds) {
  if (process.env.AT_STORE === 'memory') return cmds.map((c) => memExec(c));
  if (!configured()) { const e = new Error('store_unavailable'); e.code = 'store_unavailable'; throw e; }
  const r = await fetch(URL_().replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds.map((c) => c.map((x) => (typeof x === 'number' ? x : String(x))))),
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  if (!r.ok) { const e = new Error('store_http_' + r.status); e.code = 'store_error'; throw e; }
  const out = await r.json();
  return out.map((o) => { if (o && o.error) { const e = new Error('store_cmd'); e.code = 'store_error'; throw e; } return o.result; });
}

const pipe = (cmds) => run(cmds);
const cmd = async (...args) => (await run([args]))[0];
const toObj = (arr) => { const o = {}; for (let i = 0; i + 1 < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };
const toPairs = (arr) => { const o = []; for (let i = 0; i + 1 < (arr || []).length; i += 2) o.push({ m: arr[i], s: Number(arr[i + 1]) }); return o; };

module.exports = { configured, pipe, cmd, toObj, toPairs, _mem: mem };
