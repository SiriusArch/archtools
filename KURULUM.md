# Kurulum — Vercel + Upstash (yönetici paneli ve ziyaretçi profilleri)

Site **depo içeriği olmadan çalışır** (yalnızca İşlev Şeması). Ziyaretçi profili ve yönetici paneli için bir veri deposu ve birkaç gizli değer gerekir.
**Hiçbiri depoya yazılmaz**; hepsi Vercel → *Project → Settings → Environment Variables* bölümüne girilir.
Bunlar tanımlanmazsa giriş kapısı ve takip tamamen kapalı kalır, site olduğu gibi çalışır.

## 1. Veri deposu (Upstash Redis)
1. Vercel projesinde *Storage* (ya da *Marketplace*) → **Upstash Redis** → ücretsiz plan → projeye bağlayın.
2. Bağlayınca `KV_REST_API_URL` ve `KV_REST_API_TOKEN` (veya `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) otomatik eklenir. Başka bir şey yapmanız gerekmez.
3. Bölgeyi kullanıcılarınıza yakın seçin (örn. Frankfurt). Verinin yurt dışında barındırılması aydınlatma metninde belirtilmiştir.

## 2. Yönetici gizli değerleri (yerelde üretin)
```
node tools/admin-setup.mjs
```
Parolanızı sorar (en az 14 karakter; boşluklu uzun bir cümle idealdir) ve şunları **ekrana** yazar; dosyaya yazmaz, ağa göndermez:

| Değişken | Anlamı | Zorunlu |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | parolanızın scrypt özeti (parolanın kendisi hiçbir yerde durmaz) | evet |
| `ADMIN_SESSION_SECRET` | oturum çerezini imzalar | evet |
| `IP_SALT` | hız sınırı sayaçlarında IP özetini tuzlar | evet |
| `ADMIN_TOTP_SECRET` | ikinci adım (Authenticator uygulaması) | **önerilir** |
| `PRIVACY_CONTACT_NAME` · `PRIVACY_CONTACT_EMAIL` | gizlilik sayfasında görünen veri sorumlusu / iletişim | önerilir |
| `RETENTION_DAYS` | saklama süresi (varsayılan 180, 7–3650) | hayır |

Çıktıyı Vercel'e yapıştırın (*Production*), sonra terminali temizleyin. TOTP için yazdırılan `otpauth://…` adresini kimlik doğrulayıcı uygulamanıza ekleyin.
İletişim e-postasını **depoya yazmayın** (depo herkese açıksa kişisel adresiniz sızar); yalnızca ortam değişkeni olarak girin.

## 3. Yayın
`main` dalına gönderince Vercel yeniden yayınlar. `public/` klasörü depodadır (derleme adımı yok); kaynak değiştirdiyseniz önce `python3 build.py` çalıştırıp `public/` değişikliklerini de ekleyin.

- Uygulama: `/` · Yönetici paneli: `/admin` · Aydınlatma metni: `/gizlilik`
- `/admin` bağlantısı sitede hiçbir yerden verilmez; arama motorlarına kapalıdır (`robots.txt`, `X-Robots-Tag`).

## 4. Doğrulama listesi
- [ ] `/` açılışta kimlik formunu gösteriyor; ad + onay olmadan "Devam et" kapalı.
- [ ] Kayıttan sonra `/admin` → parola + kod ile giriş → ziyaretçi tabloda görünüyor.
- [ ] Çıkış yapınca `/admin` yeniden giriş istiyor.
- [ ] `/gizlilik` sayfasında veri sorumlusu bilgisi görünüyor.
- [ ] GitHub deposu **özel (private)** (aşağıya bakın).

## Notlar
- **Depoyu özel yapın:** GitHub → Settings → General → *Danger Zone* → *Change visibility* → Private. Kaynak kodu herkese açık kalması bir güvenlik açığı değildir (hiçbir gizli değer içermez), fakat yayın dışı modüller ve geçmiş yine de görünür.
- **Yerel deneme:** `AT_STORE=memory AT_DEV=1 ADMIN_PASSWORD_HASH=… ADMIN_SESSION_SECRET=… IP_SALT=… node tools/dev-server.mjs` (bellek içi depo; yeniden başlatınca silinir).
- **Parola kaybı / sızıntı:** `node tools/admin-setup.mjs` ile yeni değerler üretip Vercel'de değiştirin ve yeniden dağıtın; `ADMIN_SESSION_SECRET` değişince tüm yönetici oturumları geçersiz olur.
- **Arama motorları:** site varsayılan olarak dizinlenmez. Herkese açmak isterseniz `vercel.json` içindeki `X-Robots-Tag`, `site/robots.txt` ve `index.html` meta etiketini değiştirin.
