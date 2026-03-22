import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { fetchDeveloperCompanies } from '@/services/developerService';
import {
  overrideSubscription,
  deleteCompanySafely,
  updateCompanySubscriptionState,
  listDuplicateEmails,
  fetchCompanyWorkspaceNotifyPayload,
  type OverrideMode,
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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type LatestSubscriptionPayment = {
  id?: string;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  plan_id?: string | null;
  billing_cycle?: string | null;
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
  subscription_status?: string | null;
  plan_code?: string | null;
  billing_mode?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  active_until?: string | null;
  latest_subscription_payment?: LatestSubscriptionPayment | null;
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
  } | null;
};

function getEffectiveLabel(c: CompanyRow): { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' } {
  const override = c.override;
  const mode = override?.mode?.toLowerCase();
  const status = (c.subscription_status ?? '').toLowerCase();
  const plan = (c.plan_code ?? 'basic').toLowerCase();

  if (override?.enabled) {
    if (mode === 'pilot') return { label: 'Pilot', variant: 'secondary' };
    if (mode === 'collaborator') return { label: 'Collaborator', variant: 'secondary' };
    if (mode === 'free_forever' || mode === 'free_until') return { label: 'Free Access', variant: 'success' };
    if (mode === 'extended_trial' || mode === 'start_trial') return { label: 'Extended Trial', variant: 'warning' };
  }

  if (status === 'trialing') return { label: 'Trial', variant: 'warning' };
  if (status === 'pending_approval') return { label: 'Pending Approval', variant: 'warning' };
  if (status === 'active') {
    if (plan === 'pro' || plan === 'professional') return { label: 'Pro', variant: 'success' };
    if (plan === 'enterprise') return { label: 'Enterprise', variant: 'success' };
    return { label: 'Basic', variant: 'default' };
  }
  if (status === 'expired') return { label: 'Expired', variant: 'destructive' };
  if (status === 'rejected') return { label: 'Rejected', variant: 'destructive' };
  if (status === 'suspended') return { label: 'Suspended', variant: 'destructive' };
  if (status === 'cancelled') return { label: 'Cancelled', variant: 'destructive' };

  if (!status) {
    if (!plan) return { label: 'Unset / None', variant: 'default' };
    return { label: `${plan} / Unset`, variant: 'default' };
  }
  return { label: plan || 'None', variant: 'default' };
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

function latestPaymentStatusStyles(status: string | undefined | null): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'pending_verification' || s === 'pending') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  }
  if (s === 'approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (s === 'rejected') return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  return 'border-border bg-muted text-muted-foreground';
}

function latestPaymentStatusLabel(status: string | undefined | null): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'pending_verification') return 'Pending verification';
  if (s === 'pending') return 'Pending';
  return (status ?? '—').replace(/_/g, ' ');
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'rejected' | 'approved' | 'pending_approval'>('all');
  const [overrideFilter, setOverrideFilter] = useState<'all' | 'overridden' | 'pilot' | 'collaborator' | 'free_access' | 'trial_override'>('all');
  const [newOnly, setNewOnly] = useState(false);
  const [newWindowDays, setNewWindowDays] = useState<3 | 7 | 14>(7);
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

  const companies = (data?.items ?? []) as CompanyRow[];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((c) => {
      const name = (c.company_name ?? c.name ?? '').toLowerCase();
      const plan = (c.plan_code ?? '').toLowerCase();
      const status = (c.subscription_status ?? '').toLowerCase();
      const id = (c.company_id ?? c.id ?? '').toLowerCase();
      const mode = (c.override?.mode ?? '').toLowerCase();
      const hasOverride = Boolean(c.override?.enabled);

      if (statusFilter !== 'all') {
        if (statusFilter === 'approved') {
          if (!['active', 'trialing'].includes(status)) return false;
        } else if (status !== statusFilter) {
          return false;
        }
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

      if (!term) return true;
      return (
        name.includes(term) ||
        plan.includes(term) ||
        status.includes(term) ||
        id.includes(term)
      );
    });
  }, [companies, search, statusFilter, overrideFilter, newOnly, newWindowDays]);

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
      <div className="fv-card space-y-3">
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
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan / Status</th>
                <th className="py-2 text-left font-medium">Latest M-Pesa</th>
                <th className="py-2 text-left font-medium">Users</th>
                <th className="py-2 text-left font-medium">Trial ends</th>
                <th className="py-2 text-left font-medium">Active until</th>
                <th className="py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const id = c.company_id ?? c.id ?? '';
                const { label, variant } = getEffectiveLabel(c);
                const hasOverride = c.override?.enabled;
                const displayName = c.company_name ?? c.name ?? '—';
                const lowerName = displayName.trim().toLowerCase();
                const isProtectedCompany =
                  // KeyFarm is always protected
                  id === 'fa61d13d-3466-48db-a39c-4a474ccfed58' ||
                  lowerName === 'keyfarm' ||
                  // Any company that is currently active in this session
                  (activeCompanyId != null && id === activeCompanyId);

                return (
                  <tr key={id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
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
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border',
                          variant === 'success' && 'bg-green-500/10 text-green-600 border-green-500/20',
                          variant === 'warning' && 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                          variant === 'destructive' && 'bg-red-500/10 text-red-600 border-red-500/20',
                          variant === 'secondary' && 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                          variant === 'default' && 'bg-muted text-muted-foreground border-border'
                        )}
                      >
                        {hasOverride && <ShieldCheck className="h-3 w-3" />}
                        {label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs align-top">
                      {c.latest_subscription_payment ? (
                        <div className="space-y-1 max-w-[200px]">
                          <Badge
                            variant="outline"
                            className={cn('font-normal text-[10px] px-1.5 py-0', latestPaymentStatusStyles(c.latest_subscription_payment.status))}
                          >
                            {latestPaymentStatusLabel(c.latest_subscription_payment.status)}
                          </Badge>
                          <div className="text-foreground">
                            {c.latest_subscription_payment.amount != null && c.latest_subscription_payment.amount !== ''
                              ? `${c.latest_subscription_payment.currency ?? 'KES'} ${Number(c.latest_subscription_payment.amount).toLocaleString()}`
                              : '—'}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDate(
                              c.latest_subscription_payment.submitted_at ?? undefined,
                            )}
                          </div>
                          {(c.latest_subscription_payment.plan_id || c.latest_subscription_payment.billing_cycle) && (
                            <div className="text-[10px] text-muted-foreground truncate" title={`${c.latest_subscription_payment.plan_id ?? ''} ${c.latest_subscription_payment.billing_cycle ?? ''}`}>
                              {[c.latest_subscription_payment.plan_id, c.latest_subscription_payment.billing_cycle].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {c.users_count ?? 0} / {c.employees_count ?? 0}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {formatDate(c.trial_ends_at ?? c.subscription?.trial_end)}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {formatDate(c.active_until ?? c.subscription?.period_end)}
                    </td>
                    <td className="py-3">
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
                              const reason = window.prompt('Reason for rejection (optional):', '');
                              stateMutation.mutate({ companyId: id, action: 'reject', reason: reason ?? undefined });
                            }}
                            className="gap-2"
                          >
                            <XOctagon className="h-4 w-4" />
                            Reject Company
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const reason = window.prompt('Reason for suspension (optional):', '');
                              stateMutation.mutate({ companyId: id, action: 'suspend', reason: reason ?? undefined });
                            }}
                            className="gap-2"
                          >
                            <PauseCircle className="h-4 w-4" />
                            Suspend Company
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => stateMutation.mutate({ companyId: id, action: 'activate' })}
                            className="gap-2"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Activate (7-day Pro trial)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              const daysRaw = window.prompt('Trial days to grant', '7');
                              const days = Number(daysRaw ?? '7');
                              stateMutation.mutate({ companyId: id, action: 'start_trial', days: Number.isFinite(days) ? days : 7 });
                            }}
                            className="gap-2"
                          >
                            <Clock className="h-4 w-4" />
                            Start Trial
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const daysRaw = window.prompt('Extra days to extend access', '30');
                              const reason = window.prompt('Override note (optional)', '');
                              const days = Number(daysRaw ?? '30');
                              stateMutation.mutate({ companyId: id, action: 'extend', days: Number.isFinite(days) ? days : 30, reason: reason ?? undefined });
                            }}
                            className="gap-2"
                          >
                            <Clock className="h-4 w-4" />
                            Extend Access
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleQuickOverride(c, 'paid_active')}
                            className="gap-2"
                          >
                            <Crown className="h-4 w-4" />
                            Set Plan to Pro
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              stateMutation.mutate({ companyId: id, action: 'set_plan', planCode: 'basic' });
                            }}
                            className="gap-2"
                          >
                            <Users className="h-4 w-4" />
                            Set Plan to Basic
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleQuickOverride(c, 'start_trial')}
                            className="gap-2"
                          >
                            <Clock className="h-4 w-4" />
                            Grant Trial
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleQuickOverride(c, 'start_trial')}
                            className="gap-2"
                          >
                            <Clock className="h-4 w-4" />
                            Extend Trial
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleQuickOverride(c, 'free_forever')}
                            className="gap-2"
                          >
                            <Gift className="h-4 w-4" />
                            Grant Free Access
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const companyId = c.company_id ?? c.id ?? '';
                              if (companyId) {
                                overrideMutation.mutate({
                                  companyId,
                                  mode: 'pilot' as OverrideMode,
                                  reason: 'Marked as pilot',
                                });
                              }
                            }}
                            className="gap-2"
                          >
                            <Beaker className="h-4 w-4" />
                            Mark as Pilot
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              const companyId = c.company_id ?? c.id ?? '';
                              if (companyId) {
                                overrideMutation.mutate({
                                  companyId,
                                  mode: 'collaborator' as OverrideMode,
                                  reason: 'Marked as collaborator',
                                });
                              }
                            }}
                            className="gap-2"
                          >
                            <Sparkles className="h-4 w-4" />
                            Mark as Collaborator
                          </DropdownMenuItem>
                          {hasOverride && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleQuickOverride(c, 'remove_override')}
                                className="gap-2 text-destructive"
                              >
                                <XCircle className="h-4 w-4" />
                                Remove Override
                              </DropdownMenuItem>
                            </>
                          )}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
