import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  Filter,
  Search,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock4,
  ShieldCheck,
} from 'lucide-react';
import { where } from '@/lib/documentLayer';
import { useCollection } from '@/hooks/useCollection';
import type { CompanySubscriptionRecord } from '@/services/subscriptionAdminService';
import {
  type SubscriptionPaymentDoc,
  approveSubscriptionPayment,
  rejectSubscriptionPayment,
} from '@/services/subscriptionPaymentService';
import { useAdminSubscriptionPayments, type AdminPaymentsFilterState } from '@/hooks/useAdminSubscriptionPayments';
import { PaymentReviewDrawer } from '@/components/admin/billing/PaymentReviewDrawer';
import { OverrideModal } from '@/components/admin/billing/OverrideModal';

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function formatKES(amount: number): string {
  return `KES ${Number(amount || 0).toLocaleString()}`;
}

export default function AdminBillingPage() {
  const [filters, setFilters] = useState<AdminPaymentsFilterState>({
    status: 'pending',
    search: '',
    billingMode: 'all',
    plan: 'all',
    dateRange: '7',
  });

  const { payments, isLoading, isLoadingMore, hasMore, loadMore } =
    useAdminSubscriptionPayments(filters);

  const { data: subscriptions = [] } = useCollection<CompanySubscriptionRecord>(
    'admin-billing-subscriptions',
    'companySubscriptions',
    {
      companyScoped: false,
      isDeveloper: true,
    },
  );

  const { data: pendingPaymentsAll = [] } = useCollection<SubscriptionPaymentDoc>(
    'admin-billing-pending',
    'subscriptionPayments',
    {
      companyScoped: false,
      isDeveloper: true,
      constraints: [where('status', '==', 'pending')],
    },
  );

  const { data: approvedPaymentsRecent = [] } = useCollection<SubscriptionPaymentDoc>(
    'admin-billing-approved',
    'subscriptionPayments',
    {
      companyScoped: false,
      isDeveloper: true,
      constraints: [where('status', '==', 'approved')],
      orderByField: 'createdAt',
      orderByDirection: 'desc',
      limitCount: 200,
    },
  );

  const { data: activeOverrides = [] } = useCollection<any>(
    'admin-billing-overrides',
    'companySubscriptions',
    {
      companyScoped: false,
      isDeveloper: true,
      constraints: [where('override.enabled', '==', true)],
    },
  );

  const { pendingCount, approvedTodayCount, totalApprovedThisMonth, activeOverridesCount } =
    useMemo(() => {
      const pendingCount = pendingPaymentsAll.length;
      const now = new Date();

      let approvedToday = 0;
      let totalApprovedThisMonth = 0;

      approvedPaymentsRecent.forEach((p) => {
        const approvedAt = toDate((p as any).approvedAt ?? (p as any).createdAt);
        if (!approvedAt) return;
        if (
          approvedAt.getFullYear() === now.getFullYear() &&
          approvedAt.getMonth() === now.getMonth()
        ) {
          totalApprovedThisMonth += Number(p.amount || 0);
          if (approvedAt.getDate() === now.getDate()) {
            approvedToday += 1;
          }
        }
      });

      const activeOverridesCount = activeOverrides.length;

      return {
        pendingCount,
        approvedTodayCount: approvedToday,
        totalApprovedThisMonth,
        activeOverridesCount,
      };
    }, [pendingPaymentsAll, approvedPaymentsRecent, activeOverrides]);

  const trialMetaByCompanyId = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        isActive: boolean;
      }
    >();
    const now = new Date();
    subscriptions.forEach((s: any) => {
      const companyId = s.companyId || s.id;
      if (!companyId) return;
      if (s.status !== 'trial') return;
      const trialEnds = toDate(s.trialEndsAt);
      let label = 'On free trial';
      let isActive = true;
      if (trialEnds) {
        const diffMs = trialEnds.getTime() - now.getTime();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (days > 0) {
          label = `${days} day${days === 1 ? '' : 's'} left in trial`;
        } else {
          label = 'Trial ended';
          isActive = false;
        }
      }
      map.set(companyId, { label, isActive });
    });
    return map;
  }, [subscriptions]);

  const [selectedPayment, setSelectedPayment] =
    useState<(SubscriptionPaymentDoc & { id: string }) | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideCompanyId, setOverrideCompanyId] = useState<string | null>(null);
  const [overrideCompanyName, setOverrideCompanyName] = useState<string | null>(null);

  const handleRowClick = (payment: SubscriptionPaymentDoc & { id: string }) => {
    setSelectedPayment(payment);
    setDrawerOpen(true);
  };

  const handleApprove = async (
    payment: SubscriptionPaymentDoc & { id: string },
    note: string,
  ) => {
    await approveSubscriptionPayment(payment, note);
  };

  const handleReject = async (paymentId: string, note: string) => {
    await rejectSubscriptionPayment(paymentId, note);
  };

  const handleGrantOverride = (companyId: string) => {
    setOverrideCompanyId(companyId);
    const payment = selectedPayment;
    setOverrideCompanyName(payment?.companyName ?? null);
    setOverrideOpen(true);
  };

  const handleStatusChange = (status: 'pending' | 'approved' | 'rejected') => {
    setFilters((prev) => ({ ...prev, status }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value }));
  };

  const handleBillingModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters((prev) => ({
      ...prev,
      billingMode: e.target.value as AdminPaymentsFilterState['billingMode'],
    }));
  };

  const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters((prev) => ({
      ...prev,
      plan: e.target.value as AdminPaymentsFilterState['plan'],
    }));
  };

  const handleDateRangeChange = (range: AdminPaymentsFilterState['dateRange']) => {
    setFilters((prev) => ({ ...prev, dateRange: range }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Billing admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approve manual M-Pesa subscription payments, manage overrides, and keep billing
            in sync.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <Clock4 className="h-6 w-6 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Pending payments
            </p>
            <p className="text-xl font-bold text-foreground">{pendingCount}</p>
            <p className="text-[11px] text-muted-foreground">Awaiting review</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Approved today
            </p>
            <p className="text-xl font-bold text-foreground">{approvedTodayCount}</p>
            <p className="text-[11px] text-muted-foreground">Payments activated</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Approved this month
            </p>
            <p className="text-xl font-bold text-foreground">
              {formatKES(totalApprovedThisMonth)}
            </p>
            <p className="text-[11px] text-muted-foreground">All companies</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-gold-soft">
            <ShieldCheck className="h-6 w-6 text-fv-olive" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Active overrides
            </p>
            <p className="text-xl font-bold text-foreground">{activeOverridesCount}</p>
            <p className="text-[11px] text-muted-foreground">Developer granted</p>
          </div>
        </div>
      </div>

      <div className="fv-card space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-1 py-1 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-border/70">
              <Filter className="h-3 w-3" />
              Filters
            </span>
            <button
              type="button"
              className={`px-2 py-1 rounded-full ${
                filters.status === 'pending'
                  ? 'bg-amber-500 text-white'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => handleStatusChange('pending')}
            >
              Pending
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded-full ${
                filters.status === 'approved'
                  ? 'bg-emerald-600 text-white'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => handleStatusChange('approved')}
            >
              Approved
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded-full ${
                filters.status === 'rejected'
                  ? 'bg-slate-700 text-white'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => handleStatusChange('rejected')}
            >
              Rejected
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="fv-input pl-8 h-9 text-sm"
                placeholder="Search company or payer…"
                value={filters.search}
                onChange={handleSearchChange}
              />
            </div>
            <select
              className="fv-input h-9 text-xs sm:text-sm"
              value={filters.billingMode}
              onChange={handleBillingModeChange}
            >
              <option value="all">All billing modes</option>
              <option value="monthly">Monthly</option>
              <option value="seasonal">Seasonal</option>
              <option value="annual">Annual</option>
            </select>
            <select
              className="fv-input h-9 text-xs sm:text-sm"
              value={filters.plan}
              onChange={handlePlanChange}
            >
              <option value="all">All plans</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock4 className="h-3 w-3" />
            Date range:
          </span>
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              filters.dateRange === '7'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-muted'
            }`}
            onClick={() => handleDateRangeChange('7')}
          >
            Last 7 days
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              filters.dateRange === '30'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-muted'
            }`}
            onClick={() => handleDateRangeChange('30')}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              filters.dateRange === 'all'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-muted'
            }`}
            onClick={() => handleDateRangeChange('all')}
          >
            All time
          </button>
        </div>
      </div>

      <div className="fv-card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Payments
          </h2>
          <p className="text-xs text-muted-foreground">
            Showing {payments.length}{' '}
            {filters.status === 'pending'
              ? 'pending'
              : filters.status === 'approved'
              ? 'approved'
              : 'rejected'}{' '}
            payments
          </p>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading payments…
          </div>
        ) : payments.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No payments found for the selected filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="fv-table">
                <thead>
                <tr>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Plan &amp; mode</th>
                  <th>Amount</th>
                  <th>Payer</th>
                  <th>Trial</th>
                  <th>Status</th>
                  <th></th>
                </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const createdAt = toDate((p as any).createdAt);
                    const dateLabel = createdAt
                      ? createdAt.toLocaleString()
                      : '—';
                    const planLabel = p.planName ?? p.plan;
                    const modeLabel = (p.billingMode ?? p.mode)?.toString();

                    const statusBadge =
                      p.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Approved
                        </span>
                      ) : p.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-100 border border-slate-600">
                          <XCircle className="h-3 w-3" />
                          Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                          <Clock4 className="h-3 w-3" />
                          Pending
                        </span>
                      );

                    const trialMeta = trialMetaByCompanyId.get(p.companyId);

                    return (
                      <tr
                        key={p.id}
                        className="cursor-pointer hover:bg-muted/60"
                        onClick={() => handleRowClick(p)}
                      >
                        <td className="whitespace-nowrap text-xs">{dateLabel}</td>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground text-sm">
                              {p.companyName || p.companyId}
                            </span>
                            <span className="text-[11px] text-muted-foreground break-all">
                              {p.companyId}
                            </span>
                          </div>
                        </td>
                        <td className="text-sm">
                          <span className="font-medium capitalize">{planLabel}</span>
                          <span className="text-xs text-muted-foreground">
                            {' '}
                            · {modeLabel}
                          </span>
                        </td>
                        <td className="text-sm font-medium">
                          {formatKES(Number(p.amount || 0))}
                        </td>
                        <td className="text-sm">
                          <div className="flex flex-col">
                            <span>{p.mpesaPayerName || p.mpesaName}</span>
                            {p.mpesaPhone || p.phone ? (
                              <span className="text-[11px] text-muted-foreground">
                                {p.mpesaPhone || p.phone}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-xs text-muted-foreground whitespace-nowrap">
                          {trialMeta ? trialMeta.label : '—'}
                        </td>
                        <td>{statusBadge}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                          >
                            Review
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center mt-4">
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary text-xs"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading more…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <PaymentReviewDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        payment={selectedPayment}
        onApprove={handleApprove}
        onReject={handleReject}
        onGrantOverride={handleGrantOverride}
      />

      <OverrideModal
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        companyId={overrideCompanyId}
        companyName={overrideCompanyName}
      />
    </div>
  );
}

