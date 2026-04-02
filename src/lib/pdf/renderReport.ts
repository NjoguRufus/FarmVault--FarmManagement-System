import Handlebars from 'handlebars';

import { expensesReportTemplate } from './templates/expensesReportTemplate';
import { harvestReportTemplate } from './templates/harvestReportTemplate';
import { operationsReportTemplate } from './templates/operationsReportTemplate';
import { salesReportTemplate } from './templates/salesReportTemplate';

const defaultFarmVaultLogoDataUrl = (() => {
  // Simple inline wordmark; avoids missing-asset blank logos in print/PDF.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96" viewBox="0 0 240 96">
  <rect width="240" height="96" fill="white"/>
  <text x="236" y="56" text-anchor="end" font-family="DM Serif Display, Georgia, serif" font-size="34" fill="#1b6b50">FarmVault</text>
  <text x="236" y="78" text-anchor="end" font-family="DM Sans, Arial, sans-serif" font-size="14" fill="#6b7280">farmvault.africa</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

export type ReportRenderInput = {
  company: {
    name: string;
    location: string;
    website: string;
    email: string;
    phone: string;
    logo: string;
  };
  report: {
    key?: 'expenses' | 'harvest' | 'sales' | 'operations';
    title: string;
    dateRange: string;
    generatedAt: string;
  };
  stats: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
};

function templateForTitle(reportTitle: string) {
  const t = reportTitle.toLowerCase();
  if (t.includes('expense')) return expensesReportTemplate;
  if (t.includes('harvest')) return harvestReportTemplate;
  if (t.includes('sale')) return salesReportTemplate;
  if (t.includes('operation')) return operationsReportTemplate;
  return expensesReportTemplate;
}

function templateForKey(key: ReportRenderInput['report']['key'] | undefined) {
  if (key === 'expenses') return expensesReportTemplate;
  if (key === 'harvest') return harvestReportTemplate;
  if (key === 'sales') return salesReportTemplate;
  if (key === 'operations') return operationsReportTemplate;
  return null;
}

export function renderReport(data: ReportRenderInput) {
  const totals = (data.totals ?? {}) as Record<string, unknown>;
  const reportPayload = {
    chart: totals.chart ?? null,
  };
  const ctx = {
    company_name: data.company?.name ?? '',
    company_location: data.company?.location ?? '',
    company_website: data.company?.website ?? '',
    company_email: data.company?.email ?? '',
    company_phone: data.company?.phone ?? '',
    logo_url: data.company?.logo ?? defaultFarmVaultLogoDataUrl,
    report_title: data.report?.title ?? '',
    date_range: data.report?.dateRange ?? '',
    generated_at: data.report?.generatedAt ?? '',
    report_payload_json: JSON.stringify(reportPayload),
    ...(data.stats ?? {}),
    rows: data.rows ?? [],
    totals,
  };

  const rawTemplate = templateForKey(data.report?.key) ?? templateForTitle(ctx.report_title);
  const template = Handlebars.compile(rawTemplate, { noEscape: true });
  return template(ctx);
}

