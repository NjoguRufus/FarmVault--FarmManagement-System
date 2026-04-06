import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Eye,
  ImageDown,
  LayoutTemplate,
  Loader2,
  Mail,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  createReceiptPdfSignedUrl,
  fetchCompanySubscriptionPeriod,
  fetchPaymentContactForReceiptPreview,
  listReceiptsForCompany,
  listReceiptsForDeveloper,
  regenerateBillingReceipt,
  resendBillingReceiptEmail,
  updateBillingReceiptStatus,
  type BillingReceiptRow,
} from '@/services/receiptsService';
import { fetchPayments } from '@/services/developerService';
import { listCompanySubscriptionPayments } from '@/services/billingSubmissionService';
import {
  billingPeriodRangeLabel,
  latestPaymentByCompany,
  placeholderReceiptTemplateModel,
  receiptTemplateFromDeveloperPayment,
  receiptTemplateFromIssuedReceipt,
  receiptTemplateFromTenantPayment,
} from '@/features/billing/receipt/receiptTemplatePreviewModel';
import {
  BillingReceiptTemplatePreview,
  FV_RECEIPT_TEMPLATE_PREVIEW_ELEMENT_ID,
} from '@/components/subscription/billing/BillingReceiptTemplatePreview';
import { downloadElementAsPng } from '@/lib/pdf/captureChart';

function statusBadge(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s === 'paid') {
    return {
      label: 'PAID',
      className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/25',
    };
  }
  if (s === 'refunded') {
    return {
      label: 'REFUNDED',
      className: 'bg-amber-500/15 text-amber-950 dark:text-amber-200 border-amber-500/25',
    };
  }
  if (s === 'void') {
    return { label: 'VOID', className: 'bg-muted text-muted-foreground border-border' };
  }
  if (s === 'pending') {
    return { label: 'PENDING', className: 'bg-sky-500/10 text-sky-900 dark:text-sky-200 border-sky-500/20' };
  }
  return { label: status.toUpperCase(), className: 'bg-muted' };
}

type BillingReceiptsManagerProps = {
  mode: 'tenant' | 'developer';
  companyId?: string | null;
  /** Workspace display name (tenant) — used in sample / preview text. */
  workspaceName?: string | null;
  /** Company billing email from workspace record; receipt preview falls back to signed-in user when empty. */
  tenantCompanyEmail?: string | null;
  /** Signed-in user (tenant) — email / name for preview when payer details are incomplete. */
  tenantUserEmail?: string | null;
  tenantUserName?: string | null;
  getAccessToken?: () => Promise<string | null>;
  /** Open this receipt once after the list has loaded (e.g. email deep link). */
  initialReceiptId?: string | null;
  onInitialReceiptHandled?: () => void;
};

const SAMPLE_KEY = '__sample__';

export function BillingReceiptsManager({
  mode,
  companyId,
  workspaceName,
  tenantCompanyEmail,
  tenantUserEmail,
  tenantUserName,
  getAccessToken,
  initialReceiptId,
  onInitialReceiptHandled,
}: BillingReceiptsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [preview, setPreview] = useState<BillingReceiptRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImageSaving, setPreviewImageSaving] = useState(false);
  const initialHandledRef = useRef(false);

  /** Developer: fill template from latest approved payment for this company (confirmed). */
  const [previewCompanyKey, setPreviewCompanyKey] = useState<string>(SAMPLE_KEY);
  /** When set, template mirrors this issued receipt row. */
  const [pinnedIssuedReceipt, setPinnedIssuedReceipt] = useState<BillingReceiptRow | null>(null);
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<
    'all' | 'paid' | 'refunded' | 'void' | 'pending'
  >('all');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    initialHandledRef.current = false;
  }, [initialReceiptId]);

  useEffect(() => {
    setPinnedIssuedReceipt(null);
  }, [previewCompanyKey]);

  const listQuery = useQuery({
    queryKey:
      mode === 'tenant'
        ? ['billing-receipts', 'company', companyId]
        : ['billing-receipts', 'developer', debounced],
    enabled: mode === 'tenant' ? !!companyId : true,
    queryFn: () =>
      mode === 'tenant'
        ? listReceiptsForCompany(companyId!)
        : listReceiptsForDeveloper(debounced || undefined),
  });

  const confirmedPaymentsQuery = useQuery({
    queryKey: ['billing-receipts', 'confirmed-payments-companies'],
    enabled: mode === 'developer',
    queryFn: async () => {
      const { rows } = await fetchPayments({
        status: 'approved',
        limit: 800,
        offset: 0,
      });
      return rows;
    },
  });

  const tenantPaymentsQuery = useQuery({
    queryKey: ['billing-receipts', 'tenant-payments', companyId],
    enabled: mode === 'tenant' && !!companyId,
    queryFn: () => listCompanySubscriptionPayments(companyId!),
  });

  const tenantSubPeriodQuery = useQuery({
    queryKey: ['billing-receipt-tenant-sub-period', companyId],
    enabled: mode === 'tenant' && !!companyId && !pinnedIssuedReceipt,
    queryFn: () => fetchCompanySubscriptionPeriod(companyId!),
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const paymentByCompany = useMemo(
    () => latestPaymentByCompany(confirmedPaymentsQuery.data ?? []),
    [confirmedPaymentsQuery.data],
  );

  const devPreviewPay =
    mode === 'developer' && previewCompanyKey !== SAMPLE_KEY
      ? paymentByCompany.get(previewCompanyKey) ?? null
      : null;

  const devTemplateExtrasQuery = useQuery({
    queryKey: ['billing-receipt-template-extras', devPreviewPay?.id, previewCompanyKey],
    enabled: !!devPreviewPay?.id && previewCompanyKey !== SAMPLE_KEY,
    queryFn: async () => {
      const pay = devPreviewPay!;
      const cid = previewCompanyKey;
      const [contact, period] = await Promise.all([
        fetchPaymentContactForReceiptPreview(pay.id, cid),
        fetchCompanySubscriptionPeriod(cid),
      ]);
      return { contact, period };
    },
  });

  const confirmedCompanyOptions = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    for (const [id, pay] of paymentByCompany.entries()) {
      out.push({ id, name: pay.company_name ?? id });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [paymentByCompany]);

  const latestTenantApproved = useMemo(() => {
    const list = tenantPaymentsQuery.data ?? [];
    const approved = list.filter((p) => String(p.status).toLowerCase() === 'approved');
    if (approved.length === 0) return null;
    return approved.find((p) => p.ledger_source !== 'mpesa_stk') ?? approved[0];
  }, [tenantPaymentsQuery.data]);

  const templateModel = useMemo(() => {
    if (pinnedIssuedReceipt) {
      return receiptTemplateFromIssuedReceipt(pinnedIssuedReceipt);
    }
    if (mode === 'developer') {
      if (previewCompanyKey === SAMPLE_KEY) {
        return placeholderReceiptTemplateModel({ workspaceName: 'Sample workspace' });
      }
      const pay = paymentByCompany.get(previewCompanyKey);
      if (pay) {
        const ex = devTemplateExtrasQuery.data;
        const bp =
          ex?.period?.current_period_start && ex?.period?.current_period_end
            ? billingPeriodRangeLabel(ex.period.current_period_start, ex.period.current_period_end)
            : undefined;
        const adminName =
          ex?.contact?.reviewer_full_name?.trim() ||
          ex?.contact?.mpesa_name?.trim() ||
          undefined;
        const email =
          ex?.contact?.reviewer_email?.trim() ||
          ex?.contact?.fallback_member_email?.trim() ||
          undefined;
        const phone = ex?.contact?.mpesa_phone?.trim() || undefined;
        return receiptTemplateFromDeveloperPayment(pay, {
          billingPeriod: bp,
          adminName,
          email,
          phone,
        });
      }
      return placeholderReceiptTemplateModel({ workspaceName: 'Sample workspace' });
    }
    if (latestTenantApproved) {
      const sub = tenantSubPeriodQuery.data;
      const bp =
        sub?.current_period_start && sub?.current_period_end
          ? billingPeriodRangeLabel(sub.current_period_start, sub.current_period_end)
          : undefined;
      const companyEm = tenantCompanyEmail?.trim();
      const userEm = tenantUserEmail?.trim();
      return receiptTemplateFromTenantPayment(latestTenantApproved, workspaceName, {
        billingPeriod: bp,
        contactEmail: companyEm || userEm || undefined,
        contactName: tenantUserName?.trim() || undefined,
      });
    }
    return placeholderReceiptTemplateModel({ workspaceName });
  }, [
    pinnedIssuedReceipt,
    mode,
    previewCompanyKey,
    paymentByCompany,
    latestTenantApproved,
    workspaceName,
    devTemplateExtrasQuery.data,
    tenantSubPeriodQuery.data,
    tenantCompanyEmail,
    tenantUserEmail,
    tenantUserName,
  ]);

  const displayRows = useMemo(() => {
    let r = rows;
    if (mode === 'developer' && previewCompanyKey !== SAMPLE_KEY) {
      r = r.filter((x) => x.company_id === previewCompanyKey);
    }
    if (receiptStatusFilter !== 'all') {
      r = r.filter((x) => String(x.status).toLowerCase() === receiptStatusFilter);
    }
    return r;
  }, [rows, mode, previewCompanyKey, receiptStatusFilter]);

  const openPreview = useCallback(async (row: BillingReceiptRow) => {
    setPreview(row);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const url = await createReceiptPdfSignedUrl(row.pdf_storage_path, 600);
      setPreviewUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load PDF';
      toast({ variant: 'destructive', title: 'Receipt', description: msg });
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!initialReceiptId || initialHandledRef.current) return;
    if (listQuery.isLoading || listQuery.isFetching) return;
    if (listQuery.isError) {
      initialHandledRef.current = true;
      toast({
        variant: 'destructive',
        title: 'Receipt',
        description: (listQuery.error as Error)?.message ?? 'Could not load receipts',
      });
      onInitialReceiptHandled?.();
      return;
    }
    const hit = rows.find((r) => r.id === initialReceiptId);
    initialHandledRef.current = true;
    if (hit) {
      void openPreview(hit);
    } else {
      toast({
        title: 'Receipt not found',
        description: 'This link may be invalid or the receipt may belong to another workspace.',
      });
    }
    onInitialReceiptHandled?.();
  }, [
    initialReceiptId,
    listQuery.isLoading,
    listQuery.isFetching,
    listQuery.isError,
    listQuery.error,
    rows,
    openPreview,
    onInitialReceiptHandled,
    toast,
  ]);

  const resendMut = useMutation({
    mutationFn: (id: string) => resendBillingReceiptEmail(id, getAccessToken),
    onSuccess: () => {
      toast({ title: 'Email sent', description: 'Receipt email was queued for delivery.' });
      void queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Resend failed', description: e.message });
    },
  });

  const regenMut = useMutation({
    mutationFn: (id: string) => regenerateBillingReceipt(id, { sendEmail: false }, getAccessToken),
    onSuccess: () => {
      toast({ title: 'Receipt regenerated', description: 'PDF was rebuilt and saved.' });
      void queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Regenerate failed', description: e.message });
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'refunded' | 'void' | 'paid' }) =>
      updateBillingReceiptStatus(id, status),
    onSuccess: () => {
      toast({ title: 'Receipt updated' });
      void queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    },
  });

  const printReceiptLayout = useCallback(() => {
    window.print();
  }, []);

  const saveDeveloperReceiptPng = useCallback(async () => {
    const el = document.getElementById(FV_RECEIPT_TEMPLATE_PREVIEW_ELEMENT_ID);
    if (!el) {
      toast({ variant: 'destructive', title: 'Receipt', description: 'Receipt is not on screen.' });
      return;
    }
    setPreviewImageSaving(true);
    try {
      const raw = templateModel.receiptNumber.trim() || 'receipt';
      const safe = raw.replace(/[^\w.-]+/g, '_').slice(0, 72) || 'receipt';
      await downloadElementAsPng(el as HTMLElement, `FarmVault-receipt-printcopy-${safe}.png`);
      toast({
        title: 'Image saved',
        description: 'PNG matches the receipt card (no sample notice). Use Print for paper.',
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not save image',
        description: e instanceof Error ? e.message : 'Capture failed',
      });
    } finally {
      setPreviewImageSaving(false);
    }
  }, [templateModel.receiptNumber, toast]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        {/* Template designer / preview — always visible */}
        <div className="space-y-2 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Receipt template</h3>
              <p className="text-xs text-muted-foreground">
                Live layout matches issued PDFs. Use filters to fill fields from confirmed payments.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 gap-1 text-xs"
                title="Print this receipt on one page (compact layout, colours). Enable background graphics in the print dialog if colours are missing."
                onClick={() => printReceiptLayout()}
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              {mode === 'developer' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  disabled={previewImageSaving}
                  title="Save the receipt card as PNG (same layout as print; excludes the sample notice above the card)"
                  onClick={() => void saveDeveloperReceiptPng()}
                >
                  {previewImageSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageDown className="h-3.5 w-3.5" />
                  )}
                  Save PNG
                </Button>
              ) : null}
              {pinnedIssuedReceipt ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() =>
                      void (async () => {
                        try {
                          const url = await createReceiptPdfSignedUrl(pinnedIssuedReceipt.pdf_storage_path, 600);
                          window.open(url, '_blank', 'noopener,noreferrer');
                        } catch (e) {
                          toast({
                            variant: 'destructive',
                            title: 'Download',
                            description: e instanceof Error ? e.message : 'Failed',
                          });
                        }
                      })()
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPinnedIssuedReceipt(null)}>
                    Clear pin
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <BillingReceiptTemplatePreview model={templateModel} />
        </div>

        <div className="space-y-3">
          {mode === 'developer' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Confirmed company (template)</Label>
                <Select value={previewCompanyKey} onValueChange={setPreviewCompanyKey}>
                  <SelectTrigger className="h-10 text-left text-sm">
                    <SelectValue placeholder="Choose company" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value={SAMPLE_KEY}>Sample layout (placeholders)</SelectItem>
                    {confirmedPaymentsQuery.isLoading ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">Loading companies…</div>
                    ) : confirmedCompanyOptions.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">No approved payments yet</div>
                    ) : (
                      confirmedCompanyOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Only companies with at least one approved subscription payment appear here.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Receipt list status</Label>
                <Select
                  value={receiptStatusFilter}
                  onValueChange={(v) =>
                    setReceiptStatusFilter(v as 'all' | 'paid' | 'refunded' | 'void' | 'pending')
                  }
                >
                  <SelectTrigger className="h-10 text-left text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground sm:max-w-xl">
                {latestTenantApproved
                  ? 'Template is filled from your latest confirmed payment. Use Pin on a row below to mirror an issued receipt.'
                  : 'No confirmed payment yet — template shows sample values. After payment is approved, details appear here automatically.'}
              </div>
              <div className="w-full space-y-1.5 sm:w-52">
                <Label className="text-xs font-medium text-muted-foreground">Receipt status</Label>
                <Select
                  value={receiptStatusFilter}
                  onValueChange={(v) =>
                    setReceiptStatusFilter(v as 'all' | 'paid' | 'refunded' | 'void' | 'pending')
                  }
                >
                  <SelectTrigger className="h-10 text-left text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {mode === 'developer' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Search issued receipts by company, number, or email.
              </p>
              <Input
                placeholder="Search receipts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:max-w-xs"
              />
            </div>
          ) : null}

          <div className="fv-card overflow-x-auto">
            {listQuery.isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading receipts…
              </div>
            ) : listQuery.isError ? (
              <p className="p-6 text-sm text-destructive">
                {(listQuery.error as Error)?.message ?? 'Failed to load receipts'}
              </p>
            ) : displayRows.length === 0 ? (
              <div className="space-y-2 p-6 text-sm text-muted-foreground">
                <p>No rows match the current filters (or no receipts issued yet).</p>
                <p className="text-xs">
                  The receipt template on the left stays visible so you can review branding and layout anytime.
                </p>
              </div>
            ) : (
              <table className="fv-table-mobile w-full min-w-[760px] text-sm">
                <thead className="border-b border-border/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left font-medium">Receipt</th>
                    <th className="py-2 text-left font-medium">Company / customer</th>
                    <th className="py-2 text-left font-medium">Amount</th>
                    <th className="py-2 text-left font-medium">Method</th>
                    <th className="py-2 text-left font-medium">Issued</th>
                    <th className="py-2 text-left font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => {
                    const st = statusBadge(String(r.status));
                    const method =
                      String(r.payment_method).toLowerCase() === 'mpesa_stk'
                        ? 'M-Pesa STK'
                        : 'Manual';
                    return (
                      <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                        <td className="py-3 pr-3 font-mono text-xs">{r.receipt_number}</td>
                        <td className="max-w-[200px] py-3 pr-3">
                          <div className="truncate font-medium text-foreground">
                            {r.company_name_snapshot ?? '—'}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {r.admin_name_snapshot ?? r.customer_email ?? '—'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 tabular-nums">
                          {r.currency} {Number(r.amount).toLocaleString()}
                        </td>
                        <td className="py-3 pr-3 text-xs">{method}</td>
                        <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted-foreground">
                          {r.issued_at ? format(parseISO(r.issued_at), 'PP') : '—'}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant="outline" className={cn('font-semibold uppercase', st.className)}>
                            {st.label}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              className="gap-1"
                              title="Show on template"
                              onClick={() => setPinnedIssuedReceipt(r)}
                            >
                              <LayoutTemplate className="h-3.5 w-3.5" />
                              Pin
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              className="gap-1"
                              onClick={() => void openPreview(r)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              className="gap-1"
                              onClick={() =>
                                void (async () => {
                                  try {
                                    const url = await createReceiptPdfSignedUrl(r.pdf_storage_path, 600);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  } catch (e) {
                                    toast({
                                      variant: 'destructive',
                                      title: 'Download',
                                      description: e instanceof Error ? e.message : 'Failed',
                                    });
                                  }
                                })()
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              className="gap-1"
                              onClick={() =>
                                void (async () => {
                                  try {
                                    const url = await createReceiptPdfSignedUrl(r.pdf_storage_path, 600);
                                    const w = window.open(url, '_blank', 'noopener,noreferrer');
                                    w?.addEventListener('load', () => w.print(), { once: true });
                                  } catch (e) {
                                    toast({
                                      variant: 'destructive',
                                      title: 'Print',
                                      description: e instanceof Error ? e.message : 'Failed',
                                    });
                                  }
                                })()
                              }
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              className="gap-1"
                              disabled={!r.customer_email || resendMut.isPending}
                              onClick={() => resendMut.mutate(r.id)}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Email
                            </Button>
                            {mode === 'developer' ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" size="xs" variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem
                                    disabled={regenMut.isPending}
                                    onClick={() => regenMut.mutate(r.id)}
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Regenerate PDF
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={statusMut.isPending}
                                    onClick={() => statusMut.mutate({ id: r.id, status: 'refunded' })}
                                  >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Mark refunded
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={statusMut.isPending}
                                    onClick={() => statusMut.mutate({ id: r.id, status: 'void' })}
                                  >
                                    <Ban className="mr-2 h-4 w-4" />
                                    Void receipt
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={statusMut.isPending || String(r.status).toLowerCase() === 'paid'}
                                    onClick={() => statusMut.mutate({ id: r.id, status: 'paid' })}
                                  >
                                    Mark paid
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) {
            setPreview(null);
            setPreviewUrl(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle className="font-mono text-base">
              {preview?.receipt_number ?? 'Receipt'}
            </DialogTitle>
          </DialogHeader>
          <div className="h-[min(72vh,720px)] w-full bg-muted/30">
            {previewLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading PDF…
              </div>
            ) : previewUrl ? (
              <iframe title="Receipt PDF" src={previewUrl} className="h-full w-full border-0" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
