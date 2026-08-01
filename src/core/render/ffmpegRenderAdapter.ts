import { buildFFmpegCommand } from './ffmpegCommandBuilder';
import { getFFmpegBridge } from './ffmpegBridge';
import type { RenderAdapter, RenderExecutionContext, RenderOutput, RenderPreset } from './types';
import type { RenderManifest } from '@/core/media';

export class FFmpegRenderAdapter implements RenderAdapter {
  readonly id = 'ffmpeg';
  readonly name = 'FFmpeg Render Adapter';

  canRender(manifest: RenderManifest, _preset: RenderPreset): boolean {
    return Boolean(getFFmpegBridge() && manifest.validation?.renderReady);
  }

  async render(context: RenderExecutionContext): Promise<RenderOutput> {
    const bridge = getFFmpegBridge();
    if (!bridge) throw new Error('FFmpeg Electron köprüsü kullanılamıyor. Uygulamayı Electron modunda açın.');

    const capabilities = await bridge.getCapabilities();
    if (!capabilities.available) {
      throw new Error('FFmpeg bulunamadı. FFmpeg kurup PATH ortam değişkenine ekleyin.');
    }

    const plan = buildFFmpegCommand(context);
    const durationMs = Math.max(1, context.manifest.durationMs);
    const unsubscribe = bridge.onProgress((payload) => {
      if (payload.jobId !== context.jobId) return;
      const progress = Math.min(97, Math.max(1, Math.round((payload.outTimeMs / durationMs) * 100)));
      void context.reportProgress({
        stage: 'video', progress, frame: payload.frame, totalFrames: plan.totalFrames,
        message: `FFmpeg kodluyor: ${payload.fps.toFixed(1)} FPS · ${payload.speed.toFixed(2)}x`,
      });
    });
    const abort = () => { void bridge.cancel(context.jobId); };
    context.signal.addEventListener('abort', abort, { once: true });

    try {
      await context.reportProgress({ stage: 'planning', progress: 5, message: 'FFmpeg komutu hazırlanıyor', frame: 0, totalFrames: plan.totalFrames });
      const result = await bridge.run({
        jobId: context.jobId,
        args: plan.args,
        outputPath: context.outputPath,
        subtitleContent: plan.subtitleContent,
      });
      await context.reportProgress({ stage: 'finalizing', progress: 99, message: 'MP4 dosyası sonlandırılıyor', frame: plan.totalFrames, totalFrames: plan.totalFrames });
      return {
        kind: 'video', uri: result.outputPath, mimeType: 'video/mp4', sizeBytes: result.sizeBytes,
        durationMs: context.manifest.durationMs,
        metadata: { adapter: this.id, ffmpegVersion: capabilities.version, elapsedMs: result.elapsedMs, exitCode: result.exitCode },
      };
    } finally {
      unsubscribe();
      context.signal.removeEventListener('abort', abort);
    }
  }
}

export function createFFmpegRenderAdapter(): RenderAdapter { return new FFmpegRenderAdapter(); }
