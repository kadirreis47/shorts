import { useEffect, useState } from 'react';
import { isVerifiedExportJob, listExportPresets } from '@/core/export-intelligence';
import { enqueueActiveExport, loadExportCapabilities, planActiveExport, retryExportJob } from '@/services/exportIntelligenceController';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { useExportIntelligenceStore } from '@/store/exportIntelligenceStore';
import { useMediaStore } from '@/store/mediaStore';
import { usePublishingStore } from '@/store/publishingStore';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';
import type { MediaEngine } from '@/core/media';
import type { Video } from '@/lib/types';

export function AIExportStudio() {
  const manifest = useMediaStore((state) => state.manifest);
  const state = useExportIntelligenceStore();
  const handoff = usePublishingStore((store) => store.handoff);
  const navigate = useUIStore((store) => store.navigate);
  const [preset, setPreset] = useState('generic-short-video');
  const [destination, setDestination] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadExportCapabilities().catch((error) => useExportIntelligenceStore.getState().setError(error instanceof Error ? error.message : 'Capability detection failed.')); }, []);
  useEffect(() => { if (handoff?.kind === 'video-needs-verification') { setPreset('youtube-shorts'); if (!handoff.exportJobId) useExportIntelligenceStore.getState().resetPlan(); } }, [handoff]);
  const requestedExport = handoff?.kind === 'video-needs-verification' && handoff.exportJobId
    ? state.queue.jobs.find((job) => job.id === handoff.exportJobId) ?? null
    : null;
  const requestedExportVerified = isVerifiedExportJob(requestedExport);
  useEffect(() => {
    if (handoff?.kind !== 'video-needs-verification' || !requestedExport || !requestedExportVerified) return;
    const publishing = usePublishingStore.getState();
    publishing.linkVideoExport(handoff.sourceVideoId, requestedExport.id);
    publishing.setHandoff({ kind: 'verified-export', exportJobId: requestedExport.id, sourceVideoId: handoff.sourceVideoId, target: handoff.target });
    navigate('publishing-studio');
  }, [handoff, navigate, requestedExport, requestedExportVerified]);
  async function prepareSelectedVideo() {
    if (handoff?.kind !== 'video-needs-verification') return;
    const result = await supabase.from('videos').select('id,title,scenes,narration_mode').eq('id', handoff.sourceVideoId).single();
    if (result.error) throw new Error(`Selected rendered video could not be loaded: ${result.error.message}`);
    const video = result.data as Pick<Video, 'id' | 'title' | 'scenes' | 'narration_mode'> | null;
    if (!video || video.id !== handoff.sourceVideoId || !Array.isArray(video.scenes) || video.scenes.length === 0) throw new Error('Selected rendered video has no canonical scene source to export.');
    const mediaEngine = applicationContainer.resolve<MediaEngine>(dependencyTokens.mediaEngine);
    const build = await mediaEngine.buildProject({
      projectId: `rendered-video-${video.id}`,
      title: video.title,
      scenes: video.scenes,
      // Null is reserved for legacy rows that predate durable narration intent.
      audio: { narrationMode: video.narration_mode === 'silent' ? 'silent' : 'required' },
    });
    if (!build.renderReady || build.validation.renderReady !== true) throw new Error('Selected rendered video did not pass canonical media validation.');
    useMediaStore.getState().setBuildResult(build.project, build.manifest, build.renderReady, build.assetResolution, build.validation);
  }
  async function plan() { setBusy(true); try { if (handoff?.kind === 'video-needs-verification') await prepareSelectedVideo(); await planActiveExport(preset); } catch (error) { state.setError(error instanceof Error ? error.message : 'Export planning failed.'); } finally { setBusy(false); } }
  async function chooseDestination() { const selected = await window.electronAPI?.ffmpeg.pickOutputPath?.({ defaultPath: `export-${state.currentPlan?.projectId ?? 'video'}.mp4` }); if (selected) setDestination(selected); }
  async function enqueue() { if (!state.currentPlan || !destination || !state.capability?.ffmpeg || !state.capability.ffprobe) return; setBusy(true); try { const job = await enqueueActiveExport(state.currentPlan, destination); if (handoff?.kind === 'video-needs-verification') usePublishingStore.getState().setHandoff({ ...handoff, exportJobId: job.id }); } catch (error) { state.setError(error instanceof Error ? error.message : 'Export enqueue failed.'); } finally { setBusy(false); } }
  async function retryRequestedExport() { if (!requestedExport) return; setBusy(true); try { const retried = await retryExportJob(requestedExport.id); if (!retried) throw new Error('This export cannot be retried. Start a new verified export for the selected video.'); } catch (error) { state.setError(error instanceof Error ? error.message : 'Export retry failed.'); } finally { setBusy(false); } }
  function restartRequestedExport() { if (handoff?.kind !== 'video-needs-verification') return; usePublishingStore.getState().setHandoff({ ...handoff, exportJobId: null }); setDestination(null); state.resetPlan(); }
  const blocked = !state.capability || !state.capability.ffmpeg || !state.capability.ffprobe || !state.currentPlan || state.currentPlan.blockingIssues.length > 0 || !destination;
  const verifiedCount = state.queue.jobs.filter(isVerifiedExportJob).length;
  return <section className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">AI Export Studio</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Export Intelligence Engine</h1><p className="mt-2 text-sm text-slate-500">Runtime capability, deterministic presets, verification and recoverable queue management.</p></div>{handoff?.kind !== 'video-needs-verification' && <button type="button" disabled={verifiedCount === 0} onClick={() => navigate('publishing-studio')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Publish verified export{verifiedCount === 1 ? '' : ` (${verifiedCount})`}</button>}</div>
    {handoff?.kind === 'video-needs-verification' && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><p className="font-medium">Preparing the exact selected video: {handoff.title}</p><p className="mt-1">Source video ID: {handoff.sourceVideoId}. Only an export built from this record can complete this publishing handoff.</p>{requestedExport && <p className="mt-1">Export status: {requestedExport.state}.</p>}{requestedExport && ['failed', 'interrupted'].includes(requestedExport.state) && <button type="button" disabled={busy} onClick={() => void retryRequestedExport()} className="mt-2 rounded border border-blue-400 px-3 py-1 font-medium">Retry this export</button>}{handoff.exportJobId && (!requestedExport || requestedExport.state === 'cancelled' || (requestedExport.state === 'failed' && !requestedExport.failure?.retryable)) && <button type="button" onClick={restartRequestedExport} className="mt-2 rounded border border-blue-400 px-3 py-1 font-medium">Start a new export for this video</button>}</div>}
    {state.lastError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.lastError}</div>}
    {state.capability && !state.capability.ffmpeg && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">FFmpeg is unavailable. A real video export cannot start.</div>}
    <div className="flex flex-wrap gap-2"><select value={preset} onChange={(event) => setPreset(event.target.value)} disabled={handoff?.kind === 'video-needs-verification'} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100">{listExportPresets().map((item) => <option key={item.id} value={item.id}>{item.name} | v{item.version}</option>)}</select><button type="button" disabled={(!manifest && handoff?.kind !== 'video-needs-verification') || busy || !state.capability} onClick={() => void plan()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Plan export</button><button type="button" disabled={!state.currentPlan || busy || !state.capability?.ffmpeg} onClick={() => void chooseDestination()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">{destination ? 'Change destination' : 'Select destination'}</button><button type="button" disabled={blocked || busy} onClick={() => void enqueue()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Queue export</button></div>
    {state.capability && <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Runtime capability</h2><p className="mt-2 text-sm text-slate-600">FFmpeg: {state.capability.ffmpeg ? 'available' : 'unavailable'} | FFprobe: {state.capability.ffprobe ? 'available' : 'unavailable'}</p><p className="text-xs text-slate-500">Encoders: {state.capability.encoders.slice(0, 6).join(', ') || 'none detected'}</p></div>}
    {state.currentPlan && <div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Estimated size</p><p className="mt-1 text-xl font-bold">{Math.round(state.currentPlan.estimatedSizeBytes / 1024 / 1024)} MB</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Estimated render</p><p className="mt-1 text-xl font-bold">{Math.round(state.currentPlan.estimatedRenderMs / 1000)} sec</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Hardware</p><p className="mt-1 text-xl font-bold">{state.currentPlan.preset.hardware}</p></div></div>}
    {state.queue.jobs.length > 0 && <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Export queue</h2>{state.queue.jobs.map((job) => <div key={job.id} className="flex justify-between border-b py-3 text-sm"><span>{job.plan.preset.name}</span><span>{job.state} · {job.progress.percent}%</span></div>)}</div>}
  </section>;
}
