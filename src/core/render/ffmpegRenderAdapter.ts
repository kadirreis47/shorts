import type { RenderManifest } from '@/core/media';
import { buildFFmpegCommand } from './ffmpegCommandBuilder';
import { getFFmpegBridge } from './ffmpegBridge';
import type { FFmpegCapabilities } from './ffmpegTypes';
import type { HardwareScheduler } from './hardwareScheduler';
import { withHardwareSelection } from './hardwareScheduler';
import type { RenderAdapter, RenderExecutionContext, RenderOutput, RenderPreset } from './types';

export class FFmpegRenderAdapter implements RenderAdapter {
  readonly id = 'ffmpeg';
  readonly name = 'FFmpeg Render Adapter';
  constructor(private readonly hardwareScheduler: HardwareScheduler) {}

  canRender(manifest: RenderManifest, _preset: RenderPreset): boolean {
    return Boolean(getFFmpegBridge() && manifest.validation?.renderReady);
  }

  async render(context: RenderExecutionContext): Promise<RenderOutput> {
    const bridge = getFFmpegBridge();
    if (!bridge) throw new Error('FFmpeg Electron köprüsü kullanılamıyor. Uygulamayı Electron modunda açın.');

    const capabilities = await bridge.getCapabilities(true);
    if (!capabilities.available) throw new Error('FFmpeg bulunamadı. FFmpeg kurup PATH ortam değişkenine ekleyin.');

    const lease = await this.hardwareScheduler.acquire(context.jobId, context.preset, capabilities, context.signal);
    try {
      const effectivePreset = withHardwareSelection(context.preset, lease.selection);
      try {
        return await this.runFFmpeg(context, effectivePreset, capabilities);
      } catch (error) {
        const shouldFallback = context.preset.hardwareAcceleration === 'auto' && lease.selection.backend === 'nvenc' && !context.signal.aborted;
        if (!shouldFallback) throw error;
        await context.reportProgress({ stage: 'planning', progress: 4, message: 'NVENC başarısız oldu; CPU kodlamaya güvenli geçiş yapılıyor' });
        return await this.runFFmpeg(
          context,
          { ...context.preset, hardwareAcceleration: 'disabled' },
          capabilities,
          { hardwareFallback: true, fallbackReason: error instanceof Error ? error.message : 'NVENC işlemi başarısız oldu' },
        );
      }
    } finally {
      lease.release();
    }
  }

  private async runFFmpeg(
    context: RenderExecutionContext,
    preset: RenderPreset,
    capabilities: FFmpegCapabilities,
    extraMetadata: Readonly<Record<string, unknown>> = {},
  ): Promise<RenderOutput> {
    const bridge = getFFmpegBridge();
    if (!bridge) throw new Error('FFmpeg Electron köprüsü kullanılamıyor.');
    const plan = buildFFmpegCommand({ ...context, preset });
    const durationMs = Math.max(1, context.manifest.durationMs);
    let latestFps = 0;
    let latestSpeed = 0;
    const unsubscribe = bridge.onProgress((payload) => {
      if (payload.jobId !== context.jobId) return;
      latestFps = payload.fps; latestSpeed = payload.speed;
      const progress = Math.min(97, Math.max(1, Math.round((payload.outTimeMs / durationMs) * 100)));
      void context.reportProgress({
        stage: 'video', progress, frame: payload.frame, totalFrames: plan.totalFrames,
        message: `FFmpeg kodluyor: ${payload.fps.toFixed(1)} FPS · ${payload.speed.toFixed(2)}x`,
      });
    });
    const abort = () => { void bridge.cancel(context.jobId); };
    context.signal.addEventListener('abort', abort, { once: true });
    try {
      await context.reportProgress({
        stage: 'planning', progress: 5,
        message: preset.hardwareAcceleration === 'nvenc' ? 'NVENC GPU render komutu hazırlanıyor' : 'CPU render komutu hazırlanıyor',
        frame: 0, totalFrames: plan.totalFrames,
      });
      const result = await bridge.run({ jobId: context.jobId, args: plan.args, outputPath: context.outputPath, subtitleContent: plan.subtitleContent });
      await context.reportProgress({ stage: 'finalizing', progress: 99, message: 'MP4 dosyası sonlandırılıyor', frame: plan.totalFrames, totalFrames: plan.totalFrames });
      return {
        kind: 'video', uri: result.outputPath, mimeType: 'video/mp4', sizeBytes: result.sizeBytes,
        durationMs: context.manifest.durationMs,
        metadata: {
          adapter: this.id, ffmpegVersion: capabilities.version, elapsedMs: result.elapsedMs, exitCode: result.exitCode,
          hardwareAcceleration: preset.hardwareAcceleration, averageFps: latestFps, encodingSpeed: latestSpeed, ...extraMetadata,
        },
      };
    } finally {
      unsubscribe();
      context.signal.removeEventListener('abort', abort);
    }
  }
}
export function createFFmpegRenderAdapter(hardwareScheduler: HardwareScheduler): RenderAdapter {
  return new FFmpegRenderAdapter(hardwareScheduler);
}
