import type {
  RenderAdapter,
  RenderExecutionContext,
  RenderOutput,
} from './types';

export class RenderPlanAdapter implements RenderAdapter {
  readonly id = 'manifest-plan';
  readonly name = 'Manifest Render Planner';

  canRender(): boolean {
    return true;
  }

  async render(context: RenderExecutionContext): Promise<RenderOutput> {
    const { manifest, jobId, signal, reportProgress } = context;
    const totalFrames = Math.max(
      1,
      Math.ceil((manifest.durationMs / 1000) * manifest.render.fps),
    );

    await checkpoint(signal, reportProgress, {
      stage: 'validating',
      progress: 8,
      message: 'Render manifest doğrulanıyor',
      frame: 0,
      totalFrames,
    });

    await checkpoint(signal, reportProgress, {
      stage: 'planning',
      progress: 22,
      message: 'Sahne ve track yürütme planı hazırlanıyor',
      frame: 0,
      totalFrames,
    });

    await checkpoint(signal, reportProgress, {
      stage: 'assets',
      progress: 38,
      message: `${manifest.assets.length} medya varlığı render planına bağlanıyor`,
      frame: 0,
      totalFrames,
    });

    await checkpoint(signal, reportProgress, {
      stage: 'video',
      progress: 62,
      message: `${manifest.timeline.scenes.length} sahne için video kompozisyonu hazırlanıyor`,
      frame: Math.round(totalFrames * 0.62),
      totalFrames,
    });

    await checkpoint(signal, reportProgress, {
      stage: 'audio',
      progress: 78,
      message: 'Voice, müzik, SFX ve ducking grafiği hazırlanıyor',
      frame: Math.round(totalFrames * 0.78),
      totalFrames,
    });

    await checkpoint(signal, reportProgress, {
      stage: 'subtitles',
      progress: 90,
      message: `${manifest.subtitles.cues.length} altyazı cue render planına ekleniyor`,
      frame: Math.round(totalFrames * 0.9),
      totalFrames,
    });

    await checkpoint(signal, reportProgress, {
      stage: 'finalizing',
      progress: 98,
      message: 'Render yürütme planı sonlandırılıyor',
      frame: totalFrames,
      totalFrames,
    });

    const estimatedOperationCount =
      manifest.timeline.scenes.length +
      manifest.assets.length +
      manifest.subtitles.cues.length +
      manifest.audio.voice.length +
      manifest.audio.music.length +
      manifest.audio.sfx.length;

    return {
      kind: 'plan',
      uri: `render-plan://${manifest.projectId}/${jobId}`,
      mimeType: 'application/vnd.shortsflow.render-plan+json',
      durationMs: manifest.durationMs,
      metadata: {
        schemaVersion: manifest.schemaVersion,
        totalFrames,
        sceneCount: manifest.timeline.scenes.length,
        assetCount: manifest.assets.length,
        subtitleCueCount: manifest.subtitles.cues.length,
        audioSegmentCount:
          manifest.audio.voice.length +
          manifest.audio.music.length +
          manifest.audio.sfx.length,
        estimatedOperationCount,
      },
    };
  }
}

async function checkpoint(
  signal: AbortSignal,
  reportProgress: RenderExecutionContext['reportProgress'],
  progress: Parameters<RenderExecutionContext['reportProgress']>[0],
): Promise<void> {
  throwIfAborted(signal);
  await reportProgress(progress);
  await Promise.resolve();
  throwIfAborted(signal);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Render işlemi iptal edildi', 'AbortError');
  }
}

export function createRenderPlanAdapter(): RenderAdapter {
  return new RenderPlanAdapter();
}
