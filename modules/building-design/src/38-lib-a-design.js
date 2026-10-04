/* ==========================================================================
   38-lib-a-design.js — Tasarım Üretici: kütle alternatifleri, tipik kat planı, daire karması,
   çekirdek, taşıyıcı sistem aksı, bodrum otopark ve puanlama (Modül 7)
   Parsel + imar (Z.compute) + program → alternatifler. Saf mantık: arayüz bilmez, DOM yok.
   Birim: metre / m². Yerel koordinat: x = doğu, y = kuzey; parsel CCW halka [[x,y],...].
   Yük sırası: 36 (gis) < 37 (ifc) < 38 (bu dosya) < 39 (zoning) — App.zoning yalnızca çağrı anında okunur.
   İç düzen: her kanat (parça) kendi "ab" çerçevesinde çözülür: a = uzun eksen (koşu), b = derinlik.
   ========================================================================== */
(function () {
  const App = window.App;
  const D = (App.design = {});
  const G = () => App.gis;
  const Z = () => App.zoning;

  /* ---------------- küçük yardımcılar ---------------- */
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const fin = (v, d) => { v = Number(v); return isFinite(v) ? v : d; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const rp = (p) => [r2(p[0]), r2(p[1])];
  const rpoly = (ps) => ps.map(rp);
  const sarea = (p) => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const aabs = (p) => Math.abs(sarea(p));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const near = (a, b, e) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;

  // ardışık tekrar eden ve doğrusal (aynı doğru üzerinde) köşeleri at
  function tidy(p) {
    if (!p) return null;
    let q = [];
    p.forEach((v) => { if (!q.length || !near(q[q.length - 1], v, 1e-5)) q.push(v); });
    while (q.length > 1 && near(q[0], q[q.length - 1], 1e-5)) q.pop();
    let ch = true, guard = 0;
    while (ch && q.length >= 3 && guard++ < 50) {
      ch = false;
      const o = [];
      for (let i = 0; i < q.length; i++) {
        const a = q[(i + q.length - 1) % q.length], b = q[i], c = q[(i + 1) % q.length];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (l < 1e-9 || Math.abs(cr) <= 1e-7 * Math.max(1, l)) { ch = true; continue; }
        o.push(b);
      }
      q = o;
    }
    return q.length >= 3 ? q : null;
  }

  // dikdörtgenle kırp (ab çerçevesi; kırpma çokgeni dışbükey CCW)
  function clipRect(poly, a0, b0, a1, b1) {
    if (!(a1 - a0 > 1e-6) || !(b1 - b0 > 1e-6)) return null;
    const c = G().clipPoly(poly, [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]);
    const t = tidy(c);
    return t && aabs(t) > 0.05 ? t : null;
  }

  /* kenar sadeleştirmeli birleşim: bitişik çokgenlerin ortak kenarları iptal olur, T-birleşimleri bölünür.
     Dönüş: halka listesi (büyükten küçüğe) */
  function unionLoops(list) {
    list = list.filter((p) => p && p.length >= 3).map((p) => (sarea(p) >= 0 ? p : p.slice().reverse()));
    if (!list.length) return [];
    if (list.length === 1) return [list[0]];
    const K = (p) => Math.round(p[0] * 500) + ',' + Math.round(p[1] * 500);
    const allV = [];
    list.forEach((p) => p.forEach((v) => allV.push(v)));
    const cancel = new Map();
    list.forEach((p) => {
      const n = p.length, ring = [];
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[(i + 1) % n];
        ring.push(a);
        const ins = [];
        allV.forEach((v) => {
          if (K(v) === K(a) || K(v) === K(b)) return;
          const q = G().nearestOnSeg(v[0], v[1], a[0], a[1], b[0], b[1]);
          if (q.d < 2e-3 && q.t > 0 && q.t < 1) ins.push([q.t, v]);
        });
        ins.sort((x, y) => x[0] - y[0]);
        ins.forEach((x) => ring.push(x[1]));
      }
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (K(a) === K(b)) continue;
        const kf = K(a) + '>' + K(b), kr = K(b) + '>' + K(a);
        if (cancel.has(kr)) cancel.delete(kr); else cancel.set(kf, [a, b]);
      }
    });
    const next = new Map();
    cancel.forEach((e, k) => { const s = K(e[0]); if (!next.has(s)) next.set(s, []); next.get(s).push(e); });
    const loops = [];
    let guard = 0;
    while (guard++ < 400) {
      let start = null;
      for (const [s, arr] of next) { if (arr.length) { start = arr[0]; break; } }
      if (!start) break;
      const loop = [start[0]];
      let cur = start;
      next.get(K(cur[0])).shift();
      let g2 = 0;
      while (g2++ < 2000) {
        loop.push(cur[1]);
        const arr = next.get(K(cur[1]));
        if (!arr || !arr.length) break;
        cur = arr.shift();
        if (K(cur[1]) === K(start[0])) { break; }
      }
      const t = tidy(loop);
      if (t && aabs(t) > 0.05) loops.push(t);
    }
    loops.sort((x, y) => aabs(y) - aabs(x));
    return loops.length ? loops : [list[0]];
  }
  const unionPolys = (list) => unionLoops(list)[0] || null;

  // çerçeve: o = başlangıç, ea = birim yön, eb = ea'nın sol dik yönü (sağ-el)
  function mkFrame(o, ea) {
    const eb = [-ea[1], ea[0]];
    return {
      o: o, ea: ea, eb: eb,
      toAB: (p) => [(p[0] - o[0]) * ea[0] + (p[1] - o[1]) * ea[1], (p[0] - o[0]) * eb[0] + (p[1] - o[1]) * eb[1]],
      toW: (q) => [o[0] + q[0] * ea[0] + q[1] * eb[0], o[1] + q[0] * ea[1] + q[1] * eb[1]],
    };
  }
  const rectPoly = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];

  /* ---------------- program verileri ---------------- */
  D.MIX_TYPES = [
    { id: '1+0', label: '1+0 stüdyo', area: 48 },
    { id: '1+1', label: '1+1', area: 68 },
    { id: '2+1', label: '2+1', area: 100 },
    { id: '3+1', label: '3+1', area: 135 },
    { id: '4+1', label: '4+1', area: 180 },
  ];
  const TYPE_IDS = D.MIX_TYPES.map((t) => t.id);
  const NET_RATIO = 0.85;      // net / brüt daire alanı
  const MIN_FLAT = 35;         // m² altı daire üretilmez
  const CORE_B = 5.0;          // çekirdek derinliği (b yönü)
  const CORE_A = 5.4;          // çekirdek genişliği (a yönü)
  const STOREY_B = 3.0;        // bodrum kat yüksekliği

  D.defaults = function () {
    return {
      mix: { '1+1': 0.25, '2+1': 0.5, '3+1': 0.25 }, areas: {}, access: 'auto', bay: 5.5, grid: true, travel: 30,
      wallExt: 0.3, wallInt: 0.12,
      park: { stall: [2.5, 5.0], aisle: 6.0, ramp: 3.5, perUnit: null },
      ground: 'konut', groundH: null, sel: null, alts: null,
    };
  };

  D.clamp = function (x) {
    const d = D.defaults();
    x = x && typeof x === 'object' ? x : {};
    const o = {};
    // karma: tür başına pay, toplam 1
    const mix = {};
    let sum = 0;
    TYPE_IDS.forEach((id) => { const v = Number(x.mix && x.mix[id]); if (isFinite(v) && v > 0) { mix[id] = v; sum += v; } });
    if (!(sum > 0)) { Object.keys(d.mix).forEach((id) => { mix[id] = d.mix[id]; sum += d.mix[id]; }); }
    Object.keys(mix).forEach((id) => { mix[id] = mix[id] / sum; });
    o.mix = mix;
    o.areas = {};
    TYPE_IDS.forEach((id) => { const v = Number(x.areas && x.areas[id]); if (isFinite(v) && v > 0) o.areas[id] = cl(v, 25, 400); });
    o.access = ['auto', 'koridor', 'nokta'].indexOf(x.access) >= 0 ? x.access : d.access;
    o.bay = cl(fin(x.bay, d.bay), 3.5, 9);
    o.grid = x.grid == null ? d.grid : !!x.grid;
    o.travel = cl(fin(x.travel, d.travel), 15, 45);
    o.wallExt = cl(fin(x.wallExt, d.wallExt), 0.15, 0.6);
    o.wallInt = cl(fin(x.wallInt, d.wallInt), 0.07, 0.25);
    const pk = x.park && typeof x.park === 'object' ? x.park : {};
    const st = Array.isArray(pk.stall) ? pk.stall : d.park.stall;
    o.park = {
      stall: [cl(fin(st[0], 2.5), 2.3, 3.0), cl(fin(st[1], 5.0), 4.5, 6.0)],
      aisle: cl(fin(pk.aisle, d.park.aisle), 5, 7.5),
      ramp: cl(fin(pk.ramp, d.park.ramp), 3, 6),
      perUnit: pk.perUnit == null || !isFinite(Number(pk.perUnit)) ? null : cl(Number(pk.perUnit), 0, 4),
    };
    o.ground = ['konut', 'ticari', 'pilotis'].indexOf(x.ground) >= 0 ? x.ground : d.ground;
    o.groundH = x.groundH == null || !isFinite(Number(x.groundH)) ? null : cl(Number(x.groundH), 2.4, 7);
    o.sel = typeof x.sel === 'string' && x.sel ? x.sel : null;
    o.alts = Array.isArray(x.alts) ? x.alts : null;
    return o;
  };

  const typeArea = (dsn, id) => { const t = D.MIX_TYPES.find((q) => q.id === id); return (dsn.areas && dsn.areas[id]) || (t ? t.area : 100); };
  // alana göre en yakın tür (göreli hata)
  function classify(area, dsn) {
    let best = TYPE_IDS[0], be = Infinity;
    TYPE_IDS.forEach((id) => { const a = typeArea(dsn, id), e = Math.abs(area - a) / a; if (e < be) { be = e; best = id; } });
    return best;
  }

  // en büyük eksik paya sahip türü seçen kuyruk (sayaçlar çağrılar arasında korunur)
  function mkChooser(dsn) {
    const ids = TYPE_IDS.filter((id) => dsn.mix[id] > 0);
    return {
      cnt: {}, tot: 0,
      snap() { return { cnt: Object.assign({}, this.cnt), tot: this.tot }; },
      restore(s) { this.cnt = Object.assign({}, s.cnt); this.tot = s.tot; },
      next() {
        let best = ids[0], bd = -Infinity;
        ids.forEach((id) => { const df = dsn.mix[id] * (this.tot + 1) - (this.cnt[id] || 0); if (df > bd + 1e-9) { bd = df; best = id; } });
        this.cnt[best] = (this.cnt[best] || 0) + 1; this.tot++;
        return best;
      },
    };
  }
  // kuyruğa gerçek (alana göre) türü de işle: kuyruk dışı üretimlerde (nokta çekirdek) paylar yine dengelenir
  function chNote(ch, id) { ch.cnt[id] = (ch.cnt[id] || 0) + 1; ch.tot++; }
  const chTake = (ch, id) => chNote(ch, id);

  // tür payları ile hedef arasındaki en büyük sapma
  function shareErr(cnt, tot, dsn) {
    if (!tot) return 0;
    let e = 0;
    TYPE_IDS.forEach((id) => { e = Math.max(e, Math.abs((cnt[id] || 0) / tot - (dsn.mix[id] || 0))); });
    return e;
  }
  // çizilen brüt alan, türün nominal alanının ±%20'si içinde mi
  const fitsT = (id, ar, dsn) => { const a = typeArea(dsn, id); return Math.abs(ar - a) <= 0.2 * a + 1e-6; };
  // etiket: istenen tür alana uyuyorsa o, değilse alana en yakın tür
  const labelOf = (ar, dsn, want) => (want && fitsT(want, ar, dsn) ? want : classify(ar, dsn));

  /* Bir koşuyu (koridor boyunca çekirdeksiz boşluk) yarım modül birimleriyle daire dizisine böler.
     Her daire alanı seçilen türün ±%20'sinde kalır; ışın aramasıyla (beam) genel karma sapması en aza indirilir.
     bF / bL: çekirdek yanındaki ilk / son daireye eklenecek şerit alanı. Dönüş [{q,t}] ya da null. */
  function planRun(N, hm, bd, bF, bL, ch, dsn, allowed, beam) {
    if (!allowed.length) return null;
    beam = beam || 120;
    const states = new Array(N + 1);
    states[0] = new Map([['', { c: {}, n: 0, dev: 0, seq: [] }]]);
    const score = (st) => shareErr(addCnt(ch.cnt, st.c), ch.tot + st.n, dsn) + 0.002 * st.dev / Math.max(1, st.n);
    for (let pos = 0; pos < N; pos++) {
      const mp = states[pos];
      if (!mp) continue;
      let arr = Array.from(mp.values());
      if (arr.length > beam) { arr.sort((a, b) => score(a) - score(b)); arr = arr.slice(0, beam); }
      arr.forEach((st) => {
        for (let q = 1; q <= N - pos; q++) {
          const ar = q * hm * bd + (pos === 0 ? bF : 0) + (pos + q === N ? bL : 0);
          if (ar > 232) break;
          for (let ti = 0; ti < allowed.length; ti++) {
            const t = allowed[ti], A = typeArea(dsn, t);
            if (Math.abs(ar - A) > 0.2 * A + 1e-6) continue;
            const c = Object.assign({}, st.c);
            c[t] = (c[t] || 0) + 1;
            const key = allowed.map((x) => c[x] || 0).join(',');
            const nxt = states[pos + q] || (states[pos + q] = new Map());
            const dev = st.dev + Math.abs(ar - A) / A;
            const ex = nxt.get(key);
            if (!ex || dev < ex.dev) nxt.set(key, { c: c, n: st.n + 1, dev: dev, seq: st.seq.concat([{ q: q, t: t }]) });
          }
        }
      });
    }
    const fin = states[N];
    if (!fin || !fin.size) return null;
    let best = null, bs = Infinity;
    fin.forEach((st) => { const sc = score(st); if (sc < bs - 1e-12) { bs = sc; best = st; } });
    return best ? best.seq : null;
  }
  function addCnt(a, b) { const o = Object.assign({}, a); Object.keys(b).forEach((k) => { o[k] = (o[k] || 0) + b[k]; }); return o; }

  /* ---------------- çekirdek (ab çerçevesi) ----------------
     r = [a0, b0, a1, b1]: 1 merdiven + 2 asansör (mini: 1 asansör) */
  function coreParts(r, mini) {
    const c0 = r[0], d0 = r[1], c1 = r[2], d1 = r[3];
    const sw = mini ? 2.4 : 2.6;
    const la = c0 + sw + Math.max(0, (c1 - c0 - sw - 1.6) / 2);
    const lifts = [];
    if (mini) { const lb = d0 + (d1 - d0 - 1.6) / 2; lifts.push(rectPoly(la, lb, la + 1.6, lb + 1.6)); }
    else { lifts.push(rectPoly(la, d0 + 0.4, la + 1.6, d0 + 2.0)); lifts.push(rectPoly(la, d1 - 2.0, la + 1.6, d1 - 0.4)); }
    return { rect: r, poly: rectPoly(c0, d0, c1, d1), stair: rectPoly(c0, d0, c0 + sw, d1), lifts: lifts, mini: !!mini };
  }

  const coreFits = (P, r) => { const c = clipRect(P, r[0], r[1], r[2], r[3]); return !!c && aabs(c) >= 0.97 * (r[2] - r[0]) * (r[3] - r[1]); };

  // kanat için düzen türü: cift (çift yüklü koridor) | tek (tek yüklü galeri) | nokta (merkezi çekirdek) | uc (uçta çekirdek) | none
  function pickMode(L, Dp, dsn, forceCore) {
    if (Dp < 6.4 || L < 5) return 'none';
    const compact = Dp >= 14 && L <= 26 && L / Dp <= 2.2;
    if (dsn.access === 'nokta' && Dp >= 8 && L >= 11) return 'nokta';
    if (dsn.access === 'auto' && compact) return 'nokta';
    if (L < 11) return forceCore ? 'uc' : 'tek';
    return Dp >= 12.5 ? 'cift' : 'tek';
  }

  // çekirdek bölgelerinin modül indisleri (eşit aralıklı); aradaki serbest boşluk 0 ya da en az minFree modül olur
  function placeZones(k, nm, kz, minFree) {
    const out = [];
    for (let j = 0; j < k; j++) {
      const ideal = (nm * (2 * j + 1)) / (2 * k) - kz / 2;
      const lo = j ? out[j - 1] + kz : 0, hi = nm - kz - (k - 1 - j) * kz;
      let s = Math.max(lo, Math.min(hi, Math.round(ideal)));
      const gap = s - lo;
      if (gap > 0 && gap < minFree) {
        const c1 = lo, c2 = lo + minFree;
        s = c2 <= hi && Math.abs(c2 - ideal) < Math.abs(c1 - ideal) ? c2 : c1;
      }
      out.push(s);
    }
    const last = out.length - 1, tail = nm - (out[last] + kz);
    if (tail > 0 && tail < minFree) {
      const lo = last ? out[last - 1] + kz : 0;
      const t1 = nm - kz, t2 = nm - kz - minFree;
      out[last] = t2 >= lo && (t2 - lo === 0 || t2 - lo >= minFree) ? t2 : t1;
    }
    return out;
  }

  /* ---------------- bir kanadın tipik kat düzeni ----------------
     S: { P (ab çokgen, CCW), A0,A1,B0,B1, mode, k (çekirdek sayısı), dsn, ch (kuyruk), galleryHigh }
     Dönüş: { units:[{poly, area, type}], cores, corridors, rest, alines, blines, ... } (hepsi ab) ya da null (uygunsuz) */
  function layoutPiece(S) {
    const P = S.P, A0 = S.A0, A1 = S.A1, B0 = S.B0, B1 = S.B1, dsn = S.dsn, ch = S.ch, mode = S.mode;
    const L = A1 - A0, Dp = B1 - B0, Bm = (B0 + B1) / 2;
    const nb = Math.max(1, Math.round(L / dsn.bay)), bE = L / nb;
    const nm = nb * (bE > 6.5 ? 2 : 1), mod = L / nm;
    const Am = (m) => A0 + m * mod;
    const res = { mode: mode, units: [], cores: [], corridors: [], rest: [], alines: [], blines: [], bE: bE, mod: mod, nm: nm, unitDepth: 7, travelMax: 0, zones: [], corrB: null, zoneIdx: [], coreIdx: [] };
    const slots = [];
    const rows = [];
    for (let i = 0; i <= nb; i++) res.alines.push(A0 + i * bE);
    const addRest = (r) => { const c = clipRect(P, r[0], r[1], r[2], r[3]); if (c) res.rest.push(c); };
    const addCorr = (r) => { const c = clipRect(P, r[0], r[1], r[2], r[3]); if (c) res.corridors.push(c); };

    // koşu planı: { plan:[{q,t}], unitW } (chx: sayaç nesnesi; deneme çalıştırmalarında kopya verilir)
    const planForRun = (rn, chx) => {
      const bd = rn.row.b1 - rn.row.b0, hm = mod / 2, N = (rn.m1 - rn.m0) * 2, bF = rn.bF, bL = rn.bL;
      const wanted = TYPE_IDS.filter((id) => dsn.mix[id] > 0);
      const evalPlan = (pl) => {
        if (!pl) return Infinity;
        const c = {};
        pl.forEach((p) => { c[p.t] = (c[p.t] || 0) + 1; });
        return shareErr(addCnt(chx.cnt, c), chx.tot + pl.length, dsn);
      };
      let plan = planRun(N, hm, bd, bF, bL, chx, dsn, wanted) || planRun(N, hm, bd, bF, bL, chx, dsn, TYPE_IDS);
      let unitW = hm;
      const sc = evalPlan(plan);
      if (sc > 0.08) {
        // aks adımlı bölme hedef karmaya yetmiyorsa: 0,5 m adımlı serbest bölme (bölme duvarı aks dışında kalabilir)
        const len = (rn.m1 - rn.m0) * mod, Nf = Math.max(1, Math.round(len / 0.5)), uf = len / Nf;
        const pf = planRun(Nf, uf, bd, bF, bL, chx, dsn, wanted, 40) || planRun(Nf, uf, bd, bF, bL, chx, dsn, TYPE_IDS, 40);
        if (pf && evalPlan(pf) < sc - 0.03) { plan = pf; unitW = uf; }
      }
      if (!plan) {
        // son çare: kuyruktan sıradaki türe en yakın alanla doldur
        const cc = mkChooser(dsn);
        cc.cnt = Object.assign({}, chx.cnt); cc.tot = chx.tot;
        plan = [];
        let rem = N;
        while (rem > 0) {
          const t = cc.next(), ta = typeArea(dsn, t);
          let w = 1, be = Infinity;
          for (let q = 1; q <= rem; q++) { const e = Math.abs(q * hm * bd - ta); if (e < be) { be = e; w = q; } }
          if ((rem - w) * hm * bd < MIN_FLAT + 4) w = rem;
          plan.push({ q: w, t: t });
          rem -= w;
        }
        unitW = hm;
      }
      return { plan: plan, unitW: unitW };
    };
    const fillRun = (rn, chx) => {
      const row = rn.row, ri = rn.ri, m0 = rn.m0, m1 = rn.m1, bd = row.b1 - row.b0;
      if (m1 <= m0) return;
      if ((m1 - m0) * mod * bd < MIN_FLAT) { addRest([Am(m0), row.b0, Am(m1), row.b1]); return; }
      const pr = planForRun(rn, chx), plan = pr.plan, unitW = pr.unitW;
      plan.forEach((p) => chTake(chx, p.t));
      let cur = 0;
      plan.forEach((p, pi) => {
        const x0 = Am(m0) + cur * unitW, x1 = pi === plan.length - 1 ? Am(m1) : Am(m0) + (cur + p.q) * unitW;
        const sl = { rects: [[x0, row.b0, x1, row.b1]], m0: pi === 0 ? m0 : m0 + (cur * unitW) / mod, m1: pi === plan.length - 1 ? m1 : m0 + ((cur + p.q) * unitW) / mod, row: ri, want: p.t };
        row.slots.push(sl); slots.push(sl);
        cur += p.q;
      });
    };
    const attach = (row, rect, preferLeft, z) => {
      const left = row.slots.find((s) => s.m1 === z.s), right = row.slots.find((s) => s.m0 === z.s + z.kz);
      const t = preferLeft ? (left || right) : (right || left);
      if (t) t.rects.push(rect); else addRest(rect);
    };

    if (mode === 'cift' || mode === 'tek') {
      let coreB;
      if (mode === 'cift') {
        const cw = Dp >= 16 ? 1.8 : 1.6;
        rows.push({ b0: B0, b1: Bm - cw / 2, slots: [] }, { b0: Bm + cw / 2, b1: B1, slots: [] });
        res.corrB = [Bm - cw / 2, Bm + cw / 2];
        coreB = [Bm - CORE_B / 2, Bm + CORE_B / 2];
        res.blines = [B0 + 0.15, res.corrB[0], res.corrB[1], B1 - 0.15];
        res.unitDepth = (Dp - cw) / 2;
      } else {
        const gw = Dp >= 8 ? 1.5 : 1.3, hi = !!S.galleryHigh;
        rows.push({ b0: hi ? B0 : B0 + gw, b1: hi ? B1 - gw : B1, slots: [] });
        res.corrB = hi ? [B1 - gw, B1] : [B0, B0 + gw];
        coreB = hi ? [B1 - CORE_B, B1] : [B0, B0 + CORE_B];
        res.blines = hi ? [B0 + 0.15, B1 - gw, B1 - 0.15] : [B0 + 0.15, B0 + gw, B1 - 0.15];
        res.unitDepth = Dp - gw;
      }
      res.coreB = coreB;
      const kz = Math.max(1, Math.ceil(4.8 / mod - 1e-9));
      let k = S.k;
      if (S.zonesFixed) k = S.zonesFixed.length;
      if (k > 0) {
        let ss;
        if (S.zonesFixed) ss = S.zonesFixed.slice();
        else {
          k = Math.min(k, Math.max(0, Math.floor((nm - 1) / kz)));
          if (k < 1) return null;
          const bdMin = Math.min.apply(null, rows.map((r) => r.b1 - r.b0));
          ss = placeZones(k, nm, kz, Math.max(1, Math.ceil((MIN_FLAT + 2) / (mod * bdMin) - 1e-9)));
        }
        for (let j = 0; j < ss.length; j++) {
          const lo = j ? ss[j - 1] + kz : 0, hi2 = nm - kz - (ss.length - 1 - j) * kz;
          let s0 = ss[j], okz = false;
          const cand = S.zonesFixed ? [0] : [0, 1, -1, 2, -2, 3, -3, 4, -4];
          for (let c = 0; c < cand.length && !okz; c++) {
            const t = s0 + cand[c];
            if (t < lo || t > hi2) continue;
            const zw = kz * mod, coreA = Math.min(CORE_A, zw), ca0 = Am(t) + (zw - coreA) / 2;
            if (coreFits(P, [ca0, coreB[0], ca0 + coreA, coreB[1]])) { ss[j] = t; okz = true; }
          }
          if (!okz) return null;
        }
        ss.forEach((s1) => res.zones.push({ s: s1, kz: kz, a0: Am(s1), a1: Am(s1 + kz) }));
        res.zoneIdx = ss.slice();
      }
      const cut = [0];
      res.zones.forEach((z) => { cut.push(z.s, z.s + z.kz); });
      cut.push(nm);
      const runs = [];
      for (let i = 0; i + 1 < cut.length; i += 2) {
        const m0 = cut[i], m1 = cut[i + 1];
        if (m1 <= m0) continue;
        addCorr([Am(m0), res.corrB[0], Am(m1), res.corrB[1]]);
        rows.forEach((row, ri) => runs.push({ row: row, ri: ri, m0: m0, m1: m1, bF: 0, bL: 0, ok: (m1 - m0) * mod * (row.b1 - row.b0) >= MIN_FLAT }));
      }
      // çekirdek yanındaki şeritler: bitişik dairenin planlanan alanına eklenir; hangi komşuya verileceği varyanta göre değişebilir
      const strips = [];
      res.zones.forEach((z, zi) => {
        if (mode === 'cift') {
          strips.push({ zi: zi, ri: 0, area: (z.a1 - z.a0) * (coreB[0] - B0), pl: true });
          strips.push({ zi: zi, ri: 1, area: (z.a1 - z.a0) * (B1 - coreB[1]), pl: false });
        } else strips.push({ zi: zi, ri: 0, area: (z.a1 - z.a0) * (S.galleryHigh ? B1 - CORE_B - B0 : B1 - (B0 + CORE_B)), pl: true });
      });
      const setBonus = (mask) => {
        runs.forEach((r) => { r.bF = 0; r.bL = 0; });
        strips.forEach((st, si) => {
          const z = res.zones[st.zi], flip = (mask >> si) & 1;
          const left = runs.find((r) => r.ri === st.ri && r.ok && r.m1 === z.s), right = runs.find((r) => r.ri === st.ri && r.ok && r.m0 === z.s + z.kz);
          const pl = flip ? !st.pl : st.pl;
          const t = pl ? (left || right) : (right || left);
          if (!t) return;
          if (t === left) t.bL += st.area; else t.bF += st.area;
        });
      };
      // karma sapması yüksekse şerit yönlerini dene (en çok 2^6 birleşim)
      let mask = 0;
      if (S.flipSearch && strips.length && strips.length <= 6) {
        const tryMask = (mk) => {
          setBonus(mk);
          const cc = mkChooser(dsn);
          cc.cnt = Object.assign({}, ch.cnt); cc.tot = ch.tot;
          runs.forEach((rn) => { if ((rn.m1 - rn.m0) * mod * (rn.row.b1 - rn.row.b0) < MIN_FLAT) return; planForRun(rn, cc).plan.forEach((p) => chTake(cc, p.t)); });
          return shareErr(cc.cnt, cc.tot, dsn);
        };
        let be = tryMask(0);
        if (be > 0.06) for (let mk = 1; mk < (1 << strips.length); mk++) { const e = tryMask(mk); if (e < be - 0.005) { be = e; mask = mk; } }
      }
      setBonus(mask);
      res.flipMask = mask;
      runs.forEach((r) => fillRun(r, ch));
      res.zones.forEach((z) => {
        const zw = z.a1 - z.a0, coreA = Math.min(CORE_A, zw), ca0 = z.a0 + (zw - coreA) / 2;
        const r = [ca0, coreB[0], ca0 + coreA, coreB[1]];
        res.cores.push(coreParts(r, coreA < 4.2));
        const zi = res.zones.indexOf(z), fl = (si) => ((mask >> si) & 1) === 1;
        if (mode === 'cift') {
          attach(rows[0], [z.a0, B0, z.a1, coreB[0]], !fl(zi * 2), z);
          attach(rows[1], [z.a0, coreB[1], z.a1, B1], fl(zi * 2 + 1), z);
        } else {
          const hi = !!S.galleryHigh;
          attach(rows[0], hi ? [z.a0, B0, z.a1, B1 - CORE_B] : [z.a0, B0 + CORE_B, z.a1, B1], !fl(zi), z);
        }
        if (zw - coreA > 0.01) { addCorr([z.a0, coreB[0], ca0, coreB[1]]); addCorr([ca0 + coreA, coreB[0], z.a1, coreB[1]]); }
      });
    } else if (mode === 'nokta') {
      const m = Math.max(1, Math.ceil(L / 22)), ml = L / m;
      res.alines = [];
      const PARTS = [
        [[0], [1], [2], [3]],
        [[0, 1], [2], [3]], [[1, 2], [0], [3]], [[2, 3], [0], [1]], [[3, 0], [1], [2]],
        [[0, 1], [2, 3]], [[1, 2], [3, 0]],
        [[0, 1, 2], [3]], [[1, 2, 3], [0]], [[2, 3, 0], [1]], [[3, 0, 1], [2]],
      ];
      for (let j = 0; j < m; j++) {
        const Aj0 = A0 + j * ml, Aj1 = Aj0 + ml, ac = (Aj0 + Aj1) / 2;
        let pick = null;
        // çekirdek konumu: ilk geçişte merkeze yakın (bölme esnekliği için), sığmazsa tüm ızgara; varyantlarda sabit
        for (let attempt = 0; attempt < (S.coreFixed && S.coreFixed[j] ? 1 : 2) && !pick; attempt++) {
        const poss = [];
        if (S.coreFixed && S.coreFixed[j]) poss.push(S.coreFixed[j]);
        else for (let x0 = Aj0 + 3; x0 + CORE_A <= Aj1 - 3 + 1e-6; x0 += 1) for (let y0 = B0 + 3; y0 + CORE_B <= B1 - 3 + 1e-6; y0 += 1.5) {
          if (attempt === 0 && (Math.abs(x0 + CORE_A / 2 - ac) > 1.6 || Math.abs(y0 + CORE_B / 2 - Bm) > 1.6)) continue;
          poss.push([x0, y0]);
        }
        const evals = [];
        for (let pi2 = 0; pi2 < poss.length; pi2++) {
          const x0 = poss[pi2][0], y0 = poss[pi2][1];
          const c1 = x0 + CORE_A, d1 = y0 + CORE_B;
          const atoms = [[Aj0, B0, c1, y0], [c1, B0, Aj1, d1], [x0, d1, Aj1, B1], [Aj0, y0, x0, B1]];
          const at = atoms.map((r) => (r[2] - r[0]) * (r[3] - r[1]));
          const dist = Math.hypot(x0 + CORE_A / 2 - ac, y0 + CORE_B / 2 - Bm);
          PARTS.forEach((pt) => {
            const ars = pt.map((g) => g.reduce((t, i) => t + at[i], 0));
            if (ars.some((a) => a < 40 || a > 232)) return;
            const labs = ars.map((a) => classify(a, dsn));
            const cnt = {};
            labs.forEach((l) => { cnt[l] = (cnt[l] || 0) + 1; });
            let bad = 0, dev = 0;
            ars.forEach((a, i) => { const A = typeArea(dsn, labs[i]); dev += Math.abs(a - A) / A; if (!fitsT(labs[i], a, dsn)) bad++; });
            const cost = shareErr(addCnt(ch.cnt, cnt), ch.tot + labs.length, dsn) + 0.3 * bad + 0.02 * dev / labs.length + 0.002 * dist;
            evals.push({ cost: cost, x0: x0, y0: y0, atoms: atoms, pt: pt, labs: labs });
          });
        }
        evals.sort((u, v) => u.cost - v.cost);
        for (let e = 0; e < evals.length && e < 40 && !pick; e++) if (coreFits(P, [evals[e].x0, evals[e].y0, evals[e].x0 + CORE_A, evals[e].y0 + CORE_B])) pick = evals[e];
        }
        if (!pick) return null; // çekirdek bu çokgene sığmıyor: başka düzen denenir
        const c0 = pick.x0, d0 = pick.y0, c1 = c0 + CORE_A, d1 = d0 + CORE_B;
        res.cores.push(coreParts([c0, d0, c1, d1], false));
        res.coreIdx.push([c0, d0]);
        res.alines.push(Aj0, c0, c1, Aj1);
        res.blines = [B0 + 0.15, d0, d1, B1 - 0.15];
        pick.pt.forEach((g, gi) => { slots.push({ rects: g.map((i) => pick.atoms[i]), want: pick.labs[gi] }); chTake(ch, pick.labs[gi]); });
      }
      res.unitDepth = 7;
    } else if (mode === 'uc') {
      const mini = L < 12;
      const coreA = mini ? 4.0 : CORE_A, coreBd = mini ? 4.6 : CORE_B;
      const r = [A0, B0, A0 + coreA, B0 + coreBd];
      res.cores.push(coreParts(r, mini));
      res.alines = [A0, A0 + coreA, A1];
      res.blines = [B0 + 0.15, B1 - 0.15];
      const first = { rects: [[A0 + coreA, B0, A1, B1]] };
      if (B1 - (B0 + coreBd) > 0.3) first.rects.push([A0, B0 + coreBd, A0 + coreA, B1]);
      // uzun kalan kısmı modüllere böl
      const rest = A1 - (A0 + coreA), nn = Math.max(1, Math.round(rest / Math.max(3, 70 / Dp)));
      if (nn <= 1 || rest * Dp < 2 * MIN_FLAT) slots.push(first);
      else {
        const w = rest / nn;
        for (let i = 0; i < nn; i++) {
          const sl = { rects: [[A0 + coreA + i * w, B0, A0 + coreA + (i + 1) * w, B1]] };
          if (i === 0 && first.rects.length > 1) sl.rects.push(first.rects[1]);
          slots.push(sl);
        }
      }
      res.unitDepth = Dp;
    } else {
      res.rest.push(P);
    }

    // slot → daire çokgeni
    slots.forEach((sl) => {
      const polys = sl.rects.map((r) => clipRect(P, r[0], r[1], r[2], r[3])).filter(Boolean);
      if (!polys.length) return;
      const poly = polys.length > 1 ? unionPolys(polys) : polys[0];
      if (!poly) return;
      const ar = aabs(poly);
      if (ar < MIN_FLAT) { res.rest.push(poly); return; }
      const u = { poly: poly, area: ar, type: labelOf(ar, dsn, sl.want) };
      res.units.push(u);
      if (mode === 'uc') chNote(ch, u.type);
    });
    res.units.sort((x, y) => {
      const cx = G().centroid(x.poly), cy = G().centroid(y.poly);
      return cx[0] - cy[0] || cx[1] - cy[1];
    });
    // kaçış mesafesi (kapıdan merdivene; koridor ekseni boyunca)
    let tm = 0;
    res.units.forEach((u) => {
      const c = G().centroid(u.poly);
      let best = Infinity;
      res.cores.forEach((co) => {
        let d;
        if (res.zones.length && res.corrB) {
          const z = res.zones.find((q) => q.a0 <= co.rect[0] + 1e-6 && q.a1 >= co.rect[2] - 1e-6) || { a0: co.rect[0], a1: co.rect[2] };
          d = Math.max(0, z.a0 - c[0], c[0] - z.a1) + 1.5;
        } else {
          const r = co.rect;
          d = Math.hypot(Math.max(0, r[0] - c[0], c[0] - r[2]), Math.max(0, r[1] - c[1], c[1] - r[3])) + 2;
        }
        if (d < best) best = d;
      });
      u.travel = best;
      if (isFinite(best) && best > tm) tm = best;
    });
    res.travelMax = tm;
    return res;
  }


  // içbükey kanadı (L/T biçimli zarf kırpması) dikdörtgene yakın alt kanatlara böler: kesim, girinti köşesinden geçen eksen
  function splitConcave(poly, O, d, nrm, depth) {
    const toUV = (p) => [(p[0] - O[0]) * d[0] + (p[1] - O[1]) * d[1], (p[0] - O[0]) * nrm[0] + (p[1] - O[1]) * nrm[1]];
    const toW = (q) => [O[0] + q[0] * d[0] + q[1] * nrm[0], O[1] + q[0] * d[1] + q[1] * nrm[1]];
    let uv = poly.map(toUV);
    if (sarea(uv) < 0) uv = uv.reverse();
    const n = uv.length;
    let r = null;
    for (let i = 0; i < n && !r; i++) {
      const a = uv[(i + n - 1) % n], b = uv[i], c = uv[(i + 1) % n];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -0.05) r = b;
    }
    if (!r || depth >= 3) return [poly];
    const bb = G().bbox(uv), B = 1;
    const cands = [
      [[bb.x0 - B, bb.y0 - B, r[0], bb.y1 + B], [r[0], bb.y0 - B, bb.x1 + B, bb.y1 + B]],
      [[bb.x0 - B, bb.y0 - B, bb.x1 + B, r[1]], [bb.x0 - B, r[1], bb.x1 + B, bb.y1 + B]],
    ];
    let best = null;
    cands.forEach((cd) => {
      const parts = cd.map((q) => clipRect(uv, q[0], q[1], q[2], q[3])).filter((q) => q && aabs(q) > 4);
      if (parts.length < 2) return;
      let waste = 0;
      parts.forEach((q) => { const b2 = G().bbox(q); waste += b2.w * b2.h - aabs(q); });
      if (!best || waste < best.waste) best = { parts: parts, waste: waste };
    });
    if (!best) return [poly];
    let out = [];
    best.parts.forEach((q) => { out = out.concat(splitConcave(q.map(toW), O, d, nrm, depth + 1)); });
    return out;
  }

  /* ---------------- tipik kat planı: tüm kanatlar ---------------- */
  function buildPlan(R, im, dsn, floors) {
    const gis = G();
    const O = gis.centroid(R.env);
    const d = R.front.dir, nrm = [-d[1], d[0]];
    const pieceList = [];
    R.pieces.forEach((p) => splitConcave(p, O, d, nrm, 0).forEach((q) => pieceList.push(q)));
    const pcs = pieceList.map((poly, i) => {
      const uv = poly.map((p) => [(p[0] - O[0]) * d[0] + (p[1] - O[1]) * d[1], (p[0] - O[0]) * nrm[0] + (p[1] - O[1]) * nrm[1]]);
      const bb = gis.bbox(uv);
      const ea = bb.w >= bb.h ? d : nrm;
      const F = mkFrame(O, ea);
      let P = poly.map(F.toAB);
      if (sarea(P) < 0) P = P.reverse();
      const b2 = gis.bbox(P);
      return { i: i, poly: poly, F: F, P: P, A0: b2.x0, A1: b2.x1, B0: b2.y0, B1: b2.y1, L: b2.w, Dp: b2.h, galleryHigh: F.eb[1] > 0 };
    });
    const longest = pcs.reduce((m, p) => (p.L * p.Dp > m.L * m.Dp ? p : m), pcs[0]).i;

    const layoutOne = (pc, ch, forceCore) => {
      let mode = pickMode(pc.L, pc.Dp, dsn, forceCore);
      const base = { P: pc.P, A0: pc.A0, A1: pc.A1, B0: pc.B0, B1: pc.B1, dsn: dsn, ch: ch, galleryHigh: pc.galleryHigh };
      if (mode === 'nokta' || mode === 'uc' || mode === 'none') {
        const snap = ch.snap();
        const r = layoutPiece(Object.assign({ mode: mode, k: 0 }, base));
        if (r && r.units.length) return r;
        ch.restore(snap);
        if (mode === 'nokta') mode = pc.Dp >= 12.5 ? 'cift' : 'tek'; else if (mode === 'none') return r;
      }
      if (mode === 'uc') mode = 'tek';
      if (mode === 'tek' && pc.L < 11 && !forceCore) return layoutPiece(Object.assign({ mode: 'tek', k: 0 }, base));
      let best = null, cand = null;
      for (let k = 1; k <= 7; k++) {
        const snap = ch.snap();
        const r = layoutPiece(Object.assign({ mode: mode, k: k }, base));
        if (!r) { ch.restore(snap); if (cand) { best = cand.r; ch.restore(cand.post); } break; }
        if (r.travelMax <= dsn.travel || k === 7) { best = r; break; }
        cand = { r: r, post: ch.snap() };
        ch.restore(snap);
      }
      if (!best && cand) { best = cand.r; ch.restore(cand.post); }
      if (!best) return layoutPiece(Object.assign({ mode: 'uc', k: 0 }, base)); // çekirdek sığmadı: uç çekirdek
      return best;
    };

    // 1) iskelet: kanat başına düzen türü, çekirdek konumları (kat boyunca sabit)
    let trial = null, chT = null;
    for (let pass = 0; pass < 2; pass++) {
      chT = mkChooser(dsn);
      const force = pass === 1 ? longest : -1;
      trial = pcs.map((pc) => layoutOne(pc, chT, pcs.length === 1 || pc.i === force));
      if (trial.some((r) => r && r.cores.length)) break;
    }
    const baseOf = (pc, chx) => ({ P: pc.P, A0: pc.A0, A1: pc.A1, B0: pc.B0, B1: pc.B1, dsn: dsn, ch: chx, galleryHigh: pc.galleryHigh, flipSearch: true });
    const grossAll = pcs.reduce((t, pc) => t + aabs(pc.poly), 0);
    const cntCores = () => trial.reduce((t, r) => t + (r ? r.cores.length : 0), 0);
    const cntUnits = () => trial.reduce((t, r) => t + (r ? r.units.length : 0), 0);
    // yüksek yapı / geniş kat: iki bağımsız merdiven (kat > 6 ya da kat başına > 8 daire), çekirdek başına ≤ 8 daire, ~500 m² başına bir çekirdek
    let needCores = Math.max(floors > 6 ? 2 : 1, Math.ceil(cntUnits() / 8), Math.ceil(grossAll / 500));
    for (let it = 0; it < 8 && cntCores() < needCores; it++) {
      let done = false;
      const order = pcs.map((pc, i) => i).filter((i) => trial[i] && (trial[i].mode === 'cift' || trial[i].mode === 'tek') && trial[i].cores.length > 0)
        .sort((x, y) => trial[y].units.length / trial[y].cores.length - trial[x].units.length / trial[x].cores.length);
      for (let oi = 0; oi < order.length && !done; oi++) {
        const i = order[oi], pc = pcs[i];
        const snap = chT.snap();
        const r = layoutPiece(Object.assign({ mode: trial[i].mode, k: trial[i].cores.length + 1 }, baseOf(pc, chT)));
        if (r && r.cores.length > trial[i].cores.length) { trial[i] = r; done = true; } else chT.restore(snap);
      }
      for (let i = 0; i < pcs.length && !done; i++) {
        // tek modüllü merkezi çekirdekli kanat: iki çekirdekli koridor düzenine çevir
        if (!trial[i] || trial[i].mode !== 'nokta' || trial[i].cores.length !== 1) continue;
        const pc = pcs[i], md = pc.Dp >= 12.5 ? 'cift' : 'tek';
        const snap = chT.snap();
        const r = layoutPiece(Object.assign({ mode: md, k: 2 }, baseOf(pc, chT)));
        if (r && r.cores.length >= 2) { trial[i] = r; done = true; } else chT.restore(snap);
      }
      if (!done) break;
      needCores = Math.max(needCores, Math.ceil(cntUnits() / 8));
    }
    const skel = trial.map((r) => (r ? { mode: r.mode, zones: r.zoneIdx || [], core: r.coreIdx || [] } : null));

    // 2) varyantlar: aynı çekirdek / koridor, farklı daire kesimi; genel karma kat dağılımıyla hedefe yaklaştırılır
    const nFlatFloors = Math.max(0, floors - (dsn.ground === 'konut' ? 0 : 1));
    const nVar = Math.min(4, Math.max(1, nFlatFloors));
    // iskelet verilince varyantları üret; karma sapması ve travel döndür
    const genVars = (sk) => {
      const chV = mkChooser(dsn);
      const all = [];
      for (let v = 0; v < nVar; v++) {
        all.push(pcs.map((pc, i) => {
          const k0 = sk[i];
          if (!k0) return null;
          const r = layoutPiece(Object.assign({ mode: k0.mode, k: k0.zones.length, zonesFixed: k0.zones, coreFixed: k0.core }, baseOf(pc, chV)));
          return r || (v === 0 ? null : all[0][i]);
        }));
      }
      if (all[0].some((r, i) => sk[i] && !r)) return null;
      const vc = all.map((rs) => { const c = {}; let n = 0; rs.forEach((r) => { if (r) r.units.forEach((u) => { c[u.type] = (c[u.type] || 0) + 1; n++; }); }); return { c: c, n: n }; });
      const errAt = (Vn) => {
        const c = {}; let n = 0;
        for (let f = 0; f < nFlatFloors; f++) { const x = vc[f % Vn]; Object.keys(x.c).forEach((k) => { c[k] = (c[k] || 0) + x.c[k]; }); n += x.n; }
        return shareErr(c, n, dsn);
      };
      let best = Infinity;
      if (nFlatFloors > 0) for (let v = 1; v <= all.length; v++) best = Math.min(best, errAt(v));
      else best = 0;
      let tr = 0, rest = 0;
      all[0].forEach((r) => { if (r) { tr = Math.max(tr, r.travelMax || 0); rest += r.rest.reduce((t, q) => t + aabs(q), 0); } });
      return { all: all, vc: vc, errAt: errAt, best: best, travel: tr, rest: rest };
    };
    let GV = genVars(skel);
    if (!GV) GV = { all: [trial], vc: [], errAt: () => 0, best: 0, travel: 0, rest: 0 };
    if (GV.vc.length === 0) GV.vc = GV.all.map((rs) => { const c = {}; let n = 0; rs.forEach((r) => { if (r) r.units.forEach((u) => { c[u.type] = (c[u.type] || 0) + 1; n++; }); }); return { c: c, n: n }; });
    // çekirdek konumu arama: hedef karmaya ulaşılamıyorsa çekirdek bölgelerini bir-iki modül kaydır
    if (nFlatFloors > 0 && GV.best > 0.12 && GV.vc[0].n >= 3) {
      const t0 = Date.now();
      for (let pi = 0; pi < pcs.length; pi++) {
        const k0 = skel[pi];
        if (!k0 || !k0.zones.length || (k0.mode !== 'cift' && k0.mode !== 'tek')) continue;
        const nz = k0.zones.length, cands = [];
        for (let dlt = -3; dlt <= 3; dlt++) if (dlt) cands.push(k0.zones.map((z) => z + dlt));
        for (let zi = 0; zi < nz; zi++) for (const dlt of [-2, -1, 1, 2]) { const z2 = k0.zones.slice(); z2[zi] += dlt; cands.push(z2); }
        for (let ci = 0; ci < cands.length && GV.best > 0.08 && Date.now() - t0 < 120; ci++) {
          const sk2 = skel.slice();
          sk2[pi] = { mode: k0.mode, zones: cands[ci], core: [] };
          const g2 = genVars(sk2);
          if (!g2 || g2.best >= GV.best - 0.03) continue;
          if (g2.travel > Math.max(dsn.travel, GV.travel) + 0.5 || g2.rest > GV.rest + 0.1 * grossAll) continue;
          const r2n = g2.all[0][pi];
          if (!r2n) continue;
          skel[pi] = { mode: r2n.mode, zones: r2n.zoneIdx || cands[ci], core: r2n.coreIdx || [] };
          GV = g2;
        }
      }
    }
    const allVars = GV.all, varCnt = GV.vc, errOfV = GV.errAt;
    let V = 1, bestErr = Infinity;
    if (nFlatFloors > 0) {
      const errs = [];
      for (let v = 1; v <= allVars.length; v++) errs.push(errOfV(v));
      bestErr = Math.min.apply(null, errs);
      V = errs.findIndex((e) => e <= bestErr + 0.02) + 1;
    }
    const chosen = allVars.slice(0, V);
    const results = chosen[0];

    // dünya koordinatlarına çevir
    const plan = { pieces: [], units: [], cores: [], corridors: [], rest: [], grid: null, areas: null };
    const cols = [], axU = [], axV = [];
    const cs = floors <= 4 ? 0.4 : floors <= 8 ? 0.5 : 0.6;
    let nU = 0, gross = 0, unitsGross = 0, coreA = 0, corrA = 0, maxSpan = 0, minSpan = 99, bayN = 0, bayS = 0, depthW = 0, depthA = 0, unitDepthW = 0, travelMax = 0;
    const coreCentroids = [];
    pcs.forEach((pc, pi) => {
      const r = results[pi];
      const F = pc.F;
      const W = (poly) => rpoly(poly.map(F.toW));
      const mode = r ? r.mode : 'none';
      const pa = aabs(pc.poly);
      gross += pa; depthW += pc.Dp * pa; depthA += pa;
      const axesA = [], axesB = [];
      if (r) {
        r.alines.forEach((a) => { if (!axesA.some((x) => Math.abs(x - a) < 0.05)) axesA.push(a); });
        r.blines.forEach((b) => { if (!axesB.some((x) => Math.abs(x - b) < 0.05)) axesB.push(b); });
        axesA.sort((x, y) => x - y); axesB.sort((x, y) => x - y);
      }
      plan.pieces.push({
        poly: rpoly(pc.poly), length: r2(pc.L), depth: r2(pc.Dp), loading: mode === 'cift' ? 'cift' : mode === 'tek' || mode === 'none' ? 'tek' : 'nokta',
        dir: [Math.round(F.ea[0] * 1e4) / 1e4, Math.round(F.ea[1] * 1e4) / 1e4], mode: mode,
        frame: { o: rp(F.o), ea: F.ea.map((v) => Math.round(v * 1e4) / 1e4) }, bounds: [r2(pc.A0), r2(pc.B0), r2(pc.A1), r2(pc.B1)],
        axesA: axesA.map(r2), axesB: axesB.map(r2),
      });
      if (!r) return;
      r.units.forEach((u) => {
        nU++;
        plan.units.push({ id: 'U' + nU, type: u.type, poly: W(u.poly), area: r2(u.area), piece: pi, _travel: u.travel });
        unitsGross += u.area;
        unitDepthW += r.unitDepth * u.area;
        if (isFinite(u.travel)) travelMax = Math.max(travelMax, u.travel);
      });
      r.cores.forEach((c) => {
        const ar = (c.rect[2] - c.rect[0]) * (c.rect[3] - c.rect[1]);
        coreA += ar;
        plan.cores.push({ poly: W(c.poly), stair: W(c.stair), lifts: c.lifts.map(W), piece: pi, area: r2(ar), mini: c.mini });
        coreCentroids.push(F.toW([(c.rect[0] + c.rect[2]) / 2, (c.rect[1] + c.rect[3]) / 2]));
      });
      r.corridors.forEach((c) => { corrA += aabs(c); plan.corridors.push(W(c)); });
      r.rest.forEach((c) => { if (aabs(c) > 0.3) plan.rest.push({ poly: W(c), piece: pi }); });
      // yapısal aralık
      for (let i = 1; i < axesA.length; i++) { const s = axesA[i] - axesA[i - 1]; if (s > 1.5) { maxSpan = Math.max(maxSpan, s); minSpan = Math.min(minSpan, s); } }
      for (let i = 1; i < axesB.length; i++) { const s = axesB[i] - axesB[i - 1]; if (s > 2.5) { maxSpan = Math.max(maxSpan, s); minSpan = Math.min(minSpan, s); } }
      bayS += r.bE * pa; bayN += pa;
      // eksenler (ön yön çerçevesinde ofset)
      const toU = F.ea === d || (F.ea[0] === d[0] && F.ea[1] === d[1]);
      axesA.forEach((a) => (toU ? axU.push(a) : axV.push(a)));
      axesB.forEach((b) => (toU ? axV.push(b) : axU.push(-b)));
      // kolonlar
      r.alines.forEach((a0) => {
        const a = Math.max(pc.A0 + 0.15, Math.min(pc.A1 - 0.15, a0));
        r.blines.forEach((b) => {
          if (!pointIn(pc.P, [a, b]) || gis.distToPoly([a, b], pc.P) < 0.05) return;
          if (r.cores.some((c) => a > c.rect[0] - 0.05 && a < c.rect[2] + 0.05 && b > c.rect[1] - 0.05 && b < c.rect[3] + 0.05)) return;
          const w = F.toW([a, b]);
          if (cols.some((q) => Math.abs(q[0] - w[0]) < 0.3 && Math.abs(q[1] - w[1]) < 0.3)) return;
          cols.push([r2(w[0]), r2(w[1]), cs, cs]);
        });
      });
    });
    const uniq = (arr) => { const o = []; arr.sort((x, y) => x - y).forEach((v) => { if (!o.length || Math.abs(o[o.length - 1] - v) > 0.05) o.push(v); }); return o.map(r2); };
    // kapı → çekirdek: çekirdeksiz kanatlarda öteki kanatların çekirdeğine kuş uçuşu × 1.25
    plan.units.forEach((u) => {
      const pr = results[u.piece];
      if (pr && pr.cores.length) return;
      const c = gis.centroid(u.poly);
      let best = Infinity;
      coreCentroids.forEach((q) => { best = Math.min(best, Math.hypot(q[0] - c[0], q[1] - c[1]) * 1.25 + 2); });
      u._travel = best;
      if (isFinite(best)) travelMax = Math.max(travelMax, best);
    });
    plan.grid = {
      bay: r2(bayN ? bayS / bayN : dsn.bay), dirU: [d[0], d[1]].map((v) => Math.round(v * 1e4) / 1e4), dirV: [nrm[0], nrm[1]].map((v) => Math.round(v * 1e4) / 1e4),
      origin: rp(O), axesU: uniq(axU), axesV: uniq(axV), cols: cols, show: !!dsn.grid, colSize: cs,
    };
    plan.areas = {
      gross: r2(gross), unitsGross: r2(unitsGross), core: r2(coreA), corridor: r2(corrA), efficiency: Math.round((gross ? unitsGross / gross : 0) * 1e4) / 1e4,
      rest: r2(Math.max(0, gross - unitsGross - coreA - corrA)),
    };
    // varyantlar (0 = tipik kat); çekirdek ve koridorlar ortak, yalnızca daire kesimi değişir
    plan.variants = chosen.map((rs, vi) => {
      if (vi === 0) { const byType = {}; plan.units.forEach((u) => { byType[u.type] = (byType[u.type] || 0) + 1; }); return { units: plan.units, byType: byType }; }
      const us = [], byType = {};
      let n = 0;
      rs.forEach((r, pi) => {
        if (!r) return;
        r.units.forEach((u) => { n++; us.push({ id: 'U' + n, type: u.type, poly: rpoly(u.poly.map(pcs[pi].F.toW)), area: r2(u.area), piece: pi }); byType[u.type] = (byType[u.type] || 0) + 1; });
      });
      return { units: us, byType: byType };
    });
    chosen.forEach((rs) => rs.forEach((r) => { if (r && r.cores.length && isFinite(r.travelMax)) travelMax = Math.max(travelMax, r.travelMax); }));
    const info = {
      variantCount: chosen.length, needCores: needCores, planMixError: isFinite(bestErr) ? bestErr : 0,
      maxSpan: maxSpan, minSpan: minSpan > 90 ? 0 : minSpan, unitDepth: unitsGross ? unitDepthW / unitsGross : 7, travelMax: travelMax,
      meanDepth: depthA ? depthW / depthA : 0, modes: results.map((r) => (r ? r.mode : 'none')),
    };
    return { plan: plan, info: info };
  }
  function pointIn(poly, p) { return G().pointInPoly(p, poly); }

  /* ---------------- bodrum otopark ---------------- */
  // doğru parçası dikdörtgenin açık iç bölgesini kesiyor mu (Liang–Barsky)
  function segHitsRect(a, b, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const p = [-dx, dx, -dy, dy], q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] <= 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-9;
  }
  // dikdörtgen halkanın tamamen içinde mi (merkez içeride + hiçbir halka kenarı iç bölgeyi kesmiyor)
  function rectInRing(ring, x0, y0, x1, y1) {
    const e = 0.02;
    x0 += e; y0 += e; x1 -= e; y1 -= e;
    if (!G().pointInPoly([(x0 + x1) / 2, (y0 + y1) / 2], ring)) return false;
    for (let i = 0, n = ring.length; i < n; i++) if (segHitsRect(ring[i], ring[(i + 1) % n], x0, y0, x1, y1)) return false;
    return true;
  }
  const rectsOverlap = (a, b) => a[0] < b[2] - 0.02 && a[2] > b[0] + 0.02 && a[1] < b[3] - 0.02 && a[3] > b[1] + 0.02;

  // bir çerçevede (x = araç yolu doğrultusu) sıra dizilimi: [park][yol][park] çift taraflı modüller
  function packRows(ringF, rampR, par, oy, ox) {
    const bb = G().bbox(ringF);
    const sw = par.stall[0], sd = par.stall[1], aisle = par.aisle, mod = 2 * sd + aisle, colW = 0.5, pitch = 3 * sw + colW;
    const stalls = [], aisles = [], cols = [];
    for (let y0 = bb.y0 + oy - mod; y0 < bb.y1; y0 += mod) {
      const lowY = [y0, y0 + sd], aiY = [y0 + sd, y0 + sd + aisle], upY = [y0 + sd + aisle, y0 + mod];
      let any = 0;
      for (let gx = bb.x0 + ox - pitch; gx < bb.x1; gx += pitch) {
        for (let i = 0; i < 3; i++) {
          const x0 = gx + i * sw, x1 = x0 + sw;
          if (x1 < bb.x0 || x0 > bb.x1) continue;
          // park yeri ancak önündeki araç yolu dilimi tamamen halkanın içindeyse kullanılabilir
          if (!rectInRing(ringF, x0, aiY[0], x1, aiY[1])) continue;
          [[lowY, 1], [upY, -1]].forEach((rw) => {
            const rc = [x0, rw[0][0], x1, rw[0][1]];
            if (rampR && rectsOverlap(rc, rampR)) return;
            if (rectInRing(ringF, rc[0], rc[1], rc[2], rc[3])) { stalls.push({ r: rc, dy: rw[1] }); any++; }
          });
        }
        const cx0 = gx + 3 * sw;
        [[aiY[0] - colW, aiY[0]], [aiY[1], aiY[1] + colW]].forEach((cy) => {
          const rc = [cx0, cy[0], cx0 + colW, cy[1]];
          if (rampR && rectsOverlap(rc, rampR)) return;
          if (rectInRing(ringF, rc[0], rc[1], rc[2], rc[3])) cols.push(rc);
        });
      }
      if (any) {
        const c = tidy(G().clipPoly(ringF, rectPoly(bb.x0 - 1, aiY[0], bb.x1 + 1, aiY[1])));
        if (c && aabs(c) > 4) aisles.push(c);
      }
    }
    return { stalls: stalls, aisles: aisles, cols: cols };
  }

  /* parsel (ve zarf) → bodrum yerleşimi; kütleden bağımsızdır, üretimde bir kez hesaplanıp paylaşılır */
  function basementLayout(parcel, R, dsn) {
    const gis = G();
    let ring = null;
    try { ring = gis.offsetPoly(parcel, 1.5); } catch (e) { ring = null; }
    if (!ring || ring.length < 3) ring = R.env;
    if (!ring || ring.length < 3) return null;
    ring = gis.ccw(ring);
    const d = R.front.dir, nrm = [-d[1], d[0]];
    const Ob = gis.centroid(ring);
    const par = dsn.park;
    const uv = (p) => [(p[0] - Ob[0]) * d[0] + (p[1] - Ob[1]) * d[1], (p[0] - Ob[0]) * nrm[0] + (p[1] - Ob[1]) * nrm[1]];
    const ringUV = ring.map(uv);
    // rampa: ön kenarın ortasından içeri, düz
    const fm = uv(R.front.mid || gis.centroid([R.front.a, R.front.b]));
    const bbu = gis.bbox(ringUV);
    const hitV = (u) => {
      let m = Infinity;
      for (let i = 0, n = ringUV.length; i < n; i++) {
        const a = ringUV[i], b = ringUV[(i + 1) % n];
        if ((a[0] - u) * (b[0] - u) > 0 || a[0] === b[0]) continue;
        const t = (u - a[0]) / (b[0] - a[0]);
        m = Math.min(m, a[1] + t * (b[1] - a[1]));
      }
      return m;
    };
    let ramp = null;
    const rw = par.ramp;
    const shifts = [0];
    for (let s = 1; s <= 12; s++) shifts.push(s * rw * 0.5, -s * rw * 0.5);
    for (let len = 12; len >= 6 && !ramp; len -= 2) {
      for (let i = 0; i < shifts.length && !ramp; i++) {
        const uc = fm[0] + shifts[i];
        if (uc - rw / 2 < bbu.x0 || uc + rw / 2 > bbu.x1) continue;
        const vf = Math.min(hitV(uc - rw / 2), hitV(uc + rw / 2), hitV(uc));
        if (!isFinite(vf)) continue;
        const rc = [uc - rw / 2, vf, uc + rw / 2, vf + len];
        if (rectInRing(ringUV, rc[0], rc[1], rc[2], rc[3])) ramp = { rc: rc, len: len };
      }
    }
    const toWuv = (q) => [Ob[0] + q[0] * d[0] + q[1] * nrm[0], Ob[1] + q[0] * d[1] + q[1] * nrm[1]];
    // iki yönelim, birkaç kaydırma → en çok park yeri
    let best = null;
    const mod = 2 * par.stall[1] + par.aisle, pitch = 3 * par.stall[0] + 0.5;
    for (let o = 0; o < 2; o++) {
      // o = 0: x = u (yol d boyunca) · o = 1: x = v, y = −u
      const ex = o === 0 ? d : nrm, ey = o === 0 ? nrm : [-d[0], -d[1]];
      const toF = (p) => [(p[0] - Ob[0]) * ex[0] + (p[1] - Ob[1]) * ex[1], (p[0] - Ob[0]) * ey[0] + (p[1] - Ob[1]) * ey[1]];
      const toW = (q) => [Ob[0] + q[0] * ex[0] + q[1] * ey[0], Ob[1] + q[0] * ex[1] + q[1] * ey[1]];
      const ringF = ring.map(toF);
      let rampR = null;
      if (ramp) { const c = rectPoly(ramp.rc[0], ramp.rc[1], ramp.rc[2], ramp.rc[3]).map(toWuv).map(toF); const b = gis.bbox(c); rampR = [b.x0, b.y0, b.x1, b.y1]; }
      for (let iy = 0; iy < 8; iy++) for (let ix = 0; ix < 3; ix++) {
        const res = packRows(ringF, rampR, par, (mod * iy) / 8, (pitch * ix) / 3);
        if (!best || res.stalls.length > best.res.stalls.length) best = { res: res, toW: toW, ex: ex, ey: ey };
      }
    }
    const wr = (rc) => rpoly(rectPoly(rc[0], rc[1], rc[2], rc[3]).map(best.toW));
    const stalls = best.res.stalls.map((s) => ({ poly: wr(s.r), dir: [Math.round(best.ey[0] * s.dy * 1e4) / 1e4 + 0, Math.round(best.ey[1] * s.dy * 1e4) / 1e4 + 0] }));
    const aisles = best.res.aisles.map((a) => rpoly(a.map(best.toW)));
    // park yerinin yanında olmayan (yalnız kalmış) kolonları ele
    const cols = best.res.cols.filter((rc) => best.res.stalls.some((st) => Math.abs((st.r[0] + st.r[2]) / 2 - (rc[0] + rc[2]) / 2) < par.stall[0] * 1.6 + 0.5 && Math.abs((st.r[1] + st.r[3]) / 2 - (rc[1] + rc[3]) / 2) < par.stall[1] + 0.5))
      .map((rc) => { const c = best.toW([(rc[0] + rc[2]) / 2, (rc[1] + rc[3]) / 2]); return [r2(c[0]), r2(c[1]), 0.5, 0.5]; });
    const dd = [Math.round(nrm[0] * 1e4) / 1e4, Math.round(nrm[1] * 1e4) / 1e4];
    return {
      ring: rpoly(ring), ramp: { poly: ramp ? rpoly(rectPoly(ramp.rc[0], ramp.rc[1], ramp.rc[2], ramp.rc[3]).map(toWuv)) : [], dir: dd, length: ramp ? ramp.len : 0, width: rw },
      stalls: stalls, aisles: aisles, cols: cols, areaEach: aabs(ring),
    };
  }

  /* ---------------- puanlama ---------------- */
  D.scoreParts = [
    { id: 'efficiency', label: 'Tipik kat verimi', w: 0.2 },
    { id: 'kaksUse', label: 'Emsal kullanımı', w: 0.2 },
    { id: 'daylight', label: 'Gün ışığı (plan derinliği)', w: 0.15 },
    { id: 'parking', label: 'Otopark karşılama', w: 0.15 },
    { id: 'openSpace', label: 'Açık alan', w: 0.1 },
    { id: 'shadow', label: 'Komşuya gölge', w: 0.1 },
    { id: 'structure', label: 'Taşıyıcı düzen ve kaçış mesafesi', w: 0.1 },
  ];
  D.score = function (alt, R, dsn) {
    R = R || alt.R;
    const m = alt.metrics, f = R.facts || {};
    const sh = R.shadow;
    const v = {
      // çok derin planlarda dairelerin iç kısmı kullanılamaz: verim, gün ışığı katsayısıyla ağırlıklandırılır
      efficiency: cl((m.efficiency * (0.6 + 0.4 * m.windowFactor) - 0.6) / 0.22, 0, 1),
      kaksUse: cl(f.emsalUse || 0, 0, 1),
      daylight: cl(m.windowFactor, 0, 1),
      parking: alt.basement.need > 0 ? cl(alt.basement.capacity / alt.basement.need, 0, 1) : 1,
      openSpace: cl(((m.openShare || 0) - 0.25) / 0.35, 0, 1),
      shadow: sh ? cl(1 - (m.shadowHit || 0) / 6, 0, 1) : 0.8,
      structure: 0.5 * (m.structSpanOK ? 1 : 0.4) + 0.5 * (m.travelOK ? 1 : cl(1 - (m.travelMax - (dsn ? dsn.travel : 30)) / 30, 0, 1)),
    };
    let s = 0;
    const parts = D.scoreParts.map((p) => { s += p.w * v[p.id]; return { id: p.id, label: p.label, v: Math.round(v[p.id] * 1000) / 1000, w: p.w }; });
    const score = Math.round(s * 1000) / 10;
    return { score: score, parts: parts, grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D' };
  };

  /* ---------------- kat yığını, daire toplamları ---------------- */
  function groundHeight(im, dsn) {
    if (dsn.groundH != null) return dsn.groundH;
    return dsn.ground === 'ticari' ? Math.max(im.floorH, 4.0) : dsn.ground === 'pilotis' ? Math.max(im.floorH, 3.5) : im.floorH;
  }
  function buildStack(R, im, dsn, plan, bsFloors, bsArea) {
    const fh = im.floorH, gh = groundHeight(im, dsn), N = R.floors;
    const V = plan.variants || [{ units: plan.units, byType: {} }];
    const fp = plan.areas.gross;
    const stack = [];
    for (let k = bsFloors; k >= 1; k--) stack.push({ level: -k, name: 'Bodrum -' + k, kind: 'bodrum', elev: -k * STOREY_B, height: STOREY_B, units: 0, byType: {}, gross: r2(bsArea) });
    // konut katı sırası f (0 tabanlı): zemin konutsa zemin = 0, değilse 1. kat = 0; varyant = f mod V
    const fOf = (level) => (dsn.ground === 'konut' ? level : level - 1);
    const vOf = (level) => ((fOf(level) % V.length) + V.length) % V.length;
    const g0 = { level: 0, name: 'Zemin', kind: 'zemin', elev: 0, height: r2(gh), units: V[0].units.length, byType: Object.assign({}, V[0].byType), gross: r2(fp), variant: 0 };
    if (dsn.ground === 'ticari') { g0.byType = {}; g0.shops = V[0].units.length; g0.name = 'Zemin (ticari)'; }
    else if (dsn.ground === 'pilotis') { g0.units = 0; g0.byType = {}; g0.gross = r2(plan.areas.core); g0.name = 'Zemin (pilotis)'; }
    stack.push(g0);
    for (let k = 1; k < N; k++) {
      const vi = vOf(k);
      stack.push({ level: k, name: k + '. Kat', kind: 'normal', elev: r2(gh + (k - 1) * fh), height: fh, units: V[vi].units.length, byType: Object.assign({}, V[vi].byType), gross: r2(fp), variant: vi });
    }
    const top = gh + (N - 1) * fh;
    stack.push({ level: N, name: 'Çatı', kind: 'cati', elev: r2(top), height: 0, units: 0, byType: {}, gross: 0 });
    return { stack: stack, height: r2(top), groundH: gh };
  }
  // toplamlar: kat yığınındaki (gerçekte çizilen) varyantlardan
  function buildTotals(R, plan, dsn, stack) {
    const V = plan.variants || [{ units: plan.units }];
    const byType = {}, grossByType = {};
    let grossSum = 0, total = 0, nf = 0;
    stack.forEach((sk) => {
      if (sk.kind !== 'normal' && sk.kind !== 'zemin') return;
      if (sk.kind === 'zemin' && dsn.ground !== 'konut') return;
      nf++;
      V[sk.variant || 0].units.forEach((u) => {
        byType[u.type] = (byType[u.type] || 0) + 1;
        grossByType[u.type] = (grossByType[u.type] || 0) + u.area;
        grossSum += u.area; total++;
      });
    });
    let me = 0;
    TYPE_IDS.forEach((id) => { const sh = total ? (byType[id] || 0) / total : 0; if (total) me = Math.max(me, Math.abs(sh - (dsn.mix[id] || 0))); });
    const shops = dsn.ground === 'ticari' ? V[0].units.length : 0;
    const shopArea = dsn.ground === 'ticari' ? plan.areas.unitsGross : 0;
    Object.keys(grossByType).forEach((k) => { grossByType[k] = r2(grossByType[k]); });
    return {
      total: total, byType: byType, grossSum: r2(grossSum), netSum: r2(grossSum * NET_RATIO), avgGross: total ? r2(grossSum / total) : 0,
      mixError: Math.round(me * 1000) / 1000, floorsWithFlats: nf, shops: shops, shopArea: r2(shopArea), grossByType: grossByType, variants: V.length,
    };
  }

  /* ---------------- bir alternatifin tamamı ---------------- */
  function buildAlt(R, im, dsn, id, label, form, variant, bs) {
    const built = buildPlan(R, im, dsn, R.floors);
    const plan = built.plan, info = built.info;
    const sk = buildStack(R, im, dsn, plan, im.basement, bs ? bs.areaEach : 0);
    const totals = buildTotals(R, plan, dsn, sk.stack);
    const perUnit = dsn.park.perUnit != null ? dsn.park.perUnit : im.cars;
    const need = Math.ceil(totals.total * perUnit - 1e-9) + (totals.shops ? Math.ceil(totals.shopArea / 40 - 1e-9) : 0);
    const bFloors = bs ? im.basement : 0;
    const cap = bs && bFloors > 0 ? bs.stalls.length * bFloors : 0;
    const basement = {
      floors: bFloors, ring: bs && bFloors > 0 ? bs.ring : [], ramp: bs && bFloors > 0 ? bs.ramp : { poly: [], dir: [0, 1] }, stalls: bs && bFloors > 0 ? bs.stalls : [],
      aisles: bs && bFloors > 0 ? bs.aisles : [], cols: bs && bFloors > 0 ? bs.cols : [], capacity: cap, need: need, shortage: Math.max(0, need - cap),
      areaEach: bs && bFloors > 0 ? r2(bs.areaEach) : 0, perFloor: bs && bFloors > 0 ? bs.stalls.length : 0,
    };
    const f = R.facts || {};
    const ud = info.unitDepth;
    const wf = ud <= 8 ? 1 : ud <= 12 ? 1 - (ud - 8) / 8 : ud <= 16 ? 0.5 - (ud - 12) / 8 : 0;
    const nCore = Math.max(1, plan.cores.length);
    const metrics = {
      taks: Math.round((f.taksUsed || 0) * 1e4) / 1e4, kaks: Math.round((f.kaksUsed || 0) * 1e4) / 1e4, efficiency: plan.areas.efficiency,
      wingDepth: r2(info.meanDepth), windowFactor: Math.round(cl(wf, 0, 1) * 1e3) / 1e3, openShare: Math.round((f.freeShare || 0) * 1e4) / 1e4,
      unitsPerCore: r2(plan.units.length / nCore), carsPerUnit: totals.total ? r2(cap / totals.total) : 0,
      shadowHit: R.shadow && R.shadow.hit ? R.shadow.hit : 0, shadowTot: R.shadow && R.shadow.tot ? R.shadow.tot : 0,
      structSpanOK: info.maxSpan > 0 ? info.maxSpan <= 9.01 : false, maxSpan: r2(info.maxSpan),
      travelMax: r2(isFinite(info.travelMax) ? info.travelMax : 0), travelOK: info.travelMax <= dsn.travel + 0.01,
    };
    const alt = {
      id: id, label: label, form: form, variant: variant, R: R, floors: R.floors, height: sk.height, footprint: r2(R.footprint), built: r2(R.built),
      plan: plan, stack: sk.stack, unitTotals: totals, basement: basement, metrics: metrics, score: 0, parts: [], grade: 'D', notes: [],
      params: { wallExt: dsn.wallExt, wallInt: dsn.wallInt, ground: dsn.ground, groundH: sk.groundH, floorH: im.floorH, basementH: STOREY_B, modes: info.modes },
    };
    const sc = D.score(alt, R, dsn);
    alt.score = sc.score; alt.parts = sc.parts; alt.grade = sc.grade;
    alt.notes = makeNotes(alt, R, im, dsn, info);
    plan.units.forEach((u) => { delete u._travel; });
    return alt;
  }

  function makeNotes(alt, R, im, dsn, info) {
    const n = [], m = alt.metrics, pc = (v) => '%' + Math.round(v * 100);
    const MODE = { cift: 'çift yüklü koridor', tek: 'tek yüklü galeri', nokta: 'merkezi çekirdekli (nokta) kat', uc: 'uçta çekirdekli', none: 'yerleşime uygun değil' };
    const uniq = info.modes.filter((x, i, a) => a.indexOf(x) === i).map((x) => MODE[x]);
    n.push('Tipik kat: ' + uniq.join(' + ') + '; ' + alt.plan.cores.length + ' çekirdek, ' + alt.plan.units.length + ' daire, verim ' + pc(m.efficiency) + '.');
    if (alt.variant === 'kompakt') n.push('Kompakt kütle: taban alanı TAKS’ın %60’ına indirilerek ' + alt.floors + ' kata çıkıldı; açık alan artar.');
    if (alt.plan.units.length === 0) n.push('Bu kütlede (kanat derinliği çok az) tipik kat planı kurulamadı; daha kalın kanat ya da tek blok deneyin.');
    if (m.efficiency < 0.68 && alt.plan.units.length) n.push('Tipik kat verimi düşük (' + pc(m.efficiency) + '): çekirdek ve koridor payı yüksek; çekirdek sayısını azaltmak için kaçış mesafesini ya da kanat boyunu gözden geçirin.');
    if (!m.travelOK) n.push('En uzak daireden merdivene ' + U1(m.travelMax) + ' m var (sınır ' + dsn.travel + ' m); ek çekirdek ya da kısa kanat gerekir.');
    if (!m.structSpanOK && m.maxSpan > 0) n.push('Yapısal açıklık ' + U1(m.maxSpan) + ' m: 9 m’yi aşıyor; aks aralığını küçültün.');
    if (m.windowFactor < 0.6) n.push('Kanat derinliği gün ışığı için fazla (daire derinliği ~' + U1(info.unitDepth) + ' m).');
    if (alt.basement.floors === 0) n.push('Bodrum kat yok; otopark yeri sağlanamıyor' + (alt.basement.need ? ' (' + alt.basement.need + ' araç gerekli).' : '.'));
    else if (alt.basement.shortage > 0) n.push('Otopark açığı: ' + alt.basement.shortage + ' araç (' + alt.basement.capacity + ' / ' + alt.basement.need + '); bodrum kat sayısını artırın ya da araç oranını düşürün.');
    else if (alt.basement.need > 0) n.push('Otopark yeterli: ' + alt.basement.capacity + ' / ' + alt.basement.need + ' araç.');
    if (alt.basement.floors > 0 && !alt.basement.ramp.poly.length) n.push('Rampa ön kenara sığdırılamadı; rampa konumu elle belirlenmeli.');
    if (alt.unitTotals.mixError > 0.15 && alt.unitTotals.total) n.push('Daire karması hedeften %' + Math.round(alt.unitTotals.mixError * 100) + ' sapıyor (kat başına az daire olduğu için).');
    if (dsn.ground === 'ticari') n.push('Zemin kat ticari: ' + alt.unitTotals.shops + ' dükkân (' + Math.round(alt.unitTotals.shopArea) + ' m²); konut ' + alt.unitTotals.floorsWithFlats + ' katta.');
    if (dsn.ground === 'pilotis') n.push('Zemin kat pilotis: yalnızca çekirdek ve kolonlar; konut ' + alt.unitTotals.floorsWithFlats + ' katta.');
    if (dsn.ground !== 'konut' && alt.height > im.hmax + 0.01) n.push('Zemin kat yüksekliği nedeniyle toplam yükseklik ' + U1(alt.height) + ' m; yençok (' + U1(im.hmax) + ' m) aşılıyor.');
    if (R.shadow && m.shadowHit > 0) n.push(m.shadowHit + ' komşu yapı seçili güneş saatinde gölgede kalıyor.');
    return n;
  }
  const U1 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

  /* ---------------- üretim ---------------- */
  D.generate = function (im, parcel, ctx, dsn) {
    const Zm = Z();
    im = Zm.clampImar(im);
    dsn = D.clamp(dsn);
    if (!Array.isArray(parcel) || parcel.length < 3) return { ok: false, reason: 'parsel', alts: [], best: null };
    const jobs = [];
    Zm.FORMS.forEach((fm) => {
      const tam = Zm.compute(Object.assign({}, im, { form: fm.id, taks: im.taks }), parcel, ctx || null);
      jobs.push({ form: fm, variant: 'tam', R: tam });
      if (tam && tam.ok) {
        const kom = Zm.compute(Object.assign({}, im, { form: fm.id, taks: Math.max(0.05, im.taks * 0.6) }), parcel, ctx || null);
        if (kom && kom.ok && kom.floors !== tam.floors) jobs.push({ form: fm, variant: 'kompakt', R: kom });
      }
    });
    const blok = jobs.find((j) => j.form.id === 'blok' && j.variant === 'tam');
    if (!blok || !blok.R || !blok.R.ok) return { ok: false, reason: (blok && blok.R && blok.R.reason) || 'zarf', alts: [], best: null };
    const bs = basementLayout(parcel, blok.R, dsn);
    const seen = {}, alts = [];
    jobs.forEach((j) => {
      const R = j.R;
      if (!R || !R.ok || !R.pieces || !R.pieces.length) return;
      const isBlok = j.form.id === 'blok' && j.variant === 'tam';
      if (!isBlok && R.wing != null && R.wing < 7) return;
      const key = R.floors + '|' + R.pieces.map((p) => Math.round(aabs(p))).join(',') + '|' + R.pieces.map((p) => Math.round(G().centroid(p)[0] * 10) + '/' + Math.round(G().centroid(p)[1] * 10)).join(',');
      if (seen[key]) return;
      seen[key] = 1;
      const id = j.form.id + '-' + j.variant;
      const label = j.form.label + ' · ' + (j.variant === 'tam' ? 'tam TAKS' : 'kompakt (taban %60)');
      let alt;
      try { alt = buildAlt(R, im, dsn, id, label, j.form.id, j.variant, bs); } catch (e) { if (isBlok) throw e; return; }
      if (!isBlok && (!alt.plan.units.length || alt.plan.rest.reduce((t, r) => t + aabs(r.poly), 0) > 0.1 * alt.plan.areas.gross)) return;
      alts.push(alt);
    });
    // gün ışığı yok denecek kadar derin planlar, başka seçenek varsa elenir
    const lit = alts.filter((a) => a.metrics.windowFactor >= 0.15);
    const pool = lit.length ? lit : alts;
    pool.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    const out = pool.slice(0, 8);
    return { ok: out.length > 0, reason: out.length ? undefined : 'alternatif', alts: out, best: out.length ? out[0].id : null };
  };

  /* ======================================================================
     dışa aktarım: özet, katmanlar, alan tablosu, IFC modeli
     ====================================================================== */
  const deepRound = (v) => {
    if (typeof v === 'number') return isFinite(v) ? r2(v) : 0;
    if (Array.isArray(v)) return v.map(deepRound);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = deepRound(v[k]); }); return o; }
    return v;
  };

  D.summary = function (alt) {
    if (!alt) return null;
    const ut = alt.unitTotals || {}, b = alt.basement || {}, m = alt.metrics || {};
    return deepRound({
      id: alt.id, label: alt.label, form: alt.form, variant: alt.variant, floors: alt.floors, height: alt.height, footprint: alt.footprint, built: alt.built,
      units: { total: ut.total || 0, byType: Object.assign({}, ut.byType || {}), shops: ut.shops || 0 },
      parking: { capacity: b.capacity || 0, need: b.need || 0, floors: b.floors || 0 },
      efficiency: m.efficiency || 0, taks: m.taks || 0, kaks: m.kaks || 0, score: alt.score, grade: alt.grade, ground: alt.params ? alt.params.ground : 'konut',
    });
  };

  /* ---------------- çizim katmanları ---------------- */
  D.LAYER_STYLE = {
    PARSEL: { color: 1, label: 'Parsel' },
    CEKME: { color: 6, label: 'Çekme sınırı (yapılaşma zarfı)' },
    ZARF: { color: 7, label: 'Bina dış hattı / bodrum sınırı' },
    KUTLE: { color: 5, label: 'Kütle (kanatlar)' },
    DAIRE: { color: 3, label: 'Daireler' },
    CEKIRDEK: { color: 30, label: 'Çekirdek (merdiven, asansör)' },
    KORIDOR: { color: 9, label: 'Ortak koridor' },
    KOLON: { color: 2, label: 'Kolonlar' },
    AKS: { color: 4, label: 'Taşıyıcı aks' },
    OTOPARK: { color: 40, label: 'Otopark yerleri ve araç yolu' },
    RAMP: { color: 150, label: 'Araç rampası' },
    YAZI: { color: 7, label: 'Yazılar' },
  };
  const colPoly = (c) => [[c[0] - c[2] / 2, c[1] - c[3] / 2], [c[0] + c[2] / 2, c[1] - c[3] / 2], [c[0] + c[2] / 2, c[1] + c[3] / 2], [c[0] - c[2] / 2, c[1] + c[3] / 2]];

  // etiket noktası: ağırlık merkezi çokgenin içindeyse o, değilse sınıra en uzak iç örnek nokta (L biçimli dairelerde)
  D.labelPoint = function (poly) {
    const c = G().centroid(poly);
    if (G().pointInPoly(c, poly) && G().distToPoly(c, poly) > 0.8) return c;
    const bb = G().bbox(poly);
    let best = c, bd = -1;
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      const q = [bb.x0 + (bb.w * i) / 12, bb.y0 + (bb.h * j) / 12];
      if (!G().pointInPoly(q, poly)) continue;
      const dd = G().distToPoly(q, poly);
      if (dd > bd) { bd = dd; best = q; }
    }
    return best;
  };

  D.layers = function (alt, opts) {
    opts = opts || {};
    const sheet = opts.sheet === 'bodrum' || opts.sheet === 'vaziyet' ? opts.sheet : 'tipik';
    const out = [];
    const poly = (layer, pts) => { if (pts && pts.length >= 3) out.push({ layer: layer, kind: 'poly', pts: rpoly(pts), closed: true }); };
    const line = (layer, a, b) => out.push({ layer: layer, kind: 'line', pts: [rp(a), rp(b)], closed: false });
    const text = (s, at, h) => out.push({ layer: 'YAZI', kind: 'text', pts: [rp(at)], closed: false, text: String(s), h: h || 0.3, at: rp(at) });
    if (!alt) return out;
    const R = alt.R || {}, P = alt.plan, B = alt.basement;
    const cen = (p) => G().centroid(p);
    if (opts.parcel) poly('PARSEL', opts.parcel);
    if (sheet !== 'bodrum' && R.env) poly('CEKME', R.env);
    if (sheet === 'vaziyet') {
      P.pieces.forEach((pc) => poly('KUTLE', pc.poly));
      unionLoops(P.pieces.map((p) => p.poly)).forEach((l) => poly('ZARF', l));
      if (P.pieces.length) {
        const c = cen(P.pieces[0].poly);
        text(alt.floors + ' kat · h = ' + U1(alt.height) + ' m', c, 0.6);
        text('Taban ' + Math.round(alt.footprint) + ' m² · TAKS ' + alt.metrics.taks.toFixed(2).replace('.', ','), [c[0], c[1] - 1.2], 0.45);
      }
    } else if (sheet === 'tipik') {
      unionLoops(P.pieces.map((p) => p.poly)).forEach((l) => poly('ZARF', l));
      P.units.forEach((u) => { poly('DAIRE', u.poly); text(u.type + '  ' + Math.round(u.area) + ' m²', D.labelPoint(u.poly), 0.3); });
      P.cores.forEach((c) => { poly('CEKIRDEK', c.poly); poly('CEKIRDEK', c.stair); c.lifts.forEach((l) => poly('CEKIRDEK', l)); });
      P.corridors.forEach((c) => poly('KORIDOR', c));
      P.grid.cols.forEach((c) => poly('KOLON', colPoly(c)));
      P.pieces.forEach((pc) => {
        const ea = pc.frame.ea, eb = [-ea[1], ea[0]], o = pc.frame.o, b = pc.bounds;
        const W = (a, bb) => [o[0] + a * ea[0] + bb * eb[0], o[1] + a * ea[1] + bb * eb[1]];
        pc.axesA.forEach((a) => line('AKS', W(a, b[1] - 1.5), W(a, b[3] + 1.5)));
        pc.axesB.forEach((bb) => line('AKS', W(b[0] - 1.5, bb), W(b[2] + 1.5, bb)));
      });
      if (P.pieces.length) {
        const bb = G().bbox([].concat.apply([], P.pieces.map((p) => p.poly)));
        text('TİPİK KAT PLANI  ·  ' + alt.label, [bb.x0, bb.y0 - 2.5], 0.5);
        const nv = (P.variants || []).length;
        if (nv > 1) text('Not: bu paftada varyant A çizilmiştir; ' + nv + ' kat varyantı vardır (yalnızca daire kesimi ve karması değişir, çekirdek ve koridor aynıdır).', [bb.x0, bb.y0 - 4], 0.3);
      }
    } else {
      if (B.ring.length) poly('ZARF', B.ring);
      B.stalls.forEach((s) => poly('OTOPARK', s.poly));
      B.aisles.forEach((a) => poly('OTOPARK', a));
      if (B.ramp.poly.length) {
        poly('RAMP', B.ramp.poly);
        const c = cen(B.ramp.poly), dd = B.ramp.dir;
        line('RAMP', [c[0] - dd[0] * 4, c[1] - dd[1] * 4], [c[0] + dd[0] * 4, c[1] + dd[1] * 4]);
        text('RAMPA', c, 0.4);
      }
      B.cols.concat(P.grid.cols).forEach((c) => poly('KOLON', colPoly(c)));
      if (B.ring.length) { const bb = G().bbox(B.ring); text('BODRUM  ·  ' + B.perFloor + ' araç/kat × ' + B.floors + ' = ' + B.capacity + ' (ihtiyaç ' + B.need + ')', [bb.x0, bb.y0 - 2.5], 0.5); }
    }
    return out;
  };

  /* ---------------- alan tablosu ---------------- */
  D.areaTable = function (alt, im) {
    const R = alt.R || {}, P = alt.plan, ut = alt.unitTotals, B = alt.basement;
    im = im || R.im || {};
    const rows = [];
    const add = (g, k, v, u) => rows.push({ g: g, k: k, v: typeof v === 'number' ? r2(v) : v, u: u || '' });
    let above = 0, below = 0;
    alt.stack.forEach((s) => { if (s.kind === 'bodrum') below += s.gross; else if (s.kind !== 'cati') above += s.gross; });
    add('Arsa', 'Parsel alanı', R.A || 0, 'm²');
    add('Arsa', 'Yapılaşma zarfı (çekmeler sonrası)', R.Aenv || 0, 'm²');
    add('Kütle', 'Taban alanı', alt.footprint, 'm²');
    add('Kütle', 'TAKS (kullanılan)', alt.metrics.taks, '');
    if (im.taks != null) add('Kütle', 'TAKS (izin verilen)', im.taks, '');
    add('Kütle', 'KAKS / emsal (kullanılan)', alt.metrics.kaks, '');
    if (im.kaks != null) add('Kütle', 'KAKS / emsal (izin verilen)', im.kaks, '');
    add('Kütle', 'Kat sayısı (zemin dahil)', alt.floors, 'adet');
    add('Kütle', 'Yapı yüksekliği', alt.height, 'm');
    add('Kütle', 'Zemin üstü inşaat alanı', above, 'm²');
    add('Kütle', 'Bodrum alanı (kat başına)', B.areaEach, 'm²');
    add('Kütle', 'Bodrum alanı (toplam)', below, 'm²');
    add('Kütle', 'Açık alan oranı', alt.metrics.openShare * 100, '%');
    add('Program', 'Daire sayısı (toplam)', ut.total, 'adet');
    TYPE_IDS.forEach((id) => {
      const n = (ut.byType && ut.byType[id]) || 0;
      if (!n) return;
      const g = (ut.grossByType && ut.grossByType[id]) || 0;
      add('Program', id + ' daire adedi', n, 'adet');
      add('Program', id + ' brüt alan', g, 'm²');
      add('Program', id + ' net alan', g * NET_RATIO, 'm²');
    });
    add('Program', 'Daire brüt alanı (toplam)', ut.grossSum, 'm²');
    add('Program', 'Daire net alanı (toplam)', ut.netSum, 'm²');
    if (ut.shops) { add('Program', 'Zemin kat dükkân adedi', ut.shops, 'adet'); add('Program', 'Dükkân brüt alanı', ut.shopArea, 'm²'); }
    add('Sirkülasyon', 'Çekirdek (tipik kat)', P.areas.core, 'm²');
    add('Sirkülasyon', 'Koridor (tipik kat)', P.areas.corridor, 'm²');
    add('Sirkülasyon', 'Çekirdek adedi (kat başına)', P.cores.length, 'adet');
    add('Sirkülasyon', 'Tipik kat verimi', P.areas.efficiency * 100, '%');
    add('Otopark', 'Otopark ihtiyacı', B.need, 'araç');
    add('Otopark', 'Otopark kapasitesi', B.capacity, 'araç');
    add('Otopark', 'Bodrum kat sayısı', B.floors, 'adet');
    add('Otopark', 'Açık / eksik', B.shortage, 'araç');
    add('Puan', 'Tasarım puanı', alt.score, '/100');
    return rows;
  };

  /* ---------------- IFC modeli (App.ifc.build girişi) ---------------- */
  // doğru parçası → { key, dir, c, t0, t1 } (aynı doğru üzerindeki parçalar aynı anahtarı alır)
  function lineRep(a, b) {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 0.05) return null;
    dx /= L; dy /= L;
    if (dy < -1e-9 || (Math.abs(dy) <= 1e-9 && dx < 0)) { dx = -dx; dy = -dy; }
    const c = -a[0] * dy + a[1] * dx;
    const t0 = a[0] * dx + a[1] * dy, t1 = b[0] * dx + b[1] * dy;
    return { key: Math.round(Math.atan2(dy, dx) * 400) + '|' + Math.round(c * 25), dir: [dx, dy], c: c, t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
  }
  function addIv(list, t0, t1) {
    list.push([t0, t1]);
    list.sort((x, y) => x[0] - y[0]);
    const o = [];
    list.forEach((iv) => { const l = o[o.length - 1]; if (l && iv[0] <= l[1] + 0.02) l[1] = Math.max(l[1], iv[1]); else o.push([iv[0], iv[1]]); });
    list.length = 0; o.forEach((x) => list.push(x));
  }
  // kapalı çokgen listesi → tekilleştirilmiş duvar parçaları; covered = zaten duvar olan bölgeler
  function wallSegs(polys, covered) {
    const m = new Map();
    polys.forEach((p) => {
      for (let i = 0, n = p.length; i < n; i++) {
        const r = lineRep(p[i], p[(i + 1) % n]);
        if (!r) continue;
        let e = m.get(r.key);
        if (!e) { e = { dir: r.dir, c: r.c, iv: [] }; m.set(r.key, e); }
        addIv(e.iv, r.t0, r.t1);
      }
    });
    const out = [];
    m.forEach((e, key) => {
      let ivs = e.iv.map((x) => [x[0], x[1]]);
      const cv = covered && covered.get(key);
      if (cv) {
        cv.iv.forEach((c) => {
          const nx = [];
          ivs.forEach((iv) => {
            if (c[1] <= iv[0] + 0.02 || c[0] >= iv[1] - 0.02) { nx.push(iv); return; }
            if (c[0] > iv[0] + 0.02) nx.push([iv[0], c[0]]);
            if (c[1] < iv[1] - 0.02) nx.push([c[1], iv[1]]);
          });
          ivs = nx;
        });
      }
      ivs.forEach((iv) => {
        if (iv[1] - iv[0] < 0.15) return;
        const nx = -e.dir[1], ny = e.dir[0];
        out.push({ a: rp([iv[0] * e.dir[0] + e.c * nx, iv[0] * e.dir[1] + e.c * ny]), b: rp([iv[1] * e.dir[0] + e.c * nx, iv[1] * e.dir[1] + e.c * ny]) });
      });
    });
    return { segs: out, map: m };
  }

  D.toIfcModel = function (alt, project, opts) {
    opts = opts || {};
    project = project || {};
    const meta = project.meta || {}, site = project.site || {}, loc = site.loc || {};
    const P = alt.plan, B = alt.basement, prm = alt.params || {};
    const wE = prm.wallExt || 0.3, wI = prm.wallInt || 0.12;
    const pa = Array.isArray(site.parcel) && site.parcel.length >= 3 ? site.parcel.map((q) => rp(q)) : (opts.parcel || []);
    const ground = prm.ground || 'konut';
    const gtype = (u) => u.type;

    // tipik kat içeriği (bir kez hesaplanır, tüm katlarda paylaşılır)
    const loops = unionLoops(P.pieces.map((p) => p.poly));
    const ext = wallSegs(loops, null);
    const extWalls = ext.segs.map((s) => ({ a: s.a, b: s.b, thickness: wE, kind: 'exterior' }));
    const coreWalls = wallSegs(P.cores.map((c) => c.poly), ext.map).segs.map((s0) => ({ a: s0.a, b: s0.b, thickness: wI, kind: 'interior' }));
    const VAR = P.variants && P.variants.length ? P.variants : [{ units: P.units }];
    const intCache = {};
    const intAllOf = (vi) => intCache[vi] || (intCache[vi] = wallSegs(VAR[vi].units.map((u) => u.poly).concat(P.cores.map((c) => c.poly)), ext.map).segs.map((s0) => ({ a: s0.a, b: s0.b, thickness: wI, kind: 'interior' })));
    const slabsFloor = P.pieces.map((p, i) => ({ ring: p.poly, kind: 'floor', name: 'Döşeme ' + (i + 1) }));
    const slabsRoof = P.pieces.map((p, i) => ({ ring: p.poly, kind: 'roof', name: 'Çatı döşemesi ' + (i + 1), top: 0 }));
    const cols = P.grid.cols.map((c) => ({ x: c[0], y: c[1], w: c[2], d: c[3] }));
    const flatSpaces = (shop, vi) => VAR[vi || 0].units.map((u, i) => ({
      name: (shop ? 'Dükkân ' : 'Daire ') + (i + 1) + ' · ' + (shop ? 'ticari' : gtype(u)), longName: shop ? 'Ticari birim' : gtype(u) + ' daire', usage: shop ? 'Ticari' : 'Konut', ring: u.poly, area: u.area * NET_RATIO,
      props: shop ? { Tip: 'Dükkân', 'Brüt alan': u.area } : { Tip: gtype(u), 'Brüt alan': u.area, 'Net alan': r2(u.area * NET_RATIO) },
    }));
    const coreSpaces = P.cores.map((c, i) => ({ name: 'Çekirdek ' + (i + 1), usage: 'Dikey sirkülasyon', ring: c.poly }));
    const corrSpaces = P.corridors.map((c, i) => ({ name: 'Koridor ' + (i + 1), usage: 'Sirkülasyon', ring: c }));

    const assemble = (lod) => {
      const storeys = [];
      let typ = 0;
      alt.stack.forEach((sk) => {
        const S = { name: sk.name, elevation: sk.elev, height: sk.height, slabs: [], walls: [], spaces: [], columns: [], stalls: [] };
        if (sk.kind === 'bodrum') {
          const lowest = sk.level === -B.floors;
          if (B.ring.length) {
            S.slabs.push({ ring: B.ring, kind: lowest ? 'base' : 'floor', name: lowest ? 'Temel döşemesi' : 'Bodrum döşemesi' });
            const rn = B.ring.length;
            for (let i = 0; i < rn; i++) S.walls.push({ a: B.ring[i], b: B.ring[(i + 1) % rn], thickness: Math.max(wE, 0.3), kind: 'exterior', name: 'Perde duvar' });
          }
          S.columns = B.cols.map((c) => ({ x: c[0], y: c[1], w: 0.5, d: 0.5 }));
          const lv = -sk.level;
          // lod 6: park yerleri yalnız ilk bodrumda yazılır (varlık sayısı sınırı)
          S.stalls = (lod >= 6 && lv > 1) || lod >= 8 ? [] : (lod >= 7 ? B.stalls.slice(0, 24) : B.stalls).map((s, i) => ({ ring: s.poly, name: 'B' + lv + '-P' + (i + 1) }));
          if (lod < 1) {
            B.aisles.forEach((a, i) => S.spaces.push({ name: 'Araç yolu ' + (i + 1), usage: 'Otopark sirkülasyonu', ring: a }));
            if (B.ramp.poly.length && lv === 1) S.spaces.push({ name: 'Rampa', usage: 'Araç rampası', ring: B.ramp.poly });
          }
        } else if (sk.kind === 'cati') {
          S.slabs = slabsRoof;
        } else {
          const isG = sk.kind === 'zemin';
          if (!isG) typ++;
          S.slabs = slabsFloor;
          if (isG && ground === 'pilotis') {
            S.walls = coreWalls.slice();
            if (lod < 5) S.columns = cols;
            S.spaces = lod < 4 ? coreSpaces.slice() : [];
          } else {
            S.walls = extWalls.slice();
            const idx = isG ? 0 : typ;       // 0 = zemin, 1.. = tipik katlar
            if (lod < 3 || idx <= 1) S.walls = S.walls.concat(intAllOf(sk.variant || 0)); else if (lod < 5) S.walls = S.walls.concat(coreWalls);
            if (lod < 2 || idx <= (lod < 5 ? 2 : 1)) S.columns = cols;
            S.spaces = flatSpaces(isG && ground === 'ticari', sk.variant || 0);
            if (lod < 4) S.spaces = S.spaces.concat(coreSpaces);
            if (lod < 1) S.spaces = S.spaces.concat(corrSpaces);
          }
        }
        storeys.push(S);
      });
      return storeys;
    };

    const psb = {
      Form: alt.label, TAKS: alt.metrics.taks, KAKS: alt.metrics.kaks, KatSayisi: alt.floors, Yukseklik: alt.height, TabanAlani: alt.footprint, InsaatAlani: alt.built,
      DaireSayisi: alt.unitTotals.total, TipikKatVerimi: alt.metrics.efficiency, OtoparkKapasitesi: B.capacity, OtoparkIhtiyaci: B.need, BodrumKatSayisi: B.floors, Puan: alt.score, Not: alt.grade,
    };
    const model = {
      name: meta.name || 'Bina', description: 'archtools Tasarım Üretici · ' + alt.label, author: meta.author || undefined, organization: meta.organization || undefined,
      parcel: pa, storeys: [], psets: { building: psb, site: { ParselAlani: alt.R && alt.R.A ? r2(alt.R.A) : 0, Konum: loc.name || '' } },
    };
    if (isFinite(Number(loc.lat)) && isFinite(Number(loc.lon))) model.geo = { lat: Number(loc.lat), lon: Number(loc.lon) };

    const maxE = opts.maxEntities || 6000;
    let lod = opts.lod != null ? opts.lod : 0;
    model.storeys = assemble(lod);
    if (opts.lod == null && App.ifc && App.ifc.build) {
      // varlık sayısı sınırı: ayrıntıyı kademeli azalt (tipik kat tekrarları en pahalı kısımdır)
      for (lod = 0; lod <= 8; lod++) {
        model.storeys = assemble(lod);
        let n = 0;
        try { n = App.ifc.build(model).split('\n').length; } catch (e) { n = 0; }
        if (n <= maxE) break;
      }
      lod = Math.min(lod, 8);
    }
    model.lod = lod;
    return model;
  };
})();
