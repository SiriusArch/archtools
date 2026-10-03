# archtools — Mimari Tasarım Asistanı Platformu

Mimari yardımcı araçların toplandığı depo. Altı modül tek sitede, ortak proje verisiyle çalışır: bir modülde yaptığınız değişiklik diğerlerine otomatik yansır. İlk üçü bina içini, son üçü bina çevresini ve parseli ele alır.

| # | Modül | Ne yapar | Rota |
|---|---|---|---|
| 01 | **İşlev Şeması** (Bubble Diagram) | Mekân + m² ekle, ilişkileri kur, daireleri yerleştir, verimlilik skoru ve Akıllı Öneri | `#/islev` |
| 02 | **Kat Etüdü** | Mekânları katlara dağıt, ölçekli kat plan blokları üret, bloğu sürükleyerek kat değiştir, kat skoru | `#/kat` |
| 03 | **Mekân Analizi** | Patlatılmış izometrik simülasyon: katlar kipi ve analiz katmanları kipi, döndür / patlat / kat seç, uyum skoru | `#/analiz` |
| 04 | **Arsa Analizi** | Konum ara (OpenStreetMap), yürüme erişimi bantları, ulaşım, yeşil alan, işlev karışımı, gürültü göstergesi, iklim ve güneş; izometrik katman paftası; konum skoru | `#/arsa` |
| 05 | **İmar ve Kapasite** | Parsel çiz, TAKS / KAKS / yençok / çekme gir; yapılabilir zarf, kütle, kat sayısı, daire sayısı, otopark, gölge; senaryo karşılaştırma | `#/imar` |
| 06 | **Yer Seçimi** | Aday konumları aynı ölçütlerle sırala (ağırlık ve filtre) ya da çevreyi tarayıp en uygun noktaları ısı haritasında bul | `#/yer` |

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
modules/floor-study/src      Modül 2 — kat etüdü mantığı, state eklentisi, pafta sahnesi, arayüz, controller
modules/space-analysis/src   Modül 3 — izometrik motor, analiz, arayüz, controller
modules/site-analysis/src    Modül 4 · 5 · 6 — GIS / OSM kitaplığı, imar hesabı, yer seçimi, paftalar, dışa aktarma, arayüz, controller
platform/src                 Kabuk: ortak pafta çerçevesi, modül gezgini, kontroller, intro, rota, başlatma
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
    "siteSelection": { "candidates": [], "weights": {}, "filters": {}, "ranking": [] }
  }
}
```
`floorStudy` içe aktarılır (kat ataması ve ayarlar geri yüklenir); `spaceAnalysis` yalnızca okunur, içe aktarmada yeniden hesaplanır. `siteAnalysis` (konum, yarıçap, parsel), `zoning` (imar parametreleri ve senaryolar) ve `siteSelection` (adaylar, ağırlıklar, filtreler) içe aktarılır; skorlar ve sıralama yeniden hesaplanır. Parsel koordinatları konum merkezine göre metredir (x doğu, y kuzey). Yeni modül kendi uzantısını `App.extProviders.push(project => ({ anahtar: veri }))` ile ekler.

Ayrıntılar: `modules/bubble-diagram/README.md`, `modules/floor-study/README.md`, `modules/space-analysis/README.md`, `modules/site-analysis/README.md`.
