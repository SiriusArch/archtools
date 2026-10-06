/* ==========================================================================
   36-lib-furn.js — Mekân Etüdü: donatı (mobilya ve sabit ekipman) kataloğu, çizim sembolleri, otomatik döşeme
   Donatı bir mekânın içinde durur: project.study.free.shapes[mekânId].furn = [{ id, k, x, y, r }]
     k = katalog anahtarı · x, y = mekân kutusunun sol-üst köşesine göre konum (m) · r = 0..3 (90° adımlar)
   Mekân taşınınca donatı onunla birlikte taşınır. Ölçüler gerçek mobilya ölçüleridir (m).
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const st = (App.study = App.study || {});

  /* anahtar, ad, grup, genişlik (w), derinlik (d) — "sırt" üst kenardır (r = 0) */
  const CAT = [
    { k: 'yatak2', label: 'Çift kişilik yatak', g: 'Yatak odası', w: 1.6, d: 2.0 },
    { k: 'yatak1', label: 'Tek kişilik yatak', g: 'Yatak odası', w: 0.95, d: 2.0 },
    { k: 'komodin', label: 'Komodin', g: 'Yatak odası', w: 0.45, d: 0.4 },
    { k: 'gardrop', label: 'Gardrop', g: 'Yatak odası', w: 2.0, d: 0.6 },
    { k: 'kanepe3', label: 'Üçlü kanepe', g: 'Oturma', w: 2.1, d: 0.9 },
    { k: 'kanepe2', label: 'İkili kanepe', g: 'Oturma', w: 1.55, d: 0.9 },
    { k: 'koltuk', label: 'Koltuk', g: 'Oturma', w: 0.85, d: 0.85 },
    { k: 'sehpa', label: 'Orta sehpa', g: 'Oturma', w: 1.1, d: 0.6 },
    { k: 'tv', label: 'TV ünitesi', g: 'Oturma', w: 1.8, d: 0.4 },
    { k: 'kitaplik', label: 'Kitaplık', g: 'Oturma', w: 1.2, d: 0.35 },
    { k: 'hali', label: 'Halı', g: 'Oturma', w: 2.4, d: 1.7 },
    { k: 'masa6', label: 'Yemek masası (6)', g: 'Yemek / çalışma', w: 1.8, d: 0.9 },
    { k: 'masa4', label: 'Masa (4)', g: 'Yemek / çalışma', w: 1.2, d: 0.8 },
    { k: 'masar', label: 'Yuvarlak masa', g: 'Yemek / çalışma', w: 1.1, d: 1.1 },
    { k: 'sandalye', label: 'Sandalye', g: 'Yemek / çalışma', w: 0.45, d: 0.45 },
    { k: 'calisma', label: 'Çalışma masası', g: 'Yemek / çalışma', w: 1.4, d: 0.7 },
    { k: 'ofiskoltuk', label: 'Ofis koltuğu', g: 'Yemek / çalışma', w: 0.6, d: 0.6 },
    { k: 'toplanti', label: 'Toplantı masası', g: 'Yemek / çalışma', w: 3.2, d: 1.2 },
    { k: 'sira', label: 'Öğrenci sırası', g: 'Yemek / çalışma', w: 1.2, d: 0.5 },
    { k: 'tezgah', label: 'Mutfak tezgâhı', g: 'Mutfak', w: 2.4, d: 0.6 },
    { k: 'ocak', label: 'Ocak', g: 'Mutfak', w: 0.6, d: 0.6 },
    { k: 'evye', label: 'Evye', g: 'Mutfak', w: 0.9, d: 0.6 },
    { k: 'buzdolabi', label: 'Buzdolabı', g: 'Mutfak', w: 0.7, d: 0.7 },
    { k: 'ada', label: 'Mutfak adası', g: 'Mutfak', w: 2.0, d: 0.9 },
    { k: 'wc', label: 'Klozet', g: 'Islak hacim', w: 0.4, d: 0.7 },
    { k: 'lavabo', label: 'Lavabo', g: 'Islak hacim', w: 0.6, d: 0.48 },
    { k: 'dus', label: 'Duşakabin', g: 'Islak hacim', w: 0.9, d: 0.9 },
    { k: 'kuvet', label: 'Küvet', g: 'Islak hacim', w: 1.7, d: 0.75 },
    { k: 'camasir', label: 'Çamaşır makinesi', g: 'Islak hacim', w: 0.6, d: 0.6 },
    { k: 'merdiven', label: 'Merdiven', g: 'Düşey / diğer', w: 1.1, d: 3.0 },
    { k: 'asansor', label: 'Asansör', g: 'Düşey / diğer', w: 1.7, d: 1.7 },
    { k: 'bitki', label: 'Bitki', g: 'Düşey / diğer', w: 0.55, d: 0.55 },
    { k: 'reyon', label: 'Reyon / raf', g: 'Düşey / diğer', w: 1.2, d: 0.5 },
    { k: 'piyano', label: 'Piyano', g: 'Düşey / diğer', w: 1.5, d: 0.65 },
  ];
  const BY = {};
  CAT.forEach((c) => { BY[c.k] = c; });
  const GROUPS = [];
  CAT.forEach((c) => { if (GROUPS.indexOf(c.g) < 0) GROUPS.push(c.g); });

  /* ---------- semboller: yerel koordinatta (0..w, 0..d) basit çizim işlemleri ----------
     ['r', x, y, w, h, tür] · ['c', cx, cy, r, tür] · ['e', cx, cy, rx, ry, tür] · ['l', x1, y1, x2, y2]
     tür: 0 gövde (açık dolgu), 1 ayrıntı (hafif gri), 2 dolgusuz */
  function sym(k, w, d) {
    const o = [];
    const R = (x, y, ww, hh, t) => o.push(['r', x, y, ww, hh, t || 0]);
    const C = (x, y, r, t) => o.push(['c', x, y, r, t || 0]);
    const E = (x, y, rx, ry, t) => o.push(['e', x, y, rx, ry, t || 0]);
    const L = (a, b, c, e) => o.push(['l', a, b, c, e]);
    switch (k) {
      case 'yatak2': R(0, 0, w, d); R(w * 0.06, d * 0.04, w * 0.41, d * 0.13, 1); R(w * 0.53, d * 0.04, w * 0.41, d * 0.13, 1); L(0, d * 0.36, w, d * 0.36); break;
      case 'yatak1': R(0, 0, w, d); R(w * 0.1, d * 0.04, w * 0.8, d * 0.13, 1); L(0, d * 0.36, w, d * 0.36); break;
      case 'komodin': R(0, 0, w, d); R(w * 0.2, d * 0.2, w * 0.6, d * 0.6, 1); break;
      case 'gardrop': R(0, 0, w, d); L(w / 2, 0, w / 2, d); L(0, 0, w, d, 0); break;
      case 'kanepe3': case 'kanepe2': R(0, 0, w, d); R(0, 0, w, d * 0.24, 1); R(0, d * 0.2, w * 0.09, d * 0.8, 1); R(w * 0.91, d * 0.2, w * 0.09, d * 0.8, 1); if (k === 'kanepe3') { L(w * 0.39, d * 0.26, w * 0.39, d); L(w * 0.61, d * 0.26, w * 0.61, d); } else L(w / 2, d * 0.26, w / 2, d); break;
      case 'koltuk': R(0, 0, w, d); R(0, 0, w, d * 0.26, 1); R(0, d * 0.22, w * 0.15, d * 0.78, 1); R(w * 0.85, d * 0.22, w * 0.15, d * 0.78, 1); break;
      case 'sehpa': R(0, 0, w, d); break;
      case 'tv': R(0, 0, w, d); R(w * 0.3, d * 0.2, w * 0.4, d * 0.2, 1); break;
      case 'kitaplik': R(0, 0, w, d); for (let i = 1; i < 6; i++) L((w * i) / 6, 0, (w * i) / 6, d); break;
      case 'hali': R(0, 0, w, d, 1); R(w * 0.06, d * 0.07, w * 0.88, d * 0.86, 2); break;
      case 'masa6': case 'masa4': R(0, 0, w, d); break;
      case 'masar': C(w / 2, d / 2, w / 2); break;
      case 'sandalye': R(0, 0, w, d); R(0, 0, w, d * 0.2, 1); break;
      case 'calisma': R(0, 0, w, d); R(w * 0.3, d * 0.08, w * 0.4, d * 0.16, 1); break;
      case 'ofiskoltuk': C(w / 2, d / 2, w / 2); C(w / 2, d / 2, w * 0.28, 1); break;
      case 'toplanti': E(w / 2, d / 2, w / 2, d / 2); break;
      case 'sira': R(0, 0, w, d); L(w / 2, 0, w / 2, d); break;
      case 'tezgah': R(0, 0, w, d); break;
      case 'ocak': R(0, 0, w, d); C(w * 0.27, d * 0.27, w * 0.15, 2); C(w * 0.73, d * 0.27, w * 0.12, 2); C(w * 0.27, d * 0.73, w * 0.12, 2); C(w * 0.73, d * 0.73, w * 0.15, 2); break;
      case 'evye': R(0, 0, w, d); R(w * 0.08, d * 0.12, w * 0.5, d * 0.76, 1); R(w * 0.64, d * 0.12, w * 0.28, d * 0.76, 1); C(w * 0.33, d * 0.5, w * 0.03, 2); break;
      case 'buzdolabi': R(0, 0, w, d); L(0, d * 0.3, w, d * 0.3); L(w * 0.5 - w * 0.1, 0, w * 0.5 + w * 0.1, d * 0.3, 0); break;
      case 'ada': R(0, 0, w, d); R(w * 0.05, d * 0.12, w * 0.9, d * 0.76, 2); break;
      case 'wc': R(0, 0, w, d * 0.28, 1); E(w / 2, d * 0.28 + (d * 0.72) / 2, w * 0.46, (d * 0.72) / 2); break;
      case 'lavabo': R(0, 0, w, d); E(w / 2, d * 0.54, w * 0.34, d * 0.32, 1); C(w / 2, d * 0.14, w * 0.04, 2); break;
      case 'dus': R(0, 0, w, d); L(0, 0, w, d); L(w, 0, 0, d, 0); C(w * 0.15, d * 0.15, w * 0.06, 2); break;
      case 'kuvet': R(0, 0, w, d); R(w * 0.04, d * 0.1, w * 0.92, d * 0.8, 1); C(w * 0.1, d * 0.5, d * 0.07, 2); break;
      case 'camasir': R(0, 0, w, d); C(w / 2, d * 0.55, w * 0.3, 1); break;
      case 'merdiven': R(0, 0, w, d); for (let i = 1; i < 11; i++) L(0, (d * i) / 11, w, (d * i) / 11); L(w / 2, d * 0.92, w / 2, d * 0.1); L(w / 2, d * 0.1, w * 0.3, d * 0.2); L(w / 2, d * 0.1, w * 0.7, d * 0.2); break;
      case 'asansor': R(0, 0, w, d); R(w * 0.12, d * 0.12, w * 0.76, d * 0.76, 2); L(w * 0.12, d * 0.12, w * 0.88, d * 0.88); L(w * 0.88, d * 0.12, w * 0.12, d * 0.88); break;
      case 'bitki': C(w / 2, d / 2, w / 2, 1); C(w / 2, d / 2, w * 0.3, 1); C(w / 2, d / 2, w * 0.1, 0); break;
      case 'reyon': R(0, 0, w, d); L(0, d / 2, w, d / 2); break;
      case 'piyano': R(0, 0, w, d); R(0, d * 0.5, w, d * 0.5, 1); for (let i = 1; i < 10; i++) L((w * i) / 10, d * 0.5, (w * i) / 10, d); break;
      default: R(0, 0, w, d);
    }
    return o;
  }

  /* dönmüş ayak izi: r tek ise w ↔ d */
  const dims = (f) => { const c = BY[f.k] || { w: 1, d: 1 }; return f.r % 2 ? { w: c.d, h: c.w } : { w: c.w, h: c.d }; };

  /* ---------- çizim: furn[] → ekran primitifleri ----------
     o: { ox, oy (mekân kutusunun dünya konumu), X, Y, s (px/m), fill, stroke, soft, sw, only (tek donatı), hi (seçili kimlik) } */
  function prims(list, o) {
    const P = [];
    list.forEach((f) => {
      const c = BY[f.k];
      if (!c) return;
      if (o.only && o.only !== f.id) return;
      const dm = dims(f);
      const ops = sym(f.k, c.w, c.d);
      const cx0 = c.w / 2, cy0 = c.d / 2;
      const base = [o.ox + f.x + dm.w / 2, o.oy + f.y + dm.h / 2];
      const tr = (lx, ly) => {
        const dx = lx - cx0, dy = ly - cy0;
        let rx = dx, ry = dy;
        if (f.r === 1) { rx = -dy; ry = dx; } else if (f.r === 2) { rx = -dx; ry = -dy; } else if (f.r === 3) { rx = dy; ry = -dx; }
        return [o.X(base[0] + rx), o.Y(base[1] + ry)];
      };
      const sel = o.hi === f.id;
      const stroke = sel ? o.sel || o.stroke : o.stroke;
      const sw = (sel ? 1.7 : 1) * (o.sw || 1);
      ops.forEach((q) => {
        const kind = q[0];
        if (kind === 'r') {
          const t = q[5];
          const pts = [tr(q[1], q[2]), tr(q[1] + q[3], q[2]), tr(q[1] + q[3], q[2] + q[4]), tr(q[1], q[2] + q[4])];
          P.push({ t: 'poly', pts: pts, fill: t === 2 ? undefined : t === 1 ? o.soft : o.fill, stroke: stroke, sw: sw, opacity: o.opacity });
        } else if (kind === 'c') {
          const p = tr(q[1], q[2]);
          P.push({ t: 'circle', cx: p[0], cy: p[1], r: Math.max(0.8, q[3] * o.s), fill: q[4] === 2 ? undefined : q[4] === 1 ? o.soft : o.fill, stroke: stroke, sw: sw, opacity: o.opacity });
        } else if (kind === 'e') {
          const pts = [];
          for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; pts.push(tr(q[1] + Math.cos(a) * q[3], q[2] + Math.sin(a) * q[4])); }
          P.push({ t: 'poly', pts: pts, fill: q[5] === 2 ? undefined : q[5] === 1 ? o.soft : o.fill, stroke: stroke, sw: sw, opacity: o.opacity });
        } else {
          const a = tr(q[1], q[2]), b = tr(q[3], q[4]);
          P.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: stroke, sw: sw * 0.8, opacity: (o.opacity == null ? 1 : o.opacity) * 0.8 });
        }
      });
    });
    return P;
  }

  /* ---------- otomatik döşeme ---------- */
  const norm = (s) => U.norm(s || '');
  const has = (n, re) => re.test(n);

  /* sırtı duvara yaslı yerleşim: side n|s|w|e, frac 0..1 duvar boyunca konum */
  function onWall(lr, side, k, frac, gap) {
    const c = BY[k];
    gap = gap == null ? 0.05 : gap;
    if (side === 'n') return { k: k, r: 0, x: lr.x + (lr.w - c.w) * frac, y: lr.y + gap };
    if (side === 's') return { k: k, r: 2, x: lr.x + (lr.w - c.w) * frac, y: lr.y + lr.h - c.d - gap };
    if (side === 'w') return { k: k, r: 3, x: lr.x + gap, y: lr.y + (lr.h - c.w) * frac };
    return { k: k, r: 1, x: lr.x + lr.w - c.d - gap, y: lr.y + (lr.h - c.w) * frac };
  }
  const at = (k, x, y, r) => ({ k: k, x: x, y: y, r: r || 0 });
  const center = (lr, k, r, dx, dy) => {
    const c = BY[k], d = dims({ k: k, r: r || 0 });
    return { k: k, r: r || 0, x: lr.x + (lr.w - d.w) / 2 + (dx || 0), y: lr.y + (lr.h - d.h) / 2 + (dy || 0) };
    void c;
  };

  function recipe(it, lr) {
    const nm = norm(it.name), z = it.zone, A = it.area;
    const long = lr.w >= lr.h; // uzun duvar: kuzey/güney
    const wallA = long ? 'n' : 'w', wallB = long ? 's' : 'e';
    const out = [];
    const add = (p) => { if (p) out.push(p); };
    const chairs = (tx, ty, tw, th, nPer) => {
      // masa çevresine sandalye: uzun kenarlarda
      const n = Math.max(1, Math.round(nPer));
      for (let i = 0; i < n; i++) {
        const fx = tx + (tw * (i + 0.5)) / n - 0.225;
        out.push(at('sandalye', fx, ty - 0.5, 0));
        out.push(at('sandalye', fx, ty + th + 0.05, 2));
      }
    };
    if (has(nm, /merdiven/)) { const r = lr.w >= lr.h ? 1 : 0; const d = dims({ k: 'merdiven', r: r }); add(at('merdiven', lr.x + (lr.w - d.w) / 2, lr.y + (lr.h - d.h) / 2, r)); return out; }
    if (has(nm, /asansor/)) { add(center(lr, 'asansor', 0)); return out; }
    if (has(nm, /banyo|wc|tuvalet|lavabo|dus\b|hamam/)) {
      if (A <= 3.2) { add(onWall(lr, wallA, 'wc', 0.1)); add(onWall(lr, wallA, 'lavabo', 0.9)); return out; }
      add(onWall(lr, wallA, 'wc', 0.08)); add(onWall(lr, wallA, 'lavabo', 0.55));
      if (A >= 5.2 && lr.w >= 2.5 && lr.h >= 2.1) add(long ? onWall(lr, 'e', 'kuvet', 0.5) : onWall(lr, 's', 'kuvet', 0.5)); else add(at('dus', lr.x + lr.w - 0.95, lr.y + lr.h - 0.95, 0));
      return out;
    }
    if (has(nm, /camasir/)) { add(onWall(lr, wallA, 'camasir', 0.1)); add(onWall(lr, wallA, 'camasir', 0.7)); return out; }
    if (has(nm, /mutfak/)) {
      add(onWall(lr, wallA, 'buzdolabi', 0.0)); add(onWall(lr, wallA, 'tezgah', 0.4)); add(onWall(lr, wallA, 'evye', 0.62, 0.05));
      const t = BY.tezgah; void t;
      if (A >= 9 && lr.w >= 2.4 && lr.h >= 2.4) { const c = center(lr, 'masa4', 0, 0, long ? 0.5 : 0); add(c); }
      if (A >= 16 && lr.w >= 3.6 && lr.h >= 3.6) add(center(lr, 'ada', long ? 0 : 1, 0, 0));
      return out;
    }
    if (has(nm, /yemek/)) {
      const big = A >= 14 && lr.w >= 3.4 && lr.h >= 2.4;
      const k = big ? 'masa6' : 'masa4', c = BY[k];
      const tx = lr.x + (lr.w - c.w) / 2, ty = lr.y + (lr.h - c.d) / 2;
      add(at(k, tx, ty, 0)); chairs(tx, ty, c.w, c.d, big ? 3 : 2);
      return out;
    }
    if (has(nm, /salon|oturma|living|aile|gunduz|misafir salon/)) {
      add(onWall(lr, wallA, 'tv', 0.5, 0.08));
      const kz = lr.w >= 3.4 ? 'kanepe3' : 'kanepe2';
      add(onWall(lr, wallB, kz, 0.5, 0.1));
      add(center(lr, 'sehpa', long ? 0 : 1));
      if (A >= 20 && lr.w >= 4.5) { add(onWall(lr, 'w', 'koltuk', 0.2, 0.3)); add(onWall(lr, 'e', 'koltuk', 0.2, 0.3)); }
      if (A >= 14) add(center(lr, 'hali', long ? 0 : 1, 0, 0));
      return out;
    }
    if (has(nm, /ebeveyn|yatak|misafir|cocuk|oda/) && z !== 'calisma' && !has(nm, /calisma|ofis|toplanti|derslik|sinif/)) {
      if (has(nm, /cocuk/)) {
        add(onWall(lr, wallA, 'yatak1', 0.1)); if (A >= 12) add(onWall(lr, wallA, 'yatak1', 0.9));
        add(onWall(lr, wallB, 'calisma', 0.5)); add(onWall(lr, wallB, 'gardrop', 1));
        return out;
      }
      const big = A >= 11 && lr.w >= 2.8 && lr.h >= 2.8;
      const bed = big ? 'yatak2' : 'yatak1';
      // yatağın başı uzun duvara, ortada
      const side = lr.h >= lr.w ? 'n' : 'w';
      add(onWall(lr, side, bed, 0.5, 0.05));
      const bc = BY[bed];
      const bp = out[0], bd = dims({ k: bed, r: bp.r });
      if (big) {
        if (side === 'n') { add(at('komodin', bp.x - 0.5, bp.y, 0)); add(at('komodin', bp.x + bd.w + 0.05, bp.y, 0)); }
        else { add(at('komodin', bp.x, bp.y - 0.45, 3)); add(at('komodin', bp.x, bp.y + bd.h + 0.05, 3)); }
      }
      void bc;
      add(onWall(lr, side === 'n' ? 's' : 'e', 'gardrop', 0.5, 0.05));
      return out;
    }
    if (has(nm, /toplanti/)) {
      const tw = Math.min(3.2, lr.w - 1.4), c = BY.toplanti;
      const k = tw >= 3 ? 'toplanti' : 'masa6', cc = BY[k];
      void c;
      const tx = lr.x + (lr.w - cc.w) / 2, ty = lr.y + (lr.h - cc.d) / 2;
      add(at(k, tx, ty, 0)); chairs(tx, ty, cc.w, cc.d, Math.round(cc.w / 0.7));
      return out;
    }
    if (has(nm, /derslik|sinif|atolye|egitim/)) {
      const cols = Math.max(1, Math.floor((lr.w - 0.6) / 1.5)), rows = Math.max(1, Math.floor((lr.h - 1.6) / 0.95));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(at('sira', lr.x + 0.3 + c * 1.5 + (lr.w - 0.6 - cols * 1.5) / 2, lr.y + 1.3 + r * 0.95, 0));
      add(onWall(lr, 'n', 'calisma', 0.5, 0.2));
      return out;
    }
    if (has(nm, /calisma|ofis|buro|study|mudur|yonetici|idare|personel|stud/) || z === 'calisma') {
      const n = Math.max(1, Math.min(8, Math.floor(A / 7)));
      const per = Math.max(1, Math.floor((long ? lr.w : lr.h) / 1.7));
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / per), col = i % per;
        const x = lr.x + 0.1 + col * 1.7, y = lr.y + 0.1 + row * 1.9;
        if (long) { out.push(at('calisma', x, y, 0)); out.push(at('ofiskoltuk', x + 0.4, y + 0.8, 0)); }
        else { out.push(at('calisma', lr.x + 0.1 + row * 1.9, lr.y + 0.1 + col * 1.7, 3)); out.push(at('ofiskoltuk', lr.x + 0.8 + row * 1.9, lr.y + 0.4 + col * 1.7, 0)); }
      }
      if (A >= 12) add(onWall(lr, wallB, 'kitaplik', 0.5));
      return out;
    }
    if (has(nm, /depo|kiler|arsiv|ambar/)) {
      const n = Math.max(1, Math.floor((long ? lr.w : lr.h) / 1.3));
      for (let i = 0; i < n; i++) add(onWall(lr, wallA, 'reyon', n === 1 ? 0.5 : i / (n - 1)));
      return out;
    }
    if (has(nm, /hol|giris|antre|lobi/)) { if (A >= 6) add(at('bitki', lr.x + lr.w - 0.7, lr.y + 0.15, 0)); return out; }
    if (has(nm, /bahce|teras|balkon|avlu/)) { add(at('bitki', lr.x + 0.2, lr.y + 0.2, 0)); if (A >= 6) { add(at('bitki', lr.x + lr.w - 0.75, lr.y + lr.h - 0.75, 0)); add(center(lr, 'masar', 0)); } return out; }
    if (has(nm, /koridor|sirkulasyon|merdiven/) || z === 'sirkulasyon') return out;
    if (z === 'ozel') { add(onWall(lr, wallA, 'yatak2', 0.5)); return out; }
    if (z === 'sosyal') { add(onWall(lr, wallB, 'kanepe2', 0.5)); add(center(lr, 'sehpa', 0)); return out; }
    return out;
  }

  /* mekânı döşe: [{id,k,x,y,r}] (x,y mekân kutusuna göre) — mekânın içine sığmayanlar atılır */
  function autoFurnish(it) {
    const lr = st.itemLabelRect(it);
    const rel = { x: lr.x - it.x + 0.1, y: lr.y - it.y + 0.1, w: Math.max(0.1, lr.w - 0.2), h: Math.max(0.1, lr.h - 0.2) };
    const raw = recipe(it, rel);
    const out = [];
    raw.forEach((p, i) => {
      const d = dims(p);
      const x = Math.round(p.x * 100) / 100, y = Math.round(p.y * 100) / 100;
      const inside = (px, py) => st.inPoly(it.x + px, it.y + py, it.ring);
      const ok = it.shape === 'rect'
        ? x >= -0.01 && y >= -0.01 && x + d.w <= it.w + 0.01 && y + d.h <= it.h + 0.01
        : [[0.05, 0.05], [d.w - 0.05, 0.05], [d.w - 0.05, d.h - 0.05], [0.05, d.h - 0.05]].every((q) => inside(x + q[0], y + q[1]));
      if (ok) out.push({ id: 'f' + i + Math.random().toString(36).slice(2, 5), k: p.k, x: x, y: y, r: p.r });
    });
    return out;
  }

  /* katalogdan tek donatı: mekân içinde boş bir noktaya */
  function newFurn(it, k) {
    const c = BY[k];
    if (!c) return null;
    const lr = st.itemLabelRect(it);
    const rel = { x: lr.x - it.x, y: lr.y - it.y, w: lr.w, h: lr.h };
    const n = (it.furn || []).length;
    return { id: 'f' + Math.random().toString(36).slice(2, 7), k: k, x: Math.round(Math.max(0, rel.x + (rel.w - c.w) / 2 + (n % 4) * 0.2) * 100) / 100, y: Math.round(Math.max(0, rel.y + (rel.h - c.d) / 2 + (n % 4) * 0.2) * 100) / 100, r: 0 };
  }

  Object.assign(st, {
    FURN: CAT, FURN_BY: BY, FURN_GROUPS: GROUPS, FURN_IDS: CAT.map((c) => c.k),
    furnDims: dims, furnPrims: prims, furnSym: sym, autoFurnish: autoFurnish, newFurn: newFurn,
  });
})();
