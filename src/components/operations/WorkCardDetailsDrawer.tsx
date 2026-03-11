import { FC } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { WorkCard } from '@/services/operationsWorkCardService';
import { useWorkCardAuditLogs } from '@/hooks/useWorkCardAuditLogs';

interface WorkCardDetailsDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  card: WorkCard | null;
}

const actionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  SUBMIT: 'Submitted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  MARK_PAID: 'Marked as paid',
};

export const WorkCardDetailsDrawer: FC<WorkCardDetailsDrawerProps> = ({ open, onOpenChange, card }) => {
  const workCardId = card?.id ?? null;
  const { auditLogs, isLoading } = useWorkCardAuditLogs(workCardId);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>{card?.workTitle ?? 'Work card details'}</DrawerTitle>
        </DrawerHeader>
        {card && (
          <div className="px-4 pb-4 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Category</div>
                <div className="font-medium">{card.workCategory}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="font-medium">{card.status}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stage</div>
                <div className="font-medium">{card.stageName ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Manager</div>
                <div className="font-medium">{card.managerName ?? '-'}</div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Planned</div>
              <div className="rounded-md border border-border p-2 text-xs space-y-1">
                <div>Date: {card.plannedDate ?? '-'}</div>
                <div>
                  Workers: {card.plannedWorkers} × {card.plannedRatePerPerson} = {card.plannedTotal}
                </div>
                {card.notes && <div>Notes: {card.notes}</div>}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Actual</div>
              <div className="rounded-md border border-border p-2 text-xs space-y-1">
                <div>Date: {card.actualDate ?? '-'}</div>
                <div>
                  Workers:{' '}
                  {card.actualWorkers != null && card.actualRatePerPerson != null
                    ? `${card.actualWorkers} × ${card.actualRatePerPerson} = ${card.actualTotal ?? ''}`
                    : '-'}
                </div>
                {card.executionNotes && <div>Notes: {card.executionNotes}</div>}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Payment</div>
              <div className="rounded-md border border-border p-2 text-xs space-y-1">
                <div>Status: {card.payment.isPaid ? 'Paid' : 'Not paid'}</div>
                {card.payment.amount != null && (
                  <div>
                    Amount: {card.payment.amount} ({card.payment.method ?? 'method not set'})
                  </div>
                )}
                {card.payment.paidAt && <div>Paid at: {card.payment.paidAt}</div>}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Audit timeline
              </div>
              {isLoading ? (
                <div className="text-xs text-muted-foreground">Loading audit history…</div>
              ) : !auditLogs.length ? (
                <div className="text-xs text-muted-foreground">No audit events yet.</div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium">
                          {actionLabels[log.action] ?? log.action}{' '}
                          <span className="text-muted-foreground">by {log.userName ?? 'Unknown'}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{log.createdAt}</div>
                        {log.metadata && (
                          <div className="text-[11px] text-muted-foreground">
                            {Object.entries(log.metadata).map(([k, v]) => (
                              <span key={k} className="mr-2">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

