import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrokerTomatoRealtime } from '@/hooks/useBrokerTomatoRealtime';
import { listBrokerTomatoExpenseLinesWithContext } from '@/services/brokerTomatoMarketService';
import { formatDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

function kes(n: number) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

export default function BrokerTomatoMarketExpensesPage() {
  const { user, authReady, companyDataQueriesEnabled } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const queryEnabled = Boolean(companyId) && authReady;

  useBrokerTomatoRealtime(companyId, queryClient);

  const {
    data: lines = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['broker-tomato-market-expenses', companyId ?? ''],
    queryFn: () => listBrokerTomatoExpenseLinesWithContext(companyId!),
    enabled: queryEnabled,
    retry: 1,
  });

  const total = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);

  const showNoCompany = authReady && !companyId;
  const showSyncNotice = Boolean(companyId) && authReady && !companyDataQueriesEnabled;

  return (
    <div className="space-y-6 px-3 sm:px-4 py-4 animate-fade-in max-w-3xl mx-auto lg:max-w-4xl">
      <div className="flex flex-wrap items-start gap-3">
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/broker')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground">Market expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tomato market costs across your assigned dispatches. Add or edit lines from each dispatch.
          </p>
        </div>
      </div>

      {showNoCompany && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Your account is not linked to a company workspace yet. Ask your admin to confirm your invitation.
        </div>
      )}

      {showSyncNotice && (
        <p className="text-xs text-muted-foreground text-center">
          Syncing your workspace session… If numbers look off, refresh in a moment.
        </p>
      )}

      {queryEnabled && (
        <>
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground">
              <Receipt className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total recorded</p>
              <p className="text-lg font-semibold tabular-nums">{kes(total)}</p>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-3" aria-hidden>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
              <p className="text-sm font-medium text-foreground">Could not load expenses</p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Something went wrong.'}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && lines.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
              <p className="text-base font-semibold text-foreground">No market expenses yet</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Open a dispatch from your dashboard and add expense lines there. They will appear in this list.
              </p>
            </div>
          )}

          {!isLoading && !isError && lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/broker/harvest/${line.market_dispatch_id}`)}
                    className={cn(
                      'w-full text-left rounded-xl border border-border/70 bg-card/70 p-4',
                      'hover:bg-muted/40 active:scale-[0.99] transition-colors touch-manipulation',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{line.category || 'Expense'}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {line.market_name ?? 'Market'}
                          {line.harvest_number != null ? ` · Harvest #${line.harvest_number}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {line.created_at ? `Recorded ${formatDate(line.created_at)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">{kes(line.amount)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
