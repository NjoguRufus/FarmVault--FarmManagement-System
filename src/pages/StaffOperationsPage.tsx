import React, { useState, useMemo } from 'react';
import { Clock, CheckCircle, Edit, Banknote, Calendar, Package, History, Plus, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useCurrentEmployee } from '@/hooks/useCurrentEmployee';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  getWorkCardsForWorker,
  getWorkCardsForCompany,
  type WorkCard,
  type WorkCardStatus,
} from '@/services/operationsWorkCardService';
import { WorkCardDrawer } from '@/components/operations/WorkCardDrawer';
import { RecordWorkModal } from '@/components/operations/RecordWorkModal';
import { LogWorkModal } from '@/components/operations/LogWorkModal';

const STATUS_CONFIG: Record<WorkCardStatus, { label: string; color: string; icon: React.ReactNode }> = {
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-800', icon: <Clock className="h-4 w-4" /> },
  logged: { label: 'Logged', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> },
  edited: { label: 'Edited', color: 'bg-amber-100 text-amber-800', icon: <Edit className="h-4 w-4" /> },
  paid: { label: 'Paid', color: 'bg-purple-100 text-purple-800', icon: <Banknote className="h-4 w-4" /> },
};

export default function StaffOperationsPage() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const { employee } = useCurrentEmployee();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  
  const companyId = user?.companyId ?? null;
  const employeeId = employee?.id ?? null;
  const canRecordWork = can('operations', 'recordDailyWork');

  const [selectedWorkCard, setSelectedWorkCard] = useState<WorkCard | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showLogWorkModal, setShowLogWorkModal] = useState(false);
  const [activeTab, setActiveTab] = useState('assigned');

  // Fetch work cards assigned to this employee
  const { data: assignedCards = [], refetch: refetchAssigned } = useQuery({
    queryKey: ['assigned-work-cards', companyId, employeeId],
    queryFn: () => getWorkCardsForWorker({
      companyId: companyId!,
      workerId: employeeId!,
    }),
    enabled: !!companyId && !!employeeId,
  });

  // Fetch all work cards for history (where this employee logged work)
  const { data: allCards = [], refetch: refetchAll } = useQuery({
    queryKey: ['all-work-cards', companyId],
    queryFn: () => getWorkCardsForCompany({ companyId: companyId! }),
    enabled: !!companyId,
  });

  // Filter cards logged by this employee for history
  const historyCards = useMemo(() => {
    return allCards.filter(card => 
      card.loggedByUserId === user?.id || 
      card.loggedByUserId === employeeId
    );
  }, [allCards, user?.id, employeeId]);

  // Filter pending cards (assigned but not yet logged)
  const pendingCards = useMemo(() => {
    return assignedCards.filter(card => card.status === 'planned');
  }, [assignedCards]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const handleCardClick = (card: WorkCard) => {
    setSelectedWorkCard(card);
    setShowDrawer(true);
  };

  const handleRecordClick = (card: WorkCard) => {
    setSelectedWorkCard(card);
    setShowRecordModal(true);
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setSelectedWorkCard(null);
  };

  const handleWorkUpdated = () => {
    refetchAssigned();
    refetchAll();
  };

  const renderWorkCard = (card: WorkCard, showRecordButton = false) => {
    const config = STATUS_CONFIG[card.status];
    const isEdited = card.status === 'edited' || (card.editHistory && card.editHistory.length > 0);
    const hasInputs = card.inputsUsed && card.inputsUsed.length > 0;

    return (
      <Card
        key={card.id}
        className={cn(
          'cursor-pointer transition-all hover:shadow-md',
          'active:scale-[0.98]'
        )}
        onClick={() => handleCardClick(card)}
      >
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Header with status */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base line-clamp-2">
                  {card.workTitle}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {card.workCategory}
                </p>
              </div>
              <Badge className={cn('flex-shrink-0', config.color)}>
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Badge>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {formatDate(card.plannedDate)}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {isEdited && card.status !== 'edited' && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                  <Edit className="h-3 w-3 mr-1" />
                  Edited
                </Badge>
              )}
              {hasInputs && (
                <Badge variant="outline" className="text-teal-600 border-teal-300 bg-teal-50 text-xs">
                  <Package className="h-3 w-3 mr-1" />
                  {card.inputsUsed.length} input{card.inputsUsed.length !== 1 ? 's' : ''}
                </Badge>
              )}
              {card.payment.isPaid && (
                <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 text-xs">
                  KSh {(card.payment.amount ?? 0).toLocaleString()}
                </Badge>
              )}
            </div>

            {/* Record Work Button */}
            {showRecordButton && card.status === 'planned' && (
              <Button
                className="w-full mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRecordClick(card);
                }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Record Work
              </Button>
            )}

            {/* Work Done Summary */}
            {card.status !== 'planned' && card.workDone && (
              <p className="text-sm text-muted-foreground line-clamp-2 pt-2 border-t">
                {card.workDone}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-6">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Operations</h1>
            <p className="text-muted-foreground">
              View assigned work and log your activities
            </p>
          </div>
          {canRecordWork && (
            <Button onClick={() => setShowLogWorkModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Log Work
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{pendingCards.length}</p>
              <p className="text-sm text-muted-foreground">Pending Work</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{historyCards.length}</p>
              <p className="text-sm text-muted-foreground">Work Logged</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assigned" className="gap-2">
              <Clock className="h-4 w-4" />
              Assigned ({pendingCards.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History ({historyCards.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assigned" className="mt-4">
            {pendingCards.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium mb-1">No pending work</h3>
                  <p className="text-sm text-muted-foreground">
                    You don't have any assigned work cards at the moment
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingCards.map((card) => renderWorkCard(card, true))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {historyCards.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium mb-1">No work history</h3>
                  <p className="text-sm text-muted-foreground">
                    Your logged work will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {historyCards.map((card) => renderWorkCard(card, false))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Work Card Drawer */}
      <WorkCardDrawer
        open={showDrawer}
        onOpenChange={setShowDrawer}
        workCard={selectedWorkCard}
        onClose={handleCloseDrawer}
        onUpdated={handleWorkUpdated}
      />

      {/* Record Work Modal (for assigned work cards) */}
      <RecordWorkModal
        open={showRecordModal}
        onOpenChange={setShowRecordModal}
        workCard={selectedWorkCard}
        isEdit={false}
        onSuccess={() => {
          setShowRecordModal(false);
          handleWorkUpdated();
        }}
      />

      {/* Log Work Modal (for creating new work directly) */}
      <LogWorkModal
        open={showLogWorkModal}
        onOpenChange={setShowLogWorkModal}
        onSuccess={() => {
          setShowLogWorkModal(false);
          handleWorkUpdated();
        }}
      />
    </div>
  );
}
