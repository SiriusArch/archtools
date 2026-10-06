İki kip: **Mekânlar** (varsayılan; mekân ağırlıklı serbest düzen) ve **Kat blokları** (mekânlar katlara dağıtılır, aşağıda anlatılır).

## Mekânlar kipi
- Her mekân ayrı bir birimdir: `project.study.free = { v: 2, snap, shapes: { [mekânId]: { x, y, w, h, shape, rot, cut, seed, lv, nf, roof, furn[] } }, extras[], site, ctx, map, org, link, steps[], kat }`. `shape` 32 değerden biridir (`App.study.SHAPES`, gruplar `SHAPE_GROUPS`): temel, bileşik (L / T / U / Z / artı), eğrisel (daire, elips, yarım daire, kemer) ve **organik** (bulut, yaprak, damla, çakıl, kıvrım; `seed` ile biçim değişir).
- **Donatı** (`furn[]`, `36-lib-furn.js`): mekânın içine yerleşen mobilya / tesisat / bitki sembolleri; mekânla birlikte taşınır ve döner.
- **Kat isteğe bağlıdır:** `lv` (kat numarası) boşsa mekân tek başına çalışır; kat verilirse plan kat süzgeci, izometrik ve süreç görünümleri o katı kullanır. Eski `project.study` (kat blokları) `lv` değerlerinden türetilir.
- **Çevre:** harita altlığı (OpenStreetMap, HERE, Yandex; `platform/src/28-lib-basemap.js`, `48-ui-basemap.js`), parsel / bağlam ve **Vaziyet bağlantısı** — Vaziyet Planı'ndaki bir bina seçilip *İçini Mekân Etüdü'nde aç* denir; bina kabuğu etüdün çevresi olur, çevre öğeleri hep görünür (`freeLinkEl`, `plan.fromStudy`).
- **Süreç:** her adım bir öncekinin kopyasıdır; plan, izometrik ve tüm adımlar yan yana (süreç afişi). TAKS / KAKS / yeşil oranı hesaplanır.
- Dosyalar: 35-lib-freescene · 36-lib-free · 36-lib-furn · 37-state-free · 38-lib-mass · 39-lib-massscene · 63-ui-free · 65-ui-freeboard · 66-ctl-free.
- JSON: `extensions.spaceStudy` (sürüm 2: mekânlar, şekiller, donatı, ilişki durumları, skor).

## Kat blokları kipi
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

## Plan alternatifleri ve DXF
- **Plan alternatifleri:** aynı kat atamasıyla altı seçenek (Serbest 1 : 1,2 · 1,5 · 2,2 ve Orta koridor 1 : 1,5 · 2 · 2,6) küçük resim, kat skoru, plak ölçüsü ve dar mekân sayısıyla gösterilir; en iyi seçenek işaretlenir, tıklayınca uygulanır (`App.study.alternatives`).
- **DXF:** araç çubuğundaki **DXF** düğmesi katları yan yana, işlev bölgesine göre katmanlara ayrılmış (`MEKAN_*`, `CEKIRDEK`, `PLAK`, `YAZI`) ve metre birimli olarak yazar (`App.dxf`).
