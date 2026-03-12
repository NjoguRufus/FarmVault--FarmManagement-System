import React, { useState } from 'react';
import { Archive, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';

interface ArchiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryStockRow | null;
  companyId: string;
  onArchived?: () => void;
  onArchive: (params: {
    companyId: string;
    itemId: string;
  }) => Promise<void>;
}

export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  item,
  companyId,
  onArchived,
  onArchive,
}: ArchiveConfirmDialogProps) {
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    if (!item) return;

    setArchiving(true);
    try {
      await onArchive({
        companyId,
        itemId: item.id,
      });

      toast.success(`${item.name} has been archived`);
      onOpenChange(false);
      onArchived?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive item';
      toast.error(message);
    } finally {
      setArchiving(false);
    }
  };

  if (!item) return null;

  const hasStock = (item.current_stock ?? 0) > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <Archive className="h-5 w-5" />
            Archive Inventory Item
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Are you sure you want to archive this item?
              </p>
              
              {/* Item info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <Package className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.category_name || item.category}
                    {hasStock && (
                      <span className="ml-2">
                        • {item.current_stock} {item.unit || 'units'} in stock
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {hasStock && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This item still has stock. Archiving will hide it from the inventory list but preserve the stock data.
                  </span>
                </div>
              )}

              <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                <p className="font-medium text-foreground mb-1">What happens when you archive:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Item will be hidden from the inventory list</li>
                  <li>All data will be preserved in the database</li>
                  <li>Action will be recorded in the audit trail</li>
                  <li>Item can be restored from the audit history</li>
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchive}
            disabled={archiving}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {archiving ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Archiving...
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-2" />
                Archive Item
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
