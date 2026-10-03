/* ==========================================================================
   11-data-knowledge.js — Akıllı öneri asistanının hazır bilgi tabanı
   Kaynaklar: (1) Türk mevzuatı ve bakanlık kılavuzları (sert alt sınır),
   (2) uluslararası rehberler (tipik/ideal aralık), (3) yüklenen kitaplardaki
   mekân organizasyonu ve dolaşım kavramları (Ching), (4) bu çalışmanın sentezi (S).
   min = mevzuat asgarisi (null: sayısal asgari yok) | typ = tipik aralık | ideal = ideal aralık
   Alan birimi: m². Veri yapısı JSON'a uygundur; modüller arası paylaşım için tasarlanmıştır.
   ========================================================================== */
(function () {
  const App = window.App;

  const SOURCES = {
    'PAİY':    { label: 'Planlı Alanlar İmar Yönetmeliği (md. 29)', kind: 'Mevzuat', trust: 'çok yüksek' },
    'İst.İY':  { label: 'İstanbul İmar Yönetmeliği (md. 31)', kind: 'Mevzuat', trust: 'çok yüksek' },
    'MEB15':   { label: 'MEB Eğitim Yapıları Asgari Tasarım Standartları Kılavuzu 2015', kind: 'Bakanlık kılavuzu', trust: 'çok yüksek' },
    'ÖÖK':     { label: 'MEB Özel Öğretim Kurumları Standartlar Yönergesi', kind: 'Yönerge', trust: 'yüksek' },
    'KREŞ':    { label: 'Özel Kreş ve Gündüz Bakımevleri Yönetmeliği', kind: 'Mevzuat', trust: 'çok yüksek' },
    'AHUY':    { label: 'Aile Hekimliği Uygulama Yönetmeliği', kind: 'Mevzuat', trust: 'çok yüksek' },
    'ATTY':    { label: 'Ayakta Teşhis ve Tedavi Yapılan Özel Sağlık Kuruluşları Yönetmeliği', kind: 'Mevzuat', trust: 'çok yüksek' },
    'TTNY':    { label: 'Turizm Tesislerinin Niteliklerine İlişkin Yönetmelik (2024 değ.)', kind: 'Mevzuat', trust: 'çok yüksek' },
    'NDSS':    { label: 'İngiltere Nationally Described Space Standard', kind: 'Yabancı standart', trust: 'yüksek' },
    'BCO':     { label: 'British Council for Offices — ofis yoğunluğu', kind: 'Sektör rehberi', trust: 'orta-yüksek' },
    'GSA':     { label: 'GSA / Gensler — Sirkülasyon (2012); UNM Verimlilik Rehberi', kind: 'Kurumsal rehber', trust: 'orta-yüksek' },
    'Dahlgren':{ label: 'Dahlgren — Public Library Space Needs (2009)', kind: 'Rehber', trust: 'orta-yüksek' },
    'Ching':   { label: 'Ching — Mimarlık: Biçim, Mekan ve Düzen (yüklenen kitap)', kind: 'Literatür', trust: 'yüksek' },
    'White':   { label: 'E. T. White — Space Adjacency Analysis (1986)', kind: 'Literatür', trust: 'yüksek' },
    'TOKİ':    { label: 'TOKİ proje belgeleri (net/brüt oranları)', kind: 'Uygulama verisi', trust: 'orta' },
    'S':       { label: 'Sentez: kaynaklı değerlerden türetilmiş öneri; kullanım ile kalibre edilmeli', kind: 'Sentez', trust: 'orta' },
  };

  const E = (key, name, zone, min, typ, ideal, o) =>
    Object.assign({ key: key, name: name, zone: zone, min: min, typ: typ, ideal: ideal || typ, req: true, noise: 'mid', kw: [name], note: '', src: 'S' }, o || {});

  /* ------------------------------ KONUT ------------------------------ */
  function konut(n, villa) {
    const e = [];
    e.push(E('antre', 'Antre', 'sirkulasyon', null, [3, 6], [4, 8], { kw: ['antre', 'giris', 'vestiyer'], src: 'S', note: 'Hol/koridor genişliği en az 1,20 m olmalı (İstanbul: 1,10 m). Antre + hol toplamı net alanın yaklaşık %8–14’ü.' }));
    if (n >= 3 || villa) e.push(E('hol', 'Yatak Holü', 'sirkulasyon', null, [3, 6], [4, 7], { kw: ['yatak holu', 'hol', 'koridor'], req: false, src: 'S', note: 'Yatak odalarını ve banyoyu salondan ayıran özel bölge; koridor ≥ 1,20 m.' }));
    e.push(E('salon', 'Salon', 'sosyal', 12, [18, 28], [22, 32], { kw: ['salon', 'oturma', 'yasam', 'living'], src: 'PAİY', note: 'Oturma odası en az 12 m², dar kenar 3,00 m. Tipik aralık uygulama verisidir.' }));
    e.push(E('yemek', 'Yemek Alanı', 'sosyal', null, [8, 12], [10, 14], { kw: ['yemek'], req: false, src: 'S', note: 'Açık planlı salon–mutfakta mutfak nişi + oda minimumlarının toplamı aranır (12 + 3,30 m²).' }));
    e.push(E('mutfak', 'Mutfak', 'servis', 3.3, [8, 14], [10, 14], { kw: ['mutfak', 'kitchen'], noise: 'mid', src: 'PAİY', note: 'Mutfak en az 3,30 m² (dar kenar 1,50 m). Mutfak, oda ve banyo/WC havalandırmaları aynı boşluğa açılamaz.' }));
    e.push(E('yatak1', 'Ebeveyn Yatak Odası', 'ozel', 9, [12, 16], [14, 18], { kw: ['ebeveyn', 'yatak odasi 1', 'master', 'yatak odasi', 'yatak'], noise: 'quiet', src: 'PAİY', note: 'Yatak odası en az 9 m², dar kenar 2,50 m (İstanbul İmar Yönetmeliği: 8 m² / 2,40 m). NDSS çift kişilik oda ≥ 11,5 m².' }));
    for (let i = 2; i <= n; i++) {
      e.push(E('yatak' + i, 'Yatak Odası ' + i, 'ozel', 9, [9, 12], [11, 14], { kw: ['yatak odasi ' + i, 'cocuk odasi ' + (i - 1), 'cocuk', 'yatak odasi', 'yatak'], noise: 'quiet', src: 'PAİY', note: 'En az 9 m²; tek kişilik oda için NDSS ≥ 7,5 m² (Türk asgarisi daha büyük).' }));
    }
    e.push(E('banyo', 'Banyo', 'servis', 3, [5, 8], [6, 8], { kw: ['banyo', 'dus', 'bath'], src: 'PAİY', note: 'Banyo en az 3,00 m², dar kenar 1,50 m (İstanbul: 1,20 m). En fazla 3 odalı konutta banyo ve WC birleştirilebilir.' }));
    if (n >= 3 || villa) e.push(E('banyo2', 'Ebeveyn Banyosu', 'servis', null, [3.5, 5], [5, 6], { kw: ['ebeveyn banyo', 'ensuit', 'en suite'], req: false, src: 'S', note: 'Yalnızca ebeveyn yatak odasına açılır.' }));
    e.push(E('wc', 'WC', 'servis', 1.2, [1.5, 2.5], [2, 2.5], { kw: ['wc', 'tuvalet', 'misafir wc'], req: n >= 3 || villa, src: 'PAİY', note: 'WC en az 1,20 m², dar kenar 1,00 m. Misafir WC’si antre/salon tarafında olmalı; mutfağa ve yemek alanına doğrudan açılmamalı.' }));
    e.push(E('balkon', 'Balkon', 'acik', null, [4, 8], [6, 12], { kw: ['balkon', 'teras'], req: false, src: 'S', note: 'Salonu tamamlayan balkon; servis balkonu mutfağa bağlanır.' }));
    e.push(E('kiler', 'Kiler / Depo', 'teknik', null, [1.5, 3], [3, 5], { kw: ['kiler', 'depo', 'camasir', 'dolap'], req: false, src: 'NDSS', note: 'NDSS iç depo: 1 yatak odalı 1,5 m², 2 yatak odalı 2,0 m². En sık unutulan mekân.' }));
    if (villa) {
      e.push(E('calisma', 'Çalışma Odası', 'ozel', null, [9, 14], [12, 16], { kw: ['calisma', 'ofis'], req: false, noise: 'quiet', src: 'S' }));
      e.push(E('misafir', 'Misafir Odası + WC', 'ozel', 9, [12, 16], [14, 18], { kw: ['misafir odasi', 'misafir'], req: false, noise: 'quiet', src: 'PAİY', note: 'Misafir odası zemin katta, yatak katından ayrı olmalı.' }));
      e.push(E('garaj', 'Garaj', 'teknik', null, [15, 30], [18, 36], { kw: ['garaj', 'otopark'], req: false, src: 'S' }));
      e.push(E('teknik', 'Kazan / Teknik Oda', 'teknik', null, [4, 8], [6, 10], { kw: ['kazan', 'teknik'], req: false, noise: 'loud', src: 'S', note: 'Servis girişinden erişilmeli; yatak odalarından uzak.' }));
      e.push(E('merdiven', 'Merdiven', 'sirkulasyon', null, [6, 10], [8, 12], { kw: ['merdiven'], req: true, src: 'PAİY', note: 'İç yükseklik ≥ 2,60 m.' }));
    }
    const has = (k) => e.some((x) => x.key === k);
    const R = [
      ['antre', 'salon', 'strong'], ['antre', 'mutfak', 'weak'], ['antre', 'wc', 'strong'],
      ['salon', 'yemek', 'strong'], ['salon', 'balkon', 'strong'], ['salon', 'mutfak', 'weak'], ['yemek', 'mutfak', 'strong'],
      ['mutfak', 'kiler', 'strong'], ['mutfak', 'balkon', 'weak'],
      ['salon', 'yatak1', 'avoid'], ['salon', 'banyo', 'avoid'], ['mutfak', 'wc', 'avoid'], ['mutfak', 'yatak1', 'avoid'],
      ['yatak1', 'banyo2', 'strong'], ['banyo', 'wc', 'strong'],
      ['hol', 'banyo', 'strong'], ['hol', 'yatak1', 'strong'], ['hol', 'salon', 'weak'],
      ['garaj', 'antre', 'weak'], ['garaj', 'yatak1', 'avoid'], ['teknik', 'yatak1', 'avoid'], ['teknik', 'garaj', 'weak'],
      ['misafir', 'antre', 'weak'], ['calisma', 'salon', 'avoid'], ['merdiven', 'antre', 'strong'],
    ];
    for (let i = 2; i <= n; i++) {
      R.push([has('hol') ? 'hol' : 'antre', 'yatak' + i, has('hol') ? 'strong' : 'weak']);
      R.push(['yatak' + i, 'banyo', 'weak']);
      R.push(['salon', 'yatak' + i, 'avoid']);
      R.push(['mutfak', 'yatak' + i, 'avoid']);
    }
    if (!has('hol')) { R.push(['antre', 'yatak1', 'weak']); R.push(['yatak1', 'banyo', 'strong']); R.push(['antre', 'banyo', 'weak']); }
    return { entries: e, relations: R };
  }

  /* ------------------------ DİĞER BİNA TİPLERİ ------------------------ */
  const OFIS = {
    entries: [
      E('resepsiyon', 'Resepsiyon / Bekleme', 'sirkulasyon', null, [10, 20], [14, 24], { kw: ['resepsiyon', 'bekleme', 'giris', 'karsilama'], src: 'S' }),
      E('acik', 'Açık Ofis', 'calisma', null, [100, 120], [110, 130], { kw: ['acik ofis', 'calisma alani', 'ofis'], src: 'BCO', note: 'Tasarım yoğunluğu çalışma yeri başına yaklaşık 10 m² (BCO 2022). Tarihsel aralık 8–13 m². Örnek program 10 kişiliktir.' }),
      E('yonetici', 'Yönetici Odası', 'ozel', null, [12, 16], [16, 20], { kw: ['yonetici', 'mudur', 'direktor'], noise: 'quiet', src: 'S' }),
      E('toplanti', 'Toplantı Odası', 'calisma', null, [16, 28], [20, 32], { kw: ['toplanti'], src: 'S', note: 'Her 8–12 kişiye bir toplantı odası; misafir toplantıları için resepsiyona yakın.' }),
      E('cay', 'Çay Ocağı / Mutfak', 'servis', null, [6, 12], [8, 14], { kw: ['cay', 'mutfak', 'kafeterya'], noise: 'loud', src: 'S' }),
      E('wc', 'WC', 'servis', null, [8, 14], [10, 16], { kw: ['wc', 'tuvalet'], src: 'S' }),
      E('arsiv', 'Arşiv / Depo', 'teknik', null, [5, 15], [8, 18], { kw: ['arsiv', 'depo'], req: false, src: 'S' }),
      E('sunucu', 'Sunucu / Teknik Oda', 'teknik', null, [4, 10], [6, 12], { kw: ['sunucu', 'teknik'], req: false, src: 'S', note: 'Islak hacimlerin altına/yanına gelmemeli.' }),
      E('foto', 'Fotokopi Nişi', 'teknik', null, [3, 6], [4, 8], { kw: ['fotokopi', 'yazici'], req: false, noise: 'loud', src: 'S' }),
      E('koridor', 'Koridor / Sirkülasyon', 'sirkulasyon', null, [30, 45], [35, 50], { kw: ['koridor', 'sirkulasyon', 'hol'], src: 'GSA', note: 'Ofiste sirkülasyon brüt alanın yaklaşık %16–28’i; kapalı ofis ağırlıklı planlarda %30’u aşabilir.' }),
    ],
    relations: [
      ['resepsiyon', 'toplanti', 'strong'], ['resepsiyon', 'acik', 'weak'], ['acik', 'toplanti', 'strong'], ['acik', 'yonetici', 'weak'],
      ['acik', 'cay', 'weak'], ['cay', 'wc', 'weak'], ['acik', 'foto', 'strong'], ['yonetici', 'toplanti', 'weak'],
      ['sunucu', 'cay', 'avoid'], ['sunucu', 'wc', 'avoid'], ['yonetici', 'cay', 'avoid'], ['acik', 'arsiv', 'weak'],
    ],
  };

  const OKUL = {
    entries: [
      E('giris', 'Giriş Holü / Kapalı Teneffüs', 'sirkulasyon', null, [90, 160], [120, 180], { kw: ['giris', 'hol', 'teneffus'], src: 'MEB15' }),
      E('mudur', 'Müdür ve Yardımcıları', 'ozel', null, [30, 45], [35, 55], { kw: ['mudur', 'idare'], noise: 'quiet', src: 'MEB15', note: 'Alan verilmemiş (ihtiyaç programına bağlı). Müdür odası girişlere ve öğrenci alanlarına hâkim olmalı.' }),
      E('ogretmen', 'Öğretmenler Odası', 'ozel', null, [40, 60], [45, 70], { kw: ['ogretmen'], noise: 'quiet', src: 'MEB15' }),
      E('rehber', 'Rehberlik Servisi', 'ozel', null, [15, 25], [18, 28], { kw: ['rehber', 'veli'], noise: 'quiet', src: 'MEB15', note: 'Girişe yakın olmalı.' }),
      E('derslik', 'Derslik Grubu (12)', 'calisma', 666, [666, 720], [700, 780], { kw: ['derslik', 'sinif'], noise: 'quiet', src: 'MEB15', note: '30 öğrencilik derslik; ortaokul/lisede ≥ 1,85 m²/öğrenci (ilkokulda 1,60). 12 derslik için 12 × 30 × 1,85 = 666 m².' }),
      E('lab', 'Fen Laboratuvarı', 'calisma', 55.5, [56, 65], [60, 72], { kw: ['laboratuvar', 'lab', 'fen'], src: 'MEB15', note: '≥ 1,85 m²/kişi + hazırlık odası; tercihen zemin kat.' }),
      E('muzik', 'Müzik Dersliği', 'calisma', 55.5, [56, 70], [60, 75], { kw: ['muzik'], noise: 'loud', src: 'MEB15', note: 'Dersliklerden uzak, ses yalıtımlı alanda olmalı.' }),
      E('gorsel', 'Görsel Sanatlar Dersliği', 'calisma', 55.5, [56, 70], [60, 75], { kw: ['gorsel', 'resim'], req: false, src: 'MEB15' }),
      E('kutuphane', 'Kütüphane', 'calisma', 60, [60, 100], [80, 120], { kw: ['kutuphane'], noise: 'quiet', src: 'MEB15', note: '≥ 1,50 m²/kişi (çalışma salonu); yarısı okuma, yarısı raf.' }),
      E('cokamacli', 'Çok Amaçlı Salon', 'sosyal', 180, [180, 300], [220, 320], { kw: ['cok amacli', 'konferans', 'salon'], noise: 'loud', src: 'MEB15', note: 'Oturma alanında ≥ 1,20 m²/kişi; dersliklerden uzak, zemin kat.' }),
      E('yemekhane', 'Yemekhane', 'sosyal', 234, [234, 270], [250, 300], { kw: ['yemekhane'], noise: 'loud', src: 'MEB15', note: '≥ 1,30 m²/kişi; öğrencilerin %50’si 15’er dakikalık periyotlarla. (360 öğrenci örneği)' }),
      E('mutfak', 'Yemekhane Mutfağı', 'servis', 117, [120, 150], [130, 160], { kw: ['mutfak'], noise: 'loud', src: 'MEB15', note: 'Pişirme alanı salonun en az %50’si; servis girişi öğrenci sirkülasyonuyla kesişmemeli.' }),
      E('kantin', 'Kantin', 'sosyal', null, [40, 80], [50, 90], { kw: ['kantin'], req: false, noise: 'loud', src: 'S' }),
      E('wck', 'Öğrenci WC (Kız)', 'servis', null, [30, 45], [35, 50], { kw: ['wc kiz', 'kiz wc', 'kiz', 'wc'], src: 'MEB15', note: 'Her 20 öğrenciye 1 WC + 1 lavabo; her katta ayrı kız/erkek. WC’ler laboratuvar/mutfak üzerine gelmemeli.' }),
      E('wce', 'Öğrenci WC (Erkek)', 'servis', null, [30, 45], [35, 50], { kw: ['wc erkek', 'erkek wc', 'erkek', 'wc'], src: 'MEB15', note: 'Pisuar ayrıca; her katta engelli WC.' }),
      E('koridor', 'Koridor / Sirkülasyon', 'sirkulasyon', null, [500, 700], [550, 720], { kw: ['koridor', 'sirkulasyon', 'merdiven'], src: 'MEB15', note: 'Sirkülasyon alanı, eğitsel+sosyal+idari alanların %50–60’ı (brütün yaklaşık %33–37’si). Çift taraflı koridor ≥ 3,00 m.' }),
      E('spor', 'Spor Salonu', 'sosyal', null, [300, 500], [400, 600], { kw: ['spor'], req: false, noise: 'loud', src: 'S' }),
      E('teknik', 'Kazan / Teknik', 'teknik', null, [30, 60], [40, 70], { kw: ['kazan', 'teknik', 'jenerator'], req: false, noise: 'loud', src: 'MEB15', note: 'Bodrumda/arka cephede; servis yolu tören alanından ayrı.' }),
    ],
    relations: [
      ['giris', 'mudur', 'strong'], ['giris', 'rehber', 'strong'], ['giris', 'kantin', 'weak'], ['giris', 'koridor', 'strong'],
      ['koridor', 'derslik', 'strong'], ['derslik', 'wck', 'strong'], ['derslik', 'wce', 'strong'], ['derslik', 'lab', 'weak'], ['derslik', 'kutuphane', 'weak'],
      ['derslik', 'muzik', 'avoid'], ['derslik', 'cokamacli', 'avoid'], ['derslik', 'spor', 'avoid'], ['kutuphane', 'muzik', 'avoid'], ['kutuphane', 'cokamacli', 'avoid'],
      ['yemekhane', 'mutfak', 'strong'], ['yemekhane', 'kantin', 'weak'], ['mudur', 'ogretmen', 'weak'], ['cokamacli', 'giris', 'weak'], ['teknik', 'derslik', 'avoid'],
    ],
  };

  const KRES = {
    entries: [
      E('giris', 'Giriş / Karşılama', 'sirkulasyon', null, [10, 20], [14, 24], { kw: ['giris', 'karsilama', 'antre'], src: 'S' }),
      E('oyun', 'Oyun ve Etkinlik Odası', 'sosyal', 15, [40, 50], [45, 60], { kw: ['oyun', 'etkinlik'], noise: 'loud', src: 'KREŞ', note: 'Oda ≥ 15 m²; çocuk başına ≥ 2 m² + 6 m³ hava. Kapasite bu odaların alanından hesaplanır (örnek: 20 çocuk).' }),
      E('uyku', 'Uyku Odası', 'ozel', 15, [20, 40], [25, 45], { kw: ['uyku'], noise: 'quiet', src: 'KREŞ', note: 'KREŞ: ≥ 2 m² + 6 m³/çocuk; MEB15: 1,50 m²/kişi; ÖÖK: ≥ 3 m² + 10 m³/öğrenci. Kurumun bağlı olduğu bakanlığa göre seçin.' }),
      E('emekleme', 'Oyun / Emekleme Odası', 'sosyal', 15, [20, 40], [25, 45], { kw: ['emekleme'], req: false, noise: 'loud', src: 'KREŞ', note: 'Uyku odasına denk büyüklükte; kapasiteye dahil edilmez.' }),
      E('bahce', 'Oyun Bahçesi', 'acik', 30, [40, 80], [60, 100], { kw: ['bahce', 'oyun bahcesi'], src: 'KREŞ', note: '≥ 1,5 m²/çocuk; sınıflardan doğrudan bahçeye çıkılabilmeli.' }),
      E('mutfak', 'Mutfak', 'servis', null, [10, 18], [12, 20], { kw: ['mutfak'], src: 'S' }),
      E('yemek', 'Yemek Odası', 'sosyal', null, [15, 25], [18, 28], { kw: ['yemek'], req: false, src: 'S' }),
      E('idare', 'İdare / Müdür Odası', 'ozel', 10, [10, 15], [12, 16], { kw: ['idare', 'mudur'], noise: 'quiet', src: 'ÖÖK', note: 'Müdür odası ≥ 10 m²; girişe yakın, kontrol görüşü.' }),
      E('veli', 'Veli Görüşme', 'ozel', 15, [15, 20], [16, 22], { kw: ['veli', 'gorusme'], req: false, noise: 'quiet', src: 'ÖÖK' }),
      E('wc', 'Çocuk WC / Lavabo', 'servis', null, [8, 14], [10, 16], { kw: ['wc', 'lavabo', 'tuvalet'], src: 'MEB15', note: 'Her 30 öğrenciye 1 WC + 1 lavabo (MEB15); etkinlik odalarına bitişik, yaşa uygun lavabo yüksekliği.' }),
      E('bakim', 'Bebek Bakım / Alt Değiştirme', 'servis', null, [6, 10], [8, 12], { kw: ['bakim', 'alt degistirme'], req: false, src: 'S' }),
      E('depo', 'Depo', 'teknik', null, [4, 8], [5, 10], { kw: ['depo'], req: false, src: 'S' }),
    ],
    relations: [
      ['giris', 'idare', 'strong'], ['giris', 'veli', 'weak'], ['oyun', 'bahce', 'strong'], ['oyun', 'wc', 'strong'], ['oyun', 'uyku', 'weak'],
      ['uyku', 'emekleme', 'strong'], ['yemek', 'mutfak', 'strong'], ['oyun', 'yemek', 'weak'], ['uyku', 'bahce', 'avoid'], ['uyku', 'mutfak', 'avoid'],
      ['mutfak', 'oyun', 'avoid'], ['bakim', 'uyku', 'weak'],
    ],
  };

  const OTEL = {
    entries: [
      E('lobi', 'Lobi / Resepsiyon', 'sirkulasyon', null, [40, 80], [50, 90], { kw: ['lobi', 'resepsiyon', 'giris'], src: 'S' }),
      E('bagaj', 'Bagaj Odası', 'teknik', null, [6, 12], [8, 14], { kw: ['bagaj'], req: false, src: 'S' }),
      E('oda', 'Oda Grubu (10)', 'ozel', 200, [220, 320], [250, 320], { kw: ['oda', 'standart oda', 'suit'], noise: 'quiet', src: 'TTNY', note: '4★ otelde oda banyo dahil ≥ 20 m², 5★’ta ≥ 25 m² (RG 22.12.2024). 10 oda × 20 m² = 200 m².' }),
      E('restoran', 'Restoran / Kahvaltı Salonu', 'sosyal', null, [60, 120], [80, 140], { kw: ['restoran', 'kahvalti', 'yemek'], noise: 'loud', src: 'S' }),
      E('mutfak', 'Mutfak', 'servis', null, [25, 50], [30, 60], { kw: ['mutfak'], noise: 'loud', src: 'S' }),
      E('katofis', 'Kat Ofisi', 'teknik', null, [6, 12], [8, 14], { kw: ['kat ofisi'], src: 'TTNY', note: 'Servis akışı lobiden geçmemeli.' }),
      E('camasir', 'Çamaşırhane', 'servis', null, [15, 30], [18, 36], { kw: ['camasir'], noise: 'loud', src: 'S' }),
      E('personel', 'Personel (Soyunma / Yemek)', 'teknik', null, [15, 30], [18, 32], { kw: ['personel'], src: 'S' }),
      E('yonetim', 'Yönetim Ofisi', 'ozel', null, [12, 20], [14, 22], { kw: ['yonetim', 'ofis'], req: false, src: 'S' }),
      E('depo', 'Depo', 'teknik', null, [10, 25], [12, 28], { kw: ['depo'], req: false, src: 'S' }),
      E('teknik', 'Teknik Oda', 'teknik', null, [10, 25], [12, 28], { kw: ['teknik', 'kazan'], req: false, noise: 'loud', src: 'S' }),
      E('koridor', 'Kat Koridoru / Sirkülasyon', 'sirkulasyon', null, [60, 90], [70, 100], { kw: ['koridor', 'sirkulasyon', 'merdiven', 'asansor'], src: 'S' }),
    ],
    relations: [
      ['lobi', 'bagaj', 'strong'], ['lobi', 'restoran', 'strong'], ['lobi', 'yonetim', 'strong'], ['lobi', 'koridor', 'strong'], ['koridor', 'oda', 'strong'],
      ['mutfak', 'restoran', 'strong'], ['katofis', 'oda', 'strong'], ['camasir', 'katofis', 'strong'], ['personel', 'mutfak', 'weak'], ['depo', 'mutfak', 'weak'],
      ['mutfak', 'lobi', 'avoid'], ['camasir', 'lobi', 'avoid'], ['teknik', 'oda', 'avoid'], ['restoran', 'oda', 'avoid'],
    ],
  };

  const ASM = {
    entries: [
      E('bekleme', 'Bekleme', 'sirkulasyon', 25, [28, 45], [35, 50], { kw: ['bekleme', 'giris', 'hol'], src: 'AHUY', note: 'Tek hekimde ≥ 20 m², her ek hekim için +5 m² (Ek-1). 1 hekim için ≥ 5 koltuk, her ek hekim +3.' }),
      E('kayit', 'Kayıt / Danışma', 'sosyal', null, [8, 15], [10, 16], { kw: ['kayit', 'danisma'], src: 'S' }),
      E('muayene1', 'Muayene Odası 1', 'ozel', 10, [14, 16], [14, 18], { kw: ['muayene odasi 1', 'muayene'], noise: 'quiet', src: 'AHUY', note: 'ASM’de muayene odası ≥ 10 m², lavabolu (Ek-1 puanlamasında 14 m²). Poliklinikte ise ≥ 16 m² (ATTY).' }),
      E('muayene2', 'Muayene Odası 2', 'ozel', 10, [14, 16], [14, 18], { kw: ['muayene odasi 2', 'muayene'], noise: 'quiet', src: 'AHUY' }),
      E('asi', 'Aşı / İzlem Odası', 'ozel', 10, [10, 14], [12, 16], { kw: ['asi', 'izlem', 'bebek'], src: 'AHUY', note: 'Müstakil oda ≥ 10 m²; her 3 hekime 1 oda.' }),
      E('mudahale', 'Müdahale / Pansuman', 'servis', 10, [10, 14], [12, 16], { kw: ['mudahale', 'pansuman'], src: 'AHUY' }),
      E('wc', 'Hasta WC', 'servis', null, [3, 6], [4, 7], { kw: ['wc', 'tuvalet'], src: 'S', note: 'Engelli erişimi ve acil çağrı düğmesi.' }),
      E('personel', 'Personel / Dinlenme', 'ozel', null, [10, 16], [12, 18], { kw: ['personel', 'dinlenme'], req: false, src: 'S' }),
      E('depo', 'Depo / İlaç', 'teknik', null, [4, 8], [5, 10], { kw: ['depo', 'ilac'], req: false, src: 'S' }),
      E('koridor', 'Koridor', 'sirkulasyon', null, [20, 35], [25, 40], { kw: ['koridor', 'sirkulasyon'], src: 'S', note: 'Merdiven ve sahanlık sedye için ≥ 1,30 m.' }),
    ],
    relations: [
      ['bekleme', 'kayit', 'strong'], ['bekleme', 'wc', 'strong'], ['bekleme', 'koridor', 'strong'], ['koridor', 'muayene1', 'strong'], ['koridor', 'muayene2', 'strong'],
      ['muayene1', 'mudahale', 'weak'], ['asi', 'bekleme', 'weak'], ['mudahale', 'asi', 'weak'], ['depo', 'mudahale', 'weak'],
      ['muayene1', 'bekleme', 'avoid'], ['muayene2', 'bekleme', 'avoid'], ['personel', 'bekleme', 'avoid'],
    ],
  };
  const POLI = {
    entries: [
      E('bekleme', 'Bekleme', 'sirkulasyon', 25, [30, 45], [35, 50], { kw: ['bekleme', 'giris'], src: 'ATTY', note: 'Poliklinikte ≥ 20 m²; ikiden fazla her muayene odası için +5 m². Bekleme amaçlı orta koridor ≥ 3 m.' }),
      E('kayit', 'Kayıt / Danışma', 'sosyal', null, [8, 15], [10, 16], { kw: ['kayit', 'danisma'], src: 'S' }),
      E('muayene1', 'Muayene Odası 1', 'ozel', 16, [16, 20], [18, 22], { kw: ['muayene odasi 1', 'muayene'], noise: 'quiet', src: 'ATTY', note: '≥ 16 m² (8 m² hekim + 8 m² muayene alanı); soyunma bölümü ve lavabo.' }),
      E('muayene2', 'Muayene Odası 2', 'ozel', 16, [16, 20], [18, 22], { kw: ['muayene odasi 2', 'muayene'], noise: 'quiet', src: 'ATTY' }),
      E('muayene3', 'Muayene Odası 3', 'ozel', 16, [16, 20], [18, 22], { kw: ['muayene odasi 3', 'muayene'], noise: 'quiet', src: 'ATTY' }),
      E('mudahale', 'Pansuman / Müdahale', 'servis', 10, [10, 14], [12, 16], { kw: ['mudahale', 'pansuman'], src: 'ATTY' }),
      E('wc', 'Hasta WC', 'servis', null, [3, 6], [4, 7], { kw: ['wc', 'tuvalet'], src: 'ATTY', note: 'Bekleme salonuna koridorla bağlı, acil çağrı ve tutamaçlı.' }),
      E('koridor', 'Koridor', 'sirkulasyon', null, [25, 40], [30, 45], { kw: ['koridor', 'sirkulasyon'], src: 'S' }),
      E('depo', 'Depo / Steril', 'teknik', null, [4, 10], [6, 12], { kw: ['depo', 'steril'], req: false, src: 'S' }),
    ],
    relations: [
      ['bekleme', 'kayit', 'strong'], ['bekleme', 'wc', 'strong'], ['bekleme', 'koridor', 'strong'], ['koridor', 'muayene1', 'strong'], ['koridor', 'muayene2', 'strong'], ['koridor', 'muayene3', 'strong'],
      ['muayene1', 'mudahale', 'weak'], ['muayene1', 'bekleme', 'avoid'], ['muayene2', 'bekleme', 'avoid'], ['muayene3', 'bekleme', 'avoid'], ['mudahale', 'depo', 'weak'],
    ],
  };

  const KUTUP = {
    entries: [
      E('giris', 'Giriş / Kontrol / Ödünç', 'sirkulasyon', null, [25, 45], [30, 50], { kw: ['giris', 'kontrol', 'odunc'], src: 'S' }),
      E('yetiskin', 'Yetişkin Koleksiyon + Okuma', 'calisma', null, [150, 230], [180, 260], { kw: ['yetiskin', 'koleksiyon', 'raf'], noise: 'quiet', src: 'Dahlgren', note: 'Okuyucu oturma yeri 2,3–3,7 m² (ort. 2,8 m²) ve raf yoğunluğu ortalama ≈ 108 cilt/m².' }),
      E('cocuk', 'Çocuk Bölümü', 'sosyal', null, [45, 80], [55, 90], { kw: ['cocuk'], noise: 'loud', src: 'S', note: 'Ayrı ve tanınabilir; sessiz okumadan uzak.' }),
      E('sessiz', 'Sessiz Okuma / Çalışma', 'calisma', null, [60, 110], [70, 120], { kw: ['sessiz', 'calisma', 'okuma'], noise: 'quiet', src: 'Dahlgren' }),
      E('etkinlik', 'Etkinlik / Toplantı Salonu', 'sosyal', null, [40, 80], [50, 90], { kw: ['etkinlik', 'toplanti', 'salon'], noise: 'loud', src: 'S' }),
      E('depo', 'Depo / Arşiv', 'teknik', null, [15, 40], [20, 45], { kw: ['depo', 'arsiv'], src: 'S' }),
      E('personel', 'Personel / İşlem', 'ozel', null, [15, 30], [18, 32], { kw: ['personel', 'islem'], src: 'S' }),
      E('wc', 'WC', 'servis', null, [12, 20], [14, 22], { kw: ['wc', 'tuvalet'], src: 'S' }),
      E('kafe', 'Kafe', 'sosyal', null, [20, 40], [25, 45], { kw: ['kafe'], req: false, noise: 'loud', src: 'S' }),
    ],
    relations: [
      ['giris', 'yetiskin', 'strong'], ['giris', 'cocuk', 'weak'], ['yetiskin', 'sessiz', 'strong'], ['giris', 'wc', 'weak'], ['giris', 'etkinlik', 'weak'],
      ['depo', 'personel', 'strong'], ['etkinlik', 'sessiz', 'avoid'], ['cocuk', 'sessiz', 'avoid'], ['kafe', 'sessiz', 'avoid'], ['giris', 'personel', 'weak'],
    ],
  };

  const RESTORAN = {
    entries: [
      E('giris', 'Giriş / Bekleme', 'sirkulasyon', null, [8, 15], [10, 18], { kw: ['giris', 'bekleme'], src: 'S' }),
      E('salon', 'Yemek Salonu', 'sosyal', null, [60, 100], [70, 110], { kw: ['salon', 'yemek', 'restoran'], noise: 'loud', src: 'S', note: 'Kişi başı yaklaşık 1,0–1,5 m² (gündelik 0,9–1,1; lüks 1,5–1,9 m²). Örnek program 60 kişiliktir. Kaba kural: salon %60, mutfak+hazırlık+depo %40.' }),
      E('bar', 'Bar / Servis Tezgâhı', 'sosyal', null, [8, 15], [10, 18], { kw: ['bar', 'servis', 'tezgah'], noise: 'loud', src: 'S' }),
      E('mutfak', 'Mutfak', 'servis', null, [30, 50], [35, 55], { kw: ['mutfak'], noise: 'loud', src: 'S' }),
      E('bulasik', 'Bulaşık / Çöp', 'servis', null, [4, 8], [5, 9], { kw: ['bulasik', 'cop'], src: 'S' }),
      E('wc', 'Müşteri WC', 'servis', null, [8, 14], [10, 16], { kw: ['wc', 'tuvalet'], src: 'S', note: 'Mutfağa ve yemek alanına doğrudan açılmamalı.' }),
      E('malkabul', 'Mal Kabul / Depo', 'teknik', null, [10, 20], [12, 22], { kw: ['mal kabul', 'depo'], src: 'S', note: 'Müşteri girişiyle kesişmeyen ayrı servis girişi.' }),
      E('soguk', 'Soğuk Hava Deposu', 'teknik', null, [4, 8], [5, 9], { kw: ['soguk'], req: false, src: 'S' }),
      E('personel', 'Personel (Soyunma / WC)', 'teknik', null, [6, 10], [7, 12], { kw: ['personel', 'soyunma'], src: 'S' }),
      E('teras', 'Teras', 'acik', null, [20, 60], [30, 80], { kw: ['teras', 'bahce'], req: false, src: 'S' }),
    ],
    relations: [
      ['giris', 'salon', 'strong'], ['salon', 'bar', 'strong'], ['bar', 'mutfak', 'weak'], ['mutfak', 'bulasik', 'strong'], ['mutfak', 'malkabul', 'strong'],
      ['mutfak', 'salon', 'strong'], ['malkabul', 'soguk', 'strong'], ['giris', 'wc', 'weak'], ['salon', 'teras', 'strong'],
      ['wc', 'mutfak', 'avoid'], ['wc', 'salon', 'weak'], ['malkabul', 'giris', 'avoid'], ['malkabul', 'salon', 'avoid'],
    ],
  };

  const MUZE = {
    entries: [
      E('giris', 'Giriş / Bilet / Vestiyer', 'sirkulasyon', null, [30, 60], [40, 70], { kw: ['giris', 'bilet', 'vestiyer'], src: 'S' }),
      E('kalici', 'Kalıcı Sergi Salonu', 'calisma', null, [150, 300], [180, 320], { kw: ['kalici', 'sergi'], noise: 'quiet', src: 'S', note: 'Kalıcı sergiler toplam alanın yaklaşık %40’ı. Galeri : galeri dışı ≈ 48 : 52 (ikincil kaynak).' }),
      E('gecici', 'Geçici Sergi Salonu', 'calisma', null, [80, 150], [100, 170], { kw: ['gecici'], req: false, noise: 'quiet', src: 'S' }),
      E('depo', 'Koleksiyon Deposu', 'teknik', null, [60, 120], [70, 140], { kw: ['koleksiyon', 'depo'], src: 'S', note: 'Koleksiyon hacmi + planlı büyüme + bağışlar için yaklaşık %15 ek alan; depo ekipman izdüşümüne %60 sirkülasyon.' }),
      E('karantina', 'Kasa Açma / Karantina', 'teknik', null, [15, 30], [18, 34], { kw: ['kasa acma', 'karantina'], src: 'S' }),
      E('yukleme', 'Yükleme Alanı', 'teknik', null, [20, 40], [25, 45], { kw: ['yukleme', 'mal kabul'], noise: 'loud', src: 'S', note: 'Koleksiyon rotası kamusal alanlardan geçmemeli.' }),
      E('magaza', 'Mağaza', 'sosyal', null, [15, 30], [18, 34], { kw: ['magaza', 'hediye'], req: false, src: 'S' }),
      E('kafe', 'Kafe', 'sosyal', null, [30, 60], [35, 70], { kw: ['kafe'], req: false, noise: 'loud', src: 'S' }),
      E('egitim', 'Eğitim Atölyesi', 'calisma', null, [30, 50], [35, 55], { kw: ['egitim', 'atolye'], req: false, noise: 'loud', src: 'S' }),
      E('ofis', 'Ofis', 'ozel', null, [20, 40], [24, 44], { kw: ['ofis', 'idare'], src: 'S' }),
      E('wc', 'WC', 'servis', null, [12, 24], [14, 26], { kw: ['wc', 'tuvalet'], src: 'S', note: 'Islak hacimler depo/galeri üzerinde yer almamalı.' }),
      E('konservasyon', 'Konservasyon', 'teknik', null, [20, 40], [24, 44], { kw: ['konservasyon', 'restorasyon'], req: false, src: 'S' }),
    ],
    relations: [
      ['giris', 'kalici', 'strong'], ['giris', 'magaza', 'weak'], ['giris', 'kafe', 'weak'], ['kalici', 'gecici', 'strong'], ['giris', 'wc', 'weak'],
      ['yukleme', 'karantina', 'strong'], ['karantina', 'depo', 'strong'], ['depo', 'gecici', 'weak'], ['depo', 'konservasyon', 'strong'], ['ofis', 'depo', 'weak'],
      ['yukleme', 'giris', 'avoid'], ['yukleme', 'kalici', 'avoid'], ['kafe', 'kalici', 'avoid'], ['wc', 'depo', 'avoid'], ['egitim', 'kalici', 'avoid'],
    ],
  };

  const ATOLYE = {
    entries: [
      E('giris', 'Giriş / Karşılama', 'sirkulasyon', null, [8, 15], [10, 18], { kw: ['giris', 'karsilama'], src: 'S' }),
      E('atolye', 'Atölye', 'calisma', 22.5, [28, 45], [32, 50], { kw: ['atolye', 'studyo', 'studuyo'], noise: 'loud', src: 'MEB15', note: 'Özel kurumlarda öğrenci başına ≥ 1,5 m² (ÖÖK), kamu okulunda 1,85 m² (MEB15). Örnek: 15 öğrenci.' }),
      E('malzeme', 'Malzeme Deposu', 'teknik', null, [6, 12], [8, 14], { kw: ['malzeme', 'depo'], src: 'S' }),
      E('islak', 'Islak Alan / Temizlik', 'servis', null, [4, 8], [5, 9], { kw: ['islak', 'temizlik', 'lavabo'], src: 'S' }),
      E('boya', 'Boya / Havalandırmalı Bölüm', 'teknik', null, [8, 15], [10, 18], { kw: ['boya', 'havalandirma'], req: false, noise: 'loud', src: 'S' }),
      E('sergi', 'Sergi / Galeri', 'sosyal', null, [20, 40], [25, 45], { kw: ['sergi', 'galeri'], req: false, src: 'S' }),
      E('ofis', 'Eğitmen / Ofis', 'ozel', null, [8, 14], [10, 16], { kw: ['egitmen', 'ofis'], noise: 'quiet', src: 'S' }),
      E('wc', 'WC', 'servis', null, [4, 8], [5, 9], { kw: ['wc', 'tuvalet'], src: 'S' }),
    ],
    relations: [
      ['atolye', 'malzeme', 'strong'], ['atolye', 'islak', 'strong'], ['atolye', 'sergi', 'weak'], ['giris', 'sergi', 'strong'], ['giris', 'ofis', 'weak'], ['atolye', 'boya', 'weak'], ['giris', 'wc', 'weak'],
      ['atolye', 'ofis', 'avoid'],
    ],
  };

  const GENEL = {
    entries: [
      E('giris', 'Giriş', 'sirkulasyon', null, [6, 15], [8, 18], { kw: ['giris', 'antre', 'lobi'], src: 'S' }),
      E('ana', 'Ana Kullanım Alanı', 'sosyal', null, [40, 100], [60, 120], { kw: ['ana'], src: 'S' }),
      E('wc', 'WC', 'servis', null, [3, 8], [4, 10], { kw: ['wc', 'tuvalet'], src: 'S' }),
      E('depo', 'Depo', 'teknik', null, [4, 12], [6, 14], { kw: ['depo'], req: false, src: 'S' }),
      E('koridor', 'Sirkülasyon', 'sirkulasyon', null, [8, 20], [10, 24], { kw: ['koridor', 'sirkulasyon', 'hol'], src: 'S' }),
    ],
    relations: [['giris', 'ana', 'strong'], ['giris', 'wc', 'weak'], ['ana', 'depo', 'weak']],
  };

  const k1 = konut(1, false), k2 = konut(2, false), k3 = konut(3, false), k4 = konut(4, false), kv = konut(4, true);

  const TYPES = [
    { key: 'konut', label: 'Konut', circ: [0.08, 0.14], circNote: 'Konutta antre + hol + koridor net alanın yaklaşık %8–14’ü (TOKİ örneklerinde net/brüt ≈ 0,74–0,82).',
      notes: ['Mevzuat yalnızca asgari piyes ölçülerini verir; “tipik/ideal” değerler uygulama verisidir.', 'İl yönetmeliği PAİY’den farklı olabilir (ör. İstanbul: yatak odası 8 m², hol 1,10 m).', 'Islak hacimler tesisat şaftı etrafında gruplanır; ancak mutfak, oda ve WC/banyo havalandırmaları aynı boşluğa açılamaz.'],
      variants: [
        { key: '1+1', label: '1+1 Daire', entries: k1.entries, relations: k1.relations },
        { key: '2+1', label: '2+1 Daire', entries: k2.entries, relations: k2.relations },
        { key: '3+1', label: '3+1 Daire', entries: k3.entries, relations: k3.relations },
        { key: '4+1', label: '4+1 Daire', entries: k4.entries, relations: k4.relations },
        { key: 'villa', label: 'Müstakil Villa', entries: kv.entries, relations: kv.relations },
      ] },
    { key: 'ofis', label: 'Ofis', circ: [0.16, 0.28], circNote: 'Ofiste sirkülasyon brüt alanın yaklaşık %16’sı (UNM) ile kullanılabilir alanın %28–38’i (GSA/Gensler) arasında değişir.',
      notes: ['Türkiye’de ofis için ulusal m²/kişi standardı yok; BCO 2022 çalışma yeri başına 10 m² öneriyor (WC/asansör hesabında efektif 16,7 m²/kişi).'],
      variants: [{ key: '10kisi', label: '10 kişilik ofis', entries: OFIS.entries, relations: OFIS.relations }] },
    { key: 'okul', label: 'Okul', circ: [0.33, 0.37], circNote: 'MEB 2015: sirkülasyon, eğitsel + sosyal + idari alanların %50–60’ı (brütün yaklaşık %33–37’si).',
      notes: ['Okul modülü MEB 2015 Kılavuzu’na dayanır; derslik 30 öğrenci, ilkokulda ≥ 1,60, ortaokul/lisede ≥ 1,85 m²/öğrenci.', 'Kılavuz 2015 tarihlidir; daha yeni bir revizyon olup olmadığını kontrol edin.', 'Çift taraflı koridor ≥ 3,00 m; her 20 öğrenciye 1 WC + 1 lavabo.'],
      variants: [{ key: 'ortaokul12', label: 'Ortaokul (12 derslik)', entries: OKUL.entries, relations: OKUL.relations }] },
    { key: 'kres', label: 'Kreş / Anaokulu', circ: [0.15, 0.25], circNote: 'Kreş için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['İki bakanlık farklı değer verir: ASHB kreş yönetmeliği (≥ 2 m²/çocuk, oda ≥ 15 m²) ve MEB anaokulu (derslik ≥ 2,40 m²/kişi). Kurumun bağlı olduğu bakanlığı seçin.', 'Yaş tanımları 2016’da değişti (0–24 ay kreş, 25–66 ay gündüz bakımevi); eski kaynaklar yanlış oda tipi önerebilir.'],
      variants: [{ key: 'kres20', label: 'Kreş (20 çocuk)', entries: KRES.entries, relations: KRES.relations }] },
    { key: 'otel', label: 'Otel', circ: [0.2, 0.3], circNote: 'Otel için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['4★ otelde oda banyo dahil ≥ 20 m², 5★’ta ≥ 25 m² (TTNY, RG 22.12.2024).', 'Misafir ve servis akışı ayrılmalı: servis asansörü, kat ofisi, çamaşırhane ve mutfak lobiden geçmemeli.'],
      variants: [{ key: 'otel10', label: 'Butik otel (10 oda)', entries: OTEL.entries, relations: OTEL.relations }] },
    { key: 'saglik', label: 'Sağlık (ASM / Poliklinik)', circ: [0.2, 0.3], circNote: 'Sağlık yapıları için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['İki rejimi karıştırmayın: ASM (AHUY) muayene odası ≥ 10 m²; özel poliklinik/muayenehane (ATTY) ≥ 16 m².', 'Muayene odası bekleme alanından görsel ve işitsel mahremiyeti korumalı.'],
      variants: [
        { key: 'asm', label: 'Aile Sağlığı Merkezi (2 hekim)', entries: ASM.entries, relations: ASM.relations },
        { key: 'poli', label: 'Poliklinik (3 muayene odası)', entries: POLI.entries, relations: POLI.relations },
      ] },
    { key: 'kutuphane', label: 'Kütüphane', circ: [0.15, 0.25], circNote: 'Kütüphane için resmî sirkülasyon oranı yok; sentez değer (kalibre edilmeli).',
      notes: ['Okuyucu koltuğu 2,3–3,7 m² (ort. 2,8 m²); raf yoğunluğu ≈ 108 cilt/m² (Dahlgren 2009).', 'Etkinlik salonu ve çocuk bölümü sessiz okumaya bitişik olmamalı.'],
      variants: [{ key: 'halk40', label: 'Halk kütüphanesi (40 koltuk)', entries: KUTUP.entries, relations: KUTUP.relations }] },
    { key: 'restoran', label: 'Restoran / Kafe', circ: [0.1, 0.2], circNote: 'Restoranda salon ≈ %60, mutfak + hazırlık + depo ≈ %40 (sektör kaba kuralı; orta güvenilirlik).',
      notes: ['“Başlık sayısı = m²” gibi formüller 100 m² altındaki salonlarda yanıltıcıdır.', 'Mal kabul ve çöp çıkışı müşteri akışıyla kesişmemeli.'],
      variants: [{ key: 'rest60', label: 'Restoran (60 kişi)', entries: RESTORAN.entries, relations: RESTORAN.relations }] },
    { key: 'muze', label: 'Küçük Müze / Sergi', circ: [0.25, 0.35], circNote: 'Kamusal tip müzede net ≈ brütün %70’i (%30 tare); atölye/depo tipinde %20 (WBDG örneği).',
      notes: ['Dört zon: kamusal–koleksiyonsuz, kamusal–koleksiyonlu, kamusal olmayan–koleksiyonlu (depo), kamusal olmayan–koleksiyonsuz (ofis).', 'Yükleme → kasa açma → depo → sergi için geniş ve düz bir servis rotası kurulmalı.'],
      variants: [{ key: 'muze', label: 'Küçük müze', entries: MUZE.entries, relations: MUZE.relations }] },
    { key: 'atolye', label: 'Atölye / Stüdyo', circ: [0.1, 0.2], circNote: 'Atölye için resmî sirkülasyon oranı yok; sentez değer.',
      notes: ['Özel kurumda öğrenci başına 1,5 m² (ÖÖK), kamu okulunda 1,85 m² (MEB15).'],
      variants: [{ key: 'atolye15', label: 'Atölye (15 öğrenci)', entries: ATOLYE.entries, relations: ATOLYE.relations }] },
    { key: 'genel', label: 'Diğer / Serbest', circ: [0.1, 0.2], circNote: 'Genel varsayım (kalibre edilmeli).', notes: ['Bu tip için hazır program yok; mekanlarınızı kendiniz ekleyin.'],
      variants: [{ key: 'serbest', label: 'Serbest program', entries: GENEL.entries, relations: GENEL.relations }] },
  ];

  /* ----------- Literatür: mekân organizasyonu (Ching, yüklenen kitap) ----------- */
  const ORGS = [
    { key: 'merkezi', name: 'Merkezi organizasyon', text: 'Büyük, baskın bir merkezi mekânın çevresinde toplanan ikincil mekânlardan oluşur; merkez genellikle düzenli ve sabit biçimlidir.', bubble: 'En büyük balonu (ör. salon, çok amaçlı salon, lobi) ortaya koyun, diğerlerini çevresine yerleştirin.', use: 'Konutta salon, okulda çok amaçlı salon veya avlu, otelde lobi.' },
    { key: 'cizgisel', name: 'Çizgisel organizasyon', text: 'Mekânların bir sıra halinde dizilmesiyle oluşur; sıranın başı ve sonu girişe/dış mekâna bağlanır, tek tek mekânlar yan yana ya da bir sirkülasyon çizgisine bağlanabilir.', bubble: 'Balonları tek bir hat boyunca dizin; koridor/hol balonunu bu hattın omurgası yapın.', use: 'Derslik blokları, otel kat planları, poliklinik koridorları.' },
    { key: 'isinsal', name: 'Işınsal (radyal) organizasyon', text: 'Merkezi bir mekândan dışa doğru uzanan çizgisel kolların birleşimidir; merkezi ve çizgisel düzenlerin karışımıdır.', bubble: 'Merkez balonundan farklı yönlere uzanan kollar çizin; her kola bir işlev grubu verin.', use: 'Büyük hastane ve otel blokları, çok kanatlı okullar.' },
    { key: 'kumelenmis', name: 'Kümelenmiş organizasyon', text: 'Mekânlar yakınlık, ortak görsel özellik veya ortak ilişki temelinde gruplanır; boyut, biçim ve işlev bakımından farklı mekânlar bir arada olabilir.', bubble: 'Güçlü ilişkili balonları kümeler halinde toplayın (ıslak hacim kümesi, yatak kümesi, servis kümesi).', use: 'Konutta gün/gece bölgeleri, müzede kamusal/koleksiyon zonları.' },
    { key: 'izgara', name: 'Izgara organizasyon', text: 'Mekânlar düzenli bir yapısal ızgara veya modül içinde düzenlenir; ızgara tekrar eden, esnek ve genişletilebilir bir düzen sağlar.', bubble: 'Balon boyutlarını ortak bir modüle yaklaştırın ve hizalayarak yerleştirin.', use: 'Ofis katları, atölye ve stüdyo blokları.' },
  ];
  const SPATIAL = [
    { name: 'Mekân içinde mekân', text: 'Büyük bir mekânın içinde daha küçük bir mekân yer alır (ör. salon içinde yemek köşesi, galeri içinde kapalı bir oda). Balon diyagramında küçük balon büyük balonun içine alınır.' },
    { name: 'Kenetlenen (iç içe geçen) mekânlar', text: 'İki mekânın alanları kısmen örtüşür ve ortak bölge her iki mekâna hizmet eder (ör. açık planlı salon–mutfak).' },
    { name: 'Bitişik mekânlar', text: 'En yaygın ilişkidir; iki mekân ortak bir sınır paylaşır. Sınırın nasıl kurulacağı (kapı, açıklık, sürekli duvar) iki mekânın ilişkisinin gücünü belirler.' },
    { name: 'Ortak bir mekânla bağlanan mekânlar', text: 'Birbirinden uzak iki mekân, aralarındaki üçüncü bir mekânla bağlanır (ör. antre/hol/koridor). Ara mekân sirkülasyon balonu olarak çizilir.' },
  ];
  const CIRC_PATHS = [
    { name: 'Mekânların yanından geçen yol', text: 'Mekânların bütünlüğünü korur, serbest bir dolaşım sağlar; yola açılan bağlantı mekânın girişine bağlıdır.' },
    { name: 'Mekânların içinden geçen yol', text: 'Yol mekânı keser; mekânın kullanım alanı azalır, ancak mekânlar arası bağlantı doğrudandır. Küçük konutlarda salonun dolaşım yolu olması bu türdendir.' },
    { name: 'Mekânda sonlanan yol', text: 'Yol bir mekâna varır ve orada biter; mekânın önemini vurgular (ör. antre → salon).' },
  ];

  const METHOD = [
    'Program listesi: bina tipine göre zorunlu mekânları ve kullanıcı sayısını belirleyin (öğrenci, hekim, koltuk, yatak).',
    'Alan ataması: her mekâna asgari (mevzuat), tipik ve ideal alan verin; kişi başı kuralları uygulayın.',
    'İlişki matrisi: her mekân çifti için güçlü, zayıf, ilişkisiz veya ayrı tutulacak olarak işaretleyin (White matris yöntemi).',
    'Balon diyagramı: balon alanını m² ile orantılı çizin; güçlü ilişkileri kalın, zayıfları ince çizgiyle gösterin.',
    'Zonlama: kamusal / yarı özel / özel, ıslak / kuru, gürültülü / sessiz, misafir / servis katmanlarına göre kümeleyin.',
    'Sirkülasyon ve brüt hesap: net toplam alanı bina tipine uygun sirkülasyon payıyla artırın.',
    'Kontrol: asgari alan ihlali, ayrı tutulması gerekenlerin bitişikliği ve verimlilik skorunu değerlendirin.',
  ];
  const MISTAKES = [
    'Balon boyutlarını alanla orantısız çizmek (küçük WC’yi salon kadar göstermek).',
    'Sirkülasyonu (antre, hol, koridor, merdiven) hiç çizmemek; brüt alan sonradan tutmaz.',
    'Matristeki bütün ilişkileri çizip diyagramı okunmaz hale getirmek; önce güçlü ve ayrı tutulacak ilişkileri öne çıkarın.',
    'Ayrı tutulacak ilişkileri hiç kodlamamak (ıslak hacim–yatak odası, gürültülü–sessiz, mal kabul–müşteri girişi).',
    'Tek giriş yönünü, servis girişini ve çöp/mal kabul akışını unutmak.',
    'Balon diyagramını kesin çözüm sanmak; statik bir araçtır ve çok işlevli mekânları iyi temsil etmez.',
  ];

  App.KB = { SOURCES: SOURCES, TYPES: TYPES, ORGS: ORGS, SPATIAL: SPATIAL, CIRC_PATHS: CIRC_PATHS, METHOD: METHOD, MISTAKES: MISTAKES };

  App.kb = {
    type: (key) => TYPES.find((t) => t.key === key) || TYPES[0],
    variant: (typeKey, variantKey) => {
      const t = TYPES.find((x) => x.key === typeKey) || TYPES[0];
      return t.variants.find((v) => v.key === variantKey) || t.variants[0];
    },
  };
})();
