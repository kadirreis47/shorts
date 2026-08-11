import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createPersistentStorage } from '@/persistence/storeStorage';
import { isTerminalPublishJob, normalizePublishQueue, rebindPublishJobCredential, type PublishAccount, type PublishJob, type PublishQueueSnapshot } from '@/core/publishing';
import { isVerifiedExportJob, type ExportJob } from '@/core/export-intelligence';

export type PublishingHandoff =
  | { kind: 'verified-export'; exportJobId: string; sourceVideoId: string | null }
  | { kind: 'video-needs-verification'; sourceVideoId: string; title: string; exportJobId: string | null };

export function resolveVideoPublishingHandoff(video: { id: string; title: string }, linkedJob: ExportJob | null | undefined): PublishingHandoff {
  return isVerifiedExportJob(linkedJob)
    ? { kind: 'verified-export', exportJobId: linkedJob.id, sourceVideoId: video.id }
    : { kind: 'video-needs-verification', sourceVideoId: video.id, title: video.title, exportJobId: linkedJob?.id ?? null };
}

interface PublishingState {
  accounts: readonly PublishAccount[];
  queue: PublishQueueSnapshot;
  selectedJobId: string | null;
  handoff: PublishingHandoff | null;
  videoExportLinks: Readonly<Record<string, string>>;
  lastError: string | null;
  upsertAccount: (account: PublishAccount) => void;
  rebindAccountCredential: (account: PublishAccount, previousCredentialRef: string, excludeJobId?: string | null) => Promise<boolean>;
  updateJob: (job: PublishJob) => void;
  setQueue: (queue: PublishQueueSnapshot) => void;
  selectJob: (jobId: string | null) => void;
  setHandoff: (handoff: PublishingHandoff | null) => void;
  linkVideoExport: (videoId: string, exportJobId: string) => void;
  setError: (message: string | null) => void;
}

export const usePublishingStore = create<PublishingState>()(persist((set) => ({
  accounts: [],
  queue: { jobs: [], activeJobId: null, paused: false },
  selectedJobId: null,
  handoff: null,
  videoExportLinks: {},
  lastError: null,
  upsertAccount: (account) => set((state) => ({ accounts: [...state.accounts.filter((item) => item.id !== account.id), account] })),
  rebindAccountCredential: async (account, previousCredentialRef, excludeJobId = null) => {
    let safeToRemove = false;
    const persisted = set((state) => {
      const jobs = state.queue.jobs.map((job) => job.id === excludeJobId ? job : rebindPublishJobCredential(job, account, previousCredentialRef));
      safeToRemove = !jobs.some((job) => !isTerminalPublishJob(job) && job.accountBinding.credentialRef === previousCredentialRef);
      return { accounts: [...state.accounts.filter((item) => item.id !== account.id), account], queue: { ...state.queue, jobs } };
    }) as unknown as Promise<void> | undefined;
    await persisted;
    return safeToRemove;
  },
  updateJob: (job) => set((state) => {
    const index = state.queue.jobs.findIndex((item) => item.id === job.id);
    const jobs = index < 0 ? [...state.queue.jobs, job] : state.queue.jobs.map((item, candidateIndex) => candidateIndex === index ? job : item);
    const active = ['uploading', 'processing', 'verifying', 'reconciling'].includes(job.state) ? job.id : state.queue.activeJobId === job.id ? null : state.queue.activeJobId;
    return { queue: { ...state.queue, jobs, activeJobId: active } };
  }),
  setQueue: (queue) => set({ queue: { ...queue, activeJobId: null } }),
  selectJob: (selectedJobId) => set({ selectedJobId }),
  setHandoff: (handoff) => set({ handoff }),
  linkVideoExport: (videoId, exportJobId) => set((state) => ({ videoExportLinks: { ...state.videoExportLinks, [videoId]: exportJobId } })),
  setError: (lastError) => set({ lastError }),
}), {
  name: 'shortsflow-publishing',
  version: 3,
  storage: createPersistentStorage(),
  skipHydration: true,
  partialize: (state) => ({ accounts: state.accounts, queue: { ...state.queue, activeJobId: null }, videoExportLinks: state.videoExportLinks }),
  onRehydrateStorage: () => (state) => { if (state) state.setQueue(normalizePublishQueue(state.queue)); },
  migrate: (persisted) => {
    const value = persisted as Partial<PublishingState>;
    return { accounts: Array.isArray(value.accounts) ? value.accounts : [], queue: normalizePublishQueue(value.queue ?? { jobs: [], activeJobId: null, paused: false }), videoExportLinks: value.videoExportLinks && typeof value.videoExportLinks === 'object' ? value.videoExportLinks : {}, selectedJobId: null, handoff: null, lastError: null };
  },
}));
