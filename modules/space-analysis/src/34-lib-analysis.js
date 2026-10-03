/* ==========================================================================
   34-lib-analysis.js — Modül 3: mekân analizi (patlatılmış izometrik simülasyon)
   Veri : Modül 2'nin kat planı (App.study.derive) + Modül 1'in ilişkileri / bilgi tabanı
   Mod  : 'floors'  → her kat bir levha, işlev renkli, düşey çizgiler, kat göstergesi
          'layers'  → seçili katın analiz katmanları (taban, işlev, sirkülasyon, doluluk, ilişki, gürültü)
   Çıktı: primitif listesi (SVG + PNG/PDF aynı listeden) + etkileşim bölgeleri + bulgular
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const fmt = U.fmt;
  const iso = App.iso;
  const sheet = App.sheet;

  const LAYERS = [
    { id: 'taban', name: 'Taban', sub: 'Kat planı ve ölçüler' },
    { id: 'islev', name: 'İşlev', sub: 'Bölgelere göre mekânlar' },
    { id: 'sirk', name: 'Sirkülasyon', sub: 'Çekirdek, koridor, akış' },
    { id: 'doluluk', name: 'Doluluk · Boşluk', sub: 'Dolu hacim ve boşluk' },
    { id: 'iliski', name: 'İlişkiler', sub: 'Güçlü, zayıf, ayrı tut' },
    { id: 'gurultu', name: 'Gürültü', sub: 'Gürültülü ve sessiz mekânlar' },
  ];

  App.analysisDefaults = function () {
    return { mode: 'floors', explode: 1, yaw: -34, pitch: 36, labels: true, arrows: true, guides: true, volume: true, floorId: null, sel: null, layers: ['taban', 'islev', 'sirk', 'doluluk', 'iliski'] };
  };

  /* ---------- tema renkleri ---------- */
  function cols() {
    const PAL = App.PAL;
    if (App.theme.name === 'glass') {
      return {
        glass: true, ink: PAL.ink, slabTop: '#F5F6F9', slabStroke: 'rgba(23,24,27,.30)', blockStroke: 'rgba(23,24,27,.26)', sw: 1,
        accent: PAL.ink, core: '#2A2B30', coreText: '#F6F7F9', corridor: '#D9DBE1', flat: '#ECEDF1', dolu: '#2A2B30', guide: 'rgba(23,24,27,.42)',
        noise: { loud: '#2A2B30', mid: '#8E9199', quiet: '#E3E4E9' }, noiseText: { loud: '#F6F7F9', mid: '#F6F7F9', quiet: '#17181B' },
        numBg: [PAL.ink], numFg: ['#F6F7F9'], strongLine: PAL.ink,
      };
    }
    return {
      glass: false, ink: PAL.ink, slabTop: PAL.paper, slabStroke: PAL.ink, blockStroke: PAL.ink, sw: 1.6,
      accent: PAL.red, core: PAL.ink, coreText: PAL.paper, corridor: PAL.paperDark, flat: '#E9DDBC', dolu: PAL.ink, guide: PAL.ink,
      noise: { loud: PAL.red, mid: PAL.yellow, quiet: PAL.blueBright }, noiseText: { loud: PAL.paper, mid: PAL.ink, quiet: PAL.paper },
      numBg: [PAL.blue, PAL.yellow, PAL.red], numFg: [PAL.paper, PAL.ink, PAL.paper], strongLine: PAL.blue,
    };
  }

  /* ---------- gürültü sınıfı: bilgi tabanı → bölge ---------- */
  function noiseMap(project) {
    const variant = App.kb.variant(project.meta.buildingType, project.meta.variant);
    const m = App.match.spaces(project.spaces, variant.entries);
    const zoneNoise = { servis: 'mid', teknik: 'loud', sosyal: 'mid', ozel: 'quiet', calisma: 'quiet', sirkulasyon: 'mid', acik: 'mid' };
    const out = new Map();
    project.spaces.forEach((s) => {
      const e = m.bySpace.get(s.id);
      out.set(s.id, e && e.noise ? e.noise : zoneNoise[s.zone] || 'mid');
    });
    return out;
  }
  const NOISE_LABEL = { loud: 'Gürültülü', mid: 'Orta', quiet: 'Sessiz' };

  /* ---------- plan üzerinde dış cephe teması ---------- */
  function exterior(b, plan) {
    const e = 0.05;
    return b.x < e || b.y < e || b.x + b.w > plan.Wp - e || b.y + b.h > plan.Dp - e || false;
  }
  function touchesVoid(b, f) {
    const v = f.blocks.find((q) => q.kind === 'void');
    return !!(v && App.study.rectGap(b, v) < 0.1 && App.study.touching(b, v));
  }

  /* ---------- analiz: ölçüler + bulgular ---------- */
  const amemo = { plan: null, noise: null, out: null };
  function analyze(project, d) {
    if (amemo.plan === d.plan && amemo.noise === project.spaces) return amemo.out;
    const plan = d.plan, m = d.metrics;
    const noise = noiseMap(project);
    const items = [];
    const nameOf = new Map(project.spaces.map((s) => [s.id, s.name]));
    const zoneOf = new Map(project.spaces.map((s) => [s.id, s.zone]));
    const habZones = { sosyal: 1, ozel: 1, calisma: 1 };

    // 1) gün ışığı / cephe teması
    let hab = 0, habExt = 0;
    const dark = [];
    plan.floors.forEach((f) => f.blocks.forEach((b) => {
      if (b.kind !== 'space' || !habZones[b.zone]) return;
      hab++;
      if (exterior(b, plan) || touchesVoid(b, f)) habExt++; else dark.push({ b: b, f: f });
    }));
    const daylight = hab ? habExt / hab : 1;
    dark.slice(0, 4).forEach((q) => items.push({ id: 'dark-' + q.b.id, level: 'uyari', title: q.b.name + ' dış cepheye açılmıyor (' + q.f.name + ')', detail: 'Yaşama mekânı plan içinde kalmış; doğal ışık ve havalandırma için cepheye almayı ya da plan oranını değiştirmeyi deneyin.', src: ['S'], actions: [{ type: 'select', id: q.b.spaceId, label: 'Göster' }] }));

    // 2) ıslak hacim hizası
    if (m.wetAlign != null) {
      if (m.wetAlign < 0.5) items.push({ id: 'wet', level: 'uyari', title: 'Islak hacimler düşeyde hizalı değil (%' + Math.round(m.wetAlign * 100) + ')', detail: 'Üst kattaki mutfak, banyo ve WC’lerin yarısından fazlası altında ıslak hacim yok; tesisat şaftı uzar. Katları yeniden dağıtın ya da ıslak hacimleri üst üste getirin.', src: ['S'], actions: [{ type: 'studyAuto', label: 'Otomatik dağıt' }] });
      else if (m.wetAlign < 0.8) items.push({ id: 'wet', level: 'oneri', title: 'Islak hacim hizası %' + Math.round(m.wetAlign * 100), detail: 'Kısmen hizalı. Kalan ıslak hacimleri alt kattakilerle çakıştırın.', src: ['S'], actions: [] });
    }

    // 3) gürültülü mekânın sessiz mekânın üstünde / altında olması
    let conflicts = 0, vpairs = 0;
    const conflictList = [];
    for (let i = 1; i < plan.floors.length; i++) {
      const lo = plan.floors[i - 1].blocks.filter((b) => b.kind === 'space');
      plan.floors[i].blocks.filter((b) => b.kind === 'space').forEach((ub) => lo.forEach((lb) => {
        if (App.study.overlapArea(ub, lb) < 2) return;
        const nu = noise.get(ub.spaceId), nl = noise.get(lb.spaceId);
        if (nu === 'mid' || nl === 'mid') return;
        vpairs++;
        if (nu !== nl) { conflicts++; conflictList.push({ loud: nu === 'loud' ? ub : lb, quiet: nu === 'loud' ? lb : ub, above: nu === 'loud' }); }
      }));
    }
    conflictList.slice(0, 3).forEach((c) => items.push({ id: 'noise-' + c.loud.id + c.quiet.id, level: 'oneri', title: 'Gürültülü ' + c.loud.name + ', sessiz ' + c.quiet.name + (c.above ? ' üstünde' : ' altında'), detail: 'Kat döşemesi darbe ve hava sesini iletir; gürültülü mekânı sessizin üstüne almaktan kaçının ya da araya depo / servis mekânı koyun.', src: ['MEB15', 'S'], actions: [{ type: 'select', id: c.loud.spaceId, label: 'Göster' }] }));

    // 4) sirkülasyon payı (çekirdek + koridor + sirkülasyon bölgesi mekânları)
    let circ = 0, occ = 0;
    plan.floors.forEach((f) => f.blocks.forEach((b) => {
      if (b.kind === 'void') return;
      occ += b.w * b.h;
      if (b.kind === 'core' || b.kind === 'corridor' || b.zone === 'sirkulasyon') circ += b.w * b.h;
    }));
    const circShare = occ ? circ / occ : 0;
    const type = App.kb.type(project.meta.buildingType);
    if (type.circ && occ) {
      if (circShare > type.circ[1] * 1.35) items.push({ id: 'circ-hi', level: 'oneri', title: 'Sirkülasyon payı yüksek (%' + Math.round(circShare * 100) + ')', detail: type.label + ' için tipik aralık %' + Math.round(type.circ[0] * 100) + '–' + Math.round(type.circ[1] * 100) + '. Çekirdek ve koridor alanlarını sıkılaştırmayı düşünün.', src: ['GSA', 'S'], actions: [] });
      else if (circShare < type.circ[0] * 0.5 && plan.floors.length > 1) items.push({ id: 'circ-lo', level: 'oneri', title: 'Sirkülasyon payı düşük (%' + Math.round(circShare * 100) + ')', detail: 'Antre, hol ya da koridor eksik olabilir; mekânlar arası geçişi nasıl kuracağınızı kontrol edin.', src: ['GSA', 'S'], actions: [] });
    }

    // 5) çekirdeğe en uzak mekân
    let far = null;
    plan.floors.forEach((f) => f.blocks.forEach((b) => {
      if (b.kind !== 'space') return;
      const dist = (b.x + b.w / 2 - plan.cwid) + Math.abs(b.y + b.h / 2 - plan.Dp / 2);
      if (!far || dist > far.dist) far = { dist: dist, b: b, f: f };
    }));
    if (far && plan.useCore && far.dist > 24) items.push({ id: 'far', level: 'oneri', title: far.b.name + ' çekirdeğe yaklaşık ' + fmt(far.dist, 0) + ' m uzakta', detail: 'Uzun dolaşım yolu hem kaçış hem günlük kullanım için dezavantajdır. Plan oranını kısaltın ya da ikinci bir çekirdek düşünün.', src: ['S'], actions: [{ type: 'select', id: far.b.spaceId, label: 'Göster' }] });

    // 6) plak doluluğu
    if (plan.floors.length > 1 && m.fill < 0.7) items.push({ id: 'fill', level: 'oneri', title: 'Plak doluluğu %' + Math.round(m.fill * 100), detail: 'Katların toplam net alanı brüt plak alanının %' + Math.round(m.fill * 100) + '’i. Kat sayısını azaltmak ya da mekânları dengelemek plak boşluğunu kapatır.', src: ['S'], actions: [{ type: 'studyAuto', label: 'Otomatik dağıt' }] });

    // kat başına program karışımı
    const mix = plan.floors.map((f) => {
      const tot = U.sum(f.spaces, (s) => s.area) || 1;
      const by = {};
      f.spaces.forEach((s) => { by[s.zone] = (by[s.zone] || 0) + s.area; });
      return { id: f.id, name: f.name, total: tot, zones: App.ZONE_ORDER.filter((z) => by[z]).map((z) => ({ zone: z, area: by[z], share: by[z] / tot })) };
    });

    // bileşik skor: ıslak hacim hizası · gün ışığı · gürültü uyumu · plak doluluğu
    const parts = [
      { k: 'Islak hacim hizası', v: m.wetAlign == null ? 1 : m.wetAlign, w: 0.3 },
      { k: 'Gün ışığı (cephe teması)', v: daylight, w: 0.3 },
      { k: 'Gürültü uyumu', v: vpairs ? 1 - conflicts / vpairs : 1, w: 0.2 },
      { k: 'Plak doluluğu', v: Math.min(1, m.fill / 0.9), w: 0.2 },
    ];
    const score = project.spaces.length ? Math.round(parts.reduce((t, p) => t + p.v * p.w, 0) * 100) : null;

    const LEVEL = { hata: 0, uyari: 1, oneri: 2, ok: 3 };
    items.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    if (!project.spaces.length) items.push({ id: 'empty', level: 'oneri', title: 'Önce işlev şemasında mekân ekleyin', detail: 'Analiz, Kat Etüdü’ndeki kat planlarından üretilir.', src: [], actions: [{ type: 'goto', module: 'islev', label: 'İşlev Şeması’na git' }] });
    else if (!counts.hata && !counts.uyari) items.unshift({ id: 'ok', level: 'ok', title: 'Düşey ve çevresel analizde kritik sorun görünmüyor', detail: 'Uyum skoru %' + score + '.', src: [], actions: [] });

    const out = {
      items: items, counts: counts, score: score, parts: parts, mix: mix, noise: noise,
      stats: { daylight: daylight, circShare: circShare, wetAlign: m.wetAlign, conflicts: conflicts, fill: m.fill, nHab: hab, nHabExt: habExt },
    };
    amemo.plan = d.plan; amemo.noise = project.spaces; amemo.out = out;
    return out;
  }

  /* ---------- blok etiketi (düzleme oturan) ---------- */
  function blockLabel(I, b, z, color, o) {
    o = o || {};
    const vertical = b.h > b.w * 1.5 && b.h * I.s > 46;
    const L = vertical ? b.h : b.w, T = vertical ? b.w : b.h;
    const fit = sheet.fitLabel(b.name, L * I.s, T * I.s, { withArea: o.area !== false, max: o.max || 17, min: 8 });
    if (!fit) return [];
    const fsM = fit.fs / I.s;
    const lh = 1.18;
    const hn = fit.lines.length * lh * fsM, ha = o.area !== false ? 0.95 * fsM * 0.82 : 0;
    const total = hn + ha;
    const cu = b.x + b.w / 2, cv = b.y + b.h / 2;
    const dir = vertical ? 'v' : 'u';
    const P = iso.planText(I, cu, cv, z, fit.lines, fsM, { dir: dir, fill: color, fam: 'l', weight: 700, ls: fit.ls, shift: -total / 2 + hn / 2, lh: lh });
    if (o.area !== false) P.push.apply(P, iso.planText(I, cu, cv, z, [fmt(b.area) + ' m²'], fsM * 0.82, { dir: dir, fill: color, fam: 'm', weight: 500, opacity: 0.75, shift: -total / 2 + hn + ha / 2 }));
    return P;
  }

  /* ---------- bir levhanın (kat veya katman) içeriği ---------- */
  function sortByDepth(I, blocks) {
    return blocks.slice().sort((a, b) => I.depth(a.x + a.w / 2, a.y + a.h / 2) - I.depth(b.x + b.w / 2, b.y + b.h / 2));
  }

  function dimOp(P, k) { if (k >= 1) return P; P.forEach((p) => { p.opacity = (p.opacity == null ? 1 : p.opacity) * k; }); return P; }

  function slabBase(I, plan, z, C, thick) {
    return iso.prism(I, 0, 0, plan.Wp, plan.Dp, z - thick, z, C.slabTop, { stroke: C.slabStroke, sw: C.sw });
  }

  function relCenter(b) { return [b.x + b.w / 2, b.y + b.h / 2]; }
  function curve(a, b, sign) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = 0.16 * len * (sign || 1);
    return [mx - (dy / len) * k, my + (dx / len) * k];
  }

  // Kat modu: işlev renkli hacimler
  function floorSlab(I, project, plan, f, z, view, C, hW, noise) {
    const P = [];
    iso.prism(I, 0, 0, plan.Wp, plan.Dp, z - 0.45, z, C.slabTop, { stroke: C.slabStroke, sw: C.sw }).forEach((p) => P.push(p));
    const flat = f.blocks.filter((b) => b.kind === 'void' || b.kind === 'corridor');
    const solid = sortByDepth(I, f.blocks.filter((b) => b.kind === 'space' || b.kind === 'core'));
    flat.forEach((b) => {
      if (b.kind === 'void') {
        const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map((q) => I.proj(q[0], q[1], z + 0.02));
        P.push({ t: 'poly', pts: pts, stroke: C.ink, sw: 1, opacity: 0.4 });
        iso.hatch(I, b.x, b.y, b.w, b.h, z + 0.02, Math.max(1.2, plan.Dp / 9), { stroke: C.ink, sw: 0.8, opacity: 0.16 }).forEach((p) => P.push(p));
      } else {
        iso.prism(I, b.x, b.y, b.w, b.h, z, z + 0.04, C.corridor, { stroke: C.blockStroke, sw: 0.8 }).forEach((p) => P.push(p));
        if (view.arrows) P.push(iso.seg(I, b.x + 0.4, b.y + b.h / 2, b.x + b.w - 0.4, b.y + b.h / 2, z + 0.06, { stroke: C.accent, sw: 2, dash: [7, 6], opacity: 0.8 }));
      }
    });
    solid.forEach((b) => {
      if (b.kind === 'core') {
        iso.prism(I, b.x, b.y, b.w, b.h, z, z + hW * 1.1, C.core, { stroke: C.blockStroke, sw: C.sw }).forEach((p) => P.push(p));
        return;
      }
      const zn = App.ZONES[b.zone] || App.ZONES.sosyal;
      iso.prism(I, b.x, b.y, b.w, b.h, z, z + (view.volume ? hW : 0.12), zn.fill, { stroke: C.blockStroke, sw: C.sw }).forEach((p) => P.push(p));
    });
    const top = z + (view.volume ? hW : 0.12) + 0.02;
    if (view.labels) solid.forEach((b) => {
      if (b.kind === 'core') { iso.planText(I, b.x + b.w / 2, b.y + b.h / 2, z + hW * 1.1 + 0.02, ['Çekirdek'], Math.min(0.8, b.w * 0.34), { dir: 'v', fill: C.coreText, fam: 'l', weight: 700, opacity: 0.9 }).forEach((p) => P.push(p)); return; }
      const zn = App.ZONES[b.zone] || App.ZONES.sosyal;
      blockLabel(I, b, top, zn.text).forEach((p) => P.push(p));
    });
    // kat adı: levhanın ön kenarında
    iso.planText(I, plan.Wp / 2, plan.Dp + 1.5, z, [App.theme.name === 'glass' ? f.name.toLocaleUpperCase('tr') : f.name.toLocaleUpperCase('tr')], Math.min(1.5, plan.Dp * 0.12), { dir: 'u', fill: C.ink, fam: 'd', weight: C.glass ? 400 : 700, opacity: 0.55, ls: 3 }).forEach((p) => P.push(p));
    // aynı kattaki güçlü ilişkiler: eğri oklar
    if (view.arrows) {
      const by = new Map();
      f.blocks.forEach((b) => { if (b.spaceId) by.set(b.spaceId, b); });
      Object.keys(project.relations).forEach((key, i) => {
        if (project.relations[key] !== 'strong') return;
        const ids = key.split('|');
        const A = by.get(ids[0]), B = by.get(ids[1]);
        if (!A || !B) return;
        const a = relCenter(A), b = relCenter(B);
        // ok, sirkülasyon bölgesindeki mekândan çıkar
        const from = zoneOfBlock(A) === 'sirkulasyon' || zoneOfBlock(B) !== 'sirkulasyon' ? a : b;
        const to = from === a ? b : a;
        iso.arrow(I, from, curve(from, to, i % 2 ? 1 : -1), to, top + 0.04, { stroke: C.accent, sw: 2.2, opacity: 0.9, head: 11 }).forEach((p) => P.push(p));
      });
    }
    return P;
  }
  const zoneOfBlock = (b) => b.zone;

  function layerSlab(I, project, plan, f, z, layerId, view, C, hW, A) {
    const P = [];
    const add = (arr) => arr.forEach((p) => P.push(p));
    add(slabBase(I, plan, z, C, 0.3));
    const space = f.blocks.filter((b) => b.kind === 'space');
    const flatTop = z + 0.02;

    if (layerId === 'taban') {
      add(iso.grid(I, plan.Wp, plan.Dp, flatTop, 1, { stroke: C.ink, sw: 0.5, opacity: 0.07 }));
      f.blocks.forEach((b) => {
        const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map((q) => I.proj(q[0], q[1], flatTop + 0.02));
        if (b.kind === 'void') { P.push({ t: 'poly', pts: pts, stroke: C.ink, sw: 1, opacity: 0.35 }); return; }
        P.push({ t: 'poly', pts: pts, fill: b.kind === 'core' ? C.core : b.kind === 'corridor' ? C.corridor : '#FFFFFF', stroke: C.ink, sw: C.glass ? 1.1 : 1.8, opacity: b.kind === 'space' ? 0.95 : 1 });
      });
      if (view.labels) space.forEach((b) => add(blockLabel(I, b, flatTop + 0.05, C.ink, { max: 16 })));
      // ölçü çizgileri
      const gz = flatTop + 0.03, off = 1.2;
      add([iso.seg(I, 0, plan.Dp + off, plan.Wp, plan.Dp + off, gz, { stroke: C.ink, sw: 1, opacity: 0.55 }), iso.seg(I, 0, plan.Dp + off - 0.4, 0, plan.Dp + off + 0.4, gz, { stroke: C.ink, sw: 1, opacity: 0.55 }), iso.seg(I, plan.Wp, plan.Dp + off - 0.4, plan.Wp, plan.Dp + off + 0.4, gz, { stroke: C.ink, sw: 1, opacity: 0.55 })]);
      add(iso.planText(I, plan.Wp / 2, plan.Dp + off + 1.1, gz, [sheet.dimText(plan.Wp)], Math.min(1.1, plan.Dp * 0.1), { dir: 'u', fill: C.ink, fam: 'm', weight: 600, opacity: 0.7 }));
      add([iso.seg(I, plan.Wp + off, 0, plan.Wp + off, plan.Dp, gz, { stroke: C.ink, sw: 1, opacity: 0.55 })]);
      add(iso.planText(I, plan.Wp + off + 1.3, plan.Dp / 2, gz, [sheet.dimText(plan.Dp)], Math.min(1.1, plan.Dp * 0.1), { dir: 'v', fill: C.ink, fam: 'm', weight: 600, opacity: 0.7 }));
    } else if (layerId === 'islev') {
      sortByDepth(I, f.blocks.filter((b) => b.kind !== 'void')).forEach((b) => {
        if (b.kind === 'core') { add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + hW * 0.6, C.core, { stroke: C.blockStroke, sw: C.sw })); return; }
        if (b.kind === 'corridor') { add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + 0.05, C.corridor, { stroke: C.blockStroke, sw: 0.8 })); return; }
        const zn = App.ZONES[b.zone] || App.ZONES.sosyal;
        add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + hW * 0.7, zn.fill, { stroke: C.blockStroke, sw: C.sw }));
      });
      if (view.labels) sortByDepth(I, space).forEach((b) => add(blockLabel(I, b, z + hW * 0.7 + 0.02, (App.ZONES[b.zone] || App.ZONES.sosyal).text, { max: 16 })));
    } else if (layerId === 'sirk') {
      sortByDepth(I, f.blocks.filter((b) => b.kind !== 'void')).forEach((b) => {
        const isC = b.kind === 'core' || b.kind === 'corridor' || b.zone === 'sirkulasyon';
        add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + (b.kind === 'core' ? hW * 0.9 : isC ? 0.12 : 0.05), isC ? (C.glass ? C.core : C.accent) : C.flat, { stroke: C.blockStroke, sw: isC ? C.sw : 0.8, opacity: isC ? 1 : 0.8, topFill: isC && !C.glass ? C.accent : undefined }));
      });
      if (view.labels) sortByDepth(I, space).forEach((b) => {
        const isC = b.zone === 'sirkulasyon';
        add(blockLabel(I, b, z + 0.14, isC ? C.coreText : C.ink, { max: 14, area: false }));
      });
      const by = new Map();
      f.blocks.forEach((b) => { if (b.spaceId) by.set(b.spaceId, b); });
      let i = 0;
      Object.keys(project.relations).forEach((key) => {
        if (project.relations[key] !== 'strong') return;
        const ids = key.split('|');
        const a = by.get(ids[0]), b = by.get(ids[1]);
        if (!a || !b) return;
        const pa = relCenter(a), pb = relCenter(b);
        const from = a.zone === 'sirkulasyon' || b.zone !== 'sirkulasyon' ? pa : pb;
        const to = from === pa ? pb : pa;
        add(iso.arrow(I, from, curve(from, to, i++ % 2 ? 1 : -1), to, z + 0.3, { stroke: C.accent, sw: 2.4, head: 11 }));
      });
      if (plan.useCore) add(iso.planText(I, plan.cwid / 2, plan.Dp / 2, z + hW * 0.9 + 0.02, ['Düşey çekirdek'], Math.min(0.8, plan.cwid * 0.28), { dir: 'v', fill: C.coreText, fam: 'l', weight: 700, opacity: 0.9 }));
    } else if (layerId === 'doluluk') {
      const hh = hW * 1.5;
      sortByDepth(I, f.blocks.filter((b) => b.kind !== 'void')).forEach((b) => {
        const light = b.kind === 'corridor';
        add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + (light ? 0.05 : hh), light ? C.corridor : C.dolu, { stroke: C.glass ? 'rgba(246,247,249,.55)' : C.slabTop, sw: 1.2 }));
      });
      f.blocks.filter((b) => b.kind === 'void').forEach((b) => {
        add(iso.hatch(I, b.x, b.y, b.w, b.h, flatTop, Math.max(1.0, plan.Dp / 10), { stroke: C.ink, sw: 1, opacity: 0.3 }));
      });
    } else if (layerId === 'iliski') {
      f.blocks.filter((b) => b.kind !== 'void').forEach((b) => {
        const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map((q) => I.proj(q[0], q[1], flatTop + 0.02));
        P.push({ t: 'poly', pts: pts, fill: C.flat, stroke: C.blockStroke, sw: 0.9, opacity: 0.85 });
      });
      const by = new Map();
      f.blocks.forEach((b) => { if (b.spaceId) by.set(b.spaceId, b); });
      const deg = new Map();
      const zz = flatTop + 0.15;
      Object.keys(project.relations).forEach((key) => {
        const ids = key.split('|');
        const a = by.get(ids[0]), b = by.get(ids[1]);
        if (!a || !b) return;
        const type = project.relations[key];
        deg.set(a.id, (deg.get(a.id) || 0) + 1); deg.set(b.id, (deg.get(b.id) || 0) + 1);
        const pa = relCenter(a), pb = relCenter(b);
        if (type === 'strong') add([iso.seg(I, pa[0], pa[1], pb[0], pb[1], zz, { stroke: C.strongLine, sw: 3.4, cap: 'round' })]);
        else if (type === 'weak') add([iso.seg(I, pa[0], pa[1], pb[0], pb[1], zz, { stroke: C.ink, sw: 1.6, dash: [7, 6], opacity: 0.7 })]);
        else if (type === 'avoid') {
          add([iso.seg(I, pa[0], pa[1], pb[0], pb[1], zz, { stroke: C.glass ? C.ink : App.PAL.red, sw: 2, dash: [1, 7], cap: 'round' })]);
          const m = I.proj((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, zz);
          P.push({ t: 'circle', cx: m[0], cy: m[1], r: 7, fill: C.slabTop, stroke: C.glass ? C.ink : App.PAL.red, sw: 1.6 });
          P.push({ t: 'line', x1: m[0] - 3, y1: m[1] - 3, x2: m[0] + 3, y2: m[1] + 3, stroke: C.glass ? C.ink : App.PAL.red, sw: 1.6, cap: 'round' });
          P.push({ t: 'line', x1: m[0] - 3, y1: m[1] + 3, x2: m[0] + 3, y2: m[1] - 3, stroke: C.glass ? C.ink : App.PAL.red, sw: 1.6, cap: 'round' });
        }
      });
      sortByDepth(I, space).forEach((b) => {
        const c = relCenter(b);
        const q = I.proj(c[0], c[1], zz + 0.05);
        const r = 5 + Math.min(6, (deg.get(b.id) || 0) * 1.2);
        P.push({ t: 'circle', cx: q[0], cy: q[1], r: r, fill: C.ink, stroke: C.slabTop, sw: 1.4 });
      });
      if (view.labels) space.forEach((b) => add(blockLabel(I, Object.assign({}, b, { y: b.y + b.h * 0.18 }), zz + 0.2, C.ink, { max: 12, area: false })));
    } else if (layerId === 'gurultu') {
      sortByDepth(I, f.blocks.filter((b) => b.kind !== 'void')).forEach((b) => {
        if (b.kind !== 'space') { add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + 0.05, C.corridor, { stroke: C.blockStroke, sw: 0.8 })); return; }
        const nz = A.noise.get(b.spaceId) || 'mid';
        add(iso.prism(I, b.x, b.y, b.w, b.h, z, z + hW * 0.55, C.noise[nz], { stroke: C.blockStroke, sw: C.sw }));
      });
      if (view.labels) sortByDepth(I, space).forEach((b) => add(blockLabel(I, b, z + hW * 0.55 + 0.02, C.noiseText[A.noise.get(b.spaceId) || 'mid'], { max: 15, area: false })));
    }
    return P;
  }

  /* ---------- sahne ---------- */
  function layerLegend(id, C, A, plan, f) {
    const sq = (label, fill, stroke) => ({ label: label, fill: fill, stroke: stroke });
    if (id === 'taban') return [sq('Mekân', '#FFFFFF', C.ink), sq('Çekirdek', C.core), sq('Koridor', C.corridor)];
    if (id === 'islev') return App.ZONE_ORDER.filter((z) => f.blocks.some((b) => b.zone === z && b.kind === 'space')).slice(0, 4).map((z) => sq(App.ZONES[z].label, App.ZONES[z].fill, C.ink));
    if (id === 'sirk') return [sq('Düşey çekirdek', C.glass ? C.core : C.accent), sq('Koridor / hol', C.glass ? C.core : C.accent), sq('Güçlü bağ (ok)', C.accent)];
    if (id === 'doluluk') return [sq('Dolu hacim', C.dolu), sq('Boşluk / teras', 'none', C.ink)];
    if (id === 'iliski') return [sq('Güçlü ilişki', C.strongLine), sq('Zayıf ilişki', 'none', C.ink), sq('Ayrı tut', 'none', C.glass ? C.ink : App.PAL.red)];
    if (id === 'gurultu') return [sq('Gürültülü', C.noise.loud), sq('Orta', C.noise.mid), sq('Sessiz', C.noise.quiet)];
    return [];
  }

  function layerNote(id, plan, f, A, project) {
    const occ = plan.plateArea;
    if (id === 'taban') return fmt(plan.Wp, 1) + ' × ' + fmt(plan.Dp, 1) + ' m · ' + fmt(plan.plateArea) + ' m²';
    if (id === 'islev') return f.spaces.length + ' mekân · ' + fmt(f.net) + ' m² net';
    if (id === 'sirk') { let c = 0; f.blocks.forEach((b) => { if (b.kind === 'core' || b.kind === 'corridor' || b.zone === 'sirkulasyon') c += b.w * b.h; }); return 'Sirkülasyon %' + Math.round((c / occ) * 100); }
    if (id === 'doluluk') return 'Dolu %' + Math.round(((occ - f.void) / occ) * 100) + ' · Boşluk %' + Math.round((f.void / occ) * 100);
    if (id === 'iliski') { let s = 0, w = 0, a = 0; const ids = new Set(f.spaces.map((x) => x.id)); Object.keys(project.relations).forEach((k) => { const q = k.split('|'); if (ids.has(q[0]) && ids.has(q[1])) { const t = project.relations[k]; if (t === 'strong') s++; else if (t === 'weak') w++; else a++; } }); return s + ' güçlü · ' + w + ' zayıf · ' + a + ' ayrı'; }
    if (id === 'gurultu') { const c = { loud: 0, mid: 0, quiet: 0 }; f.spaces.forEach((x) => c[A.noise.get(x.id) || 'mid']++); return c.loud + ' gürültülü · ' + c.mid + ' orta · ' + c.quiet + ' sessiz'; }
    return '';
  }

  function scene(project, d, view, live) {
    const plan = d.plan;
    const A = analyze(project, d);
    const C = cols();
    const g = C.glass;
    const mode = view.mode === 'layers' ? 'layers' : 'floors';
    const tb = sheet.tb;

    // levha listesi (alttan üste)
    let slabs;
    let floor = plan.floors.find((f) => f.id === view.floorId) || plan.floors[0];
    if (mode === 'floors') slabs = plan.floors.map((f) => ({ id: f.id, f: f, name: f.name }));
    else {
      const on = LAYERS.filter((l) => view.layers.indexOf(l.id) >= 0);
      slabs = (on.length ? on : [LAYERS[1]]).map((l) => ({ id: l.id, f: floor, name: l.name, layer: l }));
    }
    const n = slabs.length;
    const area = mode === 'floors' ? { x: 56, y: 62, w: 960, h: tb.y - 62 - 30 } : { x: 360, y: 62, w: 990, h: tb.y - 62 - 30 };

    const SLAB = 0.45, GAP0 = 0.55;
    const Gx = 0.45 * Math.max(plan.Wp, plan.Dp);
    const hW = Math.max(1.2, Math.min(2.8, 0.2 * Math.min(plan.Wp, plan.Dp)));
    const ex = U.clamp(view.explode, 0, 1);
    const step = SLAB + GAP0 + ex * Gx;
    const zMax = (n - 1) * (SLAB + GAP0 + Gx) + hW * 1.6;
    const zCur = (n - 1) * step + hW * 1.6;
    const diag = Math.hypot(plan.Wp, plan.Dp);
    const pr = (view.pitch * Math.PI) / 180;
    const bw = diag * 1.04 + (mode === 'layers' ? 3 : 0), bh = diag * Math.sin(pr) + zMax * Math.cos(pr);
    const s = Math.min(area.w / bw, area.h / bh, 70) * 0.97;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2 + (zCur * Math.cos(pr) * s) / 2 - (hW * 0.8 * Math.cos(pr) * s) / 2;
    const I = iso.make({ yaw: view.yaw, pitch: view.pitch, s: s, cx: cx, cy: cy, center: [plan.Wp / 2, plan.Dp / 2] });

    // künye
    const zones = [];
    project.spaces.forEach((sp) => { if (zones.indexOf(sp.zone) < 0) zones.push(sp.zone); });
    const info = {
      name: project.meta.name,
      subtitle: 'Mekân analizi · ' + (mode === 'floors' ? 'kat kat' : floor.name + ' katmanları'),
      legend: sheet.zoneLegend(zones),
      stats: [['Kat', String(plan.floors.length)], ['Plak', fmt(plan.Wp, 1) + ' × ' + fmt(plan.Dp, 1) + ' m'], ['Doluluk', '%' + Math.round(d.metrics.fill * 100)]],
      scoreLabel: 'Uyum skoru', percent: A.score,
    };
    const prims = sheet.frame(info, live);
    const hits = [];
    const marks = [];
    const gz = (i) => i * step;
    const slabTopPts = (i) => [[0, 0], [plan.Wp, 0], [plan.Wp, plan.Dp], [0, plan.Dp]].map((q) => I.proj(q[0], q[1], gz(i)));

    slabs.forEach((sl, i) => {
      const z = gz(i);
      const dim = mode === 'floors' && view.sel && view.sel !== sl.id ? 0.28 : 1;
      let P;
      if (mode === 'floors') P = floorSlab(I, project, plan, sl.f, z, view, C, hW, A.noise);
      else P = layerSlab(I, project, plan, sl.f, z, sl.id, view, C, hW, A);
      dimOp(P, dim).forEach((p) => prims.push(p));
      // düşey kılavuzlar ve düşey sirkülasyon (levha i ile i+1 arası)
      if (i < n - 1) {
        const z1 = z + (mode === 'floors' ? hW * 1.1 : 0.02), z2 = gz(i + 1) - (mode === 'floors' ? 0.45 : 0.3);
        if (view.guides) [[0, 0], [plan.Wp, 0], [plan.Wp, plan.Dp], [0, plan.Dp]].forEach((q) => {
          const a = I.proj(q[0], q[1], z + 0.02), b = I.proj(q[0], q[1], z2);
          prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.guide, sw: 1, dash: [5, 5], opacity: ex < 0.05 ? 0 : 0.7 });
        });
        if (mode === 'floors' && plan.useCore && view.arrows && ex > 0.05) {
          const a = I.proj(plan.cwid / 2, plan.Dp / 2, z1), b = I.proj(plan.cwid / 2, plan.Dp / 2, z2);
          prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.accent, sw: 3.2, cap: 'round', opacity: 0.95 });
          prims.push({ t: 'circle', cx: a[0], cy: a[1], r: 4, fill: C.accent });
          prims.push({ t: 'circle', cx: b[0], cy: b[1], r: 4, fill: C.accent });
        }
      }
      // etkileşim bölgeleri
      const tp = slabTopPts(i);
      hits.push({ kind: 'slab', id: sl.id, pts: tp });
      if (mode === 'floors') sl.f.blocks.forEach((b) => {
        if (b.kind !== 'space') return;
        const top = z + (view.volume ? hW : 0.12);
        hits.push({ kind: 'block', id: b.spaceId, floorId: sl.f.id, name: b.name, area: b.area, pts: [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map((q) => I.proj(q[0], q[1], top)) });
      });
      const ctr = I.proj(plan.Wp / 2, plan.Dp / 2, z);
      const maxX = Math.max.apply(null, tp.map((q) => q[0]));
      const minX = Math.min.apply(null, tp.map((q) => q[0]));
      marks.push({ i: i, id: sl.id, cy: ctr[1], maxX: maxX, minX: minX, z: z });
    });

    // kat arası güçlü bağlar (kat modu)
    if (mode === 'floors' && view.arrows && ex > 0.3) {
      const where = new Map();
      plan.floors.forEach((f, i) => f.blocks.forEach((b) => { if (b.spaceId) where.set(b.spaceId, { b: b, i: i }); }));
      Object.keys(project.relations).forEach((key) => {
        if (project.relations[key] !== 'strong') return;
        const ids = key.split('|');
        const A1 = where.get(ids[0]), B1 = where.get(ids[1]);
        if (!A1 || !B1 || A1.i === B1.i) return;
        const lo = A1.i < B1.i ? A1 : B1, hi = lo === A1 ? B1 : A1;
        const p0 = I.proj(lo.b.x + lo.b.w / 2, lo.b.y + lo.b.h / 2, gz(lo.i) + (view.volume ? hW : 0.12));
        const p1 = I.proj(hi.b.x + hi.b.w / 2, hi.b.y + hi.b.h / 2, gz(hi.i) + (view.volume ? hW : 0.12));
        const mid = [(p0[0] + p1[0]) / 2 + 26, (p0[1] + p1[1]) / 2];
        iso.arrowScreen(p0, mid, p1, { stroke: C.accent, sw: 1.8, dash: [6, 5], opacity: 0.85, head: 9 }).forEach((p) => prims.push(p));
      });
    }

    // ---- kat modu: sağda kat göstergesi
    if (mode === 'floors') {
      const lx = 1074, lw = 290;
      const top = 62, hAll = tb.y - top - 30;
      const bh2 = hAll / n;
      for (let k = 0; k < n; k++) {
        const fi = n - 1 - k; // üstteki kat üstte
        const f = plan.floors[fi];
        const y0 = top + k * bh2;
        const dim = view.sel && view.sel !== f.id ? 0.35 : 1;
        const Pg = [];
        const bgc = C.numBg[fi % C.numBg.length], fgc = C.numFg[fi % C.numFg.length];
        Pg.push({ t: 'rect', x: lx, y: y0, w: lw, h: 34, rx: g ? 17 : 0, fill: bgc, stroke: g ? undefined : C.ink, sw: g ? 0 : 2.5 });
        Pg.push({ t: 'text', x: lx + (g ? 18 : 14), y: y0 + 24, s: String(fi), size: 20, weight: g ? 400 : 700, fam: 'd', fill: fgc });
        Pg.push({ t: 'text', x: lx + 46, y: y0 + 22, s: g ? f.name : f.name.toLocaleUpperCase('tr'), size: 12.5, weight: 700, fam: 'b', fill: fgc, ls: g ? 0 : 1 });
        Pg.push({ t: 'text', x: lx + lw - 14, y: y0 + 22, s: fmt(f.net) + ' m²', size: 12, weight: 600, fam: 'm', fill: fgc, anchor: 'end', opacity: 0.85 });
        const lines = Math.max(0, Math.floor((bh2 - 50) / 17));
        const list = f.spaces.slice().sort((a, b) => b.area - a.area);
        list.slice(0, lines).forEach((sp, j) => {
          const zz = App.ZONES[sp.zone] || App.ZONES.sosyal;
          const yy = y0 + 56 + j * 17;
          Pg.push({ t: 'circle', cx: lx + 8, cy: yy - 4, r: 4.8, fill: zz.fill, stroke: g ? 'rgba(23,24,27,.3)' : C.ink, sw: g ? 1 : 1.6 });
          const nm = sp.name.length > 24 ? sp.name.slice(0, 23) + '…' : sp.name;
          Pg.push({ t: 'text', x: lx + 22, y: yy, s: nm, size: 12, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
          Pg.push({ t: 'text', x: lx + lw - 2, y: yy, s: fmt(sp.area) + ' m²', size: 11.5, weight: 500, fam: 'm', fill: C.ink, opacity: 0.55, anchor: 'end' });
        });
        if (list.length > lines && lines > 0) Pg.push({ t: 'text', x: lx + 22, y: y0 + 56 + lines * 17, s: '+ ' + (list.length - lines) + ' mekân daha', size: 11.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.45 });
        dimOp(Pg, dim).forEach((p) => prims.push(p));
        // kılavuz çizgisi: levhadan göstergeye
        const mk = marks[fi];
        prims.push({ t: 'line', x1: mk.maxX + 8, y1: mk.cy, x2: lx - 10, y2: y0 + 17, stroke: C.ink, sw: 1, dash: [2, 4], opacity: 0.4 * dim });
        prims.push({ t: 'circle', cx: mk.maxX + 8, cy: mk.cy, r: 2.6, fill: C.ink, opacity: 0.55 * dim });
      }
    } else {
      // ---- katman modu: solda başlık + gösterge
      slabs.forEach((sl, i) => {
        const mk = marks[i];
        const x0 = 70, y0 = mk.cy - 34;
        prims.push({ t: 'text', x: x0, y: y0, s: g ? sl.layer.name : sl.layer.name.toLocaleUpperCase('tr'), size: g ? 17 : 18, weight: g ? 400 : 700, fam: 'd', fill: C.ink, ls: g ? 0 : 1 });
        prims.push({ t: 'line', x1: x0, y1: y0 + 8, x2: Math.max(x0 + 160, mk.minX - 12), y2: y0 + 8, stroke: C.ink, sw: g ? 1.2 : 2.5, opacity: g ? 0.5 : 1 });
        prims.push({ t: 'text', x: x0, y: y0 + 26, s: layerNote(sl.id, plan, sl.f, A, project), size: 12.5, weight: 700, fam: g ? 'b' : 'm', fill: C.ink, opacity: 0.7 });
        layerLegend(sl.id, C, A, plan, sl.f).forEach((it, j) => {
          const yy = y0 + 46 + j * 18;
          if (it.fill === 'none') prims.push({ t: 'rect', x: x0, y: yy - 11, w: 14, h: 14, rx: g ? 7 : 0, stroke: it.stroke, sw: 1.6, dash: [3, 2.4] });
          else prims.push({ t: 'rect', x: x0, y: yy - 11, w: 14, h: 14, rx: g ? 7 : 0, fill: it.fill, stroke: g ? 'rgba(23,24,27,.3)' : C.ink, sw: g ? 1 : 1.6 });
          prims.push({ t: 'text', x: x0 + 22, y: yy, s: it.label, size: 12.5, weight: 600, fam: 'b', fill: C.ink, opacity: 0.85 });
        });
        prims.push({ t: 'line', x1: Math.max(x0 + 160, mk.minX - 12), y1: y0 + 8, x2: mk.minX + 6, y2: mk.cy, stroke: C.ink, sw: 1, dash: [2, 4], opacity: 0.4 });
      });
    }
    return { prims: prims, hits: hits, A: A, scale: s, floor: floor, mode: mode, W: sheet.W, H: sheet.H };
  }

  /* JSON uzantısı: extensions.spaceAnalysis (yalnızca okunur; içe aktarmada yeniden hesaplanır) */
  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  function toExt(project) {
    if (!project.study) return {};
    const d = App.study.derive(project);
    const A = analyze(project, d);
    return {
      spaceAnalysis: {
        version: 1,
        harmonyScore: A.score,
        parts: A.parts.map((p) => ({ name: p.k, value: r3(p.v), weight: p.w })),
        stats: { daylight: r3(A.stats.daylight), circulationShare: r3(A.stats.circShare), wetStackAlignment: r3(A.stats.wetAlign), noiseConflicts: A.stats.conflicts, fillRatio: r3(A.stats.fill) },
        perFloor: A.mix.map((m) => ({ floorId: m.id, name: m.name, totalArea: Math.round(m.total * 100) / 100, zones: m.zones.map((z) => ({ zone: z.zone, area: Math.round(z.area * 100) / 100, share: r3(z.share) })) })),
        noise: Array.from(A.noise.entries()).map((e) => ({ spaceId: e[0], class: e[1] })),
        findings: A.items.filter((i) => i.level !== 'ok').map((i) => ({ id: i.id, level: i.level, title: i.title })),
      },
    };
  }
  App.extProviders.push(toExt);

  App.analysis = { LAYERS: LAYERS, analyze: analyze, scene: scene, toExt: toExt, NOISE_LABEL: NOISE_LABEL };
})();
