# AI Director Engine Architecture — Report V2

## Scope

AI Director Engine 7.1 is a deterministic heuristic intelligence suite. It does not
call an LLM, an external AI provider, or claim machine-learning prediction.

## Data flow

```text
RenderManifest
  -> DirectorApplicationService / createDirectorInput
  -> DirectorInput
  -> Hook Analyzer
  -> Pace Analyzer
  -> Visual Potential Analyzer
  -> Emotion / Clarity / Continuity Analyzers
  -> Retention Heuristic Analyzer
  -> normalized scene scores and recommendations
  -> Scene Ranking / Heuristic Risk Map / Edit Decision Planner
  -> versioned DirectorReport V2
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

The Director Monitor maps lifecycle events into the size-limited, versioned
Zustand report store. React views use the store and an application-configured
controller; they do not resolve the DI container. The AI Director view is loaded
through the existing lazy view registry and can export the current report as JSON.

## Report V2 and edit decisions

Report V2 retains the Sprint 7.0 score and recommendation fields while adding an
executive summary, dimension analyses, emotional arc, scene ranking, retention
risk segments, moments and an edit decision plan. The executive summary is
template-based. Edit decisions are advisory, include evidence/confidence and
conflict metadata, and are never automatically applied to a RenderManifest.

## Current limitations

- No semantic model or provider inference.
- No learned personalization or feedback loop.
- No automatic timeline or RenderManifest mutation.
- No learned retention probability; the risk map only expresses heuristic risk.
- Heuristics depend on the completeness of scene, asset, motion, and timeline metadata.
