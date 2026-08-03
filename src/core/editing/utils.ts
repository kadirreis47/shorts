export function stableHash(value: string): string { let hash = 2166136261; for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return (hash >>> 0).toString(36); }
export function stableId(prefix: string, value: string): string { return `${prefix}-${stableHash(value)}`; }
export function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
export function assertNotAborted(signal?: AbortSignal): void { if (signal?.aborted) { const error = new Error('Editing operation aborted.'); error.name = 'AbortError'; throw error; } }
export function deepClone<T>(value: T): T { return structuredClone(value); }
