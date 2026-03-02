import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useQueryClient, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { updateDoc, doc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate, formatDate } from '@/lib/dateUtils';
import { addStageNote, getStageNotes } from '@/services/stageNotesService';
import type { CropStage } from '@/types';
import { toast } from 'sonner';

const NOTES_PAGE_SIZE = 10;

function dateToInputValue(d: Date | null | undefined): string {
  if (!d) return '';
  const date = toDate(d);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

function inputValueToDate(s: string): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface StageEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: CropStage | null;
  project: { id: string; companyId: string; cropType?: string } | null;
  createdBy: string;
  onSaved?: () => void;
}

export function StageEditModal({
  open,
  onOpenChange,
  stage,
  project,
  createdBy,
  onSaved,
}: StageEditModalProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const isPlaceholder = stage?.id?.startsWith?.('placeholder-') ?? false;

  const [draft, setDraft] = useState({
    plannedStart: '',
    plannedEnd: '',
    actualStart: '',
    actualEnd: '',
  });

  const initialDraft = useMemo(() => {
    if (!stage) return { plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '' };
    const s = stage as any;
    return {
      plannedStart: dateToInputValue(s.plannedStartDate ?? s.startDate),
      plannedEnd: dateToInputValue(s.plannedEndDate ?? s.endDate),
      actualStart: dateToInputValue(s.actualStartDate ?? s.startDate),
      actualEnd: dateToInputValue(s.actualEndDate ?? s.endDate),
    };
  }, [stage, open]);

  React.useEffect(() => {
    if (open) setDraft(initialDraft);
  }, [open, initialDraft]);

  const handleSave = async () => {
    if (!stage || !project) return;
    setSaving(true);
    try {
      const ps = inputValueToDate(draft.plannedStart);
      const pe = inputValueToDate(draft.plannedEnd);
      const as = inputValueToDate(draft.actualStart);
      const ae = inputValueToDate(draft.actualEnd);

      if (isPlaceholder) {
        const payload: Record<string, unknown> = {
          projectId: project.id,
          companyId: project.companyId,
          cropType: project.cropType ?? '',
          stageName: stage.stageName,
          stageIndex: stage.stageIndex ?? 0,
          status: 'in-progress',
          createdAt: serverTimestamp(),
        };
        if (as) payload.startDate = Timestamp.fromDate(as);
        if (ae) payload.endDate = Timestamp.fromDate(ae);
        if (ps) payload.plannedStartDate = Timestamp.fromDate(ps);
        if (pe) payload.plannedEndDate = Timestamp.fromDate(pe);
        if (as) payload.actualStartDate = Timestamp.fromDate(as);
        if (ae) payload.actualEndDate = Timestamp.fromDate(ae);
        await addDoc(collection(db, 'projectStages'), payload);
        toast.success('Stage created. You can add notes by clicking the stage again.');
      } else {
        const payload: Record<string, unknown> = {};
        if (ps) payload.plannedStartDate = Timestamp.fromDate(ps);
        if (pe) payload.plannedEndDate = Timestamp.fromDate(pe);
        if (as) payload.actualStartDate = Timestamp.fromDate(as);
        if (ae) payload.actualEndDate = Timestamp.fromDate(ae);
        if (Object.keys(payload).length > 0) {
          payload.updatedAt = serverTimestamp();
          await updateDoc(doc(db, 'projectStages', stage.id), payload);
        }
        toast.success('Stage updated.');
      }
      queryClient.invalidateQueries({ queryKey: ['projectStages'] });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save stage.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveStageId = isPlaceholder ? null : stage?.id ?? null;
  const canAddNotes = !!effectiveStageId && !!project;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit stage: {stage?.stageName ?? 'Stage'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Edit planned and actual dates for this stage. Add notes below.
        </p>
        {!stage && (
          <p className="text-sm text-muted-foreground">No stage selected.</p>
        )}
        {stage && project && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Planned start</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={draft.plannedStart}
                  onChange={(e) => setDraft((d) => ({ ...d, plannedStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Planned end</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={draft.plannedEnd}
                  onChange={(e) => setDraft((d) => ({ ...d, plannedEnd: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Actual start</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={draft.actualStart}
                  onChange={(e) => setDraft((d) => ({ ...d, actualStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Actual end</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={draft.actualEnd}
                  onChange={(e) => setDraft((d) => ({ ...d, actualEnd: e.target.value }))}
                />
              </div>
            </div>

            {isPlaceholder && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                Save this stage first to create it. Then click the stage again to add notes.
              </p>
            )}

            {canAddNotes && (
              <StageNotesBlock
                stageId={effectiveStageId!}
                companyId={project.companyId}
                projectId={project.id}
                createdBy={createdBy}
              />
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !stage || !project}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isPlaceholder ? 'Create stage' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageNotesBlock({
  stageId,
  companyId,
  projectId,
  createdBy,
}: {
  stageId: string;
  companyId: string;
  projectId: string;
  createdBy: string;
}) {
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: notesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['stageNotes', companyId, projectId, stageId],
    queryFn: ({ pageParam }) =>
      getStageNotes(companyId, projectId, stageId, NOTES_PAGE_SIZE, pageParam ?? null),
    initialPageParam: null as import('firebase/firestore').DocumentSnapshot | null,
    getNextPageParam: (lastPage) => lastPage.lastDoc,
    enabled: !!companyId && !!projectId && !!stageId,
    staleTime: 60_000,
  });
  const notes = notesData?.pages.flatMap((p) => p.notes) ?? [];

  const addNoteMutation = useMutation({
    mutationFn: () =>
      addStageNote({ companyId, projectId, stageId, text: noteText.trim(), createdBy }),
    onMutate: () => setAddingNote(true),
    onSuccess: () => {
      setNoteText('');
      setAddingNote(false);
      queryClient.invalidateQueries({ queryKey: ['stageNotes', companyId, projectId, stageId] });
    },
    onError: () => setAddingNote(false),
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(undefined);
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="font-medium text-foreground">Stage notes</h4>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add a note…"
          className="flex-1 border rounded px-2 py-1.5 text-sm bg-background"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
        />
        <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim() || addingNote}>
          Add note
        </Button>
      </div>
      <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
        {notes.map((n) => (
          <li key={n.id} className="bg-muted/50 rounded px-2 py-1.5">
            <p className="text-foreground">{n.text}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(n.createdAt)} · {n.createdBy}
            </p>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
