import type { DirectorInput, DirectorSceneInput } from '@/core/director';

export function directorScene(
  id: string,
  index: number,
  overrides: Partial<DirectorSceneInput> = {},
): DirectorSceneInput {
  const startMs = index * 2_500;
  return {
    id,
    index,
    role: index === 0 ? 'hook' : 'development',
    text: index === 0 ? 'Bunu neden kimse size söylemiyor?' : 'Bu açıklama konuyu netleştiriyor.',
    visualPrompt: `Visual ${id}`,
    startMs,
    endMs: startMs + 2_500,
    durationMs: 2_500,
    intensity: index === 0 ? 0.9 : 0.6,
    cameraMotion: 'zoom_in',
    transition: index === 0 ? 'cut' : 'crossfade',
    assetTypes: ['video'],
    firstVisualChangeMs: 800,
    ...overrides,
  };
}

export function directorInput(
  scenes: readonly DirectorSceneInput[] = [
    directorScene('scene-1', 0),
    directorScene('scene-2', 1),
    directorScene('scene-3', 2, { role: 'cta', text: 'Daha fazlası için takip et.' }),
  ],
): DirectorInput {
  return {
    projectId: 'project-director',
    createdAt: '2026-08-03T00:00:00.000Z',
    durationMs: scenes.reduce((total, scene) => total + scene.durationMs, 0),
    scenes,
    metadata: { source: 'test' },
  };
}
