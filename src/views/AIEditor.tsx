import { AlertTriangle, Download, Loader2, Play } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { EditOperationList } from '@/components/editing/EditOperationList';
import { EditPlanSummary } from '@/components/editing/EditPlanSummary';
import { EditingRevisionControls } from '@/components/editing/EditingRevisionControls';
import { selectEditingWorkspaceView } from '@/components/editing/editorViewState';
import { applyActiveEditPlan, createActiveEditPlan, redoActiveEdit, refreshActiveEditPreview, undoActiveEdit } from '@/services/editingController';
import { useEditingStore } from '@/store/editingStore';

export function AIEditor() {
  const state = useEditingStore(); const plan = state.currentPlan; const preview = state.currentPreview; const view = selectEditingWorkspaceView(state);
  const busy = state.applyStatus === 'planning' || state.applyStatus === 'applying';
  const generate = async () => { try { await createActiveEditPlan(); } catch (error) { useEditingStore.getState().planFailed(error instanceof Error ? error.message : 'Plan failed.'); } };
  const apply = async () => { if (!plan || !preview || !window.confirm('Apply the selected editing operations to the current timeline?')) return; const ids = state.operations.filter((item) => item.status !== 'disabled').map((item) => item.id); try { await applyActiveEditPlan(ids); } catch { /* monitor renders error */ } };
  const toggle = (id: string, enabled: boolean) => { state.operationEnabled(id, enabled); void refreshActiveEditPreview(); };

  if (view.isEmpty) return <Card className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">AI Editor</h1><p className="mt-2 text-sm text-slate-500">Creates a heuristic, reversible editing preview from the current Director report. Nothing changes without approval.</p>{state.lastError && <p className="mt-3 text-sm text-rose-600">{state.lastError}</p>}<Button className="mt-5" disabled={busy} onClick={() => void generate()}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} Create edit plan</Button></Card>;

  const critical = state.conflicts.some((item) => item.severity === 'critical' && !item.resolved);
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">AI Editor</h1><p className="text-sm text-slate-500">Deterministic editing workspace · revision {view.currentRevisionId ?? 'not applied'}</p></div><div className="flex flex-wrap gap-2">{view.showRevisionControls && <EditingRevisionControls undoAvailable={state.undoAvailable} redoAvailable={state.redoAvailable} onUndo={undoActiveEdit} onRedo={redoActiveEdit} />}<Button variant="secondary" disabled={busy} onClick={() => void generate()}><Play size={16} /> New plan</Button>{plan && preview && <Button variant="secondary" onClick={() => exportJson({ plan, preview })}><Download size={16} /> JSON</Button>}{plan && preview && <Button disabled={critical || busy} onClick={() => void apply()}>Apply approved edits</Button>}</div></div>
    {busy && <Card className="p-4"><p className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} /> AI Editor is processing the deterministic timeline…</p></Card>}
    {state.lastError && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{state.lastError}</Card>}
    {view.showAppliedSummary && <Card className="p-4"><h2 className="font-semibold">Applied revision</h2><p className="mt-1 text-sm text-slate-500">Current revision: {view.currentRevisionId}</p><p className="text-sm text-slate-500">History: {view.history.length} revisions{view.lastAppliedAt ? ` · last applied ${view.lastAppliedAt}` : ''}</p><p className="mt-2 text-sm">Undo and redo remain available without generating another plan.</p></Card>}
    {plan && preview && <><EditPlanSummary plan={plan} preview={preview} />{(preview.warnings.length > 0 || critical) && <Card className="border-amber-200 bg-amber-50 p-4"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Warnings & conflicts</h2>{preview.warnings.map((warning) => <p className="mt-1 text-sm" key={warning}>{warning}</p>)}</Card>}<div className="grid gap-5 xl:grid-cols-[2fr_1fr]"><EditOperationList operations={state.operations} onToggle={toggle} /><Card className="p-4"><h2 className="font-semibold">Before / after order</h2><p className="mt-3 text-xs text-slate-500">Before</p><p className="break-words text-sm">{preview.beforeSceneOrder.join(' → ')}</p><p className="mt-3 text-xs text-slate-500">After</p><p className="break-words text-sm">{preview.afterSceneOrder.join(' → ')}</p><h3 className="mt-5 font-medium">Rerender estimate</h3><p className="text-sm text-slate-500">{preview.renderInvalidationEstimate} scenes invalidated; {preview.reusableSegmentCountEstimate} reusable.</p></Card></div></>}
  </div>;
}

function exportJson(value: object): void { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ai-edit-plan.json'; anchor.click(); URL.revokeObjectURL(url); }
