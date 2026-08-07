# Epic 7.7 — AI Export Intelligence Engine

- Sürüm kontrollü export preset registry ve runtime FFmpeg/FFprobe capability detection eklendi.
- Deterministic export planı encoder, bitrate, container, codec, pixel format, audio ve hardware kararlarını açıklar.
- Queue pause/resume/cancel/retry ve progress sözleşmelerini taşır; hydration sırasında yarım işler `interrupted` olarak işaretlenir.
- Output verification duration, resolution, codec, audio, zero-byte ve corruption kontrollerini yapar.
- Lazy AI Export Studio queue, capability, plan ve progress özetini gösterir.
- Export executor mevcut RenderEngine/cache hattını kullanır; source manifest’i değiştirmez.
- Upload/publishing bu Epic’in dışındadır; donanım benchmark’ı capability tabanlı tahmindir.
# Restart recovery

- Queue versioned persistence ile uygulama restartlarÄ± arasÄ±nda korunur.
- In-flight exportlar restart sonrasÄ± `interrupted` olur; kaldÄ±ÄŸÄ± frame/byte noktasÄ±ndan otomatik devam etmez.
- `failed` ve `interrupted` joblar aynÄ± logical identity ile retry edilebilir; completed/cancelled joblar retry edilemez.
# Production export guardrails

- Destination native Electron save dialog ile absolute ve validated olarak seçilir.
- Dialog cancel enqueue veya failure history üretmez.
- FFmpeg yoksa production export disabled/block edilir.
- RenderPlanAdapter gerçek rendered video artifact'i değildir.
# Recovery and FFprobe

- Runtime normalization her hydrationda çalışır; migration version'ından bağımsızdır.
- FFmpeg ve FFprobe bağımsız probe edilir.
- FFprobe verification capability yoksa production export başlatılmaz.
# Codec/encoder consistency

- Her executable plan iÃ§in `encoderSupportsCodec(codec, encoder)` invariant'i uygulanÄ±r.
- Archive HEVC planÄ± libx264 ile Ã¼retilemez; libx265 veya uyumlu HEVC hardware encoder kullanÄ±lÄ±r.
- HEVC kullanÄ±lamÄ±yorsa aÃ§Ä±k H.264 + uyumlu encoder fallback'i veya blocking issue Ã¼retilir.
# Cache-hit materialization

- Cache hit kullanÄ±cÄ± destination'Ä± yerine geÃ§mez.
- Cache artifact requested export path'ine materialize edilir.
- Completed artifact ve verification URI'si `job.outputPath` olur; cache source korunur.
* Planner/render contract: `ExportPlan.preset.encoder` is the encoder used by FFmpeg. Preset bitrate, FPS, pixel format, GOP, thread, audio and sampling settings are propagated to the command builder without hidden fallback.
* Windows cache-hit overwrite uses serialized, backup-aware destination replacement. Existing approved files are preserved/restored on finalization failure before the new artifact is verified.
* Encoder selection now honors preset hardware policy. CPU never selects NVENC/QSV/AMF/VideoToolbox; GPU fallback is explicit and runtime encoder ordering no longer changes the plan.
