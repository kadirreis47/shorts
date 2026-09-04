import type { RenderManifest } from '@/core/media';
import type { RenderPreset } from './types';
import { canonicalMediaAssetSource } from '@/core/media/storageIdentity';
import { buildFFmpegCommand } from './ffmpegCommandBuilder';

const FFMPEG_OUTPUT_FINGERPRINT_VERSION = 1;

export interface RenderFingerprintInput {
  manifest: RenderManifest;
  preset: RenderPreset;
  adapterId: string;
}

export async function createRenderFingerprint(
  input: RenderFingerprintInput,
): Promise<string> {
  const manifest = normalizeManifest(input.manifest) as RenderManifest;
  const outputAuthority = input.adapterId === 'ffmpeg' && executableFFmpegManifest(manifest)
    ? {
        version: FFMPEG_OUTPUT_FINGERPRINT_VERSION,
        schemaVersion: manifest.schemaVersion,
        execution: fingerprintableFFmpegCommand(buildFFmpegCommand({ manifest, preset: input.preset })),
      }
    : manifest;
  const canonical = stableStringify({
    adapterId: input.adapterId,
    preset: input.preset,
    outputAuthority,
  });

  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(canonical);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  return fallbackHash(canonical);
}

function fingerprintableFFmpegCommand(command: ReturnType<typeof buildFFmpegCommand>): unknown {
  return {
    ...command,
    imageGeometryAuthorities: command.imageGeometryAuthorities.map(({ authorityReference: _opaqueReference, ...authority }) => authority),
  };
}

function executableFFmpegManifest(manifest: RenderManifest): boolean {
  const value = manifest as unknown as Partial<RenderManifest>;
  return Boolean(
    value.timeline
    && Array.isArray(value.timeline.scenes)
    && value.timeline.scenes.length > 0
    && value.render
    && value.subtitles
    && value.audio
    && typeof value.durationMs === 'number',
  );
}

function normalizeManifest(manifest: RenderManifest): unknown {
  return {
    ...(stripProviderProvenance(manifest) as RenderManifest),
    assets: (manifest.assets ?? []).map((asset) => {
      const { providerProvenance: _providerProvenance, ...metadata } = asset.metadata;
      return { ...asset, source: canonicalMediaAssetSource(asset), metadata };
    }),
    validation: manifest.validation
      ? {
          valid: manifest.validation.valid,
          renderReady: manifest.validation.renderReady,
          score: manifest.validation.score,
          issues: manifest.validation.issues.map((issue) => ({
            code: issue.code,
            category: issue.category,
            severity: issue.severity,
            sceneId: issue.sceneId,
          })),
        }
      : null,
  };
}

function stripProviderProvenance(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripProviderProvenance);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, nested]) => key !== 'imageProvenance' && key !== 'videoProvenance'
      && key !== 'providerProvenance'
      && !(key === 'provenance' && isProviderMediaProvenance(nested)))
    .map(([key, nested]) => [key, stripProviderProvenance(nested)]));
  return value;
}

function isProviderMediaProvenance(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).provider === 'pexels');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

function fallbackHash(value: string): string {
  let first = 2166136261;
  let second = 2246822519;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}
