import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isServerResolvedPexelsVideoUrl,
  isTrustedVideoDownloadUrl,
  selectPexelsVideoCandidate,
} from '../../supabase/functions/ingest-pexels-video/candidate-selector';

const edgeSource = readFileSync('supabase/functions/ingest-pexels-video/index.ts', 'utf8');
const mediaId = 77;
const productionCandidates = [
  { id: 1, width: 720, height: 1280, file_type: 'video/mp4', fps: 30, link: 'https://videos.pexels.com/video-720.mp4' },
  { id: 2, width: 1080, height: 1920, file_type: 'video/mp4', fps: 30, link: 'https://videos.pexels.com/video-1080.mp4' },
];

describe('Pexels video ingest candidate boundary', () => {
  it('accepts the production-shaped missing-quality MP4 candidates and deterministically prefers 1080x1920', () => {
    const selected = selectPexelsVideoCandidate({ id: mediaId, video_files: productionCandidates }, mediaId);
    expect(selected).toEqual({ link: 'https://videos.pexels.com/video-1080.mp4' });
  });

  it('keeps the bounded portrait MP4/FPS contract around the production fixture', () => {
    const invalid = [
      { id: 3, width: 360, height: 640, file_type: 'video/mp4', fps: 30, link: 'https://videos.pexels.com/small.mp4' },
      { id: 4, width: 1440, height: 2560, file_type: 'video/mp4', fps: 30, link: 'https://videos.pexels.com/large.mp4' },
      { id: 5, width: 1080, height: 1920, file_type: 'video/webm', fps: 30, link: 'https://videos.pexels.com/wrong.mp4' },
      { id: 6, width: 1080, height: 1920, file_type: 'video/mp4', fps: 61, link: 'https://videos.pexels.com/fast.mp4' },
    ];
    expect(selectPexelsVideoCandidate({ id: mediaId, video_files: invalid }, mediaId)).toBeNull();
  });

  it('accepts only exact HTTPS server-resolved Pexels initial URLs', () => {
    expect(isServerResolvedPexelsVideoUrl('https://videos.pexels.com/valid.mp4')).toBe(true);
    expect(isServerResolvedPexelsVideoUrl('https://videos.pexels.com.evil.com/valid.mp4')).toBe(false);
    expect(isServerResolvedPexelsVideoUrl('http://videos.pexels.com/valid.mp4')).toBe(false);
    expect(isServerResolvedPexelsVideoUrl('https://attacker@videos.pexels.com/valid.mp4')).toBe(false);
    expect(isServerResolvedPexelsVideoUrl('https://videos.pexels.com/valid.mp4#fragment')).toBe(false);
  });

  it('permits only fixed trusted download redirect hosts', () => {
    expect(isTrustedVideoDownloadUrl('https://videos.pexels.com/initial.mp4')).toBe(true);
    expect(isTrustedVideoDownloadUrl('https://player.vimeo.com/external/redirect.mp4')).toBe(true);
    expect(isTrustedVideoDownloadUrl('https://vod-progressive.akamaized.net/redirect.mp4')).toBe(true);
    expect(isTrustedVideoDownloadUrl('https://evil.example/redirect.mp4')).toBe(false);
  });

  it('keeps provider resolution, bounded diagnostics, and non-canonical quarantine in the Edge boundary', () => {
    expect(edgeSource).toContain('await authorizeProtectedFunction(req, "ingest-pexels-video")');
    expect(edgeSource).toContain('await authorizeProtectedFunction(req, "ingest-pexels-video-cleanup")');
    expect(edgeSource.indexOf('await authorizeProtectedFunction(req, "ingest-pexels-video-cleanup")')).toBeLessThan(edgeSource.indexOf('return discardQuarantine'));
    expect(edgeSource).toContain('selectPexelsVideoCandidate(video, mediaId)');
    expect(edgeSource).toContain('candidateCount: Math.min(rawFiles.length, 100)');
    expect(edgeSource).toContain('rawFiles.slice(0, 10).map(describeCandidate)');
    expect(edgeSource).toContain('`${ownerId}/${QUARANTINE_PREFIX}/${quarantineId}.mp4`');
    expect(edgeSource).toContain('https://api.pexels.com/v1/videos/videos/${mediaId}');
    expect(edgeSource).not.toContain('body.url');
    expect(edgeSource).not.toContain('`${ownerId}/videos/');
  });
});
