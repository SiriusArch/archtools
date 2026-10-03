# archtools — Mimari Tasarım Asistanı Platformu

Mimari yardımcı araçların toplandığı depo. Üç modül tek sitede, ortak proje verisiyle çalışır: bir modülde yaptığınız değişiklik diğerlerine otomatik yansır.

| # | Modül | Ne yapar | Rota |
|---|---|---|---|
| 01 | **İşlev Şeması** (Bubble Diagram) | Mekân + m² ekle, ilişkileri kur, daireleri yerleştir, verimlilik skoru ve Akıllı Öneri | `#/islev` |
| 02 | **Kat Etüdü** | Mekânları katlara dağıt, ölçekli kat plan blokları üret, bloğu sürükleyerek kat değiştir, kat skoru | `#/kat` |
| 03 | **Mekân Analizi** | Patlatılmış izometrik simülasyon: katlar kipi ve analiz katmanları kipi, döndür / patlat / kat seç, uyum skoru | `#/analiz` |

Siteye girişte marka simgesi ve "archtools" adının yumuşakça belirdiği kısa bir açılış oynar (oturum başına bir kez; `?intro=1` ile zorlanır, `?intro=0` ile kapanır; **Geç** ile atlanır).

Varsayılan görünüm minimal, buzlu cam ve tek renksiz. **Beni renklendir!** düğmesi her üç modülü Retro-Bauhaus temasına geçirir (**Sadeleştir** geri döner). Tercih tarayıcıda saklanır, `?style=bauhaus` ile de açılabilir.

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
    "spaceAnalysis": { "harmonyScore": 72, "parts": [], "stats": {}, "perFloor": [], "noise": [], "findings": [] }
  }
}
```
`floorStudy` içe aktarılır (kat ataması ve ayarlar geri yüklenir); `spaceAnalysis` yalnızca okunur, içe aktarmada yeniden hesaplanır. Yeni modül kendi uzantısını `App.extProviders.push(project => ({ anahtar: veri }))` ile ekler.

Ayrıntılar: `modules/bubble-diagram/README.md`, `modules/floor-study/README.md`, `modules/space-analysis/README.md`.
