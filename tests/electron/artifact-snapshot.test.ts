import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createArtifactSnapshotStore } = require('../../electron/artifact-snapshot.cjs') as {
  createArtifactSnapshotStore(input: { directory: string }): {
    create(sourcePath: string): Promise<{ sourcePath: string; snapshotPath: string; sizeBytes: number; sourceIdentity: object }>;
    assertSourceUnchanged(snapshot: object): Promise<boolean>;
    remove(snapshotPath: string): Promise<boolean>;
  };
};
const { verifyArtifactSnapshot } = require('../../electron/ffmpeg-service.cjs') as {
  verifyArtifactSnapshot(targetPath: string, dependencies: { snapshots: ReturnType<typeof createArtifactSnapshotStore>; analyze(path: string): Promise<Record<string, unknown>>; digest(path: string): Promise<{ artifactPath: string; sizeBytes: number; contentDigest: string }> }): Promise<{ diagnostics: Record<string, unknown>; integrity: { artifactPath: string; sizeBytes: number; contentDigest: string } }>;
};
const { hashFileSha256 } = require('../../electron/artifact-integrity.cjs') as { hashFileSha256(path: string): Promise<{ artifactPath: string; sizeBytes: number; contentDigest: string }> };

let directory = '';
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

describe('trusted artifact snapshots', () => {
  it('binds analysis and digest to one snapshot and cleans it after success', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-verification-snapshot-')); const sourcePath = join(directory, 'video.mp4'); const snapshotDirectory = join(directory, 'snapshots'); const contents = Buffer.from('approved-video-bytes'); await writeFile(sourcePath, contents);
    const snapshots = createArtifactSnapshotStore({ directory: snapshotDirectory }); const analyzedPaths: string[] = [];
    const result = await verifyArtifactSnapshot(sourcePath, { snapshots, analyze: async (snapshotPath) => { analyzedPaths.push(snapshotPath); return { outputPath: snapshotPath, width: 1080 }; }, digest: hashFileSha256 });
    expect(analyzedPaths[0]).not.toBe(sourcePath); expect(result.diagnostics.outputPath).toBe(sourcePath); expect(result.integrity).toEqual({ artifactPath: sourcePath, sizeBytes: contents.length, contentDigest: createHash('sha256').update(contents).digest('hex') }); expect(await readdir(snapshotDirectory)).toEqual([]);
  });
  it('rejects same-size path replacement during analysis instead of mixing old diagnostics with new bytes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-verification-race-')); const sourcePath = join(directory, 'video.mp4'); const oldPath = join(directory, 'old.mp4'); const snapshotDirectory = join(directory, 'snapshots'); const approved = Buffer.from('approved-content'); const replacement = Buffer.from('replaced-content'); await writeFile(sourcePath, approved);
    const snapshots = createArtifactSnapshotStore({ directory: snapshotDirectory });
    await expect(verifyArtifactSnapshot(sourcePath, { snapshots, analyze: async (snapshotPath) => { await rename(sourcePath, oldPath); await writeFile(sourcePath, replacement); return { outputPath: snapshotPath, width: 1080 }; }, digest: hashFileSha256 })).rejects.toMatchObject({ code: 'artifact-integrity-mismatch' });
    expect(await readdir(snapshotDirectory)).toEqual([]);
  });
  it('cleans the temporary snapshot when media analysis fails', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-verification-failure-')); const sourcePath = join(directory, 'video.mp4'); const snapshotDirectory = join(directory, 'snapshots'); await writeFile(sourcePath, Buffer.from('video'));
    const snapshots = createArtifactSnapshotStore({ directory: snapshotDirectory }); const failure = new Error('ffprobe failed');
    await expect(verifyArtifactSnapshot(sourcePath, { snapshots, analyze: vi.fn(async () => { throw failure; }), digest: hashFileSha256 })).rejects.toBe(failure); expect(await readdir(snapshotDirectory)).toEqual([]);
  });
});
