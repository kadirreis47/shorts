import type { AssetCandidate, AssetSearchQuery, RankedAssetCandidate } from './assetProviderTypes';

export function rankAssetCandidates(
  candidates: AssetCandidate[],
  query: AssetSearchQuery,
  usedFingerprints: ReadonlySet<string>,
): { ranked: RankedAssetCandidate[]; duplicatesRejected: number } {
  let duplicatesRejected = 0;
  const ranked = candidates.flatMap((candidate) => {
    if (usedFingerprints.has(assetFingerprint(candidate))) {
      duplicatesRejected += 1;
      return [];
    }

    const breakdown = {
      relevance: scoreRelevance(candidate, query),
      orientation: scoreOrientation(candidate, query),
      resolution: scoreResolution(candidate, query),
      duration: scoreDuration(candidate, query),
      type: scoreType(candidate, query),
      license: candidate.license ? 5 : 2,
    };

    return [{
      ...candidate,
      score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      scoreBreakdown: breakdown,
    }];
  });

  ranked.sort((a, b) => b.score - a.score || a.providerId.localeCompare(b.providerId));
  return { ranked, duplicatesRejected };
}

export function assetFingerprint(candidate: Pick<AssetCandidate, 'providerId' | 'id' | 'source'>): string {
  return `${candidate.providerId}:${candidate.id}:${candidate.source}`.toLocaleLowerCase();
}

function scoreRelevance(candidate: AssetCandidate, query: AssetSearchQuery): number {
  const haystack = `${candidate.title ?? ''} ${JSON.stringify(candidate.metadata ?? {})}`.toLocaleLowerCase('tr-TR');
  const matched = query.keywords.filter((keyword) => haystack.includes(keyword)).length;
  const lexical = query.keywords.length ? matched / query.keywords.length : 0;
  return Math.round(Math.min(30, Math.max(candidate.relevance ?? 0, lexical) * 30));
}

function scoreOrientation(candidate: AssetCandidate, query: AssetSearchQuery): number {
  if (!candidate.width || !candidate.height) return 8;
  const candidateRatio = candidate.width / candidate.height;
  const targetRatio = query.targetWidth / query.targetHeight;
  const distance = Math.abs(candidateRatio - targetRatio);
  return Math.round(Math.max(0, 25 - distance * 30));
}

function scoreResolution(candidate: AssetCandidate, query: AssetSearchQuery): number {
  if (!candidate.width || !candidate.height) return 6;
  const widthFit = Math.min(1, candidate.width / query.targetWidth);
  const heightFit = Math.min(1, candidate.height / query.targetHeight);
  return Math.round(((widthFit + heightFit) / 2) * 20);
}

function scoreDuration(candidate: AssetCandidate, query: AssetSearchQuery): number {
  if (!candidate.durationMs || candidate.type === 'image' || candidate.type === 'ai_image') return 8;
  if (candidate.durationMs >= query.minimumDurationMs && candidate.durationMs <= query.maximumDurationMs) return 10;
  const distance = candidate.durationMs < query.minimumDurationMs
    ? query.minimumDurationMs - candidate.durationMs
    : candidate.durationMs - query.maximumDurationMs;
  return Math.max(0, 10 - Math.round(distance / 1_000));
}

function scoreType(candidate: AssetCandidate, query: AssetSearchQuery): number {
  const index = query.preferredTypes.indexOf(candidate.type);
  return index < 0 ? 2 : Math.max(4, 10 - index * 3);
}
