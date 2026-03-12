import React from 'react';
import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface InventoryUsageItem {
  itemId: string;
  itemName: string;
  totalQuantity: number;
  unit: string;
}

interface InventoryUsedTodayProps {
  usage: InventoryUsageItem[];
  className?: string;
}

export function InventoryUsedToday({ usage, className }: InventoryUsedTodayProps) {
  const totalItems = usage.length;
  const totalQuantity = usage.reduce((sum, item) => sum + item.totalQuantity, 0);

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-600" />
            Inventory Used Today
          </div>
          {totalItems > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No inventory used today</p>
          </div>
        ) : (
          <div className="space-y-3">
            {usage.map((item) => (
              <div
                key={item.itemId}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{item.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.unit}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">
                    {item.totalQuantity.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
