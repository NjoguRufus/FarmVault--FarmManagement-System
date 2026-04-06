-- Point compliance catalog rows at static HTML under /compliance/* (View / Download in app).

UPDATE core.compliance_document_catalog
SET
  href_view = '/compliance/mpesa-c2b-application.html',
  href_download = '/compliance/mpesa-c2b-application.html'
WHERE slug = 'mpesa-c2b-application';

UPDATE core.compliance_document_catalog
SET
  href_view = '/compliance/mpesa-business-administrator.html',
  href_download = '/compliance/mpesa-business-administrator.html'
WHERE slug = 'mpesa-business-administrator';

UPDATE core.compliance_document_catalog
SET
  href_view = '/compliance/mpesa-account-opening-authorization.html',
  href_download = '/compliance/mpesa-account-opening-authorization.html'
WHERE slug = 'mpesa-account-opening-authorization';

UPDATE core.compliance_document_catalog
SET
  href_view = '/compliance/ncba-bank-reference-letter.html',
  href_download = '/compliance/ncba-bank-reference-letter.html'
WHERE slug = 'ncba-bank-reference-letter';

UPDATE core.compliance_document_catalog
SET
  href_view = '/compliance/business-registration-certificate-brs.html',
  href_download = '/compliance/business-registration-certificate-brs.html'
WHERE slug = 'business-registration-certificate-brs';

UPDATE core.compliance_document_catalog
SET
  href_view = '/compliance/farmvault-business-profile.html',
  href_download = '/compliance/farmvault-business-profile.html'
WHERE slug = 'farmvault-business-profile';
