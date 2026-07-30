# ShortsFlow Sprint 4 — Phase 2B

## Dynamic Electron development launcher

- `npm run electron:dev` now finds an available port starting at 5173.
- Vite and Electron use the exact same URL through `SHORTSFLOW_DEV_SERVER_URL`.
- The old `wait-on http://localhost:5173` mismatch is removed.
- If Vite or Electron exits, the companion process is stopped as well.
- Startup failures now include clear console messages and a 30-second timeout.

## Verification

Run on Windows:

```powershell
npm run typecheck
npm run build
npm run electron:dev
```

To verify dynamic-port behavior, keep another Vite process on port 5173 before running `npm run electron:dev`. ShortsFlow should automatically choose 5174 or the next available port and Electron should still open.
