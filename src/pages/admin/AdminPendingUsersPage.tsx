import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { where } from '@/lib/firestore-stub';
import { Clock, ArrowRight, CreditCard } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import type { SubscriptionPaymentDoc } from '@/services/subscriptionPaymentService';

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const t = value as { toDate?: () => Date; seconds?: number };
  if (typeof t.toDate === 'function') return t.toDate();
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000);
  return null;
}

export default function AdminPendingUsersPage() {
  const { data: companies = [], isLoading: companiesLoading } = useCollection<Company>(
    'admin-pending-companies',
    'companies',
    { companyScoped: false, isDeveloper: true },
  );

  const { data: pendingPayments = [] } = useCollection<SubscriptionPaymentDoc>(
    'admin-pending-companies-payments',
    'subscriptionPayments',
    {
      companyScoped: false,
      isDeveloper: true,
      constraints: [where('status', '==', 'pending')],
    },
  );

  const pendingPaymentByCompanyId = useMemo(() => {
    const map = new Map<string, SubscriptionPaymentDoc & { id: string }>();
    pendingPayments.forEach((p) => {
      if (p.companyId && (p as { id?: string }).id) {
        map.set(p.companyId, p as SubscriptionPaymentDoc & { id: string });
      }
    });
    return map;
  }, [pendingPayments]);

  const trialCompanies = useMemo(() => {
    const now = new Date();
    return companies
      .filter((c) => {
        const sub = (c as any).subscription;
        const plan = sub?.plan ?? (c as any).subscriptionPlan;
        return plan === 'trial' || (sub && sub.trialEndsAt);
      })
      .map((c) => {
        const sub = (c as any).subscription;
        const trialEndsAt = toDate(sub?.trialEndsAt);
        let daysRemaining: number | null = null;
        let trialLabel = 'On free trial';
        if (trialEndsAt) {
          const diffMs = trialEndsAt.getTime() - now.getTime();
          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (daysRemaining > 0) {
            trialLabel = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`;
          } else {
            trialLabel = 'Trial ended';
          }
        }
        const pendingPayment = pendingPaymentByCompanyId.get(c.id);
        return {
          company: c,
          trialLabel,
          daysRemaining,
          pendingPayment,
        };
      })
      .sort((a, b) => {
        const aPay = a.pendingPayment ? 1 : 0;
        const bPay = b.pendingPayment ? 1 : 0;
        if (bPay !== aPay) return bPay - aPay;
        return (b.daysRemaining ?? 0) - (a.daysRemaining ?? 0);
      });
  }, [companies, pendingPaymentByCompanyId]);

  const isLoading = companiesLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Billing Confirmation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Companies on free trial. See days remaining and approve or reject their payment when submitted.
          </p>
        </div>
        <Link
          to="/admin/billing"
          className="fv-btn fv-btn--secondary text-sm inline-flex items-center gap-2"
        >
          <CreditCard className="h-4 w-4" />
          Billing admin
        </Link>
      </div>

      <div className="fv-card">
        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading…</p>
        )}
        {!isLoading && trialCompanies.length === 0 && (
          <p className="text-sm text-muted-foreground mb-4">
            No companies on free trial right now.
          </p>
        )}
        {!isLoading && trialCompanies.length > 0 && (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Trial</th>
                  <th>Payment submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trialCompanies.map(({ company, trialLabel, pendingPayment }) => (
                  <tr key={company.id}>
                    <td>
                      <span className="font-medium text-foreground">{company.name ?? company.id}</span>
                      <span className="block text-[11px] text-muted-foreground break-all">
                        {company.id}
                      </span>
                    </td>
                    <td className="text-sm">{(company as any).email ?? '—'}</td>
                    <td className="text-sm">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {trialLabel}
                      </span>
                    </td>
                    <td className="text-sm">
                      {pendingPayment ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                          Yes — Pending
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="text-right">
                      {pendingPayment ? (
                        <Link
                          to="/admin/billing"
                          className="fv-btn fv-btn--primary text-xs inline-flex items-center gap-1"
                        >
                          Review &amp; approve
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

