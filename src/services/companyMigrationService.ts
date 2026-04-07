import { supabase } from '@/lib/supabase';
import { listCompanies, type DeveloperCompanyRow } from '@/services/developerAdminService';
import { logger } from "@/lib/logger";

// ============== TYPES ==============

export interface CompanyForMigration {
  company_id: string;
  company_name: string;
  created_at: string;
  admin_user_id: string | null;
  admin_email: string;
  admin_full_name: string;
  has_migrated_data: boolean;
  migration_count: number;
  is_new: boolean;
  record_counts: {
    employees: number;
    projects: number;
    expenses: number;
    harvests: number;
    harvest_collections: number;
    inventory_items: number;
    suppliers: number;
  };
}

export interface MigrationPreviewConflict {
  table: string;
  type: string;
  count: number;
  resolution: string;
}

export interface MigrationPreviewWarning {
  type: string;
  message: string;
}

export interface MigrationPreviewResult {
  source: {
    company_id: string;
    company_name: string;
    created_at: string;
    admin_email: string;
    admin_full_name: string;
  };
  target: {
    company_id: string;
    company_name: string;
    created_at: string;
    admin_user_id: string | null;
    admin_email: string;
    admin_full_name: string;
    has_migrated_data: boolean;
  };
  table_counts: Record<string, number>;
  conflicts: MigrationPreviewConflict[];
  warnings: MigrationPreviewWarning[];
  total_records: number;
}

export interface MigrationSummary {
  source_company: {
    id: string;
    name: string;
    archived: boolean;
  };
  target_company: {
    id: string;
    name: string;
    admin_user_id: string | null;
    admin_email: string;
  };
  moved_counts: Record<string, number>;
  skipped_counts: Record<string, number>;
  total_moved: number;
  total_skipped: number;
}

export interface MigrationExecutionResult {
  success: boolean;
  migration_id: string;
  summary?: MigrationSummary;
  error?: string;
}

export interface MigrationHistoryItem {
  id: string;
  source_company_id: string;
  source_company_name: string;
  target_company_id: string;
  target_company_name: string;
  target_admin_email: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  source_archived: boolean;
  migration_summary: MigrationSummary | null;
  created_by: string;
  created_at: string;
}

export interface MigrationItemDetail {
  id: string;
  table_name: string;
  source_record_id: string | null;
  target_record_id: string | null;
  action: 'migrated' | 'skipped' | 'conflict' | 'error';
  conflict_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MigrationDetails {
  migration: MigrationHistoryItem;
  items: MigrationItemDetail[];
  item_summary: Record<string, { migrated: number; skipped: number; error: number }>;
}

// ============== API FUNCTIONS ==============

/**
 * Fetch all companies with admin info for migration UI.
 * Shows "new" badge for recently created companies without migrated data.
 * 
 * Falls back to list_companies RPC if list_companies_for_migration is not available.
 */
export async function listCompaniesForMigration(): Promise<CompanyForMigration[]> {
  // eslint-disable-next-line no-console
  logger.log('[CompanyMigration] Calling list_companies_for_migration RPC...');
  
  const { data, error, status, statusText } = await supabase.rpc('list_companies_for_migration');

  // eslint-disable-next-line no-console
  logger.log('[CompanyMigration] list_companies_for_migration response:', {
    status,
    statusText,
    hasData: !!data,
    dataLength: Array.isArray(data) ? data.length : 'not array',
    rawData: data,
    error,
  });

  // If the specialized RPC works, use it
  if (!error && data) {
    const companies = Array.isArray(data) ? data : [];
    // eslint-disable-next-line no-console
    logger.log('[CompanyMigration] Using list_companies_for_migration data:', companies.length, 'companies');
    return companies as CompanyForMigration[];
  }

  // Fallback: use the same list_companies RPC that the Companies page uses
  // eslint-disable-next-line no-console
  logger.log('[CompanyMigration] Falling back to list_companies RPC...');
  
  try {
    const fallbackResult = await listCompanies();
    const rows = fallbackResult.rows ?? [];
    
    // eslint-disable-next-line no-console
    logger.log('[CompanyMigration] Fallback list_companies returned:', rows.length, 'companies');
    
    // Transform DeveloperCompanyRow to CompanyForMigration
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const transformed: CompanyForMigration[] = rows.map((row: DeveloperCompanyRow) => {
      const companyId = row.company_id ?? row.id ?? '';
      const createdAt = row.created_at ?? new Date().toISOString();
      const isNew = new Date(createdAt) > sevenDaysAgo;
      
      return {
        company_id: companyId,
        company_name: row.company_name ?? 'Unnamed Company',
        created_at: createdAt,
        admin_user_id: null,
        admin_email: '',
        admin_full_name: '',
        has_migrated_data: false,
        migration_count: 0,
        is_new: isNew,
        record_counts: {
          employees: row.employees_count ?? 0,
          projects: 0,
          expenses: 0,
          harvests: 0,
          harvest_collections: 0,
          inventory_items: 0,
          suppliers: 0,
        },
      };
    });
    
    // eslint-disable-next-line no-console
    logger.log('[CompanyMigration] Transformed companies:', transformed.map(c => ({
      company_id: c.company_id,
      company_name: c.company_name,
    })));
    
    return transformed;
  } catch (fallbackError) {
    // eslint-disable-next-line no-console
    console.error('[CompanyMigration] Fallback also failed:', fallbackError);
    
    // If both fail, throw the original error
    if (error) {
      throw new Error(error.message ?? 'Failed to load companies for migration');
    }
    throw fallbackError;
  }
}

/**
 * Preview a migration between two companies.
 * Shows record counts, conflicts, and warnings before execution.
 */
export async function previewCompanyMigration(
  sourceCompanyId: string,
  targetCompanyId: string
): Promise<MigrationPreviewResult> {
  const { data, error } = await supabase.rpc('preview_company_migration', {
    _source_company_id: sourceCompanyId,
    _target_company_id: targetCompanyId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to preview migration');
  }

  return data as MigrationPreviewResult;
}

/**
 * Execute the company migration.
 * Moves all tenant data from source to target company.
 * Optionally archives the source company after migration.
 */
export async function executeCompanyMigration(
  sourceCompanyId: string,
  targetCompanyId: string,
  archiveSource: boolean = false
): Promise<MigrationExecutionResult> {
  const { data, error } = await supabase.rpc('execute_company_migration', {
    _source_company_id: sourceCompanyId,
    _target_company_id: targetCompanyId,
    _archive_source: archiveSource,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to execute migration');
  }

  return data as MigrationExecutionResult;
}

/**
 * Get migration history for the developer dashboard.
 */
export async function getMigrationHistory(limit: number = 50): Promise<MigrationHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_migration_history', {
    _limit: limit,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load migration history');
  }

  return (data as MigrationHistoryItem[]) ?? [];
}

/**
 * Get detailed information about a specific migration.
 * Includes all migrated items and their status.
 */
export async function getMigrationDetails(migrationId: string): Promise<MigrationDetails> {
  const { data, error } = await supabase.rpc('get_migration_details', {
    _migration_id: migrationId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load migration details');
  }

  return data as MigrationDetails;
}

// ============== HELPER FUNCTIONS ==============

/**
 * Format a date for display
 */
export function formatMigrationDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get status badge color class
 */
export function getMigrationStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'failed':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'rolled_back':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'pending':
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
}

/**
 * Calculate total records from table counts
 */
export function calculateTotalRecords(tableCounts: Record<string, number>): number {
  return Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
}

/**
 * Get human-readable table name
 */
export function getTableDisplayName(tableName: string): string {
  const displayNames: Record<string, string> = {
    employees: 'Employees',
    projects: 'Projects (projects.projects)',
    project_stages: 'Project Stages',
    expenses: 'Expenses (finance.expenses)',
    harvests: 'Harvests (harvest.harvests)',
    harvest_collections: 'Harvest Collections (harvest schema)',
    harvest_pickers: 'Harvest Pickers (harvest schema)',
    picker_intake_entries: 'Picker Intake Entries (harvest schema)',
    picker_payment_entries: 'Picker Payments (harvest schema)',
    picker_weigh_entries: 'Picker Weigh Entries',
    harvest_payment_batches: 'Payment Batches',
    suppliers: 'Suppliers',
    inventory_items: 'Inventory Items',
    inventory_categories: 'Inventory Categories',
    inventory_purchases: 'Inventory Purchases',
    inventory_usage: 'Inventory Usage',
    inventory_audit_logs: 'Inventory Audit Logs',
    work_logs: 'Work Logs',
    operations_work_cards: 'Work Cards',
    season_challenges: 'Season Challenges',
    needed_items: 'Needed Items',
    sales: 'Sales',
    budget_pools: 'Budget Pools',
    crop_catalog: 'Crop Catalog',
    challenge_templates: 'Challenge Templates',
    company_records: 'Company Records',
    deliveries: 'Deliveries',
    custom_roles: 'Custom Roles',
    harvest_wallets: 'Harvest Wallets',
    harvest_cash_pools: 'Cash Pools',
    project_wallet_ledger: 'Wallet Ledger',
    project_wallet_meta: 'Wallet Meta',
    collection_cash_usage: 'Cash Usage',
    code_red: 'Code Red',
    feedback: 'Feedback',
    activity_logs: 'Activity Logs',
    audit_logs: 'Audit Logs',
    company_members: 'Team Members',
    profiles_to_update: 'Profiles to Update',
    profiles_updated: 'Profiles Updated',
    stage_notes: 'Stage Notes',
    project_blocks: 'Project Blocks',
  };

  return displayNames[tableName] ?? tableName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Group table counts by category for preview
 */
export function groupTableCountsByCategory(tableCounts: Record<string, number>): {
  category: string;
  tables: { name: string; displayName: string; count: number }[];
  totalCount: number;
}[] {
  const categories: Record<string, string[]> = {
    'Core Business': ['projects', 'project_stages', 'stage_notes', 'project_blocks'],
    'Employees & Team': ['employees', 'company_members', 'profiles_to_update'],
    'Expenses & Finance': ['expenses', 'budget_pools', 'project_wallet_ledger', 'project_wallet_meta'],
    'Harvest & Sales': [
      'harvests',
      'harvest_collections',
      'harvest_pickers',
      'picker_intake_entries',
      'picker_payment_entries',
      'picker_weigh_entries',
      'harvest_payment_batches',
      'harvest_wallets',
      'harvest_cash_pools',
      'collection_cash_usage',
      'sales',
    ],
    'Inventory': [
      'inventory_items',
      'inventory_categories',
      'inventory_purchases',
      'inventory_usage',
      'inventory_audit_logs',
      'suppliers',
    ],
    'Operations': ['work_logs', 'operations_work_cards', 'deliveries'],
    'Planning & Challenges': ['season_challenges', 'needed_items', 'challenge_templates', 'crop_catalog'],
    'Other': ['custom_roles', 'company_records', 'code_red', 'feedback', 'activity_logs', 'audit_logs'],
  };

  const result: {
    category: string;
    tables: { name: string; displayName: string; count: number }[];
    totalCount: number;
  }[] = [];

  for (const [category, tableNames] of Object.entries(categories)) {
    const tables: { name: string; displayName: string; count: number }[] = [];
    let totalCount = 0;

    for (const tableName of tableNames) {
      const count = tableCounts[tableName] ?? 0;
      if (count > 0) {
        tables.push({
          name: tableName,
          displayName: getTableDisplayName(tableName),
          count,
        });
        totalCount += count;
      }
    }

    if (tables.length > 0) {
      result.push({ category, tables, totalCount });
    }
  }

  return result;
}
