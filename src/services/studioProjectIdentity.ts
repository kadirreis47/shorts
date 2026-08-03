export interface StudioProjectIdentity {
  current(): string;
  load(projectId: string): string;
  startNew(): string;
}

export function createStudioProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function resolveStudioProjectId(savedProjectId?: string | null, draftProjectId?: string | null): string {
  return savedProjectId?.trim() || draftProjectId?.trim() || createStudioProjectId();
}

export function createStudioProjectIdentity(initialProjectId = createStudioProjectId()): StudioProjectIdentity {
  let projectId = initialProjectId;
  return {
    current: () => projectId,
    load(nextProjectId) {
      if (!nextProjectId.trim()) throw new Error('Studio project ID cannot be empty.');
      projectId = nextProjectId;
      return projectId;
    },
    startNew() {
      projectId = createStudioProjectId();
      return projectId;
    },
  };
}

export function activateStudioProject(identity: StudioProjectIdentity, projectId: string): string {
  identity.load(projectId);
  const mediaProjectId = useMediaStore.getState().manifest?.projectId;
  if (mediaProjectId && mediaProjectId !== projectId) useMediaStore.getState().clearMediaProject();
  useDirectorReportStore.getState().selectProjectReport(projectId);
  return projectId;
}

export function startNewStudioProject(identity: StudioProjectIdentity): string {
  const projectId = identity.startNew();
  useProjectStore.getState().setCurrentProject(null);
  useMediaStore.getState().clearMediaProject();
  useDirectorReportStore.getState().selectProjectReport(projectId);
  return projectId;
}
import { useDirectorReportStore, useMediaStore, useProjectStore } from '@/store';
