# Sprint 6.9.20 — Runtime Concurrency Control

## Amaç
Capacity Planner tarafından önerilen worker/concurrency değerini uygulamayı
yeniden başlatmadan gerçek Render Engine kuyruğuna uygulamak.

## Eklenenler
- Render Engine `getConcurrency()` API'si
- Render Engine `setConcurrency()` API'si
- 1–8 arası güvenli runtime sınırı
- Concurrency artınca kuyruğun anında yeniden değerlendirilmesi
- Aktif işler kesilmeden concurrency düşürme
- `render:concurrency-changed` Event Bus olayı
- Render Ops ekranında aktif worker sayısı
- Capacity Planner önerisini tek tıkla gerçek motora uygulama
- Analytics store içinde runtime concurrency takibi
- Başlangıç concurrency değerinin güvenli 1 worker olması

## Güvenlik
Concurrency düşürüldüğünde çalışan render işleri iptal edilmez. Yeni iş
başlatma sayısı yeni sınıra göre azaltılır. GPU tarafındaki ayrı Hardware
Scheduler ve VRAM koruması çalışmaya devam eder.
