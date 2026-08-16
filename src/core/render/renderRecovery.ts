import type {
  RenderJobRequest,
  RenderJobSnapshot,
  RenderPreset,
} from './types';
import { readUserScopedLocalStorage, writeUserScopedLocalStorage } from '@/persistence/userScopedStorage';
import { canonicalMediaAssetSource } from '@/core/media/storageIdentity';

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
  requestSnapshot: RenderJobRequest | null;
  replayedAt: string | null;
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
  getReplayRequest(jobId: string): RenderJobRequest | null;
  markReplayed(jobId: string): void;
  list(): RenderRecoveryRecord[];
}

const STORAGE_KEY = 'shortsflow.render-recovery.v1';
const MAX_RECORDS = 40;
export const MAX_RECOVERY_REQUEST_BYTES = 64 * 1024;

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
        requestSnapshot: createRequestSnapshot(request),
        replayedAt: null,
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

    getReplayRequest(jobId) {
      const request = records.find((record) => record.jobId === jobId)
        ?.requestSnapshot;
      return request ? cloneRequest(request) : null;
    },

    markReplayed(jobId) {
      const replayedAt = new Date().toISOString();
      records = records.map((record) =>
        record.jobId === jobId ? { ...record, replayedAt } : record,
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
  try {
    const raw = readUserScopedLocalStorage(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredRecord).filter(isRecoveryRecord)
      : [];
  } catch {
    return [];
  }
}

function persist(records: RenderRecoveryRecord[]): void {
  try {
    writeUserScopedLocalStorage(STORAGE_KEY, JSON.stringify(records));
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
    requestSnapshot: record.requestSnapshot
      ? cloneRequest(record.requestSnapshot)
      : null,
  }));
}

function createRequestSnapshot(request: RenderJobRequest): RenderJobRequest | null {
  try {
    const canonicalRequest = canonicalizeRecoveryRequest(request);
    const serialized = JSON.stringify(canonicalRequest);
    // A caller that bypasses the execution boundary must not make an expiring
    // private Storage URL durable. Leave the job non-replayable instead.
    if (serialized.includes('/storage/v1/object/sign/media/')) return null;
    if (new TextEncoder().encode(serialized).byteLength > MAX_RECOVERY_REQUEST_BYTES) {
      return null;
    }
    return JSON.parse(serialized) as RenderJobRequest;
  } catch {
    return null;
  }
}

function canonicalizeRecoveryRequest(request: RenderJobRequest): RenderJobRequest {
  return {
    ...request,
    manifest: {
      ...request.manifest,
      assets: (request.manifest.assets ?? []).map((asset) => ({
        ...asset,
        source: canonicalMediaAssetSource(asset),
      })),
    },
  };
}

function cloneRequest(request: RenderJobRequest): RenderJobRequest {
  return JSON.parse(JSON.stringify(request)) as RenderJobRequest;
}

function normalizeStoredRecord(record: unknown): unknown {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    requestSnapshot:
      'requestSnapshot' in record ? record.requestSnapshot ?? null : null,
    replayedAt: 'replayedAt' in record ? record.replayedAt ?? null : null,
  };
}

function isRecoveryRecord(record: unknown): record is RenderRecoveryRecord {
  return Boolean(
    record &&
      typeof record === 'object' &&
      'jobId' in record &&
      typeof record.jobId === 'string' &&
      'status' in record &&
      typeof record.status === 'string',
  );
}
