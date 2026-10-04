# Modül 4 · 5 · 6 — Arsa Analizi, İmar ve Kapasite, Yer Seçimi

Bina çevresini ve parseli ele alan üç modül. Ortak bir konum / veri katmanını paylaşırlar ve her biri kendi sekmesinde, kendi paftasıyla çalışır.

| Modül | Rota | Girdi | Çıktı |
|---|---|---|---|
| 04 Arsa Analizi | `#/arsa` | konum, yarıçap, yürüme süresi, program | konum skoru, bileşenler, bulgular, izometrik katman paftası |
| 05 İmar ve Kapasite | `#/imar` | parsel (çokgen / dikdörtgen), TAKS, KAKS, yençok, çekmeler | yapılabilir zarf, kütle, kat / daire / otopark, gölge, senaryolar |
| 06 Yer Seçimi | `#/yer` | aday konumlar, ağırlıklar, filtreler | sıralama ve ölçüt matrisi · ya da çevre taraması ve ısı haritası |

## Dosyalar
| Dosya | Görev |
|---|---|
| 36-lib-gis | yerel eşdikdörtgen izdüşüm (`makeProj`: `fwd(lat,lon)` / `inv(x,y)`), poligon geometrisi, kırpma |
| 37-lib-osm | Overpass, Nominatim ve Open-Meteo istemcileri, ayrıştırma, önbellek, hata metinleri |
| 38-data-demo | çevrimdışı çalışan sentetik demo kent (`osm.demo`, gerçek bir yeri temsil etmez) |
| 39-lib-a-site | konum analizi: erişim bantları, ulaşım, yeşil alan, işlev karışımı, gürültü göstergesi, skor, bulgular |
| 39-lib-b-zoning | imar hesabı: yapılabilir zarf, kütle, kat, daire, otopark, gölge, senaryo özeti |
| 39-lib-c-select | aday puanlama, filtreler, ızgara taraması, öneri noktaları |
| 39-lib-d-sitedraw | ortak çizim parçaları (zemin, yol, bina, yeşil, su, erişim bantları) |
| 39-lib-e/f/g-*scene | üç modülün paftaları (`App.siteScene`, `App.imarScene`, `App.selScene`) |
| 39-lib-h-geoexport | DXF (R12), GeoJSON ve CSV dışa aktarma (`App.geoExport`) |
| 39-state-site | reducer kancası ve JSON uzantıları |
| 63–68 | arayüz ve controller dosyaları (Arsa: 63/64 · İmar: 65/66 · Yer: 67/68) |

Dosya adlarındaki `a … h` harfleri yükleme sırasını belirler (derleme dosyaları ad sırasıyla birleştirir).

## Harita verisi: OpenStreetMap ya da HERE
Varsayılan kaynak OpenStreetMap'tir. **Harita verisi** bölümünden kendi HERE API anahtarınızı girerek HERE'e geçebilirsiniz: bina, yol, yeşil ve su için HERE Vector Tile v2, adres/POI için Geocoding & Search v7, erişim için Isoline v8 kullanılır; bir HERE sorgusu başarısız olursa Overpass'a düşülür. 3B görünüm HERE JS API 3.1 ile ayrı bir pencerede açılır (**3B**). Anahtar yalnızca bu tarayıcıda (`archtools.here.key`) durur; proje JSON'una, paylaşım bağlantısına, dışa aktarmalara ve depoya girmez. wego.here.com sayfaları kazınmaz; yalnızca HERE Platform API'leri kullanılır. HERE kullanım koşulları ve kotaları anahtar sahibine aittir.

## Veri ve sınırlar
- **Kaynak:** OpenStreetMap (Overpass), adres araması Nominatim, iklim ve yükselti Open-Meteo. Tarayıcıdan doğrudan istenir; sonuçlar bellekte ve (sığdığı kadarıyla) tarayıcı deposunda önbelleğe alınır.
- **Demo bölge** sentetiktir ve ağ olmadan çalışır; skorlar yalnızca arayüzü denemek içindir.
- **İmar değerleri kullanıcı girdisidir.** Uygulama imar planı verisi çekmez; TAKS, KAKS, yençok ve çekme mesafelerini belediyeden alın.
- **Gürültü** gerçek ölçüm değil, yol sınıfı ve uzaklığa dayanan bir göstergedir.
- OSM kapsamı bölgeye göre değişir; bina yüksekliği etiketi yoksa kat sayısı ya da tür varsayımı kullanılır.

## Durum
`project.site { loc, radius, walkMin, template, parcel, imar }` ve `project.cand { list, w, f, sel, mode, scan }`. Parsel ve aday koordinatları konum merkezine göre **metredir** (x doğu, y kuzey). Görünüm durumu (`state.ui.arsa / imar / yer`) tarayıcıda hatırlanır. Paylaşım bağlantısı: `#/arsa?lat=…&lon=…&r=…&w=…&t=…&n=…`.

## JSON uzantıları
- `extensions.siteAnalysis` — `location`, `radiusM`, `walkMinutes`, `template`, `parcel`, ayrıca salt okunur `score`, `parts`, `findings` (içe aktarmada yeniden hesaplanır).
- `extensions.zoning` — `parameters` (use, taks, kaks, maxHeightM, floorHeightM, setbacksM, edgeOverrides, form, …), salt okunur `result`, `scenarios[{name, parameters, result}]`.
- `extensions.siteSelection` — `candidates[{id, name, lat, lon, source}]`, `weights`, `filters`, salt okunur `ranking`.

## Dışa aktarma
PNG, PDF, SVG (pafta) · KML (Google Earth) · DXF (R12, metre, `ARCH_*` katmanları) · GeoJSON (WGS84, `archtools` üst verisiyle) · CSV (Türkçe Excel için `;` ayraçlı, UTF-8 BOM). DXF yerel metre koordinatlarında yazılır; GeoJSON gerçek enlem–boylamdadır.
