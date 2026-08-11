import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import { isVerifiedExportJob, type ExportJob } from '@/core/export-intelligence';
import { createPublishSchedule, listPublishCapabilities, type PublishJob, type PublishMetadata, type PublishSchedule } from '@/core/publishing';
import { approveAndEnqueuePublish, buildPublishJob, previewPublishJob, reconcilePublishJob, retryPublishJob } from '@/services/publishingController';
import { useExportIntelligenceStore } from '@/store/exportIntelligenceStore';
import { usePublishingStore } from '@/store/publishingStore';
import { useUIStore } from '@/store/uiStore';

const emptyMetadata: PublishMetadata = { title: '', description: '', caption: '', hashtags: [], visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null };

function verifiedExports(jobs: readonly ExportJob[]) {
  return jobs.filter(isVerifiedExportJob);
}

function queueLabel(job: PublishJob) {
  if (job.state === 'published' && job.receipt) return 'Published and verified';
  if (job.state === 'scheduled' && job.schedule.scheduledAtUtc) return `Scheduled for ${new Date(job.schedule.scheduledAtUtc).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
  if (job.state === 'processing' || job.progress.remoteState === 'processing') return 'YouTube is processing the upload';
  if (job.state === 'reconciling' || job.state === 'interrupted') return 'Verifying remote publication state';
  if (job.failure?.kind === 'authentication') return 'Authentication required';
  if (job.failure?.kind === 'rate-limit' || job.failure?.retryAfterUtc) return 'Waiting for YouTube rate limit';
  if (job.state === 'uploading') return 'Uploading verified artifact';
  if (job.state === 'failed') return 'Action required';
  return job.state;
}

export function AIPublishingStudio() {
  const exportJobs = useExportIntelligenceStore((state) => state.queue.jobs);
  const accounts = usePublishingStore((state) => state.accounts);
  const jobs = usePublishingStore((state) => state.queue.jobs);
  const handoff = usePublishingStore((state) => state.handoff);
  const setHandoff = usePublishingStore((state) => state.setHandoff);
  const navigate = useUIStore((state) => state.navigate);
  const artifacts = useMemo(() => verifiedExports(exportJobs), [exportJobs]);
  const selectableArtifacts = useMemo(() => {
    if (handoff?.kind === 'video-needs-verification') return [];
    if (handoff?.kind === 'verified-export') return artifacts.filter((job) => job.id === handoff.exportJobId);
    return artifacts;
  }, [artifacts, handoff]);
  const usableAccounts = useMemo(() => accounts.filter((account) => account.platform === 'youtube' && account.authenticated && account.credentialRef), [accounts]);
  const [artifactId, setArtifactId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [metadata, setMetadata] = useState<PublishMetadata>(emptyMetadata);
  const [scheduleMode, setScheduleMode] = useState<PublishSchedule['mode']>('now');
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [preview, setPreview] = useState<PublishJob | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'approve' | null>(null);
  const previewVersion = useRef(0);

  useEffect(() => {
    if (handoff?.kind === 'verified-export') { setArtifactId(handoff.exportJobId); return; }
    if (handoff?.kind === 'video-needs-verification') { setArtifactId(''); return; }
    if (!artifactId && artifacts[0]) setArtifactId(artifacts[0].id);
  }, [artifactId, artifacts, handoff]);
  useEffect(() => {
    if (handoff?.kind !== 'video-needs-verification' || !handoff.exportJobId) return;
    const completed = exportJobs.find((job) => job.id === handoff.exportJobId);
    if (!isVerifiedExportJob(completed)) return;
    const publishing = usePublishingStore.getState();
    publishing.linkVideoExport(handoff.sourceVideoId, completed.id);
    publishing.setHandoff({ kind: 'verified-export', exportJobId: completed.id, sourceVideoId: handoff.sourceVideoId });
  }, [exportJobs, handoff]);
  useEffect(() => { if (!accountId && usableAccounts[0]) setAccountId(usableAccounts[0].id); }, [accountId, usableAccounts]);

  const selectedExport = artifacts.find((job) => job.id === artifactId) ?? null;
  const selectedAccount = usableAccounts.find((account) => account.id === accountId) ?? null;
  const capability = useMemo(() => listPublishCapabilities({ youtube: usableAccounts.length > 0 })[0], [usableAccounts.length]);

  function invalidatePreview() { previewVersion.current += 1; if (preview) setMessage('Publishing details changed. Preview and approve the current intent again.'); if (busy === 'preview') setBusy(null); setPreview(null); }
  function updateMetadata<K extends keyof PublishMetadata>(field: K, value: PublishMetadata[K]) { invalidatePreview(); setMetadata((current) => ({ ...current, [field]: value })); }
  function updateScheduleMode(mode: PublishSchedule['mode']) { invalidatePreview(); setScheduleMode(mode); if (mode === 'now') setScheduledAtLocal(''); }
  function updateScheduledAtLocal(value: string) { invalidatePreview(); setScheduledAtLocal(value); }
  function currentSchedule(): PublishSchedule {
    if (scheduleMode === 'now') return createPublishSchedule('now', null, 'UTC');
    if (!scheduledAtLocal) throw new Error('Choose a future date and time before continuing.');
    const components = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(scheduledAtLocal);
    if (!components) throw new Error('Scheduled publish time is invalid.');
    const localDate = new Date(scheduledAtLocal);
    if (!Number.isFinite(localDate.getTime())) throw new Error('Scheduled publish time is invalid.');
    const [, year, month, day, hour, minute] = components;
    if (localDate.getFullYear() !== Number(year)
      || localDate.getMonth() + 1 !== Number(month)
      || localDate.getDate() !== Number(day)
      || localDate.getHours() !== Number(hour)
      || localDate.getMinutes() !== Number(minute)) {
      throw new Error('This local date and time does not exist in your timezone. Choose another time.');
    }
    return createPublishSchedule('scheduled', localDate.toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  function buildCurrentJob() {
    if (!selectedExport?.artifact || !selectedAccount) return null;
    return buildPublishJob({ projectId: selectedExport.projectId, variantId: selectedExport.plan.id, account: selectedAccount, target: { platform: 'youtube', accountId: selectedAccount.id, channelRef: selectedAccount.channelRef }, artifact: selectedExport.artifact, sourceManifestFingerprint: selectedExport.sourceManifestFingerprint, metadata, schedule: currentSchedule() });
  }
  async function previewCurrentJob() {
    const requestVersion = ++previewVersion.current;
    setBusy('preview'); setMessage(null);
    try {
      const job = buildCurrentJob();
      if (!job) throw new Error(selectedAccount ? 'Select a verified export artifact.' : 'Connect an authenticated YouTube channel in Settings before publishing.');
      const nextPreview = await previewPublishJob(job);
      if (previewVersion.current === requestVersion) setPreview(nextPreview);
    } catch (error) { if (previewVersion.current === requestVersion) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Publishing preview could not be created.'); } } finally { if (previewVersion.current === requestVersion) setBusy(null); }
  }
  async function approveCurrentJob() {
    if (!preview) return;
    setBusy('approve'); setMessage(null);
    try {
      const currentJob = buildCurrentJob();
      if (!currentJob) throw new Error('The verified export or authenticated account is no longer available.');
      const currentPreview = await previewPublishJob(currentJob);
      if (currentPreview.approvalFingerprint !== preview.approvalFingerprint) throw new Error('Publishing details changed. Preview and approve the current intent again.');
      await approveAndEnqueuePublish(currentPreview);
      setMessage('Publishing job approved and queued. ShortsFlow will verify YouTube processing before showing success.');
      setPreview(null);
      setHandoff(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Publishing approval could not be completed.'); } finally { setBusy(null); }
  }

  return <section className="mx-auto max-w-6xl space-y-6" aria-label="AI Publishing Studio">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Modern publishing</p><h1 className="mt-1 text-2xl font-bold text-slate-900">AI Publishing Studio</h1><p className="mt-2 text-sm text-slate-500">Publish only verified exports through approval, the durable queue, and YouTube processing reconciliation.</p></header>
    <div className="rounded-xl border bg-white p-4 text-sm"><p className="font-medium capitalize">{capability.platform}</p><p className="mt-1 text-slate-600">Adapter: {capability.adapterStatus} · Account: {capability.authenticated ? 'authenticated' : 'connect a channel in Settings'}</p></div>
    {message && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</div>}
    {handoff?.kind === 'video-needs-verification' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">{handoff.title} must be exported and verified before publishing.</p><p className="mt-1">{handoff.exportJobId ? 'The exact linked export is not yet publishable. Continue its progress or recovery in Export Studio.' : 'No canonical verified artifact is linked to this rendered video.'} ShortsFlow will not substitute an unrelated export.</p><button type="button" onClick={() => navigate('export-studio')} className="mt-3 rounded-lg border border-amber-400 px-3 py-2 font-medium">{handoff.exportJobId ? 'View export progress' : 'Verify this video in Export Studio'}</button></div>}
    {handoff?.kind === 'verified-export' && !selectedExport && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">The selected export is still rendering/verifying or is no longer publishable. This handoff remains bound to export {handoff.exportJobId}; no other artifact will be selected.</div>}
    <article className="rounded-xl border bg-white p-4" aria-label="Create YouTube publish job">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Verified export to YouTube</h2><p className="mt-1 text-sm text-slate-500">The selected artifact retains its verified digest, size, project, and manifest binding.</p></div>{usableAccounts.length === 0 && <button type="button" onClick={() => navigate('settings')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Connect YouTube in Settings</button>}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Verified export<select aria-label="Verified export" value={artifactId} onChange={(event) => { invalidatePreview(); setHandoff(null); setArtifactId(event.target.value); }} disabled={handoff !== null} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Select a verified export</option>{selectableArtifacts.map((job) => <option key={job.id} value={job.id}>{job.plan.preset.name} · {Math.round((job.artifact?.sizeBytes ?? 0) / 1024 / 1024)} MB</option>)}</select></label>
        <label className="text-sm font-medium">YouTube channel<select aria-label="YouTube channel" value={accountId} onChange={(event) => { invalidatePreview(); setAccountId(event.target.value); }} disabled={usableAccounts.length === 0} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Select an authenticated channel</option>{usableAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}{account.channelRef ? ` · ${account.channelRef}` : ''}</option>)}</select></label>
        <label className="text-sm font-medium md:col-span-2">Title<input aria-label="Title" value={metadata.title} onChange={(event) => updateMetadata('title', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-sm font-medium md:col-span-2">Description<textarea aria-label="Description" value={metadata.description} onChange={(event) => updateMetadata('description', event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-sm font-medium">Caption<textarea aria-label="Caption" value={metadata.caption} onChange={(event) => updateMetadata('caption', event.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-sm font-medium">Visibility<select aria-label="Visibility" value={metadata.visibility} onChange={(event) => updateMetadata('visibility', event.target.value as PublishMetadata['visibility'])} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
        <label className="text-sm font-medium">Hashtags (comma-separated)<input aria-label="Hashtags" value={metadata.hashtags.join(', ')} onChange={(event) => updateMetadata('hashtags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-sm font-medium">Category (optional)<input aria-label="Category" value={metadata.category ?? ''} onChange={(event) => updateMetadata('category', event.target.value.trim() || null)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      </div>
      <fieldset className="mt-4 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium">Publish timing</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2"><input aria-label="Publish now" type="radio" name="publish-timing" checked={scheduleMode === 'now'} onChange={() => updateScheduleMode('now')} /> Publish now</label>
          <label className="inline-flex items-center gap-2"><input aria-label="Schedule" type="radio" name="publish-timing" checked={scheduleMode === 'scheduled'} onChange={() => updateScheduleMode('scheduled')} /> Schedule</label>
        </div>
        {scheduleMode === 'scheduled' && <div className="mt-3 max-w-sm"><label className="text-sm font-medium">Local publish date and time<input aria-label="Scheduled publish date and time" type="datetime-local" value={scheduledAtLocal} onChange={(event) => updateScheduledAtLocal(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><p className="mt-1 text-xs text-slate-500">Your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>{scheduledAtLocal && <p className="mt-2 text-sm text-slate-700">Scheduled for {new Date(scheduledAtLocal).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}</div>}
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy !== null || !selectedExport || !selectedAccount} onClick={() => void previewCurrentJob()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">{busy === 'preview' ? 'Checking readiness…' : 'Preview readiness'}</button><button type="button" disabled={!preview || busy !== null} onClick={() => void approveCurrentJob()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Send size={15} />{busy === 'approve' ? 'Approving…' : 'Approve and queue'}</button></div>
      {preview && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><p className="font-medium">Ready for explicit approval</p><p className="mt-1">Approval is bound to this verified artifact, channel, metadata, and target. Any change requires a new preview.</p>{preview.readiness.warnings.map((warning) => <p key={warning} className="mt-1 text-amber-800">{warning}</p>)}</div>}
      {artifacts.length === 0 && <p className="mt-4 text-sm text-amber-800">No verified export is available. Complete export verification before publishing.</p>}
    </article>
    <article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Publishing queue</h2>{jobs.length === 0 ? <p className="mt-2 text-sm text-slate-500">No publishing jobs yet. Verified artifact and explicit approval are required.</p> : <ul className="mt-2 divide-y">{jobs.map((job) => { const reconcilable = job.state === 'reconciling' || job.state === 'interrupted'; const retryable = job.state === 'failed'; return <li className="py-3 text-sm" key={job.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{job.metadata.title} · {job.accountBinding.displayName}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{queueLabel(job)}</span></div><p className="mt-1 text-slate-500">{job.progress.message}{job.failure ? ` ${job.failure.message}` : ''}{job.nextReconcileAt ? ` Next check: ${new Date(job.nextReconcileAt).toLocaleString()}` : ''}</p>{job.state === 'published' && job.receipt && <p className="mt-2 text-emerald-700">Published to YouTube {job.receipt.remoteUrl ? <a className="inline-flex items-center gap-1 underline" href={job.receipt.remoteUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />View publication</a> : `· ${job.receipt.remotePublishId}`}</p>}{(reconcilable || retryable) && <button type="button" onClick={() => void (reconcilable ? reconcilePublishJob(job.id) : retryPublishJob(job.id))} className="mt-2 inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs"><RefreshCw size={12} />{reconcilable ? 'Check remote status' : 'Retry'}</button>}</li>; })}</ul>}</article>
  </section>;
}
