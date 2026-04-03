import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, FileText, BarChart2, PieChart, TrendingUp, Info, AlertCircle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePermissions } from '@/hooks/usePermissions';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { FeatureGate } from '@/components/subscription';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';
import { Lock } from 'lucide-react';
import { NoCompanyGuard } from '@/components/NoCompanyGuard';
import { useCompanyScope } from '@/hooks/useCompanyScope';
import { useFarmAnalyticsReports } from '@/hooks/useFarmAnalyticsReports';
import { AnalyticsCards } from '@/components/reports/AnalyticsCards';
import { ProfitChart } from '@/components/reports/ProfitChart';
import { RevenueTrendChart } from '@/components/reports/RevenueTrendChart';
import { ExpensePieChart } from '@/components/reports/ExpensePieChart';
import { YieldChart } from '@/components/reports/YieldChart';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/csv/downloadCsv';
import { fetchAnalyticsReportDetailRows } from '@/services/analyticsReportsService';
import { formatKes } from '@/components/reports/analyticsFormat';
import { createFarmVaultReportPdf, addSummaryPage, addChartsPage, addDetailsTablePage, finalizeWithFooters } from '@/lib/pdf/farmvaultPdf';
import { captureElementPngDataUrl } from '@/lib/pdf/captureChart';
import { renderReport } from '@/lib/pdf/renderReport';
import { printHtmlReport } from '@/lib/pdf/printHtmlReport';
import { toast } from 'sonner';
import { getCompany } from '@/services/companyService';
import { queryReportExportEntity, type ReportExportEntity } from '@/services/reportsExportService';

/**
 * Typed export queries (no public.harvests.company_id, no sales table, no JWT GUCs).
 * Returns empty data on failure after structured logging.
 */
async function selectAllByCompanyIdWithFallback(opts: {
  companyId: string;
  label: string;
  entity: ReportExportEntity;
}): Promise<{ table: string; data: any[] }> {
  const { companyId, label, entity } = opts;
  try {
    return await queryReportExportEntity(companyId, label, entity);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Supabase error:', {
      op: 'selectAllByCompanyIdWithFallback',
      label,
      entity,
      company_id: companyId,
      message: (e as any)?.message,
      error: e,
    });
    return { table: String(entity), data: [] };
  }
}

export default function ReportsPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const scope = useCompanyScope();
  const companyId = scope.companyId;
  const canQuery = scope.error === null && !!companyId?.trim();

  const analytics = useFarmAnalyticsReports(canQuery ? companyId : null);

  const { can } = usePermissions();
  const canExportReports = can('reports', 'export');
  const exportAccess = useFeatureAccess('exportReports');

  // company name is best-effort (available in auth context in some environments)

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
      route: '/expenses',
    },
    {
      title: 'Harvest Report',
      description: 'Summary of harvest quantities, quality grades, and yields',
      icon: <BarChart2 className="h-6 w-6" />,
      color: 'bg-fv-success/10 text-fv-success',
      route: '/harvest',
    },
    {
      title: 'Sales Report',
      description: 'Complete sales data including buyers, quantities, and revenue',
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'bg-fv-gold-soft text-fv-olive',
      route: '/harvest-sales',
    },
    {
      title: 'Operations Report',
      description: 'Timeline of all operations performed with status tracking',
      icon: <FileText className="h-6 w-6" />,
      color: 'bg-fv-info/10 text-fv-info',
      route: '/operations',
    },
  ];

  const showDevNoCompany =
    scope.error === null && scope.isDeveloper && !companyId?.trim();

  const handleExportCsv = async () => {
    if (!canExportReports) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (exportAccess.isLocked) {
      openUpgradeModal({ checkoutPlan: 'pro' });
      return;
    }
    try {
      const rows = await fetchAnalyticsReportDetailRows(companyId);
      if (!rows.length) {
        toast.error('No report data to export.');
        return;
      }
      downloadCsv(
        rows.map((r) => ({
          Date: r.date,
          Crop: r.crop ?? '',
          Revenue: r.revenue,
          Expenses: r.expenses,
          Profit: r.profit,
          Yield: r.yield,
        })),
        'farmvault-report',
      );
      captureEvent(AnalyticsEvents.REPORT_EXPORTED_EXCEL, {
        company_id: user?.companyId ?? undefined,
        project_id: activeProject?.id,
        report_type: 'farmvault-report',
        module_name: 'reports',
      });
      toast.success('CSV exported.');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error('Failed to export CSV.');
    }
  };

  const handleExportPdf = async () => {
    if (!canExportReports) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (exportAccess.isLocked) {
      openUpgradeModal({ checkoutPlan: 'pro' });
      return;
    }

    try {
      const detailRows = await fetchAnalyticsReportDetailRows(companyId);
      const dateRangeLabel = detailRows.length
        ? `${detailRows[detailRows.length - 1].date} → ${detailRows[0].date}`
        : 'All time';
      const generatedAtLabel = new Date().toLocaleString();
      const meta = {
        companyName: (user as any)?.companyName ?? 'FarmVault Company',
        reportTitle: 'Farm Performance Report',
        dateRangeLabel,
        generatedAtLabel,
      };

      const doc = createFarmVaultReportPdf(meta);

      addSummaryPage(
        doc,
        {
          revenue: analytics.totals.totalRevenue,
          expenses: analytics.totals.totalExpenses,
          profit: analytics.totals.totalProfit,
          yield: analytics.totals.totalYield,
        },
        (n) => formatKes(n),
        (n) => `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`,
      );

      // Capture charts from the rendered page
      const revenueEl = document.querySelector('[data-report-chart="monthly-revenue"]') as HTMLElement | null;
      const expenseEl = document.querySelector('[data-report-chart="expense-breakdown"]') as HTMLElement | null;
      const yieldEl = document.querySelector('[data-report-chart="yield-per-crop"]') as HTMLElement | null;

      const [revImg, expImg, yImg] = await Promise.all([
        revenueEl ? captureElementPngDataUrl(revenueEl) : Promise.resolve(null),
        expenseEl ? captureElementPngDataUrl(expenseEl) : Promise.resolve(null),
        yieldEl ? captureElementPngDataUrl(yieldEl) : Promise.resolve(null),
      ]);

      addChartsPage(doc, [
        { title: 'Monthly revenue', imageDataUrl: revImg ?? undefined },
        { title: 'Expense breakdown', imageDataUrl: expImg ?? undefined },
        { title: 'Yield per crop', imageDataUrl: yImg ?? undefined },
      ]);

      addDetailsTablePage(
        doc,
        'Detailed table',
        ['Date', 'Crop', 'Revenue', 'Expenses', 'Profit', 'Yield'],
        detailRows.map((r) => [
          r.date,
          r.crop ?? '—',
          formatKes(r.revenue),
          formatKes(r.expenses),
          formatKes(r.profit),
          `${r.yield.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`,
        ]),
      );

      finalizeWithFooters(doc);
      doc.save('farmvault-report.pdf');

      captureEvent(AnalyticsEvents.REPORT_EXPORTED_EXCEL, {
        company_id: user?.companyId ?? undefined,
        project_id: activeProject?.id,
        report_type: 'farmvault-report-pdf',
        module_name: 'reports',
      });
      toast.success('PDF exported.');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error('Failed to export PDF.');
    }
  };

  const exportExpensesReport = async (format: 'csv' | 'pdf') => {
    if (!canExportReports) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (exportAccess.isLocked) {
      openUpgradeModal({ checkoutPlan: 'pro' });
      return;
    }

    let rows: any[] = [];
    try {
      const res = await selectAllByCompanyIdWithFallback({
        companyId,
        label: 'expenses',
        entity: 'finance.expenses',
      });
      rows = res.data;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Supabase error:', {
        op: 'exportExpensesReport',
        label: 'expenses',
        company_id: companyId,
        message: (e as any)?.message,
        code: (e as any)?.code,
        details: (e as any)?.details,
        hint: (e as any)?.hint,
        error: e,
      });
      toast.error('Could not load expenses for export.');
      return;
    }

    if (!rows.length) {
      toast.error('No expenses to export.');
      return;
    }

    const expenseProjectName = (e: any) => {
      const p = e.projects as { name?: string } | null | undefined;
      return String(p?.name ?? e.project_name ?? e.project_id ?? '—');
    };
    const expenseDate = (e: any) =>
      String(e.expense_date ?? e.date ?? e.created_at ?? '').slice(0, 10);

    if (format === 'csv') {
      downloadCsv(
        rows.map((e) => ({
          Date: expenseDate(e),
          Category: String(e.category ?? ''),
          Amount: Number(e.amount ?? 0),
          Project: expenseProjectName(e),
        })),
        'farmvault-expenses-report',
      );
      toast.success('Expenses CSV exported.');
      return;
    }

    const total = rows.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const tx = rows.length;
    const avg = tx ? total / tx : 0;
    const byCategory = Object.entries(
      rows.reduce<Record<string, number>>((acc, e) => {
        const key = String(e.category ?? 'other');
        acc[key] = (acc[key] || 0) + Number(e.amount ?? 0);
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);
    const top = byCategory[0] ?? ['—', 0];

    const badgeForExpenseCategory = (cat: string) => {
      const c = String(cat || '').toLowerCase();
      if (c.includes('labour') || c.includes('labor')) return 'badge-green';
      if (c.includes('input') || c.includes('fert') || c.includes('chem')) return 'badge-gold';
      return 'badge-gray';
    };

    const company = companyId ? await getCompany(companyId) : null;
    const html = renderReport({
      company: {
        name: company?.name ?? (user as any)?.companyName ?? 'FarmVault Company',
        location: String((company as any)?.location ?? ''),
        website: String((company as any)?.website ?? 'farmvault.africa'),
        email: company?.email ?? '',
        phone: String((company as any)?.phone ?? ''),
        logo: String((company as any)?.logo_url ?? (company as any)?.logo ?? ''),
      },
      report: {
        key: 'expenses',
        title: 'Expenses Report',
        dateRange: 'All time',
        generatedAt: new Date().toLocaleString(),
      },
      stats: {
        total_expenses: formatKes(total),
        transactions: `${tx}`,
        avg_expense: formatKes(avg),
        top_category: String(top[0]),
        top_category_amount: formatKes(Number(top[1] ?? 0)),
      },
      rows: rows.map((e) => ({
        date: expenseDate(e),
        category: `<span class="badge ${badgeForExpenseCategory(String(e.category ?? ''))}">${String(e.category ?? '')}</span>`,
        item: String(e.item_name ?? e.description ?? e.note ?? e.notes ?? ''),
        supplier: String(e.supplier_name ?? e.supplierName ?? '—'),
        crop: String(
          (e.projects as { crop_type?: string } | null | undefined)?.crop_type ?? e.crop_type ?? e.crop ?? '—',
        ),
        notes: String(e.description ?? e.note ?? e.notes ?? expenseProjectName(e)),
        amount: `${Number(e.amount ?? 0).toLocaleString()}`,
      })),
      totals: {
        transactions: tx,
        total_amount: `${Math.round(total).toLocaleString()}`,
        category_summary: byCategory.slice(0, 6).map(([label, amount]) => ({ label, value: formatKes(amount) })),
        chart: {
          type: 'pie',
          labels: byCategory.slice(0, 6).map((x) => x[0]),
          values: byCategory.slice(0, 6).map((x) => x[1]),
        },
        notes: 'All amounts in Kenyan Shillings (KES).',
      },
    });

    try {
      printHtmlReport(html);
      toast.success('Expenses PDF export opened.');
    } catch {
      toast.error('Could not open print window.', { description: 'Please allow popups and try again.' });
    }
  };

  const exportHarvestReport = async (format: 'csv' | 'pdf') => {
    if (!canExportReports) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (exportAccess.isLocked) {
      openUpgradeModal({ checkoutPlan: 'pro' });
      return;
    }

    let rows: any[] = [];
    try {
      const res = await selectAllByCompanyIdWithFallback({
        companyId,
        label: 'harvest',
        entity: 'harvest',
      });
      rows = res.data;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Supabase error:', {
        op: 'exportHarvestReport',
        label: 'harvest',
        company_id: companyId,
        message: (e as any)?.message,
        code: (e as any)?.code,
        details: (e as any)?.details,
        hint: (e as any)?.hint,
        error: e,
      });
      toast.error('Could not load harvests for export.');
      return;
    }

    if (!rows.length) {
      toast.error('No harvests to export.');
      return;
    }

    const toCrop = (h: any) => String(h.crop_type ?? h.crop ?? h.cropType ?? '');
    const toDate = (h: any) => String(h.harvest_date ?? h.date ?? h.created_at ?? '').slice(0, 10);
    const toQty = (h: any) => Number(h.total_yield ?? h.total_yield_kg ?? h.quantity ?? h.totalYield ?? 0);
    const toPrice = (h: any) => Number(h.price_per_unit ?? h.unit_price ?? 0);
    const toRevenue = (h: any) => {
      const q = toQty(h);
      const p = toPrice(h);
      const explicit = Number(h.total_revenue ?? h.revenue ?? 0);
      if (Number.isFinite(explicit) && explicit !== 0) return explicit;
      return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
    };
    const toUnit = (h: any) => String(h.unit ?? h.yield_unit ?? 'kg');
    const toQuality = (h: any) => String(h.quality ?? h.grade ?? '');

    if (format === 'csv') {
      downloadCsv(
        rows.map((h) => ({
          Date: toDate(h),
          Crop: toCrop(h),
          Yield: toQty(h),
          Price: toPrice(h),
          Revenue: toRevenue(h),
        })),
        'farmvault-harvest-report',
      );
      toast.success('Harvest CSV exported.');
      return;
    }

    const totalYield = rows.reduce((s, h) => s + toQty(h), 0);
    const uniqueDays = new Set(rows.map((h) => toDate(h))).size;
    const avgDaily = uniqueDays ? totalYield / uniqueDays : 0;
    const gradeACount = rows.filter((h) => String(toQuality(h)).toLowerCase().includes('a')).length;
    const gradeARatio = rows.length ? Math.round((gradeACount / rows.length) * 100) : 0;

    const gradeBadge = (g: string) => {
      const gg = String(g || '').toLowerCase();
      if (gg.includes('a')) return '<span class="badge badge-green">Grade A</span>';
      if (gg.includes('b')) return '<span class="badge badge-gold">Grade B</span>';
      if (gg.includes('c')) return '<span class="badge badge-gray">Grade C</span>';
      return `<span class="badge badge-gray">${String(g || '—')}</span>`;
    };

    const html = renderReport({
      company: {
        name: (user as any)?.companyName ?? 'FarmVault Company',
        location: '',
        website: 'farmvault.africa',
        email: '',
        phone: '',
        logo: '',
      },
      report: {
        key: 'harvest',
        title: 'Harvest Report',
        dateRange: 'All time',
        generatedAt: new Date().toLocaleString(),
      },
      stats: {
        total_yield: `${totalYield.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`,
        harvest_days: `${uniqueDays}`,
        avg_daily_yield: `${avgDaily.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`,
        grade_a_ratio: `${gradeARatio}%`,
      },
      rows: rows.map((h) => ({
        date: toDate(h),
        crop: toCrop(h) || '—',
        block: String(h.block ?? h.farm_block ?? '—'),
        collected_by: String(h.collected_by ?? h.collectedBy ?? h.created_by ?? '—'),
        grade: gradeBadge(toQuality(h) || '—'),
        units: toUnit(h),
        yield_kg: `${toQty(h).toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
      })),
      totals: {
        table_footer_label: 'TOTAL — Harvest',
        total_yield_kg: `${totalYield.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
        grade_a_sub: '',
        crop_breakdown: [],
        block_performance: [],
        notes: 'All weights recorded in kilograms (kg).',
      },
    });

    try {
      printHtmlReport(html);
      toast.success('Harvest PDF export opened.');
    } catch {
      toast.error('Could not open print window.', { description: 'Please allow popups and try again.' });
    }
  };

  const exportSalesReport = async (format: 'csv' | 'pdf') => {
    if (!canExportReports) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (exportAccess.isLocked) {
      openUpgradeModal({ checkoutPlan: 'pro' });
      return;
    }

    let effectiveRows: any[] = [];
    try {
      const res = await selectAllByCompanyIdWithFallback({
        companyId,
        label: 'sales',
        entity: 'sales',
      });
      effectiveRows = res.data;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Supabase error:', {
        op: 'exportSalesReport',
        label: 'sales',
        company_id: companyId,
        message: (e as any)?.message,
        code: (e as any)?.code,
        details: (e as any)?.details,
        hint: (e as any)?.hint,
        error: e,
      });
      toast.error('Could not load sales for export.');
      return;
    }

    if (!effectiveRows.length) {
      toast.error('No sales to export.');
      return;
    }

    const toDateS = (r: any) => String(r._export_date ?? r.created_at ?? '').slice(0, 10);
    const toCropS = (r: any) => String(r._export_crop ?? r.crop ?? '');
    const toRevenue = (r: any) => Number(r._export_revenue ?? r.total_revenue ?? r.total_gross_amount ?? 0);
    const toQty = (r: any) => Number(r.total_weight_kg ?? r.quantity ?? 0);
    const toPrice = (r: any) => {
      const q = toQty(r);
      const rev = toRevenue(r);
      return q > 0 && Number.isFinite(rev) ? rev / q : 0;
    };
    const toBuyer = () => '—';
    const toStatus = () => 'paid';

    if (format === 'csv') {
      downloadCsv(
        effectiveRows.map((r) => ({
          Date: toDateS(r),
          Crop: toCropS(r),
          Revenue: toRevenue(r),
        })),
        'farmvault-sales-report',
      );
      toast.success('Sales CSV exported.');
      return;
    }

    const totalRevenue = effectiveRows.reduce((s, r) => s + toRevenue(r), 0);
    const totalQty = effectiveRows.reduce((s, r) => s + toQty(r), 0);
    const avgPrice = totalQty ? totalRevenue / totalQty : 0;

    const paymentBadge = (status: string) => {
      if (status.includes('paid')) return '<span class="badge badge-paid">Paid</span>';
      if (status.includes('partial')) return '<span class="badge badge-partial">Partial</span>';
      if (status.includes('pending') || status.includes('unpaid')) return '<span class="badge badge-pending">Pending</span>';
      return '<span class="badge badge-pending">Pending</span>';
    };

    const cropBadge = (crop: string) =>
      `<span class="badge ${String(crop).toLowerCase().includes('maize') ? 'badge-gold' : 'badge-green'}">${crop}</span>`;

    const outstanding = 0;

    const html = renderReport({
      company: {
        name: (user as any)?.companyName ?? 'FarmVault Company',
        location: '',
        website: 'farmvault.africa',
        email: '',
        phone: '',
        logo: '',
      },
      report: {
        key: 'sales',
        title: 'Sales Report',
        dateRange: 'All time',
        generatedAt: new Date().toLocaleString(),
      },
      stats: {
        total_revenue: formatKes(totalRevenue),
        sales_records: `${effectiveRows.length}`,
        avg_price: `KES ${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        outstanding: formatKes(outstanding),
      },
      rows: effectiveRows.map((r) => ({
        date: toDateS(r),
        crop: cropBadge(toCropS(r) || '—'),
        buyer: toBuyer(),
        qty_kg: `${toQty(r).toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
        price_per_kg: `${toPrice(r).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        payment: paymentBadge(toStatus()),
        total: `${toRevenue(r).toLocaleString()}`,
      })),
      totals: {
        sales_records: effectiveRows.length,
        total_qty_kg: `${totalQty.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
        total_revenue: `${totalRevenue.toLocaleString()}`,
        payment_summary: [],
        buyer_summary: [],
        notes: 'All figures in Kenyan Shillings (KES).',
      },
    });

    try {
      printHtmlReport(html);
      toast.success('Sales PDF export opened.');
    } catch {
      toast.error('Could not open print window.', { description: 'Please allow popups and try again.' });
    }
  };

  const exportOperationsReport = async (format: 'csv' | 'pdf') => {
    if (!canExportReports) {
      toast.error('Permission denied', { description: 'You cannot export reports.' });
      return;
    }
    if (exportAccess.isLocked) {
      openUpgradeModal({ checkoutPlan: 'pro' });
      return;
    }

    let rows: any[] = [];
    try {
      const res = await selectAllByCompanyIdWithFallback({
        companyId,
        label: 'operations',
        entity: 'operations_work_cards',
      });
      rows = res.data;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Supabase error:', {
        op: 'exportOperationsReport',
        label: 'operations',
        company_id: companyId,
        message: (e as any)?.message,
        code: (e as any)?.code,
        details: (e as any)?.details,
        hint: (e as any)?.hint,
        error: e,
      });
      toast.error('Could not load operations for export.');
      return;
    }

    if (!rows.length) {
      toast.error('No operations to export.');
      return;
    }

    const opsPayloadObj = (w: any): Record<string, unknown> => {
      const p = w?.payload;
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    };
    const opsActivity = (w: any) =>
      String(opsPayloadObj(w).activity ?? opsPayloadObj(w).type ?? w.activity ?? w.type ?? w.status ?? '');
    const opsCost = (w: any) =>
      Number(opsPayloadObj(w).cost ?? opsPayloadObj(w).amount ?? w.cost ?? w.total_cost ?? w.totalCost ?? 0);
    const opsEmployee = (w: any) =>
      String(w.allocated_manager_id ?? opsPayloadObj(w).employee ?? opsPayloadObj(w).employee_id ?? '—');
    const opsDate = (w: any) => String(w.date ?? w.created_at ?? '').slice(0, 10);

    if (format === 'csv') {
      downloadCsv(
        rows.map((w) => ({
          Date: opsDate(w),
          Activity: opsActivity(w),
          Employee: opsEmployee(w),
          Cost: opsCost(w),
        })),
        'farmvault-operations-report',
      );
      toast.success('Operations CSV exported.');
      return;
    }

    const totalActivities = rows.length;
    const workerDays = rows.reduce((s, w) => s + Number(w.worker_days ?? w.workerDays ?? 0), 0);
    const opsCostTotal = rows.reduce((s, w) => s + opsCost(w), 0);

    const activityBadge = (a: string) => {
      const x = String(a || '').toLowerCase();
      if (x.includes('spray')) return '<span class="badge badge-purple">Spraying</span>';
      if (x.includes('irrig')) return '<span class="badge badge-gold">Irrigation</span>';
      if (x.includes('prep')) return '<span class="badge badge-blue">Land Prep</span>';
      if (x.includes('plant')) return '<span class="badge badge-green">Planting</span>';
      if (x.includes('harvest')) return '<span class="badge badge-green">Harvesting</span>';
      return `<span class="badge badge-gray">${a || 'Activity'}</span>`;
    };

    const html = renderReport({
      company: {
        name: (user as any)?.companyName ?? 'FarmVault Company',
        location: '',
        website: 'farmvault.africa',
        email: '',
        phone: '',
        logo: '',
      },
      report: {
        key: 'operations',
        title: 'Operations Report',
        dateRange: 'All time',
        generatedAt: new Date().toLocaleString(),
      },
      stats: {
        total_activities: `${totalActivities}`,
        worker_days: `${workerDays.toLocaleString()}`,
        operations_cost: formatKes(opsCostTotal),
        top_activity: '—',
      },
      rows: rows.map((w) => ({
        date: opsDate(w),
        activity: activityBadge(opsActivity(w)),
        crop: String(w.crop ?? w.crop_type ?? '—'),
        block: String(w.block ?? w.farm_block ?? '—'),
        supervisor: String(w.supervisor ?? opsEmployee(w)),
        workers: `${Number(w.workers ?? w.worker_count ?? 0) || '—'}`,
        cost: `${opsCost(w).toLocaleString()}`,
      })),
      totals: {
        total_activities: totalActivities,
        worker_days: `${workerDays.toLocaleString()}`,
        operations_cost_total: `${opsCostTotal.toLocaleString()}`,
        activity_breakdown: [],
        worker_utilization: [],
        supervisor_summary: [],
        top_activity_sub: '',
        notes: 'All operations logged in FarmVault.',
      },
    });

    try {
      printHtmlReport(html);
      toast.success('Operations PDF export opened.');
    } catch {
      toast.error('Could not open print window.', { description: 'Please allow popups and try again.' });
    }
  };

  const handleTileExport = async (title: string) => {
    try {
      if (title === 'Expenses Report') {
        await exportExpensesReport('pdf');
        return;
      }
      if (title === 'Harvest Report') {
        await exportHarvestReport('pdf');
        return;
      }
      if (title === 'Sales Report') {
        await exportSalesReport('pdf');
        return;
      }
      if (title === 'Operations Report') {
        await exportOperationsReport('pdf');
        return;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error('Export failed.');
    }
  };

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
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {canExportReports ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void handleExportPdf()}>
                  Export PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleExportCsv()}>
                  Export CSV
                </Button>
              </>
            ) : null}
          </div>
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
              loading={analytics.isLoading}
              bestCrop={analytics.bestCrop}
              totalRevenue={analytics.totals.totalRevenue}
              totalExpenses={analytics.totals.totalExpenses}
              totalProfit={analytics.totals.totalProfit}
              totalYield={analytics.totals.totalYield}
              monthlyRevenue={analytics.monthlyRevenue}
              cropProfitRows={analytics.cropProfit}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div data-report-chart="monthly-revenue">
                <RevenueTrendChart data={analytics.monthlyRevenue} loading={analytics.isLoading} />
              </div>
              <div data-report-chart="expense-breakdown">
                <FeatureGate feature="advancedAnalytics" upgradePresentation="blur-data" className="block h-full">
                  <ExpensePieChart data={analytics.expenseBreakdown} loading={analytics.isLoading} />
                </FeatureGate>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
              <FeatureGate feature="profitCharts" upgradePresentation="blur-data" className="min-w-0">
                <ProfitChart data={analytics.cropProfit} loading={analytics.isLoading} />
              </FeatureGate>
              <div data-report-chart="yield-per-crop" className="min-w-0">
                <FeatureGate feature="profitCharts" upgradePresentation="blur-data" className="block h-full">
                  <YieldChart data={analytics.cropYield} loading={analytics.isLoading} />
                </FeatureGate>
              </div>
            </div>
          </>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6" data-tour="reports-export">
          {reportTypes.map((report) => (
            <div
              key={report.title}
              className="rounded-2xl border border-white/15 bg-card/50 shadow-[var(--shadow-card)] backdrop-blur-md hover:shadow-[var(--shadow-card-hover)] transition-shadow cursor-pointer p-3 md:p-4 flex flex-col gap-3"
              role="button"
              tabIndex={0}
              onClick={() => navigate(report.route)}
              onKeyDown={(e) => (e.key === 'Enter' ? navigate(report.route) : null)}
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
                    void handleTileExport(report.title);
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
