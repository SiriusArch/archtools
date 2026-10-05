/* ==========================================================================
   36-lib-free.js — Mekân Etüdü: serbest düzen (saf fonksiyonlar, arayüzden bağımsız)
   Her mekân kendi şekli (dikdörtgen / L / T / U), boyutu ve konumu ile bir "modül"dür.
   Girdi : Modül 1 projesi (mekânlar, m², bölge, ilişkiler, balon konumları) + project.study.free
   Çıktı : metre cinsinden çokgenler, mekânlar arası ilişki durumu (bitişik / yakın / uzak / çakışık),
           skor, bulgular
   Veri  : project.study.free = { snap, shapes: { [mekânId]: { x, y, w, h, shape, rot, cut } } }
           x, y = sınırlayıcı kutunun sol-üst köşesi (m, y aşağı doğru) · w, h = kutu boyutu (m)
           shape = 'rect' | 'L' | 'T' | 'U' · rot = 0..3 (90° adımlar) · cut = kesik oranı (0.15–0.65)
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const fmt = U.fmt;
  const st = (App.study = App.study || {});

  const SHAPES = [
    { v: 'rect', label: 'Dikdörtgen', short: 'Dikdörtgen' },
    { v: 'L', label: 'L', short: 'L' },
    { v: 'T', label: 'T', short: 'T' },
    { v: 'U', label: 'U', short: 'U' },
  ];
  const SHAPE_IDS = SHAPES.map((s) => s.v);
  const MIN_DIM = 0.6, MAX_DIM = 120;
  const r1 = (v) => Math.round(v * 10) / 10;
  const num = (v, d) => (isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

  /* ---------- şekil: birim kare içinde halka → döndür → ölçekle ---------- */
  function unitRing(shape, c) {
    if (shape === 'L') return [[0, 0], [1 - c, 0], [1 - c, c], [1, c], [1, 1], [0, 1]];
    if (shape === 'T') {
      const s = Math.max(0.25, 1 - 1.5 * c), t = 0.42;
      const a = (1 - s) / 2, b = (1 + s) / 2;
      return [[0, 0], [1, 0], [1, t], [b, t], [b, 1], [a, 1], [a, t], [0, t]];
    }
    if (shape === 'U') {
      const a = (1 - c) / 2, b = (1 + c) / 2, d = 0.55;
      return [[0, 0], [a, 0], [a, d], [b, d], [b, 0], [1, 0], [1, 1], [0, 1]];
    }
    return [[0, 0], [1, 0], [1, 1], [0, 1]];
  }
  function rotUnit(p, r) {
    const x = p[0], y = p[1];
    if (r === 1) return [1 - y, x];
    if (r === 2) return [1 - x, 1 - y];
    if (r === 3) return [y, 1 - x];
    return [x, y];
  }
  function ringOf(f) {
    const ur = unitRing(f.shape, f.cut).map((p) => rotUnit(p, f.rot));
    return ur.map((p) => [f.x + p[0] * f.w, f.y + p[1] * f.h]);
  }
  function polyArea(r) {
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }
  function polyCentroid(r) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const k = p[0] * q[1] - q[0] * p[1];
      a += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k;
    }
    if (Math.abs(a) < 1e-9) return [r[0][0], r[0][1]];
    return [cx / (3 * a), cy / (3 * a)];
  }
  // kol kalınlığı (bu şekil için en dar kısım)
  function armFrac(shape, c) {
    if (shape === 'L') return 1 - c;
    if (shape === 'T') return Math.min(0.42, Math.max(0.25, 1 - 1.5 * c));
    if (shape === 'U') return Math.min((1 - c) / 2, 0.45);
    return 1;
  }

  /* ---------- çokgen geometrisi ---------- */
  function pointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function segCross(p, q, a, b) {
    const d = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
    return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
  }
  function inPoly(x, y, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  }
  function ringDist(ra, rb) {
    let best = Infinity;
    for (let i = 0; i < ra.length; i++) {
      const p = ra[i];
      for (let j = 0; j < rb.length; j++) {
        const a = rb[j], b = rb[(j + 1) % rb.length];
        const d = pointSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
      }
    }
    for (let j = 0; j < rb.length; j++) {
      const p = rb[j];
      for (let i = 0; i < ra.length; i++) {
        const a = ra[i], b = ra[(i + 1) % ra.length];
        const d = pointSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
      }
    }
    return best;
  }
  function ringsCross(ra, rb) {
    for (let i = 0; i < ra.length; i++) {
      const p = ra[i], q = ra[(i + 1) % ra.length];
      for (let j = 0; j < rb.length; j++) if (segCross(p, q, rb[j], rb[(j + 1) % rb.length])) return true;
    }
    return false;
  }
  const bboxGap = (a, b) => {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return Math.hypot(dx, dy);
  };
  const olen = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

  /* iki mekân arası: boşluk (m), ortak kenar uzunluğu (m), çakışma alanı (m²) */
  function pairInfo(A, B) {
    const bg = bboxGap(A, B);
    if (bg > 14) return { gap: bg, contact: 0, overlap: 0 };
    if (A.shape === 'rect' && B.shape === 'rect') {
      const ox = olen(A.x, A.x + A.w, B.x, B.x + B.w), oy = olen(A.y, A.y + A.h, B.y, B.y + B.h);
      if (ox > 1e-6 && oy > 1e-6) return { gap: 0, contact: 0, overlap: ox * oy };
      const contact = bg <= 0.2 ? Math.max(0, ox > 1e-6 ? ox : 0, oy > 1e-6 ? oy : 0) : 0;
      return { gap: bg, contact: contact, overlap: 0 };
    }
    // genel durum
    let inter = ringsCross(A.ring, B.ring);
    if (!inter) inter = inPoly(A.ring[0][0], A.ring[0][1], B.ring) || inPoly(B.ring[0][0], B.ring[0][1], A.ring);
    if (inter) {
      const x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w), y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
      let n = 0;
      const step = 0.25;
      for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) if (inPoly(x, y, A.ring) && inPoly(x, y, B.ring)) n++;
      return { gap: 0, contact: 0, overlap: n * step * step };
    }
    const gap = ringDist(A.ring, B.ring);
    let contact = 0;
    if (gap <= 0.2) {
      const step = 0.2;
      for (let i = 0; i < A.ring.length; i++) {
        const p = A.ring[i], q = A.ring[(i + 1) % A.ring.length];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const k = Math.max(1, Math.round(len / step));
        for (let m = 0; m < k; m++) {
          const t = (m + 0.5) / k, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
          let d = Infinity;
          for (let j = 0; j < B.ring.length; j++) { const a = B.ring[j], b = B.ring[(j + 1) % B.ring.length]; d = Math.min(d, pointSeg(x, y, a[0], a[1], b[0], b[1])); }
          if (d <= 0.2) contact += len / k;
        }
      }
    }
    return { gap: gap, contact: contact, overlap: 0 };
  }

  /* ---------- varsayılan şekil ve yerleşim ---------- */
  function defaultShape(s) {
    const asp = s.zone === 'sirkulasyon' ? 2.8 : 1.35;
    const w = Math.max(MIN_DIM, r1(Math.sqrt(s.area * asp)));
    const h = Math.max(MIN_DIM, r1(s.area / w));
    return { x: 0, y: 0, w: w, h: h, shape: 'rect', rot: 0, cut: 0.4 };
  }

  /* kurucu yerleşim: mekânlar tek tek, daha önce yerleşenlerin kenarlarına dayanarak eklenir.
     Maliyet: güçlü ilişkide bitişiklik, "ayrı tut"ta mesafe, kutu çevresinin büyümesi (kompaktlık),
     balon konumuna yakınlık. Çakışma olmaz. fixed: yerinde kalacak kimlikler · fromBubbles: tercih konumu */
  function autoPlace(spaces, relations, shapes, o) {
    o = o || {};
    const fixed = o.fixed || new Set();
    const ids = spaces.map((s) => s.id);
    const P = {};
    ids.forEach((id) => { P[id] = Object.assign({}, shapes[id]); });
    // tercih konumları (balonlardan)
    const pref = {};
    if (o.fromBubbles && spaces.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      spaces.forEach((s) => { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); });
      const total = U.sum(spaces, (s) => s.area) || 1;
      const span = Math.max(maxX - minX, maxY - minY, 1);
      const k = (Math.sqrt(total) * 1.5) / span;
      spaces.forEach((s) => { pref[s.id] = [(s.x - (minX + maxX) / 2) * k, (s.y - (minY + maxY) / 2) * k]; });
    }
    const W = { strong: 3, weak: 1, avoid: 2 };
    const rel = {};
    ids.forEach((id) => { rel[id] = []; });
    Object.keys(relations).forEach((key) => {
      const q = key.split('|');
      if (!P[q[0]] || !P[q[1]] || !W[relations[key]]) return;
      rel[q[0]].push([q[1], relations[key]]); rel[q[1]].push([q[0], relations[key]]);
    });
    const placed = [];
    const isPlaced = new Set();
    ids.forEach((id) => { if (fixed.has(id)) { placed.push(id); isPlaced.add(id); } });
    const todo = ids.filter((id) => !fixed.has(id));
    const ovl = (r, skip) => placed.some((id) => { if (id === skip) return false; const q = P[id]; return olen(r.x, r.x + r.w, q.x, q.x + q.w) > 0.01 && olen(r.y, r.y + r.h, q.y, q.y + q.h) > 0.01; });
    const bbox = () => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      placed.forEach((id) => { const q = P[id]; x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); });
      return [x0, y0, x1, y1];
    };
    while (todo.length) {
      // sıradaki: yerleşenlerle bağı en güçlü olan (yoksa en büyük)
      let bi = 0, bs = -1;
      todo.forEach((id, i) => {
        let sc = 0;
        rel[id].forEach((r) => { if (isPlaced.has(r[0]) && r[1] !== 'avoid') sc += W[r[1]]; });
        sc = sc * 1000 + P[id].w * P[id].h + (placed.length ? 0 : rel[id].length * 50);
        if (sc > bs) { bs = sc; bi = i; }
      });
      const id = todo.splice(bi, 1)[0];
      const f = P[id];
      if (!placed.length) { f.x = 0; f.y = 0; placed.push(id); isPlaced.add(id); continue; }
      const bb = bbox();
      const per0 = (bb[2] - bb[0]) + (bb[3] - bb[1]);
      let best = null;
      const cands = [];
      placed.forEach((qid) => {
        const q = P[qid];
        [q.y, q.y + q.h - f.h, q.y + (q.h - f.h) / 2].forEach((y) => { cands.push([q.x + q.w, y]); cands.push([q.x - f.w, y]); });
        [q.x, q.x + q.w - f.w, q.x + (q.w - f.w) / 2].forEach((x) => { cands.push([x, q.y + q.h]); cands.push([x, q.y - f.h]); });
        // ilişkili ortakla aynı hizada başlama
        rel[id].forEach((r) => {
          const t = P[r[0]];
          if (!t || !isPlaced.has(r[0])) return;
          cands.push([q.x + q.w, t.y]); cands.push([q.x - f.w, t.y]); cands.push([t.x, q.y + q.h]); cands.push([t.x, q.y - f.h]);
        });
      });
      cands.forEach((c) => {
        const r = { x: c[0], y: c[1], w: f.w, h: f.h };
        if (ovl(r, id)) return;
        let cost = 0;
        rel[id].forEach((e) => {
          if (!isPlaced.has(e[0])) return;
          const t = P[e[0]];
          const gap = bboxGap(r, t);
          const contact = gap <= 0.2 ? Math.max(0, olen(r.x, r.x + r.w, t.x, t.x + t.w), olen(r.y, r.y + r.h, t.y, t.y + t.h)) : 0;
          if (e[1] === 'strong') cost += 3 * (contact >= 0.8 ? 0 : 2 + gap);
          else if (e[1] === 'weak') cost += gap <= 6 ? 0.1 * gap : 0.6 + 0.3 * gap;
          else cost += gap < 2.5 ? 2 * (6 - gap * 2) : 0;
        });
        const nx0 = Math.min(bb[0], r.x), ny0 = Math.min(bb[1], r.y), nx1 = Math.max(bb[2], r.x + r.w), ny1 = Math.max(bb[3], r.y + r.h);
        cost += 0.45 * ((nx1 - nx0) + (ny1 - ny0) - per0) + 0.08 * Math.abs((nx1 - nx0) - (ny1 - ny0));
        if (pref[id]) cost += 0.03 * Math.hypot(r.x + r.w / 2 - pref[id][0], r.y + r.h / 2 - pref[id][1]);
        if (!best || cost < best.cost - 1e-9) best = { cost: cost, x: r.x, y: r.y };
      });
      if (best) { f.x = best.x; f.y = best.y; } else { f.x = bb[2] + 1; f.y = bb[1]; }
      placed.push(id); isPlaced.add(id);
    }
    const out = {};
    ids.forEach((id) => { const q = P[id]; out[id] = Object.assign({}, q, { x: r1(q.x), y: r1(q.y) }); });
    if (!o.keepOrigin) {
      let mx = Infinity, my = Infinity;
      ids.forEach((id) => { mx = Math.min(mx, out[id].x); my = Math.min(my, out[id].y); });
      if (isFinite(mx)) ids.forEach((id) => { out[id].x = r1(out[id].x - mx); out[id].y = r1(out[id].y - my); });
    }
    return out;
  }

  function freeInit(project) {
    const shapes = {};
    project.spaces.forEach((s) => { shapes[s.id] = defaultShape(s); });
    return { snap: 0.5, shapes: project.spaces.length ? autoPlace(project.spaces, project.relations, shapes, { fromBubbles: true }) : shapes };
  }

  /* bir mekân eklenince: mevcutlar yerinde, yeni olan ilişkilerine göre yerleşir */
  function freeAdd(project, free) {
    const shapes = Object.assign({}, free.shapes);
    const fresh = project.spaces.filter((s) => !shapes[s.id]);
    if (!fresh.length) return free;
    let x1 = 0, y0 = 0, y1 = 0;
    const have = project.spaces.filter((s) => shapes[s.id]);
    if (have.length) {
      x1 = Math.max.apply(null, have.map((s) => shapes[s.id].x + shapes[s.id].w));
      y0 = Math.min.apply(null, have.map((s) => shapes[s.id].y));
      y1 = Math.max.apply(null, have.map((s) => shapes[s.id].y + shapes[s.id].h));
    }
    fresh.forEach((s, i) => {
      const d = defaultShape(s);
      d.x = r1(x1 + 1.5); d.y = r1(y0 + ((y1 - y0) - d.h) / 2 + i * 0.5);
      shapes[s.id] = d;
    });
    const placed = autoPlace(project.spaces, project.relations, shapes, { fixed: new Set(have.map((s) => s.id)), iter: 90, keepOrigin: true });
    return Object.assign({}, free, { shapes: placed });
  }

  /* geçerli değerlere sıkıştır */
  function cleanShape(q, base) {
    const o = Object.assign({}, base || {}, q || {});
    return {
      x: r1(num(o.x, 0)), y: r1(num(o.y, 0)),
      w: U.clamp(r1(num(o.w, 3)), MIN_DIM, MAX_DIM), h: U.clamp(r1(num(o.h, 3)), MIN_DIM, MAX_DIM),
      shape: SHAPE_IDS.indexOf(o.shape) >= 0 ? o.shape : 'rect',
      rot: ((Math.round(num(o.rot, 0)) % 4) + 4) % 4,
      cut: U.clamp(Math.round(num(o.cut, 0.4) * 100) / 100, 0.15, 0.65),
    };
  }

  /* hedef alana oturt: ölçeği kareköküyle düzelt (en boy oranı korunur), merkez sabit */
  function fitToTarget(f, target) {
    const items = makeItem({ id: 'x', name: '', zone: 'sosyal', area: target }, f);
    const k = Math.sqrt(target / Math.max(0.01, items.area));
    const w = U.clamp(r1(f.w * k), MIN_DIM, MAX_DIM), h = U.clamp(r1(f.h * k), MIN_DIM, MAX_DIM);
    return Object.assign({}, f, { w: w, h: h, x: r1(f.x + (f.w - w) / 2), y: r1(f.y + (f.h - h) / 2) });
  }

  /* bir mekânı diğerine bitiştir (away: aralarını aç) — kutular çakışmaz */
  function attach(f, other, away) {
    const ca = [f.x + f.w / 2, f.y + f.h / 2], cb = [other.x + other.w / 2, other.y + other.h / 2];
    const dx = ca[0] - cb[0], dy = ca[1] - cb[1];
    const gap = away ? 3 : 0;
    const horiz = Math.abs(dx) / (f.w + other.w) >= Math.abs(dy) / (f.h + other.h);
    let x = f.x, y = f.y;
    if (horiz) {
      x = dx >= 0 ? other.x + other.w + gap : other.x - f.w - gap;
      y = U.clamp(f.y, other.y - f.h + 1.2, other.y + other.h - 1.2);
      if (away) y = f.y;
    } else {
      y = dy >= 0 ? other.y + other.h + gap : other.y - f.h - gap;
      x = U.clamp(f.x, other.x - f.w + 1.2, other.x + other.w - 1.2);
      if (away) x = f.x;
    }
    return Object.assign({}, f, { x: r1(x), y: r1(y) });
  }

  /* ---------- türetilmiş mekân ---------- */
  function makeItem(space, f) {
    const ring = ringOf(f);
    const area = polyArea(ring);
    const c = polyCentroid(ring);
    const arm = armFrac(f.shape, f.cut);
    const thick = Math.min(f.w, f.h) * (f.shape === 'rect' ? 1 : Math.max(arm, 0.3));
    return {
      id: space.id, spaceId: space.id, name: space.name, zone: space.zone, target: space.area,
      x: f.x, y: f.y, w: f.w, h: f.h, shape: f.shape, rot: f.rot, cut: f.cut,
      ring: ring, area: area, cx: c[0], cy: c[1], thick: thick, aspect: Math.max(f.w, f.h) / Math.max(0.01, Math.min(f.w, f.h)),
      dev: space.area ? (area - space.area) / space.area : 0,
    };
  }

  const STATE_LABEL = { adjacent: 'Bitişik', near: 'Yakın', far: 'Uzak', overlap: 'Çakışık' };
  function relEval(type, info) {
    const state = info.overlap > 0.4 ? 'overlap' : info.contact >= 0.8 ? 'adjacent' : info.gap <= 2.5 ? 'near' : 'far';
    let ok;
    if (type === 'strong') ok = state === 'adjacent' ? 1 : state === 'overlap' ? 0.5 : state === 'near' ? 0.55 : info.gap <= 6 ? 0.25 : 0;
    else if (type === 'weak') ok = info.gap <= 6 ? 1 : info.gap <= 12 ? 0.5 : 0;
    else ok = state === 'overlap' || state === 'adjacent' ? 0 : info.gap < 2 ? 0.4 : 1;
    return { state: state, ok: ok };
  }

  const LEVEL = { hata: 0, uyari: 1, oneri: 2, ok: 3 };

  const memo = { k: null, v: null };
  function freeDerive(project) {
    const free = project.study && project.study.free;
    const key = [project.spaces, project.relations, free];
    if (memo.k && memo.k.every((x, i) => x === key[i])) return memo.v;
    const out = compute(project, free);
    memo.k = key; memo.v = out;
    return out;
  }

  function compute(project, free) {
    const items = [];
    const byId = new Map();
    project.spaces.forEach((s) => {
      const f = free && free.shapes[s.id] ? cleanShape(free.shapes[s.id]) : defaultShape(s);
      const it = makeItem(s, f);
      items.push(it); byId.set(it.id, it);
    });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach((it) => { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); });
    const bounds = items.length ? { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 } : { x0: 0, y0: 0, x1: 20, y1: 12, w: 20, h: 12 };

    // çiftler: ilişkili olanlar + çakışanlar
    const pairs = [];
    const seen = new Set();
    Object.keys(project.relations).forEach((key) => {
      const q = key.split('|');
      const A = byId.get(q[0]), B = byId.get(q[1]);
      if (!A || !B) return;
      const type = project.relations[key];
      const info = pairInfo(A, B);
      const ev = relEval(type, info);
      pairs.push({ key: key, a: A.id, b: B.id, type: type, gap: info.gap, contact: info.contact, overlap: info.overlap, state: ev.state, ok: ev.ok });
      seen.add(key);
    });
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (bboxGap(A, B) > 0) continue;
      const key = U.pairKey(A.id, B.id);
      const p = pairs.find((q) => q.key === key);
      const info = p ? p : pairInfo(A, B);
      if (info.overlap > 0.4) overlaps.push({ a: A.id, b: B.id, overlap: info.overlap });
    }

    // skor
    const W = { strong: 3, weak: 1, avoid: 2 };
    let rs = 0, rw = 0, strongOk = 0, strongTotal = 0;
    pairs.forEach((p) => { rs += W[p.type] * p.ok; rw += W[p.type]; if (p.type === 'strong') { strongTotal++; if (p.state === 'adjacent') strongOk++; } });
    const relScore = rw ? rs / rw : null;
    const total = U.sum(items, (it) => it.area);
    const ovArea = U.sum(overlaps, (o) => o.overlap);
    const ovScore = overlaps.length ? Math.max(0, 1 - ovArea / (0.05 * (total || 1))) : 1;
    const fit = items.length ? U.sum(items, (it) => 1 - Math.min(1, Math.abs(it.dev) / 0.3)) / items.length : 1;
    const compact = bounds.w * bounds.h ? Math.min(1, total / (bounds.w * bounds.h) / 0.55) : 1;
    const parts = relScore == null
      ? [{ k: 'Çakışmasızlık', v: ovScore, w: 0.45 }, { k: 'Alan uyumu', v: fit, w: 0.35 }, { k: 'Kompaktlık', v: compact, w: 0.2 }]
      : [{ k: 'İlişki uyumu', v: relScore, w: 0.5 }, { k: 'Çakışmasızlık', v: ovScore, w: 0.2 }, { k: 'Alan uyumu', v: fit, w: 0.2 }, { k: 'Kompaktlık', v: compact, w: 0.1 }];
    const score = items.length ? Math.round(parts.reduce((t, p) => t + p.v * p.w, 0) * 100) : null;
    const metrics = { score: score, parts: parts, relScore: relScore, strongOk: strongOk, strongTotal: strongTotal, overlapCount: overlaps.length, overlapArea: ovArea, areaFit: fit, total: total, target: U.sum(items, (it) => it.target), compact: compact, count: items.length };

    return { items: items, byId: byId, bounds: bounds, pairs: pairs, overlaps: overlaps, metrics: metrics, findings: findings(project, items, byId, pairs, overlaps, metrics) };
  }

  function findings(project, items, byId, pairs, overlaps, m) {
    const out = [];
    const nm = (id) => byId.get(id).name;
    if (!items.length) {
      out.push({ id: 'empty', level: 'oneri', title: 'Önce işlev şemasında mekân ekleyin', detail: 'Mekân etüdü, İşlev Şeması’ndaki mekânları ölçekli birimlere dönüştürür.', src: [], actions: [{ type: 'goto', module: 'islev', label: 'İşlev Şeması’na git' }] });
      return { items: out, counts: { hata: 0, uyari: 0, oneri: 1 } };
    }
    overlaps.slice(0, 5).forEach((o) => out.push({ id: 'ov-' + o.a + o.b, level: 'hata', title: nm(o.a) + ' ile ' + nm(o.b) + ' çakışıyor (≈ ' + fmt(o.overlap, 1) + ' m²)', detail: 'İki mekân aynı alanı kaplıyor. Birini kaydırın, küçültün ya da “Bitiştir” ile yan yana alın.', src: [], actions: [{ type: 'freeAttach', id: o.a, to: o.b, label: nm(o.a) + ' → yanına al' }, { type: 'select', id: o.a, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'avoid' && (p.state === 'adjacent' || p.state === 'overlap')).slice(0, 4).forEach((p) => out.push({ id: 'avoid-' + p.key, level: 'uyari', title: nm(p.a) + ' ile ' + nm(p.b) + ' bitişik ama ayrı tutulmalı', detail: 'Bu çift “ayrı tut” olarak işaretli (gürültü, koku, mahremiyet). Aralarını açın.', src: ['White'], actions: [{ type: 'freeAttach', id: p.a, to: p.b, away: true, label: nm(p.a) + ' → uzaklaştır' }, { type: 'select', id: p.a, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'strong' && p.state === 'far').slice(0, 5).forEach((p) => out.push({ id: 'far-' + p.key, level: 'uyari', title: nm(p.a) + ' ile ' + nm(p.b) + ' yakın olmalı ama ' + fmt(p.gap, 1) + ' m uzakta', detail: 'Güçlü ilişkili mekânlar bitişik ya da en fazla kısa bir geçişle ayrılmış olmalı.', src: ['White'], actions: [{ type: 'freeAttach', id: p.a, to: p.b, label: nm(p.a) + ' → bitiştir' }, { type: 'select', id: p.a, label: 'Göster' }] }));
    pairs.filter((p) => p.type === 'strong' && p.state === 'near').slice(0, 4).forEach((p) => out.push({ id: 'near-' + p.key, level: 'oneri', title: nm(p.a) + ' ile ' + nm(p.b) + ' arasında ' + fmt(p.gap, 1) + ' m boşluk var', detail: 'Aralarındaki küçük boşluğu kapatın ya da bir geçiş (koridor, kapı) tanımlayın.', src: ['White'], actions: [{ type: 'freeAttach', id: p.a, to: p.b, label: nm(p.a) + ' → bitiştir' }, { type: 'select', id: p.a, label: 'Göster' }] }));
    items.filter((it) => Math.abs(it.dev) > 0.15).slice(0, 4).forEach((it) => out.push({ id: 'dev-' + it.id, level: 'oneri', title: it.name + ' hedef alandan %' + Math.round(Math.abs(it.dev) * 100) + (it.dev > 0 ? ' büyük' : ' küçük') + ' (' + fmt(it.area, 1) + ' / ' + fmt(it.target, 1) + ' m²)', detail: 'İşlev şemasındaki alan programı ' + fmt(it.target, 1) + ' m². Hedefe oturtun ya da yeni alanı şemaya işleyin.', src: [], actions: [{ type: 'freeFit', id: it.id, label: 'Hedef alana oturt' }, { type: 'select', id: it.id, label: 'Göster' }] }));
    items.filter((it) => it.zone !== 'sirkulasyon' && (it.thick < 1.4 || it.aspect > 4)).slice(0, 3).forEach((it) => out.push({ id: 'thin-' + it.id, level: 'oneri', title: it.name + ' çok dar kalıyor (' + fmt(Math.min(it.w, it.h), 1) + ' × ' + fmt(Math.max(it.w, it.h), 1) + ' m)', detail: 'Bu oranda mekân kullanışlı olmaz. Boyutları ya da şekli değiştirin.', src: ['S'], actions: [{ type: 'select', id: it.id, label: 'Göster' }] }));
    out.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    out.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    if (!counts.hata && !counts.uyari) out.unshift({ id: 'ok', level: 'ok', title: 'Mekânlar arası yerleşimde kritik sorun görünmüyor', detail: m.score != null ? 'Düzen skoru %' + m.score + '.' : 'İlişkileri tanımlayarak skoru başlatın.', src: [], actions: [] });
    return { items: out, counts: counts };
  }

  /* bir mekânın diğerleriyle ilişkileri (yan panel) */
  function relationsOf(project, fd, id) {
    const list = [];
    fd.items.forEach((o) => {
      if (o.id === id) return;
      const key = U.pairKey(id, o.id);
      const type = project.relations[key] || 'none';
      const p = fd.pairs.find((q) => q.key === key);
      let info;
      if (p) info = p; else { const a = fd.byId.get(id); info = Object.assign(pairInfo(a, o), {}); const ev = relEval('weak', info); info.state = ev.state; }
      list.push({ id: o.id, name: o.name, zone: o.zone, type: type, gap: info.gap, state: info.state, ok: p ? p.ok : null });
    });
    const rank = { strong: 0, avoid: 1, weak: 2, none: 3 };
    list.sort((a, b) => rank[a.type] - rank[b.type] || a.gap - b.gap);
    return list;
  }

  Object.assign(st, {
    SHAPES: SHAPES, FREE_MIN: MIN_DIM, FREE_MAX: MAX_DIM, STATE_LABEL: STATE_LABEL,
    freeInit: freeInit, freeAdd: freeAdd, freeAutoPlace: autoPlace, freeDefault: defaultShape, freeClean: cleanShape, freeFit: fitToTarget, freeAttach: attach,
    freeDerive: freeDerive, freeRelationsOf: relationsOf, freeRing: ringOf, freePairInfo: pairInfo, polyArea: polyArea,
  });
})();

/* çalışma kipi: 'mekanlar' (serbest düzen) | 'katlar' (kat planları) — tarayıcıda hatırlanır */
(function () {
  const App = window.App;
  App.study.modeOf = function (state) {
    const m = state.ui && state.ui.stMode;
    if (m === 'katlar' || m === 'mekanlar') return m;
    try { if (window.localStorage.getItem('archtools.study.mode') === 'katlar') return 'katlar'; } catch (e) {}
    return 'mekanlar';
  };
})();
