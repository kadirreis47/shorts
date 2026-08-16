import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { materializeFile, resolveSelectedOutputPath } = require('../../electron/ffmpeg-service.cjs') as {
  materializeFile: (sourcePath: string, destinationPath: string) => Promise<{ path: string; sizeBytes: number }>;
  resolveSelectedOutputPath: (result: { canceled?: boolean; filePath?: string }) => string | null;
};

describe('native verified export save', () => {
  let directory = '';

  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it('preserves the selected absolute path and returns a bounded cancellation result', () => {
    const selected = join(process.cwd(), 'Downloads Folder', 'studio-test.mp4');
    expect(resolveSelectedOutputPath({ canceled: false, filePath: selected })).toBe(selected);
    expect(resolveSelectedOutputPath({ canceled: true, filePath: selected })).toBeNull();
    expect(resolveSelectedOutputPath({ canceled: false })).toBeNull();
    expect(resolveSelectedOutputPath({ canceled: false, filePath: join(process.cwd(), 'Downloads Folder', 'studio-test') })).toBe(`${join(process.cwd(), 'Downloads Folder', 'studio-test')}.mp4`);
  });

  it('copies a verified artifact to the exact user-selected path with spaces and verifies nonzero bytes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-native-export-'));
    const source = join(directory, 'verified.mp4');
    const destination = join(directory, 'Downloads Folder', 'studio test.mp4');
    const bytes = Buffer.from('verified canonical mp4 bytes');
    await writeFile(source, bytes);

    const result = await materializeFile(source, destination);

    expect(result.path).toBe(destination);
    expect(result.sizeBytes).toBe(bytes.length);
    expect((await stat(destination)).isFile()).toBe(true);
    expect((await stat(destination)).size).toBeGreaterThan(0);
    expect(await readFile(destination)).toEqual(bytes);
  });

  it('fails without claiming success when the source artifact is absent', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-native-export-'));
    const destination = join(directory, 'Downloads Folder', 'studio-test.mp4');
    await expect(materializeFile(join(directory, 'missing.mp4'), destination)).rejects.toThrow();
    await expect(stat(destination)).rejects.toThrow();
  });
});
