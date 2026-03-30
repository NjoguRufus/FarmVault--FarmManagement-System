import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Calendar, CheckCircle2, Clock, Flame, Leaf, ShieldAlert, ShieldCheck, Sprout, Tag, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyStateBlock } from './EmptyStateBlock';
import { supabase } from '@/lib/supabase';
import { DeveloperRecordDetailsSheet, type DevDetailSection } from './DeveloperRecordDetailsSheet';
import { cn } from '@/lib/utils';

type Props = {
  companyId: string;
  /** When false, the tab stays disabled (lazy load). */
  active: boolean;
};

type SeasonChallengeRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  title: string | null;
  description: string | null;
  challenge_type: string | null;
  severity: string | null;
  status: string | null;
  crop_type: string | null;
  date_identified: string | null;
  created_at: string | null;
};

type SeasonChallengeDetailsRow = SeasonChallengeRow & {
  stage_index?: number | null;
  stage_name?: string | null;
  date_resolved?: string | null;
  what_was_done?: string | null;
  items_used?: unknown;
  plan2_if_fails?: string | null;
  recommended_action?: string | null;
  recommended_input?: string | null;
  source?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  project_name?: string | null;
  saved_as_reusable?: boolean | null;
};

function valueOrFallback(value: unknown, fallback = 'Not provided') {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s === '' ? fallback : s;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not provided';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return 'Not provided';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const s = String(status ?? '').toLowerCase();
  const label = status ? String(status) : 'unknown';
  const cls = cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold capitalize',
    !s && 'border-border/60 bg-muted/30 text-muted-foreground',
    s === 'resolved' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    (s === 'identified' || s === 'open') && 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    s === 'mitigating' && 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200',
  );
  const Icon = s === 'resolved' ? CheckCircle2 : s === 'mitigating' ? Clock : ShieldAlert;
  return (
    <span className={cls}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function SeverityPill({ severity }: { severity: string | null | undefined }) {
  const s = String(severity ?? '').toLowerCase();
  const label = severity ? String(severity) : 'unknown';
  const cls = cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold capitalize',
    !s && 'border-border/60 bg-muted/30 text-muted-foreground',
    (s === 'high' || s === 'critical') && 'border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200',
    s === 'medium' && 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    s === 'low' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  );
  return (
    <span className={cls}>
      <Flame className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function CompanySeasonChallengesTab({ companyId, active }: Props) {
  const selectedCompanyId: string | null = companyId?.trim() ? companyId.trim() : null;
  const [selected, setSelected] = useState<SeasonChallengeRow | null>(null);
  const selectedId = selected?.id ?? null;

  const { data: tableSanity } = useQuery({
    queryKey: ['developer-season-challenges-table-sanity'],
    enabled: active,
    queryFn: async () => {
      const { data: sample, error: sampleError, count: totalCount } = await supabase
        .from('season_challenges')
        .select('id, company_id, title, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(5);

      // eslint-disable-next-line no-console
      console.log('[DeveloperSeasonChallengesTab] table sanity:', {
        totalCount,
        sample,
        sampleError,
      });

      return {
        totalCount: totalCount ?? null,
        sample: (sample ?? []) as Array<{ id: string; company_id: string; title: string | null; created_at: string | null }>,
        sampleError: sampleError ? (sampleError as any).message ?? String(sampleError) : null,
        supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL ?? ''),
      };
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: rlsContext } = useQuery({
    queryKey: ['developer-season-challenges-rls-context'],
    enabled: active,
    queryFn: async () => {
      const [{ data: currentCompanyId, error: currentCompanyErr }, { data: isDev, error: isDevErr }] =
        await Promise.all([
          supabase.rpc('current_company_id'),
          supabase.rpc('is_developer'),
        ]);

      // eslint-disable-next-line no-console
      console.log('[DeveloperSeasonChallengesTab] RLS context:', {
        current_company_id: currentCompanyId,
        current_company_id_error: currentCompanyErr,
        is_developer: isDev,
        is_developer_error: isDevErr,
      });

      return {
        currentCompanyId: (currentCompanyId as string | null) ?? null,
        isDeveloper: Boolean(isDev),
        currentCompanyErr: currentCompanyErr ? (currentCompanyErr as any).message ?? String(currentCompanyErr) : null,
        isDevErr: isDevErr ? (isDevErr as any).message ?? String(isDevErr) : null,
      };
    },
    staleTime: 0,
    gcTime: 0,
  });

  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: ['developer-season-challenges', selectedCompanyId ?? ''],
    enabled: active && !!selectedCompanyId,
    queryFn: async (): Promise<SeasonChallengeRow[]> => {
      if (!selectedCompanyId) return [];

      const { data, error } = await supabase
        .from('season_challenges')
        .select(
          `
          id,
          company_id,
          project_id,
          crop_type,
          title,
          description,
          challenge_type,
          severity,
          status,
          date_identified,
          created_at
        `,
        )
        .eq('company_id', selectedCompanyId)
        .order('created_at', { ascending: false });

      // Temporary logging (requested)
      // eslint-disable-next-line no-console
      console.log('[DeveloperSeasonChallengesTab] companyId:', selectedCompanyId);
      // eslint-disable-next-line no-console
      console.log('[DeveloperSeasonChallengesTab] raw data:', data);
      // eslint-disable-next-line no-console
      console.log('[DeveloperSeasonChallengesTab] raw error:', error);

      if (error) throw error;
      return (data ?? []) as SeasonChallengeRow[];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: selectedDetails, isFetching: detailsFetching, error: detailsError } = useQuery({
    queryKey: ['developer-season-challenges-details', selectedId ?? ''],
    enabled: active && Boolean(selectedId),
    queryFn: async (): Promise<SeasonChallengeDetailsRow | null> => {
      if (!selectedId) return null;

      // Safe single-record fetch: does not change list query logic.
      // Prefer selecting only columns that exist in our migrations to avoid breaking the view.
      const { data, error } = await supabase
        .from('season_challenges')
        .select(
          `
          id,
          company_id,
          project_id,
          crop_type,
          title,
          description,
          challenge_type,
          stage_index,
          stage_name,
          severity,
          status,
          date_identified,
          date_resolved,
          what_was_done,
          items_used,
          plan2_if_fails,
          source,
          source_plan_challenge_id,
          created_by,
          created_by_name,
          created_at,
          updated_at,
          saved_as_reusable
        `,
        )
        .eq('id', selectedId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Enrich project name with a safe follow-up query (optional).
      const row = data as SeasonChallengeDetailsRow;
      if (row.project_id) {
        const { data: p } = await supabase
          .schema('projects')
          .from('projects')
          .select('name')
          .eq('id', row.project_id)
          .maybeSingle();
        row.project_name = (p as any)?.name ? String((p as any).name) : null;
      } else {
        row.project_name = null;
      }

      return row;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const detailsSections: DevDetailSection[] = useMemo(() => {
    const d = selectedDetails;
    if (!d) return [];

    return [
      {
        title: 'Overview',
        items: [
          { label: 'Title', value: valueOrFallback(d.title, 'Untitled') },
          { label: 'Status', value: <StatusPill status={d.status} /> },
          { label: 'Severity', value: <SeverityPill severity={d.severity} /> },
          { label: 'Challenge type', value: <InlineIcon icon={<Tag className="h-4 w-4" />} value={valueOrFallback(d.challenge_type)} /> },
          { label: 'Crop type', value: <InlineIcon icon={<Leaf className="h-4 w-4" />} value={valueOrFallback(d.crop_type)} /> },
          { label: 'Linked project', value: <InlineIcon icon={<Sprout className="h-4 w-4" />} value={d.project_id ? (d.project_name ?? 'Project not found') : 'Not linked'} /> },
        ],
      },
      {
        title: 'Description',
        items: [
          { label: 'Description', value: valueOrFallback(d.description) },
          { label: 'Stage', value: d.stage_name ? `${d.stage_name}${d.stage_index != null ? ` (index ${d.stage_index})` : ''}` : 'Not provided' },
          { label: 'Source', value: <InlineIcon icon={<ShieldCheck className="h-4 w-4" />} value={valueOrFallback(d.source)} /> },
          { label: 'Reusable flag', value: d.saved_as_reusable ? 'Saved as reusable template' : 'Not marked reusable' },
        ],
      },
      {
        title: 'Timeline',
        items: [
          { label: 'Date identified', value: <InlineIcon icon={<Calendar className="h-4 w-4" />} value={formatDateOnly(d.date_identified)} /> },
          { label: 'Date resolved', value: formatDateOnly(d.date_resolved) },
          { label: 'Created at', value: formatDateTime(d.created_at) },
          { label: 'Updated at', value: formatDateTime(d.updated_at) },
        ],
      },
      {
        title: 'Resolution details',
        items: [
          { label: 'What was done', value: valueOrFallback(d.what_was_done) },
          { label: 'Items used', value: d.items_used != null ? <pre className="whitespace-pre-wrap text-[12px] leading-relaxed">{JSON.stringify(d.items_used, null, 2)}</pre> : 'Not provided' },
          { label: 'Plan B (if fails)', value: valueOrFallback(d.plan2_if_fails) },
          { label: 'Recommended action', value: valueOrFallback(d.recommended_action) },
          { label: 'Recommended input', value: valueOrFallback(d.recommended_input) },
        ],
      },
      {
        title: 'Attribution',
        items: [
          { label: 'Created by', value: <InlineIcon icon={<User className="h-4 w-4" />} value={valueOrFallback(d.created_by)} /> },
          { label: 'Created by name', value: valueOrFallback(d.created_by_name) },
          { label: 'Notes', value: valueOrFallback(d.notes) },
        ],
      },
    ];
  }, [selectedDetails]);

  if (!active) return null;

  if (!selectedCompanyId || selectedCompanyId.trim() === '') {
    if (!String(companyId ?? '').trim()) {
      return (
        <div className="fv-card space-y-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      );
    }
    return (
      <EmptyStateBlock
        title="No company selected"
        description="Select a company to view season challenges."
      />
    );
  }

  const rows = data ?? [];
  const showEmptyState = isFetched && !error && rows.length === 0;

  return (
    <div className="space-y-4">
      <div className="fv-card p-3 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Company ID:</span> {selectedCompanyId}
        </div>
        <div>
          <span className="font-semibold text-foreground">Raw rows fetched:</span> {rows.length}
          {isFetching ? ' (refreshing...)' : ''}
        </div>
        <div>
          <span className="font-semibold text-foreground">Query error:</span> {(error as Error | null)?.message ?? 'none'}
        </div>
        <div className="pt-1 text-[11px]">
          <span className="font-semibold text-foreground">Supabase URL:</span>{' '}
          {tableSanity?.supabaseUrl ? tableSanity.supabaseUrl.replace(/^https?:\/\//, '') : 'unknown'}
        </div>
        <div className="text-[11px]">
          <span className="font-semibold text-foreground">Table total rows (all companies):</span>{' '}
          {tableSanity?.totalCount ?? 'unknown'}
        </div>
        <div className="text-[11px]">
          <span className="font-semibold text-foreground">Sample rows company_ids:</span>{' '}
          {tableSanity?.sample?.length
            ? tableSanity.sample.map((r) => r.company_id).join(', ')
            : 'none'}
        </div>
        <div className="pt-1 text-[11px]">
          <span className="font-semibold text-foreground">RLS current_company_id():</span>{' '}
          {rlsContext?.currentCompanyId ?? 'null'}
        </div>
        <div className="text-[11px]">
          <span className="font-semibold text-foreground">RLS is_developer():</span>{' '}
          {String(rlsContext?.isDeveloper ?? false)}
        </div>
      </div>

      {error && (
        <div className="fv-card flex flex-col gap-2 border-destructive/40 bg-destructive/5 p-4 text-destructive sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Failed to load season challenges</p>
              <p className="text-xs opacity-90">{(error as Error).message}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="fv-card space-y-3 p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}

      {showEmptyState && (
        <EmptyStateBlock
          title="No season challenges recorded for this company."
          description="When the team logs challenges from crop stages or project planning, they will appear here."
        />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Raw rows from `season_challenges` (most recent first).</p>
            <Button variant="outline" size="sm" type="button" onClick={() => void refetch()}>
              Refresh
            </Button>
          </div>

          <div className="fv-card overflow-x-auto">
            <table className="fv-table-mobile w-full min-w-[900px] text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">Title</th>
                  <th className="py-2 text-left font-medium">Type</th>
                  <th className="py-2 text-left font-medium">Severity</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Crop Type</th>
                  <th className="py-2 text-left font-medium">Date Identified</th>
                  <th className="py-2 text-left font-medium">Created At</th>
                  <th className="py-2 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 hover:bg-muted/20 cursor-pointer"
                    onClick={() => setSelected(r)}
                    role="button"
                    aria-label={`View season challenge ${r.title ?? 'details'}`}
                  >
                    <td className="py-2 max-w-[260px]">
                      <p className="font-medium truncate" title={r.title ?? undefined}>
                        {r.title ?? '—'}
                      </p>
                    </td>
                    <td className="py-2 text-xs max-w-[160px] truncate" title={r.challenge_type ?? undefined}>
                      {r.challenge_type ?? '—'}
                    </td>
                    <td className="py-2 text-xs">{r.severity ?? '—'}</td>
                    <td className="py-2 text-xs">{r.status ?? '—'}</td>
                    <td className="py-2 text-xs">{r.crop_type ?? '—'}</td>
                    <td className="py-2 text-xs whitespace-nowrap">{r.date_identified ?? '—'}</td>
                    <td className="py-2 text-xs whitespace-nowrap">{r.created_at ?? '—'}</td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelected(r);
                        }}
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DeveloperRecordDetailsSheet
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selectedDetails?.title ? String(selectedDetails.title) : selected?.title ?? 'Season Challenge'}
        description="Season challenge inspection (read-only)."
        recordId={selectedId}
        badge={
          <div className="flex items-center gap-2">
            <SeverityPill severity={selectedDetails?.severity ?? selected?.severity} />
            <StatusPill status={selectedDetails?.status ?? selected?.status} />
          </div>
        }
        sections={detailsSections.length ? detailsSections : [
          {
            title: 'Loading',
            description: detailsFetching ? 'Fetching full challenge details…' : detailsError ? 'Failed to load details.' : 'Select a challenge to view details.',
            items: [
              { label: 'Title', value: selected?.title ?? '—' },
              { label: 'Status', value: selected?.status ?? '—' },
            ],
          },
        ]}
        raw={selectedDetails ?? selected ?? undefined}
      />
    </div>
  );
}

function InlineIcon({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">{value}</span>
    </span>
  );
}
