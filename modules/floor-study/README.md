# Modül 2 — Kat Etüdü

Modül 1'deki mekânları katlara dağıtır ve her kat için ölçekli blok plan üretir. Girdi: `project.spaces`, `project.relations`, `project.study`. Çıktı: `App.study.derive(project)` → `{ plan, metrics, findings }`.

| Dosya | Görev |
|---|---|
| 31-lib-floors | saf mantık: otomatik kat ataması, ortak plak, çekirdek, blok yerleşimi, skor, bulgular |
| 32-state-floors | reducer eklentisi (`App.state.hooks`), mekân listesi eşitleme, JSON uzantısı (`toExt` / `fromExt`) |
| 35-lib-floorscene | kat planları paftası (primitif sahne): canlı SVG ve PNG/PDF aynı listeden |
| 61-ui-floors | sol panel (kat kurgusu, katlara göre liste, bulgular) ve pafta (blok sürükleme) |
| 62-ctl-floors | kaydırıcı canlı güncelleme, taşıma, dışa aktarma, bulgu eylemleri |

## Algoritma
1. **Atama:** bölge ve anahtar kelimeden kat tercihi (0 zemin … 1 üst kat) → güçlü ilişkili komşuların tercihiyle yumuşatma → tercihe göre sırala → alan dengesine göre katlara böl. Merdiven / asansör gibi dikey dolaşım mekânları atanmaz; her katta ortak çekirdek olur.
2. **Plak:** tüm katlar aynı plağı kullanır; en-boy oranı kaydırıcıyla (1 : 1–3) bulunur, alan en dolu kata göre ikiye bölme (bisection) ile çözülür.
3. **Çekirdek:** plağın solunda tam derinlikte şerit; katlar arasında hizalı. Kullanılmayan kısım "boş / teras" bloğu olur.
4. **Yerleşim:** serbest (işlev şemasındaki x/y sırası korunarak şerit ve sütun dilimleme) veya orta koridorlu (1,5 m, çift yönlü).
5. **Skor:** ilişki memnuniyeti (güçlü 3, ayrı 2, zayıf 1) · kat dengesi · ıslak hacim düşey hizası.

## Eylemler (`App.ctl`)
`studyFloors(n)` · `studySet(patch)` · `studyLive(patch)` (kaydırıcı; tek geri-al noktası) · `studyAuto()` · `studyAssign(id, floorId)` · `studyMove(id, ±1)` · `studyRename(id, ad)`.

## JSON: `extensions.floorStudy`
`floors[{id,name}]`, `assignments[{spaceId,floorId}]`, `typology` (`serbest` | `koridor`), `plateRatio`, `core{auto,area}`, `plan{unit:"m", width, depth, plateArea, coreArea, floors[{id,name,netArea,voidArea,blocks[{id,kind,spaceId,name,zone,area,x,y,w,h}]}]}`, `metrics{floorStudyScore, floorBalance, fillRatio, wetStackAlignment, strongRelationsSameFloor, strongRelationsTotal}`. Plan ölçüleri metredir; blok `kind`: `space | core | corridor | void`.
