# Modül 7 · 8 — Tasarım Üretici, Maliyet ve Fizibilite

Modül 5'in imar sonucundan (parsel, TAKS/KAKS/yençok/çekmeler) bir bina kütlesi, tipik kat planı ve bodrum otoparkı üretir; seçilen alternatiften metraj, maliyet, gelir ve nakit akışı çıkarır. Her şey ön çalışma düzeyindedir: uygulama projesi, ruhsat ya da yatırım tavsiyesi değildir.

## Dosyalar (`src/`)
| Dosya | İş |
|---|---|
| `37-lib-ifc.js` | IFC4 yazıcısı (`App.ifc.build`): kat, duvar, mekân, kolon, döşeme |
| `38-lib-a-design.js` | Tasarım motoru (`App.design`): kütle alternatifleri, daire karması, plan, otopark, skor |
| `38-lib-b-cost.js` | Maliyet motoru (`App.cost`): metraj, maliyet, gelir, nakit, duyarlılık, Excel çalışma kitabı |
| `39-lib-c-dsnscene.js` · `39-lib-i-fizscene.js` | Primitif paftalar (vaziyet, tipik kat, bodrum, kütle, karşılaştırma · özet, nakit, duyarlılık, metraj) |
| `39-state-design.js` | `project.design`, `project.fiz`, reducer kancaları, bellekli `App.dsnCtx` / `App.fizCtx`, JSON uzantıları |
| `70-ui-design.js` · `71-ctl-design.js` | Tasarım arayüzü ve dışa aktarma |
| `72-ui-fiz.js` · `73-ctl-fiz.js` | Fizibilite arayüzü ve dışa aktarma |
| `75-ctl-report.js` | Proje raporu: tüm modüllerden çok sayfalı PDF (`App.pdf`, platform) |

## Durum ve JSON
`project.design = { mix, areas, sel, … }` ve `project.fiz = { land, sales, soft, finance, … }`; geri al / ileri al `SNAPSHOT` ile çalışır, sürükleme `*_LIVE` eylemleriyle geçmişsizdir. JSON: `extensions.design` (`parameters` içe aktarılır; `result`, `alternatives` salt okunur) ve `extensions.feasibility` (`assumptions` içe aktarılır).

## Dışa aktarma
Tasarım: PNG · PDF · SVG · DXF (`App.dxf`, R2000, katmanlı, metre) · IFC4 · Excel · GeoJSON · KML. Fizibilite: Excel (6 sayfa, **canlı formüllü**: Varsayımlar sayfası değişince yeniden hesaplanır) · CSV · PNG · PDF · SVG.

## Sınırlar
- Varsayılan birim maliyetler, satış fiyatları ve dolaylı gider oranları **ÖRNEKtir**; her yerde ÖRNEK etiketi taşır. Kendi değerlerinizi girin.
- Tasarım motoru kural tabanlıdır; hedef daire karmasına yaklaşır ama her parselde tam tutturamaz. Statik, MEP, yangın ve erişilebilirlik kontrolleri kapsam dışıdır.
- IFC, DXF ve Excel çıktıları yapı denetimi ve LibreOffice ile doğrulandı; Revit/ArchiCAD/AutoCAD/Excel'de açılış denenmedi.
- Excel'deki başabaş ve artık arsa hücreleri dışa aktarım anındaki finansman duyarlılığına göre doğrusallaştırılmıştır; faiz, süre ya da özkaynak değişirse uygulamadan yeniden dışa aktarın.
