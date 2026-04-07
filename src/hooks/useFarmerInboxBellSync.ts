import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useNotifications } from '@/contexts/NotificationContext';
import { farmerInboxNavigatePath } from '@/lib/farmerInboxNavigatePath';
import { userReceivesAudiences } from '@/lib/notificationAudience';
import type { FarmerSmartInboxRow } from '@/hooks/useFarmerSmartInbox';
import type { User } from '@/types';

const SEEN_PREFIX = 'farmvault:inbox-bell-seen:v1:';
const MAX_SEEN_IDS = 400;

function loadSeenSet(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function persistSeenSet(storageKey: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = [...ids];
    const trimmed = arr.length > MAX_SEEN_IDS ? arr.slice(-MAX_SEEN_IDS) : arr;
    window.localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Mirrors `farmer_smart_inbox` rows (same content as smart assistant emails) into the navbar bell.
 * Uses a persisted seen-id set so clearing the bell does not re-import the same inbox rows on refetch.
 * Only **company**-audience users (operators); staff/ambassador-only do not sync farm assistant digest here.
 */
export function useFarmerInboxBellSync(user: User | null, companyId: string | null, clerkUserId: string | null): void {
  const { addNotification } = useNotifications();
  const addRef = useRef(addNotification);
  addRef.current = addNotification;

  const companyAudience = userReceivesAudiences(user, ['company']);

  const q = useQuery({
    queryKey: ['farmer_smart_inbox', companyId ?? '', clerkUserId ?? ''],
    queryFn: async (): Promise<FarmerSmartInboxRow[]> => {
      if (!companyId?.trim() || !clerkUserId?.trim()) return [];
      const { data, error } = await db
        .public()
        .from('farmer_smart_inbox')
        .select('id,company_id,clerk_user_id,slot,category,title,body,metadata,dismissed_at,created_at')
        .eq('company_id', companyId.trim())
        .eq('clerk_user_id', clerkUserId.trim())
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as FarmerSmartInboxRow[];
    },
    enabled: companyAudience && Boolean(companyId?.trim() && clerkUserId?.trim()),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!clerkUserId?.trim() || !q.data?.length) return;
    const storageKey = `${SEEN_PREFIX}${clerkUserId.trim()}`;
    const seen = loadSeenSet(storageKey);
    let changed = false;
    for (const row of q.data) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      changed = true;
      addRef.current({
        dedupeKey: `farmer_smart_inbox:${row.id}`,
        title: row.title?.trim() || 'Farm assistant',
        message: row.body,
        type: 'info',
        navigatePath: farmerInboxNavigatePath(row.category),
        silent: true,
        skipSound: true,
        bellSection: 'workspace',
      });
    }
    if (changed) persistSeenSet(storageKey, seen);
  }, [q.data, clerkUserId]);
}
