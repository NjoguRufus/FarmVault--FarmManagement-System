import { logger } from "@/lib/logger";
/**
 * Real-time subscription for admin alerts.
 * Listens to Supabase admin_alerts table and triggers notifications + sounds
 * when new alerts arrive for the current company.
 * 
 * Includes fallback polling for environments where real-time may not work.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import {
  dispatchUnifiedNotificationNow,
  unifiedNotificationWouldDeliverToUser,
} from '@/services/unifiedNotificationPipeline';
import { playNotificationSound, preloadAllSounds } from '@/services/notificationSoundService';
import type { NotificationSoundFile } from '@/services/notificationSoundService';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';

const NOTIFICATION_PREFS_KEY_PREFIX = 'farmvault:notification-prefs:v1:';
/** Fallback when Realtime is unavailable — keep conservative to avoid read amplification. */
const POLL_INTERVAL_MS = 45_000;
const POLL_ERROR_LOG_COOLDOWN_MS = 120_000; // Avoid spamming console on flaky networks

function isLikelyNetworkFailure(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? String((err as { message: string }).message).toLowerCase()
      : String(err ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
}
const PROCESSED_IDS_STORAGE_KEY = 'farmvault:processed-alert-ids:v1';

interface AdminAlertRow {
  id: string;
  company_id: string;
  severity: string;
  module: string;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  detail_path: string | null;
  read: boolean;
  created_at: string;
}

function getNotificationPrefs(userId: string | undefined): {
  enabled: boolean;
  soundEnabled: boolean;
  soundFile: NotificationSoundFile;
} {
  if (typeof window === 'undefined' || !userId) {
    logger.debug('[AdminAlertsRealtime] getNotificationPrefs: no window or userId', { userId });
    return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
  }
  try {
    const storageKey = `${NOTIFICATION_PREFS_KEY_PREFIX}${userId}`;
    const raw = window.localStorage.getItem(storageKey);
    logger.debug('[AdminAlertsRealtime] getNotificationPrefs raw from storage', { storageKey, raw });
    
    if (!raw) {
      logger.debug('[AdminAlertsRealtime] No prefs found, returning defaults (disabled)');
      return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
    }
    
    const parsed = JSON.parse(raw);
    const result = {
      enabled: Boolean(parsed.notificationsEnabled),
      soundEnabled: parsed.soundEnabled !== false,
      soundFile: (parsed.soundFile || 'notification1.aac') as NotificationSoundFile,
    };
    
    logger.debug('[AdminAlertsRealtime] Parsed notification prefs', result);
    return result;
  } catch (err) {
    console.error('[AdminAlertsRealtime] Error parsing notification prefs', err);
    return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
  }
}

function formatAlertTitle(alert: AdminAlertRow): string {
  const actionMap: Record<string, string> = {
    // Inventory
    CREATE: 'created',
    ITEM_CREATED: 'created',
    STOCK_IN: 'restocked',
    STOCK_DEDUCTED: 'deducted stock from',
    DEDUCT: 'deducted stock from',
    EDIT_ITEM: 'edited',
    ITEM_EDITED: 'edited',
    DELETE: 'deleted',
    ITEM_DELETED: 'deleted',
    ITEM_ARCHIVED: 'archived',
    RESTORE: 'restored',
    ITEM_RESTORED: 'restored',
    USAGE: 'recorded usage for',
    USAGE_RECORDED: 'recorded usage for',
    // Operations
    WORK_LOGGED: 'logged an operation —',
    WORK_EDITED: 'edited an operation —',
    WORK_PAID: 'marked as paid —',
    // Finance
    EXPENSE_RECORDED: 'recorded an expense —',
    EXPENSE_CREATED: 'recorded an expense —',
  };
  const actionVerb = actionMap[alert.action] || alert.action.toLowerCase().replace(/_/g, ' ');
  const actor =
    alert.actor_name?.trim() ||
    (typeof alert.metadata?.loggedBy === 'string' ? (alert.metadata.loggedBy as string).trim() : null) ||
    (typeof alert.metadata?.actor_name === 'string' ? (alert.metadata.actor_name as string).trim() : null) ||
    (typeof alert.metadata?.user_name === 'string' ? (alert.metadata.user_name as string).trim() : null) ||
    'Unknown user';
  const target = alert.target_label?.trim() || '';
  return target ? `${actor} ${actionVerb} ${target}` : `${actor} ${actionVerb.replace(/ —$/, '')}`;
}

function formatAlertMessage(alert: AdminAlertRow): string | undefined {
  const moduleLabel = alert.module.charAt(0).toUpperCase() + alert.module.slice(1).toLowerCase();
  if (alert.severity === 'high' || alert.severity === 'critical') {
    return `${moduleLabel} action requires attention`;
  }
  return `${moduleLabel} activity`;
}

// Persist processed IDs to localStorage to survive page refreshes
function getProcessedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(PROCESSED_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.slice(-500)); // Keep last 500
    return new Set();
  } catch {
    return new Set();
  }
}

function saveProcessedIds(ids: Set<string>): void {
  try {
    const arr = Array.from(ids).slice(-500);
    window.localStorage.setItem(PROCESSED_IDS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage errors
  }
}

function resolveAdminAlertPath(alert: AdminAlertRow): string {
  const d = alert.detail_path?.trim();
  if (d?.startsWith('/')) return d;
  const m = (alert.module ?? '').toLowerCase();
  if (m === 'inventory') return '/inventory';
  if (m === 'operations' || m.includes('work')) return '/farm-work';
  return '/home';
}

export function useAdminAlertsRealtime() {
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const processedIdsRef = useRef<Set<string>>(getProcessedIds());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPollTimeRef = useRef<string | null>(null);
  const lastPollErrorLogRef = useRef<number>(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' || navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);
  
  /** Farm/workspace operators + platform dev — not field staff (`employee`). */
  const receivesAdminAlertStream =
    Boolean(user?.companyId) &&
    (user?.role === 'company-admin' ||
      user?.role === 'company_admin' ||
      user?.role === 'manager' ||
      user?.role === 'broker' ||
      user?.role === 'developer');
  const companyId = user?.companyId;
  const userId = user?.id;

  // Preload sounds on mount
  useEffect(() => {
    preloadAllSounds();
  }, []);

  const processAlert = useCallback(
    (alert: AdminAlertRow, source: 'realtime' | 'poll') => {
      logger.debug(`[AdminAlertsRealtime] Processing alert from ${source}`, {
        id: alert.id,
        action: alert.action,
        actorUserId: alert.actor_user_id,
        currentUserId: userId,
      });

      // Skip if this is our own action
      if (alert.actor_user_id === userId) {
        logger.debug('[AdminAlertsRealtime] Skipping own action');
        return;
      }

      // Skip if already processed (deduplication)
      if (processedIdsRef.current.has(alert.id)) {
        logger.debug('[AdminAlertsRealtime] Already processed, skipping', alert.id);
        return;
      }

      logger.debug('[AdminAlertsRealtime] New alert received', {
        id: alert.id,
        module: alert.module,
        action: alert.action,
        actorName: alert.actor_name,
        targetLabel: alert.target_label,
        severity: alert.severity,
        source,
      });

      const title = formatAlertTitle(alert);
      const message = formatAlertMessage(alert);
      const type = alert.severity === 'critical' ? 'error' : alert.severity === 'high' ? 'warning' : 'info';

      const tier = alert.severity === 'critical' ? 'premium' : 'insights';
      const kind =
        alert.severity === 'critical' ? 'premium_critical_alert' : 'insight_admin_alert';

      const unifiedPayload = {
        tier,
        kind,
        title,
        body: message,
        path: resolveAdminAlertPath(alert),
        toastType: type,
        skipSound: true,
      } as const;

      if (!unifiedNotificationWouldDeliverToUser(unifiedPayload, user)) {
        return;
      }

      processedIdsRef.current.add(alert.id);
      saveProcessedIds(processedIdsRef.current);
      if (processedIdsRef.current.size > 500) {
        const idsArray = Array.from(processedIdsRef.current);
        processedIdsRef.current = new Set(idsArray.slice(-250));
        saveProcessedIds(processedIdsRef.current);
      }

      dispatchUnifiedNotificationNow(unifiedPayload);

      // Play sound based on user preferences
      const prefs = getNotificationPrefs(userId);
      logger.debug('[AdminAlertsRealtime] Sound prefs for playback', {
        enabled: prefs.enabled,
        soundEnabled: prefs.soundEnabled,
        soundFile: prefs.soundFile,
        userId,
      });

      if (prefs.enabled && prefs.soundEnabled) {
        logger.debug('[AdminAlertsRealtime] Attempting to play sound:', prefs.soundFile);
        
        playNotificationSound(prefs.soundFile, { force: true })
          .then((played) => {
            logger.debug('[AdminAlertsRealtime] Sound playback result:', {
              played,
              soundFile: prefs.soundFile,
            });
          })
          .catch((err) => {
            console.warn('[AdminAlertsRealtime] Sound playback failed', err);
          });
      } else {
        logger.debug('[AdminAlertsRealtime] Sound not enabled, skipping playback', {
          notificationsEnabled: prefs.enabled,
          soundEnabled: prefs.soundEnabled,
        });
      }
    },
    [userId, user]
  );

  const handleRealtimeAlert = useCallback(
    (payload: RealtimePostgresInsertPayload<AdminAlertRow>) => {
      logger.debug('[AdminAlertsRealtime] Realtime payload received', payload);
      const alert = payload.new;

      if (!alert || !alert.id) {
        logger.debug('[AdminAlertsRealtime] Invalid payload, missing alert or id');
        return;
      }

      processAlert(alert, 'realtime');
    },
    [processAlert]
  );

  // Fallback polling for new alerts
  const pollForAlerts = useCallback(async () => {
    if (!companyId || !online) return;

    try {
      const since = lastPollTimeRef.current || new Date(Date.now() - 60000).toISOString(); // Last minute on first poll
      
      logger.debug('[AdminAlertsRealtime] Polling for alerts since', since);

      const { data, error } = await db
        .public()
        .from('admin_alerts')
        .select('*')
        .eq('company_id', companyId)
        .gt('created_at', since)
        .order('created_at', { ascending: true });

      if (error) {
        const now = Date.now();
        const net = isLikelyNetworkFailure(error);
        if (net && now - lastPollErrorLogRef.current < POLL_ERROR_LOG_COOLDOWN_MS) {
          return;
        }
        lastPollErrorLogRef.current = now;
        if (net) {
          console.warn('[AdminAlertsRealtime] Poll unreachable (network); will retry when online', error.message);
        } else {
          console.error('[AdminAlertsRealtime] Poll error', error);
        }
        return;
      }

      if (data && data.length > 0) {
        logger.debug('[AdminAlertsRealtime] Poll found alerts', data.length);
        data.forEach((alert) => processAlert(alert as AdminAlertRow, 'poll'));
        // Update last poll time to the most recent alert
        lastPollTimeRef.current = data[data.length - 1].created_at;
      } else {
        // Update last poll time even if no alerts
        lastPollTimeRef.current = new Date().toISOString();
      }
    } catch (err) {
      const now = Date.now();
      const net = isLikelyNetworkFailure(err);
      if (net && now - lastPollErrorLogRef.current < POLL_ERROR_LOG_COOLDOWN_MS) {
        return;
      }
      lastPollErrorLogRef.current = now;
      if (net) {
        console.warn('[AdminAlertsRealtime] Poll exception (network)', err);
      } else {
        console.error('[AdminAlertsRealtime] Poll exception', err);
      }
    }
  }, [companyId, processAlert, online]);

  // Set up real-time subscription
  useEffect(() => {
    if (!receivesAdminAlertStream || !companyId) {
      logger.debug('[AdminAlertsRealtime] Not subscribing - conditions not met', {
        receivesAdminAlertStream,
        companyId,
        userRole: user?.role,
      });
      return;
    }

    logger.debug('[AdminAlertsRealtime] Setting up real-time subscription', {
      companyId,
      userId,
      userRole: user?.role,
    });

    // Initialize last poll time
    lastPollTimeRef.current = new Date().toISOString();

    const channelName = `admin-alerts-${companyId}-${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
      .on<AdminAlertRow>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_alerts',
          filter: `company_id=eq.${companyId}`,
        },
        handleRealtimeAlert
      )
      .subscribe((status, err) => {
        logger.debug('[AdminAlertsRealtime] Subscription status changed', { status, error: err });
        
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
          logger.debug('[AdminAlertsRealtime] Successfully subscribed to real-time');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeConnected(false);
          console.warn('[AdminAlertsRealtime] Real-time connection issue, will rely on polling', { status, err });
        }
      });

    channelRef.current = channel;

    // Start fallback polling regardless (belt and suspenders)
    pollIntervalRef.current = setInterval(pollForAlerts, POLL_INTERVAL_MS);
    
    // Do an initial poll
    setTimeout(pollForAlerts, 1000);

    return () => {
      logger.debug('[AdminAlertsRealtime] Cleaning up subscription');
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [receivesAdminAlertStream, companyId, userId, user?.role, handleRealtimeAlert, pollForAlerts]);

  return { realtimeConnected };
}
