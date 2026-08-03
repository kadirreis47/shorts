import { Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui';

interface EditingRevisionControlsProps {
  readonly undoAvailable: boolean;
  readonly redoAvailable: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export function EditingRevisionControls({ undoAvailable, redoAvailable, onUndo, onRedo }: EditingRevisionControlsProps) {
  return <div className="flex gap-2" aria-label="Revision history controls">
    <Button variant="secondary" disabled={!undoAvailable} onClick={onUndo}><Undo2 size={16} /> Undo</Button>
    <Button variant="secondary" disabled={!redoAvailable} onClick={onRedo}><Redo2 size={16} /> Redo</Button>
  </div>;
}
