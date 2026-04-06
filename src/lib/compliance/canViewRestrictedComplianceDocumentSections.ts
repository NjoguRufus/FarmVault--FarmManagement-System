import type { User } from '@/types';

/**
 * Non-legal compliance sections (Safaricom, banking, registration, corporate) are limited to
 * platform developers and company owners / super admins. Legal remains available to everyone
 * the catalog RLS allows (see core.compliance_document_catalog policies).
 */
export function canViewRestrictedComplianceDocumentSections(
  isDeveloper: boolean,
  user: User | null,
): boolean {
  if (isDeveloper || user?.role === 'developer') return true;
  if (!user) return false;
  const raw = String(user.companyMembershipRole ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '');
  return raw === 'owner' || raw === 'superadmin';
}
