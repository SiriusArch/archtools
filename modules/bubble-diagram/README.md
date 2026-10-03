# Bubble Diagram modülü

Bağımlılıksız saf JS; `window.App` altında ad alanlı modüller.

| Dosya | Görev |
|---|---|
| 00-core | util, mini sanal DOM, store |
| 10/11 | palet ve bilgi tabanı (11 yapı türü, kaynak etiketli) |
| 20–27 | saf mantık: geometri, skor, yerleşim, eşleştirme, analiz, asistan, pafta çizimi, dosya (JSON/PNG/PDF) |
| 30 | state, reducer, geri/ileri al |
| 40–44 | arayüz bileşenleri |
| 50, 99 | controller ve başlatma |

`20–27` arayüzden bağımsızdır; React'e taşınabilir.

## JSON şeması
```json
{
  "schema": "mimari-asistan.bubble-diagram", "version": 1,
  "meta": { "name": "", "buildingType": "konut", "variant": "2+1", "createdAt": "ISO", "updatedAt": "ISO" },
  "world": { "width": 1400, "height": 990, "unit": "px", "scalePxPerSqrtM2": 31.467 },
  "spaces": [ { "id": "", "name": "Salon", "area": 23, "zone": "sosyal", "x": 0, "y": 0 } ],
  "relations": [ { "a": "<id>", "b": "<id>", "type": "strong | weak | avoid" } ],
  "metrics": { "efficiencyScore": 94, "totalArea": 69.5, "circulationShare": 0.065 }
}
```

## Temalar
`App.THEMES` (`src/10-data-palette.js`) iki tema tanımlar: `glass` (varsayılan) ve `bauhaus`. `App.theme.set(ad)` palet, bölge renkleri ve yazı tiplerini yerinde günceller; pafta çizimi ve PNG/PDF çıktısı etkin temayı kullanır.

| Dosya | Görev |
|---|---|
| `styles.shared.css` | ortak kurallar, geçiş animasyonu (View Transitions + daire açılışı) |
| `styles.glass.css` | minimal / buzlu cam arayüz |
| `styles.bauhaus.css` | renkli Retro-Bauhaus arayüz |
| `46-ui-glass.js` | glass kabuğu: kapsül üst bar, kadran, araç çubuğu, tema anahtarı |

Tema CSS dosyalarına önek yazılmaz; `build.py` her kuralı `html[data-style="glass"]` veya `html[data-style="bauhaus"]` altına alır.

## Tasarım belirteçleri
**Glass:** gri tonlar. bg `#E4E5E9`, cam `rgba(255,255,255,.55)`, ink `#17181B`, ikincil `#686B73`; kabartma ve gömme gölgeler. Yazı tipleri: Unbounded (başlık, sayı), Manrope (metin). Renk yalnızca "Beni renklendir!" düğmesindeki üç noktadadır.

**Bauhaus:** bg `#E7D9B8`, surface `#F5ECD5`, ink `#261D11`, blue `#00427A`, yellow `#EAAE1B`, red `#C03A22`, green `#3A8040`. Yazı tipleri: Chakra Petch, Jost, DM Mono. Kalın 3px kenarlıklar, sert ofset gölgeler.

Koyu mod her iki temada `prefers-color-scheme` ile gelir; pafta her zaman açık renkli levhadır.
