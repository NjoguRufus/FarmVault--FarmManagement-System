import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCopy, Mail, RefreshCw } from 'lucide-react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  FARMVAULT_EMAIL_TYPES,
  fetchEmailLogStats,
  fetchEmailLogs,
  type EmailLogRow,
  type EmailLogStatus,
  type FarmVaultEmailTypeFilter,
} from '@/services/emailLogService';

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function truncateId(id: string | null | undefined, len = 14): string {
  if (!id) return '—';
  if (id.length <= len) return id;
  return `${id.slice(0, len)}…`;
}

function statusBadgeClass(status: EmailLogStatus): string {
  if (status === 'sent') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
  }
  if (status === 'failed') {
    return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300';
  }
  return 'border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-200';
}

function formatEmailType(t: string): string {
  return t.replace(/_/g, ' ');
}

export default function DeveloperEmailLogsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [emailType, setEmailType] = useState<FarmVaultEmailTypeFilter>('all');
  const [status, setStatus] = useState<EmailLogStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<EmailLogRow | null>(null);

  const dateFromIso = useMemo(() => {
    if (!dateFrom) return null;
    const d = new Date(`${dateFrom}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [dateFrom]);

  const dateToIso = useMemo(() => {
    if (!dateTo) return null;
    const d = new Date(`${dateTo}T23:59:59.999Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [dateTo]);

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['developer', 'email-logs-stats'],
    queryFn: fetchEmailLogStats,
  });

  const {
    data: rows,
    isLoading: rowsLoading,
    isFetching: rowsFetching,
    error: rowsError,
    refetch: refetchRows,
  } = useQuery({
    queryKey: [
      'developer',
      'email-logs',
      search,
      emailType,
      status,
      dateFromIso,
      dateToIso,
    ],
    queryFn: () =>
      fetchEmailLogs({
        search: search.trim() || undefined,
        emailType,
        status,
        dateFrom: dateFromIso,
        dateTo: dateToIso,
        limit: 100,
      }),
  });

  const isLoading = statsLoading || rowsLoading;
  const isFetching = statsFetching || rowsFetching;

  const refresh = () => {
    void refetchStats();
    void refetchRows();
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard access was blocked.',
        variant: 'destructive',
      });
    }
  };

  const list = rows ?? [];

  return (
    <DeveloperPageShell
      title="Email Logs"
      description="Track all outgoing FarmVault emails across companies and system flows."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={refresh}
      searchPlaceholder="Search company or recipient email…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      {(statsError || rowsError) && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(statsError as Error)?.message ||
            (rowsError as Error)?.message ||
            'Failed to load email logs.'}
        </div>
      )}

      {statsLoading && !stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="fv-card h-24 animate-pulse bg-muted/25 rounded-xl" />
          ))}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="fv-card relative overflow-hidden border-border/80 bg-gradient-to-br from-background via-background to-muted/20">
            <p className="text-xs text-muted-foreground mb-1">Total emails</p>
            <p className="text-2xl font-semibold tracking-tight">{stats.total.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pending pipeline:{' '}
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {stats.pending.toLocaleString()}
              </span>
            </p>
          </div>
          <div className="fv-card border-emerald-500/15 bg-emerald-500/[0.04]">
            <p className="text-xs text-muted-foreground mb-1">Sent</p>
            <p className="text-2xl font-semibold text-emerald-800 dark:text-emerald-300">
              {stats.sent.toLocaleString()}
            </p>
          </div>
          <div className="fv-card border-red-500/15 bg-red-500/[0.04]">
            <p className="text-xs text-muted-foreground mb-1">Failed</p>
            <p className="text-2xl font-semibold text-red-800 dark:text-red-300">
              {stats.failed.toLocaleString()}
            </p>
          </div>
          <div className="fv-card border-sky-500/15 bg-sky-500/[0.05]">
            <p className="text-xs text-muted-foreground mb-1">Today (UTC)</p>
            <p className="text-2xl font-semibold text-sky-900 dark:text-sky-200">
              {stats.today.toLocaleString()}
            </p>
          </div>
          <div className="fv-card border-violet-500/15 bg-violet-500/[0.05]">
            <p className="text-xs text-muted-foreground mb-1">Provider</p>
            <p className="text-lg font-semibold tracking-tight">Resend</p>
            <p className="text-[11px] text-muted-foreground mt-1">Extensible for more providers later.</p>
          </div>
        </div>
      )}

      <div className="fv-card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[140px]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status</p>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as EmailLogStatus | 'all')}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email type</p>
            <Select
              value={emailType}
              onValueChange={(v) => setEmailType(v as FarmVaultEmailTypeFilter)}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {FARMVAULT_EMAIL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatEmailType(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">From (UTC)</p>
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">To (UTC)</p>
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setEmailType('all');
              setStatus('all');
              setSearch('');
            }}
          >
            Clear filters
          </Button>
        </div>

        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Quick type filters
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={emailType === 'all' ? 'default' : 'outline'}
              className="h-8 rounded-full text-xs"
              onClick={() => setEmailType('all')}
            >
              All
            </Button>
            {FARMVAULT_EMAIL_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={emailType === t ? 'default' : 'outline'}
                className="h-8 rounded-full text-xs capitalize"
                onClick={() => setEmailType(t)}
              >
                {formatEmailType(t)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {!isLoading && !rowsError && list.length === 0 && (
        <div className="fv-card flex flex-col items-center justify-center py-16 px-6 text-center border-dashed border-2 border-border/60 bg-muted/5">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No email logs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            When FarmVault sends welcome, billing, or approval emails, each attempt is recorded here with
            delivery status and provider identifiers—so you are never blind to platform email activity.
          </p>
        </div>
      )}

      {list.length > 0 && (
        <div className="fv-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
              <tr>
                <th className="py-3 pl-4 pr-2 text-left font-medium">When</th>
                <th className="py-3 px-2 text-left font-medium">Recipient</th>
                <th className="py-3 px-2 text-left font-medium">Company</th>
                <th className="py-3 px-2 text-left font-medium">Type</th>
                <th className="py-3 px-2 text-left font-medium min-w-[140px]">Subject</th>
                <th className="py-3 px-2 text-left font-medium">Status</th>
                <th className="py-3 px-2 text-left font-medium">Triggered by</th>
                <th className="py-3 px-2 text-left font-medium">Provider ID</th>
                <th className="py-3 pr-4 pl-2 text-right font-medium w-24">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2.5 pl-4 pr-2 whitespace-nowrap text-xs text-muted-foreground">
                    {formatWhen(row.sent_at ?? row.created_at)}
                  </td>
                  <td className="py-2.5 px-2 font-medium text-foreground max-w-[180px] truncate">
                    {row.recipient_email}
                  </td>
                  <td className="py-2.5 px-2 text-muted-foreground max-w-[160px] truncate">
                    {row.company_name ?? '—'}
                  </td>
                  <td className="py-2.5 px-2 capitalize text-xs">{formatEmailType(row.email_type)}</td>
                  <td className="py-2.5 px-2 text-xs text-muted-foreground max-w-[220px] truncate" title={row.subject}>
                    {row.subject}
                  </td>
                  <td className="py-2.5 px-2">
                    <Badge variant="outline" className={statusBadgeClass(row.status)}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-2 text-xs text-muted-foreground max-w-[120px] truncate">
                    {row.triggered_by ?? '—'}
                  </td>
                  <td className="py-2.5 px-2 font-mono text-[11px] text-muted-foreground">
                    {truncateId(row.provider_message_id)}
                  </td>
                  <td className="py-2.5 pr-4 pl-2 text-right">
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDetail(row)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground px-4 py-2 border-t border-border/50">
            Showing {list.length} most recent matching rows (max 100 per query). Refine filters to narrow results.
          </p>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email log detail</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className={statusBadgeClass(detail.status)}>
                  {detail.status}
                </Badge>
              </div>
              <DetailRow label="Recipient" value={detail.recipient_email} />
              <DetailRow label="Company" value={detail.company_name ?? '—'} />
              <DetailRow label="Company ID" value={detail.company_id ?? '—'} mono />
              <DetailRow label="Email type" value={formatEmailType(detail.email_type)} />
              <DetailRow label="Subject" value={detail.subject} />
              <DetailRow label="Triggered by" value={detail.triggered_by ?? '—'} />
              <DetailRow label="Provider" value={detail.provider} />
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Provider message ID</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs break-all bg-muted/50 rounded px-2 py-1 flex-1">
                    {detail.provider_message_id ?? '—'}
                  </code>
                  {detail.provider_message_id ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      onClick={() => void copyText('Provider message ID', detail.provider_message_id!)}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {detail.status === 'failed' && detail.error_message ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <span className="font-semibold">Error</span>
                  <p className="mt-1 whitespace-pre-wrap">{detail.error_message}</p>
                </div>
              ) : null}
              <div>
                <span className="text-muted-foreground text-xs block mb-1">Metadata</span>
                <pre className="text-[11px] leading-relaxed bg-muted/40 rounded-md p-3 overflow-x-auto max-h-48">
                  {JSON.stringify(detail.metadata ?? {}, null, 2)}
                </pre>
              </div>
              <DetailRow label="Created" value={formatWhen(detail.created_at)} />
              <DetailRow label="Sent" value={detail.sent_at ? formatWhen(detail.sent_at) : '—'} />
              <div className="pt-2 border-t border-border/60 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled className="gap-1.5" title="Retry / resend will ship in a future release">
                  <RefreshCw className="h-3.5 w-3.5 opacity-50" />
                  Retry send
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DeveloperPageShell>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={mono ? 'font-mono text-xs break-all' : ''}>{value}</span>
    </div>
  );
}
