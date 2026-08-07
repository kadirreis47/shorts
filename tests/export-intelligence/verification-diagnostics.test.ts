import { describe, expect, it } from 'vitest';
import { createExportJob, createExportPlan, verifyArtifact } from '@/core/export-intelligence';
import { editingFixture } from '../editing/fixtures';

async function setup() {
  const result = await editingFixture();
  result.manifest.validation = { ...(result.manifest.validation ?? {}), renderReady: true } as typeof result.manifest.validation;
  const plan = createExportPlan({ manifest: result.manifest, capabilities: { ffmpeg: true, ffprobe: true, version: '6', encoders: ['libx264'], hardwareEncoders: [], supports: { libx264: true }, raw: null, detectedAt: 'now' } });
  const job = createExportJob(plan, result.manifest, 'nested.mp4');
  return { job, manifest: result.manifest, plan };
}

function diagnostics(job: Awaited<ReturnType<typeof setup>>['job'], overrides: Record<string, unknown> = {}) {
  return { outputPath: job.outputPath, containerFormat: 'mp4', durationSeconds: job.manifest.durationMs / 1000, sizeBytes: 100, overallBitRate: 1000, video: { codecName: job.plan.preset.videoCodec, codecLongName: null, profile: null, width: job.manifest.render.width, height: job.manifest.render.height, pixelFormat: 'yuv420p', frameRate: 30, bitRate: 1000, durationSeconds: job.manifest.durationMs / 1000, sampleRate: null, channels: null, channelLayout: null }, audio: { codecName: 'aac', codecLongName: null, profile: null, width: null, height: null, pixelFormat: null, frameRate: null, bitRate: 128, durationSeconds: job.manifest.durationMs / 1000, sampleRate: 48000, channels: 2, channelLayout: 'stereo' }, warnings: [], qualityScore: 100, passed: true, analyzedAt: 'now', ...overrides };
}

describe('canonical RenderDiagnostics verification', () => {
  it('reads nested duration, video dimensions, codec and audio', async () => { const { job } = await setup(); const result = verifyArtifact(job, { path: job.outputPath, sizeBytes: 100, durationMs: 1, verified: false, diagnostics: diagnostics(job), createdAt: 'now' }); expect(result.valid).toBe(true); });
  it.each([
    ['duration', { durationSeconds: 1 }],
    ['resolution', { video: { width: 1, height: 1 } }],
    ['codec', { video: { codecName: 'vp9' } }],
    ['audio', { audio: null }],
  ])('rejects nested %s mismatches', async (_name, override) => { const { job } = await setup(); const base = diagnostics(job); const videoOverride = 'video' in override ? override.video : undefined; const actual = { ...base, ...override, video: { ...base.video, ...(videoOverride as object | undefined) } }; const result = verifyArtifact(job, { path: job.outputPath, sizeBytes: 100, durationMs: job.manifest.durationMs, verified: false, diagnostics: actual, createdAt: 'now' }); expect(result.valid).toBe(false); });
  it('uses artifact fallback only when diagnostics are unavailable', async () => { const { job } = await setup(); const result = verifyArtifact(job, { path: job.outputPath, sizeBytes: 100, durationMs: job.manifest.durationMs, verified: false, diagnostics: {}, createdAt: 'now' }); expect(result.valid).toBe(true); });
  it('rejects canonical zero-byte and corruption diagnostics', async () => { const { job } = await setup(); const result = verifyArtifact(job, { path: job.outputPath, sizeBytes: 0, durationMs: job.manifest.durationMs, verified: false, diagnostics: { ...diagnostics(job), warnings: ['ffprobe corruption detected'] }, createdAt: 'now' }); expect(result.valid).toBe(false); expect(result.zeroByte).toBe(true); expect(result.corruption).toBe(true); });
});
