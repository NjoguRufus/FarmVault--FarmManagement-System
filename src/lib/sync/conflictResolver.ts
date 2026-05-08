import type { LocalEntityRow } from '@/lib/localData/types';

/**
 * Last-Write-Wins conflict resolution.
 *
 * Rules:
 * - If no local row exists: always apply remote.
 * - If local row has pending (unsynced) writes that are newer: keep local.
 * - Otherwise: remote wins if its updated_at >= local updated_at.
 */
export function shouldApplyRemote(params: {
  local: LocalEntityRow | undefined;
  remoteUpdatedAt: string;
}): boolean {
  const { local, remoteUpdatedAt } = params;
  if (!local) return true;

  const localTs = new Date(local.updated_at).getTime();
  const remoteTs = new Date(remoteUpdatedAt).getTime();

  // Local has unsynced edits that are newer — preserve them.
  if (local.sync_status === 'pending' && localTs > remoteTs) return false;

  return remoteTs >= localTs;
}

/**
 * Merge two records for append-only fields (used for inventory quantities etc. in future).
 * Currently a no-op placeholder — last-write-wins on data level.
 */
export function mergeData(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  return { ...local, ...remote };
}
