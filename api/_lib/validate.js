'use strict';
/* validate.js — girdi temizleme ve doğrulama. Hiçbir istemci değerine güvenilmez. */

const ROLES = ['mimar', 'ogrenci', 'akademisyen', 'ofis', 'kamu', 'gayrimenkul', 'diger'];
const CONSENT_VERSION = '2026-10';
const EVENTS = ['start', 'color_on', 'color_off', 'palette', 'auto_layout', 'add_space', 'template', 'export_png', 'export_pdf', 'save_json', 'load_json'];

// kontrol, çift yönlü yön (bidi) ve sıfır genişlikli karakterleri siler → yönetici panelinde görsel sahtecilik olmaz
const BAD = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2060-\\u2069\\uFEFF]', 'g');
function clean(v, max) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(BAD, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,79}$/u;
const EMAIL = /^[^\s@<>"'`]{1,64}@[^\s@<>"'`]{1,190}\.[^\s@<>"'`]{2,24}$/;
const VID = /^[A-Za-z0-9_-]{16}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SID = /^[A-Za-z0-9_-]{12,24}$/;

function profile(b) {
  const name = clean(b.name, 80);
  if (!NAME.test(name)) return { error: 'name' };
  const email = clean(b.email, 120).toLowerCase();
  if (email && !EMAIL.test(email)) return { error: 'email' };
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
function events(list) {
  const out = [];
  (Array.isArray(list) ? list : []).slice(0, 8).forEach((e) => {
    if (!e || typeof e !== 'object' || EVENTS.indexOf(e.k) < 0) return;
    out.push({ k: e.k, d: clean(typeof e.d === 'string' ? e.d : '', 24).replace(/[^A-Za-z0-9_.-]/g, '') });
  });
  return out;
}

module.exports = { ROLES, EVENTS, CONSENT_VERSION, clean, profile, env, events, int, VID, TOKEN, SID };
