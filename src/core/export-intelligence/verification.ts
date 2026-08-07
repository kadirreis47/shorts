import type { RenderDiagnostics } from '@/core/render/renderDiagnosticsTypes';
import type { ExportArtifact, ExportJob, ExportVerification } from './types';

function isRenderDiagnostics(value: unknown): value is RenderDiagnostics {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return 'durationSeconds' in candidate && 'video' in candidate && 'audio' in candidate && 'sizeBytes' in candidate && 'passed' in candidate;
}

export function verifyArtifact(job: ExportJob, artifact: ExportArtifact): ExportVerification {
  const diagnostics = artifact.diagnostics;
  const canonical = isRenderDiagnostics(diagnostics) ? diagnostics : null;
  const duration = canonical ? (canonical.durationSeconds === null ? Number.NaN : canonical.durationSeconds * 1000) : Number(diagnostics.durationMs ?? artifact.durationMs);
  const width = canonical ? Number(canonical.video?.width ?? Number.NaN) : Number(diagnostics.width ?? job.manifest.render.width);
  const height = canonical ? Number(canonical.video?.height ?? Number.NaN) : Number(diagnostics.height ?? job.manifest.render.height);
  const codec = canonical ? String(canonical.video?.codecName ?? '') : String(diagnostics.videoCodec ?? job.plan.preset.videoCodec);
  const issues: string[] = [];
  const zeroByte = artifact.sizeBytes <= 0 || (canonical?.sizeBytes ?? artifact.sizeBytes) <= 0;
  const durationMatch = Number.isFinite(duration) && Math.abs(duration - job.manifest.durationMs) <= 1000;
  const resolutionMatch = Number.isFinite(width) && Number.isFinite(height) && width === job.manifest.render.width && height === job.manifest.render.height;
  const codecMatch = codec.length > 0 && codec.toLowerCase().includes(job.plan.preset.videoCodec.toLowerCase());
  const audioPresent = canonical ? canonical.audio !== null : diagnostics.audioPresent !== false;
  const subtitlesPresent = canonical ? true : diagnostics.subtitlesPresent !== false;
  const corruption = canonical ? canonical.warnings.some((warning) => /corrupt|invalid|ffprobe/i.test(warning)) : diagnostics.corruption === true;
  if (zeroByte) issues.push('Output is zero bytes.'); if (!durationMatch) issues.push('Output duration differs from manifest.'); if (!resolutionMatch) issues.push('Output resolution differs from manifest.'); if (!codecMatch) issues.push('Output video codec differs from preset.'); if (!audioPresent) issues.push('Output has no audio stream.'); if (!subtitlesPresent) issues.push('Output has no subtitle stream.'); if (corruption) issues.push('Output corruption detected.');
  return { valid: issues.length === 0, zeroByte, durationMatch, resolutionMatch, codecMatch, audioPresent, subtitlesPresent, corruption, issues, diagnostics };
}
