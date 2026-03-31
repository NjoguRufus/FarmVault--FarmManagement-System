## FarmVault Subscription Feature Audit (Basic vs Pro)

Last updated: 2026-03-30

### Goals

- **Basic must stay usable** for core farmer workflow:
  - Create project
  - Record harvest
  - Track expenses
  - Track inputs (inventory)
  - Add employees (**limited**)
  - Record daily work (operations)
  - View **simple reports**
- **Pro features must remain visible but locked** on Basic: 
  - Show lock icon
  - Show Pro badge
  - Clicking opens upgrade prompt (billing modal)
- **Downgrading must not delete data**: restrict access/usage only.

---

## Plan rules (global)

- **Basic limits**
  - **Active projects**: max **2** (`BASIC_LIMITS.maxActiveProjects`)
  - **Employees**: max **3** (`BASIC_LIMITS.maxEmployees`)
- **Pro**
  - Unlimited projects/employees
  - Advanced workflows and analytics

---

## Feature matrix by module

Legend:
- **BASIC**: always available
- **BASIC (LIMITED)**: available, with Basic caps
- **PRO (LOCKED)**: visible but locked on Basic

### Dashboard

- **BASIC**:
  - Company dashboard overview (widgets, progress, activity)
  - Basic financial stats (expense summaries)
  - Inventory overview widgets
- **PRO (LOCKED)** (upsell candidates):
  - Advanced analytics / profit insights cards (where present)

### Projects

- **BASIC**:
  - Create project
  - View/edit/close/reopen project (subject to permissions)
  - Project details + planning pages
- **BASIC (LIMITED)**:
  - Active projects capped at **2**
- **PRO (LOCKED)**:
  - Unlimited projects
  - Multi-block management (blocks-based project structure)

### Crop Monitoring

- **BASIC**:
  - Crop stages (planning / crop stage tracking)
- **PRO (LOCKED)** (future / upsell):
  - Advanced monitoring insights (if/when implemented)

### Season Challenges

- **BASIC**:
  - View challenges
  - Record challenges (where write access allowed)
- **PRO (LOCKED)** (upsell candidates):
  - Advanced templates / reusable challenge workflows
  - Advanced analytics / insights from challenges

### Operations

- **BASIC**:
  - Daily work logging / work cards / approvals (permission-driven)

### Inventory (Inputs)

- **BASIC**:
  - Inventory items, stock tracking
  - Restock/deduct
  - Categories + suppliers

### Harvest

- **BASIC**:
  - Record harvest sessions
  - Record sales (basic)
  - Buyer section (subject to permissions)
- **PRO (LOCKED)** (upsell candidates):
  - Advanced harvest financials and profit charts
  - Exports / analytics views (if/when implemented)

### French Beans Collections (advanced collections workflow)

- **PRO (LOCKED)**:
  - Harvest collections workflow (pickers, weigh-ins, payouts, buyer settlement)
  - Wallet/ledger and picker payments tooling
  - Collection close/sync workflows

### Employees

- **BASIC**:
  - Employee list + roles/permissions (permission-driven)
- **BASIC (LIMITED)**:
  - Max employees capped at **3**
- **PRO (LOCKED)**:
  - Unlimited employees

### Records / Notes (Notebook)

- **BASIC**:
  - Records home (crop notebook)
  - Create/view notes per crop
- **PRO (LOCKED)**:
  - Crop Intelligence tab (insights + advanced tooling)

### Reports

- **BASIC**:
  - View report tiles and basic charts
- **PRO (LOCKED)**:
  - Export reports (Excel/PDF)
  - Advanced analytics / profit charts

### Crop Intelligence

- **PRO (LOCKED)**:
  - Insights / intelligence views for records
  - Advanced editing flows (profiles/challenges/practices/chemicals/timing)

### Developer analytics

- **NOT A SUBSCRIPTION FEATURE**:
  - Developer-only pages are role-gated (`developer`) not plan-gated.

### Billing

- **BASIC**:
  - Billing page entry
  - Upgrade prompt (billing modal)

---

## Pro features that must remain visible but locked

Minimum set (implemented / identified in codebase):

- **French Beans Collections** (`/harvest-collections`, `/staff/harvest-collections`)
- **Crop Intelligence** (Records → Crop → “Crop Intelligence” tab)
- **Export reports** (Reports → Export button)
- **Unlimited projects/employees** (limits messaging + upgrade prompt)

Locked behavior requirements:

- **UI**: lock icon + Pro badge visible
- **Navigation**: do not hide menu items; intercept click → open upgrade prompt
- **Direct URL**: page renders locked overlay (FeatureGate) instead of error/redirect

---

## Central config (requested shape)

This is the canonical “features → tier” mapping (minimum required tier):

```ts
export const features = {
  // Core workflow (Basic)
  basicHarvest: "basic",
  expenses: "basic",
  inventory: "basic",
  operations: "basic",
  recordsNotebook: "basic",
  reportsView: "basic",
  seasonChallenges: "basic",

  // Pro upsell
  advancedHarvest: "pro",
  frenchBeansCollections: "pro",
  exportReports: "pro",
  advancedAnalytics: "pro",
  profitCharts: "pro",
  unlimitedProjects: "pro",
  unlimitedEmployees: "pro",
  multiBlockManagement: "pro",
  cropIntelligence: "pro",
} as const;
```

Source of truth in repo:

- `src/config/featureAccess.ts` (feature rule primitives + Basic limits)
- `src/config/subscriptionFeatureMatrix.ts` (high-level product feature matrix)
- `src/config/lockedProRoutes.ts` (nav-level locked routes)

