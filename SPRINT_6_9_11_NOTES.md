# Sprint 6.9.11 — Render Recovery & Checkpointing

## Amaç
Uygulama kapanması, sistem hatası veya kullanıcı müdahalesi durumunda render
işlerinin son bilinen durumunu korumak ve yarıda kalan işleri tespit etmek.

## Eklenenler
- Kalıcı render checkpoint kayıtları
- Queue, start, progress, completed, failed ve cancelled aşamalarında checkpoint
- Uygulama kapanırken aktif işlerin `interrupted` olarak işaretlenmesi
- Bir sonraki açılışta yarıda kalan işleri tespit etme
- En fazla 40 recovery kaydı
- Terminal kayıtları temizleme API'si
- Recovery kayıtlarında preset, adapter, stage, progress ve hata bilgisi
- Render Engine options içine recovery store entegrasyonu

## Güvenlik
Recovery persistence hataları render işlemini durdurmaz. Checkpoint verisi
yalnızca iş durumunu taşır; büyük manifest veya medya dosyaları localStorage'a
yazılmaz.
