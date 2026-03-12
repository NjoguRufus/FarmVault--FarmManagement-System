/**
 * Admin alert service: create immediate alerts for high-risk actions.
 * In-app alerts are stored in context; persistence and push can be added via backend.
 */

import { db } from '@/lib/db';
import type { AdminAlertPayload, AlertSeverity } from '@/types/alerts';

const STORAGE_KEY = 'farmvault:admin_alerts:v1';
const MAX_STORED = 200;

export type StoredAdminAlert = AdminAlertPayload & {
  id: string;
  createdAt: string;
  read?: boolean;
};

/** Emit an in-app alert (and optionally persist). Used by inventory high-risk actions and future modules. */
export async function createAdminAlert(payload: AdminAlertPayload): Promise<StoredAdminAlert | null> {
  const record: StoredAdminAlert = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    read: false,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AdminAlert] created', {
      severity: payload.severity,
      module: payload.module,
      action: payload.action,
      actorName: payload.actorName,
      targetLabel: payload.targetLabel,
    });
  }

  try {
    const insertPayload = {
      id: record.id,
      company_id: payload.companyId,
      severity: payload.severity,
      module: payload.module,
      action: payload.action,
      actor_user_id: payload.actorUserId ?? null,
      actor_name: payload.actorName ?? null,
      target_id: payload.targetId ?? null,
      target_label: payload.targetLabel ?? null,
      metadata: payload.metadata ?? null,
      detail_path: payload.detailPath ?? null,
      read: false,
    };

    console.log('[AdminAlert] Inserting to admin_alerts table', insertPayload);

    const { error } = await db.public().from('admin_alerts').insert(insertPayload);

    if (error) {
      console.error('[AdminAlert] Insert failed', {
        error: error.message,
        code: (error as any).code,
        details: (error as any).details,
      });
      appendToLocalFallback(record);
    } else {
      console.log('[AdminAlert] Successfully inserted to admin_alerts', record.id);
    }
  } catch (e) {
    console.error('[AdminAlert] Exception during insert', e);
    appendToLocalFallback(record);
  }

  return record;
}

function appendToLocalFallback(record: StoredAdminAlert): void {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const list: StoredAdminAlert[] = raw ? JSON.parse(raw) : [];
    list.unshift(record);
    const trimmed = list.slice(0, MAX_STORED);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // ignore
  }
}

/** List recent alerts for a company (from DB or local fallback). */
export async function listAdminAlerts(companyId: string, limit = 50): Promise<StoredAdminAlert[]> {
  try {
    const { data } = await db
      .public()
      .from('admin_alerts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (data?.length) {
      return (data as any[]).map((row) => ({
        id: row.id,
        companyId: row.company_id,
        severity: row.severity ?? 'normal',
        module: row.module ?? '',
        action: row.action ?? '',
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        targetId: row.target_id,
        targetLabel: row.target_label,
        metadata: row.metadata,
        detailPath: row.detail_path,
        createdAt: row.created_at,
        read: row.read ?? false,
      }));
    }
  } catch {
    // table may not exist
  }

  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return [];
  const list: StoredAdminAlert[] = JSON.parse(raw);
  return list.filter((a) => a.companyId === companyId).slice(0, limit);
}

/** Mark alert as read. */
export async function markAlertRead(alertId: string): Promise<void> {
  try {
    await db.public().from('admin_alerts').update({ read: true }).eq('id', alertId);
  } catch {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    const list: StoredAdminAlert[] = JSON.parse(raw);
    const idx = list.findIndex((a) => a.id === alertId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], read: true };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  }
}

export function isHighRiskInventoryAction(action: string): boolean {
  return action === 'EDIT_ITEM' || action === 'DELETE' || action === 'DEDUCT';
}

export function severityForInventoryAction(action: string): AlertSeverity {
  return isHighRiskInventoryAction(action) ? 'high' : 'normal';
}
