export type SceneRenderDecision =
  | 'render'
  | 'reuse'
  | 'render-dependency';

export interface SceneRenderPlanItem {
  sceneId: string;
  sceneIndex: number;
  fingerprint: string;
  previousFingerprint: string | null;
  decision: SceneRenderDecision;
  reason: string;
  durationMs: number;
  estimatedFrames: number;
}

export interface IncrementalRenderPlan {
  projectId: string;
  planId: string;
  createdAt: string;
  fullRenderRequired: boolean;
  changedSceneIds: string[];
  reusableSceneIds: string[];
  dependencySceneIds: string[];
  items: SceneRenderPlanItem[];
  totalScenes: number;
  renderedScenes: number;
  reusableScenes: number;
  estimatedFrames: number;
  reusableFrames: number;
  estimatedSavedPercent: number;
}

export interface IncrementalRenderSnapshot {
  projectId: string;
  adapterId: string;
  presetId: string;
  sceneFingerprints: Record<string, string>;
  outputUri: string;
  completedAt: string;
}
