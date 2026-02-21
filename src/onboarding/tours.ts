type Step = {
  target: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto" | "center";
  [key: string]: unknown;
};

export type TourRole = "admin" | "manager" | "broker";
export type TourDevice = "desktop" | "mobile";

export type AppTourStep = Step & {
  id: string;
  route: string;
  // Optional extra wait time after route change before showing this step.
  routeLoadDelayMs?: number;
};

type RoleTourConfig = {
  desktop: AppTourStep[];
  mobile: AppTourStep[];
};

type ToursConfig = Record<TourRole, RoleTourConfig>;

export const TOUR_CONFIG: ToursConfig = {
  admin: {
    desktop: [
      {
        id: "admin-project-selector",
        route: "/dashboard",
        target: '[data-tour="project-selector"]',
        content: "Switch your active project from here. Most pages follow this selection.",
        placement: "bottom",
      },
      {
        id: "admin-dashboard-stats",
        route: "/dashboard",
        target: '[data-tour="dashboard-stats"]',
        content: "These cards summarize revenue, expenses, profit/loss, and budget position.",
      },
      {
        id: "admin-dashboard-quick-actions",
        route: "/dashboard",
        target: '[data-tour="new-operation-button"]',
        content: "Use Quick Access to jump into common tasks fast.",
      },
      {
        id: "admin-recent-transactions",
        route: "/dashboard",
        target: '[data-tour="recent-transactions"]',
        content: "Recent transactions help you monitor the latest farm activity.",
      },
      {
        id: "admin-projects-page",
        route: "/projects",
        target: '[data-tour="projects-new-button"]',
        content: "Create a new project here when starting a new crop cycle.",
      },
      {
        id: "admin-operations-page",
        route: "/operations",
        target: '[data-tour="operations-plan-work-button"]',
        content: "Plan daily work and assign managers from this action.",
      },
      {
        id: "admin-inventory-page",
        route: "/inventory",
        target: '[data-tour="inventory-overview"]',
        content: "Inventory overview shows stock counts, value, and low-stock alerts.",
      },
      {
        id: "admin-harvest-page",
        route: "/harvest-sales",
        target: '[data-tour="harvest-summary"]',
        content: "Track harvest totals and sales performance from here.",
      },
      {
        id: "admin-reports-page",
        route: "/reports",
        target: '[data-tour="reports-export"]',
        content: "Generate and export reports by category and period.",
      },
      {
        id: "admin-settings-tour",
        route: "/settings",
        target: '[data-tour="settings-take-tour"]',
        content: "You can restart this tour anytime from Settings.",
      },
    ],
    mobile: [
      {
        id: "admin-mobile-dashboard-nav",
        route: "/dashboard",
        target: '[data-tour="mobile-nav-dashboard"]',
        content: "Use the bottom tabs for fast navigation on mobile.",
        placement: "top",
      },
      {
        id: "admin-mobile-dashboard-cards",
        route: "/dashboard",
        target: '[data-tour="dashboard-stats"]',
        content: "These key cards show your current business snapshot.",
      },
      {
        id: "admin-mobile-projects-nav",
        route: "/projects",
        target: '[data-tour="mobile-nav-projects"]',
        content: "Projects keeps your crop programs organized.",
        placement: "top",
      },
      {
        id: "admin-mobile-operations-nav",
        route: "/operations",
        target: '[data-tour="mobile-nav-operations"]',
        content: "Operations is where daily work is planned and tracked.",
        placement: "top",
      },
      {
        id: "admin-mobile-inventory-nav",
        route: "/inventory",
        target: '[data-tour="mobile-nav-inventory"]',
        content: "Inventory tracks inputs and stock movement.",
        placement: "top",
      },
      {
        id: "admin-mobile-harvest-summary",
        route: "/harvest-sales",
        target: '[data-tour="harvest-summary"]',
        content: "Review harvest and sales summary on this page.",
      },
      {
        id: "admin-mobile-settings",
        route: "/settings",
        target: '[data-tour="settings-take-tour"]',
        content: "Restart the tour here whenever needed.",
      },
    ],
  },
  manager: {
    desktop: [
      {
        id: "manager-header",
        route: "/manager/operations",
        target: '[data-tour="manager-operations-header"]',
        content: "This is your manager operations workspace.",
      },
      {
        id: "manager-log-work",
        route: "/manager/operations",
        target: '[data-tour="manager-log-work-button"]',
        content: "Use Log Daily Work to submit execution details.",
      },
      {
        id: "manager-work-cards",
        route: "/manager/operations",
        target: '[data-tour="manager-work-cards"]',
        content: "My Work Cards shows assigned work awaiting action.",
      },
      {
        id: "manager-inventory-overview",
        route: "/inventory",
        target: '[data-tour="inventory-overview"]',
        content: "Check stock and shortages before submitting work.",
      },
    ],
    mobile: [
      {
        id: "manager-mobile-nav-operations",
        route: "/manager/operations",
        target: '[data-tour="mobile-nav-operations"]',
        content: "Bottom navigation keeps key manager pages one tap away.",
        placement: "top",
      },
      {
        id: "manager-mobile-work-cards",
        route: "/manager/operations",
        target: '[data-tour="manager-work-cards"]',
        content: "Open a card to record actual work and submit updates.",
      },
      {
        id: "manager-mobile-nav-inventory",
        route: "/inventory",
        target: '[data-tour="mobile-nav-inventory"]',
        content: "Go to Inventory when checking available inputs.",
        placement: "top",
      },
      {
        id: "manager-mobile-inventory-overview",
        route: "/inventory",
        target: '[data-tour="inventory-overview"]',
        content: "Use this overview to catch low stock early.",
      },
    ],
  },
  broker: {
    desktop: [
      {
        id: "broker-dashboard-stats",
        route: "/broker",
        target: '[data-tour="broker-dashboard-stats"]',
        content: "Your dashboard summarizes sales performance and allocations.",
      },
      {
        id: "broker-harvest-list",
        route: "/broker/harvest-sales",
        target: '[data-tour="broker-harvest-list"]',
        content: "These are harvests allocated to you for market sales.",
      },
      {
        id: "broker-sales-section",
        route: "/broker/harvest-sales",
        target: '[data-tour="broker-sales-section"]',
        content: "Track your recorded sales and payment status here.",
      },
      {
        id: "broker-add-expense",
        route: "/broker/expenses",
        target: '[data-tour="broker-add-expense"]',
        content: "Add market expenses tied to your harvest activities.",
      },
      {
        id: "broker-expense-summary",
        route: "/broker/expenses",
        target: '[data-tour="broker-expenses-summary"]',
        content: "Review total expenses and recent entries from this section.",
      },
    ],
    mobile: [
      {
        id: "broker-mobile-nav-dashboard",
        route: "/broker",
        target: '[data-tour="mobile-nav-broker-dashboard"]',
        content: "Use this tab to return to your broker overview.",
        placement: "top",
      },
      {
        id: "broker-mobile-dashboard-stats",
        route: "/broker",
        target: '[data-tour="broker-dashboard-stats"]',
        content: "Quick snapshot of sales, crates sold, and allocated harvests.",
      },
      {
        id: "broker-mobile-nav-harvest",
        route: "/broker/harvest-sales",
        target: '[data-tour="mobile-nav-broker-harvest"]',
        content: "Open harvest allocation and sales recording here.",
        placement: "top",
      },
      {
        id: "broker-mobile-harvest-list",
        route: "/broker/harvest-sales",
        target: '[data-tour="broker-harvest-list"]',
        content: "Tap harvest cards to record sales quickly.",
      },
      {
        id: "broker-mobile-nav-expenses",
        route: "/broker/expenses",
        target: '[data-tour="mobile-nav-broker-expenses"]',
        content: "Go here to track your market expenses.",
        placement: "top",
      },
      {
        id: "broker-mobile-expense-summary",
        route: "/broker/expenses",
        target: '[data-tour="broker-expenses-summary"]',
        content: "Monitor expense totals and entries from this panel.",
      },
    ],
  },
};

export function getTourSteps(role: TourRole, device: TourDevice): AppTourStep[] {
  return TOUR_CONFIG[role][device];
}
