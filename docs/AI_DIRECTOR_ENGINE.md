# AI Director Engine Architecture

## Scope

AI Director Engine 7.0.0 is a deterministic heuristic foundation. It does not
call an LLM, an external AI provider, or claim machine-learning prediction.

## Data flow

```text
RenderManifest
  -> DirectorApplicationService / createDirectorInput
  -> DirectorInput
  -> Hook Analyzer
  -> Pace Analyzer
  -> Visual Potential Analyzer
  -> Retention Heuristic Analyzer
  -> normalized scene scores and recommendations
  -> DirectorReport
```

The application service owns the Media/Render adaptation and lifecycle events.
The core engine depends only on Director domain contracts.

## Scoring

All scores and confidence values are normalized to 0–100. The immutable default
weights cover hook, clarity, emotion, pacing, visual potential, motion,
retention, and continuity. `DirectorEngineOptions.weights` can override them;
the engine normalizes the final weight set before calculating scene totals.

Analyzer results replace the provisional baseline for the dimensions they own.
Analyzer failures become diagnostics and do not discard successful analysis.
Abort errors remain terminal and are propagated to the application service.

## Determinism

- Analyzer execution order is fixed.
- Recommendation IDs use a stable content hash.
- Deduplication and priority ordering use explicit deterministic sort keys.
- Reports use the input creation timestamp rather than wall-clock analysis time.
- The report contains JSON-serializable values only.

## Integration

`DirectorEngine` and `DirectorApplicationService` are registered as application
singletons in the existing DI container. Lifecycle reporting uses the existing
typed application Event Bus. No parallel service locator or event system exists.

## Current limitations

- No semantic model or provider inference.
- No learned personalization or feedback loop.
- No UI surface.
- Heuristics depend on the completeness of scene, asset, motion, and timeline metadata.
