# Sprint 6.8.2 — Asset Provider Engine

- Provider-independent asset search contracts and routing
- Existing scene media and Pexels provider adapters
- Scene-aware query generation
- Candidate scoring for relevance, orientation, resolution, duration, type and license
- Duplicate prevention across scenes
- In-memory TTL search cache
- Provider fallback and failure isolation
- Asset resolution report with provider usage and cache statistics
- Typed asset observability events

The renderer remains independent from providers. New providers can be added through the `AssetProvider` contract without changing timeline or manifest code.
