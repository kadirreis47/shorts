# Sprint 6.9.12 — Render Retry & Circuit Breaker

## Amaç
Geçici sistem, dosya kilidi ve kaynak hatalarında render işini kontrollü biçimde
yeniden denemek; sürekli hata veren adapter'ın bütün kuyruğu yavaşlatmasını
engellemek.

## Eklenenler
- Render hata sınıflandırması
- Temporary, resource, hardware, configuration ve cancelled hata türleri
- Exponential backoff
- İptal edilebilir retry beklemesi
- Varsayılan iki deneme politikası
- Adapter bazlı circuit breaker
- Üç ardışık hatada circuit açılması
- Varsayılan 30 saniye cooldown
- Half-open kontrollü test çalıştırması
- Retry ve circuit Event Bus olayları
- Recovery checkpoint ile retry durumu uyumu
- Çıktı metadata'sında renderAttempts ve circuitBreakerState

## Güvenlik
Manifest/konfigürasyon hataları tekrar denenmez. Kullanıcı iptali retry üretmez.
Donanım hataları varsayılan olarak tekrar denenmez; FFmpeg adapter'ın mevcut CPU
fallback davranışı korunur.
