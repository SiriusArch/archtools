# Modül 10 — Vaziyet Planı

Ölçekli (1/200 · 1/500 · 1/1000 · 1/2000 · 1/5000) A3 yatay vaziyet paftası. Bağımlılıksız, `window.App` altında çalışır.

## Dosyalar
| Dosya | İçerik |
|---|---|
| `38-lib-plan.js` | `App.plan`: veri modeli, geometri (`plan.geo`), öğe fabrikaları (`plan.make`), temizleme, ölçüler (TAKS / KAKS / yeşil oranı), örnek vaziyet, `fromUnit`, `fromImar` |
| `39-lib-planscene.js` | `plan.scene(P.plan, {live})`: palet (sade / renkli), yol kenarlıkları, gölgeler, otopark taraması, ağaçlar, ölçek çubuğu, kuzey oku, lejant; pafta alanına kırpılmış grup |
| `39-state-plan.js` | Reducer eklentisi `PLAN_*` ve `extensions.sitePlan` sağlayıcı / içe aktarıcı |
| `78-ui-plan.js` | Sol panel (Çizim · Sayfa · Liste) ve pafta etkileşimi |
| `79-ctl-plan.js` | Görünüm, canlı düzenleme, içe alma, PNG / PDF / DXF |

## Veri modeli — `project.plan`
```json
{ "v": 1, "title": "", "scale": 1000, "cx": 0, "cy": 0, "style": "auto|sade|renkli", "snap": 1, "grid": false, "shadow": true, "labels": true,
  "els": [ { "id": "", "t": "bld|road|green|water|plaza|park|bound|tree|text", "pts": [[x, y]], "...": "türe özgü alanlar" } ] }
```
Koordinatlar metredir (x sağa, y aşağıya); `cx, cy` pafta merkezidir. Bina: `floors`, `k: yeni|mevcut`; yol: `w`, `k: arac|yaya`, `smooth`; yeşil: `k: cim|orman`, `smooth`; ağaç: `x, y, r`; yazı: `x, y, s, size`.

## JSON
`extensions.sitePlan` (`version`, `unit: "m"`, `scale`, `center`, `elements[]`, `metrics{}`) dışa aktarılır ve içe aktarmada geri yüklenir.

## DXF katmanları
`SINIR · YAPI_YENI · YAPI_MEVCUT · YOL · YAYA · YESIL · SU · MEYDAN · OTOPARK · AGAC · YAZI` — gerçek koordinat (m), y yukarı.

## Kısayollar
Enter: çizimi bitir · Esc: iptal / seçimi kaldır / Seç aracına dön · Backspace: son köşeyi sil · Delete: seçiliyi sil · Ok tuşları: taşı (Shift: 5×) · sağ tık / Alt+tık: köşe sil · tekerlek: ölçek.
