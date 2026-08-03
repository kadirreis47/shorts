import { describe, expect, it, vi } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { TypedEventBus } from '@/core/events';
import type { ApplicationEventMap } from '@/core/events';
import { createDirectorApplicationService } from '@/services/directorApplicationService';
import { directorInput } from './fixtures';

describe('DirectorApplicationService', () => {
  it('Director engine sonucunu döndürür ve lifecycle eventlerini yayınlar', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const started = vi.fn();
    const analyzerCompleted = vi.fn();
    const completed = vi.fn();
    bus.on('director:analysis-started', started);
    bus.on('director:analyzer-completed', analyzerCompleted);
    bus.on('director:analysis-completed', completed);
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    const report = await service.analyzeInput(directorInput());
    expect(report.projectId).toBe('project-director');
    expect(started).toHaveBeenCalledOnce();
    expect(analyzerCompleted).toHaveBeenCalledTimes(7);
    const recommendationCount = new Set(report.sceneScores.flatMap((scene) => scene.recommendations.map((item) => item.id))).size;
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ projectId: report.projectId, recommendationCount }));
  });

  it('abort hatasında failed lifecycle eventi yayınlar', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const failed = vi.fn();
    bus.on('director:analysis-failed', failed);
    const controller = new AbortController();
    controller.abort();
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    await expect(service.analyzeInput(directorInput(), { signal: controller.signal })).rejects.toThrow();
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }));
  });
});
