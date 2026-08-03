import type { EditPlan, EditPreview, TimelineRevision } from '@/core/editing';

interface EditingWorkspaceInput {
  readonly activeProjectId: string | null;
  readonly currentPlan: EditPlan | null;
  readonly currentPreview: EditPreview | null;
  readonly currentRevisionId: string | null;
  readonly lastAppliedAt: string | null;
  readonly revisionsByProject: Readonly<Record<string, readonly TimelineRevision[]>>;
}

export function selectEditingWorkspaceView(input: EditingWorkspaceInput) {
  const history = input.activeProjectId ? input.revisionsByProject[input.activeProjectId] ?? [] : [];
  const hasHistory = history.length > 0;
  return {
    history,
    hasHistory,
    isEmpty: !input.currentPlan && !input.currentPreview && !hasHistory,
    showRevisionControls: hasHistory || Boolean(input.currentPlan || input.currentPreview),
    showAppliedSummary: !input.currentPreview && hasHistory,
    currentRevisionId: input.currentRevisionId ?? history.at(-1)?.id ?? null,
    lastAppliedAt: input.lastAppliedAt,
  };
}
