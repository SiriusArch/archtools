# Güvenlik ve gizlilik tasarımı

Bu belge neyin neden korunduğunu ve sınırlarını özetler. Kurulum için [KURULUM.md](KURULUM.md).

## Kişisel verilerin korunması (site sahibi)
- **Depoda kişisel veri yok:** commit yazarları `noreply` adresidir; kaynakta e-posta, anahtar ya da parola bulunmaz. İletişim bilgisi yalnızca ortam değişkenindedir (`PRIVACY_CONTACT_*`).
- **Yönetici parolası** yalnızca scrypt özeti (`N=32768, r=8, p=1`, rastgele tuz) olarak ortam değişkeninde durur; doğrulama zamanlama-güvenlidir.
- **Üçüncü taraf isteği yok:** yazı tipleri siteden sunulur; ziyaretçi IP'si ya da adı Google/CDN gibi harici bir adrese gitmez. CSP `connect-src 'self'` ile uygulamanın dışarı istek atması da engellenir.
- **Yayın paketi (`public/`)** dışında kalan her şey (kaynak, README, JSON) sitede sunulmaz; gizlenen modüllerin kodu pakete girmez.

## Ziyaretçi verisi
| Konu | Uygulama |
|---|---|
| Kimlik | İsim + rıza zorunlu; kurum / e-posta / rol isteğe bağlı. Google hesabı gerekmez. **Kimlikler beyana dayanır, doğrulanmaz.** |
| IP adresi | **Saklanmaz.** Hız sınırı için yalnızca tuzlu tek yönlü özet, en çok 1 gün yaşayan sayaç anahtarında. |
| User-Agent | Ham metin saklanmaz; "Chrome · Windows · masaüstü" gibi kaba etiketler. |
| Konum | Yalnızca barındırıcının verdiği ülke / şehir; kesin konum istenmez. |
| Proje içeriği | **Sunucuya gönderilmez.** Yalnızca izinli olay adları (`start`, `color_on`, `export_png` …). |
| Süre | Sekme görünür **ve** son 60 sn içinde etkileşim varsa sayılır; nabız başına en çok 90 sn. |
| Saklama | Son etkinlikten `RETENTION_DAYS` (180) gün sonra otomatik silinir; kişi kendi verisini anında silebilir. |
| Erişim anahtarı | Tarayıcıda gizli token; sunucuda yalnızca SHA-256 özeti. |

## Yönetici erişimi
- Parola (+ önerilen TOTP, ±1 pencere, aynı kod yeniden kullanılamaz). TOTP yalnızca **parola doğruysa** tüketilir.
- Oturum çerezi: `__Host-` önekli, `HttpOnly; Secure; SameSite=Strict; Path=/`, HMAC imzalı; ayrıca sunucu tarafında 8 saatlik oturum kaydı (çıkışta iptal).
- Giriş hız sınırı: IP özeti başına 15 dakikada 6 deneme.
- Tüm yönetici işlemleri `at:audit` listesine yazılır (son 500, en çok 400 gün; ham IP değil, tuzlu tek yönlü özet) ve panelden görülür.
- Yönetici arayüzü tüm değişken içeriği `textContent` ile yazar (`innerHTML` yok); CSV dışa aktarımında formül enjeksiyonu (`= + - @`) etkisizleştirilir.

## HTTP ve istemci sertleştirme (`vercel.json`)
CSP (`default-src 'none'`, betik / stil yalnızca kendi kaynağından, satır içi yok), HSTS (2 yıl, subdomain), `nosniff`, `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, COOP / CORP `same-origin`, kısıtlı `Permissions-Policy`, `noindex`. API'ler: yalnızca `POST`, `X-AT: 1` başlığı + `Origin` / `Sec-Fetch-Site` denetimi (CSRF), JSON içerik türü, 16 KB gövde sınırı, girdi doğrulama (ad / e-posta / alan uzunlukları), `no-store`.

## Bilinen sınırlar (dürüst notlar)
1. **İstemci kapısı atlanabilir.** Kimlik formu tarayıcıda çalışır; JavaScript'i devre dışı bırakan ya da API'yi doğrudan çağıran biri uygulamayı kayıtsız kullanabilir (uygulama istemcide çalıştığı için bu önlenemez). Sunucudaki **veri** ise korumalıdır.
2. **Kimlikler doğrulanmaz.** Biri başka bir ad yazabilir. E-posta doğrulaması istenirse ayrıca eklenmelidir.
3. **Herkese açık kaynak:** depo herkese açıksa kaynak kod ve geçmiş görünür (gizli değer içermez). Yine de **depoyu özel yapmanız** önerilir.
4. **Hukuki metin taslaktır:** `/gizlilik` içeriği genel bir KVKK aydınlatma taslağıdır; yayına almadan önce bir hukukçuya gösterin. Ziyaretçi kimliklerini incelemek veri sorumlusu olarak sizi KVKK yükümlülüklerine bağlar (VERBİS eşiği, rıza kaydı, silme talepleri).
5. **Hız sınırları** Redis sayaçlarıyla uygulanır; dağıtık saldırıya karşı Vercel Firewall / Attack Challenge Mode ek olarak açılabilir.

## Güvenlik sorunu bildirme
Bir açık bulduysanız lütfen depo sahibine GitHub üzerinden **özel** bir güvenlik bildirimi (*Security → Report a vulnerability*) açın; herkese açık issue'ya ayrıntı yazmayın.
