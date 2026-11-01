/* ==========================================================================
   13-lib-colortheme.js — "Beni renklendir!": paletten arayüz renkleri üretir
   Monokrom glass tema aynen kalır (düğmelerin şekli ve yeri değişmez); yalnızca CSS renk değişkenleri,
   pafta renkleri (App.PAL) ve bölge dolguları (App.ZONES) seçilen 5 renkli palete göre yeniden hesaplanır.
   Bu dosya veri / DOM'dan bağımsız hesap yapar (derive); DOM'a yalnızca sync() dokunur.
   - Kullanıcı tercihi: state.ui.color = { on: boolean, p: 'cp4816' }  (localStorage: archtools.color)
   - CSP uyumu: renkler <html> üzerine CSSOM ile (style.setProperty) yazılır; <style> öğesi ya da satır içi
     stil özniteliği gerekmez.
   - Okunabilirlik: yazı renkleri ≥ 4.5:1, vurgu dolgusu ve halkalar zemine karşı ≥ 3:1 olacak şekilde ayarlanır.
   ========================================================================== */
(function () {
  const App = window.App;
  const PL = App.palettes;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const parse = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgba = (hex, a) => { const c = parse(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  const mix = (a, b, t) => { const x = parse(a), y = parse(b); return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t)); };

  function rgb2hsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(hh * 60 + 360) % 360, s, l];
  }
  function hsl(h, s, l) {
    s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const k = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex(k.map((v) => (v + m) * 255));
  }

  const ratio = PL.contrast;
  // koyulaştır / açıklaştır: zemine karşı en az `min` kontrast sağlanana kadar
  function ensure(hex, bg, min, toLight) {
    let h = hex, n = 0;
    while (ratio(h, bg) < min && n < 24) { h = mix(h, toLight ? '#FFFFFF' : '#000000', 0.1); n++; }
    return { hex: h, steps: n };
  }
  // okunaklı yazı: aday renklerden kontrastı yüksek olan; yetersizse siyah / beyaz
  function readable(fill, a, b) {
    let t = ratio(fill, a) >= ratio(fill, b) ? a : b;
    if (ratio(fill, t) < 4.5) t = ratio(fill, '#000000') >= ratio(fill, '#FFFFFF') ? '#000000' : '#FFFFFF';
    return t;
  }

  /* ---------- palet → renk sistemi (saf işlev) ---------- */
  function derive(colors) {
    const info = colors.map((hex) => {
      const c = rgb2hsl(parse(hex));
      return { hex: hex.toUpperCase(), h: c[0], s: c[1], l: c[2], v: c[1] * (1 - Math.abs(2 * c[2] - 1)), lum: ratio(hex, '#000000') };
    });
    const byLum = info.slice().sort((a, b) => b.lum - a.lum);
    const lightest = byLum[0], deepest = byLum[byLum.length - 1];
    const vivid = info.slice().sort((a, b) => b.v - a.v)[0];
    const gray = vivid.v < 0.07;
    // yüzey tonu: açık pastel ton varsa o, yoksa en canlı renk
    const src = gray ? null : lightest.s >= 0.22 && lightest.l >= 0.7 ? lightest : vivid;
    const H = src ? src.h : 222;
    const sb = src ? clamp(src.s, 0.1, 0.6) * 0.5 : 0.06;
    const Hi = gray ? 222 : deepest.h;
    const si = gray ? 0.06 : clamp(deepest.s * 0.5, 0.04, 0.3);

    const mk = (dark) => {
      const bg = dark ? hsl(H, sb * 0.7, 0.075) : hsl(H, sb, 0.895);
      const bg2 = dark ? hsl(H, sb * 0.6, 0.125) : hsl(H, sb * 0.75, 0.968);
      const bg3 = dark ? hsl(H, sb * 0.7, 0.045) : hsl(H, Math.min(sb * 1.15, 0.4), 0.79);
      const hueInk = dark ? (gray ? 222 : lightest.h) : Hi;
      const sInk = dark ? (gray ? 0.06 : clamp(lightest.s, 0, 0.3) * 0.5) : si;
      const ink = dark ? hsl(hueInk, sInk, 0.95) : hsl(hueInk, sInk, 0.1);
      // ikincil / üçüncül yazı: zemine karşı 4.6 / 2.8 kontrast
      const ink2 = ensure(hsl(hueInk, sInk * 0.6, dark ? 0.7 : 0.4), bg, 4.6, dark).hex;
      const ink3 = ensure(hsl(hueInk, sInk * 0.5, dark ? 0.48 : 0.58), bg, 2.8, dark).hex;
      const onInk = dark ? hsl(H, sb * 0.6, 0.08) : bg2;
      // vurgu rengi: palet renklerinden zemine karşı ≥ 3:1 olan en canlı olanı (yoksa en canlısı ayarlanır)
      const cand = info.map((c) => { const e = ensure(c.hex, bg, 3, dark); return { hex: e.hex, score: c.v + (e.steps === 0 ? 1 : 0) - e.steps * 0.02 }; });
      cand.sort((a, b) => b.score - a.score);
      const accent = cand[0].hex;
      const onAccent = readable(accent, ink, onInk);
      const shadow = hsl(H, Math.min(sb * 1.2, 0.3), 0.22);
      const v = {
        '--bg': bg, '--bg-2': bg2, '--bg-3': bg3,
        '--ink': ink, '--ink-2': ink2, '--ink-3': ink3, '--on-ink': onInk,
        '--accent': accent, '--on-accent': onAccent,
        '--ring': rgba(accent, dark ? 0.5 : 0.4), '--ring-0': rgba(accent, 0),
        '--dial-pin': dark ? bg2 : bg,
      };
      if (dark) {
        Object.assign(v, {
          '--glass': rgba(hsl(H, sb * 0.5, 0.16), 0.9), '--glass-2': rgba(hsl(H, sb * 0.5, 0.23), 0.94), '--stroke': 'rgba(255,255,255,.09)',
          '--line': 'rgba(255,255,255,.09)', '--hi': 'rgba(255,255,255,.05)', '--lo': 'rgba(0,0,0,.55)', '--lo-soft': 'rgba(0,0,0,.4)', '--inset-bg': 'rgba(0,0,0,.22)',
          '--sheet-hi': 'rgba(255,255,255,.04)', '--sheet-lo': 'rgba(0,0,0,.6)', '--dot-ring': 'rgba(255,255,255,.42)',
        });
      } else {
        Object.assign(v, {
          '--glass': 'rgba(255,255,255,.55)', '--glass-2': 'rgba(255,255,255,.82)', '--stroke': 'rgba(255,255,255,.9)',
          '--line': rgba(ink, 0.09), '--hi': 'rgba(255,255,255,.95)', '--lo': rgba(shadow, 0.2), '--lo-soft': rgba(shadow, 0.13), '--inset-bg': rgba(ink, 0.035),
          '--sheet-hi': 'rgba(255,255,255,.9)', '--sheet-lo': rgba(shadow, 0.22), '--dot-ring': rgba(ink, 0.22),
        });
      }
      return { vars: v, bg: bg, bg2: bg2, ink: ink, accent: accent, onAccent: onAccent, shadow: shadow };
    };
    const L = mk(false), D = mk(true);

    // pafta levhası (açık kalır): çıktıda da aynı renkler kullanılır
    const sheet = hsl(H, sb * 0.55, 0.975);
    const pal = {
      ink: L.ink, paper: L.bg2, paperDark: L.vars['--bg-3'],
      outer: hsl(H, sb * 0.85, 0.915), sheet: sheet, sheetLive: rgba(sheet, 0.9), shade: rgba(L.shadow, 0.22),
    };

    // bölge dolguları: 5 palet rengi + en koyunun koyusu + en açığın açığı = 7 basamak; mono tema ile aynı açık-koyu sırası
    const asc = byLum.slice().reverse().map((c) => c.hex); // koyu → açık
    const ladder = [mix(asc[0], '#000000', 0.36)].concat(asc, [mix(asc[asc.length - 1], '#FFFFFF', 0.55)]);
    const ORDER = ['servis', 'ozel', 'teknik', 'calisma', 'acik', 'sosyal', 'sirkulasyon']; // koyu → açık
    const zones = {};
    ORDER.forEach((z, i) => { zones[z] = [ladder[i], readable(ladder[i], pal.ink, pal.sheet)]; });

    return { light: L.vars, dark: D.vars, pal: pal, zones: zones, accent: L.accent, swatches: info.slice(0, 3).map((c) => c.hex) };
  }

  /* ---------- uygulama (tek DOM temas noktası) ---------- */
  const cache = {};
  const root = () => document.documentElement;
  const SW = ['--sw1', '--sw2', '--sw3'];
  let applied = { key: '', on: false, p: null };
  let setNames = [];

  function scheme() {
    const t = root().getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function clearVars() { setNames.forEach((n) => root().style.removeProperty(n)); setNames = []; }

  // ui = { on, p }; durum değiştiyse true döner. Çizimden önce çağrılır (view başında) — tekrar çağrı ucuzdur.
  function sync(ui) {
    const pal = ui && ui.on ? PL.get(ui.p) : null;
    const sc = scheme();
    const key = pal ? pal.id + '|' + sc : '';
    if (key === applied.key) return false;
    clearVars();
    App.theme.reset();
    if (!pal) {
      root().removeAttribute('data-color');
      applied = { key: '', on: false, p: null };
      return true;
    }
    const d = cache[pal.id] || (cache[pal.id] = derive(pal.colors));
    const vars = Object.assign({}, sc === 'dark' ? d.dark : d.light);
    SW.forEach((n, i) => { vars[n] = d.swatches[i]; });
    Object.keys(vars).forEach((n) => { root().style.setProperty(n, vars[n]); setNames.push(n); });
    root().setAttribute('data-color', 'on');
    Object.assign(App.PAL, d.pal);
    Object.keys(d.zones).forEach((z) => { App.ZONES[z].fill = d.zones[z][0]; App.ZONES[z].text = d.zones[z][1]; });
    applied = { key: key, on: true, p: pal.id };
    return true;
  }

  // işletim sistemi açık / koyu geçişinde yeniden hesapla ve boya
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function () {
      if (!App.store) return;
      applied.key = applied.on ? '~' : applied.key;
      sync(App.store.get().ui.color);
      if (App.paintNow) App.paintNow();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  App.colortheme = {
    derive: derive,
    sync: sync,
    isOn: function () { return applied.on; },
    palette: function () { return applied.p; },
    // varsayılan palet: nötr, okunaklı bir başlangıç
    DEFAULT: 'cp4815',
  };
})();
