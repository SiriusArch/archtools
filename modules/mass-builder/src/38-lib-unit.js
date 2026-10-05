/* ==========================================================================
   38-lib-unit.js — Modül 9 · Birim Oluşturucu: veri modeli ve hesaplar (saf fonksiyonlar)
   Fikir: bir yapı kütlesi (birim) kurulur, sonra adım adım şekillendirilir. Her adım, bir önceki adımın
          kopyasıdır; üzerinde istediğiniz değişiklik yapılır. Adımlar yan yana "süreç paftası" olur.
   Veri : project.unit = { v, title, site{w,d}, ctxSeed, ctxDens, ctx[], steps[], cur, snap }
          step = { id, title, sub, desc, els[] }
          el   = mass { t:'mass', x, y, w, d, shape, rot, cut, floors, roof }
               | void { t:'void', x, y, w, d }            (oyuk / avlu / boşluk)
               | green { t:'green', x, y, w, d, round }   (peyzaj alanı)
               | tree { t:'tree', x, y, r }
               | arrow { t:'arrow', k:'flow'|'through'|'entry', x1, y1, x2, y2 }
   Birim: metre. x = doğu (sağ), y = güney (aşağı). Parsel (0,0)–(site.w, site.d).
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const unit = (App.unit = {});

  const FH = 3.2; // kat yüksekliği (m)
  const r1 = (v) => Math.round(v * 10) / 10;
  const num = (v, d) => (isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
  const uid = () => 'u' + Math.random().toString(36).slice(2, 8);
  const SHAPES = ['rect', 'L', 'T', 'U'];
  const AK = ['flow', 'through', 'entry'];

  unit.FH = FH;
  unit.SHAPES = [{ v: 'rect', label: 'Dikdörtgen' }, { v: 'L', label: 'L' }, { v: 'T', label: 'T' }, { v: 'U', label: 'U' }];
  unit.ARROW_KINDS = [{ v: 'flow', label: 'Yaya akışı' }, { v: 'through', label: 'Geçit' }, { v: 'entry', label: 'Ana giriş' }];

  /* ---------- tohumlu rastgele ---------- */
  function rng(seed) {
    let a = (seed >>> 0) + 0x6d2b79f5;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  unit.rng = rng;

  /* ---------- bağlam: parselin çevresinde gri mevcut yapılar ---------- */
  function genCtx(site, seed, dens) {
    const R = rng(seed * 7919 + 13);
    const out = [];
    const street = 6, gap = 4, reach = 48;
    const span = (len, cell) => {
      // parsel çevresinde: orta sütunlar (parsel genişliği) + iki yanda dışa doğru sütunlar
      const cols = [];
      const n = Math.max(1, Math.round((len + 2 * street) / (cell + gap)));
      const cw = (len + 2 * street - (n - 1) * gap) / n;
      for (let i = 0; i < n; i++) cols.push({ a: -street + i * (cw + gap), b: -street + i * (cw + gap) + cw, mid: true });
      for (let k = 0; k * (cell + gap) < reach; k++) {
        cols.push({ a: -street - k * (cell + gap) - cell, b: -street - k * (cell + gap), mid: false });
        cols.push({ a: len + street + k * (cell + gap), b: len + street + k * (cell + gap) + cell, mid: false });
      }
      return cols;
    };
    const cx = span(site.w, 18), cy = span(site.d, 16);
    cx.forEach((c) => cy.forEach((r) => {
      if (c.mid && r.mid) return; // parsel + sokak şeridi
      if (R() > dens) return;
      const cw = c.b - c.a, rd = r.b - r.a;
      const w = r1(cw * (0.6 + R() * 0.4)), d = r1(rd * (0.55 + R() * 0.45));
      const x = r1(c.a + (cw - w) * R()), y = r1(r.a + (rd - d) * R());
      out.push({ id: uid(), x: x, y: y, w: w, d: d, h: r1(FH * (2 + Math.floor(R() * 5))) });
    }));
    return out;
  }
  unit.genCtx = genCtx;

  /* ---------- öğe fabrikaları ---------- */
  const make = {
    mass: (shape, site, n) => {
      const w = Math.max(8, r1(site.w * 0.3)), d = Math.max(8, r1(site.d * 0.22));
      return { id: uid(), t: 'mass', x: r1(site.w / 2 - w / 2 + (n || 0) * 3), y: r1(site.d / 2 - d / 2 + (n || 0) * 3), w: w, d: d, shape: shape || 'rect', rot: 0, cut: 0.4, floors: 5, roof: 'plain' };
    },
    void: (site, n) => ({ id: uid(), t: 'void', x: r1(site.w * 0.35 + (n || 0) * 2), y: r1(site.d * 0.35 + (n || 0) * 2), w: r1(site.w * 0.3), d: r1(site.d * 0.3) }),
    green: (site, n) => ({ id: uid(), t: 'green', x: r1(site.w * 0.3 + (n || 0) * 2), y: r1(site.d * 0.3 + (n || 0) * 2), w: r1(site.w * 0.4), d: r1(site.d * 0.3), round: true }),
    tree: (site, n) => ({ id: uid(), t: 'tree', x: r1(site.w / 2 + ((n || 0) % 5) * 3 - 6), y: r1(site.d / 2 + Math.floor((n || 0) / 5) * 3), r: 2.4 }),
    arrow: (k, site, n) => ({ id: uid(), t: 'arrow', k: k || 'flow', x1: r1(site.w * 0.2), y1: r1(site.d * 0.5 + (n || 0) * 2), x2: r1(site.w * 0.8), y2: r1(site.d * 0.5 + (n || 0) * 2) }),
  };
  unit.make = make;

  /* ---------- doğrulama ---------- */
  function clean(el, patch) {
    const o = Object.assign({}, el, patch || {});
    const t = o.t;
    const cl = (v, a, b, d) => U.clamp(num(v, d), a, b);
    const base = { id: o.id, t: t };
    if (t === 'mass') return Object.assign(base, { x: r1(cl(o.x, -500, 800, 0)), y: r1(cl(o.y, -500, 800, 0)), w: r1(cl(o.w, 1, 400, 10)), d: r1(cl(o.d, 1, 400, 10)), shape: SHAPES.indexOf(o.shape) >= 0 ? o.shape : 'rect', rot: ((Math.round(num(o.rot, 0)) % 4) + 4) % 4, cut: Math.round(cl(o.cut, 0.15, 0.65, 0.4) * 100) / 100, floors: Math.round(cl(o.floors, 1, 80, 5)), roof: o.roof === 'green' ? 'green' : 'plain' });
    if (t === 'void') return Object.assign(base, { x: r1(cl(o.x, -500, 800, 0)), y: r1(cl(o.y, -500, 800, 0)), w: r1(cl(o.w, 1, 400, 10)), d: r1(cl(o.d, 1, 400, 10)) });
    if (t === 'green') return Object.assign(base, { x: r1(cl(o.x, -500, 800, 0)), y: r1(cl(o.y, -500, 800, 0)), w: r1(cl(o.w, 1, 400, 10)), d: r1(cl(o.d, 1, 400, 10)), round: o.round !== false });
    if (t === 'tree') return Object.assign(base, { x: r1(cl(o.x, -500, 800, 0)), y: r1(cl(o.y, -500, 800, 0)), r: r1(cl(o.r, 0.8, 12, 2.4)) });
    if (t === 'arrow') return Object.assign(base, { k: AK.indexOf(o.k) >= 0 ? o.k : 'flow', x1: r1(cl(o.x1, -500, 800, 0)), y1: r1(cl(o.y1, -500, 800, 0)), x2: r1(cl(o.x2, -500, 800, 0)), y2: r1(cl(o.y2, -500, 800, 0)) });
    return null;
  }
  unit.clean = clean;

  const cloneEls = (els) => els.map((e) => Object.assign({}, e, { id: uid() }));
  unit.cloneEls = cloneEls;
  unit.newStep = (title, sub, desc, els) => ({ id: uid(), title: String(title || 'Yeni adım').slice(0, 40), sub: String(sub || '').slice(0, 40), desc: String(desc || '').slice(0, 400), els: els || [] });

  /* ---------- geometri ---------- */
  unit.ring = function (m) {
    return App.study.freeRing({ x: m.x, y: m.y, w: m.w, h: m.d, shape: m.shape, rot: m.rot, cut: m.cut });
  };
  unit.massArea = (m) => App.study.polyArea(unit.ring(m));

  // bir kütleyi bölmek: eksen 'x' (dikey kesit, sol-sağ) | 'y'; oran 0–1; aralık m
  unit.split = function (m, axis, ratio, gap) {
    ratio = U.clamp(ratio || 0.5, 0.2, 0.8); gap = gap == null ? 4 : gap;
    const a = Object.assign({}, m, { id: uid(), shape: 'rect', rot: 0 }), b = Object.assign({}, m, { id: uid(), shape: 'rect', rot: 0 });
    if (axis === 'y') {
      const h1 = r1((m.d - gap) * ratio), h2 = r1(m.d - gap - h1);
      a.d = Math.max(1, h1); b.d = Math.max(1, h2); b.y = r1(m.y + a.d + gap);
    } else {
      const w1 = r1((m.w - gap) * ratio), w2 = r1(m.w - gap - w1);
      a.w = Math.max(1, w1); b.w = Math.max(1, w2); b.x = r1(m.x + a.w + gap);
    }
    return [a, b];
  };

  /* ---------- ölçüler (adım başına) ---------- */
  unit.metrics = function (u, step) {
    const site = u.site;
    const A = Math.max(1, site.w * site.d);
    let foot = 0, gfa = 0, maxF = 0, maxH = 0, nMass = 0, green = 0, roofG = 0, voidA = 0, trees = 0, arrows = 0;
    step.els.forEach((e) => {
      if (e.t === 'mass') {
        const a = unit.massArea(e);
        foot += a; gfa += a * e.floors; nMass++;
        maxF = Math.max(maxF, e.floors); maxH = Math.max(maxH, e.floors * FH);
        if (e.roof === 'green') roofG += a;
      } else if (e.t === 'green') green += e.w * e.d * (e.round ? Math.PI / 4 : 1);
      else if (e.t === 'void') voidA += e.w * e.d;
      else if (e.t === 'tree') trees++;
      else if (e.t === 'arrow') arrows++;
    });
    const greenAll = Math.min(A, green + roofG);
    return { siteArea: A, footprint: foot, gfa: gfa, taks: foot / A, kaks: gfa / A, maxFloors: maxF, maxHeight: maxH, masses: nMass, green: green, roofGreen: roofG, greenShare: greenAll / A, openArea: Math.max(0, A - foot), voidArea: voidA, trees: trees, arrows: arrows };
  };

  /* ---------- ortak: sahne sınırları ve ölçek (tüm adımlar için aynı kamera) ---------- */
  unit.bounds = function (u, steps) {
    let x0 = -4, y0 = -4, x1 = u.site.w + 4, y1 = u.site.d + 4, hMax = 0;
    const acc = (x, y, w, d) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + d); };
    u.ctx.forEach((c) => { acc(c.x, c.y, c.w, c.d); hMax = Math.max(hMax, c.h); });
    steps.forEach((s) => s.els.forEach((e) => {
      if (e.t === 'mass' || e.t === 'void' || e.t === 'green') acc(e.x, e.y, e.w, e.d);
      if (e.t === 'mass') hMax = Math.max(hMax, e.floors * FH);
      if (e.t === 'tree') acc(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
      if (e.t === 'arrow') acc(Math.min(e.x1, e.x2), Math.min(e.y1, e.y2), Math.abs(e.x2 - e.x1), Math.abs(e.y2 - e.y1));
    }));
    return { x0: x0, y0: y0, x1: x1, y1: y1, hMax: hMax };
  };

  /* ---------- hazır akışlar ---------- */
  function scatterTrees(R, site, n, avoid, rMin, rMax) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 40) {
      const x = r1(R() * site.w), y = r1(R() * site.d), r = r1(rMin + R() * (rMax - rMin));
      if (avoid && avoid.some((m) => x > m.x - r && x < m.x + m.w + r && y > m.y - r && y < m.y + m.d + r)) continue;
      out.push({ id: uid(), t: 'tree', x: x, y: y, r: r });
    }
    return out;
  }

  unit.preset = function (kind, u) {
    const S = u.site;
    const R = rng(u.ctxSeed * 31 + 5);
    if (kind === 'bos') return [unit.newStep('Bağlam', 'Anla', 'Parsel, çevre yapı dokusu ve mevcut yeşil.', [])];
    const inset = Math.max(2, r1(Math.min(S.w, S.d) * 0.04)), bar = Math.max(9, r1(Math.min(S.w, S.d) * 0.22));
    const mk = (x, y, w, d, f) => Object.assign(make.mass('rect', S), { x: r1(x), y: r1(y), w: r1(w), d: r1(d), floors: f });
    const trees0 = scatterTrees(R, S, 9, null, 1.6, 3.2);
    const s1 = unit.newStep('Bağlam', 'Anla', 'Kentsel doku, çevre yapılar, mevcut yeşil yapı ve parsel koşullarının okunması.', trees0);
    // 2 · yoğunluk: çevre bloğu
    const ring = [
      mk(inset, inset, S.w - 2 * inset, bar, 6), mk(inset, S.d - inset - bar, S.w - 2 * inset, bar, 6),
      mk(inset, inset + bar, bar, S.d - 2 * inset - 2 * bar, 5), mk(S.w - inset - bar, inset + bar, bar, S.d - 2 * inset - 2 * bar, 5),
    ];
    const s2 = unit.newStep('Yoğunluk', 'Kentsel kenar kur', 'Sokak hizasını izleyen güçlü bir kent kenarı kurulur; yoğunluk blok çevresinde toplanır.', cloneEls(trees0).concat(ring));
    // 3 · boşluk: oyulmuş kütle
    const gap = Math.max(5, r1(Math.min(S.w, S.d) * 0.1));
    const carved = [];
    ring.forEach((m, i) => {
      const axis = i < 2 ? 'x' : 'y';
      const parts = unit.split(m, axis, 0.45 + (i % 2) * 0.1, gap);
      parts[0].floors = [8, 5, 6, 4][i]; parts[1].floors = [5, 8, 4, 7][i];
      carved.push(parts[0], parts[1]);
    });
    const courtyard = Object.assign(make.void(S), { x: r1(inset + bar + 2), y: r1(inset + bar + 2), w: r1(S.w - 2 * (inset + bar) - 4), d: r1(S.d - 2 * (inset + bar) - 4) });
    const s3 = unit.newStep('Boşluk', 'Işık ve hava için oy', 'Stratejik çıkarma ile avlular, geri çekilmeler ve kuşatma boyunca geçitler açılır; ışık, hava ve ferahlık kazanılır.', cloneEls(trees0).concat(carved, [courtyard]));
    // 4 · akış
    const cx = S.w / 2, cy = S.d / 2;
    const arrows = [
      Object.assign(make.arrow('flow', S), { x1: r1(cx), y1: r1(-3), x2: r1(cx), y2: r1(cy - 4) }),
      Object.assign(make.arrow('flow', S), { x1: r1(S.w + 3), y1: r1(cy), x2: r1(cx + 4), y2: r1(cy) }),
      Object.assign(make.arrow('flow', S), { x1: r1(cx), y1: r1(S.d + 3), x2: r1(cx), y2: r1(cy + 4) }),
      Object.assign(make.arrow('through', S), { x1: r1(-3), y1: r1(cy), x2: r1(S.w + 3), y2: r1(cy) }),
      Object.assign(make.arrow('through', S), { x1: r1(cx), y1: r1(-3), x2: r1(cx), y2: r1(S.d + 3) }),
      Object.assign(make.arrow('entry', S), { x1: r1(cx), y1: r1(-1), x2: r1(cx), y2: r1(3) }),
    ];
    const s4 = unit.newStep('Akış', 'Bağla ve geçirgenleştir', 'Girişler, yaya bağlantıları ve sokak bağları ağı kurulur; geçirgenlik ve yön bulma güçlenir.', cloneEls(carved).concat(cloneEls(trees0), [courtyard].map((v) => Object.assign({}, v, { id: uid() })), arrows.map((a) => Object.assign({}, a, { id: uid() }))));
    // 5 · peyzaj
    const greenMass = carved.map((m) => Object.assign({}, m, { id: uid(), roof: 'green' }));
    const lawn = Object.assign(make.green(S), { x: courtyard.x, y: courtyard.y, w: courtyard.w, d: courtyard.d, round: true });
    const avoid = greenMass;
    const trees5 = scatterTrees(R, S, 26, avoid, 1.4, 3.0);
    const s5 = unit.newStep('Peyzaj', 'Yeşillendir', 'Birden çok seviyede yeşil: avlular, çatılar ve sokaklar; dayanıklı bir ekolojik kent habitatı.', greenMass.concat([lawn], trees5, arrows.filter((a) => a.k !== 'entry').map((a) => Object.assign({}, a, { id: uid() }))));
    // 6 · aktivasyon
    const trees6 = trees5.concat(scatterTrees(R, S, 14, avoid, 1.2, 2.2).map((t) => Object.assign(t, { r: Math.min(t.r, 1.8) })));
    const s6 = unit.newStep('Aktivasyon', 'İnsan ve program', 'Aktif cepheler, kamusal alan, ortak avlu ve çeşitli işlevlerle kenti canlandıran karma kullanımlı blok.', greenMass.map((m) => Object.assign({}, m, { id: uid() })).concat([Object.assign({}, lawn, { id: uid() })], trees6.map((t) => Object.assign({}, t, { id: uid() })), arrows.map((a) => Object.assign({}, a, { id: uid() }))));
    if (kind === 'kisa') return [s1, s2, s3, s5];
    return [s1, s2, s3, s4, s5, s6];
  };

  unit.init = function (project) {
    const site = { w: 60, d: 60 };
    const u = { v: 1, title: '', site: site, ctxSeed: 3, ctxDens: 0.7, ctx: genCtx(site, 3, 0.7), steps: [], cur: 0, snap: 1 };
    u.steps = [unit.newStep('Bağlam', 'Anla', 'Parsel, çevre yapı dokusu ve mevcut yeşil.', [])];
    return u;
  };

  /* ---------- JSON uzantısı için kütle düz listesi ---------- */
  unit.flatMasses = function (u, step) {
    return step.els.filter((e) => e.t === 'mass').map((m) => ({ id: m.id, ring: unit.ring(m), height: m.floors * FH, floors: m.floors, area: unit.massArea(m) }));
  };
})();
