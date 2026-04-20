import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Wrench, Clock, CheckCircle, Edit, Banknote, Users, Package, Activity, Filter } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { format, isToday, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  getWorkCardsForCompany,
  getTodayInventoryUsage,
  getRecentAuditLogs,
  type WorkCard,
  type WorkCardStatus,
  type WorkCardAuditLog,
} from '@/services/operationsWorkCardService';
import { PlanWorkModal } from '@/components/operations/PlanWorkModal';
import { LogWorkModal } from '@/components/operations/LogWorkModal';
import { WorkCardDrawer } from '@/components/operations/WorkCardDrawer';
import { TodayActivityFeed } from '@/components/operations/TodayActivityFeed';
import { WorkCardGrid } from '@/components/operations/WorkCardGrid';
import { InventoryUsedToday } from '@/components/operations/InventoryUsedToday';

const STATUS_CONFIG: Record<WorkCardStatus, { label: string; color: string; icon: React.ReactNode }> = {
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-800', icon: <Clock className="h-4 w-4" /> },
  logged: { label: 'Logged', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> },
  edited: { label: 'Edited', color: 'bg-amber-100 text-amber-800', icon: <Edit className="h-4 w-4" /> },
  paid: { label: 'Paid', color: 'bg-purple-100 text-purple-800', icon: <Banknote className="h-4 w-4" /> },
};

export default function AdminOperationsPage() {
  const { activeProject, activeFarmId, projects } = useProject();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  
  const companyId = user?.companyId ?? null;
  const canCreateWorkCard = can('operations', 'createWorkCard');
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkCardStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showPlanWorkModal, setShowPlanWorkModal] = useState(false);
  const [showLogWorkModal, setShowLogWorkModal] = useState(false);
  const [selectedWorkCard, setSelectedWorkCard] = useState<WorkCard | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);

  // Fetch all work cards for company
  const { data: workCards = [], isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ['work-cards', companyId],
    queryFn: () => getWorkCardsForCompany({ companyId: companyId! }),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Fetch today's inventory usage
  const { data: todayInventoryUsage = [] } = useQuery({
    queryKey: ['today-inventory-usage', companyId],
    queryFn: () => getTodayInventoryUsage(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Fetch recent audit logs for activity feed
  const { data: recentLogs = [] } = useQuery({
    queryKey: ['recent-audit-logs', companyId],
    queryFn: () => getRecentAuditLogs(companyId!, 50),
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Filter work cards
  const filteredCards = useMemo(() => {
    let filtered = workCards;

    if (projectFilter !== 'all') {
      filtered = filtered.filter(c => c.projectId === projectFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.workTitle.toLowerCase().includes(searchLower) ||
        c.workCategory.toLowerCase().includes(searchLower) ||
        (c.allocatedWorkerName ?? '').toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [workCards, projectFilter, statusFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogged = workCards.filter(c => 
      (c.status === 'logged' || c.status === 'edited') && 
      c.loggedAt && c.loggedAt.startsWith(today)
    );
    
    const plannedCount = workCards.filter(c => c.status === 'planned').length;
    const loggedCount = workCards.filter(c => c.status === 'logged' || c.status === 'edited').length;
    const paidCount = workCards.filter(c => c.status === 'paid').length;
    const totalPaid = workCards
      .filter(c => c.payment.isPaid)
      .reduce((sum, c) => sum + (c.payment.amount ?? 0), 0);

    const uniqueWorkers = new Set(
      todayLogged.map(c => c.loggedByUserId).filter(Boolean)
    );

    return {
      todayLogged: todayLogged.length,
      plannedCount,
      loggedCount,
      paidCount,
      totalPaid,
      activeWorkers: uniqueWorkers.size,
      inventoryItemsUsed: todayInventoryUsage.length,
    };
  }, [workCards, todayInventoryUsage]);

  const handleCardClick = (card: WorkCard) => {
    setSelectedWorkCard(card);
    setShowDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setSelectedWorkCard(null);
  };

  const handleWorkCardUpdated = () => {
    refetchCards();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1>
            <p className="text-muted-foreground">Manage work cards, track activity, and monitor inventory usage</p>
          </div>
          {canCreateWorkCard && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setShowLogWorkModal(true)} className="gap-2">
                <Wrench className="h-4 w-4" />
                Record Work
              </Button>
              <Button onClick={() => setShowPlanWorkModal(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Plan Work
              </Button>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SimpleStatCard
            title="Today's Work"
            value={stats.todayLogged}
            icon={Activity}
            layout={isMobile ? 'mobile-compact' : 'horizontal'}
          />
          <SimpleStatCard
            title="Planned"
            value={stats.plannedCount}
            icon={Clock}
            layout={isMobile ? 'mobile-compact' : 'horizontal'}
          />
          <SimpleStatCard
            title="Active Workers"
            value={stats.activeWorkers}
            icon={Users}
            layout={isMobile ? 'mobile-compact' : 'horizontal'}
          />
          <SimpleStatCard
            title="Items Used Today"
            value={stats.inventoryItemsUsed}
            icon={Package}
            layout={isMobile ? 'mobile-compact' : 'horizontal'}
          />
        </div>

        {/* Main Content */}
        {isMobile ? (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search work cards..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Popover open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-foreground transition-colors hover:bg-muted/50"
                    aria-label="Open filters"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} className="w-72 p-3 sm:hidden">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
                      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as WorkCardStatus | 'all')}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="logged">Logged</SelectItem>
                          <SelectItem value="edited">Edited</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</label>
                      <Select value={projectFilter} onValueChange={setProjectFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Project" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Projects</SelectItem>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 1) Work cards first */}
            <WorkCardGrid
              cards={filteredCards}
              isLoading={cardsLoading}
              onCardClick={handleCardClick}
              statusConfig={STATUS_CONFIG}
            />

            {/* 2) Inventory + Today's activity together */}
            <InventoryUsedToday usage={todayInventoryUsage} />
            <TodayActivityFeed logs={recentLogs} />

          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Activity Feed & Alerts */}
            <div className="lg:col-span-1 space-y-6">
              <TodayActivityFeed logs={recentLogs} />
            </div>

            {/* Right Column - Work Cards & Inventory */}
            <div className="lg:col-span-2 space-y-6">
              {/* Filters */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search work cards..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as WorkCardStatus | 'all')}>
                      <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="logged">Logged</SelectItem>
                        <SelectItem value="edited">Edited</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Work Cards Grid */}
              <WorkCardGrid
                cards={filteredCards}
                isLoading={cardsLoading}
                onCardClick={handleCardClick}
                statusConfig={STATUS_CONFIG}
              />

              {/* Inventory Used Today */}
              <InventoryUsedToday usage={todayInventoryUsage} />
            </div>
          </div>
        )}
      </div>

      {/* Plan Work Modal */}
      <PlanWorkModal
        open={showPlanWorkModal}
        onOpenChange={setShowPlanWorkModal}
        initialFarmId={activeProject?.farmId ?? activeFarmId ?? null}
        initialProjectId={activeProject?.id ?? null}
        onSuccess={() => {
          setShowPlanWorkModal(false);
          refetchCards();
        }}
      />

      <LogWorkModal
        open={showLogWorkModal}
        onOpenChange={setShowLogWorkModal}
        initialFarmId={activeProject?.farmId ?? activeFarmId ?? null}
        initialProjectId={activeProject?.id ?? null}
        onSuccess={() => {
          setShowLogWorkModal(false);
          refetchCards();
        }}
      />

      {/* Work Card Drawer */}
      <WorkCardDrawer
        open={showDrawer}
        onOpenChange={setShowDrawer}
        workCard={selectedWorkCard}
        onClose={handleCloseDrawer}
        onUpdated={handleWorkCardUpdated}
      />
    </div>
  );
}
