# Sprint 6.9.23 — Render Recovery Center

## Amaç
Render checkpoint altyapısını gerçek dependency injection ve uygulama yaşam
döngüsüne bağlamak; yarıda kalan işleri Render Ops ekranında görünür kılmak.

## Eklenenler
- `renderRecoveryStore` dependency token
- Recovery store singleton kaydı
- Render Engine'e gerçek recovery store enjeksiyonu
- Bootstrap sırasında Recovery Center monitor başlatma
- Açılışta queued/running kayıtları interrupted durumuna dönüştürme
- `render:recovery-detected` olayı
- Zustand Recovery Center store
- Interrupted, failed, completed ve cancelled checkpoint listesi
- Recovery kayıt ayrıntı paneli
- Seçili recovery kaydını kalıcı store'dan kaldırma
- Duplicate monitor ve listener koruması

## Sonuç
Sprint 6.9.11'de hazırlanan checkpoint sistemi artık uygulamada gerçekten
çalışır, açılışta yarıda kalan işleri tespit eder ve kullanıcıya gösterir.
