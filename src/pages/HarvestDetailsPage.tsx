import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useCollection } from '@/hooks/useCollection';
import { Harvest, Sale, Expense } from '@/types';
import { getExpenseCategoryLabel } from '@/lib/utils';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

export default function HarvestDetailsPage() {
  const { harvestId } = useParams<{ harvestId: string }>();
  const navigate = useNavigate();
  const { activeProject } = useProject();

  const { data: allHarvests = [] } = useCollection<Harvest>('harvests', 'harvests');
  const { data: allSales = [] } = useCollection<Sale>('sales', 'sales');
  const { data: allExpenses = [] } = useCollection<Expense>('expenses', 'expenses');

  const harvest = useMemo(
    () => allHarvests.find((h) => h.id === harvestId && (!activeProject || h.projectId === activeProject.id)),
    [allHarvests, harvestId, activeProject?.id],
  );

  const harvestSales = useMemo(
    () => (harvestId ? allSales.filter((s) => s.harvestId === harvestId) : []),
    [allSales, harvestId],
  );

  const harvestExpenses = useMemo(
    () => (harvestId ? allExpenses.filter((e) => e.harvestId === harvestId) : []),
    [allExpenses, harvestId],
  );

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
    </div>
  );
}
