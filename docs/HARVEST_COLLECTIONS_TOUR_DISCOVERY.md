# Harvest Collections — Full Product Tour / Guided Onboarding — Discovery & Requirements Audit

**Purpose:** Deep discovery and requirements audit before implementing any tour. No build yet.

---

# PHASE 1 — DISCOVERY / AUDIT

## 1. Page structure

### Overall Harvest Collections page
- **Entry:** Reached via Harvest / Harvest Collections (project must be selected; French Beans project gates full flow).
- **No project:** Message: "Select a project from the navbar to manage field harvest collections (pickers, weigh-in, cash payouts, buyer settlement)."
- **Wrong project type:** "Project not found or you don't have access… open Harvest Collections from the Harvest page for a French Beans project."
- **Single file:** `src/pages/HarvestCollectionsPage.tsx` (~3,750 lines); no sub-routes.

### List view (no collection selected)
- **Header:** Back (to Harvest Sales), title "Harvest Collections", Sync Offline Data (if pending/offline), **New collection** (if `canCreateCollection`), Wallet popover (if `canViewFinancials` and has French Beans collections).
- **Project label:** "Project: {effectiveProject.name}".
- **Filters:** All | Active | Closed (buttons).
- **Active collections:** Grid of cards; each shows name (or harvest date), status badge, icon, harvest date, Total kg, Pickers count, optional KES total.
- **Closed collections:** Same grid; "CLOSED" watermark; green "closed" badge; same metadata.
- **Empty state:** "No collections yet. Start a day session with 'New collection'."

### Collection cards (list)
- **Click:** Sets `selectedCollectionId`, `viewMode` to first available detail tab (intake / pay / buyer).
- **Content:** Name or `formatDate(harvestDate)`, status, icon, harvest date line, "Total: X kg", "Pickers: N", KES only if `canViewPaymentAmounts`.

### Collection detail view (collection selected)
- **Header:** Back (clears selection), title = collection name or "Collection"; Sync Offline Data; Wallet button (if French Beans + `canViewFinancials`).
- **Stats row (collapsible):** Collection name, @ X/kg; **Total kg** (SimpleStatCard); **Total picker due** (KES, if `canViewPaymentAmounts`); **Buyer sale** card (if closed + financials: revenue, profit, eye toggle).
- **Controls:** Chevron to expand/collapse stats; **Quick Mode** toggle (Zap icon); **Wallet** popover (Harvest Cash Wallet: amount paid out this collection, remaining picker balance, set cash received, source).
- **Tabs:** Intake | Pay | Buyer (each only if permission exists). Tab triggers are prominent buttons (emerald/amber/violet).

### Tabs / modes
- **viewMode:** `'list' | 'intake' | 'pay' | 'buyer'`.
- **detailModes:** Built from permissions: intake if `canManageIntake`, pay if `canPayPickers`, buyer if `canViewBuyerSection`. If user has no detail permission, a single card says "Access restricted. Your account can view collections but cannot access intake, payout, or buyer actions."

### Quick Mode
- **Toggle:** "Quick Mode" button; when on, intake and pay tabs show streamlined flows.
- **Intake (quick):** Single "Quick Intake" block: Picker number + KG inputs, Save & Stay / Save & Next; below that, "Entries" with Entered / Remaining counts and **grouped recent entries by picker** (collapsed by default; expand to see child entries with kg, price, time, Edit/Delete).
- **Intake (non-quick):** "Add picker", "Repeat last" (if any), grid of **picker cards**; each card: number, name, total kg (and optional KES), trip count, PAID badge if paid, "+ add" or "View"; click card opens Add weight dialog.
- **Pay (quick):** "Quick Pay" panel: queue summary (N pickers, KES remaining); current picker (number, name, balance, total due, paid, payment history); Pay Full / Pay Partial / Skip; entry list (kg, amount, time, Edit/Delete).
- **Pay (non-quick):** List/grid of pickers with pay actions and batch pay.

### Picker cards (Intake tab, non–Quick Mode)
- One card per picker; sort: unpaid first, then by balance desc.
- Content: trip count badge, picker number circle, name, "X kg" and optional "KES Y", PAID badge and "View" or "+ add".
- **Click:** Opens "Add weight" dialog with that picker pre-selected (and "Repeat last" updates).

### Picker modal / Add weight dialog
- **Title:** "Add weight".
- **Content:** Picker display or selector; Weight (kg); Trip number; **Save & Stay** / **Save & Next** (no Cancel/Save); **Entries** section = mini ledger for current picker: #, KG, Price, Time, Edit/Delete per row, Total row.
- **Opened from:** Picker card click or "Add weight" from elsewhere; can be opened for a paid picker (view-only for pay actions elsewhere).

### Stats cards (detail)
- **Total kg:** From `collectionFinancials.totalHarvestQty` (sum of intake entries).
- **Total picker due:** KES from `collectionFinancials.totalPickerDue` (total kg × picker rate).
- **Buyer sale (when closed):** Revenue (total kg × buyer price), Profit (revenue − paid out); amounts can be hidden with eye toggle.

### Wallet area
- **Visibility:** Only when French Beans collection and `canViewFinancials`; Wallet button in header (list) or next to Quick Mode (detail).
- **Popover:** "Harvest Cash Wallet"; amount paid out (this collection); remaining picker balance; "Set cash received (KES)" + source (Bank / Custom); Add/Update Cash. Some values can be blurred until user toggles visibility.

### Buyer section (Buyer tab)
- **Card:** "Buyer sale".
- When closed: shows buyer price per kg; message about revenue/profit in card and paid out in Wallet.
- When open: **Price per kg (buyer) — KES** input; preview of Total revenue, Total paid out, Profit; **Save buyer price** and **MARK BUYER PAID** (latter requires all pickers paid + `canCloseHarvest`). Warning if not all pickers paid; note if user can save price but not close.

### Payment section (Pay tab)
- Quick: Quick Pay queue, current picker, Pay Full / Pay Partial, payment history.
- Non-quick: Picker list with per-picker pay and batch selection.

### Intake section (Intake tab)
- Quick: Quick Intake form + grouped recent entries (Entered / Remaining).
- Non-quick: Add picker, Repeat last, grid of picker cards opening Add weight dialog.

---

## 2. User workflows (end-to-end)

| Workflow | Steps | Permissions / notes |
|----------|--------|----------------------|
| **Create collection** | New collection → Name, Harvest date, Price per kg (picker) → Create | `canCreateCollection` (create or recordIntake). |
| **Add pickers** | Open collection → Intake → Add picker → Picker number (unique), Name → Next | `canManageIntake`. Number must be unique in collection. |
| **Record intake (card)** | Intake → Click picker card → Add weight: picker fixed, kg, trip → Save & Stay / Save & Next | `canManageIntake`. Trip can override suggested. |
| **Record intake (Quick)** | Intake + Quick Mode → Picker number, KG → Save & Stay / Save & Next | Same; focuses speed. |
| **Edit entry** | From Quick Intake entries, Add weight ledger, or Quick Pay entry list → Edit → Change picker and/or kg → Save | Edit entry dialog; `canManageIntake`; totals recompute. |
| **Delete entry** | Same places → Delete → Confirm | `deletePickerIntakeEntry`; totals update. |
| **Grouped entries** | Quick Intake: entries grouped by picker; collapse/expand; per-picker total kg and entry count | Display only; edit/delete by entry id. |
| **Open picker card** | Intake (non-quick) → Click any card (paid or not) → Add weight dialog | Always allowed; paid cards show "View". |
| **Picker ledger** | Add weight dialog → Entries table for selected picker (#, KG, Price, Time, Edit/Delete, Total) | Same picker’s entries; price = kg × rate. |
| **Pay picker (single)** | Pay tab → Select picker → Pay Full or Pay Partial → amount → confirm | `canPayPickers`; writes `picker_payment_entries`; queue/totals refresh. |
| **Quick Pay** | Pay + Quick Mode → Queue shows unpaid; Pay Full / Pay Partial / Skip; auto-advance next | Same permission; balance ≤ 0 removes from queue. |
| **Partial payment** | Pay Partial → enter amount → save | Multiple payment rows per picker; balance = due − sum(paid). |
| **Mark buyer paid** | Buyer tab → Set price per kg → MARK BUYER PAID | `canCloseHarvest`; requires all pickers paid. |
| **Wallet / cash** | Wallet button → Set cash received (KES), source → Add/Update Cash | French Beans + `canViewFinancials`; project wallet. |
| **Payout visibility** | Expenses page: Picker Payout rows from `picker_payment_entries` in Recent Expenses; click → payout detail modal | Same data; no duplicate expense records. |
| **Collection totals** | Stats row + Wallet: Total kg, Total picker due, Paid out, Remaining balance, Revenue, Profit | All derived from intake + payment entries and buyer price. |

---

## 3. Data meanings

| Term | Meaning | Source |
|------|--------|--------|
| **Total KG** | Sum of all intake entry weights for the collection | `collectionFinancials.totalHarvestQty` = sum(intake.quantity/weightKg). |
| **Total Picker Due** | Total amount owed to pickers at collection rate | `totalHarvestQty × picker_price_per_unit`. |
| **Paid Out** | Sum of all payments recorded for this collection | `collectionFinancials.totalPaidOut` = sum(picker_payment_entries.amount_paid). |
| **Remaining Balance** | What is still owed to pickers | `collectionFinancials.pickerBalance` = totalPickerDue − totalPaidOut. |
| **Buyer Sale** | Revenue from selling harvest to buyer | totalHarvestQty × buyer_price_per_kg (when set). |
| **Revenue** | Same as buyer sale when closed | totalHarvestQty × buyerPricePerUnit. |
| **Profit** | revenue − totalPaidOut | Shown in Buyer card when closed. |
| **Wallet** | Project-level harvest cash: cash received (credits), payouts (debits) | finance.project_wallet_ledger; "amount paid out this collection" and "remaining picker balance" in popover. |
| **Entered count** | Number of distinct pickers with at least one intake entry | `uniqueEnteredPickersCount` = |distinct picker_id| in intake. |
| **Remaining pickers** | Pickers not yet weighed today | `remainingPickersCount` = pickersForCollection.length − uniqueEnteredPickersCount. |
| **Grouped entries** | Quick Intake: one row per picker when collapsed; expand = child rows (kg, price, time, edit/delete). | By picker_id; totals = sum(child kg). |
| **Picker due** | For one picker: total kg × picker rate | `pickerTotalsById[id].totalPay`. |
| **Total paid (picker)** | Sum of payment entries for that picker | `paidByPickerId[id]`. |
| **Balance (picker)** | picker due − total paid | max(0, totalPay − paid). |
| **Collection date** | Harvest day for the collection | `collection_date` (or `created_at` fallback) on card. |
| **Collection status** | collecting | payout_complete | sold | closed (and legacy is_closed) | Drives UI (e.g. closed = no new intake, buyer price locked). |

---

## 4. Permissions / roles

**Harvest module permissions (from `lib/permissions.ts` and page):**

| Permission | Used for |
|------------|----------|
| `harvest.view` | Base access (default minimal has false; presets can grant). |
| `harvest.create` | Create collection; part of `canCreateCollection`. |
| `harvest.recordIntake` | Record intake; add picker; part of `canManageIntake`. |
| `harvest.edit` | Edit intake entries; part of `canManageIntake`. |
| `harvest.close` | Mark buyer paid / close harvest. |
| `harvest.viewFinancials` | See amounts (Total picker due, Wallet, Buyer revenue/profit); Wallet button. |
| `harvest.payPickers` | Pay tab; Quick Pay; Pay Full / Pay Partial; `canViewPaymentAmounts`. |
| `harvest.viewBuyerSection` | Buyer tab and buyer sale card. |

**Derived flags on page:**
- `canCreateCollection` = create || recordIntake  
- `canManageIntake` = recordIntake || edit || create  
- `canPayPickers`  
- `canViewBuyerSection`  
- `canCloseHarvest` = close  
- `canViewFinancials`  
- `canViewPaymentAmounts` = payPickers || viewFinancials  

**Role relevance:** Presets (e.g. field worker, cashier, manager, company_admin) set different combinations; tour may need to branch on these so users only see steps for what they can do.

---

## 5. Existing UI and components

**Files / components:**
- **Page:** `src/pages/HarvestCollectionsPage.tsx` (single component, no sub-pages).
- **UI primitives:** `Dialog`, `Button`, `Input`, `Label`, `Card`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, `Popover`, `Select`, `SimpleStatCard`.
- **Services:** `harvestCollectionsService.ts` (collections, pickers, intake, payments, financials), `projectWalletService.ts` (wallet ledger/totals).

**Stable anchors today:**
- **data-tour:** Not used on Harvest Collections page. Used elsewhere (e.g. `data-tour="manager-operations-header"`, `data-tour="new-operation-button"`, `data-tour="bottom-navigation"`).
- **IDs:** `id="quick-intake-picker-num"`, `id="quick-intake-kg"`, `id="quick-pay-partial-amount-inline"` (good for tour targets).
- **aria-label:** Several (e.g. "Edit entry", "Delete entry", "Select X for batch pay"); not used as tour targets but good for a11y.

**Dynamic UI that can affect a tour:**
- **No collection selected vs selected:** Entire right side switches from list to detail (tabs, stats, Quick Mode).
- **Quick Mode on/off:** Intake and Pay content change completely (form + grouped list vs picker grid / pay list).
- **detailModes:** Tabs shown depend on permissions (intake/pay/buyer); if none, no tabs, only restricted message.
- **French Beans:** Wallet and some wallet-related messaging only for French Beans project.
- **Collection status:** Closed hides intake actions, disables buyer price input, changes Buyer tab copy.
- **Empty states:** No collections; no pickers; no unpaid pickers (Quick Pay queue empty).

---

## 6. Edge cases and confusing areas

| Area | Behavior | Risk for users |
|------|----------|----------------|
| **Picker fully paid** | Card still clickable ("View"); Pay Full/Partial disabled in Quick Pay; picker drops out of Quick Pay queue. | May think paid pickers are "locked"; need to teach that View is for ledger/history. |
| **Same picker, same kg, same minute** | Multiple separate intake entries (identity by DB id); grouped view shows multiple rows; edit/delete by entry id. | Users may think duplicates are merged or that they can’t have two identical-looking rows. |
| **Offline** | Intake/payment can queue; "Sync Offline Data" appears; toasts say "saved offline" / "will sync when online". | Need to explain that data is stored locally and synced later. |
| **Clerk / auth failure** | App has Clerk error boundary and emergency access; Harvest page doesn’t special-case auth. | Tour doesn’t need to teach auth; general app tour might. |
| **Missing data** | No collection → empty state; no pickers → "Add picker"; no intake → Total kg 0; no payments → Paid out 0. | First-time flow: create collection → add pickers → weigh → pay; tour should follow this. |
| **Wrong picker on entry** | Edit entry → change Picker (reassign) → Save; totals move from old to new picker. | Reassignment is possible but not obvious; tour can call out "Edit to fix wrong picker." |
| **Edit/delete entry** | Totals (picker and collection) recompute after save; Quick Intake grouped totals and Pay balance update. | Users must understand that edit/delete affect totals immediately. |
| **Closed collection** | No new intake; no add picker; buyer price read-only; "MARK BUYER PAID" hidden or N/A. | Need to explain that closing locks intake and buyer price. |
| **No permission for tab** | Tab not shown; if only one permission, user goes straight to that mode. | Tour steps must be conditional on visible tabs/actions. |
| **Wallet vs Paid Out** | Wallet = project-level cash (received vs debits); "Paid out" in collection = sum of picker payments. | Conceptually different; tour should clarify "cash received" vs "amount paid to pickers." |

---

# PHASE 2 — QUESTIONS FOR YOU (BEFORE IMPLEMENTATION)

Answer these so the tour can be designed and built correctly.

## Audience and triggers
1. **Who should see the tour?** Everyone who can open Harvest Collections, or only first-time visitors, or only certain roles (e.g. field operators and cashiers)?
2. **Should the tour differ by role?** e.g. Shorter “viewer” path vs full “operator” path (intake + pay + buyer + wallet)?
3. **When should it run?** Automatically on first visit to Harvest Collections, or only when user clicks “Take a tour” / “Help”, or both (auto once + replay from help)?
4. **Replay:** Should users be able to replay the full tour (or a role-specific segment) from the UI? If yes, where (e.g. header button, help menu)?

## Scope and depth
5. **Which workflows are most important to teach first?** e.g. (1) Create collection → Add pickers → Record intake, (2) Quick Intake, (3) Quick Pay, (4) Buyer close, (5) Wallet. Rank or choose “must cover” vs “optional.”
6. **Should the tour explain only buttons and layout, or also operational logic?** e.g. “Total picker due = total kg × rate”, “Pay Partial adds a payment and reduces balance”, “All pickers must be paid before closing.”
7. **Warnings and best practices:** Should it include “don’t close until all pickers are paid”, “use Edit to fix wrong picker”, “same picker can have multiple entries with same kg”?
8. **Wallet and payouts:** One step (“Wallet = cash received for this project”), or skip for non-finance roles?
9. **Buyer flow:** Full explanation (price, revenue, profit, MARK BUYER PAID) or just “set buyer price and close when done”?
10. **Grouped entries and picker ledger:** Explain that entries are grouped by picker and that the mini ledger in Add weight shows that picker’s entries, or keep tour high-level?
11. **Quick Intake vs non-quick:** One flow (e.g. Quick only) or both (e.g. “Quick Mode for speed, or use picker cards”)?
12. **Quick Pay vs list pay:** Same question: one path or both?

## Format and UX
13. **Tooltips only vs guided steps:** Only highlight + tooltip, or step-by-step that moves focus (e.g. “Click here next”) and optionally drives the user to perform an action?
14. **Mobile:** Separate mobile-only steps (e.g. bottom nav, smaller tap targets) or same steps with responsive placement?
15. **Pause on action:** Should the tour pause while the user performs an action (e.g. “Create a collection now”) and resume when done, or stay informational only (no required clicks)?
16. **Videos/GIFs/help text:** Plan for future media or links to help docs in tooltips, or text-only for now?

## Structure
17. **Teach by section, by role, or by workflow?** e.g. (A) Section-based: List → Detail → Intake → Pay → Buyer → Wallet; (B) Role-based: “Field operator path” then “Cashier path”; (C) Workflow-based: “Day setup” then “Weigh-in” then “Payout” then “Close.”
18. **Length:** Prefer short (5–10 steps, must-do only) or full (15–25 steps, every section and concept)?
19. **Conditional steps:** If a step’s target is missing (e.g. no Wallet for non–French Beans), skip step or show a “Not available for this project” message?

---

# PHASE 3 — DELIVERABLES (NO BUILD YET)

## 1. Map of the Harvest Collections module

```
Harvest Collections Page
├── [No project] → Message + project selector
├── [Project selected]
│   ├── List view (no collection selected)
│   │   ├── Header: Back, Title, Sync, New collection, Wallet (conditional)
│   │   ├── Project + Filter (All | Active | Closed)
│   │   ├── Active collections (cards)
│   │   └── Closed collections (cards)
│   │
│   └── Detail view (collection selected)
│       ├── Header: Back, Collection name, Sync, Wallet (conditional)
│       ├── Stats (collapsible): Name, @/kg, Total kg, Total picker due, Buyer sale (if closed)
│       ├── Quick Mode toggle + Wallet popover
│       ├── Tabs: Intake | Pay | Buyer (permission-based)
│       │
│       ├── Intake tab
│       │   ├── Quick Mode ON:  Quick Intake (picker + kg, Save & Stay/Next) + Entered/Remaining + Grouped entries
│       │   └── Quick Mode OFF: Add picker, Repeat last, Picker cards → Add weight dialog (picker, kg, trip, ledger)
│       │
│       ├── Pay tab
│       │   ├── Quick Mode ON:  Quick Pay (queue, current picker, Pay Full/Partial/Skip, payment history, entries)
│       │   └── Quick Mode OFF: Picker list + batch pay
│       │
│       └── Buyer tab: Buyer sale card (price input, revenue/profit preview, Save price, MARK BUYER PAID)
│
├── Dialogs: New collection, Add picker, Add weight, Edit entry, (batch/cash elsewhere)
└── [No detail permission] → Single “Access restricted” card
```

## 2. Major UI sections and actions

| Section | Actions / elements |
|--------|--------------------|
| List header | Back, Title, Sync Offline Data, New collection, Wallet |
| List filters | All, Active, Closed |
| Collection cards | Click to open collection |
| Detail header | Back, Collection name, Sync, Wallet |
| Stats row | Expand/collapse, Total kg, Total picker due, Buyer sale (Revenue, Profit, eye) |
| Quick Mode | Toggle On/Off |
| Wallet popover | View amounts, Set cash received, Source, Add/Update Cash |
| Intake tab (quick) | Picker number, KG, Save & Stay, Save & Next, Entered/Remaining, Grouped entries (expand, Edit, Delete) |
| Intake tab (non-quick) | Add picker, Repeat last, Picker cards (click → Add weight) |
| Add weight dialog | Picker (fixed or select), Weight, Trip, Save & Stay, Save & Next, Entries ledger (Edit, Delete) |
| Pay tab (quick) | Queue summary, Current picker (Balance, Due, Paid), Pay Full, Pay Partial, Skip, Payment history, Entry list |
| Pay tab (non-quick) | Picker list, per-picker pay, batch select |
| Buyer tab | Price per kg input, Save buyer price, MARK BUYER PAID |
| New collection dialog | Name, Harvest date, Price per kg (picker), Create |
| Add picker dialog | Picker number, Picker name, Next |
| Edit entry dialog | Picker select, Weight (kg), Save, Cancel |

## 3. Confusing areas that need help

- What “Total picker due”, “Paid out”, “Remaining balance” mean and how they relate.
- Difference between Wallet (cash in/out) and “Paid out” (sum of picker payments).
- That paid pickers stay clickable for “View” (ledger/history), but Pay buttons are disabled.
- That multiple identical-looking entries (same picker, same kg, same minute) are valid and separate; edit/delete by entry, not by “duplicate.”
- How to fix a wrong picker (Edit entry → change Picker).
- That closing requires all pickers paid and locks intake and buyer price.
- When to use Quick Mode vs picker cards / list pay.
- Offline: data queues and syncs later; when to use “Sync Offline Data.”

## 4. Recommended tour structure (draft)

- **Option A — Workflow-first (recommended for operations):**  
  1) What Harvest Collections is (list + cards).  
  2) Start the day: New collection → Add pickers.  
  3) Weigh-in: Intake tab, Quick Mode or cards, Add weight, optional Edit/Delete.  
  4) Payout: Pay tab, Quick Pay or list, Pay Full/Partial, payment history.  
  5) Close: Buyer tab, set price, MARK BUYER PAID (and Wallet if French Beans).  
  6) Optional: Wallet, totals meaning, replay.

- **Option B — Section-first:**  
  List → Select collection → Stats → Intake tab → Pay tab → Buyer tab → Wallet.  
  Fewer “why” and more “where.”

- **Option C — Role-based:**  
  Define 3–4 paths (e.g. Viewer, Field operator, Cashier, Manager) and run steps whose targets are visible for current user.

## 5. Suggested tour versions by role

| Role | Suggested steps (high level) |
|------|------------------------------|
| **Viewer (harvest.view only)** | List, collection cards, stats (if any), “Contact admin for intake/pay.” |
| **Field operator (recordIntake, no pay)** | List, New collection, Add pickers, Intake (Quick + entries), Add weight, Edit/Delete; no Pay/Buyer. |
| **Cashier (payPickers, maybe viewFinancials)** | List, select collection, Pay tab, Quick Pay, Pay Full/Partial, payment history; optional Wallet. |
| **Manager / admin (full)** | Full workflow: create → pickers → intake → pay → buyer → close; Wallet; totals meaning. |

## 6. Detailed question list (for you to answer)

*(Already listed in Phase 2 above; 19 questions.)*

## 7. Suggested technical approach

- **Library:** Keep using **react-joyride** (already in `TourProvider.tsx` for dashboard) for consistency.
- **Scope:** Either extend `TourProvider` with a Harvest Collections tour (route `/harvest-collections` or project-scoped route) or add a dedicated `HarvestCollectionsTour` that runs only on this page.
- **Anchors:** Add `data-tour="harvest-*"` attributes to key elements (e.g. `harvest-header`, `harvest-new-collection`, `harvest-collection-cards`, `harvest-stats`, `harvest-quick-mode`, `harvest-tab-intake`, `harvest-tab-pay`, `harvest-tab-buyer`, `harvest-quick-intake-form`, `harvest-quick-pay-panel`, `harvest-wallet-btn`, `harvest-add-picker`, `harvest-add-weight-dialog`). Use stable wrappers where the DOM is dynamic (e.g. first collection card, or “current picker” in Quick Pay).
- **Conditional steps:** For each step, check that `target` exists (and optionally that user has permission); skip or show “Not available” so the tour never breaks.
- **State:** Store “Harvest Collections tour completed” in localStorage (e.g. `farmvault:tour:harvest-collections-completed:v1`) and optionally “last run version” to allow re-runs after content changes.
- **Trigger:** From header (“Take a tour” / “Help”) and/or auto once per user/session when they land on Harvest Collections with a project selected.

## 8. Recommended trigger points and anchor points

| Trigger | When |
|--------|------|
| **Auto (optional)** | First visit to Harvest Collections with a project selected (and not completed before). |
| **Manual** | “Take a tour” or “Help” in page header or in a help menu. |

**Suggested `data-tour` anchors (to add):**

- `harvest-collections-title` — Page title (list or collection name).
- `harvest-new-collection` — New collection button.
- `harvest-collection-cards` — Container for collection cards (or first card).
- `harvest-back` — Back button (when in detail).
- `harvest-stats` — Stats row (Total kg, Total picker due, etc.).
- `harvest-quick-mode` — Quick Mode toggle.
- `harvest-tab-intake` — Intake tab trigger.
- `harvest-tab-pay` — Pay tab trigger.
- `harvest-tab-buyer` — Buyer tab trigger.
- `harvest-quick-intake-form` — Picker number + KG + Save (when Quick Mode + Intake).
- `harvest-entries-grouped` — Entered/Remaining + grouped entries block.
- `harvest-add-picker` — Add picker button (when not Quick).
- `harvest-picker-cards` — Picker cards container (or first card).
- `harvest-quick-pay-panel` — Quick Pay panel (queue + current picker).
- `harvest-pay-full` — Pay Full button.
- `harvest-pay-partial` — Pay Partial button.
- `harvest-wallet-btn` — Wallet button (if visible).
- `harvest-buyer-price` — Buyer price input.
- `harvest-mark-buyer-paid` — MARK BUYER PAID button.

---

**Next step:** After you answer the Phase 2 questions, the tour can be designed in detail (exact steps, copy, and conditional logic) and then implemented using the Phase 3 approach and anchors above.
