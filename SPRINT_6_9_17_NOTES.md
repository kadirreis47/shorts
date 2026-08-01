# Sprint 6.9.17 — Adaptive Alert Baselines

## Amaç
Sabit alarm eşiklerinin yanında, render geçmişinden normal performans seviyesini
öğrenen adaptif bir operasyon izleme katmanı kurmak.

## Eklenenler
- Son 40 metrik örneğinden adaptif performans tabanı
- Ortalama render, kuyruk ve başarı seviyesi
- Render ve kuyruk standart sapması
- Öğrenilmiş tabana göre render anomaly alarmı
- Öğrenilmiş tabana göre queue anomaly alarmı
- Type-safe kullanıcı ayarlanabilir alarm eşikleri
- Alarm eşiklerini varsayılana döndürme
- Baseline ve threshold verilerinin persistence/export kapsamına alınması
- Render Ops ekranında adaptif taban kartları
- Render Ops ekranında interaktif eşik kontrolleri

## Anomali kuralı
En az beş örnekten sonra güncel değer, taban ortalamasını iki standart sapma ve
asgari güvenlik payının üzerinde aşarsa anomali alarmı oluşur.
