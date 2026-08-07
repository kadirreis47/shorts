# AI Subtitle & Typography Intelligence

Epic 7.5 extends the existing `RenderManifest.subtitles` timeline. It does not create a parallel caption model. Analysis, preview, apply, validation, fingerprints, scene cache invalidation and revision history all bind to the canonical manifest.

## Deterministic analysis

The line breaker uses word timestamps, punctuation, maximum word/character/duration limits and balanced two-line splits. It avoids one-word orphan lines whenever a valid balanced boundary exists. Timing scores measure cue duration, reading speed and rapid cue changes. Typography and readability score font scale, declared line spacing, outline, shadow, density and estimated screen coverage. Vertical line spacing is currently planned-only because ASS `Spacing` controls horizontal character spacing; the renderer deliberately leaves that field at zero. Safe-area checks use bottom-control, face and logo metadata as explicit heuristics.

Keyword highlights are locale-normalized and explainable. Numbers, money, percentages, dates, questions, exclamations, calls to action and source emphasis produce categorized evidence; no network or generative inference participates in scoring.

## Profiles and rendering

Shorts, TikTok, Reels, Documentary, Podcast, Cinematic and Minimal profiles resolve to bounded parameters. The ASS renderer reads font family, size, weight, text/highlight/background colors, position, stroke and shadow directly from `SubtitleStyle`. Cue emphasis drives the rendered highlight. Fade, pop, karaoke and word-highlight are implemented. Slide, scale, bounce and word-reveal remain planned-only and never change preview score, manifest fingerprints or render output.

The capability registry is the shared source for planning, preview, apply and UI. A plan-only operation cannot be enabled or forced through approval.

## Safety and transactions

Preview is mandatory and bound to the exact plan, source revision, canonical fingerprint and approved operation set. Apply performs an immutable transform, clears stale validation and installs the validated candidate manifest. Project-scoped operation leases serialize subtitle analysis, preview, apply, undo and redo against other visual mutable operations. Revision moves commit store state before manifest installation and roll back on installation failure, so partial state is not retained.

Subtitle style, cue timing, line layout and emphasis are included in canonical and scene fingerprints. Consequently only affected scenes are invalidated, while unchanged segments remain cache-reusable.

## Render layout and persisted revisions

Highlight and karaoke enrichment use the same newline-aware subtitle token stream. Word tags are inserted without trimming or rebuilding whitespace; CRLF is normalized to LF and every explicit line boundary becomes the corresponding ASS `\\N` boundary. The line-breaking engine therefore remains the source of truth for preview, density analysis and rendered layout.

Top and bottom ASS alignments use a shared orientation-aware safe-area margin: 9.5% for portrait output and 6.5% for landscape output. Top alignment measures this value from the top, while bottom alignment measures the same value from the bottom. Notch and platform-overlap heuristics continue to produce reposition operations before render.

Persisted subtitle revision state includes the active snapshot, revision ID, canonical fingerprint metadata, bounded history, redo stack and quarantined revisions. Hydration recomputes every snapshot fingerprint, validates project/revision bindings and revision ancestry, reconstructs legacy history-only records, and removes invalid redo chains. Valid history remains usable for undo and redo after restart.

Preview operations form an explicit coordinator family. For one project, a newer visual or subtitle preview atomically supersedes the current preview lease and invokes its abort handler; analysis, apply and revision operations remain exclusive. Request generations and approval signatures ensure only the newest subtitle preview can commit, while token-matched release makes stale cleanup harmless.
