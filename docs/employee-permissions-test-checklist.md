# Employee Permission System Test Checklist

1. Create employee without role:
- In `Employees` page, leave `Role` as `No role (custom permissions)`.
- Save successfully and confirm `employees/{uid}.employeeRole == null` and `permissions` exists.

2. Default safe access:
- Create employee with no role and no preset changes.
- Confirm only `dashboard.view` is true and all other module `view` flags are false.

3. Preset load:
- Select `Inventory Clerk` preset while creating employee.
- Confirm inventory permissions are enabled and unrelated modules remain restricted.

4. Custom override after preset:
- Apply `Viewer` preset, then enable `expenses.create`.
- Save and confirm both preset defaults and override are persisted.

5. Sidebar visibility:
- Login as employee with only `inventory.view = true`.
- Confirm sidebar/bottom nav only shows allowed routes and reflows without gaps.

6. Route guard block:
- As same employee, open `/expenses` directly.
- Confirm `Access Restricted` page is shown.

7. Dashboard card visibility:
- Keep `dashboard.view = true` but disable selected `dashboard.cards.*` permissions.
- Confirm disabled cards are hidden and remaining cards reflow.

8. Expense write denial:
- Login as employee without `expenses.create`.
- Attempt adding an expense and verify Firestore denies write.

9. Inventory deduction write denial:
- Login as employee without `inventory.deduct`.
- Trigger stock deduction flow and verify Firestore denies `inventoryUsage` create.

10. Operations work logging enforcement:
- Login as employee with `operations.recordDailyWork = true`.
- Confirm `workLogs` create and `operationsWorkCards` update are allowed.
- Disable permission and verify both writes are denied.

11. Users/Employees management control:
- Give employee `employees.view` only.
- Confirm employee list is readable, but add/edit actions are hidden and write attempts fail.

12. Permission update takes effect:
- Change an employee permission from admin, then reload employee session.
- Confirm route access and UI actions reflect new permission map after reload.
