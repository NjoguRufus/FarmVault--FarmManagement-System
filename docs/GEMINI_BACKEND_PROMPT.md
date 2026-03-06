# Prompt to Give Gemini: Generate FarmVault Backend (Firebase)

Copy the block below and paste it into Gemini when you want it to generate or extend the FarmVault backend.

---

## Copy from here ▼

**Context:** I'm building **FarmVault**, a farm management web app. I need you to design/generate the **backend** using **Firebase**. Here’s what the app does and what I already have.

### What FarmVault does
- **Multi-tenant:** Companies own projects, employees, harvests, inventory, expenses, and sales.
- **Core entities:** Companies, Users (roles: company-admin, manager, employee, developer), Projects, Project Stages, Work Logs, Harvests (with collections, pickers, weigh entries, payment batches), Inventory (items, categories, purchases, usage), Expenses, Sales, Suppliers, Employees, Deliveries.
- **Special features:** Harvest cash pools/wallets, project wallet ledger (append-only), audit logs, inventory audit logs, code-red (developer–admin messaging), platform expenses, developer backups.
- **Needs:** Real-time sync and offline support for field use; company-scoped security; storage for photos (crops, equipment); optional sensor/quick-update flows.

### Firebase stack I want to use
- **Cloud Firestore** – main app data (hierarchical, complex queries, real-time, offline). Use for: companies, users, projects, stages, work logs, harvests, inventory, expenses, sales, employees, audit logs, etc.
- **Realtime Database** – only where rapid sync of small, frequently changing state is critical (e.g. live sensor readings, simple presence/status). Prefer Firestore for most features.
- **Firebase Data Connect (PostgreSQL/Cloud SQL)** – for relational reporting, financial transactions, or complex joins if we need them later. Optional for now.
- **Cloud Storage for Firebase** – user-generated files: crop photos, equipment images, documents. Paths should be company- or user-scoped.
- **Cloud Functions** – server-side logic: backups, notifications, aggregations, webhooks, or anything that must run in a trusted environment.

### What I need from you
1. **Data model**
   - Firestore: list collections and their main fields (and whether they have `companyId` for multi-tenancy). Keep the same security model: documents are company-scoped; only developer role can access cross-company or developer-only collections.
   - If using Realtime Database: describe which paths and structure (e.g. `/sensorReadings/{companyId}/{projectId}`).
   - If using Data Connect: describe tables and relations (e.g. for financial or reporting).

2. **Security**
   - Firestore rules: rules that enforce company scoping (`companyId` matches the authenticated user’s company), role checks (company-admin, manager, employee, developer), and any append-only or developer-only collections.
   - Storage rules: only allow uploads/reads for authenticated users, scoped by company or user.
   - Realtime Database rules (if used): same principle, path-based security.

3. **Cloud Storage structure**
   - Folder/path convention for crop photos, equipment images, and other files, with clear naming (e.g. `companies/{companyId}/projects/{projectId}/crops/` or `users/{uid}/uploads/`).

4. **Cloud Functions (if needed)**
   - Suggest specific functions (e.g. backup company data, send notifications, aggregate harvest totals) with triggers (Firestore, HTTP, scheduled) and short descriptions.

5. **When to use which product**
   - Firestore: structured farm data, real-time and offline (projects, harvests, inventory, expenses, etc.).
   - Realtime Database: only for high-frequency, simple state (e.g. sensor streams, simple live status).
   - Data Connect: optional; use for relational reporting or finance if we add that later.
   - Cloud Storage: all user-generated binary content (images, documents).

### Constraints
- Prefer Firestore for almost everything; use Realtime Database only when Firestore isn’t a good fit for rapid, small updates.
- All tenant data must be isolated by `companyId`; developer role is the only exception for cross-company access.
- Prefer security rules and client SDKs; add Cloud Functions only where server-side logic or secrets are required.

Please output: (1) Firestore collection schema and rules, (2) Storage path layout and rules, (3) optional Realtime Database paths and rules, (4) optional Data Connect schema if relevant, (5) optional Cloud Functions list with triggers and purpose.

---

## Copy until here ▲

---

## Tips when using this prompt

- **If you already have Firestore rules:** Paste your current `firestore.rules` (or the relevant part) and say: “Here are my current Firestore rules; extend them for [new collections X, Y] and keep the same company-scoping and role model.”
- **If you want only one part:** e.g. “Only generate Firestore security rules for these new collections: …” or “Only suggest Cloud Storage folder structure and storage rules.”
- **If you want code:** Add: “Provide actual code: Firestore rules in rules v2 syntax, Storage rules, and (if any) Cloud Functions in TypeScript/Node.js.”
- **If you want to align with existing code:** Share your `dataconnect/schema/schema.gql` and say whether Data Connect should stay in sync with Firestore or be used only for specific reporting/relational use cases.
