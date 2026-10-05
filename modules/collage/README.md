# Modül 11 — Kolaj Oluşturucu

Siyah-beyaz fotoğraf + tek vurgu renkli kütleler + beyaz siluetler + elle çizilmiş çizgiler + etiketlerle sunum kolajı. Bağımlılıksız, `window.App` altında çalışır.

## Dosyalar
| Dosya | İçerik |
|---|---|
| `38-lib-collage.js` | `App.collage`: katman modeli ve fabrikaları, temizleme, figür kitaplığı (`C.FIGS`), serbest çizgi yumuşatma / elle çizilmiş çizgi, görsel deposu (bellek + IndexedDB), siyah-beyaz işleme, üretilmiş örnek fotoğraflar, örnek kolaj |
| `39-lib-collagescene.js` | `C.scene(doc)` → `{prims, W, H}`; katmanlar alttan üste primitiflere çevrilir (`img`, `blend` primitifleri pafta kitaplığında) |
| `39-state-collage.js` | Reducer eklentisi `COL_*` ve `extensions.collage` sağlayıcı / içe aktarıcı |
| `80-ui-collage.js` | Sol panel (Ekle · Katman · Sayfa) ve pafta etkileşimi (seç, taşı, boyutlandır, döndür, çiz) |
| `81-ctl-collage.js` | Görünüm, dosya ekleme, PNG / PDF |

## Veri modeli — `project.collage`
```json
{ "v": 1, "title": "", "size": "a3l|a3p|sq|wide", "bg": "white|paper|grey|ink|accent", "accent": "#D93A1F",
  "layers": [ { "id": "", "t": "photo|shape|fig|line|text", "name": "", "hidden": false, "locked": false } ] }
```
Katman türleri: `photo` (src, x, y, w, h, zoom, ox, oy, bw, con, bri, op, mask, flip) · `shape` (kind, x, y, w, h, rot, col, op, blend, np) · `fig` (kind, x, y, w, rot, flip, col, op) · `line` (kind free|line|arrow, pts, col, w, dash, op, hand) · `text` (s, x, y, size, col, bg, fam, caps, rot, weight). Koordinatlar tuval pikselidir (A3 yatay 1400 × 990).

## Görseller
Fotoğraflar katmanlarda yalnızca kimlikle (`src`) anılır; veriler `App.collage.imgs` içindedir ve tarayıcının IndexedDB'sinde (`archtools-collage`) saklanır. Otomatik kayda (localStorage) yazılmaz; böylece depolama kotası aşılmaz. JSON dışa aktarmada `extensions.collage.images` olarak gömülür ve içe aktarmada geri yüklenir. Yüklenen fotoğraf en uzun kenarı 1800 px'e indirilip JPEG'e çevrilir.

## Kısayollar
Enter: çokgeni bitir · Esc: iptal / seçimi kaldır / Seç aracına dön · Delete: sil · ok tuşları: taşı (Shift: 10×) · Shift: eksen kilidi (taşıma, çizgi) ve 15° döndürme · Ctrl+V: panodaki görüntüyü ekle.
