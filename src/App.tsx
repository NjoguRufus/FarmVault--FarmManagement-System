import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ConnectivityProvider } from "@/contexts/ConnectivityContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { CompanyDashboard } from "@/pages/dashboard/CompanyDashboard";
import { DeveloperDashboard } from "@/pages/dashboard/DeveloperDashboard";
import { EmployeeDashboard } from "@/pages/dashboard/EmployeeDashboard";
import { BrokerDashboard } from "@/pages/dashboard/BrokerDashboard";
import { DriverDashboard } from "@/pages/dashboard/DriverDashboard";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailsPage from "@/pages/ProjectDetailsPage";
import ProjectPlanningPage from "@/pages/ProjectPlanningPage";
import CropStagesPage from "@/pages/CropStagesPage";
import ExpensesPage from "@/pages/ExpensesPage";
import OperationsPage from "@/pages/OperationsPage";
import InventoryPage from "@/pages/InventoryPage";
import HarvestSalesPage from "@/pages/HarvestSalesPage";
import HarvestDetailsPage from "@/pages/HarvestDetailsPage";
import HarvestCollectionsPage from "@/pages/HarvestCollectionsPage";
import BrokerHarvestSalesPage from "@/pages/BrokerHarvestSalesPage";
import BrokerExpensesPage from "@/pages/BrokerExpensesPage";
import BrokerHarvestDetailsPage from "@/pages/BrokerHarvestDetailsPage";
import SuppliersPage from "@/pages/SuppliersPage";
import SeasonChallengesPage from "@/pages/SeasonChallengesPage";
import EmployeesPage from "@/pages/EmployeesPage";
import ReportsPage from "@/pages/ReportsPage";
import BillingPage from "@/pages/BillingPage";
import SupportPage from "@/pages/SupportPage";
import SettingsPage from "@/pages/SettingsPage";
import FeedbackPage from "@/pages/FeedbackPage";
import NotFound from "./pages/NotFound";
import Index from "@/pages/Index";
import FarmManagementSoftwareKenyaPage from "@/pages/seo/FarmManagementSoftwareKenyaPage";
import CropMonitoringSoftwarePage from "@/pages/seo/CropMonitoringSoftwarePage";
import FarmInventoryManagementPage from "@/pages/seo/FarmInventoryManagementPage";
import FarmExpenseTrackingPage from "@/pages/seo/FarmExpenseTrackingPage";
import FarmHarvestManagementPage from "@/pages/seo/FarmHarvestManagementPage";
import FarmProjectManagementPage from "@/pages/seo/FarmProjectManagementPage";
import FarmBudgetingSoftwarePage from "@/pages/seo/FarmBudgetingSoftwarePage";
import TomatoFarmingKenyaPage from "@/pages/seo/TomatoFarmingKenyaPage";
import MaizeFarmingKenyaPage from "@/pages/seo/MaizeFarmingKenyaPage";
import RiceFarmingKenyaPage from "@/pages/seo/RiceFarmingKenyaPage";
import FrenchBeansFarmingKenyaPage from "@/pages/seo/FrenchBeansFarmingKenyaPage";
import CapsicumFarmingKenyaPage from "@/pages/seo/CapsicumFarmingKenyaPage";
import WatermelonFarmingKenyaPage from "@/pages/seo/WatermelonFarmingKenyaPage";
import FarmManagementNairobiPage from "@/pages/seo/FarmManagementNairobiPage";
import FarmManagementEldoretPage from "@/pages/seo/FarmManagementEldoretPage";
import FarmManagementNakuruPage from "@/pages/seo/FarmManagementNakuruPage";
import FarmManagementKisumuPage from "@/pages/seo/FarmManagementKisumuPage";
import FarmManagementMombasaPage from "@/pages/seo/FarmManagementMombasaPage";
import CropGuidesHubPage from "@/pages/seo/CropGuidesHubPage";
import FarmBudgetGuidesHubPage from "@/pages/seo/FarmBudgetGuidesHubPage";
import FarmChemicalsGuideHubPage from "@/pages/seo/FarmChemicalsGuideHubPage";
import CropDiseaseDatabaseHubPage from "@/pages/seo/CropDiseaseDatabaseHubPage";
import FarmCalculatorsHubPage from "@/pages/seo/FarmCalculatorsHubPage";
import TomatoProfitCalculatorPage from "@/pages/seo/calculators/TomatoProfitCalculatorPage";
import MaizeProfitCalculatorPage from "@/pages/seo/calculators/MaizeProfitCalculatorPage";
import FarmBudgetCalculatorPage from "@/pages/seo/calculators/FarmBudgetCalculatorPage";
import YieldPerAcreCalculatorPage from "@/pages/seo/calculators/YieldPerAcreCalculatorPage";
import BlogIndexPage from "@/pages/seo/BlogIndexPage";
import BlogPostPage from "@/pages/seo/BlogPostPage";
import LoginPage from "@/pages/Auth/LoginPage";
import SignInPage from "@/pages/Auth/SignInPage";
import SignUpPage from "@/pages/Auth/SignUpPage";
import AuthCallbackPage from "@/pages/Auth/AuthCallbackPage";
import OnboardingPage from "@/pages/OnboardingPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireOnboarding } from "@/components/auth/RequireOnboarding";
import { RequireDeveloper } from "@/components/auth/RequireDeveloper";
import { DevRoute } from "@/components/auth/DevRoute";
import { RequireManager } from "@/components/auth/RequireManager";
import { RequireBroker } from "@/components/auth/RequireBroker";
import { RequireNotBroker } from "@/components/auth/RequireNotBroker";
import { RequireDriver } from "@/components/auth/RequireDriver";
import { PermissionRoute } from "@/components/auth/PermissionRoute";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminCompaniesPage from "@/pages/admin/AdminCompaniesPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminPendingUsersPage from "@/pages/admin/AdminPendingUsersPage";
import AdminAuditLogsPage from "@/pages/admin/AdminAuditLogsPage";
import AdminBackupsPage from "@/pages/admin/AdminBackupsPage";
import AdminMigrationPage from "@/pages/admin/AdminMigrationPage";
import AdminCodeRedPage from "@/pages/admin/AdminCodeRedPage";
import AdminFeedbackPage from "@/pages/admin/AdminFeedbackPage";
import AdminFinancesPage from "@/pages/admin/AdminFinancesPage";
import AdminExpensesPage from "@/pages/admin/AdminExpensesPage";
import AdminPendingPaymentsPage from "@/pages/admin/AdminPendingPaymentsPage";
import AdminSubscriptionAnalyticsPage from "@/pages/admin/AdminSubscriptionAnalyticsPage";
import AdminBillingPage from "@/pages/admin/AdminBillingPage";
import DeveloperRecordsPage from "@/pages/admin/DeveloperRecordsPage";
import DeveloperCropRecordsPage from "@/pages/admin/DeveloperCropRecordsPage";
import DeveloperRecordDetailPage from "@/pages/admin/DeveloperRecordDetailPage";
import AdminRecordsPage from "@/pages/records/AdminRecordsPage";
import AdminCropRecordsPage from "@/pages/records/AdminCropRecordsPage";
import AdminRecordDetailPage from "@/pages/records/AdminRecordDetailPage";
import ManagerOperationsPage from "@/pages/ManagerOperationsPage";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TourProvider } from "@/tour/TourProvider";
import { RoutePersistence } from "@/components/routing/RoutePersistence";
import { RootRoute } from "@/components/routing/RootRoute";
import { ClerkSupabaseTokenBridge } from "@/components/auth/ClerkSupabaseTokenBridge";
import DevSignInPage from "@/pages/dev/DevSignIn";
import DevSignUpPage from "@/pages/dev/DevSignUp";
import DevBootstrapPage from "@/pages/dev/DevBootstrap";
import DevDiagnosticsPage from "@/pages/dev/DevDiagnosticsPage";
import { DevAuthDebugPanel } from "@/components/debug/DevAuthDebugPanel";

const queryClient = new QueryClient();

// Route-level wrapper that ensures only company-admin users can access the
// main company dashboard at /dashboard. Everyone else is redirected to
// their role-specific dashboard or a relevant page.
const CompanyDashboardRoute = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (user.role === "company-admin" || user.role === "company_admin") {
    return <CompanyDashboard />;
  }

  // Developers should use the admin area, not the company dashboard.
  if (user.role === "developer") {
    return <Navigate to="/admin" replace />;
  }

  // Managers go to manager dashboard
  if (
    user.role === "manager" ||
    (user as any).employeeRole === "manager" ||
    (user as any).employeeRole === "operations-manager"
  ) {
    return <Navigate to="/manager" replace />;
  }

  // Brokers go to broker dashboard
  if (user.role === "broker") {
    return <Navigate to="/broker" replace />;
  }

  // Generic employees: route based on fine-grained employeeRole when available
  if (user.role === "employee" || user.role === ("user" as any)) {
    const employeeRole = (user as any).employeeRole as string | undefined;
    if (employeeRole === "logistics-driver" || employeeRole === "driver") {
      return <Navigate to="/driver" replace />;
    }
    if (employeeRole === "operations-manager" || employeeRole === "manager") {
      return <Navigate to="/manager" replace />;
    }
    if (employeeRole === "sales-broker" || employeeRole === "broker") {
      return <Navigate to="/broker" replace />;
    }
    // Role-less employees use the company dashboard and permissions decide visibility.
    return <CompanyDashboard />;
  }

  // Catch-all: send to projects list
  return <Navigate to="/projects" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <AuthProvider>
        <ProjectProvider>
          <NotificationProvider>
          <ConnectivityProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <HelmetProvider>
              <ClerkSupabaseTokenBridge />
              <RoutePersistence />
              <TourProvider>
              <Routes>
              {/* Public routes – no RequireAuth or onboarding; Clerk handles auth UI */}
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<Navigate to="/sign-in" replace />} />
              <Route path="/sign-in" element={<SignInPage />} />
              <Route path="/sign-in/*" element={<SignInPage />} />
              <Route path="/sign-up" element={<SignUpPage />} />
              <Route path="/sign-up/*" element={<SignUpPage />} />
              <Route path="/dev/sign-in" element={<DevSignInPage />} />
              <Route path="/dev/sign-in/*" element={<DevSignInPage />} />
              <Route path="/dev/sign-up" element={<DevSignUpPage />} />
              <Route path="/dev/sign-up/*" element={<DevSignUpPage />} />
              {/* Intercept any Clerk organization task routes for dev sign-up and send directly to the dev dashboard. */}
              <Route path="/dev/sign-up/tasks/*" element={<Navigate to="/dev/dashboard" replace />} />
              <Route
                path="/dev/bootstrap"
                element={
                  <DevRoute>
                    <DevBootstrapPage />
                  </DevRoute>
                }
              />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/choose-plan" element={<Navigate to="/onboarding" replace />} />
              <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
              <Route path="/setup-company" element={<Navigate to="/onboarding" replace />} />
              <Route path="/setup" element={<Navigate to="/onboarding" replace />} />

              {/* Public SEO pillar pages */}
              <Route path="/farm-management-software-kenya" element={<FarmManagementSoftwareKenyaPage />} />
              <Route path="/crop-monitoring-software" element={<CropMonitoringSoftwarePage />} />
              <Route path="/farm-inventory-management-system" element={<FarmInventoryManagementPage />} />
              <Route path="/farm-expense-tracking-software" element={<FarmExpenseTrackingPage />} />
              <Route path="/farm-harvest-management-system" element={<FarmHarvestManagementPage />} />
              <Route path="/farm-project-management-software" element={<FarmProjectManagementPage />} />
              <Route path="/farm-budgeting-software" element={<FarmBudgetingSoftwarePage />} />
              <Route path="/crop-guides" element={<CropGuidesHubPage />} />
              <Route path="/farm-budget-guides" element={<FarmBudgetGuidesHubPage />} />
              <Route path="/farm-chemicals-guide" element={<FarmChemicalsGuideHubPage />} />
              <Route path="/crop-disease-database" element={<CropDiseaseDatabaseHubPage />} />
              <Route path="/farm-calculators" element={<FarmCalculatorsHubPage />} />
              <Route path="/tomato-farming-kenya" element={<TomatoFarmingKenyaPage />} />
              <Route path="/maize-farming-kenya" element={<MaizeFarmingKenyaPage />} />
              <Route path="/rice-farming-kenya" element={<RiceFarmingKenyaPage />} />
              <Route path="/french-beans-farming-kenya" element={<FrenchBeansFarmingKenyaPage />} />
              <Route path="/capsicum-farming-kenya" element={<CapsicumFarmingKenyaPage />} />
              <Route path="/watermelon-farming-kenya" element={<WatermelonFarmingKenyaPage />} />
              <Route path="/farm-management-software-nairobi" element={<FarmManagementNairobiPage />} />
              <Route path="/farm-management-software-eldoret" element={<FarmManagementEldoretPage />} />
              <Route path="/farm-management-software-nakuru" element={<FarmManagementNakuruPage />} />
              <Route path="/farm-management-software-kisumu" element={<FarmManagementKisumuPage />} />
              <Route path="/farm-management-software-mombasa" element={<FarmManagementMombasaPage />} />
              <Route path="/tomato-profit-calculator" element={<TomatoProfitCalculatorPage />} />
              <Route path="/maize-profit-calculator" element={<MaizeProfitCalculatorPage />} />
              <Route path="/farm-budget-calculator" element={<FarmBudgetCalculatorPage />} />
              <Route path="/yield-per-acre-calculator" element={<YieldPerAcreCalculatorPage />} />
              <Route path="/blog" element={<BlogIndexPage />} />
              <Route path="/blog/:slug" element={<BlogPostPage />} />

              {/* Protected app routes (auth + onboarding required) */}
              <Route
                element={
                  <RequireAuth>
                    <RequireOnboarding>
                      <MainLayout />
                    </RequireOnboarding>
                  </RequireAuth>
                }
              >
                <Route path="/app" element={<Navigate to="/dashboard" replace />} />
                <Route path="/app/*" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<PermissionRoute module="dashboard"><CompanyDashboardRoute /></PermissionRoute>} />
                <Route path="/projects" element={<PermissionRoute module="projects"><RequireNotBroker><ProjectsPage /></RequireNotBroker></PermissionRoute>} />
                <Route path="/projects/new" element={<PermissionRoute module="projects" actionPath="create"><RequireNotBroker><Navigate to="/projects?new=1" replace /></RequireNotBroker></PermissionRoute>} />
                <Route path="/projects/:projectId" element={<PermissionRoute module="projects"><RequireNotBroker><ProjectDetailsPage /></RequireNotBroker></PermissionRoute>} />
                <Route path="/projects/:projectId/planning" element={<PermissionRoute module="planning"><RequireNotBroker><ProjectPlanningPage /></RequireNotBroker></PermissionRoute>} />
                <Route path="/crop-stages" element={<PermissionRoute module="planning"><CropStagesPage /></PermissionRoute>} />
                <Route path="/expenses" element={<PermissionRoute module="expenses"><ExpensesPage /></PermissionRoute>} />
                <Route path="/operations" element={<PermissionRoute module="operations"><OperationsPage /></PermissionRoute>} />
                <Route path="/inventory" element={<PermissionRoute module="inventory"><InventoryPage /></PermissionRoute>} />
                <Route path="/harvest-sales" element={<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker/harvest-sales"><HarvestSalesPage /></RequireNotBroker></PermissionRoute>} />
                <Route path="/harvest-sales/harvest/:harvestId" element={<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker/harvest-sales"><HarvestDetailsPage /></RequireNotBroker></PermissionRoute>} />
                {/* Single route with optional projectId so the page does not remount when URL gains/loses projectId */}
                <Route path="/harvest-collections/:projectId?" element={<PermissionRoute module="harvest"><RequireNotBroker><HarvestCollectionsPage /></RequireNotBroker></PermissionRoute>} />
                <Route path="/suppliers" element={<PermissionRoute module="projects"><SuppliersPage /></PermissionRoute>} />
                <Route path="/challenges" element={<PermissionRoute module="planning"><SeasonChallengesPage /></PermissionRoute>} />
                <Route path="/employees" element={<PermissionRoute module="employees"><EmployeesPage /></PermissionRoute>} />
                <Route path="/reports" element={<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>} />
                <Route path="/billing" element={<PermissionRoute module="settings"><BillingPage /></PermissionRoute>} />
                <Route path="/settings" element={<PermissionRoute module="settings"><SettingsPage /></PermissionRoute>} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
                <Route path="/records" element={<PermissionRoute module="notes"><AdminRecordsPage /></PermissionRoute>} />
                <Route path="/records/:cropId" element={<PermissionRoute module="notes"><AdminCropRecordsPage /></PermissionRoute>} />
                <Route
                  path="/records/:cropId/record/:recordId"
                  element={
                    <PermissionRoute module="notes">
                      <AdminRecordDetailPage />
                    </PermissionRoute>
                  }
                />
              </Route>

              {/* Role-based dashboard routes */}
              <Route
                element={
                  <RequireManager>
                    <MainLayout />
                  </RequireManager>
                }
              >
                <Route path="/manager" element={<Navigate to="/manager/operations" replace />} />
                <Route path="/manager/operations" element={<PermissionRoute module="operations"><ManagerOperationsPage /></PermissionRoute>} />
              </Route>

              <Route
                path="/broker"
                element={
                  <RequireBroker>
                    <MainLayout />
                  </RequireBroker>
                }
              >
                <Route index element={<PermissionRoute module="dashboard"><BrokerDashboard /></PermissionRoute>} />
                <Route path="harvest-sales" element={<PermissionRoute module="harvest"><BrokerHarvestSalesPage /></PermissionRoute>} />
                <Route path="harvest/:harvestId" element={<PermissionRoute module="harvest"><BrokerHarvestDetailsPage /></PermissionRoute>} />
                <Route path="expenses" element={<PermissionRoute module="expenses"><BrokerExpensesPage /></PermissionRoute>} />
              </Route>

              <Route
                element={
                  <RequireDriver>
                    <MainLayout />
                  </RequireDriver>
                }
              >
                <Route path="/driver" element={<PermissionRoute module="harvest"><DriverDashboard /></PermissionRoute>} />
              </Route>

              {/* Developer-only routes under /admin and /dev */}
              <Route
                element={
                  <RequireDeveloper>
                    <MainLayout />
                  </RequireDeveloper>
                }
              >
                {/* Default developer entrypoint – /dev → /dev/dashboard */}
                <Route path="/dev" element={<Navigate to="/dev/dashboard" replace />} />
                {/* Backwards-compatible redirect from old /developer path */}
                <Route path="/developer" element={<Navigate to="/admin" replace />} />
                {/* Canonical developer dashboard path */}
                <Route path="/dev/dashboard" element={<AdminDashboard />} />
                <Route path="/dev/diagnostics" element={<DevDiagnosticsPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/companies" element={<AdminCompaniesPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/users/pending" element={<AdminPendingUsersPage />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
                <Route path="/admin/backups" element={<AdminBackupsPage />} />
                <Route path="/admin/migration" element={<AdminMigrationPage />} />
                <Route path="/admin/code-red" element={<AdminCodeRedPage />} />
                <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
                <Route path="/admin/finances" element={<AdminFinancesPage />} />
                <Route path="/admin/analytics/subscriptions" element={<AdminSubscriptionAnalyticsPage />} />
                <Route path="/admin/expenses" element={<AdminExpensesPage />} />
                <Route path="/admin/billing" element={<AdminBillingPage />} />
                <Route path="/admin/payments" element={<AdminPendingPaymentsPage />} />
                <Route path="/developer/records" element={<DeveloperRecordsPage />} />
                <Route path="/developer/records/:cropId" element={<DeveloperCropRecordsPage />} />
                <Route path="/developer/records/:cropId/record/:recordId" element={<DeveloperRecordDetailPage />} />
                <Route path="/admin/records" element={<Navigate to="/developer/records" replace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
              </Routes>
              </TourProvider>
              {import.meta.env.DEV && <DevAuthDebugPanel />}
              </HelmetProvider>
            </BrowserRouter>
          </TooltipProvider>
          </ConnectivityProvider>
          </NotificationProvider>
        </ProjectProvider>
      </AuthProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
