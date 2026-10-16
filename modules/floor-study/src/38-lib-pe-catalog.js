/* ==========================================================================
   38-lib-pe-catalog.js — Mekân Etüdü · Plan Editörü: kataloglar (Türkçe, özgün)
   Mekân türleri · nesne (mobilya) kataloğu · kapı / pencere / merdiven tanımları · stil ve malzeme sözlükleri.
   Ölçüler metredir (genişlik w, derinlik d, yükseklik h). Bu dosya yalnızca veri ve küçük yardımcılar içerir;
   mantık 38-lib-pe-model.js, çizim 39-lib-pe-scene.js / 39-lib-pe-3d.js içindedir.
   Katalog adları, ölçüler, semboller ve stil adları bu projeye özgüdür; başka bir üründen alınmamıştır.
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const pe = (App.pe = App.pe || {});

  /* ---------------- mekân türleri ----------------
     k: kod · label · g: grup · zone: İşlev Şeması bölgesi · min: öneri asgari net alan (m², yönetmelik değildir) ·
     def: [genişlik, derinlik] varsayılan · floor: varsayılan zemin malzemesi · wet: ıslak hacim · hab: yaşama mekânı (pencere beklenir) */
  const ROOM_GROUPS = [
    { g: 'yasama', label: 'Yaşama ve yemek' },
    { g: 'yatak', label: 'Yatak ve ıslak hacim' },
    { g: 'calisma', label: 'Çalışma ve hobi' },
    { g: 'servis', label: 'Servis' },
    { g: 'depo', label: 'Depolama' },
    { g: 'dis', label: 'Dış mekân' },
    { g: 'dusey', label: 'Düşey dolaşım' },
  ];
  const ROOMS = [
    { k: 'salon', label: 'Salon', g: 'yasama', zone: 'sosyal', min: 16, def: [5, 4], floor: 'mese_parke', hab: 1 },
    { k: 'oturma', label: 'Oturma odası', g: 'yasama', zone: 'sosyal', min: 12, def: [4, 3.6], floor: 'mese_parke', hab: 1 },
    { k: 'yemek', label: 'Yemek odası', g: 'yasama', zone: 'sosyal', min: 9, def: [3.6, 3], floor: 'mese_parke', hab: 1 },
    { k: 'mutfak', label: 'Mutfak', g: 'yasama', zone: 'servis', min: 6, def: [3.4, 2.8], floor: 'seramik_acik', wet: 1, hab: 1 },
    { k: 'acik_mutfak', label: 'Açık mutfak', g: 'yasama', zone: 'servis', min: 6, def: [3.6, 2.8], floor: 'seramik_acik', wet: 1, hab: 1 },
    { k: 'kiler', label: 'Kiler', g: 'yasama', zone: 'servis', min: 1.5, def: [1.6, 1.4], floor: 'seramik_acik' },
    { k: 'yatak', label: 'Yatak odası', g: 'yatak', zone: 'ozel', min: 9, def: [3.6, 3.2], floor: 'mese_parke', hab: 1 },
    { k: 'ebeveyn', label: 'Ebeveyn yatak odası', g: 'yatak', zone: 'ozel', min: 12, def: [4.2, 3.6], floor: 'mese_parke', hab: 1 },
    { k: 'cocuk', label: 'Çocuk odası', g: 'yatak', zone: 'ozel', min: 8, def: [3.4, 3], floor: 'laminat_acik', hab: 1 },
    { k: 'banyo', label: 'Banyo', g: 'yatak', zone: 'servis', min: 3.5, def: [2.4, 2.1], floor: 'seramik_koyu', wet: 1 },
    { k: 'ebeveyn_banyo', label: 'Ebeveyn banyosu', g: 'yatak', zone: 'servis', min: 4, def: [2.6, 2.3], floor: 'seramik_koyu', wet: 1 },
    { k: 'dus_wc', label: 'Duş + WC', g: 'yatak', zone: 'servis', min: 2.5, def: [1.8, 1.6], floor: 'seramik_koyu', wet: 1 },
    { k: 'wc', label: 'WC', g: 'yatak', zone: 'servis', min: 1.2, def: [1.2, 1.5], floor: 'seramik_koyu', wet: 1 },
    { k: 'calisma', label: 'Çalışma odası', g: 'calisma', zone: 'calisma', min: 7, def: [3.2, 2.8], floor: 'laminat_acik', hab: 1 },
    { k: 'oyun', label: 'Oyun odası', g: 'calisma', zone: 'sosyal', min: 10, def: [4, 3.6], floor: 'laminat_acik', hab: 1 },
    { k: 'spor', label: 'Spor odası', g: 'calisma', zone: 'sosyal', min: 8, def: [3.6, 3], floor: 'epoksi', hab: 1 },
    { k: 'hobi', label: 'Hobi odası', g: 'calisma', zone: 'calisma', min: 8, def: [3.4, 3], floor: 'laminat_acik', hab: 1 },
    { k: 'hol', label: 'Hol', g: 'servis', zone: 'sirkulasyon', min: 4, def: [3, 2.6], floor: 'seramik_acik' },
    { k: 'koridor', label: 'Koridor', g: 'servis', zone: 'sirkulasyon', min: 0, def: [4, 1.2], floor: 'seramik_acik', corridor: 1 },
    { k: 'giris', label: 'Giriş / antre', g: 'servis', zone: 'sirkulasyon', min: 2.5, def: [2.2, 2], floor: 'seramik_acik' },
    { k: 'camasir', label: 'Çamaşır odası', g: 'servis', zone: 'servis', min: 2.5, def: [2, 1.8], floor: 'seramik_acik', wet: 1 },
    { k: 'teknik', label: 'Teknik hacim', g: 'servis', zone: 'teknik', min: 2, def: [1.8, 1.6], floor: 'beton' },
    { k: 'kazan', label: 'Kazan dairesi', g: 'servis', zone: 'teknik', min: 3, def: [2.4, 2], floor: 'beton' },
    { k: 'dolap', label: 'Gömme dolap', g: 'depo', zone: 'servis', min: 1, def: [1.6, 0.7], floor: 'laminat_acik' },
    { k: 'giyinme', label: 'Giyinme odası', g: 'depo', zone: 'ozel', min: 3, def: [2.2, 1.8], floor: 'laminat_acik' },
    { k: 'depo', label: 'Depo', g: 'depo', zone: 'servis', min: 2, def: [2, 1.6], floor: 'beton' },
    { k: 'garaj', label: 'Garaj', g: 'depo', zone: 'servis', min: 15, def: [3.2, 5.6], floor: 'beton' },
    { k: 'balkon', label: 'Balkon', g: 'dis', zone: 'acik', min: 3, def: [3, 1.4], floor: 'karo_cimento', out: 1 },
    { k: 'teras', label: 'Teras', g: 'dis', zone: 'acik', min: 6, def: [4, 3], floor: 'karo_cimento', out: 1 },
    { k: 'veranda', label: 'Veranda', g: 'dis', zone: 'acik', min: 6, def: [4.4, 2.4], floor: 'ceviz_parke', out: 1 },
    { k: 'sundurma', label: 'Sundurma', g: 'dis', zone: 'acik', min: 6, def: [4, 3], floor: 'beton', out: 1 },
    { k: 'merdiven_evi', label: 'Merdiven evi', g: 'dusey', zone: 'sirkulasyon', min: 4.5, def: [2.6, 3.2], floor: 'beton' },
    { k: 'asansor', label: 'Asansör', g: 'dusey', zone: 'sirkulasyon', min: 2.2, def: [1.7, 1.7], floor: 'beton' },
  ];
  const ROOM_BY = {};
  ROOMS.forEach((r) => { ROOM_BY[r.k] = r; });

  /* İşlev Şeması mekân adından tür tahmini (anahtar sözcük) */
  const GUESS = [
    [/ebeveyn.*banyo/, 'ebeveyn_banyo'], [/ebeveyn|master/, 'ebeveyn'], [/cocuk|genc/, 'cocuk'], [/yatak|misafir odasi|oda\b/, 'yatak'],
    [/salon|living|aile|gunduz/, 'salon'], [/oturma/, 'oturma'], [/yemek/, 'yemek'], [/acik mutfak|amerikan/, 'acik_mutfak'], [/mutfak/, 'mutfak'], [/kiler/, 'kiler'],
    [/banyo|hamam/, 'banyo'], [/dus/, 'dus_wc'], [/wc|tuvalet|lavabo/, 'wc'], [/calisma|ofis|buro|study|stud|yonetici|mudur/, 'calisma'], [/oyun/, 'oyun'], [/spor|fitness/, 'spor'], [/hobi|atolye/, 'hobi'],
    [/koridor|sirkulasyon/, 'koridor'], [/giris|antre|lobi/, 'giris'], [/hol/, 'hol'], [/camasir/, 'camasir'], [/kazan/, 'kazan'], [/teknik|mekanik|elektrik/, 'teknik'],
    [/giyinme/, 'giyinme'], [/dolap/, 'dolap'], [/depo|arsiv|ambar/, 'depo'], [/garaj|otopark/, 'garaj'], [/balkon/, 'balkon'], [/teras|bahce|avlu/, 'teras'], [/veranda/, 'veranda'], [/sundurma/, 'sundurma'],
    [/merdiven/, 'merdiven_evi'], [/asansor/, 'asansor'],
  ];
  function guessRoom(name, zone) {
    const n = U.norm(name || '');
    for (let i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(n)) return GUESS[i][1];
    return zone === 'ozel' ? 'yatak' : zone === 'sosyal' ? 'salon' : zone === 'sirkulasyon' ? 'hol' : zone === 'calisma' ? 'calisma' : zone === 'teknik' ? 'teknik' : zone === 'acik' ? 'teras' : 'depo';
  }

  /* ---------------- malzeme ve stil sözlükleri ----------------
     slot: zemin · duvar · tavan · kapi · pencere · disduvar · pat: 2B desen (plain, parke, karo, tas, hali, beton, lambri, tugla, siva) */
  const MAT = [
    { k: 'mese_parke', slot: 'zemin', label: 'Meşe parke', c: '#C9A06A', pat: 'parke' },
    { k: 'ceviz_parke', slot: 'zemin', label: 'Ceviz parke', c: '#7A5538', pat: 'parke' },
    { k: 'laminat_acik', slot: 'zemin', label: 'Açık laminat', c: '#D8C3A0', pat: 'parke' },
    { k: 'seramik_acik', slot: 'zemin', label: 'Açık seramik', c: '#D9DCDD', pat: 'karo' },
    { k: 'seramik_koyu', slot: 'zemin', label: 'Koyu seramik', c: '#7A8187', pat: 'karo' },
    { k: 'mermer', slot: 'zemin', label: 'Mermer', c: '#E8E6E1', pat: 'tas' },
    { k: 'karo_cimento', slot: 'zemin', label: 'Karo çimento', c: '#B9A48C', pat: 'karo' },
    { k: 'epoksi', slot: 'zemin', label: 'Epoksi zemin', c: '#A9AFB5', pat: 'plain' },
    { k: 'beton', slot: 'zemin', label: 'Beton zemin', c: '#B4B6B8', pat: 'beton' },
    { k: 'hali', slot: 'zemin', label: 'Halı', c: '#BDB3A7', pat: 'hali' },
    { k: 'boya_beyaz', slot: 'duvar', label: 'Beyaz boya', c: '#F5F3EE', pat: 'plain' },
    { k: 'boya_kirik', slot: 'duvar', label: 'Kırık beyaz boya', c: '#EBE4D6', pat: 'plain' },
    { k: 'boya_gri', slot: 'duvar', label: 'Açık gri boya', c: '#D5D8DB', pat: 'plain' },
    { k: 'boya_mavi', slot: 'duvar', label: 'Gök mavisi boya', c: '#BFD1DD', pat: 'plain' },
    { k: 'boya_yesil', slot: 'duvar', label: 'Adaçayı yeşili boya', c: '#C5D3BE', pat: 'plain' },
    { k: 'boya_sari', slot: 'duvar', label: 'Hardal sarısı boya', c: '#E9D08B', pat: 'plain' },
    { k: 'boya_pembe', slot: 'duvar', label: 'Pudra boya', c: '#E8CFC8', pat: 'plain' },
    { k: 'seramik_beyaz', slot: 'duvar', label: 'Beyaz seramik', c: '#EEF1F1', pat: 'karo' },
    { k: 'lambri_mese', slot: 'duvar', label: 'Meşe lambri', c: '#B98F5E', pat: 'lambri' },
    { k: 'beton_brut', slot: 'duvar', label: 'Brüt beton', c: '#A9ABAD', pat: 'beton' },
    { k: 'tugla_kirmizi', slot: 'duvar', label: 'Tuğla', c: '#A9563C', pat: 'tugla' },
    { k: 'tavan_beyaz', slot: 'tavan', label: 'Beyaz boya', c: '#F7F7F5', pat: 'plain' },
    { k: 'tavan_lambri', slot: 'tavan', label: 'Meşe lambri', c: '#B98F5E', pat: 'lambri' },
    { k: 'tavan_asma', slot: 'tavan', label: 'Asma tavan', c: '#ECEDEE', pat: 'karo' },
    { k: 'tavan_beton', slot: 'tavan', label: 'Brüt beton', c: '#A9ABAD', pat: 'beton' },
    { k: 'kapi_beyaz', slot: 'kapi', label: 'Beyaz lake', c: '#F4F4F2', pat: 'plain' },
    { k: 'kapi_mese', slot: 'kapi', label: 'Meşe kaplama', c: '#B58B55', pat: 'plain' },
    { k: 'kapi_ceviz', slot: 'kapi', label: 'Ceviz', c: '#6B4A31', pat: 'plain' },
    { k: 'kapi_antrasit', slot: 'kapi', label: 'Antrasit', c: '#3B3F44', pat: 'plain' },
    { k: 'pvc_beyaz', slot: 'pencere', label: 'PVC beyaz', c: '#F2F2F2', pat: 'plain' },
    { k: 'pvc_antrasit', slot: 'pencere', label: 'PVC antrasit', c: '#3E4247', pat: 'plain' },
    { k: 'aluminyum', slot: 'pencere', label: 'Alüminyum', c: '#8E9399', pat: 'plain' },
    { k: 'ahsap_pencere', slot: 'pencere', label: 'Ahşap doğrama', c: '#A27B4C', pat: 'plain' },
    { k: 'siva_beyaz', slot: 'disduvar', label: 'Kırık beyaz sıva', c: '#EFEBE2', pat: 'siva' },
    { k: 'siva_gri', slot: 'disduvar', label: 'Gri sıva', c: '#BFC3C6', pat: 'siva' },
    { k: 'tas_kaplama', slot: 'disduvar', label: 'Taş kaplama', c: '#B7A98F', pat: 'tas' },
    { k: 'kompozit_antrasit', slot: 'disduvar', label: 'Antrasit kompozit', c: '#4B5056', pat: 'plain' },
    { k: 'tugla_cephe', slot: 'disduvar', label: 'Tuğla cephe', c: '#A9563C', pat: 'tugla' },
    { k: 'ahsap_cephe', slot: 'disduvar', label: 'Ahşap cephe', c: '#A87E4F', pat: 'lambri' },
  ];
  const MAT_BY = {};
  MAT.forEach((m) => { MAT_BY[m.k] = m; });
  const SLOTS = [
    { k: 'zemin', label: 'Zemin' }, { k: 'duvar', label: 'Duvar' }, { k: 'tavan', label: 'Tavan' },
    { k: 'kapi', label: 'Kapılar' }, { k: 'pencere', label: 'Pencereler' }, { k: 'disduvar', label: 'Dış duvar' },
  ];
  const matsOf = (slot) => MAT.filter((m) => m.slot === slot);

  /* stil: varsayılan kaplama seti + mobilya tonu */
  const STYLES = [
    { k: 'modern', label: 'Modern minimal', note: 'Sade yüzeyler, açık tonlar, antrasit doğrama.', fin: { zemin: 'laminat_acik', duvar: 'boya_beyaz', tavan: 'tavan_beyaz', kapi: 'kapi_beyaz', pencere: 'pvc_antrasit', disduvar: 'siva_beyaz' }, tint: '#D6D6D2' },
    { k: 'iskandinav', label: 'İskandinav', note: 'Açık ahşap, beyaz duvar, sıcak ve aydınlık.', fin: { zemin: 'mese_parke', duvar: 'boya_beyaz', tavan: 'tavan_beyaz', kapi: 'kapi_beyaz', pencere: 'pvc_beyaz', disduvar: 'siva_beyaz' }, tint: '#E3D8C6' },
    { k: 'endustriyel', label: 'Endüstriyel', note: 'Brüt beton, koyu doğrama, tuğla vurgu.', fin: { zemin: 'beton', duvar: 'beton_brut', tavan: 'tavan_beton', kapi: 'kapi_antrasit', pencere: 'pvc_antrasit', disduvar: 'tugla_cephe' }, tint: '#7C8085' },
    { k: 'yuzyil_ortasi', label: 'Yüzyıl ortası modern', note: 'Ceviz, hardal ve adaçayı tonları.', fin: { zemin: 'ceviz_parke', duvar: 'boya_sari', tavan: 'tavan_beyaz', kapi: 'kapi_ceviz', pencere: 'ahsap_pencere', disduvar: 'siva_beyaz' }, tint: '#B98A5C' },
    { k: 'akdeniz', label: 'Akdeniz / Ege', note: 'Beyaz sıva, mavi vurgu, karo çimento.', fin: { zemin: 'karo_cimento', duvar: 'boya_mavi', tavan: 'tavan_beyaz', kapi: 'kapi_mese', pencere: 'ahsap_pencere', disduvar: 'siva_beyaz' }, tint: '#B7CBD8' },
    { k: 'kirsal', label: 'Kırsal ev', note: 'Ahşap lambri, taş ve sıcak ışık.', fin: { zemin: 'ceviz_parke', duvar: 'boya_kirik', tavan: 'tavan_lambri', kapi: 'kapi_mese', pencere: 'ahsap_pencere', disduvar: 'tas_kaplama' }, tint: '#B79A74' },
    { k: 'japandi', label: 'Japandi', note: 'Doğal ahşap, adaçayı ve kırık beyaz.', fin: { zemin: 'mese_parke', duvar: 'boya_yesil', tavan: 'tavan_beyaz', kapi: 'kapi_mese', pencere: 'pvc_antrasit', disduvar: 'siva_gri' }, tint: '#C6CDB9' },
    { k: 'klasik', label: 'Klasik', note: 'Mermer, ceviz kapı, kırık beyaz duvar.', fin: { zemin: 'mermer', duvar: 'boya_kirik', tavan: 'tavan_beyaz', kapi: 'kapi_ceviz', pencere: 'pvc_beyaz', disduvar: 'siva_beyaz' }, tint: '#CFC1A8' },
    { k: 'geleneksel', label: 'Geleneksel Türk evi', note: 'Ahşap tavan ve cephe, sıcak toprak tonları.', fin: { zemin: 'ceviz_parke', duvar: 'boya_kirik', tavan: 'tavan_lambri', kapi: 'kapi_ceviz', pencere: 'ahsap_pencere', disduvar: 'ahsap_cephe' }, tint: '#A98764' },
    { k: 'bohem', label: 'Bohem', note: 'Halı, pudra ve terakota tonları.', fin: { zemin: 'hali', duvar: 'boya_pembe', tavan: 'tavan_beyaz', kapi: 'kapi_mese', pencere: 'ahsap_pencere', disduvar: 'siva_beyaz' }, tint: '#D4A99C' },
  ];
  const STYLE_BY = {};
  STYLES.forEach((s) => { STYLE_BY[s.k] = s; });

  /* ---------------- nesne kataloğu ----------------
     g: üst grup · sub: alt grup · w, d, h: ölçü (m) · yaslı: arkası duvara dönük yerleşir (sırt üst kenar) ·
     3B parçaları 39-lib-pe-3d.js içinde kendi 'parts' tablosundan gelir; burada yalnızca ölçü ve ad. */
  const FURN_GROUPS = [
    { g: 'yasama', label: 'Yaşama ve yemek', subs: ['Oturma', 'Yemek', 'Mutfak'] },
    { g: 'yatak', label: 'Yatak ve banyo', subs: ['Yatak odası', 'Islak hacim'] },
    { g: 'calisma', label: 'Çalışma ve oyun', subs: ['Çalışma', 'Oyun ve spor'] },
    { g: 'servis', label: 'Servis ve depolama', subs: ['Depolama', 'Teknik'] },
    { g: 'dis', label: 'Dış mekân', subs: ['Bahçe ve teras'] },
    { g: 'aksesuar', label: 'Aksesuar', subs: ['Dekor'] },
  ];
  const F = (k, label, g, sub, w, d, h, o) => Object.assign({ k: k, label: label, g: g, sub: sub, w: w, d: d, h: h }, o || {});
  const FURN = [
    F('ozel', 'Özel nesne', 'servis', 'Özel', 0.6, 0.6, 0.8, { hidden: 1 }),
    F('kanepe3', 'Üçlü kanepe', 'yasama', 'Oturma', 2.1, 0.9, 0.85), F('kanepe2', 'İkili kanepe', 'yasama', 'Oturma', 1.55, 0.9, 0.85), F('kose_kanepe', 'Köşe kanepe', 'yasama', 'Oturma', 2.6, 1.7, 0.85),
    F('koltuk', 'Koltuk', 'yasama', 'Oturma', 0.85, 0.85, 0.85), F('sehpa', 'Orta sehpa', 'yasama', 'Oturma', 1.1, 0.6, 0.4), F('yan_sehpa', 'Yan sehpa', 'yasama', 'Oturma', 0.5, 0.5, 0.5),
    F('tv', 'TV ünitesi', 'yasama', 'Oturma', 1.8, 0.4, 0.5), F('kitaplik', 'Kitaplık', 'yasama', 'Oturma', 1.2, 0.35, 1.9), F('konsol', 'Konsol', 'yasama', 'Oturma', 1.2, 0.35, 0.8), F('vitrin', 'Vitrin', 'yasama', 'Oturma', 1.0, 0.42, 1.8),
    F('hali', 'Halı', 'yasama', 'Oturma', 2.4, 1.7, 0.015, { flat: 1 }),
    F('masa4', 'Yemek masası (4)', 'yasama', 'Yemek', 1.2, 0.8, 0.75), F('masa6', 'Yemek masası (6)', 'yasama', 'Yemek', 1.8, 0.9, 0.75), F('masar', 'Yuvarlak masa', 'yasama', 'Yemek', 1.1, 1.1, 0.75),
    F('sandalye', 'Sandalye', 'yasama', 'Yemek', 0.45, 0.45, 0.9), F('bar_tabure', 'Bar tabure', 'yasama', 'Yemek', 0.4, 0.4, 0.75),
    F('tezgah', 'Mutfak tezgâhı', 'yasama', 'Mutfak', 2.4, 0.6, 0.9), F('ocak', 'Ocak', 'yasama', 'Mutfak', 0.6, 0.6, 0.9), F('evye', 'Evye', 'yasama', 'Mutfak', 0.9, 0.6, 0.9),
    F('buzdolabi', 'Buzdolabı', 'yasama', 'Mutfak', 0.7, 0.7, 1.8), F('bulasik', 'Bulaşık makinesi', 'yasama', 'Mutfak', 0.6, 0.6, 0.85), F('ada', 'Mutfak adası', 'yasama', 'Mutfak', 2.0, 0.9, 0.9),
    F('yatak2', 'Çift kişilik yatak', 'yatak', 'Yatak odası', 1.6, 2.0, 0.55), F('yatak_king', 'Geniş yatak (king)', 'yatak', 'Yatak odası', 1.8, 2.0, 0.55), F('yatak1', 'Tek kişilik yatak', 'yatak', 'Yatak odası', 0.95, 2.0, 0.5),
    F('komodin', 'Komodin', 'yatak', 'Yatak odası', 0.45, 0.4, 0.55), F('gardrop', 'Gardrop', 'yatak', 'Yatak odası', 2.0, 0.6, 2.2), F('sifonyer', 'Şifonyer', 'yatak', 'Yatak odası', 1.0, 0.5, 0.8), F('puf', 'Puf', 'yatak', 'Yatak odası', 0.5, 0.5, 0.42),
    F('wc', 'Klozet', 'yatak', 'Islak hacim', 0.4, 0.7, 0.8), F('lavabo', 'Lavabo', 'yatak', 'Islak hacim', 0.6, 0.48, 0.85), F('lavabo2', 'Çift lavabo', 'yatak', 'Islak hacim', 1.2, 0.5, 0.85),
    F('dus', 'Duşakabin', 'yatak', 'Islak hacim', 0.9, 0.9, 2.0), F('kuvet', 'Küvet', 'yatak', 'Islak hacim', 1.7, 0.75, 0.55), F('camasir', 'Çamaşır makinesi', 'yatak', 'Islak hacim', 0.6, 0.6, 0.85),
    F('calisma', 'Çalışma masası', 'calisma', 'Çalışma', 1.4, 0.7, 0.75), F('ofiskoltuk', 'Ofis koltuğu', 'calisma', 'Çalışma', 0.6, 0.6, 1.0), F('toplanti', 'Toplantı masası', 'calisma', 'Çalışma', 3.2, 1.2, 0.75),
    F('piyano', 'Piyano', 'calisma', 'Oyun ve spor', 1.5, 0.65, 1.2), F('bilardo', 'Bilardo masası', 'calisma', 'Oyun ve spor', 2.4, 1.35, 0.8), F('pinpon', 'Masa tenisi', 'calisma', 'Oyun ve spor', 2.74, 1.525, 0.76), F('kosu_bandi', 'Koşu bandı', 'calisma', 'Oyun ve spor', 0.9, 1.9, 1.3),
    F('sira', 'Öğrenci sırası', 'calisma', 'Çalışma', 1.2, 0.5, 0.75),
    F('reyon', 'Raf / reyon', 'servis', 'Depolama', 1.2, 0.5, 1.8), F('ayakkabilik', 'Ayakkabılık', 'servis', 'Depolama', 0.9, 0.35, 1.2), F('portmanto', 'Portmanto', 'servis', 'Depolama', 0.5, 0.5, 1.7), F('depo_dolap', 'Depo dolabı', 'servis', 'Depolama', 1.0, 0.5, 2.0),
    F('kurutma', 'Kurutma makinesi', 'servis', 'Teknik', 0.6, 0.6, 0.85), F('kombi', 'Kombi', 'servis', 'Teknik', 0.4, 0.3, 0.7), F('boyler', 'Termosifon / boyler', 'servis', 'Teknik', 0.5, 0.5, 1.2),
    F('bahce_masa', 'Bahçe masası', 'dis', 'Bahçe ve teras', 1.0, 1.0, 0.72), F('bahce_sandalye', 'Bahçe sandalyesi', 'dis', 'Bahçe ve teras', 0.5, 0.5, 0.85), F('sezlong', 'Şezlong', 'dis', 'Bahçe ve teras', 0.7, 1.9, 0.4), F('mangal', 'Mangal', 'dis', 'Bahçe ve teras', 0.6, 0.5, 1.0), F('agac', 'Ağaç', 'dis', 'Bahçe ve teras', 2.0, 2.0, 4.5, { round: 1 }),
    F('bitki', 'Saksı bitkisi', 'aksesuar', 'Dekor', 0.55, 0.55, 1.1, { round: 1 }), F('lambader', 'Lambader', 'aksesuar', 'Dekor', 0.35, 0.35, 1.6, { round: 1 }), F('kolon', 'Kolon (kare)', 'aksesuar', 'Dekor', 0.3, 0.3, 3.0), F('kolon_yuvarlak', 'Kolon (yuvarlak)', 'aksesuar', 'Dekor', 0.3, 0.3, 3.0, { round: 1 }),
  ];
  const FURN_BY = {};
  FURN.forEach((f) => { FURN_BY[f.k] = f; });

  /* ---------------- kapı ve pencere tanımları ---------------- */
  const D = (sub, label, w, h, sill, o) => Object.assign({ sub: sub, label: label, w: w, h: h, sill: sill }, o || {});
  const DOORS = [
    D('tek', 'Tek kanatlı kapı', 0.9, 2.1, 0), D('tek80', 'Tek kanatlı kapı (80)', 0.8, 2.1, 0), D('cift', 'Çift kanatlı kapı', 1.4, 2.1, 0, { leaves: 2 }),
    D('surgulu', 'Sürgülü kapı', 1.8, 2.1, 0, { slide: 1 }), D('cep', 'Cep (gömme) kapı', 0.9, 2.1, 0, { slide: 1, pocket: 1 }), D('katlanir', 'Katlanır kapı', 0.9, 2.1, 0, { fold: 1 }),
    D('dis', 'Dış kapı', 1.0, 2.2, 0, { ext: 1 }), D('garaj', 'Garaj kapısı', 3.0, 2.2, 0, { slide: 1, ext: 1 }), D('gecis', 'Açıklık (geçiş)', 1.2, 2.1, 0, { open: 1 }),
  ];
  const WINDOWS = [
    D('tek', 'Tek kanatlı pencere', 0.9, 1.4, 0.9), D('cift', 'Çift kanatlı pencere', 1.4, 1.4, 0.9, { leaves: 2 }), D('sabit', 'Sabit pencere', 1.2, 1.2, 0.9, { fixed: 1 }),
    D('surme', 'Sürme pencere', 1.8, 1.4, 0.9, { slide: 1 }), D('panorama', 'Panoramik pencere', 2.4, 1.5, 0.7, { fixed: 1 }), D('balkon_kapi', 'Balkon kapısı', 0.9, 2.1, 0, { door: 1 }),
    D('fransiz', 'Fransız balkon', 1.4, 2.1, 0, { door: 1, leaves: 2 }), D('ust', 'Üst ışıklık', 0.9, 0.5, 2.0, { fixed: 1 }),
  ];
  const OP_BY = {};
  DOORS.forEach((d) => { OP_BY['kapi:' + d.sub] = d; });
  WINDOWS.forEach((d) => { OP_BY['pencere:' + d.sub] = d; });

  /* merdiven türleri: tek kol, L (çeyrek dönüş + sahanlık), U (yarım dönüş) */
  const STAIRS = [
    { sub: 'duz', label: 'Düz merdiven', w: 1.1 },
    { sub: 'L', label: 'L merdiven', w: 1.1 },
    { sub: 'U', label: 'U merdiven', w: 1.0 },
  ];

  /* ---------------- 3B malzeme tonu: nesne parçaları için ortak renkler ---------------- */
  const TONES = { wood: '#B08A5E', woodDk: '#6F5238', fabric: '#BDB7AE', fabricDk: '#8F8A82', white: '#F2F2F0', metal: '#A7ADB3', dark: '#3A3E43', ceramic: '#F4F5F6', leaf: '#4F7F4A', trunk: '#6B4F34', glass: '#BCD7E6', rug: '#CDBFAE' };

  Object.assign(pe, {
    ROOM_GROUPS: ROOM_GROUPS, ROOMS: ROOMS, ROOM_BY: ROOM_BY, guessRoom: guessRoom,
    MAT: MAT, MAT_BY: MAT_BY, SLOTS: SLOTS, matsOf: matsOf, STYLES: STYLES, STYLE_BY: STYLE_BY,
    FURN_GROUPS: FURN_GROUPS, FURN: FURN, FURN_BY: FURN_BY, DOORS: DOORS, WINDOWS: WINDOWS, OP_BY: OP_BY, STAIRS: STAIRS, TONES: TONES,
  });
})();
