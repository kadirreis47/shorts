/** @vitest-environment jsdom */
import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/hooks/useDirectorAnalysis', () => ({
  useDirectorAnalysis: () => ({ analyze: mocks.analyze, cancel: mocks.cancel, status: 'idle', progress: 0, error: null }),
}));

import { DirectorAnalysisAction } from '@/components/DirectorAnalysisAction';
import { AIDirector } from '@/views/AIDirector';
import { useDirectorReportStore } from '@/store/directorReportStore';
import type { ActiveDirectorProjectRequest } from '@/services/directorAnalysisController';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Director analysis action request boundary', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    mocks.analyze.mockReset();
    useDirectorReportStore.getState().reset();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('captures on click under StrictMode and navigates only for an accepted outcome', async () => {
    const captureRequest = vi.fn(() => ({ projectId: 'p' }) as ActiveDirectorProjectRequest);
    const navigate = vi.fn();
    mocks.analyze.mockResolvedValue({ status: 'accepted', report: {} });
    await act(async () => root.render(<StrictMode><DirectorAnalysisAction navigate={navigate} captureRequest={captureRequest} /></StrictMode>));
    expect(captureRequest).not.toHaveBeenCalled();
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
    expect(captureRequest).toHaveBeenCalledOnce();
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('director');
  });

  it('does not navigate for a rejected completion', async () => {
    const captureRequest = vi.fn(() => ({ projectId: 'p' }) as ActiveDirectorProjectRequest);
    const navigate = vi.fn();
    mocks.analyze.mockResolvedValue({ status: 'rejected', reason: 'manifest-stale' });
    await act(async () => root.render(<DirectorAnalysisAction navigate={navigate} captureRequest={captureRequest} />));
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when completion never receives a positive store admission', async () => {
    const captureRequest = vi.fn(() => ({ projectId: 'p' }) as ActiveDirectorProjectRequest);
    const navigate = vi.fn();
    mocks.analyze.mockRejectedValue(new Error('Director completion was not admitted by the report store.'));
    await act(async () => root.render(<DirectorAnalysisAction navigate={navigate} captureRequest={captureRequest} />));
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('routes unbound AI Director start back to Studio without starting analysis', async () => {
    const onNavigateStudio = vi.fn();
    await act(async () => root.render(<AIDirector onNavigateStudio={onNavigateStudio} />));
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
    expect(onNavigateStudio).toHaveBeenCalledOnce();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
