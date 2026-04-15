import { db, requireCompanyId } from '@/lib/db';
import type { Farm, FarmLeaseDurationType, FarmOwnershipType } from '@/types';

type DbFarmRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  location: string;
  status?: 'active' | 'closed';
  ownership_type: FarmOwnershipType;
  lease_cost: number | string | null;
  lease_duration: number | string | null;
  lease_duration_type: FarmLeaseDurationType | null;
  lease_amount_paid?: number | string | null;
  lease_expires_at?: string | null;
  created_at: string;
};

export interface CreateFarmInput {
  companyId: string;
  name: string;
  location: string;
  ownershipType: FarmOwnershipType;
  leaseCost?: number | null;
  leaseDuration?: number | null;
  leaseDurationType?: FarmLeaseDurationType | null;
}

function mapFarmRow(row: DbFarmRow): Farm {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    name: row.name,
    location: row.location,
    status: row.status ?? 'active',
    ownershipType: row.ownership_type,
    leaseCost: row.lease_cost != null ? Number(row.lease_cost) : null,
    leaseDuration: row.lease_duration != null ? Number(row.lease_duration) : null,
    leaseDurationType: row.lease_duration_type,
    leaseAmountPaid: row.lease_amount_paid != null ? Number(row.lease_amount_paid) : null,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export async function listFarmsByCompany(companyId: string | null): Promise<Farm[]> {
  if (!companyId) return [];
  const cid = requireCompanyId(companyId);

  const { data, error } = await db
    .projects()
    .from('farms')
    .select(
      'id, company_id, user_id, name, location, status, ownership_type, lease_cost, lease_duration, lease_duration_type, lease_amount_paid, lease_expires_at, created_at',
    )
    .eq('company_id', cid)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapFarmRow(row as DbFarmRow));
}

export async function createFarm(input: CreateFarmInput): Promise<Farm> {
  const companyId = requireCompanyId(input.companyId);
  const payloadName = input.name.trim();
  const payloadLocation = input.location.trim();

  if (!payloadName) throw new Error('Farm name is required.');
  if (!payloadLocation) throw new Error('Farm location is required.');
  if (
    input.ownershipType === 'leased' &&
    (!(Number(input.leaseCost) > 0) ||
      !(Number(input.leaseDuration) > 0) ||
      !input.leaseDurationType)
  ) {
    throw new Error('Lease details are required for leased farms.');
  }

  const { data, error } = await db
    .projects()
    .from('farms')
    .insert({
      company_id: companyId,
      name: payloadName,
      location: payloadLocation,
      status: 'active',
      ownership_type: input.ownershipType,
      lease_cost: input.ownershipType === 'leased' ? Number(input.leaseCost) : null,
      lease_duration: input.ownershipType === 'leased' ? Number(input.leaseDuration) : null,
      lease_duration_type:
        input.ownershipType === 'leased' ? input.leaseDurationType ?? 'months' : null,
    })
    .select(
      'id, company_id, user_id, name, location, status, ownership_type, lease_cost, lease_duration, lease_duration_type, lease_amount_paid, lease_expires_at, created_at',
    )
    .single();

  if (error) throw error;
  return mapFarmRow(data as DbFarmRow);
}

export async function updateFarm(
  farmId: string,
  patch: Partial<{
    status: 'active' | 'closed';
    leaseAmountPaid: number | null;
    leaseExpiresAt: string | null;
  }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.leaseAmountPaid !== undefined) payload.lease_amount_paid = patch.leaseAmountPaid;
  if (patch.leaseExpiresAt !== undefined) payload.lease_expires_at = patch.leaseExpiresAt;
  if (Object.keys(payload).length === 0) return;

  const { error } = await db.projects().from('farms').update(payload).eq('id', farmId);
  if (error) throw error;
}
