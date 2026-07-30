import type { StudioStep } from './studioDraft';

export type WorkflowStatus = 'complete' | 'current' | 'available' | 'locked';

export interface StudioWorkflowInput {
  currentStep: StudioStep;
  channelId: string;
  topic: string;
  script: string;
  sceneCount: number;
  videoUrl: string;
  published: boolean;
}

export interface StudioWorkflowItem {
  key: StudioStep;
  status: WorkflowStatus;
  complete: boolean;
}

const STEP_ORDER: StudioStep[] = ['topic', 'script', 'style', 'voice', 'render', 'publish'];

export function getStudioWorkflow(input: StudioWorkflowInput): {
  items: StudioWorkflowItem[];
  progress: number;
  furthestUnlockedIndex: number;
} {
  const topicComplete = Boolean(input.channelId && input.topic.trim());
  const scriptComplete = Boolean(input.script.trim() && input.sceneCount > 0);
  const renderComplete = Boolean(input.videoUrl);

  const completion: Record<StudioStep, boolean> = {
    topic: topicComplete,
    script: scriptComplete,
    style: scriptComplete,
    voice: STEP_ORDER.indexOf(input.currentStep) > STEP_ORDER.indexOf('voice') || renderComplete,
    render: renderComplete,
    publish: input.published,
  };

  let derivedUnlocked = 0;
  if (topicComplete) derivedUnlocked = 1;
  if (scriptComplete) derivedUnlocked = 3;
  if (renderComplete) derivedUnlocked = 5;

  const currentIndex = Math.max(0, STEP_ORDER.indexOf(input.currentStep));
  const furthestUnlockedIndex = Math.max(currentIndex, derivedUnlocked);
  const completedCount = STEP_ORDER.filter((step) => completion[step]).length;

  return {
    items: STEP_ORDER.map((key, index) => ({
      key,
      complete: completion[key],
      status: index === currentIndex
        ? 'current'
        : completion[key]
          ? 'complete'
          : index <= furthestUnlockedIndex
            ? 'available'
            : 'locked',
    })),
    progress: Math.round((completedCount / STEP_ORDER.length) * 100),
    furthestUnlockedIndex,
  };
}
