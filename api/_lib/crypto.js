'use strict';
/* crypto.js — yalnızca Node'un yerleşik crypto modülü. Parola: scrypt · oturum: HMAC imzalı çerez · TOTP: RFC 6238 */
const crypto = require('node:crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const randomId = (bytes) => b64u(crypto.randomBytes(bytes || 16));
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(String(data)).digest('base64url');

function timingEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

/* ---- parola: "scrypt$N$r$p$salt(b64)$hash(b64)" ---- */
const SCRYPT = { N: 32768, r: 8, p: 1, len: 64 };
function scryptAsync(pw, salt, o) {
  return new Promise((res, rej) => crypto.scrypt(pw.normalize('NFKC'), salt, o.len, { N: o.N, r: o.r, p: o.p, maxmem: 256 * o.N * o.r }, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(pw, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifyPassword(pw, stored) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(String(stored || ''));
  if (!m) return false;
  const o = { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]) };
  if (o.N > 1 << 17 || o.r > 16 || o.p > 4) return false; // kötü niyetli / bozuk değerlere karşı üst sınır
  const want = Buffer.from(m[5], 'base64');
  const got = await scryptAsync(String(pw), Buffer.from(m[4], 'base64'), Object.assign({ len: want.length }, o));
  return crypto.timingSafeEqual(got, want);
}

/* ---- TOTP ---- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function base32Decode(s) { let bits = ''; for (const ch of String(s).replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secretB32, t) {
  const key = base32Decode(secretB32); if (!key || !key.length) return null;
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor((t || Date.now()) / 30000)));
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, '0');
}
function verifyTotp(secretB32, code, now) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const t = now || Date.now();
  let ok = false;
  for (const d of [-1, 0, 1]) { const want = totp(secretB32, t + d * 30000); if (want && timingEq(want, code)) ok = true; }
  return ok;
}

/* ---- imzalı değer (yönetici oturum çerezi): "<payload>.<imza>" ---- */
function signValue(secret, obj) { const p = b64u(JSON.stringify(obj)); return p + '.' + hmac(secret, p); }
function readSigned(secret, token) {
  const i = String(token || '').indexOf('.'); if (i < 1) return null;
  const p = token.slice(0, i), s = token.slice(i + 1);
  if (!timingEq(hmac(secret, p), s)) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch (e) { return null; }
}

module.exports = { randomId, sha256, hmac, timingEq, hashPassword, verifyPassword, base32Encode, totp, verifyTotp, signValue, readSigned, b64u };
