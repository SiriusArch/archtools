#!/usr/bin/env python3
"""archtools: kaynakları birleştirip yayın klasörü `public/` dizinini üretir (Vercel yalnızca bunu sunar).

Kullanım:
  python3 build.py                  yalnızca İşlev Şeması (Bubble Diyagram) — yayın varsayılanı
  python3 build.py --modules all    tüm modüller (geliştirme; yayında kullanılmaz)
  python3 build.py --modules islev,kat

Neden `public/`?  Depo kökündeki kaynaklar, README ve JSON verileri internetten erişilebilir olmasın diye Vercel
`vercel.json` içindeki outputDirectory ile yalnızca `public/` klasörünü yayınlar. Gizli tutulan modüllerin kodu
pakete HİÇ girmez (istemciye gitmez); yalnızca açık modüllerin kaynak klasörleri birleştirilir.

Çıktı (tümü içerik özetiyle adlandırılır → sınırsız önbellek, eski dosya karışmaz):
  public/index.html                 uygulama kabuğu (satır içi betik / stil YOK → katı CSP)
  public/assets/app.<h>.js|css      birleşik uygulama
  public/assets/boot.<h>.js         ilk boyamadan önce çalışan küçük betik
  public/assets/fonts/*.woff        yerel yazı tipleri (Google Fonts'a istek yok → ziyaretçi IP'si üçüncü tarafa gitmez)
  public/admin/ · public/gizlilik/  yönetici paneli ve aydınlatma metni (site/ klasöründen; uygulamanın CSS'ini paylaşır)

JS dosyaları dosya adındaki sayı önekine göre (00–99) sıralanır:
  00–27 çekirdek ve ortak mantık · 28–29 ortak pafta/kütüphaneler · 30 state · 31–39 modül mantığı
  40–49 arayüz · 50–59 controller · 60–79 modül arayüzleri · 90–99 kabuk ve başlatma
Stil: styles.shared.css (ortak) + styles.glass.css (tek tema: monokrom glass; renk belirteçleri :root'tadır).
"""
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys

root = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(root, 'public')

# modül kimliği → kaynak klasörleri (çekirdek ortak kod bubble-diagram içindedir; platform her zaman eklenir)
MODULE_DIRS = {
    'islev': ['modules/bubble-diagram/src'],
    'kat': ['modules/floor-study/src'],
    'analiz': ['modules/space-analysis/src'],
    'arsa': ['modules/site-analysis/src'], 'imar': ['modules/site-analysis/src'], 'yer': ['modules/site-analysis/src'],
    'tasarim': ['modules/building-design/src'], 'fizibilite': ['modules/building-design/src'],
    'vaziyet': ['modules/site-plan/src'],
    'kolaj': ['modules/collage/src'],
    'pafta': ['modules/board-template/src'],
}
ALL = ['islev', 'kat', 'analiz', 'arsa', 'imar', 'yer', 'tasarim', 'fizibilite', 'vaziyet', 'kolaj', 'pafta']
PLATFORM = 'platform/src'
# yalnızca İşlev Şeması yayınlanırken pakete girmeyen platform dosyaları (harita altlığı, DXF/XLSX yazıcıları, kırpma):
# harici ağ adresleri ve kullanılmayan kod istemciye gitmesin
BUBBLE_ONLY_EXCLUDE = {'28-lib-basemap.js', '48-ui-basemap.js', '29-lib-dxf.js', '29-lib-xlsx.js', '49-ui-crop.js'}


def sha(data, n=10):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode('utf-8')).hexdigest()[:n]


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = 'wb' if isinstance(data, bytes) else 'w'
    with open(path, mode, **({} if isinstance(data, bytes) else {'encoding': 'utf-8'})) as f:
        f.write(data)


def strip_css(css):
    """Güvenli küçültme: yorumlar ve gereksiz boşluk (dizge içeriğine dokunmaz; bu projede CSS dizgelerinde '/*' yoktur)."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s*\n\s*', '\n', css)
    css = re.sub(r'[ \t]{2,}', ' ', css)
    return css.strip() + '\n'


def parse_args():
    ap = argparse.ArgumentParser(description='archtools yayın paketini üretir')
    ap.add_argument('--modules', default='islev', help="virgülle ayrılmış modül kimlikleri ya da 'all' (varsayılan: islev)")
    a = ap.parse_args()
    mods = ALL if a.modules == 'all' else [m.strip() for m in a.modules.split(',') if m.strip()]
    bad = [m for m in mods if m not in MODULE_DIRS]
    if bad or not mods or 'islev' not in mods:
        sys.exit('hata: geçersiz modül listesi (islev zorunlu): %s' % (bad or mods))
    return mods


def main():
    mods = parse_args()
    bubble_only = mods == ['islev']
    src_dirs = []
    for m in mods:
        for d in MODULE_DIRS[m]:
            if d not in src_dirs:
                src_dirs.append(d)
    src_dirs.append(PLATFORM)
    src_dirs = [os.path.join(root, d) for d in src_dirs]

    # ---- JS: sayı önekine göre birleştir
    js_files = []
    for d in src_dirs:
        js_files += glob.glob(os.path.join(d, '[0-9][0-9]-*.js'))
    if bubble_only:
        js_files = [f for f in js_files if os.path.basename(f) not in BUBBLE_ONLY_EXCLUDE]
    js_files.sort(key=lambda f: os.path.basename(f))
    names = [os.path.basename(f)[:2] for f in js_files]
    dup = sorted({n for n in names if names.count(n) > 1 and n not in ('39', '99')})
    if dup:
        print('uyarı: aynı sayı önekini paylaşan dosyalar:', ', '.join(dup))
    config = {'modules': mods, 'api': {'visit': '/api/v'}}
    prelude = 'window.App = window.App || {};\nwindow.App.config = %s;\n' % json.dumps(config, separators=(',', ':'))
    js = prelude + '\n'.join(read(f) for f in js_files)

    # ---- CSS
    def read_css(name):
        return '\n'.join(read(os.path.join(d, name)) for d in src_dirs if os.path.exists(os.path.join(d, name)))
    css = strip_css(read_css('styles.shared.css') + '\n' + read_css('styles.glass.css'))

    # sözdizimi denetimi
    tmp = os.path.join(root, '.bundle-check.js')
    write(tmp, js)
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    os.remove(tmp)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit(1)

    # ---- çıktı klasörü sıfırlanır (eski özetli dosyalar kalmasın)
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    assets = os.path.join(OUT, 'assets')

    # yazı tipleri: içerik özetli ad; CSS içindeki url("fonts/<ad>.woff") buna çevrilir
    font_map = {}
    for f in sorted(glob.glob(os.path.join(root, 'platform', 'fonts', '*.woff'))):
        data = open(f, 'rb').read()
        base = os.path.basename(f)[:-5]
        hashed = '%s.%s.woff' % (base, sha(data))
        write(os.path.join(assets, 'fonts', hashed), data)
        font_map['fonts/' + os.path.basename(f)] = '/assets/fonts/' + hashed
    for k, v in font_map.items():
        css = css.replace('url("%s")' % k, 'url("%s")' % v)
    leftover = re.findall(r'url\("fonts/[^"]+"\)', css)
    if leftover:
        sys.exit('hata: çözülmeyen yazı tipi başvurusu: %s' % leftover)

    app_js = 'app.%s.js' % sha(js)
    app_css = 'app.%s.css' % sha(css)
    boot = read(os.path.join(root, 'platform', 'boot.js'))
    boot_js = 'boot.%s.js' % sha(boot)
    write(os.path.join(assets, app_js), js)
    write(os.path.join(assets, app_css), css)
    write(os.path.join(assets, boot_js), boot)

    intro = read(os.path.join(root, 'platform', 'src', 'intro.html'))
    preload = ''.join('<link rel="preload" href="%s" as="font" type="font/woff" crossorigin>\n' % v for v in font_map.values())
    html = '''<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>archtools — İşlev Şeması</title>
<meta name="description" content="archtools: ilişki matrisinden işlev şeması (bubble diagram) üretin, otomatik yerleştirin, renk paletleriyle boyayın.">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#E4E5E9">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%2317181B'/%3E%3Ccircle cx='15' cy='15' r='8' fill='%23F6F7F9'/%3E%3Crect x='20' y='20' width='14' height='14' rx='3.5' fill='none' stroke='%23F6F7F9' stroke-width='2'/%3E%3C/svg%3E">
''' + preload + '''<link rel="stylesheet" href="/assets/%s">
<script src="/assets/%s"></script>
</head>
<body>
%s
<div id="root"></div>
<script src="/assets/%s" defer></script>
</body>
</html>
''' % (app_css, boot_js, intro, app_js)
    write(os.path.join(OUT, 'index.html'), html)

    # ---- site/: yönetici paneli, aydınlatma metni, robots.txt (uygulamanın CSS'ini paylaşır → tasarım tutarlı kalır)
    site = os.path.join(root, 'site')
    extra = []
    if os.path.isdir(site):
        def hashed_asset(src, stem, ext, minify=False):
            data = read(src)
            if minify:
                data = strip_css(data)
            name = '%s.%s.%s' % (stem, sha(data), ext)
            write(os.path.join(assets, name), data)
            return '/assets/' + name
        subs = {'{{APP_CSS}}': '/assets/' + app_css, '{{FONTS}}': preload}
        # her sayfa yalnızca kendi varlıklarını tanımlar; eksik varlık sessizce atlanır
        for key, rel, stem, ext, minify in [
            ('{{ADMIN_JS}}', 'admin/admin.js', 'admin', 'js', False), ('{{ADMIN_CSS}}', 'admin/admin.css', 'admin', 'css', True),
            ('{{LEGAL_JS}}', 'privacy/legal.js', 'legal', 'js', False), ('{{LEGAL_CSS}}', 'legal.css', 'legal', 'css', True)]:
            if os.path.exists(os.path.join(site, rel)):
                subs[key] = hashed_asset(os.path.join(site, rel), stem, ext, minify)
        for rel, outrel in [('admin/index.html', 'admin/index.html'), ('privacy/index.html', 'gizlilik/index.html')]:
            p = os.path.join(site, rel)
            if os.path.exists(p):
                t = read(p)
                for k, v in subs.items():
                    t = t.replace(k, v)
                left = re.findall(r'\{\{[A-Z_]+\}\}', t)
                if left:
                    sys.exit('hata: %s içinde çözülmeyen yer tutucu: %s' % (rel, left))
                write(os.path.join(OUT, outrel), t)
                extra.append(outrel)
        if os.path.exists(os.path.join(site, 'robots.txt')):
            shutil.copy(os.path.join(site, 'robots.txt'), os.path.join(OUT, 'robots.txt'))
            extra.append('robots.txt')

    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print('ok public/  modüller=%s  js=%d dosya (%d bayt)  css=%d bayt  toplam=%d bayt  ek=%s' % (','.join(mods), len(js_files), len(js), len(css), total, ','.join(extra) or '-'))


main()
