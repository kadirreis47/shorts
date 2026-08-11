import type { ExportArtifact } from '@/core/export-intelligence';
import { getPublishCapability } from './capabilities';
import { artifactFingerprint } from './fingerprints';
import { validatePublishMetadata } from './metadata';
import type { PublishArtifactBinding, PublishMetadata, PublishReadiness, PublishTarget } from './types';
export function evaluatePublishReadiness(input: { artifact: ExportArtifact; target: PublishTarget; metadata: PublishMetadata; projectId: string; sourceManifestFingerprint: string; }): PublishReadiness {
  const capability = getPublishCapability(input.target.platform); const metadataResult = validatePublishMetadata(input.metadata, capability); const issues = [...metadataResult.issues.map((item) => item.message)]; const warnings = [...metadataResult.warnings.map((item) => item.message)];
  if (!input.artifact.verified) issues.push('Export artifact must be verified before publishing.');
  if (!/^[a-f0-9]{64}$/.test(input.artifact.contentDigest ?? '')) issues.push('Export artifact requires a verified content digest before publishing.');
  if (!input.artifact.path || input.artifact.sizeBytes <= 0) issues.push('Publish artifact is missing or empty.');
  if (input.artifact.path.startsWith('render-plan://')) issues.push('RenderPlanAdapter artifacts are not publishable production media.');
  if (capability.adapterStatus !== 'implemented') issues.push(`Publishing adapter for ${input.target.platform} is not production-enabled.`);
  return { ready: issues.length === 0, status: issues.length ? 'blocked' : warnings.length ? 'warning' : 'safe', issues, warnings, diagnostics: [...metadataResult.issues, ...metadataResult.warnings] };
}
export function bindPublishArtifact(artifact: ExportArtifact, projectId: string, sourceManifestFingerprint: string, variantId: string | null, exportJobId: string | null): PublishArtifactBinding { return { artifactPath: artifact.path, artifactFingerprint: artifactFingerprint(artifact), projectId, variantId, exportJobId, verified: artifact.verified, contentDigest: artifact.contentDigest ?? null, sizeBytes: artifact.sizeBytes, durationMs: artifact.durationMs, diagnostics: { ...artifact.diagnostics }, sourceManifestFingerprint }; }
