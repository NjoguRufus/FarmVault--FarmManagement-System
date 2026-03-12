import React from 'react';
import { Activity, CheckCircle, Edit, Banknote, Package, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNow, parseISO, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import type { WorkCardAuditLog } from '@/services/operationsWorkCardService';

interface TodayActivityFeedProps {
  logs: WorkCardAuditLog[];
  className?: string;
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  WORK_CREATED: { icon: <Clock className="h-4 w-4" />, color: 'text-blue-600 bg-blue-100', label: 'Work planned' },
  WORK_LOGGED: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600 bg-green-100', label: 'Work logged' },
  WORK_EDITED: { icon: <Edit className="h-4 w-4" />, color: 'text-amber-600 bg-amber-100', label: 'Work edited' },
  WORK_PAID: { icon: <Banknote className="h-4 w-4" />, color: 'text-purple-600 bg-purple-100', label: 'Work paid' },
  INVENTORY_USED: { icon: <Package className="h-4 w-4" />, color: 'text-teal-600 bg-teal-100', label: 'Inventory used' },
  WORK_UPDATED: { icon: <Edit className="h-4 w-4" />, color: 'text-gray-600 bg-gray-100', label: 'Work updated' },
};

export function TodayActivityFeed({ logs, className }: TodayActivityFeedProps) {
  const todayLogs = logs.filter(log => {
    try {
      const date = parseISO(log.createdAt);
      return isToday(date);
    } catch {
      return false;
    }
  });

  const formatTime = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'h:mm a');
    } catch {
      return '';
    }
  };

  const getEventDetails = (log: WorkCardAuditLog) => {
    const payload = log.payload ?? {};
    
    switch (log.eventType) {
      case 'WORK_LOGGED':
        return payload.workDone || payload.inputsUsed || log.message;
      case 'WORK_EDITED':
        if (payload.changes && typeof payload.changes === 'object') {
          const changes = Object.entries(payload.changes as Record<string, any>)
            .map(([key, val]) => `${key}: ${val.oldValue} → ${val.newValue}`)
            .join(', ');
          return changes || log.message;
        }
        return log.message;
      case 'WORK_PAID':
        return payload.amount ? `KSh ${Number(payload.amount).toLocaleString()}` : log.message;
      case 'INVENTORY_USED':
        return Array.isArray(payload.items) ? payload.items.join(', ') : log.message;
      default:
        return log.message;
    }
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-primary" />
          Today's Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todayLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity today yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {todayLogs.map((log) => {
                const config = EVENT_CONFIG[log.eventType] ?? EVENT_CONFIG.WORK_UPDATED;
                const details = getEventDetails(log);
                
                return (
                  <div key={log.id} className="flex gap-3">
                    <div className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      config.color
                    )}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">
                          {log.actorName || 'Unknown'}
                        </p>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {config.label}
                      </p>
                      {details && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {details}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
