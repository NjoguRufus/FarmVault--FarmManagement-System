import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, Plus, ChevronLeft, Loader2, Search } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  useDeveloperCropRecords,
  useCropIntelligence,
  useCropRecordInsights,
  useCreateDeveloperCropRecordTemplate,
} from '@/hooks/useRecordsNotebook';
import { fetchDeveloperCompanies } from '@/services/developerService';
import { developerNotebookCropDisplayName, type CropRecordRow } from '@/services/recordsService';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 40;
const ALL_COMPANIES = 'all';

function sourceBadge(source: CropRecordRow['source_type']) {
  if (source === 'developer') {
    return (
      <span className="rounded-md border border-[#1F7A63]/30 bg-[#1F7A63]/10 px-2 py-0.5 text-[10px] font-medium text-[#1F7A63]">
        Developer
      </span>
    );
  }
  return (
    <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Company
    </span>
  );
}

function NoteListItem({ record, onOpen }: { record: CropRecordRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-border bg-card p-4 flex flex-col gap-2 hover:bg-muted/40 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground truncate">{record.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {sourceBadge(record.source_type)}
            {record.company_name ? (
              <span className="rounded-md bg-muted/70 px-2 py-0.5 font-medium text-foreground/80">
                {record.company_name}
              </span>
            ) : null}
          </div>
        </div>
        {record.attachments_count > 0 && (
          <span className="text-[11px] text-muted-foreground shrink-0">
            {record.attachments_count} attachment{record.attachments_count === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="text-sm text-muted-foreground line-clamp-2">
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
  const [filterCompanyId, setFilterCompanyId] = useState<string>(ALL_COMPANIES);
  const [companiesSheetOpen, setCompaniesSheetOpen] = useState(false);

  const scopedCompanyId = filterCompanyId === ALL_COMPANIES ? null : filterCompanyId;

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isError } = useDeveloperCropRecords({
    companyId: scopedCompanyId,
    cropId: cropId ?? null,
    sourceType: null,
    limit: PAGE_SIZE,
    offset,
  });

  const companiesQuery = useQuery({
    queryKey: ['developer', 'crop-records', 'companies'],
    queryFn: () => fetchDeveloperCompanies({ limit: 500, offset: 0 }),
    staleTime: 60_000,
  });

  const createDevNote = useCreateDeveloperCropRecordTemplate();

  const intelQuery = useCropIntelligence(cropId);
  const insightsQuery = useCropRecordInsights(cropId);

  useEffect(() => {
    setPage(1);
  }, [filterCompanyId, cropId]);

  const companyItems = companiesQuery.data?.items ?? [];

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.rows ?? [];
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [r.title, r.content_preview, r.company_name ?? ''].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.rows, search]);

  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;

  const selectedCompanyLabel = useMemo(() => {
    if (filterCompanyId === ALL_COMPANIES) return null;
    const row = companyItems.find(
      (c) => String(c.company_id ?? c.id ?? '') === filterCompanyId,
    );
    return row?.company_name ?? row?.name ?? filterCompanyId;
  }, [filterCompanyId, companyItems]);

  const cropPageTitle = useMemo(() => {
    const fromRow = data?.rows?.[0]?.crop_name?.trim();
    if (fromRow) return fromRow;
    return developerNotebookCropDisplayName(cropId);
  }, [data?.rows, cropId]);

  const handleAdd = async () => {
    const t = title.trim();
    const c = content.trim();
    const cid = (cropId ?? '').trim();
    if (!cid) {
      toast.error('Missing crop.');
      return;
    }
    if (!t) {
      toast.error('Title is required.');
      return;
    }
    if (!c) {
      toast.error('Content is required.');
      return;
    }
    try {
      await createDevNote.mutateAsync({ cropId: cid, title: t, content: c });
      toast.success('Developer note saved.');
      setAddOpen(false);
      setTitle('');
      setContent('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save note.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/developer/records"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1F7A63]" />
              {cropPageTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              All companies by default — each note shows which workspace it belongs to. Filter by company when needed.
            </p>
            {filterCompanyId !== ALL_COMPANIES && selectedCompanyLabel ? (
              <p className="text-xs text-[#1F7A63] mt-1 font-medium">
                Showing: {selectedCompanyLabel}
                <button
                  type="button"
                  className="ml-2 underline text-muted-foreground hover:text-foreground"
                  onClick={() => setFilterCompanyId(ALL_COMPANIES)}
                >
                  Clear filter
                </button>
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Sheet open={companiesSheetOpen} onOpenChange={setCompaniesSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="border-[#1F7A63]/35 text-[#1F7A63]">
                <Building2 className="h-4 w-4 mr-1" />
                Companies
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Filter by company</SheetTitle>
              </SheetHeader>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                Default is every tenant that has notes for this crop. Choose one company to narrow the list.
              </p>
              <Label className="text-xs">Company</Label>
              <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All companies" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
                  {companiesQuery.isLoading ? (
                    <SelectItem value="__loading__" disabled>
                      Loading…
                    </SelectItem>
                  ) : (
                    companyItems.map((co) => {
                      const id = String(co.company_id ?? co.id ?? '');
                      if (!id) return null;
                      return (
                        <SelectItem key={id} value={id}>
                          {co.company_name ?? co.name ?? id}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="mt-6 w-full bg-[#1F7A63] hover:bg-[#176553] text-white"
                onClick={() => setCompaniesSheetOpen(false)}
              >
                Done
              </Button>
            </SheetContent>
          </Sheet>

          <Button size="sm" className="bg-[#1F7A63] hover:bg-[#176553] text-white" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add note
          </Button>
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
                  placeholder="Search notes…"
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-border p-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-border p-8 text-sm text-red-500">
              Failed to load notes. Please try again.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
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
                        className={cn(page <= 1 && 'pointer-events-none opacity-40')}
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
                        className={cn(page >= totalPages && 'pointer-events-none opacity-40')}
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
            <DialogTitle>Add developer note</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Saved as a FarmVault developer note for this crop. Use the control center to push a copy to a company if
            needed.
          </p>
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
              placeholder="Write your note (Markdown supported)."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#1F7A63] hover:bg-[#176553] text-white"
              disabled={createDevNote.isPending}
              onClick={() => void handleAdd()}
            >
              {createDevNote.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
