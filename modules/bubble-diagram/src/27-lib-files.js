/* ==========================================================================
   27-lib-files.js — JSON kaydet/yükle, PNG ve PDF dışa aktarma
   Standart şema: "mimari-asistan.bubble-diagram" v1 (diğer modüllerle paylaşım için)
   İndirme: önce Artifact "downloads" yeteneği, yoksa tarayıcı indirmesi.
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;

  const SCHEMA = 'mimari-asistan.bubble-diagram';
  const VERSION = 1;

  /* ---------------- dosya kaydetme ---------------- */
  function saveBlob(filename, blob) {
    const cap = window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null);
    return Promise.resolve(cap).catch(function () { return null; }).then(function (dl) {
      if (dl && dl.save) {
        return dl.save({ filename: filename, data: blob }).then(
          function (r) { return { ok: true, status: r.status }; },
          function (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
        );
      }
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        return { ok: true, status: 'saved' };
      } catch (e) { return { ok: false, code: 'unavailable', message: String(e) }; }
    });
  }

  /* ---------------- JSON ---------------- */
  function toJSON(project, k, score, circ) {
    const now = new Date().toISOString();
    return {
      schema: SCHEMA,
      version: VERSION,
      meta: {
        name: project.meta.name,
        buildingType: project.meta.buildingType,
        variant: project.meta.variant,
        createdAt: project.meta.createdAt || now,
        updatedAt: now,
      },
      world: { width: geo.W, height: geo.H, unit: 'px', scalePxPerSqrtM2: Math.round(k * 1000) / 1000 },
      spaces: project.spaces.map((s) => ({ id: s.id, name: s.name, area: s.area, zone: s.zone, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10 })),
      relations: Object.keys(project.relations).map((key) => { const ids = key.split('|'); return { a: ids[0], b: ids[1], type: project.relations[key] }; }),
      metrics: {
        efficiencyScore: score ? score.percent : null,
        totalArea: Math.round(U.sum(project.spaces, (s) => s.area) * 100) / 100,
        circulationShare: circ ? Math.round(circ.share * 1000) / 1000 : null,
      },
    };
  }

  function fromJSON(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('Dosya geçerli bir JSON değil.'); }
    if (!o || o.schema !== SCHEMA) throw new Error('Bu dosya bir İşlev Şeması projesi değil (şema: ' + SCHEMA + ').');
    if (!Array.isArray(o.spaces)) throw new Error('Dosyada mekân listesi bulunamadı.');
    const ids = new Set();
    const spaces = o.spaces.map((s, i) => {
      const id = String(s.id || U.uid() + i);
      ids.add(id);
      const area = Number(s.area);
      if (!(area > 0)) throw new Error('“' + (s.name || i + 1) + '” için geçersiz alan.');
      const zone = App.ZONES[s.zone] ? s.zone : App.match.zoneFor(String(s.name || ''), o.meta && o.meta.buildingType, o.meta && o.meta.variant);
      return { id: id, name: String(s.name || 'Mekân ' + (i + 1)).slice(0, 60), area: area, zone: zone, x: Number(s.x) || geo.W / 2, y: Number(s.y) || geo.H / 2 };
    });
    const relations = {};
    (o.relations || []).forEach((r) => {
      if (!ids.has(r.a) || !ids.has(r.b) || r.a === r.b) return;
      if (r.type === 'strong' || r.type === 'weak' || r.type === 'avoid') relations[U.pairKey(r.a, r.b)] = r.type;
    });
    const m = o.meta || {};
    const typeKey = App.KB.TYPES.some((t) => t.key === m.buildingType) ? m.buildingType : 'genel';
    const variant = App.kb.variant(typeKey, m.variant).key;
    return { meta: { name: String(m.name || 'İçe aktarılan proje').slice(0, 80), buildingType: typeKey, variant: variant, createdAt: m.createdAt || null, example: false }, spaces: spaces, relations: relations };
  }

  /* ---------------- PNG / PDF ---------------- */
  function canvasToBlob(cv, type, q) {
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görüntü oluşturulamadı.'))), type, q));
  }

  function buildPdf(jpeg, iw, ih, title) {
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offs = [];
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const pw = 1190.55, ph = 841.89; // A3 yatay (pt)
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offs[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offs[3] = len; push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    offs[4] = len; push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + iw + ' /Height ' + ih + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    push(jpeg); push('\nendstream\nendobj\n');
    const content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    offs[5] = len; push('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
    const t = U.norm(title).replace(/[()\\]/g, '') || 'islev-semasi';
    offs[6] = len; push('6 0 obj\n<< /Title (' + t + ') /Producer (Islev Semasi Simulasyonu) >>\nendobj\n');
    const xref = len;
    let x = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push('trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function exportPNG(project, k, score) {
    return App.board.toCanvas(project, k, score, 2).then((cv) => canvasToBlob(cv, 'image/png')).then((blob) => saveBlob(U.slug(project.meta.name) + '-islev-semasi.png', blob));
  }
  function exportPDF(project, k, score) {
    return App.board.toCanvas(project, k, score, 2.5).then((cv) =>
      canvasToBlob(cv, 'image/jpeg', 0.93).then((b) => b.arrayBuffer()).then((buf) => buildPdf(new Uint8Array(buf), cv.width, cv.height, project.meta.name))
    ).then((blob) => saveBlob(U.slug(project.meta.name) + '-islev-semasi.pdf', blob));
  }
  function exportJSON(project, k, score, circ) {
    const text = JSON.stringify(toJSON(project, k, score, circ), null, 2);
    return saveBlob(U.slug(project.meta.name) + '-islev-semasi.json', new Blob([text], { type: 'application/json' }));
  }

  App.files = { SCHEMA: SCHEMA, toJSON: toJSON, fromJSON: fromJSON, exportPNG: exportPNG, exportPDF: exportPDF, exportJSON: exportJSON, saveBlob: saveBlob, buildPdf: buildPdf };
})();
