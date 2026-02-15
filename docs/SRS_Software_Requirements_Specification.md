# Software Requirements Specification (SRS)
## FarmVault Management System

**Document Version:** 1.0  
**Last Updated:** February 2025  
**Project:** FarmVault Management — KCA Project

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for the FarmVault Management System — a multi-tenant farm operations and decision support platform for modern agriculture.

### 1.2 Scope

FarmVault enables agricultural companies (tenants) to:

- Manage multiple farm projects by crop type and season
- Plan and track crop stages, labour, operations, and work cards
- Record harvests, sales, and market-side broker activities
- Control inventory (inputs, chemicals, fuel, fertilizer) and expenses
- Manage employees, suppliers, season challenges, and reporting
- Support role-based access for Company Admin, Manager, Broker, Driver, and Employee, with a separate Developer (platform admin) role

### 1.3 Definitions and Acronyms

| Term | Definition |
|------|------------|
| **Tenant** | A company (organization) using the system with its own data isolation |
| **Company Admin** | User who owns and manages a company and its users |
| **Developer** | Platform administrator with cross-tenant access |
| **Work Card** | A planned work task created by admin; manager submits actual execution |
| **Harvest Collection** | Field-level harvest tracking (e.g. French beans: pickers, weigh-in, buyer) |
| **Firestore** | Google Cloud NoSQL database used for application data |
| **KCA** | Project identifier (KCA Project) |

### 1.4 References

- System Technical Documentation: `docs/SYSTEM_DOCUMENTATION.md`
- Software Design Specification: `docs/SDS_Software_Design_Specification.md`
- Implementation Guide: `docs/IMPLEMENTATION.md`

---

## 2. Overall Description

### 2.1 Product Perspective

FarmVault is a web-based, multi-tenant SaaS application. Users access it via a browser. Authentication and data are hosted on Firebase (Auth + Firestore). The front end is a single-page application (SPA) built with React.

### 2.2 User Classes and Characteristics

| User Class | Description |
|------------|-------------|
| **Company Admin** | Creates company, manages projects, employees, billing; full access to company data |
| **Manager** | Operations manager; submits work card execution; accesses manager operations and inventory |
| **Broker** | Market-side; manages harvests and sales allocated to them; records market expenses |
| **Driver** | Logistics driver; views and updates delivery status (start/complete trip) |
| **Employee** | General employee; may have access to projects list and role-specific views based on employeeRole |
| **Developer** | Platform administrator; manages companies, users, backups, audit logs, platform expenses, Code Red, feedback |

### 2.3 Operating Environment

- **Client:** Modern web browsers (Chrome, Firefox, Safari, Edge) with JavaScript enabled
- **Backend/Services:** Firebase (Authentication, Firestore, optional Analytics)
- **Network:** Internet connectivity required

### 2.4 Design and Implementation Constraints

- Use of Firebase/Firestore for authentication and persistence
- Role and company-based data isolation enforced by Firestore security rules
- Responsive UI for desktop and mobile

---

## 3. System Features and Requirements

### 3.1 Functional Requirements

#### FR-1: User Authentication and Authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | The system shall allow users to register a new company and first company-admin account (company name, company email, admin name, admin email, password). | High |
| FR-1.2 | The system shall allow users to sign in with email and password. | High |
| FR-1.3 | The system shall maintain a session and redirect unauthenticated users to the login page when accessing protected routes. | High |
| FR-1.4 | The system shall assign each signed-in user a role (developer, company-admin, manager, broker, employee) and optional employeeRole. | High |
| FR-1.5 | The system shall redirect users after login to a role-appropriate landing page (dashboard, manager, broker, driver, admin, or projects). | High |
| FR-1.6 | The system shall allow users to sign out. | High |

#### FR-2: Company and Tenant Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | The system shall store and display company profile (name, email, status, plan, user count, project count, revenue). | High |
| FR-2.2 | The system shall support payment reminder for a company (active, due date, dismissible by user). | Medium |
| FR-2.3 | The system shall allow company admin or developer to update company details. | Medium |

#### FR-3: Project Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | The system shall allow creation of projects with crop type, name, location, acreage, budget, start/end dates, planting date. | High |
| FR-3.2 | The system shall support crop types: tomatoes, french-beans, capsicum, maize, watermelons, rice. | High |
| FR-3.3 | The system shall maintain project status: planning, active, completed, archived. | High |
| FR-3.4 | The system shall allow planning metadata per project (seed info, expected challenges, plan history). | Medium |
| FR-3.5 | The system shall allow users to select an active project for context (e.g. dashboard, operations). | High |
| FR-3.6 | The system shall list and filter projects by company; company users see only their company’s projects. | High |

#### FR-4: Crop Stages

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | The system shall define crop stages per crop type (e.g. Nursery, Transplanting, Vegetative Growth, Flowering, Fruiting, Harvesting for tomatoes). | High |
| FR-4.2 | The system shall create and store project stages linked to a project and crop type, with start/end dates and status (pending, in-progress, completed). | High |
| FR-4.3 | The system shall allow viewing and managing crop stages for projects. | High |

#### FR-5: Operations and Work

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | The system shall allow creation of work logs (date, work category/type, number of people, rate, total price, employees, chemicals, fertilizer, fuel, notes). | High |
| FR-5.2 | The system shall support operations work cards: admin creates planned work; manager submits actual execution (date, workers, inputs, etc.). | High |
| FR-5.3 | The system shall allow approval or rejection of manager-submitted work cards by admin. | High |
| FR-5.4 | The system shall allow marking work cards as paid and creating associated expenses. | High |
| FR-5.5 | The system shall support syncing labour expenses from work logs (e.g. daily sync). | Medium |
| FR-5.6 | Managers shall see only work cards assigned to them for submission. | High |

#### FR-6: Expenses

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-6.1 | The system shall record expenses with category (labour, fertilizer, chemical, fuel, other; broker: space, watchman, ropes, carton, offloading_labour, onloading_labour, broker_payment), description, amount, date, optional project/harvest linkage. | High |
| FR-6.2 | The system shall filter and display expenses by company and optionally by project. | High |
| FR-6.3 | The system shall support broker-specific expense categories and broker expense page. | High |
| FR-6.4 | The system shall support payment tracking (paid, paidAt, paidBy) for expenses. | Medium |

#### FR-7: Inventory

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-7.1 | The system shall maintain inventory items with category (fertilizer, chemical, fuel, diesel, materials, sacks, ropes, wooden-crates, seeds), quantity, unit, optional price and crop scope. | High |
| FR-7.2 | The system shall allow restocking inventory and optionally creating an expense. | High |
| FR-7.3 | The system shall allow deducting inventory for work logs, work cards, or harvest with audit trail. | High |
| FR-7.4 | The system shall support chemical (box/single), fuel (diesel/petrol, containers, litres), fertilizer (bags, kgs), wooden-crates (sizes). | Medium |
| FR-7.5 | The system shall record inventory audit logs (who did what: restock, deduct, add, delete). | Medium |

#### FR-8: Harvest and Sales

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-8.1 | The system shall record harvests (project, crop, date, quantity, unit, quality A/B/C, destination farm/market, optional farm pricing, broker, driver, lorry). | High |
| FR-8.2 | The system shall record sales (harvest, buyer, quantity, unit, unit price, total amount, status, optional broker, amount paid for partial). | High |
| FR-8.3 | The system shall filter harvests and sales by company and project; brokers see harvests/sales allocated to them. | High |
| FR-8.4 | The system shall support harvest collections (e.g. French beans): pickers, weigh entries, price per kg (picker/buyer), total harvest kg, picker pay, payout status, buyer price, sync to harvest/sale. | High |
| FR-8.5 | The system shall support harvest cash pools/wallets for field payouts and top-up. | High |
| FR-8.6 | The system shall allow paying pickers individually or in batch and recording payment batches. | High |

#### FR-9: Suppliers and Employees

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-9.1 | The system shall maintain suppliers (name, contact, email, category/categories, rating, status, review notes). | Medium |
| FR-9.2 | The system shall maintain employees (name, role e.g. operations-manager, logistics-driver, sales-broker, department, contact, status, join date). | High |
| FR-9.3 | The system shall allow company admin or manager to create employees and optionally create linked auth accounts. | High |

#### FR-10: Deliveries (Driver)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10.1 | The system shall record deliveries (project, harvest, driver, from, to, quantity, unit, status: pending, in-transit, delivered, cancelled). | High |
| FR-10.2 | The system shall allow drivers to view their assigned deliveries and update status (e.g. start trip, complete delivery). | High |
| FR-10.3 | The system shall support optional distance and fuel used per delivery. | Low |

#### FR-11: Season Challenges and Needed Items

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1 | The system shall allow recording season challenges (project, crop, title, description, type, severity, status, resolution, items used). | Medium |
| FR-11.2 | The system shall support needed items (from challenges or manual) with status pending/ordered/received. | Medium |

#### FR-12: Reporting and Billing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-12.1 | The system shall provide a company dashboard with revenue, expenses, profit/loss, remaining budget, charts (activity, expense category), recent transactions, inventory overview, crop stages, projects table. | High |
| FR-12.2 | The system shall provide broker and driver dashboards with role-relevant metrics. | High |
| FR-12.3 | The system shall provide reports (e.g. expenses, sales, harvest by period/project). | Medium |
| FR-12.4 | The system shall provide billing/subscription and payment reminder management. | Medium |

#### FR-13: Support, Feedback, and Settings

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-13.1 | The system shall provide support and feedback entry points. | Low |
| FR-13.2 | The system shall store user feedback and allow developer to view feedback inbox. | Medium |
| FR-13.3 | The system shall provide settings for company and user. | Medium |

#### FR-14: Developer (Platform Admin) Features

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-14.1 | The system shall provide an admin dashboard with platform overview (companies, users, employees, pending users). | High |
| FR-14.2 | The system shall allow developer to manage companies and users and view pending (unassigned) users. | High |
| FR-14.3 | The system shall allow developer to create and restore company data backups. | High |
| FR-14.4 | The system shall provide audit logs (create by app; read by developer only). | High |
| FR-14.5 | The system shall provide Code Red (urgent company–developer communication) with messages and status. | Medium |
| FR-14.6 | The system shall allow developer to manage platform (FarmVault) expenses. | Medium |
| FR-14.7 | The system shall allow developer to view inventory audit logs. | Low |

### 3.2 Non-Functional Requirements

#### NFR-1: Security

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1.1 | All application data shall be stored in Firestore with security rules enforcing authentication and company-scoped (or developer) access. | High |
| NFR-1.2 | Users shall only access data belonging to their company unless they are developers. | High |
| NFR-1.3 | Sensitive operations (e.g. backups, audit log read, platform expenses) shall be restricted to developer role. | High |

#### NFR-2: Usability

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-2.1 | The system shall be responsive and usable on desktop and mobile. | High |
| NFR-2.2 | The system shall provide clear navigation and role-appropriate menus. | High |
| NFR-2.3 | The system shall display clear error messages on login failure and validation errors. | Medium |

#### NFR-3: Performance

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-3.1 | The system shall load initial views and lists in a reasonable time (e.g. &lt; 3 seconds under normal network). | Medium |
| NFR-3.2 | The system may use caching (e.g. React Query) to reduce repeated reads. | Medium |

#### NFR-4: Availability and Maintainability

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-4.1 | The system shall rely on Firebase availability for auth and data. | High |
| NFR-4.2 | The system shall be implementable and maintainable with documented architecture and design (SDS, SRS, implementation guide). | Medium |

---

## 4. External Interface Requirements

### 4.1 User Interfaces

- Web UI: single-page application with landing, login, setup-company, and authenticated areas (dashboards, projects, operations, harvest, inventory, expenses, employees, reports, billing, settings, support, feedback; admin areas for developer).
- Role-based navigation and route guards so users see only allowed sections.

### 4.2 Hardware Interfaces

- No direct hardware interfaces; standard browser and network.

### 4.3 Software Interfaces

- **Firebase Authentication:** sign-in, sign-out, session, user UID.
- **Cloud Firestore:** all business data (companies, users, projects, stages, work logs, work cards, expenses, harvests, sales, inventory, employees, suppliers, deliveries, challenges, feedback, audit logs, backups, Code Red, platform expenses). Access via Firebase SDK and Firestore security rules.

### 4.4 Communication Interfaces

- HTTPS for all client–server communication (Firebase).

---

## 5. Appendices

### Appendix A: Use Case Summary

| Actor | Use Case |
|-------|----------|
| Guest | Register company and admin, Sign in |
| Company Admin | Manage company, projects, employees, expenses, inventory, harvest/sales, reports, billing, settings |
| Manager | View manager operations, Submit work card execution, View inventory |
| Broker | View broker dashboard, Manage harvest/sales and market expenses |
| Driver | View driver dashboard, Start/complete delivery |
| Employee | View projects and role-specific features |
| Developer | Manage companies, users, backups, audit logs, Code Red, platform expenses, feedback |

### Appendix B: Traceability

Requirements in this SRS are implemented as described in the Software Design Specification (SDS) and the System Technical Documentation. Implementation details and file references are in `docs/SYSTEM_DOCUMENTATION.md` and `docs/IMPLEMENTATION.md`.

---

*End of Software Requirements Specification*
