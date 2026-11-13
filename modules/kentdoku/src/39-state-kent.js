/* ==========================================================================
   39-state-kent.js — Modül 12 (Kent Dokusu) durumu
   Arayüz durumu state.ui.kent içinde durur (UI eylemiyle yamalanır; geri-al geçmişine girmez).
   İndirilen veri, SVG çıktısı, harita ve 3B nesneleri serileştirilemez; App.kent.rt içinde tutulur.
   Hesap motoru (harita, veri, çizim, dışa aktarım) ayrı bir ES modülüdür ve yalnızca bu modül
   açıldığında yüklenir: App.config.kent.engine (build.py enjekte eder).
   ========================================================================== */
(function () {
  const App = window.App;

  const K0 = {
    tab: 'konum',          // sol panel sekmesi: konum · gorunum · aktar
    view: 'map',           // pafta görünümü: map · plan · model · ozet
    lat: 41.0256, lon: 28.9741, name: '',
    size: 750, ratio: 1,   // alan genişliği (m) ve yükseklik/genişlik oranı
    base: 'sokak',         // altlık: sokak · uydu
    style: 'arch', mode: 'plan',
    layers: { binalar: true, yollar: true, yaya: true, ray: true, su: true, yesil: true, topo: false, pafta: true },
    scale: 2000,           // PDF ölçeği
    axo: false,
    q: '', results: null, searching: false,
    busy: null,            // { title, msg, frac }
    has: false,            // veri yüklendi mi
    rev: 0                 // çalışma zamanı verisi değişince yeniden çizim tetikler
  };

  const SIZES = [300, 500, 750, 1000, 1500, 2000, 3000];
  const RATIOS = [{ v: 1, label: 'Kare' }, { v: 0.7071, label: 'Yatay' }, { v: 1.4142, label: 'Dikey' }];
  const SCALES = [500, 1000, 2000, 5000, 10000];
  const LAYERS = [['binalar', 'Binalar'], ['yollar', 'Yollar'], ['yaya', 'Yaya yolları'], ['ray', 'Raylı sistem'], ['su', 'Su'], ['yesil', 'Yeşil alan'], ['topo', 'Eşyükselti'], ['pafta', 'Ölçek ve kuzey']];
  const MODES = [
    ['plan', 'Vaziyet', 'Seçtiğiniz stilde sade vaziyet planı.'],
    ['yukseklik', 'Yükseklik', 'Binalar yüksekliğe göre renklendirilir.'],
    ['kat', 'Kat adedi', 'Yükseklikten hesaplanan yaklaşık kat sayısı (3,2 m kat yüksekliği varsayımı).'],
    ['taban', 'Taban alanı', 'Binalar taban alanı büyüklüğüne göre renklendirilir.'],
    ['islev', 'Bina işlevi', 'Konut, ticaret, eğitim gibi kullanım türleri; etiketlenmemiş binalar gri görünür.'],
    ['ulasim', 'Ulaşım', 'Yol kademelenmesi, yaya ağı, raylı sistem ve duraklar.'],
    ['arazi', 'Arazi kullanımı', 'Park, konut alanı, eğitim, tarım gibi alan kullanımları.'],
    ['gunes', 'Güneş yolu', 'Enleme göre gündönümü ve ekinoks güneş yörüngeleri.'],
    ['ruzgar', 'Rüzgar gülü', 'Geçen yılın günlük hakim rüzgar yönleri.']
  ];
  const EXPORTS = [
    ['svg', 'SVG', 'Illustrator'], ['pdf', 'PDF', 'ölçekli vektör'], ['png', 'PNG', '4000 px'], ['dxf', 'DXF', 'AutoCAD · Rhino'],
    ['obj', 'OBJ', '3B model'], ['glb', 'GLB', 'Blender · SketchUp'], ['stl', 'STL', '3B baskı'], ['geojson', 'GeoJSON', 'QGIS']
  ];

  App.kent = {
    K0: K0, SIZES: SIZES, RATIOS: RATIOS, SCALES: SCALES, LAYERS: LAYERS, MODES: MODES, EXPORTS: EXPORTS,
    of: function (state) { const k = state.ui.kent; return k ? k : K0; },
    dims: function (k) { return { w: k.size, h: Math.round(k.size * k.ratio) }; },
    // çalışma zamanı: motor, harita, veri, çıktı, 3B, kaydır/yakınlaştır
    rt: { eng: null, map: null, mapEl: null, modelEl: null, planEl: null, paperEl: null, data: null, metrics: null, site: null, svg: '', v3: null, dirty3d: true, seq: 0, pz: { k: 1, x: 0, y: 0, touched: false } }
  };
})();
