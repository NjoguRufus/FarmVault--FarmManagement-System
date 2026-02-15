# Firestore Rules — Assessment

**Date:** February 2025  
**Updated:** Rules were tightened (see summary at end). This document describes the design and what was changed.

---

## Summary: Where the Rules *Are* Tight

### Writes (create / update / delete)

For **almost all business collections**, writes are **company-scoped or developer-only**:

- **Create:** `matchesCompanyOnCreate()` (new doc’s `companyId` must equal the user’s `companyId`) **or** `isDeveloper()`.
- **Update / delete:** `matchesCompanyOnDoc()` (existing doc’s `companyId` must equal the user’s `companyId`) **or** `isDeveloper()`.

So a user can only create/update/delete data that belongs to their company (or, if they are a developer, any data). That is **tight and correct**.

**Special cases that are also tight:**

- **companies** — Read/write only when `userCompanyId() == companyId` or developer.
- **employees** — Create only by company-admin or manager (same company) or developer; update/delete by company match or developer.
- **operationsWorkCards** — Read is company-scoped; create/update/delete company or developer.
- **harvestPaymentBatches** — Create only (company-scoped); update/delete `false`.
- **harvestWallets** and **collectionCashUsage** — `allow write: if false` (backend-only).
- **auditLogs** — Create if signed in; update/delete `false`; read developer-only.
- **inventoryAuditLogs** — Create only with company match; update/delete `false`.
- **codeRed** — Read/write scoped to company or developer; messages subcollection same.
- **developerBackups** — Developer only.
- **platformExpenses** — Developer only.

So from a **write** perspective, the rules are **tight** except for the `users` collection (see below).

---

## Where the Rules Are *Not* Tight

### 1. `users` collection (read and write)

```text
allow read, write: if isSignedIn();
```

- **Any** signed-in user can **read** any user document (e.g. `users/{userId}` for any `userId`).
- **Any** signed-in user can **write** (create/update/delete) any user document.

So one compromised or malicious account could read or change other users’ profiles (including role, companyId). The comment in the rules says: *“Tighten these rules later using custom auth claims if needed.”*

**Recommendation:** Restrict to:

- Read: own document only (`request.auth.uid == userId`) or company admin/developer for same company if you need that for admin UI.
- Write: own document only (e.g. profile update) or company admin/developer for same company when creating/inviting users.

---

### 2. Read access: many collections use `allow read: if isSignedIn()`

For these collections, **any** signed-in user can read **any** document in the collection (no company check on read):

- projects  
- projectStages  
- workLogs  
- expenses  
- seasonChallenges  
- inventoryUsage, inventoryItems, inventoryCategories, inventoryPurchases  
- harvests, harvestCollections, harvestPickers, pickerWeighEntries, harvestPaymentBatches  
- sales  
- harvestCashPools  
- suppliers  
- employees  
- deliveries  
- neededItems  
- feedback  
- inventoryAuditLogs  
- harvestWallets  
- collectionCashUsage  

So at the **rules level**, cross-tenant read is allowed: a user from company A could, in theory, read documents belonging to company B if they queried by ID or listed the collection.

**Mitigation in the app:** The app only queries data filtered by `companyId` (e.g. via `useCollection` and then filtering, or planned queries with `where('companyId', '==', user.companyId)`). So **normal usage** never exposes other tenants’ data. The gap is that the **rules do not enforce** that; they only enforce “signed in.” If the client is compromised or bypassed, someone could try to read other companies’ data and the rules would allow it.

**Recommendation (if you want rules to match tenant isolation):** For each of these collections, restrict read to the same company (or developer), for example:

```text
allow read: if isSignedIn() && (resource.data.get('companyId', null) == userCompanyId() || isDeveloper());
```

You already do this for **operationsWorkCards** and **codeRed**; the same pattern would make the rest of the reads “tight” at the rules level.

---

## Conclusion

| Aspect | Status |
|--------|--------|
| **Write rules (except users)** | **Tight** — company-scoped or developer-only. |
| **users collection** | **Loose** — any signed-in user can read/write any user doc. |
| **Read rules (many collections)** | **Permissive** — any signed-in user can read any document; app enforces company in queries, but rules do not. |

So: **the rules are tight for writes** (aside from `users`). The two ways they are not tight are:

1. **users:** both read and write are open to any signed-in user.  
2. **reads on most business data:** only “signed in” is required; no company check in the rule.

If you want “rules are tight” to mean “no cross-tenant access possible at the rules level,” then tightening **users** and adding **company-scoped read** (or developer) for the listed collections would get you there. If you are comfortable relying on the app to never request other tenants’ data, the current rules are acceptable for a controlled rollout, with the main remaining risk being the **users** collection (read + write).

---

## Changes applied (rules tightened)

The following was applied to `firestore.rules`:

1. **Helper:** `canReadCompanyDoc()` — true when signed in and (doc’s `companyId` == user’s company OR developer).

2. **users:** Read/create/update/delete restricted to: own document, or company-admin/developer for same company.

3. **Business collections:** All that had `allow read: if isSignedIn()` now use `allow read: if canReadCompanyDoc()` (projects, projectStages, workLogs, expenses, seasonChallenges, inventory*, harvests, harvestCollections, harvestPickers, pickerWeighEntries, harvestPaymentBatches, sales, harvestCashPools, harvestWallets, collectionCashUsage, suppliers, employees, deliveries, neededItems, feedback, inventoryAuditLogs; operationsWorkCards uses the same helper).

**Result:** Reads and writes are company-scoped (or developer-only). Cross-tenant access is denied at the rules level.
