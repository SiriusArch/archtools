/* ==========================================================================
   29-lib-xlsx.js — bağımlılıksız .xlsx (Office Open XML) üretici  ·  App.xlsx
   Çalışma kitabı nesnesi → ZIP (STORE, sıkıştırmasız) → Uint8Array.
   Excel, LibreOffice ve Numbers'ta açılır. Metinler sharedStrings, stiller tekrarsız birleştirilir.
   Formül hücreleri fullCalcOnLoad="1" ile açılışta yeniden hesaplanır.
   Kullanım:
     const bytes = App.xlsx.build({ title, author, sheets: [{ name, cols, rows, merges, freeze, autofilter, rowH, tab, print }] });
     App.xlsx.save(bytes, 'rapor.xlsx');
   hücre: string | number | boolean | Date | null | { v, f, s, t }   (f: başında '=' olmadan formül)
   stil s: { b, i, u, size, color, font, fill, fmt, align, valign, wrap, indent, border, borderColor }
   ========================================================================== */
(function () {
  const App = window.App;

  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const MAX_ROW = 1048576;     // Excel sınırları
  const MAX_COL = 16384;
  const MAX_TEXT = 32767;
  const DEF_FONT = 'Calibri';
  const DEF_SIZE = 11;

  /* ---------------- yardımcılar ---------------- */
  // 0 -> 'A', 25 -> 'Z', 26 -> 'AA'
  function colName(i) {
    let n = Math.floor(Number(i)) + 1, s = '';
    if (!(n > 0)) return 'A';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function colIndex(letters) {
    let n = 0;
    const L = String(letters).toUpperCase();
    for (let i = 0; i < L.length; i++) n = n * 26 + (L.charCodeAt(i) - 64);
    return n - 1;
  }
  // (0,0) -> 'A1'  (satır, sütun; ikisi de 0 tabanlı)
  function ref(r, c) { return colName(c) + (Math.floor(Number(r)) + 1); }
  function range(r1, c1, r2, c2) { return ref(r1, c1) + ':' + ref(r2, c2); }

  // 'A1' veya 'A1:D5' -> { r1, c1, r2, c2 } (0 tabanlı, sıralı) ya da null
  function parseRange(s) {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})(?::\$?([A-Za-z]{1,3})\$?(\d{1,7}))?$/.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    const a = colIndex(m[1]), b = Number(m[2]) - 1;
    const c = m[3] ? colIndex(m[3]) : a, d = m[4] ? Number(m[4]) - 1 : b;
    const o = { r1: Math.min(b, d), c1: Math.min(a, c), r2: Math.max(b, d), c2: Math.max(a, c) };
    if (o.r1 < 0 || o.c1 < 0 || o.r2 >= MAX_ROW || o.c2 >= MAX_COL) return null;
    return o;
  }

  // XML'de geçersiz denetim karakterlerini at, satır sonlarını \n yap, 32767'ye kırp
  function clean(s) {
    s = String(s);
    s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
    if (s.length > MAX_TEXT) {
      s = s.slice(0, MAX_TEXT);
      const last = s.charCodeAt(s.length - 1);
      if (last >= 0xD800 && last <= 0xDBFF) s = s.slice(0, -1); // yarım vekil çifti bırakma
    }
    return s;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  // yalnız nitelik/küçük metin için (kırpma gerekmez)
  function escAttr(s) { return esc(String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')); }

  function num(n) { return String(n === 0 ? 0 : n); } // -0 -> 0

  // 'FF1A1A1A' | '#1A1A1A' | '1A1A1A' | '#abc' -> 'FF1A1A1A'; geçersizse null
  function color(c) {
    if (c == null) return null;
    let s = String(c).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/./g, '$&$&');
    if (/^[0-9a-fA-F]{6}$/.test(s)) s = 'FF' + s;
    return /^[0-9a-fA-F]{8}$/.test(s) ? s.toUpperCase() : null;
  }

  // Date -> Excel seri sayısı (yerel saat bileşenleri, 1900 sistemi)
  function dateSerial(d) {
    const t = d.getTime();
    if (isNaN(t)) return NaN;
    const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    return (ms - Date.UTC(1899, 11, 30)) / 86400000;
  }

  /* ---------------- sayı biçimleri ---------------- */
  const BUILTIN_FMT = { 'General': 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '@': 49 };
  const FMT_SHORT = {
    int: '#,##0', dec: '0.00', dec1: '0.0', dec2: '#,##0.00', pct: '0%', pct1: '0.0%', pct2: '0.00%',
    tl: '#,##0 "₺"', try: '#,##0 "₺"', tl2: '#,##0.00 "₺"', m2: '#,##0.00 "m²"',
    date: 'dd.mm.yyyy', datetime: 'dd.mm.yyyy hh:mm', time: 'hh:mm', text: '@', general: 'General',
  };

  /* ---------------- stil kaydı (her derlemede yeni) ---------------- */
  function makeStyles() {
    const lists = { fonts: [], fills: [], borders: [], xfs: [] };
    const idx = { fonts: {}, fills: {}, borders: {}, xfs: {}, fmt: {} };
    const customFmts = []; // { id, code }

    function intern(kind, xml) {
      const m = idx[kind];
      if (m[xml] === undefined) { m[xml] = lists[kind].length; lists[kind].push(xml); }
      return m[xml];
    }

    function fontXml(o) {
      let x = '<font>';
      if (o.b) x += '<b/>';
      if (o.i) x += '<i/>';
      if (o.strike) x += '<strike/>';
      if (o.u) x += '<u/>';
      x += '<sz val="' + num(o.size) + '"/>';
      if (o.color) x += '<color rgb="' + o.color + '"/>';
      x += '<name val="' + escAttr(o.font) + '"/><family val="2"/></font>';
      return x;
    }
    function fillXml(rgb) {
      if (!rgb) return '<fill><patternFill patternType="none"/></fill>';
      return '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>';
    }
    const SIDES = ['left', 'right', 'top', 'bottom'];
    const BSTYLES = { thin: 1, medium: 1, thick: 1, hair: 1, dotted: 1, dashed: 1, double: 1, mediumDashed: 1, dashDot: 1 };
    // border: 'thin'|'medium'|… (dört kenar) | 'all' | 'top' | 'bottom' | 'left' | 'right' | 'bottomMedium'… | { top, bottom, left, right }
    function borderSides(b) {
      const o = { left: null, right: null, top: null, bottom: null };
      if (!b) return o;
      if (typeof b === 'object') { SIDES.forEach(function (k) { if (BSTYLES[b[k]]) o[k] = b[k]; }); return o; }
      b = String(b);
      if (b === 'all') { SIDES.forEach(function (k) { o[k] = 'thin'; }); return o; }
      if (BSTYLES[b]) { SIDES.forEach(function (k) { o[k] = b; }); return o; }
      const m = /^(left|right|top|bottom)(Medium|Thick|Hair|Double)?$/.exec(b);
      if (m) o[m[1]] = m[2] ? m[2].toLowerCase() : 'thin';
      return o;
    }
    function borderXml(sides, rgb) {
      let x = '<border>';
      SIDES.forEach(function (k) {
        x += sides[k] ? '<' + k + ' style="' + sides[k] + '"><color rgb="' + rgb + '"/></' + k + '>' : '<' + k + '/>';
      });
      return x + '<diagonal/></border>';
    }

    function numFmtId(fmt) {
      if (fmt == null || fmt === '') return 0;
      let code = String(fmt);
      if (FMT_SHORT[code] !== undefined) code = FMT_SHORT[code];
      if (BUILTIN_FMT[code] !== undefined) return BUILTIN_FMT[code];
      if (idx.fmt[code] === undefined) {
        const id = 164 + customFmts.length;
        idx.fmt[code] = id;
        customFmts.push({ id: id, code: code });
      }
      return idx.fmt[code];
    }

    // varsayılanlar önce eklenir: boş stil her zaman 0 numaralı xf'e düşer
    intern('fonts', fontXml({ size: DEF_SIZE, font: DEF_FONT }));
    intern('fills', fillXml(null));
    intern('fills', '<fill><patternFill patternType="gray125"/></fill>');
    intern('borders', borderXml(borderSides(null), 'FF000000'));

    const HALIGN = { left: 'left', center: 'center', right: 'right', justify: 'justify' };
    const VALIGN = { top: 'top', center: 'center', middle: 'center', bottom: 'bottom' };

    function xf(s) {
      s = s || {};
      const size = Number(s.size) > 0 ? Math.min(409, Number(s.size)) : DEF_SIZE;
      const fontId = intern('fonts', fontXml({ b: !!s.b, i: !!s.i, u: !!s.u, strike: !!s.strike, size: size, color: color(s.color), font: s.font ? String(s.font) : DEF_FONT }));
      const fillId = intern('fills', fillXml(color(s.fill)));
      const sides = borderSides(s.border);
      const hasB = SIDES.some(function (k) { return sides[k]; });
      const borderId = intern('borders', borderXml(sides, hasB ? (color(s.borderColor) || 'FF000000') : 'FF000000'));
      const nf = numFmtId(s.fmt);
      const h = HALIGN[s.align], v = VALIGN[s.valign], ind = Math.floor(Number(s.indent)) > 0 ? Math.min(15, Math.floor(Number(s.indent))) : 0;
      let al = '';
      if (h || v || s.wrap || ind) {
        al = '<alignment' + (h ? ' horizontal="' + h + '"' : '') + (v ? ' vertical="' + v + '"' : '') + (s.wrap ? ' wrapText="1"' : '') + (ind ? ' indent="' + ind + '"' : '') + '/>';
      }
      let x = '<xf numFmtId="' + nf + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"';
      if (nf) x += ' applyNumberFormat="1"';
      if (fontId) x += ' applyFont="1"';
      if (fillId) x += ' applyFill="1"';
      if (borderId) x += ' applyBorder="1"';
      if (al) x += ' applyAlignment="1">' + al + '</xf>'; else x += '/>';
      return intern('xfs', x);
    }
    xf({}); // 0 numaralı varsayılan xf

    function xml() {
      let x = XML_HEAD + '<styleSheet xmlns="' + NS_MAIN + '">';
      if (customFmts.length) {
        x += '<numFmts count="' + customFmts.length + '">' + customFmts.map(function (f) { return '<numFmt numFmtId="' + f.id + '" formatCode="' + escAttr(f.code) + '"/>'; }).join('') + '</numFmts>';
      }
      x += '<fonts count="' + lists.fonts.length + '">' + lists.fonts.join('') + '</fonts>';
      x += '<fills count="' + lists.fills.length + '">' + lists.fills.join('') + '</fills>';
      x += '<borders count="' + lists.borders.length + '">' + lists.borders.join('') + '</borders>';
      x += '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>';
      x += '<cellXfs count="' + lists.xfs.length + '">' + lists.xfs.join('') + '</cellXfs>';
      x += '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>';
      x += '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>';
      return x + '</styleSheet>';
    }
    return { xf: xf, xml: xml };
  }

  /* ---------------- paylaşılan metinler ---------------- */
  function makeSst() {
    const map = new Map(), list = [];
    let count = 0;
    return {
      add: function (s) {
        count++;
        if (!map.has(s)) { map.set(s, list.length); list.push(s); }
        return map.get(s);
      },
      xml: function () {
        let x = XML_HEAD + '<sst xmlns="' + NS_MAIN + '" count="' + count + '" uniqueCount="' + list.length + '">';
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          // '_x0041_' gibi diziler Excel'de kaçış sayılır: önceden kaçır
          const t = esc(s.replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_'));
          x += '<si><t' + (/^\s|\s$|\n|\t/.test(s) ? ' xml:space="preserve"' : '') + '>' + t + '</t></si>';
        }
        return x + '</sst>';
      },
    };
  }

  /* ---------------- sayfa adı ---------------- */
  function sheetNames(sheets) {
    const used = new Set(), out = [];
    sheets.forEach(function (sh, i) {
      let n = String((sh && sh.name) != null ? sh.name : '').replace(/[\[\]:*?\/\\\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
      n = n.replace(/^'+|'+$/g, '').trim();
      if (!n) n = 'Sayfa ' + (i + 1);
      n = Array.from(n).slice(0, 31).join('');
      let cand = n, k = 2;
      while (used.has(cand.toLocaleLowerCase('tr'))) {
        const suf = ' (' + k++ + ')';
        cand = Array.from(n).slice(0, 31 - suf.length).join('') + suf;
      }
      used.add(cand.toLocaleLowerCase('tr'));
      out.push(cand);
    });
    return out;
  }

  /* ---------------- hücre normalleştirme ---------------- */
  // ham hücre -> { sid, t: 's'|'n'|'b'|null, v, f } (v: sst indeksi / sayı / 0|1)
  function normCell(raw, styles, sst) {
    let v = raw, f = null, s = null, t = null;
    if (raw && typeof raw === 'object' && !(raw instanceof Date)) { v = raw.v; f = raw.f; s = raw.s; t = raw.t; }
    if (v === undefined) v = null;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) v = String(v);
    if (v instanceof Date) {
      const ser = dateSerial(v);
      const hasTime = Math.abs(ser - Math.floor(ser)) > 1e-9;
      v = ser; t = t || 'n';
      if (!s || !s.fmt) { s = Object.assign({}, s); s.fmt = hasTime ? 'datetime' : 'date'; }
    }
    let kind = null, val = null;
    if (v !== null) {
      if (t === 'b') kind = 'b';
      else if (t === 'n') kind = 'n';
      else if (t === 's') kind = 's';
      else kind = typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's';
      if (kind === 'n') {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (typeof v === 'string' && v.trim() === '') kind = null; else if (isFinite(n)) val = n; else kind = null;
      } else if (kind === 'b') {
        val = (typeof v === 'string' ? !/^(false|0|hayır|hayir|)$/i.test(v.trim()) : !!v) ? 1 : 0;
      } else {
        const str = clean(v);
        if (str === '') kind = null; else val = str;
      }
    }
    f = f == null ? '' : clean(f).replace(/^\s*=+\s*/, '').trim();
    const sid = s ? styles.xf(s) : 0;
    if (kind === 's' && !f) val = sst.add(val); // formül önbelleği metni sst'ye girmez
    return { sid: sid, kind: kind, val: val, f: f };
  }

  function cellXml(r, c, cell) {
    const a = ref(r, c) + '"' + (cell.sid ? ' s="' + cell.sid + '"' : '');
    if (cell.f) {
      let t = '', v = '';
      if (cell.kind === 'n') v = '<v>' + num(cell.val) + '</v>';
      else if (cell.kind === 'b') { t = ' t="b"'; v = '<v>' + cell.val + '</v>'; }
      else if (cell.kind === 's') { t = ' t="str"'; v = '<v>' + esc(cell.val) + '</v>'; }
      return '<c r="' + a + t + '><f>' + esc(cell.f) + '</f>' + v + '</c>';
    }
    if (cell.kind === 'n') return '<c r="' + a + '><v>' + num(cell.val) + '</v></c>';
    if (cell.kind === 'b') return '<c r="' + a + ' t="b"><v>' + cell.val + '</v></c>';
    if (cell.kind === 's') return '<c r="' + a + ' t="s"><v>' + cell.val + '</v></c>';
    return '<c r="' + a + '/>';
  }

  /* ---------------- çalışma sayfası ---------------- */
  function sheetXml(sh, index, styles, sst, filterOut) {
    sh = sh || {};
    const rowsIn = Array.isArray(sh.rows) ? sh.rows : [];
    const grid = []; // grid[r] = { c: cell }
    let maxR = 0, maxC = 0, any = false;

    for (let r = 0; r < rowsIn.length && r < MAX_ROW; r++) {
      const row = rowsIn[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length && c < MAX_COL; c++) {
        const cell = normCell(row[c], styles, sst);
        if (cell.kind === null && !cell.f && !cell.sid) continue;
        (grid[r] = grid[r] || {})[c] = cell;
        if (r > maxR) maxR = r; if (c > maxC) maxC = c; any = true;
      }
    }

    // birleştirmeler: geçerli, tek hücreden büyük, çakışmayan; sol-üst stilini bölgeye yay
    const merges = [];
    (Array.isArray(sh.merges) ? sh.merges : []).forEach(function (m) {
      const p = parseRange(m);
      if (!p || (p.r1 === p.r2 && p.c1 === p.c2)) return;
      const clash = merges.some(function (q) { return p.r1 <= q.r2 && p.r2 >= q.r1 && p.c1 <= q.c2 && p.c2 >= q.c1; });
      if (!clash) merges.push(p);
    });
    merges.forEach(function (p) {
      const tl = grid[p.r1] && grid[p.r1][p.c1];
      const sid = tl ? tl.sid : 0;
      if (sid && (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1) <= 20000) {
        for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) {
          if (r === p.r1 && c === p.c1) continue;
          const g = (grid[r] = grid[r] || {});
          if (!g[c]) g[c] = { sid: sid, kind: null, val: null, f: '' };
        }
      }
      if (p.r2 > maxR) maxR = p.r2; if (p.c2 > maxC) maxC = p.c2; any = true;
    });

    // satır yüksekliği
    const rowH = {};
    if (sh.rowH && typeof sh.rowH === 'object') {
      Object.keys(sh.rowH).forEach(function (k) {
        const r = Math.floor(Number(k)), h = Number(sh.rowH[k]);
        if (r >= 0 && r < MAX_ROW && h > 0 && isFinite(h)) { rowH[r] = Math.min(409, h); if (r > maxR) maxR = r; any = true; }
      });
    }

    // sütunlar
    let colsX = '';
    const cols = Array.isArray(sh.cols) ? sh.cols : [];
    cols.forEach(function (col, i) {
      if (!col || i >= MAX_COL) return;
      const w = Number(col.w), hidden = !!col.hidden;
      if (!(w > 0) && !hidden) return;
      const width = w > 0 ? Math.min(255, w) : 8.43;
      const stored = Math.trunc(((width * 7 + 5) / 7) * 256) / 256; // Excel: karakter genişliği + dolgu
      colsX += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + num(Math.round(stored * 100000) / 100000) + '" customWidth="1"' + (hidden ? ' hidden="1"' : '') + '/>';
    });

    // dondurma
    let pane = '';
    const fr = sh.freeze && typeof sh.freeze === 'object' ? sh.freeze : null;
    const fRow = fr ? Math.max(0, Math.floor(Number(fr.row)) || 0) : 0, fCol = fr ? Math.max(0, Math.floor(Number(fr.col)) || 0) : 0;
    if (fRow || fCol) {
      const active = fRow && fCol ? 'bottomRight' : fRow ? 'bottomLeft' : 'topRight';
      pane = '<pane' + (fCol ? ' xSplit="' + fCol + '"' : '') + (fRow ? ' ySplit="' + fRow + '"' : '') + ' topLeftCell="' + ref(fRow, fCol) + '" activePane="' + active + '" state="frozen"/>' +
        '<selection pane="' + active + '" activeCell="' + ref(fRow, fCol) + '" sqref="' + ref(fRow, fCol) + '"/>';
    }

    const tab = color(sh.tab);
    const pr = sh.print && typeof sh.print === 'object' ? sh.print : null;
    const fit = !!(pr && pr.fit);

    let x = XML_HEAD + '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '">';
    if (tab || fit) x += '<sheetPr>' + (tab ? '<tabColor rgb="' + tab + '"/>' : '') + (fit ? '<pageSetUpPr fitToPage="1"/>' : '') + '</sheetPr>';
    x += '<dimension ref="' + (any ? range(0, 0, maxR, maxC) : 'A1') + '"/>';
    x += '<sheetViews><sheetView workbookViewId="0"' + (index === 0 ? ' tabSelected="1"' : '') + (sh.grid === false ? ' showGridLines="0"' : '') + (pane ? '>' + pane + '</sheetView>' : '/>') + '</sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="15"/>';
    if (colsX) x += '<cols>' + colsX + '</cols>';

    x += '<sheetData>';
    const rs = {};
    Object.keys(grid).forEach(function (k) { rs[k] = 1; });
    Object.keys(rowH).forEach(function (k) { rs[k] = 1; });
    Object.keys(rs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      const g = grid[r] || {};
      const cs = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
      x += '<row r="' + (r + 1) + '"' + (rowH[r] ? ' ht="' + num(rowH[r]) + '" customHeight="1"' : '') + (cs.length ? '>' : '/>');
      if (cs.length) { for (let i = 0; i < cs.length; i++) x += cellXml(r, cs[i], g[cs[i]]); x += '</row>'; }
    });
    x += '</sheetData>';

    const af = sh.autofilter ? parseRange(sh.autofilter) : null;
    if (af && !(af.r1 === af.r2 && af.c1 === af.c2)) {
      const rg = range(af.r1, af.c1, af.r2, af.c2);
      x += '<autoFilter ref="' + rg + '"/>';
      filterOut.push({ index: index, ref: af });
    }
    if (merges.length) x += '<mergeCells count="' + merges.length + '">' + merges.map(function (p) { return '<mergeCell ref="' + range(p.r1, p.c1, p.r2, p.c2) + '"/>'; }).join('') + '</mergeCells>';
    x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
    if (pr) {
      const paper = { A3: 8, A4: 9, A5: 11, Letter: 1, Legal: 5 }[pr.paper] || 9;
      x += '<pageSetup paperSize="' + paper + '" orientation="' + (pr.landscape ? 'landscape' : 'portrait') + '"' + (fit ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>';
    }
    return x + '</worksheet>';
  }

  /* ---------------- ZIP (STORE) ---------------- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // files: [{ name, data: string | Uint8Array }] -> Uint8Array
  function zip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const ents = files.map(function (f) {
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      return { name: enc.encode(f.name), data: data, crc: crc32(data), off: 0 };
    });
    let size = 22;
    ents.forEach(function (e) { size += 30 + e.name.length + e.data.length + 46 + e.name.length; });
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    let p = 0;
    const u16 = function (v) { dv.setUint16(p, v, true); p += 2; };
    const u32 = function (v) { dv.setUint32(p, v >>> 0, true); p += 4; };
    ents.forEach(function (e) {
      e.off = p;
      u32(0x04034B50); u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
      out.set(e.name, p); p += e.name.length;
      out.set(e.data, p); p += e.data.length;
    });
    const cdStart = p;
    ents.forEach(function (e) {
      u32(0x02014B50); u16(20); u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length);
      u16(0); u16(0); u16(0); u16(0); u32(0); u32(e.off);
      out.set(e.name, p); p += e.name.length;
    });
    const cdSize = p - cdStart;
    u32(0x06054B50); u16(0); u16(0); u16(ents.length); u16(ents.length); u32(cdSize); u32(cdStart); u16(0);
    return out;
  }

  /* ---------------- çalışma kitabı ---------------- */
  function build(wb) {
    wb = wb || {};
    const sheets = Array.isArray(wb.sheets) && wb.sheets.length ? wb.sheets : [{ name: 'Sayfa 1', rows: [] }];
    const styles = makeStyles(), sst = makeSst();
    const names = sheetNames(sheets);
    const filters = [];
    const sheetXmls = sheets.map(function (sh, i) { return sheetXml(sh, i, styles, sst, filters); });
    const n = sheets.length;

    let ct = XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    for (let i = 1; i <= n; i++) ct += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';

    const rootRels = XML_HEAD + '<Relationships xmlns="' + NS_PKG_REL + '">' +
      '<Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>';

    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const author = clean(wb.author != null ? wb.author : 'Mimari Tasarım Asistanı');
    const core = XML_HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(clean(wb.title || '')) + '</dc:title><dc:creator>' + esc(author) + '</dc:creator><cp:lastModifiedBy>' + esc(author) + '</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>';

    const app = XML_HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Mimari Tasarım Asistanı</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop></Properties>';

    let wbx = XML_HEAD + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>';
    names.forEach(function (nm, i) { wbx += '<sheet name="' + escAttr(nm) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; });
    wbx += '</sheets>';
    if (filters.length) {
      wbx += '<definedNames>' + filters.map(function (f) {
        const q = "'" + names[f.index].replace(/'/g, "''") + "'!";
        const a = f.ref;
        return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + f.index + '" hidden="1">' + esc(q + '$' + colName(a.c1) + '$' + (a.r1 + 1) + ':$' + colName(a.c2) + '$' + (a.r2 + 1)) + '</definedName>';
      }).join('') + '</definedNames>';
    }
    wbx += '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';

    let wrels = XML_HEAD + '<Relationships xmlns="' + NS_PKG_REL + '">';
    for (let i = 1; i <= n; i++) wrels += '<Relationship Id="rId' + i + '" Type="' + REL + 'worksheet" Target="worksheets/sheet' + i + '.xml"/>';
    wrels += '<Relationship Id="rId' + (n + 1) + '" Type="' + REL + 'styles" Target="styles.xml"/>' +
      '<Relationship Id="rId' + (n + 2) + '" Type="' + REL + 'sharedStrings" Target="sharedStrings.xml"/></Relationships>';

    const files = [
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rootRels },
      { name: 'docProps/core.xml', data: core },
      { name: 'docProps/app.xml', data: app },
      { name: 'xl/workbook.xml', data: wbx },
      { name: 'xl/_rels/workbook.xml.rels', data: wrels },
      { name: 'xl/styles.xml', data: styles.xml() },
    ];
    sheetXmls.forEach(function (sx, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sx }); });
    files.push({ name: 'xl/sharedStrings.xml', data: sst.xml() });
    return zip(files);
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

  function save(bytes, filename) {
    let name = String(filename || 'tablo').replace(/[\\\/:*?"<>|\u0000-\u001F]/g, '-').trim() || 'tablo';
    if (!/\.xlsx$/i.test(name)) name += '.xlsx';
    const blob = new Blob([bytes], { type: MIME });
    const saver = App.files && App.files.saveBlob ? App.files.saveBlob : fallbackSave;
    return Promise.resolve(saver(name, blob));
  }

  App.xlsx = { MIME: MIME, build: build, save: save, colName: colName, ref: ref, range: range, parseRange: parseRange, crc32: crc32, zip: zip };
})();
