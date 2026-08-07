# AI Subtitle Intelligence

The production architecture and operational contract for Epic 7.5 are documented in [AI_SUBTITLE_TYPOGRAPHY_INTELLIGENCE.md](./AI_SUBTITLE_TYPOGRAPHY_INTELLIGENCE.md).

Explicit cue line boundaries are preserved through highlight and karaoke rendering. Top and bottom caption placement use symmetric orientation-aware safe-area margins. Subtitle snapshots, canonical fingerprint metadata, history and redo state are validated and restored together so undo and redo remain available after restart; stale revisions are quarantined.

Subtitle previews use project-scoped latest-request-wins semantics. A new approval selection atomically supersedes and aborts the active preview lease before becoming current. Token-bound release prevents an older request from clearing its successor, and an aborted stale preview is not reported as a user error or allowed to change preview/loading state.

Typography settings are resolved once from operation overrides, caption profiles and theme defaults, then shared by preview, JSON export and ASS rendering. Unsupported vertical line spacing is surfaced as planned-only rather than being encoded as a different visual property.

The current ASS/FFmpeg capability registry keeps vertical `lineSpacing` planned-only: ASS `Spacing` is horizontal character spacing, so the renderer leaves it at zero rather than producing a misleading effect. Approved split/merge operations emit deterministic cue mappings, and dependent keyword highlights are remapped by word ID onto the resulting cues before preview and apply.

Subtitle keyword analysis uses NFC normalization and Turkish `tr-TR` casing. CTA, currency and punctuation rules use real UTF-8 code points; mojibake literals are not permitted in production analyzer sources.

Split recommendations and transforms share one eligibility evaluator. Oversized three-word cues may use a deterministic 1|2 or 2|1 split when timing, punctuation and line-length checks pass; unsafe cues receive no split operation.
# Platform adapter note

Epic 7.6 consumes the subtitle profile through the versioned platform registry. Explicit line breaks and Unicode text remain owned by Subtitle Intelligence; unsupported animation or spacing capabilities remain planned-only.
