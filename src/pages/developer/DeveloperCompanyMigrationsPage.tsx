import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Sparkles,
  User,
  XCircle,
  Archive,
  History,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  listCompaniesForMigration,
  previewCompanyMigration,
  executeCompanyMigration,
  getMigrationHistory,
  getMigrationDetails,
  formatMigrationDate,
  getMigrationStatusColor,
  groupTableCountsByCategory,
  getTableDisplayName,
  type CompanyForMigration,
  type MigrationPreviewResult,
  type MigrationHistoryItem,
  type MigrationDetails,
} from '@/services/companyMigrationService';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { logger } from "@/lib/logger";

type TabType = 'migrate' | 'history';

export default function DeveloperCompanyMigrationsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('migrate');
  const [sourceCompanyId, setSourceCompanyId] = useState<string>('');
  const [targetCompanyId, setTargetCompanyId] = useState<string>('');
  const [archiveSource, setArchiveSource] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedMigrationId, setSelectedMigrationId] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch companies
  const {
    data: companies,
    isLoading: companiesLoading,
    isFetching: companiesFetching,
    refetch: refetchCompanies,
    error: companiesError,
  } = useQuery({
    queryKey: ['developer', 'companies-for-migration'],
    queryFn: listCompaniesForMigration,
  });

  // Debug logging for companies fetch
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    logger.log('[CompanyMigrationsPage] Companies state:', {
      isLoading: companiesLoading,
      isFetching: companiesFetching,
      hasError: !!companiesError,
      errorMessage: companiesError instanceof Error ? companiesError.message : String(companiesError),
      companiesCount: companies?.length ?? 0,
      companies: companies?.map(c => ({ id: c.company_id, name: c.company_name })),
    });
  }, [companies, companiesLoading, companiesFetching, companiesError]);

  // Fetch migration history
  const {
    data: migrationHistory,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['developer', 'migration-history'],
    queryFn: () => getMigrationHistory(50),
    enabled: activeTab === 'history',
  });

  // Fetch migration preview
  const {
    data: preview,
    isLoading: previewLoading,
    refetch: refetchPreview,
    error: previewError,
  } = useQuery({
    queryKey: ['developer', 'migration-preview', sourceCompanyId, targetCompanyId],
    queryFn: () => previewCompanyMigration(sourceCompanyId, targetCompanyId),
    enabled: showPreview && !!sourceCompanyId && !!targetCompanyId,
  });

  // Fetch migration details
  const {
    data: migrationDetails,
    isLoading: detailsLoading,
  } = useQuery({
    queryKey: ['developer', 'migration-details', selectedMigrationId],
    queryFn: () => getMigrationDetails(selectedMigrationId!),
    enabled: !!selectedMigrationId,
  });

  // Execute migration mutation
  const executeMigration = useMutation({
    mutationFn: () => executeCompanyMigration(sourceCompanyId, targetCompanyId, archiveSource),
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: 'Migration Completed',
          description: `Successfully migrated ${result.summary?.total_moved ?? 0} records to ${result.summary?.target_company.name}.`,
        });
        setShowPreview(false);
        setSourceCompanyId('');
        setTargetCompanyId('');
        setArchiveSource(false);
        queryClient.invalidateQueries({ queryKey: ['developer', 'companies-for-migration'] });
        queryClient.invalidateQueries({ queryKey: ['developer', 'migration-history'] });
      } else {
        toast({
          title: 'Migration Failed',
          description: result.error ?? 'An unexpected error occurred.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Migration Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sourceCompany = useMemo(
    () => companies?.find((c) => c.company_id === sourceCompanyId),
    [companies, sourceCompanyId]
  );

  const targetCompany = useMemo(
    () => companies?.find((c) => c.company_id === targetCompanyId),
    [companies, targetCompanyId]
  );

  const canShowPreview = sourceCompanyId && targetCompanyId && sourceCompanyId !== targetCompanyId;

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleShowPreview = useCallback(() => {
    if (canShowPreview) {
      setShowPreview(true);
      setExpandedCategories(new Set());
    }
  }, [canShowPreview]);

  const handleExecuteMigration = useCallback(() => {
    if (
      window.confirm(
        `Are you sure you want to migrate all data from "${sourceCompany?.company_name}" to "${targetCompany?.company_name}"?\n\n` +
          `This action cannot be easily undone.\n\n` +
          (archiveSource ? 'The source company will be archived after migration.' : '')
      )
    ) {
      executeMigration.mutate();
    }
  }, [sourceCompany, targetCompany, archiveSource, executeMigration]);

  const groupedCounts = useMemo(() => {
    if (!preview) return [];
    return groupTableCountsByCategory(preview.table_counts);
  }, [preview]);

  return (
    <DeveloperPageShell
      title="Company Migrations"
      description="Move all tenant data from one company to another. Target company admin remains unchanged."
      isLoading={companiesLoading}
      isRefetching={companiesFetching}
      onRefresh={() => {
        refetchCompanies();
        if (activeTab === 'history') refetchHistory();
      }}
    >
      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-border/60 pb-4">
        <Button
          variant={activeTab === 'migrate' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('migrate')}
          className="gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          New Migration
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('history')}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          Migration History
        </Button>
      </div>

      {activeTab === 'migrate' && (
        <div className="space-y-6">
          {/* Companies fetch error */}
          {companiesError && (
            <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <XCircle className="h-5 w-5" />
                Failed to load companies
              </div>
              <p>{companiesError instanceof Error ? companiesError.message : 'Unknown error loading companies'}</p>
              <Button variant="outline" size="sm" onClick={() => refetchCompanies()} className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          )}

          {/* Empty state when no companies */}
          {!companiesLoading && !companiesError && (!companies || companies.length === 0) && (
            <div className="fv-card border-yellow-500/40 bg-yellow-500/5 text-yellow-700 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-5 w-5" />
                No companies found
              </div>
              <p>The company list is empty. This could mean:</p>
              <ul className="list-disc list-inside text-xs space-y-1 ml-2">
                <li>No companies exist in the database yet</li>
                <li>The RPC function may not be returning data correctly</li>
                <li>There may be a permission issue with the developer access</li>
              </ul>
              <Button variant="outline" size="sm" onClick={() => refetchCompanies()} className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          )}

          {/* Company selection */}
          <div className="fv-card space-y-6">
            <div className="grid md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
              {/* Source company */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Source Company (data will be moved FROM here)
                </label>
                <Select value={sourceCompanyId} onValueChange={(v) => { setSourceCompanyId(v); setShowPreview(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select source company..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((c) => (
                      <SelectItem
                        key={c.company_id}
                        value={c.company_id}
                        disabled={c.company_id === targetCompanyId}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{c.company_name}</span>
                          {c.is_new && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 border border-green-500/20">
                              <Sparkles className="h-3 w-3" />
                              NEW
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sourceCompany && (
                  <CompanyInfoCard company={sourceCompany} variant="source" />
                )}
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center py-4">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              {/* Target company */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Target Company (data will be moved TO here)
                </label>
                <Select value={targetCompanyId} onValueChange={(v) => { setTargetCompanyId(v); setShowPreview(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select target company..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((c) => (
                      <SelectItem
                        key={c.company_id}
                        value={c.company_id}
                        disabled={c.company_id === sourceCompanyId}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{c.company_name}</span>
                          {c.is_new && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 border border-green-500/20">
                              <Sparkles className="h-3 w-3" />
                              NEW
                            </span>
                          )}
                          {c.has_migrated_data && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                              Has Migrated Data
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetCompany && (
                  <CompanyInfoCard company={targetCompany} variant="target" />
                )}
              </div>
            </div>

            {/* Preview button */}
            <div className="flex justify-center pt-2">
              <Button
                onClick={handleShowPreview}
                disabled={!canShowPreview || previewLoading}
                className="gap-2"
              >
                {previewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {showPreview ? 'Refresh Preview' : 'Preview Migration'}
              </Button>
            </div>
          </div>

          {/* Same company warning */}
          {sourceCompanyId && targetCompanyId && sourceCompanyId === targetCompanyId && (
            <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Source and target company cannot be the same.
            </div>
          )}

          {/* Preview error */}
          {previewError && showPreview && (
            <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
              {(previewError as Error).message || 'Failed to load preview.'}
            </div>
          )}

          {/* Preview panel */}
          {showPreview && preview && (
            <div className="space-y-4">
              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="fv-card border-orange-500/40 bg-orange-500/5 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-orange-600">
                    <AlertTriangle className="h-5 w-5" />
                    Warnings
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Conflicts */}
              {preview.conflicts.length > 0 && (
                <div className="fv-card border-yellow-500/40 bg-yellow-500/5 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-yellow-600">
                    <AlertTriangle className="h-5 w-5" />
                    Conflicts Detected
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    {preview.conflicts.map((c, i) => (
                      <li key={i} className="border-l-2 border-yellow-500/50 pl-3">
                        <span className="font-medium">{getTableDisplayName(c.table)}</span>: {c.count} duplicate {c.type.replace(/_/g, ' ')}(s)
                        <div className="text-xs text-muted-foreground mt-0.5">{c.resolution}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Record counts by category */}
              <div className="fv-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Records to Migrate</h3>
                  <span className="text-sm text-muted-foreground">
                    Total: <span className="font-medium text-foreground">{preview.total_records.toLocaleString()}</span> records
                  </span>
                </div>

                <div className="space-y-2">
                  {groupedCounts.map((group) => (
                    <div key={group.category} className="border border-border/60 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                        onClick={() => toggleCategory(group.category)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedCategories.has(group.category) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-foreground">{group.category}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {group.totalCount.toLocaleString()} records
                        </span>
                      </button>
                      {expandedCategories.has(group.category) && (
                        <div className="px-4 py-2 border-t border-border/60 space-y-1">
                          {group.tables.map((t) => (
                            <div key={t.name} className="flex items-center justify-between py-1.5 text-sm">
                              <span className="text-muted-foreground">{t.displayName}</span>
                              <span className="font-medium">{t.count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Migration options */}
              <div className="fv-card space-y-4">
                <h3 className="font-semibold text-foreground">Migration Options</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={archiveSource}
                    onChange={(e) => setArchiveSource(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="text-sm font-medium">Archive source company after migration</div>
                    <div className="text-xs text-muted-foreground">
                      Marks the source company as inactive and appends "[ARCHIVED]" to its name
                    </div>
                  </div>
                </label>
              </div>

              {/* Target admin reminder */}
              <div className="fv-card border-green-500/40 bg-green-500/5 space-y-2">
                <div className="flex items-center gap-2 font-medium text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  Target Admin Preserved
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>{preview.target.admin_full_name || preview.target.admin_email}</strong> will remain the admin of the target company.
                  Source company admin roles will not override this.
                </p>
              </div>

              {/* Execute button */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={handleExecuteMigration}
                  disabled={executeMigration.isPending}
                  size="lg"
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  {executeMigration.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {executeMigration.isPending ? 'Migrating...' : 'Execute Migration'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {historyLoading ? (
            <div className="fv-card text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading migration history...
            </div>
          ) : !migrationHistory?.length ? (
            <div className="fv-card text-center py-8 text-muted-foreground">
              No migrations have been performed yet.
            </div>
          ) : (
            <div className="space-y-4">
              {/* History list */}
              <div className="fv-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left font-medium">Date</th>
                      <th className="py-2 text-left font-medium">Source</th>
                      <th className="py-2 text-left font-medium">Target</th>
                      <th className="py-2 text-left font-medium">Status</th>
                      <th className="py-2 text-left font-medium">Records</th>
                      <th className="py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {migrationHistory.map((m) => (
                      <tr key={m.id} className="border-b border-border/40 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="text-foreground">{formatMigrationDate(m.started_at || m.created_at)}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">{m.source_company_name}</div>
                          {m.source_archived && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Archive className="h-3 w-3" />
                              Archived
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">{m.target_company_name}</div>
                          <div className="text-xs text-muted-foreground">{m.target_admin_email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
                            getMigrationStatusColor(m.status)
                          )}>
                            {m.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                            {m.status === 'failed' && <XCircle className="h-3 w-3" />}
                            {m.status === 'in_progress' && <Loader2 className="h-3 w-3 animate-spin" />}
                            {m.status === 'pending' && <Clock className="h-3 w-3" />}
                            {m.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {m.migration_summary ? (
                            <div className="text-xs">
                              <span className="text-green-600">{m.migration_summary.total_moved ?? 0} moved</span>
                              {(m.migration_summary.total_skipped ?? 0) > 0 && (
                                <span className="text-muted-foreground"> / {m.migration_summary.total_skipped} skipped</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedMigrationId(m.id)}
                            className="gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Migration details modal/panel */}
              {selectedMigrationId && migrationDetails && (
                <div className="fv-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Migration Details</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedMigrationId(null)}
                    >
                      Close
                    </Button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Source Company</div>
                      <div className="font-medium">{migrationDetails.migration.source_company_name}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Target Company</div>
                      <div className="font-medium">{migrationDetails.migration.target_company_name}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Started</div>
                      <div className="font-medium">{formatMigrationDate(migrationDetails.migration.started_at)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Completed</div>
                      <div className="font-medium">{formatMigrationDate(migrationDetails.migration.completed_at)}</div>
                    </div>
                  </div>

                  {migrationDetails.migration.error_message && (
                    <div className="p-3 rounded border border-destructive/40 bg-destructive/5 text-destructive text-sm">
                      {migrationDetails.migration.error_message}
                    </div>
                  )}

                  {/* Item summary by table */}
                  {migrationDetails.item_summary && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-foreground">Records by Table</h4>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(migrationDetails.item_summary).map(([table, counts]) => (
                          <div key={table} className="p-3 rounded border border-border/60 bg-muted/20">
                            <div className="font-medium text-sm">{getTableDisplayName(table)}</div>
                            <div className="flex gap-3 mt-1 text-xs">
                              <span className="text-green-600">{counts.migrated} migrated</span>
                              {counts.skipped > 0 && <span className="text-yellow-600">{counts.skipped} skipped</span>}
                              {counts.error > 0 && <span className="text-red-600">{counts.error} errors</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedMigrationId && detailsLoading && (
                <div className="fv-card text-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading migration details...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </DeveloperPageShell>
  );
}

// ============== HELPER COMPONENTS ==============

interface CompanyInfoCardProps {
  company: CompanyForMigration;
  variant: 'source' | 'target';
}

function CompanyInfoCard({ company, variant }: CompanyInfoCardProps) {
  const borderColor = variant === 'source' ? 'border-orange-500/30' : 'border-green-500/30';
  const bgColor = variant === 'source' ? 'bg-orange-500/5' : 'bg-green-500/5';

  return (
    <div className={cn('p-3 rounded-lg border', borderColor, bgColor)}>
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground">{company.company_name}</span>
        {company.is_new && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600 border border-green-500/20">
            <Sparkles className="h-3 w-3" />
            NEW
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <User className="h-3 w-3" />
          <span>Admin: {company.admin_full_name || company.admin_email || 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span>Created: {formatMigrationDate(company.created_at)}</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {company.record_counts.projects} projects
          </span>
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {company.record_counts.employees} employees
          </span>
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {company.record_counts.expenses} expenses
          </span>
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {company.record_counts.harvests} harvests
          </span>
        </div>
      </div>
    </div>
  );
}
