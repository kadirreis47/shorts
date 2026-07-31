# Sprint 6.8.3a — Subtitle ES2021 Compatibility Fix

## Fix
Replaced `Array.prototype.at(-1)` with an ES2021-compatible indexed lookup.

Before:
```ts
const durationMs = scenes.at(-1)?.endMs ?? 0;
```

After:
```ts
const durationMs = scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0;
```

This preserves runtime behavior and removes the TypeScript lib target incompatibility.
