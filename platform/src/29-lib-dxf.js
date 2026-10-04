/* ==========================================================================
   29-lib-dxf.js — bağımlılıksız AutoCAD DXF (ASCII, R2000 / AC1015) yazıcısı  ·  App.dxf
   AutoCAD, BricsCAD, LibreCAD, QCAD, DraftSight, Revit/ArchiCAD içe aktarma ve ücretsiz görüntüleyicilerde açılır.
   Muhafazakâr lehçe: DXF R2000. Dosya SAF ASCII'dir; Türkçe harfler (ğüşıöçİĞÜŞÖÇ) ve diğer ASCII dışı
   karakterler \U+XXXX Unicode kaçışı olarak yazılır (R2000'in kendi yöntemi, $DWGCODEPAGE ANSI_1252).
   Bölümler: HEADER · TABLES (VPORT, LTYPE, LAYER, STYLE, APPID, BLOCK_RECORD) · BLOCKS (*Model_Space, *Paper_Space)
             · ENTITIES · OBJECTS (kök DICTIONARY + ACAD_GROUP) · EOF.
   Tüm nesnelerin tekil onaltılık tutamacı (5) ve alt sınıf işaretleri (100) vardır; sahip bağlantıları (330) tutarlıdır.
   Kullanım:
     const text = App.dxf.build({
       title, units: 'm' | 'mm', scale: 1,              // tüm koordinat/boyutlar `scale` ile çarpılır (örn. 1000 → mm)
       layers: { DUVAR: { color: 7, ltype: 'CONTINUOUS', lw: 0.35, label: 'Taşıyıcı duvarlar', off: false, plot: true } },
       entities: [
         { layer, kind: 'line',   pts: [[x,y],[x,y]], color? },
         { layer, kind: 'poly',   pts: [[x,y],...], closed: true, width: 0, color? },          // LWPOLYLINE
         { layer, kind: 'text',   at: [x,y], text, h: 0.25, rot: 0, align: 'left|center|right', valign: 'baseline|middle|top|bottom', color? },
         { layer, kind: 'mtext',  at: [x,y], text, h, w?, rot?, align?, color? },                // metin '\n' içerebilir
         { layer, kind: 'circle', at: [x,y], r, color? },   { layer, kind: 'arc', at: [x,y], r, a0, a1, color? },   // derece, saat yönü tersi
         { layer, kind: 'hatch',  pts: [[x,y],...], pattern: 'SOLID|ANSI31|ANSI37', color?, scale? },
         { layer, kind: 'point',  at: [x,y], color? }
       ]
     });
     App.dxf.save(text, 'plan.dxf');           // → Promise ({ ok, status } | { ok:false, ... })
     App.dxf.lastWarnings                      // atlanan/uyarılı varlıklar (Türkçe metin dizisi)
     App.dxf.parse(text)                       // test/gidiş-dönüş okuyucusu (+ yapısal doğrulama `problems`)
   Notlar: HATCH varlıkları, çizgilerin altında kalsın diye (çizim sırası) önce yazılır; kalan sıra korunur.
           Renk (62) verilmezse BYLAYER. Kat adları ASCII'ye indirgenir (büyük harf, rakam, _ ve -; en çok 31 karakter).
   ========================================================================== */
(function () {
  const App = window.App;
  const DXF = (App.dxf = {});
  DXF.version = '1.0';
  DXF.MIME = 'application/dxf';
  DXF.lastWarnings = [];
  DXF.lastStats = { entities: 0, skipped: 0 };

  // AutoCAD indeks renkleri (ACI)
  DXF.LAYER_PALETTE = {
    RED: 1, YELLOW: 2, GREEN: 3, CYAN: 4, BLUE: 5, MAGENTA: 6, WHITE: 7,   // 7: koyu zeminde beyaz, açık zeminde siyah
    GRAY: 8, LIGHT_GRAY: 9, ORANGE: 30, GOLD: 40, AZURE: 150, DARK_GRAY: 250,
  };

  const LTYPES = ['CONTINUOUS', 'DASHED', 'DASHDOT', 'CENTER'];
  const LW_VALID = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];   // 1/100 mm
  const TR_MAP = { 'ç': 'C', 'Ç': 'C', 'ğ': 'G', 'Ğ': 'G', 'ı': 'I', 'İ': 'I', 'ö': 'O', 'Ö': 'O', 'ş': 'S', 'Ş': 'S', 'ü': 'U', 'Ü': 'U' };
  const NL = '\r\n';

  /* ---------------- sayı ve metin biçimleri ---------------- */
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; };
  // gerçek sayı: üstel gösterim yok, her zaman '.' içerir
  function f4(v) {
    let s = r4(v).toFixed(4).replace(/0+$/, '');
    if (s.charAt(s.length - 1) === '.') s += '0';
    return s;
  }
  const hex = (n) => n.toString(16).toUpperCase();

  // Kat adı: ASCII büyük harf / rakam / _ / -, en çok 31 karakter
  function layerName(name) {
    let s = String(name == null ? '' : name).trim();
    if (s === '') return '0';
    s = s.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_MAP[c]).toUpperCase();
    s = s.replace(/[^A-Z0-9_\-]/g, '_').slice(0, 31);
    return s === '' ? '0' : s;
  }

  // Metin kaçışı: [token,...]; her token bölünmez bir kaçış ya da tek karakter
  function textTokens(str, mtext) {
    const out = [];
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      const c = s.charAt(i);
      if (c === '\r') { if (s.charAt(i + 1) === '\n') continue; }
      if (c === '\n' || c === '\r') { out.push(mtext ? '\\P' : ' '); continue; }
      if (c === '\t') { out.push(' '); continue; }
      if (code < 32 || code === 127) { out.push(' '); continue; }
      if (code >= 0xD800 && code <= 0xDFFF) { if (code <= 0xDBFF) i++; out.push('?'); continue; }   // vekil çift (ASCII dışı, 4 haneli kaçışa sığmaz)
      if (c === '\\') { out.push(mtext ? '\\\\' : '\\U+005C'); continue; }
      if (c === '%' || c === '^') { out.push('\\U+' + ('0000' + code.toString(16).toUpperCase()).slice(-4)); continue; }   // %%d, ^I gibi denetim dizileri tetiklenmesin
      if (mtext && (c === '{' || c === '}')) { out.push('\\' + c); continue; }
      if (code > 126) { out.push('\\U+' + ('0000' + code.toString(16).toUpperCase()).slice(-4)); continue; }
      out.push(c);
    }
    return out;
  }
  // 255 karakter sınırı (grup değeri); kaçışı ortadan bölmeden
  function packTokens(tokens, limit) {
    let s = '';
    for (let i = 0; i < tokens.length; i++) { if (s.length + tokens[i].length > limit) return { s: s, cut: true }; s += tokens[i]; }
    return { s: s, cut: false };
  }
  function chunkTokens(tokens, limit) {
    const chunks = [];
    let cur = '';
    tokens.forEach((t) => { if (cur.length + t.length > limit) { chunks.push(cur); cur = ''; } cur += t; });
    chunks.push(cur);
    return chunks;
  }
  // geri çözüm (ayrıştırıcı için)
  function unescapeText(s) {
    return String(s).replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\P/g, '\n').replace(/\\([\\{}])/g, '$1');
  }

  /* ---------------- geometri yardımcıları ---------------- */
  // Çokgenin içinde bir nokta (HATCH tohum noktası): tarama çizgisi, en geniş aralığın ortası
  function interiorPoint(pts) {
    const ys = Array.from(new Set(pts.map((p) => p[1]))).sort((a, b) => a - b);
    let best = null, bw = -1;
    for (let k = 0; k + 1 < ys.length; k++) {
      const y = (ys[k] + ys[k + 1]) / 2;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        const w = xs[j + 1] - xs[j];
        if (w > bw) { bw = w; best = [(xs[j] + xs[j + 1]) / 2, y]; }
      }
    }
    if (best) return best;
    let sx = 0, sy = 0;
    pts.forEach((p) => { sx += p[0]; sy += p[1]; });
    return [sx / pts.length, sy / pts.length];
  }
  // HATCH desenleri: açı, taban aralık (mm, AutoCAD ANSI tanımı)
  const PATTERNS = {
    ANSI31: { base: 3.175, lines: [45] },
    ANSI37: { base: 3.175, lines: [45, 135] },
  };

  /* ---------------- ana üretici ---------------- */
  function build(doc) {
    doc = doc || {};
    const warnings = [];
    const warn = (m) => warnings.push(m);
    const scale = isNum(Number(doc.scale)) && Number(doc.scale) > 0 ? Number(doc.scale) : 1;
    const units = doc.units === 'mm' ? 'mm' : 'm';
    const uf = Math.max(units === 'mm' ? 1000 : 1, scale);               // çizgi tipi / desen / nokta boyutu için birim çarpanı (metre = 1)
    const insUnits = uf === 1000 ? 4 : (uf === 100 ? 5 : (units === 'mm' ? 4 : 6));
    const S = (v) => v * scale;

    /* ---- tutamaç sayacı ---- */
    let hn = 0;
    const H = () => hex(++hn);

    /* ---- kat tanımları ---- */
    const layers = {};               // temiz ad → tanım
    const layerOrder = ['0'];
    layers['0'] = { name: '0', color: 7, ltype: 'CONTINUOUS', lw: null, label: '', off: false, plot: true };
    const rawLayers = doc.layers && typeof doc.layers === 'object' ? doc.layers : {};
    Object.keys(rawLayers).forEach((raw) => {
      const d = rawLayers[raw] || {};
      const nm = layerName(raw);
      if (layers[nm] && layers[nm].fromDoc) { warn('Kat adı çakışması (' + raw + ' → ' + nm + '): ilk tanım korundu.'); return; }
      let color = Math.round(Number(d.color));
      if (!(color >= 1 && color <= 255)) color = 7;
      let lt = String(d.ltype || 'CONTINUOUS').toUpperCase();
      if (LTYPES.indexOf(lt) < 0) { warn('Bilinmeyen çizgi tipi (' + d.ltype + ') kat ' + nm + ': CONTINUOUS kullanıldı.'); lt = 'CONTINUOUS'; }
      let lw = null;
      if (isNum(Number(d.lw)) && d.lw !== null && d.lw !== '' && Number(d.lw) >= 0) {
        const t = Number(d.lw) * 100;
        lw = LW_VALID.reduce((b, v) => (Math.abs(v - t) < Math.abs(b - t) ? v : b), LW_VALID[0]);
      }
      if (!layers[nm]) layerOrder.push(nm);
      layers[nm] = { name: nm, color: color, ltype: lt, lw: lw, label: d.label ? String(d.label) : '', off: !!d.off, plot: d.plot !== false, fromDoc: true };
    });
    function useLayer(raw, what) {
      const nm = layerName(raw);
      if (!layers[nm]) {
        layers[nm] = { name: nm, color: 7, ltype: 'CONTINUOUS', lw: null, label: '', off: false, plot: true };
        layerOrder.push(nm);
        warn('Tanımsız kat (' + (raw == null ? '' : raw) + ') ' + what + ': varsayılan kat oluşturuldu (' + nm + ').');
      }
      return nm;
    }

    /* ---- kapsam ---- */
    const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x, y) => { if (x < ext.x0) ext.x0 = x; if (x > ext.x1) ext.x1 = x; if (y < ext.y0) ext.y0 = y; if (y > ext.y1) ext.y1 = y; };

    /* ---- sabit tutamaçlar (tablo başlıkları, blok kayıtları, kök sözlük) ---- */
    const hVport = H(), hLtype = H(), hLayer = H(), hStyle = H(), hAppid = H(), hBlockRec = H();
    const hRecModel = H(), hRecPaper = H();
    const hBlkModel = H(), hEndModel = H(), hBlkPaper = H(), hEndPaper = H();
    const hRootDict = H(), hGroupDict = H();
    const hVportActive = H();
    const hLtypeRec = {};
    ['BYBLOCK', 'BYLAYER'].concat(LTYPES).forEach((n) => { hLtypeRec[n] = H(); });
    const hStyleStd = H();
    const hAppAcad = H();
    const hAppLayerStd = H();   // yalnızca etiket varsa yazılır (tutamaç yine de ayrılır)
    const hLayerRec = {};       // kat kayıt tutamaçları, tanımsız katlar eklendikten sonra ayrılır

    /* ---- varlıklar ---- */
    const E = [];                    // varlık grup çiftleri
    const push = (code, val) => { E.push([code, val]); };
    const hatchBuf = [];
    let nEnt = 0, nSkip = 0;

    function head(type, layer, color, buf) {
      const b = buf || E;
      b.push([0, type], [5, H()], [330, hRecModel], [100, 'AcDbEntity'], [8, layer]);
      if (color != null) b.push([62, color]);
    }
    function entColor(e) {
      const c = Math.round(Number(e.color));
      return c >= 1 && c <= 255 && isFinite(c) ? c : null;
    }
    // [x,y] dizisini doğrula → ölçekli yuvarlanmış çift ya da null
    function pt(p) {
      if (!Array.isArray(p) || p.length < 2) return null;
      const x = Number(p[0]), y = Number(p[1]);
      if (p[0] === null || p[1] === null || !isFinite(x) || !isFinite(y)) return null;
      if (Math.abs(x * scale) > 1e12 || Math.abs(y * scale) > 1e12) return null;
      return [r4(S(x)), r4(S(y))];
    }
    function ptList(arr) {
      if (!Array.isArray(arr)) return null;
      const out = [];
      for (let i = 0; i < arr.length; i++) { const p = pt(arr[i]); if (!p) return null; out.push(p); }
      return out;
    }

    const ents = Array.isArray(doc.entities) ? doc.entities : [];
    ents.forEach((e, idx) => {
      const tag = 'varlık #' + idx + (e && e.kind ? ' (' + e.kind + ')' : '');
      if (!e || typeof e !== 'object') { warn('Geçersiz ' + tag + ' atlandı.'); nSkip++; return; }
      const kind = String(e.kind || '').toLowerCase();
      const color = entColor(e);
      const num = (v) => (v === null || v === '' || v === undefined ? NaN : Number(v));
      let lay;
      const bad = (why) => { warn(tag + ' atlandı: ' + why); nSkip++; };
      const ok = () => { nEnt++; };

      if (kind === 'line') {
        const p = ptList(e.pts);
        if (!p || p.length < 2) return bad('geçersiz koordinat (NaN/Infinity) ya da 2\'den az nokta');
        lay = useLayer(e.layer, tag);
        head('LINE', lay, color);
        push(100, 'AcDbLine'); push(10, p[0][0]); push(20, p[0][1]); push(30, 0); push(11, p[1][0]); push(21, p[1][1]); push(31, 0);
        grow(p[0][0], p[0][1]); grow(p[1][0], p[1][1]); ok();
      } else if (kind === 'poly') {
        let p = ptList(e.pts);
        if (!p || p.length < 2) return bad('geçersiz koordinat (NaN/Infinity) ya da 2\'den az nokta');
        const closed = !!e.closed;
        if (closed && p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
        if (closed && p.length < 3) return bad('kapalı çokgen için en az 3 nokta gerekir');
        const w = num(e.width);
        lay = useLayer(e.layer, tag);
        head('LWPOLYLINE', lay, color);
        push(100, 'AcDbPolyline'); push(90, p.length); push(70, closed ? 1 : 0);
        if (w > 0) push(43, r4(S(w)));
        p.forEach((q) => { push(10, q[0]); push(20, q[1]); grow(q[0], q[1]); });
        ok();
      } else if (kind === 'text' || kind === 'mtext') {
        const p = pt(e.at);
        if (!p) return bad('geçersiz konum (NaN/Infinity)');
        let h = num(e.h); if (e.h === undefined) h = 0.25;
        if (!(h > 0) || !isFinite(h)) return bad('geçersiz yazı yüksekliği');
        h = r4(S(h)); if (h <= 0) h = 0.0001;
        const rot = e.rot === undefined || e.rot === null ? 0 : num(e.rot);
        if (!isFinite(rot)) return bad('geçersiz dönüş açısı');
        const tokens = textTokens(e.text, kind === 'mtext');
        const plain = tokens.join('');
        if (plain.replace(/\\P|\s/g, '') === '') return bad('boş metin');
        const align = String(e.align || 'left').toLowerCase();
        lay = useLayer(e.layer, tag);
        const nChars = String(e.text == null ? '' : e.text).split(/\r?\n/).reduce((m, l) => Math.max(m, l.length), 0);
        const wEst = h * 0.62 * nChars;
        if (kind === 'text') {
          const hz = align === 'center' ? 1 : (align === 'right' ? 2 : 0);
          const va = String(e.valign || 'baseline').toLowerCase();
          const vz = va === 'middle' ? 2 : (va === 'top' ? 3 : (va === 'bottom' ? 1 : 0));
          const pk = packTokens(tokens, 250);
          if (pk.cut) warn(tag + ': metin 250 karaktere kısaltıldı.');
          head('TEXT', lay, color);
          push(100, 'AcDbText'); push(10, p[0]); push(20, p[1]); push(30, 0); push(40, h); push(1, pk.s);
          if (rot) push(50, r4(rot));
          push(72, hz);
          if (hz || vz) { push(11, p[0]); push(21, p[1]); push(31, 0); }
          push(100, 'AcDbText'); push(73, vz);
          const x0 = hz === 1 ? p[0] - wEst / 2 : (hz === 2 ? p[0] - wEst : p[0]);
          grow(x0, p[1] - (vz === 2 ? h / 2 : 0)); grow(x0 + wEst, p[1] + h);
        } else {
          const w = e.w === undefined || e.w === null ? 0 : num(e.w);
          if (!isFinite(w) || w < 0) return bad('geçersiz metin kutusu genişliği');
          const ap = align === 'center' ? 2 : (align === 'right' ? 3 : 1);   // üst-sol/orta/sağ
          const chunks = chunkTokens(tokens, 250);
          head('MTEXT', lay, color);
          push(100, 'AcDbMText'); push(10, p[0]); push(20, p[1]); push(30, 0); push(40, h);
          if (w > 0) push(41, r4(S(w)));
          push(71, ap); push(72, 1);
          for (let k = 0; k < chunks.length - 1; k++) push(3, chunks[k]);
          push(1, chunks[chunks.length - 1]);
          if (rot) push(50, r4(rot));
          const lines = plain.split('\\P').length;
          const ww = w > 0 ? S(w) : wEst;
          const x0 = ap === 2 ? p[0] - ww / 2 : (ap === 3 ? p[0] - ww : p[0]);
          grow(x0, p[1] - h * 1.4 * lines); grow(x0 + ww, p[1]);
        }
        ok();
      } else if (kind === 'circle' || kind === 'arc') {
        const p = pt(e.at);
        const r = num(e.r);
        if (!p || !isFinite(r) || !(r > 0) || Math.abs(r * scale) > 1e12) return bad('geçersiz merkez/yarıçap');
        const R = r4(S(r));
        if (R <= 0) return bad('yarıçap çok küçük');
        lay = useLayer(e.layer, tag);
        if (kind === 'circle') {
          head('CIRCLE', lay, color);
          push(100, 'AcDbCircle'); push(10, p[0]); push(20, p[1]); push(30, 0); push(40, R);
          grow(p[0] - R, p[1] - R); grow(p[0] + R, p[1] + R);
        } else {
          const a0 = num(e.a0), a1 = num(e.a1);
          if (!isFinite(a0) || !isFinite(a1)) return bad('geçersiz yay açıları');
          const n360 = (a) => ((a % 360) + 360) % 360;
          const A0 = n360(a0), A1 = n360(a1);
          head('ARC', lay, color);
          push(100, 'AcDbCircle'); push(10, p[0]); push(20, p[1]); push(30, 0); push(40, R);
          push(100, 'AcDbArc'); push(50, r4(A0)); push(51, r4(A1));
          // yayın gerçek sınır kutusu: uç noktalar + çeyrek noktaları
          const rad = (d) => d * Math.PI / 180;
          grow(p[0] + R * Math.cos(rad(A0)), p[1] + R * Math.sin(rad(A0)));
          grow(p[0] + R * Math.cos(rad(A1)), p[1] + R * Math.sin(rad(A1)));
          const span = n360(A1 - A0) || 360;
          [0, 90, 180, 270].forEach((q) => { if (n360(q - A0) <= span) grow(p[0] + R * Math.cos(rad(q)), p[1] + R * Math.sin(rad(q))); });
        }
        ok();
      } else if (kind === 'point') {
        const p = pt(e.at);
        if (!p) return bad('geçersiz konum (NaN/Infinity)');
        lay = useLayer(e.layer, tag);
        head('POINT', lay, color);
        push(100, 'AcDbPoint'); push(10, p[0]); push(20, p[1]); push(30, 0);
        grow(p[0], p[1]); ok();
      } else if (kind === 'hatch') {
        let p = ptList(e.pts);
        if (!p) return bad('geçersiz koordinat (NaN/Infinity)');
        if (p.length > 3 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p = p.slice(0, -1);
        if (p.length < 3) return bad('tarama sınırı için en az 3 nokta gerekir');
        let pat = String(e.pattern || 'SOLID').toUpperCase();
        if (pat !== 'SOLID' && !PATTERNS[pat]) { warn(tag + ': bilinmeyen tarama deseni (' + e.pattern + '), SOLID kullanıldı.'); pat = 'SOLID'; }
        const sc = e.scale === undefined || e.scale === null ? 1 : num(e.scale);
        if (!(sc > 0) || !isFinite(sc)) return bad('geçersiz tarama ölçeği');
        lay = useLayer(e.layer, tag);
        const b = hatchBuf;
        head('HATCH', lay, color, b);
        b.push([100, 'AcDbHatch'], [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1]);
        b.push([2, pat], [70, pat === 'SOLID' ? 1 : 0], [71, 0]);
        b.push([91, 1], [92, 3], [72, 0], [73, 1], [93, p.length]);   // 92: 1 dış sınır + 2 polyline tipi
        p.forEach((q) => { b.push([10, q[0]], [20, q[1]]); grow(q[0], q[1]); });
        b.push([97, 0], [75, 0], [76, 1]);
        if (pat !== 'SOLID') {
          const def = PATTERNS[pat];
          const spacing = 0.1 * sc * uf;                 // çizgi aralığı: 0.1 m × ölçek
          const k = spacing / def.base;                  // AutoCAD'in kendi desen kütüphanesine göre ölçek (41)
          b.push([52, 0], [41, Math.round(k * 1e6) / 1e6], [77, 0], [78, def.lines.length]);
          def.lines.forEach((ang) => {
            const a = ang * Math.PI / 180;
            b.push([53, ang], [43, 0], [44, 0], [45, r4(-spacing * Math.sin(a))], [46, r4(spacing * Math.cos(a))], [79, 0]);   // ofset DXF'te döndürülmüş (WCS) çerçevede
          });
        }
        const sp = interiorPoint(p);
        b.push([98, 1], [10, r4(sp[0])], [20, r4(sp[1])]);
        ok();
      } else {
        bad('bilinmeyen tür');
      }
    });
    const bodyEntities = hatchBuf.concat(E);

    /* ---- kat kayıt tutamaçları (tüm katlar belli olduktan sonra) ---- */
    layerOrder.forEach((n) => { hLayerRec[n] = H(); });
    const usedLabelApp = layerOrder.some((n) => layers[n].label);

    /* ---- kapsam ---- */
    let x0 = ext.x0, y0 = ext.y0, x1 = ext.x1, y1 = ext.y1;
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const vh = Math.max((y1 - y0) * 1.1, (x1 - x0) * 1.1 / 1.5, 1e-3);

    /* ---- grup çiftlerini sırayla topla ---- */
    const out = [];
    const o = (code, val) => { out.push([code, val]); };

    // yorum (999) dosya başında geçerlidir
    const titleAscii = String(doc.title || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => (c === c.toLowerCase() || c === 'ı' ? TR_MAP[c].toLowerCase() : TR_MAP[c])).replace(/[^\x20-\x7E]/g, '').slice(0, 120).trim();
    o(999, 'archtools App.dxf' + (titleAscii ? ' - ' + titleAscii : ''));

    /* HEADER (HANDSEED sonda bilinir; yer tutucu sonradan doldurulur) */
    o(0, 'SECTION'); o(2, 'HEADER');
    o(9, '$ACADVER'); o(1, 'AC1015');
    o(9, '$HANDSEED'); const seedIdx = out.length; o(5, '0');
    o(9, '$INSBASE'); o(10, 0); o(20, 0); o(30, 0);
    o(9, '$EXTMIN'); o(10, r4(x0)); o(20, r4(y0)); o(30, 0);
    o(9, '$EXTMAX'); o(10, r4(x1)); o(20, r4(y1)); o(30, 0);
    o(9, '$LIMMIN'); o(10, r4(x0)); o(20, r4(y0));
    o(9, '$LIMMAX'); o(10, r4(x1)); o(20, r4(y1));
    o(9, '$LTSCALE'); o(40, 1);
    o(9, '$PDMODE'); o(70, 3);
    o(9, '$PDSIZE'); o(40, r4(0.15 * uf));
    o(9, '$LWDISPLAY'); o(70, 1);
    o(9, '$TEXTSTYLE'); o(7, 'STANDARD');
    o(9, '$CLAYER'); o(8, '0');
    o(9, '$CELTYPE'); o(6, 'BYLAYER');
    o(9, '$CECOLOR'); o(62, 256);
    o(9, '$LUNITS'); o(70, 2);
    o(9, '$LUPREC'); o(70, 4);
    o(9, '$AUNITS'); o(70, 0);
    o(9, '$AUPREC'); o(70, 2);
    o(9, '$MEASUREMENT'); o(70, 1);
    o(9, '$INSUNITS'); o(70, insUnits);
    o(9, '$TILEMODE'); o(70, 1);
    o(9, '$DWGCODEPAGE'); o(3, 'ANSI_1252');
    o(0, 'ENDSEC');

    /* TABLES */
    o(0, 'SECTION'); o(2, 'TABLES');

    // VPORT — açılışta kapsama yakınlaştırır
    o(0, 'TABLE'); o(2, 'VPORT'); o(5, hVport); o(330, 0); o(100, 'AcDbSymbolTable'); o(70, 1);
    o(0, 'VPORT'); o(5, hVportActive); o(330, hVport); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbViewportTableRecord');
    o(2, '*ACTIVE'); o(70, 0);
    o(10, 0); o(20, 0); o(11, 1); o(21, 1);
    o(12, r4(cx)); o(22, r4(cy));
    o(13, 0); o(23, 0); o(14, 1); o(24, 1); o(15, 0); o(25, 0);
    o(16, 0); o(26, 0); o(36, 1); o(17, 0); o(27, 0); o(37, 0);
    o(40, r4(vh)); o(41, 1.5); o(42, 50); o(43, 0); o(44, 0); o(50, 0); o(51, 0);
    o(71, 0); o(72, 100); o(73, 1); o(74, 3); o(75, 0); o(76, 0); o(77, 0); o(78, 0);
    o(0, 'ENDTAB');

    // LTYPE — desen uzunlukları çizim biriminde (metre çizimi için tanımlı, uf ile çarpılır)
    const LT_DEF = {
      CONTINUOUS: { desc: 'Solid line', el: [] },
      DASHED: { desc: 'Dashed __ __ __ __', el: [0.25, -0.125] },
      DASHDOT: { desc: 'Dash dot __ . __ . __ .', el: [0.25, -0.0625, 0, -0.0625] },
      CENTER: { desc: 'Center ____ _ ____ _ ____', el: [0.5, -0.125, 0.125, -0.125] },
    };
    o(0, 'TABLE'); o(2, 'LTYPE'); o(5, hLtype); o(330, 0); o(100, 'AcDbSymbolTable'); o(70, 6);
    [['BYBLOCK', 'Solid line'], ['BYLAYER', 'Solid line']].forEach((a) => {
      o(0, 'LTYPE'); o(5, hLtypeRec[a[0]]); o(330, hLtype); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbLinetypeTableRecord');
      o(2, a[0]); o(70, 0); o(3, a[1]); o(72, 65); o(73, 0); o(40, 0);
    });
    LTYPES.forEach((n) => {
      const d = LT_DEF[n];
      const el = d.el.map((v) => r4(v * uf));
      const total = el.reduce((s, v) => s + Math.abs(v), 0);
      o(0, 'LTYPE'); o(5, hLtypeRec[n]); o(330, hLtype); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbLinetypeTableRecord');
      o(2, n); o(70, 0); o(3, d.desc); o(72, 65); o(73, el.length); o(40, r4(total));
      el.forEach((v) => { o(49, v); o(74, 0); });
    });
    o(0, 'ENDTAB');

    // LAYER
    o(0, 'TABLE'); o(2, 'LAYER'); o(5, hLayer); o(330, 0); o(100, 'AcDbSymbolTable'); o(70, layerOrder.length);
    layerOrder.forEach((n) => {
      const L = layers[n];
      o(0, 'LAYER'); o(5, hLayerRec[n]); o(330, hLayer); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbLayerTableRecord');
      o(2, n); o(70, 0); o(62, L.off ? -L.color : L.color); o(6, L.ltype);
      if (!L.plot) o(290, 0);
      if (L.lw !== null) o(370, L.lw);
      if (L.label) {
        o(1001, 'AcAecLayerStandard'); o(1000, ''); o(1000, packTokens(textTokens(L.label, false), 250).s);
      }
    });
    o(0, 'ENDTAB');

    // STYLE — TrueType (arial.ttf): Türkçe harfler SHX yazı tiplerinde bulunmaz
    o(0, 'TABLE'); o(2, 'STYLE'); o(5, hStyle); o(330, 0); o(100, 'AcDbSymbolTable'); o(70, 1);
    o(0, 'STYLE'); o(5, hStyleStd); o(330, hStyle); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbTextStyleTableRecord');
    o(2, 'STANDARD'); o(70, 0); o(40, 0); o(41, 1); o(50, 0); o(71, 0); o(42, 0.2); o(3, 'arial.ttf');
    o(1001, 'ACAD'); o(1000, 'Arial'); o(1071, 0);
    o(0, 'ENDTAB');

    // APPID
    o(0, 'TABLE'); o(2, 'APPID'); o(5, hAppid); o(330, 0); o(100, 'AcDbSymbolTable'); o(70, usedLabelApp ? 2 : 1);
    o(0, 'APPID'); o(5, hAppAcad); o(330, hAppid); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbRegAppTableRecord'); o(2, 'ACAD'); o(70, 0);
    if (usedLabelApp) { o(0, 'APPID'); o(5, hAppLayerStd); o(330, hAppid); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbRegAppTableRecord'); o(2, 'AcAecLayerStandard'); o(70, 0); }
    o(0, 'ENDTAB');

    // BLOCK_RECORD
    o(0, 'TABLE'); o(2, 'BLOCK_RECORD'); o(5, hBlockRec); o(330, 0); o(100, 'AcDbSymbolTable'); o(70, 2);
    o(0, 'BLOCK_RECORD'); o(5, hRecModel); o(330, hBlockRec); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbBlockTableRecord'); o(2, '*Model_Space');
    o(0, 'BLOCK_RECORD'); o(5, hRecPaper); o(330, hBlockRec); o(100, 'AcDbSymbolTableRecord'); o(100, 'AcDbBlockTableRecord'); o(2, '*Paper_Space');
    o(0, 'ENDTAB');
    o(0, 'ENDSEC');

    /* BLOCKS */
    o(0, 'SECTION'); o(2, 'BLOCKS');
    o(0, 'BLOCK'); o(5, hBlkModel); o(330, hRecModel); o(100, 'AcDbEntity'); o(8, '0'); o(100, 'AcDbBlockBegin');
    o(2, '*Model_Space'); o(70, 0); o(10, 0); o(20, 0); o(30, 0); o(3, '*Model_Space');
    o(0, 'ENDBLK'); o(5, hEndModel); o(330, hRecModel); o(100, 'AcDbEntity'); o(8, '0'); o(100, 'AcDbBlockEnd');
    o(0, 'BLOCK'); o(5, hBlkPaper); o(330, hRecPaper); o(100, 'AcDbEntity'); o(67, 1); o(8, '0'); o(100, 'AcDbBlockBegin');
    o(2, '*Paper_Space'); o(70, 0); o(10, 0); o(20, 0); o(30, 0); o(3, '*Paper_Space');
    o(0, 'ENDBLK'); o(5, hEndPaper); o(330, hRecPaper); o(100, 'AcDbEntity'); o(67, 1); o(8, '0'); o(100, 'AcDbBlockEnd');
    o(0, 'ENDSEC');

    /* ENTITIES */
    o(0, 'SECTION'); o(2, 'ENTITIES');
    bodyEntities.forEach((g) => out.push(g));
    o(0, 'ENDSEC');

    /* OBJECTS */
    o(0, 'SECTION'); o(2, 'OBJECTS');
    o(0, 'DICTIONARY'); o(5, hRootDict); o(330, 0); o(100, 'AcDbDictionary'); o(281, 1); o(3, 'ACAD_GROUP'); o(350, hGroupDict);
    o(0, 'DICTIONARY'); o(5, hGroupDict); o(330, hRootDict); o(100, 'AcDbDictionary'); o(281, 1);
    o(0, 'ENDSEC');
    o(0, 'EOF');

    out[seedIdx][1] = hex(hn + 1);   // $HANDSEED: kullanılan en büyük tutamaçtan büyük

    /* ---- metne çevir ---- */
    const lines = [];
    out.forEach((g) => {
      const code = String(g[0]);
      lines.push(('   ' + code).slice(-Math.max(3, code.length)));
      const v = g[1];
      lines.push(typeof v === 'number' ? (isInt(g[0]) || isHandleCode(g[0]) ? String(v) : f4(v)) : String(v));
    });
    DXF.lastWarnings = warnings;
    DXF.lastStats = { entities: nEnt, skipped: nSkip };
    return lines.join(NL) + NL;
  }

  /* ---------------- grup kodu türleri ---------------- */
  function isInt(c) {
    return (c >= 60 && c <= 79) || (c >= 90 && c <= 99) || (c >= 170 && c <= 179) || (c >= 270 && c <= 289) ||
      (c >= 370 && c <= 389) || (c >= 400 && c <= 409) || (c >= 1060 && c <= 1071);
  }
  function isHandleCode(c) { return c === 5 || c === 105 || (c >= 320 && c <= 369) || (c >= 390 && c <= 399) || c === 480 || c === 481 || c === 1005; }
  function isFloatCode(c) { return (c >= 10 && c <= 59) || (c >= 110 && c <= 149) || (c >= 210 && c <= 239) || (c >= 460 && c <= 469) || (c >= 1010 && c <= 1059); }

  /* ---------------- küçük okuyucu (test / gidiş-dönüş) ---------------- */
  // → { layers, counts, entities, handlesUnique, extMin, extMax, header, problems }
  function parse(text) {
    const problems = [];
    const res = { layers: [], counts: {}, entities: [], handlesUnique: true, extMin: null, extMax: null, header: {}, problems: problems, tables: {}, blocks: [] };
    const raw = String(text).split(/\r?\n/);
    if (raw.length && raw[raw.length - 1] === '') raw.pop();
    if (raw.length % 2) problems.push('Satır sayısı tek (grup çifti bozuk): ' + raw.length);
    if (/[^\x00-\x7F]/.test(String(text))) problems.push('Dosya saf ASCII değil.');
    const pairs = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      if (!/^\s*-?\d+\s*$/.test(raw[i])) { problems.push('Satır ' + (i + 1) + ': grup kodu tamsayı değil (' + JSON.stringify(raw[i]) + ')'); continue; }
      const c = parseInt(raw[i], 10);
      const s = raw[i + 1];
      if (isInt(c) && !/^\s*-?\d+\s*$/.test(s)) problems.push('Satır ' + (i + 2) + ': ' + c + ' için tamsayı bekleniyordu (' + JSON.stringify(s) + ')');
      if (isFloatCode(c) && !/^\s*-?\d+(\.\d+)?\s*$/.test(s)) problems.push('Satır ' + (i + 2) + ': ' + c + ' için gerçek sayı bekleniyordu (' + JSON.stringify(s) + ')');
      if (isHandleCode(c) && !/^[0-9A-F]+$/.test(s.trim())) problems.push('Satır ' + (i + 2) + ': ' + c + ' için onaltılık tutamaç bekleniyordu (' + JSON.stringify(s) + ')');
      pairs.push({ c: c, v: s, n: i + 1 });
    }
    // 999 yorumlarını ele
    const P = pairs.filter((p) => p.c !== 999);
    if (!P.length || P[P.length - 1].c !== 0 || P[P.length - 1].v !== 'EOF') problems.push('Dosya 0/EOF ile bitmiyor.');

    // bölümlere ayır
    const sections = [];
    let cur = null;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.c === 0 && p.v === 'SECTION') { const nm = P[i + 1]; cur = { name: nm && nm.c === 2 ? nm.v : '?', items: [] }; sections.push(cur); i++; continue; }
      if (p.c === 0 && p.v === 'ENDSEC') { cur = null; continue; }
      if (p.c === 0 && p.v === 'EOF') { if (cur) problems.push('EOF öncesi ENDSEC eksik.'); continue; }
      if (!cur) { problems.push('Bölüm dışı grup (satır ' + p.n + ')'); continue; }
      cur.items.push(p);
    }
    const names = sections.map((s) => s.name);
    const want = ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'];
    if (names.join(',') !== want.join(',')) problems.push('Bölüm sırası beklenenden farklı: ' + names.join(','));
    const sec = {};
    sections.forEach((s) => { sec[s.name] = s; });

    // nesneleri (0 ile başlayan kayıtlar) çıkar
    function records(items) {
      const recs = [];
      let r = null;
      items.forEach((p) => {
        if (p.c === 0) { r = { type: p.v, g: [], n: p.n }; recs.push(r); } else if (r) r.g.push([p.c, p.v]);
        else problems.push('Kayıt başlamadan grup (satır ' + p.n + ')');
      });
      return recs;
    }
    const first = (r, c) => { const x = r.g.find((q) => q[0] === c); return x ? x[1] : undefined; };
    const all = (r, c) => r.g.filter((q) => q[0] === c).map((q) => q[1]);
    const fl = (s) => parseFloat(s);

    // HEADER
    if (sec.HEADER) {
      let key = null;
      sec.HEADER.items.forEach((p) => {
        if (p.c === 9) { key = p.v; res.header[key] = {}; } else if (key) { const h = res.header[key]; (h[p.c] = h[p.c] || []).push(p.v); }
      });
      const hv = (k, c) => (res.header[k] && res.header[k][c] ? res.header[k][c][0] : undefined);
      if (hv('$ACADVER', 1) !== 'AC1015') problems.push('$ACADVER AC1015 değil.');
      if (hv('$EXTMIN', 10) !== undefined) res.extMin = [fl(hv('$EXTMIN', 10)), fl(hv('$EXTMIN', 20))];
      if (hv('$EXTMAX', 10) !== undefined) res.extMax = [fl(hv('$EXTMAX', 10)), fl(hv('$EXTMAX', 20))];
      res.insUnits = hv('$INSUNITS', 70) === undefined ? undefined : parseInt(hv('$INSUNITS', 70), 10);
      res.handSeed = hv('$HANDSEED', 5);
    } else problems.push('HEADER yok.');

    // TABLES
    const handles = {};     // tutamaç → tür
    const handleList = [];
    const refs = [];        // [kod, değer, bağlam]
    function takeHandles(r, ctx) {
      r.g.forEach((q) => {
        if (q[0] === 5 || q[0] === 105) { handleList.push(q[1]); handles[q[1]] = ctx; }
        if ((q[0] >= 330 && q[0] <= 369 && q[0] !== 330) || q[0] === 330 || q[0] === 340 || q[0] === 350 || q[0] === 360) refs.push([q[0], q[1], ctx]);
      });
    }
    const ltypeNames = [], layerRecs = {}, tblHandle = {}, blockRecNames = {}, styleNames = [], appids = [];
    if (sec.TABLES) {
      const tables = [];
      let t = null;
      sec.TABLES.items.forEach((p) => {
        if (p.c === 0 && p.v === 'TABLE') { t = { name: null, items: [], n: p.n }; tables.push(t); return; }
        if (p.c === 0 && p.v === 'ENDTAB') { t = null; return; }
        if (!t) { problems.push('TABLES içinde tablo dışı grup (satır ' + p.n + ')'); return; }
        t.items.push(p);
      });
      tables.forEach((tb) => {
        const hd = [];
        let i = 0;
        for (; i < tb.items.length && tb.items[i].c !== 0; i++) hd.push(tb.items[i]);
        const nameP = hd.find((p) => p.c === 2), cntP = hd.find((p) => p.c === 70), hP = hd.find((p) => p.c === 5);
        tb.name = nameP ? nameP.v : '?';
        if (!hP) problems.push('Tablo ' + tb.name + ': tutamaç (5) yok.');
        else { handleList.push(hP.v); handles[hP.v] = 'TABLE ' + tb.name; tblHandle[tb.name] = hP.v; }
        const own = hd.find((p) => p.c === 330);
        if (!own || own.v !== '0') problems.push('Tablo ' + tb.name + ': 330 sahip 0 olmalı.');
        if (!hd.some((p) => p.c === 100 && p.v === 'AcDbSymbolTable')) problems.push('Tablo ' + tb.name + ': AcDbSymbolTable yok.');
        const recs = records(tb.items.slice(i));
        if (cntP && parseInt(cntP.v, 10) !== recs.length) problems.push('Tablo ' + tb.name + ': 70 sayısı (' + cntP.v + ') ile kayıt sayısı (' + recs.length + ') uyuşmuyor.');
        res.tables[tb.name] = recs.map((r) => first(r, 2));
        recs.forEach((r) => {
          takeHandles(r, tb.name + ':' + first(r, 2));
          const o330 = first(r, 330);
          if (o330 !== tblHandle[tb.name]) problems.push('Tablo ' + tb.name + ' kaydı ' + first(r, 2) + ': 330 sahibi tablo tutamacı değil.');
          if (!all(r, 100).includes('AcDbSymbolTableRecord')) problems.push('Tablo ' + tb.name + ' kaydı ' + first(r, 2) + ': AcDbSymbolTableRecord yok.');
          if (tb.name === 'LTYPE') ltypeNames.push(first(r, 2));
          if (tb.name === 'STYLE') styleNames.push(first(r, 2));
          if (tb.name === 'APPID') appids.push(first(r, 2));
          if (tb.name === 'BLOCK_RECORD') blockRecNames[first(r, 2)] = first(r, 5);
          if (tb.name === 'LAYER') {
            res.layers.push(first(r, 2));
            layerRecs[first(r, 2)] = { color: parseInt(first(r, 62), 10), ltype: first(r, 6), lw: first(r, 370) === undefined ? undefined : parseInt(first(r, 370), 10), label: all(r, 1000)[1] };
            if (first(r, 1001) !== undefined && !appids.includes(first(r, 1001)) && !sec.TABLES.items.some((p) => p.c === 2 && p.v === first(r, 1001))) problems.push('Kat xdata uygulaması APPID tablosunda yok: ' + first(r, 1001));
          }
        });
      });
      ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'APPID', 'BLOCK_RECORD'].forEach((n) => { if (!res.tables[n]) problems.push('Tablo yok: ' + n); });
      if (res.layers.indexOf('0') < 0) problems.push('"0" katı yok.');
      if (new Set(res.layers).size !== res.layers.length) problems.push('Kat adları tekil değil.');
      ['CONTINUOUS', 'BYLAYER', 'BYBLOCK'].forEach((n) => { if (ltypeNames.indexOf(n) < 0) problems.push('LTYPE ' + n + ' yok.'); });
      if (styleNames.indexOf('STANDARD') < 0) problems.push('STYLE STANDARD yok.');
      if (appids.indexOf('ACAD') < 0) problems.push('APPID ACAD yok.');
      ['*Model_Space', '*Paper_Space'].forEach((n) => { if (!blockRecNames[n]) problems.push('BLOCK_RECORD ' + n + ' yok.'); });
      Object.keys(layerRecs).forEach((n) => { if (ltypeNames.indexOf(layerRecs[n].ltype) < 0) problems.push('Kat ' + n + ': çizgi tipi tanımsız (' + layerRecs[n].ltype + ')'); });
    } else problems.push('TABLES yok.');
    res.layerInfo = layerRecs;

    // BLOCKS
    if (sec.BLOCKS) {
      const recs = records(sec.BLOCKS.items);
      let open = null;
      recs.forEach((r) => {
        takeHandles(r, r.type);
        if (r.type === 'BLOCK') {
          if (open) problems.push('İç içe BLOCK.');
          open = { name: first(r, 2), owner: first(r, 330) };
          res.blocks.push(open.name);
          if (blockRecNames[open.name] !== open.owner) problems.push('BLOCK ' + open.name + ': 330 sahibi BLOCK_RECORD ile eşleşmiyor.');
          if (!all(r, 100).includes('AcDbBlockBegin')) problems.push('BLOCK ' + open.name + ': AcDbBlockBegin yok.');
        } else if (r.type === 'ENDBLK') {
          if (!open) problems.push('ENDBLK eşsiz.');
          else if (first(r, 330) !== open.owner) problems.push('ENDBLK ' + open.name + ': 330 sahibi BLOCK ile eşleşmiyor.');
          if (!all(r, 100).includes('AcDbBlockEnd')) problems.push('ENDBLK: AcDbBlockEnd yok.');
          open = null;
        } else problems.push('BLOCKS içinde beklenmeyen kayıt: ' + r.type);
      });
      if (open) problems.push('BLOCK kapatılmamış.');
      ['*Model_Space', '*Paper_Space'].forEach((n) => { if (res.blocks.indexOf(n) < 0) problems.push('BLOCK ' + n + ' yok.'); });
    } else problems.push('BLOCKS yok.');

    // ENTITIES
    if (sec.ENTITIES) {
      records(sec.ENTITIES.items).forEach((r) => {
        takeHandles(r, r.type);
        const type = r.type;
        res.counts[type] = (res.counts[type] || 0) + 1;
        const subs = all(r, 100);
        const layer = first(r, 8);
        if (subs[0] !== 'AcDbEntity') problems.push(type + ' (satır ' + r.n + '): ilk 100 AcDbEntity değil.');
        if (first(r, 330) !== blockRecNames['*Model_Space']) problems.push(type + ' (satır ' + r.n + '): 330 sahibi *Model_Space değil.');
        if (res.layers.indexOf(layer) < 0) problems.push(type + ' (satır ' + r.n + '): tanımsız kat ' + layer);
        const ent = { type: type, layer: layer, handle: first(r, 5) };
        const c62 = first(r, 62); if (c62 !== undefined) ent.color = parseInt(c62, 10);
        const xy = (cx, cy, k) => [fl(all(r, cx)[k || 0]), fl(all(r, cy)[k || 0])];
        const needSub = (s) => { if (subs.indexOf(s) < 0) problems.push(type + ' (satır ' + r.n + '): ' + s + ' alt sınıfı yok.'); };
        if (type === 'LINE') { needSub('AcDbLine'); ent.pts = [xy(10, 20), xy(11, 21)]; } else if (type === 'LWPOLYLINE') {
          needSub('AcDbPolyline');
          const xs = all(r, 10), ys = all(r, 20);
          ent.pts = xs.map((x, i) => [fl(x), fl(ys[i])]);
          ent.closed = (parseInt(first(r, 70), 10) & 1) === 1;
          if (parseInt(first(r, 90), 10) !== xs.length) problems.push('LWPOLYLINE (satır ' + r.n + '): 90 köşe sayısı uyuşmuyor.');
          if (first(r, 43) !== undefined) ent.width = fl(first(r, 43));
        } else if (type === 'TEXT') {
          needSub('AcDbText');
          if (subs.filter((s) => s === 'AcDbText').length !== 2) problems.push('TEXT (satır ' + r.n + '): iki AcDbText işareti gerekir.');
          ent.at = xy(10, 20); ent.h = fl(first(r, 40)); ent.text = unescapeText(first(r, 1));
          ent.rot = first(r, 50) === undefined ? 0 : fl(first(r, 50));
          ent.halign = parseInt(first(r, 72) || '0', 10); ent.valign = parseInt(first(r, 73) || '0', 10);
          if ((ent.halign || ent.valign) && first(r, 11) === undefined) problems.push('TEXT (satır ' + r.n + '): hizalama için ikinci nokta (11) yok.');
          if (/[^\x20-\x7E]/.test(first(r, 1))) problems.push('TEXT: ASCII dışı karakter.');
        } else if (type === 'MTEXT') {
          needSub('AcDbMText');
          ent.at = xy(10, 20); ent.h = fl(first(r, 40)); ent.w = first(r, 41) === undefined ? 0 : fl(first(r, 41));
          ent.text = unescapeText(all(r, 3).join('') + first(r, 1)); ent.attach = parseInt(first(r, 71), 10);
        } else if (type === 'CIRCLE') { needSub('AcDbCircle'); ent.at = xy(10, 20); ent.r = fl(first(r, 40)); } else if (type === 'ARC') {
          needSub('AcDbCircle'); needSub('AcDbArc');
          ent.at = xy(10, 20); ent.r = fl(first(r, 40)); ent.a0 = fl(first(r, 50)); ent.a1 = fl(first(r, 51));
        } else if (type === 'POINT') { needSub('AcDbPoint'); ent.at = xy(10, 20); } else if (type === 'HATCH') {
          needSub('AcDbHatch');
          ent.pattern = first(r, 2); ent.solid = first(r, 70) === '1';
          const nv = parseInt(first(r, 93), 10);
          // sınır köşeleri: 93'ten sonraki 10/20 çiftleri (nv adet)
          const idx = r.g.findIndex((q) => q[0] === 93);
          const vs = [];
          for (let i = idx + 1; i < r.g.length && vs.length < nv; i++) if (r.g[i][0] === 10) vs.push([fl(r.g[i][1]), fl(r.g[i + 1][1])]);
          ent.pts = vs;
          if (vs.length !== nv) problems.push('HATCH (satır ' + r.n + '): 93 köşe sayısı uyuşmuyor.');
          if (parseInt(first(r, 91), 10) !== 1) problems.push('HATCH: 91 sınır yolu sayısı 1 değil.');
          const nl = first(r, 78);
          if (!ent.solid && (nl === undefined || parseInt(nl, 10) !== all(r, 53).length)) problems.push('HATCH: 78 desen çizgi sayısı uyuşmuyor.');
          if (first(r, 98) === undefined) problems.push('HATCH: tohum noktası (98) yok.');
        } else problems.push('Bilinmeyen varlık türü: ' + type);
        res.entities.push(ent);
      });
    } else problems.push('ENTITIES yok.');

    // OBJECTS
    if (sec.OBJECTS) {
      const recs = records(sec.OBJECTS.items);
      recs.forEach((r) => { takeHandles(r, r.type); });
      if (!recs.some((r) => r.type === 'DICTIONARY' && first(r, 330) === '0')) problems.push('OBJECTS: kök DICTIONARY (330=0) yok.');
      recs.forEach((r) => { if (r.type === 'DICTIONARY' && !all(r, 100).includes('AcDbDictionary')) problems.push('DICTIONARY: AcDbDictionary işareti yok.'); });
    } else problems.push('OBJECTS yok.');

    // tutamaçlar
    const uniq = new Set(handleList);
    res.handlesUnique = uniq.size === handleList.length;
    if (!res.handlesUnique) problems.push('Tutamaçlar tekil değil.');
    res.handleCount = handleList.length;
    refs.forEach((q) => { if (q[1] !== '0' && !uniq.has(q[1])) problems.push('Kırık bağlantı: ' + q[0] + ' ' + q[1] + ' (' + q[2] + ')'); });
    const maxH = handleList.reduce((m, h) => Math.max(m, parseInt(h, 16)), 0);
    if (res.handSeed === undefined || parseInt(res.handSeed, 16) <= maxH) problems.push('$HANDSEED en büyük tutamaçtan büyük olmalı.');

    // sayılar: LAYER tablosu dışındaki varlık sayacı tür adlarıyla; toplam
    res.entityCount = res.entities.length;
    return res;
  }

  /* ---------------- indirme ---------------- */
  // App.files.saveBlob(filename, blob) varsa onu kullanır (aynı dönüş: { ok, status } | { ok:false, code, message })
  function fallbackSave(filename, blob) {
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

  function save(text, filename) {
    let name = String(filename || 'cizim').replace(/[\\\/:*?"<>|\u0000-\u001F]/g, '-').trim() || 'cizim';
    if (!/\.dxf$/i.test(name)) name += '.dxf';
    const blob = new Blob([text], { type: DXF.MIME });
    const saver = App.files && App.files.saveBlob ? App.files.saveBlob : fallbackSave;
    return Promise.resolve(saver(name, blob));
  }

  DXF.build = build;
  DXF.save = save;
  DXF.parse = parse;
  DXF.layerName = layerName;
  DXF.escapeText = function (s) { return textTokens(s, false).join(''); };
  DXF.unescapeText = unescapeText;
})();
