import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCropDisplayName } from '@/constants/notes';
import type { LibraryNote } from '@/types';

interface LibraryNoteWithId extends LibraryNote {
  id: string;
}

export function ShareNotesModal({
  open,
  onOpenChange,
  libraryNotes,
  companies,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  libraryNotes: LibraryNoteWithId[];
  companies: { id: string; name?: string }[];
  onShare: (companyId: string, noteIds: string[]) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [cropFilter, setCropFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sharing, setSharing] = useState(false);

  const filteredNotes = useMemo(() => {
    let list = libraryNotes;
    if (cropFilter && cropFilter !== 'all') {
      list = list.filter((n) => n.cropId === cropFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [libraryNotes, cropFilter, search]);

  const cropIds = useMemo(() => {
    const set = new Set(libraryNotes.map((n) => n.cropId));
    return Array.from(set).sort();
  }, [libraryNotes]);

  const toggleNote = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedNoteIds.size === filteredNotes.length) {
      setSelectedNoteIds(new Set());
    } else {
      setSelectedNoteIds(new Set(filteredNotes.map((n) => n.id)));
    }
  };

  const handleShare = async () => {
    if (!companyId || selectedNoteIds.size === 0) return;
    setSharing(true);
    try {
      await onShare(companyId, Array.from(selectedNoteIds));
      onOpenChange(false);
      setStep(1);
      setCompanyId('');
      setSelectedNoteIds(new Set());
    } finally {
      setSharing(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep(1);
      setCompanyId('');
      setSelectedNoteIds(new Set());
      setCropFilter('all');
      setSearch('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Share Notes to Company</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <Label>Select company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a company…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name ?? c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!companyId}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={cropFilter} onValueChange={setCropFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All crops</SelectItem>
                  {cropIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {getCropDisplayName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                {selectedNoteIds.size === filteredNotes.length && filteredNotes.length > 0
                  ? 'Deselect all'
                  : 'Select all'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedNoteIds.size} selected
              </span>
            </div>
            <ScrollArea className="h-[240px] rounded-md border p-2">
              <div className="space-y-2">
                {filteredNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No notes match.
                  </p>
                ) : (
                  filteredNotes.map((note) => (
                    <label
                      key={note.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedNoteIds.has(note.id)}
                        onCheckedChange={() => toggleNote(note.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{note.title}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {getCropDisplayName(note.cropId)}
                        </span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => setStep(3)}
                disabled={selectedNoteIds.size === 0}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share <strong>{selectedNoteIds.size}</strong> note(s) to{' '}
              <strong>{companies.find((c) => c.id === companyId)?.name ?? companyId}</strong>?
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleShare} disabled={sharing}>
                {sharing ? 'Sharing…' : 'Share'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
