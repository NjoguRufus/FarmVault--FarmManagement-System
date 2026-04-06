-- Catalog for Compliance & Documents (legal + integration / corporate artifacts).
-- RLS: legal rows readable by any authenticated user; other groups for platform developers
-- or company members with owner / super_admin role.

CREATE TABLE IF NOT EXISTS core.compliance_document_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  document_group text NOT NULL
    CHECK (document_group = ANY (ARRAY['legal','safaricom','banking','registration','corporate'])),
  category_badge text NOT NULL,
  is_verified boolean NOT NULL DEFAULT true,
  href_view text,
  href_download text,
  last_updated date NOT NULL DEFAULT CURRENT_DATE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.compliance_document_catalog IS
  'Published compliance document metadata; document_group drives sectioning in the developer console.';

COMMENT ON COLUMN core.compliance_document_catalog.document_group IS
  'legal | safaricom | banking | registration | corporate';

ALTER TABLE core.compliance_document_catalog ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE core.compliance_document_catalog TO authenticated;

DROP POLICY IF EXISTS compliance_document_catalog_select ON core.compliance_document_catalog;

CREATE POLICY compliance_document_catalog_select ON core.compliance_document_catalog
  FOR SELECT
  TO authenticated
  USING (
    document_group = 'legal'
    OR public.is_developer()
    OR EXISTS (
      SELECT 1
      FROM core.company_members m
      WHERE m.clerk_user_id = (auth.jwt() ->> 'sub')
        AND lower(trim(m.role::text)) IN ('owner', 'super_admin')
    )
  );

INSERT INTO core.compliance_document_catalog (
  slug, title, description, document_group, category_badge, is_verified, href_view, href_download, last_updated, sort_order
) VALUES
  (
    'terms-of-service',
    'Terms of Service',
    'Account responsibilities, subscription rules, payment policy, limitation of liability, and termination rights.',
    'legal',
    'All Users',
    true,
    '/legal/terms-of-service.html',
    '/legal/terms-of-service.html',
    '2026-04-04',
    10
  ),
  (
    'privacy-policy',
    'Privacy Policy',
    'Data collected, usage, storage and security measures, retention periods, and user data rights.',
    'legal',
    'All Users',
    true,
    '/legal/privacy-policy.html',
    '/legal/privacy-policy.html',
    '2026-04-04',
    20
  ),
  (
    'ambassador-agreement',
    'Ambassador Agreement',
    'Commission structure, payment conditions, non-employment clause, fraud prevention, and termination.',
    'legal',
    'Ambassadors',
    true,
    '/legal/ambassador-agreement.html',
    '/legal/ambassador-agreement.html',
    '2026-04-04',
    30
  ),
  (
    'subscription-billing-policy',
    'Subscription & Billing Policy',
    'Manual and STK Push payment rules, renewal policy, expiry and grace periods, and pricing changes.',
    'legal',
    'Subscribers',
    true,
    '/legal/subscription-billing-policy.html',
    '/legal/subscription-billing-policy.html',
    '2026-04-04',
    40
  ),
  (
    'acceptable-use-policy',
    'Acceptable Use Policy',
    'Permitted use, platform misuse rules, prohibited behaviour, abuse prevention, and enforcement actions.',
    'legal',
    'All Users',
    true,
    '/legal/acceptable-use-policy.html',
    '/legal/acceptable-use-policy.html',
    '2026-04-04',
    50
  ),
  (
    'data-processing-agreement',
    'Data Processing Agreement',
    'Data ownership, processing obligations, security measures, subprocessor clause, and compliance.',
    'legal',
    'Business Subscribers',
    true,
    '/legal/data-processing-agreement.html',
    '/legal/data-processing-agreement.html',
    '2026-04-04',
    60
  ),
  (
    'confidentiality-proprietary-information-agreement',
    'Confidentiality & Proprietary Information Agreement',
    'Internal-only: trade secrets (technical, platform, business, analytics, ops, design), obligations, IP, non-compete, non-solicitation, access, security, breach, return/destruction.',
    'legal',
    'Internal · Confidential',
    true,
    '/legal/confidentiality-proprietary-information-agreement.html',
    '/legal/confidentiality-proprietary-information-agreement.html',
    '2026-04-04',
    70
  ),
  (
    'mpesa-c2b-application',
    'M-Pesa C2B Application Form',
    'Safaricom M-Pesa Customer to Business (C2B) integration application.',
    'safaricom',
    'Integration Required',
    true,
    NULL,
    NULL,
    '2026-04-04',
    100
  ),
  (
    'mpesa-business-administrator',
    'M-Pesa Business Administrator Form',
    'Designated business administrator registration for M-Pesa integration.',
    'safaricom',
    'Integration Required',
    true,
    NULL,
    NULL,
    '2026-04-04',
    110
  ),
  (
    'mpesa-account-opening-authorization',
    'M-Pesa Account Opening Authorization Form',
    'Authorization for M-Pesa business account opening linked to FarmVault.',
    'safaricom',
    'Integration Required',
    true,
    NULL,
    NULL,
    '2026-04-04',
    120
  ),
  (
    'ncba-bank-reference-letter',
    'NCBA Bank Reference Letter',
    'Official bank reference letter for FarmVault (NCBA).',
    'banking',
    'Bank Verified',
    true,
    NULL,
    NULL,
    '2026-04-04',
    200
  ),
  (
    'business-registration-certificate-brs',
    'Business Registration Certificate (BRS)',
    'Official business registration certificate (BRS).',
    'registration',
    'Official Registration',
    true,
    NULL,
    NULL,
    '2026-04-04',
    300
  ),
  (
    'farmvault-business-profile',
    'FarmVault Business Profile',
    'FarmVault company profile for partners and institutions.',
    'corporate',
    'Company Profile',
    true,
    NULL,
    NULL,
    '2026-04-04',
    400
  )
ON CONFLICT (slug) DO NOTHING;
