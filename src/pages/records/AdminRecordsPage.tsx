import React from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { CropCardAdmin } from '@/components/records/CropCard';
import { useQuery } from '@tanstack/react-query';
import {
  listCrops,
  getSharedRecordCountForCompany,
  getCompanyRecordCountForCompany,
} from '@/services/recordsService';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminRecordsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;

  // Use same query key as Developer Records so both pages share crop list and see the same data
  const { data: crops = [], isLoading } = useQuery({
    queryKey: ['records-crops'],
    queryFn: () => listCrops(50),
  });

  const counts = useQuery({
    queryKey: ['records-counts-admin', companyId, crops.map((c) => c.id)],
    queryFn: async () => {
      if (!companyId) return { shared: {} as Record<string, number>, my: {} as Record<string, number> };
      const shared: Record<string, number> = {};
      const my: Record<string, number> = {};
      for (const c of crops) {
        shared[c.id] = await getSharedRecordCountForCompany(companyId, c.id);
        my[c.id] = await getCompanyRecordCountForCompany(companyId, c.id);
      }
      return { shared, my };
    },
    enabled: !!companyId && crops.length > 0,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Records
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Field and knowledge records by crop — shared from FarmVault and your own.
          </p>
        </div>
      </div>

      {!companyId && (
        <div className="fv-card p-4 bg-muted/50 border-border text-sm text-muted-foreground">
          Add your account to a company to see shared records and create company records. Until then you can browse crops below.
        </div>
      )}

      {isLoading ? (
        <div className="fv-card p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Loading crops…
        </div>
      ) : crops.length === 0 ? (
        <div className="fv-card p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Crops are configured by the platform. Use Dev Tools on the Records Library (developer) to seed crops, or ask your admin.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crops.map((crop) => (
            <CropCardAdmin
              key={crop.id}
              cropId={crop.id}
              name={crop.name}
              sharedCount={companyId ? (counts.data?.shared[crop.id] ?? 0) : 0}
              myCount={companyId ? (counts.data?.my[crop.id] ?? 0) : 0}
              to={`/records/${crop.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
