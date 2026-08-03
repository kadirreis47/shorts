# Sprint 6.9.25 — Quality Gates & Test Foundation

## Amaç

Sprint 7 AI Director geliştirmeleri öncesinde mevcut çekirdeği deterministik
unit/integration testleri, CI kalite kapıları ve FFmpeg smoke testiyle güvence
altına almak.

## Eklenenler

- Vitest 2 ve jsdom test altyapısı
- Strict TypeScript ve mevcut `@/` alias entegrasyonu
- `test`, `test:watch` ve `test:smoke` scriptleri
- DI Container ve Typed Event Bus davranış testleri
- Render resilience, circuit breaker, capacity planner ve auto-tuner testleri
- Fake adapter ile Render Engine queue/lifecycle/cache/retry/recovery testleri
- İzole localStorage ile recovery restore/replay/boyut sınırı testleri
- Test edilebilir, frozen Electron preload FFmpeg bridge factory'si
- FFmpeg IPC request/path doğrulaması
- FFmpeg yoksa skip edilen sentetik video smoke testi
- Linux tabanlı GitHub Actions workflow'u
- Git geçmişi ve repository kullanımı doğrulanan, görevi tamamlanmış
  `APPLY_SPRINT_6_9_23A_FIX.ps1` tek kullanımlık düzeltme betiğinin kaldırılması

## Testlerin bulduğu düzeltmeler

- Event Bus artık senkron listener hatalarını `Promise.allSettled` sınırı içinde
  izole eder; sağlıklı listener'lar çalışmaya devam eder.
- Render Engine drain döngüsü artık pause durumunda yeni iş başlatmaz.

## Bilinen sınırlar

- Smoke test sistemdeki FFmpeg/FFprobe kurulumuna bağlıdır ve yoksa skip edilir.
- Electron penceresi açılan gerçek E2E testi yoktur; IPC sınırı süreç başlatmadan
  test edilir.
- Absolute path zorunludur ancak izin verilen dizinler allowlist ile
  sınırlandırılmamıştır; kullanıcı tarafından seçilen çıktı yolları korunur.
- npm audit mevcut dependency ağacında ayrıca ele alınması gereken güvenlik
  bildirimleri raporlayabilir.
- ESLint unused/explicit-any kuralları mevcut tsconfig ve aşamalı Supabase
  fonksiyonlarıyla uyum için kapalıdır; typecheck strict kalmaya devam eder.

## Doğrulama

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```
