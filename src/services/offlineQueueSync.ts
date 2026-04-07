/**
 * Processes one offline queue item: sends intake or payment to Supabase.
 * Used by syncQueue() in lib/offlineQueue.ts.
 * Duplicate protection: payload includes client_entry_id; Supabase insert uses it.
 */
import { db } from '@/lib/db';
import type { OfflineQueueItem } from '@/lib/offlineQueue';
import { enqueueUnifiedNotification } from '@/services/unifiedNotificationPipeline';

export async function processOfflineQueue(item: OfflineQueueItem): Promise<void> {
  const { type, payload } = item;
  const clientEntryId = payload.client_entry_id as string | undefined;

  if (type === 'intake') {
    const collection_id = payload.collection_id as string;
    const picker_id = payload.picker_id as string;
    const kg = Number(payload.kg);
    const company_id = payload.company_id as string;
    if (!collection_id || !picker_id || !Number.isFinite(kg) || !company_id) {
      throw new Error('Invalid intake payload');
    }
    const insertPayload: Record<string, unknown> = {
      company_id,
      collection_id,
      picker_id,
      quantity: kg,
      unit: (payload.unit as string) || 'kg',
    };
    if (clientEntryId) insertPayload.client_entry_id = clientEntryId;
    if (payload.recorded_by != null) insertPayload.recorded_by = payload.recorded_by;

    const { error } = await db.harvest()
      .from('picker_intake_entries')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) throw error;
    if (typeof window !== 'undefined') {
      enqueueUnifiedNotification({
        tier: 'activity',
        kind: 'activity_harvest_recorded',
        title: 'Harvest recorded',
        body: `${kg} ${(payload.unit as string) || 'kg'} logged for intake.`,
        path: '/harvest-collections',
        toastType: 'success',
      });
    }
    return;
  }

  if (type === 'payment') {
    const collection_id = payload.collection_id as string;
    const picker_id = payload.picker_id as string;
    const amount = Number(payload.amount);
    const company_id = payload.company_id as string;
    if (!collection_id || !picker_id || !Number.isFinite(amount) || !company_id) {
      throw new Error('Invalid payment payload');
    }
    const insertPayload: Record<string, unknown> = {
      company_id,
      collection_id,
      picker_id,
      amount_paid: amount,
      note: (payload.note as string) ?? null,
    };
    if (clientEntryId) insertPayload.client_entry_id = clientEntryId;
    if (payload.paid_by != null) insertPayload.paid_by = payload.paid_by;

    const { data, error } = await db.harvest()
      .from('picker_payment_entries')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) throw error;
    const paymentEntryId = data?.id;

    const projectId = payload.project_id as string | undefined;
    if (projectId && paymentEntryId) {
      try {
        const { syncPickerPaymentToExpenseForOffline } = await import('@/services/harvestCollectionsService');
        await syncPickerPaymentToExpenseForOffline({
          companyId: company_id,
          projectId,
          collectionId: collection_id,
          pickerId: picker_id,
          amountPaid: amount,
          paymentEntryId,
        });
      } catch (_) {
        // Non-fatal: payment is recorded; expense sync can be retried later
      }
    }
    return;
  }

  if (type === 'wallet_entry') {
    const company_id = payload.company_id as string;
    const project_id = payload.project_id as string;
    const entry_type = payload.entry_type as 'credit' | 'debit';
    const amount = Number(payload.amount);
    const note = (payload.note as string) ?? '';
    const ref_type = (payload.ref_type as string) ?? 'harvest_cash';
    const ref_id = (payload.ref_id as string) ?? null;
    if (!company_id || !project_id || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Invalid wallet_entry payload');
    }
    const { ensureProjectWalletForSync, insertWalletLedgerEntry } = await import('@/services/harvestCollectionsService');
    await ensureProjectWalletForSync(company_id, project_id);
    await insertWalletLedgerEntry({
      company_id,
      project_id,
      entry_type,
      amount,
      note,
      ref_type,
      ref_id,
    });
    return;
  }

  throw new Error(`Unknown queue type: ${type}`);
}
