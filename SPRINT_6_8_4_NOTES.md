# Sprint 6.8.4 — Audio Composition Engine

## Added
- Deterministic voice, music and SFX timeline planning
- Automatic background-music ducking envelopes around narration
- Transition and emphasis marker driven SFX suggestions
- Fade-in/fade-out and per-layer gain metadata
- Audio mix metrics and render-manifest schema 1.3
- Audio timeline event and media-store observability

## Scope
This sprint creates renderer-independent audio composition data. It does not yet decode, mix, normalize or export real audio files. Those operations will be implemented by the render adapter.
