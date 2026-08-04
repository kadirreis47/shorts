# AI Voice & Audio Production Engine

Epic 7.3 is a deterministic, metadata-driven audio production foundation. It does
not perform waveform ML, TTS generation, music/SFX search or external API calls.
The existing `RenderManifest.audio`, timeline tracks and media validation pipeline
remain the sources of truth.

## Pipeline

```text
Current RenderManifest + revision-bound Director Report
  -> voice timing / silence / pacing / quality analyzers
  -> music / SFX / ducking / loudness planners
  -> conflict-aware AudioProductionPlan
  -> immutable AudioProductionPreview
  -> explicit user approval
  -> manifest transform
  -> existing media validation
  -> project-scoped TimelineRevision history
```

All timing is absolute in the manifest and converted to scene-relative coordinates
only for analysis. Global music is intersected with scene ranges instead of being
assigned to a scene. Transforms clamp segments and automation, synchronize existing
voice/music/effects track clips, recalculate audio metrics and invalidate validation.
Successful validation restores render readiness; failed validation preserves the
edited manifest as unvalidated.

Ducking regeneration is ownership-scoped. Generated points carry deterministic IDs
and `kind`, `sourceOperationId` and `sourcePlanId` metadata. `sourceOperationId` is the
durable replacement identity, so a later plan replaces generated ducking from the same
operation even when its plan ID changed; `sourcePlanId` remains audit metadata only.
Voice, SFX, manual ducking, provenance-ambiguous points and generated ducking owned by
other operations are preserved and merged in a deterministic time/track/ID order.
Repeated runs therefore produce one current envelope per operation without accumulation.

Trailing-silence removal is a structural timeline edit, not an audio-only clamp. It
uses the Editing Engine's shared immutable retime transform to shorten the scene,
shift later scenes and scene-linked clips/audio/subtitles, rebuild structural markers,
renormalize transition overlaps, clamp global media to the new total duration and
recalculate timeline, subtitle and audio metrics. Preview duration and invalidation
metadata are derived from that fully retimed snapshot.

Audio preview invalidation uses a centralized operation policy rather than inferring
scope from `sceneId`. Scene operations invalidate their scene and overlap dependencies,
track operations invalidate scenes intersecting that track, and global/final-mix
operations invalidate the full timeline. This conservative global policy is required
because the current incremental renderer caches assembled scene segments and its scene
fingerprint does not independently bind audio mix state. Preview `affectedScenes`,
`rerenderSceneIds`, `reusableSceneIds` and cache estimates use this derived result.

Plans bind to canonical manifest fingerprint version 2 and the Director report's
analyzed fingerprint. Preview/apply reject stale revisions. Disabled operations are
removed from the effective conflict graph, unresolved critical conflicts block apply,
and manual operations require explicit per-operation approval. Enabled is not the same
as approved: automatic operations may run by default, while every manual operation is
initially unapproved and must be selected explicitly. General plan confirmation never
substitutes for manual approval. The approval set is part of the preview signature and
is enforced again by the application engine, so stale, disabled, conflicted or unknown
approvals cannot apply. Corrupt or legacy persisted revisions are quarantined rather
than restored.

Loudness values are configurable production profiles, not claims about immutable
platform requirements. Quality improvement, cache reuse and risk scores are heuristic
estimates. The UI keeps revision controls available after apply and supports JSON export.
