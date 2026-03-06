# Firebase Onboarding Flow — Forensic Audit

**Read-only audit of the entire onboarding flow (Firebase version).** No logic or code was changed. Use this document to migrate the same behavior to Supabase without breaking anything.

---

## 1) Entry points

### Routes that start onboarding

| Route | File / Component | Purpose |
|-------|------------------|--------|
| `/setup-company` | `src/pages/SetupCompany.tsx` | Main onboarding wizard (4 steps). |
| `/setup` | Redirect in `App.tsx` | `<Navigate to="/setup-company" replace />` |
| `/choose-plan` | `src/pages/ChoosePlan.tsx` | Plan selection only; continues to `/setup-company` with `state: { plan, billingMode }`. |

**Direct entry:** Users can land on `/setup-company` from:

- Landing CTAs: “Get Started”, “Start Free Trial”, “Join FarmVault” → `/setup-company`
- Pricing: “Get Started” with optional `state: { plan }` → `/setup-company`
- Login page: “Sign up” link → `/setup-company`
- Choose plan: “Continue to setup” → `/setup-company` with `state: { plan, billingMode }`

### Guards: what triggers onboarding instead of dashboard

| Guard | Location | Condition | Action |
|-------|----------|-----------|--------|
| **setupIncomplete** | `AuthContext` | `isAuthenticated && !isUserSetupComplete(userDoc)` or (no user doc and no employee with companyId) | App treats user as “setup incomplete”; redirects send to `/setup-company`. |
| **RootRoute** (`/`) | `src/components/routing/RootRoute.tsx` | `authReady && isAuthenticated && setupIncomplete` | `<Navigate to="/setup-company" replace state={{ message: '...' }} />` |
| **RequireAuth** | `src/components/auth/RequireAuth.tsx` | `authReady && isAuthenticated && setupIncomplete` | `<Navigate to="/setup-company" replace state={{ from, message: '...' }} />` |
| **NoCompanyGuard** | `src/components/NoCompanyGuard.tsx` | Uses `useCompanyScope()`; `scope.error === NO_COMPANY` (i.e. non-developer with no `user.companyId`) | Renders “Finish setup” card with button to `/setup-company`. |

**When is setup “complete”?**  
`isUserSetupComplete(data)` in `AuthContext`:

- `true` if `role === 'developer'`, or
- `true` if `data.companyId` and `data.role` are both present.

So: **onboarding is triggered when the user is signed in but `users/{uid}` is missing `companyId` or `role`** (or the user doc doesn’t exist and the user has no employee record with a company).

---

## 2) Screens and steps

Onboarding is a single page, **SetupCompany**, with **4 steps** (no separate route per step).

### Step 1 — Company details

| Item | Detail |
|------|--------|
| **File** | `src/pages/SetupCompany.tsx` |
| **Component** | Same page; step === 1 |
| **UI fields** | Company Name (text), Company Email (email) |
| **Validation** | `companyName.trim().length >= 2`, company email must match ` /^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| **Buttons** | Continue (calls `handleContinue` → `setStep(2)`). No Back. |
| **Stored** | React state only: `companyName`, `companyEmail`. Nothing in Firebase or localStorage. |

### Step 2 — Admin account

| Item | Detail |
|------|--------|
| **File** | `src/pages/SetupCompany.tsx` |
| **UI fields** | Admin Full Name, Admin Email, Password, Confirm Password |
| **Validation** | `adminName.trim().length >= 2`, valid email, `password.length >= 6`, `password === confirmPassword` |
| **Buttons** | Back → `setStep(1)`, Continue → `setStep(3)` |
| **Stored** | React state only: `adminName`, `adminEmail`, `password`, `confirmPassword`. |

### Step 3 — Review

| Item | Detail |
|------|--------|
| **File** | `src/pages/SetupCompany.tsx` |
| **UI** | Summary: company name, company email, admin name, admin email (read-only) |
| **Buttons** | Back → `setStep(2)`, Continue → `setStep(4)` |
| **Stored** | No new storage. |

### Step 4 — Choose plan

| Item | Detail |
|------|--------|
| **File** | `src/pages/SetupCompany.tsx` |
| **UI** | `BillingModeSelector` (monthly / season / annual), grid of `SUBSCRIPTION_PLANS` (Basic, Pro, Enterprise); user picks one. |
| **Validation** | `selectedPlan != null` |
| **Buttons** | Back → `setStep(3)`, “Create Company Account” → `handleCreateAccount()` (Firebase Auth + Firestore writes). |
| **Stored** | React state: `selectedPlan`, `billingMode`. Plan is passed to `createCompany`; **billingMode is not written** (company subscription is created with `billingMode: 'monthly'` only). |

### Success state

After `handleCreateAccount` succeeds:

- `setSuccess(true)`.
- UI shows “Welcome to FarmVault, {companyName}” and a “Go to Dashboard” button → `navigate('/dashboard', { replace: true })`.
- No further Firebase calls on this screen.

### Setup incomplete (redirect with message)

If the user lands on `/setup-company` with `setupIncomplete && state.message` (e.g. after redirect from RootRoute):

- Renders a card with `state.message` and a “Refresh page” button (`window.location.reload()`).
- No Firebase calls.

### Loading and errors

- **Loading:** `loading` state; “Create Company Account” shows “Creating...” (via `OnboardingNavButtons` `isLoading`).
- **Errors:** `error` state; displayed in a red bordered div above the nav buttons. Set from `handleCreateAccount` catch block.
- **Toasts:** None used in SetupCompany.

---

## 3) Firebase Auth and profile resolution

### Where `onAuthStateChanged` is handled

- **File:** `src/contexts/AuthContext.tsx`
- **Usage:** Single `useEffect` that subscribes to `onAuthStateChanged(auth, async (firebaseUser) => { ... })`. On each auth state change it:
  - Reads `users/{uid}` (with retries: 0, 400, 900, 1800 ms) so onboarding has time to write the doc after sign-up.
  - Optionally loads employee profile via `loadEmployeeProfile(uid)` (see below).
  - Sets `user`, `employeeProfile`, `permissions`, `setupIncomplete`, and `authReady`.

### How `users/{uid}` is created if missing

- **During onboarding:** `createCompanyUserProfile()` in `companyService` is called **after** `registerCompanyAdmin()` and `createCompany()`. It does `setDoc(doc(db, 'users', uid), { id, companyId, name, email, role: 'company-admin', createdAt, updatedAt })`. So the user doc is created explicitly in step 4 of SetupCompany.
- **Outside onboarding:** If the user has no user doc but has an **employee** doc with `companyId`, AuthContext merges that into a user object and **writes** `users/{uid}` with `setDoc(..., { merge: true })` (see AuthContext `login` and `onAuthStateChanged`). So `users/{uid}` can be created from employee data on first login.

### Merging users and employees for permissions

- **AuthContext** loads both `users/{uid}` and employee (by `employees/{uid}` or `employees` where `authUserId == uid`).
- **Permissions:** `buildEffectivePermissions(user, employeeProfile)`:
  - If `user.role` is `developer` or `company-admin` / `company_admin` → `getFullAccessPermissions()`.
  - Else uses `getPermissionRole(user, employeeProfile)` (employeeRole/role from employee or user) and `resolvePermissions(permissionRole, permissionOverrides)` with overrides from `employeeProfile?.permissions ?? user?.permissions`.

No separate “merge” doc; the runtime user object and permissions are computed from user + employee in memory.

### localStorage keys for session caching

| Key | File | Purpose |
|-----|------|--------|
| `farmvault:auth:user:v1` | `AuthContext.tsx` | Cached user object (id, email, name, role, companyId, etc.) after successful profile load. Cleared when setup incomplete or logout. |
| `farmvault:last-route:v1` | `RootRoute.tsx` | Last route for post-login redirect (not onboarding-specific). |

---

## 4) Firestore operations (onboarding only)

All Firestore operations that occur **during or immediately after** the onboarding flow (SetupCompany step 4 and AuthContext reaction).

### During step 4 submit (`handleCreateAccount`)

| # | Collection | Doc ID | Function | Filters / order / limit | Payload / notes |
|---|------------|--------|----------|--------------------------|-----------------|
| 1 | `companies` | Auto (addDoc) | **addDoc** | — | See “companies document shape” below. |
| 2 | `users` | `uid` (Auth UID) | **setDoc** | — | See “users document shape” below. |

No `getDoc`/`getDocs`/`updateDoc`/`deleteDoc`/`writeBatch`/`runTransaction` in the onboarding submit path. No cache fallbacks in companyService or authService.

### After auth state change (AuthContext, when user just completed onboarding)

| # | Collection | Doc ID | Function | Filters / order / limit | Payload / notes |
|---|------------|--------|----------|--------------------------|-----------------|
| 3 | `users` | `firebaseUser.uid` | **getDoc** | — | With retries (0, 400, 900, 1800 ms). |
| 4 | `employees` | `uid` | **getDoc** | — | `loadEmployeeProfile(uid)`. |
| 5 | `employees` | — | **getDocs** | `where('authUserId', '==', uid)`, `limit(1)` | Only if employees/{uid} missing or has different authUserId. |

Optional (DEV only): **getDoc** `companies/{companyId}` via `getCompany(mapped.companyId)` for logging. Not required for onboarding behavior.

**Summary:** Onboarding **writes**: 1× `companies` (addDoc), 1× `users` (setDoc). **Reads** (in AuthContext after sign-up): `users/{uid}` (with retries), then `employees` (getDoc by uid + possible getDocs by authUserId). No activityLogs/auditLogs in onboarding code.

### Exact payload keys (writes during onboarding)

**companies (addDoc):**  
`name`, `email`, `createdAt` (serverTimestamp), `status`, `subscriptionPlan`, `plan`, `userCount`, `projectCount`, `revenue`, `subscription` (object with `plan`, `status`, `trialStartAt`, `trialEndsAt`, `paidUntil`, `billingMode`, `override`).

**users (setDoc):**  
`id`, `companyId`, `name`, `email`, `role` ('company-admin'), `createdAt` (serverTimestamp), `updatedAt` (serverTimestamp).

---

## 5) Company creation and linking

### How the company is created

- **File:** `src/services/companyService.ts` → `createCompany(name, companyEmail, plan)`.
- **Method:** `addDoc(collection(db, 'companies'), { ... })`. **Doc ID is auto-generated** by Firestore; the returned `ref.id` is used as `companyId`.
- **Order of operations in step 4:**
  1. `registerCompanyAdmin(adminEmail, password)` → Firebase Auth user created.
  2. `createCompany(companyName, companyEmail, selectedPlan)` → `companies` doc created; `companyId = ref.id`.
  3. `createCompanyUserProfile({ uid: user.uid, companyId, name: adminName, email: adminEmail })` → `users/{uid}` created with that `companyId`.

### Required fields for company creation

- **createCompany:** `name`, `companyEmail`, `plan` (string). Default plan `'starter'`; if plan is one of `['starter','professional','enterprise']` it is used, else `'starter'`. Note: UI sends `basic`/`pro`/`enterprise`; only `enterprise` maps; `basic` and `pro` become `'starter'` in current code.
- **createCompanyUserProfile:** `uid`, `companyId`, `name`, `email`.

### How the user is linked to the company

- **users.companyId** is set in `createCompanyUserProfile` to the `companyId` returned from `createCompany`. So the admin is linked by writing `users/{uid}` with `companyId`.

### Counts (userCount / projectCount)

- **createCompany** sets `userCount: 1`, `projectCount: 0`, `revenue: 0` in the new company doc. Nothing else in onboarding updates these counts (no separate increment on user create).

---

## 6) Project setup inside onboarding

- **No first project is created during onboarding.** SetupCompany does not create projects, project stages, season challenges, records, or crop catalog entries. The user goes to dashboard after “Go to Dashboard” and can create projects from there.

---

## 7) Subscription and plan gating

- **Where trial/pro is decided:** Company doc is created with embedded `subscription`: `plan: 'trial'`, `status: 'active'`, `trialStartAt`, `trialEndsAt` (now + 7 days), `paidUntil: null`, `billingMode: 'monthly'`. So every new company starts as **trial**.
- **Plan from UI:** Step 4 `selectedPlan` (basic/pro/enterprise) is passed to `createCompany` as `plan`; it is normalized to `starter`/`professional`/`enterprise` for the `plan` and `subscriptionPlan` fields (with the mapping quirk above). `subscriptionPlan` in the company doc is still set to `'trial'`; the chosen plan is stored in `plan` / `subscriptionPlan` for display/billing later.
- **companySubscriptions:** Not written during onboarding. Subscription is embedded in `companies` only.
- **Gating during onboarding:** No check that “onboarding requires a paid plan”. User can complete all 4 steps and create account on any selected plan; no payment required at sign-up.

---

## 8) Permissions initialization

- **Role set in onboarding:** `createCompanyUserProfile` sets `role: 'company-admin'`. No `employeeRole`, no custom roles, no employees doc for the admin.
- **Full access:** In AuthContext, `buildEffectivePermissions` returns `getFullAccessPermissions()` when `user.role === 'developer' || user.role === 'company-admin' || user.role === 'company_admin'`. So company-admin gets full access from permissions logic; no extra assignment step in onboarding.
- **Default presets:** Onboarding does not call `getDefaultPermissions` or `getPresetPermissions` for the new user; the company-admin gets full access via role check above.

---

## 9) Analytics / activity logs

- **activityLogs / auditLogs:** No writes to these in SetupCompany, authService, or companyService.
- **logEvent:** Not used in onboarding flow.

---

## 10) Step-by-step timeline and diagram

### Timeline (user completes onboarding)

1. User opens `/setup-company` (or arrives via `/choose-plan` → `/setup-company` with state).
2. Step 1: Enter company name + email → Continue.
3. Step 2: Enter admin name, email, password, confirm → Continue.
4. Step 3: Review summary → Continue.
5. Step 4: Select billing mode and plan → “Create Company Account”.
6. **Firebase Auth:** `createUserWithEmailAndPassword(auth, adminEmail, password)`.
7. **Firestore:** `addDoc(companies, {...})` → `companyId = ref.id`.
8. **Firestore:** `setDoc(users/{uid}, { id, companyId, name, email, role: 'company-admin', createdAt, updatedAt })`.
9. `setSuccess(true)`; UI shows welcome + “Go to Dashboard”.
10. User clicks “Go to Dashboard” → `navigate('/dashboard')`.
11. **AuthContext** (on next run / auth state): `getDoc(users/{uid})` (with retries), `loadEmployeeProfile(uid)`; `isUserSetupComplete` true → `setupIncomplete` false; user sees dashboard.

### Text diagram

```
[Landing / Login / Choose plan]
         │
         ▼
   /setup-company
         │
    Step 1: Company details ──► Step 2: Admin account ──► Step 3: Review ──► Step 4: Plan
         │                           │                         │                  │
         │                           │                         │                  │ Firebase Auth: createUser
         │                           │                         │                  │ Firestore: addDoc(companies)
         │                           │                         │                  │ Firestore: setDoc(users/{uid})
         │                           │                         │                  ▼
         │                           │                         │            [Success screen]
         │                           │                         │                  │
         │                           │                         │                  │ "Go to Dashboard"
         │                           │                         │                  ▼
         │                           │                         │            /dashboard
         │                           │                         │                  │
         │                           │                         │                  │ AuthContext: getDoc(users), getDoc/getDocs(employees)
         │                           │                         │                  │ setupIncomplete = false
         │                           │                         │                  ▼
         │                           │                         │            [Company dashboard]
```

---

## Files involved

| File | Role |
|------|------|
| `src/pages/SetupCompany.tsx` | Main onboarding page (4 steps, success, setup-incomplete message). |
| `src/pages/ChoosePlan.tsx` | Plan + billing mode selection; navigates to `/setup-company` with state. |
| `src/services/authService.ts` | `registerCompanyAdmin`: Firebase Auth `createUserWithEmailAndPassword`. |
| `src/services/companyService.ts` | `createCompany` (addDoc companies), `createCompanyUserProfile` (setDoc users). |
| `src/contexts/AuthContext.tsx` | `onAuthStateChanged`, user/employee load, `setupIncomplete`, cache read/write. |
| `src/components/routing/RootRoute.tsx` | Redirects authenticated + setupIncomplete to `/setup-company`. |
| `src/components/auth/RequireAuth.tsx` | Redirects authenticated + setupIncomplete to `/setup-company`. |
| `src/components/NoCompanyGuard.tsx` | Shows “Finish setup” when `useCompanyScope().error === NO_COMPANY`. |
| `src/hooks/useCompanyScope.ts` | Derives companyId from user; NO_COMPANY when non-developer and no companyId. |
| `src/components/onboarding/OnboardingHeader.tsx` | Step progress (Step X of Y, progress bar, title, subtitle). |
| `src/components/onboarding/OnboardingNavButtons.tsx` | Back / Continue buttons, loading state. |
| `src/config/plans.ts` | `SUBSCRIPTION_PLANS`, `getPlanPrice`, `getBillingModeDurationLabel`, `BillingMode`. |
| `src/components/subscription/BillingModeSelector.tsx` | Monthly / season / annual toggle (UI only). |
| `src/App.tsx` | Routes: `/setup-company`, `/setup` → setup-company, `/choose-plan`. |
| `src/lib/permissions.ts` | `getFullAccessPermissions`, `getDefaultPermissions`, `resolvePermissions`. |
| `firebase.rules` | Rules for `users`, `companies` (read/write conditions). |

---

## Firestore document shapes (JSON examples)

### users/{uid} (created by onboarding)

```json
{
  "id": "<auth.uid>",
  "companyId": "<companyId from createCompany ref.id>",
  "name": "<adminName>",
  "email": "<adminEmail>",
  "role": "company-admin",
  "createdAt": "<serverTimestamp>",
  "updatedAt": "<serverTimestamp>"
}
```

Optional fields that may appear later (e.g. from AuthContext merge or other flows): `employeeRole`, `permissions`, `avatar`. Onboarding does not set them.

### companies/{companyId} (created by onboarding)

```json
{
  "name": "<companyName>",
  "email": "<companyEmail>",
  "createdAt": "<serverTimestamp>",
  "status": "active",
  "subscriptionPlan": "trial",
  "plan": "starter | professional | enterprise",
  "userCount": 1,
  "projectCount": 0,
  "revenue": 0,
  "subscription": {
    "plan": "trial",
    "status": "active",
    "trialStartAt": "<Timestamp>",
    "trialEndsAt": "<Timestamp (now + 7 days)>",
    "paidUntil": null,
    "billingMode": "monthly",
    "override": {
      "enabled": false,
      "type": "custom",
      "overrideEndsAt": null,
      "reason": null,
      "grantedBy": "",
      "grantedAt": "<Timestamp>"
    }
  }
}
```

Note: `companyId` is the Firestore auto-generated document ID. Plan comes from step 4; in code only `enterprise` maps to `enterprise`; `basic`/`pro` currently map to `starter`.

### companySubscriptions (not used in onboarding)

Not written during onboarding. Subscription is stored only inside `companies`.

### employees (not created in onboarding)

Company admin has no `employees` doc created by onboarding. Only `users/{uid}` is created. If later the app creates an employee for the same user, that would be a separate flow.

### First project / projectStages (not in onboarding)

Onboarding does not create any project or project stages.

---

## Known risks

| Risk | Detail |
|------|--------|
| **Companies write rule** | Rules: `allow write: if isSignedIn() && (userCompanyId() == companyId \|\| isDeveloper())`. For a **new** company, `userCompanyId()` is null (no `users` doc yet). So the first `addDoc(companies)` can fail for a newly signed-up user unless they are a developer or rules are relaxed for create. |
| **Billing / plan** | Step 4 `billingMode` is not persisted; company is always created with `billingMode: 'monthly'`. Plan mapping from UI (basic/pro/enterprise) to company plan (starter/professional/enterprise) only maps `enterprise`; basic and pro become `starter`. |
| **Duplicate docs** | If user clicks “Create Company Account” twice, two companies and one user doc could be created (no idempotency). |
| **Indexes** | Onboarding only uses `getDoc` by uid and one `getDocs(employees, where('authUserId','==',uid), limit(1))`; no composite indexes required for this path. |
| **No activity/audit** | Company creation and admin linking are not written to activityLogs or auditLogs. |

---

## Supabase mapping checklist

### Tables / fields that must exist

- **companies:** id (e.g. UUID or text), name, email, status, plan, subscription_plan, user_count, project_count, revenue, created_at, updated_at; subscription as JSONB or normalized columns (plan, status, trial_start_at, trial_ends_at, paid_until, billing_mode, override).
- **profiles (or users):** user_id (PK, FK to auth.users), company_id, name, email, role (e.g. company-admin), created_at, updated_at. Optional: permissions, employee_role, avatar.
- **employees:** Optional; not created in current onboarding. If you want 1:1 admin-as-employee, add migration or trigger to create an employee row when creating company-admin profile.

### Which calls must become RPC / Edge Function

- **Company create:** Today: client `addDoc(companies, ...)`. In Supabase: either RLS that allows insert when no company yet (e.g. by checking that no profile has company_id for this user) or an **Edge Function** that creates the company and then the profile, so that company id is generated server-side and user is linked in one transaction.
- **User profile create:** Today: client `setDoc(users/{uid}, ...)`. In Supabase: can remain client insert/upsert to `profiles` if RLS allows (e.g. `auth.uid() = user_id` and insert only for self), or move to same Edge Function as company create for atomicity.

### Invite-based vs password-based

- **Current onboarding:** Password-based. Admin enters email + password in step 2; `createUserWithEmailAndPassword` is used. No invite link.
- **Supabase equivalent:** Can keep password-based sign-up (Supabase Auth signUp) and then create company + profile in same flow (client or Edge Function). Alternatively, use invite-based flow (invite admin email → set password → redirect to callback) and create company + profile when they first complete the invite; then onboarding “steps” could be reduced or done after first login.

---

**End of audit.** Total onboarding steps/screens: **4 steps + 1 success screen + 1 setup-incomplete message screen.** Firebase collections touched: **companies** (write), **users** (write). Auth: **Firebase Auth** (createUserWithEmailAndPassword). Reads during flow: **users** (AuthContext), **employees** (AuthContext).
