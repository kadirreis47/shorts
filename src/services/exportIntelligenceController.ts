import { createExportJob, encoderSupportsCodec, type ExportExecutor, type ExportJob, type ExportPlan, type ExportProgress, type ExportQueue } from '@/core/export-intelligence';
import { getFFmpegBridge, type RenderEngine, type RenderJobSnapshot } from '@/core/render';
import { useMediaStore } from '@/store/mediaStore';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { useExportIntelligenceStore } from '@/store/exportIntelligenceStore';
import { getValidatedOwnerId } from '@/auth/identity';
import type { ExportIntelligenceApplicationService } from './exportIntelligenceApplicationService';
function service(): ExportIntelligenceApplicationService { return applicationContainer.resolve(dependencyTokens.exportIntelligenceApplicationService); }
export async function loadExportCapabilities(): Promise<void> { useExportIntelligenceStore.getState().setCapability(await service().capabilities(true)); }
export async function planActiveExport(presetId?: string): Promise<ExportPlan> { const manifest = useMediaStore.getState().manifest; if (!manifest) throw new Error('Build a validated manifest before export planning.'); const capability = useExportIntelligenceStore.getState().capability ?? await service().capabilities(); useExportIntelligenceStore.getState().setCapability(capability); const plan = await service().plan({ manifest, presetId, capabilities: capability }); const blockers = [...plan.blockingIssues, ...(capability.ffmpeg ? [] : ['FFmpeg unavailable: production export is blocked.']), ...(capability.ffprobe ? [] : ['FFprobe unavailable: artifact verification is required.'])]; const guardedPlan = blockers.length === plan.blockingIssues.length ? plan : { ...plan, blockingIssues: blockers }; useExportIntelligenceStore.getState().setPlan(guardedPlan); return guardedPlan; }
export async function enqueueActiveExport(plan: ExportPlan, outputPath: string): Promise<ExportJob> {
  const manifest = useMediaStore.getState().manifest;
  if (!manifest || manifest.projectId !== plan.projectId) throw new Error('Export plan is stale.');
  const currentFingerprint = (await import('@/core/editing/editPlanCompiler')).createManifestRevisionId(manifest);
  if (currentFingerprint !== plan.sourceManifestFingerprint || manifest.validation?.renderReady !== true) {
    throw new Error('Manifest changed or validation is not render-ready. Re-plan export.');
  }
  if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(outputPath)) throw new Error('Export destination must be an absolute filesystem path.');
  const capability = await service().capabilities();
  if (!capability.ffmpeg) throw new Error('FFmpeg is unavailable. Production export is blocked.');
  if (!capability.ffprobe) throw new Error('FFprobe is unavailable. Artifact verification is required.');
  const queue = await ensureExportQueue();
  const job = createExportJob(plan, manifest, outputPath);
  queue.enqueue(job);
  void queue.start();
  return job;
}
export async function retryExportJob(jobId: string): Promise<ExportJob | null> { const queue = await ensureExportQueue(); return queue.retry(jobId); }

let sharedQueue: ExportQueue | null = null;
let queueReady: Promise<ExportQueue> | null = null;
let queueOwnerId: string | null = null;
async function ensureExportQueue(): Promise<ExportQueue> {
  const ownerId = getValidatedOwnerId();
  if (!ownerId) throw new Error('A validated user is required for export.');
  if (!queueReady || queueOwnerId !== ownerId) { queueOwnerId = ownerId; sharedQueue = null; queueReady = (async () => { await useExportIntelligenceStore.persist.rehydrate(); if (getValidatedOwnerId() !== ownerId) throw new Error('Export owner changed during recovery.'); const queue = getExportQueue(ownerId); queue.hydrate(useExportIntelligenceStore.getState().queue); useExportIntelligenceStore.getState().setQueue(queue.snapshot()); return queue; })(); }
  return queueReady;
}
function getExportQueue(ownerId: string): ExportQueue {
  if (sharedQueue) return sharedQueue;
  const renderEngine = applicationContainer.resolve<RenderEngine>(dependencyTokens.renderEngine);
  const renderJobIds = new Map<string, string>();
  const executor: ExportExecutor = {
    async run(job, report) {
      if (!encoderSupportsCodec(job.plan.preset.encoder, job.plan.preset.videoCodec)) throw new Error('Export plan encoder is incompatible with its selected codec. Re-plan export.');
      const plannedEncoder = job.plan.preset.encoder;
      const encoderMode = plannedEncoder.includes('_') && !plannedEncoder.startsWith('lib') && !plannedEncoder.startsWith('libaom')
        ? 'hardware' as const
        : 'software' as const;
      const renderPreset = {
        id: job.plan.preset.id,
        name: job.plan.preset.name,
        container: job.plan.preset.container,
        videoCodec: job.plan.preset.videoCodec,
        audioCodec: job.plan.preset.audioCodec,
        quality: job.plan.preset.quality === 'preview' ? 'draft' : job.plan.preset.quality === 'archive' ? 'high' : job.plan.preset.quality,
        hardwareAcceleration: encoderMode === 'hardware' ? 'auto' : 'disabled',
        encoder: plannedEncoder,
        encoderMode,
        bitrateKbps: job.plan.preset.bitrateKbps,
        maxBitrateKbps: job.plan.preset.maxBitrateKbps,
        bufferSizeKbps: job.plan.preset.bufferSizeKbps,
        encoderPreset: job.plan.preset.encoderPreset,
        crf: job.plan.preset.crf,
        audioBitrateKbps: job.plan.preset.audioBitrateKbps,
        sampleRate: job.plan.preset.sampleRate,
        audioChannels: job.plan.preset.audioChannels,
        frameRate: job.plan.preset.frameRate,
        pixelFormat: job.plan.preset.pixelFormat,
        threads: job.plan.preset.threads,
        gopFrames: job.plan.preset.gopFrames,
        keyframeInterval: job.plan.preset.keyframeInterval ?? job.plan.preset.gopFrames,
        colorSpace: job.plan.preset.colorSpace,
        profile: job.plan.preset.profile,
      } as const;
      if (getValidatedOwnerId() !== ownerId) throw new Error('Export owner changed while private media was being prepared.');
      const submitted = await renderEngine.submit({ manifest: job.manifest, preset: renderPreset, outputPath: job.outputPath });
      renderJobIds.set(job.id, submitted.id);
      let snapshot: RenderJobSnapshot = submitted;
      while (snapshot.status !== 'completed' && snapshot.status !== 'failed' && snapshot.status !== 'cancelled') {
        await new Promise((resolve) => setTimeout(resolve, 50));
        snapshot = renderEngine.getJob(submitted.id) ?? snapshot;
        report({ jobId: job.id, stage: 'rendering', state: 'rendering', percent: snapshot.progress, etaMs: null, fps: null, speed: null, frame: null, bitrateKbps: null, message: snapshot.message, updatedAt: new Date().toISOString() });
      }
      if (snapshot.status !== 'completed' || !snapshot.output) throw new Error(snapshot.error ?? 'Render failed.');
      const sourcePath = snapshot.output.uri;
      const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
      let finalPath = sourcePath;
      if (normalizePath(sourcePath) !== normalizePath(job.outputPath)) {
        const bridge = getFFmpegBridge();
        if (!bridge?.copyFile) throw new Error('Cache artifact materialization requires the Electron filesystem boundary.');
        const materialized = await bridge.copyFile(sourcePath, job.outputPath);
        finalPath = materialized.path;
      }
      if (normalizePath(finalPath) !== normalizePath(job.outputPath)) throw new Error('Materialized export destination does not match the requested path.');
      return { path: finalPath, sizeBytes: snapshot.output.sizeBytes ?? 0, durationMs: snapshot.output.durationMs, verified: false, diagnostics: { ...snapshot.output.metadata, ...(normalizePath(sourcePath) !== normalizePath(job.outputPath) ? { cacheHit: true, materializedFromCache: true, sourceCacheUri: sourcePath } : {}) }, createdAt: new Date().toISOString() };
    },
    cancel: async (jobId) => {
      const renderJobId = renderJobIds.get(jobId);
      return renderJobId ? renderEngine.cancel(renderJobId) : false;
    },
  };
  sharedQueue = service().createQueue(executor, (job) => { if (getValidatedOwnerId() === ownerId) useExportIntelligenceStore.getState().updateJob(job); }, async (job, artifact) => {
    const verificationJob = { ...job, artifact };
    return service().verify(verificationJob);
  });
  return sharedQueue;
}
export function resetExportRuntimeForOwnerTransition() { sharedQueue = null; queueReady = null; queueOwnerId = null; }
