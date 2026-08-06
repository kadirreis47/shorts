import { Download, Eye, Play, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { getVisualOperationCapability } from '@/core/visual-production';
import { applyActiveVisualPlan, cancelActiveVisualAnalysis, cancelActiveVisualPreview, createActiveVisualPlan, redoVisual, refreshVisualPreview, undoVisual } from '@/services/visualProductionController';
import { useVisualProductionStore } from '@/store/visualProductionStore';

export function AIVisualStudio() {
  const state = useVisualProductionStore();
  const mounted = useRef(true);
  const mountCycle = useRef<symbol>(Symbol('initial-mount'));
  const revisionInFlight = useRef(false);
  const analysisInFlight = useRef(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  useEffect(() => {
    const cycle = Symbol('mount-cycle');
    mountCycle.current = cycle;
    mounted.current = true;
    return () => {
      if (mountCycle.current === cycle) mounted.current = false;
      cancelActiveVisualAnalysis();
      cancelActiveVisualPreview();
    };
  }, []);
  const plan = state.plan;
  const preview = state.preview;
  const busy = state.status === 'analyzing' || state.status === 'applying';
  const previewBusy = state.previewStatus === 'loading';
  const refresh = () => void refreshVisualPreview().catch(() => { /* Controller records only the newest request failure. */ });
  const generate = () => {
    if (analysisInFlight.current) return;
    analysisInFlight.current = true;
    const cycle = mountCycle.current;
    void createActiveVisualPlan().catch(() => { /* Controller records only the current analysis failure. */ }).finally(() => {
      if (mounted.current && mountCycle.current === cycle) analysisInFlight.current = false;
    });
  };
  const apply = () => { if (preview && window.confirm(`Apply ${preview.operationCount} explicitly approved visual operations?`)) void applyActiveVisualPlan().catch((error) => state.fail(error instanceof Error ? error.message : 'Apply failed.')); };
  const moveRevision = (kind: 'undo' | 'redo') => {
    if (revisionInFlight.current) return;
    revisionInFlight.current = true;
    setRevisionBusy(true);
    const cycle = mountCycle.current;
    const action = kind === 'undo' ? undoVisual : redoVisual;
    void action().catch((error) => {
      if (mounted.current && mountCycle.current === cycle) state.fail(error instanceof Error ? error.message : `Visual ${kind} failed.`);
    }).finally(() => {
      revisionInFlight.current = false;
      if (mounted.current && mountCycle.current === cycle) setRevisionBusy(false);
    });
  };
  if (!plan) return <Card className="mx-auto max-w-xl p-8 text-center"><Eye className="mx-auto text-violet-600"/><h1 className="mt-3 text-xl font-semibold">AI Visual Studio</h1><p className="mt-2 text-sm text-slate-500">Deterministic composition, motion, continuity, quality, hook and readability intelligence.</p>{state.error && <p className="mt-3 text-sm text-rose-600">{state.error}</p>}<Button className="mt-5" disabled={busy} onClick={generate}><Play size={16}/> Analyze visuals</Button></Card>;
  return <div className="space-y-5">
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">AI Visual Studio</h1><p className="text-sm text-slate-500">Explainable heuristics · manifest revision {state.snapshot?.revisionId}</p></div><div className="flex gap-2"><Button variant="secondary" disabled={revisionBusy || busy || previewBusy || (state.history[state.activeProjectId ?? '']?.length ?? 0) < 2} onClick={() => moveRevision('undo')}><Undo2 size={16}/> {revisionBusy ? 'Working...' : 'Undo'}</Button><Button variant="secondary" disabled={revisionBusy || busy || previewBusy || !state.redoStack[state.activeProjectId ?? '']?.length} onClick={() => moveRevision('redo')}><Redo2 size={16}/> Redo</Button><Button variant="secondary" disabled={busy || previewBusy || revisionBusy} onClick={generate}><Play size={16}/> New analysis</Button>{preview && <Button variant="secondary" onClick={() => exportJson({ plan, preview, operationResults: preview.operationResults })}><Download size={16}/> JSON Export</Button>}<Button disabled={!preview || !preview.operationCount || busy || previewBusy || revisionBusy} onClick={apply}>Apply</Button></div></header>
    {revisionBusy && <Card className="border-amber-200 bg-amber-50 p-4 text-amber-700">Visual revision operation is in progress.</Card>}{state.error && <Card className="border-rose-200 bg-rose-50 p-4 text-rose-700">{state.error}</Card>}
    <p className="text-xs text-slate-500">Operations are scene-local by default. An explicitly asset-global operation rerenders every scene referencing that asset; each operation's <code>scope</code> is included in JSON export.</p>
    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">{Object.entries(plan.scores).map(([key, value]) => <Card className="p-4" key={key}><p className="text-xs uppercase text-slate-500">{key === 'overall' ? 'Visual Score' : key}</p><p className="text-2xl font-bold">{value}</p></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><Card className="p-5"><h2 className="font-semibold">Recommendations & Operations</h2><div className="mt-3 space-y-3">{state.operations.map((operation) => { const capability = getVisualOperationCapability(operation.type); const implemented = capability.support === 'implemented'; return <div className="rounded-lg border p-3" key={operation.id}><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{operation.type} · {operation.sceneId}</p><p className="text-xs text-slate-500">{operation.reason}</p><span className={implemented ? 'text-xs text-emerald-700' : 'text-xs font-medium text-amber-700'}>{capability.label}</span>{!implemented && <p className="text-xs text-amber-700">{capability.diagnostic}</p>}</div><label className="text-sm"><input checked={implemented && operation.status !== 'disabled'} disabled={!implemented || busy || previewBusy || revisionBusy} onChange={(event) => { state.toggle(operation.id, event.target.checked); refresh(); }} type="checkbox"/> enabled</label></div><label className="mt-2 block text-sm"><input checked={state.approvedIds.includes(operation.id)} disabled={!implemented || operation.status === 'disabled' || busy || previewBusy || revisionBusy} onChange={(event) => { state.approve(operation.id, event.target.checked); refresh(); }} type="checkbox"/> explicit approval</label></div>; })}</div></Card>
      <div className="space-y-5"><Card className="p-5"><h2 className="font-semibold">Preview</h2>{previewBusy ? <p className="mt-2 text-sm text-amber-700">Updating preview for the latest selections...</p> : preview ? <><p className="mt-2 text-sm">{preview.operationCount} applied operations · {preview.rerenderSceneIds.length} scenes rerendered</p><p className="text-sm">Estimated score: {preview.estimatedScore}</p><p className="text-xs text-slate-500">{preview.reusableSceneIds.length} cached scenes reusable</p>{preview.operationResults.filter((item) => item.status === 'planned-only' || item.status === 'rejected').map((item) => <p className="mt-2 text-xs text-amber-700" key={item.operationId}>{item.type}: {item.status} — {item.diagnostic}</p>)}</> : <p className="text-sm text-amber-700">Refresh approval to create the required preview.</p>}</Card><Card className="p-5"><h2 className="font-semibold">Color Grade Planner</h2><p className="mt-2 capitalize">{plan.colorGrade.style} · {Math.round(plan.colorGrade.intensity * 100)}%</p><p className="text-xs text-slate-500">{plan.colorGrade.reason}</p></Card><Card className="p-5"><h2 className="font-semibold">B-roll Opportunities</h2><p className="text-xs text-amber-700">Plan only in this version; no asset is searched or inserted.</p>{plan.broll.map((item) => <p className="mt-2 text-sm" key={item.sceneId}>{item.sceneId} · {item.mode} · {item.score}</p>)}</Card></div></div>
  </div>;
}
function exportJson(value: object) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'ai-visual-production-plan.json'; link.click(); URL.revokeObjectURL(url); }
