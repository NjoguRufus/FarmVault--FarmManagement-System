import { FC } from 'react';
import { CalendarDays, User2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { WorkCard } from '@/services/operationsWorkCardService';

interface WorkCardItemProps {
  card: WorkCard;
  onView: () => void;
  onEdit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onMarkPaid?: () => void;
}

const statusClasses: Record<string, string> = {
  planned: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const WorkCardItem: FC<WorkCardItemProps> = ({
  card,
  onView,
  onEdit,
  onApprove,
  onReject,
  onMarkPaid,
}) => {
  const statusLabel = card.status.charAt(0).toUpperCase() + card.status.slice(1);
  const statusClass = statusClasses[card.status] ?? 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <div className="flex flex-col rounded-lg border border-border bg-background shadow-sm p-3 gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold line-clamp-2">{card.workTitle}</div>
          <div className="text-xs text-muted-foreground">
            {card.workCategory}
            {card.stageName ? ` • ${card.stageName}` : null}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
            statusClass,
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          <span>{card.plannedDate ? card.plannedDate : 'No date'}</span>
        </div>
        <div className="flex items-center gap-1">
          <User2 className="h-3 w-3" />
          <span>{card.managerName || 'Unassigned'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Planned: {card.plannedWorkers} × {card.plannedRatePerPerson} ={' '}
          <span className="font-medium text-foreground">{card.plannedTotal}</span>
        </span>
        {card.actualTotal != null && (
          <span>
            Actual:{' '}
            <span className="font-medium text-foreground">
              {card.actualWorkers} × {card.actualRatePerPerson} = {card.actualTotal}
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-1 pt-1">
        <div className="flex gap-1">
          <Button variant="outline" size="xs" onClick={onView}>
            View
          </Button>
          {card.status === 'planned' && onEdit && (
            <Button variant="outline" size="xs" onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          {card.status === 'submitted' && (
            <>
              {onApprove && (
                <Button variant="outline" size="xs" onClick={onApprove}>
                  Approve
                </Button>
              )}
              {onReject && (
                <Button variant="outline" size="xs" onClick={onReject}>
                  Reject
                </Button>
              )}
            </>
          )}
          {card.status === 'approved' && onMarkPaid && (
            <Button size="xs" onClick={onMarkPaid}>
              Mark paid
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

