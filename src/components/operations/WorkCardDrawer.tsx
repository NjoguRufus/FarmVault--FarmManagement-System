import React, { useState } from 'react';
import {
  Clock,
  CheckCircle,
  Edit,
  Banknote,
  Calendar,
  User,
  Users,
  Package,
  FileText,
  History,
  MoreVertical,
  X,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import type { WorkCard, WorkCardStatus } from '@/services/operationsWorkCardService';
import { WorkCardTimeline } from './WorkCardTimeline';
import { RecordWorkModal } from './RecordWorkModal';
import { MarkPaidModal } from './MarkPaidModal';

interface WorkCardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workCard: WorkCard | null;
  onClose: () => void;
  onUpdated?: () => void;
}

const STATUS_CONFIG: Record<WorkCardStatus, { label: string; color: string; icon: React.ReactNode }> = {
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Clock className="h-4 w-4" /> },
  logged: { label: 'Logged', color: 'bg-green-100 text-green-800 border-green-200', icon: <CheckCircle className="h-4 w-4" /> },
  edited: { label: 'Edited', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Edit className="h-4 w-4" /> },
  paid: { label: 'Paid', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: <Banknote className="h-4 w-4" /> },
};

export function WorkCardDrawer({ open, onOpenChange, workCard, onClose, onUpdated }: WorkCardDrawerProps) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  
  const [showRecordWorkModal, setShowRecordWorkModal] = useState(false);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);

  if (!workCard) return null;

  const config = STATUS_CONFIG[workCard.status];
  const isEdited = workCard.status === 'edited' || (workCard.editHistory && workCard.editHistory.length > 0);
  const canRecordWork = workCard.status === 'planned';
  const canEditWork = workCard.status === 'logged' || workCard.status === 'edited';
  const canMarkPaid = (workCard.status === 'logged' || workCard.status === 'edited') && !workCard.payment.isPaid;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  const handleRecordWorkSuccess = () => {
    setShowRecordWorkModal(false);
    onUpdated?.();
  };

  const handleMarkPaidSuccess = () => {
    setShowMarkPaidModal(false);
    onUpdated?.();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn(
          isMobile ? 'h-[90vh]' : 'w-[500px] sm:w-[600px]'
        )}>
          <SheetHeader className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1 pr-4">
                <SheetTitle className="text-xl">{workCard.workTitle}</SheetTitle>
                <p className="text-sm text-muted-foreground">{workCard.workCategory}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn('flex items-center gap-1', config.color)}>
                  {config.icon}
                  {config.label}
                </Badge>
                {isEdited && workCard.status !== 'edited' && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <Edit className="h-3 w-3 mr-1" />
                    Edited
                  </Badge>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {canRecordWork && (
                <Button onClick={() => setShowRecordWorkModal(true)} className="flex-1">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Record Work
                </Button>
              )}
              {canEditWork && (
                <Button variant="outline" onClick={() => setShowRecordWorkModal(true)} className="flex-1">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Work
                </Button>
              )}
              {canMarkPaid && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowMarkPaidModal(true)}>
                      <Banknote className="h-4 w-4 mr-2" />
                      Mark as Paid
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </SheetHeader>

          <Separator className="my-4" />

          <Tabs defaultValue="details" className="flex-1">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              {isEdited && <TabsTrigger value="history">Edit History</TabsTrigger>}
            </TabsList>

            <TabsContent value="details" className="space-y-6 mt-4">
              {/* Section A - Planned */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Planned
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{formatDate(workCard.plannedDate)}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Workers</p>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{workCard.plannedWorkers}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rate per Person</p>
                    <p className="font-medium">KSh {workCard.plannedRatePerPerson.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Planned Total</p>
                    <p className="font-medium">KSh {workCard.plannedTotal.toLocaleString()}</p>
                  </div>
                </div>
                {workCard.allocatedWorkerName && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Assigned Worker</p>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{workCard.allocatedWorkerName}</p>
                    </div>
                  </div>
                )}
                {workCard.notes && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{workCard.notes}</p>
                  </div>
                )}
              </div>

              {/* Section B - Actual Work (if logged) */}
              {workCard.status !== 'planned' && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Actual Work
                    </h3>
                    
                    {workCard.workDone && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Work Done</p>
                        <p className="text-sm">{workCard.workDone}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium">{formatDate(workCard.actualDate)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Workers</p>
                        <p className="font-medium">{workCard.actualWorkers ?? '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Rate per Person</p>
                        <p className="font-medium">
                          {workCard.actualRatePerPerson ? `KSh ${workCard.actualRatePerPerson.toLocaleString()}` : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Actual Total</p>
                        <p className="font-medium">
                          {workCard.actualTotal ? `KSh ${workCard.actualTotal.toLocaleString()}` : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Inputs Used */}
                    {workCard.inputsUsed && workCard.inputsUsed.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Inputs Used</p>
                        <div className="space-y-2">
                          {workCard.inputsUsed.map((input, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                              <Package className="h-4 w-4 text-teal-600" />
                              <span className="font-medium">{input.quantity} {input.unit}</span>
                              <span className="text-muted-foreground">{input.itemName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Workers Involved */}
                    {workCard.workerNames && workCard.workerNames.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Workers Involved</p>
                        <div className="flex flex-wrap gap-2">
                          {workCard.workerNames.map((name, idx) => (
                            <Badge key={idx} variant="secondary">
                              <User className="h-3 w-3 mr-1" />
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {workCard.executionNotes && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p className="text-sm">{workCard.executionNotes}</p>
                      </div>
                    )}

                    {workCard.loggedByName && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Logged By</p>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium">{workCard.loggedByName}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(workCard.loggedAt)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Payment Info */}
              {workCard.payment.isPaid && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Payment
                    </h3>
                    <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-purple-600">Amount Paid</p>
                          <p className="text-2xl font-bold text-purple-900">
                            KSh {(workCard.payment.amount ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <Banknote className="h-8 w-8 text-purple-400" />
                      </div>
                      <div className="mt-3 pt-3 border-t border-purple-200 text-sm text-purple-700">
                        <p>Paid by {workCard.payment.paidByName ?? 'Unknown'}</p>
                        <p>{formatDateTime(workCard.payment.paidAt ?? null)}</p>
                        {workCard.payment.method && (
                          <p className="capitalize">Method: {workCard.payment.method}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <WorkCardTimeline workCardId={workCard.id} />
            </TabsContent>

            {isEdited && (
              <TabsContent value="history" className="mt-4">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Edit History
                  </h3>
                  {workCard.editHistory && workCard.editHistory.length > 0 ? (
                    <div className="space-y-4">
                      {workCard.editHistory.map((entry, idx) => (
                        <div key={idx} className="p-4 rounded-lg border bg-muted/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{entry.actorName ?? 'Unknown'}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(entry.timestamp)}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(entry.changes).map(([key, val]) => (
                              <div key={key} className="text-sm">
                                <span className="text-muted-foreground capitalize">{key}: </span>
                                <span className="line-through text-red-600 mr-2">
                                  {String(val.oldValue)}
                                </span>
                                <span className="text-green-600">→ {String(val.newValue)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No edit history available
                    </p>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Record Work Modal */}
      <RecordWorkModal
        open={showRecordWorkModal}
        onOpenChange={setShowRecordWorkModal}
        workCard={workCard}
        isEdit={canEditWork}
        onSuccess={handleRecordWorkSuccess}
      />

      {/* Mark Paid Modal */}
      <MarkPaidModal
        open={showMarkPaidModal}
        onOpenChange={setShowMarkPaidModal}
        workCard={workCard}
        onSuccess={handleMarkPaidSuccess}
      />
    </>
  );
}
