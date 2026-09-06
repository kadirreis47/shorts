import { describe, expect, it, vi } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { TypedEventBus } from '@/core/events';
import type { ApplicationEventMap } from '@/core/events';
import { createDirectorApplicationService, type DirectorApplicationOptions, type DirectorRequestLifecycleV1 } from '@/services/directorApplicationService';
import { createDirectorMonitor } from '@/services/directorMonitor';
import { useDirectorReportStore } from '@/store/directorReportStore';
import { directorInput } from './fixtures';

function testLifecycle(
  overrides: Partial<DirectorRequestLifecycleV1> = {},
): DirectorRequestLifecycleV1 {
  return {
    canEmitLifecycleEvent: () => true,
    ownsRequestLifecycle: () => true,
    validateCompletion: () => ({ accepted: true }),
    ...overrides,
  };
}

function testOptions(
  options: Omit<DirectorApplicationOptions, 'lifecycle'> = {},
  lifecycle = testLifecycle(),
): DirectorApplicationOptions {
  return { ...options, lifecycle };
}

describe('DirectorApplicationService', () => {
  it('Director engine sonucunu döndürür ve lifecycle eventlerini yayınlar', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const started = vi.fn();
    const analyzerCompleted = vi.fn();
    const completed = vi.fn();
    bus.on('director:analysis-started', started);
    bus.on('director:analyzer-completed', analyzerCompleted);
    bus.on('director:analysis-completed', ({ report, admission, ...payload }) => {
      completed({ report, admission, ...payload });
      if (admission.validate(report)) admission.acknowledgeStored(report);
    });
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    const report = await service.analyzeInput(directorInput(), testOptions());
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
    await expect(service.analyzeInput(directorInput(), testOptions({ signal: controller.signal }))).rejects.toThrow();
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }));
  });

  it('runs final validation after analyzer awaits and before completed emission', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const analyzerCompleted = vi.fn();
    const completed = vi.fn();
    bus.on('director:analyzer-completed', analyzerCompleted);
    bus.on('director:analysis-completed', completed);
    const validateCompletion = vi.fn(() => {
      expect(analyzerCompleted).toHaveBeenCalledTimes(7);
      expect(completed).not.toHaveBeenCalled();
      return { accepted: false as const, reason: 'visual-snapshot-stale' as const };
    });
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    await expect(service.analyzeInput(directorInput(), {
      lifecycle: testLifecycle({ validateCompletion }),
    })).rejects.toMatchObject({ reason: 'visual-snapshot-stale' });
    expect(validateCompletion).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
  });

  it('uses one ownership callback to suppress stale lifecycle events', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const analyzerCompleted = vi.fn();
    const failed = vi.fn();
    bus.on('director:analyzer-completed', analyzerCompleted);
    bus.on('director:analysis-failed', failed);
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    await expect(service.analyzeInput(directorInput(), {
      lifecycle: testLifecycle({
        canEmitLifecycleEvent: () => false,
        ownsRequestLifecycle: () => false,
        validateCompletion: () => ({ accepted: false, reason: 'superseded' }),
      }),
    })).rejects.toMatchObject({ reason: 'superseded' });
    expect(analyzerCompleted).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('revalidates inside async completion-event admission after the pre-emit check', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const acceptedByListener = vi.fn();
    bus.on('director:analysis-completed', ({ report, admission }) => {
      if (admission.validate(report)) {
        admission.acknowledgeStored(report);
        acceptedByListener();
      }
    });
    const validateCompletion = vi.fn()
      .mockReturnValueOnce({ accepted: true as const })
      .mockReturnValueOnce({ accepted: false as const, reason: 'manifest-stale' as const });
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    await expect(service.analyzeInput(directorInput(), {
      lifecycle: testLifecycle({ validateCompletion }),
    })).rejects.toMatchObject({ reason: 'manifest-stale' });
    expect(validateCompletion).toHaveBeenCalledTimes(2);
    expect(acceptedByListener).not.toHaveBeenCalled();
  });
  it('fails closed when completion dispatch has no positive store admission', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    await expect(service.analyzeInput(directorInput(), testOptions())).rejects.toMatchObject({
      name: 'DirectorCompletionNotAdmittedError',
    });
  });

  it.each([
    ['omitted options', undefined],
    ['undefined lifecycle', { lifecycle: undefined }],
    ['malformed lifecycle', { lifecycle: { canEmitLifecycleEvent: () => true } }],
  ])('fails closed before lifecycle events for %s', async (_label, unsafeOptions) => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const completed = vi.fn();
    const started = vi.fn();
    bus.on('director:analysis-started', started);
    bus.on('director:analysis-completed', completed);
    const monitor = createDirectorMonitor(bus);
    monitor.start();
    const write = vi.spyOn(useDirectorReportStore.getState(), 'analysisCompleted');
    const service = createDirectorApplicationService(createDirectorEngine(), bus);
    const invokeUnsafe = service.analyzeInput as unknown as (
      input: ReturnType<typeof directorInput>,
      options?: unknown,
    ) => Promise<unknown>;

    await expect(invokeUnsafe(directorInput(), unsafeOptions)).rejects.toMatchObject({
      name: 'DirectorLifecycleContractError',
    });
    expect(started).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    monitor.stop();
  });
});
