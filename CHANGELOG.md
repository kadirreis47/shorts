# Changelog

## [7.2.0] - 2026-08-03

### Added

- Type-safe AI Editing domain, deterministic Director decision compiler and conflict diagnostics.
- Safe trim, split, reorder, B-roll, motion, transition, subtitle and audio planners.
- Immutable timeline transform with invariants, revision checks and dry-run preview.
- Explicit apply workflow with bounded persistent undo/redo history.
- Editing Event Bus lifecycle, DI application service, monitor and Zustand store.
- Lazy AI Editor screen with operation controls, warnings, apply confirmation and JSON export.
- 159 behavior tests covering planners, dependency-safe transforms, transition-aware marker synchronization, complete manifest fingerprints, Director report revision binding, persistent revision integrity, metric recalculation, post-edit validation, track synchronization, stale snapshot protection, conflict resolution, service lifecycle and revision history.

### Notes

- Plans are heuristic and deterministic; no ML inference or external media search occurs.
- Preview is mandatory and manual operations require explicit approval.
- Manifest fingerprint v2 covers complete editable state and invalidates legacy
  persisted revisions to prevent stale preview, apply, undo or redo data loss.
- Edited timelines now recompute existing media metrics and pass through the existing
  media validation pipeline before becoming render-ready again.
- AI Editor revision controls remain accessible after apply, and Director reports are
  bound to the exact analyzed manifest fingerprint before edit-plan compilation.
- Timeline retime now preserves valid transition overlaps and rebuilds deterministic,
  scene-consistent marker timing after structural edits.
- Result manifest fingerprints participate in revision identity, corrupted persisted
  undo/redo targets are quarantined, and operation dependencies are enforced at apply.

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
