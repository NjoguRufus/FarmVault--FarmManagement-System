import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar as CalendarIcon, CheckCircle, ChevronDown, ChevronLeft, ChevronUp, Clock, Package, Users, Activity, Wallet, Wrench as WrenchIcon, ListChecks, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ChallengeType, CropStage, Expense, InventoryUsage, Project, SeasonChallenge, WorkLog } from '@/types';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useProject } from '@/contexts/ProjectContext';
import { getCurrentStageForProject } from '@/services/stageService';
import { toDate, formatDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { deleteProject } from '@/services/companyDataService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ProjectDetailsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject, setActiveProject } = useProject();

  const companyId = user?.companyId || null;

  const { data: project, isLoading: projectLoading } = useQuery<Project | null>({
    queryKey: ['project', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return null;
      const ref = doc(db, 'projects', projectId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as any;
      if (data.companyId !== companyId) return null;
      return { id: snap.id, ...(data as Project) };
    },
  });

  const { data: stages = [], isLoading: stagesLoading } = useProjectStages(companyId, projectId);

  const { data: workLogs = [] } = useQuery<WorkLog[]>({
    queryKey: ['workLogs', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qWork = query(
        collection(db, 'workLogs'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qWork);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as WorkLog[];
    },
  });

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ['expenses', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qExp = query(
        collection(db, 'expenses'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qExp);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];
    },
  });

  const { data: challenges = [] } = useQuery<SeasonChallenge[]>({
    queryKey: ['seasonChallenges', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qChallenges = query(
        collection(db, 'seasonChallenges'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qChallenges);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SeasonChallenge[];
    },
  });

  const { data: inventoryUsage = [] } = useQuery<InventoryUsage[]>({
    queryKey: ['inventoryUsage', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [];
      const qUsage = query(
        collection(db, 'inventoryUsage'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(qUsage);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as InventoryUsage[];
    },
  });

  const loading = projectLoading || stagesLoading;

  const today = new Date();

  const normalizeDate = (raw: any | undefined) => toDate(raw) || undefined;

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [stages],
  );

  const expectedHarvestDate = useMemo(() => {
    if (!sortedStages.length) return undefined;
    const last = sortedStages[sortedStages.length - 1];
    return normalizeDate(last.endDate || last.startDate);
  }, [sortedStages]);

  const plantingDate = normalizeDate(project?.plantingDate as any);

  // Real calendar days since planting (whole days)
  const daysSincePlanting =
    plantingDate
      ? Math.max(
          0,
          Math.floor(
            (today.getTime() - plantingDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : undefined;

  // Current stage from real data: same logic as CropStagesPage (respects stored status + dates)
  const currentStageResult = useMemo(
    () => getCurrentStageForProject(stages),
    [stages],
  );
  const currentStage = useMemo(() => {
    if (!currentStageResult || !sortedStages.length) return null;
    return (
      sortedStages.find((s) => s.stageIndex === currentStageResult.stageIndex) ?? null
    );
  }, [currentStageResult, sortedStages]);

  const stageProgressPercent = useMemo(() => {
    if (!currentStage || !currentStage.startDate || !currentStage.endDate) return 0;
    const startDate = normalizeDate(currentStage.startDate as any);
    const endDate = normalizeDate(currentStage.endDate as any);
    if (!startDate || !endDate) return 0;
    const start = startDate.getTime();
    const end = endDate.getTime();
    const total = end - start;
    if (total <= 0) return 0;
    const elapsed = Math.min(Math.max(today.getTime() - start, 0), total);
    return Math.round((elapsed / total) * 100);
  }, [currentStage, today]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const labourCost = expenses.filter((e) => e.category === 'labour').reduce((s, e) => s + e.amount, 0);
  const inputCost = expenses
    .filter((e) => ['fertilizer', 'chemical', 'fuel'].includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const avgDailyCost =
    daysSincePlanting && daysSincePlanting > 0 ? Math.round(totalExpenses / daysSincePlanting) : 0;

  const totalPeopleDays = workLogs.reduce(
    (sum, w) => sum + (w.numberOfPeople || 0),
    0,
  );
  const derivedLabourCost = workLogs.reduce(
    (sum, w) => sum + (w.numberOfPeople || 0) * (w.ratePerPerson || 0),
    0,
  );

  const workLogsByCategory = workLogs.reduce<Record<string, number>>((acc, w) => {
    const key = w.workCategory || 'Uncategorized work';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const inventoryUsageByItem = inventoryUsage.reduce<Record<string, { quantity: number; unit: string; category: string }>>(
    (acc, u) => {
      const key = u.inventoryItemId;
      if (!acc[key]) {
        acc[key] = { quantity: 0, unit: u.unit, category: u.category };
      }
      acc[key].quantity += u.quantity;
      return acc;
    },
    {},
  );

  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  // Season challenge display helpers (same as SeasonChallengesPage)
  const getChallengeTypeIcon = (type?: ChallengeType) => {
    if (!type) return null;
    const icons: Record<ChallengeType, string> = {
      weather: '🌦️',
      pests: '🐛',
      diseases: '🦠',
      prices: '💰',
      labor: '👷',
      equipment: '🔧',
      other: '⚠️',
    };
    return <span className="text-2xl" aria-hidden>{icons[type] || icons.other}</span>;
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="h-5 w-5 text-fv-success" />;
      case 'mitigating':
        return <Clock className="h-5 w-5 text-fv-warning" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
    }
  };
  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      high: 'bg-destructive/20 text-destructive',
      medium: 'fv-badge--warning',
      low: 'fv-badge--info',
    };
    return styles[severity] || 'bg-muted text-muted-foreground';
  };
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      resolved: 'fv-badge--active',
      mitigating: 'fv-badge--warning',
      identified: 'bg-muted text-muted-foreground',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const [mode, setMode] = useState<'overview' | 'planning'>('overview');
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  type SummaryTab = 'workLogs' | 'inventory' | 'expenses';
  const [activeSummaryTab, setActiveSummaryTab] = useState<SummaryTab>('workLogs');
  const [detailsDialog, setDetailsDialog] = useState<SummaryTab | null>(null);
  const [expandedChallenges, setExpandedChallenges] = useState<Set<string>>(new Set());

  if (!companyId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">No company context available.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-sm text-muted-foreground">Loading project details…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/projects')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="fv-card flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div>
            <h2 className="font-semibold text-foreground">Project not found</h2>
            <p className="text-sm text-muted-foreground">
              The requested project could not be found or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back + Header Strip */}
      <div className="flex flex-col gap-4">
        <button
          className="fv-btn fv-btn--secondary w-fit"
          onClick={() => navigate('/projects')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {/* Project summary strip */}
        <div className="fv-card flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                <span className="fv-badge capitalize">
                  {project.cropType.replace('-', ' ')}
                </span>
                <span className="fv-badge capitalize">
                  {project.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                {project.plantingDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-4 w-4" />
                    Planted{' '}
                    {formatDate(project.plantingDate)}
                  </span>
                )}
                {expectedHarvestDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-4 w-4" />
                    Expected harvest{' '}
                    {formatDate(expectedHarvestDate)}
                  </span>
                )}
              </div>
            </div>
            {project.status === 'active' && (
              <div className="flex items-center gap-2">
                <button
                  className="fv-btn fv-btn--primary"
                  onClick={() => navigate(`/projects/${project.id}/planning`)}
                >
                  {project.planning ? 'Plan changes' : 'Plan season'}
                </button>
              </div>
            )}
          </div>

          {/* Metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            <SimpleStatCard
              title="Days since planting"
              value={typeof daysSincePlanting === 'number' ? Math.floor(daysSincePlanting) : '—'}
              layout="vertical"
            />
            <SimpleStatCard
              title="Current stage"
              value={currentStage?.stageName ?? 'Not started'}
              layout="vertical"
            />
            <SimpleStatCard
              title="Stage progress"
              value={`${stageProgressPercent}%`}
              layout="vertical"
            />
            <SimpleStatCard
              title="Total expenses"
              value={formatCurrency(totalExpenses)}
              layout="vertical"
            />
          </div>
        </div>
      </div>

      {/* Operations Summary: Work Logs, Inventory Usage, Expenses (before Crop Stages) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Operations Summary</h2>

        {/* Mobile: compact title buttons in one row (no scroll) */}
        <div className="md:hidden space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSummaryTab('workLogs')}
              className={cn(
                'fv-btn fv-btn--secondary min-w-0 py-2 px-2 text-xs gap-1',
                activeSummaryTab === 'workLogs' && 'ring-2 ring-primary ring-offset-1',
              )}
            >
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">Work Logs</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSummaryTab('inventory')}
              className={cn(
                'fv-btn fv-btn--secondary min-w-0 py-2 px-2 text-xs gap-1',
                activeSummaryTab === 'inventory' && 'ring-2 ring-primary ring-offset-1',
              )}
            >
              <Activity className="h-3 w-3 shrink-0" />
              <span className="truncate">Inventory</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSummaryTab('expenses')}
              className={cn(
                'fv-btn fv-btn--secondary min-w-0 py-2 px-2 text-xs gap-1',
                activeSummaryTab === 'expenses' && 'ring-2 ring-primary ring-offset-1',
              )}
            >
              <Wallet className="h-3 w-3 shrink-0" />
              <span className="truncate">Expenses</span>
            </button>
          </div>
          <div className="fv-card">
            {activeSummaryTab === 'workLogs' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Work Logs
                  </h3>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary text-sm"
                    onClick={() => setDetailsDialog('workLogs')}
                  >
                    Details
                  </button>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total work logs</span>
                    <span className="font-medium">{workLogs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total people-days</span>
                    <span className="font-medium">{totalPeopleDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Derived labour cost</span>
                    <span className="font-medium">{formatCurrency(derivedLabourCost)}</span>
                  </div>
                </div>
                {Object.keys(workLogsByCategory).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By work type</p>
                    <div className="space-y-1 text-xs">
                      {Object.entries(workLogsByCategory).map(([key, count]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground truncate mr-2">{key}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {activeSummaryTab === 'inventory' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Inventory Usage
                  </h3>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary text-sm"
                    onClick={() => setDetailsDialog('inventory')}
                  >
                    Details
                  </button>
                </div>
                {!Object.keys(inventoryUsageByItem).length && (
                  <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>
                )}
                {!!Object.keys(inventoryUsageByItem).length && (
                  <div className="space-y-1 text-sm">
                    {Object.entries(inventoryUsageByItem).map(([id, data]) => (
                      <div key={id} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">{data.category}</span>
                        <span className="font-medium">{data.quantity} {data.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {activeSummaryTab === 'expenses' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Expenses Summary
                  </h3>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary text-sm"
                    onClick={() => setDetailsDialog('expenses')}
                  >
                    Details
                  </button>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total expenses</span>
                    <span className="font-medium">{formatCurrency(totalExpenses)}</span>
                  </div>
                  {['labour', 'fertilizer', 'chemical', 'fuel', 'other'].map((cat) => (
                    <div key={cat} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{cat}</span>
                      <span className="font-medium">{formatCurrency(expensesByCategory[cat] || 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tablet: 2 per row; larger screens: 3 per row */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Work logs card */}
          <div className="fv-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Work Logs
              </h2>
              <button
                type="button"
                className="fv-btn fv-btn--secondary text-sm"
                onClick={() => setDetailsDialog('workLogs')}
              >
                Details
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total work logs</span>
                <span className="font-medium">{workLogs.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total people-days</span>
                <span className="font-medium">{totalPeopleDays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Derived labour cost</span>
                <span className="font-medium">{formatCurrency(derivedLabourCost)}</span>
              </div>
            </div>
            {Object.keys(workLogsByCategory).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">By work type</p>
                <div className="space-y-1 text-xs">
                  {Object.entries(workLogsByCategory).map(([key, count]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground truncate mr-2">{key}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inventory usage card */}
          <div className="fv-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Inventory Usage
              </h2>
              <button
                type="button"
                className="fv-btn fv-btn--secondary text-sm"
                onClick={() => setDetailsDialog('inventory')}
              >
                Details
              </button>
            </div>
            {!Object.keys(inventoryUsageByItem).length && (
              <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>
            )}
            {!!Object.keys(inventoryUsageByItem).length && (
              <div className="space-y-1 text-sm">
                {Object.entries(inventoryUsageByItem).map(([id, data]) => (
                  <div key={id} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{data.category}</span>
                    <span className="font-medium">{data.quantity} {data.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expenses summary card */}
          <div className="fv-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Expenses Summary
              </h2>
              <button
                type="button"
                className="fv-btn fv-btn--secondary text-sm"
                onClick={() => setDetailsDialog('expenses')}
              >
                Details
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total expenses</span>
                <span className="font-medium">{formatCurrency(totalExpenses)}</span>
              </div>
              {['labour', 'fertilizer', 'chemical', 'fuel', 'other'].map((cat) => (
                <div key={cat} className="flex justify-between">
                  <span className="text-muted-foreground capitalize">{cat}</span>
                  <span className="font-medium">{formatCurrency(expensesByCategory[cat] || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Season Challenges (after Operations Summary) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Season Challenges</h2>
        {!challenges.length && (
          <div className="fv-card flex items-center gap-2 text-sm text-muted-foreground p-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            No challenges recorded yet.
          </div>
        )}
        {!!challenges.length && (
          <div className="space-y-3">
            {challenges.map((c) => {
              const stage = sortedStages.find((s) => s.stageIndex === (c as any).stageIndex);
              const challengeDate = c.dateIdentified ? normalizeDate(c.dateIdentified as any) : null;
              const isExpanded = expandedChallenges.has(c.id);
              const toggleExpand = () => {
                const next = new Set(expandedChallenges);
                if (next.has(c.id)) next.delete(c.id);
                else next.add(c.id);
                setExpandedChallenges(next);
              };

              return (
                <div key={c.id} className="fv-card p-4 sm:p-5 rounded-lg border border-border/60 shadow-sm">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={toggleExpand}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); } }}
                    className="flex flex-col sm:flex-row sm:items-start gap-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                        {c.challengeType ? getChallengeTypeIcon(c.challengeType) : getStatusIcon(c.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground text-sm sm:text-base">{c.title}</h3>
                          <span className="shrink-0 text-muted-foreground" aria-hidden>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {c.challengeType && (
                            <span className="fv-badge text-xs bg-muted text-muted-foreground capitalize">
                              {c.challengeType}
                            </span>
                          )}
                          <span className={cn('fv-badge text-xs capitalize', getSeverityBadge(c.severity))}>
                            {c.severity}
                          </span>
                          <span className={cn('fv-badge text-xs capitalize', getStatusBadge(c.status))}>
                            {c.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span>Identified: {challengeDate ? formatDate(challengeDate) : '—'}</span>
                          {c.dateResolved && (
                            <span>Resolved: {formatDate(normalizeDate(c.dateResolved as any) ?? (c.dateResolved as Date))}</span>
                          )}
                          {stage && (
                            <span>Stage: <span className="font-medium text-foreground">{stage.stageName}</span></span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
                      {c.whatWasDone && (
                        <div>
                          <h4 className="text-xs sm:text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                            <WrenchIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                            What Was Done
                          </h4>
                          <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap break-words">{c.whatWasDone}</p>
                        </div>
                      )}
                      {(c.itemsUsed?.length ?? 0) > 0 || ((c as any).chemicalsUsed?.length ?? 0) > 0 ? (
                        <div>
                          <h4 className="text-xs sm:text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                            <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                            Items Used
                          </h4>
                          <div className="space-y-2">
                            {(c.itemsUsed || (c as any).chemicalsUsed || []).map((item: any, idx: number) => {
                              const itemName = item.itemName || item.inventoryItemName || 'Unknown Item';
                              const needsPurchase = item.needsPurchase || !item.inventoryItemId;
                              return (
                                <div key={idx} className={cn('rounded-lg border p-2 sm:p-3 text-xs sm:text-sm', needsPurchase && 'border-fv-warning/50 bg-fv-warning/5')}>
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium break-words">{itemName}</span>
                                      <span className="text-muted-foreground ml-2">
                                        {item.quantity ? `${item.quantity} ` : ''}{item.unit}
                                      </span>
                                      <span className="text-xs text-muted-foreground ml-2 capitalize">
                                        ({item.category || 'chemical'})
                                      </span>
                                    </div>
                                    {needsPurchase && (
                                      <span className="fv-badge fv-badge--warning text-xs shrink-0">Needs Purchase</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {c.plan2IfFails && (
                        <div>
                          <h4 className="text-xs sm:text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-fv-warning" />
                            Plan 2 (If Current Solution Fails)
                          </h4>
                          <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap break-words">{c.plan2IfFails}</p>
                        </div>
                      )}
                      {!c.whatWasDone && !(c.itemsUsed?.length ?? 0) && !(c as any).chemicalsUsed?.length && !c.plan2IfFails && (
                        <p className="text-xs sm:text-sm text-muted-foreground italic">No additional details recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Crop stage timeline */}
      <div className="fv-card">
        <h2 className="text-lg font-semibold mb-4">Crop Stage Timeline</h2>
        {!sortedStages.length && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            No stages generated for this project yet.
          </div>
        )}
        <div className="space-y-4">
                    {sortedStages.map((stage, index) => {
                    const start = normalizeDate(stage.startDate as any) || null;
                    const end = normalizeDate(stage.endDate as any) || null;
            let derivedStatus: 'pending' | 'active' | 'completed' = 'pending';
            if ((stage as CropStage).status === 'completed') {
              derivedStatus = 'completed';
            } else if (start && end) {
              if (today < start) derivedStatus = 'pending';
              else if (today > end) derivedStatus = 'completed';
              else derivedStatus = 'active';
            }
            const diffDays =
              start && end
                ? Math.max(
                    1,
                    Math.round(
                      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
                    ) + 1,
                  )
                : undefined;
            return (
              <div
                key={stage.id}
                className="flex items-start gap-4"
              >
                <div className="flex flex-col items-center">
                  <div
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-full border-2',
                      derivedStatus === 'completed' && 'border-fv-success bg-fv-success/10',
                      derivedStatus === 'active' && 'border-fv-warning bg-fv-warning/10',
                      derivedStatus === 'pending' && 'border-muted bg-muted',
                    ].join(' ')}
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {index < sortedStages.length - 1 && (
                    <div className="w-0.5 h-8 mt-2 bg-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-4 border-b last:border-b-0 border-border/60">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">{stage.stageName}</h3>
                    <span className="fv-badge text-xs capitalize">
                      {derivedStatus}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                    {start && end && (
                      <span>
                        {formatDate(start, { month: 'short', day: 'numeric' })} –{' '}
                        {formatDate(end, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {diffDays && <span>{diffDays} days</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SimpleStatCard
          title="Total project cost"
          value={formatCurrency(totalExpenses)}
          layout="vertical"
        />
        <SimpleStatCard
          title="Labour cost"
          value={formatCurrency(labourCost)}
          layout="vertical"
        />
        <SimpleStatCard
          title="Input cost"
          value={formatCurrency(inputCost)}
          layout="vertical"
        />
        <SimpleStatCard
          title="Avg daily cost"
          value={formatCurrency(Number.isFinite(avgDailyCost) ? avgDailyCost : 0)}
          layout="vertical"
        />
      </div>

      {/* 6️⃣ Quick actions */}
      <div className="fv-card flex flex-wrap gap-3">
        {project.status === 'active' && (
          <button
            className="fv-btn fv-btn--primary"
            onClick={() => navigate(`/projects/${project.id}/planning`)}
          >
            Planning
          </button>
        )}
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/challenges')}
        >
          <ListChecks className="h-4 w-4" />
          Add Season Challenge
        </button>
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/operations')}
        >
          <Users className="h-4 w-4" />
          View Work Logs
        </button>
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/expenses')}
        >
          <Wallet className="h-4 w-4" />
          View Expenses
        </button>
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/inventory')}
        >
          <Activity className="h-4 w-4" />
          View Inventory Usage
        </button>
      </div>

      {/* Details dialog: deep view for Work Logs / Inventory / Expenses */}
      <Dialog open={detailsDialog !== null} onOpenChange={(open) => !open && setDetailsDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {detailsDialog === 'workLogs' && 'Work Logs – Full detail'}
              {detailsDialog === 'inventory' && 'Inventory Usage – Full detail'}
              {detailsDialog === 'expenses' && 'Expenses – Full detail'}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-2">
            {detailsDialog === 'workLogs' && (
              <>
                <div className="text-sm text-muted-foreground">
                  {workLogs.length} log(s) · {totalPeopleDays} people-days · {formatCurrency(derivedLabourCost)} derived labour cost
                </div>
                {!workLogs.length && (
                  <p className="text-sm text-muted-foreground">No work logs recorded yet.</p>
                )}
                {workLogs.length > 0 && (
                  <div className="space-y-3">
                    {[...workLogs]
                      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))
                      .map((w) => {
                        const d = normalizeDate(w.date);
                        const cost = (w.numberOfPeople || 0) * (w.ratePerPerson || 0);
                        return (
                          <div key={w.id} className="border rounded-lg p-3 text-sm space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{d ? formatDate(d) : '—'}</span>
                              <span className="fv-badge text-xs">{w.workCategory}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              <span>{w.numberOfPeople ?? 0} people</span>
                              {w.ratePerPerson != null && <span>{formatCurrency(w.ratePerPerson)}/person</span>}
                              <span className="font-medium text-foreground">{formatCurrency(cost)}</span>
                            </div>
                            {(w.notes || w.inputsUsed) && (
                              <p className="text-xs text-muted-foreground pt-1 border-t mt-1">
                                {[w.notes, w.inputsUsed].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
            {detailsDialog === 'inventory' && (
              <>
                <div className="text-sm text-muted-foreground">
                  {inventoryUsage.length} usage record(s)
                </div>
                {!inventoryUsage.length && (
                  <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>
                )}
                {inventoryUsage.length > 0 && (
                  <div className="space-y-3">
                    {[...inventoryUsage]
                      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))
                      .map((u) => {
                        const d = normalizeDate(u.date);
                        return (
                          <div key={u.id} className="border rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-medium capitalize">{u.category}</span>
                              <span className="text-muted-foreground ml-2">
                                {d ? formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </span>
                            </div>
                            <span className="font-medium">
                              {u.quantity} {u.unit}
                            </span>
                            {u.source && (
                              <span className="fv-badge text-xs capitalize">{u.source.replace('-', ' ')}</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
            {detailsDialog === 'expenses' && (
              <>
                <div className="text-sm text-muted-foreground">
                  {expenses.length} expense(s) · {formatCurrency(totalExpenses)} total
                </div>
                {!expenses.length && (
                  <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
                )}
                {expenses.length > 0 && (
                  <div className="space-y-3">
                    {[...expenses]
                      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))
                      .map((e) => {
                        const d = normalizeDate(e.date);
                        return (
                          <div key={e.id} className="border rounded-lg p-3 text-sm space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{d ? formatDate(d) : '—'}</span>
                              <span className="fv-badge text-xs capitalize">{e.category}</span>
                              <span className="font-semibold">{formatCurrency(e.amount)}</span>
                            </div>
                            {e.description && (
                              <p className="text-xs text-muted-foreground">{e.description}</p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete project - bottom */}
      <div className="fv-card border-destructive/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Delete project</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently delete this project and all its stages, work logs, expenses, and season challenges. This cannot be undone.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="fv-btn fv-btn--secondary text-destructive hover:bg-destructive/10 w-fit"
                disabled={deletingProject}
              >
                <Trash2 className="h-4 w-4" />
                Delete project
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the project and all its stages, work logs, expenses, and season challenges. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!companyId || !project?.id) return;
                    setDeletingProject(true);
                    try {
                      await deleteProject(companyId, project.id);
                      if (activeProject?.id === project.id) {
                        setActiveProject(null);
                      }
                      await queryClient.invalidateQueries({ queryKey: ['projects'] });
                      navigate('/projects');
                    } catch (err) {
                      console.error('Failed to delete project:', err);
                      alert('Failed to delete project. Please try again.');
                    } finally {
                      setDeletingProject(false);
                    }
                  }}
                >
                  {deletingProject ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

