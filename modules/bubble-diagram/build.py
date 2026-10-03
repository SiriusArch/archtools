#!/usr/bin/env python3
"""src/ modüllerini birleştirip depo kökündeki index.html dosyasını üretir (Vercel bunu yayınlar)."""
import glob, os, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.abspath(os.path.join(here, '..', '..'))
src = os.path.join(here, 'src')

js_files = sorted(glob.glob(os.path.join(src, '[0-9][0-9]-*.js')))
js = '\n'.join(open(f, encoding='utf-8').read() for f in js_files)
css = open(os.path.join(src, 'styles.css'), encoding='utf-8').read()

tmp = os.path.join(here, '.bundle-check.js')
open(tmp, 'w', encoding='utf-8').write(js)
r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
os.remove(tmp)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)

html = f"""<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>İşlev Şeması Simülasyonu</title>
<meta name="description" content="Retro-Bauhaus mimari işlev şeması (bubble diagram) simülasyonu">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=DM+Mono:wght@400;500&family=Jost:wght@400;500;600;700&display=swap">
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
