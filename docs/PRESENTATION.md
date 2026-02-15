---
marp: true
theme: default
paginate: true
title: FarmVault Management System
description: KCA Project — Presentation
---

# FarmVault Management System
## KCA Project — Presentation

*Use with [Marp](https://marp.app/) (VS Code extension or CLI) to generate PDF/HTML slides. `---` separates slides.*

---

# Slide 1: Title

## FarmVault Management System

**A smart farm operations & decision system for modern agriculture**

- KCA Project
- Multi-tenant • Role-based • Crop-centric

*Presenter: [Your Name] | Date: [Date]*

---

# Slide 2: Problem Statement

## Why FarmVault?

- Farms need **one place** to plan, track, and manage:
  - Projects by crop and season
  - Labour, operations, and work execution
  - Inventory (inputs, chemicals, fuel, fertilizer)
  - Harvests, sales, and market-side activities
  - Expenses and profitability
- **Multiple roles:** Company admins, managers, brokers, drivers, employees — each with different needs.
- **Data-driven decisions** require visibility into stages, costs, and revenue in real time.

---

# Slide 3: Solution Overview

## What FarmVault Delivers

- **Multi-tenant web application** — each company has isolated data.
- **Role-based dashboards** — Company Admin, Manager, Broker, Driver, Employee, and Platform Admin (Developer).
- **End-to-end workflow:** Projects → Crop stages → Work cards & logs → Harvest → Sales, with expenses and inventory throughout.
- **Modern stack:** React, TypeScript, Firebase (Auth + Firestore), responsive UI.

---

# Slide 4: Key Features (1)

## Planning & Operations

- **Projects** — Create and manage by crop type (tomatoes, french beans, capsicum, maize, watermelons, rice), location, budget, dates.
- **Crop stages** — Predefined stages per crop (e.g. Nursery → Transplanting → Harvesting); track status and dates.
- **Work cards** — Admin plans work; manager submits actual execution (workers, inputs); approval and payment tracking.
- **Work logs** — Record daily labour, chemicals, fertilizer, fuel; sync to expenses.

---

# Slide 5: Key Features (2)

## Harvest, Sales & Market

- **Harvests** — Quantity, quality (A/B/C), destination (farm/market), optional farm pricing.
- **Sales** — Link to harvest; buyer, quantity, unit price, total; partial payment support.
- **Harvest collections** (e.g. French beans) — Pickers, weigh-in, price per kg, picker payouts, buyer price, sync to harvest/sale.
- **Broker view** — Brokers see only their allocated harvests and sales; record market expenses (space, watchman, ropes, carton, labour, etc.).

---

# Slide 6: Key Features (3)

## Inventory, Expenses & People

- **Inventory** — Categories: fertilizer, chemical, fuel, materials, seeds, wooden-crates, etc.; restock and deduct (work log, work card, harvest); audit trail.
- **Expenses** — Labour, fertilizer, chemical, fuel, other; project/stage linkage; payment status; broker-specific categories.
- **Employees** — Roles (operations-manager, sales-broker, logistics-driver); optional linked auth accounts.
- **Suppliers** — Contact, categories, rating, notes.
- **Deliveries** — Driver assignments; start/complete trip; distance and fuel.

---

# Slide 7: User Roles

| Role | Purpose |
|------|--------|
| **Company Admin** | Full company control: projects, employees, expenses, harvest, reports, billing, settings. |
| **Manager** | Operations: submit work card execution; access inventory and feedback. |
| **Broker** | Market: harvest & sales allocated to them; market expenses. |
| **Driver** | Logistics: view deliveries; start/complete trips. |
| **Employee** | General access; role-specific views (e.g. projects list). |
| **Developer** | Platform admin: companies, users, backups, audit logs, Code Red, platform expenses. |

---

# Slide 8: System Architecture (High Level)

- **Client:** React SPA (Vite, TypeScript), React Router, Tailwind, Radix UI, Recharts.
- **State:** AuthContext (user/session), ProjectContext (projects + active project), NotificationContext (in-app notifications); React Query for server state.
- **Backend:** Firebase Authentication (email/password); Cloud Firestore (all business data).
- **Security:** Firestore rules enforce company-scoped access; developer-only areas for backups, audit logs, platform expenses.

---

# Slide 9: Technology Stack

| Layer | Technology |
|-------|------------|
| Build & language | Vite, TypeScript |
| UI | React 18, Tailwind CSS, Radix (shadcn/ui), Lucide, Recharts |
| Routing | React Router v6 |
| Data & cache | Firebase Auth & Firestore, TanStack React Query |
| Forms & validation | react-hook-form, zod, @hookform/resolvers |
| Dates | date-fns |
| Notifications | Sonner (toast), in-app NotificationContext |

---

# Slide 10: Security & Multi-Tenancy

- **Authentication:** Email/password via Firebase Auth; session and profile (role, companyId) from Firestore `users` or `employees`.
- **Authorization:** Route guards (RequireAuth, RequireDeveloper, RequireManager, RequireBroker, RequireDriver, RequireNotBroker) control which pages each role can access.
- **Data isolation:** Every document (projects, expenses, harvests, etc.) has `companyId`; Firestore rules allow read/write only when `userCompanyId()` matches or user is developer.
- **Sensitive operations:** Backups, audit log read, platform expenses — developer only in rules.

---

# Slide 11: Dashboards at a Glance

- **Company Dashboard** — Revenue, expenses, profit/loss, remaining budget; activity chart; expense by category; inventory overview; recent transactions; crop stages; projects table. Filter by “selected project” or “all projects.”
- **Broker Dashboard** — Total sales, crates, average price; best day; harvest stock; broker-specific metrics.
- **Driver Dashboard** — Today’s deliveries; start/complete trip; distance and fuel.
- **Admin (Developer) Dashboard** — Platform overview: companies, users, employees, pending users, system health.

---

# Slide 12: Documentation Delivered

- **SRS** — Software Requirements Specification: functional and non-functional requirements, user classes, use cases.
- **SDS** — Software Design Specification: architecture, components, data design, interfaces, security design.
- **SYSTEM_DOCUMENTATION** — Deep technical reference: every page, component, context, service, Firestore collection, and type.
- **IMPLEMENTATION** — Setup, build, test, deploy, Firestore rules, coding conventions, troubleshooting.
- **PRESENTATION** — This slide deck for stakeholders and demos.

---

# Slide 13: Getting Started (For Stakeholders)

- **Try it:** Run the app locally (`npm run dev`) or use a deployed URL.
- **First steps:** “Get Started” → Create company and first admin → Sign in → Create a project → Explore dashboard, operations, harvest, inventory.
- **Roles:** Use different accounts (or employee roles) to see Manager, Broker, and Driver experiences.
- **Admin:** Developer account can access `/admin` for companies, users, backups, audit logs, Code Red, feedback.

---

# Slide 14: Summary

## FarmVault in One Slide

- **What:** Multi-tenant farm operations and decision support system.
- **Who:** Company admins, managers, brokers, drivers, employees, and platform admins.
- **How:** Web app (React + Firebase); role-based access; crop-centric workflows from planning to harvest and sales.
- **Why:** Single platform for planning, operations, inventory, expenses, and insights — with clear roles and data isolation.

---

# Slide 15: Thank You

## FarmVault Management System  
### KCA Project

**Questions?**

- Documentation: `docs/` folder (SRS, SDS, SYSTEM_DOCUMENTATION, IMPLEMENTATION).
- Technical deep-dive: `docs/SYSTEM_DOCUMENTATION.md`.

---

*End of presentation*
