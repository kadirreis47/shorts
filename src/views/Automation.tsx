import { useEffect, useState } from 'react';
import { Plus, Zap, Clock, Play, Pause, Trash2, Edit, X, Sparkles, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AutomationRule, Channel, Template } from '@/lib/types';
import { formatNumber, timeUntil, classNames } from '@/lib/utils';
import { Card, Button, Modal, Toggle, StatusBadge, EmptyState } from '@/components/ui';

interface AutomationProps {
  channels: Channel[];
}

export function Automation({ channels }: AutomationProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  useEffect(() => {
    loadRules();
    (async () => {
      const { data } = await supabase.from('templates').select('*');
      setTemplates(data ?? []);
    })();
  }, []);

  async function loadRules() {
    setLoading(true);
    const { data } = await supabase.from('automation_rules').select('*').order('created_at', { ascending: false });
    setRules(data ?? []);
    setLoading(false);
  }

  async function toggleRule(rule: AutomationRule) {
    const newStatus = rule.status === 'active' ? 'paused' : 'active';
    await supabase.from('automation_rules').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', rule.id);
    await loadRules();
  }

  async function deleteRule(rule: AutomationRule) {
    await supabase.from('automation_rules').delete().eq('id', rule.id);
    await loadRules();
  }

  const totalGenerated = rules.reduce((s, r) => s + r.total_generated, 0);
  const activeRules = rules.filter((r) => r.status === 'active').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automation Engine</h1>
          <p className="text-sm text-slate-500">{activeRules} active rules · {formatNumber(totalGenerated)} videos generated</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> New Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Zap size={14} /> Active Rules</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{activeRules}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Sparkles size={14} /> Total Generated</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(totalGenerated)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Calendar size={14} /> Posts/Day</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{rules.reduce((s, r) => s + r.posts_per_day, 0)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Clock size={14} /> Next Run</div>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {rules.filter((r) => r.next_run_at).sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0]
              ? timeUntil(rules.filter((r) => r.next_run_at).sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0].next_run_at!)
              : '—'}
          </p>
        </Card>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading automation rules…</div>
      ) : rules.length === 0 ? (
        <EmptyState icon={<Zap size={24} />} title="No automation rules yet" description="Create a rule to auto-generate and publish Shorts on a schedule." action={<Button onClick={() => setShowNew(true)}><Plus size={16} /> New Rule</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rules.map((rule) => {
            const ch = channelMap.get(rule.channel_id);
            const tpl = rule.template_id ? templateMap.get(rule.template_id) : null;
            return (
              <Card key={rule.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: ch?.avatar_color ?? '#6366f1' }}>
                      <Zap size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{rule.name}</h3>
                      <p className="text-xs text-slate-500">{ch?.name} · {rule.niche}</p>
                    </div>
                  </div>
                  <StatusBadge status={rule.status} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Source</p>
                    <p className="font-medium capitalize text-slate-700">{rule.source_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Cadence</p>
                    <p className="font-medium capitalize text-slate-700">{rule.cadence} · {rule.posts_per_day}/day</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Template</p>
                    <p className="font-medium text-slate-700">{tpl?.name ?? 'None'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Generated</p>
                    <p className="font-medium text-slate-700">{rule.total_generated} videos</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={classNames('rounded-full px-2 py-0.5 text-xs', rule.auto_publish ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    Auto-publish: {rule.auto_publish ? 'On' : 'Off'}
                  </span>
                  <span className={classNames('rounded-full px-2 py-0.5 text-xs', rule.auto_thumbnail ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    Auto-thumbnail: {rule.auto_thumbnail ? 'On' : 'Off'}
                  </span>
                  <span className={classNames('rounded-full px-2 py-0.5 text-xs', rule.auto_hashtags ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    Auto-hashtags: {rule.auto_hashtags ? 'On' : 'Off'}
                  </span>
                </div>

                {rule.next_run_at && rule.status === 'active' && (
                  <p className="mt-3 text-xs text-slate-500">Next run: {timeUntil(rule.next_run_at)}</p>
                )}

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <Button size="sm" variant={rule.status === 'active' ? 'secondary' : 'primary'} onClick={() => toggleRule(rule)}>
                    {rule.status === 'active' ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(rule)}>
                    <Edit size={14} /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(rule)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RuleModal
        open={showNew || !!editing}
        rule={editing}
        channels={channels}
        templates={templates}
        onClose={() => { setShowNew(false); setEditing(null); }}
        onSaved={loadRules}
      />
    </div>
  );
}

function RuleModal({ open, rule, channels, templates, onClose, onSaved }: {
  open: boolean;
  rule: AutomationRule | null;
  channels: Channel[];
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [channelId, setChannelId] = useState(rule?.channel_id ?? channels[0]?.id ?? '');
  const [niche, setNiche] = useState(rule?.niche ?? '');
  const [sourceType, setSourceType] = useState(rule?.source_type ?? 'trending');
  const [sourceQuery, setSourceQuery] = useState(rule?.source_query ?? '');
  const [templateId, setTemplateId] = useState(rule?.template_id ?? '');
  const [cadence, setCadence] = useState(rule?.cadence ?? 'daily');
  const [postsPerDay, setPostsPerDay] = useState(rule?.posts_per_day ?? 1);
  const [autoPublish, setAutoPublish] = useState(rule?.auto_publish ?? true);
  const [autoThumbnail, setAutoThumbnail] = useState(rule?.auto_thumbnail ?? true);
  const [autoHashtags, setAutoHashtags] = useState(rule?.auto_hashtags ?? true);

  useEffect(() => {
    if (rule) {
      setName(rule.name); setChannelId(rule.channel_id); setNiche(rule.niche ?? '');
      setSourceType(rule.source_type); setSourceQuery(rule.source_query ?? '');
      setTemplateId(rule.template_id ?? ''); setCadence(rule.cadence);
      setPostsPerDay(rule.posts_per_day); setAutoPublish(rule.auto_publish);
      setAutoThumbnail(rule.auto_thumbnail); setAutoHashtags(rule.auto_hashtags);
    }
  }, [rule]);

  async function save() {
    const payload = {
      name, channel_id: channelId, niche, source_type: sourceType, source_query: sourceQuery,
      template_id: templateId || null, cadence, posts_per_day: postsPerDay,
      auto_publish: autoPublish, auto_thumbnail: autoThumbnail, auto_hashtags: autoHashtags,
      updated_at: new Date().toISOString(),
    };
    if (rule) {
      await supabase.from('automation_rules').update(payload).eq('id', rule.id);
    } else {
      await supabase.from('automation_rules').insert({ ...payload, status: 'active' });
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={rule ? 'Edit Rule' : 'New Automation Rule'} size="lg">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Rule Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Mindset Facts"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Channel</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Niche</label>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Self Improvement"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Source Type</label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              <option value="trending">Trending</option>
              <option value="rss">RSS Feed</option>
              <option value="keywords">Keywords</option>
              <option value="reddit">Reddit</option>
              <option value="twitter">Twitter/X</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Source Query</label>
            <input value={sourceQuery} onChange={(e) => setSourceQuery(e.target.value)} placeholder="e.g. productivity tips"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              <option value="">None</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Cadence</label>
            <select value={cadence} onChange={(e) => setCadence(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Posts per day: {postsPerDay}</label>
          <input type="range" min="1" max="10" value={postsPerDay} onChange={(e) => setPostsPerDay(Number(e.target.value))}
            className="mt-1 w-full accent-slate-900" />
        </div>
        <div className="space-y-2 rounded-lg border border-slate-100 p-3">
          <Toggle checked={autoPublish} onChange={setAutoPublish} label="Auto-publish after rendering" />
          <Toggle checked={autoThumbnail} onChange={setAutoThumbnail} label="Auto-generate thumbnails" />
          <Toggle checked={autoHashtags} onChange={setAutoHashtags} label="Auto-generate hashtags" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim() || !channelId}>{rule ? 'Save' : 'Create Rule'}</Button>
        </div>
      </div>
    </Modal>
  );
}
