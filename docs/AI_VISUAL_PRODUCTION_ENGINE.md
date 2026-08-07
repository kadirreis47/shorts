# AI Visual Production Engine

Epic 7.4 provides deterministic, explainable visual analysis and planning on the existing `RenderManifest`. It does not create another timeline or render system.

## Capability contract

`capabilities.ts` is the source of truth shared by planning, preview, apply, UI and JSON output. Every operation has one support level:

- `implemented`: the operation changes a render-relevant manifest field and is supported by the production renderer.
- `planned-only`: analysis and planning are available, but approval cannot make the operation render.
- `unsupported`: neither planning nor rendering is available for the current contract.

Execution results separately report `applied`, `planned-only`, `skipped` or `rejected`. An operation is `applied` only when it changes manifest/render behavior. Planned-only and rejected operations do not increase the preview score, invalidate scene render cache, create a revision or change the manifest fingerprint.

Current implemented operations are evidence-bound stabilize, brightness, contrast, zoom, slow zoom and deterministic color grade. Reframe is planned-only until crop/position/scale have a complete renderer contract. Background blur is also planned-only until foreground segmentation or a subject-mask contract exists; it is never replaced with a misleading full-frame blur. Crop is unsupported.

Static camera motion and unstable motion are separate concepts. A scene whose camera motion is `none` receives a stable motion score and is never offered stabilization. Stabilize is eligible only for a non-static scene with declared shake above the stability threshold; the operation carries that instability evidence and changes the supported camera-motion contract when approved.

Color grading has one shared profile resolver for cinematic, vibrant, documentary, social and dramatic styles. The stored operation profile and bounded intensity directly determine brightness, contrast, saturation and gamma values by interpolation from neutral. Plan parameters, preview before/after estimates, JSON output and the FFmpeg `eq` filter therefore describe the same effect. Unknown profiles are rejected by preview/apply and diagnosed by the renderer rather than receiving a fabricated fallback.

## Effect ownership and cache scope

Visual operations are `scene` scoped by default. Filter state is stored on the existing scene-linked video clip metadata, not on shared asset metadata. The segment renderer and scene fingerprint read that same clip state. Reusing one asset in multiple scenes therefore does not leak an effect into other scenes or invalidate their fingerprints.

An operation may explicitly declare `asset-global` scope. The shared asset itself remains immutable; the engine resolves every scene referencing it, writes the operation to each corresponding scene clip and invalidates all affected scene segments plus transition-overlap dependencies. UI and JSON output expose the scope.

Legacy Epic 7.4 `asset.metadata.visualProduction` entries are intentionally ignored by the renderer so they cannot be applied twice or leak across scenes. Manual and immutable source asset metadata is preserved. Visual plans/previews are transient, so no persisted-plan migration is required.

Scene-level visual operations are canonicalized by `operationId` before fingerprinting and rendering. Identical metadata copies across multiple scene clips produce one effective operation and one FFmpeg filter in deterministic operation-ID order. If copies with the same identity disagree on type, scope or parameters, rendering is rejected with an explicit invariant diagnostic instead of choosing or compounding a payload. The current contract supports `scene` and explicit `asset-global` ownership; it does not model clip-specific effects.

## B-roll

B-roll analysis continues to produce insert, overlay and cutaway opportunities. Overlay execution is planned-only because this version performs no external asset search, asset resolution or asset insertion. Approval therefore produces an explicit planned-only diagnostic and cannot add hidden assets or overlays to the manifest.

## Exposure

The analyzer uses normalized brightness with a safe range of `0.22..0.86`. Under-exposure produces a positive FFmpeg `eq` brightness delta; over-exposure produces a negative delta. Magnitude grows deterministically with distance from the nearest threshold and is clamped to `0.04..0.15`. Preview records before, after and delta values, and apply uses exactly the same parameters.

## Safety

Plans bind to the canonical manifest fingerprint and current timeline revision. Apply requires an exact preview for the same approval set and capability result. Transforms are immutable, validation is cleared after a real edit and rerun by the existing application controller. Existing revision history provides undo and redo.

Visual apply, undo and redo use optimistic concurrency against the active manifest as the single source of truth. The controller checks project identity and canonical fingerprint before asynchronous work and again immediately before installation. If Director, Editing, Audio or another subsystem changes the manifest during that window, the visual result is rejected, the newer manifest is preserved and visual history is rebuilt from that current manifest. Stale restored history is never treated as current without a matching working snapshot.

Undo and redo are transactional. The store prepares an immutable candidate move; after the completion event and final binding validation, history, redo stack and the working snapshot are committed immediately before synchronous manifest installation. Event, validation, concurrency or installation failures leave revision state unchanged. AI Visual Studio catches asynchronous revision failures, displays the user-facing error and prevents overlapping undo/redo actions.

All mutable visual operations use a project-scoped coordinator with explicit analyzing, previewing, applying, undoing and redoing leases. Analysis, apply and revision movement cannot overlap for the same project; a conflicting controller call fails with a visible “visual operation in progress” error. A newer preview may supersede an older preview for latest-request-wins behavior, but preview work remains mutually exclusive with the other operation types. Request generations remain responsible for stale async results, while the coordinator protects transaction boundaries.

Undo/redo captures both manifest and visual revision bindings, runs its completion event, revalidates both bindings and prepares validation before committing the candidate store state. Manifest installation follows synchronously. If installation fails after the store commit, the complete visual revision state is rolled back; media state is restored only when the candidate was actually installed, so unrelated concurrent subsystem changes are never overwritten. A rejected event, changed binding or failed store commit performs no manifest installation and leaves no partial persisted transaction state.

Preview requests use latest-request-wins ordering. Every request carries a monotonic generation plus project, plan-state signature, source revision/fingerprint and canonical approval signature. Starting a newer request aborts its predecessor; store completion and failure transitions independently reject stale identities even when cancellation is ignored. Approval or plan changes immediately invalidate the visible preview, and Apply accepts only the current approval-bound preview after loading completes.

Visual analysis uses the same latest-request-wins principle with its own identity domain. Each analysis carries a monotonic request ID and source project, revision and canonical manifest fingerprint. A newer analysis aborts its predecessor when supported; controller binding checks and store-owned completion/failure guards reject stale results when cancellation is ignored. Stale requests cannot restore a plan, replace a snapshot, close a newer loading state or overwrite its error. JSON export therefore reads only the currently committed plan and preview.

AI Visual Studio is safe under React StrictMode's setup/cleanup/setup development lifecycle. Every effect setup restores the mounted flag, while a separate mount-cycle token prevents an async continuation from an older lifecycle from updating local loading state after a remount. Unmount cancels active analysis and preview work. Mounted state is not used as the analysis request generation; ordering remains owned by the controller and store identities.

Visual keyword matching normalizes narration and prompts with Unicode NFKC and Turkish locale-aware lowercase before whole-token matching. Turkish `nasıl`, `çünkü` and `sonuç`, including supported uppercase forms, remain real UTF-8 text; English keywords retain their existing behavior.
# Platform adapter note

Platform variants reuse scene-local visual capability checks. Segmentation-dependent background blur and unsupported reframe remain planned-only; source assets are never mutated.
