import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cacheClerkCompanyId } from '@/lib/localData/clerkSessionCache';
import { runLocalDataSyncEngine } from '@/lib/localData/syncEngine';
import { syncQueue as runHarvestOfflineQueue } from '@/lib/offlineQueue';
import { ExpenseService } from '@/services/localData/ExpenseService';
import { FarmService } from '@/services/localData/FarmService';
import { ProjectService } from '@/services/localData/ProjectService';
import { HarvestService } from '@/services/localData/HarvestService';
import { EmployeeService } from '@/services/localData/EmployeeService';
import { SupplierService } from '@/services/localData/SupplierService';
import { InventoryService } from '@/services/localData/InventoryService';
import { isClientOnline } from '@/services/localData/shared';

/**
 * Hydrates local IndexedDB from Supabase when online and runs the durable sync queue.
 * Mount once under the app shell (with auth resolved).
 */
export function LocalDataBootstrap({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;

  useEffect(() => {
    if (user?.companyId) {
      void cacheClerkCompanyId(user.companyId);
    } else {
      void cacheClerkCompanyId(null);
    }
  }, [user?.companyId]);

  useEffect(() => {
    if (!companyId || !isClientOnline()) return;
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([
          ExpenseService.pullRemote(companyId, {}),
          FarmService.pullRemote(companyId),
          ProjectService.pullRemote(companyId),
          HarvestService.pullRemote(companyId, null),
          EmployeeService.pullRemote(companyId),
          SupplierService.pullRemote(companyId),
          InventoryService.pullRemote(companyId),
        ]);
      } catch {
        // Non-fatal: local store still serves pending/offline data
      }
      if (cancelled) return;
      await runLocalDataSyncEngine(companyId);
      await runHarvestOfflineQueue();
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return <>{children}</>;
}
