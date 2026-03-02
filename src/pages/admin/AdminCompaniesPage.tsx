import React, { useMemo, useState } from 'react';
import { Building2, PlusCircle, Users, FolderKanban, CreditCard, Bell, Loader2, ShieldCheck, Clock, X } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import { Project, Employee } from '@/types';
import { CompaniesTable, type CompaniesViewMode } from '@/components/dashboard/CompaniesTable';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getCompany,
  createCompany,
  setPaymentReminder,
  clearPaymentReminder,
  type CompanyDoc,
  type CompanySubscription,
  type CompanySubscriptionOverride,
  setCompanySubscriptionOverride,
} from '@/services/companyService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function AdminCompaniesPage() {
  const { user } = useAuth();
  const { data: companies = [], isLoading } = useCollection<Company>('admin-companies-list', 'companies', {
    companyScoped: false,
    isDeveloper: true,
  });

  const { data: allProjects = [] } = useCollection<{ id: string; companyId?: string }>(
    'admin-companies-projects',
    'projects',
    { companyScoped: false, isDeveloper: true },
  );
  const { data: allUsers = [] } = useCollection<{ id: string; companyId?: string }>(
    'admin-companies-users',
    'users',
    { companyScoped: false, isDeveloper: true },
  );

  const enrichedCompanies = useMemo(() => {
    const projectCountByCompany = new Map<string, number>();
    const userCountByCompany = new Map<string, number>();
    allProjects.forEach((p) => {
      const cid = p.companyId ?? '';
      if (cid) projectCountByCompany.set(cid, (projectCountByCompany.get(cid) ?? 0) + 1);
    });
    allUsers.forEach((u) => {
      const cid = (u as { companyId?: string }).companyId ?? '';
      if (cid) userCountByCompany.set(cid, (userCountByCompany.get(cid) ?? 0) + 1);
    });
    return companies.map((c) => ({
      ...c,
      projectCount: projectCountByCompany.get(c.id) ?? c.projectCount ?? 0,
      userCount: userCountByCompany.get(c.id) ?? c.userCount ?? 0,
      revenue: typeof (c as any).revenue === 'number' ? (c as any).revenue : (c as any).revenue ?? 0,
    }));
  }, [companies, allProjects, allUsers]);

  const [viewMode, setViewMode] = useState<CompaniesViewMode>('list');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyEmail, setNewCompanyEmail] = useState('');
  const [addCompanySaving, setAddCompanySaving] = useState(false);
  const [addCompanyError, setAddCompanyError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const companyId = selectedCompany?.id ?? null;

  const { data: companyDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['company-detail', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
  });

  const { data: companyProjects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['company-projects', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const q = query(collection(db, 'projects'), where('companyId', '==', companyId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Project[];
    },
  });

  const { data: companyEmployees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ['company-employees', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const q = query(collection(db, 'employees'), where('companyId', '==', companyId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Employee[];
    },
  });

  const getStatusBadge = (status: Company['status'] | string | undefined) => {
    const styles: Record<string, string> = {
      active: 'fv-badge--active',
      pending: 'fv-badge--warning',
      inactive: 'bg-muted text-muted-foreground',
    };
    return styles[status ?? 'pending'] ?? 'bg-muted';
  };

  const getPlanBadge = (plan: Company['plan'] | string | undefined) => {
    const styles: Record<string, string> = {
      enterprise: 'fv-badge--gold',
      professional: 'fv-badge--info',
      starter: 'bg-muted text-muted-foreground',
    };
    return styles[plan ?? 'starter'] ?? 'bg-muted';
  };

  const formatCurrency = (amount: number | undefined) => {
    const safe = typeof amount === 'number' ? amount : 0;
    return `KES ${safe.toLocaleString()}`;
  };

  const formatDate = (d: unknown) => {
    if (!d) return '—';
    if (d instanceof Date) return format(d, 'PPp');
    if (typeof (d as any)?.toDate === 'function') return format((d as any).toDate(), 'PPp');
    if (typeof d === 'object' && d !== null && 'seconds' in (d as object))
      return format(new Date((d as any).seconds * 1000), 'PPp');
    return '—';
  };

  const formatDateShort = (d: unknown) => {
    if (!d) return '—';
    if (d instanceof Date) return format(d, 'PP');
    if (typeof (d as any)?.toDate === 'function') return format((d as any).toDate(), 'PP');
    if (typeof d === 'object' && d !== null && 'seconds' in (d as object))
      return format(new Date((d as any).seconds * 1000), 'PP');
    return '—';
  };

  const handleClearReminder = async () => {
    if (!companyId) return;
    setReminderLoading(true);
    try {
      await clearPaymentReminder(companyId);
      await queryClient.invalidateQueries({ queryKey: ['company-detail', companyId] });
    } finally {
      setReminderLoading(false);
    }
  };

  const handleResendReminder = async () => {
    if (!companyId) return;
    setReminderLoading(true);
    try {
      await setPaymentReminder(companyId);
      await queryClient.invalidateQueries({ queryKey: ['company-detail', companyId] });
    } finally {
      setReminderLoading(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCompanyName.trim();
    const email = newCompanyEmail.trim();
    if (!name || !email) {
      setAddCompanyError('Name and email are required.');
      return;
    }
    setAddCompanyError(null);
    setAddCompanySaving(true);
    try {
      await createCompany(name, email);
      queryClient.invalidateQueries({ queryKey: ['admin-companies-list'] });
      setAddCompanyOpen(false);
      setNewCompanyName('');
      setNewCompanyEmail('');
    } catch (err: unknown) {
      setAddCompanyError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setAddCompanySaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Companies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All tenants. Click a company to see full details, projects, employees, and subscription.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddCompanyOpen(true);
            setNewCompanyName('');
            setNewCompanyEmail('');
            setAddCompanyError(null);
          }}
          className="fv-btn fv-btn--primary"
        >
          <PlusCircle className="h-4 w-4" />
          New Company
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading companies…</p>}

      <CompaniesTable
        companies={enrichedCompanies}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCompanyClick={setSelectedCompany}
        showViewAll={false}
      />

      <Sheet open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedCompany && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold text-lg">
                    {selectedCompany.name.charAt(0)}
                  </div>
                  <SheetTitle className="text-left">{selectedCompany.name}</SheetTitle>
                </div>
              </SheetHeader>

              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="mt-6 space-y-8">
                  {/* Company info */}
                  <section>
                    <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Company
                    </h4>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">ID</dt>
                      <dd className="font-mono text-foreground break-all">{selectedCompany.id}</dd>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="text-foreground">{(companyDetail as CompanyDoc)?.email ?? '—'}</dd>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd>
                        <span className={cn('fv-badge capitalize', getStatusBadge(selectedCompany.status))}>
                          {selectedCompany.status}
                        </span>
                      </dd>
                      <dt className="text-muted-foreground">Plan</dt>
                      <dd>
                        <span className={cn('fv-badge capitalize', getPlanBadge(selectedCompany.plan))}>
                          {selectedCompany.plan}
                        </span>
                      </dd>
                      <dt className="text-muted-foreground">Revenue</dt>
                      <dd className="font-medium text-foreground">{formatCurrency(selectedCompany.revenue)}</dd>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="text-foreground">{formatDate((companyDetail as CompanyDoc)?.createdAt)}</dd>
                    </dl>
                  </section>

                  {/* Billing type & Subscription (visible in developer admin) */}
                  <section>
                    <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Billing & subscription
                    </h4>
                    <div className="space-y-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Billing type / Plan</span>
                          <span className={cn('fv-badge capitalize', getPlanBadge(companyDetail?.plan ?? selectedCompany.plan))}>
                            {companyDetail?.plan ?? selectedCompany.plan ?? (companyDetail as CompanyDoc)?.subscriptionPlan ?? '—'}
                          </span>
                        </div>
                        {(() => {
                          const sub = (companyDetail as CompanyDoc)?.subscription as CompanySubscription | undefined;
                          if (!sub) return null;
                          const trialEnds = (sub.trialEndsAt as any)?.toDate?.() as Date | undefined;
                          const paidUntil = (sub.paidUntil as any)?.toDate?.() as Date | undefined;
                          const now = new Date();
                          const override = sub.override as CompanySubscriptionOverride | undefined;
                          const overrideEnds = (override?.overrideEndsAt as any)?.toDate?.() as Date | undefined;
                          const overrideActive = Boolean(override?.enabled && overrideEnds && overrideEnds > now);
                          return (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>
                                Plan:{' '}
                                <span className="font-medium">
                                  {sub.plan}
                                </span>{' '}
                                · Status:{' '}
                                <span className="font-medium capitalize">
                                  {sub.status}
                                </span>
                              </p>
                              {trialEnds && (
                                <p>
                                  Trial ends:{' '}
                                  <span className="font-medium">
                                    {format(trialEnds, 'PP')}
                                  </span>
                                </p>
                              )}
                              {paidUntil && (
                                <p>
                                  Paid until:{' '}
                                  <span className="font-medium">
                                    {format(paidUntil, 'PP')}
                                  </span>
                                </p>
                              )}
                              {override && (
                                <p className="flex items-center gap-1">
                                  <ShieldCheck className="h-3 w-3 text-fv-olive" />
                                  Override:{' '}
                                  <span className="font-medium">
                                    {override.enabled ? (override.type ?? 'custom') : 'disabled'}
                                  </span>
                                  {overrideActive && overrideEnds && (
                                    <span className="ml-1">
                                      (until {format(overrideEnds, 'PP')})
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {companyDetail?.paymentReminderDismissedAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          Company selected &quot;I&apos;ve paid / Dismiss&quot; on {formatDateShort(companyDetail.paymentReminderDismissedAt)}
                          {companyDetail.paymentReminderDismissedBy && ` (user ID: ${companyDetail.paymentReminderDismissedBy})`}.
                        </p>
                      )}
                      {companyDetail?.paymentReminderActive && (
                        <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                          <Bell className="h-3.5 w-3.5" />
                          Payment reminder is active (notification shown to them).
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          disabled={reminderLoading}
                          onClick={async () => {
                            if (!companyId) return;
                            setReminderLoading(true);
                            try {
                              await setPaymentReminder(companyId);
                              await queryClient.invalidateQueries({ queryKey: ['company-detail', companyId] });
                            } finally {
                              setReminderLoading(false);
                            }
                          }}
                          className="fv-btn fv-btn--secondary text-sm"
                          title="Show payment reminder notification to this company"
                        >
                          {reminderLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                          Send test reminder
                        </button>
                        {companyDetail?.paymentReminderActive ? (
                          <button
                            type="button"
                            disabled={reminderLoading}
                            onClick={handleClearReminder}
                            className="fv-btn fv-btn--ghost text-sm text-muted-foreground"
                          >
                            Clear reminder
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={reminderLoading}
                            onClick={handleResendReminder}
                            className="fv-btn fv-btn--primary text-sm"
                          >
                            Resend reminder
                          </button>
                        )}
                      </div>
                      {user?.role === 'developer' && (
                        <DeveloperSubscriptionOverridePanel
                          companyId={companyId}
                          company={companyDetail as CompanyDoc | undefined}
                        />
                      )}
                    </div>
                  </section>

                  {/* Projects */}
                  <section>
                    <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <FolderKanban className="h-4 w-4" />
                      Projects ({companyProjects.length})
                    </h4>
                    {projectsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : companyProjects.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No projects.</p>
                    ) : (
                      <ul className="space-y-2">
                        {companyProjects.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-muted/30 text-sm"
                          >
                            <div>
                              <span className="font-medium text-foreground">{p.name}</span>
                              <span className="text-muted-foreground ml-2 capitalize">
                                {p.cropType?.replace('-', ' ')} · {p.location}
                              </span>
                            </div>
                            <span className={cn('fv-badge text-xs capitalize', getStatusBadge(p.status))}>
                              {p.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Employees */}
                  <section>
                    <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Employees ({companyEmployees.length})
                    </h4>
                    {employeesLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : companyEmployees.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No employees.</p>
                    ) : (
                      <ul className="space-y-2">
                        {companyEmployees.map((emp) => (
                          <li
                            key={emp.id}
                            className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-muted/30 text-sm"
                          >
                            <div>
                              <span className="font-medium text-foreground">{emp.name}</span>
                              <span className="text-muted-foreground ml-2">{emp.role}</span>
                              <span className="text-muted-foreground ml-1">· {emp.department}</span>
                            </div>
                            <span className={cn('fv-badge text-xs capitalize', getStatusBadge(emp.status))}>
                              {emp.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompany} className="space-y-4 mt-2">
            {addCompanyError && (
              <p className="text-sm text-destructive">{addCompanyError}</p>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Company name</label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="fv-input w-full"
                placeholder="Acme Farm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Company email</label>
              <input
                type="email"
                value={newCompanyEmail}
                onChange={(e) => setNewCompanyEmail(e.target.value)}
                className="fv-input w-full"
                placeholder="contact@acmefarm.com"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A new company record will be created. An admin can sign up later via the setup flow and join this company.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setAddCompanyOpen(false)}
                className="fv-btn fv-btn--secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addCompanySaving}
                className="fv-btn fv-btn--primary"
              >
                {addCompanySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create company
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DeveloperSubscriptionOverridePanelProps {
  companyId: string | null;
  company?: CompanyDoc;
}

function DeveloperSubscriptionOverridePanel({ companyId, company }: DeveloperSubscriptionOverridePanelProps) {
  const [saving, setSaving] = React.useState(false);
  const sub = (company?.subscription ?? null) as CompanySubscription | null;
  const override = (sub?.override ?? null) as CompanySubscriptionOverride | null;

  const [fullFree, setFullFree] = React.useState<boolean>(override?.enabled && override?.type === 'full_free');
  const [extendTrialDays, setExtendTrialDays] = React.useState<string>('');
  const [customExpiry, setCustomExpiry] = React.useState<string>('');
  const [reason, setReason] = React.useState<string>(override?.reason ?? '');

  React.useEffect(() => {
    if (!override) {
      setFullFree(false);
      setExtendTrialDays('');
      setCustomExpiry('');
      setReason('');
      return;
    }
    setFullFree(override.enabled && override.type === 'full_free');
    setReason(override.reason ?? '');
    if (override.overrideEndsAt) {
      const d = (override.overrideEndsAt as any).toDate?.() as Date | undefined;
      if (d) {
        setCustomExpiry(d.toISOString().slice(0, 10));
      }
    }
  }, [override?.enabled, override?.type, (override?.overrideEndsAt as any)?.seconds]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const now = new Date();
      let nextOverride: CompanySubscriptionOverride;

      if (fullFree) {
        nextOverride = {
          enabled: true,
          type: 'full_free',
          overrideEndsAt: null,
          reason: reason || null,
          grantedBy: 'developer',
        };
      } else if (extendTrialDays.trim()) {
        const days = Number(extendTrialDays.trim());
        const end = new Date(now.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
        nextOverride = {
          enabled: true,
          type: 'extended_trial',
          overrideEndsAt: Timestamp.fromDate(end),
          reason: reason || null,
          grantedBy: 'developer',
        };
      } else if (customExpiry.trim()) {
        const end = new Date(customExpiry.trim());
        nextOverride = {
          enabled: true,
          type: 'custom',
          overrideEndsAt: Timestamp.fromDate(end),
          reason: reason || null,
          grantedBy: 'developer',
        };
      } else {
        nextOverride = {
          enabled: false,
          type: 'custom',
          overrideEndsAt: null,
          reason: reason || null,
          grantedBy: 'developer',
        };
      }

      await setCompanySubscriptionOverride(companyId, nextOverride);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await setCompanySubscriptionOverride(companyId, null);
    } finally {
      setSaving(false);
    }
  };

  const overrideActive = Boolean(override?.enabled);

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-muted/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-fv-olive" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Subscription Override (Developer)
          </span>
        </div>
        {overrideActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
            <Clock className="h-3 w-3" />
            Active
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Enable full free access</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={fullFree}
              onChange={(e) => setFullFree(e.target.checked)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-muted-foreground">Extend trial (days)</span>
            <input
              type="number"
              min={1}
              className="fv-input h-8 text-xs"
              value={extendTrialDays}
              onChange={(e) => setExtendTrialDays(e.target.value)}
              placeholder="e.g. 14"
            />
          </label>
        </div>
        <div className="space-y-2">
          <label className="space-y-1 block">
            <span className="text-muted-foreground">Custom expiry date</span>
            <input
              type="date"
              className="fv-input h-8 text-xs"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(e.target.value)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-muted-foreground">Reason (optional)</span>
            <input
              type="text"
              className="fv-input h-8 text-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Internal note"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>Only developer can change override.</span>
        </div>
        <div className="flex items-center gap-2">
          {overrideActive && (
            <button
              type="button"
              disabled={saving}
              className="fv-btn fv-btn--ghost text-xs text-muted-foreground"
              onClick={handleRevoke}
            >
              <X className="h-3 w-3 mr-1" />
              Revoke override
            </button>
          )}
          <button
            type="button"
            disabled={saving || !companyId}
            className="fv-btn fv-btn--primary text-xs"
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save override'}
          </button>
        </div>
      </div>
    </div>
  );
}
