import React, { useState, useMemo, useCallback } from 'react';
import { DollarSign, TrendingUp, Wallet, Calendar as CalendarIcon } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ProjectsTable } from '@/components/dashboard/ProjectsTable';
import {
  InventoryOverview,
  RecentTransactions,
  RecentTransactionItem,
  CropStageSection,
} from '@/components/dashboard/DashboardWidgets';
import { InventoryItem, CropStage } from '@/types';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Expense, Harvest, Project, Sale } from '@/types';
import type { CropType } from '@/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toDate } from '@/lib/dateUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { NewOperationMenu } from '@/components/dashboard/NewOperationMenu';

export function CompanyDashboard() {
  const { activeProject, setActiveProject } = useProject();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [projectFilter, setProjectFilter] = useState<'all' | 'selected'>('selected');

  const companyId = user?.companyId || '';
  const { data: allProjects = [], isLoading: projectsLoading } = useCollection<Project>(
    'dashboard-projects',
    'projects'
  );
  const { data: allExpenses = [] } = useCollection<Expense>('dashboard-expenses', 'expenses');
  const { data: allHarvests = [] } = useCollection<Harvest>('dashboard-harvests', 'harvests');
  const { data: allSales = [] } = useCollection<Sale>('dashboard-sales', 'sales');
  const { data: allInventory = [] } = useCollection<InventoryItem>(
    'dashboard-inventory',
    'inventoryItems'
  );
  const { data: allStages = [] } = useCollection<CropStage>(
    'dashboard-stages',
    'projectStages'
  );

  const companyProjects = useMemo(
    () => (companyId ? allProjects.filter((p) => p.companyId === companyId) : allProjects),
    [allProjects, companyId]
  );

  const filteredExpenses = useMemo(() => {
    let filtered = companyId ? allExpenses.filter((e) => e.companyId === companyId) : allExpenses;
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((e) => e.projectId === activeProject.id);
    }
    return filtered;
  }, [allExpenses, companyId, activeProject, projectFilter]);

  const filteredHarvests = useMemo(() => {
    let filtered = companyId ? allHarvests.filter((h) => h.companyId === companyId) : allHarvests;
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((h) => h.projectId === activeProject.id);
    }
    return filtered;
  }, [allHarvests, companyId, activeProject, projectFilter]);

  const filteredSales = useMemo(() => {
    let filtered = companyId ? allSales.filter((s) => s.companyId === companyId) : allSales;
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((s) => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allSales, companyId, activeProject, projectFilter]);

  const filteredProjects = useMemo(() => {
    if (projectFilter === 'selected' && activeProject) return [activeProject];
    return companyProjects;
  }, [companyProjects, activeProject, projectFilter]);

  const filteredInventory = useMemo(() => {
    const filtered = companyId
      ? allInventory.filter((i) => i.companyId === companyId)
      : allInventory;
    return filtered;
  }, [allInventory, companyId]);

  const filteredStages = useMemo(() => {
    let filtered = companyId ? allStages.filter((s) => s.companyId === companyId) : allStages;
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((s) => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allStages, companyId, activeProject, projectFilter]);

  const activeProjectStages = useMemo(() => {
    if (!activeProject) return [];
    return allStages.filter(
      (s) => s.companyId === companyId && s.projectId === activeProject.id
    );
  }, [allStages, companyId, activeProject]);

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const netBalance = totalSales - totalExpenses;
  const totalBudget = filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const remainingBudget = totalBudget - totalExpenses;

  const recentTransactions = useMemo((): RecentTransactionItem[] => {
    const items: RecentTransactionItem[] = [];
    filteredSales.forEach((s) => {
      const d = toDate(s.date);
      items.push({
        id: `sale-${s.id}`,
        type: 'sale',
        date: d || new Date(),
        label: s.buyerName || 'Sale',
        amount: s.totalAmount,
        status: s.status,
      });
    });
    filteredExpenses.forEach((e) => {
      const d = toDate(e.date);
      items.push({
        id: `expense-${e.id}`,
        type: 'expense',
        date: d || new Date(),
        label: e.description || e.category || 'Expense',
        amount: e.amount,
      });
    });
    return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 15);
  }, [filteredSales, filteredExpenses]);

  const expensesByCategory = useMemo(() => {
    const acc = filteredExpenses.reduce<Record<string, number>>((a, e) => {
      a[e.category] = (a[e.category] || 0) + e.amount;
      return a;
    }, {});
    return Object.keys(acc).length
      ? Object.entries(acc).map(([category, amount]) => ({ category, amount }))
      : [];
  }, [filteredExpenses]);

  const activityChartData = useMemo(() => {
    const months: { month: string; expenses: number; sales: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const expenses = filteredExpenses
        .filter((e) => {
          const t = toDate(e.date)?.getTime();
          return t != null && t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      const sales = filteredSales
        .filter((s) => {
          const t = toDate(s.date)?.getTime();
          return t != null && t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, s) => sum + s.totalAmount, 0);
      months.push({ month: monthKey, expenses, sales });
    }
    return months;
  }, [filteredExpenses, filteredSales]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || null;

  const handleProjectChange = useCallback(
    (value: string) => {
      if (value === 'all') {
        setProjectFilter('all');
        setActiveProject(null);
      } else {
        const proj = companyProjects.find((p) => p.id === value);
        if (proj) {
          setActiveProject(proj);
          setProjectFilter('selected');
        }
      }
    },
    [companyProjects, setActiveProject]
  );

  if (projectsLoading) {
    return <DashboardSkeleton />;
  }

  const projectSelectorValue =
    projectFilter === 'selected' && activeProject ? activeProject.id : 'all';

  const getCropIcon = (cropType?: CropType | null) => {
    const icons: Record<string, string> = {
      tomatoes: '🍅',
      'french-beans': '🌱',
      capsicum: '🫑',
      maize: '🌽',
      watermelons: '🍉',
      rice: '🍚',
    };
    return cropType ? icons[cropType] ?? '🌾' : '🌾';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Unified header: Greeting + Project selector + Quick Access (desktop & mobile) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <DashboardGreeting firstName={firstName} />
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <Select value={projectSelectorValue} onValueChange={handleProjectChange}>
            <SelectTrigger className="h-9 w-[140px] sm:w-[180px] rounded-md border border-border/50 bg-card/80 text-sm">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent className="rounded-md">
              <SelectItem value="all">All Projects</SelectItem>
              {companyProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className="text-base" aria-hidden>{getCropIcon(p.cropType)}</span>
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NewOperationMenu variant={isMobile ? 'mobile' : 'default'} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="space-y-3" data-tour="dashboard-stats">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard
            title="Total Revenue"
            value={`KES ${totalSales.toLocaleString()}`}
            change={15.3}
            changeLabel="vs last month"
            icon={<TrendingUp className="h-4 w-4" />}
            variant="gold"
            compact
          />
          <StatCard
            title="Total Expenses"
            value={`KES ${totalExpenses.toLocaleString()}`}
            change={12.5}
            changeLabel="vs last month"
            icon={<DollarSign className="h-4 w-4" />}
            variant="default"
            compact
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="Profit and Loss"
            value={`KES ${netBalance.toLocaleString()}`}
            change={netBalance >= 0 ? 22.1 : -5.2}
            changeLabel="vs last month"
            icon={<Wallet className="h-4 w-4" />}
            variant={netBalance >= 0 ? 'primary' : 'default'}
            compact
          />
          <StatCard
            title="Remaining Budget"
            value={`KES ${remainingBudget.toLocaleString()}`}
            change={undefined}
            changeLabel={`of KES ${totalBudget.toLocaleString()}`}
            icon={<CalendarIcon className="h-4 w-4" />}
            variant={remainingBudget >= 0 ? 'primary' : 'default'}
            compact
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ActivityChart data={activityChartData} />
        <ExpensesPieChart data={expensesByCategory} />
      </div>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CropStageSection stages={activeProject ? activeProjectStages : filteredStages} />
        <InventoryOverview inventoryItems={filteredInventory} />
        <div data-tour="recent-transactions">
          <RecentTransactions transactions={recentTransactions} />
        </div>
      </div>

      {/* Projects Table */}
      <ProjectsTable projects={filteredProjects} compact />
    </div>
  );
}
