# Changelog

## Epic 7.5 review hardening

- Added token-safe preview-family supersession so rapid subtitle approval changes resolve to the latest preview without stale errors or loading-state writes.
- Preserved explicit subtitle line breaks and whitespace while applying highlight and karaoke ASS tags.
- Corrected top-aligned subtitle margins with orientation-aware safe-area placement.
- Added validated snapshot and redo persistence, legacy history migration and stale-revision quarantine for subtitle undo/redo across restarts.
- Marked vertical subtitle line spacing planned-only instead of misusing ASS horizontal character spacing.
- Preserved approved keyword highlights across split/merge cue restructuring with deterministic word-ID remapping.
- Restored UTF-8 Turkish CTA, Unicode currency and ellipsis punctuation matching in subtitle analysis.
- Aligned subtitle split planning and transform eligibility, including safe oversized three-word 1|2 or 2|1 splits.

## Epic 7.5 — AI Subtitle & Typography Intelligence

- Added deterministic subtitle line breaking, timing, typography, density, keyword highlight, readability and safe-area intelligence on the existing canonical subtitle timeline.
- Added caption profiles and renderer-backed typography parameters with an explicit planned-only boundary for unsupported animations.
- Added mandatory approval-bound preview, immutable apply, scene cache invalidation, project-scoped concurrency and atomic subtitle undo/redo transactions.
- Added the lazy-loaded AI Subtitle Studio, JSON export, persisted revision history and production regression coverage.

## [7.4.0] - 2026-08-05

### Added

- Deterministic visual composition, motion, continuity, quality, hook and readability intelligence.
- Central visual-operation capability registry shared by preview, apply, UI and JSON export.
- Explicit applied, plan-only, skipped and rejected operation outcomes with diagnostics.

### Fixed

- Prevented plan-only reframe and B-roll overlay operations from changing manifests, fingerprints, score estimates, render invalidation or applied-operation results.
- Corrected exposure adjustment direction: under-exposure increases brightness and over-exposure decreases it with bounded severity-aware deltas.
- Bound preview and apply to the same capability results and signed FFmpeg brightness parameters.
- Moved scene-specific visual effects from shared asset metadata to scene-linked video clip metadata, preventing effects and stale cache entries from leaking across reused assets.
- Included scene-local clip render state in scene fingerprints and expanded explicit asset-global invalidation to every referencing scene.
- Ignored legacy generated asset-level visual effects in rendering to prevent double application while preserving source asset metadata.
- Prevented visual apply from overwriting manifest changes made while application events are awaiting by rechecking the source fingerprint immediately before install.
- Prevented stale visual undo/redo history from overwriting newer Director, Editing or Audio changes; stale history is replaced with a fresh snapshot of the active manifest.
- Added delayed-event race coverage for apply, undo and redo optimistic concurrency boundaries.
- Made visual undo/redo transactional so rejected completion events and failed installs cannot advance revision state.
- Added async-safe AI Visual Studio revision controls with visible errors and duplicate-action prevention.
- Deduplicated scene-level visual operations across multi-clip scenes before fingerprinting and FFmpeg filter generation.
- Rejected conflicting duplicate visual-operation payloads instead of silently selecting or compounding them.
- Prevented out-of-order visual preview requests from overwriting newer approval selections by combining cancellation with store-enforced request generations and identity binding.
- Disabled visual Apply while the newest approval-bound preview is loading and ignored stale preview errors after newer requests.
- Prevented concurrent visual analyses from committing out of order with monotonic request identities, cancellation and source-binding checks in both controller and store.
- Made AI Visual Studio revision and analysis loading guards safe across React StrictMode setup/cleanup/setup cycles and real unmounts.
- Repaired Turkish B-roll keyword matching with real UTF-8 text, NFKC normalization and Turkish locale-aware casing.
- Stopped static scenes from receiving stabilization recommendations and bound real stabilization eligibility to non-static shake evidence.
- Replaced the hard-coded color-grade filter with shared profile/intensity resolution across planning, preview and FFmpeg rendering.
- Marked background blur plan-only until segmentation exists and removed the misleading full-frame Gaussian blur behavior.
- Serialized conflicting project-scoped visual analysis, preview, apply, undo and redo operations with explicit controller leases while retaining latest-request-wins preview supersession.
- Made undo/redo manifest installation atomic with visual revision state through binding rechecks, commit-before-install ordering and full rollback on installation failure.
- Prevented failed visual transactions from overwriting unrelated concurrent manifest changes or persisting partial revision state.

### Notes

- B-roll produces opportunities only; no external asset search or insertion is performed.
- Reframe remains plan-only until a complete crop/position/scale render contract is available.
- An operation is reported as applied only when it changes production manifest/render behavior.

## [7.3.0] - 2026-08-04

### Added

- Type-safe deterministic audio-production domain and application service.
- Voice timing, silence/dead-air, bilingual pacing and technical voice-quality analysis.
- Music, SFX, sidechain ducking and configurable loudness production planners.
- Conflict-aware audio plan compiler, immutable preview/transform and current-revision checks.
- Validated apply plus bounded, project-isolated undo/redo with corrupt revision quarantine.
- Event Bus/DI lifecycle, persisted Zustand state and lazy AI Audio Studio with JSON export.
- 61 focused audio-production tests covering analyzers, transform, lifecycle, stale state and UI selectors.

### Notes

- Audio decisions are heuristic estimates; no TTS, waveform ML, external API or asset search is used.
- Preview and explicit approval are mandatory. Existing media validation runs after apply/undo/redo.
- Audio plans bind to both the canonical manifest fingerprint and the current Director report binding.

### Fixed

- Preserved unrelated voice, SFX, music and manual automation while regenerating
  operation-owned ducking points with deterministic IDs and provenance metadata.
- Derived audio rerender/reuse metadata from centralized scene, track and global mix
  invalidation policies; disabled, skipped and conflicted operations no longer invalidate cache entries.
- Required explicit per-operation approval for manual audio actions. Enabled manual
  operations remain unapproved until selected, general apply confirmation does not
  approve them, and preview/apply signatures enforce the same approval set.
- Replaced stale generated ducking by durable `sourceOperationId` across repeated plans,
  making reruns idempotent without removing manual or unrelated automation points.
- Retimed the complete manifest for trailing-silence trims through the shared Editing
  Engine transform, keeping scenes, clips, markers, transitions, total duration and
  timeline/audio/subtitle metrics structurally consistent.

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
# Epic 7.6 Platform Optimization Engine

- Added versioned platform profiles, deterministic readiness reports, safe-area and export compatibility planning.
- Added immutable multi-platform variant planning with capability-aware planned-only operations and lazy AI Platform Studio.
- Geometry changes now require an aspect-ratio-compatible capability before resolution is applied.
- Bound previews to plan/profile/approval signatures and invalidated source validation after variant changes.
- Added source-binding watcher to invalidate stale Platform Studio plans before user actions.
- Consumed applied previews and bounded/deduplicated platform variant history.

# Epic 7.7 Export Intelligence Engine

- Added runtime FFmpeg capability detection, export presets, deterministic queue and artifact verification.
# Epic 7.7 restart recovery

- Persisted export queue hydration ve version normalization eklendi.
- Restart sÄ±rasÄ±ndaki iÅŸler `interrupted` olarak güvenli retry state'ine alÄ±nÄ±yor.
- Persisted active job restore edilmiyor; duplicate execution engelleniyor.
# Epic 7.7 export guardrails

- Native save dialog destination seçimi ve absolute path validation eklendi.
- FFmpeg unavailable durumunda production export gating eklendi.
# Epic 7.7 recovery and capability hardening

- Every export rehydration now normalizes persisted in-flight jobs to `interrupted`.
- FFprobe capability is probed independently and required for production export.
# Epic 7.7 codec/encoder consistency

- Archive and built-in presets now emit compatible codec/encoder pairs.
- Renderer rejects manually constructed plans with incompatible encoder metadata.
# Epic 7.7 cache destination correctness

- Cache-hit artifacts are atomically materialized to the requested export destination before verification.
* Hardened export rendering so planned encoders and preset encoding settings reach the FFmpeg command unchanged.
* Fixed Windows cache-hit materialization when the approved export destination already exists, with serialized replacement and rollback protection.
* Made export encoder selection hardware-policy aware and deterministic across capability ordering.
* Added Epic 7.8 publishing/scheduling orchestration with verified artifact gates, deterministic idempotency, UTC scheduling, recovery and honest platform capability reporting.
* Fixed Epic 7.8 scheduled wake-up, restart recovery, fresh approval binding, persisted reconciliation and bounded retry bookkeeping.
* Hardened Epic 7.8 reconciliation backoff, interrupted retry idempotency, exact account binding and structured rate-limit cooldowns.
* Fixed automatic execution of retryable failures and eliminated stale retry wake-up loops.
* Enforced canonical UTC schedule validation and mandatory preview-bound approval fingerprints.
* Hardened retry approval preservation and execution-time authenticated binding checks.
