# Sprint 6.9.14 — Render Operations Dashboard Foundation

## Amaç
Render Performance Analytics verilerini kullanıcı arayüzünün doğrudan
tüketebileceği operasyonel bir Zustand store'a dönüştürmek.

## Eklenenler
- Render analytics Zustand store
- Healthy, degraded, critical ve idle sistem sağlık durumu
- En yavaş render stage tespiti
- Son 120 metrik snapshot'ı için trend geçmişi
- Başarı oranı, kuyruk bekleme, render süresi, retry ve cache uyarıları
- Circuit breaker açılınca kritik operasyon alarmı
- Alert deduplication ve en fazla 30 aktif alarm
- RenderJobMonitor üzerinden metrics ve circuit event entegrasyonu
- UI dashboard, chart ve health badge bileşenlerine hazır type-safe model

## Sağlık kuralları
- Başarı oranı %90 altı: degraded
- Başarı oranı %70 altı: critical
- Kuyruk ortalaması 10 saniye üstü: degraded
- Kuyruk ortalaması 30 saniye üstü: critical
- Açık circuit breaker: critical
