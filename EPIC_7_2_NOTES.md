# Epic 7.2 — AI Editing Engine

- Added editing contracts, compiler, planners, transform, preview and revisions.
- Added project/revision stale checks and explicit approval boundaries.
- Added persistent bounded undo/redo, Event Bus lifecycle, DI service and monitor.
- Added lazy AI Editor UI and Director-to-Editor navigation.
- Added deterministic planner, transform, store and service tests.
- Revision fingerprint v2 canonically covers the complete editable manifest; older
  persisted fingerprints are invalidated instead of being trusted during hydration.
- Apply, undo and redo preserve the edited manifest, recalculate media metrics and run
  the existing validation pipeline before exposing it as render-ready.
- AI Editor keeps revision controls accessible after apply, and edit planning rejects
  Director reports not bound to the exact current canonical manifest fingerprint.
- Editing retime preserves valid transition overlaps and synchronizes timeline markers
  across remove, trim, split and reorder operations.
- Revision IDs include output fingerprints; corrupted persisted undo/redo entries are
  quarantined, and compiled operation dependencies are enforced during transform.

No ML editing, external asset search or hidden manifest mutation is performed. Plans
are previewed and only applied after user confirmation.
