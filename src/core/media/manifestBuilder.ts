import type { MediaProject, RenderManifest } from './types';

export function buildRenderManifest(project: MediaProject): RenderManifest {
  return {
    schemaVersion: '1.1',
    projectId: project.id,
    createdAt: new Date().toISOString(),
    durationMs: project.timeline.durationMs,
    render: {
      fps: project.settings.fps,
      width: project.settings.resolution.width,
      height: project.settings.resolution.height,
      aspectRatio: project.settings.aspectRatio,
    },
    assets: project.assets,
    timeline: project.timeline,
    metadata: project.metadata,
  };
}

export function isRenderManifestReady(manifest: RenderManifest): boolean {
  return (
    manifest.timeline.scenes.length > 0 &&
    manifest.durationMs > 0 &&
    manifest.render.fps > 0 &&
    manifest.render.width > 0 &&
    manifest.render.height > 0
  );
}
