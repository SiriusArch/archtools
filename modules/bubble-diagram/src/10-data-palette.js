/* ==========================================================================
   10-data-palette.js — Retro-Bauhaus renk belirteçleri (design tokens)
   Renkler referans afişlerden alınmıştır (lacivert/sarı/kırmızı/yeşil/indigo/turuncu).
   Tailwind'e taşırken: theme.extend.colors.bauhaus = App.PAL
   ========================================================================== */
(function () {
  const App = window.App;

  App.PAL = {
    ink: '#261D11',
    paper: '#F1E6CB',
    paperDark: '#D9C9A3',
    blue: '#00427A',
    blueBright: '#0477BF',
    yellow: '#EAAE1B',
    red: '#C03A22',
    green: '#3A8040',
    indigo: '#4E5189',
    orange: '#E87E1B',
  };

  App.FONTS = {
    d: "'Chakra Petch','Futura','Century Gothic','Trebuchet MS',sans-serif",
    b: "'Jost','Futura','Century Gothic','Trebuchet MS',sans-serif",
    m: "'DM Mono','Courier New',monospace",
  };

  // Mekan bölgeleri (zone): daire rengi + üzerindeki yazı rengi
  App.ZONES = {
    sosyal:      { label: 'Sosyal / kamusal',    fill: '#EAAE1B', text: '#261D11' },
    ozel:        { label: 'Özel / dinlenme',     fill: '#00427A', text: '#F1E6CB' },
    servis:      { label: 'Islak / servis',      fill: '#C03A22', text: '#F1E6CB' },
    calisma:     { label: 'Çalışma / eğitim',    fill: '#3A8040', text: '#F1E6CB' },
    sirkulasyon: { label: 'Sirkülasyon',         fill: '#D9C9A3', text: '#261D11' },
    teknik:      { label: 'Teknik / depo',       fill: '#4E5189', text: '#F1E6CB' },
    acik:        { label: 'Açık / yarı açık',    fill: '#E87E1B', text: '#261D11' },
  };
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
