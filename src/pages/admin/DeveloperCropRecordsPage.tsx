import React, { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, ChevronLeft, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CropIntelligencePanel } from '@/components/records/CropIntelligencePanel';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useDeveloperCropRecords, useCropIntelligence, useCropRecordInsights } from '@/hooks/useRecordsNotebook';
import type { CropRecordRow } from '@/services/recordsService';

const PAGE_SIZE = 10;

function sourceBadge(source: CropRecordRow['source_type']) {
  if (source === 'developer') {
    return (
      <span className="fv-badge text-[10px] bg-primary/10 text-primary border-primary/30">
        Developer note
      </span>
    );
  }
  return (
    <span className="fv-badge text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
      Company note
    </span>
  );
}

function NoteListItem({ record, onOpen }: { record: CropRecordRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left fv-card p-4 flex flex-col gap-2 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{record.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {sourceBadge(record.source_type)}
            {record.company_name && (
              <span className="px-2 py-0.5 rounded bg-muted/60">
                {record.company_name}
              </span>
            )}
          </div>
        </div>
        {record.attachments_count > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {record.attachments_count} attachment{record.attachments_count === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground line-clamp-2">
        <MarkdownContent content={record.content_preview || ''} />
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {record.created_at && <span>Created {new Date(record.created_at).toLocaleDateString()}</span>}
        {record.updated_at && <span>Updated {new Date(record.updated_at).toLocaleDateString()}</span>}
      </div>
    </button>
  );
}

export default function DeveloperCropRecordsPage() {
  const { cropId } = useParams<{ cropId: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isError } = useDeveloperCropRecords({
    companyId: null,
    cropId: cropId ?? null,
    sourceType: null,
    limit: PAGE_SIZE,
    offset,
  });

  const intelQuery = useCropIntelligence(cropId);
  const insightsQuery = useCropRecordInsights(cropId);

  if (import.meta.env.DEV) {
    // Temporary debugging for crop note inconsistency parity with company view.
    // eslint-disable-next-line no-console
    console.log('[DeveloperCropRecordsPage] crop identifiers + counts', {
      cropIdParam: cropId ?? null,
      recordsTotal: data?.total ?? null,
      insightsTotal: insightsQuery.data?.summary?.total_records ?? null,
      insightsRecent: insightsQuery.data?.recent_notes?.length ?? null,
    });
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.rows ?? [];
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [r.title, r.content_preview].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.rows, search]);

  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;

  const handleAdd = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t) {
      toast.error('Title is required.');
      return;
    }
    if (!c) {
      toast.error('Content is required.');
      return;
    }
    // Developer records currently do not create new notes directly in this workspace.
    // Keep UI consistent but guide the user.
    toast.info('Developer notes creation will be wired to Supabase developer records in a later iteration.');
    setAddOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
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
            {data?.rows[0]?.crop_name ?? 'Crop records'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Notebook entries for this crop — research, lessons, risks, chemicals, diseases, and more.
          </p>
        </div>
      </div>

      <Tabs defaultValue="notes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="intelligence">Crop Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="max-w-sm w-full">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notes by title or content…"
                  className="pl-8"
                />
              </div>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          </div>

          {isLoading ? (
            <div className="fv-card p-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="fv-card p-8 text-sm text-red-500">
              Failed to load notes. Please try again.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="fv-card p-8 text-center text-muted-foreground text-sm">
              {search ? 'No notes match your search.' : 'No notes yet for this crop.'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRows.map((record) => (
                  <NoteListItem
                    key={record.record_id}
                    record={record}
                    onOpen={() => navigate(`/developer/records/view/${record.record_id}`)}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setPage((p) => Math.max(1, p - 1));
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="text-xs text-muted-foreground px-2 py-1">
                        Page {page} of {totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setPage((p) => Math.min(totalPages, p + 1));
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="intelligence">
          <CropIntelligencePanel
            cropId={cropId ?? ''}
            intelligence={intelQuery.data}
            insights={insightsQuery.data}
            isLoading={intelQuery.isLoading || insightsQuery.isLoading}
            isError={Boolean(intelQuery.error || insightsQuery.error)}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Powdery mildew during flowering)"
            />
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Write your note. Capture research, lessons, risks, chemicals used, diseases observed, best practices, observations, or market notes."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

