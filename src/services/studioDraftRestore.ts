import type { StudioDraft } from '@/lib/studioDraft';
import type { ProjectDraft } from '@/store/types';

export interface StudioDraftRestoreDecision {
  readonly projectId: string;
  readonly draft: StudioDraft | null;
}

export function resolveRestoredStudioChannelId(
  savedChannelId: string,
  availableChannelIds: readonly string[],
): string {
  const saved = savedChannelId.trim();
  if (saved) return availableChannelIds.includes(saved) ? saved : '';
  return availableChannelIds.length === 1 ? availableChannelIds[0] : '';
}

export function createStudioProjectDraft(draft: StudioDraft): ProjectDraft {
  const projectId = draft.projectId?.trim();
  if (!projectId) throw new Error('Studio draft project ID is required for autosave.');
  return { id: `studio-${projectId}`, projectId, title: draft.title || 'Untitled Studio Project',
    updatedAt: draft.savedAt, data: { ...draft } };
}

export function resolveStudioDraftRestore(input: {
  readonly currentProjectId?: string | null;
  readonly globalDraft: StudioDraft | null;
  readonly projectDrafts: readonly ProjectDraft[];
  readonly fallbackProjectId: string;
}): StudioDraftRestoreDecision {
  const currentProjectId = input.currentProjectId?.trim() || null;
  if (currentProjectId) {
    const stored = input.projectDrafts.find((draft) => draft.projectId === currentProjectId);
    const projectDraft = stored && isStudioDraft(stored.data) && stored.data.projectId === currentProjectId
      ? stored.data
      : null;
    const matchingGlobal = input.globalDraft?.projectId === currentProjectId ? input.globalDraft : null;
    return { projectId: currentProjectId, draft: projectDraft ?? matchingGlobal };
  }
  if (input.globalDraft) {
    return { projectId: input.globalDraft.projectId?.trim() || input.fallbackProjectId, draft: input.globalDraft };
  }
  return { projectId: input.fallbackProjectId, draft: null };
}

function isStudioDraft(value: unknown): value is StudioDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return 'version' in value && value.version === 1 && 'savedAt' in value && typeof value.savedAt === 'string' &&
    'scenes' in value && Array.isArray(value.scenes);
}
