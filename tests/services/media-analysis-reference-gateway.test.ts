import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  issueMediaAnalysisReference,
  resolveMediaAnalysisReference,
} from '../../supabase/functions/_shared/media-analysis-reference-gateway';

const OWNER_A = '00000000-0000-4000-8000-000000000001';
const OWNER_B = '00000000-0000-4000-8000-000000000002';
const PATH = `${OWNER_A}/generated-images/00000000-0000-4000-8000-000000000003.png`;
const NOW = 1_800_000_000_000;
const STORAGE_AUTHORITY = { supabaseUrl: 'https://shortsflow-test.supabase.co', serviceRoleKey: 'service-role-test' } as const;
const EVIDENCE = {
  id: '00000000-0000-4000-8000-000000000004', version: 'version-1', etag: 'etag-1',
  updatedAt: '2026-09-03T00:00:00.000Z', size: png(10, 20).byteLength, contentType: 'image/png',
} as const;

afterEach(() => vi.unstubAllGlobals());

describe('media analysis reference gateway runtime boundary', () => {
  it('derives geometry from validated owned bytes for the exact spatial scope', async () => {
    const bytes = png(10, 20);
    const fetchImpl = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength) } }));
    vi.stubGlobal('fetch', fetchImpl);
    const reference = await issueMediaAnalysisReference(service(EVIDENCE), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'spatial-image-analysis' }, encodedSecret(), NOW);
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, reference.reference, 'spatial-image-analysis', encodedSecret(), NOW + 1_000)).resolves.toMatchObject({
      mediaType: 'image', mediaIdentity: `media:${PATH}`, contentType: 'image/png', bytes, width: 10, height: 20, exifOrientation: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const geometryReference = await issueMediaAnalysisReference(service(EVIDENCE), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'image-display-geometry' }, encodedSecret(), NOW);
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, geometryReference.reference, 'image-display-geometry', encodedSecret(), NOW + 1_000)).resolves.toMatchObject({
      mediaType: 'image', mediaIdentity: `media:${PATH}`, width: 10, height: 20, exifOrientation: 1,
    });
  });

  it('rejects malformed, cross-user, and cross-scope capabilities before reading bytes', async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl);
    const spatial = await issueMediaAnalysisReference(service(EVIDENCE), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'spatial-image-analysis' }, encodedSecret(), NOW);
    const semantic = await issueMediaAnalysisReference(service(EVIDENCE), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'semantic-image-analysis' }, encodedSecret(), NOW);
    const geometry = await issueMediaAnalysisReference(service(EVIDENCE), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'image-display-geometry' }, encodedSecret(), NOW);
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, 'malformed', 'spatial-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'invalid-reference' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_B, spatial.reference, 'spatial-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'invalid-reference' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, spatial.reference, 'semantic-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'scope-mismatch' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, semantic.reference, 'spatial-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'scope-mismatch' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, geometry.reference, 'semantic-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'scope-mismatch' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, geometry.reference, 'spatial-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'scope-mismatch' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, semantic.reference, 'image-display-geometry', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'scope-mismatch' });
    await expect(resolveMediaAnalysisReference(service(EVIDENCE), STORAGE_AUTHORITY, OWNER_A, spatial.reference, 'image-display-geometry', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'scope-mismatch' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects cross-owner paths and unsupported stored media types at issuance', async () => {
    await expect(issueMediaAnalysisReference(service(EVIDENCE), OWNER_B, { media: { bucket: 'media', objectPath: PATH }, scope: 'spatial-image-analysis' }, encodedSecret(), NOW)).rejects.toMatchObject({ reason: 'media-not-eligible' });
    await expect(issueMediaAnalysisReference(service({ ...EVIDENCE, contentType: 'video/mp4' }), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'spatial-image-analysis' }, encodedSecret(), NOW)).rejects.toMatchObject({ reason: 'media-not-eligible' });
  });

  it('rejects immutable metadata changes across the bounded byte read', async () => {
    const bytes = png(10, 20);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength) } })));
    const reference = await issueMediaAnalysisReference(service(EVIDENCE), OWNER_A, { media: { bucket: 'media', objectPath: PATH }, scope: 'spatial-image-analysis' }, encodedSecret(), NOW);
    await expect(resolveMediaAnalysisReference(serviceSequence([EVIDENCE, { ...EVIDENCE, etag: 'etag-replaced' }]), STORAGE_AUTHORITY, OWNER_A, reference.reference, 'spatial-image-analysis', encodedSecret(), NOW + 1_000)).rejects.toMatchObject({ reason: 'invalid-reference' });
  });
});

function service(evidence: Record<string, unknown>) {
  return serviceSequence([evidence]);
}

function serviceSequence(evidence: readonly Record<string, unknown>[]) {
  let call = 0;
  return {
    storage: { from: () => ({ info: async () => ({ data: evidence[Math.min(call++, evidence.length - 1)], error: null }) }) },
  } as never;
}

function encodedSecret(): string {
  return `omr-secret-v1.${Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url')}`;
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(58); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  set32(bytes, 16, width); set32(bytes, 20, height); bytes.set([8, 2, 0, 0, 0], 24); set32(bytes, 29, crc32(bytes.slice(12, 29))); bytes.set([0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0], 33); set32(bytes, 42, crc32(bytes.slice(37, 42))); bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 46); return bytes;
}
function set32(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
