import React, { useMemo } from 'react';
import { Users, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { WorkCard } from '@/services/operationsWorkCardService';

interface ActiveWorkersTodayProps {
  workCards: WorkCard[];
  className?: string;
}

interface WorkerActivity {
  userId: string;
  name: string;
  workCount: number;
  lastActivity: string;
}

export function ActiveWorkersToday({ workCards, className }: ActiveWorkersTodayProps) {
  const activeWorkers = useMemo(() => {
    const workerMap = new Map<string, WorkerActivity>();

    for (const card of workCards) {
      if (!card.loggedByUserId || !card.loggedByName) continue;

      const existing = workerMap.get(card.loggedByUserId);
      if (existing) {
        existing.workCount += 1;
        if (card.loggedAt && card.loggedAt > existing.lastActivity) {
          existing.lastActivity = card.loggedAt;
        }
      } else {
        workerMap.set(card.loggedByUserId, {
          userId: card.loggedByUserId,
          name: card.loggedByName,
          workCount: 1,
          lastActivity: card.loggedAt ?? '',
        });
      }
    }

    return Array.from(workerMap.values()).sort((a, b) => b.workCount - a.workCount);
  }, [workCards]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Active Workers Today
          </div>
          <span className="text-sm font-normal text-muted-foreground">
            {activeWorkers.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeWorkers.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No workers active today</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeWorkers.map((worker) => (
              <div
                key={worker.userId}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(worker.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{worker.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {worker.workCount} work{worker.workCount !== 1 ? ' cards' : ' card'} logged
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
