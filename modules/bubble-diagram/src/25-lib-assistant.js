/* ==========================================================================
   25-lib-assistant.js — Akıllı Öneri asistanı: hazır-cevap soru motoru
   Sorunun soruluş mantığına göre niyeti (intent) belirler ve bilgi tabanından yanıt üretir.
   Yanıt biçimi: { blocks: [{t:'p'|'ul'|'ol'|'kv'|'actions', ...}], src: ['PAİY', ...] }
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const N = U.norm;
  const fmt = U.fmt;
  const KB = App.KB;

  const p = (text) => ({ t: 'p', text: text });
  const ul = (items) => ({ t: 'ul', items: items });
  const ol = (items) => ({ t: 'ol', items: items });
  const kv = (rows) => ({ t: 'kv', rows: rows });
  const acts = (list) => ({ t: 'actions', actions: list });

  const INTENTS = [
    { key: 'eval',     stems: ['degerlendir', 'analiz', 'skor', 'puan', 'verim', 'projem', 'nasil olmus', 'durum', 'kontrol et', 'ozet'] },
    { key: 'missing',  stems: ['ne eksik', 'eksik', 'unut', 'ne lazim', 'neler lazim', 'hangi mekan', 'program', 'liste', 'ne eklemeli', 'ne ekle'] },
    { key: 'area',     stems: ['kac m', 'm2', 'metrekare', 'alan', 'buyukluk', 'olcu', 'boyut', 'ne kadar', 'minimum', 'asgari', 'kac metre'] },
    { key: 'adj',      stems: ['yanin', 'komsu', 'bitisik', 'yakin', 'nereye', 'iliski', 'bagl', 'ayri', 'uzak', 'yan yana', 'kacin'] },
    { key: 'circ',     stems: ['sirkulasyon', 'koridor', 'dolasim', 'hol ', 'brut', 'net alan', 'verimlilik orani'] },
    { key: 'wet',      stems: ['islak', 'tesisat', 'saft', 'havalandirma', 'grupla'] },
    { key: 'noise',    stems: ['gurultu', 'sessiz', 'akustik', 'ses '] },
    { key: 'zoning',   stems: ['zon', 'mahremiyet', 'kamusal', 'servis akis', 'misafir', 'gun bolgesi', 'gece bolgesi'] },
    { key: 'org',      stems: ['organizasyon', 'merkezi', 'cizgisel', 'isinsal', 'radyal', 'kumelen', 'izgara', 'grid', 'sema tipi', 'diyagram tipi'] },
    { key: 'spatial',  stems: ['mekan icinde mekan', 'kenetlen', 'ic ice', 'ortak mekan', 'bitisik mekan', 'mekan iliski'] },
    { key: 'path',     stems: ['yol', 'giris yaklas', 'dolasim yolu', 'mekanin icinden'] },
    { key: 'method',   stems: ['nasil', 'adim', 'yontem', 'bubble', 'balon', 'matris', 'islev sema', 'fonksiyon sema', 'cizilir', 'baslayay'] },
    { key: 'mistakes', stems: ['hata', 'yanlis', 'dikkat', 'sik yapilan', 'tuzak'] },
    { key: 'regs',     stems: ['yonetmelik', 'mevzuat', 'standart', 'zorunlu', 'imar', 'kaynak'] },
    { key: 'total',    stems: ['toplam', 'insaat alani', 'brut alan', 'kac m2 olur'] },
  ];

  function srcChips(list) {
    return Array.from(new Set(list.filter(Boolean))).filter((c) => KB.SOURCES[c]);
  }

  function entryCard(found, ctx) {
    const e = found.entry;
    const blocks = [];
    const rows = [];
    rows.push(['Asgari', e.min != null ? fmt(e.min) + ' m²' : 'Sayısal asgari yok']);
    rows.push(['Tipik', fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m²']);
    rows.push(['İdeal', fmt(e.ideal[0]) + '–' + fmt(e.ideal[1]) + ' m²']);
    blocks.push(p(e.name + ' · ' + found.type.label + ' (' + found.variant.label + ')'));
    blocks.push(kv(rows));
    if (e.note) blocks.push(p(e.note));
    const mine = ctx.project.spaces.find((s) => N(s.name) === N(e.name) || ctx.analysis.matched.byEntry.get(e.key) === s);
    const own = ctx.analysis.matched.byEntry.get(e.key);
    if (own) {
      let verdict = 'aralıkta';
      if (e.min != null && own.area < e.min) verdict = 'asgarinin altında';
      else if (own.area < e.typ[0]) verdict = 'tipik aralığın altında';
      else if (own.area > e.typ[1]) verdict = 'tipik aralığın üzerinde';
      blocks.push(p('Projenizdeki “' + own.name + '”: ' + fmt(own.area) + ' m² — ' + verdict + '.'));
    }
    return { blocks: blocks, src: srcChips([e.src]), mine: mine };
  }

  function adjacency(found, ctx) {
    const v = found.variant, e = found.entry;
    const nameByKey = new Map(v.entries.map((x) => [x.key, x.name]));
    const strong = [], weak = [], avoid = [];
    v.relations.forEach((r) => {
      let other = null;
      if (r[0] === e.key) other = r[1]; else if (r[1] === e.key) other = r[0];
      if (!other || !nameByKey.has(other)) return;
      (r[2] === 'strong' ? strong : r[2] === 'weak' ? weak : avoid).push(nameByKey.get(other));
    });
    const blocks = [p(e.name + ' için önerilen komşuluklar (' + found.variant.label + ')')];
    if (strong.length) blocks.push(p('Yanında / doğrudan bağlantılı: ' + strong.join(', ') + '.'));
    if (weak.length) blocks.push(p('Yakın olabilir (dolaylı erişim yeterli): ' + weak.join(', ') + '.'));
    if (avoid.length) blocks.push(p('Ayrı tutulmalı: ' + avoid.join(', ') + '.'));
    if (!strong.length && !weak.length && !avoid.length) blocks.push(p('Bu mekân için hazır bir komşuluk kuralı yok; en yakın sirkülasyon mekânına bağlayın.'));
    return { blocks: blocks, src: srcChips(['White', 'S', e.src]) };
  }

  /* ----------------------------- yanıtlar ----------------------------- */
  const handlers = {
    eval(q, ctx) {
      const a = ctx.analysis, s = ctx.score;
      const blocks = [];
      if (!ctx.project.spaces.length) return { blocks: [p('Projede henüz mekân yok. Önce mekân ekleyin ya da bir bina şablonu yükleyin.')], src: [] };
      blocks.push(p(s && s.percent != null ? 'Verimlilik skoru %' + s.percent + '. ' + (s.percent >= 80 ? 'Güçlü ilişkili daireler birbirine yakın.' : s.percent >= 50 ? 'Orta düzey; birkaç güçlü bağ hâlâ uzak.' : 'Düşük; güçlü ilişkili daireleri yaklaştırın.') : 'İlişki tanımlanmadığı için skor hesaplanamadı.'));
      blocks.push(kv([
        ['Mekân sayısı', String(ctx.project.spaces.length)],
        ['Toplam alan', fmt(a.circ.total) + ' m²'],
        ['Sirkülasyon payı', '%' + fmt(a.circ.share * 100, 0)],
        ['Uyarı / hata', a.counts.uyari + ' / ' + a.counts.hata],
      ]));
      const top = a.items.filter((i) => i.level === 'hata' || i.level === 'uyari').slice(0, 4);
      if (top.length) blocks.push(ul(top.map((i) => i.title)));
      else blocks.push(p('Kritik bir sorun görünmüyor.'));
      if (s && s.pairs.length) {
        const c = s.counts;
        blocks.push(p('Güçlü bağlar: ' + c.strong[1] + '/' + c.strong[0] + ' yakın · Ayrı tutulanlar: ' + c.avoid[1] + '/' + c.avoid[0] + ' uzak.'));
      }
      return { blocks: blocks, src: srcChips(['White', 'S']) };
    },

    missing(q, ctx) {
      const meta = ctx.project.meta;
      const type = App.kb.type(meta.buildingType), variant = App.kb.variant(meta.buildingType, meta.variant);
      const m = ctx.analysis.matched || App.match.spaces(ctx.project.spaces, variant.entries);
      const req = m.missing.filter((e) => e.req), opt = m.missing.filter((e) => !e.req);
      const blocks = [p(type.label + ' · ' + variant.label + ' programına göre:')];
      if (req.length) {
        blocks.push(p('Gerekli ve eksik: ' + req.map((e) => e.name + ' (' + fmt(U.round5(U.mid(e.typ))) + ' m²)').join(', ') + '.'));
        blocks.push(acts([{ type: 'addSpaces', list: req.map((e) => ({ name: e.name, area: App.analyze.defaultArea(e), zone: e.zone })), label: 'Eksik gerekli mekânları ekle (' + req.length + ')' }]));
      } else blocks.push(p('Programdaki gerekli mekânların hepsi projede var.'));
      if (opt.length) blocks.push(p('İsteğe bağlı / sık unutulan: ' + opt.map((e) => e.name).join(', ') + '.'));
      if (type.notes.length) blocks.push(ul(type.notes));
      return { blocks: blocks, src: srcChips(['PAİY', 'MEB15', 'S'].concat(variant.entries.map((e) => e.src)).slice(0, 4)) };
    },

    area(q, ctx) {
      const f = App.match.findEntryInText(q, ctx.project.meta.buildingType, ctx.project.meta.variant);
      if (!f) return handlers.regs(q, ctx);
      const c = entryCard(f, ctx);
      return { blocks: c.blocks, src: c.src };
    },

    adj(q, ctx) {
      const f = App.match.findEntryInText(q, ctx.project.meta.buildingType, ctx.project.meta.variant);
      if (!f) return handlers.zoning(q, ctx);
      return adjacency(f, ctx);
    },

    card(q, ctx, f) {
      const a = entryCard(f, ctx), b = adjacency(f, ctx);
      return { blocks: a.blocks.concat(b.blocks.slice(1)), src: srcChips(a.src.concat(b.src)) };
    },

    circ(q, ctx) {
      const type = App.kb.type(ctx.project.meta.buildingType);
      const a = ctx.analysis;
      const blocks = [p(type.label + ' için sirkülasyon payı %' + fmt(type.circ[0] * 100, 0) + '–' + fmt(type.circ[1] * 100, 0) + '.'), p(type.circNote)];
      if (ctx.project.spaces.length) blocks.push(p('Projenizde şu an sirkülasyon payı %' + fmt(a.circ.share * 100, 0) + ' (' + fmt(a.circ.circ) + ' m² / ' + fmt(a.circ.total) + ' m²).'));
      blocks.push(ul([
        'Konut: antre + hol + koridor net alanın yaklaşık %8–14’ü.',
        'Ofis: brütün yaklaşık %16’sı (UNM) ile kullanılabilir alanın %28–38’i (GSA/Gensler).',
        'Okul: eğitsel + sosyal + idari alanların %50–60’ı (MEB 2015), brütün yaklaşık %33–37’si.',
        '“%10–20” tek bir kural değildir: açık planlı ve kısa koridorlu yapılarda geçerlidir.',
      ]));
      return { blocks: blocks, src: srcChips(['MEB15', 'GSA', 'TOKİ', 'S']) };
    },

    wet() {
      return { blocks: [
        p('Islak hacimler (banyo, WC, mutfak, çamaşır) ortak tesisat şaftı çevresinde, yatayda yan yana ve düşeyde üst üste gruplanmalı.'),
        ul([
          'PAİY: mutfak, oda ve WC/banyo havalandırmaları aynı boşluğa açılamaz (banyo ve WC açılabilir).',
          'Misafir WC’si antre tarafında; mutfağa ve yemek alanına doğrudan açılmamalı.',
          'Okulda WC’ler laboratuvar, mutfak, pano, jeneratör ve sistem odası üzerine gelmemeli (MEB 2015).',
          'Islak hacimler müzede depo/galeri üzerinde yer almamalı; ofiste sunucu odasının yanına gelmemeli.',
        ]),
      ], src: srcChips(['PAİY', 'MEB15', 'S']) };
    },

    noise() {
      return { blocks: [
        p('Gürültülü mekânlar ile sessiz mekânlar arasında “ayrı tut” ilişkisi kurun veya aralarına tampon (koridor, depo, WC) koyun.'),
        ul([
          'Müzik dersliği, çok amaçlı salon, spor salonu ve yemekhane dersliklerden ve kütüphaneden uzak tutulur (MEB 2015).',
          'İki derslik arasındaki duvarda ses yalıtımı aranır.',
          'Kütüphanede etkinlik salonu ve çocuk bölümü sessiz okumaya bitişik olmamalı.',
          'Konutta salon ve mutfak, yatak odalarıyla ortak duvar paylaşmamalı (küçük 1+1 daireler istisna).',
        ]),
      ], src: srcChips(['MEB15', 'S']) };
    },

    zoning() {
      return { blocks: [
        p('Zonlama, balonları ortak özelliklerine göre kümelemektir. Dört katmanı birlikte düşünün:'),
        ul([
          'Kamusal / yarı özel / özel (misafir – aile – uyku).',
          'Islak / kuru (şaft çevresinde toplanan servis çekirdeği).',
          'Gürültülü / sessiz.',
          'Kullanıcı akışı / servis akışı (mal kabul, çöp, kirli çamaşır, mutfak servisi ayrı ve kullanıcı akışıyla kesişmez).',
        ]),
        p('Hizmet eden mekânlar (WC, depo, teknik, şaft, merdiven) hizmet edilen mekânların çevresinde çekirdek olarak toplanır.'),
      ], src: srcChips(['White', 'Ching', 'S']) };
    },

    org(q) {
      const nq = N(q);
      const hit = KB.ORGS.filter((o) => nq.includes(N(o.name.split(' ')[0])) || (o.key === 'isinsal' && nq.includes('radyal')) || (o.key === 'kumelenmis' && nq.includes('kumelen')));
      const list = hit.length ? hit : KB.ORGS;
      const blocks = [];
      list.forEach((o) => { blocks.push(p(o.name + ': ' + o.text)); blocks.push(p('Diyagramda: ' + o.bubble + ' Örnek kullanım: ' + o.use)); });
      return { blocks: blocks, src: ['Ching'] };
    },

    spatial() {
      return { blocks: [p('Mekânlar arasındaki dört temel ilişki türü:')].concat([ul(KB.SPATIAL.map((s) => s.name + ': ' + s.text))]), src: ['Ching'] };
    },

    path() {
      return { blocks: [p('Dolaşım yolu ile mekân arasındaki üç temel ilişki:'), ul(KB.CIRC_PATHS.map((s) => s.name + ': ' + s.text))], src: ['Ching'] };
    },

    method() {
      return { blocks: [p('İşlev şeması (balon diyagramı) adım adım:'), ol(KB.METHOD), p('Bu uygulamada 1–2. adım Mekanlar sekmesinde, 3. adım İlişki Matrisi’nde, 4–5. adım pafta üzerinde, 6–7. adım Akıllı Öneri panelinde yapılır.')], src: srcChips(['White', 'Ching']) };
    },

    mistakes() {
      return { blocks: [p('Balon diyagramında sık yapılan hatalar:'), ul(KB.MISTAKES)], src: srcChips(['White', 'S']) };
    },

    regs(q, ctx) {
      const meta = ctx.project.meta;
      const type = App.kb.type(meta.buildingType), variant = App.kb.variant(meta.buildingType, meta.variant);
      const withMin = variant.entries.filter((e) => e.min != null);
      const blocks = [p(type.label + ' · ' + variant.label + ' için sayısal asgari değerler:')];
      if (withMin.length) blocks.push(kv(withMin.map((e) => [e.name, fmt(e.min) + ' m² (' + e.src + ')'])));
      else blocks.push(p('Bu program için mevzuatta sayısal asgari alan bulunmuyor; tipik aralıklar uygulama verisidir.'));
      blocks.push(ul(type.notes));
      return { blocks: blocks, src: srcChips(withMin.map((e) => e.src).concat(['S'])) };
    },

    total(q, ctx) {
      const a = ctx.analysis;
      const type = App.kb.type(ctx.project.meta.buildingType);
      if (!ctx.project.spaces.length) return { blocks: [p('Önce mekânları ekleyin; toplam alan ve sirkülasyon hesabını birlikte yapayım.')], src: [] };
      const nonCirc = a.circ.total - a.circ.circ;
      const need = nonCirc * U.mid(type.circ) / (1 - U.mid(type.circ));
      return { blocks: [
        kv([['Toplam (şu an)', fmt(a.circ.total) + ' m²'], ['Sirkülasyon dışı', fmt(nonCirc) + ' m²'], ['Önerilen sirkülasyon', '≈ ' + fmt(need) + ' m² (%' + fmt(U.mid(type.circ) * 100, 0) + ')'], ['Tahmini toplam', '≈ ' + fmt(nonCirc + need) + ' m²']]),
        p('Duvar kalınlığı ve şaft payı bu hesaba dahil değildir; brüt inşaat alanı için ayrıca eklenmelidir.'),
      ], src: srcChips(['S', 'GSA']) };
    },

    typeProgram(q, ctx, type) {
      const v = type.variants[0];
      const req = v.entries.filter((e) => e.req);
      return { blocks: [
        p(type.label + ' (' + v.label + ') için temel program:'),
        ul(req.map((e) => e.name + ' — tipik ' + fmt(e.typ[0]) + '–' + fmt(e.typ[1]) + ' m²')),
        p(type.notes[0] || ''),
        acts([{ type: 'loadTemplate', typeKey: type.key, variantKey: v.key, label: type.label + ' şablonunu yükle' }]),
      ], src: srcChips(['S'].concat(req.map((e) => e.src)).slice(0, 4)) };
    },

    help() {
      return { blocks: [
        p('Bu soruyu tam eşleştiremedim. Şunları sorabilirsiniz:'),
        ul(['“Projemde ne eksik?”', '“Salon kaç m² olmalı?”', '“Mutfak neyin yanında olmalı?”', '“Sirkülasyon payı ne olmalı?”', '“Projemi değerlendir”', '“Islak hacimleri nasıl gruplarım?”', '“Merkezi organizasyon nedir?”', '“Okul programında hangi mekânlar olmalı?”']),
      ], src: [] };
    },
  };

  function answer(query, ctx) {
    const nq = N(query);
    if (!nq) return handlers.help(query, ctx);

    // bina tipi + program soruları
    const typeHit = KB.TYPES.find((t) => t.key !== 'genel' && nq.split(' ').some((w) => w.length >= 4 && (N(t.label).includes(w) || w.includes(N(t.key)))));
    const wantsProgram = /program|hangi mekan|mekanlar|olmali/.test(nq) && typeHit && !App.match.findEntryInText(query, typeHit.key, typeHit.variants[0].key);
    if (typeHit && wantsProgram) return handlers.typeProgram(query, ctx, typeHit);

    // niyet puanı
    let best = null, bs = 0;
    INTENTS.forEach((it) => {
      let sc = 0;
      it.stems.forEach((st) => { if ((' ' + nq + ' ').includes(st.endsWith(' ') ? ' ' + st : st)) sc += st.length > 5 ? 2 : 1; });
      if (sc > bs) { bs = sc; best = it.key; }
    });

    const found = App.match.findEntryInText(query, ctx.project.meta.buildingType, ctx.project.meta.variant);
    if (found && (best === null || best === 'area' || best === 'adj')) {
      const adjCue = /yanin|komsu|bitisik|yakin|nereye|iliski|ayri|uzak|yan yana|kacin/.test(nq);
      const areaCue = /kac m|m2|metrekare|alan|buyuk|olcu|boyut|ne kadar|minimum|asgari/.test(nq);
      if (adjCue && !areaCue) return handlers.adj(query, ctx);
      if (areaCue && !adjCue) return handlers.area(query, ctx);
      return handlers.card(query, ctx, found);
    }
    if (best && handlers[best]) return handlers[best](query, ctx);
    if (found) return handlers.card(query, ctx, found);
    return handlers.help(query, ctx);
  }

  App.assistant = {
    answer: answer,
    chips: ['Projemde ne eksik?', 'Projemi değerlendir', 'Salon kaç m² olmalı?', 'Mutfak neyin yanında olmalı?', 'Sirkülasyon payı ne olmalı?', 'Islak hacimleri nasıl gruplarım?', 'Merkezi organizasyon nedir?'],
  };
})();
