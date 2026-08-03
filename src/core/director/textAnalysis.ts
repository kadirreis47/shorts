export function tokenizeDirectorText(text: string): string[] {
  return text.toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function sentenceWordCounts(text: string): number[] {
  return text.split(/[.!?]+/u).map((sentence) => tokenizeDirectorText(sentence).length).filter(Boolean);
}

export function tokenOverlap(left: string, right: string): number {
  const a = new Set(tokenizeDirectorText(left));
  const b = new Set(tokenizeDirectorText(right));
  if (a.size === 0 || b.size === 0) return 0;
  const matches = [...a].filter((token) => b.has(token)).length;
  return matches / Math.max(a.size, b.size);
}

export function includesPhrase(text: string, phrases: readonly string[]): boolean {
  const normalized = ` ${tokenizeDirectorText(text).join(' ')} `;
  return phrases.some((phrase) => normalized.includes(` ${tokenizeDirectorText(phrase).join(' ')} `));
}
