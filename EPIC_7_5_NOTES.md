# Epic 7.5 — AI Subtitle & Typography Intelligence

- Reused the canonical subtitle word, cue and style timeline in `RenderManifest`.
- Added deterministic line breaking, timing, typography, readability, density, highlight and safe-area analyzers.
- Added seven parameterized caption profiles and a central render capability registry.
- Added immutable preview/apply transforms for split, merge, resize, reposition, restyle, highlight, timing, supported animation, stroke and shadow operations.
- Bound ASS output directly to canonical subtitle style and emphasis parameters.
- Kept unsupported animation modes planned-only with no fake score, fingerprint or rerender effect.
- Added project-scoped concurrency guards, validated manifest installation, revision history and atomic undo/redo rollback.
- Added the lazy-loaded AI Subtitle Studio with explicit approval, mandatory preview and JSON export.
- Preserved explicit cue line boundaries and duplicate spacing through highlight and karaoke ASS enrichment.
- Corrected top ASS placement with symmetric portrait/landscape safe-area margins shared by render layout.
- Versioned subtitle persistence now restores snapshot, revision/fingerprint bindings, history and redo state; invalid revisions are quarantined during hydration.
- Subtitle previews now use centralized latest-request-wins leases: a new approval safely aborts and supersedes the active preview, and stale aborts are not surfaced as user errors.
- Vertical subtitle `lineSpacing` is explicitly planned-only until a renderer-supported line layout exists; ASS `Spacing` remains zero because it controls horizontal character spacing.
- Split/merge cue operations now publish deterministic old-to-new mappings so approved keyword highlights follow their word IDs through preview, apply, undo and redo.
- Subtitle CTA, currency and punctuation matching now uses real UTF-8 literals with NFC and Turkish `tr-TR` normalization; mojibake source literals are rejected by regression tests.
- Planner and transform now share split eligibility; oversized three-word cues use safe 1|2 or 2|1 boundaries, while unsafe cues do not receive an unappliable split recommendation.
