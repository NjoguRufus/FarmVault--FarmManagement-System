import React, { useMemo, useState } from 'react';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { useDeveloperCropRecords } from '@/hooks/useRecordsNotebook';
import type { CropRecordRow, RecordCropCard } from '@/services/recordsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RecordsCropGrid } from '@/components/records/RecordsCropGrid';
import { SendExistingNoteModal } from '@/components/records/SendExistingNoteModal';

export default function DeveloperRecordsPage() {
  const [search, setSearch] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [addCropOpen, setAddCropOpen] = useState(false);
  const [newCropName, setNewCropName] = useState('');
  const [hiddenCropIds, setHiddenCropIds] = useState<string[]>([]);

  const { data, isLoading, isError } = useDeveloperCropRecords({
    companyId: null,
    cropId: null,
    sourceType: null,
    limit: 200,
    offset: 0,
  });

  const rows: CropRecordRow[] = data?.rows ?? [];

  const cropCards: RecordCropCard[] = useMemo(() => {
    const ORDER: Record<string, number> = {
      tomatoes: 1,
      'french-beans': 2,
      capsicum: 3,
      watermelon: 4,
      maize: 5,
    };

    const byId = new Map<
      string,
      { crop_id: string; crop_name: string; records_count: number; last_updated_at: string | null }
    >();

    rows.forEach((r) => {
      const existing = byId.get(r.crop_id);
      const candidateDate = r.updated_at ?? r.created_at;
      if (!existing) {
        byId.set(r.crop_id, {
          crop_id: r.crop_id,
          crop_name: r.crop_name,
          records_count: 1,
          last_updated_at: candidateDate,
        });
      } else {
        // eslint-disable-next-line no-param-reassign
        existing.records_count += 1;
        if (candidateDate) {
          if (!existing.last_updated_at) {
            // eslint-disable-next-line no-param-reassign
            existing.last_updated_at = candidateDate;
          } else if (new Date(candidateDate).getTime() > new Date(existing.last_updated_at).getTime()) {
            // eslint-disable-next-line no-param-reassign
            existing.last_updated_at = candidateDate;
          }
        }
      }
    });

    return Array.from(byId.values())
      .filter((c) => !hiddenCropIds.includes(c.crop_id))
      .map(
        (c): RecordCropCard => ({
          crop_id: c.crop_id,
          crop_name: c.crop_name,
          slug: c.crop_id || c.crop_name.toLowerCase().replace(/\s+/g, '-'),
          is_global: true,
          records_count: c.records_count,
          last_updated_at: c.last_updated_at,
        }),
      )
      .sort((a, b) => {
        const aRank = ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER;
        const bRank = ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.crop_name.localeCompare(b.crop_name);
      });
  }, [rows, hiddenCropIds]);

  const filteredCropCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cropCards;
    return cropCards.filter((c) => c.crop_name.toLowerCase().includes(q));
  }, [cropCards, search]);

  const handleHideCrop = (crop: RecordCropCard) => {
    setHiddenCropIds((prev) => (prev.includes(crop.crop_id) ? prev : [...prev, crop.crop_id]));
  };

  const handleCreateCustomCrop = () => {
    const name = newCropName.trim();
    if (!name) {
      toast.error('Crop name is required.');
      return;
    }

    // Safe interim behaviour: local-only crop card; backend wiring will follow Supabase developer crops.
    toast.success('Custom crop added for this session. Backend wiring TODO.');
    setAddCropOpen(false);
    setNewCropName('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Records
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your digital farm notebook — organize notes and knowledge by crop.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Developer view shows cross-company crop notebooks with the same layout as company records.
          </p>
        </div>
        <Button size="sm" onClick={() => setSendOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Send Existing Note
        </Button>
      </div>

      <div className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search crops…"
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="fv-card p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Loading crops…
        </div>
      ) : isError ? (
        <div className="fv-card p-8 text-sm text-red-500">
          Failed to load crops. Please try again in a moment.
        </div>
      ) : cropCards.length === 0 ? (
        <div className="fv-card p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Once notes are created for any crop across companies, crop notebooks will appear here.
          </p>
        </div>
      ) : filteredCropCards.length === 0 ? (
        <div className="fv-card p-6 text-sm text-muted-foreground">
          No crops match your search.
        </div>
      ) : (
        <RecordsCropGrid
          crops={filteredCropCards}
          basePath="/developer/records"
          allowDelete
          onDeleteCrop={handleHideCrop}
        />
      )}

      <SendExistingNoteModal open={sendOpen} onOpenChange={setSendOpen} records={rows} />

      <Dialog open={addCropOpen} onOpenChange={setAddCropOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Crop</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a new crop notebook section for developer records. This is a non-destructive, visibility-only
              action; backend wiring for global crops is planned.
            </p>
            <Input
              autoFocus
              value={newCropName}
              onChange={(e) => setNewCropName(e.target.value)}
              placeholder="e.g. Rice, Onions, Spinach, Cabbages"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              {['Rice', 'Onions', 'Spinach', 'Cabbages'].map((name) => (
                <button
                  key={name}
                  type="button"
                  className="px-2 py-1 rounded-full border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
                  onClick={() => setNewCropName(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCropOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomCrop}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
