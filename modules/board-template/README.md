# Modül 12 — Pafta Şablonu

Diğer araçlarda yaptıklarınızı tek bir jüri paftasında toplayan, her şeyi serbestçe yerleştirilebilen şablon düzenleyici.

## Kavramlar
- **Pafta** (`project.tpl`): boyut (A3 yatay/dikey, A2, A1 yatay/dikey, A0 yatay/dikey), zemin, vurgu rengi, kenar boşluğu, panel aralığı ve **panel** listesi. Listenin sonundaki panel en öndedir.
- **Panel türleri**: `view` (araç çıktısı ya da yüklenen görsel), `text`, `title` (künye), `legend`, `facts` (otomatik veri satırları), `block`, `line`, `north`.
- **Araç çıktısı kaynakları** (`App.tpl.SOURCES`): vaziyet, kolaj, işlev şeması, birim (plan/izometrik/süreç), kat etüdü, mekân analizi, arsa, imar (plan/izometrik), tasarım (5), fizibilite (4). Çıktılar **canlı bağlıdır**; JSON'a yalnızca bağlantı (`{k:'mod', id}`) yazılır, görüntü proje verisinden yeniden üretilir.
- **Şablonlar** (`App.tpl.TEMPLATES`): her şablon `build(ctx)` ile panel listesi üretir; boş görsel alanlarına verisi olan çıktılar tercih sırasıyla (`SRC_PREF`) yerleşir.

## Dosyalar
| Dosya | İçerik |
|---|---|
| `38-lib-tpl.js` | veri modeli, `make.*`, `clean/cleanDoc`, şablonlar, `facts` |
| `39-lib-tplsrc.js` | kaynak kayıt defteri, kullanılabilirlik, rasterleştirme kuyruğu ve önbellek (`want / ensure`) |
| `39-lib-tplscene.js` | panel → primitif dönüşümü (`T.scene`) |
| `39-state-tpl.js` | `TPL_*` eylemleri, `extensions.boardTemplate` |
| `82-ui-tpl.js` | yan panel (Şablon · Ekle · Panel) ve pafta etkileşimi (taşı, boyutlandır, yaslanma) |
| `83-ctl-tpl.js` | yan etkiler, görsel yükleme, PNG / PDF dışa aktarma |

## Yeni bir araç çıktısı eklemek
`App.tpl.SOURCES` listesine `{ id, label, mod, framed }` ekleyin ve `39-lib-tplsrc.js` içindeki `MAKERS` tablosuna `{ ok(ctx), make(state) }` yazın: `make`, bir sahne (`{ prims, W, H }`) ya da tuval (Promise) döndürmelidir.
