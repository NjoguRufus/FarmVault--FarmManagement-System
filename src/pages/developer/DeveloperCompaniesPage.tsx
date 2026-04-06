import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { fetchDeveloperCompanies, fetchMpesaStkPaymentsForDeveloper, type MpesaStkPaymentRow } from '@/services/developerService';
import {
  buildLatestSdkMpesaByCompany,
  formatPaymentRelativeDay,
  mpesaRowIsSdkSuccess,
  resolveLatestCompanyPayment,
} from '@/features/developer/subscriptionPaymentSource';
import {
  overrideSubscription,
  deleteCompanySafely,
  updateCompanySubscriptionState,
  listDuplicateEmails,
  fetchCompanyWorkspaceNotifyPayload,
  type OverrideMode,
  extendCompanyTrial,
} from '@/services/developerAdminService';
import { getSupabaseAccessToken } from '@/lib/supabase';
import { invokeNotifyCompanyWorkspaceReady } from '@/lib/email';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { Button } from '@/components/ui/button';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Clock,
  Gift,
  Users,
  Beaker,
  XCircle,
  Crown,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  XOctagon,
  Copy,
  Search,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  computeCompanyStatus,
  companyStatusAccessLabel,
  companyStatusBadgeClass,
  type CompanyStatus,
} from '@/lib/subscription/companyStatus';
import { setCompanyPaidAccess } from '@/services/developerService';
import { useSearchParams } from 'react-router-dom';
import { useNow } from '@/hooks/useNow';

type LatestSubscriptionPayment = {
  id?: string;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  plan_id?: string | null;
  billing_cycle?: string | null;
  payment_method?: string | null;
  submitted_at?: string | null;
  mpesa_name?: string | null;
  transaction_code?: string | null;
};

type CompanyRow = {
  company_id?: string;
  id?: string;
  company_name?: string | null;
  name?: string | null;
  created_at?: string | null;
  users_count?: number | null;
  employees_count?: number | null;
  /** Snapshot on core.companies (e.g. pending, trialing). */
  company_subscription_status?: string | null;
  access_level?: string | null;
  onboarding_completed?: boolean | null;
  company_trial_started_at?: string | null;
  subscription_status?: string | null;
  plan?: string | null;
  plan_code?: string | null; // legacy field still present in RPC payloads
  billing_mode?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  active_until?: string | null;
  payment_confirmed?: boolean | null;
  latest_subscription_payment?: LatestSubscriptionPayment | null;
  company_status?: string | null;
  override?: {
    enabled?: boolean;
    mode?: string;
    note?: string;
    reason?: string;
    expires_at?: string;
  } | null;
  subscription?: {
    plan?: string | null;
    status?: string | null;
    trial_end?: string | null;
    period_end?: string | null;
    is_trial?: boolean | null;
  } | null;
};

/**
 * Subscription status line in "Plan & trial" — must match resolved access, not stale DB snapshot
 * (e.g. company_subscriptions can still say trialing after STK pay until backfill).
 */
function developerVisibleSubscriptionStatus(c: CompanyRow, computedStatus: CompanyStatus): string {
  switch (computedStatus) {
    case 'pro_active':
    case 'basic_active':
      return 'active';
    case 'suspended':
      return (c.company_subscription_status ?? c.subscription_status ?? 'suspended').toString();
    case 'trial_active':
      return 'trialing';
    case 'trial_expired':
      return 'trial expired';
    case 'subscription_expired':
      return 'expired';
    case 'payment_pending':
      return 'payment pending';
    case 'pending_confirmation':
      return 'pending approval';
    default:
      return (c.company_subscription_status ?? c.subscription_status ?? '—').toString() || '—';
  }
}

function computeResolvedStatus(c: CompanyRow, now: Date, latestSdk?: MpesaStkPaymentRow | undefined): CompanyStatus {
  const suspended =
    String(c.subscription_status ?? '').trim().toLowerCase() === 'suspended' ||
    String(c.company_status ?? '').trim().toLowerCase() === 'suspended';
  const plan =
    (c.plan ?? null) ??
    (c.plan_code ?? null) ??
    (c.subscription?.plan ?? null);
  const isTrial = c.is_trial === true || c.subscription?.is_trial === true;
  const subscriptionStatus =
    (c.subscription_status as string | null | undefined) ??
    (c.subscription?.status as string | null | undefined);
  const stkOk = latestSdk != null && mpesaRowIsSdkSuccess(latestSdk);
  return computeCompanyStatus({
    suspended,
    has_confirmed_stk_payment: stkOk,
    pending_confirmation: (c as any).pending_confirmation ?? null,
    plan,
    payment_confirmed: c.payment_confirmed === true || stkOk,
    active_until: (c.active_until as string | null | undefined) ?? (c.subscription?.period_end as string | null | undefined),
    trial_ends_at: (c.trial_ends_at as string | null | undefined) ?? (c.subscription?.trial_end as string | null | undefined),
    is_trial: isTrial,
    subscription_status: subscriptionStatus,
  }, now);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function isNewCompany(createdAt?: string | null, daysWindow: number = 7): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= daysWindow;
}

export default function DeveloperCompaniesPage() {
  const now = useNow(60_000);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'rejected' | 'approved' | 'pending_approval'>('all');
  const [overrideFilter, setOverrideFilter] = useState<'all' | 'overridden' | 'pilot' | 'collaborator' | 'free_access' | 'trial_override'>('all');
  const [newOnly, setNewOnly] = useState(false);
  const [newWindowDays, setNewWindowDays] = useState<3 | 7 | 14>(7);
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'manual' | 'sdk'>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const subscriptionFilter = (searchParams.get('subscription') || '').toLowerCase();
  const { activeCompanyId } = useActiveCompany();
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    company: CompanyRow | null;
    confirmValue: string;
  }>({ open: false, company: null, confirmValue: '' });
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean;
    company: CompanyRow | null;
    mode: OverrideMode | null;
    days: number;
    planCode: 'basic' | 'pro';
    reason: string;
  }>({
    open: false,
    company: null,
    mode: null,
    days: 7,
    planCode: 'pro',
    reason: '',
  });

  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    company: CompanyRow | null;
    kind: 'suspend' | 'set_plan_pro' | 'set_plan_basic';
  }>({ open: false, company: null, kind: 'suspend' });

  const [paidAccessModal, setPaidAccessModal] = useState<{
    open: boolean;
    company: CompanyRow | null;
    plan: 'basic' | 'pro';
    months: 1 | 2 | 3;
  }>({ open: false, company: null, plan: 'pro', months: 1 });

  const [extendTrialModal, setExtendTrialModal] = useState<{
    open: boolean;
    company: CompanyRow | null;
    days: 7 | 14 | 30;
  }>({ open: false, company: null, days: 7 });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { user, isDeveloper } = useAuth();

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'companies'],
    queryFn: () => fetchDeveloperCompanies({ limit: 200, offset: 0 }),
  });

  const { data: mpesaStkRows = [] } = useQuery({
    queryKey: ['developer', 'mpesa-stk'],
    queryFn: fetchMpesaStkPaymentsForDeveloper,
    staleTime: 60_000,
  });

  const sdkByCompany = useMemo(() => buildLatestSdkMpesaByCompany(mpesaStkRows), [mpesaStkRows]);

  const companies = (data?.items ?? []) as CompanyRow[];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((c) => {
      const name = (c.company_name ?? c.name ?? '').toLowerCase();
      const plan = (c.plan_code ?? '').toLowerCase();
      const status = (c.subscription_status ?? '').toLowerCase();
      const id = (c.company_id ?? c.id ?? '').toLowerCase();
      const companyId = String(c.company_id ?? c.id ?? '');
      const mode = (c.override?.mode ?? '').toLowerCase();
      const hasOverride = Boolean(c.override?.enabled);
      const computedStatus = computeResolvedStatus(c, now, sdkByCompany.get(companyId));

      if (statusFilter !== 'all') {
        if (statusFilter === 'approved') {
          if (!['active', 'trialing'].includes(status)) return false;
        } else if (status !== statusFilter) {
          return false;
        }
      }

      if (subscriptionFilter === 'payment_required') {
        if (computedStatus !== 'trial_expired') return false;
      }

      if (overrideFilter !== 'all') {
        if (overrideFilter === 'overridden' && !hasOverride) return false;
        if (overrideFilter === 'pilot' && mode !== 'pilot') return false;
        if (overrideFilter === 'collaborator' && mode !== 'collaborator') return false;
        if (overrideFilter === 'free_access' && !['free_forever', 'free_until'].includes(mode)) return false;
        if (overrideFilter === 'trial_override' && !['start_trial', 'extended_trial'].includes(mode)) return false;
      }

      const isNew = isNewCompany(c.created_at, newWindowDays);
      if (newOnly && !isNew) return false;

      if (paymentTypeFilter !== 'all') {
        const resolved = resolveLatestCompanyPayment(
          c.latest_subscription_payment ?? null,
          sdkByCompany.get(companyId),
        );
        if (paymentTypeFilter === 'manual' && resolved?.kind !== 'manual') return false;
        if (paymentTypeFilter === 'sdk' && resolved?.kind !== 'sdk') return false;
      }

      if (!term) return true;
      return (
        name.includes(term) ||
        plan.includes(term) ||
        status.includes(term) ||
        id.includes(term) ||
        companyStatusAccessLabel(computedStatus).toLowerCase().includes(term)
      );
    });
  }, [
    companies,
    search,
    statusFilter,
    overrideFilter,
    newOnly,
    newWindowDays,
    subscriptionFilter,
    paymentTypeFilter,
    sdkByCompany,
    now,
  ]);

  const formatCreatedTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Unknown';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (companyId: string) => deleteCompanySafely(companyId),
    onSuccess: (result) => {
      if (result.success) {
        const cleaned = result.deleted_counts
          ? Object.values(result.deleted_counts).reduce((sum, n) => sum + Number(n || 0), 0)
          : null;
        toast({
          title: 'Company deleted',
          description:
            cleaned != null
              ? `Company and linked data removed (${cleaned} rows cleaned).`
              : 'Company and linked data have been removed.',
        });
        // eslint-disable-next-line no-console
        console.log('[DevDelete] Company cleanup counts:', result.deleted_counts ?? null);
        queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
        setDeleteModal({ open: false, company: null, confirmValue: '' });
      } else {
        toast({
          title: 'Deletion blocked',
          description: result.reason ?? 'Company could not be deleted.',
          variant: 'destructive',
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: 'Delete failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (params: {
      companyId: string;
      mode: OverrideMode;
      days?: number;
      planCode?: string;
      reason?: string;
    }) => {
      await overrideSubscription({
        companyId: params.companyId,
        mode: params.mode,
        days: params.days ?? null,
        planCode: params.planCode ?? null,
        reason: params.reason ?? null,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Override applied',
        description: 'Subscription override has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
      setOverrideModal((prev) => ({ ...prev, open: false }));
    },
    onError: (err: Error) => {
      toast({
        title: 'Override failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const stateMutation = useMutation({
    mutationFn: async (params: {
      companyId: string;
      action: 'approve' | 'reject' | 'suspend' | 'activate' | 'start_trial' | 'extend' | 'set_plan';
      planCode?: 'basic' | 'pro';
      reason?: string;
      days?: number;
    }) => {
      const rpcResult = await updateCompanySubscriptionState(params);
      return { params, rpcResult };
    },
    onSuccess: async ({ params, rpcResult }) => {
      const pathBefore = typeof window !== 'undefined' ? window.location.pathname : location.pathname;
      const isApprove = params.action === 'approve';
      const isActivate = params.action === 'activate';

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[DevApproval] mutation success', {
          route: location.pathname,
          pathBefore,
          isDeveloper,
          userRole: user?.role,
          companyIdContext: user?.companyId ?? null,
          targetCompanyId: params.companyId,
          action: params.action,
          workspace_ready_email: rpcResult.workspace_ready_email,
        });
      }

      const title =
        isApprove ? 'Company approved' : isActivate ? 'Access activated' : 'Subscription updated';
      const description = isApprove
        ? 'The company can use the workspace. The list will refresh here.'
        : isActivate
          ? 'Subscription is active; the list will refresh here.'
          : 'Company subscription state has been updated.';

      toast({ title, description });

      await queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
      // If details page is open, refresh farm-intelligence payload too (includes subscription tab).
      await queryClient.invalidateQueries({ queryKey: ['developer', 'company-farm-intelligence', params.companyId] });

      if (import.meta.env.DEV) {
        const pathAfter = typeof window !== 'undefined' ? window.location.pathname : location.pathname;
        // eslint-disable-next-line no-console
        console.log('[DevApproval] after list invalidate', {
          pathBefore,
          pathAfter,
          isDeveloper,
          userRole: user?.role,
          companyIdContext: user?.companyId ?? null,
        });
      }

      const shouldNotify =
        rpcResult.workspace_ready_email && (isApprove || isActivate);
      if (!shouldNotify) return;

      const emailLookupCompanyId = rpcResult.company_id ?? params.companyId;
      // eslint-disable-next-line no-console
      console.log('Approval email companyId:', emailLookupCompanyId);

      const token = await getSupabaseAccessToken();
      if (!token) {
        toast({
          title: 'Workspace email skipped',
          description: 'No session token. Sign in again if you need to send the welcome email.',
        });
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[DevApproval] workspace email skipped: no Supabase token');
        }
        return;
      }

      const resolved = await fetchCompanyWorkspaceNotifyPayload(emailLookupCompanyId);
      if (!resolved.ok) {
        // eslint-disable-next-line no-console
        console.warn('[FarmVault] workspace email skipped — no recipient after lookup order (account → company row → admins → members)', resolved);
        toast({
          title: 'Workspace email not sent',
          description:
            resolved.reason === 'company_not_found'
              ? 'Company record was not found for email lookup.'
              : 'No recipient found (owner account, company email, or team admin). Approval still completed — send the welcome email manually if needed.',
        });
        return;
      }

      // eslint-disable-next-line no-console
      console.log('[FarmVault] workspace email will send', {
        source: resolved.source,
        companyName: resolved.companyName,
      });

      const to = resolved.to;
      const companyName = resolved.companyName;
      const dashboardUrl =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'https://app.farmvault.africa/dashboard'
          : `${window.location.origin}/dashboard`;

      // eslint-disable-next-line no-console
      console.log('Approval email payload', { to, companyName, dashboardUrl });

      const notify = await invokeNotifyCompanyWorkspaceReady({
        to,
        companyName,
        dashboardUrl,
      });
      if (notify.ok) {
        toast({
          title: 'Workspace email sent',
          description: `Sent to ${resolved.to} (source: ${resolved.source.replace(/_/g, ' ')}).`,
        });
      } else {
        const msg = [notify.detail, notify.error].filter(Boolean).join(' — ') || 'Unknown error';
        toast({
          title: 'Workspace email not sent',
          description: msg,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  const extendTrialMutation = useMutation({
    mutationFn: async (params: { companyId: string; days: 7 | 14 | 30 }) => {
      return extendCompanyTrial({ companyId: params.companyId, days: params.days, reason: 'Developer trial extension' });
    },
    onSuccess: async (result) => {
      toast({
        title: 'Trial extended',
        description: result.trial_ends_at ? `New trial end: ${formatDate(result.trial_ends_at)}` : 'Trial end updated.',
      });
      await queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
      await queryClient.invalidateQueries({ queryKey: ['developer', 'company-farm-intelligence', result.company_id] });
      setExtendTrialModal({ open: false, company: null, days: 7 });
    },
    onError: (err: Error) => {
      toast({ title: 'Extend trial failed', description: err.message, variant: 'destructive' });
    },
  });

  const setPaidAccessMutation = useMutation({
    mutationFn: (input: { companyId: string; plan: 'basic' | 'pro'; months: 1 | 2 | 3 }) =>
      setCompanyPaidAccess({ companyId: input.companyId, plan: input.plan, months: input.months }),
    onSuccess: () => {
      toast({ title: 'Access updated', description: 'Paid access window has been updated.' });
      void queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
      void queryClient.invalidateQueries({ queryKey: ['developer', 'subscription-analytics'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update access', description: err.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const duplicatesQuery = useQuery({
    queryKey: ['developer', 'duplicate-emails'],
    queryFn: () => listDuplicateEmails(),
  });

  const [showDuplicateDetails, setShowDuplicateDetails] = useState(false);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, description: value });
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard write was blocked.', variant: 'destructive' });
    }
  };

  const handleQuickOverride = (company: CompanyRow, mode: OverrideMode) => {
    const companyId = company.company_id ?? company.id ?? '';
    if (!companyId) return;

    // For some modes, apply immediately without modal
    if (mode === 'free_forever') {
      overrideMutation.mutate({ companyId, mode, reason: 'Free access granted' });
    } else if (mode === 'remove_override') {
      overrideMutation.mutate({ companyId, mode: 'paid_active' as OverrideMode, reason: 'Override removed' });
    } else {
      // Open modal for modes that need configuration
      setOverrideModal({
        open: true,
        company,
        mode,
        days: mode === 'start_trial' ? 7 : 30,
        planCode: 'pro',
        reason: '',
      });
    }
  };

  const handleApplyOverride = () => {
    const companyId = overrideModal.company?.company_id ?? overrideModal.company?.id ?? '';
    if (!companyId || !overrideModal.mode) return;

    overrideMutation.mutate({
      companyId,
      mode: overrideModal.mode,
      days: overrideModal.days,
      planCode: overrideModal.planCode,
      reason: overrideModal.reason,
    });
  };

  return (
    <DeveloperPageShell
      title="Companies"
      description="All FarmVault tenants with subscription status and override controls."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
      searchPlaceholder="Search by name, plan, status, or company ID…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      <div className="fv-card space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Subscription:</span>
          {[
            { key: 'all', label: 'All' },
            { key: 'payment_required', label: 'Payment required' },
          ].map((f) => {
            const active = (subscriptionFilter || 'all') === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (f.key === 'all') next.delete('subscription');
                  else next.set('subscription', f.key);
                  setSearchParams(next, { replace: true });
                }}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs border transition-colors',
                  active
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/30'
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">New Companies:</span>
          <button
            type="button"
            onClick={() => setNewOnly((v) => !v)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs border transition-colors',
              newOnly
                ? 'bg-emerald-500/15 text-emerald-700 border-emerald-400/40'
                : 'bg-background text-muted-foreground border-border hover:border-emerald-400/40'
            )}
          >
            {newOnly ? 'New only: ON' : 'New only: OFF'}
          </button>
          <div className="flex items-center gap-1">
            {[3, 7, 14].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setNewWindowDays(days as 3 | 7 | 14)}
                className={cn(
                  'px-2 py-1 rounded-md text-xs border transition-colors',
                  newWindowDays === days
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/30'
                )}
                title={`Treat companies created in last ${days} days as new`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'suspended', label: 'Suspended' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'approved', label: 'Approved' },
            { key: 'pending_approval', label: 'Pending Approval' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key as typeof statusFilter)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                statusFilter === f.key
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/30'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Overrides:</span>
          {[
            { key: 'all', label: 'All' },
            { key: 'overridden', label: 'Overridden' },
            { key: 'pilot', label: 'Pilot' },
            { key: 'collaborator', label: 'Collaborator' },
            { key: 'free_access', label: 'Free Access' },
            { key: 'trial_override', label: 'Trial Override' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setOverrideFilter(f.key as typeof overrideFilter)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                overrideFilter === f.key
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/30'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Payment type:</span>
          {[
            { key: 'all', label: 'All' },
            { key: 'manual', label: 'Manual' },
            { key: 'sdk', label: 'SDK' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setPaymentTypeFilter(f.key as typeof paymentTypeFilter)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                paymentTypeFilter === f.key
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/30',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive space-y-2">
          <p className="text-sm font-medium">Failed to load companies</p>
          <p className="text-xs opacity-80">
            {(error as Error).message || 'Unknown error occurred.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="text-xs"
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && companies.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No companies found. Once tenants start signing up, they will appear here.
        </div>
      )}

      {!isLoading && !error && companies.length > 0 && filtered.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No companies match your current search. Clear the search to see all companies.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="fv-card overflow-x-visible md:overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[800px]">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Access</th>
                <th className="py-2 text-left font-medium">Plan & trial</th>
                <th className="py-2 text-left font-medium">Payment</th>
                <th className="py-2 text-left font-medium">Users</th>
                <th className="py-2 text-left font-medium">Trial ends</th>
                <th className="py-2 text-left font-medium">Active until</th>
                <th className="py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const id = c.company_id ?? c.id ?? '';
                const hasOverride = c.override?.enabled;
                const displayName = c.company_name ?? c.name ?? '—';
                const lowerName = displayName.trim().toLowerCase();
                const computedStatus = computeResolvedStatus(c, now, sdkByCompany.get(id));
                const isProtectedCompany =
                  lowerName === 'keyfarm' ||
                  // Any company that is currently active in this session
                  (activeCompanyId != null && id === activeCompanyId);

                const latestPay = resolveLatestCompanyPayment(
                  c.latest_subscription_payment ?? null,
                  sdkByCompany.get(id),
                );
                const st = String(latestPay?.status ?? '').toLowerCase();
                const showStatusNote =
                  latestPay &&
                  st &&
                  st !== 'approved' &&
                  st !== 'success';

                return (
                  <tr key={id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                    <td className="max-md:items-start max-md:gap-2 py-3 pr-4" data-label="Company">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{displayName}</div>
                        {isNewCompany(c.created_at, newWindowDays) && (
                          <span className="inline-flex items-center rounded-sm bg-emerald-500/15 text-emerald-700 border border-emerald-400/30 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{id.slice(0, 8)}…</div>
                      <div className="text-[11px] text-muted-foreground">
                        Created: {formatCreatedTime(c.created_at)}
                      </div>
                    </td>
                    <td className="max-md:items-start py-3 pr-4 text-xs align-top" data-label="Access">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn('font-normal', companyStatusBadgeClass(computedStatus))}
                        >
                          {companyStatusAccessLabel(computedStatus)}
                        </Badge>
                      </div>
                    </td>
                    <td className="max-md:items-start py-3 pr-4 text-xs align-top" data-label="Plan & trial">
                      <div className="space-y-0.5 text-[11px] leading-snug">
                        <div>
                          <span className="text-muted-foreground">Plan: </span>
                          <span className="font-medium text-foreground">
                            {(c.plan ?? '—').toString().toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status: </span>
                          <span className="font-medium text-foreground">
                            {developerVisibleSubscriptionStatus(c, computedStatus)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Access: </span>
                          <span className="font-medium text-foreground">
                            {companyStatusAccessLabel(computedStatus)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="max-md:items-start py-3 pr-4 text-xs align-top" data-label="Payment">
                      {latestPay ? (
                        <div className="max-w-[220px] space-y-1 md:max-w-[220px]">
                          <Badge
                            variant={latestPay.kind === 'sdk' ? 'success' : 'secondary'}
                            className="font-normal text-[10px] px-1.5 py-0"
                          >
                            {latestPay.kind === 'sdk' ? 'SDK' : 'Manual'}
                          </Badge>
                          <div className="text-foreground">
                            {latestPay.amount != null
                              ? `${latestPay.currency} ${latestPay.amount.toLocaleString()} — ${formatPaymentRelativeDay(latestPay.atMs, now)}`
                              : `— — ${formatPaymentRelativeDay(latestPay.atMs, now)}`}
                          </div>
                          {showStatusNote && (
                            <div className="text-[10px] text-muted-foreground capitalize">{latestPay.status}</div>
                          )}
                          {(latestPay.plan_id || latestPay.billing_cycle) && (
                            <div
                              className="text-[10px] text-muted-foreground truncate"
                              title={`${latestPay.plan_id ?? ''} ${latestPay.billing_cycle ?? ''}`}
                            >
                              {[latestPay.plan_id, latestPay.billing_cycle].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground" data-label="Users">
                      {c.users_count ?? 0} / {c.employees_count ?? 0}
                    </td>
                    <td className="py-3 pr-4 text-xs" data-label="Trial ends">
                      {computedStatus === 'pro_active' || computedStatus === 'basic_active'
                        ? '—'
                        : formatDate(c.trial_ends_at ?? c.subscription?.trial_end)}
                    </td>
                    <td className="py-3 pr-4 text-xs" data-label="Active until">
                      {formatDate(c.active_until ?? c.subscription?.period_end)}
                    </td>
                    <td className="max-md:justify-end py-3" data-label="Actions">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" asChild>
                          <Link to={`/developer/companies/${encodeURIComponent(id)}`}>
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => stateMutation.mutate({ companyId: id, action: 'approve' })}
                            className="gap-2"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve (7-day Pro trial)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setConfirmAction({ open: true, company: c, kind: 'suspend' });
                            }}
                            className="gap-2"
                          >
                            <PauseCircle className="h-4 w-4" />
                            Suspend Company
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setConfirmAction({ open: true, company: c, kind: 'set_plan_pro' })}
                            className="gap-2"
                          >
                            <Crown className="h-4 w-4" />
                            Set Plan to Pro
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setConfirmAction({ open: true, company: c, kind: 'set_plan_basic' });
                            }}
                            className="gap-2"
                          >
                            <Users className="h-4 w-4" />
                            Set Plan to Basic
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setExtendTrialModal({ open: true, company: c, days: 7 })}
                            className="gap-2"
                          >
                            <Clock className="h-4 w-4" />
                            Extend Trial…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteModal({ open: true, company: c, confirmValue: '' })}
                            className="gap-2 text-destructive"
                            disabled={
                              (activeCompanyId != null && id === activeCompanyId) ||
                              isProtectedCompany
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Company
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Minimal confirm modal: suspend / set plan */}
      <Dialog
        open={confirmAction.open}
        onOpenChange={(open) => {
          if (stateMutation.isPending) return;
          setConfirmAction((p) => ({ ...p, open }));
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction.kind === 'suspend'
                ? 'Suspend Company'
                : confirmAction.kind === 'set_plan_pro'
                  ? 'Set Plan to Pro'
                  : 'Set Plan to Basic'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction.kind === 'suspend'
                ? `Suspend "${confirmAction.company?.company_name ?? confirmAction.company?.name ?? 'this company'}"? They will lose access until reactivated.`
                : confirmAction.kind === 'set_plan_pro'
                  ? `Set "${confirmAction.company?.company_name ?? confirmAction.company?.name ?? 'this company'}" to Pro?`
                  : `Set "${confirmAction.company?.company_name ?? confirmAction.company?.name ?? 'this company'}" to Basic?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={stateMutation.isPending}
              onClick={() => setConfirmAction({ open: false, company: null, kind: 'suspend' })}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction.kind === 'suspend' ? 'destructive' : 'default'}
              disabled={stateMutation.isPending || !confirmAction.company}
              className="gap-2"
              onClick={() => {
                const companyId = confirmAction.company?.company_id ?? confirmAction.company?.id ?? '';
                if (!companyId) return;
                if (confirmAction.kind === 'suspend') {
                  stateMutation.mutate({ companyId, action: 'suspend', reason: 'Suspended by developer' });
                } else if (confirmAction.kind === 'set_plan_pro') {
                  setPaidAccessModal({ open: true, company: confirmAction.company, plan: 'pro', months: 1 });
                } else {
                  setPaidAccessModal({ open: true, company: confirmAction.company, plan: 'basic', months: 1 });
                }
                setConfirmAction((p) => ({ ...p, open: false }));
              }}
            >
              {stateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paid access modal: set plan + duration */}
      <Dialog
        open={paidAccessModal.open}
        onOpenChange={(open) => {
          if (setPaidAccessMutation.isPending) return;
          setPaidAccessModal((p) => ({ ...p, open }));
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paidAccessModal.plan === 'pro' ? 'Set Plan to Pro (Paid)' : 'Set Plan to Basic (Paid)'}
            </DialogTitle>
            <DialogDescription>
              Choose a duration. This sets <code>plan</code>, <code>active_until</code>, and marks payment as confirmed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 py-3">
            {([1, 2, 3] as const).map((m) => (
              <Button
                key={m}
                type="button"
                variant={paidAccessModal.months === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPaidAccessModal((p) => ({ ...p, months: m }))}
              >
                {m} month{m === 1 ? '' : 's'}
              </Button>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={setPaidAccessMutation.isPending}
              onClick={() => setPaidAccessModal({ open: false, company: null, plan: 'pro', months: 1 })}
            >
              Cancel
            </Button>
            <Button
              disabled={setPaidAccessMutation.isPending || !paidAccessModal.company}
              className="gap-2"
              onClick={() => {
                const companyId = paidAccessModal.company?.company_id ?? paidAccessModal.company?.id ?? '';
                if (!companyId) return;
                setPaidAccessMutation.mutate({ companyId, plan: paidAccessModal.plan, months: paidAccessModal.months });
                setPaidAccessModal((p) => ({ ...p, open: false }));
              }}
            >
              {setPaidAccessMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend trial modal */}
      <Dialog
        open={extendTrialModal.open}
        onOpenChange={(open) => {
          if (extendTrialMutation.isPending) return;
          setExtendTrialModal((p) => ({ ...p, open }));
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extend Trial</DialogTitle>
            <DialogDescription>
              Extend the trial for{' '}
              <span className="font-medium text-foreground">
                {extendTrialModal.company?.company_name ?? extendTrialModal.company?.name ?? 'this company'}
              </span>
              . Choose the extension duration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 py-3">
            {[7, 14, 30].map((d) => (
              <Button
                key={d}
                type="button"
                variant={extendTrialModal.days === d ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExtendTrialModal((p) => ({ ...p, days: d as 7 | 14 | 30 }))}
              >
                {d} days
              </Button>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={extendTrialMutation.isPending}
              onClick={() => setExtendTrialModal({ open: false, company: null, days: 7 })}
            >
              Cancel
            </Button>
            <Button
              disabled={extendTrialMutation.isPending || !extendTrialModal.company}
              className="gap-2"
              onClick={() => {
                const companyId = extendTrialModal.company?.company_id ?? extendTrialModal.company?.id ?? '';
                if (!companyId) return;
                extendTrialMutation.mutate({ companyId, days: extendTrialModal.days });
              }}
            >
              {extendTrialMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {duplicatesQuery.data && (
        <div className="fv-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Duplicate Email Cleanup</p>
              <p className="text-xs text-muted-foreground">
                Profiles: {duplicatesQuery.data.profiles.length} · Companies: {duplicatesQuery.data.companies.length} · Employee duplicates: {duplicatesQuery.data.employees_per_company.length}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDuplicateDetails((v) => !v)}
            >
              {showDuplicateDetails ? 'Hide details' : 'Show details'}
            </Button>
          </div>

          {showDuplicateDetails && (
            <div className="space-y-4 pt-2">
              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">User Profile Email Duplicates</p>
                {duplicatesQuery.data.profiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No duplicates found.</p>
                ) : (
                  <div className="space-y-2">
                    {duplicatesQuery.data.profiles.map((row) => (
                      <div key={`profile-${row.email}`} className="flex items-center justify-between gap-2 text-xs border border-border/40 rounded p-2">
                        <div>
                          <p className="font-medium">{row.email}</p>
                          <p className="text-muted-foreground">Count: {row.count}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setSearch(row.email)}>
                            <Search className="h-3.5 w-3.5 mr-1" />
                            Filter
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(row.email, 'Email')}>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Company Email Duplicates</p>
                {duplicatesQuery.data.companies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No duplicates found.</p>
                ) : (
                  <div className="space-y-2">
                    {duplicatesQuery.data.companies.map((row) => (
                      <div key={`company-${row.email}`} className="flex items-center justify-between gap-2 text-xs border border-border/40 rounded p-2">
                        <div>
                          <p className="font-medium">{row.email}</p>
                          <p className="text-muted-foreground">Count: {row.count}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setSearch(row.email)}>
                            <Search className="h-3.5 w-3.5 mr-1" />
                            Filter
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(row.email, 'Email')}>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border/60 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Employee Duplicates Per Company</p>
                {duplicatesQuery.data.employees_per_company.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No duplicates found.</p>
                ) : (
                  <div className="space-y-2">
                    {duplicatesQuery.data.employees_per_company.map((row) => (
                      <div key={`employee-${row.company_id}-${row.email}`} className="flex items-center justify-between gap-2 text-xs border border-border/40 rounded p-2">
                        <div>
                          <p className="font-medium">{row.email}</p>
                          <p className="text-muted-foreground">Company: {row.company_id} · Count: {row.count}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setSearch(row.company_id)}>
                            <Search className="h-3.5 w-3.5 mr-1" />
                            Company
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(row.email, 'Email')}>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Company confirmation modal */}
      <Dialog
        open={deleteModal.open}
        onOpenChange={(open) => !deleteMutation.isPending && setDeleteModal((p) => ({ ...p, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Company
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the company and related platform records. This action cannot be undone.
              Only empty/test companies without linked data can be deleted; others will be blocked safely.
            </DialogDescription>
          </DialogHeader>
          {deleteModal.company && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">Company:</span> {deleteModal.company.company_name ?? deleteModal.company.name ?? '—'}</div>
                <div><span className="text-muted-foreground">ID:</span> <code className="text-xs">{deleteModal.company.company_id ?? deleteModal.company.id ?? '—'}</code></div>
                <div><span className="text-muted-foreground">Users / Employees:</span> {deleteModal.company.users_count ?? 0} / {deleteModal.company.employees_count ?? 0}</div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Type the exact company name to confirm: <span className="font-mono text-foreground">{deleteModal.company.company_name ?? deleteModal.company.name ?? ''}</span>
                </label>
                <input
                  type="text"
                  className="fv-input w-full"
                  value={deleteModal.confirmValue}
                  onChange={(e) => setDeleteModal((p) => ({ ...p, confirmValue: e.target.value }))}
                  placeholder="Enter company name to confirm"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteModal({ open: false, company: null, confirmValue: '' })}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const c = deleteModal.company;
                const companyId = c?.company_id ?? c?.id ?? '';
                const expectedName = (c?.company_name ?? c?.name ?? '').trim().toLowerCase();
                const typed = deleteModal.confirmValue.trim().toLowerCase();
                if (companyId && expectedName && typed === expectedName) {
                  deleteMutation.mutate(companyId);
                }
              }}
              disabled={
                deleteMutation.isPending ||
                !deleteModal.company ||
                deleteModal.confirmValue.trim().toLowerCase() !==
                  (deleteModal.company?.company_name ?? deleteModal.company?.name ?? '').trim().toLowerCase()
              }
              className="gap-2"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override configuration modal */}
      <Dialog
        open={overrideModal.open}
        onOpenChange={(open) => setOverrideModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Configure Override
            </DialogTitle>
            <DialogDescription>
              Apply subscription override for{' '}
              <span className="font-medium text-foreground">
                {overrideModal.company?.company_name ?? 'company'}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Duration (days)</label>
              <input
                type="number"
                min={1}
                max={3650}
                className="fv-input w-full"
                value={overrideModal.days}
                onChange={(e) =>
                  setOverrideModal((prev) => ({
                    ...prev,
                    days: parseInt(e.target.value, 10) || 7,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Plan</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(
                    'fv-chip flex-1',
                    overrideModal.planCode === 'basic' && 'fv-chip--selected'
                  )}
                  onClick={() =>
                    setOverrideModal((prev) => ({ ...prev, planCode: 'basic' }))
                  }
                >
                  Basic
                </button>
                <button
                  type="button"
                  className={cn(
                    'fv-chip flex-1',
                    overrideModal.planCode === 'pro' && 'fv-chip--selected'
                  )}
                  onClick={() =>
                    setOverrideModal((prev) => ({ ...prev, planCode: 'pro' }))
                  }
                >
                  Pro
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Reason (for audit)</label>
              <textarea
                className="fv-input min-h-[60px] resize-y w-full"
                value={overrideModal.reason}
                onChange={(e) =>
                  setOverrideModal((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="Why this override is being granted…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setOverrideModal((prev) => ({ ...prev, open: false }))}
              disabled={overrideMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyOverride}
              disabled={overrideMutation.isPending}
              className="gap-2"
            >
              {overrideMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DeveloperPageShell>
  );
}
