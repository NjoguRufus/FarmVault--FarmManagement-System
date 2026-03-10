# FarmVault Planning System — Discovery Audit (No UI Changes)

Audit date: 2026-03-10  
Scope: Planning page, season stages, season challenges, syncing across pages  
Constraint honored: **Discovery only** (no redesign implemented)

## SECTION 1 — Planning Page Structure

### Primary page file(s)
- `src/pages/ProjectPlanningPage.tsx`: **Project Planning / Plan Season** page for `/projects/:projectId/planning`

### High-level structure (UI sections)
The page renders:
- **Header**
  - `PlanningHero` (`src/components/planning/PlanningHero.tsx`): back-to-project + “Planning” status badge + info tooltip.
- **Main grid** (`grid-cols-1 xl:grid-cols-3`)
  - **Left (xl: span 2)**
    - Planting Date Planning (inline card + modal to change planting date + reason)
    - Seed & Variety Planning (inline card + supplier select UI; reason required when changing)
    - Season Stages (`SeasonStagesBuilder`)
    - Expected Challenges (`ExpectedChallengesCard` + add form)
  - **Right**
    - Planning Summary (`PlanningSummaryCard`)
    - Planning History (`PlanningHistoryCard`)

### Data fetched
- **Project**
  - Loaded via React Query in `ProjectPlanningPage.tsx`:
    - `queryKey: ['project', companyId, projectId]`
    - `queryFn: getProject(projectId)`
  - Service: `src/services/projectsService.ts` → Supabase select includes `planning` JSONB + `planting_date` etc.
- **Stages**
  - `useProjectStages(companyId, projectId)` (`src/hooks/useProjectStages.ts`)
  - Calls `listProjectStages(projectId)` in `src/services/projectsService.ts` which selects from **Supabase** `project_stages` (schema-qualified through `db.projects()`).
  - **Important**: In current `ProjectPlanningPage.tsx`, fetched `stages` are *not used* to render the “Season Stages” UI. The displayed stages are computed from crop timeline templates.
- **Season challenges (project-scoped)**
  - `useSeasonChallenges(companyId, projectId)` (`src/hooks/useSeasonChallenges.ts`)
  - Service: `src/services/seasonChallengesService.ts` → Supabase table `season_challenges` (currently accessed via `db.public()`).
- **Suppliers**
  - `useCollection('suppliers', 'suppliers', scope)` (`src/hooks/useCollection.ts`) → Firestore stub realtime subscription.
- **Crop catalog / knowledge**
  - `useCropCatalog(companyId)` + `findCropKnowledgeByTypeKey(...)` → knowledge layer.

### Planning state management
`ProjectPlanningPage.tsx` uses local React state for inputs + writes to:
- `projects.planting_date` (date column)
- `projects.planning` (JSONB), especially `planning.seed` and `planning.planHistory`

Notably:
- The page defines `expectedChallenges = project?.planning?.expectedChallenges ?? []`, but the UI’s “Expected Challenges” section uses `useSeasonChallenges` results (see Section 3).

## SECTION 2 — Data Model (Tables / Collections)

> FarmVault currently uses a **hybrid** persistence model: some domains are Supabase, others still use a Firestore stub for realtime/offline.

### Supabase tables (confirmed by migrations + services)

#### `projects.projects`
- **Stores**: project core fields + planning metadata.
- **Key columns used**
  - `id`, `company_id`, `name`, `crop_type`, `environment`, `status`
  - `planting_date`, `expected_harvest_date`, `expected_end_date`
  - `field_size`, `field_unit`, `notes`
  - `planning` (JSONB)
- **Relationships**
  - `company_id` tenant scope
  - `id` referenced by stages and challenges tables

#### `projects.project_stages`
- **Stores**: per-project stage rows (planned/actual dates, progress, current flag).
- **Columns** (see initial schema + later migrations)
  - `company_id`, `project_id`, `stage_key`, `stage_name`
  - `start_date`, `end_date`, `planned_start_date`, `planned_end_date`, `actual_start_date`, `actual_end_date`
  - `is_current`, `progress`, timestamps, `created_by`
- **Relationships**
  - `project_id` → `projects.projects(id)`
  - `company_id` tenant scope

#### `public.season_challenges`
- **Stores**: both planned (“expected”) and in-season challenges.
- **Columns** (as used by `src/services/seasonChallengesService.ts`)
  - `company_id`, `project_id`, `crop_type`
  - `title`, `description`, `challenge_type`
  - `stage_index`, `stage_name` (optional linkage)
  - `severity`, `status`
  - `date_identified`, `date_resolved`
  - `what_was_done`, `items_used` (JSON), `plan2_if_fails`
  - `source`, `source_plan_challenge_id`
  - `created_by`, `created_by_name`, timestamps
- **Relationships**
  - `project_id` → `projects.projects(id)`
  - `company_id` tenant scope

#### `public.challenge_templates` (exists in migrations)
- Present in `supabase/migrations/20240101000001_farmvault_schema.sql`.
- **Current UI code** uses a Firestore stub collection (`challengeTemplates`) instead (see Section 3/4).

### Firestore stub collections (used by `useCollection`)
Common collections (non-exhaustive) that appear in the codebase:
- `suppliers`
- `workLogs`, `expenses`, `inventoryUsage`, `inventoryItems`, `employees`
- `projectStages` (Firestore) — **exists in legacy code paths** (see `src/services/stageService.ts`)
- `challengeTemplates` (Firestore) — used by `src/services/challengeTemplatesService.ts`

## SECTION 3 — Challenge System (Critical)

### Where expected challenges are stored (current behavior)
**Expected challenges shown on the Planning page are stored in `public.season_challenges`.**

Evidence:
- Planning page “Expected Challenges” is built from:
  - `useSeasonChallenges(companyId, projectId)`
  - Mapped to `expectedChallengeItems` and passed to `ExpectedChallengesCard`
- The create flow marks planned challenges with:
  - `source: 'preseason-plan'`
  - `status: 'identified'`

### Where real-time challenges are stored
Also **`public.season_challenges`** (same table). Differentiation is by:
- `source` (e.g. `preseason-plan` vs other/blank)
- stage linkage fields (`stage_index`, `stage_name`) when present
- lifecycle fields (`status`, `date_resolved`, `what_was_done`, `items_used`, `plan2_if_fails`)

### What tables store challenges?
- **Primary**: `public.season_challenges`
- **Templates / reusable challenge ideas** (two competing storages exist):
  - Supabase: `public.challenge_templates` (exists in migrations)
  - Firestore stub: `challengeTemplates` collection (used by UI service)

### Are challenges linked to projects?
Yes:
- DB requires `project_id` for season challenges.
- The shared hook supports project filtering.

### Are challenges linked to stages?
Optionally.
- DB columns: `stage_index` (int), `stage_name` (text) are nullable.
- Current “planned challenge” creation in `ProjectPlanningPage.tsx` does **not** set stage linkage by default.

### Where challenges appear in the UI (and how they connect)
- **Planning page** (`ProjectPlanningPage.tsx`)
  - “Expected Challenges” section uses `useSeasonChallenges(companyId, projectId)`.
- **Project Details page** (`src/pages/ProjectDetailsPage.tsx`)
  - Fetches challenges via the same hook and filters by project.
  - Displays a small “Season Challenges” panel (`ProjectChallengesPanel`).
- **Season Challenges page** (`src/pages/SeasonChallengesPage.tsx`)
  - Uses `useSeasonChallenges(companyId, activeProject?.id)`.
  - Displays full create/edit lifecycle with status transitions and resolution fields.

## SECTION 4 — Challenge Types

### Definition location
- `src/types/index.ts`:
  - `export type ChallengeType = 'weather' | 'pests' | 'diseases' | 'prices' | 'labor' | 'equipment' | 'other';`

### Storage format
- `season_challenges.challenge_type`: **text** (free-text in DB, but UI treats it as enum-like).
- Severity: stored as text; UI treats as `'low' | 'medium' | 'high'`.
- Status: stored as text; UI treats as `'identified' | 'mitigating' | 'resolved'`.

## SECTION 5 — Challenge Creation Flow (Trace)

### A) Planning page “Add planned challenge”
Path: `src/pages/ProjectPlanningPage.tsx`

Flow:
1. User fills the add form in `ExpectedChallengesCard`.
2. Submit triggers `handleAddExpectedChallenge`.
3. UI calls `createSeasonChallenge` (`src/services/seasonChallengesService.ts`) with:
   - `companyId`, `projectId`, `cropType`
   - `title`, `description`, `challengeType`, `severity`
   - `status: 'identified'`
   - `source: 'preseason-plan'`
   - `createdBy` (if available)
4. Service inserts into Supabase `public.season_challenges`.
5. UI calls `invalidateSeasonChallengesQuery(queryClient)` which invalidates the React Query key prefix `['seasonChallenges']`.
6. All views using `useSeasonChallenges(...)` refetch and update.

### B) Season Challenges page “Report challenge”
Path: `src/pages/SeasonChallengesPage.tsx`

Flow:
1. User opens “Report Challenge” dialog and submits.
2. `handleReportChallenge` calls `createSeasonChallenge`.
3. Calls `invalidateSeasonChallengesQuery(queryClient)`.
4. (Optional) “Save as reusable template” calls `upsertChallengeTemplate(...)`.
   - **Current implementation** uses Firestore stub `challengeTemplates` collection via `src/services/challengeTemplatesService.ts`.

## SECTION 6 — Challenge Visibility & Syncing

### Are Project Details / Planning / Season Challenges reading from the same source?
Yes for “season challenges”:
- All rely on `useSeasonChallenges(companyId, projectId)` → Supabase `public.season_challenges`.

### Is filtering project-specific?
Yes:
- `listSeasonChallenges(companyId, projectId)` applies `.eq('project_id', projectId)` when provided.

### Expected challenges vs active challenges
Currently **not separate**:
- “Expected/planned” challenges are stored in the same table and differentiated by `source = 'preseason-plan'`.
- In-season challenges may have `source` unset or a different value.

### Sync mechanism
- After mutations, the code invalidates `['seasonChallenges']` which triggers refetch across all pages using the hook.

### Important scoping dependency (Season Challenges page)
- `SeasonChallengesPage` scopes by `activeProject?.id` from `ProjectContext`.
- If `activeProject` isn’t aligned with the project being viewed, the page may show challenges for a different project.

## SECTION 7 — Planning Stages

There are **two stage systems** in play:

### A) Template stages (computed, not stored)
- Defined in `src/config/cropTimelines.ts` per crop.
- Computed using `src/utils/cropStages.ts`:
  - `calculateDaysSince(plantingDate)`
  - `getStageForDay(templateStages, day)`
- Planning page displays stages using:
  - `SeasonStagesBuilder` fed by `getCropTimeline(project.cropType)?.stages`.

**Characteristics**
- Not editable in current Planning UI.
- Derived entirely from planting date + template.

### B) Stored stages (Supabase + legacy Firestore usage)
- Supabase: `projects.project_stages` queried via `useProjectStages` → `listProjectStages`.
- Legacy Firestore: `projectStages` queried in `src/services/stageService.ts`.

**Current Planning page behavior**
- It fetches Supabase stages but does **not** use them for the stage list UI (it uses templates).

### Stage editability
- There is a stage edit modal (`StageEditModal`) used in Project Details for clicking timeline items.
- Stage edits appear designed to persist to stored stage records (project stages), but the Planning page is currently template-led.

## SECTION 8 — Data Flow Diagram (Current)

```text
projects.projects (Supabase)
  - planting_date
  - planning (JSONB): seed, planHistory
        |
        | used to compute timeline
        v
cropTimelines (static config) + cropStages utils (computed)
  -> current stage label / day-of-season / progress
        |
        v
Planning page stage list (template display)

public.season_challenges (Supabase)
  - source='preseason-plan' (planned)
  - status lifecycle (identified/mitigating/resolved)
        |
        v
useSeasonChallenges(companyId, projectId)
  -> Planning “Expected Challenges”
  -> Project Details “Season Challenges” panel
  -> Season Challenges management page
```

## SECTION 9 — Current Limitations / Risk Areas

### Hybrid persistence (Supabase + Firestore stub)
- Planning + season challenges are Supabase-driven.
- Many operational lists (suppliers, work logs, inventory usage, etc.) still use Firestore stub realtime.
- This creates inconsistent realtime/offline behavior across screens and makes rebuilds risky without mapping each domain.

### Duplicate / competing “stage” sources
- Template stages (computed) vs stored stages (Supabase) vs legacy Firestore stages.
- Rebuilds can accidentally break:
  - stage edit workflows
  - current stage detection alignment
  - reporting that assumes stored stage progress

### Expected challenges storage mismatch
- Type system includes `project.planning.expectedChallenges`, but the Planning UI uses `public.season_challenges` as the visible store.
- A redesign that assumes the JSONB `expectedChallenges` array is canonical could “lose” challenges in the UI.

### Challenge templates mismatch
- Supabase includes a `challenge_templates` table in migrations.
- The UI service uses Firestore `challengeTemplates` instead.
- Any rebuild must decide and migrate or keep both consistent.

### Season Challenges page scoping depends on `activeProject`
- Navigation and context sync must be correct; otherwise, filtering can be wrong.

## SECTION 10 — Preparation for Rebuild (No Implementation)

### Decisions required (to support a stable redesign)
- **Canonical storage per domain**:
  - challenges: keep `public.season_challenges` as canonical (recommended, already shared across pages)
  - templates: choose Supabase `challenge_templates` vs Firestore `challengeTemplates` and standardize
  - stages: choose stored stages as canonical (with templates as initial seed) *or* go fully template-led and remove stored-stage coupling

### Likely schema/API impacts (if standardized)
- If templates move to Supabase:
  - update `challengeTemplatesService.ts` and all dependent UI queries
  - migrate existing templates from Firestore (if any) or dual-read until cutover
- If stages become canonical in Supabase:
  - ensure Planning stage UI reads/writes to `projects.project_stages`
  - unify legacy Firestore stage reads (`stageService.ts`) or remove them

### What could break if rebuilt without this audit
- planned challenges no longer appearing everywhere (if `source` conventions change or a new storage is introduced)
- stage progress inconsistencies between Project Details, Crop Stages page, and Planning
- templates disappearing or duplicating due to split storage
