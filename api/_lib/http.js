'use strict';
/* http.js — ortak istek / yanıt yardımcıları: yalnızca POST, CSRF (özel başlık + Origin), boyut sınırı, IP özeti */
const { hmac } = require('./crypto');

const MAX_BODY = 16 * 1024;

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  Object.keys(headers || {}).forEach((k) => res.setHeader(k, headers[k]));
  res.end(JSON.stringify(body));
}
const fail = (res, status, code, headers) => send(res, status, { ok: false, error: code }, headers);

/* Geçerli bir tarayıcı isteği mi?
   1) yalnızca POST  2) X-AT: 1 özel başlığı (başka site bunu CORS izni olmadan gönderemez — CSRF'yi tek başına engeller)
   3) Origin / Sec-Fetch-Site varsa aynı site olmalı  4) JSON gövde, sınırlı boyut. Geçmezse yanıt yazılır ve null döner. */
function guard(req, res) {
  if (req.method !== 'POST') { fail(res, 405, 'method', { Allow: 'POST' }); return null; }
  if (req.headers['x-at'] !== '1') { fail(res, 403, 'forbidden'); return null; }
  const sfs = req.headers['sec-fetch-site'];
  if (sfs && sfs !== 'same-origin' && sfs !== 'none') { fail(res, 403, 'forbidden'); return null; }
  const origin = req.headers.origin;
  if (origin) {
    let host = ''; try { host = new URL(origin).host; } catch (e) { /* geçersiz */ }
    if (!host || host !== String(req.headers.host || '')) { fail(res, 403, 'forbidden'); return null; }
  }
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) { fail(res, 415, 'type'); return null; }
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) { fail(res, 413, 'size'); return null; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) { fail(res, 400, 'body'); return null; }
  return body;
}

// Ham IP saklanmaz: yalnızca hız sınırı anahtarı olarak HMAC özeti kullanılır (tuz: ortam gizli anahtarı)
function ipKey(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = String(req.headers['x-real-ip'] || xff || (req.socket && req.socket.remoteAddress) || '0');
  return hmac(process.env.IP_SALT || process.env.ADMIN_SESSION_SECRET || 'archtools-dev-salt', ip).slice(0, 16);
}

// Vercel'in ekledikleri kaba konum başlıkları (şehir düzeyi; ayrıntılı konum / IP saklanmaz)
function geo(req) {
  const dec = (v) => { try { return decodeURIComponent(String(v || '')); } catch (e) { return ''; } };
  return {
    country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase(),
    city: dec(req.headers['x-vercel-ip-city']).slice(0, 60),
    region: String(req.headers['x-vercel-ip-country-region'] || '').slice(0, 8),
  };
}

const ISTANBUL = 3 * 3600 * 1000; // UTC+3 (Türkiye'de yaz saati uygulaması yoktur)
const hourTR = (ts) => new Date(ts + ISTANBUL).getUTCHours();
const dayTR = (ts) => new Date(ts + ISTANBUL).toISOString().slice(0, 10);

module.exports = { send, fail, guard, ipKey, geo, hourTR, dayTR, MAX_BODY };
