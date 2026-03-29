/**
 * Canonical PostHog event names. Prefer importing these instead of string literals.
 */
export const AnalyticsEvents = {
  // Auth / tenant
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  COMPANY_CREATED: 'company_created',
  INVITED_USER_JOINED: 'invited_user_joined',
  SUBSCRIPTION_PAGE_VIEWED: 'subscription_page_viewed',
  UPGRADE_STARTED: 'upgrade_started',
  UPGRADE_COMPLETED: 'upgrade_completed',
  TRIAL_STARTED: 'trial_started',

  // Projects
  PROJECT_CREATED: 'project_created',
  PROJECT_VIEWED: 'project_viewed',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_ARCHIVED: 'project_archived',

  // Expenses
  EXPENSE_CREATED: 'expense_created',
  EXPENSE_VIEWED: 'expense_viewed',
  EXPENSE_SYNCED_TO_INVENTORY: 'expense_synced_to_inventory',

  // Inventory
  INVENTORY_ITEM_CREATED: 'inventory_item_created',
  INVENTORY_ITEM_UPDATED: 'inventory_item_updated',
  INVENTORY_STOCK_ADDED: 'inventory_stock_added',
  INVENTORY_STOCK_USED: 'inventory_stock_used',
  INVENTORY_LOW_STOCK_VIEWED: 'inventory_low_stock_viewed',

  // Harvest
  HARVEST_RECORD_CREATED: 'harvest_record_created',
  HARVEST_RECORD_VIEWED: 'harvest_record_viewed',
  HARVEST_COLLECTION_CREATED: 'harvest_collection_created',
  HARVEST_COLLECTION_VIEWED: 'harvest_collection_viewed',
  PICKER_WEIGHT_RECORDED: 'picker_weight_recorded',
  PICKER_PAYMENT_RECORDED: 'picker_payment_recorded',
  BUYER_SETTLEMENT_RECORDED: 'buyer_settlement_recorded',
  COLLECTION_CLOSED: 'collection_closed',

  // Employees / operations
  EMPLOYEE_CREATED: 'employee_created',
  EMPLOYEE_VIEWED: 'employee_viewed',
  WORK_LOG_CREATED: 'work_log_created',
  OPERATION_RECORDED: 'operation_recorded',

  // Suppliers
  SUPPLIER_CREATED: 'supplier_created',
  SUPPLIER_VIEWED: 'supplier_viewed',

  // Reports / exports
  REPORT_VIEWED: 'report_viewed',
  REPORT_EXPORTED_PDF: 'report_exported_pdf',
  REPORT_EXPORTED_EXCEL: 'report_exported_excel',

  // Engagement
  DASHBOARD_VIEWED: 'dashboard_viewed',
  SETTINGS_UPDATED: 'settings_updated',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  SUPPORT_PAGE_VIEWED: 'support_page_viewed',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
