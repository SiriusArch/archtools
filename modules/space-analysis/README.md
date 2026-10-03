# Modül 3 — Mekân Analizi

Kat etüdünün planını patlatılmış izometrik olarak gösterir ve analiz eder. Girdi: `App.study.derive(project)`. Çıktı: `App.analysis.analyze(project, derived)` ve `App.analysis.scene(project, derived, view, live)`.

| Dosya | Görev |
|---|---|
| 33-lib-iso | izdüşüm motoru: yaw / pitch, prizma, düzleme oturan yazı, bezier ok |
| 34-lib-analysis | analiz (gün ışığı, ıslak hacim hizası, gürültü, dolaşım, doluluk), sahne üretimi, JSON uzantısı |
| 71-ui-analysis | sol panel (görünüm, kat / katman seçimi, ölçüler, bulgular) ve pafta (döndürme, seçim) |
| 72-ctl-analysis | görünüm durumu (`state.ui.an`, tarayıcıda hatırlanır), animasyonlar, dışa aktarma |

## Kipler
- **Katlar:** her kat bir levha; işlev renkli hacimler, köşe kılavuzları, düşey dolaşım çizgisi, kat arası güçlü bağ okları, sağda kat göstergesi. Kata tıklayınca diğerleri soluklaşır.
- **Katmanlar:** seçili katın taban, işlev, sirkülasyon, doluluk, ilişki, gürültü katmanları üst üste açılır; solda başlık ve gösterge.
Kipler arası geçişte levhalar toplanır, yeni küme açılır (azaltılmış harekette anında).

## Görünüm durumu
`{ mode, explode (0–1), yaw (−85…85°), pitch (12…75°), labels, arrows, guides, volume, floorId, sel, layers[] }`. Sürükle = döndür; ok tuşları döndürür, `+` / `−` patlatmayı değiştirir. Metin düzleme oturur; |yaw| < 90° olduğu sürece her dönüşte okunur kalır.

## Uyum skoru
Islak hacim hizası %30 + gün ışığı (dış cepheye açılan yaşama mekânı oranı) %30 + gürültü uyumu %20 + plak doluluğu %20.

## JSON: `extensions.spaceAnalysis` (salt okunur)
`harmonyScore`, `parts[{name,value,weight}]`, `stats{daylight, circulationShare, wetStackAlignment, noiseConflicts, fillRatio}`, `perFloor[{floorId,name,totalArea,zones[]}]`, `noise[{spaceId,class}]`, `findings[{id,level,title}]`.
