import { describe, expect, it } from 'vitest';
import { createExportJob, createExportPlan, createExportQueue } from '@/core/export-intelligence';
import { editingFixture } from '../editing/fixtures';

const capabilities = { ffmpeg: true, ffprobe: true, version: '6', encoders: ['libx264'], hardwareEncoders: [], supports: { libx264: true }, raw: null, detectedAt: 'now' } as const;

async function setup() {
  const result = await editingFixture();
  result.manifest.validation = { ...(result.manifest.validation ?? {}), renderReady: true } as typeof result.manifest.validation;
  const plan = createExportPlan({ manifest: result.manifest, capabilities: capabilities });
  return { manifest: result.manifest, plan };
}

describe('export queue terminal lifecycle', () => {
  it('verifies before completion and retries verification failures', async () => {
    const { manifest, plan } = await setup();
    let verifyAttempts = 0;
    const queue = createExportQueue({ run: async (job) => ({ path: job.outputPath, sizeBytes: 10, durationMs: job.manifest.durationMs, verified: false, diagnostics: {}, createdAt: 'now' }), cancel: async () => true }, undefined, () => (++verifyAttempts > 1 ? { valid: true, zeroByte: false, durationMatch: true, resolutionMatch: true, codecMatch: true, audioPresent: true, subtitlesPresent: true, corruption: false, issues: [], diagnostics: {} } : { valid: false, zeroByte: true, durationMatch: false, resolutionMatch: false, codecMatch: false, audioPresent: false, subtitlesPresent: false, corruption: true, issues: ['corrupt'], diagnostics: { ffprobe: 'failed' } }));
    const job = createExportJob(plan, manifest, 'verify.mp4', 2);
    queue.enqueue(job); await queue.start(); expect(queue.get(job.id)?.state).toBe('failed');
    await queue.retry(job.id); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queue.get(job.id)?.state).toBe('completed'); expect(queue.get(job.id)?.artifact?.verified).toBe(true);
  });

  it('does not overwrite cancellation when executor settles later and ignores duplicates', async () => {
    const { manifest, plan } = await setup();
    let resolveRun!: (artifact: { path: string; sizeBytes: number; durationMs: number; verified: boolean; diagnostics: Record<string, unknown>; createdAt: string }) => void;
    const queue = createExportQueue({ run: async (job) => new Promise((resolve) => { resolveRun = resolve; }), cancel: async () => true });
    const job = createExportJob(plan, manifest, 'race.mp4'); queue.enqueue(job); queue.enqueue(job); expect(queue.list()).toHaveLength(1);
    const running = queue.start(); await new Promise((resolve) => setTimeout(resolve, 0)); await queue.cancel(job.id);
    resolveRun({ path: job.outputPath, sizeBytes: 10, durationMs: manifest.durationMs, verified: false, diagnostics: {}, createdAt: 'now' }); await running;
    expect(queue.get(job.id)?.state).toBe('cancelled');
  });
});
