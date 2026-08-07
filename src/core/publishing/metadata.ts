import type { PublishCapability, PublishMetadata, PublishDiagnostic } from './types';
export function validatePublishMetadata(metadata: PublishMetadata, capability: PublishCapability): { issues: readonly PublishDiagnostic[]; warnings: readonly PublishDiagnostic[] } {
  const issues: PublishDiagnostic[] = []; const warnings: PublishDiagnostic[] = [];
  if (!metadata.title.trim()) issues.push({ code: 'title-required', message: 'Title is required.', severity: 'error', field: 'title' });
  if (capability.maxTitleLength !== null && metadata.title.length > capability.maxTitleLength) issues.push({ code: 'title-too-long', message: `Title exceeds ${capability.maxTitleLength} characters.`, severity: 'error', field: 'title' });
  if (capability.maxDescriptionLength !== null && metadata.description.length > capability.maxDescriptionLength) issues.push({ code: 'description-too-long', message: `Description exceeds ${capability.maxDescriptionLength} characters.`, severity: 'error', field: 'description' });
  if (capability.maxHashtags !== null && metadata.hashtags.length > capability.maxHashtags) issues.push({ code: 'hashtags-too-many', message: `At most ${capability.maxHashtags} hashtags are supported.`, severity: 'error', field: 'hashtags' });
  if (metadata.hashtags.some((tag) => !/^#[\p{L}\p{N}_-]+$/u.test(tag))) issues.push({ code: 'hashtag-invalid', message: 'Hashtags must use a platform-safe #tag format.', severity: 'error', field: 'hashtags' });
  if (capability.adapterStatus !== 'implemented') warnings.push({ code: 'adapter-not-production', message: capability.reason, severity: 'warning' });
  return { issues, warnings };
}
