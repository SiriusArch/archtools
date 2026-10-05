# Modül 9 — Birim Oluşturucu

Bir yapı kütlesi (birim) parsel üzerinde kurulur; her yeni **adım** bir öncekinin kopyasıdır ve üzerinde istenen değişiklik yapılır (kütleyi böl, boşluk aç, yeşil ve ağaç ekle, yaya akışı / geçit / giriş oku çiz). Adımlar **süreç afişinde** aynı ölçekte yan yana görünür.

## Veri modeli — `project.unit`
```
{ v, title, site: {w, d}, ctxSeed, ctxDens, ctx: [{x,y,w,d,h}], snap, cur,
  steps: [ { id, title, sub, desc, els: [ el ] } ] }
el = mass  { t:'mass',  x, y, w, d, shape: rect|L|T|U, rot: 0..3, cut, floors, roof: plain|green }
   | void  { t:'void',  x, y, w, d }            avlu / oyuk / boşluk
   | green { t:'green', x, y, w, d, round }     peyzaj alanı
   | tree  { t:'tree',  x, y, r }
   | arrow { t:'arrow', k: flow|through|entry, x1, y1, x2, y2 }
```
Birim metredir; x doğu, y güney. Parsel `(0,0)–(site.w, site.d)`. Kat yüksekliği 3,2 m (`App.unit.FH`).

## Dosyalar
- `38-lib-unit.js` — model, öğe fabrikaları, doğrulama (`clean`), bölme, ölçüler (`metrics`: TAKS, KAKS, yeşil oranı…), hazır akışlar (6 adımlı “Yoğunluk + Boşluk”, 4 adımlı kısa akış), çevre dokusu üretimi (tohumlu).
- `39-lib-unitscene.js` — plan, izometrik ve süreç afişi sahneleri (ortak primitif listesi; SVG + PNG/PDF).
- `39-state-unit.js` — `UNIT_*` eylemleri (reducer eklentisi) ve `extensions.massBuilder` JSON uzantısı.
- `76-ui-unit.js` — sol panel (Birim · Adımlar · Bulgular) ve pafta etkileşimi (sürükle, tutamaç, kenar yapışması, döndürme).
- `77-ctl-unit.js` — görünüm durumu, canlı düzenleme, adım işlemleri, dışa aktarma.

## JSON — `extensions.massBuilder`
`{ version, unit:'m', title, site:{width,depth}, context:{seed,density,buildings[]}, snap, currentStep, steps:[{ title, subtitle, description, elements[], metrics }] }`. Kütleler çokgen halkası (`polygon`), yükseklik ve alanla yazılır; içe aktarmada öğeler doğrulanıp temizlenir.
