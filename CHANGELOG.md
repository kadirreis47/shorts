# Changelog

Bu projedeki önemli değişiklikler bu dosyada kaydedilir.

## [7.1.0] - 2026-08-03

### Added

- Deterministik emotion, clarity ve continuity analyzer'ları.
- Advanced Hook Intelligence, stabil scene ranking ve heuristic retention risk map.
- Çakışma çözümlü, öneri niteliğinde Edit Decision Plan.
- Geriye uyumlu alanları koruyan versioned Director Report V2.
- Boyut sınırlı Zustand report store, Event Bus monitor ve yeni lifecycle eventleri.
- Lazy-loaded AI Director rapor ekranı, JSON export ve Studio analiz aksiyonu.
- Epic 7.1 için analyzer, planning, report ve store/monitor test paketleri.

### Notes

- Risk skorları heuristic göstergelerdir; ML/LLM tahmini değildir.
- Edit kararları RenderManifest'e otomatik uygulanmaz.

## [7.0.0] - 2026-08-03

### Added

- Type-safe AI Director domain sözleşmeleri ve deterministic analyzer engine.
- Hook, pace, visual potential/motion ve retention heuristic analyzer'ları.
- Weighted scene scoring, güçlü/zayıf sahne seçimi ve recommendation deduplication.
- Analyzer diagnostics, AbortSignal ve kontrollü analyzer hata izolasyonu.
- RenderManifest adaptasyonu yapan Director Application Service.
- Director lifecycle Event Bus olayları ve DI composition root entegrasyonu.
- Director engine ve application service için deterministik test paketi.

### Notes

- Bu sürüm foundation niteliğindedir; LLM/API çağrısı veya gerçek ML tahmini yapmaz.

## [6.9.25] - 2026-08-03

### Added

- Vitest ve jsdom tabanlı otomatik test altyapısı.
- DI, Event Bus, render resilience, capacity/auto-tuner ve Render Engine testleri.
- Recovery replay snapshot, boyut sınırı ve eski kayıt uyumluluğu.
- Electron preload API ve FFmpeg IPC input güvenlik testleri.
- Koşullu FFmpeg/FFprobe smoke testi.
- GitHub Actions kalite kapısı.

### Fixed

- Senkron hata atan Event Bus listener'ının diğer listener'ları engellemesi.
- Pause edilmiş Render Engine kuyruğunun iş çalıştırmaya devam etmesi.

### Security

- FFmpeg IPC job, args ve absolute path girdileri için doğrulama eklendi.
