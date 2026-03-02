import React, { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, CreditCard } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import {
  type SubscriptionPaymentDoc,
  approveSubscriptionPayment,
  rejectSubscriptionPayment,
} from '@/services/subscriptionPaymentService';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

export default function AdminPendingPaymentsPage() {
  const queryClient = useQueryClient();
  const { data: companies = [] } = useCollection<Company>(
    'admin-payments-companies',
    'companies',
    { companyScoped: false, isDeveloper: true },
  );
  const { data: payments = [], isLoading } = useCollection<SubscriptionPaymentDoc>(
    'admin-subscription-payments',
    'subscriptionPayments',
    { companyScoped: false, isDeveloper: true },
  );
  const [processingId, setProcessingId] = useState<string | null>(null);

  const pendingPayments = useMemo(
    () => payments.filter((p) => p.status === 'pending'),
    [payments],
  );

  const getCompanyName = (companyId: string, fallback?: string) => {
    const company = companies.find((c) => c.id === companyId);
    return company?.name ?? fallback ?? companyId;
  };

  const formatDate = (d: any) => {
    if (!d) return '—';
    if (d.toDate) return format(d.toDate(), 'PPp');
    if (d.seconds) return format(new Date(d.seconds * 1000), 'PPp');
    return '—';
  };

  const handleApprove = async (payment: SubscriptionPaymentDoc & { id: string }) => {
    setProcessingId(payment.id);
    try {
      await approveSubscriptionPayment(payment);
      await queryClient.invalidateQueries({ queryKey: ['admin-subscription-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-payments-companies'] });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (paymentId: string) => {
    setProcessingId(paymentId);
    try {
      await rejectSubscriptionPayment(paymentId);
      await queryClient.invalidateQueries({ queryKey: ['admin-subscription-payments'] });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pending Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manual M-Pesa subscription payments awaiting developer confirmation.
          </p>
        </div>
      </div>

      <div className="fv-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Loading pending payments…
          </div>
        ) : pendingPayments.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No pending payments at the moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Tx Code</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {getCompanyName(p.companyId, p.companyName)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.companyId}
                        </span>
                      </div>
                    </td>
                    <td className="capitalize">
                      {p.plan} · {p.mode}
                    </td>
                    <td>
                      KES {Number(p.amount).toLocaleString()}
                    </td>
                    <td>{p.mpesaName}</td>
                    <td>{p.phone}</td>
                    <td className="font-mono text-xs">{p.transactionCode}</td>
                    <td>{formatDate((p as any).createdAt)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="fv-btn fv-btn--secondary text-xs"
                          disabled={processingId === p.id}
                          onClick={() => handleReject(p.id!)}
                        >
                          {processingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          Reject
                        </button>
                        <button
                          type="button"
                          className="fv-btn fv-btn--primary text-xs"
                          disabled={processingId === p.id}
                          onClick={() => handleApprove(p as SubscriptionPaymentDoc & { id: string })}
                        >
                          {processingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Approve
                        </button>
                      </div>
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

