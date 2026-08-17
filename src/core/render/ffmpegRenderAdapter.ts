import { evaluateRenderDiagnostics } from './renderDiagnostics';
import type { RenderManifest } from '@/core/media';
import { buildFFmpegCommand } from './ffmpegCommandBuilder';
import {
  buildSceneSegmentCommand,
  buildSegmentConcatCommand,
} from './segmentCommandBuilder';
import { createSegmentCache } from './segmentCache';
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
        if (
          context.incrementalPlan &&
          !context.incrementalPlan.fullRenderRequired
        ) {
          return await this.runIncrementalFFmpeg(
            context,
            effectivePreset,
            capabilities,
          );
        }
        return await this.runFFmpeg(context, effectivePreset, capabilities);
      } catch (error) {
        const shouldFallback = !context.preset.encoder && context.preset.hardwareAcceleration === 'auto' && lease.selection.backend === 'nvenc' && !context.signal.aborted;
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


  private async runIncrementalFFmpeg(
    context: RenderExecutionContext,
    preset: RenderPreset,
    capabilities: FFmpegCapabilities,
  ): Promise<RenderOutput> {
    const bridge = getFFmpegBridge();
    const incrementalPlan = context.incrementalPlan;
    if (!bridge || !incrementalPlan) {
      return this.runFFmpeg(context, preset, capabilities);
    }

    const segmentCache = createSegmentCache();
    const resolutions = await segmentCache.resolve(incrementalPlan);
    const segmentPaths: string[] = [];
    const childJobIds = new Set<string>();
    let renderedSegments = 0;
    let reusedSegments = 0;

    const abort = () => {
      for (const childJobId of childJobIds) {
        void bridge.cancel(childJobId);
      }
    };
    context.signal.addEventListener('abort', abort, { once: true });

    try {
      for (const item of incrementalPlan.items) {
        if (context.signal.aborted) {
          throw new DOMException('Render işlemi iptal edildi', 'AbortError');
        }

        const resolution = resolutions.find(
          (candidate) => candidate.sceneId === item.sceneId,
        );
        const scene = context.manifest.timeline.scenes[item.sceneIndex];

        if (!resolution || !scene) {
          throw new Error(`Sahne segment planı eksik: ${item.sceneId}`);
        }

        if (resolution.reusable) {
          segmentPaths.push(resolution.path);
          reusedSegments += 1;
          continue;
        }

        const childJobId = `${context.jobId}-segment-${item.sceneIndex}`;
        childJobIds.add(childJobId);
        const command = buildSceneSegmentCommand({
          manifest: context.manifest,
          scene,
          preset,
          outputPath: resolution.path,
        });

        await context.reportProgress({
          stage: 'video',
          progress: Math.max(
            5,
            Math.round(
              ((renderedSegments + reusedSegments) /
                Math.max(1, incrementalPlan.totalScenes)) *
                70,
            ),
          ),
          message: `Sahne ${item.sceneIndex + 1}/${incrementalPlan.totalScenes} segmenti hazırlanıyor`,
          totalFrames: incrementalPlan.estimatedFrames,
        });

        await bridge.run({
          jobId: childJobId,
          args: command.args,
          outputPath: resolution.path,
          subtitleContent: command.subtitleContent,
        });

        childJobIds.delete(childJobId);
        segmentPaths.push(resolution.path);
        renderedSegments += 1;
      }

      const concatJobId = `${context.jobId}-concat`;
      childJobIds.add(concatJobId);
      const concatPlan = buildSegmentConcatCommand({
        manifest: context.manifest,
        preset,
        segmentPaths,
      });

      await context.reportProgress({
        stage: 'finalizing',
        progress: 82,
        message: `${renderedSegments} yeni ve ${reusedSegments} önbellek segmenti birleştiriliyor`,
        frame: 0,
        totalFrames: concatPlan.totalFrames,
      });

      const result = await bridge.run({
        jobId: concatJobId,
        args: concatPlan.args,
        outputPath: context.outputPath,
        concatContent: concatPlan.concatContent,
        subtitleContent: concatPlan.subtitleContent,
      });
      childJobIds.delete(concatJobId);

      const rawDiagnostics = await bridge.analyzeOutput(result.outputPath);
      const diagnostics = evaluateRenderDiagnostics(
        rawDiagnostics,
        context.manifest,
      );

      await context.reportProgress({
        stage: 'finalizing',
        progress: 99,
        message: diagnostics.passed
          ? `Çıktı kalite kontrolünden geçti (${diagnostics.qualityScore}/100)`
          : `Çıktı kalite kontrolünde uyarı var (${diagnostics.qualityScore}/100)`,
        frame: concatPlan.totalFrames,
        totalFrames: concatPlan.totalFrames,
      });

      return {
        kind: 'video',
        uri: result.outputPath,
        mimeType: 'video/mp4',
        sizeBytes: result.sizeBytes,
        durationMs: context.manifest.durationMs,
        metadata: {
          adapter: this.id,
          ffmpegVersion: capabilities.version,
          elapsedMs: result.elapsedMs,
          exitCode: result.exitCode,
          hardwareAcceleration: preset.hardwareAcceleration,
          incrementalExecutionMode: 'zero-copy-segment-assembly',
          finalVideoReencoded: false,
          realAudioMixed: context.manifest.audio.voice.some((segment) => Boolean(segment.assetId))
            || context.manifest.audio.music.some((segment) => Boolean(segment.assetId))
            || context.manifest.audio.sfx.some((segment) => Boolean(segment.assetId)),
          audioDuckingApplied:
            context.manifest.audio.voice.some((segment) => Boolean(segment.assetId))
            && context.manifest.audio.music.some((segment) => Boolean(segment.assetId)),
          // Slice 4 deliberately executes the truthful hard-cut baseline;
          // recipe/manifest intent is not reported as an applied effect.
          cameraMotionSceneCount: 0,
          transitionEffectSceneCount: 0,
          advancedSubtitleRenderer: true,
          subtitleCueCount: context.manifest.subtitles.cues.length,
          karaokeReadyCueCount: context.manifest.subtitles.cues.filter(
            (cue) => cue.wordIds.length > 0,
          ).length,
          renderedSegments,
          reusedSegments,
          segmentCount: segmentPaths.length,
          incrementalPlanId: incrementalPlan.planId,
          incrementalEstimatedSavedPercent:
            incrementalPlan.estimatedSavedPercent,
          renderDiagnostics: diagnostics,
          renderQualityScore: diagnostics.qualityScore,
          renderQualityPassed: diagnostics.passed,
          renderWarnings: diagnostics.warnings,
        },
      };
    } finally {
      context.signal.removeEventListener('abort', abort);
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
