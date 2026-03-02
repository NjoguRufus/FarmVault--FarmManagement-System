import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { listCompanies } from '@/services/companyService';
import type { LibraryRecord } from '@/types';
import type { RecordCategory } from '@/types';
import { Loader2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const RECORD_CATEGORIES: RecordCategory[] = [
  'Timing',
  'Fertilizer',
  'Pests & Diseases',
  'Sprays',
  'Yield',
  'General',
];

export interface ShareRecordsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: LibraryRecord[];
  cropIdFilter?: string;
  cropName?: string;
  onShare: (companyId: string, recordIds: string[]) => Promise<void>;
}

type Step = 1 | 2 | 3;

export function ShareRecordsModal({
  open,
  onOpenChange,
  records,
  cropIdFilter,
  cropName,
  onShare,
}: ShareRecordsModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [companyId, setCompanyId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sharing, setSharing] = useState(false);

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ['companies-list'],
    queryFn: listCompanies,
    enabled: open && step === 1,
  });

  const filteredRecords = useMemo(() => {
    let list = records.filter((r) => r.status === 'published');
    if (cropIdFilter) list = list.filter((r) => r.cropId === cropIdFilter);
    if (categoryFilter && categoryFilter !== 'all') list = list.filter((r) => r.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q));
    }
    return list;
  }, [records, cropIdFilter, categoryFilter, search]);

  const toggleRecord = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size >= filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!companyId) {
        toast.error('Select a company.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedIds.size === 0) {
        toast.error('Select at least one record.');
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleConfirm = async () => {
    if (!companyId || selectedIds.size === 0) return;
    setSharing(true);
    try {
      await onShare(companyId, Array.from(selectedIds));
      toast.success('Records shared.');
      onOpenChange(false);
      setStep(1);
      setCompanyId('');
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      toast.error('Failed to share records.');
    } finally {
      setSharing(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setStep(1);
      setCompanyId('');
      setSelectedIds(new Set());
      setSearch('');
      setCategoryFilter('all');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Share records {step === 1 && '— Select company'}
            {step === 2 && '— Select records'}
            {step === 3 && '— Confirm'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Choose the company to share records with.</p>
            {companiesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading companies…
              </div>
            ) : (
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select which library records to share. Only published records are listed.
              {cropName && ` (Filtered by ${cropName})`}
            </p>
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {RECORD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-md max-h-[300px] overflow-y-auto">
              <div className="p-2 border-b flex items-center gap-2">
                <Checkbox
                  checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm font-medium">Select all ({filteredRecords.length})</span>
              </div>
              <ul className="divide-y">
                {filteredRecords.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 p-2 hover:bg-muted/50">
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={() => toggleRecord(r.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.category}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {filteredRecords.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">No records match.</p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share <strong>{selectedIds.size}</strong> record(s) to{' '}
              <strong>{companies.find((c) => c.id === companyId)?.name ?? companyId}</strong>?
            </p>
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={handleNext} disabled={step === 1 && !companyId}>
              Next
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={sharing}>
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Share
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
