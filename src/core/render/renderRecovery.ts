import type {
  RenderJobRequest,
  RenderJobSnapshot,
  RenderPreset,
} from './types';

export type RecoveryRecordStatus =
  | 'queued'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RenderRecoveryRecord {
  jobId: string;
  projectId: string;
  adapterId: string | null;
  status: RecoveryRecordStatus;
  stage: RenderJobSnapshot['stage'];
  progress: number;
  message: string;
  preset: RenderPreset;
  outputPath?: string;
  manifestProjectId: string;
  requestMetadata: Readonly<Record<string, unknown>>;
  queuedAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface RenderRecoverySnapshot {
  records: RenderRecoveryRecord[];
  interrupted: RenderRecoveryRecord[];
}

export interface RenderRecoveryStore {
  restore(): RenderRecoverySnapshot;
  checkpoint(
    snapshot: RenderJobSnapshot,
    request: RenderJobRequest,
  ): void;
  markInterrupted(jobId: string): void;
  remove(jobId: string): void;
  clearTerminal(): void;
  list(): RenderRecoveryRecord[];
}

const STORAGE_KEY = 'shortsflow.render-recovery.v1';
const MAX_RECORDS = 40;

export function createRenderRecoveryStore(): RenderRecoveryStore {
  let records = loadRecords();

  return {
    restore() {
      const now = new Date().toISOString();
      records = records.map((record) =>
        record.status === 'queued' || record.status === 'running'
          ? {
              ...record,
              status: 'interrupted',
              message: 'Uygulama kapanışı nedeniyle render yarıda kaldı',
              updatedAt: now,
            }
          : record,
      );
      persist(records);

      return {
        records: clone(records),
        interrupted: clone(
          records.filter((record) => record.status === 'interrupted'),
        ),
      };
    },

    checkpoint(snapshot, request) {
      const next: RenderRecoveryRecord = {
        jobId: snapshot.id,
        projectId: snapshot.projectId,
        adapterId: snapshot.adapterId,
        status: mapStatus(snapshot.status),
        stage: snapshot.stage,
        progress: snapshot.progress,
        message: snapshot.message,
        preset: { ...snapshot.preset },
        outputPath: snapshot.outputPath,
        manifestProjectId: request.manifest.projectId,
        requestMetadata: { ...(request.metadata ?? {}) },
        queuedAt: snapshot.queuedAt,
        startedAt: snapshot.startedAt,
        updatedAt: new Date().toISOString(),
        completedAt: snapshot.completedAt,
        error: snapshot.error,
      };

      records = [
        next,
        ...records.filter((record) => record.jobId !== next.jobId),
      ].slice(0, MAX_RECORDS);
      persist(records);
    },

    markInterrupted(jobId) {
      const now = new Date().toISOString();
      records = records.map((record) =>
        record.jobId === jobId
          ? {
              ...record,
              status: 'interrupted',
              message: 'Render işi yarıda kesildi',
              updatedAt: now,
            }
          : record,
      );
      persist(records);
    },

    remove(jobId) {
      records = records.filter((record) => record.jobId !== jobId);
      persist(records);
    },

    clearTerminal() {
      records = records.filter(
        (record) =>
          record.status === 'queued' ||
          record.status === 'running' ||
          record.status === 'interrupted',
      );
      persist(records);
    },

    list() {
      return clone(records);
    },
  };
}

function mapStatus(
  status: RenderJobSnapshot['status'],
): RecoveryRecordStatus {
  if (status === 'queued') return 'queued';
  if (
    status === 'preparing' ||
    status === 'rendering' ||
    status === 'finalizing'
  ) {
    return 'running';
  }
  return status;
}

function loadRecords(): RenderRecoveryRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(records: RenderRecoveryRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Recovery persistence must never block rendering.
  }
}

function clone(
  records: RenderRecoveryRecord[],
): RenderRecoveryRecord[] {
  return records.map((record) => ({
    ...record,
    preset: { ...record.preset },
    requestMetadata: { ...record.requestMetadata },
  }));
}
