import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  getLibraryNotes,
  getAllCompanyNotes,
  getLibraryNote,
  getCompanyNote,
  createLibraryNote,
  updateLibraryNote,
  deleteLibraryNote,
} from '@/services/notesService';
import { getCompany } from '@/services/companyService';
import { getCropDisplayName, getCategoryLabel } from '@/constants/notes';
import type { NoteCardData } from '@/components/notes/NoteCard';
import type { NoteFormValues } from '@/components/notes/NoteEditorModal';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function DeveloperCropNotesPage() {
  const { cropId } = useParams<{ cropId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewNoteId, setViewNoteId] = useState<string | null>(null);
  const [viewNoteType, setViewNoteType] = useState<'library' | 'company' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: libraryNotes = [], isLoading: libLoading } = useQuery({
    queryKey: ['notes-library', cropId],
    queryFn: () => getLibraryNotes(cropId ?? ''),
  });

  const { data: companyNotesRaw = [], isLoading: companyLoading } = useQuery({
    queryKey: ['notes-company-all', cropId],
    queryFn: () => getAllCompanyNotes(cropId ?? ''),
  });

  const { data: viewNoteLib } = useQuery({
    queryKey: ['note-view-lib', viewNoteId],
    queryFn: () => (viewNoteId ? getLibraryNote(viewNoteId) : null),
    enabled: !!viewNoteId && viewNoteType === 'library',
  });
  const { data: viewNoteCompany } = useQuery({
    queryKey: ['note-view-company', viewNoteId],
    queryFn: () => (viewNoteId ? getCompanyNote(viewNoteId) : null),
    enabled: !!viewNoteId && viewNoteType === 'company',
  });
  const viewNote = viewNoteType === 'library' ? viewNoteLib : viewNoteCompany;

  const companyIds = [...new Set(companyNotesRaw.map((n: { companyId: string }) => n.companyId))];
  const { data: companyNamesMap = {} } = useQuery({
    queryKey: ['companies-names-notes', companyIds.join(',')],
    queryFn: async () => {
      const names: Record<string, string> = {};
      await Promise.all(
        companyIds.map(async (id) => {
          const c = await getCompany(id);
          names[id] = c?.name ?? id;
        })
      );
      return names;
    },
    enabled: companyIds.length > 0,
  });

  const companyNotes = companyNotesRaw.map((n: { id: string; companyId: string; title: string; category: string; highlights: string[]; tags: string[] }) => ({
    ...n,
    companyName: companyNamesMap[n.companyId] ?? n.companyId,
  }));

  const noteCards: NoteCardData[] = [
    ...libraryNotes.map((n: { id: string; title: string; category: string; highlights: string[]; tags: string[] }) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      highlights: n.highlights ?? [],
      tags: n.tags ?? [],
      badge: 'global' as const,
    })),
    ...companyNotes.map((n: { id: string; title: string; category: string; highlights: string[]; tags: string[]; companyName: string }) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      highlights: n.highlights ?? [],
      tags: n.tags ?? [],
      badge: { companyName: n.companyName },
    })),
  ];

  const initialForEdit = editingId
    ? libraryNotes.find((n: { id: string }) => n.id === editingId)
    : null;

  const handleSave = async (values: NoteFormValues) => {
    if (editingId) {
      await updateLibraryNote(editingId, {
        title: values.title,
        category: values.category,
        content: values.content,
        highlights: values.highlights,
        tags: values.tags,
        status: values.status,
      });
      toast.success('Note updated.');
    } else {
      await createLibraryNote({
        cropId: cropId!,
        category: values.category,
        title: values.title,
        content: values.content,
        highlights: values.highlights,
        tags: values.tags,
        status: values.status ?? 'draft',
        createdBy: user?.id ?? '',
      });
      toast.success('Note created.');
    }
    queryClient.invalidateQueries({ queryKey: ['notes-library'] });
    setEditorOpen(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await deleteLibraryNote(id);
    toast.success('Note deleted.');
    queryClient.invalidateQueries({ queryKey: ['notes-library'] });
    setViewNoteId(null);
  };

  const isLoading = libLoading || companyLoading;
  const cropName = getCropDisplayName(cropId ?? '');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/notes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{cropName}</h1>
          <p className="text-muted-foreground">Knowledge base and company notes</p>
        </div>
        <Button onClick={() => { setEditingId(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add global note
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {noteCards.map((note) => {
            const isGlobal = note.badge === 'global';
            return (
              <div key={note.id} className="relative">
                <NoteCard
                  note={note}
                  onClick={() => {
                    setViewNoteId(note.id);
                    setViewNoteType(isGlobal ? 'library' : 'company');
                  }}
                />
                {isGlobal && (
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); setEditingId(note.id); setEditorOpen(true); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
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
        <p className="text-muted-foreground text-center py-8">No notes yet. Add a global note or share from library.</p>
      )}

      <NoteEditorModal
        open={editorOpen}
        onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditingId(null); }}
        initialValues={initialForEdit ? {
          title: initialForEdit.title,
          category: initialForEdit.category,
          content: initialForEdit.content,
          highlights: initialForEdit.highlights ?? [],
          tags: initialForEdit.tags ?? [],
          status: initialForEdit.status,
        } : undefined}
        onSubmit={handleSave}
        showStatus={true}
        title={editingId ? 'Edit global note' : 'New global note'}
      />

      <Dialog open={!!viewNoteId} onOpenChange={(open) => { if (!open) { setViewNoteId(null); setViewNoteType(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewNote?.title}</DialogTitle>
          </DialogHeader>
          {viewNote && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{getCategoryLabel(viewNote.category)}</p>
              <MarkdownContent content={viewNote.content} />
              {viewNoteType === 'library' && (
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" size="sm" onClick={() => { setEditingId(viewNote.id); setViewNoteId(null); setViewNoteType(null); setEditorOpen(true); }}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(viewNote.id)}>
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
