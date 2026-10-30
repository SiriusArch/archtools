/* ==========================================================================
   10-data-palette.js — monokrom tema belirteçleri (design tokens), bölgeler, ilişki türleri, anahtar kelime ipuçları
   ========================================================================== */
(function () {
  const App = window.App;

  /* ---------------- tema ----------------
     Arayüzün tek tabanı monokrom "glass" temasıdır (minimal, buzlu cam, gri tonlar). "Beni renklendir!" aynı yerleşimi
     bozmaz; yalnızca renk değişkenlerini seçilen palete göre yeniden üretir (bkz. 13-lib-colortheme.js).
     App.PAL / App.ZONES / App.FONTS nesneleri yerinde güncellenir; böylece pafta çizimi ve dışa aktarma her zaman
     etkin renkleri kullanır. Tailwind'e taşırken: theme.extend.colors = App.THEMES.glass.pal */
  const THEMES = {
    glass: {
      pal: {
        ink: '#17181B', paper: '#F3F4F6', paperDark: '#D6D8DD', blue: '#17181B', blueBright: '#44464D', yellow: '#C9CBD1', red: '#3A3C42', green: '#2A2B30', indigo: '#6C6F77', orange: '#9A9DA5',
        // pafta levhası (PNG/PDF ve canlı pafta): tuval, levha yüzü, gölge — renkli kipte palete göre türetilir
        outer: '#E9EAEE', sheet: '#F6F7F9', sheetLive: 'rgba(249,250,252,.9)', shade: 'rgba(46,52,68,.22)',
      },
      fonts: {
        d: "'Unbounded','Century Gothic','Trebuchet MS',sans-serif",
        b: "'Manrope','Segoe UI','Helvetica Neue',Arial,sans-serif",
        m: "'Manrope','Segoe UI','Helvetica Neue',Arial,sans-serif",
        l: "'Manrope','Segoe UI','Helvetica Neue',Arial,sans-serif",
      },
      zones: {
        sosyal: ['#E1E2E6', '#17181B'], ozel: ['#55585F', '#F6F7F9'], servis: ['#26272B', '#F6F7F9'], calisma: ['#B4B6BD', '#17181B'],
        sirkulasyon: ['#FDFDFE', '#17181B'], teknik: ['#7D8088', '#F6F7F9'], acik: ['#D3D5DA', '#17181B'],
      },
      label: { upper: false, cw: 0.57, nameW: 0.82 },
      fontLoads: ["300 20px 'Unbounded'", "400 20px 'Unbounded'", "600 16px 'Manrope'", "700 16px 'Manrope'", "500 14px 'Manrope'"],
    },
  };

  App.THEMES = THEMES;
  App.PAL = Object.assign({}, THEMES.glass.pal);
  App.FONTS = Object.assign({}, THEMES.glass.fonts);

  // Mekan bölgeleri (zone): daire rengi + üzerindeki yazı rengi (temaya göre güncellenir)
  App.ZONES = {
    sosyal:      { label: 'Sosyal / kamusal' },
    ozel:        { label: 'Özel / dinlenme' },
    servis:      { label: 'Islak / servis' },
    calisma:     { label: 'Çalışma / eğitim' },
    sirkulasyon: { label: 'Sirkülasyon' },
    teknik:      { label: 'Teknik / depo' },
    acik:        { label: 'Açık / yarı açık' },
  };

  App.theme = {
    name: 'glass',
    cur: function () { return THEMES.glass; },
    // monokrom taban değerlerine döner (renkli kip kapanırken de bu çağrılır)
    reset: function () {
      const t = THEMES.glass;
      Object.assign(App.PAL, t.pal);
      Object.assign(App.FONTS, t.fonts);
      Object.keys(App.ZONES).forEach(function (z) { App.ZONES[z].fill = t.zones[z][0]; App.ZONES[z].text = t.zones[z][1]; });
    },
  };
  App.theme.reset();
  App.ZONE_ORDER = ['sosyal', 'ozel', 'servis', 'calisma', 'sirkulasyon', 'teknik', 'acik'];

  // İlişki türleri
  App.REL = {
    strong: { label: 'Güçlü',       short: 'Güçlü',  sym: '●', weight: 3 },
    weak:   { label: 'Zayıf',       short: 'Zayıf',  sym: '○', weight: 1 },
    none:   { label: 'İlişkisiz',   short: 'Yok',    sym: '·', weight: 0 },
    avoid:  { label: 'Ayrı tut',    short: 'Ayrı',   sym: '✕', weight: 2 },
  };
  App.REL_CYCLE = ['none', 'strong', 'weak', 'avoid'];

  // Anahtar kelimeden bölge tahmini (kullanıcının yazdığı serbest mekan adları için)
  App.ZONE_HINTS = [
    ['servis', ['wc', 'banyo', 'tuvalet', 'lavabo', 'mutfak', 'camasir', 'dus', 'islak', 'hasta wc', 'bulasik', 'temizlik']],
    ['sirkulasyon', ['antre', 'hol', 'koridor', 'sirkulasyon', 'merdiven', 'asansor', 'lobi', 'giris', 'fuaye', 'bekleme']],
    ['ozel', ['yatak', 'ebeveyn', 'cocuk odasi', 'uyku', 'giyinme', 'mudur', 'idare', 'yonetici', 'ofis', 'rehberlik', 'muayene']],
    ['calisma', ['derslik', 'sinif', 'atolye', 'laboratuvar', 'lab', 'calisma', 'kutuphane', 'okuma', 'galeri', 'sergi', 'toplanti', 'egitim', 'studuyo', 'studyo']],
    ['teknik', ['depo', 'kiler', 'teknik', 'kazan', 'sunucu', 'arsiv', 'garaj', 'jenerator', 'siginak', 'yukleme', 'mal kabul']],
    ['acik', ['balkon', 'teras', 'bahce', 'avlu', 'veranda', 'otopark']],
    ['sosyal', ['salon', 'oturma', 'yemek', 'restoran', 'kafe', 'mutfak salon', 'misafir', 'cok amacli', 'kantin', 'bar', 'magaza', 'resepsiyon']],
  ];
})();
