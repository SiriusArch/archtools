/* ==========================================================================
   31-lib-floors.js — Modül 2 mantığı: kat etüdü (saf fonksiyonlar, arayüzden bağımsız)
   Girdi : Modül 1 projesi (mekânlar, m², bölge, ilişkiler, balon konumları) + project.study
   Çıktı : kat başına ölçekli plan blokları (metre), skor, bulgular
   Birim : plan koordinatları metredir. x = plan genişliği (u), y = plan derinliği (v, aşağı doğru).
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const N = U.norm;
  const fmt = U.fmt;

  const CORE_RE = /merdiven|asansor|cekirdek/;
  const isCore = (s) => CORE_RE.test(N(s.name));
  const floorName = (i) => (i === 0 ? 'Zemin kat' : i + '. kat');
  const CORRIDOR_W = 1.5; // m
  const MIN_CORE = 12;    // m² (merdiven + asansör + şaft)

  function makeFloors(n, old) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ id: 'f' + i, name: old && old[i] ? old[i].name : floorName(i) });
    return out;
  }

  /* ---------- kat tercihi: 0 = zemin, 1 = üst kat ---------- */
  function pref0(s) {
    const nm = N(s.name);
    if (/yatak holu|ust hol/.test(nm)) return 0.9;
    if (/ebeveyn banyo|ensuit|en suite/.test(nm)) return 1;
    if (/banyo/.test(nm)) return 0.8;
    if (/\bwc\b|tuvalet/.test(nm)) return 0.1;
    if (/garaj|otopark|kazan|teknik|depo|kiler|siginak|mal kabul|yukleme/.test(nm)) return 0;
    if (/yatak|ebeveyn|cocuk|uyku|giyinme|misafir odasi/.test(nm)) return 1;
    if (/derslik|sinif|atolye|laboratuvar|\blab\b|kutuphane|toplanti|studyo|studuyo|ofis|mudur|yonetici|idare|rehberlik|muayene|calisma/.test(nm)) return 0.7;
    const zp = { sosyal: 0.05, servis: 0.25, sirkulasyon: 0.1, ozel: 0.95, calisma: 0.7, teknik: 0, acik: 0.5 };
    return zp[s.zone] != null ? zp[s.zone] : 0.5;
  }

  function suggestCount(project) {
    const mov = project.spaces.filter((s) => !isCore(s)).length;
    return U.clamp(Math.ceil(mov / 6), 1, 5);
  }

  /* ---------- otomatik kat ataması ----------
     Kural: bölge/anahtar kelimeden kat tercihi → güçlü ilişkili komşuların tercihiyle yumuşatma →
     tercihe göre sırala → alan dengesine göre katlara böl. */
  function autoAssign(spaces, relations, floors) {
    const n = floors.length;
    const out = {};
    if (n <= 1) { spaces.forEach((s) => (out[s.id] = floors[0].id)); return out; }
    const mov = spaces.filter((s) => !isCore(s));
    const p0 = {}, adj = {};
    mov.forEach((s) => { p0[s.id] = pref0(s); adj[s.id] = []; });
    Object.keys(relations).forEach((key) => {
      const ids = key.split('|');
      if (!(ids[0] in adj) || !(ids[1] in adj)) return;
      const w = relations[key] === 'strong' ? 3 : relations[key] === 'weak' ? 1 : 0;
      if (!w) return;
      adj[ids[0]].push([ids[1], w]); adj[ids[1]].push([ids[0], w]);
    });
    let p = Object.assign({}, p0);
    for (let it = 0; it < 3; it++) {
      const q = {};
      mov.forEach((s) => {
        let ws = 0, acc = 0;
        adj[s.id].forEach((e) => { ws += e[1]; acc += e[1] * p[e[0]]; });
        q[s.id] = ws ? 0.65 * p0[s.id] + 0.35 * (acc / ws) : p0[s.id];
      });
      p = q;
    }
    const order = mov.map((s, i) => ({ s: s, i: i })).sort((a, b) => p[a.s.id] - p[b.s.id] || a.i - b.i);
    const total = U.sum(mov, (s) => s.area) || 1;
    const cap = total / n;
    let cum = 0;
    order.forEach((o) => {
      const mid = cum + o.s.area / 2;
      out[o.s.id] = floors[Math.min(n - 1, Math.floor(mid / cap))].id;
      cum += o.s.area;
    });
    return out;
  }

  function init(project) {
    const n = suggestCount(project);
    const floors = makeFloors(n);
    return { floors: floors, assign: autoAssign(project.spaces, project.relations, floors), typology: 'serbest', ratio: 1.5, core: { auto: true, area: 16 }, auto: true };
  }

  /* ---------- geometri yardımcıları ---------- */
  const rectGap = (a, b) => {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return Math.hypot(dx, dy);
  };
  const overlapLen = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  function touching(a, b) {
    if (rectGap(a, b) > 0.2) return false;
    return overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) > 0.3 || overlapLen(a.y, a.y + a.h, b.y, b.y + b.h) > 0.3;
  }
  const overlapArea = (a, b) => Math.max(0, overlapLen(a.x, a.x + a.w, b.x, b.x + b.w)) * Math.max(0, overlapLen(a.y, a.y + a.h, b.y, b.y + b.h));

  /* ---------- bant bazlı yerleşim: balon konumlarını koruyarak kutuları dizer ---------- */
  function packBands(items, x0, y0, W, H, vertical) {
    const n = items.length;
    if (!n) return { rects: [], cost: 0 };
    const prim = vertical ? (it) => it.bx : (it) => it.by;
    const sec = vertical ? (it) => it.by : (it) => it.bx;
    const sorted = items.slice().sort((p, q) => prim(p) - prim(q));
    const total = U.sum(sorted, (it) => it.a);
    let best = null;
    for (let k = 1; k <= Math.min(n, 7); k++) {
      const groups = [];
      let cum = 0;
      sorted.forEach((it) => {
        const b = Math.min(k - 1, Math.floor(((cum + it.a / 2) / total) * k));
        (groups[b] = groups[b] || []).push(it);
        cum += it.a;
      });
      const rects = [];
      let off = 0;
      groups.filter(Boolean).forEach((g) => {
        const ag = U.sum(g, (it) => it.a);
        const thick = vertical ? ag / H : ag / W;
        let run = 0;
        g.sort((p, q) => sec(p) - sec(q)).forEach((it) => {
          const len = it.a / thick;
          rects.push(vertical
            ? { it: it, x: x0 + off, y: y0 + run, w: thick, h: len }
            : { it: it, x: x0 + run, y: y0 + off, w: len, h: thick });
          run += len;
        });
        off += thick;
      });
      let cost = 0;
      rects.forEach((r) => { cost += r.w * r.h * (Math.max(r.w / r.h, r.h / r.w) - 1); });
      if (!best || cost < best.cost) best = { rects: rects, cost: cost };
    }
    return best;
  }
  function packFree(items, x0, y0, W, H) {
    const a = packBands(items, x0, y0, W, H, false);
    const b = packBands(items, x0, y0, W, H, true);
    return b.cost < a.cost * 0.92 ? b.rects : a.rects;
  }
  function packRow(items, x0, y0, len, h) {
    const rects = [];
    let run = 0;
    items.slice().sort((p, q) => p.bx - q.bx).forEach((it) => {
      const w = h > 0 ? it.a / h : 0;
      rects.push({ it: it, x: x0 + run, y: y0, w: w, h: h });
      run += w;
    });
    return rects;
  }

  function spaceBlock(r) {
    const s = r.it.s;
    const side = Math.min(r.w, r.h);
    return { id: 'b' + s.id, kind: 'space', spaceId: s.id, name: s.name, zone: s.zone, area: s.area, x: r.x, y: r.y, w: r.w, h: r.h, minSide: side, aspect: Math.max(r.w, r.h) / Math.max(side, 0.001) };
  }

  /* ---------- kat planı üretimi ---------- */
  const memo = { key: null, plan: null };
  function layout(project, noMemo) {
    const st = project.study;
    if (!noMemo && memo.key && memo.key[0] === project.spaces && memo.key[1] === project.relations && memo.key[2] === st) return memo.plan;
    const floors = st.floors;
    const n = floors.length;
    const useCore = n > 1;
    const coreSpaces = useCore ? project.spaces.filter(isCore) : [];
    const mov = project.spaces.filter((s) => coreSpaces.indexOf(s) < 0);
    const coreArea = useCore ? (st.core.auto ? Math.max(MIN_CORE, U.sum(coreSpaces, (s) => s.area)) : Math.max(4, st.core.area)) : 0;
    const typ = st.typology === 'koridor' ? 'koridor' : 'serbest';
    const cw = typ === 'koridor' ? CORRIDOR_W : 0;
    const r = U.clamp(st.ratio || 1.5, 1, 3);

    const fdata = floors.map((f, i) => {
      const list = mov.filter((s) => (st.assign[s.id] && floors.some((x) => x.id === st.assign[s.id]) ? st.assign[s.id] : floors[0].id) === f.id);
      return { floor: f, index: i, spaces: list, net: U.sum(list, (s) => s.area) };
    });
    const Nmax = Math.max(1, Math.max.apply(null, fdata.map((f) => f.net)));

    // ortak kat plağı: en dolu katın alanına ve istenen oran r'ye göre derinlik (bisection)
    const Dof = (D) => (coreArea / D + Nmax / (D - cw)) / D - r;
    let lo = cw + 1.5, hi = 90;
    let Dp;
    if (Dof(lo) <= 0) Dp = lo;
    else { for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (Dof(mid) > 0) lo = mid; else hi = mid; } Dp = (lo + hi) / 2; }
    const cwid = coreArea / Dp;
    const Wp = cwid + Nmax / (Dp - cw);

    const pos = new Map(project.spaces.map((s) => [s.id, s]));
    const out = fdata.map((fd) => {
      const blocks = [];
      if (useCore) blocks.push({ id: 'core' + fd.index, kind: 'core', name: 'Çekirdek', zone: 'sirkulasyon', area: coreArea, x: 0, y: 0, w: cwid, h: Dp, minSide: Math.min(cwid, Dp), aspect: 1 });
      const items = fd.spaces.map((s) => ({ s: s, a: s.area, bx: pos.get(s.id).x, by: pos.get(s.id).y }));
      const len = fd.net / (Dp - cw);
      const x0 = cwid;
      if (typ === 'koridor') {
        const sorted = items.slice().sort((p, q) => p.by - q.by);
        const total = U.sum(sorted, (it) => it.a);
        const north = [], south = [];
        let cum = 0;
        sorted.forEach((it) => { (cum + it.a / 2 < total / 2 ? north : south).push(it); cum += it.a; });
        if (!north.length && south.length) north.push(south.shift());
        const A1 = U.sum(north, (it) => it.a);
        const d1 = len > 0 ? A1 / len : 0;
        packRow(north, x0, 0, len, d1).forEach((rc) => blocks.push(spaceBlock(rc)));
        blocks.push({ id: 'cor' + fd.index, kind: 'corridor', name: 'Koridor', zone: 'sirkulasyon', area: len * cw, x: x0, y: d1, w: len, h: cw, minSide: cw, aspect: len / cw });
        const d2 = len > 0 ? U.sum(south, (it) => it.a) / len : 0;
        packRow(south, x0, d1 + cw, len, d2).forEach((rc) => blocks.push(spaceBlock(rc)));
      } else {
        packFree(items, x0, 0, len, Dp).forEach((rc) => blocks.push(spaceBlock(rc)));
      }
      const used = x0 + len;
      const voidW = Wp - used;
      if (voidW > 0.05) blocks.push({ id: 'void' + fd.index, kind: 'void', name: 'Boş / teras', zone: 'acik', area: voidW * Dp, x: used, y: 0, w: voidW, h: Dp, minSide: Math.min(voidW, Dp), aspect: 1 });
      const voidArea = voidW > 0.05 ? voidW * Dp : 0;
      return { id: fd.floor.id, name: fd.floor.name, index: fd.index, blocks: blocks, net: fd.net, void: voidArea, spaces: fd.spaces };
    });

    const plan = { Wp: Wp, Dp: Dp, plateArea: Wp * Dp, coreArea: coreArea, cwid: cwid, typology: typ, ratio: r, useCore: useCore, coreSpaces: coreSpaces, corridorW: cw, floors: out };
    if (!noMemo) { memo.key = [project.spaces, project.relations, st]; memo.plan = plan; }
    return plan;
  }

  /* ---------- ölçüler ve skor ---------- */
  function metricsOf(project, plan) {
    const blockOf = new Map();
    plan.floors.forEach((f) => f.blocks.forEach((b) => { if (b.spaceId) blockOf.set(b.spaceId, { b: b, fi: f.index }); }));
    const strongCross = [], strongNear = [], avoidTouch = [];
    let wSum = 0, acc = 0, nPairs = 0, strongTotal = 0, strongSame = 0;
    Object.keys(project.relations).forEach((key) => {
      const ids = key.split('|');
      const A = blockOf.get(ids[0]), B = blockOf.get(ids[1]);
      if (!A || !B) return;
      const type = project.relations[key];
      const same = A.fi === B.fi;
      const gap = same ? rectGap(A.b, B.b) : null;
      const touch = same && touching(A.b, B.b);
      const adjFloor = Math.abs(A.fi - B.fi) === 1;
      const stack = !same && adjFloor && overlapArea(A.b, B.b) > 0;
      let sc = 1, w = 1;
      if (type === 'strong') {
        w = 3; strongTotal++;
        if (same) { strongSame++; sc = touch ? 1 : gap <= 1.8 ? 0.85 : 0.55; if (!touch && gap > 1.8) strongNear.push({ a: ids[0], b: ids[1], gap: gap }); }
        else { sc = stack ? 0.5 : adjFloor ? 0.35 : 0.15; strongCross.push({ a: ids[0], b: ids[1], fa: A.fi, fb: B.fi }); }
      } else if (type === 'weak') {
        w = 1; sc = same ? 1 : adjFloor ? 0.6 : 0.35;
      } else if (type === 'avoid') {
        w = 2; sc = touch ? 0 : same ? 0.75 : 1;
        if (touch) avoidTouch.push({ a: ids[0], b: ids[1] });
      } else return;
      nPairs++; wSum += w; acc += w * sc;
    });
    const nets = plan.floors.map((f) => f.net);
    const maxN = Math.max.apply(null, nets), minN = Math.min.apply(null, nets);
    const balance = maxN > 0 ? 1 - (maxN - minN) / maxN : 1;
    const totalNet = U.sum(nets);
    const totalGross = plan.plateArea * plan.floors.length;

    // ıslak hacimlerin düşey hizası
    let upperWet = 0, alignedWet = 0;
    for (let i = 1; i < plan.floors.length; i++) {
      const lower = plan.floors[i - 1].blocks.filter((b) => b.kind === 'space' && b.zone === 'servis');
      plan.floors[i].blocks.filter((b) => b.kind === 'space' && b.zone === 'servis').forEach((b) => {
        upperWet += b.w * b.h;
        lower.forEach((lb) => { alignedWet += overlapArea(b, lb); });
      });
    }
    const wetAlign = upperWet > 0 ? Math.min(1, alignedWet / upperWet) : null;

    return {
      score: nPairs ? Math.round((acc / wSum) * 100) : null,
      pairs: nPairs, strongTotal: strongTotal, strongSame: strongSame,
      strongCross: strongCross, strongNear: strongNear, avoidTouch: avoidTouch,
      balance: balance, totalNet: totalNet, totalGross: totalGross,
      fill: totalGross ? totalNet / totalGross : 0,
      wetAlign: wetAlign, nFloors: plan.floors.length,
    };
  }

  /* ---------- bulgular (kart biçimi: Modül 1 asistanıyla aynı) ---------- */
  const LEVEL_ORDER = { hata: 0, uyari: 1, oneri: 2, ok: 3 };
  function findings(project, plan, m) {
    const items = [];
    const name = new Map(project.spaces.map((s) => [s.id, s.name]));
    const area = new Map(project.spaces.map((s) => [s.id, s.area]));
    const fl = (i) => plan.floors[i].name;
    const floorOf = new Map();
    plan.floors.forEach((f) => f.blocks.forEach((b) => { if (b.spaceId) floorOf.set(b.spaceId, f); }));

    if (!project.spaces.length) {
      items.push({ id: 'empty', level: 'oneri', title: 'Önce işlev şemasında mekân ekleyin', detail: 'Kat etüdü, İşlev Şeması modülündeki mekânları katlara dağıtır.', src: [], actions: [{ type: 'goto', module: 'islev', label: 'İşlev Şeması’na git' }] });
      return { items: items, counts: { hata: 0, uyari: 0, oneri: 1 } };
    }
    m.strongCross.slice(0, 6).forEach((p) => {
      const small = area.get(p.a) <= area.get(p.b) ? p.a : p.b;
      const other = small === p.a ? p.b : p.a;
      items.push({
        id: 'cross-' + p.a + p.b, level: 'uyari',
        title: name.get(p.a) + ' ile ' + name.get(p.b) + ' farklı katlarda',
        detail: 'Güçlü ilişkili iki mekân ' + fl(p.fa) + ' ve ' + fl(p.fb) + ' katlarında; aralarındaki bağ merdivenle kurulur. Aynı kata almak dolaşımı kısaltır.',
        src: ['White'],
        actions: [{ type: 'studyMove', id: small, floorId: floorOf.get(other).id, label: name.get(small) + ' → ' + floorOf.get(other).name }, { type: 'select', id: small, label: 'Göster' }],
      });
    });
    m.avoidTouch.slice(0, 4).forEach((p) => {
      items.push({ id: 'avoid-' + p.a + p.b, level: 'uyari', title: name.get(p.a) + ' ile ' + name.get(p.b) + ' bitişik ama ayrı tutulmalı', detail: 'Bu çift “ayrı tut” olarak işaretli (gürültü, koku, mahremiyet). Farklı katlara ya da planın karşı uçlarına alın.', src: ['White'], actions: [{ type: 'select', id: p.a, label: 'Göster' }] });
    });
    m.strongNear.slice(0, 4).forEach((p) => {
      items.push({ id: 'near-' + p.a + p.b, level: 'oneri', title: name.get(p.a) + ' ile ' + name.get(p.b) + ' aynı katta ama bitişik değil', detail: 'Aralarında yaklaşık ' + fmt(p.gap, 1) + ' m var. Bitişik yerleştirin ya da kısa bir sirkülasyonla bağlayın.', src: ['White'], actions: [{ type: 'select', id: p.a, label: 'Göster' }] });
    });
    // dar kutular
    const thin = [];
    plan.floors.forEach((f) => f.blocks.forEach((b) => { if (b.kind === 'space' && b.zone !== 'sirkulasyon' && (b.minSide < 1.4 || b.aspect > 4)) thin.push(b); }));
    thin.slice(0, 3).forEach((b) => {
      items.push({ id: 'thin-' + b.id, level: 'oneri', title: b.name + ' plana sığarken çok dar kalıyor (' + fmt(Math.min(b.w, b.h), 1) + ' × ' + fmt(Math.max(b.w, b.h), 1) + ' m)', detail: 'Bu oranda mekân kullanışlı olmaz. Plan oranını değiştirin ya da mekânı başka bir kata alın.', src: ['S'], actions: [{ type: 'select', id: b.spaceId, label: 'Göster' }] });
    });
    if (plan.floors.length > 1) {
      plan.floors.forEach((f) => {
        const share = plan.plateArea ? f.void / (plan.plateArea - plan.coreArea || 1) : 0;
        if (share > 0.3 && f.net > 0) items.push({ id: 'void-' + f.id, level: 'oneri', title: f.name + ' plağın %' + Math.round(share * 100) + '’ini boş bırakıyor', detail: 'Katlar arasındaki alan dağılımı dengesiz. Mekânları dengeleyin ya da boş kısmı teras / çatı bahçesi olarak kullanın.', src: ['S'], actions: [{ type: 'studyAuto', label: 'Otomatik dağıt' }] });
        if (!f.net) items.push({ id: 'empty-' + f.id, level: 'uyari', title: f.name + ' boş', detail: 'Bu kata hiç mekân atanmadı. Kat sayısını azaltın ya da mekânları taşıyın.', src: [], actions: [{ type: 'studyAuto', label: 'Otomatik dağıt' }] });
      });
      if (m.wetAlign != null && m.wetAlign < 0.5) items.push({ id: 'wet', level: 'oneri', title: 'Islak hacimler düşeyde hizalı değil (%' + Math.round(m.wetAlign * 100) + ')', detail: 'Mutfak, banyo ve WC’leri üst üste getirmek tesisat şaftını kısaltır ve maliyeti düşürür.', src: ['S'], actions: [] });
    }
    items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    if (!counts.hata && !counts.uyari) items.unshift({ id: 'ok', level: 'ok', title: 'Kat dağılımında kritik sorun görünmüyor', detail: m.score != null ? 'Kat etüdü skoru %' + m.score + '. Kalan önerileri gözden geçirin.' : 'İlişkileri tanımlayarak skoru başlatın.', src: [], actions: [] });
    return { items: items, counts: counts };
  }

  const derivedMemo = { plan: null, out: null };
  function derive(project) {
    const plan = layout(project);
    if (derivedMemo.plan === plan) return derivedMemo.out;
    const m = metricsOf(project, plan);
    const f = findings(project, plan, m);
    derivedMemo.plan = plan;
    derivedMemo.out = { plan: plan, metrics: m, findings: f };
    return derivedMemo.out;
  }

  /* ---------- plan alternatifleri: yerleşim düzeni × plak oranı, aynı kat ataması ile ---------- */
  const ALT_SPECS = [['serbest', 1.2], ['serbest', 1.5], ['serbest', 2.2], ['koridor', 1.5], ['koridor', 2.0], ['koridor', 2.6]];
  const altMemo = { k: null, v: null };
  function alternatives(project) {
    const st = project.study;
    if (!st || !project.spaces.length) return [];
    const key = [project.spaces, project.relations, st.floors, st.assign, st.core];
    if (altMemo.k && altMemo.k.every((x, i) => x === key[i])) return altMemo.v;
    const list = ALT_SPECS.map((sp) => {
      const pj = Object.assign({}, project, { study: Object.assign({}, st, { typology: sp[0], ratio: sp[1] }) });
      const plan = layout(pj, true);
      const m = metricsOf(pj, plan);
      let thin = 0;
      plan.floors.forEach((f) => f.blocks.forEach((b) => { if (b.kind === 'space' && b.zone !== 'sirkulasyon' && (b.minSide < 1.4 || b.aspect > 4)) thin++; }));
      // plak boşluğu: ortak plakta kullanılmayan oran
      const voidShare = plan.floors.length ? plan.floors.reduce((t, f) => t + f.void, 0) / (plan.plateArea * plan.floors.length || 1) : 0;
      return { typology: sp[0], ratio: sp[1], plan: plan, score: m.score, thin: thin, voidShare: voidShare, strongCross: m.strongCross.length };
    });
    // en iyi: skor, sonra az dar mekân, sonra az boşluk
    const rank = list.slice().sort((a, b) => ((b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score)) || (a.thin - b.thin) || (a.voidShare - b.voidShare));
    list.forEach((a) => { a.best = a === rank[0]; });
    altMemo.k = key; altMemo.v = list;
    return list;
  }

  App.study = App.study || {};
  App.study.alternatives = alternatives;
  Object.assign(App.study, {
    init: init, isCore: isCore, floorName: floorName, makeFloors: makeFloors, autoAssign: autoAssign, suggestCount: suggestCount,
    layout: layout, metrics: metricsOf, findings: findings, derive: derive, touching: touching, rectGap: rectGap, overlapArea: overlapArea, MIN_CORE: MIN_CORE, CORRIDOR_W: CORRIDOR_W,
  });
})();
