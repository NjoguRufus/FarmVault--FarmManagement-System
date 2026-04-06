import { db } from '@/lib/db';

export type ComplianceDocumentGroup =
  | 'legal'
  | 'safaricom'
  | 'banking'
  | 'registration'
  | 'corporate';

export interface ComplianceDocumentCatalogRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  document_group: ComplianceDocumentGroup;
  category_badge: string;
  is_verified: boolean;
  href_view: string | null;
  href_download: string | null;
  last_updated: string;
  sort_order: number;
}

export async function fetchComplianceDocumentCatalog(): Promise<ComplianceDocumentCatalogRow[]> {
  const { data, error } = await db
    .core()
    .from('compliance_document_catalog')
    .select(
      'id, slug, title, description, document_group, category_badge, is_verified, href_view, href_download, last_updated, sort_order',
    )
    .order('sort_order', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    document_group: row.document_group as ComplianceDocumentGroup,
    category_badge: String(row.category_badge),
    is_verified: Boolean(row.is_verified),
    href_view: row.href_view != null ? String(row.href_view) : null,
    href_download: row.href_download != null ? String(row.href_download) : null,
    last_updated:
      typeof row.last_updated === 'string'
        ? row.last_updated
        : row.last_updated != null
          ? String(row.last_updated)
          : '',
    sort_order: Number(row.sort_order) || 0,
  }));
}
