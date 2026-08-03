# Changelog

Bu projedeki önemli değişiklikler bu dosyada kaydedilir.

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
