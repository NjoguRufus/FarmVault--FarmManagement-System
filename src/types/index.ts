// FarmVault Type Definitions

export type CropType =
  | 'tomatoes'
  | 'french-beans'
  | 'french_beans'
  | 'capsicum'
  | 'maize'
  | 'watermelons'
  | 'watermelon'
  | 'rice'
  | (string & {});

export type EnvironmentType = 'open_field' | 'greenhouse';

export type UserRole = 'developer' | 'company-admin' | 'manager' | 'broker' | 'employee';

export interface DashboardPermissions {
  view: boolean;
  cards?: {
    cropStage?: boolean;
    revenue?: boolean;
    expenses?: boolean;
    profitLoss?: boolean;
    budget?: boolean;
  };
}

export interface ProjectsPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  accessTabs?: {
    overview?: boolean;
    planning?: boolean;
    expenses?: boolean;
    inventory?: boolean;
    operations?: boolean;
    harvest?: boolean;
    reports?: boolean;
  };
}

export interface PlanningPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
}

export interface InventoryPermissions {
  view: boolean;
  addItem?: boolean;
  editItem?: boolean;
  deleteItem?: boolean;
  restock?: boolean;
  deduct?: boolean;
  categories?: boolean;
  purchases?: boolean;
  viewAudit?: boolean;
}

export interface ExpensesPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  approve?: boolean;
}

export interface OperationsPermissions {
  view: boolean;
  createWorkCard?: boolean;
  assignWork?: boolean;
  recordDailyWork?: boolean;
  approveWorkLog?: boolean;
  markPaid?: boolean;
  viewCost?: boolean;
}

export interface HarvestPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  close?: boolean;
  recordIntake?: boolean;
  viewFinancials?: boolean;
  payPickers?: boolean;
  viewBuyerSection?: boolean;
}

export interface EmployeesPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  deactivate?: boolean;
}

export interface ReportsPermissions {
  view: boolean;
  export?: boolean;
}

export interface SettingsPermissions {
  view: boolean;
  edit?: boolean;
}

export interface NotesPermissions {
  view: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
}

export interface PermissionMap {
  dashboard: DashboardPermissions;
  projects: ProjectsPermissions;
  planning: PlanningPermissions;
  inventory: InventoryPermissions;
  expenses: ExpensesPermissions;
  operations: OperationsPermissions;
  harvest: HarvestPermissions;
  employees: EmployeesPermissions;
  reports: ReportsPermissions;
  settings: SettingsPermissions;
  notes: NotesPermissions;
}

export type PermissionModule = keyof PermissionMap;
export type PermissionPresetKey =
  | 'viewer'
  | 'inventory-clerk'
  | 'finance-clerk'
  | 'operations-staff'
  | 'harvest-intake-staff'
  | 'manager'
  | 'full-access';

export type EmployeeStatus =
  | 'draft'
  | 'invited'
  | 'active'
  | 'suspended'
  | 'archived'
  // Legacy / non-Supabase statuses (Firebase, etc.)
  | 'inactive'
  | 'on-leave';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // Optional fine-grained employee role, e.g. 'operations-manager', 'sales-broker', 'logistics-driver'
  employeeRole?: string;
  companyId: string | null;
  avatar?: string;
  createdAt: Date;
}

export interface Company {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  plan: 'starter' | 'professional' | 'enterprise';
  userCount: number;
  projectCount: number;
  revenue: number;
  /** Custom work types (e.g. "Pruning", "Staking") added by the company */
  customWorkTypes?: string[];
  createdAt: Date;
}

export type NoteCategory =
  | 'timing'
  | 'fertilizer'
  | 'pests-diseases'
  | 'sprays'
  | 'yield'
  | 'general';

export interface LibraryNote {
  id: string;
  cropId: string;
  category: NoteCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  status: 'draft' | 'published';
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CompanyNote {
  id: string;
  companyId: string;
  cropId: string;
  category: NoteCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CompanyNoteShare {
  id: string;
  companyId: string;
  noteId: string;
  cropId: string;
  sharedBy: string;
  sharedAt: unknown;
  visibility: 'visible' | 'hidden';
  pinned: boolean;
}

export interface CropDoc {
  id: string;
  name: string;
  createdAt?: unknown;
}

// --- Records (knowledge/field records by crop) ---
export type RecordCategory =
  | 'Timing'
  | 'Fertilizer'
  | 'Pests & Diseases'
  | 'Sprays'
  | 'Yield'
  | 'General';

export interface LibraryRecord {
  id: string;
  cropId: string;
  category: RecordCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  status: 'draft' | 'published';
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CompanyRecordShare {
  id: string;
  companyId: string;
  recordId: string;
  cropId: string;
  title: string;
  category: RecordCategory;
  highlights: string[];
  tags: string[];
  /** Denormalized for company read-only view */
  content?: string;
  sharedBy: string;
  sharedAt: unknown;
  visibility: 'visible' | 'hidden';
  pinned: boolean;
}

export interface CompanyRecord {
  id: string;
  companyId: string;
  cropId: string;
  category: RecordCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Project {
  id: string;
  name: string;
  companyId: string;
  cropType: CropType;
  cropTypeKey?: string;
  environmentType?: EnvironmentType;
  status: 'planning' | 'active' | 'completed' | 'archived' | 'closed';
  startDate: Date;
  endDate?: Date;
  location: string;
  acreage: number;
  budget: number;
  createdAt: Date;
  plantingDate?: Date;
  startingStageIndex?: number;
  currentStage?: string;
  stageSelected?: string;
  stageAutoDetected?: string;
  stageWasManuallyOverridden?: boolean;
  daysSincePlanting?: number;
  // Optional planning metadata
  seedVariety?: string;
  planNotes?: string;
  /** When false, project doc exists but stages are still being created; show "Creating project..." on list. */
  setupComplete?: boolean;
  /** When true, project uses blocks (multiple planting dates); plantingDate may be omitted. */
  useBlocks?: boolean;
  /** When set, project expenses deduct from this budget pool instead of project.budget. */
  budgetPoolId?: string | null;
  planning?: {
    seed?: {
      name: string;
      variety?: string;
      supplier?: string;
      batchNumber?: string;
    };
    expectedChallenges?: {
      id: string;
      title?: string;
      description: string;
      challengeType?: ChallengeType;
      severity?: 'low' | 'medium' | 'high';
      status?: 'identified' | 'mitigating' | 'resolved';
      addedAt: Date;
      addedBy: string;
    }[];
    planHistory?: {
      field: string;
      oldValue: any;
      newValue: any;
      reason: string;
      changedAt: Date;
      changedBy: string;
    }[];
    /** Optional: stage key from crop template — use when the field is ahead/behind the calendar estimate. */
    manualCurrentStage?: {
      stageKey: string;
      updatedAt?: string;
      reason?: string;
    } | null;
  };
}

export interface CropStage {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  // Generated stage name and index from cropStageConfig
  stageName: string;
  stageIndex: number;
  startDate?: Date;
  endDate?: Date;
  /** Editable planned timeline */
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  /** Editable actual progress */
  actualStartDate?: Date;
  actualEndDate?: Date;
  status: 'pending' | 'in-progress' | 'completed';
  notes?: string;
  recalculated?: boolean;
  recalculatedAt?: Date;
  recalculationReason?: string;
}

/** Stage note (subcollection or top-level); company-scoped. */
export interface StageNote {
  id: string;
  stageId: string;
  projectId: string;
  companyId: string;
  text: string;
  createdAt: unknown;
  createdBy: string;
}

export interface ProjectBlock {
  id: string;
  companyId: string;
  projectId: string;
  blockName: string;
  acreage: number;
  plantingDate: unknown;
  expectedEndDate?: unknown;
  currentStage?: string;
  seasonProgress?: number;
  createdAt: unknown;
}

export interface BudgetPool {
  id: string;
  companyId: string;
  name: string;
  totalAmount: number;
  remainingAmount: number;
  createdAt: unknown;
}

// --- Core Operational / Financial / Inventory Models ---

export type ExpenseCategory =
  | 'labour'
  | 'fertilizer'
  | 'chemical'
  | 'fuel'
  | 'other'
  // Broker market expense categories
  | 'space'
  | 'watchman'
  | 'ropes'
  | 'carton'
  | 'offloading_labour'
  | 'onloading_labour'
  | 'broker_payment';

export interface Expense {
  id: string;
  companyId: string;
  projectId?: string;
  cropType?: CropType;
  harvestId?: string; // For broker expenses linked to a harvest

  category: ExpenseCategory;
  description: string;
  amount: number;
  date: Date;

  // Stage linkage for analytics
  stageIndex?: number;
  stageName?: string;

  // Work log sync metadata
  syncedFromWorkLogId?: string;
  synced?: boolean;

  /** When expense was created from a work card (mark as paid) */
  workCardId?: string;

  // Payment / reconciliation
  paid?: boolean;
  paidAt?: Date;
  paidBy?: string;
  paidByName?: string;

  /** Harvest picker payment batch metadata (source: harvest_wallet_picker_payment) */
  meta?: {
    source?: string;
    harvestCollectionId?: string;
    paymentBatchId?: string;
    pickerIds?: string[];
  };

  createdAt: Date;
}

export const BROKER_EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'space', label: 'Crates Space' },
  { value: 'watchman', label: 'Watchman' },
  { value: 'ropes', label: 'Ropes' },
  { value: 'carton', label: 'Carton' },
  { value: 'offloading_labour', label: 'Offloading Labour' },
  { value: 'onloading_labour', label: 'Onloading Labour' },
  { value: 'broker_payment', label: 'Broker Payment' },
  { value: 'other', label: 'Other' },
];

export type InventoryCategory =
  | 'fertilizer'
  | 'chemical'
  | 'fuel'
  | 'tying-ropes-sacks';

/** Chemical: box (with units per box) or single products */
export type ChemicalPackagingType = 'box' | 'single';

/** Fuel sub-type when category is fuel */
export type FuelType = 'diesel' | 'petrol';

export interface InventoryCategoryItem {
  id: string;
  name: string;
  companyId: string;
  createdAt: Date;
}

export interface InventoryItem {
  id: string;
  companyId: string;

  name: string;
  category: InventoryCategory;

  quantity: number;
  unit: string;
  pricePerUnit?: number;

  // --- Chemical: packaging and total units ---
  /** When category is chemical: 'box' or 'single' */
  packagingType?: ChemicalPackagingType;
  /** When chemical and box: bottles/packets per box. Total units = quantity * unitsPerBox */
  unitsPerBox?: number;

  // --- Fuel: diesel/petrol, containers (mtungi), litres ---
  /** When category is fuel: diesel or petrol */
  fuelType?: FuelType;
  /** Number of containers (mtungi) */
  containers?: number;
  /** Litres (optional) */
  litres?: number;

  // --- Fertilizer: bags, kgs optional ---
  /** When category is fertilizer: primary quantity in bags */
  bags?: number;
  /** Optional weight in kg */
  kgs?: number;

  // --- Wooden boxes (wooden-crates): big, medium, or small ---
  /** When category is wooden-crates: wooden box size for harvest/display */
  boxSize?: 'big' | 'medium' | 'small';

  // Legacy scope fields kept for backwards compatibility.
  // New items should use `cropTypes` instead.
  scope?: 'project' | 'crop' | 'all';
  cropType?: CropType | 'all';
  cropTypes?: CropType[];

  supplierId?: string;
  supplierName?: string;
  /** Date when item was picked up from supplier (e.g. for seeds) */
  pickupDate?: string;
  minThreshold?: number;

  lastUpdated: Date;
  createdAt?: Date;
}

export interface WorkLog {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;

  stageIndex: number;
  stageName: string;

  date: Date;
  workCategory: string;
  // Optional high-level work type, e.g. Spraying, Fertilizer application, etc.
  workType?: string;

  numberOfPeople: number;
  ratePerPerson?: number;
  totalPrice?: number; // Auto-calculated: numberOfPeople * ratePerPerson

  employeeId?: string; // Primary employee assigned (for backward compatibility)
  employeeIds?: string[]; // Multiple employees assigned to manage and deliver this work
  employeeName?: string; // Denormalized for easier display (comma-separated if multiple)

  chemicals?: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
    drumsSprayed?: number;
  };

  fertilizer?: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
  };

  fuel?: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
  };

  notes?: string;
  // Free-text description of inputs used (spraying, fertilizer application, etc.)
  inputsUsed?: string;
  /** When work type is Watering: number of containers used */
  wateringContainersUsed?: number;
  /** When work type is Tying of crops: whether they used ropes or sacks */
  tyingUsedType?: 'ropes' | 'sacks';
  changeReason?: string; // Reason for changing work mid-way

  managerId?: string;
  managerName?: string; // Denormalized manager name for easier display
  adminName?: string;

  paid?: boolean;
  paidAt?: Date;
  paidBy?: string;
  // Admin/manager coordination metadata
  origin?: 'admin' | 'manager'; // Legacy: who created this log (new flow keeps a single log)
  parentWorkLogId?: string; // Legacy: for older manager logs that used a child document
  managerSubmissionStatus?: 'pending' | 'approved' | 'rejected';
  managerSubmittedAt?: Date;
  // Manager-submitted values for confirmation (do NOT change admin's original plan fields)
  managerSubmittedNumberOfPeople?: number;
  managerSubmittedRatePerPerson?: number;
  managerSubmittedTotalPrice?: number;
  managerSubmittedNotes?: string;
  managerSubmittedInputsUsed?: string;
  managerSubmittedWorkType?: string;
  approvedBy?: string;
  approvedByName?: string;

  createdAt: Date;
}

export interface InventoryUsage {
  id: string;
  companyId: string;
  projectId: string;

  inventoryItemId: string;
  category: InventoryCategory;

  quantity: number;
  unit: string;

  source: 'workLog' | 'manual-adjustment' | 'workCard' | 'harvest';
  workLogId?: string;
  workCardId?: string;
  harvestId?: string;
  /** Manager assigned (when source is workCard). */
  managerName?: string;

  stageIndex?: number;
  stageName?: string;

  date: Date;
  createdAt: Date;
}

export interface InventoryPurchase {
  id: string;
  companyId: string;

  inventoryItemId: string;
  quantityAdded: number;
  unit: string;

  totalCost: number;
  pricePerUnit?: number;

  projectId?: string;

  date: Date;
  expenseId?: string;

  createdAt: Date;
}

export interface Harvest {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  date: Date;
  quantity: number;
  unit: string;
  quality: 'A' | 'B' | 'C';
  notes?: string;

  // Destination of this harvest: sold directly from farm or sent to market
  destination?: 'farm' | 'market';

  // Farm-side pricing metadata (optional)
  farmPricingMode?: 'perUnit' | 'total';
  // Unit used for farm pricing: crate types or kg
  farmPriceUnitType?: 'crate-big' | 'crate-medium' | 'crate-small' | 'kg';
  farmUnitPrice?: number;
  farmTotalPrice?: number;

  // Market-side metadata
  marketName?: string;
  brokerId?: string;
  brokerName?: string;
  // Transport to market (can be more than one lorry)
  lorryPlate?: string;
  lorryPlates?: string[];
  driverId?: string;
  driverName?: string;
}

export interface Sale {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  harvestId: string;
  buyerName: string;
  quantity: number;
  // Optional unit for the quantity, e.g. "kg", "crate-big", "crate-small"
  unit?: string;
  unitPrice: number;
  totalAmount: number;
  date: Date;
  status: 'pending' | 'partial' | 'completed' | 'cancelled';
  brokerId?: string; // ID of the broker who made the sale
  amountPaid?: number; // When status is 'partial', amount already paid (remainder = totalAmount - amountPaid)
}

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  /** Combined contact display, derived from contactPerson/phone/location where available */
  contact: string;
  /** DB: contact_person */
  contactPerson?: string;
  /** DB: phone */
  phone?: string;
  email?: string;
  /** DB: location */
  location?: string;
  /** DB: notes */
  notes?: string;
  /** DB: created_by */
  createdBy?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  // Legacy fields kept for backwards-compat only. Do NOT rely on them for new code.
  category?: string;
  categories?: string[];
  rating?: number;
  status?: 'active' | 'inactive';
  reviewNotes?: string;
}

export interface Employee {
  id: string;
  companyId: string;
  name: string;
  fullName?: string;
  email?: string;
  phone?: string;
  contact?: string;
  role?: string | null; // legacy role field
  employeeRole?: string | null;
  department?: string;
  status: EmployeeStatus;
  permissions?: PermissionMap;
  joinDate?: Date | unknown;
  createdAt?: Date | unknown;
  inviteSentAt?: Date | unknown; // when invite email was sent (for status=invited)
  /** When set, the most recent time an invitation email (initial or resend) was sent. */
  inviteLastSentAt?: Date | unknown;
  /** Number of times an invite has been resent (not counting the initial send). */
  inviteResendCount?: number;
  /** Employee id / actor who most recently resent the invite. */
  inviteLastResentBy?: string | null;
  createdBy?: string;
  authUserId?: string;
  avatarUrl?: string;
}

export interface Delivery {
  id: string;
  projectId: string;
  companyId: string;
  harvestId: string;
  driverId?: string; // Employee ID of the driver
  from: string; // Origin location
  to: string; // Destination location
  quantity: number;
  unit: string;
  status: 'pending' | 'in-transit' | 'delivered' | 'cancelled';
  distance?: number; // Distance in km
  fuelUsed?: number; // Fuel used in liters
  startedAt?: Date;
  completedAt?: Date;
  date: Date;
  notes?: string;
  createdAt: Date;
}

export type ChallengeType = 'weather' | 'pests' | 'diseases' | 'prices' | 'labor' | 'equipment' | 'other';

export interface SeasonChallenge {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  title: string;
  description: string;
  /** True when this challenge was saved as a reusable template for future projects. */
  isReusable?: boolean;
  challengeType?: ChallengeType; // Type of challenge (weather, pests, prices, etc.)
  stageIndex?: number; // Link to crop stage
  stageName?: string; // Denormalized stage name
  severity: 'low' | 'medium' | 'high';
  status: 'identified' | 'mitigating' | 'resolved';
  dateIdentified: Date;
  dateResolved?: Date;
  // Detailed resolution information
  whatWasDone?: string; // What actions were taken to resolve
  itemsUsed?: Array<{
    // Either inventoryItemId (if exists in inventory) or itemName (if needs to be purchased)
    inventoryItemId?: string;
    itemName: string; // Name of the item (required)
    category: InventoryCategory; // Category of the item
    quantity: number;
    unit: string;
    needsPurchase?: boolean; // True if item doesn't exist in inventory
  }>;
  plan2IfFails?: string; // Backup plan if current solution fails
  /** Origin marker for planned/pre-season imported challenges */
  source?: string;
  sourcePlanChallengeId?: string;
  createdBy?: string;
  createdByName?: string;
  /** Local snapshot metadata (set by useCollection mapping) */
  pending?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Reusable challenge template (company + crop scoped). */
export interface ChallengeTemplate {
  id: string;
  companyId: string;
  cropType: string;
  title: string;
  description?: string;
  challengeType?: ChallengeType;
  severity?: 'low' | 'medium' | 'high';
  recommendedAction?: string;
  recommendedInput?: string;
  createdBy: string;
  createdAt: unknown;
  updatedAt?: unknown;
}

// Items that need to be purchased (derived from challenges)
export interface NeededItem {
  id: string;
  companyId: string;
  projectId?: string;
  itemName: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  sourceChallengeId?: string; // ID of the challenge that created this need
  sourceChallengeTitle?: string; // Denormalized challenge title
  status: 'pending' | 'ordered' | 'received';
  createdAt: Date;
  updatedAt?: Date;
}

export interface DashboardStats {
  totalExpenses: number;
  totalHarvest: number;
  totalSales: number;
  netBalance: number;
  activeProjects: number;
  pendingOperations: number;
}

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  badge?: string | number;
}

// --- Code Red (urgent developer–admin communication, e.g. data recovery) ---

export type CodeRedStatus = 'open' | 'resolved';

export interface CodeRedRequest {
  id: string;
  companyId: string;
  companyName: string;
  requestedBy: string;   // userId
  requestedByName: string;
  requestedByEmail: string;
  message: string;
  status: CodeRedStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CodeRedMessage {
  id: string;
  from: string;       // userId
  fromName: string;
  fromRole: string;   // 'developer' | 'company-admin' etc.
  body: string;
  createdAt: Date;
}

// --- Operations Work Cards (simplified flow: planned → logged → edited → paid) ---

export type WorkCardStatus = 'planned' | 'logged' | 'edited' | 'paid';

export interface InputUsed {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

export interface EditHistoryEntry {
  timestamp: string;
  actorId: string;
  actorName: string | null;
  changes: Record<string, { oldValue: unknown; newValue: unknown }>;
}

export interface WorkCardPayment {
  isPaid: boolean;
  amount?: number | null;
  method?: 'cash' | 'mpesa' | 'bank' | 'other' | null;
  paidAt?: string | null;
  paidByUserId?: string | null;
  paidByName?: string | null;
  notes?: string | null;
}

export interface OperationsWorkCard {
  id: string;
  companyId: string;
  projectId: string | null;
  stageId: string | null;
  stageName?: string | null;
  blockId?: string | null;
  blockName?: string | null;
  workTitle: string;
  workCategory: string;

  // Planned section
  plannedDate: string | null;
  plannedWorkers: number;
  plannedRatePerPerson: number;
  plannedTotal: number;
  notes: string | null;

  // Actual work section (filled when logged)
  actualDate: string | null;
  actualWorkers: number | null;
  actualRatePerPerson: number | null;
  actualTotal: number | null;
  executionNotes: string | null;
  workDone: string | null;

  // Worker who logged the work
  loggedByUserId: string | null;
  loggedByName: string | null;
  loggedAt: string | null;

  // Allocated worker (who should record work)
  allocatedManagerId: string | null;
  allocatedWorkerName: string | null;

  // Workers involved in the work
  workerIds: string[];
  workerNames: string[];

  // Inputs used (inventory items)
  inputsUsed: InputUsed[];

  // Edit history for transparency
  editHistory: EditHistoryEntry[];

  // Payment info
  payment: WorkCardPayment;

  // Status
  status: WorkCardStatus;

  // Creator info
  createdByAdminId: string;
  createdByAdminName: string | null;
  createdByManagerId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

// --- Field Cash Harvest Collection (French Beans: pickers + weigh + buyer) ---

export type HarvestCollectionStatus = 'collecting' | 'payout_complete' | 'sold' | 'closed';

export interface HarvestCollection {
  id: string;
  companyId: string;
  projectId: string;
  cropType: CropType;
  /** Display name for this collection (e.g. "Morning shift", "Block A") */
  name?: string;

  /** Project-specific forward-only sequence number (internal), used for auto-naming. */
  sequenceNumber?: number;
  harvestDate: Date | unknown;

  /** What pickers earn per kg (KES) */
  pricePerKgPicker: number;
  /** What buyer pays per kg (KES) – set when recording buyer sale */
  pricePerKgBuyer?: number;

  /** Auto: SUM of all pickers' totalKg */
  totalHarvestKg: number;
  /** Auto: SUM of all pickers' totalPay */
  totalPickerCost: number;
  /** Auto: totalHarvestKg * pricePerKgBuyer (when buyer price set) */
  totalRevenue?: number;
  /** Auto: totalRevenue - totalPickerCost */
  profit?: number;

  status: HarvestCollectionStatus;
  /** When buyer payment received */
  buyerPaidAt?: Date | unknown;
  /** Set when this collection has been synced to Harvest Sales (harvest + sale created) */
  harvestId?: string;
  createdAt?: Date | unknown;
}

export interface HarvestPicker {
  id: string;
  companyId: string;
  collectionId: string;

  pickerNumber: number;
  pickerName: string;

  /** Sum of all weigh entries for this picker */
  totalKg: number;
  /** totalKg * pricePerKgPicker (from collection) */
  totalPay: number;

  isPaid: boolean;
  paidAt?: Date | unknown;
  /** When paid as part of a group, links to harvestPaymentBatches doc */
  paymentBatchId?: string;
}

/** Record of a group payment (multiple pickers paid together) */
export interface HarvestPaymentBatch {
  id: string;
  companyId: string;
  collectionId: string;
  pickerIds: string[];
  totalAmount: number;
  paidAt: Date | unknown;
}

export interface PickerWeighEntry {
  id: string;
  companyId: string;
  pickerId: string;
  collectionId: string;

  weightKg: number;
  tripNumber: number;
  /** When user overrides auto trip number, the value we suggested (e.g. 2) so we can show "Trip no 2 changed to 3". */
  suggestedTripNumber?: number;
  recordedAt: Date | unknown;
}
