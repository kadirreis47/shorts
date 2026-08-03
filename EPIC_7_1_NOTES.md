# Epic 7.1 — AI Director Intelligence Suite

## Scope

Epic 7.1 extends the deterministic Sprint 7.0 foundation with emotion, clarity,
continuity and advanced hook analysis. It adds stable scene ranking, a heuristic
retention risk map, conflict-aware edit planning and the versioned Director Report V2.

## Application integration

- Director lifecycle events feed a versioned Zustand report store through a monitor.
- Persisted reports are limited to 1 MB; manifests are not persisted by this store.
- The AI Director view is lazy-loaded and supports empty, progress, error and report states.
- Studio can start analysis from the current RenderManifest and navigate to the report.
- Reports can be exported as JSON. Edit decisions remain advisory and are not applied.

## Quality and boundaries

All algorithms are deterministic and explainable heuristics. There is no LLM/API
call, machine-learning inference or claimed retention prediction. Analyzer failures
remain isolated by the existing engine diagnostics and AbortSignal remains terminal.

The UI test stack has no React component harness; therefore Epic UI behavior is kept
thin and covered through store/monitor and report contract tests without adding a
heavy testing dependency solely for this screen.
