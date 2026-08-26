import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validatePublicWindowsSigning } = require('../../scripts/validate-public-windows-signing.cjs') as {
  validatePublicWindowsSigning(env: Record<string, string | undefined>): { source: 'WIN_CSC' | 'CSC' };
};
const { assertValidAuthenticodeResults } = require('../../scripts/verify-windows-signatures.cjs') as {
  assertValidAuthenticodeResults(results: unknown): unknown;
};

describe('public Windows signing release contract', () => {
  it('uses the V1.1 product metadata as the installer version authority', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
    const lockfile = JSON.parse(readFileSync(path.resolve('package-lock.json'), 'utf8'));

    expect(packageJson).toMatchObject({
      name: 'shortsflow',
      version: '1.1.0',
      author: 'ShortsFlow',
      description: 'YouTube Shorts Automation Studio',
      repository: { type: 'git', url: 'https://github.com/kadirreis47/shorts.git' },
      build: { appId: 'com.shortsflow.studio', productName: 'ShortsFlow' },
    });
    expect(lockfile).toMatchObject({ version: '1.1.0', packages: { '': { version: '1.1.0' } } });
  });

  it('keeps the approved Windows icon source present for runtime and installer conversion', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
    expect(packageJson.build.win.icon).toBe('build/icon.png');
    expect(existsSync(path.resolve(packageJson.build.win.icon))).toBe(true);
  });

  it('fails closed when signing credentials are absent or incomplete', () => {
    expect(() => validatePublicWindowsSigning({})).toThrow(/WIN_CSC_LINK.*WIN_CSC_KEY_PASSWORD/i);
    expect(() => validatePublicWindowsSigning({ WIN_CSC_LINK: 'certificate-reference' })).toThrow(/both WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD/i);
  });

  it('accepts the electron-builder Windows credentials and standard fallback without returning secrets', () => {
    expect(validatePublicWindowsSigning({ WIN_CSC_LINK: 'certificate-reference', WIN_CSC_KEY_PASSWORD: 'secret' })).toEqual({ source: 'WIN_CSC' });
    expect(validatePublicWindowsSigning({ CSC_LINK: 'certificate-reference', CSC_KEY_PASSWORD: 'secret' })).toEqual({ source: 'CSC' });
  });

  it('requires valid Authenticode status and a signer certificate for every public artifact', () => {
    expect(() => assertValidAuthenticodeResults([
      { artifact: 'ShortsFlow.exe', status: 'NotSigned', signerPresent: false },
      { artifact: 'ShortsFlow Setup 1.1.0.exe', status: 'Valid', signerPresent: true },
    ])).toThrow(/not Authenticode-valid/i);
    expect(assertValidAuthenticodeResults([
      { artifact: 'ShortsFlow.exe', status: 'Valid', signerPresent: true },
      { artifact: 'ShortsFlow Setup 1.1.0.exe', status: 'Valid', signerPresent: true },
    ])).toHaveLength(2);
    expect(() => assertValidAuthenticodeResults([
      { artifact: 'other.exe', status: 'Valid', signerPresent: true },
      { artifact: 'other-installer.exe', status: 'Valid', signerPresent: true },
    ])).toThrow(/unexpected artifact set/i);
  });

  it('keeps the unsigned internal command available and makes only the public command force signing', () => {
    const scripts = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8')).scripts;
    expect(scripts['electron:build']).not.toContain('forceCodeSigning');
    expect(scripts['electron:release']).toContain('validate-public-windows-signing.cjs');
    expect(scripts['electron:release']).toContain('--config.win.forceCodeSigning=true');
    expect(scripts['electron:release']).toContain('verify-windows-signatures.cjs');
    expect(scripts['electron:release'].indexOf('validate-public-windows-signing.cjs')).toBeLessThan(scripts['electron:release'].indexOf('electron-builder'));
  });

  it('does not log signing credential values', () => {
    const source = readFileSync(path.resolve('scripts/validate-public-windows-signing.cjs'), 'utf8');
    expect(source).toContain('configured via ${signing.source}');
    expect(source).not.toMatch(/console\.(log|error).*WIN_CSC_LINK/);
    expect(source).not.toMatch(/console\.(log|error).*CSC_KEY_PASSWORD/);
  });
});
