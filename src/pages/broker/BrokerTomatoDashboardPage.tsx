import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, TrendingUp, Receipt, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import {
  listBrokerTomatoDispatchesWithSessions,
  sumCratesSoldByDispatchIds,
} from '@/services/brokerTomatoMarketService';
import { useBrokerTomatoRealtime } from '@/hooks/useBrokerTomatoRealtime';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';

function kes(n: number) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

export default function BrokerTomatoDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;

  useBrokerTomatoRealtime(companyId, queryClient);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['broker-tomato-dispatches', companyId ?? ''],
    queryFn: () => listBrokerTomatoDispatchesWithSessions(companyId!),
    enabled: Boolean(companyId),
  });

  const dispatchIds = useMemo(() => rows.map((r) => r.dispatch.id), [rows]);

  const { data: soldMap } = useQuery({
    queryKey: ['broker-tomato-crates-sold', companyId ?? '', dispatchIds.join('|')],
    queryFn: () => sumCratesSoldByDispatchIds(companyId!, dispatchIds),
    enabled: Boolean(companyId) && dispatchIds.length > 0,
  });

  const totals = useMemo(() => {
    let rev = 0;
    let exp = 0;
    let net = 0;
    for (const { dispatch } of rows) {
      rev += Number(dispatch.broker_sales_revenue ?? dispatch.total_revenue ?? 0);
      exp += Number(dispatch.market_expenses_total ?? 0);
      net += Number(dispatch.net_market_profit ?? 0);
    }
    return { rev, exp, net };
  }, [rows]);

  return (
    <div className="space-y-6 px-3 sm:px-4 py-4 animate-fade-in max-w-3xl mx-auto lg:max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">My markets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tomato dispatches assigned to you — record buyers and market expenses.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Revenue"
          value={kes(totals.rev)}
          icon={TrendingUp}
          iconVariant="success"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Expenses"
          value={kes(totals.exp)}
          icon={Receipt}
          iconVariant="gold"
          layout="mobile-compact"
        />
        <SimpleStatCard
          title="Net"
          value={kes(totals.net)}
          icon={Wallet}
          iconVariant={totals.net >= 0 ? 'info' : 'destructive'}
          layout="mobile-compact"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Assigned harvests
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No market dispatches assigned yet. Your manager assigns a broker on the tomato harvest session.
          </div>
        )}
        <div className="grid gap-3">
          {rows.map(({ dispatch, session }) => {
            const sold = soldMap?.get(dispatch.id) ?? 0;
            const sent = dispatch.containers_sent ?? 0;
            const harvestNo = session?.harvest_number ?? '—';
            const net = Number(dispatch.net_market_profit ?? 0);
            const rev = Number(dispatch.broker_sales_revenue ?? dispatch.total_revenue ?? 0);
            return (
              <button
                key={dispatch.id}
                type="button"
                onClick={() => navigate(`/broker/harvest/${dispatch.id}`)}
                className={cn(
                  'w-full text-left rounded-xl border border-border/70 bg-card/70 p-4',
                  'hover:bg-muted/40 active:scale-[0.99] transition-colors touch-manipulation',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">Tomatoes · Harvest #{harvestNo}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{dispatch.market_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {session?.session_date ? formatDate(session.session_date) : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      dispatch.status === 'completed'
                        ? 'bg-fv-success/15 text-fv-success'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                    )}
                  >
                    {dispatch.status === 'completed' ? 'Done' : 'Open'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Sold {sold}
                      {sent > 0 ? ` / ${sent}` : ''} crates
                    </span>
                  </div>
                  <div className="text-right font-medium tabular-nums text-foreground">{kes(rev)}</div>
                  <div className="text-muted-foreground">Net</div>
                  <div
                    className={cn(
                      'text-right font-semibold tabular-nums',
                      net >= 0 ? 'text-fv-success' : 'text-destructive',
                    )}
                  >
                    {kes(net)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
