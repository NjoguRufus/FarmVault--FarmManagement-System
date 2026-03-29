import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { usePermissions } from '@/hooks/usePermissions';
import { Harvest, Sale, Expense } from '@/types';
import { getExpenseCategoryLabel } from '@/lib/utils';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';

const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

export default function HarvestDetailsPage() {
  const { harvestId } = useParams<{ harvestId: string }>();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const { user } = useAuth();
  const { can } = usePermissions();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const scope = { companyScoped: true, companyId, isDeveloper };
  const canViewFinancials = can('harvest', 'viewFinancials');
  const canViewBuyerSection = can('harvest', 'viewBuyerSection') || canViewFinancials;

  const { data: allHarvests = [] } = useCollection<Harvest>('harvests', 'harvests', scope);
  const { data: allSales = [] } = useCollection<Sale>('sales', 'sales', scope);
  const { data: allExpenses = [] } = useCollection<Expense>('expenses', 'expenses', scope);

  const harvest = useMemo(
    () => allHarvests.find((h) => h.id === harvestId && (!activeProject || h.projectId === activeProject.id)),
    [allHarvests, harvestId, activeProject?.id],
  );

  useEffect(() => {
    if (!harvest?.id || !companyId) return;
    captureEvent(AnalyticsEvents.HARVEST_RECORD_VIEWED, {
      company_id: companyId,
      project_id: harvest.projectId,
      harvest_id: harvest.id,
      crop_type: String(harvest.cropType ?? ''),
      module_name: 'harvest',
      route_path: `/harvest-sales/harvest/${harvest.id}`,
    });
  }, [harvest?.id, harvest?.projectId, harvest?.cropType, companyId]);

  const harvestSales = useMemo(
    () => (harvestId ? allSales.filter((s) => s.harvestId === harvestId) : []),
    [allSales, harvestId],
  );

  const harvestExpenses = useMemo(() => {
    if (!harvestId) return [];
    const base = allExpenses.filter((e) => e.harvestId === harvestId);
    const isFrenchBeans =
      String(harvest?.cropType ?? '')
        .toLowerCase()
        .replace('_', '-') === 'french-beans';

    if (!isFrenchBeans || !harvest) {
      return base;
    }

    // For French beans, also include picker labour expenses that were created
    // from harvest wallet picker payments for this project.
    const pickerExpenses = allExpenses.filter(
      (e) =>
        e.projectId === harvest.projectId &&
        e.companyId === harvest.companyId &&
        (e.meta as any)?.source === 'harvest_wallet_picker_payment',
    );

    const extra = pickerExpenses.filter((e) => !base.some((b) => b.id === e.id));
    return [...base, ...extra];
  }, [allExpenses, harvestId, harvest]);

  const totalRevenue = harvestSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalExpensesAmount = harvestExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalAfterExpenses = totalRevenue - totalExpensesAmount;

  const sortedSales = useMemo(
    () => [...harvestSales].sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0)),
    [harvestSales],
  );

  const sortedExpenses = useMemo(
    () => [...harvestExpenses].sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0)),
    [harvestExpenses],
  );

  if (!harvestId || (!harvest && allHarvests.length > 0)) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          type="button"
          className="fv-btn fv-btn--secondary flex items-center gap-2"
          onClick={() => navigate('/harvest-sales')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-muted-foreground">Harvest not found.</p>
      </div>
    );
  }

  if (!harvest) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        type="button"
        className="fv-btn fv-btn--secondary flex items-center gap-2"
        onClick={() => navigate('/harvest-sales')}
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Harvest & Sales
      </button>

      <div className="fv-card p-4">
        <h2 className="text-xl font-semibold">
          Harvest • {harvest.quantity.toLocaleString()} {harvest.unit} • {harvest.cropType}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {formatDate(harvest.date)}
          {harvest.destination === 'market' && harvest.marketName && ` • ${harvest.marketName}`}
          {harvest.brokerName && ` • Broker: ${harvest.brokerName}`}
        </p>
      </div>

      {canViewFinancials && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="fv-card p-4">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="fv-card p-4">
            <p className="text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(totalExpensesAmount)}</p>
          </div>
          <div className="fv-card p-4">
            <p className="text-sm text-muted-foreground">After Expenses</p>
            <p className={cn('text-2xl font-bold mt-1', totalAfterExpenses >= 0 ? 'text-foreground' : 'text-destructive')}>
              {formatCurrency(totalAfterExpenses)}
            </p>
          </div>
        </div>
      )}

      {canViewBuyerSection ? (
      <div className="fv-card">
        <h3 className="text-lg font-semibold p-4 border-b">Sales</h3>
        {sortedSales.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No sales for this harvest.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedSales.map((s) => (
                  <tr key={s.id}>
                    <td className="text-muted-foreground">{formatDate(s.date)}</td>
                    <td className="font-medium">{s.buyerName}</td>
                    <td>{s.quantity.toLocaleString()} {s.unit ?? 'units'}</td>
                    <td>{formatCurrency(s.unitPrice)}</td>
                    <td className="font-semibold">{formatCurrency(s.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : (
      <div className="fv-card">
        <h3 className="text-lg font-semibold p-4 border-b">Sales</h3>
        <p className="p-4 text-sm text-muted-foreground">
          Sales details are restricted for your account.
        </p>
      </div>
      )}

      {canViewFinancials ? (
      <div className="fv-card">
        <h3 className="text-lg font-semibold p-4 border-b">Expenses</h3>
        {sortedExpenses.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No expenses for this harvest.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((e) => (
                  <tr key={e.id}>
                    <td className="text-muted-foreground">{formatDate(e.date)}</td>
                    <td>{getExpenseCategoryLabel(e.category)}</td>
                    <td>{e.description || '—'}</td>
                    <td className="font-semibold">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : (
      <div className="fv-card">
        <h3 className="text-lg font-semibold p-4 border-b">Expenses</h3>
        <p className="p-4 text-sm text-muted-foreground">
          Expense details are restricted for your account.
        </p>
      </div>
      )}
    </div>
  );
}
