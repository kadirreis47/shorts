import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchImages, searchVideos } = vi.hoisted(() => ({ searchImages: vi.fn(), searchVideos: vi.fn() }));

vi.mock('@/lib/api', () => ({ searchImages, searchVideos }));

import { createPexelsVisualDiscoveryProvider } from '@/services/pexelsVisualDiscoveryProvider';

describe('Pexels visual discovery preview boundary', () => {
  beforeEach(() => {
    searchImages.mockReset();
    searchVideos.mockReset();
  });

  it('keeps image delivery URLs session-only while exposing a URL-free planning candidate', async () => {
    searchImages.mockResolvedValue([{ id: 42, url: 'https://images.pexels.com/temporary-preview.jpg', alt: 'Vertical archive room' }]);
    const provider = createPexelsVisualDiscoveryProvider();
    const [candidate] = await provider.search({ query: 'archive room', mediaType: 'image', limit: 3 });

    expect(candidate).toMatchObject({ candidateId: 'pexels:image:42', provider: 'pexels', providerMediaIdentity: '42', mediaType: 'image' });
    expect(JSON.stringify(candidate)).not.toContain('temporary-preview');
    expect(provider.resolvePreview(candidate.candidateId)).toBe('https://images.pexels.com/temporary-preview.jpg');
    expect(createPexelsVisualDiscoveryProvider().resolvePreview(candidate.candidateId)).toBeUndefined();
  });

  it('keeps video previews outside the normalized candidate contract', async () => {
    searchVideos.mockResolvedValue([{ id: 9, preview: 'https://videos.pexels.com/temporary-preview.jpg', width: 1080, height: 1920, duration: 4.2 }]);
    const provider = createPexelsVisualDiscoveryProvider();
    const [candidate] = await provider.search({ query: 'industrial corridor', mediaType: 'video', limit: 3 });

    expect(candidate).toMatchObject({ candidateId: 'pexels:video:9', mediaType: 'video', orientation: 'portrait', durationMs: 4200 });
    expect(JSON.stringify(candidate)).not.toContain('temporary-preview');
    expect(provider.resolvePreview(candidate.candidateId)).toBe('https://videos.pexels.com/temporary-preview.jpg');
  });

  it('logs only a bounded provider failure classification', async () => {
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    searchImages.mockRejectedValueOnce(new Error('provider URL https://private.example must not leak'));
    const provider = createPexelsVisualDiscoveryProvider();
    await expect(provider.search({ query: 'safe concept', mediaType: 'image', limit: 3 })).rejects.toThrow(/private/i);
    expect(diagnostic).toHaveBeenCalledWith('[premium-visual-discovery]', { code: 'VISUAL_DISCOVERY_PROVIDER_REQUEST_FAILED', mediaType: 'image' });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private.example');
    diagnostic.mockRestore();
  });
});
