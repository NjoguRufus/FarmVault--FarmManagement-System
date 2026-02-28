import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { CropCard } from '@/components/notes/CropCard';
import {
  getCrops,
  getSharedLibraryNotesForCompany,
  getCompanyNotes,
} from '@/services/notesService';
import { CROP_IDS } from '@/constants/notes';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminNotesPage() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? '';

  const { data: crops = [], isLoading: cropsLoading } = useQuery({
    queryKey: ['notes-crops'],
    queryFn: getCrops,
    staleTime: 2 * 60 * 1000,
  });

  const { data: sharedNotes = [], isLoading: sharedLoading } = useQuery({
    queryKey: ['notes-shared', companyId],
    queryFn: () => getSharedLibraryNotesForCompany(companyId),
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: companyNotes = [], isLoading: companyLoading } = useQuery({
    queryKey: ['notes-company', companyId],
    queryFn: () => getCompanyNotes(companyId),
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const cropIds = crops.length > 0 ? crops.map((c) => c.id) : CROP_IDS.slice();
  const isLoading = cropsLoading || sharedLoading || companyLoading;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
        <p className="text-muted-foreground">
          Shared notes from FarmVault and your company&apos;s own notes
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cropIds.map((cropId) => {
            const sharedCount = sharedNotes.filter((n: { cropId: string }) => n.cropId === cropId).length;
            const companyCount = companyNotes.filter((n: { cropId: string }) => n.cropId === cropId).length;
            return (
              <CropCard
                key={cropId}
                cropId={cropId}
                basePath="/notes"
                globalCount={0}
                companyCount={companyCount}
                sharedCount={sharedCount}
              />
            );
          })}
        </div>
      )}

      {!companyId && (
        <p className="text-muted-foreground text-center py-8">
          Your account is not linked to a company. Finish setup to see notes.
        </p>
      )}
    </div>
  );
}
