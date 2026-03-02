import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Share2, ChevronLeft, Loader2, Search } from 'lucide-react';
import { RecordCard } from '@/components/records/RecordCard';
import { RecordEditorModal } from '@/components/records/RecordEditorModal';
import { ShareRecordsModal } from '@/components/records/ShareRecordsModal';
import {
  listLibraryRecordsByCrop,
  listCompanyRecordsByCropForDeveloper,
  getLibraryRecord,
  createLibraryRecord,
  updateLibraryRecord,
  deleteLibraryRecord,
  upsertRecordShare,
  getCompanyName,
} from '@/services/recordsService';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { LibraryRecord, CompanyRecord } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 50;

export default function DeveloperCropRecordsPage() {
  const { cropId } = useParams<{ cropId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LibraryRecord | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LibraryRecord | null>(null);
  const [search, setSearch] = useState('');

  const {
    data: libPages,
    fetchNextPage: fetchMoreLib,
    hasNextPage: hasMoreLib,
    isFetchingNextPage: loadingMoreLib,
    isLoading: libLoading,
  } = useInfiniteQuery({
    queryKey: ['records-library', cropId],
    queryFn: ({ pageParam }) =>
      listLibraryRecordsByCrop(cropId!, PAGE_SIZE, pageParam),
    getNextPageParam: (last) => last.lastDoc,
    initialPageParam: null as import('firebase/firestore').DocumentSnapshot | null,
    enabled: !!cropId,
  });

  const {
    data: companyPages,
    fetchNextPage: fetchMoreCompany,
    hasNextPage: hasMoreCompany,
    isFetchingNextPage: loadingMoreCompany,
    isLoading: companyLoading,
  } = useInfiniteQuery({
    queryKey: ['records-company-dev', cropId],
    queryFn: ({ pageParam }) =>
      listCompanyRecordsByCropForDeveloper(cropId!, PAGE_SIZE, pageParam),
    getNextPageParam: (last) => last.lastDoc,
    initialPageParam: null as import('firebase/firestore').DocumentSnapshot | null,
    enabled: !!cropId,
  });

  const libraryRecords = libPages?.pages.flatMap((p) => p.records) ?? [];
  const companyRecords = companyPages?.pages.flatMap((p) => p.records) ?? [];

  const cropName = cropId ?? '';
  const normalizedSearch = search.trim().toLowerCase();

  const visibleLibraryRecords = normalizedSearch
    ? libraryRecords.filter((r) => {
        const haystack = [
          r.title,
          ...(r.tags ?? []),
          ...(r.highlights ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : libraryRecords;

  const visibleCompanyRecords = normalizedSearch
    ? companyRecords.filter((r) => {
        const haystack = [
          r.title,
          ...(r.tags ?? []),
          ...(r.highlights ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : companyRecords;

  const handleSaveLibrary = async (data: {
    category: import('@/types').RecordCategory;
    title: string;
    content: string;
    highlights: string[];
    tags: string[];
    status?: 'draft' | 'published';
  }) => {
    if (!cropId || !user?.id) return;
    if (editingRecord) {
      await updateLibraryRecord(editingRecord.id, data);
    } else {
      await createLibraryRecord({
        cropId,
        ...data,
        status: data.status ?? 'draft',
        createdBy: user.id,
      });
    }
    await queryClient.refetchQueries({ queryKey: ['records-library', cropId] });
  };

  const handleDeleteLibrary = async () => {
    if (!deleteTarget) return;
    await deleteLibraryRecord(deleteTarget.id);
    await queryClient.refetchQueries({ queryKey: ['records-library', cropId] });
    setDeleteTarget(null);
    toast.success('Record deleted.');
  };

  const handleShare = async (companyId: string, recordIds: string[]) => {
    for (const recordId of recordIds) {
      const rec = await getLibraryRecord(recordId);
      if (rec) {
        await upsertRecordShare({
          companyId,
          recordId: rec.id,
          cropId: rec.cropId,
          title: rec.title,
          category: rec.category,
          highlights: rec.highlights,
          tags: rec.tags,
          content: rec.content,
          sharedBy: user?.id ?? '',
        });
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          to="/developer/records"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {cropName}
          </h1>
          <p className="text-sm text-muted-foreground">Library and company records</p>
        </div>
      </div>

      <div className="mt-2 mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records by title, tags, highlights…"
            className="pl-8"
          />
        </div>
      </div>

      {/* Library Records */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Library Records</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingRecord(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New record
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              disabled={libraryRecords.filter((r) => r.status === 'published').length === 0}
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share records
            </Button>
          </div>
        </div>
        {libLoading ? (
          <div className="fv-card p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : libraryRecords.length === 0 ? (
          <div className="fv-card p-6 text-center text-muted-foreground text-sm">
            No library records yet. Create one to get started.
          </div>
        ) : visibleLibraryRecords.length === 0 ? (
          <div className="fv-card p-6 text-center text-muted-foreground text-sm">
            No library records match your search.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleLibraryRecords.map((r) => (
              <RecordCard
                key={r.id}
                title={r.title}
                category={r.category}
                highlights={r.highlights}
                tags={r.tags}
                content={r.content}
                cropId={cropId ?? undefined}
                onOpen={() =>
                  navigate(`/developer/records/${cropId}/record/${r.id}`, {
                    state: { kind: 'library', record: r },
                  })
                }
                onEdit={() => {
                  setEditingRecord(r);
                  setEditorOpen(true);
                }}
                onDelete={() => setDeleteTarget(r)}
              />
            ))}
            {hasMoreLib && (
              <div className="col-span-full flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => fetchMoreLib()} disabled={loadingMoreLib}>
                  {loadingMoreLib ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Company Records */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Company Records</h2>
        {companyLoading ? (
          <div className="fv-card p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : companyRecords.length === 0 ? (
          <div className="fv-card p-6 text-center text-muted-foreground text-sm">
            No company-created records for this crop yet.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCompanyRecords.map((r) => (
              <CompanyRecordCard
                key={r.id}
                record={r}
                onOpen={() =>
                  navigate(`/developer/records/${cropId}/record/${r.id}`, {
                    state: { kind: 'company', record: r },
                  })
                }
              />
            ))}
            {hasMoreCompany && (
              <div className="col-span-full flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => fetchMoreCompany()} disabled={loadingMoreCompany}>
                  {loadingMoreCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <RecordEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode="library"
        cropId={cropId ?? ''}
        cropName={cropName}
        initial={
          editingRecord
            ? {
                id: editingRecord.id,
                category: editingRecord.category,
                title: editingRecord.title,
                content: editingRecord.content,
                highlights: editingRecord.highlights,
                tags: editingRecord.tags,
                status: editingRecord.status,
              }
            : undefined
        }
        onSave={handleSaveLibrary}
      />

      <ShareRecordsModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        records={libraryRecords}
        cropIdFilter={cropId}
        cropName={cropName}
        onShare={handleShare}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the library record. Shared copies in companies are not removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLibrary} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CompanyRecordCard({ record, onOpen }: { record: CompanyRecord; onOpen?: () => void }) {
  const { data: companyName } = useQuery({
    queryKey: ['company-name', record.companyId],
    queryFn: () => getCompanyName(record.companyId),
    enabled: !!record.companyId,
  });
  return (
    <RecordCard
      title={record.title}
      category={record.category}
      highlights={record.highlights}
      tags={record.tags}
      content={record.content}
      companyName={companyName ?? record.companyId}
      onOpen={onOpen}
      readOnly
    />
  );
}
