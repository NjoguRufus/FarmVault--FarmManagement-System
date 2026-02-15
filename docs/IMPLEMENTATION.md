# FarmVault Management System — Implementation Guide

**Document Version:** 1.0  
**Last Updated:** February 2025  
**Project:** FarmVault Management — KCA Project

This document describes how to set up, build, test, and deploy the FarmVault application, and outlines implementation conventions and project structure.

---

## 1. Prerequisites

- **Node.js** — v18 or v20 LTS recommended (check with `node -v`).
- **npm** or **yarn** — for installing dependencies.
- **Firebase project** — Create a project at [Firebase Console](https://console.firebase.google.com/) and enable:
  - **Authentication** → Email/Password sign-in method.
  - **Cloud Firestore** → Create database (production or test mode; rules will be deployed separately).
- **Git** — for version control and cloning the repository.

---

## 2. Repository and Project Structure

### 2.1 Clone and Install

```bash
# Clone the repository (replace with your repo URL)
git clone <repository-url>
cd FarmVault-Management-KCA-PROJECT-

# Install dependencies
npm install
```

### 2.2 Directory Structure (Key Folders)

```
FarmVault-Management-KCA-PROJECT-
├── docs/                    # Documentation (SRS, SDS, SYSTEM_DOCUMENTATION, etc.)
├── public/                  # Static assets (e.g. Logo, farm backgrounds)
├── src/
│   ├── components/          # Reusable UI and layout
│   │   ├── auth/            # Route guards (RequireAuth, RequireBroker, etc.)
│   │   ├── dashboard/      # StatCard, charts, tables, DashboardWidgets
│   │   ├── layout/         # MainLayout, AppSidebar, TopNavbar, PaymentReminderBanner
│   │   ├── ui/             # shadcn-style primitives (button, card, dialog, etc.)
│   │   └── ai/             # AIChatButton
│   ├── contexts/           # React context providers
│   │   ├── AuthContext.tsx
│   │   ├── ProjectContext.tsx
│   │   └── NotificationContext.tsx
│   ├── hooks/              # Custom hooks (useCollection, useProjectStages, useWorkCards, etc.)
│   ├── lib/                # Utilities and config
│   │   ├── firebase.ts     # Firebase app, auth, db
│   │   ├── utils.ts
│   │   ├── dateUtils.ts
│   │   ├── cropStageConfig.ts
│   │   └── exportUtils.ts
│   ├── pages/              # Route target components
│   │   ├── Auth/
│   │   ├── admin/
│   │   ├── dashboard/
│   │   └── ...
│   ├── services/           # Firestore and business logic
│   │   ├── authService.ts
│   │   ├── companyService.ts
│   │   ├── workLogService.ts
│   │   ├── operationsWorkCardService.ts
│   │   ├── inventoryService.ts
│   │   ├── harvestCollectionService.ts
│   │   └── ...
│   ├── types/              # TypeScript types (index.ts)
│   ├── data/               # Mock data if any
│   ├── test/               # Test setup
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Optional Firestore indexes
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── postcss.config.js
```

---

## 3. Configuration

### 3.1 Firebase Configuration

Firebase is initialized in `src/lib/firebase.ts`. The config object is currently in code; for production you may move it to environment variables.

**Optional: use environment variables**

1. Create `.env` (and `.env.local` for local overrides). Do not commit `.env.local` if it contains secrets.
2. In `.env`:

   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_MEASUREMENT_ID=...
   ```

3. In `src/lib/firebase.ts`, use `import.meta.env.VITE_FIREBASE_*` instead of hardcoded values.

**Secondary app (employee creation):** The app uses a second Firebase app instance named `EmployeeCreate` so that when an admin creates an employee account, the current user is not signed out. This is already configured in `firebase.ts`.

### 3.2 Vite

- **Entry:** `index.html` loads `src/main.tsx`.
- **Config:** `vite.config.ts` — React (SWC) plugin, path alias `@` → `src`.
- **Modes:** `development` (default for `npm run dev`), `production` (default for `npm run build`). `build:dev` uses `--mode development` for a development build.

### 3.3 TypeScript

- **Config:** `tsconfig.json` (and `tsconfig.node.json` if present). Path alias `@/*` should match Vite’s `@` → `src`.
- **Strictness:** Use strict TypeScript options where possible; types are centralized in `src/types/index.ts`.

### 3.4 Tailwind CSS

- **Config:** `tailwind.config.ts` — content from `./index.html` and `./src/**/*.{ts,tsx}`, theme extensions (e.g. `border-radius`, colors), plugins (e.g. `tailwindcss-animate`, `typography`).
- **FarmVault-specific classes:** Use project classes such as `fv-card`, `fv-btn`, `fv-input`, `fv-badge--*` where defined in the config or CSS.
- **Global styles:** `src/index.css` — Tailwind directives and custom CSS variables (e.g. sidebar, theme).

---

## 4. Scripts and Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (default port, e.g. 5173). Hot reload. |
| `npm run build` | Production build; output in `dist/`. |
| `npm run build:dev` | Build with Vite mode `development`. |
| `npm run preview` | Serve the production build locally (e.g. for QA). |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run Vitest once. |
| `npm run test:watch` | Run Vitest in watch mode. |

### 4.1 Running the Application Locally

```bash
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Use **Setup Company** to create the first company and admin, then sign in.

### 4.2 Production Build and Preview

```bash
npm run build
npm run preview
```

Preview serves the contents of `dist/` so you can test the production build.

---

## 5. Firestore Setup and Deployment

### 5.1 Deploy Security Rules

Ensure you have the Firebase CLI installed and are logged in:

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
```

Deploy only Firestore rules:

```bash
firebase deploy --only firestore:rules
```

Or deploy rules and indexes (if you have `firestore.indexes.json`):

```bash
firebase deploy --only firestore
```

### 5.2 Indexes

If you use composite queries (e.g. `where('companyId', '==', id).orderBy('createdAt', 'desc')`), create the required indexes in the Firebase Console or via `firestore.indexes.json` and deploy.

### 5.3 Initial Data

The app creates data through normal flows (e.g. Setup Company creates company + user). No mandatory seed data is required; optional seed scripts can be added under `scripts/` or documented here if needed.

---

## 6. Testing

- **Runner:** Vitest.
- **Setup:** `src/test/setup.ts` (e.g. global mocks or matchers).
- **Location:** Tests can live next to modules or under `src/test/` (e.g. `example.test.ts`).

Run tests:

```bash
npm run test
npm run test:watch
```

For new features, add unit tests for services and hooks where appropriate; use React Testing Library for component tests if needed.

---

## 7. Linting and Code Style

- **ESLint:** Config in `eslint.config.js`. Run `npm run lint`.
- **Conventions:**
  - Use TypeScript for all new code; types in `src/types/index.ts` or local interfaces.
  - Use existing UI components from `src/components/ui/` and layout from `src/components/layout/`.
  - Use `useCollection` or React Query for Firestore reads; use services in `src/services/` for writes and complex logic.
  - Use `useAuth()`, `useProject()`, `useNotifications()` inside the corresponding providers.
  - Prefer named exports for components and services; default export for page components is acceptable.
  - Use `cn()` from `@/lib/utils` for conditional class names; follow Tailwind and project class names.

---

## 8. Deployment (Hosting)

The app is a static SPA. Any static host that serves `index.html` for client-side routes is suitable.

### 8.1 Firebase Hosting (Example)

```bash
firebase init hosting
# Choose dist as public directory, single-page app: Yes
npm run build
firebase deploy --only hosting
```

### 8.2 Other Hosts

- **Vercel / Netlify:** Connect the repo; build command `npm run build`; publish directory `dist`. Configure redirects so all routes serve `index.html` (SPA).
- **Azure Static Web Apps / AWS S3 + CloudFront:** Same: build → `dist`, SPA fallback to `index.html`.

Ensure environment variables (if used) are set in the host’s dashboard for production.

---

## 9. Implementation Checklist for New Features

1. **Requirements:** Align with SRS (and product owner). Identify FR/NFR IDs.
2. **Design:** Consider SDS: which context, service, or hook; which Firestore collection(s); any new route or guard.
3. **Types:** Add or extend interfaces in `src/types/index.ts` and ensure Firestore payloads match (e.g. Timestamp vs Date; use `toDate()` in `dateUtils` where needed).
4. **Security:** Update `firestore.rules` if new collections or access patterns are introduced.
5. **Backend logic:** Implement or extend services under `src/services/`; keep pages thin (orchestration and UI).
6. **UI:** Reuse `src/components/ui/` and layout; add pages under `src/pages/` and register routes in `App.tsx`. Respect role guards (RequireAuth, RequireNotBroker, etc.).
7. **Data flow:** Use `useCollection` or React Query for reads; call services from handlers for writes; show loading/error and success feedback (e.g. toast).
8. **Testing:** Add or update tests for new services and critical paths.
9. **Docs:** Update SYSTEM_DOCUMENTATION.md (and SRS/SDS if scope changed) and this IMPLEMENTATION.md if new scripts or env vars are added.

---

## 10. Troubleshooting

| Issue | Suggestion |
|-------|------------|
| Firebase permission denied | Check Firestore rules; ensure user is signed in and has `companyId` (or is developer). Check collection and operation (read/create/update/delete). |
| Blank page after login | Check browser console; ensure redirect path exists and role guard allows it. Verify user doc (or employee doc) has correct `role`/`employeeRole` and `companyId`. |
| Build fails (path or module not found) | Verify `@` alias in `vite.config.ts` and `tsconfig.json`. Restart dev server after config change. |
| Styles not applied | Ensure Tailwind content paths in `tailwind.config.ts` include the files you changed. Rebuild. |
| Employee creation logs out admin | Ensure employee creation uses `authEmployeeCreate` (second Firebase app) and not the default `auth`. |

---

## 11. Related Documents

- **SRS:** `docs/SRS_Software_Requirements_Specification.md` — What the system shall do.
- **SDS:** `docs/SDS_Software_Design_Specification.md` — Architecture and design.
- **System Documentation:** `docs/SYSTEM_DOCUMENTATION.md` — Detailed technical description of every page, component, and service.
- **Presentation:** `docs/PRESENTATION.md` — Slide deck / presentation content for the project.

---

*End of Implementation Guide*
