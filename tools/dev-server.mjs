#!/usr/bin/env node
// Yerel önizleme: public/ klasörünü sunar ve vercel.json'daki GERÇEK güvenlik başlıklarını uygular
// (CSP ihlalleri üretimdeki gibi burada da görünür). /api/* istekleri api/ klasöründeki işlevlere gider.
//   node tools/dev-server.mjs [port]            → bellek içi depo (Upstash yok), test amaçlı
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const port = Number(process.argv[2] || process.env.PORT || 4173);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function headersFor(url) {
  const out = {};
  for (const rule of cfg.headers || []) {
    const re = new RegExp('^' + rule.source.replace(/\(\.\*\)/g, '.*') + '$');
    if (re.test(url)) for (const h of rule.headers) out[h.key] = h.value;
  }
  // yerelde http üzerinden çalışıldığı için yalnızca bu yönerge çıkarılır; diğer tüm CSP kuralları aynen uygulanır
  if (out['Content-Security-Policy']) out['Content-Security-Policy'] = out['Content-Security-Policy'].replace(/;?\s*upgrade-insecure-requests/, '');
  return out;
}

const apiCache = new Map();
async function loadApi(name) {
  const file = path.join(root, 'api', name + '.js');
  if (!fs.existsSync(file)) return null;
  if (!apiCache.has(name)) apiCache.set(name, (await import(pathToFileURL(file).href)).default);
  return apiCache.get(name);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(u.pathname);
  try {
    if (p.startsWith('/api/')) {
      const fn = await loadApi(p.slice(5).replace(/\/$/, ''));
      if (!fn) { res.writeHead(404); return res.end(); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = raw && (req.headers['content-type'] || '').includes('json') ? JSON.parse(raw) : raw;
      req.query = Object.fromEntries(u.searchParams);
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
      for (const [k, v] of Object.entries(headersFor(p))) res.setHeader(k, v);
      return await fn(req, res);
    }
    if (p === '/admin' || p === '/gizlilik') p += '/index.html';
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(pub, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...headersFor(u.pathname) });
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.writeHead(500); res.end('hata: ' + e.message); }
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
