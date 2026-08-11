import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { REQUIRED, provisionFFmpegRuntime } = require('../../scripts/provision-ffmpeg-runtime.cjs') as { REQUIRED: readonly string[]; provisionFFmpegRuntime(input: { sourceDirectory?: string; outputDirectory: string; requireBundle?: boolean }): { bundled: boolean; files: string[] }; };
const { validateV1Release } = require('../../scripts/validate-v1-release.cjs') as { validateV1Release(input: { clientId?: string | null; runtimeDirectory: string }): unknown; };

function bundle(root: string, missing?: string, empty?: string) {
  const source = path.join(root, 'source'); require('node:fs').mkdirSync(source);
  for (const name of REQUIRED) writeFileSync(path.join(source, name), name === empty ? '' : 'binary');
  if (missing) require('node:fs').rmSync(path.join(source, missing));
  return source;
}

describe('packaged FFmpeg runtime staging and V1 release gate', () => {
  it('requires a bundle for packaged builds and clears stale staged binaries first', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'shortsflow-release-')); const output = path.join(root, 'runtime');
    try {
      expect(() => provisionFFmpegRuntime({ outputDirectory: output, requireBundle: true })).toThrow(/bundle is required/i);
      expect(require('node:fs').existsSync(path.join(output, REQUIRED[0]))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('rejects incomplete and empty bundles', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'shortsflow-release-')); const output = path.join(root, 'runtime');
    try {
      expect(() => provisionFFmpegRuntime({ sourceDirectory: bundle(root, REQUIRED[0]), outputDirectory: output, requireBundle: true })).toThrow(/must contain non-empty/i);
      rmSync(path.join(root, 'source'), { recursive: true, force: true });
      expect(() => provisionFFmpegRuntime({ sourceDirectory: bundle(root, undefined, REQUIRED[1]), outputDirectory: output, requireBundle: true })).toThrow(/must contain non-empty/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('allows OAuth-free generic packaged staging with a valid bundle while the release gate remains stricter', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'shortsflow-release-')); const output = path.join(root, 'runtime');
    try {
      const staged = provisionFFmpegRuntime({ sourceDirectory: bundle(root), outputDirectory: output, requireBundle: true });
      expect(staged.files).toHaveLength(2);
      expect(() => validateV1Release({ clientId: null, runtimeDirectory: output })).toThrow(/CLIENT_ID/i);
      expect(validateV1Release({ clientId: 'synthetic.apps.googleusercontent.com', runtimeDirectory: output })).toMatchObject({ runtimeDirectory: output });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
