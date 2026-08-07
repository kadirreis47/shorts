import { describe, expect, it } from 'vitest';
import { createExportPlan, encoderSupportsCodec, listExportPresets } from '@/core/export-intelligence';
import { editingFixture } from '../editing/fixtures';

async function manifest() { const result = await editingFixture(); result.manifest.validation = { ...(result.manifest.validation ?? {}), renderReady: true } as typeof result.manifest.validation; return result.manifest; }
const capabilities = (encoders: string[]) => ({ ffmpeg: true, ffprobe: true, version: '6', encoders, hardwareEncoders: encoders.filter((encoder) => encoder.includes('_nvenc')), supports: Object.fromEntries(encoders.map((encoder) => [encoder, true])), raw: null, detectedAt: 'now' });

describe('export codec/encoder invariant', () => {
  it('plans archive HEVC with a compatible encoder and never libx264', async () => { const plan = createExportPlan({ manifest: await manifest(), presetId: 'archive', capabilities: capabilities(['libx264', 'libx265']) }); expect(plan.preset.videoCodec).toBe('hevc'); expect(plan.preset.encoder).toBe('libx265'); expect(encoderSupportsCodec(plan.preset.encoder, plan.preset.videoCodec)).toBe(true); });
  it('honors archive CPU policy when only a hardware HEVC encoder is available', async () => { const plan = createExportPlan({ manifest: await manifest(), presetId: 'archive', capabilities: capabilities(['libx264', 'hevc_nvenc']) }); expect(plan.preset.hardware).toBe('cpu'); expect(plan.preset.videoCodec).toBe('h264'); expect(plan.preset.encoder).toBe('libx264'); });
  it('falls back as a complete codec/encoder pair when HEVC is unavailable', async () => { const plan = createExportPlan({ manifest: await manifest(), presetId: 'archive', capabilities: capabilities(['libx264']) }); expect(plan.preset.videoCodec).toBe('h264'); expect(plan.preset.encoder).toBe('libx264'); expect(plan.warnings.some((warning) => warning.includes('fell back'))).toBe(true); });
  it.each(listExportPresets().map((preset) => preset.id))('keeps built-in preset %s executable invariant', async (presetId) => { const plan = createExportPlan({ manifest: await manifest(), presetId, capabilities: capabilities(['libx264', 'libx265', 'libvpx-vp9', 'libsvtav1']) }); expect(plan.preset.encoder === 'auto' || encoderSupportsCodec(plan.preset.encoder, plan.preset.videoCodec)).toBe(true); });
});
