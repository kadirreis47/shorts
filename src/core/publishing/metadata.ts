import type { PublishCapability, PublishMetadata, PublishDiagnostic } from './types';
export function composeYouTubeDescription(metadata: Pick<PublishMetadata, 'description' | 'caption'>): string {
  return [metadata.description, metadata.caption].filter((value) => value.length > 0).join('\n\n');
}
export function validatePublishMetadata(metadata: PublishMetadata, capability: PublishCapability): { issues: readonly PublishDiagnostic[]; warnings: readonly PublishDiagnostic[] } {
  const issues: PublishDiagnostic[] = []; const warnings: PublishDiagnostic[] = [];
  const outboundDescription = capability.platform === 'youtube' ? composeYouTubeDescription(metadata) : metadata.description;
  if (!metadata.title.trim()) issues.push({ code: 'title-required', message: 'Title is required.', severity: 'error', field: 'title' });
  if (capability.maxTitleLength !== null && metadata.title.length > capability.maxTitleLength) issues.push({ code: 'title-too-long', message: `Title exceeds ${capability.maxTitleLength} characters.`, severity: 'error', field: 'title' });
  if (capability.maxDescriptionLength !== null && outboundDescription.length > capability.maxDescriptionLength) issues.push({ code: 'description-too-long', message: `Description exceeds ${capability.maxDescriptionLength} characters after platform formatting.`, severity: 'error', field: 'description' });
  if (capability.maxHashtags !== null && metadata.hashtags.length > capability.maxHashtags) issues.push({ code: 'hashtags-too-many', message: `At most ${capability.maxHashtags} hashtags are supported.`, severity: 'error', field: 'hashtags' });
  if (metadata.hashtags.some((tag) => !/^#[\p{L}\p{N}_-]+$/u.test(tag))) issues.push({ code: 'hashtag-invalid', message: 'Hashtags must use a platform-safe #tag format.', severity: 'error', field: 'hashtags' });
  if (capability.platform === 'youtube') {
    if (metadata.thumbnailPath !== null) issues.push({ code: 'youtube-thumbnail-unsupported', message: 'YouTube thumbnail publishing is not supported by the current publishing adapter.', severity: 'error', field: 'thumbnailPath' });
    if (metadata.playlistRef !== null) issues.push({ code: 'youtube-playlist-unsupported', message: 'YouTube playlist assignment is not supported by the current publishing adapter.', severity: 'error', field: 'playlistRef' });
    if (metadata.commentsEnabled !== null) issues.push({ code: 'youtube-comments-setting-unsupported', message: 'YouTube comment settings are not supported by the current publishing adapter.', severity: 'error', field: 'commentsEnabled' });
  }
  if (capability.adapterStatus !== 'implemented') warnings.push({ code: 'adapter-not-production', message: capability.reason, severity: 'warning' });
  return { issues, warnings };
}
