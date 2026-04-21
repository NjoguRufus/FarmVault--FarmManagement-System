import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { supabase } from '@/lib/supabase';
import type { NotificationPortalType } from '@/lib/notificationBellSection';

type NotificationRow = {
  id: string;
  clerk_user_id: string;
  company_id: string | null;
  title: string;
  message: string | null;
  type: NotificationPortalType;
  read: boolean;
  click_url: string | null;
  group_key: string | null;
  created_at: string;
};

function mapRowToPortal(t: string): NotificationPortalType {
  if (t === 'ambassador' || t === 'developer' || t === 'company') return t;
  return 'company';
}

/**
 * Loads `public.notifications` into the bell, keeps them in sync via Realtime INSERT,
 * and aligns with server-triggered Web Push (dedupe keys use `db_notification:<uuid>`).
 */
export function NotificationsTableBridge() {
  const { user, authReady, clerkSignedIn } = useAuth();
  const { addNotification } = useNotifications();
  const addRef = useRef(addNotification);
  addRef.current = addNotification;
  useEffect(() => {
    if (!authReady || !clerkSignedIn || !user?.id) return;

    let cancelled = false;

    const pushRow = (row: NotificationRow) => {
      const path = row.click_url?.trim().startsWith('/') ? row.click_url!.trim() : '/home';
      const createdAt = Date.parse(row.created_at);
      addRef.current({
        id: row.id,
        title: row.title,
        message: row.message ?? undefined,
        toastType: 'info',
        type: mapRowToPortal(row.type),
        navigatePath: path,
        dedupeKey: `db_notification:${row.id}`,
        silent: true,
        skipSound: true,
        read: row.read,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      });
    };

    (async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          'id, clerk_user_id, company_id, title, message, type, read, click_url, group_key, created_at',
        )
        .eq('clerk_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(80);

      if (cancelled) return;
      if (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[NotificationsTableBridge] initial fetch skipped', error.message);
        }
        return;
      }
      const rows = (data ?? []) as NotificationRow[];
      for (const row of rows.reverse()) {
        pushRow(row);
      }
    })();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `clerk_user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow | null;
          if (!row?.id) return;
          pushRow(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authReady, clerkSignedIn, user?.id]);

  return null;
}
