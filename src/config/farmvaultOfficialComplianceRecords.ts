/**
 * FarmVault official compliance / institutional document master record.
 * Use {@link maskNationalIdDigits} (or {@link FARMVAULT_OFFICIAL_MASTER_DISPLAY}) for any UI or
 * customer-facing surface; keep full identifiers server-side or in sealed ops flows only.
 */

/** NCBA brand blue (approx). */
export const NCBA_BLUE = '#003A8F' as const;
/** Safaricom form header grey. */
export const SAFARICOM_FORM_HEADER_GREY = '#E5E5E5' as const;
export const FORM_DIVIDER_GREY = '#CFCFCF' as const;

export const FARMVAULT_OFFICIAL_BRAND = {
  colors: {
    farmVaultGreen: '#0B3D2E',
    accentGold: '#D4AF37',
    darkBackground: '#071A12',
    textWhite: '#FFFFFF',
    divider: '#E5E7EB',
  },
  typography: {
    headings: 'Serif display (Playfair-like)',
    body: 'Inter / Arial',
    forms: 'Arial',
    certificates: 'Times New Roman',
  },
  logo: {
    description:
      'Circular dark background, gold shield, farm house icon, vault wheel bottom, white “FarmVault” text',
    background: 'transparent' as const,
  },
} as const;

export const FARMVAULT_MASTER_PARTY = {
  ownerFullName: 'Felix Rufus Mwathi Njogu',
  businessLegalName: 'FarmVault Technologies',
  businessEmail: 'farmvaultke@gmail.com',
  adminEmail: 'njogurufus01@gmail.com',
  phone: '0714747299',
  nationalIdDigits: '89300286',
  dateOfBirthDisplay: '30/01/2005',
  bankName: 'NCBA Bank',
  bankBranch: 'Kenyatta Avenue',
  accountNumber: '1008751901',
  location: 'Nairobi, Kenya',
  industry: 'Agricultural Technology (AgriTech)',
} as const;

/**
 * Masks a numeric ID for display (e.g. national ID). Shows first 2 and last 2 digits; middle replaced with asterisks.
 */
export function maskNationalIdDigits(raw: string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length || 4);
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  const middleLen = Math.max(3, digits.length - 4);
  return `${head}${'*'.repeat(middleLen)}${tail}`;
}

export const BUSINESS_REGISTRATION_CERTIFICATE = {
  layout: {
    paper: 'A4 portrait',
    font: 'Serif (Times-like)',
    textColor: '#000000',
    structure: 'Vertical certificate',
    coatOfArms: 'Kenya coat of arms top right',
    signature: 'Registrar signature bottom',
    barcode: 'Barcode centered',
  },
  businessName: FARMVAULT_MASTER_PARTY.businessLegalName,
  owner: FARMVAULT_MASTER_PARTY.ownerFullName,
  businessNumber: 'BN-MJS7Y2LD',
  addressLines: [
    '4th Floor, Ground Room',
    '4 FarmVault',
    'General Mathenge',
    'Nairobi Westlands District Kilimani',
    'P.O Box 00100-00100',
    'Nairobi',
  ],
  registrationDateDisplay: 'Wednesday, 11 March 2026',
  jurisdiction: 'Republic of Kenya',
  authority: 'Registration of Business Names Act',
} as const;

export const NCBA_BANK_REFERENCE_LETTER = {
  layout: {
    paper: 'A4 portrait',
    headerLogo: 'NCBA logo right',
    accentColor: NCBA_BLUE,
    font: 'Arial / Corporate Sans',
    signature: 'Signature bottom',
    stamp: 'Official stamp bottom',
    textColor: '#000000',
    dividerColor: '#E5E7EB',
  },
  bankName: 'NCBA Bank Kenya PLC',
  accountName: FARMVAULT_MASTER_PARTY.businessLegalName,
  accountNumber: FARMVAULT_MASTER_PARTY.accountNumber,
  branch: FARMVAULT_MASTER_PARTY.bankBranch,
  bankCode: '07000',
  swiftCode: 'CBAFKENX',
  dateDisplay: '31st March 2026',
  recipient: 'Safaricom Kenya PLC',
  purpose: 'Bank reference for M-Pesa Paybill',
  keyStatement:
    'Judging from operations of the accounts, we consider them good for normal business engagement.',
} as const;

export const MPESA_CUSTOMER_TO_BUSINESS_FORM = {
  layout: {
    paper: 'A4 portrait',
    headerColor: SAFARICOM_FORM_HEADER_GREY,
    font: 'Arial',
    gridLines: 'Form grid lines',
    checkboxes: 'Checkbox styling',
    textColor: '#000000',
    dividerColor: FORM_DIVIDER_GREY,
  },
  businessName: FARMVAULT_MASTER_PARTY.businessLegalName,
  industry: FARMVAULT_MASTER_PARTY.industry,
  email: FARMVAULT_MASTER_PARTY.businessEmail,
  purposeReceiving: 'Receiving payment subscriptions from system',
  purposeDisbursement: 'Making payments to employees',
  contactPerson: 'Felix Rufus Njogu Mwathi',
  contactEmail: FARMVAULT_MASTER_PARTY.adminEmail,
  telephone: FARMVAULT_MASTER_PARTY.phone,
  adminName: FARMVAULT_MASTER_PARTY.ownerFullName,
  nationalIdDigits: FARMVAULT_MASTER_PARTY.nationalIdDigits,
  dateOfBirthDisplay: FARMVAULT_MASTER_PARTY.dateOfBirthDisplay,
  bankName: FARMVAULT_MASTER_PARTY.bankName,
  bankBranch: FARMVAULT_MASTER_PARTY.bankBranch,
  accountNumber: FARMVAULT_MASTER_PARTY.accountNumber,
} as const;

export const MPESA_BUSINESS_ADMINISTRATOR_FORM = {
  layout: {
    paper: 'A4 portrait',
    header: 'Safaricom header',
    tableGrid: 'Table grid',
    checkboxes: 'Checkbox fields',
    font: 'Arial',
  },
  organizationName: FARMVAULT_MASTER_PARTY.businessLegalName,
  preferredAdminUsername: 'Felix',
  firstName: 'Felix',
  lastName: 'Njogu Mwathi',
  nationality: 'Kenyan',
  idType: 'National ID',
  nationalIdDigits: FARMVAULT_MASTER_PARTY.nationalIdDigits,
  dateOfBirthDisplay: FARMVAULT_MASTER_PARTY.dateOfBirthDisplay,
  email: FARMVAULT_MASTER_PARTY.adminEmail,
} as const;

export const MPESA_ACCOUNT_OPENING_AUTHORIZATION_FORM = {
  layout: {
    paper: 'A4 portrait',
    font: 'Arial',
  },
  organization: FARMVAULT_MASTER_PARTY.businessLegalName,
  authorizedPerson: FARMVAULT_MASTER_PARTY.ownerFullName,
  purpose: 'To receive payments',
  bankName: FARMVAULT_MASTER_PARTY.bankName,
  bankBranch: FARMVAULT_MASTER_PARTY.bankBranch,
  accountName: FARMVAULT_MASTER_PARTY.businessLegalName,
  accountNumber: FARMVAULT_MASTER_PARTY.accountNumber,
  authorizedSignatory: FARMVAULT_MASTER_PARTY.ownerFullName,
  dateDisplay: '31/03/2026',
} as const;

export const FARMVAULT_BUSINESS_PROFILE = {
  companyName: FARMVAULT_MASTER_PARTY.businessLegalName,
  industry: FARMVAULT_MASTER_PARTY.industry,
  businessType: 'Sole Proprietorship',
  location: FARMVAULT_MASTER_PARTY.location,
  about: `FarmVault is a smart farm management platform designed to help farmers and agribusinesses manage their operations efficiently. The system enables users to track farm activities, monitor expenses, record harvests, manage labor, and generate reports to improve decision-making and profitability.`,
  servicesOffered: [
    'Farm Management Software',
    'Harvest Recording & Tracking',
    'Labor & Picker Payment Management',
    'Expense & Budget Tracking',
    'Inventory Management',
    'Crop Stage Monitoring',
    'Reports & Analytics',
    'Subscription-based Farm Management Platform',
  ],
} as const;

/** Canonical bundle for generators (PDF/HTML). Contains full national ID — do not render to public UI without masking. */
export const FARMVAULT_OFFICIAL_COMPLIANCE_MASTER = {
  brand: FARMVAULT_OFFICIAL_BRAND,
  party: FARMVAULT_MASTER_PARTY,
  businessRegistrationCertificate: BUSINESS_REGISTRATION_CERTIFICATE,
  ncbaBankReferenceLetter: NCBA_BANK_REFERENCE_LETTER,
  mpesaCustomerToBusinessForm: MPESA_CUSTOMER_TO_BUSINESS_FORM,
  mpesaBusinessAdministratorForm: MPESA_BUSINESS_ADMINISTRATOR_FORM,
  mpesaAccountOpeningAuthorizationForm: MPESA_ACCOUNT_OPENING_AUTHORIZATION_FORM,
  businessProfile: FARMVAULT_BUSINESS_PROFILE,
} as const;

export type FarmvaultOfficialComplianceMaster = typeof FARMVAULT_OFFICIAL_COMPLIANCE_MASTER;

/** Same structure as master forms but national ID fields are masked for dashboards and previews. */
export const FARMVAULT_OFFICIAL_MASTER_DISPLAY = {
  ...FARMVAULT_OFFICIAL_COMPLIANCE_MASTER,
  party: {
    ...FARMVAULT_MASTER_PARTY,
    nationalIdDigits: maskNationalIdDigits(FARMVAULT_MASTER_PARTY.nationalIdDigits),
  },
  mpesaCustomerToBusinessForm: {
    ...MPESA_CUSTOMER_TO_BUSINESS_FORM,
    nationalIdDigits: maskNationalIdDigits(FARMVAULT_MASTER_PARTY.nationalIdDigits),
  },
  mpesaBusinessAdministratorForm: {
    ...MPESA_BUSINESS_ADMINISTRATOR_FORM,
    nationalIdDigits: maskNationalIdDigits(FARMVAULT_MASTER_PARTY.nationalIdDigits),
  },
} as const;
