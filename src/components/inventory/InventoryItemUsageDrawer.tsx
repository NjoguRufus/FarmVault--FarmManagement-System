import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import type { InventoryItem } from '@/types';
import { useInventoryMovements, useInventoryAuditLogs } from '@/hooks/useInventory';

export type InventoryItemUsageDrawerProps = {
  companyId: string | null;
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InventoryItemUsageDrawer(props: InventoryItemUsageDrawerProps) {
  const { companyId, item, open, onOpenChange } = props;

  const { movements, isLoading: loadingMovements } = useInventoryMovements(
    companyId,
    item?.id ?? null,
    50,
  );
  const { auditLogs, isLoading: loadingAudits } = useInventoryAuditLogs(
    companyId,
    item?.id ?? null,
    50,
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{item?.name ?? 'Inventory item'}</DrawerTitle>
          <DrawerDescription>
            Recent stock movements and audit logs for this item. Phase 2 focuses on manual restock and deduction only.
          </DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-4 px-4 pb-6 md:grid-cols-2 md:px-8">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Recent movements</h3>
            <div className="space-y-2 rounded-md border p-3 text-xs">
              {loadingMovements ? (
                <div className="text-muted-foreground">Loading movements…</div>
              ) : movements.length === 0 ? (
                <div className="text-muted-foreground">No movements recorded yet.</div>
              ) : (
                movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0 last:pb-0">
                    <div>
                      <div className="font-medium">
                        {m.direction === 'in' ? '+' : '-'}
                        {Math.abs(m.quantityDelta)} {item?.unit}
                      </div>
                      {m.reason && <div className="text-muted-foreground">{m.reason}</div>}
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                      {m.createdByName && (
                        <div className="truncate">By {m.createdByName}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Audit log</h3>
            <div className="space-y-2 rounded-md border p-3 text-xs">
              {loadingAudits ? (
                <div className="text-muted-foreground">Loading audit logs…</div>
              ) : auditLogs.length === 0 ? (
                <div className="text-muted-foreground">No audit events recorded yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0 last:pb-0">
                    <div>
                      <div className="font-medium">{log.action}</div>
                      {log.quantity != null && (
                        <div className="text-muted-foreground">
                          Qty: {log.quantity} {item?.unit}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                      {log.createdByName && (
                        <div className="truncate">By {log.createdByName}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

