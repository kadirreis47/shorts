// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { TypedEventBus } from '@/core/events';
import type { ApplicationEventMap, DirectorCompletionAdmissionV1 } from '@/core/events';
import { createDirectorMonitor } from '@/services/directorMonitor';
import { mergeDirectorPersistedState, useDirectorReportStore } from '@/store/directorReportStore';
import { directorInput } from './fixtures';

describe('Director Report Store ve Monitor', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); localStorage.clear(); useDirectorReportStore.getState().reset(); });
  it('analysis lifecycle state geçişlerini uygular', async () => {
    const report = await createDirectorEngine().analyze(directorInput()); const store = useDirectorReportStore.getState();
    store.analysisStarted(report.projectId); expect(useDirectorReportStore.getState().analysisStatus).toBe('running');
    useDirectorReportStore.getState().analyzerCompleted('hook'); expect(useDirectorReportStore.getState().analysisProgress).toBeGreaterThan(5);
    useDirectorReportStore.getState().analysisCompleted(report); expect(useDirectorReportStore.getState().analysisStatus).toBe('completed');
  });
  it('proje raporunu saklar ve seçer', async () => {
    const report = await createDirectorEngine().analyze(directorInput()); useDirectorReportStore.getState().analysisCompleted(report);
    useDirectorReportStore.setState({ currentReport: null }); useDirectorReportStore.getState().selectProjectReport(report.projectId);
    expect(useDirectorReportStore.getState().currentReport?.projectId).toBe(report.projectId);
  });
  it('hata durumunu kaydeder', () => {
    useDirectorReportStore.getState().analysisFailed('failed');
    expect(useDirectorReportStore.getState()).toMatchObject({ analysisStatus: 'failed', lastError: 'failed' });
  });
  it('proje raporunu temizler', async () => {
    const report = await createDirectorEngine().analyze(directorInput()); useDirectorReportStore.getState().analysisCompleted(report);
    useDirectorReportStore.getState().clearProjectReport(report.projectId); expect(useDirectorReportStore.getState().reportsByProject[report.projectId]).toBeUndefined();
  });
  it('monitor eventleri store stateine aktarır ve duplicate start koruması uygular', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>(); const monitor = createDirectorMonitor(bus); monitor.start(); monitor.start();
    expect(bus.listenerCount('director:analysis-started')).toBe(1);
    await bus.emit('director:analysis-started', { projectId: 'p', sceneCount: 2, startedAt: new Date(0).toISOString() });
    expect(useDirectorReportStore.getState().activeProjectId).toBe('p'); monitor.stop();
  });
  it('completed eventte reportu storea yazar ve persisted eventi yayınlar', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>(); const persisted = vi.fn(); bus.on('director:report-persisted', persisted);
    const monitor = createDirectorMonitor(bus); monitor.start(); const report = await createDirectorEngine().analyze(directorInput());
    const receipt = completionAdmission();
    await bus.emit('director:analysis-completed', { projectId: report.projectId, overallScore: report.overallScore, recommendationCount: 0,
      analyzerFailureCount: 0, completedAt: new Date(0).toISOString(), report, admission: receipt.admission });
    expect(useDirectorReportStore.getState().currentReport).toEqual(report);
    expect(useDirectorReportStore.getState().lastAnalyzedAt).toBe(new Date(0).toISOString());
    expect(receipt.acknowledgeStored).toHaveBeenCalledOnce();
    expect(persisted).toHaveBeenCalledOnce(); monitor.stop();
  });
  it('completion admission fails closed before the existing store writer', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>(); const persisted = vi.fn(); bus.on('director:report-persisted', persisted);
    const monitor = createDirectorMonitor(bus); monitor.start(); const report = await createDirectorEngine().analyze(directorInput());
    const receipt = completionAdmission(false);
    await bus.emit('director:analysis-completed', { projectId: report.projectId, overallScore: report.overallScore, recommendationCount: 0,
      analyzerFailureCount: 0, completedAt: new Date(0).toISOString(), report, admission: receipt.admission });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
    expect(receipt.acknowledgeStored).not.toHaveBeenCalled();
    expect(persisted).not.toHaveBeenCalled(); monitor.stop();
  });
  it('aynı rapor yeniden analiz edildiğinde completion zamanını ilerletir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    useDirectorReportStore.getState().analysisCompleted(report, '2026-08-03T10:00:00.000Z');
    useDirectorReportStore.getState().analysisCompleted(report, '2026-08-03T11:00:00.000Z');
    expect(useDirectorReportStore.getState().lastAnalyzedAt).toBe('2026-08-03T11:00:00.000Z');
    expect(useDirectorReportStore.getState().lastAnalyzedAt).not.toBe(report.generatedAt);
  });
  it('hydration aktif proje raporunu currentReport olarak türetir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const hydrated = mergeDirectorPersistedState({ reportsByProject: { [report.projectId]: report }, activeProjectId: report.projectId }, useDirectorReportStore.getState());
    expect(hydrated.currentReport).toEqual(report);
  });
  it('hydration persisted analysis completion zamanını korur', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const completedAt = '2026-08-05T12:00:00.000Z';
    const hydrated = mergeDirectorPersistedState({ reportsByProject: { [report.projectId]: report }, activeProjectId: report.projectId, lastAnalyzedAt: completedAt }, useDirectorReportStore.getState());
    expect(hydrated.lastAnalyzedAt).toBe(completedAt);
  });
  it('hydration aktif proje raporu yoksa currentReport değerini null tutar', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const hydrated = mergeDirectorPersistedState({ reportsByProject: { [report.projectId]: report }, activeProjectId: 'missing' }, useDirectorReportStore.getState());
    expect(hydrated).toMatchObject({ activeProjectId: null, currentReport: null });
  });
  it('hydration aktif proje kimliği yoksa en yeni geçerli raporu seçer', async () => {
    const older = await createDirectorEngine().analyze(directorInput());
    const newer = { ...older, projectId: 'newer', generatedAt: '2026-08-04T00:00:00.000Z' };
    const hydrated = mergeDirectorPersistedState({ reportsByProject: { [older.projectId]: older, [newer.projectId]: newer }, activeProjectId: null }, useDirectorReportStore.getState());
    expect(hydrated.currentReport?.projectId).toBe('newer');
  });
  it('eski veya bozuk persisted kayıtları güvenli şekilde ayıklar', () => {
    expect(() => mergeDirectorPersistedState({ reportsByProject: { broken: { projectId: 42 } }, activeProjectId: 'broken' }, useDirectorReportStore.getState())).not.toThrow();
    expect(mergeDirectorPersistedState('invalid', useDirectorReportStore.getState()).currentReport).toBeNull();
  });
  it('eski persisted kayıtta completion zamanı yoksa report zamanına fallback yapar', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const hydrated = mergeDirectorPersistedState({ reportsByProject: { [report.projectId]: report }, activeProjectId: report.projectId }, useDirectorReportStore.getState());
    expect(hydrated.lastAnalyzedAt).toBe(report.generatedAt);
  });
  it('does not acknowledge validator or store-writer failures', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>(); const monitor = createDirectorMonitor(bus); monitor.start();
    const report = await createDirectorEngine().analyze(directorInput());
    const validatorFailure = completionAdmission(() => { throw new Error('validator failed'); });
    await bus.emit('director:analysis-completed', { projectId: report.projectId, overallScore: report.overallScore, recommendationCount: 0,
      analyzerFailureCount: 0, completedAt: new Date(0).toISOString(), report, admission: validatorFailure.admission });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
    expect(validatorFailure.acknowledgeStored).not.toHaveBeenCalled();
    expect(validatorFailure.fail).toHaveBeenCalledOnce();

    const storeFailure = completionAdmission();
    const write = vi.spyOn(useDirectorReportStore.getState(), 'analysisCompleted').mockImplementation(() => { throw new Error('store failed'); });
    await bus.emit('director:analysis-completed', { projectId: report.projectId, overallScore: report.overallScore, recommendationCount: 0,
      analyzerFailureCount: 0, completedAt: new Date(0).toISOString(), report, admission: storeFailure.admission });
    expect(write).toHaveBeenCalledOnce();
    expect(storeFailure.acknowledgeStored).not.toHaveBeenCalled();
    expect(storeFailure.fail).toHaveBeenCalledOnce();
    write.mockRestore();
    monitor.stop();
  });
  it('fails closed when runtime completion admission is missing', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>(); const monitor = createDirectorMonitor(bus); monitor.start();
    const report = await createDirectorEngine().analyze(directorInput());
    await bus.emit('director:analysis-completed', { projectId: report.projectId, overallScore: report.overallScore, recommendationCount: 0,
      analyzerFailureCount: 0, completedAt: new Date(0).toISOString(), report, admission: undefined as never });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
    monitor.stop();
  });
});

function completionAdmission(validate: boolean | (() => boolean) = true) {
  const validateReport = vi.fn(typeof validate === 'function' ? validate : () => validate);
  const acknowledgeStored = vi.fn();
  const fail = vi.fn();
  const admission: DirectorCompletionAdmissionV1 = { validate: validateReport, acknowledgeStored, fail };
  return { admission, validate: validateReport, acknowledgeStored, fail };
}
