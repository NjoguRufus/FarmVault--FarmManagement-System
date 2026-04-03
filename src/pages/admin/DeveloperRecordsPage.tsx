import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, RefreshCw, Search, Sprout } from 'lucide-react';
import { RecordsCropGrid } from '@/components/records/RecordsCropGrid';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { DEVELOPER_NOTEBOOK_DEFAULT_CROPS, type RecordCropCard } from '@/services/recordsService';
import { fetchDeveloperCompanies } from '@/services/developerService';

const FV_GREEN = '#1F7A63';
const FV_GREEN_HOVER = '#176553';
const fvPrimaryBtn = 'bg-[#1F7A63] hover:bg-[#176553] text-white';
const ALL_COMPANIES = 'all';

type CropStats = { notesCount: number; lastActivity: string | null };
type FarmNotebookEntrySlim = {
  id: string;
  crop_slug: string | null;
  title: string | null;
  content: string | null;
  company_id: string | null;
  updated_at: string | null;
  created_at: string | null;
  source_note_id?: string | null;
  sent_by_developer?: boolean | null;
  developer_updated?: boolean | null;
};

function stripHtml(html: string): string {
  const s = String(html ?? '');
  if (!s) return '';
  if (typeof document === 'undefined') {
    return s.replace(/<[^>]+>/g, ' ');
  }
  const div = document.createElement('div');
  div.innerHTML = s;
  return div.textContent || '';
}

function developerNotePreview(content: string | null | undefined): string {
  const preview = stripHtml(String(content ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return preview || '—';
}

function formatDeveloperNoteListDate(iso: string | null | undefined, fallback?: string | null): string {
  const raw = iso ?? fallback ?? '';
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function developerNoteCompanyLabel(note: FarmNotebookEntrySlim, nameById: Map<string, string>): string {
  const cid = note.company_id != null ? String(note.company_id).trim() : '';
  if (!cid) return 'FarmVault';
  return nameById.get(cid) ?? cid;
}

function DeveloperNoteListRow({
  note,
  companyName,
  showUpdatedBadge,
}: {
  note: FarmNotebookEntrySlim;
  companyName: string;
  showUpdatedBadge?: boolean;
}) {
  const preview = developerNotePreview(note.content);
  const formattedDate = formatDeveloperNoteListDate(note.updated_at, note.created_at);
  const to = `/developer/records/${encodeURIComponent(String(note.crop_slug ?? ''))}/${encodeURIComponent(note.id)}`;

  return (
    <Link
      to={to}
      className="flex items-center gap-3 py-3 px-2 hover:bg-muted/40 cursor-pointer"
    >
      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden">
        {showUpdatedBadge ? (
          <span className="shrink-0 rounded bg-[#e6f4ea] px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">
            Updated
          </span>
        ) : null}
        <span className="font-medium truncate shrink min-w-0">{note.title?.trim() || 'Untitled'}</span>
        <span className="text-muted-foreground truncate min-w-0">{preview}</span>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{companyName}</span>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formattedDate}</span>
    </Link>
  );
}

function glassCard(className?: string) {
  return cn(
    'rounded-2xl border border-white/10 bg-background/55 shadow-[0_12px_40px_rgba(17,24,39,0.08)] backdrop-blur-md transition-all duration-300',
    'dark:border-white/5 dark:bg-background/40 dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
    'hover:shadow-[0_16px_48px_rgba(31,122,99,0.14)]',
    className,
  );
}

export default function DeveloperRecordsPage() {
  const [selectedCompany, setSelectedCompany] = useState<string>(ALL_COMPANIES);
  const [cropSearch, setCropSearch] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [sendNotesOpen, setSendNotesOpen] = useState(false);
  const [sendCompanyId, setSendCompanyId] = useState<string>('');
  const [sendCrop, setSendCrop] = useState<string>('all');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [addCropOpen, setAddCropOpen] = useState(false);
  const [cropName, setCropName] = useState('');
  const [cropSuggest, setCropSuggest] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [hiddenCropIds, setHiddenCropIds] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const companiesQuery = useQuery({
    queryKey: ['developer', 'records', 'companies'],
    queryFn: () => fetchDeveloperCompanies({ limit: 500, offset: 0 }),
    staleTime: 60_000,
  });

  const companies = companiesQuery.data?.items ?? [];
  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) {
      const id = String(c.company_id ?? c.id ?? '').trim();
      if (!id) continue;
      m.set(id, String(c.company_name ?? c.name ?? id));
    }
    return m;
  }, [companies]);
  const scopedCompanyId = selectedCompany === ALL_COMPANIES ? null : selectedCompany;

  function slugify(input: string): string {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = cropName.trim();
      if (!addCropOpen || q.length < 2) {
        setCropSuggest([]);
        return;
      }
      try {
        const { data, error } = await db
          .public()
          .from('record_crop_catalog')
          .select('id, name, slug')
          .ilike('name', `%${q}%`)
          .limit(5);
        if (error) throw error;
        const rows = (data as any[]) ?? [];
        if (!cancelled) setCropSuggest(rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug })));
      } catch {
        if (!cancelled) setCropSuggest([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cropName, addCropOpen]);

  const saveCustomCrop = async () => {
    const name = cropName.trim();
    const slug = slugify(name);
    if (!name || !slug) return;
    const { error } = await db.public().from('record_crop_catalog').insert({
      name,
      slug,
      created_by: 'developer',
    });
    if (!error) {
      setAddCropOpen(false);
      setCropName('');
      setCropSuggest([]);
    }
  };

  const entriesQuery = useQuery({
    queryKey: ['developer', 'records', 'farm_notebook_entries', scopedCompanyId ?? 'all'],
    queryFn: async (): Promise<FarmNotebookEntrySlim[]> => {
      let q = db
        .public()
        .from('farm_notebook_entries')
        .select('id, crop_slug, title, content, company_id, updated_at, created_at, source_note_id, sent_by_developer, developer_updated')
        .order('updated_at', { ascending: false })
        .is('source_note_id', null)
        .or('sent_by_developer.is.null,developer_updated.eq.true')
        .limit(5000);
      if (scopedCompanyId) q = q.eq('company_id', scopedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as FarmNotebookEntrySlim[]) ?? [];
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel('developer-records-farm-notebook-entries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farm_notebook_entries' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['developer', 'records', 'farm_notebook_entries'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const entries = entriesQuery.data ?? [];

  const updatedNotes = useMemo(() => {
    return entries.filter((n) => n.developer_updated === true);
  }, [entries]);

  const normalNotes = useMemo(() => {
    return entries.filter((n) => n.developer_updated !== true);
  }, [entries]);

  const cropsWithNotes = useMemo(() => {
    const set = new Set<string>();
    for (const r of entries) {
      const slug = String(r.crop_slug ?? '').trim();
      if (slug) set.add(slug);
    }
    return ['all', ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  const notesForSend = useMemo(() => {
    const base = sendCrop === 'all' ? entries : entries.filter((e) => String(e.crop_slug ?? '') === sendCrop);
    return base.slice(0, 500);
  }, [entries, sendCrop]);

  const allSelected = useMemo(() => {
    if (notesForSend.length === 0) return false;
    return notesForSend.every((n) => selectedNoteIds.has(n.id));
  }, [notesForSend, selectedNoteIds]);

  const toggleNote = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      const shouldSelectAll = !allSelected;
      for (const n of notesForSend) {
        if (shouldSelectAll) next.add(n.id);
        else next.delete(n.id);
      }
      return next;
    });
  };

  const sendNotes = async () => {
    const companyId = sendCompanyId.trim();
    if (!companyId) return;
    const selected = notesForSend.filter((n) => selectedNoteIds.has(n.id));
    if (selected.length === 0) return;

    const payload: Array<Record<string, unknown>> = [];
    for (const note of selected) {
      // Prevent duplicate send (skip if a copy already exists for this company)
      const { data: existing, error: existsErr } = await db
        .public()
        .from('farm_notebook_entries')
        .select('id')
        .eq('source_note_id', note.id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (existsErr) throw existsErr;
      if (existing?.id) continue;

      payload.push({
        company_id: companyId,
        crop_slug: note.crop_slug,
        title: note.title,
        content: note.content,
        created_by: 'developer',
        source: 'developer',
        source_note_id: note.id,
        sent_by_developer: true,
        developer_updated: false,
        is_admin_note: true,
      });
    }

    if (payload.length === 0) {
      setSendNotesOpen(false);
      setSelectedNoteIds(new Set());
      return;
    }

    const { error } = await db.public().from('farm_notebook_entries').insert(payload);
    if (!error) {
      setSendNotesOpen(false);
      setSelectedNoteIds(new Set());
    }
  };

  const cropStats = useMemo((): Record<string, CropStats> => {
    const grouped: Record<string, Array<{ updated_at: string | null }>> = {};
    for (const n of entries) {
      const slug = String(n.crop_slug ?? '').trim();
      if (!slug) continue;
      if (!grouped[slug]) grouped[slug] = [];
      grouped[slug].push({ updated_at: n.updated_at ?? n.created_at ?? null });
    }
    const out: Record<string, CropStats> = {};
    for (const [slug, notes] of Object.entries(grouped)) {
      const sorted = [...notes].sort((a, b) => {
        const ta = new Date(a.updated_at ?? 0).getTime();
        const tb = new Date(b.updated_at ?? 0).getTime();
        return tb - ta;
      });
      out[slug] = {
        notesCount: notes.length,
        lastActivity: sorted[0]?.updated_at ?? null,
      };
    }
    return out;
  }, [entries]);

  const cropCards: RecordCropCard[] = useMemo(() => {
    const byId = new Map<string, RecordCropCard>();

    for (const d of DEVELOPER_NOTEBOOK_DEFAULT_CROPS) {
      const s = cropStats[d.slug] ?? { notesCount: 0, lastActivity: null };
      byId.set(d.crop_id, {
        crop_id: d.crop_id,
        crop_name: d.crop_name,
        slug: d.slug,
        is_global: true,
        records_count: s.notesCount,
        last_updated_at: s.lastActivity,
      });
    }

    for (const slug of Object.keys(cropStats)) {
      if (byId.has(slug)) continue;
      const s = cropStats[slug]!;
      byId.set(slug, {
        crop_id: slug,
        crop_name: slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        slug,
        is_global: false,
        records_count: s.notesCount,
        last_updated_at: s.lastActivity,
      });
    }

    return [...byId.values()].filter((c) => !hiddenCropIds.includes(c.crop_id));
  }, [cropStats, hiddenCropIds]);

  const cropQ = cropSearch.trim().toLowerCase();
  const filteredCropCards = useMemo(() => {
    if (!cropQ) return cropCards;
    return cropCards.filter(
      (c) =>
        (c.crop_name ?? '').toLowerCase().includes(cropQ) ||
        (c.slug ?? '').toLowerCase().includes(cropQ),
    );
  }, [cropCards, cropQ]);

  const noteQ = noteSearch.trim().toLowerCase();
  const filteredNotes = useMemo(() => {
    const src = noteQ ? normalNotes : normalNotes;
    if (!noteQ) return src;
    return src.filter((n) => {
      const hay = `${n.title ?? ''} ${n.content ?? ''} ${n.crop_slug ?? ''}`.toLowerCase();
      return hay.includes(noteQ);
    });
  }, [normalNotes, noteQ]);

  const filteredUpdatedNotes = useMemo(() => {
    if (!noteQ) return updatedNotes;
    return updatedNotes.filter((n) => {
      const hay = `${n.title ?? ''} ${n.content ?? ''} ${n.crop_slug ?? ''}`.toLowerCase();
      return hay.includes(noteQ);
    });
  }, [updatedNotes, noteQ]);

  const mainBlock = (() => {
    if (entriesQuery.isLoading) {
      return (
        <div className={cn(glassCard(), 'p-10 space-y-4')}>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      );
    }
    if (entriesQuery.isError) {
      return (
        <div className={cn(glassCard(), 'p-10 text-sm space-y-3')}>
          <p className="text-red-600">Failed to load notebook entries. Please try again in a moment.</p>
          {import.meta.env.DEV && entriesQuery.error instanceof Error && entriesQuery.error.message && (
            <pre className="text-xs whitespace-pre-wrap break-words rounded-lg border border-black/10 bg-muted/40 p-3 text-foreground/80 max-h-40 overflow-auto">
              {entriesQuery.error.message}
            </pre>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={entriesQuery.isFetching}
            onClick={() => void entriesQuery.refetch()}
          >
            {entriesQuery.isFetching ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Retry
          </Button>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className="space-y-8 animate-fade-in pb-24 md:pb-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-md',
                'border-[#1F7A63]/25 bg-gradient-to-br from-[#1F7A63]/12 to-transparent',
              )}
            >
              <Sprout className="h-6 w-6" style={{ color: FV_GREEN }} />
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[34px]">
                Developer Records
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                Same Farm Notebook system — across all companies.
              </p>
            </div>
          </div>
        </div>
        <div className="hidden md:flex flex-wrap gap-2">
          <Button type="button" className={cn('rounded-lg shadow-sm', fvPrimaryBtn)} onClick={() => setFabOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add note
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[#1F7A63]/35 text-[#1F7A63] hover:bg-[#1F7A63]/10"
            onClick={() => setSendNotesOpen(true)}
          >
            Send Notes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[#1F7A63]/35 text-[#1F7A63] hover:bg-[#1F7A63]/10"
            onClick={() => setAddCropOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create new crop
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={selectedCompany} onValueChange={setSelectedCompany} disabled={companiesQuery.isLoading}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder={companiesQuery.isLoading ? 'Loading companies…' : 'Select company'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
            {companies.map((company) => {
              const id = String(company.company_id ?? company.id ?? '');
              if (!id) return null;
              return (
                <SelectItem key={id} value={id}>
                  {company.company_name ?? company.name ?? id}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="max-w-md flex-1 min-w-[200px]">
          <div className="group relative">
            <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_10px_24px_rgba(17,24,39,0.06)] transition-shadow group-focus-within:shadow-[0_14px_30px_rgba(17,24,39,0.10)]" />
            <div
              className={cn(
                'relative flex h-10 items-center rounded-xl border px-3 backdrop-blur transition-colors',
                'border-black/10 bg-background/60 dark:border-white/10',
              )}
            >
              <Search className="h-4 w-4 text-muted-foreground/80" />
              <Input
                value={cropSearch}
                onChange={(e) => setCropSearch(e.target.value)}
                placeholder="Search crops…"
                className="h-9 border-0 bg-transparent pl-2 pr-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        </div>
      </div>

      {mainBlock}

      {!entriesQuery.isLoading && !entriesQuery.isError && (
        <>
          {cropCards.length === 0 ? (
            <div className={cn(glassCard(), 'p-10 text-center')}>
              <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
                Once notes exist for any crop, crop notebooks appear here.
              </p>
            </div>
          ) : filteredCropCards.length === 0 ? (
            <div className={cn(glassCard(), 'p-7 text-sm text-muted-foreground')}>No crops match your search.</div>
          ) : (
            <RecordsCropGrid
              crops={filteredCropCards}
              basePath="/developer/records"
              allowDelete
              onDeleteCrop={(c) =>
                setHiddenCropIds((prev) => (prev.includes(c.crop_id) ? prev : [...prev, c.crop_id]))
              }
              accent="farmvault"
              className="gap-4 sm:gap-5"
            />
          )}

          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Notes</h2>
              <div className="max-w-md w-full">
                <Input
                  placeholder="Search notes…"
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  className="h-9 border-border bg-background"
                />
              </div>
            </div>

            <div className="mt-4">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notebook entries for this filter.</p>
              ) : filteredNotes.length === 0 && filteredUpdatedNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes match your search.</p>
              ) : (
                <div className="space-y-6">
                  {filteredUpdatedNotes.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">Updated</h3>
                      <div className="divide-y divide-border border-t border-border">
                        {filteredUpdatedNotes.slice(0, 30).map((n) => (
                          <DeveloperNoteListRow
                            key={`updated-${n.id}`}
                            note={n}
                            companyName={developerNoteCompanyLabel(n, companyNameById)}
                            showUpdatedBadge
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {filteredNotes.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">All</h3>
                      <div className="divide-y divide-border border-t border-border">
                        {filteredNotes.slice(0, 60).map((n) => (
                          <DeveloperNoteListRow
                            key={n.id}
                            note={n}
                            companyName={developerNoteCompanyLabel(n, companyNameById)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className={cn(
          'md:hidden fixed bottom-6 right-6 z-40 p-4 rounded-full shadow-lg cursor-pointer',
          fvPrimaryBtn,
        )}
        aria-label="Add note"
        onClick={() => setFabOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </button>

      <Dialog open={fabOpen} onOpenChange={setFabOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choose a crop to open its notebook and create a note.</p>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {cropCards.map((c) => (
              <Link
                key={c.crop_id}
                to={`/developer/records/${encodeURIComponent(c.slug || c.crop_id)}/new`}
                onClick={() => setFabOpen(false)}
                className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm hover:border-[#1F7A63]/40 hover:bg-muted/30"
              >
                <span className="font-medium">{c.crop_name}</span>
                <span className="text-xs text-muted-foreground">{c.records_count} notes</span>
              </Link>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFabOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendNotesOpen} onOpenChange={setSendNotesOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send notes to a company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Company</div>
                <Select value={sendCompanyId} onValueChange={setSendCompanyId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {companies.map((company) => {
                      const id = String(company.company_id ?? company.id ?? '').trim();
                      if (!id) return null;
                      return (
                        <SelectItem key={id} value={id}>
                          {company.company_name ?? company.name ?? id}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Crop filter</div>
                <Select value={sendCrop} onValueChange={setSendCrop}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {cropsWithNotes.map((slug) => (
                      <SelectItem key={slug} value={slug}>
                        {slug === 'all' ? 'All crops' : slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-sm font-medium hover:underline"
                  onClick={toggleSelectAll}
                >
                  {allSelected ? 'Unselect all' : 'Select all'}
                </button>
                <div className="text-xs text-muted-foreground">
                  Selected {selectedNoteIds.size} / {notesForSend.length}
                </div>
              </div>
              <div className="mt-3 max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {notesForSend.map((n) => {
                  const checked = selectedNoteIds.has(n.id);
                  return (
                    <label
                      key={n.id}
                      className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/50 p-3 hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleNote(n.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{n.title || 'Untitled'}</div>
                        <div className="text-xs text-muted-foreground">
                          {String(n.crop_slug ?? '').trim() || 'unknown'} · {String(n.company_id ?? '').slice(0, 8)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {(n.content ?? '').trim().slice(0, 160) || '—'}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {notesForSend.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4">No notes found for this crop filter.</div>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendNotesOpen(false)}>
              Cancel
            </Button>
            <Button
              className={fvPrimaryBtn}
              disabled={!sendCompanyId.trim() || selectedNoteIds.size === 0}
              onClick={() => void sendNotes()}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addCropOpen} onOpenChange={setAddCropOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create new crop</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={cropName}
              onChange={(e) => setCropName(e.target.value)}
              placeholder="e.g. Cherry Tomatoes, Onions"
            />
            {cropSuggest.length > 0 ? (
              <div className="rounded-xl border border-border/60 bg-background/40 p-2">
                <div className="text-xs text-muted-foreground mb-2">Suggestions</div>
                <div className="space-y-1">
                  {cropSuggest.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left rounded-lg px-2 py-1 text-sm hover:bg-muted/40"
                      onClick={() => setCropName(s.name)}
                    >
                      <span className="font-medium">{s.name}</span>{' '}
                      <span className="text-xs text-muted-foreground">({s.slug})</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCropOpen(false)}>
              Cancel
            </Button>
            <Button className={fvPrimaryBtn} onClick={() => void saveCustomCrop()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
