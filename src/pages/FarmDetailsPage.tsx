import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { FarmService } from '@/services/localData/FarmService';
import { ExpenseService } from '@/services/localData/ExpenseService';
import { getWorkCardsForCompany } from '@/services/operationsWorkCardService';
import { formatDate } from '@/lib/dateUtils';
import { ChevronLeft, Receipt, CalendarDays, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal';
import { LogWorkModal } from '@/components/operations/LogWorkModal';
import { PlanWorkModal } from '@/components/operations/PlanWorkModal';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { StatCard } from '@/components/dashboard/StatCard';
import type { Project } from '@/types';

type ActivityFilter = 'all' | 'expenses' | 'operations';

export default function FarmDetailsPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { projects, setActiveProject } = useProject();
  const companyId = user?.companyId ?? null;
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [projectFilterId, setProjectFilterId] = useState<string>('all');
  const [projectListFilterId, setProjectListFilterId] = useState<string>('all');
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addOperationOpen, setAddOperationOpen] = useState(false);
  const [planWorkOpen, setPlanWorkOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  const { data: farms = [] } = useQuery({
    queryKey: ['farms', companyId ?? ''],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await FarmService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return FarmService.listFarmsByCompany(companyId);
    },
    enabled: Boolean(companyId),
  });
  const farm = farms.find((f) => f.id === farmId);

  const { data: expenses = [] } = useQuery({
    queryKey: ['farm-expenses', companyId ?? '', farmId ?? ''],
    queryFn: async () => {
      if (!companyId || !farmId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await ExpenseService.pullRemote(companyId, { farmId });
        } catch {
          // ignore
        }
      }
      return ExpenseService.list(companyId, { farmId });
    },
    enabled: Boolean(companyId && farmId),
  });

  const { data: workCards = [] } = useQuery({
    queryKey: ['farm-workcards', companyId ?? '', farmId ?? ''],
    queryFn: () => getWorkCardsForCompany({ companyId: companyId ?? '', farmId: farmId ?? null }),
    enabled: Boolean(companyId && farmId),
  });

  const farmProjects = useMemo(
    () => projects.filter((project) => project.farmId === farmId),
    [projects, farmId],
  );
  const filteredFarmProjects = useMemo(() => {
    if (projectListFilterId === 'all') return farmProjects;
    return farmProjects.filter((project) => project.id === projectListFilterId);
  }, [farmProjects, projectListFilterId]);
  const isStaffRoute = location.pathname.startsWith('/staff/');
  const backPath = isStaffRoute ? '/staff/staff-dashboard' : '/projects?view=farms';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const timelineItems = useMemo(() => {
    const expenseItems = expenses.map((expense) => {
      const ts = new Date(expense.date);
      return {
        id: `expense-${expense.id}`,
        kind: 'expense' as const,
        timestamp: Number.isNaN(ts.getTime()) ? 0 : ts.getTime(),
        date: ts,
        projectId: expense.projectId ?? null,
        title: expense.description,
        subtitle: `KES ${Number(expense.amount ?? 0).toLocaleString()}`,
      };
    });
    const operationItems = workCards.map((card) => {
      const dateCandidate = card.actualDate ?? card.plannedDate ?? card.createdAt;
      const ts = new Date(dateCandidate);
      return {
        id: `operation-${card.id}`,
        kind: 'operation' as const,
        timestamp: Number.isNaN(ts.getTime()) ? 0 : ts.getTime(),
        date: ts,
        projectId: card.projectId ?? null,
        title: card.workTitle,
        subtitle: card.status,
      };
    });
    const merged = [...expenseItems, ...operationItems]
      .filter((item) => projectFilterId === 'all' || item.projectId === projectFilterId)
      .sort((a, b) => b.timestamp - a.timestamp);
    if (activityFilter === 'expenses') return merged.filter((item) => item.kind === 'expense');
    if (activityFilter === 'operations') return merged.filter((item) => item.kind === 'operation');
    return merged;
  }, [expenses, workCards, activityFilter, projectFilterId]);

  const groupedTimeline = useMemo(() => {
    const groups = new Map<string, typeof timelineItems>();
    for (const item of timelineItems) {
      const key = item.timestamp > 0 ? item.date.toISOString().slice(0, 10) : 'Unknown date';
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries());
  }, [timelineItems]);

  const totals = useMemo(() => {
    let todayExpenses = 0;
    let sevenDayExpenses = 0;
    let sevenDayOperations = 0;
    for (const expense of expenses) {
      if (projectFilterId !== 'all' && expense.projectId !== projectFilterId) continue;
      const ts = new Date(expense.date).getTime();
      if (Number.isNaN(ts)) continue;
      if (ts >= startOfToday) todayExpenses += Number(expense.amount ?? 0);
      if (ts >= sevenDaysAgo) sevenDayExpenses += Number(expense.amount ?? 0);
    }
    for (const card of workCards) {
      if (projectFilterId !== 'all' && card.projectId !== projectFilterId) continue;
      const ts = new Date(card.actualDate ?? card.plannedDate ?? card.createdAt).getTime();
      if (!Number.isNaN(ts) && ts >= sevenDaysAgo) sevenDayOperations += 1;
    }
    return { todayExpenses, sevenDayExpenses, sevenDayOperations };
  }, [expenses, workCards, projectFilterId, sevenDaysAgo, startOfToday]);

  const openOperationModal = () => {
    const preferredProject = projectFilterId !== 'all' ? farmProjects.find((p) => p.id === projectFilterId) : null;
    setActiveProject(preferredProject ?? null);
    setAddOperationOpen(true);
  };

  const openPlanWorkModal = () => {
    const preferredProject = projectFilterId !== 'all' ? farmProjects.find((p) => p.id === projectFilterId) : null;
    setActiveProject(preferredProject ?? null);
    setPlanWorkOpen(true);
  };

  if (!farm) {
    return <div className="text-sm text-muted-foreground">Farm not found.</div>;
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8 lg:gap-8 animate-fade-in pb-8">
      <div className="-mt-6 -mx-6 w-[calc(100%+3rem)]">
        <div className="relative overflow-hidden border-b border-border/50">
          <img
            src="/heroimages/land.png"
            alt="Farm land"
            className="h-[160px] w-full object-cover sm:h-[190px] lg:h-[210px]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white">
            <button
              className="mb-3 inline-flex items-center gap-1 text-xs/5 sm:text-sm/5 text-white/90 hover:text-white"
              onClick={() => navigate(backPath)}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold">{farm.name}</h1>
            <p className="text-sm text-white/90">{farm.location}</p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            title="Today Expenses"
            value={`KES ${totals.todayExpenses.toLocaleString()}`}
            icon={<Receipt className="h-4 w-4" />}
            variant="warning"
            compact
          />
          <StatCard
            title="Last 7 Days Expenses"
            value={`KES ${totals.sevenDayExpenses.toLocaleString()}`}
            icon={<CalendarDays className="h-4 w-4" />}
            variant="info"
            compact
          />
          <div className="col-span-2 lg:col-span-1">
            <StatCard
              title="Last 7 Days Operations"
              value={totals.sevenDayOperations}
              icon={<Wrench className="h-4 w-4" />}
              variant="primary"
              compact
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fv-btn fv-btn--primary" onClick={() => setAddProjectOpen(true)}>
            Add Project
          </button>
          <button type="button" className="fv-btn fv-btn--primary" onClick={() => setAddExpenseOpen(true)}>
            Add Expense
          </button>
          <button type="button" className="fv-btn fv-btn--secondary" onClick={openOperationModal}>
            Add Operation
          </button>
          <button type="button" className="fv-btn fv-btn--secondary" onClick={openPlanWorkModal}>
            Plan Work
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Projects on this farm</h2>
        <div className="max-w-md space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project dropdown
          </label>
          <Select value={projectListFilterId} onValueChange={setProjectListFilterId}>
            <SelectTrigger>
              <SelectValue placeholder="All projects on this farm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects on this farm</SelectItem>
              {farmProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {cropTypeKeyEmoji(project.cropType)} {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {farmProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet on this farm.</p>
        ) : filteredFarmProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects match this selection.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredFarmProjects.map((project) => (
              <button
                key={project.id}
                className="text-left rounded-lg border border-emerald-200/70 bg-emerald-50/35 p-2.5 hover:shadow-sm transition-all dark:border-emerald-900/45 dark:bg-emerald-950/15"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">{cropTypeKeyEmoji(project.cropType)}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{project.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize truncate">
                        {project.cropType.replace('-', ' ')}
                      </p>
                    </div>
                  </div>
                  <span className="fv-badge fv-badge--active text-[10px] px-2 py-0.5 capitalize shrink-0">
                    {project.status}
                  </span>
                </div>
                <div className="mt-2 pt-1.5 border-t border-emerald-200/50 dark:border-emerald-900/40">
                  <p className="text-[10px] text-muted-foreground">
                    Started {formatDate(project.startDate)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Farm Activities</h2>
        <p className="text-xs text-muted-foreground">Includes farm-only and project-linked records for this farm.</p>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Project filter</label>
          <Select value={projectFilterId} onValueChange={setProjectFilterId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All projects + farm-level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects + farm-level</SelectItem>
              {farmProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`fv-btn ${activityFilter === 'all' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
            onClick={() => setActivityFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`fv-btn ${activityFilter === 'expenses' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
            onClick={() => setActivityFilter('expenses')}
          >
            Expenses
          </button>
          <button
            type="button"
            className={`fv-btn ${activityFilter === 'operations' ? 'fv-btn--primary' : 'fv-btn--secondary'}`}
            onClick={() => setActivityFilter('operations')}
          >
            Operations
          </button>
        </div>
        <div className="space-y-4">
          {groupedTimeline.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day === 'Unknown date' ? day : formatDate(day)}
              </h3>
              {items.map((item) => (
                <div key={item.id} className="rounded-md border border-border/70 p-3">
                  <div className="text-sm font-medium">
                    {item.kind === 'expense' ? 'Expense' : 'Operation'}: {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{item.subtitle}</div>
                </div>
              ))}
            </div>
          ))}
          {groupedTimeline.length === 0 && <p className="text-sm text-muted-foreground">No activities yet on this farm.</p>}
        </div>
      </section>

      <AddExpenseModal
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        companyId={companyId}
        farmId={farmId ?? null}
        projectId={projectFilterId === 'all' ? null : projectFilterId}
        createdBy={user?.id ?? null}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ['farm-expenses', companyId ?? '', farmId ?? ''] });
        }}
      />

      <LogWorkModal
        open={addOperationOpen}
        onOpenChange={setAddOperationOpen}
        initialFarmId={farmId ?? null}
        initialProjectId={projectFilterId === 'all' ? null : projectFilterId}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['farm-workcards', companyId ?? '', farmId ?? ''] });
        }}
      />

      <PlanWorkModal
        open={planWorkOpen}
        onOpenChange={setPlanWorkOpen}
        initialFarmId={farmId ?? null}
        initialProjectId={projectFilterId === 'all' ? null : projectFilterId}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['farm-workcards', companyId ?? '', farmId ?? ''] });
        }}
      />
      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogContent className="max-w-2xl p-4 sm:p-6">
          <DialogTitle className="sr-only">Create Project</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new project on this farm.
          </DialogDescription>
          <NewProjectForm
            initialFarmId={farmId ?? null}
            onCancel={() => setAddProjectOpen(false)}
            onSuccess={async (project?: Project) => {
              setAddProjectOpen(false);
              await queryClient.invalidateQueries({ queryKey: ['projects', companyId ?? ''] });
              if (project?.id) {
                setProjectFilterId(project.id);
                setActiveProject(project);
                toast.success('Project created and selected.', {
                  description: 'You can now add project-specific activities immediately.',
                });
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
