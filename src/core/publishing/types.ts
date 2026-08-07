import type { ExportArtifact } from '@/core/export-intelligence';

export type PublishPlatform = 'youtube' | 'tiktok' | 'instagram';
export type PublishAdapterStatus = 'implemented' | 'planned-only' | 'unsupported' | 'authentication-required';
export type PublishState = 'draft' | 'ready' | 'scheduled' | 'queued' | 'uploading' | 'processing' | 'verifying' | 'published' | 'failed' | 'interrupted' | 'cancelled' | 'reconciling';
export type PublishFailureKind = 'retryable' | 'non-retryable' | 'authentication' | 'rate-limit' | 'validation' | 'network' | 'remote-processing' | 'unknown';
export type PublishVisibility = 'public' | 'unlisted' | 'private';

export interface PublishCapability { platform: PublishPlatform; adapterStatus: PublishAdapterStatus; authenticated: boolean; supportsScheduling: boolean; supportsRemoteLookup: boolean; supportsIdempotency: boolean; maxTitleLength: number | null; maxDescriptionLength: number | null; maxHashtags: number | null; reason: string; version: string; }
export interface PublishAccount { id: string; platform: PublishPlatform; accountRef: string; displayName: string; channelRef: string | null; credentialRef: string | null; authenticated: boolean; createdAt: string; }
export interface PublishTarget { platform: PublishPlatform; accountId: string; channelRef: string | null; }
export interface PublishArtifactBinding { artifactPath: string; artifactFingerprint: string; projectId: string; variantId: string | null; exportJobId: string | null; verified: boolean; sizeBytes: number; durationMs: number; diagnostics: Readonly<Record<string, unknown>>; sourceManifestFingerprint: string; }
export interface PublishMetadata { title: string; description: string; hashtags: readonly string[]; caption: string; visibility: PublishVisibility; language: string | null; category: string | null; audienceFlags: Readonly<Record<string, boolean>>; thumbnailPath: string | null; playlistRef: string | null; commentsEnabled: boolean | null; }
export interface PublishSchedule { mode: 'now' | 'scheduled'; scheduledAtUtc: string | null; timezone: string; }
export interface PublishPolicy { maxAttempts: number; accountConcurrency: number; backoffBaseMs: number; backoffMaxMs: number; jitterMs: number; requireApproval: boolean; }
export interface PublishReadiness { ready: boolean; status: 'safe' | 'warning' | 'blocked' | 'unknown'; issues: readonly string[]; warnings: readonly string[]; diagnostics: readonly PublishDiagnostic[]; }
export interface PublishDiagnostic { code: string; message: string; severity: 'info' | 'warning' | 'error'; field?: string; retryable?: boolean; }
export interface PublishProgress { state: PublishState; percent: number; message: string; remoteState: string | null; updatedAt: string; }
export interface PublishFailure { kind: PublishFailureKind; code: string; message: string; retryable: boolean; attempt: number; maxAttempts: number; retryAfterUtc: string | null; stderrTail: readonly string[]; }
export interface PublishReceipt { jobId: string; remotePublishId: string; platform: PublishPlatform; accountRef: string; publishedAt: string; artifactFingerprint: string; metadataFingerprint: string; scheduleIntent: PublishSchedule; remoteUrl: string | null; verification: PublishVerification; }
export interface PublishVerification { valid: boolean; remotePublishId: string; remoteState: 'processing' | 'published' | 'failed' | 'unknown'; checkedAt: string; issues: readonly string[]; }
export interface PublishAttempt { id: string; attempt: number; startedAt: string; endedAt: string | null; idempotencyKey: string; remotePublishId: string | null; }
export interface PublishRevision { id: string; jobId: string; metadataFingerprint: string; schedule: PublishSchedule; createdAt: string; }
export interface PublishJob { id: string; projectId: string; variantId: string | null; target: PublishTarget; accountBinding: PublishAccount; artifact: PublishArtifactBinding; metadata: PublishMetadata; schedule: PublishSchedule; state: PublishState; progress: PublishProgress; readiness: PublishReadiness; idempotencyKey: string; approvalFingerprint: string | null; approvedAt: string | null; attempts: readonly PublishAttempt[]; maxAttempts: number; reconciliationAttempts?: number; nextReconcileAt?: string | null; failure: PublishFailure | null; receipt: PublishReceipt | null; remotePublishId: string | null; createdAt: string; updatedAt: string; }
export interface PublishResult { job: PublishJob; receipt: PublishReceipt | null; failure: PublishFailure | null; }
export interface PublishQueueSnapshot { jobs: readonly PublishJob[]; activeJobId: string | null; paused: boolean; }
export interface PublishQueuePersistence { version: 1; snapshot: PublishQueueSnapshot; savedAt: string; }
export interface PublishAdapterContext { job: PublishJob; signal: AbortSignal; report: (progress: PublishProgress) => Promise<void> | void; }
export interface PublishAdapter { readonly platform: PublishPlatform; capability(): PublishCapability; publish(context: PublishAdapterContext): Promise<{ remotePublishId: string; remoteUrl?: string | null; state: 'processing' | 'published' }>; reconcile(context: PublishAdapterContext): Promise<{ found: boolean; remotePublishId?: string; state?: 'processing' | 'published' | 'failed' | 'unknown'; remoteUrl?: string | null }>; cancel?(context: PublishAdapterContext): Promise<boolean>; }
export interface PublishAdapterRegistry { get(platform: PublishPlatform): PublishAdapter; list(): readonly PublishAdapter[]; }
export interface PublishExecutor { run(job: PublishJob, report: (progress: PublishProgress) => void): Promise<PublishReceipt>; reconcile(job: PublishJob, report: (progress: PublishProgress) => void): Promise<PublishJob>; cancel(jobId: string): Promise<boolean>; }
export interface PublishQueue { enqueue(job: PublishJob): PublishJob; hydrate(snapshot: PublishQueueSnapshot): void; start(now?: Date): Promise<void>; pause(): void; resume(): void; cancel(jobId: string): Promise<boolean>; retry(jobId: string): Promise<PublishJob | null>; reconcile(jobId: string): Promise<PublishJob | null>; get(jobId: string): PublishJob | null; list(): readonly PublishJob[]; snapshot(): PublishQueueSnapshot; }
