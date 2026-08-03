# Sprint 6.8.3 — Subtitle Synchronization Engine

- Scene text is converted into frame-aligned word timestamps.
- Punctuation-aware duration weighting improves estimated speech rhythm.
- Words are grouped into render-ready subtitle cues.
- Cue limits support short-form mobile readability.
- Emphasis words, line counts and animation-ready metadata are included.
- Subtitle metrics expose WPM, coverage and estimated alignment confidence.
- Render Manifest schema is upgraded to 1.2.
- Subtitle clips are generated from cues instead of one clip per scene.

The current alignment source is deterministic estimation. A future STT adapter can replace
these timings with Whisper/Deepgram word timestamps without changing the render contract.
