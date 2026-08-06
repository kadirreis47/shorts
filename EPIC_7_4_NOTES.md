# Epic 7.4 — AI Visual Production Engine

- Added deterministic, explainable composition, motion, continuity, heuristic quality, first-three-second hook and text-readability analysis.
- Added platform/aspect safety evidence, B-roll opportunity analysis and non-destructive color-grade planning.
- Added immutable visual improvement operations backed by the existing `RenderManifest` and segment renderer; no parallel timeline or render system was introduced.
- Apply requires an exact current preview and explicit per-operation approval.
- Reused canonical manifest fingerprints, timeline revisions, validation, DI and the application Event Bus.
- Added persisted revision history with undo/redo and a lazy-loaded AI Visual Studio with scores, recommendations, operations, preview and JSON export.
- Added deterministic regression coverage for risk classification, stale-plan rejection, immutability, approval binding and render-filter integration.
- Added a central operation capability registry shared by preview, apply, UI and JSON export.
- Reframe and B-roll overlay are explicitly plan-only and never change the manifest, score estimate, render invalidation or applied-operation list.
- Applied operations now mean a production manifest/render behavior actually changed; skipped, rejected and plan-only outcomes carry user-facing diagnostics.
- Corrected exposure direction with bounded positive deltas for under-exposure and negative deltas for over-exposure, including preview before/after estimates.
- Scoped visual filters to existing scene-linked video clip metadata so shared assets remain immutable and effects cannot leak into other scenes.
- Added explicit `scene` and `asset-global` ownership: global operations resolve and invalidate every referencing scene, while scene operations change only the target fingerprint.
- Extended scene fingerprints with scene-local video clip render metadata and aligned preview invalidation with transition-overlap dependencies.
- Legacy asset-level generated visual metadata is render-inert to prevent duplicate or cross-scene effects; manual source metadata remains untouched.
- Added optimistic compare-and-install protection around visual apply, undo and redo, with canonical fingerprint and project checks before work and immediately before installation.
- Concurrent Director, Editing, Audio or other manifest changes are preserved; stale visual results and restored history are rejected and visual history is rebuilt from the current manifest.
- Visual history is recorded as successful only after the candidate manifest passes the final currency check and installation boundary.
- Undo/redo use prepare/commit transactions; rejected events and failed installs do not mutate or persist history, redo state or the working snapshot.
- AI Visual Studio catches revision-action failures, exposes their safe message and blocks duplicate or overlapping undo/redo actions while one is pending.
- Multi-clip scenes canonicalize scene-level visual state by operation ID, producing one deterministic render filter and fingerprint entry per operation.
- Identical stored copies are deduplicated; conflicting copies with the same operation identity reject rendering with an explicit diagnostic.
- Preview generation is latest-request-wins with AbortSignal plus store-level generation and identity checks across project, plan state, manifest revision/fingerprint and canonical approvals.
- Approval changes invalidate the prior preview immediately; stale completions, failures and finalizers cannot replace or clear newer preview state, and Apply requires the current approval signature.
- Visual analysis is latest-request-wins: monotonic request IDs, AbortSignal cancellation and project/revision/manifest-fingerprint guards prevent stale plan, snapshot, loading and error commits.
- AI Visual Studio restores its mounted guard on every StrictMode effect setup and uses a separate lifecycle identity so old async revision work cannot update a later mount.
- Turkish B-roll keywords use real UTF-8 (`nasıl`, `çünkü`, `sonuç`), NFKC normalization, locale-aware casing and whole-token matching.
- Static scenes are treated as stable and never receive unusable stabilization; stabilize requires non-static camera motion plus explicit shake evidence.
- Color-grade profile and intensity now resolve through one bounded map used by plan parameters, preview summaries, JSON and FFmpeg rendering.
- Background blur is planned-only without foreground segmentation or a subject mask; it never emits a full-frame `gblur` substitute. A future full-frame blur would require a separately named operation.
- Visual analysis, preview, apply, undo and redo now share a project-scoped operation coordinator; conflicting operation types fail before changing state, while a newer preview safely supersedes its prior generation.
- Undo/redo revalidates media and visual bindings, commits revision state before synchronous manifest installation and rolls the full store transaction back if installation fails.
- Failed events, stale bindings and rejected commits cannot install a manifest or leave revision history, redo state, plan, preview and media fingerprint partially advanced.

No ML inference, external visual API, B-roll asset insertion, LUT execution or synthetic production path is used.
