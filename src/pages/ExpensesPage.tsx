import React, { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Download, MoreHorizontal, Calendar as CalendarIcon, Receipt, Loader2 } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ExpensesBarChart } from '@/components/dashboard/ExpensesBarChart';
import { FeatureGate } from '@/components/subscription';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getFinanceExpenses, createFinanceExpense } from '@/services/financeExpenseService';
import { Expense, ExpenseCategory, CropStage, WorkLog } from '@/types';
import { BROKER_EXPENSE_CATEGORIES } from '@/types';
import { getExpenseCategoryLabel } from '@/lib/utils';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
import { Wrench, CheckCircle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toDate, formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csv/downloadCsv';
import { usePermissions } from '@/hooks/usePermissions';
import { getHarvestPickersByIds, getRecentPayoutsSummary, getCollectionPayoutDetail, getHarvestCollection, listHarvestCollections, type RecentPayoutSummary, type CollectionPayoutDetail } from '@/services/harvestCollectionsService';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { formatKes } from '@/components/reports/analyticsFormat';
import { renderReport } from '@/lib/pdf/renderReport';
import { printHtmlReport } from '@/lib/pdf/printHtmlReport';
import { getCompany } from '@/services/companyService';

type ExpenseWithSyncState = Expense & {
  pending?: boolean;
  fromCache?: boolean;
};

type PickerPaymentGroup = {
  collectionId: string;
  displayName: string;
  totalAmount: number;
  latestDate: Date;
  expenses: ExpenseWithSyncState[];
};

function PickerPaymentDetailContent({
  group,
  formatCurrency,
  formatDate,
}: {
  group: PickerPaymentGroup;
  formatCurrency: (n: number) => string;
  formatDate: (d: Date | unknown) => string;
  onClose: () => void;
}) {
  const [pickersMap, setPickersMap] = useState<Record<string, { pickerNumber?: number; pickerName?: string; totalPay?: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = Array.from(
      new Set(group.expenses.flatMap((e) => e.meta?.pickerIds ?? []))
    );
    if (!ids.length) {
      setPickersMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    getHarvestPickersByIds(ids)
      .then((list) => {
        const map: Record<string, { pickerNumber?: number; pickerName?: string; totalPay?: number }> = {};
        list.forEach((p) => {
          map[p.id] = {
            pickerNumber: p.pickerNumber,
            pickerName: p.pickerName,
            totalPay: p.totalPay,
          };
        });
        setPickersMap(map);
      })
      .finally(() => setLoading(false));
  }, [group.collectionId, group.expenses]);

  const batches = useMemo(() => {
    return [...group.expenses].sort((a, b) => {
      const ta = toDate(a.date)?.getTime() ?? 0;
      const tb = toDate(b.date)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [group.expenses]);

  return (
    <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pickers…</p>
      ) : (
        batches.map((expense, idx) => {
          const pickerIds = expense.meta?.pickerIds ?? [];
          const pickers = pickerIds
            .map((id) => ({ id, ...pickersMap[id] }))
            .filter((p) => p.id);
          const isGroup = pickers.length > 1;
          return (
            <div key={expense.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {isGroup ? `Group payment` : `Payment`} — {formatDate(expense.date)}
                </span>
                <span className="font-semibold">{formatCurrency(expense.amount)}</span>
              </div>
              <ul className="space-y-1.5 text-sm">
                {pickers.map((p) => (
                  <li key={p.id} className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      #{p.pickerNumber ?? '—'} {p.pickerName ?? 'Unknown'}
                    </span>
                    <span>{p.totalPay != null ? formatCurrency(p.totalPay) : '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function ExpensesPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ['financeExpenses', companyId ?? '', activeProject?.id ?? ''],
    queryFn: () => getFinanceExpenses(companyId ?? '', activeProject?.id ?? null),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (!companyId) return;
    captureEvent(AnalyticsEvents.EXPENSE_VIEWED, {
      company_id: companyId,
      project_id: activeProject?.id,
      module_name: 'expenses',
      route_path: '/expenses',
    });
  }, [companyId, activeProject?.id]);

  // Stages and work logs still used for stage detection in expense form
  const allStages: CropStage[] = [];
  const allWorkLogs: WorkLog[] = [];

  // Filter expenses based on user role
  // Brokers should only see expenses they incurred (related to their sales activities)
  const isBroker = useMemo(() => {
    if (!user) return false;
    if (user.role === 'broker') return true;
    if (user.role === 'employee') {
      // Check if employee role is broker-related
      const employeeRole = (user as any).employeeRole;
      return employeeRole === 'sales-broker' || employeeRole === 'broker';
    }
    return false;
  }, [user]);

  const expenses = useMemo(() => {
    let filtered = activeProject
      ? allExpenses.filter(e => e.projectId === activeProject.id)
      : allExpenses;

    // When no project selected, scope to current user's company so labour/work card expenses show
    if (!activeProject && user?.companyId) {
      filtered = filtered.filter(e => e.companyId === user.companyId);
    }

    // For brokers, only show expenses they paid for (related to their sales work)
    if (isBroker && user) {
      filtered = filtered.filter(e => e.paidBy === user.id);
    }

    return filtered;
  }, [allExpenses, activeProject, isBroker, user]);

  const filteredExpenses = expenses.filter((e) => {
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesSearch =
      !search ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase());
    const d = toDate(e.date);
    const inRange =
      !dateRange ||
      (!dateRange.from && !dateRange.to) ||
      (( !dateRange.from || d >= dateRange.from ) && ( !dateRange.to || d <= dateRange.to ));
    return matchesCategory && matchesSearch && inRange;
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Group picker labour expenses by harvest collection for "Recent Expenses" (one row per collection)
  // Note: This is used as a fallback; recentPayouts from picker_payment_entries is preferred
  const pickerPaymentGroups = useMemo(() => {
    const pickerExpenses = filteredExpenses.filter(
      (e) => (e.meta?.source === 'harvest_wallet_picker_payment' && e.meta?.harvestCollectionId)
    ) as ExpenseWithSyncState[];
    const byCollection = new Map<
      string,
      { collectionId: string; displayName: string; totalAmount: number; latestDate: Date; expenses: ExpenseWithSyncState[] }
    >();
    pickerExpenses.forEach((e) => {
      const cid = e.meta!.harvestCollectionId!;
      const existing = byCollection.get(cid);
      const d = toDate(e.date);
      const t = d ? d.getTime() : 0;
      if (!existing) {
        byCollection.set(cid, {
          collectionId: cid,
          displayName: '', // Will be resolved later with collectionNameMap
          totalAmount: e.amount,
          latestDate: d || new Date(0),
          expenses: [e],
        });
      } else {
        existing.totalAmount += e.amount;
        existing.expenses.push(e);
        if (t > existing.latestDate.getTime()) existing.latestDate = d || existing.latestDate;
      }
    });
    return Array.from(byCollection.values()).sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
  }, [filteredExpenses]);

  const { data: recentPayouts = [] } = useQuery({
    queryKey: ['recentPayouts', companyId ?? '', activeProject?.id ?? ''],
    queryFn: () => getRecentPayoutsSummary(companyId ?? '', activeProject?.id ?? null),
    enabled: Boolean(companyId),
    staleTime: 60000,
  });

  // Fetch harvest collections for friendly labels on picker payouts
  const { data: harvestCollections = [] } = useQuery({
    queryKey: ['harvestCollections', companyId ?? '', activeProject?.id ?? ''],
    queryFn: () => listHarvestCollections(companyId ?? '', activeProject?.id ?? null),
    enabled: Boolean(companyId),
    staleTime: 60000,
  });
  
  // Map collection IDs to friendly names
  const collectionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    harvestCollections.forEach((c) => {
      const name = (c.name ?? '').trim();
      const date = c.harvestDate ? formatDate(toDate(c.harvestDate)) : '';
      const friendlyName = name || (date ? `Collection ${date}` : c.id.slice(0, 8));
      map.set(c.id, friendlyName);
    });
    return map;
  }, [harvestCollections]);

  const [payoutDetailCollectionId, setPayoutDetailCollectionId] = useState<string | null>(null);
  const { data: payoutDetail, isLoading: payoutDetailLoading } = useQuery({
    queryKey: ['collectionPayoutDetail', payoutDetailCollectionId],
    queryFn: () => getCollectionPayoutDetail(payoutDetailCollectionId!),
    enabled: Boolean(payoutDetailCollectionId),
  });

  // Recent table rows: harvest payouts (from picker_payment_entries) + picker groups from expenses + other expenses
  const recentTableRows = useMemo(() => {
    const pickerIds = new Set(
      filteredExpenses
        .filter((e) => e.meta?.source === 'harvest_wallet_picker_payment')
        .map((e) => e.id)
    );
    const others = filteredExpenses.filter((e) => !pickerIds.has(e.id));
    const payoutCollectionIds = new Set((recentPayouts ?? []).map((p) => p.collectionId));
    const harvestPayoutRows = (recentPayouts ?? []).map((p) => ({
      type: 'harvest_payout' as const,
      key: `payout-${p.collectionId}`,
      collectionId: p.collectionId,
      collectionName: p.collectionName,
      totalPaid: p.totalPaid,
      harvestDate: p.harvestDate,
      pickersPaidCount: p.pickersPaidCount,
    }));
    const groupRows = pickerPaymentGroups
      .filter((g) => !payoutCollectionIds.has(g.collectionId))
      .map((g) => {
        const friendlyName = collectionNameMap.get(g.collectionId) || `Collection ${g.collectionId.slice(0, 8)}`;
        return {
          type: 'picker_group' as const,
          key: `picker-${g.collectionId}`,
          ...g,
          displayName: friendlyName,
        };
      });
    const expenseRows = others.map((e) => ({ type: 'expense' as const, key: e.id, expense: e }));
    const combined = [...harvestPayoutRows, ...groupRows, ...expenseRows];
    combined.sort((a, b) => {
      let tA = 0;
      let tB = 0;
      if (a.type === 'harvest_payout') tA = a.harvestDate ? new Date(a.harvestDate).getTime() : 0;
      else if (a.type === 'picker_group') tA = a.latestDate ? a.latestDate.getTime() : 0;
      else tA = toDate(a.expense.date)?.getTime() ?? 0;
      if (b.type === 'harvest_payout') tB = b.harvestDate ? new Date(b.harvestDate).getTime() : 0;
      else if (b.type === 'picker_group') tB = b.latestDate ? b.latestDate.getTime() : 0;
      else tB = toDate(b.expense.date)?.getTime() ?? 0;
      return tB - tA;
    });
    return combined;
  }, [filteredExpenses, pickerPaymentGroups, recentPayouts, collectionNameMap]);

  // Broker expense categories (for admin view)
  const brokerCategoryValues = useMemo(
    () => new Set(BROKER_EXPENSE_CATEGORIES.map((c) => c.value)),
    [],
  );
  const brokerExpenses = useMemo(
    () => expenses.filter((e) => brokerCategoryValues.has(e.category as ExpenseCategory)),
    [expenses, brokerCategoryValues],
  );
  const brokerExpensesTotal = brokerExpenses.reduce((sum, e) => sum + e.amount, 0);

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      labour: 'bg-fv-success/20 text-fv-success',
      fertilizer: 'bg-fv-gold-soft text-fv-olive',
      chemical: 'bg-fv-warning/20 text-fv-warning',
      fuel: 'bg-fv-info/20 text-fv-info',
      other: 'bg-muted text-muted-foreground',
    };
    return colors[category] || 'bg-muted text-muted-foreground';
  };

  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddOpen(true);
      setSearchParams((p) => {
        p.delete('add');
        return p;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('labour');
  const [customCategory, setCustomCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [labourExpensesOpen, setLabourExpensesOpen] = useState(false);
  const [brokerExpensesOpen, setBrokerExpensesOpen] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [pickerPaymentDetailGroup, setPickerPaymentDetailGroup] = useState<{
    collectionId: string;
    displayName: string;
    totalAmount: number;
    latestDate: Date;
    expenses: ExpenseWithSyncState[];
  } | null>(null);
  
  // Labor payout drawer state
  const [laborPayoutDrawerCollectionId, setLaborPayoutDrawerCollectionId] = useState<string | null>(null);
  const { data: laborPayoutDetail, isLoading: laborPayoutDetailLoading } = useQuery({
    queryKey: ['laborPayoutDetail', laborPayoutDrawerCollectionId],
    queryFn: () => getCollectionPayoutDetail(laborPayoutDrawerCollectionId!),
    enabled: Boolean(laborPayoutDrawerCollectionId),
  });
  
  const canCreateExpense = can('expenses', 'create');
  const canApproveExpense = can('expenses', 'approve');
  const canExportExpenseReport = can('reports', 'export');

  const isTomatoesProject = activeProject?.cropType === 'tomatoes';
  const showBrokerExpensesButton = !isBroker && isTomatoesProject;

  const { canWrite, isTrial, isExpired, daysRemaining } = useSubscriptionStatus();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Get unpaid work logs for the active project
  const unpaidWorkLogs = useMemo(() => {
    if (!activeProject) return [];
    return allWorkLogs.filter(
      (w) =>
        w.projectId === activeProject.id &&
        w.companyId === activeProject.companyId &&
        !w.paid &&
        w.totalPrice != null &&
        w.totalPrice > 0
    ).sort((a, b) => {
      const dateA = toDate(a.date);
      const dateB = toDate(b.date);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [allWorkLogs, activeProject]);

  const currentStage = useMemo(() => {
    if (!activeProject) return null;
    const stages = allStages.filter(
      (s) =>
        s.projectId === activeProject.id &&
        s.companyId === activeProject.companyId &&
        s.cropType === activeProject.cropType,
    );
    if (!stages.length) return null;
    const today = new Date();
    const inProgress = stages.find((s) => {
      const start = s.startDate ? new Date(s.startDate) : undefined;
      const end = s.endDate ? new Date(s.endDate) : undefined;
      if (!start || !end) return false;
      return start <= today && today <= end;
    });
    if (inProgress) return { stageIndex: inProgress.stageIndex, stageName: inProgress.stageName };
    const sorted = [...stages].sort((a, b) => a.stageIndex - b.stageIndex);
    return { stageIndex: sorted[0].stageIndex, stageName: sorted[0].stageName };
  }, [allStages, activeProject]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      setUpgradeOpen(true);
      return;
    }
    if (!canCreateExpense) {
      toast.error('Permission denied', { description: 'You cannot create expenses.' });
      return;
    }
    if (!activeProject) return;
    setSaving(true);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    setAddOpen(false);
    try {
      const categoryToSave =
        category === 'other' && customCategory.trim()
          ? customCategory.trim()
          : category;
      const amountNum = Number(amount || '0');

      await createFinanceExpense({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        category: categoryToSave,
        amount: amountNum,
        note: description || null,
        expenseDate: new Date().toISOString().slice(0, 10),
        createdBy: user?.id ?? null,
      });

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });

      setDescription('');
      setAmount('');
      setCategory('labour');
      setCustomCategory('');
      toast.success('Expense added.');
    } catch (error) {
      console.error('Failed to add expense:', error);
      toast.error('Failed to add expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkWorkLogAsPaid = async (log: WorkLog) => {
    if (!canApproveExpense) {
      toast.error('Permission denied', { description: 'You cannot approve labour expenses.' });
      return;
    }
    if (!canWrite) {
      setUpgradeOpen(true);
      return;
    }
    if (!activeProject || !user || !log.id || !log.totalPrice) return;
    setMarkingPaid(log.id);
    try {
      // Create labour expense in Supabase
      await createFinanceExpense({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        category: 'labour',
        amount: log.totalPrice,
        note: `Labour - ${log.workCategory} on ${formatDate(log.date)}`,
        expenseDate: log.date ? new Date(log.date as any).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        createdBy: user.id,
      });

      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });

      toast.success('Work log marked as paid.');
    } catch (error) {
      console.error('Failed to mark work log as paid:', error);
      toast.error('Failed to mark as paid.');
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleExport = () => {
    if (!canExportExpenseReport) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    toast.message('Choose CSV or PDF export above.');
  };

  const handleExportExpensesCsv = () => {
    if (!canExportExpenseReport) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    const rows = filteredExpenses.map((expense) => ({
      Date: formatDate(expense.date),
      Category: expense.category,
      Amount: expense.amount,
      Supplier: (expense as any)?.supplierName ?? '',
      Crop: expense.cropType ?? '',
      Notes: expense.description ?? '',
    }));
    if (!rows.length) {
      toast.error('No expenses to export.');
      return;
    }
    downloadCsv(rows, 'farmvault-expenses');
    captureEvent(AnalyticsEvents.REPORT_EXPORTED_EXCEL, {
      company_id: companyId ?? undefined,
      project_id: activeProject?.id,
      report_type: 'expenses-csv',
      module_name: 'expenses',
    });
    toast.success('Expenses CSV exported.');
  };

  const handleExportExpensesPdf = async () => {
    if (!canExportExpenseReport) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (!filteredExpenses.length) {
      toast.error('No expenses to export.');
      return;
    }

    const dateRangeLabel = dateRange?.from || dateRange?.to
      ? `${dateRange?.from ? formatDate(dateRange.from) : '—'} → ${dateRange?.to ? formatDate(dateRange.to) : '—'}`
      : 'All time';

    const total = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const tx = filteredExpenses.length;
    const avg = tx ? total / tx : 0;
    const byCategory = Object.entries(
      filteredExpenses.reduce<Record<string, number>>((acc, e) => {
        const key = String(e.category ?? 'Other');
        acc[key] = (acc[key] || 0) + Number(e.amount ?? 0);
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

    const top = byCategory[0] ?? ['—', 0];

    const badgeForExpenseCategory = (cat: string) => {
      const c = String(cat || '').toLowerCase();
      if (c.includes('labour') || c.includes('labor')) return 'badge-green';
      if (c.includes('input') || c.includes('fert') || c.includes('chem')) return 'badge-gold';
      return 'badge-gray';
    };

    const company = companyId ? await getCompany(companyId) : null;
    const html = renderReport({
      company: {
        name: company?.name ?? (user as any)?.companyName ?? 'FarmVault Company',
        location: String((company as any)?.location ?? ''),
        website: String((company as any)?.website ?? 'farmvault.africa'),
        email: company?.email ?? '',
        phone: String((company as any)?.phone ?? ''),
        logo: String((company as any)?.logo_url ?? (company as any)?.logo ?? ''),
      },
      report: {
        key: 'expenses',
        title: 'Expenses Report',
        dateRange: dateRangeLabel,
        generatedAt: new Date().toLocaleString(),
      },
      stats: {
        total_expenses: formatKes(total),
        transactions: `${tx}`,
        avg_expense: formatKes(avg),
        top_category: String(top[0]),
        top_category_amount: formatKes(Number(top[1] ?? 0)),
      },
      rows: filteredExpenses.map((e) => ({
        date: formatDate(e.date),
        category: `<span class="badge ${badgeForExpenseCategory(String(e.category ?? ''))}">${String(e.category ?? '')}</span>`,
        item: String(e.description ?? ''),
        supplier: String((e as any)?.supplierName ?? '—'),
        crop: String(e.cropType ?? '—'),
        notes: String(e.description ?? ''),
        amount: `${Number(e.amount ?? 0).toLocaleString()}`,
      })),
      totals: {
        transactions: tx,
        total_amount: `${Math.round(total).toLocaleString()}`,
        category_summary: byCategory.slice(0, 6).map(([label, amount]) => ({
          label,
          value: formatKes(amount),
        })),
        chart: {
          type: 'pie',
          labels: byCategory.slice(0, 6).map((x) => x[0]),
          values: byCategory.slice(0, 6).map((x) => x[1]),
        },
        notes: 'All amounts in Kenyan Shillings (KES).',
      },
    });

    try {
      printHtmlReport(html);
      toast.success('Expenses PDF export opened.');
    } catch {
      toast.error('Could not open print window.', { description: 'Please allow popups and try again.' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" data-tour="staff-expenses-root">
      {/* Page Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        data-tour="staff-expenses-header"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Tracking expenses for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Track and manage all expenses'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showBrokerExpensesButton && (
            <button
              type="button"
              className="fv-btn fv-btn--secondary flex items-center gap-2"
              onClick={() => setBrokerExpensesOpen(true)}
            >
              <Receipt className="h-4 w-4" />
              Broker expenses
            </button>
          )}
          {canApproveExpense && unpaidWorkLogs.length > 0 && (
            <>
              <button 
                className="fv-btn fv-btn--primary"
                onClick={() => setLabourExpensesOpen(true)}
              >
                <Wrench className="h-4 w-4" />
                Labour Expenses ({unpaidWorkLogs.length})
              </button>
              <Dialog open={labourExpensesOpen} onOpenChange={setLabourExpensesOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Labour Expenses - Unpaid Work Logs</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Mark work logs as paid to automatically create expense entries.
                  </p>
                </DialogHeader>
                {unpaidWorkLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">All work logs have been paid.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                  {unpaidWorkLogs.map((log) => (
                    <div
                      key={log.id}
                      className="fv-card p-4 border"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-foreground">{log.workCategory}</h4>
                            <span className="fv-badge fv-badge--warning text-xs">Unpaid</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-2">
                            <div>
                              <span className="font-medium">Date:</span> {formatDate(log.date)}
                            </div>
                            <div>
                              <span className="font-medium">Stage:</span> {log.stageName}
                            </div>
                            <div>
                              <span className="font-medium">People:</span> {log.numberOfPeople}
                            </div>
                            <div>
                              <span className="font-medium">Rate:</span> {log.ratePerPerson ? `KES ${log.ratePerPerson.toLocaleString()}` : 'N/A'}
                            </div>
                          </div>
                          {log.totalPrice && (
                            <div className="mt-2">
                              <span className="text-lg font-bold text-primary">
                                Total: KES {log.totalPrice.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {log.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{log.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleMarkWorkLogAsPaid(log)}
                          disabled={markingPaid === log.id}
                          className="fv-btn fv-btn--primary shrink-0"
                        >
                          {markingPaid === log.id ? 'Marking...' : 'Mark as Paid'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </DialogContent>
            </Dialog>
          </>
          )}
          {canExportExpenseReport && (
            <>
              <button
                className="fv-btn fv-btn--secondary"
                onClick={() => void handleExportExpensesPdf()}
                data-tour="staff-expenses-export"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </button>
              <button
                className="fv-btn fv-btn--secondary"
                onClick={handleExportExpensesCsv}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </>
          )}
          {canCreateExpense && (
          <Dialog
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) setCustomCategory('');
            }}
          >
            <DialogTrigger asChild>
              <button
                className="fv-btn fv-btn--primary"
                data-tour="staff-expenses-add"
              >
                <Plus className="h-4 w-4" />
                Add Expense
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              {!activeProject ? (
                <p className="text-sm text-muted-foreground">
                  Select a project first to add an expense.
                </p>
              ) : (
                <form onSubmit={handleAddExpense} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <input
                      className="fv-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Amount (KES)</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <Select value={category} onValueChange={(val) => setCategory(val as ExpenseCategory)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="labour">Labour</SelectItem>
                        <SelectItem value="fertilizer">Fertilizer</SelectItem>
                        <SelectItem value="chemical">Chemical</SelectItem>
                        <SelectItem value="fuel">Fuel</SelectItem>
                        <SelectItem value="other">Custom / Not listed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {category === 'other' && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Custom category</label>
                      <input
                        className="fv-input"
                        placeholder="e.g. Seeds, Equipment, Transport"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Type the category name; it will be saved with this expense.
                      </p>
                    </div>
                  )}
                  <DialogFooter>
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => setAddOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="fv-btn fv-btn--primary"
                    >
                      {saving ? 'Saving…' : 'Save Expense'}
                    </button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Dialog open={!!payoutDetailCollectionId} onOpenChange={(open) => !open && setPayoutDetailCollectionId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Payout detail</DialogTitle>
          </DialogHeader>
          {payoutDetailLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : payoutDetail ? (
            <div className="overflow-y-auto flex-1 min-h-0 space-y-3 pr-1">
              <p className="text-sm font-medium text-foreground">{payoutDetail.collectionName}</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border">
                  <span>Picker</span>
                  <span>KG</span>
                  <span>Paid</span>
                  <span>Time</span>
                </div>
                {payoutDetail.rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-4 gap-2 px-2 py-1.5 text-sm border-b border-border last:border-b-0"
                  >
                    <span className="font-medium tabular-nums">#{row.pickerNumber}</span>
                    <span className="tabular-nums">{row.totalKg.toFixed(1)} kg</span>
                    <span className="tabular-nums">KES {row.amountPaid.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {row.lastPaidAt && toDate(row.lastPaidAt)
                        ? toDate(row.lastPaidAt)!.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
                <span>Total KG</span>
                <span className="tabular-nums">{payoutDetail.totalKg.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Paid</span>
                <span className="tabular-nums">KES {payoutDetail.totalPaid.toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No detail.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary Cards + Filters */}
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <SimpleStatCard
            title="Total Expenses"
            value={formatCurrency(totalExpenses)}
            subtitle={`From ${expenses.length} transactions`}
            layout="vertical"
          />
          <SimpleStatCard
            title="Filtered Total"
            value={formatCurrency(totalExpenses)}
            subtitle="Based on applied filters"
            layout="vertical"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search expenses..."
              className="fv-input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Seeds">Seeds</SelectItem>
              <SelectItem value="Fertilizers">Fertilizers</SelectItem>
              <SelectItem value="Labor">Labor</SelectItem>
              <SelectItem value="Pesticides">Pesticides</SelectItem>
              <SelectItem value="Irrigation">Irrigation</SelectItem>
              <SelectItem value="Equipment">Equipment</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <button className="fv-btn fv-btn--secondary flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Date range
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Pie + Bar charts — Basic: titles visible, data blurred + Pro overlay */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FeatureGate feature="advancedAnalytics" upgradePresentation="blur-data" className="min-w-0">
            <ExpensesPieChart
              data={Object.entries(
                filteredExpenses.reduce<Record<string, number>>((acc, e) => {
                  acc[e.category] = (acc[e.category] || 0) + e.amount;
                  return acc;
                }, {}),
              ).map(([category, amount]) => ({ category, amount }))}
            />
          </FeatureGate>
          <FeatureGate feature="advancedAnalytics" upgradePresentation="blur-data" className="min-w-0">
            <ExpensesBarChart
              data={Object.entries(
                filteredExpenses.reduce<Record<string, number>>((acc, e) => {
                  acc[e.category] = (acc[e.category] || 0) + e.amount;
                  return acc;
                }, {}),
              ).map(([category, amount]) => ({ category, amount }))}
            />
          </FeatureGate>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="fv-card flex flex-col">
        <h3 className="text-lg font-semibold mb-6 shrink-0">Recent Expenses</h3>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading expenses…</p>
        )}
        
        {/* Desktop Table: scrollable when many rows so card stays same size */}
        <div className="hidden md:block overflow-x-auto overflow-y-auto scrollbar-thin max-h-[320px] min-h-0">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentTableRows.map((row) => {
                if (row.type === 'harvest_payout') {
                  const payoutDate = row.harvestDate ? toDate(row.harvestDate) : null;
                  return (
                    <tr
                      key={row.key}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setPayoutDetailCollectionId(row.collectionId)}
                    >
                      <td>
                        <div>
                          <span className="font-medium text-foreground">Picker Payout</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{row.collectionName}</p>
                        </div>
                      </td>
                      <td>
                        <span className={cn('fv-badge', getCategoryColor('labour'))}>labour</span>
                      </td>
                      <td className="font-medium">{formatCurrency(row.totalPaid)}</td>
                      <td className="text-muted-foreground">{payoutDate ? formatDate(payoutDate) : '—'}</td>
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          onClick={() => setPayoutDetailCollectionId(row.collectionId)}
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  );
                }
                if (row.type === 'picker_group') {
                  return (
                    <tr
                      key={row.key}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setPickerPaymentDetailGroup(row)}
                    >
                      <td>
                        <span className="font-medium text-foreground">{row.displayName}</span>
                      </td>
                      <td>
                        <span className={cn('fv-badge', getCategoryColor('labour'))}>labour</span>
                      </td>
                      <td className="font-medium">{formatCurrency(row.totalAmount)}</td>
                      <td className="text-muted-foreground">{formatDate(row.latestDate)}</td>
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          onClick={() => setPickerPaymentDetailGroup(row)}
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  );
                }
                const expense = row.expense;
                const isPickerPayout = expense.meta?.source === 'harvest_wallet_picker_payment';
                const collectionId = expense.meta?.harvestCollectionId;
                const collectionLabel = collectionId ? collectionNameMap.get(collectionId) : null;
                
                return (
                  <tr 
                    key={row.key}
                    className={isPickerPayout && collectionId ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={isPickerPayout && collectionId ? () => setLaborPayoutDrawerCollectionId(collectionId) : undefined}
                  >
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{expense.description}</span>
                          {expense.pending && (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              Syncing...
                            </span>
                          )}
                        </div>
                        {isPickerPayout && collectionLabel && (
                          <span className="text-xs text-muted-foreground">Collection: {collectionLabel}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={cn('fv-badge', getCategoryColor(expense.category))}>
                        {expense.category === 'picker_payout' ? 'labour' : expense.category}
                      </span>
                    </td>
                    <td className="font-medium">{formatCurrency(expense.amount)}</td>
                    <td className="text-muted-foreground">{formatDate(expense.date)}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {isPickerPayout && collectionId ? (
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          onClick={() => setLaborPayoutDrawerCollectionId(collectionId)}
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="p-2 hover:bg-muted rounded-lg transition-colors"
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => {
                                const msg = `${expense.description}\nCategory: ${expense.category}\nAmount: ${formatCurrency(expense.amount)}\nDate: ${formatDate(expense.date)}`;
                                alert(msg);
                              }}
                            >
                              View details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards: scrollable when 5+ so card stays same size */}
        <div className="md:hidden overflow-y-auto scrollbar-thin max-h-[320px] space-y-3 pr-1">
          {recentTableRows.map((row) => {
            if (row.type === 'harvest_payout') {
              const payoutDate = row.harvestDate ? toDate(row.harvestDate) : null;
              return (
                <div
                  key={row.key}
                  role="button"
                  tabIndex={0}
                  className="p-4 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 active:scale-[0.99]"
                  onClick={() => setPayoutDetailCollectionId(row.collectionId)}
                  onKeyDown={(ev) => ev.key === 'Enter' && setPayoutDetailCollectionId(row.collectionId)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-foreground">Picker Payout</p>
                      <p className="text-xs text-muted-foreground">{row.collectionName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{payoutDate ? formatDate(payoutDate) : '—'}</p>
                    </div>
                    <span className="font-semibold">{formatCurrency(row.totalPaid)}</span>
                  </div>
                  <span className={cn('fv-badge', getCategoryColor('labour'))}>labour</span>
                </div>
              );
            }
            if (row.type === 'picker_group') {
              return (
                <div
                  key={row.key}
                  role="button"
                  tabIndex={0}
                  className="p-4 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 active:scale-[0.99]"
                  onClick={() => setPickerPaymentDetailGroup(row)}
                  onKeyDown={(ev) => ev.key === 'Enter' && setPickerPaymentDetailGroup(row)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-foreground">{row.displayName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.latestDate)}</p>
                    </div>
                    <span className="font-semibold">{formatCurrency(row.totalAmount)}</span>
                  </div>
                  <span className={cn('fv-badge', getCategoryColor('labour'))}>labour</span>
                </div>
              );
            }
            const expense = row.expense;
            const isPickerPayout = expense.meta?.source === 'harvest_wallet_picker_payment';
            const collectionId = expense.meta?.harvestCollectionId;
            const collectionLabel = collectionId ? collectionNameMap.get(collectionId) : null;
            
            return (
              <div 
                key={row.key} 
                role={isPickerPayout && collectionId ? 'button' : undefined}
                tabIndex={isPickerPayout && collectionId ? 0 : undefined}
                className={cn(
                  'p-4 bg-muted/30 rounded-lg',
                  isPickerPayout && collectionId && 'cursor-pointer hover:bg-muted/50 active:scale-[0.99]'
                )}
                onClick={isPickerPayout && collectionId ? () => setLaborPayoutDrawerCollectionId(collectionId) : undefined}
                onKeyDown={isPickerPayout && collectionId ? (ev) => ev.key === 'Enter' && setLaborPayoutDrawerCollectionId(collectionId) : undefined}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{expense.description}</p>
                      {expense.pending && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          Syncing...
                        </span>
                      )}
                    </div>
                    {isPickerPayout && collectionLabel && (
                      <p className="text-xs text-muted-foreground">Collection: {collectionLabel}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(expense.date)}</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                </div>
                <span className={cn('fv-badge', getCategoryColor(expense.category === 'picker_payout' ? 'labour' : expense.category))}>
                  {expense.category === 'picker_payout' ? 'labour' : expense.category}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Picker payment detail modal: show batches and pickers (names, numbers, amounts) */}
      <Dialog open={!!pickerPaymentDetailGroup} onOpenChange={(open) => !open && setPickerPaymentDetailGroup(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{pickerPaymentDetailGroup?.displayName ?? 'Picker payments'}</DialogTitle>
          </DialogHeader>
          {pickerPaymentDetailGroup && (
            <PickerPaymentDetailContent
              group={pickerPaymentDetailGroup}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              onClose={() => setPickerPaymentDetailGroup(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Broker expenses modal (tomatoes project only; visible to admin/manager, not to brokers) */}
      {showBrokerExpensesButton && (
        <Dialog open={brokerExpensesOpen} onOpenChange={setBrokerExpensesOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Broker expenses</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Market-related expenses (Crates Space, Watchman, Ropes, Labour, etc.) recorded by brokers.
              </p>
            </DialogHeader>
            <div className="space-y-4">
              <SimpleStatCard
                title="Total broker expenses"
                value={formatCurrency(brokerExpensesTotal)}
                subtitle={`${brokerExpenses.length} entries`}
                layout="vertical"
              />
              {brokerExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No broker expenses recorded yet.</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
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
                        {brokerExpenses.map((e) => (
                          <tr key={e.id}>
                            <td className="text-muted-foreground">{formatDate(e.date)}</td>
                            <td>{getExpenseCategoryLabel(e.category)}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span>{e.description || '—'}</span>
                                {e.pending && (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                    Syncing...
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="font-semibold">{formatCurrency(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {brokerExpenses.map((e) => (
                      <div key={e.id} className="p-4 bg-muted/30 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{getExpenseCategoryLabel(e.category)}</p>
                              {e.pending && (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                  Syncing...
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                            {e.description && <p className="text-sm mt-1">{e.description}</p>}
                          </div>
                          <span className="font-semibold">{formatCurrency(e.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* Labor Payout Drawer - shows picker breakdown for a collection */}
      <Sheet open={!!laborPayoutDrawerCollectionId} onOpenChange={(open) => !open && setLaborPayoutDrawerCollectionId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              French Beans Picker Payout
            </SheetTitle>
            {laborPayoutDetail && (
              <p className="text-sm text-muted-foreground">
                Collection: {laborPayoutDetail.collectionName}
              </p>
            )}
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {laborPayoutDetailLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : laborPayoutDetail ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total Kg</p>
                    <p className="text-lg font-semibold">{laborPayoutDetail.totalKg.toFixed(1)} kg</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total Paid</p>
                    <p className="text-lg font-semibold">{formatCurrency(laborPayoutDetail.totalPaid)}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">Pickers ({laborPayoutDetail.pickers.length})</h4>
                  <div className="space-y-2">
                    {laborPayoutDetail.pickers.map((picker) => (
                      <div 
                        key={picker.pickerId}
                        className="flex items-center justify-between p-3 bg-muted/20 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                            {picker.pickerNumber ?? '?'}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{picker.pickerName || `Picker #${picker.pickerNumber}`}</p>
                            <p className="text-xs text-muted-foreground">{picker.totalKg.toFixed(1)} kg</p>
                          </div>
                        </div>
                        <span className="font-semibold text-sm">{formatCurrency(picker.totalPaid)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No payout details available for this collection.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        isTrial={isTrial}
        isExpired={isExpired}
        daysRemaining={daysRemaining}
        workspaceCompanyId={user?.companyId ?? null}
      />
    </div>
  );
}
