// Kent Dokusu motorunu ../dist altına paketler (kendi sunucumuzdan yayın: CDN yok, script-src 'self' korunur).
//   cd modules/kentdoku/engine && npm install && npm run build
// Çıktı depoya işlenir; build.py yalnızca ../dist içeriğini public/assets/kent/ altına kopyalar.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const r = await build({
  absWorkingDir: here,
  entryPoints: ['src/engine.js'],
  bundle: true, format: 'esm', splitting: true, minify: true, target: 'es2020',
  outdir: out, entryNames: 'engine.[hash]', chunkNames: 'k.[hash]',
  external: ['canvg', 'html2canvas', 'dompurify'], // jsPDF'in kullanılmayan isteğe bağlı eklentileri
  legalComments: 'none', metafile: true, logLevel: 'warning'
});

// Leaflet stili: görsel başvuruları çıkarılır (katman denetimi simgesi ve işaretçi kullanılmıyor)
let css = fs.readFileSync(path.join(here, 'node_modules', 'leaflet', 'dist', 'leaflet.css'), 'utf8');
css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[^{}]*\{[^{}]*url\([^)]*\)[^{}]*\}/g, '');
fs.writeFileSync(path.join(out, 'leaflet-1.9.4.css'), css.replace(/\s*\n\s*/g, '\n').trim() + '\n');

const entry = Object.keys(r.metafile.outputs).map((f) => path.basename(f)).find((f) => /^engine\.[A-Z0-9]+\.js$/i.test(f));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ engine: entry }) + '\n');
let total = 0;
for (const f of fs.readdirSync(out)) { const s = fs.statSync(path.join(out, f)).size; total += s; console.log(String(s).padStart(9), f); }
console.log('toplam', total, 'bayt · giriş', entry);
