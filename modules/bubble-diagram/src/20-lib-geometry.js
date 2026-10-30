/* ==========================================================================
   20-lib-geometry.js — pafta geometrisi, ölçek, daire yarıçapı, etiket sığdırma
   Dünya koordinatları: 1400 × 990 birim (A3 yatay oranı 1,414).
   ========================================================================== */
(function () {
  const App = window.App;
  const clamp = App.util.clamp;

  const W = 1400, H = 990, FRAME = 22, TB_H = 104;
  const geo = (App.geo = {
    W: W, H: H, FRAME: FRAME, TB_H: TB_H,
    MIN_R: 24, MAX_R: 230,
    // Balonların serbestçe gezebildiği çizim alanı
    area: { x0: FRAME + 14, y0: FRAME + 14, x1: W - FRAME - 14, y1: H - FRAME - TB_H - 14 },
    titleBlock: { x: FRAME, y: H - FRAME - TB_H, w: W - FRAME * 2, h: TB_H },
  });

  /* Sonsuz tuval: pafta (levha) tuvalin ortasındaki bir sayfadır; daireler tuvalin her yerine bırakılabilir.
     "Dünya" sınırı pafta boyutunun birkaç katıdır (sayıların makul kalması için); yakınlaştırma pafta sığdırmaya göre çarpandır (1 = pafta sığar). */
  geo.WORLD = { x0: -3 * W, y0: -3 * H, x1: 4 * W, y1: 4 * H };
  geo.ZOOM = { min: 0.12, max: 6 };
  geo.clampWorld = function (x, y, r) {
    const w = geo.WORLD, m = r || 0;
    return { x: clamp(x, w.x0 + m, w.x1 - m), y: clamp(y, w.y0 + m, w.y1 - m) };
  };
  geo.clampHit = (w) => clamp(w, 8, 90); // ilişki çizgisinin tıklama genişliği
  geo.inSheet = (x, y) => x >= geo.area.x0 && x <= geo.area.x1 && y >= geo.area.y0 && y <= geo.area.y1;
  // görünüm: null (pafta sığdırılmış) ya da { cx, cy, k }; SVG viewBox'ı bundan üretilir (merkez + çarpan)
  geo.viewBox = function (v) {
    if (!v) return '0 0 ' + W + ' ' + H;
    return (v.cx - W / (2 * v.k)) + ' ' + (v.cy - H / (2 * v.k)) + ' ' + (W / v.k) + ' ' + (H / v.k);
  };
  geo.normView = function (v) {
    if (!v) return null;
    const k = clamp(Number(v.k) || 1, geo.ZOOM.min, geo.ZOOM.max);
    const w = geo.WORLD;
    const cx = clamp(Number(v.cx), w.x0, w.x1), cy = clamp(Number(v.cy), w.y0, w.y1);
    if (!isFinite(cx) || !isFinite(cy)) return null;
    if (Math.abs(k - 1) < 0.004 && Math.abs(cx - W / 2) < 0.6 && Math.abs(cy - H / 2) < 0.6) return null; // varsayılan görünüm
    return { cx: cx, cy: cy, k: k };
  };

  // Toplam balon alanı çizim alanının ~%20'sini kaplayacak şekilde ölçek (px / √m²)
  geo.scale = function (spaces) {
    const total = spaces.reduce((t, s) => t + (s.area > 0 ? s.area : 0), 0);
    if (!total) return 30;
    const a = geo.area;
    const cover = 0.2 * (a.x1 - a.x0) * (a.y1 - a.y0);
    return Math.sqrt(cover / (Math.PI * total));
  };
  geo.radius = function (area, k) {
    return clamp(k * Math.sqrt(Math.max(area, 0.1)), geo.MIN_R, geo.MAX_R);
  };
  geo.clampPos = function (x, y, r) {
    const a = geo.area;
    const lx = a.x0 + r, hx = a.x1 - r, ly = a.y0 + r, hy = a.y1 - r;
    return {
      x: lx > hx ? (a.x0 + a.x1) / 2 : clamp(x, lx, hx),
      y: ly > hy ? (a.y0 + a.y1) / 2 : clamp(y, ly, hy),
    };
  };

  // Etiket yerleşimi: ad satırlara bölünür, daireye sığacak yazı boyutu seçilir
  geo.label = function (name, r) {
    const outside = r < 36;
    const maxW = outside ? 150 : r * 1.72;
    let fs = outside ? 14 : clamp(r * 0.27, 11, 22);
    const T = App.theme.cur().label;
    const text = T.upper ? String(name || '').toLocaleUpperCase('tr') : String(name || '');
    const cw = T.cw; // tema yazı tipine göre ortalama karakter genişliği çarpanı
    function wrap(size) {
      const words = text.split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      const cap = Math.max(3, Math.floor(maxW / (size * cw)));
      words.forEach((w) => {
        const next = cur ? cur + ' ' + w : w;
        if (next.length <= cap || !cur) cur = next;
        else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      return { lines: lines, cap: cap };
    }
    let res = wrap(fs);
    const maxLines = outside ? 2 : r > 90 ? 3 : 2;
    while ((res.lines.length > maxLines || res.lines.some((l) => l.length > res.cap)) && fs > 9) {
      fs -= 1;
      res = wrap(fs);
    }
    let lines = res.lines.slice(0, maxLines);
    if (res.lines.length > maxLines || lines.some((l) => l.length > res.cap)) {
      lines = lines.map((l) => (l.length > res.cap ? l.slice(0, Math.max(1, res.cap - 1)) + '…' : l));
      if (res.lines.length > maxLines) lines[lines.length - 1] = lines[lines.length - 1].replace(/…?$/, '…');
    }
    return { lines: lines, fs: fs, outside: outside, ls: T.upper ? 0.5 : 0 };
  };
})();
