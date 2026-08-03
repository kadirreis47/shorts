# Sprint 6.9.18 — Render Auto-Tuning Recommendations

## Amaç
Render metriklerini yalnızca göstermek yerine, sistemin performans ve
güvenilirliğini artıracak uygulanabilir otomatik ayar önerileri üretmek.

## Eklenenler
- Type-safe Render Auto-Tuner
- Throughput, stability, latency ve cache öncelikleri
- Başarı oranı ve kuyruk verisine göre concurrency önerisi
- Retry baskısına göre güvenli concurrency düşürme
- Cache hit yokluğunda fingerprint/cache inceleme önerisi
- Adaptif baseline'a göre alarm eşiği önerileri
- Öneri başına güven ve etki seviyesi
- Render Ops ekranında Auto-Tuner paneli
- Tek tıkla threshold önerisi uygulama
- Tuning raporunun persistence ve JSON export kapsamına alınması
- Manuel yeniden analiz etme

## Güvenlik
Auto-Tuner bu sprintte yalnızca analytics threshold ayarlarını doğrudan uygular.
Render Engine concurrency değişikliği öneri olarak raporlanır; çalışan kuyruğa
otomatik müdahale edilmez.
