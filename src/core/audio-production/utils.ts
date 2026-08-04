export function clamp(value: number, min = 0, max = 100): number { return Math.min(max, Math.max(min, value)); }
export function round(value: number, precision = 2): number { const factor = 10 ** precision; return Math.round(value * factor) / factor; }
export function tokenize(value: string): string[] { return value.toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []; }
export function assertActive(signal?: AbortSignal): void { if (signal?.aborted) { const error = new Error('Audio production aborted.'); error.name = 'AbortError'; throw error; } }
