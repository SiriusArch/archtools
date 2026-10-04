#!/usr/bin/env python3
"""archtools: modül kaynaklarını birleştirip depo kökündeki index.html dosyasını üretir (Vercel bunu yayınlar).

Kaynak klasörleri (CSS bu sırayla birleşir):
  modules/bubble-diagram/src   Modül 1 — İşlev Şeması (ortak çekirdek de burada: 00-core, 10-data, 20-27 lib)
  modules/floor-study/src      Modül 2 — Kat Etüdü
  modules/space-analysis/src   Modül 3 — Mekân Analizi (patlatılmış izometrik)
  modules/site-analysis/src    Modül 4 · 5 · 6 — Arsa Analizi, İmar ve Kapasite, Yer Seçimi (OpenStreetMap tabanlı)
  modules/building-design/src  Modül 7 · 8 — Tasarım Üretici, Maliyet ve Fizibilite (IFC yazıcısı da burada)
  platform/src                 Kabuk: marka, intro, modül geçişi, başlatma

JS dosyaları klasörden bağımsız olarak dosya adındaki sayı önekine göre (00–99) sıralanır:
  00–27 çekirdek ve ortak mantık · 28–29 ortak pafta · 30 state · 31–39 modül mantığı
  40–49 ortak arayüz · 50–59 controller (Modül 1) · 60–79 modül arayüzleri · 90–99 kabuk ve başlatma

Stil dosyaları (her klasörde isteğe bağlı):
  styles.shared.css   iki temada ortak
  styles.glass.css    varsayılan tema (minimal / buzlu cam)
  styles.bauhaus.css  "Beni renklendir!" ile açılan renkli tema
Tema dosyaları önek olmadan yazılır; derleme sırasında her kural html[data-style="<tema>"] altına alınır.
"""
import glob, os, re, subprocess, sys

root = os.path.dirname(os.path.abspath(__file__))
SRC_DIRS = [
    os.path.join(root, 'modules', 'bubble-diagram', 'src'),
    os.path.join(root, 'modules', 'floor-study', 'src'),
    os.path.join(root, 'modules', 'space-analysis', 'src'),
    os.path.join(root, 'modules', 'site-analysis', 'src'),
    os.path.join(root, 'modules', 'building-design', 'src'),
    os.path.join(root, 'platform', 'src'),
]


def split_top(text, sep=','):
    parts, depth, cur = [], 0, ''
    for ch in text:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == sep and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    return parts


def scope_selector(sel, pre):
    sel = sel.strip()
    if sel.startswith(':root'):
        return pre + sel[len(':root'):]
    if sel == 'html':
        return pre
    if sel == 'body' or sel.startswith('body'):
        return pre + ' ' + sel
    return pre + ' ' + sel


def scope_css(css, key):
    pre = 'html[data-style="%s"]' % key
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        if prelude.startswith('@media') or prelude.startswith('@supports'):
            out.append('%s {\n%s\n}' % (prelude, scope_css(body, key)))
        elif prelude.startswith('@'):
            out.append('%s {%s}' % (prelude, body))
        else:
            sels = ', '.join(scope_selector(s, pre) for s in split_top(prelude))
            out.append('%s {%s}' % (sels, body))
        i = k
    return '\n'.join(out)


# ---- JS: dosya adındaki sayı önekine göre birleştir
js_files = []
for d in SRC_DIRS:
    js_files += glob.glob(os.path.join(d, '[0-9][0-9]-*.js'))
js_files.sort(key=lambda f: os.path.basename(f))
names = [os.path.basename(f)[:2] for f in js_files]
dup = sorted({n for n in names if names.count(n) > 1 and n not in ('39', '99')})
if dup:
    print('uyarı: aynı sayı önekini paylaşan dosyalar:', ', '.join(dup))
js = '\n'.join(open(f, encoding='utf-8').read() for f in js_files)


def read_css(name):
    parts = []
    for d in SRC_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            parts.append(open(p, encoding='utf-8').read())
    return '\n'.join(parts)


css = '\n'.join([
    '/* ---- ortak ---- */', read_css('styles.shared.css'),
    '/* ---- glass ---- */', scope_css(read_css('styles.glass.css'), 'glass'),
    '/* ---- bauhaus ---- */', scope_css(read_css('styles.bauhaus.css'), 'bauhaus'),
])

tmp = os.path.join(root, '.bundle-check.js')
open(tmp, 'w', encoding='utf-8').write(js)
r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
os.remove(tmp)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)

fonts = ('https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;500;700&family=Manrope:wght@400;500;600;700;800'
         '&family=Chakra+Petch:wght@500;600;700&family=Jost:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap')

intro = open(os.path.join(root, 'platform', 'src', 'intro.html'), encoding='utf-8').read()

html = f"""<!doctype html>
<html lang="tr" data-style="glass">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>archtools — Mimari Tasarım Asistanı</title>
<meta name="description" content="archtools: işlev şeması, kat etüdü, mekân analizi, arsa analizi, imar ve kapasite, yer seçimi. Minimal, buzlu cam arayüz; Beni renklendir ile Bauhaus teması.">
<meta name="theme-color" content="#E4E5E9">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<script>
/* tema tercihi ilk boyamadan önce uygulanır (intro doğru temayla açılır) */
(function () {{
  try {{
    var q = new URLSearchParams(location.search).get('style');
    var s = q || localStorage.getItem('archtools.style') || localStorage.getItem('archtools.bubble.style');
    if (s === 'bauhaus' || s === 'glass') document.documentElement.setAttribute('data-style', s);
    if (new URLSearchParams(location.search).get('intro') === '0') document.documentElement.setAttribute('data-intro', 'off');
  }} catch (e) {{}}
}})();
</script>
<style>
{css}
</style>
</head>
<body>
{intro}
<div id="root"></div>
<script>
{js}
</script>
</body>
</html>
"""
out = os.path.join(root, 'index.html')
open(out, 'w', encoding='utf-8').write(html)
print('ok', out, len(html), 'bayt;', len(js_files), 'js dosyası')
