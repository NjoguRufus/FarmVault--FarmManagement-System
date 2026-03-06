import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, ChevronLeft, Loader2, Search } from 'lucide-react';
import { RecordCard } from '@/components/records/RecordCard';
import { RecordEditorModal } from '@/components/records/RecordEditorModal';
import {
  listSharesByCropForCompany,
  listCompanyRecordsByCrop,
  createCompanyRecord,
  updateCompanyRecord,
  deleteCompanyRecord,
} from '@/services/recordsService';
import { useAuth } from '@/contexts/AuthContext';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { CompanyRecordShare, CompanyRecord } from '@/types';
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

export default function AdminCropRecordsPage() {
  const { cropId } = useParams<{ cropId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const companyId = user?.companyId ?? null;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CompanyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRecord | null>(null);
  const [search, setSearch] = useState('');

  const {
    data: sharesPages,
    fetchNextPage: fetchMoreShares,
    hasNextPage: hasMoreShares,
    isFetchingNextPage: loadingMoreShares,
    isLoading: sharesLoading,
  } = useInfiniteQuery({
    queryKey: ['records-shares', companyId, cropId],
    queryFn: ({ pageParam }) =>
      listSharesByCropForCompany(companyId!, cropId!, PAGE_SIZE, pageParam),
    getNextPageParam: (last) => last.lastDoc,
    initialPageParam: null as import('@/lib/firestore-stub').DocumentSnapshot | null,
    enabled: !!companyId && !!cropId,
  });

  const {
    data: companyPages,
    fetchNextPage: fetchMoreCompany,
    hasNextPage: hasMoreCompany,
    isFetchingNextPage: loadingMoreCompany,
    isLoading: companyLoading,
  } = useInfiniteQuery({
    queryKey: ['records-company', companyId, cropId],
    queryFn: ({ pageParam }) =>
      listCompanyRecordsByCrop(companyId!, cropId!, PAGE_SIZE, pageParam),
    getNextPageParam: (last) => last.lastDoc,
    initialPageParam: null as import('@/lib/firestore-stub').DocumentSnapshot | null,
    enabled: !!companyId && !!cropId,
  });

  const sharedRecords = sharesPages?.pages.flatMap((p) => p.shares) ?? [];
  const myRecords = companyPages?.pages.flatMap((p) => p.records) ?? [];

  const cropName = cropId ?? '';
  const normalizedSearch = search.trim().toLowerCase();

  const visibleSharedRecords = normalizedSearch
    ? sharedRecords.filter((s) => {
        const haystack = [
          s.title,
          ...(s.tags ?? []),
          ...(s.highlights ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : sharedRecords;

  const visibleMyRecords = normalizedSearch
    ? myRecords.filter((r) => {
        const haystack = [
          r.title,
          ...(r.tags ?? []),
          ...(r.highlights ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : myRecords;

  const handleSaveCompany = async (data: {
    category: import('@/types').RecordCategory;
    title: string;
    content: string;
    highlights: string[];
    tags: string[];
  }) => {
    if (!cropId || !companyId || !user?.id) return;
    if (editingRecord) {
      await updateCompanyRecord(editingRecord.id, data);
    } else {
      await createCompanyRecord({
        companyId,
        cropId,
        ...data,
        createdBy: user.id,
      });
    }
    await queryClient.refetchQueries({ queryKey: ['records-company', companyId, cropId] });
  };

  const handleDeleteCompany = async () => {
    if (!deleteTarget) return;
    await deleteCompanyRecord(deleteTarget.id);
    await queryClient.refetchQueries({ queryKey: ['records-company', companyId, cropId] });
    setDeleteTarget(null);
    toast.success('Record deleted.');
  };

  if (!companyId) {
    return (
      <div className="fv-card p-8 text-center text-muted-foreground">
        You need to be in a company to view records.
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          to="/records"
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {cropName}
          </h1>
          <p className="text-sm text-muted-foreground">Shared and your records</p>
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

      {/* Shared Records (read-only) */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Shared Records</h2>
        {sharesLoading ? (
          <div className="fv-card p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sharedRecords.length === 0 ? (
          <div className="fv-card p-6 text-center text-muted-foreground text-sm">
            No shared records for this crop yet.
          </div>
        ) : visibleSharedRecords.length === 0 ? (
          <div className="fv-card p-6 text-center text-muted-foreground text-sm">
            No shared records match your search.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSharedRecords.map((s) => (
              <SharedRecordCard
                key={s.id}
                share={s}
                onOpen={() =>
                  navigate(`/records/${cropId}/record/${s.id}`, {
                    state: { kind: 'shared', record: s },
                  })
                }
              />
            ))}
            {hasMoreShares && (
              <div className="col-span-full flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => fetchMoreShares()} disabled={loadingMoreShares}>
                  {loadingMoreShares ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* My Records */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">My Records</h2>
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
        </div>
        {companyLoading ? (
          <div className="fv-card p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : myRecords.length === 0 ? (
          <div className="fv-card p-6 text-center text-muted-foreground text-sm">
            No records yet. Create one to get started.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleMyRecords.map((r) => (
              <RecordCard
                key={r.id}
                title={r.title}
                category={r.category}
                highlights={r.highlights}
                tags={r.tags}
                content={r.content}
                cropId={cropId ?? undefined}
                onOpen={() =>
                  navigate(`/records/${cropId}/record/${r.id}`, {
                    state: { kind: 'my', record: r },
                  })
                }
                onEdit={() => {
                  setEditingRecord(r);
                  setEditorOpen(true);
                }}
                onDelete={() => setDeleteTarget(r)}
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
        mode="company"
        cropId={cropId ?? ''}
        cropName={cropName}
        initial={
          editingRecord
            ? {
                category: editingRecord.category,
                title: editingRecord.title,
                content: editingRecord.content,
                highlights: editingRecord.highlights,
                tags: editingRecord.tags,
              }
            : undefined
        }
        onSave={handleSaveCompany}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompany} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SharedRecordCard({ share, onOpen }: { share: CompanyRecordShare; onOpen?: () => void }) {
  return (
    <RecordCard
      title={share.title}
      category={share.category}
      highlights={share.highlights}
      tags={share.tags}
      content={share.content}
      cropId={share.cropId}
      onOpen={onOpen}
      readOnly
    />
  );
}
