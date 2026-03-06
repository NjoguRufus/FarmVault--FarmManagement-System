# Firebase → Supabase Mapping (FarmVault)

This document maps each Firebase/Firestore artifact to the Supabase Postgres + RLS architecture. No app behavior changes; planning and schema only.

---

## 1. Tenant model

| Firebase | Supabase | Notes |
|----------|----------|--------|
| **users** (doc id = Auth UID) | **profiles** (row per auth.users) | `profiles.user_id` = `auth.uid()`; `company_id` = tenant; `role`, `permissions` (jsonb). Replaces Firestore `users` for session/role. |
| **companies** (doc id = companyId) | **companies** (id TEXT) | `id` kept as TEXT to match existing Firebase `companyId` during migration. |
| **employees** (doc id = UID or custom) | **employees** | Company-scoped; `auth_user_id` UUID links to auth.users when employee has login. Profile can be joined with employee for effective role. |
| Company scoping | RLS helpers | `current_company_id()` returns `profiles.company_id` for `auth.uid()`; policies use `row.company_id = current_company_id()` or `is_developer()`. |

---

## 2. Collection → table mapping

| Firestore collection | Supabase table | PK | company_id | Notes |
|----------------------|----------------|-----|------------|--------|
| users | profiles | uuid | ✓ (nullable for onboarding) | Links to auth.users(id). |
| companies | companies | text | — | id = companyId (text). |
| employees | employees | uuid | ✓ | auth_user_id nullable. |
| projects | projects | uuid | ✓ | |
| projectStages | project_stages | uuid | ✓ | project_id → projects. |
| stageNotes | stage_notes | uuid | ✓ | stage_id → project_stages. |
| projectBlocks | project_blocks | uuid | ✓ | project_id → projects. |
| workLogs | work_logs | uuid | ✓ | project_id → projects. |
| operationsWorkCards | operations_work_cards | uuid | ✓ | project_id, allocated_manager_id. |
| expenses | expenses | uuid | ✓ | project_id, harvest_id optional. |
| seasonChallenges | season_challenges | uuid | ✓ | project_id → projects. |
| neededItems | needed_items | uuid | ✓ | season_challenge_id. |
| inventoryCategories | inventory_categories | uuid | ✓ | |
| inventoryItems | inventory_items | uuid | ✓ | supplier_id optional. |
| inventoryPurchases | inventory_purchases | uuid | ✓ | inventory_item_id, project_id optional. |
| inventoryUsage | inventory_usage | uuid | ✓ | project_id, inventory_item_id, work_log_id optional. |
| inventoryAuditLogs | inventory_audit_logs | uuid | ✓ | Append-only; RLS company-scoped. |
| suppliers | suppliers | uuid | ✓ | |
| harvests | harvests | uuid | ✓ | project_id → projects. |
| harvestCollections | harvest_collections | uuid | ✓ | project_id; harvest_id, sale_id optional. |
| harvestPickers | harvest_pickers | uuid | ✓ | collection_id → harvest_collections. |
| pickerWeighEntries | picker_weigh_entries | uuid | ✓ | collection_id, picker_id. |
| harvestPaymentBatches | harvest_payment_batches | uuid | ✓ | collection_id. |
| harvestWallets | harvest_wallets | uuid | ✓ | Natural key UNIQUE(company_id, project_id, crop_type). |
| collectionCashUsage | collection_cash_usage | uuid | ✓ | UNIQUE(wallet_id, collection_id) or (company_id, project_id, crop_type, collection_id). |
| harvestCashPools | harvest_cash_pools | uuid | ✓ | Legacy; optional. |
| projectWalletLedger | project_wallet_ledger | uuid | ✓ | project_id; append-only type credit/debit. |
| projectWalletMeta | project_wallet_meta | — | ✓ | Natural key UNIQUE(company_id, project_id). |
| sales | sales | uuid | ✓ | project_id, harvest_id optional. |
| feedback | feedback | uuid | ✓ | |
| auditLogs | audit_logs | uuid | ✓ | Append-only; read developer-only. |
| activityLogs | activity_logs | uuid | ✓ | Append-only. |
| cropCatalog | crop_catalog | uuid | ✓ | crop_type; company-scoped. |
| challengeTemplates | challenge_templates | uuid | ✓ | crop_type, phase. |
| budgetPools | budget_pools | uuid | ✓ | |
| subscriptionPayments | subscription_payments | uuid | ✓ | |
| companySubscriptions | company_subscriptions | — | — | PK = company_id (text). |
| developerActionsLog | developer_actions_log | uuid | — | Developer-only. |
| platformExpenses | platform_expenses | uuid | — | Developer-only. |
| codeRed | code_red | uuid | ✓ | |
| codeRed/messages | code_red_messages | uuid | — | code_red_id → code_red. |
| developerBackups | developer_backups | — | — | PK = company_id (text). |
| developerBackups/snapshots | developer_backup_snapshots | uuid | — | backup_id → developer_backups. |
| records_library | records_library | uuid | — | No company_id; developer-only; crop_id. |
| company_records | company_records | uuid | ✓ | crop_id. |
| company_record_shares | company_record_shares | uuid | ✓ | record_id, crop_id. |
| crops | crops | text | — | id = crop key (e.g. tomatoes); reference. |
| deliveries | deliveries | uuid | ✓ | |
| customRoles | custom_roles | uuid | ✓ | |
| harvestWalletPayments | harvest_wallet_payments | uuid | ✓ | Server-only audit; optional. |

---

## 3. Service → Supabase client usage (mapping only)

| Current Firebase usage | Supabase equivalent (when switched) |
|------------------------|-------------------------------------|
| getDoc(doc(db, 'companies', id)) | supabase.from('companies').select().eq('id', id).single() |
| getDocs(query(collection(db, 'projects'), where('companyId','==', cid))) | supabase.from('projects').select().eq('company_id', cid) |
| addDoc(collection(db, 'expenses'), data) | supabase.from('expenses').insert(data) |
| updateDoc(doc(db, 'workLogs', id), data) | supabase.from('work_logs').update(data).eq('id', id) |
| onSnapshot(q, callback) | supabase.channel().on('postgres_changes', { table, filter }, callback) |
| writeBatch / runTransaction | supabase.rpc('fn_name', args) or multiple inserts in one request |
| payPickersFromWalletBatchFirestore | Supabase RPC or Edge Function (transaction) |

---

## 4. Field naming convention

| Firestore (camelCase) | Postgres (snake_case) |
|-----------------------|------------------------|
| companyId | company_id |
| projectId | project_id |
| createdAt | created_at |
| updatedAt | updated_at |
| cropType | crop_type |
| startDate | start_date |
| endDate | end_date |
| authUserId | auth_user_id |
| stageIndex | stage_index |
| stageName | stage_name |
| totalHarvestKg | total_harvest_kg |
| pricePerKgPicker | price_per_kg_picker |
| isPaid | is_paid |
| paidAt | paid_at |
| cashReceivedTotal | cash_received_total |
| currentBalance | current_balance |
| lastUpdatedAt | last_updated_at |

---

## 5. Special cases

- **Composite doc IDs in Firestore:**  
  - `harvestWallets`: doc id `companyId_projectId_cropType` → table with UNIQUE(company_id, project_id, crop_type).  
  - `projectWalletMeta`: doc id `companyId_projectId` → UNIQUE(company_id, project_id).  
  - `collectionCashUsage`: doc id `walletId_collectionId` → table with wallet_id (FK to harvest_wallets) + harvest_collection_id unique.

- **Developer-only tables:**  
  records_library, platform_expenses, developer_actions_log, audit_logs (read), developer_backups, developer_backup_snapshots — RLS allows only when `is_developer()`.

- **Append-only:**  
  audit_logs, activity_logs, inventory_audit_logs, project_wallet_ledger — RLS/triggers can enforce no update/delete.

- **company_subscriptions / developer_backups:**  
  PK = company_id (text); one row per company.

- **crops:**  
  PK = crop key (text); developer write, all read.

---

## 6. Realtime mapping (strategy)

| Firebase onSnapshot | Supabase Realtime |
|---------------------|-------------------|
| useCollection('projects', { companyId }) | channel on `projects` with filter `company_id=eq.{companyId}` |
| projectWalletService (ledger) | channel on `project_wallet_ledger` filter `company_id`, `project_id` |
| useAdminSubscriptionPayments | channel on `subscription_payments` with status/date filters |
| activityLogService | channel on `activity_logs` filter `company_id`, optional `project_id` |
| cropCatalogService | channel on `crop_catalog` filter `company_id` |
| ConnectivityContext (projects limit 1) | single select or channel with limit 1 |

---

*Used by migration phases and schema migrations.*
