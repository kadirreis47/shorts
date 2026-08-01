import type { RenderDiagnostics } from './renderDiagnosticsTypes';
import type { RenderManifest } from '@/core/media';

export function evaluateRenderDiagnostics(
  diagnostics: RenderDiagnostics,
  manifest: RenderManifest,
): RenderDiagnostics {
  const warnings = [...diagnostics.warnings];
  let score = 100;

  if (!diagnostics.video) {
    warnings.push('Video stream bulunamadı.');
    score -= 60;
  } else {
    if (
      diagnostics.video.width !== manifest.render.width ||
      diagnostics.video.height !== manifest.render.height
    ) {
      warnings.push(
        `Çözünürlük beklenen ${manifest.render.width}x${manifest.render.height} değil.`,
      );
      score -= 18;
    }

    if (
      diagnostics.video.frameRate !== null &&
      Math.abs(diagnostics.video.frameRate - manifest.render.fps) > 0.5
    ) {
      warnings.push(
        `FPS beklenen ${manifest.render.fps} değerinden sapıyor.`,
      );
      score -= 12;
    }

    if (
      diagnostics.video.pixelFormat &&
      diagnostics.video.pixelFormat !== 'yuv420p'
    ) {
      warnings.push(
        `Piksel formatı yuv420p değil: ${diagnostics.video.pixelFormat}`,
      );
      score -= 8;
    }
  }

  if (!diagnostics.audio) {
    warnings.push('Audio stream bulunamadı.');
    score -= 20;
  } else {
    if (
      diagnostics.audio.sampleRate !== null &&
      diagnostics.audio.sampleRate !== 48000
    ) {
      warnings.push(
        `Audio sample rate 48 kHz değil: ${diagnostics.audio.sampleRate}`,
      );
      score -= 6;
    }

    if (
      diagnostics.audio.channels !== null &&
      diagnostics.audio.channels !== 2
    ) {
      warnings.push(
        `Audio kanal sayısı stereo değil: ${diagnostics.audio.channels}`,
      );
      score -= 6;
    }
  }

  const expectedDuration = manifest.durationMs / 1000;
  if (
    diagnostics.durationSeconds !== null &&
    Math.abs(diagnostics.durationSeconds - expectedDuration) > 0.35
  ) {
    warnings.push(
      `Çıktı süresi manifestten ${Math.abs(
        diagnostics.durationSeconds - expectedDuration,
      ).toFixed(2)} saniye sapıyor.`,
    );
    score -= 15;
  }

  if (diagnostics.sizeBytes <= 0) {
    warnings.push('Çıktı dosyası boş.');
    score -= 50;
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    ...diagnostics,
    warnings,
    qualityScore: normalizedScore,
    passed: normalizedScore >= 75 && Boolean(diagnostics.video),
  };
}
