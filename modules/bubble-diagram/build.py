#!/usr/bin/env python3
"""src/ modüllerini birleştirip depo kökündeki index.html dosyasını üretir (Vercel bunu yayınlar).

Stil dosyaları:
  styles.shared.css   — iki temada ortak (geçiş animasyonu, erişilebilirlik)
  styles.glass.css    — varsayılan tema (minimal / buzlu cam)
  styles.bauhaus.css  — "Beni renklendir!" ile açılan renkli tema
Tema dosyaları yazılırken önek gerekmez; derleme sırasında her kural html[data-style="<tema>"] altına alınır.
"""
import glob, os, re, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.abspath(os.path.join(here, '..', '..'))
src = os.path.join(here, 'src')


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


js_files = sorted(glob.glob(os.path.join(src, '[0-9][0-9]-*.js')))
js = '\n'.join(open(f, encoding='utf-8').read() for f in js_files)
rd = lambda name: open(os.path.join(src, name), encoding='utf-8').read()
css = '\n'.join([
    '/* ---- ortak ---- */', rd('styles.shared.css'),
    '/* ---- glass ---- */', scope_css(rd('styles.glass.css'), 'glass'),
    '/* ---- bauhaus ---- */', scope_css(rd('styles.bauhaus.css'), 'bauhaus'),
])

tmp = os.path.join(here, '.bundle-check.js')
open(tmp, 'w', encoding='utf-8').write(js)
r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
os.remove(tmp)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)

fonts = ('https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;500;700&family=Manrope:wght@400;500;600;700;800'
         '&family=Chakra+Petch:wght@500;600;700&family=Jost:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap')
html = f"""<!doctype html>
<html lang="tr" data-style="glass">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>İşlev Şeması Simülasyonu</title>
<meta name="description" content="Minimal, buzlu cam arayüzlü mimari işlev şeması (bubble diagram) simülasyonu. Beni renklendir ile Bauhaus temasına geçer.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
</head>
<body>
<div id="root"></div>
<script>
{js}
</script>
</body>
</html>
"""
out = os.path.join(repo_root, 'index.html')
open(out, 'w', encoding='utf-8').write(html)
print('ok', out, len(html), 'bayt;', len(js_files), 'modül')
