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
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Custom Crop
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
      ) : crops.length === 0 ? (
        <div className="fv-card p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Start your farm notebook by adding your first crop. You can add French Beans, Tomatoes,
            Capsicum, Maize, Watermelon, or any custom crop you grow.
          </p>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Custom Crop
          </Button>
        </div>
      ) : filteredCrops.length === 0 ? (
        <div className="fv-card p-6 text-sm text-muted-foreground">
          No crops match your search.
        </div>
      ) : visibleCrops.length === 0 ? (
        <div className="fv-card p-6 text-sm text-muted-foreground">
          No crops available with records yet.
        </div>
      ) : (
        <RecordsCropGrid crops={visibleCrops} basePath="/records" />
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
