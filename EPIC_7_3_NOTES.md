# Epic 7.3 — AI Voice & Audio Production Engine

- Added deterministic voice timing, dead-air, speech pacing and voice-quality analysis.
- Added music, SFX, sidechain ducking and configurable loudness planning.
- Added conflict-aware compilation, immutable dry-run preview and audio manifest transform.
- Reused canonical manifest fingerprints, media validation and TimelineRevision history.
- Added stale Director/manifest protection, project isolation and corrupt revision quarantine.
- Added Event Bus, DI, persisted store, lazy AI Audio Studio and AI Editor navigation.
- Added 61 behavior-focused tests for analysis, planning, transform, lifecycle and UI state.
- Ducking regeneration now preserves unrelated automation and replaces only points
  owned by the same plan operation using deterministic provenance metadata.
- Ducking replacement now treats `sourceOperationId` as its durable owner across plan
  regenerations, preventing stale envelopes from accumulating while retaining manual
  and unrelated automation; `sourcePlanId` remains available for audit/debugging.
- Trailing-silence trims now reuse the Editing Engine's structural manifest retime,
  synchronizing scenes, all scene-linked tracks, markers, transition overlaps, global
  duration clamps and timeline/subtitle/audio metrics in preview and apply.
- Added centralized scene/track/global/final-mix invalidation; global mix changes
  conservatively rerender all scenes under the current segment-cache architecture.
- Separated manual operation enablement from approval. Manual operations start
  unapproved, require explicit per-operation selection, and are enforced by both the
  UI and application engine; general plan confirmation does not approve them.

No external TTS, music/SFX search, paid API or ML inference is used. Apply requires a
current preview and explicit per-operation approval for every manual operation.
Validation runs after apply, undo and redo;
failed validation preserves the edit but keeps it non-renderable until corrected.
