# archtools — Mimari Tasarım Asistanı Platformu

Mimari yardımcı araçların toplandığı depo. Her araç `modules/` altında ayrı bir modüldür; ortak veri ve tasarım dili aynı kalır.

## Modül 1 — İşlev Şeması (Bubble Diagram) Simülasyonu
- Mekân adı + m² ekleme, ilişki matrisi (Güçlü / Zayıf / İlişkisiz / Ayrı tut)
- m² ile orantılı daireler, serbest sürükleme, canlı verimlilik skoru
- Akıllı Öneri paneli (yönetmelik ve kitap verisine dayalı)
- Retro-Bauhaus pafta, PNG/PDF dışa aktarma, JSON kaydet/yükle

Kaynak: `modules/bubble-diagram/src/`. Derlemek için:

```
python3 modules/bubble-diagram/build.py   # kökteki index.html'i üretir
```

`index.html` depo kökündedir; Vercel'de ayar gerekmez (Framework: Other, build komutu boş, çıktı klasörü `.`).

## JSON veri şeması
`schema: "mimari-asistan.bubble-diagram"`, `version: 1`; alanlar: `meta`, `world`, `spaces[]`, `relations[]`, `metrics`. Ayrıntı: `modules/bubble-diagram/README.md`.
