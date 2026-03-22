import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCopy, Mail, RefreshCw, Send, X } from 'lucide-react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { invokeSendFarmVaultEmail } from '@/lib/email';
import type { SendFarmVaultEmailPayload } from '@/lib/email/types';
import {
  FARMVAULT_EMAIL_TYPES,
  fetchEmailLogStats,
  fetchEmailLogs,
  type EmailLogRow,
  type EmailLogStatus,
  type FarmVaultEmailTypeFilter,
} from '@/services/emailLogService';

const MANUAL_CATEGORIES = [
  { value: '_none', label: 'None' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'appreciation', label: 'Appreciation' },
  { value: 'support', label: 'Support' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'other', label: 'Other' },
] as const;

const BODY_PRESETS = {
  pilot: {
    subject: 'Thank you for piloting FarmVault',
    category: 'appreciation' as const,
    body:
      'We truly appreciate you taking the time to try FarmVault during the pilot. Your feedback helps us build a calmer, clearer tool for farms like yours.\n\nIf anything felt unclear or you have suggestions, just reply to this email — we are listening.\n\nWarm regards,\nThe FarmVault team',
  },
  launch: {
    subject: 'FarmVault update',
    category: 'announcement' as const,
    body:
      'We have an update we think you will want to know about.\n\n[Add your launch news here.]\n\nThank you for being part of the FarmVault community.',
  },
  support: {
    subject: 'Following up on your FarmVault request',
    category: 'support' as const,
    body:
      'Hello,\n\nFollowing up on your recent message about FarmVault.\n\n[Add your response here.]\n\nWe are here if you need anything else.',
  },
};

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

const EMAIL_TYPE_LABELS: Record<string, string> = {
  custom_manual: 'Manual send',
  submission_received: 'Submission received',
  submission_admin_notify: 'Submission (admin)',
  workspace_ready: 'Workspace ready',
  company_approved: 'Company approved',
};

function formatEmailType(t: string): string {
  return EMAIL_TYPE_LABELS[t] ?? t.replace(/_/g, ' ');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ManualRecipientRow = {
  id: string;
  email: string;
  name: string;
};

function newRecipientRow(): ManualRecipientRow {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    email: '',
    name: '',
  };
}

/** Non-empty rows only; valid emails; de-dupe by lowercase email (first row wins). */
function buildManualRecipientSendList(rows: ManualRecipientRow[]): { email: string; name?: string }[] {
  const seen = new Set<string>();
  const out: { email: string; name?: string }[] = [];
  for (const row of rows) {
    const raw = row.email.trim();
    if (!raw) continue;
    if (!EMAIL_RE.test(raw)) {
      throw new Error(`Invalid email: ${raw}`);
    }
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = row.name.trim();
    out.push({ email: raw, ...(name ? { name } : {}) });
  }
  return out;
}

export default function DeveloperEmailCenterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'send' | 'logs'>('logs');

  const [search, setSearch] = useState('');
  const [emailType, setEmailType] = useState<FarmVaultEmailTypeFilter>('all');
  const [status, setStatus] = useState<EmailLogStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<EmailLogRow | null>(null);

  const [recipients, setRecipients] = useState<ManualRecipientRow[]>(() => [newRecipientRow()]);
  const [companyNameField, setCompanyNameField] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('_none');
  /** When false, payload sends `showQrCode: false` (manual emails default to QR on server-side). */
  const [includeShareQr, setIncludeShareQr] = useState(true);

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
    queryKey: ['developer', 'email-center-stats'],
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
      'email-center-logs',
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

  const logsLoading = statsLoading || rowsLoading;
  const logsFetching = statsFetching || rowsFetching;

  const refresh = () => {
    void refetchStats();
    void refetchRows();
  };

  type ManualBatchSendResult = {
    attempted: number;
    succeeded: number;
    failed: number;
  };

  const sendMutation = useMutation({
    mutationFn: async (): Promise<ManualBatchSendResult> => {
      const subjectTrim = subject.trim();
      const bodyTrim = body.trim();

      if (!subjectTrim) {
        throw new Error('Subject is required.');
      }
      if (!bodyTrim) {
        throw new Error('Message is required.');
      }

      let list: { email: string; name?: string }[];
      try {
        list = buildManualRecipientSendList(recipients);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(msg);
      }

      if (list.length === 0) {
        throw new Error('Add at least one recipient with a valid email.');
      }

      let succeeded = 0;
      let failed = 0;

      for (const recipient of list) {
        const payload: SendFarmVaultEmailPayload = {
          emailType: 'custom_manual',
          to: recipient.email,
          subject: subjectTrim,
          data: {
            subject: subjectTrim,
            body: bodyTrim,
            ...(recipient.name ? { recipientName: recipient.name } : {}),
            ...(category !== '_none' ? { category } : {}),
            ...(!includeShareQr ? { showQrCode: false as const } : {}),
          },
          ...(companyNameField.trim() ? { companyName: companyNameField.trim() } : {}),
          triggeredBy: 'developer_manual_send',
        };

        const result = await invokeSendFarmVaultEmail(payload);
        if (result.ok) {
          succeeded += 1;
        } else {
          failed += 1;
          console.error('Manual email send error', recipient.email, result);
        }
      }

      return { attempted: list.length, succeeded, failed };
    },
    onSuccess: (batch) => {
      void queryClient.invalidateQueries({ queryKey: ['developer', 'email-center-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['developer', 'email-center-logs'] });

      if (batch.failed === 0) {
        toast({
          title: 'Emails sent',
          description: `Emails sent to ${batch.succeeded} recipient${batch.succeeded === 1 ? '' : 's'}.`,
        });
        if (batch.succeeded > 0) {
          setBody('');
        }
        return;
      }

      if (batch.succeeded === 0) {
        toast({
          title: 'Send failed',
          description: `All ${batch.attempted} send${batch.attempted === 1 ? '' : 's'} failed. Check Logs for details.`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Partially sent',
        description: `Sent to ${batch.succeeded} recipient${batch.succeeded === 1 ? '' : 's'}, ${batch.failed} failed.`,
        variant: 'destructive',
      });
    },
    onError: (err: unknown) => {
      console.error('Manual email send error', err);
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Send failed', description: message, variant: 'destructive' });
    },
  });

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

  const applyPreset = (key: keyof typeof BODY_PRESETS) => {
    const p = BODY_PRESETS[key];
    setSubject(p.subject);
    setBody(p.body);
    setCategory(p.category);
  };

  const clearDraft = () => {
    setRecipients([newRecipientRow()]);
    setCompanyNameField('');
    setSubject('');
    setBody('');
    setCategory('_none');
    setIncludeShareQr(true);
  };

  const addRecipientRow = () => {
    setRecipients((prev) => [...prev, newRecipientRow()]);
  };

  const removeRecipientRow = (id: string) => {
    setRecipients((prev) => {
      if (prev.length <= 1) {
        return [newRecipientRow()];
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const updateRecipientRow = (id: string, patch: Partial<Pick<ManualRecipientRow, 'email' | 'name'>>) => {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const canSend = useMemo(() => {
    if (subject.trim().length === 0 || body.trim().length === 0) return false;
    try {
      return buildManualRecipientSendList(recipients).length > 0;
    } catch {
      return false;
    }
  }, [recipients, subject, body]);

  return (
    <DeveloperPageShell
      title="Email Center"
      description="Compose one-off FarmVault emails and browse every outbound message—manual sends use the same pipeline and logging as workspace-ready and other transactional mail."
      isLoading={tab === 'logs' ? logsLoading : false}
      isRefetching={tab === 'logs' ? logsFetching : false}
      onRefresh={tab === 'logs' ? refresh : undefined}
      searchPlaceholder={tab === 'logs' ? 'Search company or recipient email…' : undefined}
      searchValue={tab === 'logs' ? search : undefined}
      onSearchChange={tab === 'logs' ? setSearch : undefined}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'send' | 'logs')} className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-2 h-11 p-1 rounded-xl bg-muted/70 ring-1 ring-border/60">
          <TabsTrigger value="send" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Send className="h-3.5 w-3.5" />
            Send email
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Mail className="h-3.5 w-3.5" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-0 space-y-6 outline-none">
          <div className="fv-card border-primary/15 bg-gradient-to-br from-background via-background to-primary/[0.04] shadow-sm space-y-6 p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Manual send</h2>
                  <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider">
                    Developer
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                  Deliver to any valid address with the same branded shell and Resend path as other FarmVault mail.
                  Messages are plain text in the editor; the server formats paragraphs for the template. Each send is
                  recorded in Logs as a manual developer send.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Quick fill</span>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset('pilot')}>
                  Pilot appreciation
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset('launch')}>
                  Launch update
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset('support')}>
                  Support follow-up
                </Button>
              </div>
            </div>

            <Separator className="bg-border/70" />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-3 sm:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <Label className="text-foreground">Recipients</Label>
                  <p className="text-xs text-muted-foreground">
                    Empty rows are ignored. Duplicate addresses are sent once.
                  </p>
                </div>
                <div className="space-y-3">
                  {recipients.map((row, index) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-end sm:gap-2 sm:p-2 sm:pr-1"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`ec-to-${row.id}`} className="text-xs text-muted-foreground">
                          Email {recipients.length > 1 ? `(${index + 1})` : ''}
                        </Label>
                        <Input
                          id={`ec-to-${row.id}`}
                          type="email"
                          autoComplete="email"
                          placeholder="recipient@example.com"
                          value={row.email}
                          onChange={(e) => updateRecipientRow(row.id, { email: e.target.value })}
                          className="h-10"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`ec-name-${row.id}`} className="text-xs text-muted-foreground">
                          Name (optional)
                        </Label>
                        <Input
                          id={`ec-name-${row.id}`}
                          placeholder="Greeting name"
                          value={row.name}
                          onChange={(e) => updateRecipientRow(row.id, { name: e.target.value })}
                          className="h-10"
                        />
                      </div>
                      <div className="flex shrink-0 justify-end sm:pb-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRecipientRow(row.id)}
                          aria-label={recipients.length <= 1 ? 'Clear recipient row' : 'Remove recipient'}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={addRecipientRow}>
                  Add recipient
                </Button>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ec-company">Company (optional)</Label>
                <Input
                  id="ec-company"
                  placeholder="Stored on the log row for reference"
                  value={companyNameField}
                  onChange={(e) => setCompanyNameField(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ec-subject">Subject</Label>
                <Input
                  id="ec-subject"
                  placeholder="Subject line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2 sm:col-span-2 sm:max-w-xs">
                <Label>Category (optional)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/15 p-3 sm:col-span-2">
                <Checkbox
                  id="ec-share-qr"
                  checked={includeShareQr}
                  onCheckedChange={(v) => setIncludeShareQr(v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="ec-share-qr" className="text-sm font-medium leading-snug cursor-pointer">
                    Include share QR code
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Adds a centered QR after your message so recipients can share FarmVault with someone else (before
                    support and footer). Uncheck for a shorter email.
                  </p>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ec-body">Message</Label>
                <Textarea
                  id="ec-body"
                  placeholder="Write in plain text. Empty lines start a new paragraph in the email."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="min-h-[220px] resize-y text-[15px] leading-relaxed"
                />
              </div>
            </div>

            <Separator className="bg-border/70" />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={!canSend || sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                  className="gap-2 min-w-[148px]"
                >
                  {sendMutation.isPending ? (
                    'Sending…'
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send email
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={clearDraft}>
                  Clear draft
                </Button>
              </div>
              <p className="text-xs text-muted-foreground max-w-md sm:text-right">
                Clerk session required; developer role enforced on the server. Resend delivers the message.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-0 space-y-6 outline-none">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Outbound history</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Filter and inspect rows written by Resend and edge functions—including manual sends.
              </p>
            </div>
          </div>

          {(statsError || rowsError) && (
            <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
              {(statsError as Error)?.message ||
                (rowsError as Error)?.message ||
                'Failed to load email history.'}
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
                <p className="text-[11px] text-muted-foreground mt-1">Includes manual sends from this console.</p>
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

          {!logsLoading && !rowsError && list.length === 0 && (
            <div className="fv-card flex flex-col items-center justify-center py-16 px-6 text-center border-dashed border-2 border-border/60 bg-muted/5">
              <div className="rounded-full bg-primary/10 p-4 mb-4">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">No matching rows</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                Adjust filters or send a message from the Send Email tab — every attempt is recorded here.
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
        </TabsContent>
      </Tabs>

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
