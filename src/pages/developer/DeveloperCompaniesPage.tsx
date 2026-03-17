import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { fetchDeveloperCompanies } from '@/services/developerService';
import { overrideSubscription, deleteCompanySafely, type OverrideMode } from '@/services/developerAdminService';
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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  if (status === 'active') {
    if (plan === 'pro' || plan === 'professional') return { label: 'Pro', variant: 'success' };
    if (plan === 'enterprise') return { label: 'Enterprise', variant: 'success' };
    return { label: 'Basic', variant: 'default' };
  }
  if (status === 'expired') return { label: 'Expired', variant: 'destructive' };
  if (status === 'cancelled') return { label: 'Cancelled', variant: 'destructive' };

  return { label: plan || 'Basic', variant: 'default' };
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

export default function DeveloperCompaniesPage() {
  const [search, setSearch] = useState('');
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
    if (!term) return companies;
    return companies.filter((c) => {
      const name = (c.company_name ?? c.name ?? '').toLowerCase();
      const plan = (c.plan_code ?? '').toLowerCase();
      const status = (c.subscription_status ?? '').toLowerCase();
      const id = (c.company_id ?? c.id ?? '').toLowerCase();
      return (
        name.includes(term) ||
        plan.includes(term) ||
        status.includes(term) ||
        id.includes(term)
      );
    });
  }, [companies, search]);

  const deleteMutation = useMutation({
    mutationFn: (companyId: string) => deleteCompanySafely(companyId),
    onSuccess: (result) => {
      if (result.success) {
        toast({ title: 'Company deleted', description: 'Company has been removed.' });
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

      {!isLoading && !error && filtered.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No companies found. Once tenants start signing up, they will appear here.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan / Status</th>
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
                      <div className="font-medium text-foreground">{displayName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{id.slice(0, 8)}…</div>
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
                            onClick={() => handleQuickOverride(c, 'paid_active')}
                            className="gap-2"
                          >
                            <Crown className="h-4 w-4" />
                            Set Plan to Pro
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setOverrideModal({
                                open: true,
                                company: c,
                                mode: 'paid_active',
                                days: 365,
                                planCode: 'basic',
                                reason: '',
                              });
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
