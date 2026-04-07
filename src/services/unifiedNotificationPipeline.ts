import type { UnifiedNotificationKind, UnifiedNotificationTier } from '@/services/unifiedNotificationTypes';
import { UNIFIED_TIER_PRIORITY } from '@/services/unifiedNotificationTypes';
import { showFarmVaultLocalNotification } from '@/services/farmVaultLocalPush';
import {
  defaultAudiencesForUnifiedKind,
  userReceivesAudiences,
  type NotificationAudience,
} from '@/lib/notificationAudience';
import type { User } from '@/types';

export type UnifiedEnqueuePayload = {
  tier: UnifiedNotificationTier;
  kind: UnifiedNotificationKind;
  title: string;
  body?: string;
  /** Deep link path */
  path: string;
  toastType?: 'info' | 'success' | 'warning' | 'error';
  /** When true, NotificationContext will not play sound (caller handles it). */
  skipSound?: boolean;
  /** When false, skip system notification (in-app only). Default true. */
  showSystemNotification?: boolean;
  /**
   * Recipients for this device. When omitted, defaults are derived from `kind`
   * via `defaultAudiencesForUnifiedKind` in NotificationProvider.
   */
  audiences?: NotificationAudience[];
};

type Sink = (payload: UnifiedEnqueuePayload) => void;

let sink: Sink | null = null;
let deliverPredicate: ((payload: UnifiedEnqueuePayload) => boolean) | null = null;
let buffer: UnifiedEnqueuePayload[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 420;

/** Use before playing UI sound so staff-only users do not get company-admin alert audio. */
export function unifiedNotificationWouldDeliverToUser(
  payload: UnifiedEnqueuePayload,
  user: User | null,
): boolean {
  if (!user) return false;
  const aud = payload.audiences ?? defaultAudiencesForUnifiedKind(payload.kind);
  return userReceivesAudiences(user, aud);
}

function pickWinner(batch: UnifiedEnqueuePayload[]): UnifiedEnqueuePayload {
  let best = batch[0];
  for (let i = 1; i < batch.length; i++) {
    const cur = batch[i];
    const pb = UNIFIED_TIER_PRIORITY[best.tier];
    const pc = UNIFIED_TIER_PRIORITY[cur.tier];
    if (pc < pb) best = cur;
    else if (pc === pb) best = cur;
  }
  return best;
}

function shouldDeliver(payload: UnifiedEnqueuePayload): boolean {
  if (!deliverPredicate) return true;
  return deliverPredicate(payload);
}

function flush(): void {
  timer = null;
  if (buffer.length === 0 || !sink) {
    buffer = [];
    return;
  }
  const eligible = buffer.filter(shouldDeliver);
  buffer = [];
  if (eligible.length === 0) return;
  const winner = pickWinner(eligible);
  sink(winner);
}

/**
 * Enqueue a notification; after a short debounce, only the highest-priority item is shown.
 * Same-tier items: the last one wins (most recent activity).
 */
export function enqueueUnifiedNotification(payload: UnifiedEnqueuePayload): void {
  if (!shouldDeliver(payload)) return;
  buffer.push(payload);
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

/** No debounce — use for realtime admin/critical alerts so they are not delayed. */
export function dispatchUnifiedNotificationNow(payload: UnifiedEnqueuePayload): void {
  if (!shouldDeliver(payload)) return;
  if (!sink) {
    buffer.push(payload);
    return;
  }
  sink(payload);
}

/** Register the handler that forwards to NotificationContext + local push. Call from NotificationProvider. */
export function setUnifiedNotificationSink(next: Sink | null): void {
  sink = next;
}

/**
 * Role / audience filter for unified notifications. When null, all payloads are delivered (tests / SSR).
 * NotificationProvider sets this from the signed-in user.
 */
export function setUnifiedNotificationDeliverPredicate(
  next: ((payload: UnifiedEnqueuePayload) => boolean) | null,
): void {
  deliverPredicate = next;
  if (next == null) buffer = [];
}

/** Flush immediately (e.g. tests). */
export function flushUnifiedNotificationQueueForTests(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  flush();
}

/** Optional: show local push without going through the queue (e.g. background). */
export async function showUnifiedLocalPushOnly(payload: UnifiedEnqueuePayload): Promise<void> {
  if (!shouldDeliver(payload)) return;
  if (payload.showSystemNotification === false) return;
  await showFarmVaultLocalNotification({
    title: payload.title,
    body: payload.body ?? '',
    path: payload.path,
    tag: payload.kind,
  });
}
