import { useMemo } from 'react';
import { usePublishingStore } from '@/store/publishingStore';
import { listPublishCapabilities } from '@/core/publishing';

export function AIPublishingStudio() {
  const jobs = usePublishingStore((state) => state.queue.jobs);
  const capabilities = useMemo(() => listPublishCapabilities(), []);
  return <section className="space-y-6 p-6" aria-label="AI Publishing Studio">
    <header><h1 className="text-2xl font-semibold">AI Publishing Studio</h1><p className="text-sm opacity-70">Verified export artifact’lerini güvenli yayınlama ve zamanlama merkezi.</p></header>
    <div className="grid gap-4 md:grid-cols-3">{capabilities.map((capability) => <article className="rounded-lg border p-4" key={capability.platform}><h2 className="font-medium capitalize">{capability.platform}</h2><p className="text-sm">{capability.adapterStatus}</p><p className="text-xs opacity-70">{capability.reason}</p></article>)}</div>
    <article className="rounded-lg border p-4"><h2 className="font-medium">Publishing queue</h2>{jobs.length === 0 ? <p className="text-sm opacity-70">Henüz yayın işi yok. Verified artifact ve explicit approval gerekir.</p> : <ul>{jobs.map((job) => <li className="flex justify-between border-b py-2 text-sm" key={job.id}><span>{job.metadata.title} · {job.target.platform} · {job.accountBinding.displayName}</span><span>{job.state}</span></li>)}</ul>}</article>
  </section>;
}
