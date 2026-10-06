/* ==========================================================================
   39-lib-tplscene.js — Modül 12 · pafta sahnesi
   Paneller alttan üste primitiflere çevrilir; canlı SVG ve PNG / PDF çıktısı aynı listeden çizilir.
   T.scene(doc, { st, live, hi }) → { prims, W, H, refs } — refs: kullanılan araç kaynakları
   ========================================================================== */
(function () {
  const App = window.App;
  const T = App.tpl;
  const U = App.util;
  const sheet = () => App.sheet;
  const INK = '#17181B';

  /* ---------- yazı yardımcıları ---------- */
  T.wrapLines = function (s, maxW, size, weight, fam, ls) {
    const out = [];
    String(s == null ? '' : s).split('\n').forEach((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); return; }
      let cur = '';
      const push = () => { if (cur) out.push(cur); cur = ''; };
      words.forEach((w) => {
        let t = w;
        // sığmayan uzun sözcüğü karakter karakter böl
        while (sheet().tw(t, size, weight, fam, ls) > maxW && t.length > 1) {
          let k = t.length - 1;
          while (k > 1 && sheet().tw(t.slice(0, k), size, weight, fam, ls) > maxW) k--;
          push();
          out.push(t.slice(0, k));
          t = t.slice(k);
        }
        const next = cur ? cur + ' ' + t : t;
        if (cur && sheet().tw(next, size, weight, fam, ls) > maxW) { push(); cur = t; } else cur = next;
      });
      push();
    });
    return out;
  };
  const up = (s) => String(s).toLocaleUpperCase('tr');

  /* ---------- panel çizimleri ---------- */
  function viewPrims(p, doc, env, out) {
    const bx = p.x + p.pad, by = p.y + p.pad, bw = Math.max(4, p.w - p.pad * 2), bh = Math.max(4, p.h - p.pad * 2);
    let img = null, msg = null, region = null;
    if (p.src.k === 'mod') {
      const info = T.srcInfo(p.src.id);
      let e = null;
      if (env.hi) e = T.entryFor(env.st, p.src.id, true);
      else if (env.st) e = T.want(env.st, p.src.id, false);
      if (e && e.status === 'ok') {
        img = { href: e.href, ik: e.ik, w: e.W, h: e.H };
        region = info && info.framed && p.trim ? T.frameRegion(e.W, e.H) : { x: 0, y: 0, w: e.W, h: e.H };
        if (env.refs && env.refs.indexOf(p.src.id) < 0) env.refs.push(p.src.id);
      } else if (e && e.status === 'err') msg = e.msg || 'Çıktı alınamadı';
      else msg = 'Hazırlanıyor…';
      if (!e && env.refs && env.refs.indexOf(p.src.id) < 0) env.refs.push(p.src.id);
    } else if (p.src.k === 'img') {
      const C = App.collage;
      const im = C && C.imgs[p.src.id];
      if (im) {
        const pr = C.processed({ src: p.src.id, bw: p.bw, con: 1.05, bri: 0, flip: false });
        img = { href: pr.href, ik: pr.ik, w: im.w, h: im.h };
        region = { x: 0, y: 0, w: im.w, h: im.h };
      } else msg = 'Görsel bulunamadı';
    } else msg = 'Araç çıktısı seçin ya da görsel yükleyin';
    if (img && region && p.crop && (p.crop.l || p.crop.t || p.crop.r || p.crop.b)) {
      const c = p.crop;
      region = { x: region.x + region.w * c.l, y: region.y + region.h * c.t, w: Math.max(4, region.w * (1 - c.l - c.r)), h: Math.max(4, region.h * (1 - c.t - c.b)) };
    }
    if (img) {
      const k = p.fit === 'contain' ? Math.min(bw / region.w, bh / region.h) : Math.max(bw / region.w, bh / region.h);
      const s = k * p.zoom;
      const dx = bx + (bw - region.w * s) * p.ox - region.x * s;
      const dy = by + (bh - region.h * s) * p.oy - region.y * s;
      out.push({ t: 'g', clip: { id: 'tp' + p.id, x: bx, y: by, w: bw, h: bh }, items: [{ t: 'img', href: img.href, ik: img.ik, x: dx, y: dy, w: img.w * s, h: img.h * s }] });
    } else if (env.live) {
      out.push({ t: 'rect', x: bx, y: by, w: bw, h: bh, fill: '#EFECE4', opacity: 0.55, stroke: '#8C9199', sw: 2, dash: [9, 7] });
      const fs = Math.max(11, Math.min(26, Math.round(Math.min(bw, bh) / 14)));
      const lines = T.wrapLines(msg, bw * 0.84, fs, 600, 'm', 0);
      lines.slice(0, 4).forEach((ln, i) => out.push({ t: 'text', x: bx + bw / 2, y: by + bh / 2 + (i - (Math.min(lines.length, 4) - 1) / 2) * fs * 1.4 + fs * 0.35, s: ln, size: fs, weight: 600, fam: 'm', fill: '#5B6068', anchor: 'middle', pe: false }));
    }
    if (p.label) {
      const ts = Math.max(11, Math.round(Math.min(doc._W, doc._H) * 0.0105));
      const txt = up(p.label);
      const tw = sheet().tw(txt, ts, 700, 'm', ts * 0.08) + ts * 1.5;
      out.push({ t: 'rect', x: p.x, y: p.y, w: tw, h: ts * 2, fill: INK });
      out.push({ t: 'text', x: p.x + ts * 0.75, y: p.y + ts * 1.33, s: txt, size: ts, weight: 700, fam: 'm', fill: '#FFFFFF', ls: ts * 0.08, pe: false });
    }
  }

  function textPrims(p, doc, out) {
    const px = p.x + p.pad, py = p.y + p.pad, iw = Math.max(8, p.w - p.pad * 2), ih = Math.max(8, p.h - p.pad * 2);
    const ls = p.caps ? Math.round(p.size * 0.06 * 10) / 10 : 0;
    const lines = T.wrapLines(p.caps ? up(p.s) : p.s, iw, p.size, p.weight, p.fam, ls);
    const lh = p.size * p.lh;
    const total = lines.length * lh;
    const top = py + (p.valign === 'm' ? (ih - total) / 2 : p.valign === 'b' ? ih - total : 0);
    const anchor = p.align === 'c' ? 'middle' : p.align === 'r' ? 'end' : 'start';
    const x = p.align === 'c' ? px + iw / 2 : p.align === 'r' ? px + iw : px;
    const items = [];
    lines.forEach((ln, i) => { if (ln) items.push({ t: 'text', x: x, y: top + i * lh + p.size * 0.95, s: ln, size: p.size, weight: p.weight, fam: p.fam, fill: p.col, ls: ls, anchor: anchor, pe: false }); });
    if (items.length) out.push({ t: 'g', clip: { id: 'tp' + p.id, x: p.x, y: p.y, w: p.w, h: p.h }, items: items });
  }

  function markPrims(x, y, s, out) {
    const bau = App.theme.name === 'bauhaus';
    const P = App.PAL;
    if (bau) {
      out.push({ t: 'rect', x: x, y: y, w: s, h: s, fill: P.blue });
      out.push({ t: 'circle', cx: x + s * 0.35, cy: y + s * 0.35, r: s * 0.19, fill: P.yellow, stroke: INK, sw: Math.max(1.5, s * 0.03) });
      out.push({ t: 'rect', x: x + s * 0.52, y: y + s * 0.48, w: s * 0.35, h: s * 0.35, fill: P.red, stroke: INK, sw: Math.max(1.5, s * 0.03) });
      out.push({ t: 'poly', pts: [[x + s * 0.13, y + s * 0.87], [x + s * 0.44, y + s * 0.87], [x + s * 0.29, y + s * 0.56]], fill: P.paper, stroke: INK, sw: Math.max(1.5, s * 0.03) });
    } else {
      out.push({ t: 'rect', x: x, y: y, w: s, h: s, fill: INK });
      out.push({ t: 'circle', cx: x + s * 0.35, cy: y + s * 0.35, r: s * 0.18, fill: '#FFFFFF' });
      out.push({ t: 'rect', x: x + s * 0.55, y: y + s * 0.5, w: s * 0.28, h: s * 0.28, fill: '#FFFFFF', opacity: 0.85 });
      out.push({ t: 'poly', pts: [[x + s * 0.15, y + s * 0.85], [x + s * 0.43, y + s * 0.85], [x + s * 0.29, y + s * 0.58]], fill: '#FFFFFF', opacity: 0.7 });
    }
  }

  function titlePrims(p, doc, env, out) {
    const bgc = T.panelBg(p, doc);
    const ink = bgc && T.lum(bgc) < 0.45 ? '#FFFFFF' : INK;
    const name = p.name || (env.st ? env.st.project.meta.name : '') || 'Adsız proje';
    const rows = p.rows.filter((r) => r[0] || r[1]);
    const compact = p.w / p.h < 3.4;
    const pad = Math.round(Math.min(p.h * 0.14, p.w * 0.04));
    const nameTxt = up(name), subTxt = p.sub ? up(p.sub) : '';
    // ad ve alt başlık: verilen kutuya sığdır (gerekirse iki satır)
    const nameBlock = (x0, areaW, yTop, areaH) => {
      const sub = subTxt ? sheet().fitLine(subTxt, areaW, Math.min(areaH * 0.2, 20), 9, 600, 'b', 1) : null;
      const avail = Math.max(10, areaH - (sub ? sub.size * 1.7 : 0) - 4);
      const nameMax = Math.min(areaH * 0.5, 64, avail / 1.12);
      const one = sheet().fitLine(nameTxt, areaW, nameMax, 11, 800, 'd', 0.5);
      let lines = [one.s], size = one.size;
      if (one.size < nameMax * 0.62) { const two = sheet().wrap2(nameTxt, areaW, Math.min(nameMax * 0.9, avail / 2.24), 9, 800, 'd', 0.5); if (two && two.size > one.size) { lines = two.lines; size = two.size; } }
      const total = lines.length * size * 1.12 + (sub ? sub.size * 1.7 : 0);
      const top = yTop + (areaH - total) / 2;
      lines.forEach((ln, i) => out.push({ t: 'text', x: x0, y: top + size * 0.88 + i * size * 1.12, s: ln, size: size, weight: 800, fam: 'd', fill: ink, ls: 0.5, pe: false }));
      if (sub) out.push({ t: 'text', x: x0, y: top + lines.length * size * 1.12 + sub.size * 1.05, s: sub.s, size: sub.size, weight: 600, fam: 'b', fill: ink, ls: 1, opacity: 0.7, pe: false });
    };
    const rowLine = (x, y, w, r, rs) => {
      const lab = up(r[0]);
      const lw = Math.min(w * 0.5, sheet().tw(lab, rs * 0.78, 600, 'm', 1));
      out.push({ t: 'text', x: x, y: y, s: sheet().clip(lab, w * 0.5, rs * 0.78, 600, 'm', 1), size: rs * 0.78, weight: 600, fam: 'm', fill: ink, ls: 1, opacity: 0.6, pe: false });
      const vf = sheet().fitLine(r[1], Math.max(20, w - lw - 8), rs, 8, 700, 'b', 0);
      out.push({ t: 'text', x: x + lw + 8, y: y, s: vf.s, size: vf.size, weight: 700, fam: 'b', fill: ink, pe: false });
    };
    if (compact) {
      const topH = rows.length ? p.h * 0.52 : p.h;
      const ms = Math.min(topH - pad * 0.4, p.w * 0.3);
      markPrims(p.x, p.y, ms, out);
      nameBlock(p.x + ms + pad, Math.max(40, p.w - ms - pad * 2), p.y, topH);
      if (rows.length) {
        out.push({ t: 'line', x1: p.x + pad * 0.6, y1: p.y + topH, x2: p.x + p.w - pad * 0.6, y2: p.y + topH, stroke: ink, sw: 2, opacity: 0.5 });
        const nc = rows.length > 2 ? 2 : 1, nr = Math.ceil(rows.length / nc);
        const cw = (p.w - pad * 2) / nc, rh = (p.h - topH - pad * 0.6) / nr;
        const rs = Math.max(9, Math.min(rh * 0.36, 24));
        rows.forEach((r, i) => { const c = i % nc, rr = Math.floor(i / nc); rowLine(p.x + pad + c * cw, p.y + topH + rh * (rr + 0.5) + rs * 0.5, cw - pad * 0.6, r, rs); });
      }
    } else {
      const h = p.h;
      markPrims(p.x, p.y, h, out);
      const rs = Math.max(10, Math.min(h * 0.17, 26));
      let labW = 0, valW = 0;
      rows.forEach((r) => { labW = Math.max(labW, sheet().tw(up(r[0]), rs * 0.78, 600, 'm', 1)); valW = Math.max(valW, sheet().tw(r[1], rs, 700, 'b', 0)); });
      const rowsW = rows.length ? Math.min(p.w * 0.4, labW + valW + pad * 2.4) : 0;
      const x0 = p.x + h + pad, x1 = p.x + p.w - rowsW - pad;
      nameBlock(x0, Math.max(60, x1 - x0), p.y, h);
      if (rowsW) {
        const vx = p.x + p.w - rowsW;
        out.push({ t: 'line', x1: vx, y1: p.y + pad * 0.6, x2: vx, y2: p.y + h - pad * 0.6, stroke: ink, sw: 2, opacity: 0.5 });
        const rh = (h - pad * 1.2) / rows.length;
        rows.forEach((r, i) => rowLine(vx + pad, p.y + pad * 0.6 + rh * (i + 0.5) + rs * 0.35, rowsW - pad * 1.6, r, rs));
      }
    }
    if (!p.bd) out.push({ t: 'rect', x: p.x + 1.5, y: p.y + 1.5, w: p.w - 3, h: p.h - 3, stroke: ink, sw: 3 });
  }

  function legendPrims(p, doc, out) {
    const rh = p.size * 1.75, sw = p.size * 1.05;
    const items = [];
    p.items.forEach((it, i) => {
      const y = p.y + p.pad + i * rh;
      items.push({ t: 'rect', x: p.x + p.pad, y: y, w: sw, h: sw, fill: it.col, stroke: INK, sw: 1, opacity: 1 });
      const fit = sheet().fitLine(it.label, Math.max(20, p.w - p.pad * 2 - sw - 12), p.size, 8, 600, 'b', 0);
      items.push({ t: 'text', x: p.x + p.pad + sw + 12, y: y + sw * 0.82, s: fit.s, size: fit.size, weight: 600, fam: 'b', fill: p.col, pe: false });
    });
    if (items.length) out.push({ t: 'g', clip: { id: 'tp' + p.id, x: p.x, y: p.y, w: p.w, h: p.h }, items: items });
  }

  function factsPrims(p, doc, env, out) {
    const F = env.st ? T.facts(env.st.project) : {};
    const rh = p.size * 1.95;
    const items = [];
    p.keys.forEach((k, i) => {
      const meta = T.FACT_KEYS.find((f) => f.id === k);
      const y = p.y + p.pad + i * rh;
      items.push({ t: 'text', x: p.x + p.pad, y: y + p.size * 1.15, s: up(meta.label), size: p.size * 0.66, weight: 600, fam: 'm', fill: p.col, ls: 1, opacity: 0.62, pe: false });
      const v = F[k] != null ? F[k] : '—';
      const labW = sheet().tw(up(meta.label), p.size * 0.66, 600, 'm', 1);
      const vf = sheet().fitLine(v, Math.max(20, p.w - p.pad * 2 - labW - 14), p.size * 1.1, 8, 700, 'b', 0);
      items.push({ t: 'text', x: p.x + p.w - p.pad, y: y + p.size * 1.15, s: vf.s, size: vf.size, weight: 700, fam: 'b', fill: p.col, anchor: 'end', pe: false });
      items.push({ t: 'line', x1: p.x + p.pad, y1: y + rh * 0.86, x2: p.x + p.w - p.pad, y2: y + rh * 0.86, stroke: p.col, sw: 1, opacity: 0.25 });
    });
    if (items.length) out.push({ t: 'g', clip: { id: 'tp' + p.id, x: p.x, y: p.y, w: p.w, h: p.h }, items: items });
  }

  function blockPrims(p, doc, out) {
    out.push({ t: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, fill: p.col, opacity: p.op });
    if (p.s) {
      const lines = T.wrapLines(p.s, Math.max(10, p.w - p.pad * 2), p.size, 700, 'd', 0);
      const items = lines.map((ln, i) => ({ t: 'text', x: p.x + p.pad, y: p.y + p.h - p.pad - (lines.length - 1 - i) * p.size * 1.15 - p.size * 0.18, s: ln, size: p.size, weight: 700, fam: 'd', fill: p.tcol, pe: false }));
      out.push({ t: 'g', clip: { id: 'tp' + p.id, x: p.x, y: p.y, w: p.w, h: p.h }, items: items });
    }
  }

  function linePrims(p, out) {
    const o = { stroke: p.col, sw: p.lw, cap: p.dash === 2 ? 'round' : 'butt' };
    if (p.dash === 1) o.dash = [p.lw * 3.5, p.lw * 2.2]; else if (p.dash === 2) o.dash = [0.1, p.lw * 2.4];
    if (p.dir === 'v') out.push(Object.assign({ t: 'line', x1: p.x + p.w / 2, y1: p.y, x2: p.x + p.w / 2, y2: p.y + p.h }, o));
    else out.push(Object.assign({ t: 'line', x1: p.x, y1: p.y + p.h / 2, x2: p.x + p.w, y2: p.y + p.h / 2 }, o));
  }

  function northPrims(p, out) {
    const s = Math.min(p.w, p.h);
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + s * 0.1, r = s * 0.36;
    out.push({ t: 'circle', cx: cx, cy: cy, r: r, stroke: p.col, sw: Math.max(1.5, s * 0.03) });
    out.push({ t: 'poly', pts: [[cx, cy - r * 0.8], [cx - r * 0.36, cy + r * 0.58], [cx, cy + r * 0.3], [cx + r * 0.36, cy + r * 0.58]], fill: p.col });
    out.push({ t: 'text', x: cx, y: cy - r - s * 0.06, s: 'K', size: s * 0.2, weight: 700, fam: 'm', fill: p.col, anchor: 'middle', pe: false });
  }

  T.panelPrims = function (p, doc, env, out) {
    const bg = T.panelBg(p, doc);
    if (bg && p.t !== 'block' && p.t !== 'line') out.push({ t: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, fill: bg });
    if (p.t === 'view') viewPrims(p, doc, env, out);
    else if (p.t === 'text') textPrims(p, doc, out);
    else if (p.t === 'title') titlePrims(p, doc, env, out);
    else if (p.t === 'legend') legendPrims(p, doc, out);
    else if (p.t === 'facts') factsPrims(p, doc, env, out);
    else if (p.t === 'block') blockPrims(p, doc, out);
    else if (p.t === 'line') linePrims(p, out);
    else if (p.t === 'north') northPrims(p, out);
    if (p.bd > 0 && p.t !== 'line') out.push({ t: 'rect', x: p.x + p.bd / 2, y: p.y + p.bd / 2, w: p.w - p.bd, h: p.h - p.bd, stroke: p.bdc, sw: p.bd });
  };

  T.scene = function (doc, env) {
    env = env || {};
    const sz = T.sizeOf(doc);
    const d = Object.assign({}, doc, { _W: sz.w, _H: sz.h });
    const prims = [{ t: 'rect', x: 0, y: 0, w: sz.w, h: sz.h, fill: T.bgColor(doc) }];
    const refs = [];
    const e2 = Object.assign({}, env, { refs: refs });
    doc.panels.forEach((p) => { if (!p.hidden) T.panelPrims(p, d, e2, prims); });
    // tek renk: her şey seçilen rengin tonlarına çevrilir (görüntüler de)
    const out = doc.mono && doc.mono.on ? App.board.monoPrims(prims, doc.mono.col) : prims;
    return { prims: out, W: sz.w, H: sz.h, refs: refs };
  };
  /* belgedeki tüm araç kaynakları (görünür paneller) */
  T.refsOf = function (doc) {
    const out = [];
    doc.panels.forEach((p) => { if (!p.hidden && p.t === 'view' && p.src.k === 'mod' && out.indexOf(p.src.id) < 0) out.push(p.src.id); });
    return out;
  };
  /* bir panelin sınır kutusu (hit-test, tutamaç) */
  T.boxOf = (p) => ({ x: p.x, y: p.y, w: p.w, h: p.h });
})();
