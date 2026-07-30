import { useEffect, useState } from 'react';
import { TrendingUp, Hash, RefreshCw, Loader2, Plus, Trash2, Users, Eye, ArrowUpRight, Flame } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { TrendTopic, CompetitorChannel } from '@/lib/types';
import { Card, Button, EmptyState } from '@/components/ui';
import { formatNumber, classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { fetchTrendTopics } from '@/lib/api';

export function TrendResearch() {
  const { t } = useI18n();
  const [topics, setTopics] = useState<TrendTopic[]>([]);
  const [source, setSource] = useState('youtube');
  const [region, setRegion] = useState('global');
  const [loading, setLoading] = useState(false);
  const [competitors, setCompetitors] = useState<CompetitorChannel[]>([]);
  const [showAddComp, setShowAddComp] = useState(false);

  useEffect(() => { loadCompetitors(); }, []);

  async function loadTrends() {
    setLoading(true);
    try {
      const data = await fetchTrendTopics(source, region);
      setTopics(data);
      // Cache in DB
      for (const topic of data) {
        await supabase.from('trend_topics').insert({
          source, topic: topic.topic, category: topic.category,
          volume: topic.volume, trend_score: topic.trend_score,
          related_hashtags: topic.related_hashtags, region,
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadCompetitors() {
    const { data } = await supabase.from('competitor_channels').select('*').order('created_at', { ascending: false });
    setCompetitors(data ?? []);
  }

  async function addCompetitor(comp: Omit<CompetitorChannel, 'id' | 'created_at'>) {
    await supabase.from('competitor_channels').insert(comp);
    setShowAddComp(false);
    loadCompetitors();
  }

  async function deleteCompetitor(id: string) {
    await supabase.from('competitor_channels').delete().eq('id', id);
    loadCompetitors();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('trends.title')}</h1>
          <p className="text-sm text-slate-500">{t('trends.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={source} onChange={(e) => setSource(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
            <option value="youtube">{t('trends.youtube')}</option>
            <option value="tiktok">{t('trends.tiktok')}</option>
            <option value="google">{t('trends.google')}</option>
            <option value="reddit">{t('trends.reddit')}</option>
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
            <option value="global">{t('trends.global')}</option>
            <option value="US">{t('trends.us')}</option>
            <option value="TR">{t('trends.tr')}</option>
            <option value="GB">{t('trends.uk')}</option>
            <option value="IN">{t('trends.in')}</option>
          </select>
          <Button onClick={loadTrends} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? t('trends.fetching') : t('trends.refresh')}
          </Button>
        </div>
      </div>

      {/* Trend Topics */}
      {topics.length === 0 && !loading ? (
        <EmptyState icon={<TrendingUp size={24} />} title={t('trends.noTrends')} description={t('trends.noTrendsDesc')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <Flame size={10} className="mr-0.5 inline" />{topic.trend_score}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{topic.category}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-800">{topic.topic}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><TrendingUp size={12} /> {formatNumber(topic.volume)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {topic.related_hashtags.slice(0, 4).map((h, j) => (
                  <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{h}</span>
                ))}
              </div>
              <button className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                <ArrowUpRight size={12} /> {t('trends.useTopic')}
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Competitor Tracking */}
      <div className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Users size={18} /> {t('trends.competitors')}
          </h2>
          <Button size="sm" variant="secondary" onClick={() => setShowAddComp(true)}>
            <Plus size={14} /> {t('trends.addCompetitor')}
          </Button>
        </div>

        {competitors.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title={t('trends.noCompetitors')} description="" />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {competitors.map((comp) => (
              <Card key={comp.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{comp.name}</h3>
                    {comp.handle && <p className="text-xs text-slate-500">{comp.handle}</p>}
                  </div>
                  <button onClick={() => deleteCompetitor(comp.id)} className="text-slate-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">{t('trends.subscribers')}</p>
                    <p className="font-medium text-slate-700">{formatNumber(comp.subscriber_count)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t('trends.avgViews')}</p>
                    <p className="font-medium text-slate-700">{formatNumber(comp.avg_views)}</p>
                  </div>
                  {comp.niche && <div><p className="text-xs text-slate-500">{t('trends.niche')}</p><p className="font-medium text-slate-700">{comp.niche}</p></div>}
                  {comp.posting_frequency && <div><p className="text-xs text-slate-500">{t('trends.postingFreq')}</p><p className="font-medium text-slate-700">{comp.posting_frequency}</p></div>}
                </div>
                {comp.notes && <p className="mt-2 text-xs text-slate-500">{comp.notes}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>

      {showAddComp && (
        <AddCompetitorModal onClose={() => setShowAddComp(false)} onAdd={addCompetitor} />
      )}
    </div>
  );
}

function AddCompetitorModal({ onClose, onAdd }: { onClose: () => void; onAdd: (comp: Omit<CompetitorChannel, 'id' | 'created_at'>) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [subs, setSubs] = useState(0);
  const [avgViews, setAvgViews] = useState(0);
  const [niche, setNiche] = useState('');
  const [freq, setFreq] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{t('trends.addCompetitor')}</h3>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('trends.competitorName')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t('trends.competitorHandle')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={subs} onChange={(e) => setSubs(Number(e.target.value))} placeholder={t('trends.subscribers')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input type="number" value={avgViews} onChange={(e) => setAvgViews(Number(e.target.value))} placeholder={t('trends.avgViews')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t('trends.niche')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={freq} onChange={(e) => setFreq(e.target.value)} placeholder={t('trends.postingFreq')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('trends.notes')} rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('videos.cancel')}</Button>
            <Button onClick={() => onAdd({ name, handle, subscriber_count: subs, avg_views: avgViews, niche, posting_frequency: freq, notes })} disabled={!name.trim()}>
              {t('trends.add')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
