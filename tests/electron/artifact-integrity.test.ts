import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { hashFileSha256, revalidateVerifiedArtifact } = require('../../electron/artifact-integrity.cjs') as {
  hashFileSha256(path: string): Promise<{ artifactPath: string; sizeBytes: number; contentDigest: string }>;
  revalidateVerifiedArtifact(artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }): Promise<unknown>;
};
let directory = '';
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

async function verified(contents = Buffer.from('approved export bytes')) {
  directory = await mkdtemp(join(tmpdir(), 'shortsflow-artifact-'));
  const artifactPath = join(directory, 'video.mp4');
  await writeFile(artifactPath, contents);
  return hashFileSha256(artifactPath);
}

describe('verified artifact integrity', () => {
  it('streams a deterministic SHA-256 digest and size for the verified bytes', async () => {
    const contents = Buffer.alloc(1024 * 1024, 0x5a);
    const artifact = await verified(contents);
    expect(artifact.sizeBytes).toBe(contents.length);
    expect(artifact.contentDigest).toBe(createHash('sha256').update(contents).digest('hex'));
    await expect(revalidateVerifiedArtifact(artifact)).resolves.toEqual(artifact);
  });
  it('rejects deleted, replaced, truncated, and same-size changed artifacts without changing the stored digest', async () => {
    const artifact = await verified(Buffer.from('abcdefgh'));
    await writeFile(artifact.artifactPath, Buffer.from('12345678'));
    await expect(revalidateVerifiedArtifact(artifact)).rejects.toMatchObject({ code: 'artifact-integrity-mismatch', retryable: false });
    expect(artifact.contentDigest).toBe(createHash('sha256').update('abcdefgh').digest('hex'));
    await writeFile(artifact.artifactPath, Buffer.from('short'));
    await expect(revalidateVerifiedArtifact(artifact)).rejects.toMatchObject({ code: 'artifact-integrity-mismatch' });
    await rm(artifact.artifactPath);
    await expect(revalidateVerifiedArtifact(artifact)).rejects.toMatchObject({ code: 'artifact-missing' });
  });
  it('rejects non-regular and legacy artifacts without a digest', async () => {
    const artifact = await verified();
    await expect(revalidateVerifiedArtifact({ ...artifact, contentDigest: '' })).rejects.toMatchObject({ code: 'artifact-digest-missing' });
    await expect(revalidateVerifiedArtifact({ ...artifact, artifactPath: directory })).rejects.toMatchObject({ code: 'artifact-unreadable' });
  });
});
