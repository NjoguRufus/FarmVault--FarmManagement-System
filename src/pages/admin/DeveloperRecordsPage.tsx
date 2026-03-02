import React, { useState } from 'react';
import { FileText, ShieldCheck, Wrench, Loader2 } from 'lucide-react';
import { CropCard } from '@/components/records/CropCard';
import { useQuery } from '@tanstack/react-query';
import {
  listCrops,
  getLibraryRecordCountByCrop,
  getCompanyRecordCountByCrop,
  seedRecordsData,
  purgeRecordsData,
} from '@/services/recordsService';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const DEV_TOOLS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DANGEROUS_ADMIN_TOOLS === 'true';

export default function DeveloperRecordsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purgeCrops, setPurgeCrops] = useState(false);
  const [purgeUnderstand, setPurgeUnderstand] = useState(false);
  const [purgeProgress, setPurgeProgress] = useState<{ coll: string; deleted: number; status: string }[]>([]);
  const [seeding, setSeeding] = useState(false);

  const { data: crops = [], isLoading } = useQuery({
    queryKey: ['records-crops'],
    queryFn: () => listCrops(50),
  });

  const counts = useQuery({
    queryKey: ['records-counts', crops.map((c) => c.id)],
    queryFn: async () => {
      const lib: Record<string, number> = {};
      const company: Record<string, number> = {};
      for (const c of crops) {
        lib[c.id] = await getLibraryRecordCountByCrop(c.id);
        company[c.id] = await getCompanyRecordCountByCrop(c.id);
      }
      return { lib, company };
    },
    enabled: crops.length > 0,
  });

  const handleSeed = async () => {
    if (!user?.id) return;
    setSeeding(true);
    try {
      const { crops: c, records: r } = await seedRecordsData(user.id);
      queryClient.invalidateQueries({ queryKey: ['records-crops'] });
      queryClient.invalidateQueries({ queryKey: ['records-counts'] });
      toast.success(`Seed complete: ${c} crops, ${r} records.`);
      setDevToolsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Seed failed.');
    } finally {
      setSeeding(false);
    }
  };

  const handlePurge = async () => {
    if (purgeConfirm !== 'DELETE RECORDS' || !purgeUnderstand) {
      toast.error('Type DELETE RECORDS and check the box.');
      return;
    }
    setPurgeProgress([]);
    try {
      await purgeRecordsData({
        includeCrops: purgeCrops,
        onProgress: (coll, deleted, status) => {
          setPurgeProgress((prev) => {
            const rest = prev.filter((p) => p.coll !== coll);
            return [...rest, { coll, deleted, status }];
          });
        },
      });
      queryClient.invalidateQueries({ queryKey: ['records-crops'] });
      queryClient.invalidateQueries({ queryKey: ['records-counts'] });
      toast.success('Purge complete.');
      setPurgeConfirm('');
      setPurgeUnderstand(false);
      setPurgeCrops(false);
      setDevToolsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Purge failed.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Records Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage library records by crop and share them to companies; view company-created records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'developer' && DEV_TOOLS_ENABLED && (
            <Button variant="outline" size="sm" onClick={() => setDevToolsOpen(true)}>
              <Wrench className="h-4 w-4 mr-1" />
              Dev Tools
            </Button>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-xs text-primary bg-primary/5">
            <ShieldCheck className="h-3 w-3" />
            Developer
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="fv-card p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Loading crops…
        </div>
      ) : crops.length === 0 ? (
        <div className="fv-card p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Use Dev Tools to seed crops and sample library records, or add crops from your app config.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crops.map((crop) => (
            <CropCard
              key={crop.id}
              cropId={crop.id}
              name={crop.name}
              libraryCount={counts.data?.lib[crop.id] ?? 0}
              companyCount={counts.data?.company[crop.id] ?? 0}
              to={`/developer/records/${crop.id}`}
            />
          ))}
        </div>
      )}

      {DEV_TOOLS_ENABLED && (
        <Dialog open={devToolsOpen} onOpenChange={setDevToolsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Dev Tools</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <h3 className="font-medium text-sm mb-2">Seed</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Creates 4 crops (Tomatoes, Capsicum, Watermelon, French Beans) and one sample library record per crop.
                </p>
                <Button onClick={handleSeed} disabled={seeding}>
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Run seed
                </Button>
              </div>
              <div>
                <h3 className="font-medium text-sm mb-2">Purge</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Deletes all records in records_library, company_record_shares, company_records. Optionally crops.
                </p>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <Checkbox checked={purgeCrops} onCheckedChange={(v) => setPurgeCrops(!!v)} />
                  Also purge crops (OFF by default)
                </label>
                <Input
                  placeholder="Type DELETE RECORDS"
                  value={purgeConfirm}
                  onChange={(e) => setPurgeConfirm(e.target.value)}
                  className="mb-2"
                />
                <label className="flex items-center gap-2 text-sm mb-2">
                  <Checkbox checked={purgeUnderstand} onCheckedChange={(v) => setPurgeUnderstand(!!v)} />
                  I understand this cannot be undone
                </label>
                <Button variant="destructive" onClick={handlePurge} disabled={purgeConfirm !== 'DELETE RECORDS' || !purgeUnderstand}>
                  Purge
                </Button>
                {purgeProgress.length > 0 && (
                  <ul className="mt-2 text-xs space-y-1">
                    {purgeProgress.map((p) => (
                      <li key={p.coll}>
                        {p.coll}: {p.deleted} deleted — {p.status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDevToolsOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
