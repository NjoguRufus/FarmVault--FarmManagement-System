import React, { useMemo, useState } from 'react';
import { Plus, Wrench, CheckCircle, Calendar, TrendingUp, Users, DollarSign, Sprout } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, CropStage, Employee, OperationsWorkCard } from '@/types';
import { LuxuryStatCard } from '@/components/dashboard/LuxuryStatCard';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { cn } from '@/lib/utils';
import { toDate } from '@/lib/dateUtils';
import { getCurrentStageForProject } from '@/services/stageService';
import { syncTodaysLabourExpenses } from '@/services/workLogService';
import { useWorkCardsForManager } from '@/hooks/useWorkCards';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

export function ManagerDashboard() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [markingAllPaid, setMarkingAllPaid] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Data sources
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');

  // Work can be allocated to manager by user id (auth uid) or by employee doc id (operations-manager). Match both.
  const managerIdsForCurrentUser = useMemo(() => {
    if (!user) return new Set<string>();
    const ids = new Set<string>();
    ids.add(user.id);
    const myEmployee = allEmployees.find((e) => (e as Employee & { authUserId?: string }).authUserId === user.id);
    if (myEmployee) ids.add(myEmployee.id);
    return ids;
  }, [user, allEmployees]);
  const managerIdsArray = useMemo(() => Array.from(managerIdsForCurrentUser), [managerIdsForCurrentUser]);
  const { data: managerWorkCards = [] } = useWorkCardsForManager(managerIdsArray);

  // Filter by project and manager (current user as manager, by either id)
  const projectWorkLogs = useMemo(() => {
    if (!activeProject || !user) return [];
    return allWorkLogs.filter(
      w => w.projectId === activeProject.id &&
      w.companyId === activeProject.companyId &&
      w.managerId != null &&
      managerIdsForCurrentUser.has(w.managerId)
    );
  }, [allWorkLogs, activeProject, user, managerIdsForCurrentUser]);

  const todayWorkLogs = useMemo(() => {
    return projectWorkLogs.filter(log => {
      const logDate = toDate(log.date);
      return logDate && logDate >= today && logDate <= todayEnd;
    });
  }, [projectWorkLogs, today, todayEnd]);

  const projectWorkCards = useMemo(() => {
    if (!activeProject || !user) return [];
    return managerWorkCards.filter((card) => {
      if (card.projectId !== activeProject.id || card.companyId !== activeProject.companyId) return false;
      if (card.allocatedManagerId && managerIdsForCurrentUser.has(card.allocatedManagerId)) return true;
      if (card.createdByManagerId && managerIdsForCurrentUser.has(card.createdByManagerId)) return true;
      if (card.actual?.managerId && managerIdsForCurrentUser.has(card.actual.managerId)) return true;
      return false;
    });
  }, [managerWorkCards, activeProject, user, managerIdsForCurrentUser]);

  const todayWorkCards = useMemo(() => {
    const getCardDate = (card: OperationsWorkCard) =>
      toDate(card.actual?.actualDate ?? card.planned?.date ?? card.createdAt);
    return projectWorkCards.filter((card) => {
      const cardDate = getCardDate(card);
      return cardDate && cardDate >= today && cardDate <= todayEnd;
    });
  }, [projectWorkCards, today, todayEnd]);

  const projectStages = useMemo(() => {
    if (!activeProject) return [];
    return allStages.filter(
      s => s.projectId === activeProject.id &&
      s.companyId === activeProject.companyId &&
      s.cropType === activeProject.cropType
    ).sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0));
  }, [allStages, activeProject]);

  const currentStage = useMemo(() => {
    return getCurrentStageForProject(projectStages);
  }, [projectStages]);

  // Calculate stats
  const todaysWorkCount = todayWorkLogs.length + todayWorkCards.length;
  const totalPeopleToday = useMemo(() => {
    const fromLogs = todayWorkLogs.reduce((sum, log) => sum + (log.numberOfPeople || 0), 0);
    const fromCards = todayWorkCards.reduce(
      (sum, card) => sum + Number(card.actual?.actualWorkers ?? card.planned?.workers ?? 0),
      0
    );
    return fromLogs + fromCards;
  }, [todayWorkLogs, todayWorkCards]);

  const labourCostToday = useMemo(() => {
    const fromLogs = todayWorkLogs.reduce((sum, log) => sum + (log.totalPrice || 0), 0);
    const fromCards = todayWorkCards.reduce((sum, card) => {
      const workers = Number(card.actual?.actualWorkers ?? card.planned?.workers ?? 0);
      const rate = Number(card.actual?.ratePerPerson ?? 0);
      return sum + workers * rate;
    }, 0);
    return fromLogs + fromCards;
  }, [todayWorkLogs, todayWorkCards]);

  const unpaidWorkLogs = useMemo(() => {
    return projectWorkLogs.filter(log => !log.paid && log.totalPrice && log.totalPrice > 0);
  }, [projectWorkLogs]);

  const unpaidTotal = useMemo(() => {
    return unpaidWorkLogs.reduce((sum, log) => sum + (log.totalPrice || 0), 0);
  }, [unpaidWorkLogs]);

  // Stage progress calculation
  const stageProgress = useMemo(() => {
    if (!currentStage || !projectStages.length) return 0;
    const stage = projectStages.find(s => s.stageIndex === currentStage.stageIndex);
    if (!stage || !stage.startDate || !stage.endDate) return 0;
    const start = toDate(stage.startDate);
    const end = toDate(stage.endDate);
    if (!start || !end) return 0;
    const now = new Date();
    const total = end.getTime() - start.getTime();
    const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
    return Math.round((elapsed / total) * 100);
  }, [currentStage, projectStages]);

  const daysInStage = useMemo(() => {
    if (!currentStage || !projectStages.length) return 0;
    const stage = projectStages.find(s => s.stageIndex === currentStage.stageIndex);
    if (!stage || !stage.startDate) return 0;
    const start = toDate(stage.startDate);
    if (!start) return 0;
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [currentStage, projectStages]);

  type TodayWorkEntry = {
    id: string;
    people: number;
    rate?: number;
    total?: number;
    notes?: string;
    paid: boolean;
    source: 'workLog' | 'workCard';
    statusLabel?: string;
  };

  // Group today's work items (legacy work logs + operations work cards) by category.
  const workEntriesByCategory = useMemo(() => {
    const grouped: Record<string, TodayWorkEntry[]> = {};

    todayWorkLogs.forEach((log) => {
      const category = log.workCategory || 'Uncategorized work';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({
        id: log.id,
        people: Number(log.numberOfPeople || 0),
        rate: log.ratePerPerson,
        total: log.totalPrice,
        notes: log.notes,
        paid: Boolean(log.paid),
        source: 'workLog',
      });
    });

    todayWorkCards.forEach((card) => {
      const category = card.workCategory || card.workTitle || 'Uncategorized work';
      if (!grouped[category]) grouped[category] = [];
      const people = Number(card.actual?.actualWorkers ?? card.planned?.workers ?? 0);
      const rate = Number(card.actual?.ratePerPerson ?? 0) || undefined;
      const total = rate != null ? people * rate : undefined;
      const paid = Boolean(card.payment?.isPaid || card.status === 'paid');

      grouped[category].push({
        id: card.id,
        people,
        rate,
        total,
        notes: card.actual?.notes,
        paid,
        source: 'workCard',
        statusLabel: card.status ? String(card.status) : undefined,
      });
    });

    return grouped;
  }, [todayWorkLogs, todayWorkCards]);

  const handleSyncLabour = async () => {
    if (!activeProject || !user) return;
    setSyncing(true);
    try {
      await syncTodaysLabourExpenses({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        date: today,
        paidByUserId: user.id,
        paidByName: user.name,
      });
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkAllAsPaid = async () => {
    if (!user || unpaidWorkLogs.length === 0) return;
    setMarkingAllPaid(true);
    try {
      const batch = writeBatch(db);
      unpaidWorkLogs.forEach(log => {
        if (log.id) {
          const logRef = doc(db, 'workLogs', log.id);
          batch.update(logRef, {
            paid: true,
            paidAt: serverTimestamp(),
            paidBy: user.id,
            paidByName: user.name,
          });
        }
      });
      await batch.commit();
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } finally {
      setMarkingAllPaid(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="fv-card p-8 text-center">
          <p className="text-muted-foreground">Please select a project to view the manager dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manager Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Daily field operations for <span className="font-medium">{activeProject.name}</span>
        </p>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <LuxuryStatCard
          title="Today's Work"
          value={todaysWorkCount}
          icon={Wrench}
          iconVariant="primary"
        />
        <LuxuryStatCard
          title="Total People Today"
          value={totalPeopleToday}
          icon={Users}
          iconVariant="info"
        />
        <LuxuryStatCard
          title="Labour Cost (KES)"
          value={labourCostToday.toLocaleString()}
          icon={DollarSign}
          iconVariant="success"
        />
        <LuxuryStatCard
          title="Current Crop Stage"
          value={currentStage?.stageName || 'N/A'}
          icon={Sprout}
          iconVariant="gold"
          variant="gold"
        />
      </div>

      {/* Quick Actions */}
      <div className="fv-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/operations')} className="fv-btn fv-btn--primary">
            <Plus className="h-4 w-4" />
            Log Daily Work
          </Button>
          <Button onClick={() => navigate('/operations')} className="fv-btn fv-btn--secondary">
            <Wrench className="h-4 w-4" />
            View Today's Work
          </Button>
          <Button 
            onClick={handleSyncLabour} 
            disabled={syncing}
            className="fv-btn fv-btn--secondary"
          >
            <CheckCircle className="h-4 w-4" />
            {syncing ? 'Syncing...' : "Sync Labour Expenses"}
          </Button>
          <Button onClick={() => navigate('/challenges')} className="fv-btn fv-btn--secondary">
            <Plus className="h-4 w-4" />
            Add Season Challenge
          </Button>
        </div>
      </div>

      {/* Today's Work Logs */}
      <div className="fv-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Today's Work</h2>
        </div>
        <div className="p-4 space-y-4">
          {Object.keys(workEntriesByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No work logged for today.
            </p>
          ) : (
            Object.entries(workEntriesByCategory).map(([category, entries]) => (
              <div key={category} className="space-y-2">
                <h3 className="font-semibold text-foreground">{category}</h3>
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      entry.paid && "bg-muted/30"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{entry.people} people</span>
                          {entry.rate && (
                            <span className="text-sm text-muted-foreground">
                              @ KES {entry.rate.toLocaleString()}
                            </span>
                          )}
                          <span className={cn(
                            'fv-badge text-xs',
                            entry.paid ? 'fv-badge--success' : 'fv-badge--warning'
                          )}>
                            {entry.paid ? 'Paid' : 'Unpaid'}
                          </span>
                          {entry.source === 'workCard' && (
                            <span className="text-xs text-muted-foreground">
                              Card{entry.statusLabel ? ` • ${entry.statusLabel}` : ''}
                            </span>
                          )}
                        </div>
                        {entry.total && (
                          <p className="text-sm font-semibold text-foreground">
                            Total: KES {entry.total.toLocaleString()}
                          </p>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pending Payments */}
      {unpaidWorkLogs.length > 0 && (
        <div className="fv-card">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Pending Payments</h2>
              <Button 
                onClick={handleMarkAllAsPaid}
                disabled={markingAllPaid}
                className="fv-btn fv-btn--primary"
              >
                {markingAllPaid ? 'Marking...' : 'Mark All as Paid'}
              </Button>
            </div>
          </div>
          <div className="p-4">
            <SimpleStatCard
              title="Unpaid Labour Total"
              value={`KES ${unpaidTotal.toLocaleString()}`}
              subtitle={`${unpaidWorkLogs.length} work log${unpaidWorkLogs.length !== 1 ? 's' : ''} pending`}
              valueVariant="warning"
            />
          </div>
        </div>
      )}

      {/* Stage Context */}
      {currentStage && (
        <div className="fv-card">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-foreground">Stage Context</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SimpleStatCard
                title="Current Stage"
                value={currentStage.stageName}
                icon={Sprout}
                iconVariant="gold"
              />
              <SimpleStatCard
                title="Day in Stage"
                value={`Day ${daysInStage}`}
                icon={Calendar}
                iconVariant="info"
              />
              <SimpleStatCard
                title="Stage Progress"
                value={`${stageProgress}%`}
                icon={TrendingUp}
                iconVariant="success"
              />
            </div>
            <Button 
              onClick={() => navigate(`/projects/${activeProject.id}`)}
              className="fv-btn fv-btn--secondary"
            >
              View Project Details
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
