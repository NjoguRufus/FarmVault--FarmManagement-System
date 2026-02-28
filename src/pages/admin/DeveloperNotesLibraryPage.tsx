import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollection } from '@/hooks/useCollection';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CropCard } from '@/components/notes/CropCard';
import { ShareNotesModal } from '@/components/notes/ShareNotesModal';
import { getCrops, getLibraryNotes, shareNotesToCompany } from '@/services/notesService';
import { seedCropsAndNotes } from '@/services/notesSeed';
import { CROP_IDS } from '@/constants/notes';
import type { Company } from '@/types';
import { Share2, Database } from 'lucide-react';
import { toast } from 'sonner';

export default function DeveloperNotesLibraryPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const { data: crops = [], isLoading: cropsLoading } = useQuery({
    queryKey: ['notes-crops'],
    queryFn: getCrops,
    staleTime: 2 * 60 * 1000,
  });

  const { data: libraryNotes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['notes-library'],
    queryFn: () => getLibraryNotes(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: companies = [] } = useCollection<Company>(
    'admin-notes-companies',
    'companies',
    { companyScoped: false, isDeveloper: true }
  );

  const cropIds = crops.length > 0 ? crops.map((c) => c.id) : CROP_IDS.slice();
  const countsByCrop = cropIds.map((cropId) => ({
    cropId,
    global: libraryNotes.filter((n: { cropId: string }) => n.cropId === cropId).length,
    company: 0,
    shared: 0,
  }));

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const { crops, notes } = await seedCropsAndNotes(user?.id ?? '');
      queryClient.invalidateQueries({ queryKey: ['notes-crops'] });
      queryClient.invalidateQueries({ queryKey: ['notes-library'] });
      toast.success(`Seeded ${crops} crops and ${notes} sample notes.`);
    } catch (e) {
      toast.error('Seed failed.');
    } finally {
      setSeeding(false);
    }
  };

  const handleShare = async (companyId: string, noteIds: string[]) => {
    await shareNotesToCompany({
      companyId,
      noteIds,
      sharedBy: user?.id ?? '',
      getCropIdForNote: (noteId) => {
        const note = libraryNotes.find((n: { id: string }) => n.id === noteId);
        return note?.cropId ?? '';
      },
    });
    queryClient.invalidateQueries({ queryKey: ['notes-library'] });
    toast.success('Notes shared.');
  };

  const isLoading = cropsLoading || notesLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="text-muted-foreground">Global notes library and sharing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSeed} disabled={seeding}>
            <Database className="h-4 w-4 mr-2" />
            {seeding ? 'Seeding…' : 'Seed crops & sample notes'}
          </Button>
          <Button onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4 mr-2" />
            Share Notes
          </Button>
        </div>
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
            const counts = countsByCrop.find((c) => c.cropId === cropId) ?? {
              cropId,
              global: 0,
              company: 0,
              shared: 0,
            };
            const globalCount = libraryNotes.filter((n: { cropId: string }) => n.cropId === cropId).length;
            return (
              <CropCard
                key={cropId}
                cropId={cropId}
                basePath="/admin/notes"
                globalCount={globalCount}
                companyCount={counts.company}
                sharedCount={counts.shared}
              />
            );
          })}
        </div>
      )}

      <ShareNotesModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        libraryNotes={libraryNotes}
        companies={companies}
        onShare={handleShare}
      />
    </div>
  );
}
