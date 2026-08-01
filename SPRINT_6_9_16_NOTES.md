# Sprint 6.9.16 — Analytics Persistence & Export

## Amaç
Render operasyon metriklerini uygulama yeniden açıldığında korumak ve dışarı
aktarılabilir raporlara dönüştürmek.

## Eklenenler
- Zustand persist middleware ile kalıcı analytics verisi
- Snapshot, trend geçmişi, uyarılar, sağlık ve circuit bilgisi saklama
- Versioned localStorage anahtarı
- Type-safe `exportSnapshot()` API'si
- Render Ops ekranında JSON dışa aktarma
- Excel uyumlu UTF-8 CSV dışa aktarma
- Zaman damgalı güvenli dosya adları
- Browser Blob tabanlı indirme
- Metrik sıfırlama davranışı korunur

## Sonuç
Render performansı artık uygulama kapatılıp açıldığında kaybolmaz ve teknik ekip,
destek veya kullanıcı tarafından analiz için dışarı aktarılabilir.
