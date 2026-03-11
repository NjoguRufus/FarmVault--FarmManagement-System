/**
 * Admin Alert Center: recent high-risk and critical alerts for the company.
 * Shown to company admins; selected recipients can be configured in settings.
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listAdminAlerts, markAlertRead, type StoredAdminAlert } from '@/services/adminAlertService';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const SEVERITY_STYLES: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  high: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  critical: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export function AdminAlertCenter() {
  const { user, effectiveAccess } = useAuth();
  const companyId = user?.companyId ?? null;
  const [alerts, setAlerts] = useState<StoredAdminAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const canSeeAlerts = effectiveAccess.canSeeDashboard || effectiveAccess.rolePreset === 'administrator' || user?.role === 'company-admin' || (user as { role?: string })?.role === 'company_admin';

  useEffect(() => {
    if (!companyId || !canSeeAlerts) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listAdminAlerts(companyId, 20)
      .then((list) => {
        if (!cancelled) setAlerts(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyId, canSeeAlerts]);

  const handleMarkRead = async (id: string) => {
    await markAlertRead(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  };

  if (!canSeeAlerts || alerts.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold text-sm">Recent alerts</h3>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {alerts.slice(0, 10).map((alert) => (
            <li
              key={alert.id}
              className={cn(
                'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm',
                !alert.read && 'bg-muted/50'
              )}
            >
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                  SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.normal
                )}
              >
                {alert.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {alert.module}: {alert.action}
                  {alert.targetLabel && (
                    <span className="text-muted-foreground font-normal"> — {alert.targetLabel}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {alert.actorName ?? 'System'}
                  {' · '}
                  {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                </p>
              </div>
              {alert.detailPath && (
                <Link
                  to={alert.detailPath}
                  className="shrink-0 text-primary hover:underline flex items-center gap-0.5 text-xs"
                  onClick={() => handleMarkRead(alert.id)}
                >
                  View <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
