'use strict';
/* validate.js — girdi temizleme ve doğrulama. Hiçbir istemci değerine güvenilmez. */

const ROLES = ['mimar', 'ogrenci', 'akademisyen', 'ofis', 'kamu', 'gayrimenkul', 'diger'];
const CONSENT_VERSION = '2026-11';
const EVENTS = ['start', 'color_on', 'color_off', 'palette', 'auto_layout', 'add_space', 'template', 'export_png', 'export_pdf', 'save_json', 'load_json'];

// kontrol, çift yönlü yön (bidi) ve sıfır genişlikli karakterleri siler → yönetici panelinde görsel sahtecilik olmaz
const BAD = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2060-\\u2069\\uFEFF]', 'g');
function clean(v, max) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(BAD, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,79}$/u;
const EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]{3,190}$/;
/* E-posta zorunludur ve yalnızca güvenilir sağlayıcılardan kabul edilir (tek kullanımlık / uydurma adresleri ayıklamak için).
   İstemci (platform/src/51-ui-gate.js) aynı listeyi kullanır; değiştirirseniz ikisini birlikte güncelleyin (tests/api.test.mjs eşitliği denetler). */
const MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.tr', 'outlook.com', 'outlook.com.tr', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.com.tr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'yandex.com', 'yandex.com.tr', 'proton.me', 'protonmail.com', 'pm.me', 'aol.com', 'mynet.com'];
const MAIL_SUFFIXES = ['.edu.tr', '.edu', '.gov.tr']; // üniversite ve kamu adresleri
function mailOk(email) {
  if (!EMAIL.test(email)) return false;
  const d = email.slice(email.lastIndexOf('@') + 1);
  if (d.indexOf('..') >= 0 || d[0] === '.' || d[d.length - 1] === '.') return false;
  return MAIL_DOMAINS.indexOf(d) >= 0 || MAIL_SUFFIXES.some((x) => d.length > x.length && d.slice(-x.length) === x);
}
const VID = /^[A-Za-z0-9_-]{16}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SID = /^[A-Za-z0-9_-]{12,24}$/;

function profile(b) {
  const name = clean(b.name, 80);
  if (!NAME.test(name) || name.split(' ').filter((w) => w.replace(/[^\p{L}]/gu, '').length >= 2).length < 2) return { error: 'name' }; // ad + soyad
  const email = clean(b.email, 120).toLowerCase();
  if (!mailOk(email)) return { error: 'email' };
  const role = clean(b.role, 20);
  if (role && ROLES.indexOf(role) < 0) return { error: 'role' };
  return { value: { name: name, org: clean(b.org, 80), email: email, role: role } };
}
const int = (v, a, z) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(z, n)) : a; };
function env(b) { // istemci ortamı: kaba, sınırlı ve yalnızca biçim denetimli
  return {
    tz: clean(b.tz, 40).replace(/[^A-Za-z0-9_/+-]/g, ''),
    lg: clean(b.lg, 12).replace(/[^A-Za-z0-9-]/g, ''),
    sw: int(b.sw, 0, 10000), sh: int(b.sh, 0, 10000), dpr: Math.round(Math.max(0, Math.min(8, Number(b.dpr) || 0)) * 10) / 10,
  };
}
/* tarayıcı konumu (kullanıcı izin verirse): yaklaşık değerde saklanır — 3 ondalık ≈ 110 m */
function location(b) {
  const la = Number(b.lat), lo = Number(b.lon);
  if (typeof b.lat === 'boolean' || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return { error: 'loc' };
  const ac = Number.isFinite(Number(b.acc)) ? Math.max(0, Math.min(100000, Math.round(Number(b.acc) / 10) * 10)) : 0;
  return { value: { lat: Math.round(la * 1000) / 1000, lon: Math.round(lo * 1000) / 1000, acc: ac } };
}
function events(list) {
  const out = [];
  (Array.isArray(list) ? list : []).slice(0, 8).forEach((e) => {
    if (!e || typeof e !== 'object' || EVENTS.indexOf(e.k) < 0) return;
    out.push({ k: e.k, d: clean(typeof e.d === 'string' ? e.d : '', 24).replace(/[^A-Za-z0-9_.-]/g, '') });
  });
  return out;
}

module.exports = { MAIL_DOMAINS, MAIL_SUFFIXES, mailOk, location, ROLES, EVENTS, CONSENT_VERSION, clean, profile, env, events, int, VID, TOKEN, SID };
