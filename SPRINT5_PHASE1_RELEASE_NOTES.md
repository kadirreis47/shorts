# ShortsFlow Sprint 5 Phase 1

## Studio draft foundation

- Added automatic local draft persistence for Studio.
- Drafts restore after application restart.
- Added 650 ms debounced saving to avoid excessive writes.
- Added visible saved/saving/empty status.
- Added a reset action that clears the current draft and transient media state.
- Persisted core workflow state: topic, script, scenes, style, voice and subtitle settings.
- Kept Blob/object URL media out of localStorage because those values cannot be restored safely.

## Verification

- `npm run typecheck`: passed.
- `node --check scripts/electron-dev.cjs`: passed.
- Linux production build could not be executed from the uploaded Windows `node_modules` tree (`vite: Permission denied`). Run `npm run build` on Windows after applying the patch.
