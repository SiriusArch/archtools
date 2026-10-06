# archtools — Mimari Tasarım Asistanı Platformu

Mimari yardımcı araçların toplandığı depo. On iki modül tek sitede, ortak proje verisiyle çalışır: bir modülde yaptığınız değişiklik diğerlerine otomatik yansır. İlk üçü bina içini, sonraki üçü bina çevresini ve parseli, sonraki ikisi tasarım üretimini ve maliyeti, sonraki üçü kütle şekillendirme, ölçekli vaziyet ve kolaj çizimini, sonuncusu bütün bu çıktıları tek paftada toplamayı ele alır.

| # | Modül | Ne yapar | Rota |
|---|---|---|---|
| 01 | **İşlev Şeması** (Bubble Diagram) | Mekân + m² ekle, ilişkileri kur, daireleri yerleştir, verimlilik skoru ve Akıllı Öneri | `#/islev` |
| 02 | **Mekân Etüdü** | Serbest düzen: her mekân kendi şekli (dikdörtgen / L / T / U), boyutu ve konumuyla ölçekli birim; sürükle, tutamaçla boyutlandır, kenarlara yapış, mekânlar arası ilişki (bitişik / yakın / uzak / çakışık) canlı. Kat kipi: mekânları katlara dağıt, ölçekli kat blokları, kat skoru | `#/kat` |
| 03 | **Mekân Analizi** | Patlatılmış izometrik simülasyon: katlar (üst üste), mekânlar (yan yana, serbest düzendeki şekillerle) ve analiz katmanları kipleri, döndür / patlat / seç, uyum skoru | `#/analiz` |
| 04 | **Arsa Analizi** | Konum ara (OpenStreetMap ya da kendi anahtarınızla HERE; HERE 3B görünüm), yürüme erişimi bantları, ulaşım, yeşil alan, işlev karışımı, gürültü göstergesi, iklim ve güneş; izometrik katman paftası; konum skoru | `#/arsa` |
| 05 | **İmar ve Kapasite** | Parsel çiz, TAKS / KAKS / yençok / çekme gir; yapılabilir zarf, kütle, kat sayısı, daire sayısı, otopark, gölge; senaryo karşılaştırma | `#/imar` |
| 06 | **Yer Seçimi** | Aday konumları aynı ölçütlerle sırala (ağırlık ve filtre) ya da çevreyi tarayıp en uygun noktaları ısı haritasında bul | `#/yer` |
| 07 | **Tasarım Üretici** | İmar ve parselden kütle, tipik kat planı (daire karması slider'larıyla), bodrum otopark, alternatif karşılaştırma; DXF · IFC4 · Excel · GeoJSON · KML | `#/tasarim` |
| 08 | **Maliyet ve Fizibilite** | Seçili tasarımdan metraj, maliyet, gelir, nakit akışı, kâr, başabaş ve artık arsa değeri, duyarlılık; canlı formüllü Excel | `#/fizibilite` |
| 09 | **Birim Oluşturucu** | Parsel üzerinde bir yapı kütlesi kur (dikdörtgen / L / T / U, kat sayısı), her adımı bir öncekinin kopyası olarak şekillendir (böl, boşluk aç, yeşil ve ağaç ekle, yaya akışı / geçit / giriş okları); plan, izometrik ve tüm adımları yan yana gösteren **süreç afişi**; TAKS / KAKS / yeşil oranı; PNG · PDF | `#/birim` |
| 10 | **Vaziyet Planı** | 1/200 – 1/5000 ölçekli A3 vaziyet paftası: sürükleyerek / köşe tıklayarak yeni ve mevcut yapı, taşıt ve yaya yolu, yeşil alan, su, meydan, otopark, proje sınırı, ağaç ve yazı çiz; köşe tutamaçları, kaydır, tekerlekle ölçek, komşu köşeye yapışma; gölge, kat etiketi, ölçek çubuğu, kuzey oku, lejant; TAKS / KAKS / yeşil oranı; örnek mahalle, Birim Oluşturucu ve İmar parselinden içe alma; PNG · PDF · DXF | `#/vaziyet` |
| 11 | **Kolaj Oluşturucu** | Sunum kolajı: fotoğraf yükle (siyah-beyaz, kontrast / parlaklık, elips / kemer maskesi), tek vurgu renkli kütleler (dörtgen, elips, üçgen, kemer, serbest çokgen; çarpma karışımı), beyaz siluetler (insan, ağaç, kuş, siluet), elle çizilmiş çizgi / ok, etiketler; sürükle, boyutlandır, döndür, katman sırası, kilitle / gizle; sürükle-bırak ve yapıştırma; A3 / kare / 16:9; PNG · PDF; görselleri de içeren JSON | `#/kolaj` |
| 12 | **Pafta Şablonu** | A3 – A0 jüri paftası düzenleyici: 7 hazır şablon (jüri paftası, dikey afiş, ızgara, kolaj + vaziyet, süreç şeridi, tek görsel, boş); diğer araçların çıktıları (vaziyet, kolaj, işlev şeması, birim, kat etüdü, mekân analizi, arsa, imar, tasarım, fizibilite — 20 çıktı) **canlı bağlı** panel olarak yerleşir; yüklenen görseller, metin, künye, lejant, otomatik veri satırları (parsel, TAKS, KAKS, kat, daire, maliyet), renk bloğu, çizgi, kuzey oku; sürükle, boyutlandır, kenar / orta / kenar boşluğuna yaslanma kılavuzları, hizala, katman sırası, kilitle / gizle, geri al; PNG · PDF · JSON | `#/pafta` |

Arsa Analizi'nde 15 dakikalık şehir karnesi, kural tabanlı **Sor** kutusu ve işlev yoğunluğu katmanı; Mekân Etüdü'nün kat kipinde plan alternatifleri galerisi, her iki kipte DXF çıktısı vardır. Üst çubuktaki **Rapor** düğmesi, verisi olan tüm modüllerin paftalarını kapak, içindekiler ve yöntem/kaynaklar sayfasıyla tek çok sayfalı PDF'te toplar.

Siteye girişte marka simgesi ve "archtools" adının yumuşakça belirdiği kısa bir açılış oynar (oturum başına bir kez; `?intro=1` ile zorlanır, `?intro=0` ile kapanır; **Geç** ile atlanır).

İlk açılışta kısa bir karşılama sorar (çalışma alanı ve ilk hedef); yanıt yalnızca tarayıcıda saklanır, varsayılan programı ve açılan modülü seçer. Başlıktaki **Rehber** düğmesiyle yeniden açılır; `?welcome=0` kapatır, `?welcome=1` zorlar.

Varsayılan görünüm minimal, buzlu cam ve tek renksiz. **Beni renklendir!** düğmesi tüm modülleri Retro-Bauhaus temasına geçirir (**Sadeleştir** geri döner). Tercih tarayıcıda saklanır, `?style=bauhaus` ile de açılabilir.

## Derleme
```
python3 build.py     # modül kaynaklarını birleştirip kökteki index.html'i üretir
```
`index.html` depo kökündedir; Vercel'de ayar gerekmez (Framework: Other, build komutu boş, çıktı klasörü `.`).

## Klasör yapısı
```
modules/bubble-diagram/src   Modül 1 + ortak çekirdek (core, palet, bilgi tabanı, geometri, skor, pafta, dosya, state)
modules/floor-study/src      Modül 2 — mekân etüdü (serbest düzen + kat kipi) mantığı, state eklentisi, pafta sahnesi, arayüz, controller
modules/space-analysis/src   Modül 3 — izometrik motor, analiz, arayüz, controller
modules/site-analysis/src    Modül 4 · 5 · 6 — GIS / OSM / HERE kitaplığı, imar hesabı, yer seçimi, paftalar, dışa aktarma, arayüz, controller
modules/building-design/src  Modül 7 · 8 — tasarım motoru, maliyet motoru, IFC yazıcısı, paftalar, arayüz, controller, proje raporu
modules/mass-builder/src     Modül 9 — birim oluşturucu: veri modeli, plan / izometrik / süreç paftası, adım ve öğe eylemleri, arayüz, controller
modules/site-plan/src        Modül 10 — vaziyet planı: ölçekli veri modeli, pafta sahnesi, çizim araçları, içe alma, PNG / PDF / DXF
modules/collage/src          Modül 11 — kolaj oluşturucu: katman modeli, figür kitaplığı, görsel deposu (IndexedDB), sahne, araçlar, PNG / PDF
modules/board-template/src   Modül 12 — pafta şablonu: panel modeli, hazır şablonlar, araç çıktısı kaynakları (canlı bağlı), sahne, arayüz, PNG / PDF
platform/src                 Kabuk: ortak pafta çerçevesi, DXF / XLSX / PDF yazıcıları, modül gezgini, kontroller, intro, rota, başlatma
```
JS dosyaları klasörden bağımsız olarak **dosya adındaki sayı önekine** göre birleşir: 00–27 çekirdek ve ortak mantık · 28–29 ortak pafta · 30 state · 31–39 modül mantığı · 40–49 ortak arayüz · 50–59 controller (Modül 1) · 60–79 modül arayüzleri ve controller'ları · 90–99 kabuk ve başlatma. Yeni modül eklemek için `modules/<ad>/src` klasörünü `build.py` içindeki `SRC_DIRS` listesine ekleyin.

## Ortak veri ve JSON
Tüm modüller tek proje nesnesini paylaşır: `project = { meta, spaces[], relations{}, study }`. Kat etüdü ayarları `project.study` içinde durur; böylece geri al / ileri al, otomatik kayıt ve JSON içe/dışa aktarma her modülde aynı çalışır.

Dosya şeması `mimari-asistan.bubble-diagram` v1'dir; `platform: "archtools"` alanı ve modül verileri için `extensions` eklenmiştir:

```json
{
  "schema": "mimari-asistan.bubble-diagram", "version": 1, "platform": "archtools",
  "meta": {}, "world": {}, "spaces": [], "relations": [], "metrics": {},
  "extensions": {
    "floorStudy":    { "floors": [], "assignments": [], "typology": "serbest", "plateRatio": 1.5, "core": {}, "plan": { "unit": "m", "floors": [] }, "metrics": {} },
    "spaceAnalysis": { "harmonyScore": 72, "parts": [], "stats": {}, "perFloor": [], "noise": [], "findings": [] },
    "siteAnalysis":  { "location": {}, "radiusM": 500, "walkMinutes": 10, "template": "konut", "score": 78, "parts": [], "findings": [], "parcel": [] },
    "zoning":        { "parameters": {}, "result": {}, "scenarios": [] },
    "siteSelection": { "candidates": [], "weights": {}, "filters": {}, "ranking": [] },
    "design":        { "version": 1, "parameters": {}, "selected": "", "result": {}, "alternatives": [] },
    "feasibility":   { "assumptions": {}, "result": {} },
    "massBuilder":   { "version": 1, "unit": "m", "site": {}, "context": {}, "steps": [ { "title": "", "elements": [], "metrics": {} } ] },
    "sitePlan":      { "version": 1, "unit": "m", "scale": 1000, "center": [0, 0], "elements": [ { "type": "bld", "points": [], "floors": 4, "kind": "yeni" } ], "metrics": {} },
    "collage":       { "version": 1, "size": "a3l", "background": "white", "accent": "#D93A1F", "layers": [], "images": {} },
    "boardTemplate": { "version": 1, "size": "a1l", "background": "white", "accent": "#D93A1F", "margin": 72, "gutter": 29, "panels": [ { "type": "view", "src": { "k": "mod", "id": "vaziyet" }, "x": 0, "y": 0, "w": 0, "h": 0 } ], "images": {} }
  }
}
```
`floorStudy` içe aktarılır (kat ataması ve ayarlar geri yüklenir); `spaceAnalysis` yalnızca okunur, içe aktarmada yeniden hesaplanır. `siteAnalysis` (konum, yarıçap, parsel), `zoning` (imar parametreleri ve senaryolar) ve `siteSelection` (adaylar, ağırlıklar, filtreler) içe aktarılır; skorlar ve sıralama yeniden hesaplanır. Parsel koordinatları konum merkezine göre metredir (x doğu, y kuzey). `design.parameters` ve `feasibility.assumptions` içe aktarılır; sonuçlar yeniden hesaplanır. HERE API anahtarı hiçbir zaman JSON'a, paylaşım bağlantısına ya da dışa aktarmaya girmez (yalnızca tarayıcıda `localStorage`). Yeni modül kendi uzantısını `App.extProviders.push(project => ({ anahtar: veri }))` ile ekler.

Ayrıntılar: `modules/bubble-diagram/README.md`, `modules/floor-study/README.md`, `modules/space-analysis/README.md`, `modules/site-analysis/README.md`, `modules/building-design/README.md`.
