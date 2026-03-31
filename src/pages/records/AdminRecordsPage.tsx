import React, { useState, useMemo } from 'react';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { useCompanyRecordCrops, useCreateCompanyRecordCrop } from '@/hooks/useRecordsNotebook';
import type { RecordCropCard } from '@/services/recordsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RecordsCropGrid } from '@/components/records/RecordsCropGrid';

export default function AdminRecordsPage() {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newCropName, setNewCropName] = useState('');

  const { data: crops = [], isLoading, isError } = useCompanyRecordCrops();
  const createCrop = useCreateCompanyRecordCrop();

  const filteredCrops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return crops;
    return crops.filter((c) => c.crop_name.toLowerCase().includes(q));
  }, [crops, search]);

  const visibleCrops = useMemo(() => {
    const ORDER: Record<string, number> = {
      tomatoes: 1,
      'french-beans': 2,
      capsicum: 3,
      watermelon: 4,
      maize: 5,
    };

    const ordered = [...filteredCrops].sort((a, b) => {
      const aRank = ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER;
      const bRank = ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.crop_name.localeCompare(b.crop_name);
    });

    const ALLOWED_GLOBAL_SLUGS = new Set<string>([
      'french-beans',
      'tomatoes',
      'capsicum',
      'watermelon',
      'maize',
    ]);

    return ordered.filter((crop: RecordCropCard) => {
      if (!crop.is_global) return true;
      if (!crop.slug) return true;
      return ALLOWED_GLOBAL_SLUGS.has(crop.slug);
    });
  }, [filteredCrops]);

  const handleCreateCrop = async () => {
    const name = newCropName.trim();
    if (!name) {
      toast.error('Crop name is required.');
      return;
    }
    try {
      await createCrop.mutateAsync(name);
      toast.success('Custom crop added.');
      setNewCropName('');
      setAddOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error('Failed to add crop.');
    }
  };

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/5 bg-background shadow-[0_8px_20px_rgba(17,24,39,0.06)]">
              <FileText className="h-5 w-5 text-foreground/80" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[34px]">
              Records
            </h1>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground/90 sm:text-[15px]">
            Your digital farm notebook — organize notes and knowledge by crop.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="shadow-sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Custom Crop
        </Button>
      </div>

      <div className="max-w-md">
        <div className="group relative">
          <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_10px_24px_rgba(17,24,39,0.06)] transition-shadow group-focus-within:shadow-[0_14px_30px_rgba(17,24,39,0.10)]" />
          <div className="relative flex h-10 items-center rounded-xl border border-black/10 bg-background/60 px-3 backdrop-blur transition-colors group-focus-within:border-foreground/20">
            <Search className="h-4 w-4 text-muted-foreground/80" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search crops…"
              className="h-9 border-0 bg-transparent pl-2 pr-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-black/5 bg-background/60 p-10 shadow-[0_8px_24px_rgba(17,24,39,0.06)] backdrop-blur flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Loading crops…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-black/10 bg-background/60 p-10 text-sm text-red-600 shadow-[0_8px_24px_rgba(17,24,39,0.06)] backdrop-blur">
          Failed to load crops. Please try again in a moment.
        </div>
      ) : crops.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-background/60 p-10 text-center shadow-[0_8px_24px_rgba(17,24,39,0.06)] backdrop-blur">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-background/70">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </span>
          <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
            Start your farm notebook by adding your first crop. You can add French Beans, Tomatoes,
            Capsicum, Maize, Watermelon, or any custom crop you grow.
          </p>
          <Button onClick={() => setAddOpen(true)} size="sm" className="shadow-sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Custom Crop
          </Button>
        </div>
      ) : filteredCrops.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-background/60 p-7 text-sm text-muted-foreground shadow-[0_8px_24px_rgba(17,24,39,0.06)] backdrop-blur">
          No crops match your search.
        </div>
      ) : visibleCrops.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-background/60 p-7 text-sm text-muted-foreground shadow-[0_8px_24px_rgba(17,24,39,0.06)] backdrop-blur">
          No crops available with records yet.
        </div>
      ) : (
        <RecordsCropGrid crops={visibleCrops} basePath="/records" className="gap-4 sm:gap-5" />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Crop</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a new crop section in your farm notebook. You can add any crop you grow on the
              farm.
            </p>
            <Input
              autoFocus
              value={newCropName}
              onChange={(e) => setNewCropName(e.target.value)}
              placeholder="e.g. Cherry Tomatoes, Onions"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCrop} disabled={createCrop.isLoading}>
              {createCrop.isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
