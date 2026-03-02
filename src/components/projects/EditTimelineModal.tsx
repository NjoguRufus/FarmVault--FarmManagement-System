import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useQueryClient, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate, formatDate } from '@/lib/dateUtils';
import { addStageNote, getStageNotes } from '@/services/stageNotesService';
import type { CropStage } from '@/types';

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

interface EditTimelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  companyId: string;
  stages: CropStage[];
  onSaved?: () => void;
  createdBy: string;
}

export function EditTimelineModal({
  open,
  onOpenChange,
  projectId,
  companyId,
  stages,
  onSaved,
  createdBy,
}: EditTimelineModalProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [dateDraft, setDateDraft] = useState<Record<string, { plannedStart?: string; plannedEnd?: string; actualStart?: string; actualEnd?: string }>>({});

  const initialDraft = useMemo(() => {
    const d: Record<string, { plannedStart?: string; plannedEnd?: string; actualStart?: string; actualEnd?: string }> = {};
    stages.forEach((s) => {
      d[s.id] = {
        plannedStart: dateToInputValue(s.plannedStartDate ?? (s as any).plannedStartDate),
        plannedEnd: dateToInputValue(s.plannedEndDate ?? (s as any).plannedEndDate),
        actualStart: dateToInputValue(s.actualStartDate ?? (s as any).actualStartDate),
        actualEnd: dateToInputValue(s.actualEndDate ?? (s as any).actualEndDate),
      };
    });
    return d;
  }, [stages, open]);

  const draft = useMemo(() => ({ ...initialDraft, ...dateDraft }), [initialDraft, dateDraft]);

  const handleSaveTimeline = async () => {
    setSaving(true);
    try {
      for (const stage of stages) {
        const d = draft[stage.id] ?? {};
        const payload: Record<string, unknown> = {};
        const ps = inputValueToDate(d.plannedStart ?? '');
        const pe = inputValueToDate(d.plannedEnd ?? '');
        const as = inputValueToDate(d.actualStart ?? '');
        const ae = inputValueToDate(d.actualEnd ?? '');
        if (ps) payload.plannedStartDate = Timestamp.fromDate(ps);
        if (pe) payload.plannedEndDate = Timestamp.fromDate(pe);
        if (as) payload.actualStartDate = Timestamp.fromDate(as);
        if (ae) payload.actualEndDate = Timestamp.fromDate(ae);
        if (Object.keys(payload).length > 0) {
          await updateDoc(doc(db, 'projectStages', stage.id), payload);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['projectStages'] });
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Timeline</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Edit planned and actual dates per stage. Add notes per stage below.</p>
        <div className="space-y-4 mt-4">
          {stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              companyId={companyId}
              projectId={projectId}
              draft={draft[stage.id] ?? {}}
              onDraftChange={(updates) => setDateDraft((prev) => ({ ...prev, [stage.id]: { ...prev[stage.id], ...updates } }))}
              createdBy={createdBy}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveTimeline} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save timeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  stage,
  companyId,
  projectId,
  draft,
  onDraftChange,
  createdBy,
}: {
  stage: CropStage;
  companyId: string;
  projectId: string;
  draft: { plannedStart?: string; plannedEnd?: string; actualStart?: string; actualEnd?: string };
  onDraftChange: (u: Partial<typeof draft>) => void;
  createdBy: string;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const {
    data: notesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['stageNotes', companyId, projectId, stage.id],
    queryFn: ({ pageParam }) =>
      getStageNotes(companyId, projectId, stage.id, NOTES_PAGE_SIZE, pageParam ?? null),
    initialPageParam: null as import('firebase/firestore').DocumentSnapshot | null,
    getNextPageParam: (lastPage) => lastPage.lastDoc,
    enabled: notesOpen && !!companyId && !!projectId,
    staleTime: 60_000,
  });
  const notes = notesData?.pages.flatMap((p) => p.notes) ?? [];

  const queryClient = useQueryClient();
  const addNoteMutation = useMutation({
    mutationFn: () => addStageNote({ companyId, projectId, stageId: stage.id, text: noteText.trim(), createdBy }),
    onMutate: async () => {
      setAddingNote(true);
    },
    onSuccess: () => {
      setNoteText('');
      setAddingNote(false);
      queryClient.invalidateQueries({ queryKey: ['stageNotes', companyId, projectId, stage.id] });
    },
    onError: () => setAddingNote(false),
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(undefined);
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/40">
      <h4 className="font-medium text-foreground">{stage.stageName}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <label className="text-xs text-muted-foreground">Planned start</label>
          <input
            type="date"
            className="fv-input w-full mt-0.5"
            value={draft.plannedStart ?? ''}
            onChange={(e) => onDraftChange({ plannedStart: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Planned end</label>
          <input
            type="date"
            className="fv-input w-full mt-0.5"
            value={draft.plannedEnd ?? ''}
            onChange={(e) => onDraftChange({ plannedEnd: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Actual start</label>
          <input
            type="date"
            className="fv-input w-full mt-0.5"
            value={draft.actualStart ?? ''}
            onChange={(e) => onDraftChange({ actualStart: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Actual end</label>
          <input
            type="date"
            className="fv-input w-full mt-0.5"
            value={draft.actualEnd ?? ''}
            onChange={(e) => onDraftChange({ actualEnd: e.target.value || undefined })}
          />
        </div>
      </div>
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
            Stage notes ({notes.length})
            {notesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add a note…"
              className="fv-input flex-1 text-sm"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
            />
            <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim() || addingNote}>
              {addingNote ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save note'
              )}
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
            <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
