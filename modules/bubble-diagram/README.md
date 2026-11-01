# Bubble Diagram modülü

Bağımlılıksız saf JS; `window.App` altında ad alanlı modüller.

| Dosya | Görev |
|---|---|
| 00-core | util, mini sanal DOM, store |
| 10/11 | palet ve bilgi tabanı (11 yapı türü, kaynak etiketli) |
| 20–27 | saf mantık: geometri, skor, yerleşim, eşleştirme, analiz, asistan, pafta çizimi, dosya (JSON/PNG/PDF) |
| 30 | state, reducer (modüller `App.state.hooks` ile eylem ekler), geri/ileri al |
| 40–46 | ortak arayüz bileşenleri ve glass kabuğu |
| 47 | sonsuz çalışma alanı: yakınlaştır / kaydır / kıstır / kenarda otomatik kaydır (`App.ui.zoom`) |
| 50 | controller (ortak: dışa aktarma `ctl.exporters[modül]`, dosya, tema, klavye) |

Ortak çekirdek (00–27, 30, 40–50) bu klasördedir; diğer modüller ve kabuk `platform/src` ile kardeş klasörlerde durur. Derleme kökten: `python3 build.py`.

`20–27` arayüzden bağımsızdır; React'e taşınabilir.

## Sonsuz beyaz pencere (yakınlaştır / kaydır)
Tuval **pencerenin tamamını** kaplar (kenardan kenara) ve **kâğıt beyazıdır** (`App.PAL.sheet`; koyu modda da beyaz kalır, çünkü çizim açık kâğıda göre tasarlıdır; koyu modda paneller opaklaştırıldığı için okunur kalır). Gri "uzay boşluğu", kutu ve ekranda pafta çerçevesi / künye yoktur — canlı tuvalde yalnızca nokta ızgarası, ilişki çizgileri ve daireler çizilir; pafta levhası (çerçeve, künye, gösterge, skor) yalnızca PNG/PDF çıktısındadır. Sol panel, üst bar, kadran ve asistan beyaz pencerenin üstünde yüzen cam kartlardır. **Daireler beyaz pencerenin dışına çıkamaz**; pencerenin kendisi ise sonsuzdur: kullanıcı her yöne sınırsız kayabilir, uzaklaşıp boş alanları keşfedebilir. Her yerde nokta ızgarası vardır (uzaklaşınca seyrekleşir, yaklaşınca sıklaşır).

- **Durum:** `state.ui.view = null | { cx, cy, k }` — `null` pafta güvenli alana sığdırılmış varsayılan görünümdür; `k` sığdırmaya göre çarpandır (0,02 – 24; araç çubuğunda yüzde). `state.ui.vp = { w, h, sx, sy, sw, sh }` pencere boyutu ve **güvenli alan**dır (paneller arasında kalan boşluk, alttaki araç şeridi hariç); `ResizeObserver` ile ölçülür (`Z.measure`). Görünüm yalnızca arayüz durumudur: **projeye, JSON'a ve geri al yığınına yazılmaz**; `LOAD_PROJECT` görünümü sıfırlar.
- **Dönüşüm (çözümsel, DOM'a bağlı değil):** SVG pencere boyutundadır; bakılan dünya noktası `(cx, cy)` güvenli alanın merkezine oturur, ekran ölçeği `s = sfit · k` (`sfit` = pafta güvenli alana sığma ölçeği). `Z.viewBox(view, state)` viewBox'ı üretir, `Z.toWorld(clientX, clientY)` işaretçiyi dünyaya çevirir (daire sürükleme, kutu seçimi, otomatik kaydırma hep bunu kullanır). Çizgi tıklama genişliği `geo.clampHit(26 / s)`.
- **Pencere sınırı (sürükleme):** `42-ui-board.js` — `winBox / fitPoint / fitShift`. Sürüklenen dairenin (tek ya da grup, klavye ok tuşları dahil) merkezi `ui.zoom.visible()` (görünür beyaz pencere = güvenli alan) içinde, yarıçap + seçim halkası payıyla kalır; küçük dairenin altındaki etiket payı eklenir; pay pencerenin en çok %40'ıdır (çok yakınlaşınca daire takılıp kalmaz, merkez orta bantta gezer). Daire zaten pencere dışındaysa (ör. yakınlaştırınca) yakalandığında **zıplamaz**, yalnızca içeri doğru hareket eder. Pencere sonsuzdur: daire kenarda bekletilince `Z.edgePan` tuvali kaydırır, `ui.redrag` daireyi yeni pencere sınırına taşır (daire kenarda kalır, boş alana doğru ilerler). Sınır yalnızca sürüklemede/klavyede geçerlidir; durum düzeyinde (`MOVE`, JSON içe aktarma, otomatik yerleşim) koordinat serbesttir.
- **Sınır yok (dünya):** `geo.WORLD` = ±1 milyon birim (≈700 pafta eni; yalnızca kayan nokta hassasiyetini korur); `geo.clampWorld`, `geo.inSheet`, `geo.normView` (varsayılana çok yakın görünümü `null`'a çeker). JSON'da `x`/`y` bu dünya koordinatıdır (pafta 0…1400 × 0…990).
- **Girdiler (`47-ui-zoom.js`, `App.ui.zoom`):**
  - yakınlaştır/uzaklaştır: tekerlek (imlecin altındaki dünya noktası sabit), Ctrl + tekerlek / dokunmatik yüzey kıstırma, `+` / `−` (art arda basış hedefi biriktirir), araç çubuğu;
  - kaydır: orta tuş sürükle, **Boşluk + sürükle**, **El aracı**, ok tuşları (seçili grup yokken; Shift ×3), dokunmatikte iki parmak;
  - **kenara sürükleme:** daire (ya da seçim kutusu) güvenli alanın kenarına götürülünce tuval kendiliğinden kayar (`Z.edgePan`, ≤780 px/sn; daire pencere kenarında kalır ve onunla ilerler);
  - `0` ya da yüzde göstergesi: başlangıç görünümüne dön; "Tüm daireleri göster" bütün daireleri (ve başlangıç alanını) birlikte sığdırır;
  - geçişler 260 ms, log ölçekte; `prefers-reduced-motion` ile anında.
- **Yerleşim (CSS):** `.board-stage` `position: fixed; inset: 0` (tuval); `.board-slot` yerleşimde paneller arasındaki boşluğu ayırır ve yüzen araçları (`.gz-dock`, `.an-chip`, `.empty-card`) tutar; kartlar (`.gh`, `.sidebar`, `.gdial`, `.gdock`, `.assistant`, `.board-hint`) `z-index: 2` ile tuvalin üstündedir, aralarındaki boşluktaki tıklama tuvale gider. **Dar ekranda** (<1024 px) tuval sayfa akışında kenardan kenaradır; araç çubuğundaki **tam ekran** düğmesi (`ui.focus`, `.cv-focus`) tuvali pencerenin tamamı yapar (Esc ile çıkılır).
- **Seçim/odak:** listeden ya da ilişkiden bir daire seçildiğinde (`SELECT`, `HIGHLIGHT`) görünüm dışındaysa görünüme kayar; "N daire görünüm dışında" düğmesi.
- **Dışa aktarma:** `board.exportBox(project, k)` daireler pafta dışındaysa tuvali onları kapsayacak şekilde genişletir (+48 gölge payı; hepsi paftadaysa çıktı **değişmez**: PNG 2800×1980); piksel üst sınırı `min(…, 5000/max(w,h), √(16e6/(w·h)))` (çok uzak daire varsa çıktı küçülür); PDF sayfa oranı görüntüye uyar.
- **Yerleşim algoritması:** "Otomatik yerleştir" bütün daireleri paftaya toplar ve görünümü `null` yapar; mekân eklerken toplu yerleşim paftanın dışındaki daireleri yerinde bırakır (`autoLayout` `opts.fixed`), yeni mekân görünen alanın ortasına (`freeSpot(…, center)`) yerleşir.

## JSON şeması
```json
{
  "schema": "mimari-asistan.bubble-diagram", "version": 1,
  "meta": { "name": "", "buildingType": "konut", "variant": "2+1", "createdAt": "ISO", "updatedAt": "ISO" },
  "world": { "width": 1400, "height": 990, "unit": "px", "scalePxPerSqrtM2": 31.467 },
  "spaces": [ { "id": "", "name": "Salon", "area": 23, "zone": "sosyal", "x": 0, "y": 0 } ],
  "relations": [ { "a": "<id>", "b": "<id>", "type": "strong | weak | avoid" } ],
  "metrics": { "efficiencyScore": 94, "totalArea": 69.5, "circulationShare": 0.065 },
  "platform": "archtools",
  "extensions": { "floorStudy": {}, "spaceAnalysis": {} }
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
