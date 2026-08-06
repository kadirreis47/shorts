import type { TimelineSnapshot } from '@/core/editing';

export interface VisualAnalysisRequestIdentity {
  readonly requestId: number;
  readonly projectId: string;
  readonly sourceRevisionId: string;
  readonly sourceManifestFingerprint: string;
}

export function createVisualAnalysisRequestIdentity(snapshot: TimelineSnapshot, requestId: number): VisualAnalysisRequestIdentity {
  return { requestId, projectId: snapshot.projectId, sourceRevisionId: snapshot.revisionId, sourceManifestFingerprint: snapshot.manifestFingerprint };
}
