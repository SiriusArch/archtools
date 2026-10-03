/* ==========================================================================
   24-lib-analyze.js — projeyi bilgi tabanına göre otomatik analiz eder
   Çıktı: öneri kartları {id, level: hata|uyari|oneri|ok, title, detail, src, actions[]}
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;
  const fmt = U.fmt;

  const LEVEL_ORDER = { hata: 0, uyari: 1, oneri: 2, ok: 3 };

  function defaultArea(e) { return U.round5(U.mid(e.typ)); }

  function circulationShare(spaces) {
    const total = U.sum(spaces, (s) => s.area);
    const circ = U.sum(spaces.filter((s) => s.zone === 'sirkulasyon'), (s) => s.area);
    return { total: total, circ: circ, share: total ? circ / total : 0 };
  }

  function analyze(project, k, score) {
    const items = [];
    const spaces = project.spaces;
    const meta = project.meta;
    const type = App.kb.type(meta.buildingType);
    const variant = App.kb.variant(meta.buildingType, meta.variant);
    const nameOf = new Map(spaces.map((s) => [s.id, s.name]));

    if (!spaces.length) {
      items.push({ id: 'empty', level: 'oneri', title: 'Projeye ilk mekânı ekleyin', detail: 'Soldaki formdan mekân adı ve m² girin ya da bir bina şablonu yükleyin. Asistan eksik mekânları ve alan sapmalarını burada listeler.', src: [], actions: [{ type: 'focusForm', label: 'Mekân ekle' }] });
      return { items: items, counts: { hata: 0, uyari: 0, oneri: 1 }, circ: circulationShare(spaces) };
    }

    const m = App.match.spaces(spaces, variant.entries);
    const circ = circulationShare(spaces);

    // 1) Eksik mekânlar
    const missReq = m.missing.filter((e) => e.req);
    if (missReq.length && meta.buildingType !== 'genel') {
      items.push({
        id: 'missing', level: 'uyari',
        title: missReq.length + ' gerekli mekân eksik görünüyor',
        detail: missReq.map((e) => e.name).join(', ') + '. (' + type.label + ' · ' + variant.label + ' programına göre)',
        src: [], actions: addActions(missReq),
      });
    }
    const missOpt = m.missing.filter((e) => !e.req);
    if (missOpt.length && meta.buildingType !== 'genel') {
      items.push({
        id: 'missing-opt', level: 'oneri',
        title: 'Sık unutulan / isteğe bağlı mekânlar',
        detail: missOpt.slice(0, 6).map((e) => e.name).join(', ') + '.',
        src: [], actions: addActions(missOpt.slice(0, 5)),
      });
    }

    // 2) Alan kontrolleri
    spaces.forEach((s) => {
      const e = m.bySpace.get(s.id);
      if (!e) return;
      if (e.min != null && s.area < e.min - 0.001) {
        items.push({
          id: 'area-min-' + s.id, level: 'hata',
          title: s.name + ': ' + fmt(s.area) + ' m² asgari alanın altında',
          detail: 'Asgari ' + fmt(e.min) + ' m². ' + e.note,
          src: [e.src], actions: [{ type: 'setArea', id: s.id, area: e.min, label: 'Asgariye çıkar (' + fmt(e.min) + ' m²)' }, { type: 'select', id: s.id, label: 'Seç' }],
        });
      } else if (s.area < e.typ[0] - 0.001) {
        items.push({
          id: 'area-low-' + s.id, level: 'uyari',
          title: s.name + ': tipik aralığın altında (' + fmt(s.area) + ' m²)',
          detail: 'Tipik ' + fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m², ideal ' + fmt(e.ideal[0]) + '–' + fmt(e.ideal[1]) + ' m². ' + e.note,
          src: [e.src], actions: [{ type: 'setArea', id: s.id, area: e.typ[0], label: 'Tipiğe çıkar (' + fmt(e.typ[0]) + ' m²)' }, { type: 'select', id: s.id, label: 'Seç' }],
        });
      } else if (s.area > Math.max(e.typ[1] * 1.8, e.ideal[1] * 1.6)) {
        items.push({
          id: 'area-high-' + s.id, level: 'oneri',
          title: s.name + ': tipik aralığın çok üzerinde (' + fmt(s.area) + ' m²)',
          detail: 'Tipik ' + fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m². Alan dengesini ve verimliliği kontrol edin.',
          src: [e.src], actions: [{ type: 'setArea', id: s.id, area: e.typ[1], label: 'Tipik üst sınıra çek (' + fmt(e.typ[1]) + ' m²)' }, { type: 'select', id: s.id, label: 'Seç' }],
        });
      }
    });

    // 3) Sirkülasyon
    const band = type.circ;
    const nonCirc = circ.total - circ.circ;
    const needArea = Math.max(2, U.round5((nonCirc * U.mid(band)) / (1 - U.mid(band))));
    if (circ.circ === 0 && spaces.length >= 3) {
      items.push({
        id: 'circ-none', level: 'uyari', title: 'Sirkülasyon (antre / hol / koridor) çizilmemiş',
        detail: type.circNote + ' Şu anki mekânlara göre yaklaşık ' + fmt(needArea) + ' m² sirkülasyon alanı eklenmeli.',
        src: ['S'], actions: [{ type: 'addSpaces', list: [{ name: 'Koridor / Sirkülasyon', area: needArea, zone: 'sirkulasyon' }], label: 'Sirkülasyon ekle (' + fmt(needArea) + ' m²)' }],
      });
    } else if (circ.circ > 0 && circ.share < band[0] * 0.7) {
      items.push({
        id: 'circ-low', level: 'uyari', title: 'Sirkülasyon payı düşük: %' + fmt(circ.share * 100, 0),
        detail: 'Önerilen aralık %' + fmt(band[0] * 100, 0) + '–' + fmt(band[1] * 100, 0) + '. ' + type.circNote, src: ['S'], actions: [],
      });
    } else if (circ.share > band[1] * 1.5) {
      items.push({
        id: 'circ-high', level: 'oneri', title: 'Sirkülasyon payı yüksek: %' + fmt(circ.share * 100, 0),
        detail: 'Önerilen aralık %' + fmt(band[0] * 100, 0) + '–' + fmt(band[1] * 100, 0) + '. Koridorları kısaltmayı veya mekânları doğrudan bağlamayı düşünün.', src: ['S'], actions: [],
      });
    }

    // 4) Skor kaynaklı uyarılar
    if (score) {
      score.pairs.filter((p) => p.type === 'strong' && !p.ok).sort((a, b) => a.s - b.s).slice(0, 3).forEach((p) => {
        items.push({
          id: 'far-' + p.key, level: 'uyari',
          title: nameOf.get(p.a) + ' ↔ ' + nameOf.get(p.b) + ': güçlü ilişkili ama uzak',
          detail: 'İki dairenin arası ' + fmt(Math.max(0, p.gap), 0) + ' birim açık. Daireleri yaklaştırın veya Otomatik yerleştir’i kullanın.',
          src: ['White'], actions: [{ type: 'locate', a: p.a, b: p.b, label: 'Göster' }, { type: 'autolayout', label: 'Otomatik yerleştir' }],
        });
      });
      score.pairs.filter((p) => p.type === 'avoid' && !p.ok).slice(0, 3).forEach((p) => {
        items.push({
          id: 'avoid-' + p.key, level: 'uyari',
          title: nameOf.get(p.a) + ' ile ' + nameOf.get(p.b) + ' ayrı tutulmalı ama yakın',
          detail: 'Bu çift “ayrı tut” olarak işaretli (gürültü, koku, mahremiyet veya hijyen).',
          src: ['White'], actions: [{ type: 'locate', a: p.a, b: p.b, label: 'Göster' }],
        });
      });
      if (score.overlaps.length) {
        items.push({
          id: 'overlap', level: 'uyari', title: score.overlaps.length + ' daire çiftinin üst üste bindiği görülüyor',
          detail: 'Üst üste binen daireler okunurluğu ve skoru düşürür.', src: [], actions: [{ type: 'autolayout', label: 'Otomatik yerleştir' }],
        });
      }
      // gürültülü ↔ sessiz yakınlığı (ilişki tanımlı değilse)
      const quiet = [];
      score && spaces.forEach((a, i) => {
        const ea = m.bySpace.get(a.id);
        if (!ea || ea.noise === 'mid') return;
        for (let j = i + 1; j < spaces.length; j++) {
          const b = spaces[j];
          const eb = m.bySpace.get(b.id);
          if (!eb || eb.noise === 'mid' || ea.noise === eb.noise) continue;
          const rel = project.relations[U.pairKey(a.id, b.id)];
          if (rel === 'strong') continue;
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - score.radii.get(a.id) - score.radii.get(b.id);
          if (gap < 0.25 * (score.radii.get(a.id) + score.radii.get(b.id))) quiet.push([a, b, ea.noise === 'loud']);
        }
      });
      quiet.slice(0, 3).forEach((q) => {
        const loud = q[2] ? q[0] : q[1], calm = q[2] ? q[1] : q[0];
        items.push({
          id: 'noise-' + loud.id + calm.id, level: 'uyari',
          title: 'Gürültülü “' + loud.name + '” sessiz “' + calm.name + '” yanına çizilmiş',
          detail: 'Gürültülü ve sessiz mekânlar arasında tampon mekân (koridor, depo) bırakın veya ilişkiyi “ayrı tut” yapın.',
          src: ['MEB15', 'S'], actions: [{ type: 'locate', a: loud.id, b: calm.id, label: 'Göster' }],
        });
      });
    }

    // 5) İlişkisi olmayan mekânlar
    const relCount = Object.keys(project.relations).length;
    if (spaces.length >= 2 && relCount === 0) {
      items.push({ id: 'norel', level: 'oneri', title: 'Henüz hiç ilişki tanımlanmadı', detail: 'Skor, ilişkilere göre hesaplanır. İlişki Matrisi sekmesinden veya bir dairenin kartından güçlü / zayıf / ayrı tut bağları seçin.', src: ['White'], actions: [{ type: 'openMatrix', label: 'Matrisi aç' }] });
    } else if (relCount > 0) {
      const used = new Set();
      Object.keys(project.relations).forEach((key) => key.split('|').forEach((id) => used.add(id)));
      const lone = spaces.filter((s) => !used.has(s.id));
      if (lone.length) {
        items.push({ id: 'lone', level: 'oneri', title: lone.length + ' mekânın hiç ilişkisi yok', detail: lone.slice(0, 6).map((s) => s.name).join(', ') + '. Her mekânın en az bir bağı olmalı.', src: ['White'], actions: lone.slice(0, 3).map((s) => ({ type: 'select', id: s.id, label: s.name })) });
      }
    }

    items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    items.forEach((i) => { if (counts[i.level] != null) counts[i.level]++; });
    if (!counts.hata && !counts.uyari) {
      items.unshift({ id: 'ok', level: 'ok', title: 'Kritik sorun görünmüyor', detail: score && score.percent != null ? 'Verimlilik skoru %' + score.percent + '. Kalan önerileri gözden geçirin.' : 'İlişkileri tanımlayarak verimlilik skorunu hesaplatın.', src: [], actions: [] });
    }
    return { items: items, counts: counts, circ: circ, matched: m };
  }

  function addActions(entries) {
    const acts = entries.slice(0, 5).map((e) => ({ type: 'addSpaces', list: [{ name: e.name, area: defaultArea(e), zone: e.zone }], label: '+ ' + e.name }));
    if (entries.length > 1) acts.push({ type: 'addSpaces', list: entries.map((e) => ({ name: e.name, area: defaultArea(e), zone: e.zone })), label: 'Hepsini ekle (' + entries.length + ')' });
    return acts;
  }

  App.analyze = { run: analyze, circulation: circulationShare, defaultArea: defaultArea };
})();
