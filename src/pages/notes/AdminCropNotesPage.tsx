import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/notes/NoteCard';
import { NoteEditorModal } from '@/components/notes/NoteEditorModal';
import { MarkdownContent } from '@/components/notes/MarkdownContent';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getSharedLibraryNotesForCompany,
  getCompanyNotesPaginated,
  getLibraryNote,
  getCompanyNote,
  createCompanyNote,
  updateCompanyNote,
  deleteCompanyNote,
} from '@/services/notesService';
import { getCropDisplayName, getCropIcon, getCategoryLabel } from '@/constants/notes';
import type { NoteCardData } from '@/components/notes/NoteCard';
import type { NoteFormValues } from '@/components/notes/NoteEditorModal';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminCropNotesPage() {
  const { cropId } = useParams<{ cropId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const companyId = user?.companyId ?? '';
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewNoteId, setViewNoteId] = useState<string | null>(null);
  const [viewNoteType, setViewNoteType] = useState<'shared' | 'company' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: sharedNotes = [], isLoading: sharedLoading } = useQuery({
    queryKey: ['notes-shared', companyId, cropId],
    queryFn: () => getSharedLibraryNotesForCompany(companyId),
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const PAGE_SIZE = 30;
  const {
    data: companyNotesData,
    isLoading: companyLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['notes-company', companyId, cropId ?? ''],
    queryFn: ({ pageParam }) =>
      getCompanyNotesPaginated(companyId, cropId ?? undefined, PAGE_SIZE, pageParam ?? null),
    initialPageParam: null as import('firebase/firestore').DocumentSnapshot | null,
    getNextPageParam: (lastPage) => lastPage.lastDoc,
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
  const companyNotes = companyNotesData?.pages.flatMap((p) => p.notes) ?? [];

  const sharedForCrop = sharedNotes.filter((n: { cropId: string }) => n.cropId === cropId);

  const { data: viewNoteLib } = useQuery({
    queryKey: ['note-view-lib', viewNoteId],
    queryFn: () => (viewNoteId ? getLibraryNote(viewNoteId) : null),
    enabled: !!viewNoteId && viewNoteType === 'shared',
  });
  const { data: viewNoteCompany } = useQuery({
    queryKey: ['note-view-company', viewNoteId],
    queryFn: () => (viewNoteId ? getCompanyNote(viewNoteId) : null),
    enabled: !!viewNoteId && viewNoteType === 'company',
  });
  const viewNote = viewNoteType === 'shared' ? viewNoteLib : viewNoteCompany;

  const noteCards: NoteCardData[] = [
    ...sharedForCrop.map((n: { id: string; title: string; category: string; highlights: string[]; tags: string[] }) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      highlights: n.highlights ?? [],
      tags: n.tags ?? [],
      badge: { companyName: 'Shared by FarmVault' },
    })),
    ...companyNotes.map((n: { id: string; title: string; category: string; highlights: string[]; tags: string[] }) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      highlights: n.highlights ?? [],
      tags: n.tags ?? [],
      badge: { companyName: 'Your company' },
    })),
  ];

  const initialForEdit = editingId
    ? companyNotes.find((n: { id: string }) => n.id === editingId)
    : null;

  const handleSave = async (values: NoteFormValues) => {
    if (!companyId || !user?.id) return;
    if (editingId) {
      await updateCompanyNote(
        editingId,
        {
          title: values.title,
          category: values.category,
          content: values.content,
          highlights: values.highlights,
          tags: values.tags,
        },
        companyId
      );
      toast.success('Note updated.');
    } else {
      await createCompanyNote({
        companyId,
        cropId: cropId!,
        category: values.category,
        title: values.title,
        content: values.content,
        highlights: values.highlights,
        tags: values.tags,
        createdBy: user.id,
      });
      toast.success('Note created.');
    }
    queryClient.invalidateQueries({ queryKey: ['notes-company', companyId, cropId ?? ''] });
    setEditorOpen(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await deleteCompanyNote(id);
    toast.success('Note deleted.');
    queryClient.invalidateQueries({ queryKey: ['notes-company', companyId, cropId ?? ''] });
    setViewNoteId(null);
    setViewNoteType(null);
  };

  const isLoading = companyLoading;
  const cropName = getCropDisplayName(cropId ?? '');
  const cropIcon = getCropIcon(cropId ?? '');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/notes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-2xl" aria-hidden>{cropIcon}</span>
            {cropName}
          </h1>
          <p className="text-muted-foreground">Shared notes (read-only) and your company notes</p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setEditorOpen(true);
          }}
          disabled={!companyId}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add company note
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {noteCards.map((note) => {
            const isCompany = note.badge !== 'global' && (note.badge as { companyName: string }).companyName === 'Your company';
            return (
              <div key={note.id} className="relative">
                <NoteCard
                  note={note}
                  onClick={() => {
                    setViewNoteId(note.id);
                    setViewNoteType(isCompany ? 'company' : 'shared');
                  }}
                />
                {isCompany && (
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(note.id);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(note.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {noteCards.length === 0 && !isLoading && (
        <p className="text-muted-foreground text-center py-8">
          No notes yet. Add a company note or ask your admin to share notes.
        </p>
      )}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      <NoteEditorModal
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingId(null);
        }}
        initialValues={
          initialForEdit
            ? {
                title: initialForEdit.title,
                category: initialForEdit.category,
                content: initialForEdit.content,
                highlights: initialForEdit.highlights ?? [],
                tags: initialForEdit.tags ?? [],
              }
            : undefined
        }
        onSubmit={handleSave}
        showStatus={false}
        title={editingId ? 'Edit company note' : 'New company note'}
      />

      <Dialog
        open={!!viewNoteId}
        onOpenChange={(open) => {
          if (!open) {
            setViewNoteId(null);
            setViewNoteType(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewNote?.title}</DialogTitle>
          </DialogHeader>
          {viewNote && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {getCategoryLabel(viewNote.category)}
              </p>
              <MarkdownContent content={viewNote.content} />
              {viewNoteType === 'company' && (
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingId(viewNote.id);
                      setViewNoteId(null);
                      setViewNoteType(null);
                      setEditorOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(viewNote.id)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
