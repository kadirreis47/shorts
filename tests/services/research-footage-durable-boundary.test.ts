import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/research-footage/index.ts', 'utf8');
const diagnosticSource = source.slice(source.indexOf('type ResearchDiagnostic'), source.indexOf('async function readBoundedPexelsSearchJson'));

describe('Research Footage durable provider identity boundary', () => {
  it('searches video before image and returns only bounded provider identities', () => {
    expect(source.indexOf('https://api.pexels.com/videos/search')).toBeLessThan(source.indexOf('https://api.pexels.com/v1/search'));
    expect(source).toContain('kind: "video", mediaId: Number(videoId), query');
    expect(source).toContain('kind: "image", mediaId: Number(photoId), query');
    expect(source).not.toContain('videoUrl:');
    expect(source).not.toContain('imageUrl:');
    expect(source).not.toContain('results.push({ sceneIndex: i, query });');
    expect(source).toContain('scenes.length > 12');
    expect(source).toContain('AbortSignal.timeout(PEXELS_SEARCH_TIMEOUT_MS)');
    expect(source).toContain('MAX_PEXELS_SEARCH_RESPONSE_BYTES');
    expect(source).toContain('await authorizeProtectedFunction(req, "research-footage")');
  });

  it('emits bounded, non-sensitive Edge diagnostics for every research outcome', () => {
    for (const stage of ['request-accepted', 'scene-search-start', 'video-search-result', 'image-fallback-result', 'scene-result-selected', 'scene-no-result', 'batch-complete', 'failure']) {
      expect(diagnosticSource).toContain(`"${stage}"`);
    }
    expect(source).toContain('stage: "batch-complete", requestedSceneCount, resultCount: results.length, videoCount, imageCount, noResultCount');
    expect(source).toContain('providerResultCount: Math.min(videos.length, 12)');
    expect(source).toContain('providerResultCount: Math.min(photos.length, 12)');
    for (const forbiddenField of ['query:', 'mediaId:', 'userId:', 'ownerId:', 'objectPath:', 'quarantine', 'signedUrl', 'token:']) {
      expect(diagnosticSource).not.toContain(forbiddenField);
    }
  });
});
