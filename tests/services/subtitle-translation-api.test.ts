import { describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@/lib/api/client', () => ({ apiClient: { post } }));

describe('subtitle translation API result contract', () => {
  it('accepts only the bounded discriminated Edge result', async () => {
    post.mockResolvedValueOnce({ status: 'translated', translatedSrt: '1\n00:00:02,043 --> 00:00:02,345\nHola\n', language: 'Spanish' });
    const { translateSubtitles } = await import('@/lib/api');
    await expect(translateSubtitles({ srt: 'source', targetLanguage: 'es' })).resolves.toEqual({
      status: 'translated', translatedSrt: '1\n00:00:02,043 --> 00:00:02,345\nHola\n', language: 'Spanish',
    });

    post.mockResolvedValueOnce({ status: 'unavailable', reason: 'provider-timeout' });
    await expect(translateSubtitles({ srt: 'source', targetLanguage: 'es' })).resolves.toEqual({
      status: 'unavailable', reason: 'provider-timeout',
    });
  });

  it('rejects malformed and legacy source-SRT fallback responses', async () => {
    const { translateSubtitles } = await import('@/lib/api');
    post.mockResolvedValueOnce({ translatedSrt: '1\n00:00:00,000 --> 00:00:01,000\nSource\n', language: 'Spanish', note: 'fallback' });
    await expect(translateSubtitles({ srt: 'source', targetLanguage: 'es' })).rejects.toThrow(/invalid result/i);

    post.mockResolvedValueOnce({ status: 'translated', translatedSrt: '', language: 'Spanish' });
    await expect(translateSubtitles({ srt: 'source', targetLanguage: 'es' })).rejects.toThrow(/invalid result/i);

    post.mockResolvedValueOnce({ status: 'unavailable', reason: 'provider-body' });
    await expect(translateSubtitles({ srt: 'source', targetLanguage: 'es' })).rejects.toThrow(/invalid result/i);
  });
});
