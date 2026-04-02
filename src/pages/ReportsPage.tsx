import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, BarChart2, PieChart, TrendingUp, Info, AlertCircle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePermissions } from '@/hooks/usePermissions';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';
import { Lock } from 'lucide-react';
import { NoCompanyGuard } from '@/components/NoCompanyGuard';
import { useCompanyScope } from '@/hooks/useCompanyScope';
import { useFarmAnalyticsReports } from '@/hooks/useFarmAnalyticsReports';
import { ToggleBasicPro, type ReportsDashboardMode } from '@/components/reports/ToggleBasicPro';
import { AnalyticsCards } from '@/components/reports/AnalyticsCards';
import { ProfitChart } from '@/components/reports/ProfitChart';
import { RevenueTrendChart } from '@/components/reports/RevenueTrendChart';
import { ExpensePieChart } from '@/components/reports/ExpensePieChart';
import { YieldChart } from '@/components/reports/YieldChart';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const scope = useCompanyScope();
  const companyId = scope.companyId;
  const canQuery = scope.error === null && !!companyId?.trim();

  const [mode, setMode] = useState<ReportsDashboardMode>('pro');

  const analytics = useFarmAnalyticsReports(canQuery ? companyId : null);

  const { can } = usePermissions();
  const canExportReports = can('reports', 'export');
  const exportAccess = useFeatureAccess('exportReports');

  useEffect(() => {
    captureEvent(AnalyticsEvents.REPORT_VIEWED, {
      company_id: user?.companyId ?? undefined,
      project_id: activeProject?.id,
      module_name: 'reports',
      route_path: '/reports',
    });
  }, [user?.companyId, activeProject?.id]);

  const reportTypes = [
    {
      title: 'Expenses Report',
      description: 'Detailed breakdown of all expenses by category and period',
      icon: <PieChart className="h-6 w-6" />,
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Harvest Report',
      description: 'Summary of harvest quantities, quality grades, and yields',
      icon: <BarChart2 className="h-6 w-6" />,
      color: 'bg-fv-success/10 text-fv-success',
    },
    {
      title: 'Sales Report',
      description: 'Complete sales data including buyers, quantities, and revenue',
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'bg-fv-gold-soft text-fv-olive',
    },
    {
      title: 'Operations Report',
      description: 'Timeline of all operations performed with status tracking',
      icon: <FileText className="h-6 w-6" />,
      color: 'bg-fv-info/10 text-fv-info',
    },
  ];

  const showDevNoCompany =
    scope.error === null && scope.isDeveloper && !companyId?.trim();

  return (
    <NoCompanyGuard>
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reports &amp; analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {activeProject ? (
                <>
                  Workspace insights for <span className="font-medium text-foreground">{activeProject.name}</span>
                </>
              ) : (
                'Company-wide performance from harvests and expenses'
              )}
            </p>
          </div>
          <ToggleBasicPro mode={mode} onChange={setMode} className="self-start sm:self-center" />
        </div>

        {showDevNoCompany ? (
          <Card className="border-border/60 bg-card/50 backdrop-blur-md shadow-[var(--shadow-card)]">
            <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-medium text-foreground">No company selected</p>
                <p className="text-sm text-muted-foreground">
                  Link your developer account to a company to load analytics RPCs for that workspace.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" asChild>
                <Link to="/developer">Open developer hub</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canQuery && analytics.isError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Could not load analytics</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {analytics.error instanceof Error ? analytics.error.message : 'Check your connection and try again.'}
                </p>
              </div>
              <Button variant="outline" onClick={() => void analytics.refetchAll()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!showDevNoCompany && canQuery ? (
          <>
            <AnalyticsCards
              mode={mode}
              loading={analytics.isLoading}
              bestCrop={analytics.bestCrop}
              totalRevenue={analytics.totals.totalRevenue}
              totalExpenses={analytics.totals.totalExpenses}
              totalProfit={analytics.totals.totalProfit}
              cropProfitRows={analytics.cropProfit}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <RevenueTrendChart data={analytics.monthlyRevenue} loading={analytics.isLoading} />
              <ExpensePieChart data={analytics.expenseBreakdown} loading={analytics.isLoading} />
            </div>

            {mode === 'pro' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <ProfitChart data={analytics.cropProfit} loading={analytics.isLoading} />
                <YieldChart data={analytics.cropYield} loading={analytics.isLoading} />
              </div>
            ) : null}
          </>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6" data-tour="reports-export">
          {reportTypes.map((report) => (
            <div
              key={report.title}
              className="rounded-2xl border border-white/15 bg-card/50 shadow-[var(--shadow-card)] backdrop-blur-md hover:shadow-[var(--shadow-card-hover)] transition-shadow cursor-pointer p-3 md:p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-2 md:gap-4">
                <div
                  className={`flex h-9 w-9 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-lg md:rounded-xl ${report.color}`}
                >
                  <span className="[&>svg]:h-4 [&>svg]:w-4 md:[&>svg]:h-6 md:[&>svg]:w-6">{report.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <h3 className="font-semibold text-foreground text-xs md:text-base break-words">{report.title}</h3>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                          aria-label={`Info: ${report.title}`}
                        >
                          <Info className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="max-w-[min(90vw,320px)] text-sm" align="start" side="bottom">
                        <p className="text-muted-foreground">{report.description}</p>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="hidden md:block text-sm text-muted-foreground mt-1">{report.description}</p>
                </div>
              </div>
              {canExportReports && (
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary w-full sm:w-auto self-start p-1.5 md:px-3 md:py-2 text-xs md:text-sm flex items-center justify-center gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (exportAccess.isLocked) {
                      openUpgradeModal({ checkoutPlan: 'pro' });
                      return;
                    }
                    captureEvent(AnalyticsEvents.REPORT_EXPORTED_EXCEL, {
                      company_id: user?.companyId ?? undefined,
                      project_id: activeProject?.id,
                      report_type: report.title,
                      module_name: 'reports',
                    });
                  }}
                >
                  {exportAccess.isLocked ? (
                    <Lock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  ) : (
                    <Download className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  )}
                  <span>Export</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </NoCompanyGuard>
  );
}
