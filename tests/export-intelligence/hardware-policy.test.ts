import { describe, expect, it } from 'vitest';
import { createExportPlan, selectEncoder } from '@/core/export-intelligence';
import { editingFixture } from '../editing/fixtures';

const capability = (encoders: string[], hardwareEncoders: string[]) => ({
  ffmpeg: true, ffprobe: true, version: '6', encoders, hardwareEncoders,
  supports: Object.fromEntries([...encoders, ...hardwareEncoders].map((encoder) => [encoder, true])), raw: null, detectedAt: 'now',
});

async function manifest() { const result = await editingFixture(); result.manifest.validation = { ...(result.manifest.validation ?? {}), renderReady: true } as typeof result.manifest.validation; return result.manifest; }

describe('export hardware-aware encoder policy', () => {
  it('keeps CPU plans on software encoders regardless of runtime ordering', async () => {
    const plan = createExportPlan({ manifest: await manifest(), capabilities: capability(['h264_nvenc', 'libx264'], ['h264_nvenc']) });
    expect(plan.preset.hardware).toBe('cpu');
    expect(plan.preset.encoder).toBe('libx264');
  });

  it('uses compatible hardware for GPU policy and explicit software fallback', () => {
    const gpu = selectEncoder(capability(['libx264'], ['h264_nvenc']), 'h264', 'gpu');
    expect(gpu.hardware).toBe('gpu');
    expect(gpu.encoder).toBe('h264_nvenc');
    const fallback = selectEncoder(capability(['libx264'], []), 'h264', 'gpu');
    expect(fallback.hardware).toBe('cpu');
    expect(fallback.encoder).toBe('libx264');
  });
});
