#!/usr/bin/env node
// Yönetici girişi için gizli değerleri YEREL makinenizde üretir. Hiçbir şey dosyaya yazılmaz, ağa gönderilmez:
// çıktıyı Vercel → Project → Settings → Environment Variables bölümüne yapıştırın (Production), sonra terminali kapatın.
//   node tools/admin-setup.mjs
import readline from 'node:readline';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const C = require('../api/_lib/crypto.js');

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); else if (s === '\r\n' || s === '\n') process.stdout.write(s); }; }
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

console.log('archtools · yönetici kurulumu\n');
const pw = await ask('Yönetici parolası (en az 14 karakter; boşluklu uzun bir cümle idealdir): ', true);
if (pw.length < 14) { console.error('Parola çok kısa (en az 14 karakter).'); process.exit(1); }
const pw2 = await ask('Parolayı tekrar yazın: ', true);
if (pw !== pw2) { console.error('Parolalar eşleşmiyor.'); process.exit(1); }

const hash = await C.hashPassword(pw);
const session = crypto.randomBytes(48).toString('base64url');
const salt = crypto.randomBytes(32).toString('base64url');
const totp = C.base32Encode(crypto.randomBytes(20));

console.log('\n──────── Vercel ortam değişkenleri (Production) ────────');
console.log('ADMIN_PASSWORD_HASH=' + hash);
console.log('ADMIN_SESSION_SECRET=' + session);
console.log('IP_SALT=' + salt);
console.log('ADMIN_TOTP_SECRET=' + totp + '        # önerilir: ikinci doğrulama adımı');
console.log('\nTOTP için kimlik doğrulayıcı uygulamanıza (Google Authenticator, Authy, 1Password…) şu adresi ekleyin:');
console.log('otpauth://totp/archtools:admin?secret=' + totp + '&issuer=archtools&digits=6&period=30');
console.log('\nİsteğe bağlı: PRIVACY_CONTACT_NAME, PRIVACY_CONTACT_EMAIL (gizlilik sayfasında görünür; depoya yazılmaz), RETENTION_DAYS (varsayılan 180).');
console.log('Bu çıktıyı bir yere kaydetmeyin; Vercel\'e yapıştırdıktan sonra terminali temizleyin.\n');
