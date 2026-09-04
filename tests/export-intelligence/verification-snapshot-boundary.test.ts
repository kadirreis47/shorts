import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExportJob, createExportPlan } from '@/core/export-intelligence';
import { createExportIntelligenceApplicationService } from '@/services/exportIntelligenceApplicationService';
import { editingFixture } from '../editing/fixtures';

afterEach(() => { Reflect.deleteProperty(globalThis, 'window'); });

describe('export verification snapshot boundary', () => {
  it('uses one trusted snapshot operation instead of separate path analysis and hashing', async () => {
    const source = await editingFixture(); source.manifest.validation = { ...(source.manifest.validation ?? {}), renderReady: true } as typeof source.manifest.validation;
    const plan = createExportPlan({ manifest: source.manifest, capabilities: { ffmpeg: true, ffprobe: true, version: '6', encoders: ['libx264'], hardwareEncoders: [], supports: { libx264: true }, raw: null, detectedAt: 'now' } });
    const job = createExportJob(plan, source.manifest, 'C:/exports/snapshot.mp4'); job.artifact = { path: job.outputPath, sizeBytes: 100, durationMs: source.manifest.durationMs, verified: false, diagnostics: {}, createdAt: 'now' };
    const publishCapability = { version: 1 as const, reference: `vea1_${'A'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00.000Z' };
    const analyzeRenderArtifact = vi.fn(); const verifyRenderArtifact = vi.fn(async (artifactPath: string) => ({ integrity: { artifactPath, sizeBytes: 100, contentDigest: 'a'.repeat(64) }, publishCapability, diagnostics: { outputPath: artifactPath, containerFormat: 'mp4', durationSeconds: source.manifest.durationMs / 1000, sizeBytes: 100, overallBitRate: 1_000, video: { codecName: plan.preset.videoCodec, codecLongName: null, profile: null, width: source.manifest.render.width, height: source.manifest.render.height, pixelFormat: 'yuv420p', frameRate: 30, bitRate: 1_000, durationSeconds: source.manifest.durationMs / 1000, sampleRate: null, channels: null, channelLayout: null }, audio: { codecName: 'aac', codecLongName: null, profile: null, width: null, height: null, pixelFormat: null, frameRate: null, bitRate: 128, durationSeconds: source.manifest.durationMs / 1000, sampleRate: 48_000, channels: 2, channelLayout: 'stereo' }, warnings: [], qualityScore: 100, passed: true, analyzedAt: 'now' } }));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { ffmpeg: { verifyRenderArtifact, analyzeRenderArtifact } } } });
    const result = await createExportIntelligenceApplicationService().verify(job);
    expect(result).toMatchObject({ valid: true, sizeBytes: 100, contentDigest: 'a'.repeat(64), verifiedExportReference: publishCapability.reference }); expect(job.artifact.verifiedExportReference).toBe(publishCapability.reference); expect(verifyRenderArtifact).toHaveBeenCalledWith(job.artifact.path); expect(analyzeRenderArtifact).not.toHaveBeenCalled();
  });
});
