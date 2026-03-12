import React, { useMemo } from 'react';
import { AlertTriangle, Package, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { WorkCard } from '@/services/operationsWorkCardService';

interface InventoryUsageItem {
  itemId: string;
  itemName: string;
  totalQuantity: number;
  unit: string;
}

interface OperationsAlertsProps {
  workCards: WorkCard[];
  inventoryUsage: InventoryUsageItem[];
  className?: string;
}

interface AlertItem {
  id: string;
  type: 'warning' | 'info';
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function OperationsAlerts({ workCards, inventoryUsage, className }: OperationsAlertsProps) {
  const alerts = useMemo(() => {
    const alertList: AlertItem[] = [];

    // Check for overdue planned work
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overduePlanned = workCards.filter(card => {
      if (card.status !== 'planned' || !card.plannedDate) return false;
      const plannedDate = new Date(card.plannedDate);
      plannedDate.setHours(0, 0, 0, 0);
      return plannedDate < today;
    });

    if (overduePlanned.length > 0) {
      alertList.push({
        id: 'overdue-work',
        type: 'warning',
        icon: <Clock className="h-4 w-4" />,
        title: 'Overdue Work',
        description: `${overduePlanned.length} work card${overduePlanned.length !== 1 ? 's' : ''} past planned date`,
      });
    }

    // Check for high inventory usage (unusual activity)
    const highUsageItems = inventoryUsage.filter(item => item.totalQuantity > 100);
    if (highUsageItems.length > 0) {
      alertList.push({
        id: 'high-usage',
        type: 'info',
        icon: <TrendingUp className="h-4 w-4" />,
        title: 'High Usage Today',
        description: `${highUsageItems.map(i => i.itemName).join(', ')} - verify quantities`,
      });
    }

    // Check for unpaid logged work (older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const unpaidOldWork = workCards.filter(card => {
      if (card.status !== 'logged' && card.status !== 'edited') return false;
      if (card.payment.isPaid) return false;
      if (!card.loggedAt) return false;
      const loggedDate = new Date(card.loggedAt);
      return loggedDate < sevenDaysAgo;
    });

    if (unpaidOldWork.length > 0) {
      alertList.push({
        id: 'unpaid-work',
        type: 'warning',
        icon: <AlertTriangle className="h-4 w-4" />,
        title: 'Pending Payments',
        description: `${unpaidOldWork.length} work card${unpaidOldWork.length !== 1 ? 's' : ''} logged over 7 days ago not yet paid`,
      });
    }

    return alertList;
  }, [workCards, inventoryUsage]);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <Alert
            key={alert.id}
            variant={alert.type === 'warning' ? 'destructive' : 'default'}
            className={cn(
              alert.type === 'warning' 
                ? 'border-amber-200 bg-amber-50 text-amber-900' 
                : 'border-blue-200 bg-blue-50 text-blue-900'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex-shrink-0 mt-0.5',
                alert.type === 'warning' ? 'text-amber-600' : 'text-blue-600'
              )}>
                {alert.icon}
              </div>
              <div>
                <p className="font-medium text-sm">{alert.title}</p>
                <AlertDescription className="text-xs mt-1">
                  {alert.description}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}
