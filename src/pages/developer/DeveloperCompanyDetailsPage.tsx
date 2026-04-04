import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchDeveloperCompanyFarmIntelligence } from '@/services/developerCompanyIntelligenceService';
import { CompanyDetailsHeader } from '@/components/developer/company-intelligence/CompanyDetailsHeader';
import { CompanyOverviewCards } from '@/components/developer/company-intelligence/CompanyOverviewCards';
import { CompanyOverviewTab } from '@/components/developer/company-intelligence/CompanyOverviewTab';
import { CompanyProjectsTab } from '@/components/developer/company-intelligence/CompanyProjectsTab';
import { CompanyHarvestTab } from '@/components/developer/company-intelligence/CompanyHarvestTab';
import { CompanyExpensesTab } from '@/components/developer/company-intelligence/CompanyExpensesTab';
import { CompanyInventoryTab } from '@/components/developer/company-intelligence/CompanyInventoryTab';
import { CompanyEmployeesTab } from '@/components/developer/company-intelligence/CompanyEmployeesTab';
import { CompanyActivityTimelineTab } from '@/components/developer/company-intelligence/CompanyActivityTimelineTab';
import { CompanySeasonChallengesTab } from '@/components/developer/company-intelligence/CompanySeasonChallengesTab';
import { CompanySubscriptionTab } from '@/components/developer/company-intelligence/CompanySubscriptionTab';
import { CompanyAuditLogsTab } from '@/components/developer/company-intelligence/CompanyAuditLogsTab';
import { CompanyPaymentHistoryTab } from '@/components/developer/company-intelligence/CompanyPaymentHistoryTab';
import { LoadingSkeletonBlock } from '@/components/developer/company-intelligence/LoadingSkeletonBlock';
import { EmptyStateBlock } from '@/components/developer/company-intelligence/EmptyStateBlock';
import type { ActivityFeedItemData } from '@/components/developer/company-intelligence/ActivityFeedItem';

export default function DeveloperCompanyDetailsPage() {
  const { companyId = '' } = useParams<{ companyId: string }>();
  const id = companyId.trim();
  const [tab, setTab] = useState('overview');

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'company-farm-intelligence', id],
    queryFn: () => fetchDeveloperCompanyFarmIntelligence(id),
    enabled: Boolean(id),
    staleTime: 45_000,
  });

  const activityLogs = useMemo(
    () => (data?.activity_logs ?? []) as ActivityFeedItemData[],
    [data?.activity_logs],
  );
  const employeeActivity = useMemo(
    () => (data?.employee_activity_logs ?? []) as ActivityFeedItemData[],
    [data?.employee_activity_logs],
  );
  const timeline = useMemo(() => (data?.timeline ?? []) as ActivityFeedItemData[], [data?.timeline]);

  const projects = useMemo(
    () => (Array.isArray(data?.projects) ? (data?.projects as Record<string, unknown>[]) : []),
    [data?.projects],
  );
  const harvests = useMemo(
    () => (Array.isArray(data?.harvests) ? (data?.harvests as Record<string, unknown>[]) : []),
    [data?.harvests],
  );
  const harvestCollections = useMemo(
    () => (Array.isArray(data?.harvest_collections) ? (data?.harvest_collections as Record<string, unknown>[]) : []),
    [data?.harvest_collections],
  );
  const inventoryItems = useMemo(
    () => (Array.isArray(data?.inventory) ? (data?.inventory as Record<string, unknown>[]) : []),
    [data?.inventory],
  );
  const inventoryAudit = useMemo(
    () => (Array.isArray(data?.inventory_audit_recent) ? (data?.inventory_audit_recent as Record<string, unknown>[]) : []),
    [data?.inventory_audit_recent],
  );

  if (!id) {
    return (
      <div className="fv-card border-destructive/40 bg-destructive/5 p-6 text-destructive text-sm">
        Missing company id in URL.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Developer</p>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Company details</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Read-only farm intelligence: how this tenant uses FarmVault across modules.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="fv-card flex flex-col gap-3 border-destructive/40 bg-destructive/5 p-4 text-destructive sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Failed to load intelligence</p>
              <p className="text-xs opacity-90">{(error as Error).message}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && <LoadingSkeletonBlock />}

      {!isLoading && data && !error && (
        <>
          <CompanyDetailsHeader header={data.header as Record<string, unknown> | undefined} />
          <CompanyOverviewCards metrics={data.metrics as Record<string, unknown> | undefined} />
        </>
      )}

      {!isLoading && (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="overflow-x-auto pb-2 -mx-1 px-1">
            <TabsList className="inline-flex h-auto min-w-min flex-nowrap justify-start gap-1 bg-muted/40 p-1 rounded-xl">
              <TabsTrigger value="overview" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Overview
              </TabsTrigger>
              <TabsTrigger value="projects" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Projects
              </TabsTrigger>
              <TabsTrigger value="harvest" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Harvest
              </TabsTrigger>
              <TabsTrigger value="expenses" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Expenses
              </TabsTrigger>
              <TabsTrigger value="inventory" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Inventory
              </TabsTrigger>
              <TabsTrigger value="employees" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Employees
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Activity
              </TabsTrigger>
              <TabsTrigger value="season-challenges" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Season Challenges
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Audit Logs
              </TabsTrigger>
              <TabsTrigger value="subscription" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Subscription
              </TabsTrigger>
              <TabsTrigger value="payments" className="text-xs sm:text-sm whitespace-nowrap rounded-lg px-3 py-2">
                Payments
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4 focus-visible:outline-none">
            {data && !error ? (
              <CompanyOverviewTab data={data} />
            ) : (
              <EmptyStateBlock
                title="Farm intelligence unavailable"
                description="This overview could not be loaded. Season Challenges and Audit Logs still use the company id from the URL."
              />
            )}
          </TabsContent>
          <TabsContent value="projects" className="mt-4 focus-visible:outline-none">
            <CompanyProjectsTab companyId={id} projects={projects} />
          </TabsContent>
          <TabsContent value="harvest" className="mt-4 focus-visible:outline-none">
            <CompanyHarvestTab
              companyId={id}
              harvests={harvests}
              collections={harvestCollections}
              metrics={data?.metrics as Record<string, unknown> | undefined}
            />
          </TabsContent>
          <TabsContent value="expenses" className="mt-4 focus-visible:outline-none">
            <CompanyExpensesTab
              expenses={(data?.expenses ?? []) as Record<string, unknown>[]}
              byCategory={(data?.expense_by_category ?? []) as Record<string, unknown>[]}
              metrics={data?.metrics as Record<string, unknown> | undefined}
            />
          </TabsContent>
          <TabsContent value="inventory" className="mt-4 focus-visible:outline-none">
            <CompanyInventoryTab
              companyId={id}
              items={inventoryItems}
              audit={inventoryAudit}
              metrics={data?.metrics as Record<string, unknown> | undefined}
            />
          </TabsContent>
          <TabsContent value="employees" className="mt-4 focus-visible:outline-none">
            <CompanyEmployeesTab
              employees={(data?.employees ?? []) as Record<string, unknown>[]}
              metrics={data?.metrics as Record<string, unknown> | undefined}
            />
          </TabsContent>
          <TabsContent value="activity" className="mt-4 focus-visible:outline-none">
            <CompanyActivityTimelineTab
              timeline={timeline}
              activityLogs={activityLogs}
              employeeActivity={employeeActivity}
            />
          </TabsContent>
          <TabsContent value="season-challenges" className="mt-4 focus-visible:outline-none">
            <CompanySeasonChallengesTab companyId={id} active={tab === 'season-challenges'} />
          </TabsContent>
          <TabsContent value="audit" className="mt-4 focus-visible:outline-none">
            <CompanyAuditLogsTab companyId={id} active={tab === 'audit'} />
          </TabsContent>
          <TabsContent value="subscription" className="mt-4 focus-visible:outline-none">
            <CompanySubscriptionTab
              companyId={id}
              header={data?.header as Record<string, unknown> | undefined}
              payments={(data?.subscription_payments ?? []) as Record<string, unknown>[]}
            />
          </TabsContent>
          <TabsContent value="payments" className="mt-4 focus-visible:outline-none">
            <CompanyPaymentHistoryTab companyId={id} active={tab === 'payments'} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
