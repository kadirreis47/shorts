import { describe, expect, it } from 'vitest';
import { createExportJob, createExportPlan, createExportQueue, isVerifiedExportJob, verifyArtifact } from '@/core/export-intelligence';
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

describe('intentional silent export verification', () => {
  async function silentSetup() {
    const result = await setup();
    result.job.manifest.audio = { ...result.job.manifest.audio, narrationMode: 'silent', voice: [], automation: [] };
    return result;
  }

  it('accepts a silent canonical artifact with no audio while preserving all other checks', async () => {
    const { job } = await silentSetup();
    const result = verifyArtifact(job, { path: job.outputPath, sizeBytes: 100, durationMs: job.manifest.durationMs, verified: false, diagnostics: diagnostics(job, { audio: null }), createdAt: 'now' });
    expect(result).toMatchObject({ valid: true, audioPresent: false, zeroByte: false, durationMatch: true, resolutionMatch: true, codecMatch: true, corruption: false });
    expect(result.issues).not.toContain('Output has no audio stream.');
  });

  it.each([
    ['zero-byte', { sizeBytes: 0 }],
    ['duration', { durationSeconds: 1 }],
    ['resolution', { video: { width: 1, height: 1 } }],
    ['codec', { video: { codecName: 'vp9' } }],
    ['corruption', { warnings: ['ffprobe corruption detected'] }],
  ])('still rejects silent artifacts with %s failures', async (_name, override) => {
    const { job } = await silentSetup(); const base = diagnostics(job, { audio: null });
    const diagnosticsOverride = { ...base, ...override, video: { ...base.video, ...(('video' in override ? override.video : {}) as object) } };
    const artifactSize = 'sizeBytes' in override ? Number(override.sizeBytes) : 100;
    expect(verifyArtifact(job, { path: job.outputPath, sizeBytes: artifactSize, durationMs: job.manifest.durationMs, verified: false, diagnostics: diagnosticsOverride, createdAt: 'now' }).valid).toBe(false);
  });

  it('keeps required and legacy manifests invalid when their audio stream is absent', async () => {
    const { job } = await setup(); const required = verifyArtifact(job, { path: job.outputPath, sizeBytes: 100, durationMs: job.manifest.durationMs, verified: false, diagnostics: diagnostics(job, { audio: null }), createdAt: 'now' });
    const legacyJob = structuredClone(job); delete legacyJob.manifest.audio.narrationMode;
    const legacy = verifyArtifact(legacyJob, { path: legacyJob.outputPath, sizeBytes: 100, durationMs: legacyJob.manifest.durationMs, verified: false, diagnostics: diagnostics(legacyJob, { audio: null }), createdAt: 'now' });
    expect(required.issues).toContain('Output has no audio stream.'); expect(legacy.issues).toContain('Output has no audio stream.');
  });

  it('completes a verified silent job without relaxing digest requirements', async () => {
    const { job } = await silentSetup(); const digest = 'a'.repeat(64);
    const queue = createExportQueue({ run: async (current) => ({ path: current.outputPath, sizeBytes: 100, durationMs: current.manifest.durationMs, verified: false, contentDigest: digest, diagnostics: diagnostics(current, { audio: null }), createdAt: 'now' }), cancel: async () => true });
    queue.enqueue(job); await queue.start(); const completed = queue.get(job.id);
    expect(completed?.state).toBe('completed'); expect(isVerifiedExportJob(completed)).toBe(true);
    expect(isVerifiedExportJob({ ...completed!, artifact: { ...completed!.artifact!, contentDigest: null } })).toBe(false);
  });
});
