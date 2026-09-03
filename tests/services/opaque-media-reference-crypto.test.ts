import { describe, expect, it } from 'vitest';
import {
  decodeMediaAnalysisSecret,
  openMediaAnalysisCapability,
  sealMediaAnalysisCapability,
  type MediaAnalysisCapability,
} from '../../supabase/functions/_shared/media-analysis-reference-crypto';

function encodedSecret(offset = 0): string {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (index + offset) % 256);
  return `omr-secret-v1.${Buffer.from(bytes).toString('base64url')}`;
}
const payload: MediaAnalysisCapability = {
  v: 1, s: 'semantic-image-analysis', m: 'image', b: 'media',
  p: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png',
  o: '00000000-0000-4000-8000-000000000001', oid: '00000000-0000-4000-8000-000000000003',
  ov: 'storage-version-1', oe: 'etag-1', ou: '2026-08-27T00:00:00.000Z', oz: 1024, oct: 'image/png', iat: 1_000, exp: 1_300,
};

describe('opaque media reference cryptography', () => {
  it('requires an explicitly encoded 32-byte high-diversity secret', () => {
    expect(decodeMediaAnalysisSecret(encodedSecret())).toHaveLength(32);
    for (const weak of ['password-password-password-password', `omr-secret-v1.${'a'.repeat(43)}`, `omr-secret-v1.${Buffer.from(new Uint8Array(32)).toString('base64url')}`]) {
      expect(() => decodeMediaAnalysisSecret(weak)).toThrow(/invalid-secret/u);
    }
  });

  it('uses unique runtime nonces and authenticates every capability field', async () => {
    const first = await sealMediaAnalysisCapability(payload, encodedSecret());
    const second = await sealMediaAnalysisCapability(payload, encodedSecret());
    expect(first).not.toBe(second);
    expect(first.split('.')[1]).toHaveLength(16);
    await expect(openMediaAnalysisCapability(first, encodedSecret())).resolves.toEqual(payload);
    const tampered = first.slice(0, -1) + (first.endsWith('a') ? 'b' : 'a');
    await expect(openMediaAnalysisCapability(tampered, encodedSecret())).rejects.toThrow(/invalid-reference/u);
    await expect(openMediaAnalysisCapability(first, encodedSecret(1))).rejects.toThrow(/invalid-reference/u);
  });

  it('preserves a distinct encrypted spatial capability scope', async () => {
    const spatial = { ...payload, s: 'spatial-image-analysis' as const };
    const reference = await sealMediaAnalysisCapability(spatial, encodedSecret());
    await expect(openMediaAnalysisCapability(reference, encodedSecret())).resolves.toEqual(spatial);
  });

  it('rejects oversized, unversioned, or structurally incomplete tokens before use', async () => {
    await expect(openMediaAnalysisCapability('omr1.short.bad', encodedSecret())).rejects.toThrow(/invalid-reference/u);
    await expect(openMediaAnalysisCapability(`omr1.${'a'.repeat(16)}.${'b'.repeat(4097)}`, encodedSecret())).rejects.toThrow(/invalid-reference/u);
  });
});
