import { runLocalDataSyncEngine } from '@/lib/localData/syncEngine';

export function isClientOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * After local write + queue, flush to Supabase when the browser is online.
 */
export function scheduleLocalDataSync(companyId: string | null | undefined): void {
  if (!companyId || !isClientOnline()) return;
  void runLocalDataSyncEngine(companyId);
}
