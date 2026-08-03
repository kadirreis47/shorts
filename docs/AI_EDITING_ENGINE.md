# AI Editing Engine Architecture

Epic 7.2 is deterministic and heuristic. The existing `RenderManifest` is the timeline
source of truth; `TimelineSnapshot` only wraps it with revision metadata.

```text
DirectorReport V2 + current RenderManifest
  -> Edit Plan Compiler
  -> planner parameters and conflict diagnostics
  -> immutable TimelineSnapshot dry-run
  -> EditPreview
  -> explicit approval
  -> TimelineRevision and bounded undo/redo
```

Project identity and revision must match. Preview is mandatory, unresolved critical
conflicts block apply, and manual operations require explicit approval. B-roll plans do
not fetch media. Score impact and cache reuse values are heuristic estimates, not ML.

## Manifest revision fingerprints

Timeline snapshots use the version 2 canonical manifest fingerprint. Object keys are
sorted, while semantically significant array order is preserved. Scenes, assets and
asset metadata, tracks and complete clips, subtitles and words, audio and automation,
render settings, timeline metrics, markers and editable project metadata are included.
Top-level `createdAt` and the derived `validation` report are excluded because they do
not alter editable/rendered content; validation is bound separately to the resulting
fingerprint. Snapshots without the current fingerprint version are treated as stale and
persisted version 2 history is not restored into the active undo/redo chain.

Timeline transforms reuse the media builders' timeline, subtitle and audio metric
calculators. Apply, undo and redo first preserve the edited manifest as unvalidated,
then run `validateMediaProject`; a successful report restores render readiness, while
an unsuccessful report remains visible without discarding the edit.

Edit-plan creation accepts a Director report only when its project identity, binding
version and analyzed canonical manifest fingerprint exactly match the current manifest.
Build timestamps are not used as revision evidence. Legacy unbound reports and reports
from pre-edit revisions remain readable but require a new Director analysis before plan
creation. Revision history controls remain available after apply even though the preview
is intentionally cleared.

Editing retime uses the media timeline builder's transition-overlap normalization:
incoming scenes start at the previous end minus their valid, frame-aligned overlap.
Structural edits also retime scene-linked and global markers, deterministically sort
them, update transition marker metadata and validate marker identity, ownership and
timeline bounds together with scenes and clips.

Revision IDs include the resulting manifest fingerprint, so parameter variants of the
same operation cannot collapse into one history entry. Hydration and undo/redo verify
embedded snapshots against their fingerprints; invalid revisions are quarantined.
Compiled dependencies are ordered deterministically and dependent operations are
skipped unless their prerequisites were applied in the same transform.
