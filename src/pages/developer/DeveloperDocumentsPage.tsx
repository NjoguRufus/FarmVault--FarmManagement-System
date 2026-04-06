import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  FileText,
  Shield,
  Users,
  CreditCard,
  BookOpen,
  Database,
  Lock,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { ComplianceDocumentCard } from '@/components/developer/ComplianceDocumentCard';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchComplianceDocumentCatalog,
  type ComplianceDocumentCatalogRow,
  type ComplianceDocumentGroup,
} from '@/services/complianceDocumentsService';

const SECTION_ORDER: ComplianceDocumentGroup[] = [
  'legal',
  'safaricom',
  'banking',
  'registration',
  'corporate',
];

const SECTION_TITLES: Record<ComplianceDocumentGroup, string> = {
  legal: 'Legal Documents',
  safaricom: 'Safaricom Integration Documents',
  banking: 'Banking Documents',
  registration: 'Business Registration',
  corporate: 'Corporate Profile',
};

const LEGAL_ICONS: Record<string, LucideIcon> = {
  'terms-of-service': FileText,
  'privacy-policy': Shield,
  'ambassador-agreement': Users,
  'subscription-billing-policy': CreditCard,
  'acceptable-use-policy': BookOpen,
  'data-processing-agreement': Database,
  'confidentiality-proprietary-information-agreement': Lock,
};

/** Offline / migration-not-applied fallback so legal links keep working. */
const LEGAL_STATIC_FALLBACK: ComplianceDocumentCatalogRow[] = [
  {
    id: 'local-terms',
    slug: 'terms-of-service',
    title: 'Terms of Service',
    description:
      'Account responsibilities, subscription rules, payment policy, limitation of liability, and termination rights.',
    document_group: 'legal',
    category_badge: 'All Users',
    is_verified: true,
    href_view: '/legal/terms-of-service.html',
    href_download: '/legal/terms-of-service.html',
    last_updated: '2026-04-04',
    sort_order: 10,
  },
  {
    id: 'local-privacy',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    description:
      'Data collected, usage, storage and security measures, retention periods, and user data rights.',
    document_group: 'legal',
    category_badge: 'All Users',
    is_verified: true,
    href_view: '/legal/privacy-policy.html',
    href_download: '/legal/privacy-policy.html',
    last_updated: '2026-04-04',
    sort_order: 20,
  },
  {
    id: 'local-ambassador',
    slug: 'ambassador-agreement',
    title: 'Ambassador Agreement',
    description:
      'Commission structure, payment conditions, non-employment clause, fraud prevention, and termination.',
    document_group: 'legal',
    category_badge: 'Ambassadors',
    is_verified: true,
    href_view: '/legal/ambassador-agreement.html',
    href_download: '/legal/ambassador-agreement.html',
    last_updated: '2026-04-04',
    sort_order: 30,
  },
  {
    id: 'local-billing',
    slug: 'subscription-billing-policy',
    title: 'Subscription & Billing Policy',
    description:
      'Manual and STK Push payment rules, renewal policy, expiry and grace periods, and pricing changes.',
    document_group: 'legal',
    category_badge: 'Subscribers',
    is_verified: true,
    href_view: '/legal/subscription-billing-policy.html',
    href_download: '/legal/subscription-billing-policy.html',
    last_updated: '2026-04-04',
    sort_order: 40,
  },
  {
    id: 'local-aup',
    slug: 'acceptable-use-policy',
    title: 'Acceptable Use Policy',
    description:
      'Permitted use, platform misuse rules, prohibited behaviour, abuse prevention, and enforcement actions.',
    document_group: 'legal',
    category_badge: 'All Users',
    is_verified: true,
    href_view: '/legal/acceptable-use-policy.html',
    href_download: '/legal/acceptable-use-policy.html',
    last_updated: '2026-04-04',
    sort_order: 50,
  },
  {
    id: 'local-dpa',
    slug: 'data-processing-agreement',
    title: 'Data Processing Agreement',
    description:
      'Data ownership, processing obligations, security measures, subprocessor clause, and compliance.',
    document_group: 'legal',
    category_badge: 'Business Subscribers',
    is_verified: true,
    href_view: '/legal/data-processing-agreement.html',
    href_download: '/legal/data-processing-agreement.html',
    last_updated: '2026-04-04',
    sort_order: 60,
  },
  {
    id: 'local-cpia',
    slug: 'confidentiality-proprietary-information-agreement',
    title: 'Confidentiality & Proprietary Information Agreement',
    description:
      'Internal-only: trade secrets (technical, platform, business, analytics, ops, design), obligations, IP, non-compete, non-solicitation, access, security, breach, return/destruction.',
    document_group: 'legal',
    category_badge: 'Internal · Confidential',
    is_verified: true,
    href_view: '/legal/confidentiality-proprietary-information-agreement.html',
    href_download: '/legal/confidentiality-proprietary-information-agreement.html',
    last_updated: '2026-04-04',
    sort_order: 70,
  },
];

/** Static rows for Safaricom / banking / registration / corporate — merged when RLS returns only legal or hrefs are null. */
const EXTENDED_STATIC_FALLBACK: ComplianceDocumentCatalogRow[] = [
  {
    id: 'static-mpesa-c2b',
    slug: 'mpesa-c2b-application',
    title: 'M-Pesa C2B Application Form',
    description: 'Safaricom M-Pesa Customer to Business (C2B) integration application.',
    document_group: 'safaricom',
    category_badge: 'Integration Required',
    is_verified: true,
    href_view: '/compliance/mpesa-c2b-application.html',
    href_download: '/compliance/mpesa-c2b-application.html',
    last_updated: '2026-04-04',
    sort_order: 100,
  },
  {
    id: 'static-mpesa-admin',
    slug: 'mpesa-business-administrator',
    title: 'M-Pesa Business Administrator Form',
    description: 'Designated business administrator registration for M-Pesa integration.',
    document_group: 'safaricom',
    category_badge: 'Integration Required',
    is_verified: true,
    href_view: '/compliance/mpesa-business-administrator.html',
    href_download: '/compliance/mpesa-business-administrator.html',
    last_updated: '2026-04-04',
    sort_order: 110,
  },
  {
    id: 'static-mpesa-auth',
    slug: 'mpesa-account-opening-authorization',
    title: 'M-Pesa Account Opening Authorization Form',
    description: 'Authorization for M-Pesa business account opening linked to FarmVault.',
    document_group: 'safaricom',
    category_badge: 'Integration Required',
    is_verified: true,
    href_view: '/compliance/mpesa-account-opening-authorization.html',
    href_download: '/compliance/mpesa-account-opening-authorization.html',
    last_updated: '2026-04-04',
    sort_order: 120,
  },
  {
    id: 'static-ncba',
    slug: 'ncba-bank-reference-letter',
    title: 'NCBA Bank Reference Letter',
    description: 'Official bank reference letter for FarmVault (NCBA).',
    document_group: 'banking',
    category_badge: 'Bank Verified',
    is_verified: true,
    href_view: '/compliance/ncba-bank-reference-letter.html',
    href_download: '/compliance/ncba-bank-reference-letter.html',
    last_updated: '2026-04-04',
    sort_order: 200,
  },
  {
    id: 'static-brs',
    slug: 'business-registration-certificate-brs',
    title: 'Business Registration Certificate (BRS)',
    description: 'Official business registration certificate (BRS).',
    document_group: 'registration',
    category_badge: 'Official Registration',
    is_verified: true,
    href_view: '/compliance/business-registration-certificate-brs.html',
    href_download: '/compliance/business-registration-certificate-brs.html',
    last_updated: '2026-04-04',
    sort_order: 300,
  },
  {
    id: 'static-profile',
    slug: 'farmvault-business-profile',
    title: 'FarmVault Business Profile',
    description: 'FarmVault company profile for partners and institutions.',
    document_group: 'corporate',
    category_badge: 'Company Profile',
    is_verified: true,
    href_view: '/compliance/farmvault-business-profile.html',
    href_download: '/compliance/farmvault-business-profile.html',
    last_updated: '2026-04-04',
    sort_order: 400,
  },
];

function mergeComplianceCatalogRows(
  dbRows: ComplianceDocumentCatalogRow[] | undefined,
  isError: boolean,
): ComplianceDocumentCatalogRow[] {
  const map = new Map<string, ComplianceDocumentCatalogRow>();
  const seed =
    isError || !dbRows?.length ? LEGAL_STATIC_FALLBACK : dbRows;

  for (const r of seed) {
    map.set(r.slug, r);
  }

  for (const s of EXTENDED_STATIC_FALLBACK) {
    const cur = map.get(s.slug);
    if (!cur) {
      map.set(s.slug, s);
      continue;
    }
    const v = cur.href_view?.trim();
    const d = cur.href_download?.trim();
    map.set(s.slug, {
      ...cur,
      href_view: v || s.href_view,
      href_download: d || s.href_download || v || s.href_view,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

export default function DeveloperDocumentsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['compliance-document-catalog'],
    queryFn: fetchComplianceDocumentCatalog,
    staleTime: 60_000,
  });

  /** Merges DB rows with static fallbacks so Safaricom/banking/etc. stay available if RLS returns only legal. */
  const visibleRows = useMemo(() => mergeComplianceCatalogRows(data, isError), [data, isError]);

  const rowsByGroup = useMemo(() => {
    const m = new Map<ComplianceDocumentGroup, ComplianceDocumentCatalogRow[]>();
    visibleRows.forEach((row) => {
      const g = row.document_group;
      const list = m.get(g) ?? [];
      list.push(row);
      m.set(g, list);
    });
    m.forEach((list, g) => {
      list.sort((a, b) => a.sort_order - b.sort_order);
      m.set(g, list);
    });
    return m;
  }, [visibleRows]);

  return (
    <div className="space-y-4">
      <Link
        to="/developer"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Developer Dashboard
      </Link>

      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/developer" className="hover:text-foreground">
              Developer Console
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-medium text-foreground">Compliance &amp; Documents</li>
        </ol>
      </nav>

      <DeveloperPageShell
        title="Compliance & Documents"
        description="Legal policies, Safaricom and banking reference documents, registration certificate, and corporate profile. Open any card or use View to print or save as PDF."
      >
        {isError ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Could not sync the catalog from the server; showing merged static links. Check Supabase connection or RLS if
            this persists.
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {SECTION_ORDER.map((group) => {
              const sectionRows = rowsByGroup.get(group);
              if (!sectionRows?.length) return null;

              return (
                <section key={group} className="space-y-4">
                  <div className="space-y-3">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {SECTION_TITLES[group]}
                    </h2>
                    <Separator />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {sectionRows.map((doc) => (
                      <ComplianceDocumentCard
                        key={doc.id}
                        doc={doc}
                        icon={group === 'legal' ? LEGAL_ICONS[doc.slug] : undefined}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Legal &amp; Compliance</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              All documents are governed by the laws of Kenya. Legal inquiries:{' '}
              <span className="font-medium text-foreground">legal@farmvault.africa</span>
              {' '}
              · Data protection:{' '}
              <span className="font-medium text-foreground">privacy@farmvault.africa</span>
            </p>
          </div>
        </div>
      </DeveloperPageShell>
    </div>
  );
}
