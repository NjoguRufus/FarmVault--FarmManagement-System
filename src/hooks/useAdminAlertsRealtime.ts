/**
 * Real-time subscription for admin alerts.
 * Listens to Supabase admin_alerts table and triggers notifications + sounds
 * when new alerts arrive for the current company.
 * 
 * Includes fallback polling for environments where real-time may not work.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { playNotificationSound, preloadAllSounds } from '@/services/notificationSoundService';
import type { NotificationSoundFile } from '@/services/notificationSoundService';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';

const NOTIFICATION_PREFS_KEY_PREFIX = 'farmvault:notification-prefs:v1:';
const POLL_INTERVAL_MS = 10000; // Fallback polling every 10 seconds
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
    console.log('[AdminAlertsRealtime] getNotificationPrefs: no window or userId', { userId });
    return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
  }
  try {
    const storageKey = `${NOTIFICATION_PREFS_KEY_PREFIX}${userId}`;
    const raw = window.localStorage.getItem(storageKey);
    console.log('[AdminAlertsRealtime] getNotificationPrefs raw from storage', { storageKey, raw });
    
    if (!raw) {
      console.log('[AdminAlertsRealtime] No prefs found, returning defaults (disabled)');
      return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
    }
    
    const parsed = JSON.parse(raw);
    const result = {
      enabled: Boolean(parsed.notificationsEnabled),
      soundEnabled: parsed.soundEnabled !== false,
      soundFile: (parsed.soundFile || 'notification1.aac') as NotificationSoundFile,
    };
    
    console.log('[AdminAlertsRealtime] Parsed notification prefs', result);
    return result;
  } catch (err) {
    console.error('[AdminAlertsRealtime] Error parsing notification prefs', err);
    return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
  }
}

function formatAlertTitle(alert: AdminAlertRow): string {
  const actionMap: Record<string, string> = {
    CREATE: 'created',
    ITEM_CREATED: 'created',
    STOCK_IN: 'restocked',
    STOCK_DEDUCTED: 'deducted from',
    DEDUCT: 'deducted from',
    EDIT_ITEM: 'edited',
    ITEM_EDITED: 'edited',
    DELETE: 'archived',
    ITEM_DELETED: 'deleted',
    ITEM_ARCHIVED: 'archived',
    RESTORE: 'restored',
    ITEM_RESTORED: 'restored',
    USAGE: 'recorded usage for',
    USAGE_RECORDED: 'recorded usage for',
  };
  const actionVerb = actionMap[alert.action] || alert.action.toLowerCase().replace(/_/g, ' ');
  const actor = alert.actor_name || 'Someone';
  const target = alert.target_label || 'an item';
  return `${actor} ${actionVerb} ${target}`;
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

export function useAdminAlertsRealtime() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const processedIdsRef = useRef<Set<string>>(getProcessedIds());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPollTimeRef = useRef<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  
  const isAdminOrDeveloper = user?.role === 'company-admin' || user?.role === 'company_admin' || user?.role === 'developer';
  const companyId = user?.companyId;
  const userId = user?.id;

  // Preload sounds on mount
  useEffect(() => {
    preloadAllSounds();
  }, []);

  const processAlert = useCallback(
    (alert: AdminAlertRow, source: 'realtime' | 'poll') => {
      console.log(`[AdminAlertsRealtime] Processing alert from ${source}`, {
        id: alert.id,
        action: alert.action,
        actorUserId: alert.actor_user_id,
        currentUserId: userId,
      });

      // Skip if this is our own action
      if (alert.actor_user_id === userId) {
        console.log('[AdminAlertsRealtime] Skipping own action');
        return;
      }

      // Skip if already processed (deduplication)
      if (processedIdsRef.current.has(alert.id)) {
        console.log('[AdminAlertsRealtime] Already processed, skipping', alert.id);
        return;
      }

      // Mark as processed
      processedIdsRef.current.add(alert.id);
      saveProcessedIds(processedIdsRef.current);

      // Trim the set if it gets too large
      if (processedIdsRef.current.size > 500) {
        const idsArray = Array.from(processedIdsRef.current);
        processedIdsRef.current = new Set(idsArray.slice(-250));
        saveProcessedIds(processedIdsRef.current);
      }

      console.log('[AdminAlertsRealtime] New alert received', {
        id: alert.id,
        module: alert.module,
        action: alert.action,
        actorName: alert.actor_name,
        targetLabel: alert.target_label,
        severity: alert.severity,
        source,
      });

      // Create notification (skipSound=true because we handle sound playback here)
      const title = formatAlertTitle(alert);
      const message = formatAlertMessage(alert);
      const type = alert.severity === 'critical' ? 'error' : alert.severity === 'high' ? 'warning' : 'info';

      addNotification({ title, message, type, skipSound: true });

      // Play sound based on user preferences
      const prefs = getNotificationPrefs(userId);
      console.log('[AdminAlertsRealtime] Sound prefs for playback', {
        enabled: prefs.enabled,
        soundEnabled: prefs.soundEnabled,
        soundFile: prefs.soundFile,
        userId,
      });

      if (prefs.enabled && prefs.soundEnabled) {
        console.log('[AdminAlertsRealtime] Attempting to play sound:', prefs.soundFile);
        
        playNotificationSound(prefs.soundFile, { force: true })
          .then((played) => {
            console.log('[AdminAlertsRealtime] Sound playback result:', {
              played,
              soundFile: prefs.soundFile,
            });
          })
          .catch((err) => {
            console.warn('[AdminAlertsRealtime] Sound playback failed', err);
          });
      } else {
        console.log('[AdminAlertsRealtime] Sound not enabled, skipping playback', {
          notificationsEnabled: prefs.enabled,
          soundEnabled: prefs.soundEnabled,
        });
      }
    },
    [addNotification, userId]
  );

  const handleRealtimeAlert = useCallback(
    (payload: RealtimePostgresInsertPayload<AdminAlertRow>) => {
      console.log('[AdminAlertsRealtime] Realtime payload received', payload);
      const alert = payload.new;

      if (!alert || !alert.id) {
        console.log('[AdminAlertsRealtime] Invalid payload, missing alert or id');
        return;
      }

      processAlert(alert, 'realtime');
    },
    [processAlert]
  );

  // Fallback polling for new alerts
  const pollForAlerts = useCallback(async () => {
    if (!companyId) return;

    try {
      const since = lastPollTimeRef.current || new Date(Date.now() - 60000).toISOString(); // Last minute on first poll
      
      console.log('[AdminAlertsRealtime] Polling for alerts since', since);

      const { data, error } = await supabase
        .from('admin_alerts')
        .select('*')
        .eq('company_id', companyId)
        .gt('created_at', since)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[AdminAlertsRealtime] Poll error', error);
        return;
      }

      if (data && data.length > 0) {
        console.log('[AdminAlertsRealtime] Poll found alerts', data.length);
        data.forEach((alert) => processAlert(alert as AdminAlertRow, 'poll'));
        // Update last poll time to the most recent alert
        lastPollTimeRef.current = data[data.length - 1].created_at;
      } else {
        // Update last poll time even if no alerts
        lastPollTimeRef.current = new Date().toISOString();
      }
    } catch (err) {
      console.error('[AdminAlertsRealtime] Poll exception', err);
    }
  }, [companyId, processAlert]);

  // Set up real-time subscription
  useEffect(() => {
    if (!isAdminOrDeveloper || !companyId) {
      console.log('[AdminAlertsRealtime] Not subscribing - conditions not met', {
        isAdminOrDeveloper,
        companyId,
        userRole: user?.role,
      });
      return;
    }

    console.log('[AdminAlertsRealtime] Setting up real-time subscription', {
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
        console.log('[AdminAlertsRealtime] Subscription status changed', { status, error: err });
        
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
          console.log('[AdminAlertsRealtime] Successfully subscribed to real-time');
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
      console.log('[AdminAlertsRealtime] Cleaning up subscription');
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isAdminOrDeveloper, companyId, userId, user?.role, handleRealtimeAlert, pollForAlerts]);

  return { realtimeConnected };
}
