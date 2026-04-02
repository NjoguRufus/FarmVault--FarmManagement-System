/**
 * Reports tile exports — schema-qualified reads, project-scoped harvests (no h.company_id).
 */
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

function logSelectError(context: Record<string, unknown>, error: unknown) {
  // eslint-disable-next-line no-console
  console.error('Supabase error:', {
    ...context,
    message: (error as any)?.message,
    code: (error as any)?.code,
    details: (error as any)?.details,
    hint: (error as any)?.hint,
    error,
  });
}

/**
 * harvest.harvests → project_id → projects.projects.company_id (never filter h.company_id).
 */
export async function fetchHarvestsForReportExport(companyId: string): Promise<any[]> {
  try {
    const r2 = await db
      .harvest()
      .from('harvests')
      .select(
        'id, harvest_date, quantity, price_per_unit, buyer_name, buyer_paid, unit, notes, project_id, created_at, projects!inner(company_id, crop_type, name)',
      )
      .eq('projects.company_id', companyId);

    if (!r2.error && r2.data) {
      return (r2.data as any[]).map((row) => {
        const p = row.projects as { company_id?: string; crop_type?: string; name?: string } | null | undefined;
        const { projects: _p, ...rest } = row;
        return {
          ...rest,
          crop_type: rest.crop_type ?? p?.crop_type,
          crop: rest.crop ?? p?.crop_type,
        };
      });
    }

    if (r2.error) {
      logSelectError(
        { op: 'select', schema: 'harvest', table: 'harvests', via: 'projects!inner', company_id: companyId },
        r2.error,
      );
    }

    const proj = await db.projects().from('projects').select('id, crop_type').eq('company_id', companyId);
    if (proj.error) {
      logSelectError({ op: 'select', schema: 'projects', table: 'projects', company_id: companyId }, proj.error);
      return [];
    }
    const ids = (proj.data ?? []).map((p: { id: string }) => p.id).filter(Boolean);
    if (!ids.length) return [];

    const cropByProject = new Map<string, string>();
    (proj.data ?? []).forEach((p: { id: string; crop_type?: string }) => {
      if (p.id) cropByProject.set(p.id, String(p.crop_type ?? ''));
    });

    const r3 = await db.harvest().from('harvests').select('*').in('project_id', ids);
    if (r3.error) {
      logSelectError(
        { op: 'select', schema: 'harvest', table: 'harvests', via: 'project_id in (...)', company_id: companyId },
        r3.error,
      );
      return [];
    }

    return ((r3.data ?? []) as any[]).map((row) => ({
      ...row,
      crop_type: row.crop_type ?? cropByProject.get(String(row.project_id ?? '')) ?? '',
      crop: row.crop ?? cropByProject.get(String(row.project_id ?? '')) ?? '',
    }));
  } catch (e) {
    logSelectError({ op: 'fetchHarvestsForReportExport', company_id: companyId }, e);
    return [];
  }
}

/** Sales export source: public.harvest_collection_totals */
export async function fetchSalesRowsFromHarvestCollectionTotals(companyId: string): Promise<any[]> {
  try {
    let res = await supabase
      .from('harvest_collection_totals')
      .select('*, harvest_collections(collection_date, notes)')
      .eq('company_id', companyId);

    if (res.error) {
      logSelectError(
        { op: 'select', schema: 'public', table: 'harvest_collection_totals', embed: 'harvest_collections', company_id: companyId },
        res.error,
      );
      res = await supabase.from('harvest_collection_totals').select('*').eq('company_id', companyId);
    }

    if (res.error) {
      logSelectError(
        { op: 'select', schema: 'public', table: 'harvest_collection_totals', company_id: companyId },
        res.error,
      );
      return [];
    }

    return ((res.data ?? []) as any[]).map((row) => {
      const hc = row.harvest_collections as { collection_date?: string; notes?: string } | null | undefined;
      const revenue = Number(row.total_revenue ?? row.total_gross_amount ?? 0);
      const dateRaw =
        row.created_at ?? row.updated_at ?? hc?.collection_date ?? row.updated_at ?? '';
      return {
        ...row,
        _export_date: String(dateRaw).slice(0, 10),
        _export_crop: String(row.crop ?? ''),
        _export_revenue: Number.isFinite(revenue) ? revenue : 0,
        harvest_collections: undefined,
      };
    });
  } catch (e) {
    logSelectError({ op: 'fetchSalesRowsFromHarvestCollectionTotals', company_id: companyId }, e);
    return [];
  }
}

export async function fetchOperationsWorkCardsForReportExport(companyId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('list_operations_work_cards_for_export', {
      p_company_id: companyId,
    });
    if (!error) return (data ?? []) as any[];
    logSelectError({ op: 'rpc', fn: 'list_operations_work_cards_for_export', company_id: companyId }, error);
  } catch (e) {
    logSelectError({ op: 'rpc', fn: 'list_operations_work_cards_for_export', company_id: companyId }, e);
  }

  try {
    const res = await supabase.from('operations_work_cards').select('*').eq('company_id', companyId);
    if (res.error) {
      logSelectError(
        { op: 'select', schema: 'public', table: 'operations_work_cards', company_id: companyId },
        res.error,
      );
      return [];
    }
    return (res.data ?? []) as any[];
  } catch (e) {
    logSelectError({ op: 'select', schema: 'public', table: 'operations_work_cards', company_id: companyId }, e);
    return [];
  }
}

export type ReportExportEntity = 'harvest' | 'operations_work_cards' | 'finance.expenses' | 'sales';

export async function queryReportExportEntity(
  companyId: string,
  label: string,
  entity: ReportExportEntity,
): Promise<{ table: string; data: any[] }> {
  try {
    switch (entity) {
      case 'harvest': {
        const data = await fetchHarvestsForReportExport(companyId);
        return { table: 'harvest.harvests+projects.projects', data };
      }
      case 'sales': {
        const data = await fetchSalesRowsFromHarvestCollectionTotals(companyId);
        return { table: 'harvest_collection_totals', data };
      }
      case 'finance.expenses': {
        let res = await db
          .finance()
          .from('expenses')
          .select('*, projects(name, crop_type)')
          .eq('company_id', companyId);
        if (res.error) {
          logSelectError(
            { op: 'select', label, schema: 'finance', table: 'expenses', embed: 'projects', company_id: companyId },
            res.error,
          );
          res = await db.finance().from('expenses').select('*').eq('company_id', companyId);
        }
        if (res.error) {
          logSelectError(
            { op: 'select', label, schema: 'finance', table: 'expenses', company_id: companyId },
            res.error,
          );
          return { table: 'finance.expenses', data: [] };
        }
        return { table: 'finance.expenses', data: (res.data ?? []) as any[] };
      }
      case 'operations_work_cards': {
        const data = await fetchOperationsWorkCardsForReportExport(companyId);
        return { table: 'operations_work_cards', data };
      }
      default:
        return { table: 'unknown', data: [] };
    }
  } catch (e) {
    logSelectError({ op: 'queryReportExportEntity', label, entity, company_id: companyId }, e);
    return { table: entity, data: [] };
  }
}
