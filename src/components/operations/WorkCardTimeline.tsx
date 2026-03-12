import React from 'react';
import { Clock, CheckCircle, Edit, Banknote, Package, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogsForWorkCard, type WorkCardAuditLog } from '@/services/operationsWorkCardService';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkCardTimelineProps {
  workCardId: string;
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  WORK_CREATED: { 
    icon: <Plus className="h-4 w-4" />, 
    color: 'text-blue-600', 
    bgColor: 'bg-blue-100' 
  },
  WORK_UPDATED: { 
    icon: <Edit className="h-4 w-4" />, 
    color: 'text-gray-600', 
    bgColor: 'bg-gray-100' 
  },
  WORK_LOGGED: { 
    icon: <CheckCircle className="h-4 w-4" />, 
    color: 'text-green-600', 
    bgColor: 'bg-green-100' 
  },
  WORK_EDITED: { 
    icon: <Edit className="h-4 w-4" />, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-100' 
  },
  WORK_PAID: { 
    icon: <Banknote className="h-4 w-4" />, 
    color: 'text-purple-600', 
    bgColor: 'bg-purple-100' 
  },
  INVENTORY_USED: { 
    icon: <Package className="h-4 w-4" />, 
    color: 'text-teal-600', 
    bgColor: 'bg-teal-100' 
  },
};

export function WorkCardTimeline({ workCardId }: WorkCardTimelineProps) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['work-card-audit-logs', workCardId],
    queryFn: () => getAuditLogsForWorkCard(workCardId),
    enabled: !!workCardId,
  });

  const formatTime = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'h:mm a');
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMM d, yyyy');
    } catch {
      return '';
    }
  };

  const getEventDetails = (log: WorkCardAuditLog) => {
    const payload = log.payload ?? {};
    
    switch (log.eventType) {
      case 'WORK_CREATED':
        return payload.workTitle ? `Created: ${payload.workTitle}` : log.message;
      case 'WORK_LOGGED':
        if (payload.workDone) return payload.workDone;
        if (payload.inputsUsed) return `Inputs: ${payload.inputsUsed}`;
        return log.message;
      case 'WORK_EDITED':
        if (payload.changes && typeof payload.changes === 'object') {
          const changes = Object.entries(payload.changes as Record<string, any>)
            .map(([key, val]) => `${key}: ${val.oldValue} → ${val.newValue}`)
            .slice(0, 2)
            .join(', ');
          return changes || log.message;
        }
        return log.message;
      case 'WORK_PAID':
        return payload.amount 
          ? `KSh ${Number(payload.amount).toLocaleString()} via ${payload.method ?? 'cash'}`
          : log.message;
      case 'INVENTORY_USED':
        return Array.isArray(payload.items) 
          ? payload.items.join(', ') 
          : log.message;
      default:
        return log.message;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No activity recorded yet</p>
      </div>
    );
  }

  // Group logs by date
  const groupedLogs = logs.reduce((acc, log) => {
    const date = formatDate(log.createdAt);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, WorkCardAuditLog[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedLogs).map(([date, dateLogs]) => (
        <div key={date}>
          <p className="text-xs font-medium text-muted-foreground mb-3">{date}</p>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            
            <div className="space-y-4">
              {dateLogs.map((log, idx) => {
                const config = EVENT_CONFIG[log.eventType] ?? EVENT_CONFIG.WORK_UPDATED;
                const details = getEventDetails(log);
                
                return (
                  <div key={log.id} className="relative flex gap-4 pl-0">
                    {/* Timeline dot */}
                    <div className={cn(
                      'relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      config.bgColor,
                      config.color
                    )}>
                      {config.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0 pb-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">
                          {log.message ?? log.eventType.replace(/_/g, ' ').toLowerCase()}
                        </p>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by {log.actorName ?? 'Unknown'}
                      </p>
                      {details && details !== log.message && (
                        <p className="text-sm text-muted-foreground mt-2 p-2 rounded bg-muted/50">
                          {details}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
