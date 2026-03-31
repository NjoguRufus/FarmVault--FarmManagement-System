# Cover Page
FarmVault Farm Management System  
User Manual  
  
Prepared By: Rufus Njogu  
Registered Under: FarmVault Technologies  
Date: March 2026  

# Table of Contents
- [1. Introduction](#1-introduction)
- [2. System Overview](#2-system-overview)
- [3. System Requirements](#3-system-requirements)
- [4. Accessing the System](#4-accessing-the-system)
- [5. Dashboard](#5-dashboard)
- [6. Projects Module](#6-projects-module)
- [7. Crop Monitoring / Crop Stages](#7-crop-monitoring--crop-stages)
- [8. Inventory / Farm Inputs](#8-inventory--farm-inputs)
- [9. Expenses](#9-expenses)
- [10. Employees](#10-employees)
- [11. Operations / Daily Work](#11-operations--daily-work)
- [12. Harvest & Sales](#12-harvest--sales)
- [13. French Beans Harvest Collection](#13-french-beans-harvest-collection)
- [14. Suppliers](#14-suppliers)
- [15. Reports](#15-reports)
- [16. Subscription & Billing](#16-subscription--billing)
- [17. Settings](#17-settings)
- [18. Notifications & Validation](#18-notifications--validation)
- [19. Common User Workflows](#19-common-user-workflows)
- [20. Best Practices](#20-best-practices)
- [21. Troubleshooting](#21-troubleshooting)
- [22. Conclusion](#22-conclusion)

# 1. Introduction
FarmVault is a project-based farm management system designed to help farmers and farm teams keep clear records from planning to harvest. It supports multiple crops and provides dedicated workflows for daily farm work, farm inputs, expenses, employees, and harvest/sales tracking.

**Intended users**
- Farm owners and company admins (primary system managers)
- Farm staff/employees (record daily work and selected modules)
- Managers (operations-focused access where configured)
- Brokers and drivers (limited legacy access; older links redirect to staff workspace)

[Insert Screenshot: Welcome / Landing Page]

# 2. System Overview
FarmVault is organized around **Projects**, which typically represent a season or farm cycle for a specific crop (e.g., Tomatoes, French Beans, Maize). Most modules can be used across all projects, but many pages also support working within a selected active project.

**Core navigation modules (Company workspace)**
- Dashboard
- Projects
- Operations
- Inventory
- Crop Stages
- Expenses
- Harvest (entry point)
- Harvest & Sales (non–French beans / legacy harvest flow)
- Harvest Collections (French beans workflow)
- Suppliers
- Season Challenges
- Employees
- Records (notes/notebook)
- Reports
- Billing & Subscription
- Settings
- Support
- Feedback

**Staff workspace**
Staff users use routes under `/staff/*`, including Dashboard, Operations, Inventory, Harvest & Collections, Expenses, Reports, Support, and Feedback.

**Key system workflow**
- Onboarding creates your company workspace and starts a trial flow (approval may be required depending on workspace status).
- You create one or more Projects (season/crop).
- You record daily work (Operations), farm inputs (Inventory), and spending (Expenses).
- You record harvest and sales (Harvest & Sales) OR use the French Beans Harvest Collections workflow (Pro feature).
- You review progress and finances on the Dashboard and Reports.

[Insert Screenshot: Main Navigation Sidebar]
[Insert Screenshot: Mobile Bottom Navigation + More Drawer]

# 3. System Requirements
**Devices**
- Smartphone, tablet, or computer

**Browsers**
- Modern browser such as Chrome, Edge, Firefox, or Safari (latest versions recommended)

**Internet**
- Internet is required for full functionality and syncing.
- Some actions may display “saved offline / will sync when online” where supported (for example, Harvest and Sales entries can show offline-save messages).

[Insert Screenshot: Browser Compatibility Notice]

# 4. Accessing the System
FarmVault uses an authentication flow with sign-in pages and a protected application area.

**Access flow**
1. Open the FarmVault web application.
2. Select **Sign in** (or go directly to `/sign-in`).
3. Sign in using the available authentication method.
4. After sign-in:
   - If onboarding is required, you are directed to **Onboarding**.
   - If already onboarded, you are directed to the appropriate dashboard/landing page based on your access level.

**Onboarding (first-time company setup)**
1. Go to `/onboarding` after signing in.
2. Enter your **Farm / Company Name** (required).
3. (Optional) Enter a **Company email**.
4. Continue to initialize your trial/subscription setup.
5. Optionally create your first Project from the onboarding screen.

[Insert Screenshot: Sign In Page]
[Insert Screenshot: Onboarding – Create Company]
[Insert Screenshot: Onboarding – Create First Project]

# 5. Dashboard
The Dashboard provides a summary of your farm performance and quick access to common actions. It supports viewing **All Projects** or focusing on one project.

**Project selector**
- At the top of the Dashboard, use the **Project selector** to switch between:
  - **All Projects**, or
  - a specific Project

**Common dashboard information (visibility depends on permissions and plan)**
- Crop stage progress and season timeline (based on planting date and crop timeline)
- Total revenue and total expenses (project-scoped or all-project totals)
- Profit and Loss (Pro feature gate: `profitCharts`)
- Remaining budget
- Recent transactions (sales and expenses)
- Inventory overview
- Recent activities (combined activity logs and administrative alerts when available)

**Guided tour**
- The Dashboard includes a **Take a Tour** button to guide users through main sections.

[Insert Screenshot: Dashboard – Project Selector]
[Insert Screenshot: Dashboard – Stat Cards]
[Insert Screenshot: Dashboard – Inventory Overview]
[Insert Screenshot: Dashboard – Recent Transactions]

# 6. Projects Module
Projects are the foundation of FarmVault. A project typically represents a **farm season** for a specific crop. You can create, view, edit, close, and reopen projects.

## 6.1 Viewing projects
1. Open **Projects**.
2. Review your projects grouped as:
   - **Active Projects**
   - **Closed Projects**
3. Click a project card to open **Project Details**.

[Insert Screenshot: Projects Page]

## 6.2 Creating a project (wizard)
FarmVault uses a step-by-step project creation wizard.

1. On **Projects**, click **Create New or Existing Project**.
2. **Step 1 – Project name & crop**
   - Enter **Project Name** (required).
   - Select **Crop** (from your crop catalog).
   - Select **Environment** (Open Field or Greenhouse where supported by the crop).
3. **Step 2 – Blocks & planting date**
   - Choose one of the following:
     - **Single planting date** (no block management), or
     - **Enable Block Management** (Pro feature: `multiBlockManagement`) to add multiple blocks, each with its own acreage and planting date.
   - FarmVault auto-detects the likely crop stage based on crop + planting date and allows manual stage adjustment.
4. **Step 3 – Details & save**
   - Enter **Location** (optional but recommended).
   - Choose **Budget Type**:
     - Separate Budget, or
     - Link to a Budget Pool (create/select a pool).
   - Enter acreage (auto-summed from blocks when block management is enabled).
   - Save the project.

**Basic plan enforcement**
- Basic plan limits active projects to **2 active projects**. When the limit is reached, FarmVault prompts an upgrade to Pro.

[Insert Screenshot: New Project Wizard – Step 1]
[Insert Screenshot: New Project Wizard – Step 2]
[Insert Screenshot: New Project Wizard – Block Management (Pro)]
[Insert Screenshot: New Project Wizard – Step 3]

## 6.3 Project details (season overview)
Project Details provides:
- Project hero card (key info and shortcuts)
- Season progress timeline and stage editing
- Financial snapshot (expenses split, averages, budget remaining)
- Operations summary (work logs, inventory usage, expenses by category)
- Season challenges panel
- Quick actions and planning preview
- Danger zone (delete project; permissions required)

[Insert Screenshot: Project Details Page]
[Insert Screenshot: Project Financial Snapshot]
[Insert Screenshot: Project Operations Summary]

## 6.4 Closing and reopening a project
1. On a project card, open the actions menu.
2. Select **Close Project** (moves it to Closed Projects).
3. To resume, select **Reopen Project**.

[Insert Screenshot: Close Project Confirmation]
[Insert Screenshot: Closed Projects Section]

# 7. Crop Monitoring / Crop Stages
The Crop Stages module helps you track crop growth stages using planting date and a crop timeline template.

## 7.1 Viewing crop stages
1. Open **Crop Stages**.
2. Select a Project (if none is selected).
3. Review the **Stage Timeline**, including:
   - Day range (e.g., Day 0–14)
   - Status (pending, in progress, completed)
   - Estimated end date (where available)

If the project has no planting date, FarmVault will prompt you to set one (in Project Details or Planning).

[Insert Screenshot: Crop Stages Page]

## 7.2 Editing and completing a stage
1. Click a stage on the timeline.
2. Use the stage editor (where available).
3. If the stage is **in progress**, you can mark it complete (only the current stage can be completed).

[Insert Screenshot: Stage Edit Modal]

## 7.3 Recording season challenges from stages
1. Open a stage.
2. Select **Add Challenge**.
3. Enter:
   - Challenge type (weather, pests, diseases, prices, labor, equipment, other)
   - Title, description
   - Severity (low/medium/high)
4. Save the challenge.

[Insert Screenshot: Add Season Challenge Form]

# 8. Inventory / Farm Inputs
The Inventory module tracks your farm inputs and stock levels, including stock in/out and usage.

## 8.1 Viewing inventory
1. Open **Inventory**.
2. Use filters to search by:
   - Name search
   - Category
   - Supplier
   - Stock status (OK, Low, Out)
3. Review inventory stats:
   - Total items
   - Low stock count
   - Out of stock count
   - Total inventory value (where available)

[Insert Screenshot: Inventory Page]
[Insert Screenshot: Inventory Filters]

## 8.2 Adding an inventory item
1. Click **Add Item** (requires inventory permissions).
2. Fill in item details (category, supplier, unit, and other required fields in the modal).
3. Save.

[Insert Screenshot: Add Inventory Item Modal]

## 8.3 Recording stock in
1. Open an item (table row or item drawer).
2. Select **Record Stock In**.
3. Enter quantity and supplier details if required.
4. Save.

[Insert Screenshot: Record Stock In Modal]

## 8.4 Recording usage (inputs used)
1. Open an item.
2. Select **Record Usage**.
3. Select the relevant project (when applicable).
4. Enter quantity used and save.

[Insert Screenshot: Record Usage Modal]

## 8.5 Inventory audit (history)
Where enabled, Inventory Audit shows change history and supports restoring archived items (based on permissions).

[Insert Screenshot: Inventory Audit Drawer]

# 9. Expenses
Expenses allows you to record and analyze farm spending. The page supports filtering, charts, and expense entry.

## 9.1 Viewing expenses
1. Open **Expenses**.
2. Choose a project (recommended) to view expenses for that project.
3. Use filters:
   - Search (description/category)
   - Category filter
   - Date range
4. Review summary cards and charts.

[Insert Screenshot: Expenses Page]
[Insert Screenshot: Expenses Filters]
[Insert Screenshot: Expenses Charts]

## 9.2 Adding an expense
1. Select a Project (expenses require a project context).
2. Click **Add Expense**.
3. Enter:
   - Description
   - Amount (KES)
   - Category (Labour, Fertilizer, Chemical, Fuel, or Custom)
4. Save.

[Insert Screenshot: Add Expense Form]

## 9.3 Labour expenses from Operations work logs
Where enabled by permissions:
- Users can open **Labour Expenses** to view unpaid work logs and mark them as paid, which creates corresponding labour expense records.

[Insert Screenshot: Labour Expenses (Unpaid Work Logs)]

## 9.4 French beans picker payouts in Expenses
When picker payments are recorded in the French beans workflow, Expenses can display payout rows and allow viewing payout details per collection (picker breakdown, kg, amounts paid).

[Insert Screenshot: Picker Payout Detail Drawer]

## 9.5 Exporting expenses
The Expenses page includes an export action that exports expense rows to an Excel file when the user has export permission.

[Insert Screenshot: Export Expenses Button]

# 10. Employees
Employees allows company admins (and permitted roles) to manage team members and their access.

## 10.1 Viewing employees
1. Open **Employees**.
2. Search and filter by role/status where available.
3. Open an employee record to view details.

[Insert Screenshot: Employees Page]

## 10.2 Adding an employee
1. Click **Add Employee** (permission required).
2. Enter the employee’s:
   - Name
   - Role (e.g., operations manager, sales broker, driver, etc. where configured)
   - Department (optional)
   - Contact/phone (optional)
3. Set permissions (FarmVault supports role presets and custom permissions depending on employee storage/provider).
4. Save.

[Insert Screenshot: Add Employee Form]
[Insert Screenshot: Permission Editor]

## 10.3 Editing employee roles and permissions
1. Open an employee record.
2. Select **Edit**.
3. Update role, department, status, and permissions as needed.
4. Save changes.

[Insert Screenshot: Edit Employee Modal]

## 10.4 Employee limits (Basic vs Pro)
- Basic plan limits employees to **3 employees**. When the limit is reached, FarmVault prompts an upgrade to Pro.

[Insert Screenshot: Employee Limit Upgrade Prompt]

# 11. Operations / Daily Work
Operations is used to plan work, assign tasks, log work completed, and track operational activity.

FarmVault provides two main experiences:
- **Operations Dashboard** (company/admin view)
- **Operations (Staff)** (employee view)

## 11.1 Operations Dashboard (company/admin)
1. Open **Operations**.
2. Review the Operations Dashboard:
   - Today’s work
   - Planned / Logged / Paid work counts
   - Active workers today
   - Items used today (inventory usage)
   - Recent activity feed and alerts
3. Use filters to search work cards by status and project.
4. Click **Plan Work** to create a work plan (permission required).
5. Open a work card to view details in the drawer and update status as applicable.

[Insert Screenshot: Operations Dashboard]
[Insert Screenshot: Plan Work Modal]
[Insert Screenshot: Work Card Drawer]

## 11.2 Operations (Staff)
1. Open **Operations** in the staff workspace.
2. Use tabs:
   - **Assigned**: planned tasks assigned to the employee
   - **History**: work logged by the employee
3. For assigned tasks, select **Record Work** to record completion.
4. Use **Log Work** to record work even when it was not pre-planned (permission required).

[Insert Screenshot: Staff Operations Page]
[Insert Screenshot: Record Work Modal]
[Insert Screenshot: Log Work Modal]

# 12. Harvest & Sales
Harvest & Sales is used to record harvest quantities and sales. Behavior varies by crop and destination.

## 12.1 Key concepts
- **Harvest**: quantity harvested (e.g., kg or crates depending on crop and configuration)
- **Destination**:
  - Farm (sold from farm / farm gate)
  - Market (going to market)
- **Sales**: buyer details, quantities, prices, and payment status

[Insert Screenshot: Harvest & Sales Page]

## 12.2 Recording a harvest
1. Open **Harvest & Sales**.
2. Select a project.
3. Click **Record Harvest**.
4. Enter quantity and details:
   - Tomatoes: supports recording harvest in **kg** or **wooden crates** (crate types are selected from Inventory)
   - Other crops: quantity + unit, and quality grades (A/B/C) where applicable
5. For market destination (tomatoes), record market details such as market, broker (optional), driver and lorry plates.
6. Save.

Notes:
- When recording tomatoes in crates, FarmVault may deduct wooden crates from inventory if configured and a crate inventory item is selected.
- For farm gate sales with pricing (including French beans pricing on harvest records), FarmVault can create a sale record automatically based on the pricing provided.

[Insert Screenshot: Record Harvest Form]
[Insert Screenshot: Market Destination Details]

## 12.3 Recording a sale
Sales entry is available where the user has permission to view buyer/sales sections.

1. Select a project.
2. Click **Add Sale** (availability depends on crop and permissions).
3. Select the harvest record (for market-bound harvest where required).
4. Enter buyer name, quantity, pricing, and status (pending/partial/completed/cancelled).
5. Save.

[Insert Screenshot: Add Sale Form]

## 12.4 Viewing harvest details
- Selecting a harvest row opens the harvest detail page (e.g., `/harvest-sales/harvest/:harvestId`).

[Insert Screenshot: Harvest Details Page]

# 13. French Beans Harvest Collection
FarmVault provides a specialized **French beans collection workflow** centered on daily collections, picker intake, and picker payouts.

**Important:** This workflow is a **Pro feature** (`frenchBeansCollections`). Basic users will see locked access and an upgrade prompt where applicable.

## 13.1 When the Collections workflow is used
- The application uses a crop-aware harvest entry point:
  - For **French Beans**, the system routes to **Harvest Collections**.
  - For other crops, it routes to **Harvest & Sales**.

[Insert Screenshot: Harvest Entry Routing (French Beans)]

## 13.2 Collections overview (list)
1. Open **Harvest Collections** (or open Harvest and select **Harvest Collections** where available).
2. Select a project (optional route supports `/harvest-collections/:projectId?`).
3. Review collection cards/list including date, total kg, and pickers count (based on access).

[Insert Screenshot: Harvest Collections Page]

## 13.3 Creating a collection
Where permitted:
1. Select **Create/New Collection** (label may vary based on the current UI mode).
2. Set the collection date/name as prompted.
3. Save to open the collection and begin intake.

[Insert Screenshot: Create Harvest Collection]

## 13.4 Picker intake (weighing)
1. Open a collection.
2. Go to **Intake**.
3. Add/choose a picker, then record weight entries (kg). Intake can include multiple trips per picker.
4. Save intake entries.

FarmVault may show confirmations for unusual weights (e.g., unusually high crate weights) to reduce data entry mistakes.

[Insert Screenshot: Picker Intake Screen]

## 13.5 Paying pickers
1. Open a collection.
2. Go to **Pay**.
3. Review calculated totals per picker:
   - Total kg recorded
   - Total pay due (based on picker price/kg and recorded kg)
   - Paid amounts (financial visibility depends on permissions)
4. Use batch pay actions where available (e.g., mark pickers paid in batch).

[Insert Screenshot: Picker Payments Screen]

## 13.6 Buyer price, closing a collection, and financials
Where permitted:
1. Open a collection.
2. Go to **Buyer** section.
3. Enter buyer price per kg.
4. Close the collection where applicable.

Closing can trigger synchronization of closed collections into harvest/sale representations used by other parts of the system.

[Insert Screenshot: Buyer Price & Close Collection]

## 13.7 Collection management (rename/transfer)
Where permitted:
- Rename a collection (audit logged)
- Transfer a collection to another project (admin-only capability)

[Insert Screenshot: Rename Collection Modal]
[Insert Screenshot: Transfer Collection Modal]

# 14. Suppliers
Suppliers helps you manage supplier contacts and link them to inventory items.

## 14.1 Viewing suppliers
1. Open **Suppliers**.
2. Search suppliers by name, email, contact, or category.
3. Filter by category and switch between list and card view.

[Insert Screenshot: Suppliers Page]

## 14.2 Adding a supplier
1. Click **Add Supplier**.
2. Enter name, contact, (optional) email.
3. Select one or more categories (Seeds, Fertilizers, Pesticides, Equipment).
4. Save.

[Insert Screenshot: Add Supplier Form]

## 14.3 Supplier details, review, and linked items
1. Open a supplier.
2. Review contact details and categories.
3. Optionally add a rating and notes for internal reference.
4. Review linked inventory items associated with the supplier.

[Insert Screenshot: Supplier Details Drawer]

# 15. Reports
Reports provides a report hub and export entry points (availability depends on permissions and subscription access).

**Report types shown in the system**
- Expenses Report
- Harvest Report
- Sales Report
- Operations Report

**Export behavior**
- Where the Export button is available, FarmVault checks plan access (e.g., Pro for `exportReports`) and may open an upgrade prompt if the feature is locked.

Note: The Reports page displays charts; some report visualizations use sample/mock datasets in the current UI implementation.

[Insert Screenshot: Reports Page]
[Insert Screenshot: Report Types Cards]
[Insert Screenshot: Export Report Button (Locked/Unlocked)]

# 16. Subscription & Billing
FarmVault supports Basic and Pro tiers and includes subscription status checks, trial handling, and a billing page with payment submission history.

## 16.1 Basic vs Pro (system-enforced restrictions)
The system uses a feature matrix and gates access using lock overlays and upgrade prompts.

**Known enforced limits (Basic plan)**
- Maximum active projects: **2**
- Maximum employees: **3**

**Known Pro-gated features (examples present in the system)**
- French beans harvest collections workflow (`frenchBeansCollections`)
- Export reports (`exportReports`)
- Advanced analytics and charts (`advancedAnalytics`, `profitCharts`)
- Unlimited projects/employees and multi-block management (`unlimitedProjects`, `unlimitedEmployees`, `multiBlockManagement`)
- Crop intelligence (`cropIntelligence`) where implemented

## 16.2 Locked routes and locked content
- Some Pro features remain visible in navigation but show a lock badge and open an upgrade prompt when clicked.
- Example: **Harvest Collections** can be route-locked for Basic users.

[Insert Screenshot: Pro Lock Overlay (FeatureGate)]
[Insert Screenshot: Locked Navigation Item]

## 16.3 Billing page
1. Open **Billing**.
2. Review your subscription status:
   - Active, Trial, Pending approval, Pending payment, Expired, etc.
3. Select plan and billing cycle (Monthly / Seasonal / Annual where configured).
4. Follow payment instructions and submit required payment details.
5. Review payment submission history and statuses (e.g., Approved, Rejected, Pending review).

[Insert Screenshot: Billing Page – Subscription Status]
[Insert Screenshot: Billing Page – Plan Selector]
[Insert Screenshot: Billing Page – Payment History]

# 17. Settings
Settings includes profile settings, notification settings, app lock/quick unlock settings, and company settings (editable by company admins/developers).

## 17.1 Profile settings
1. Open **Settings**.
2. Update your name (displayed across the app).
3. Upload or remove a profile photo (avatar).
4. Save.

[Insert Screenshot: Settings – Profile]

## 17.2 Guided tour
Settings includes a **Take a Tour** action to guide users through major pages.

[Insert Screenshot: Settings – Take a Tour]

## 17.3 Notifications and quick unlock
Settings includes:
- Notification settings
- Quick unlock / app lock configuration (availability may depend on plan)

[Insert Screenshot: Notification Settings]
[Insert Screenshot: Quick Unlock / App Lock Settings]

## 17.4 Company settings
Company admins can update:
- Farm / company name
- Company email
- Plan/status fields (where shown)

[Insert Screenshot: Company Settings]

## 17.5 Danger zone (delete all company data)
For authorized users, Settings contains a section to delete all company data (irreversible). It requires typing `DELETE` and may require an environment-configured password.

[Insert Screenshot: Settings – Danger Zone]

# 18. Notifications & Validation
FarmVault provides clear user feedback through:
- Toast notifications (success/error)
- Inline form validation messages
- Confirmation dialogs for critical actions (e.g., closing projects, deleting items, deleting company data)

**Common examples**
- “Project closed” or “Couldn’t close this project. Try again.”
- “Expense added.” or “Failed to add expense.”
- “Permission denied” messages when a user lacks access
- Locked Pro overlays prompting upgrade

[Insert Screenshot: Toast Notification – Success]
[Insert Screenshot: Toast Notification – Error]
[Insert Screenshot: Confirmation Dialog]

# 19. Common User Workflows
This section provides end-to-end workflows aligned with the implemented system pages and actions.

## 19.1 Creating a project
1. Open **Projects**.
2. Select **Create New or Existing Project**.
3. Complete the wizard (Crop → Blocks/Planting date → Details).
4. Save and open the Project Details page.

[Insert Screenshot: Create Project Workflow]

## 19.2 Adding inputs (inventory item) and recording usage
1. Open **Inventory**.
2. Click **Add Item** and save the item.
3. Open the item and select **Record Stock In** to add stock.
4. Select **Record Usage** to record inputs used for the active project.

[Insert Screenshot: Inventory – Add Item]
[Insert Screenshot: Inventory – Stock In]
[Insert Screenshot: Inventory – Usage]

## 19.3 Recording an expense
1. Select an active project from the top project selector (recommended).
2. Open **Expenses**.
3. Click **Add Expense**, enter details, and save.

[Insert Screenshot: Add Expense Workflow]

## 19.4 Adding an employee
1. Open **Employees**.
2. Click **Add Employee**.
3. Assign role/department and set permissions.
4. Save and confirm the employee appears in the list.

[Insert Screenshot: Add Employee Workflow]

## 19.5 Logging operations (daily work)
**Company/admin**
1. Open **Operations**.
2. Click **Plan Work** to create work cards.

**Staff**
1. Open **Operations** in staff workspace.
2. Record assigned work or log work directly.

[Insert Screenshot: Operations – Plan Work]
[Insert Screenshot: Operations – Record Work]

## 19.6 Recording harvest and sales
1. Open **Harvest** or **Harvest & Sales**.
2. Record harvest quantity.
3. If applicable, record market details or farm pricing.
4. Add sales records where enabled.

[Insert Screenshot: Record Harvest Workflow]
[Insert Screenshot: Add Sale Workflow]

## 19.7 Using French beans harvest collections
1. Select a French Beans project.
2. Open **Harvest Collections**.
3. Create or select a collection.
4. Record picker intake (weights).
5. Pay pickers and set buyer price, then close collection where applicable.

[Insert Screenshot: French Beans Collections Workflow]

## 19.8 Viewing reports
1. Open **Reports**.
2. Choose a report type.
3. Use Export (if enabled); if locked, upgrade may be required.

[Insert Screenshot: Reports Workflow]

# 20. Best Practices
- Keep projects separate by season and crop to maintain clean records.
- Set planting dates early so Crop Stages and timelines are meaningful.
- Use Inventory categories and suppliers consistently for easy filtering.
- Record work and expenses daily to avoid missing transactions.
- For French beans, record picker intake as it happens to reduce errors.
- Review Dashboard totals weekly (revenue, expenses, budget remaining).
- Close finished projects instead of deleting them to preserve history.

[Insert Screenshot: Best Practices Callout]

# 21. Troubleshooting
## 21.1 “Select a project first”
**Cause:** Some actions (such as adding expenses or certain harvest/sales entries) require an active project.  
**Fix:** Use the project selector (top bar) to select a project, then retry.

## 21.2 “Permission denied”
**Cause:** Your role/permissions do not allow the action (e.g., creating employees, exporting reports).  
**Fix:** Contact your company admin to adjust permissions in **Employees** or assign an appropriate role preset.

## 21.3 Pro feature locked
**Cause:** You are on Basic plan and tried to access a Pro feature (e.g., French beans harvest collections, exports, advanced analytics).  
**Fix:** Open **Billing** and upgrade to Pro, or ask the company admin to upgrade.

## 21.4 “No company context available” or company data not loading
**Cause:** Company membership/session mismatch or the company is not selected/available.  
**Fix:** Sign out and sign in again. If it persists, contact support and confirm your account is attached to the correct company workspace.

## 21.5 Offline saving messages
**Cause:** Your internet connection is unstable.  
**Fix:** Keep the page open and reconnect to the internet; FarmVault will sync when online where supported.

## 21.6 Cannot see Sales details
**Cause:** Sales and buyer details can be restricted by permissions.  
**Fix:** Ask your company admin to enable the necessary harvest permissions for your role.

[Insert Screenshot: Common Error Toasts]

# 22. Conclusion
This user manual documents the FarmVault modules and workflows as implemented in the application routes, pages, and system gating. For additional assistance, use **Support** and **Feedback**, and consult **Billing** for subscription activation or upgrades.

[Insert Screenshot: Support Page]
