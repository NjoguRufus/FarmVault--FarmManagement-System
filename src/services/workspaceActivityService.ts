import { db } from '@/lib/db';

/**
 * Append-only company activity for the tenant dashboard (public.activity_logs).
 * Uses only columns present on the legacy table: company_id, action, metadata (optional project_id in JSON).
 */
export async function logWorkspaceActivity(params: {
  companyId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await db.public().from('activity_logs').insert({
    company_id: params.companyId,
    action: params.action,
    metadata: params.metadata ?? null,
  });
  if (error && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[workspaceActivity]', error.message);
  }
}
