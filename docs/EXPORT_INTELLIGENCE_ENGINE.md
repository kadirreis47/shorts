# Epic 7.7 — AI Export Intelligence Engine

Export Intelligence mevcut RenderManifest, validation, fingerprint, cache ve FFmpeg bridge sözleşmelerini kullanır; ikinci bir render sistemi oluşturmaz. Runtime capability detection FFmpeg/FFprobe encoder ve hardware bilgisini bridge üzerinden alır. Preset registry versioned ve açıklanabilirdir.

Export planı kaynak fingerprint, platform ve preset’e bağlıdır. Validation geçmeden queue’ya alınmaz. Queue deterministic olarak pause/resume/cancel/retry destekler; başarısız işler bounded retry politikasıyla tekrar denenir. Queue persistence payload’ı sürümlüdür; hydration sırasında rendering/planning işleri `interrupted` olarak karantinaya alınır. Artifact tamamlandıktan sonra duration, resolution, codec, audio, zero-byte ve corruption kontrolleri yapılır.

Cache ve incremental render mevcut render katmanının sorumluluğundadır; export executor doğrudan mevcut RenderEngine’e bağlanır. Export Engine variant veya source manifest’i mutate etmez. Upload/publishing kapsam dışıdır. Donanım benchmark’ı runtime capability tabanlı tahmindir; gerçek performans garantisi değildir.
# Restart recovery

Queue state `shortsflow-export-intelligence` anahtarÄ±yla versioned persistence standardÄ± üzerinden saklanÄ±r. Uygulama restartÄ±nda planning/rendering/verifying iÅŸleri `interrupted` olarak normalize edilir; kaldÄ±ÄŸÄ± frame veya byte noktasÄ±ndan otomatik devam edilmez. `failed` ve `interrupted` iÅŸler aynÄ± logical job kimliÄŸiyle yeni, güvenli retry attempt'i olarak kuyruÄŸa dönebilir. Persisted active job restore edilmez; hydration tamamlanmadan execution baÅŸlamaz.
# Production destination and readiness

Production export iÅŸleri native Electron save dialog üzerinden seçilen absolute ve validated destination gerektirir; renderer filesystem path uydurmaz. Dialog iptali enqueue oluÅŸturmaz. FFmpeg unavailable veya capability loading durumunda production export blocked kalÄ±r. RenderPlanAdapter plan/preview amaçlÄ±dÄ±r ve gerçek video artifact'i veya completed export sayÄ±lmaz.
# Recovery and capability invariants

Persisted in-flight export jobs are normalized to `interrupted` on every hydration, independently of persistence schema migration. FFmpeg and FFprobe are probed independently at the Electron boundary; production export requires both capabilities before queue execution.
# Codec/encoder invariant

ExportPlan codec ve encoder kararÄ± atomiktir. Effective encoder seÃ§ilen codec'i desteklemiyorsa plan executable kabul edilmez; uyumlu codec/encoder Ã§iftiyle aÃ§Ä±k fallback veya blocking issue Ã¼retilir. Renderer planlanan effective encoder ile aynÄ± invariant'i kontrol eder.
# Cache-hit destination contract

Render cache yalnÄ±zca render computation'Ä±nÄ± reuse eder. Cache hit artifact'i kullanÄ±cÄ±nÄ±n seÃ§tiÄŸi destination yerine geÃ§mez; Electron filesystem boundary Ã¼zerinden requested `job.outputPath`'a atomic materialize edilir ve verification final destination Ã¼zerinde Ã§alÄ±ÅŸÄ±r. Cache source immutable kalÄ±r.
### Planner-to-render encoding contract

The effective encoder and encoding parameters selected by `ExportPlan` are passed unchanged to the render request and FFmpeg command builder. The renderer does not infer a replacement encoder from codec or hardware flags. Bitrate, frame rate, pixel format, GOP, threads, audio rate, and sample rate are part of the request and cache fingerprint; a stale or incompatible plan is rejected before rendering.
Cache materialization uses a platform-aware replacement boundary. On Windows an existing approved destination is moved to a same-directory backup before the verified temporary artifact is finalized; failures restore the prior destination where possible. The cache source is never moved or deleted, and final verification remains bound to the requested destination.
Hardware policy is part of encoder selection, not display metadata: CPU plans select only software encoders, GPU plans select compatible hardware encoders or emit an explicit software fallback, and automatic selection uses a stable priority independent of runtime list order.
