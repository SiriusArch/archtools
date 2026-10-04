/* ==========================================================================
   29-lib-pdf.js — bağımlılıksız çok sayfalı PDF yazıcı (JPEG sayfalar, A3 yatay)
   App.pdf.build(pages, { title, author, subject }) → Blob
   pages: [{ jpeg: Uint8Array, w, h, title? }]  (görüntü sayfaya oran korunarak oturtulur)
   Sayfa başlıkları PDF yer imi (outline) olarak yazılır.
   ========================================================================== */
(function () {
  const App = window.App;
  const pdf = (App.pdf = {});
  const PW = 1190.55, PH = 841.89; // A3 yatay (pt)

  // PDF metin dizgesi (UTF-16BE, BOM'lu): Türkçe karakterler yer imlerinde bozulmaz
  function hexStr(s) {
    let h = 'FEFF';
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0');
    return '<' + h + '>';
  }

  pdf.build = function (pages, opt) {
    opt = opt || {};
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offs = [];
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const n = pages.length;
    // nesne numaraları: 1 katalog · 2 sayfa ağacı · 3 bilgi · 4 outline kökü · 5..4+n outline öğeleri · sonra her sayfa için 3 nesne
    const outBase = 5, pgBase = outBase + n;
    const pageId = (i) => pgBase + i * 3, imgId = (i) => pgBase + i * 3 + 1, ctId = (i) => pgBase + i * 3 + 2;
    const total = pgBase + n * 3 - 1;
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const obj = (id, body) => { offs[id] = len; push(id + ' 0 obj\n' + body + '\nendobj\n'); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R /PageMode /UseOutlines >>');
    obj(2, '<< /Type /Pages /Kids [' + pages.map((_, i) => pageId(i) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
    obj(3, '<< /Title ' + hexStr(opt.title || 'archtools raporu') + ' /Author ' + hexStr(opt.author || 'archtools') + ' /Subject ' + hexStr(opt.subject || '') + ' /Producer (archtools) >>');
    obj(4, '<< /Type /Outlines /First ' + outBase + ' 0 R /Last ' + (outBase + n - 1) + ' 0 R /Count ' + n + ' >>');
    pages.forEach((p, i) => {
      const prev = i ? ' /Prev ' + (outBase + i - 1) + ' 0 R' : '', next = i < n - 1 ? ' /Next ' + (outBase + i + 1) + ' 0 R' : '';
      obj(outBase + i, '<< /Title ' + hexStr(p.title || 'Sayfa ' + (i + 1)) + ' /Parent 4 0 R' + prev + next + ' /Dest [' + pageId(i) + ' 0 R /Fit] >>');
    });
    pages.forEach((p, i) => {
      obj(pageId(i), '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + imgId(i) + ' 0 R >> >> /Contents ' + ctId(i) + ' 0 R >>');
      offs[imgId(i)] = len;
      push(imgId(i) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
      push(p.jpeg); push('\nendstream\nendobj\n');
      const s = Math.min(PW / p.w, PH / p.h), dw = p.w * s, dh = p.h * s;
      const content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + ((PW - dw) / 2).toFixed(2) + ' ' + ((PH - dh) / 2).toFixed(2) + ' cm /Im0 Do Q';
      obj(ctId(i), '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    });
    const xref = len;
    let x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  };
})();
