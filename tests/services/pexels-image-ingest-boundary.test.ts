import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolvePexelsImageSource } from '../../supabase/functions/ingest-pexels-image/pexels-image-source';

const source = readFileSync('supabase/functions/ingest-pexels-image/index.ts', 'utf8');
const sourceResolver = readFileSync('supabase/functions/ingest-pexels-image/pexels-image-source.ts', 'utf8');

describe('Pexels image ingest security boundary', () => {
  it('authenticates and accepts only a bounded provider identity and query', () => {
    expect(source).toContain('await authorizeProtectedFunction(req, "ingest-pexels-image")');
    expect(source).toContain('readBoundedJson<IngestRequest>(req, 2_048)');
    expect(source).toContain('mediaId?: unknown; query?: unknown');
    expect(source).not.toContain('parsed.value.url');
    expect(source).not.toMatch(/(?:ownerId|objectPath|bucket)\??:\s*unknown/);
  });

  it('re-resolves the provider image and derives the owner-only destination server-side', () => {
    expect(source).toContain('https://api.pexels.com/v1/photos/${mediaId}');
    expect(source).toContain('`${authorization.userId}/generated-images/${crypto.randomUUID()}.${image.extension}`');
    expect(source).toContain('resolvePexelsImageSource(photo, mediaId)');
  });

  it('acquires Pexels documented large2x rather than a potentially unsafe full-resolution original', () => {
    const resolved = resolvePexelsImageSource({
      id: 42,
      src: {
        original: 'https://images.pexels.com/photos/42/original.jpeg',
        large2x: 'https://images.pexels.com/photos/42/original.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
      },
    }, 42);
    expect(resolved).toEqual({
      originalSourceUrl: 'https://images.pexels.com/photos/42/original.jpeg',
      downloadUrl: 'https://images.pexels.com/photos/42/original.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
      previewUrl: 'https://images.pexels.com/photos/42/original.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    });
  });

  it('does not accept a provider response whose original or bounded download URL escapes the exact image host', () => {
    expect(resolvePexelsImageSource({
      id: 42,
      src: { original: 'https://images.pexels.com/photos/42/original.jpeg', large2x: 'https://images.pexels.com.attacker.example/x.jpg' },
    }, 42)).toBeNull();
    expect(resolvePexelsImageSource({
      id: 42,
      src: { original: 'https://images.pexels.com.attacker.example/x.jpg', large2x: 'https://images.pexels.com/photos/42/large.jpg' },
    }, 42)).toBeNull();
  });

  it('keeps download host, redirect, timeout, byte, MIME, signature, and dimensions bounded', () => {
    expect(source).toContain('MAX_IMAGE_BYTES = 20 * 1024 * 1024');
    expect(source).toContain('MAX_REDIRECTS = 3');
    expect(source).toContain('AbortSignal.timeout(REQUEST_TIMEOUT_MS)');
    expect(source).toContain('redirect: "manual"');
    expect(sourceResolver).toContain('url.hostname === host');
    expect(source).toContain('size > maxBytes');
    expect(source).toContain('contentType === "image/png"');
    expect(source).toContain('contentType === "image/jpeg"');
    expect(source).toContain('assertPngDimensions');
    expect(source).toContain('assertJpegDimensions');
  });

  it('returns storage-backed media with bounded provider provenance rather than a provider render URL', () => {
    expect(source).toContain('media: { bucket: "media", objectPath }');
    expect(source).toContain('providerMediaId: mediaId');
    expect(source).toContain('originalSourceUrl: source.originalSourceUrl');
    expect(source).not.toContain('parsed.value.url');
  });
});
