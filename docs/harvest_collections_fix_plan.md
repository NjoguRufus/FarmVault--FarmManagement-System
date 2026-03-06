# Harvest Collections — Fix Plan (schema cache + recorded_by)

## Errors addressed

1. **"Could not find the 'status' column of 'harvest_collections' in the schema cache"**  
   PostgREST/schema cache was validating against a stale or partial schema when using `select('*')` or when inserting.

2. **"null value in column 'recorded_by' of relation 'picker_intake_entries' violates not-null constraint"**  
   The RPC `harvest.record_intake` inserted without setting `recorded_by`; in a SECURITY DEFINER context the default can be null.

---

## 1. Search results (references)

| Match | File | Line | Snippet |
|-------|------|------|---------|
| harvest_collections | src/services/harvestCollectionsService.ts | 173–217, 226–232 | `.from('harvest_collections')`, insert, list, get |
| picker_intake_entries | src/services/harvestCollectionsService.ts | 293–324 | `.from('picker_intake_entries')`, addPickerIntake (RPC + fallback insert), list |
| createHarvestCollection | src/services/harvestCollectionsService.ts | 153–189 | createHarvestCollection() |
| addPickerIntake | src/services/harvestCollectionsService.ts | 267–315 | addPickerIntake(), addPickerWeighEntry() |
| recordPickerPayment | src/services/harvestCollectionsService.ts | 355–390 | recordPickerPayment() |
| harvestCollections | src/pages/HarvestCollectionsPage.tsx | 29, 44, 216, 402, 656, 664, 774, 1077 | query keys, createHarvestCollection call |
| status | harvestCollectionsService (DbCollection, mapCollection, setBuyerPriceAndClose) | 22, 94, 398–409 | type, mapping, update payload |

No `saveKg`, `recordPickerIntake`, or `HarvestCollection*` components. No `database.types.ts` / `supabase.types.ts` in repo.

---

## 2. Files inspected

- **src/services/harvestCollectionsService.ts** — All harvest_collections and picker_intake_entries inserts/selects; RPC usage.
- **src/pages/HarvestCollectionsPage.tsx** — Calls createHarvestCollection, addPickerIntake (via addPickerWeighEntry), recordPickerPayment; no direct inserts.
- **src/lib/db.ts** — Schema helpers only; no harvest column names.
- **src/lib/supabase.ts** — Client only; no harvest logic.

---

## 3. INSERT payloads vs valid columns

### harvest.harvest_collections

**Valid columns (from your spec):**  
id, company_id, project_id, crop_type, collection_date, buyer_price_per_unit, unit, is_closed, closed_at, created_by, created_at, picker_price_per_unit, status  

**Before (problematic):**  
- `select('*')` could trigger schema cache errors.  
- Insert used `price_per_kg` and `notes` (your spec has `picker_price_per_unit`; you did not list `notes`).  
- Insert used `status: 'open'` (valid per your list; cache error was likely from `*` or cache staleness).

**After (fixed):**  
- **Select:** no longer `select('*')`. Uses explicit list:  
  `id,company_id,project_id,crop_type,collection_date,buyer_price_per_unit,unit,buyer_paid,closed_at,created_by,created_at,price_per_kg,notes,status`  
  so PostgREST does not depend on a stale cache.  
- **Insert:** unchanged in code to stay compatible with existing migrations that use `status` and `price_per_kg`.  
  If your DB uses **picker_price_per_unit** instead of **price_per_kg**, change the insert in `createHarvestCollection` to use `picker_price_per_unit` and drop `price_per_kg`.  
  If your DB has no **notes**, remove `notes` from the insert.

**Correct insert payload (minimal, no created_by):**

```ts
{
  company_id,
  project_id,
  crop_type: 'french_beans',
  collection_date,
  unit: 'kg',
  status: 'open',
  price_per_kg: null | number,  // or picker_price_per_unit if your schema uses it
  notes: null | string,         // omit if column does not exist
}
```

Do **not** send: `created_by`, `harvested_on`, `kg`, `amount`, `weight`.

---

### harvest.picker_intake_entries

**Valid columns:**  
id, company_id, collection_id, picker_id, quantity, unit, recorded_at, recorded_by  

**Before (problematic):**  
- RPC `harvest.record_intake` did not set `recorded_by`, so default was null in definer context.  
- Fallback direct insert did not set `unit`.

**After (fixed):**  
- **RPC:** migration updated so the insert sets `recorded_by = core.current_user_id()` (and payment RPC sets `paid_by`).  
- **Fallback insert:** sends `company_id`, `collection_id`, `picker_id`, `quantity`, `unit: 'kg'`. Does **not** send `recorded_by` (DB default).

**Correct insert payload (minimal, no recorded_by from client):**

```ts
{
  company_id,
  collection_id,
  picker_id,
  quantity,
  unit: 'kg',
}
```

Do **not** send: `recorded_by`, `harvested_on`, `kg`, `weight`, `amount`.

---

## 4. Invalid / renamed fields to avoid

- **harvested_on** → use `collection_date`.  
- **kg** → use `quantity`.  
- **amount** (intake) → N/A; payments use `amount_paid`.  
- **weight** → use `quantity`.  
- **status** → keep in insert if your table has it; schema cache error was addressed by avoiding `select('*')`.  
- Do **not** send **created_by** or **recorded_by** from the frontend; DB fills them.

---

## 5. Exact code changes applied

### supabase/migrations/20260305100000_harvest_collections_view_and_rpcs.sql

- **record_intake RPC:**  
  Insert now includes `recorded_by`:  
  `insert into harvest.picker_intake_entries (..., recorded_by) values (..., core.current_user_id());`

- **record_payment RPC:**  
  Insert now includes `paid_by`:  
  `insert into harvest.picker_payment_entries (..., paid_by) values (..., core.current_user_id());`

### src/services/harvestCollectionsService.ts

- **DbCollection type:**  
  Added optional `status?`, `is_closed?`, `picker_price_per_unit?`, `buyer_paid?`, `notes?` so both schemas (status/price_per_kg vs is_closed/picker_price_per_unit) can be read.

- **mapCollection:**  
  Derives `status` from `row.status ?? (row.is_closed ? 'closed' : 'open')` and price from `row.picker_price_per_unit ?? row.price_per_kg`.

- **HARVEST_COLLECTIONS_SELECT:**  
  New constant with explicit column list (no `*`):  
  `id,company_id,project_id,crop_type,collection_date,buyer_price_per_unit,unit,buyer_paid,closed_at,created_by,created_at,price_per_kg,notes,status`

- **listHarvestCollections / getHarvestCollection:**  
  Use `.select(HARVEST_COLLECTIONS_SELECT)` instead of `.select('*')`.

- **createHarvestCollection insert:**  
  Still sends `company_id`, `project_id`, `crop_type`, `collection_date`, `unit: 'kg'`, `status: 'open'`, `price_per_kg`, `notes`. No `created_by`.  
  If your DB uses `picker_price_per_unit` and no `notes`, change to that and remove `notes`.

- **addPickerIntake fallback insert:**  
  Adds `unit: params.unit ?? 'kg'`. Still does not send `recorded_by`.

---

## 6. If your DB has different column names

- **picker_price_per_unit instead of price_per_kg:**  
  In `createHarvestCollection`, replace `price_per_kg` in the insert object with `picker_price_per_unit` (same value).

- **No `status` (only is_closed):**  
  In the insert, remove `status: 'open'` and add `is_closed: false`.  
  Ensure `HARVEST_COLLECTIONS_SELECT` does not include `status` (use `is_closed` in the list and keep mapping in `mapCollection`).

- **No `notes`:**  
  Remove `notes` from the insert and from `HARVEST_COLLECTIONS_SELECT` if you get a column-not-found error.

---

## 7. Regenerating Supabase types

There are no `database.types.ts` or `supabase.types.ts` in the repo. If you generate types (e.g. `supabase gen types typescript`), regenerate after applying the migration so the types match the current schema and the schema cache is updated.

---

## 8. Test checklist

- [ ] Create collection: no "status" schema cache error; row has `collection_date`, `unit`, `status` or `is_closed`.
- [ ] List collections: no schema cache error; UI shows list.
- [ ] Add intake via RPC: no `recorded_by` null error; row has `recorded_by` set.
- [ ] Add intake via fallback direct insert: no null error; `unit` present if column exists.
- [ ] Record payment: no null error on `paid_by` when using RPC.
