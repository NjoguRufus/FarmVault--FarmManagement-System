import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, FileText, Loader2, Plus, RefreshCw, Search, Sprout } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/hooks/useCompanyScope';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { RecordsCropGrid } from '@/components/records/RecordsCropGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DEVELOPER_NOTEBOOK_DEFAULT_CROPS,
  type RecordCropCard,
} from '@/services/recordsService';
import { cn } from '@/lib/utils';

const BRAND_GREEN = '#16a34a';
const BRAND_GOLD = '#D8B980';

function glassCard(className?: string) {
  return cn(
    'rounded-2xl border border-white/10 bg-background/55 shadow-[0_12px_40px_rgba(17,24,39,0.08)] backdrop-blur-md transition-all duration-300',
    'dark:border-white/5 dark:bg-background/40 dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
    'hover:shadow-[0_16px_48px_rgba(22,163,74,0.12)]',
    className,
  );
}

type NotebookEntryRow = {
  id: string;
  crop_slug: string | null;
  title: string | null;
  content: string | null;
  company_id: string | null;
  created_at: string | null;
  updated_at?: string | null;
  source?: string | null;
  is_admin_note?: boolean | null;
};

type CropStats = { count: number; lastActivity: string | null };

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'No activity';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No activity';

  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.max(1, Math.round(abs / 60000));
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (minutes < 60) return rtf.format(diffMs < 0 ? -minutes : minutes, 'minute');
  if (hours < 48) return rtf.format(diffMs < 0 ? -hours : hours, 'hour');
  return rtf.format(diffMs < 0 ? -days : days, 'day');
}

export default function AdminRecordsPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'crops' | 'notes' | 'admin'>('crops');
  const [fabOpen, setFabOpen] = useState(false);
  const [addCropOpen, setAddCropOpen] = useState(false);
  const [cropName, setCropName] = useState('');
  const [cropSuggest, setCropSuggest] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  const { authReady } = useAuth();
  const { isDeveloper, companyId: scopeCompanyId } = useCompanyScope();
  const queryClient = useQueryClient();

  const companyReady = isDeveloper ? true : !!(scopeCompanyId && String(scopeCompanyId).trim());
  const needsCompany = !isDeveloper && !companyReady;

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
      created_by: 'user',
    });
    if (!error) {
      setAddCropOpen(false);
      setCropName('');
      setCropSuggest([]);
    }
  };

  const cropStatsQuery = useQuery({
    queryKey: ['records', 'notebook', 'crop-stats', isDeveloper ? 'developer' : String(scopeCompanyId ?? '')],
    enabled: authReady && companyReady,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Record<string, CropStats>> => {
      const { data, error } = await db
        .public()
        .from('farm_notebook_entries')
        .select('crop_slug, created_at');
      if (error) throw error;

      const stats: Record<string, CropStats> = {};
      for (const r of (data ?? []) as Array<{ crop_slug: string | null; created_at: string | null }>) {
        const slug = (r.crop_slug ?? '').trim();
        if (!slug) continue;
        const cur = stats[slug] ?? { count: 0, lastActivity: null };
        cur.count += 1;
        if (r.created_at && (!cur.lastActivity || new Date(r.created_at) > new Date(cur.lastActivity))) {
          cur.lastActivity = r.created_at;
        }
        stats[slug] = cur;
      }
      return stats;
    },
  });

  const recentNotesQuery = useQuery({
    queryKey: ['records', 'notebook', 'recent-notes', isDeveloper ? 'developer' : String(scopeCompanyId ?? '')],
    enabled: authReady && companyReady,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<NotebookEntryRow[]> => {
      const { data, error } = await db
        .public()
        .from('farm_notebook_entries')
        .select('id, crop_slug, title, content, company_id, created_at, updated_at, source, is_admin_note')
        .order('updated_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data as NotebookEntryRow[]) ?? [];
    },
  });

  const adminNotesQuery = useQuery({
    queryKey: ['records', 'notebook', 'admin-tab', isDeveloper ? 'developer' : String(scopeCompanyId ?? '')],
    enabled: authReady && companyReady,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<NotebookEntryRow[]> => {
      const { data, error } = await db
        .public()
        .from('farm_notebook_entries')
        .select('id, crop_slug, title, content, company_id, created_at, updated_at, source, is_admin_note')
        .eq('is_admin_note', true)
        .order('updated_at', { ascending: false })
        .limit(isDeveloper ? 120 : 60);
      if (error) throw error;
      return (data as NotebookEntryRow[]) ?? [];
    },
  });

  useEffect(() => {
    if (!authReady || !companyReady) return;
    const channel = supabase
      .channel('fv-notebook-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farm_notebook_entries' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['records', 'notebook'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authReady, companyReady, queryClient]);

  const crops: RecordCropCard[] = useMemo(() => {
    const stats = cropStatsQuery.data ?? {};
    const byId = new Map<string, RecordCropCard>();

    for (const d of DEVELOPER_NOTEBOOK_DEFAULT_CROPS) {
      const s = stats[d.slug] ?? { count: 0, lastActivity: null };
      byId.set(d.crop_id, {
        crop_id: d.crop_id,
        crop_name: d.crop_name,
        slug: d.slug,
        is_global: true,
        records_count: s.count,
        last_updated_at: s.lastActivity,
      });
    }

    for (const slug of Object.keys(stats)) {
      if (byId.has(slug)) continue;
      const s = stats[slug]!;
      byId.set(slug, {
        crop_id: slug,
        crop_name: slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        slug,
        is_global: false,
        records_count: s.count,
        last_updated_at: s.lastActivity,
      });
    }

    const ORDER: Record<string, number> = {
      tomatoes: 1,
      'french-beans': 2,
      capsicum: 3,
      maize: 4,
      rice: 5,
      watermelon: 6,
    };
    return [...byId.values()].sort((a, b) => {
      const aRank = ORDER[a.slug] ?? Number.MAX_SAFE_INTEGER;
      const bRank = ORDER[b.slug] ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.crop_name.localeCompare(b.crop_name);
    });
  }, [cropStatsQuery.data]);

  const filteredCrops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return crops;
    return crops.filter((c) => (c.crop_name ?? '').toLowerCase().includes(q) || (c.slug ?? '').toLowerCase().includes(q));
  }, [crops, search]);

  const visibleCrops = useMemo(() => {
    const ALLOWED_GLOBAL_SLUGS = new Set<string>([
      'french-beans',
      'tomatoes',
      'capsicum',
      'watermelon',
      'maize',
      'rice',
    ]);
    return filteredCrops.filter((crop) => {
      if (!crop.is_global) return true;
      if (!crop.slug) return true;
      return ALLOWED_GLOBAL_SLUGS.has(crop.slug);
    });
  }, [filteredCrops]);

  const firstCropSlug = visibleCrops[0]?.slug ?? visibleCrops[0]?.crop_id ?? '';

  const mainBlock = (() => {
    if (!authReady) {
      return (
        <div className={cn(glassCard(), 'p-10 flex items-center justify-center gap-2 text-muted-foreground')}>
          <Loader2 className="h-6 w-6 animate-spin" /> Preparing workspace…
        </div>
      );
    }
    if (needsCompany) {
      return (
        <div className={cn(glassCard(), 'p-10')}>
          <h2 className="text-lg font-semibold text-foreground mb-2">Company workspace required</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Records are tied to your company. Finish onboarding or select a company to load your farm notebook.
          </p>
        </div>
      );
    }
    if (!companyReady) {
      return (
        <div className={cn(glassCard(), 'p-10')}>
          <h2 className="text-lg font-semibold text-foreground mb-2">No company workspace</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Select a company in your profile or switch workspace to load your farm notebook.
          </p>
        </div>
      );
    }
    if (cropStatsQuery.isLoading) {
      return (
        <div className={cn(glassCard(), 'p-10 space-y-4')}>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      );
    }
    if (cropStatsQuery.isError) {
      return (
        <div className={cn(glassCard(), 'p-10 text-sm space-y-3')}>
          <p className="text-red-600">
            Failed to load notebook stats. Please try again in a moment.
          </p>
          {import.meta.env.DEV && cropStatsQuery.error instanceof Error && cropStatsQuery.error.message && (
            <pre className="text-xs whitespace-pre-wrap break-words rounded-lg border border-black/10 bg-muted/40 p-3 text-foreground/80 max-h-40 overflow-auto">
              {cropStatsQuery.error.message}
            </pre>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cropStatsQuery.isFetching}
            onClick={() => void cropStatsQuery.refetch()}
          >
            {cropStatsQuery.isFetching ? (
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
    <div
      className="space-y-8 animate-fade-in pb-24"
      style={
        {
          '--fv-brand-green': BRAND_GREEN,
          '--fv-brand-gold': BRAND_GOLD,
        } as React.CSSProperties
      }
    >
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-md',
                'border-[color:var(--fv-brand-green)]/25 bg-gradient-to-br from-[#16a34a]/12 to-transparent',
              )}
            >
              <Sprout className="h-6 w-6" style={{ color: BRAND_GREEN }} />
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[34px]">
                Farm notebook
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                Crops, your notes, and FarmVault admin updates — organized in one place.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={!companyReady}
            onClick={() => setAddCropOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add custom crop
          </Button>
          <Button
            size="sm"
            className="rounded-xl shadow-md hover:opacity-95"
            style={{ backgroundColor: BRAND_GREEN }}
            disabled={!companyReady}
            onClick={() => setFabOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add note
          </Button>
        </div>
      </div>

      <div className="max-w-md">
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search crops…"
              className="h-9 border-0 bg-transparent pl-2 pr-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>
      </div>

      {mainBlock}

      {authReady && companyReady && !cropStatsQuery.isLoading && !cropStatsQuery.isError && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="space-y-6"
        >
          <TabsList className="h-11 w-full justify-start gap-1 rounded-xl bg-muted/40 p-1 sm:w-auto">
            <TabsTrigger
              value="crops"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Crops
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Notes
            </TabsTrigger>
            <TabsTrigger
              value="admin"
              className="relative rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <span className="inline-flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                Admin notes
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="crops" className="mt-0 space-y-6">
            {visibleCrops.length === 0 ? (
              <div className={cn(glassCard(), 'p-10 text-center')}>
                <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <h2 className="text-lg font-semibold text-foreground mb-2">No crops yet</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
                  Start logging notes in a crop notebook and your activity will appear here.
                </p>
                <Button onClick={() => setFabOpen(true)} size="sm" style={{ backgroundColor: BRAND_GREEN }}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add note
                </Button>
              </div>
            ) : filteredCrops.length === 0 ? (
              <div className={cn(glassCard(), 'p-7 text-sm text-muted-foreground')}>No crops match your search.</div>
            ) : (
              <div className="space-y-4">
                <RecordsCropGrid crops={visibleCrops} basePath="/records" className="gap-4 sm:gap-5" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibleCrops.slice(0, 6).map((c) => (
                    <div
                      key={`meta-${c.crop_id}`}
                      className="rounded-2xl border border-border/50 bg-background/35 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground truncate">{c.crop_name}</div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {c.records_count} Notes
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last activity {formatRelativeTime(c.last_updated_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-0">
            <div className={cn(glassCard(), 'p-6')}>
              {recentNotesQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : recentNotesQuery.isError ? (
                <p className="text-sm text-red-600">Could not load recent notes.</p>
              ) : (recentNotesQuery.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No notebook entries yet. Open a crop and add a personal note.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentNotesQuery.data!.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-xl border border-border/50 bg-background/40 p-4 transition-colors hover:border-[color:var(--fv-brand-green)]/30"
                    >
                      {String(n.source ?? '').toLowerCase() === 'developer' ? (
                        <div className="mb-1 w-fit rounded-md bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-semibold text-[#166534]">
                          From Developer
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          to={`/records/${encodeURIComponent(String(n.crop_slug ?? ''))}/${encodeURIComponent(n.id)}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {(n.title ?? '').trim() || 'Untitled'}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">
                          {String(n.crop_slug ?? '').trim() || 'unknown'} ·{' '}
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {(n.content ?? '').trim().slice(0, 180) || 'No content yet…'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="admin" className="mt-0">
            <div className={cn(glassCard(), 'p-6 space-y-4')}>
              {adminNotesQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
              ) : adminNotesQuery.isError ? (
                <p className="text-sm text-red-600">Could not load notes.</p>
              ) : (adminNotesQuery.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                <ul className="space-y-4">
                  {adminNotesQuery.data!.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-xl border border-[color:var(--fv-brand-gold)]/35 bg-gradient-to-br from-[#D8B980]/8 to-transparent p-4 shadow-sm"
                    >
                      {String(n.source ?? '').toLowerCase() === 'developer' ? (
                        <div className="mb-1 w-fit rounded-md bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-semibold text-[#1f6f43]">
                          From Developer
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span style={{ color: BRAND_GOLD }}>From notebook</span>
                        <span>·</span>
                        <span>{String(n.crop_slug ?? '').trim() || 'unknown'}</span>
                        {isDeveloper ? (
                          <>
                            <span>·</span>
                            <span>{String(n.company_id ?? '').slice(0, 8) || 'company'}</span>
                          </>
                        ) : null}
                        {(n.updated_at || n.created_at) ? (
                          <>
                            <span>·</span>
                            <span>{new Date((n.updated_at ?? n.created_at) as string).toLocaleString()}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <Link
                          to={`/records/${encodeURIComponent(String(n.crop_slug ?? ''))}/${encodeURIComponent(n.id)}`}
                          className="text-base font-semibold text-foreground hover:underline"
                        >
                          {(n.title ?? '').trim() || 'Untitled'}
                        </Link>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-4">
                        {(n.content ?? '').trim() || 'No content yet…'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {companyReady && firstCropSlug ? (
        <Button
          type="button"
          size="lg"
          className="fixed bottom-6 right-6 z-40 h-14 rounded-full px-6 shadow-xl transition-transform hover:scale-[1.03]"
          style={{ backgroundColor: BRAND_GREEN }}
          onClick={() => setFabOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Add note
        </Button>
      ) : null}

      <Dialog open={fabOpen} onOpenChange={setFabOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choose a crop to open its notebook and create a note.</p>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {visibleCrops.map((c) => (
              <Link
                key={c.crop_id}
                to={`/records/${encodeURIComponent(c.slug || c.crop_id)}`}
                onClick={() => setFabOpen(false)}
                className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm hover:border-[color:var(--fv-brand-green)]/40 hover:bg-muted/30"
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

      <Dialog open={addCropOpen} onOpenChange={setAddCropOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add custom crop</DialogTitle>
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
            <Button style={{ backgroundColor: BRAND_GREEN }} onClick={() => void saveCustomCrop()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
