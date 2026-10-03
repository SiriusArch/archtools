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

## Tasarım belirteçleri (Retro-Bauhaus)
Açık: bg `#E7D9B8`, surface `#F5ECD5`, ink `#261D11`, blue `#00427A`, yellow `#EAAE1B`, red `#C03A22`, green `#3A8040`. Koyu tema `styles.css` içinde. Yazı tipleri: Chakra Petch, Jost, DM Mono.
