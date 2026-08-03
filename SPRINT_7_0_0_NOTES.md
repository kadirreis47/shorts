# Sprint 7.0.0 — AI Director Engine Foundation

## Amaç

ShortsFlow Media/Timeline/Render sözleşmelerini deterministic heuristic
kurgu analizine dönüştüren type-safe Director çekirdeğini oluşturmak.

## Eklenen mimari

- `src/core/director` domain modülü
- Merkezi immutable skor ağırlıkları ve 0–100 normalizasyon
- Hook, Pace, Visual Potential ve Retention Heuristic analyzer'ları
- Sıralı analyzer orchestration ve ara skor paylaşımı
- Analyzer hata izolasyonu ve diagnostics
- AbortSignal desteği
- Deterministic recommendation kimliği, deduplication ve sıralama
- Scene score, overall score, strengths, weaknesses, evidence ve decisions
- RenderManifest → DirectorInput application service adaptasyonu
- Director lifecycle Event Bus eventleri
- Director Engine/Application Service DI token ve singleton kayıtları

## Deterministik sürüm

Raporlar `director-heuristic-1.0.0` sürüm kimliğini taşır. Aynı DirectorInput,
aynı engine seçenekleriyle aynı JSON raporunu üretir. `generatedAt`, input'un
mevcut `createdAt` değerinden alınır ve analitik sonucu zamana bağlamaz.

## Açık sınırlar

- Harici LLM/API çağrısı yoktur.
- Gerçek ML retention tahmini yapılmaz.
- Analyzer sonuçları Media/Timeline metadata'sından türetilen heuristic sinyallerdir.
- UI ve dashboard eklenmemiştir.
- İnsan editör geri bildirimi ve öğrenen ağırlık sistemi sonraki sprintlere bırakılmıştır.

## Kalite kapıları

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```
