# EmployeesPage Firebase Flow (read-only audit)

This document describes exactly how the **Employees** feature works in the FarmVault React app (Firebase version): listing, creating, editing, and the underlying Auth + Firestore calls. No behavior changes; inspection and report only.

---

## Overview diagram (text-based)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EmployeesPage.tsx                                                            │
│  - useAuth() → user, companyId, isDeveloper                                  │
│  - usePermissions() → can('employees','create'|'edit')                        │
│  - useSubscriptionStatus() → canWrite (else show UpgradeModal)                │
│  - useCollection('employees', 'employees', { companyId, isDeveloper })       │
│  - useCollection('employees-page-users', 'users', same scope)                │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ List employees          Create employee              Edit employee
         ▼                         ▼                            ▼
┌──────────────────┐    ┌──────────────────────────────┐   ┌─────────────────────────┐
│ Firestore        │    │ Firebase Auth (secondary app) │   │ Firestore               │
│ onSnapshot       │    │ createUserWithEmailAndPassword│   │ updateDoc(employees)    │
│ employees        │    │ (authEmployeeCreate)         │   │ setDoc(users, merge)    │
│ where companyId  │    │ → uid                         │   │                         │
│ (no orderBy/limit)   │ Firestore setDoc:             │   │ queryClient.invalidate  │
│                  │    │  employees/{uid}             │   │ toast.success            │
│ onSnapshot       │    │  users/{uid}                 │   └─────────────────────────┘
│ users            │    │ queryClient.invalidate       │
│ where companyId  │    │ toast.success, close modal  │
└──────────────────┘    └──────────────────────────────┘
```

**There is no Delete Employee action in the UI** — only List, Create, and Edit.

---

## Files inspected

| File | Purpose |
|------|--------|
| `src/pages/EmployeesPage.tsx` | Main page: list, add dialog, edit dialog, details modal, table/cards |
| `src/lib/firebase.ts` | Primary `app` + `auth`; secondary `appEmployeeCreate` + `authEmployeeCreate`; `db` |
| `src/contexts/AuthContext.tsx` | Session, user profile, employee profile load by `authUserId` or doc id |
| `src/hooks/useCollection.ts` | Realtime Firestore subscription with company scope |
| `src/hooks/usePermissions.ts` | `can(module, action)` from role + permission map |
| `src/hooks/useSubscriptionStatus.ts` | `canWrite`; blocks create/edit when trial expired |
| `src/lib/permissions.ts` | `getDefaultPermissions`, `getPresetPermissions`, `resolvePermissions`, `canByPermissionMap`; employees presets |
| `src/components/permissions/PermissionEditor.tsx` | Used in add/edit forms (referenced; not fully traced) |
| `firestore.rules` | Employees read/create/update/delete rules |

---

## 1. UI flow

### 1.1 Buttons and actions

| Button / action | Location | Visibility | Result |
|-----------------|----------|------------|--------|
| **Add Employee** | Page header (DialogTrigger) | When `canCreateEmployees` | Opens Add Employee dialog |
| **Save Employee** | Add form submit | — | Submits add form |
| **Cancel** | Add dialog footer | — | Closes dialog, resets form |
| **View details** | Row dropdown (desktop) / card menu (mobile) | Always | Opens details modal for selected employee |
| **Edit employee** | Details modal footer | When `canEditEmployees` | Closes details, opens Edit dialog |
| **Edit** | Row dropdown | When `canEditEmployees` | Opens Edit dialog for that employee |
| **Save changes** | Edit form submit | — | Submits edit form |
| **Cancel** | Edit dialog footer | — | Closes edit dialog |
| **Close** | Details modal | — | Closes details modal |

There is **no Delete** button; employee deletion is not implemented in the UI.

### 1.2 Form fields

**Add Employee**

- Full name (required)
- Role (optional): dropdown — “No role (custom permissions)” | Operations (Manager) | Logistics (Driver) | Sales (Broker)
- Department (text; placeholder “General”)
- Email (required; “for login”)
- Initial password (required; min length 6; show/hide toggle)
- Phone / Contact (optional)
- Permission editor (preset + custom; `PermissionEditor` component)

**Edit Employee**

- Full name (required)
- Role (optional): same options as add
- Department (text)
- Contact (text)
- Permission editor (preset + custom)
- Status: Active | On leave | Inactive

Email is not editable (it is the auth identity).

### 1.3 Validations

- **Add:** Required: name, email, password; `minLength={6}` on password. Client-only.
- **Edit:** Required: name. Client-only.
- **Subscription:** If `!canWrite` (from `useSubscriptionStatus`), Create and Edit open `UpgradeModal` instead of submitting.

### 1.4 Loading / error / toast

- **List:** `isLoading` from `useCollection` → table shows “Loading employees…”.
- **Add:** `saving` state → submit button shows “Saving…” and is disabled.
- **Edit:** `editSaving` → “Saving…” and disabled.
- **Toasts (sonner):**  
  - Success: “Employee added successfully” (add), “Employee updated” (edit).  
  - Errors: “Permission denied”, “Cannot add employee” (no company), “Email already in use”, “Authentication error”, “Failed to add/update employee”, etc.
- **List refresh:** No explicit reload; `queryClient.invalidateQueries({ queryKey: ['employees'] })` and `['employees-page-users']` after add/edit so React Query refetches if those keys are used elsewhere. The main list is driven by **realtime** `useCollection`, so new/updated docs appear via `onSnapshot` without manual refetch.

### 1.5 After success

- **Add:** Toast success, dialog closes, `resetAddForm()` clears all add fields.
- **Edit:** Toast success, edit dialog closes, `setEditingEmployee(null)`.
- **List:** Updates automatically via Firestore `onSnapshot` (and any React Query invalidations).

No optimistic updates; list updates when Firestore sends the new snapshot.

---

## 2. Firebase Auth flow for employee creation

### 2.1 Secondary Firebase app (avoid logging out admin)

- **File:** `src/lib/firebase.ts`
- **Primary app:** `app` = `initializeApp(firebaseConfig)`, `auth` = `getAuth(app)`.
- **Secondary app:** `appEmployeeCreate` = `initializeApp(firebaseConfig, 'EmployeeCreate')`, `authEmployeeCreate` = `getAuth(appEmployeeCreate)`.
- **Reason:** Creating a user with `createUserWithEmailAndPassword(auth, ...)` would sign in that new user and **sign out the current admin**. Using `authEmployeeCreate` keeps the current session on `auth` unchanged.

### 2.2 Exact Auth call

- **File:** `src/pages/EmployeesPage.tsx`, inside `handleAddEmployee`.
- **Code:**  
  `const credential = await createUserWithEmailAndPassword(authEmployeeCreate, email, password);`  
  `const uid = credential.user.uid;`
- **Function:** `createUserWithEmailAndPassword` from `firebase/auth` (import at top of `EmployeesPage.tsx`).
- **Arguments:** `authEmployeeCreate` (secondary app’s auth), `email` (form), `password` (form).
- **Outputs used:** `credential.user.uid` → stored as `uid` and used as Firestore doc IDs for both `employees/{uid}` and `users/{uid}`.

No other Auth APIs are used on this page (no sign-out, no link with credential, no custom token).

---

## 3. Firestore reads and writes

### 3.1 Collections touched

| Collection | Read | Write |
|------------|------|--------|
| **employees** | Yes (realtime list; AuthContext can read by uid or authUserId) | Yes (setDoc on create; updateDoc on edit) |
| **users** | Yes (realtime list for email lookup) | Yes (setDoc on create; setDoc merge on edit) |
| **companies** | No on this page | No |

### 3.2 List employees (read)

- **Where:** `EmployeesPage.tsx`  
  `const { data: employees = [], isLoading } = useCollection<Employee>('employees', 'employees', scope);`  
  `scope = { companyScoped: true, companyId, isDeveloper }`.
- **Hook:** `useCollection` in `src/hooks/useCollection.ts`.
- **Behavior:** Builds query with `where('companyId', '==', companyId)` when `companyScoped && companyId`. No `orderBy` or `limit` in the options passed from the page, so the query is `collection(db, 'employees')` + optional `where('companyId', '==', companyId)`.
- **Listener:** `onSnapshot(source, ...)` — realtime. On error (e.g. unavailable), falls back to `getDocsFromCache(source)` and toasts “Offline” if no cache.
- **Doc ID strategy:** Employee doc IDs are whatever exists in the collection (uid for new creates; legacy may use other ids).

### 3.3 List users (read, for email display)

- **Where:** `EmployeesPage.tsx`  
  `const { data: allUsers = [] } = useCollection<User>('employees-page-users', 'users', scope);`
- **Same hook:** `useCollection('employees-page-users', 'users', scope)` → realtime on `users` with same company scope. Used to build `authUserIdToEmail` so employee rows can show email when `employees` doc has no email but has `authUserId`.

### 3.4 Create employee (writes)

**1) Firestore `employees/{uid}`**

- **File:** `src/pages/EmployeesPage.tsx`, `handleAddEmployee`.
- **Operation:** `setDoc(doc(db, 'employees', uid), payload, { merge: true })`.
- **Doc ID:** `uid` (Firebase Auth UID of the new user).
- **Payload shape (example):**

```json
{
  "fullName": "<name from form>",
  "name": "<name from form>",
  "email": "<email from form>",
  "phone": "<contact or null>",
  "contact": "<contact or null>",
  "role": "<selectedRole or null>",
  "employeeRole": "<selectedRole or null>",
  "status": "active",
  "department": "<resolvedDepartment>",
  "companyId": "<companyId>",
  "permissions": { ... },
  "createdBy": "<user?.id or null>",
  "createdAt": "<serverTimestamp()>",
  "joinDate": "<serverTimestamp()>",
  "authUserId": "<uid>"
}
```

- **Timestamps:** `createdAt`, `joinDate` = `serverTimestamp()`.

**2) Firestore `users/{uid}`**

- **Operation:** `setDoc(doc(db, 'users', uid), payload, { merge: true })`.
- **Doc ID:** Same `uid`.
- **Payload shape (example):**

```json
{
  "email": "<email>",
  "name": "<name>",
  "role": "<appRole: 'manager'|'broker'|'employee'>",
  "employeeRole": "<selectedRole or null>",
  "permissions": { ... },
  "companyId": "<companyId>",
  "createdAt": "<serverTimestamp()>",
  "updatedAt": "<serverTimestamp()>"
}
```

- **Timestamps:** `createdAt`, `updatedAt` = `serverTimestamp()`.

### 3.5 Edit employee (writes)

**1) Firestore `employees/{editingEmployee.id}`**

- **File:** `src/pages/EmployeesPage.tsx`, `handleUpdateEmployee`.
- **Operation:** `updateDoc(doc(db, 'employees', editingEmployee.id), payload)`.
- **Doc ID:** `editingEmployee.id` (may be uid or legacy id).
- **Payload shape (example):**

```json
{
  "fullName": "<editName>",
  "name": "<editName>",
  "role": "<selectedRole or null>",
  "employeeRole": "<selectedRole or null>",
  "department": "<resolvedDepartment>",
  "phone": "<editContact or null>",
  "contact": "<editContact or null>",
  "status": "<editStatus>",
  "permissions": { ... }
}
```

- **No timestamps** in this updateDoc (only in users update below).

**2) Firestore `users/{authUserId}` (permissions sync)**

- **Operation:** `setDoc(doc(db, 'users', authUserId), { permissions, updatedAt }, { merge: true })` where `authUserId = editingEmployee.authUserId || editingEmployee.id`.
- **Payload:** `{ permissions: resolvedPermissions, updatedAt: serverTimestamp() }`.
- **Purpose:** Keep `users` permissions in sync with the employee record so AuthContext/permission checks see the same permissions.

---

## 4. Permissions and role logic

### 4.1 Who can create / edit (UI)

- **Create:** Button and submit guarded by `canCreateEmployees` = `can('employees', 'create')`.
- **Edit:** Edit button and submit guarded by `canEditEmployees` = `can('employees', 'edit')`.
- **Source:** `src/hooks/usePermissions.ts`: `can(module, actionPath)` returns:
  - `true` if `isDeveloper` or `isCompanyAdmin`;
  - else for employees: `canByPermissionMap(permissions, module, actionPath)` (e.g. `permissions.employees.create`).
- **Full-access roles:** In `src/lib/permissions.ts`, `getFullAccessPermissions()` gives `employees: { view: true, create: true, edit: true, deactivate: true }`. Used in AuthContext for `user.role === 'developer' | 'company-admin'` so they get full access without looking at the permission map.

### 4.2 Who can create (Firestore rules)

- **File:** `firestore.rules`, `match /employees/{employeeId}`.
- **Create:**  
  `(isCompanyAdmin() && request.resource.data.companyId == effectiveUserCompanyId())`  
  **or**  
  `(isManager() && request.resource.data.companyId == effectiveUserCompanyId())`  
  **or**  
  `isDeveloper()`.
- So: **company-admin, manager, or developer** for the same company (or developer for any company). UI only shows Add to users who pass `can('employees','create')` (effectively developer/company-admin; managers get create from rules but may not get the button if their preset doesn’t grant `employees.create` depending on config).

### 4.3 Role and permission resolution

- **Roles on employee:** `role` and `employeeRole` (e.g. `operations-manager`, `logistics-driver`, `sales-broker`). Mapped to app role for `users`: `manager`, `broker`, or `employee` via `mapEmployeeRoleToAppRole`.
- **Permission presets:** `getPresetPermissions(presetKey)` (e.g. viewer, inventory-clerk, manager) and `resolvePermissions(permissionRole, overrides)` in `src/lib/permissions.ts`. Add/Edit forms use `PermissionEditor` with presets and custom maps; saved value is `resolvePermissions(selectedRole, addPermissions)` or `editPermissions`.
- **AuthContext:** Builds effective permissions from user + employee profile via `buildEffectivePermissions(user, employeeProfile)` (developer/company-admin get full; otherwise `resolvePermissions(permissionRole, permissionOverrides)`).

---

## 5. Exact Firebase call summary

| Step | File | Function / API | Details |
|------|------|----------------|--------|
| List employees | useCollection.ts | onSnapshot(query(collection(db,'employees'), where('companyId','==', companyId))) | Realtime; no orderBy/limit from page |
| List users | useCollection.ts | onSnapshot(query(collection(db,'users'), where('companyId','==', companyId))) | Same scope; for email lookup |
| Create auth user | EmployeesPage.tsx | createUserWithEmailAndPassword(authEmployeeCreate, email, password) | From 'firebase/auth'; secondary app |
| Create employee doc | EmployeesPage.tsx | setDoc(doc(db,'employees', uid), {...}, { merge: true }) | uid = credential.user.uid |
| Create user doc | EmployeesPage.tsx | setDoc(doc(db,'users', uid), {...}, { merge: true }) | Same uid |
| Update employee doc | EmployeesPage.tsx | updateDoc(doc(db,'employees', editingEmployee.id), {...}) | |
| Sync user permissions | EmployeesPage.tsx | setDoc(doc(db,'users', authUserId), { permissions, updatedAt }, { merge: true }) | authUserId = editingEmployee.authUserId \|\| editingEmployee.id |

AuthContext (separate from this page) also: `getDoc(doc(db, 'employees', uid))` and `getDocs(query(collection(db, 'employees'), where('authUserId','==', uid), limit(1)))` to load the current user’s employee profile.

---

## 6. Document shapes (JSON examples)

### 6.1 `employees/{id}` (create)

```json
{
  "fullName": "Jane Doe",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+254 700 000 000",
  "contact": "+254 700 000 000",
  "role": "operations-manager",
  "employeeRole": "operations-manager",
  "status": "active",
  "department": "Operations",
  "companyId": "company_abc123",
  "permissions": { "dashboard": { "view": true }, "employees": { "view": true, "create": false, "edit": false, "deactivate": false }, ... },
  "createdBy": "admin_uid_xyz",
  "createdAt": "<Firestore Timestamp>",
  "joinDate": "<Firestore Timestamp>",
  "authUserId": "firebase_auth_uid_123"
}
```

### 6.2 `users/{id}` (create)

```json
{
  "email": "jane@example.com",
  "name": "Jane Doe",
  "role": "manager",
  "employeeRole": "operations-manager",
  "permissions": { ... },
  "companyId": "company_abc123",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

### 6.3 `employees/{id}` (edit update)

Only updated fields are sent (no timestamps in this updateDoc):

```json
{
  "fullName": "Jane Doe Updated",
  "name": "Jane Doe Updated",
  "role": "sales-broker",
  "employeeRole": "sales-broker",
  "department": "Sales",
  "phone": "+254 711 000 000",
  "contact": "+254 711 000 000",
  "status": "on-leave",
  "permissions": { ... }
}
```

### 6.4 `users/{authUserId}` (edit, merge)

```json
{
  "permissions": { ... },
  "updatedAt": "<Firestore Timestamp>"
}
```

---

## 7. Known risks

| Risk | Description |
|------|-------------|
| **Accidental logout** | Mitigated by using `authEmployeeCreate` for create; if code ever used primary `auth`, the admin would be logged out. |
| **Billing** | Two realtime listeners (employees + users) per company; no limit on list size. Large companies = many docs per snapshot. |
| **Security** | Create/update enforced by Firestore rules (company-admin/manager/developer, same companyId). UI hides buttons when `!can('employees','create'|'edit')` but rules are the authority. |
| **Duplicate docs** | Employee doc id = uid and users doc id = uid; 1:1. Legacy employees might have been created with different id strategy (e.g. custom id + authUserId); AuthContext supports both doc id = uid and where('authUserId','==', uid). |
| **Missing indexes** | List queries use only `companyId`; no composite index required for the current where. If orderBy is added later, indexes may be needed. |
| **Email in two places** | Email stored in both `employees` and `users`; edit form does not update email (auth identity). If changed elsewhere, can drift. |
| **No delete** | Deleting an employee is not in the UI; Firestore rules allow delete for same-company or developer. Orphaned auth users if done via backend. |

---

## 8. Supabase equivalent mapping (when using invites)

When moving to Supabase with “employees require auth” and invite-based flow:

| Current (Firebase) | Supabase equivalent |
|--------------------|----------------------|
| **Create:** Admin enters email + password; `createUserWithEmailAndPassword(authEmployeeCreate, …)` then setDoc employees + users | **Invite:** Company-admin calls Edge Function (service role). Function: create user (e.g. invite by email or admin.createUser), insert `profiles` and `employees` with `user_id` = auth user id, send invite/magic link. Client never sees password; no secondary app. |
| **List:** onSnapshot(employees where companyId) | Realtime on `employees` with `company_id = current_company_id()` or Supabase channel with filter. |
| **List users for email:** onSnapshot(users where companyId) | Can join `employees` with `profiles` (or keep email on employees) so one table or view; no separate users list needed if emails are on employees/profiles. |
| **Edit:** updateDoc(employees), setDoc(users merge permissions) | UPDATE `employees` (and optionally `profiles`) with RLS: same-company or developer; trigger can block company_id/role change by non-developer. |
| **Auth:** Secondary app to avoid logout | Not needed; user creation happens in Edge Function with service role; admin stays on main session. |
| **Permissions** | Store on `profiles` or `employees` (jsonb); RLS and app logic read from one place. |

The doc **Employee auth flow** (`/docs/employee-auth-flow.md`) describes the secure invite flow (Edge Function, service role, insert profiles + employees, send invite email).
