import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ConnectivityProvider } from "@/contexts/ConnectivityContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { CompanyDashboard } from "@/pages/dashboard/CompanyDashboard";
import { DeveloperDashboard } from "@/pages/dashboard/DeveloperDashboard";
import { EmployeeDashboard } from "@/pages/dashboard/EmployeeDashboard";
import { BrokerDashboard } from "@/pages/dashboard/BrokerDashboard";
import { DriverDashboard } from "@/pages/dashboard/DriverDashboard";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { StaffDashboard } from "@/pages/dashboard/StaffDashboard";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailsPage from "@/pages/ProjectDetailsPage";
import EditProjectPage from "@/pages/EditProjectPage";
import ProjectPlanningPage from "@/pages/ProjectPlanningPage";
import CropStagesPage from "@/pages/CropStagesPage";
import ExpensesPage from "@/pages/ExpensesPage";
import OperationsPage from "@/pages/OperationsPage";
import AdminOperationsPage from "@/pages/AdminOperationsPage";
import StaffOperationsPage from "@/pages/StaffOperationsPage";
import InventoryPage from "@/pages/InventoryPage";
import InventoryItemDetailsPage from "@/pages/InventoryItemDetailsPage";
import InventoryCategoriesPage from "@/pages/InventoryCategoriesPage";
import InventorySuppliersPage from "@/pages/InventorySuppliersPage";
import HarvestSalesPage from "@/pages/HarvestSalesPage";
import HarvestDetailsPage from "@/pages/HarvestDetailsPage";
import HarvestCollectionsPage from "@/pages/HarvestCollectionsPage";
import BrokerHarvestSalesPage from "@/pages/BrokerHarvestSalesPage";
import BrokerExpensesPage from "@/pages/BrokerExpensesPage";
import BrokerHarvestDetailsPage from "@/pages/BrokerHarvestDetailsPage";
import SuppliersPage from "@/pages/SuppliersPage";
import SeasonChallengesPage from "@/pages/SeasonChallengesPage";
import EmployeesPage from "@/pages/EmployeesPage";
import EmployeeProfilePage from "@/pages/EmployeeProfilePage";
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
import FeaturesPage from "@/pages/FeaturesPage";
import PricingPage from "@/pages/PricingPage";
import AboutPage from "@/pages/AboutPage";
import AmbassadorLandingPage from "@/pages/ambassador/AmbassadorLandingPage";
import AmbassadorSignupPage from "@/pages/ambassador/AmbassadorSignupPage";
import AmbassadorDashboardPage from "@/pages/ambassador/AmbassadorDashboardPage";
import AmbassadorOnboardingPage from "@/pages/ambassador/AmbassadorOnboardingPage";
import AmbassadorReferPage from "@/pages/ambassador/AmbassadorReferPage";
import AmbassadorReferralsPage from "@/pages/ambassador/AmbassadorReferralsPage";
import AmbassadorEarningsPage from "@/pages/ambassador/AmbassadorEarningsPage";
import AmbassadorSettingsPage from "@/pages/ambassador/AmbassadorSettingsPage";
import { AmbassadorLayout } from "@/components/layout/AmbassadorLayout";
import SignInPage from "@/pages/Auth/SignInPage";
import SignUpPage from "@/pages/Auth/SignUpPage";
import ScanPage from "@/pages/ScanPage";
import AcceptInvitationPage from "@/pages/Auth/AcceptInvitationPage";
import PostAuthContinuePage from "@/pages/Auth/PostAuthContinuePage";
import AmbassadorAuthContinuePage from "@/pages/Auth/AmbassadorAuthContinuePage";
import { SignInRedirect } from "@/components/auth/SignInRedirect";
import EmergencyAccessPage from "@/pages/Auth/EmergencyAccessPage";
import OnboardingPage from "@/pages/OnboardingPage";
import PendingApprovalPage from "@/pages/PendingApprovalPage";
import StartFreshPage from "@/pages/StartFreshPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireOnboarding } from "@/components/auth/RequireOnboarding";
import { RequireDeveloper } from "@/components/auth/RequireDeveloper";
import { DeveloperRoute } from "@/components/auth/DeveloperRoute";
import { DevRoute } from "@/components/auth/DevRoute";
import { RequireManager } from "@/components/auth/RequireManager";
import { RequireBroker } from "@/components/auth/RequireBroker";
import { RequireNotBroker } from "@/components/auth/RequireNotBroker";
import { RequireDriver } from "@/components/auth/RequireDriver";
import { PermissionRoute } from "@/components/auth/PermissionRoute";
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
import AdminRecordsPage from "@/pages/records/AdminRecordsPage";
import CropDetailsPage from "@/pages/records/CropDetailsPage";
import NotebookPage from "@/pages/records/NotebookPage";
import FullKnowledgePage from "@/pages/records/FullKnowledgePage";
import ManagerOperationsPage from "@/pages/ManagerOperationsPage";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TourProvider } from "@/tour/TourProvider";
import { RoutePersistence } from "@/components/routing/RoutePersistence";
import { RootRoute } from "@/components/routing/RootRoute";
import { HarvestEntryRoute } from "@/components/routing/HarvestEntryRoute";
import { DomainGuard } from "@/components/routing/DomainGuard";
import { AppLockGate } from "@/components/auth/AppLockGate";
import { AppLockPrompt } from "@/components/auth/AppLockPrompt";
import { useAppLock } from "@/hooks/useAppLock";
import DevSignInPage from "@/pages/dev/DevSignIn";
import DevSignUpPage from "@/pages/dev/DevSignUp";
import DevBootstrapPage from "@/pages/dev/DevBootstrap";
import DevDiagnosticsPage from "@/pages/dev/DevDiagnosticsPage";
import DevReferralsPage from "@/pages/dev/DevReferralsPage";
import DevReferralDetailPage from "@/pages/dev/DevReferralDetailPage";
import DevQRGeneratorPage from "@/pages/dev/DevQRGeneratorPage";
import { DeveloperLayout } from "@/components/layout/DeveloperLayout";
import DeveloperCompaniesPage from "@/pages/developer/DeveloperCompaniesPage";
import DeveloperCompanyDetailsPage from "@/pages/developer/DeveloperCompanyDetailsPage";
import DeveloperUsersPage from "@/pages/developer/DeveloperUsersPage";
import DeveloperBillingConfirmationPage from "@/pages/developer/DeveloperBillingConfirmationPage";
import DeveloperFinancesPage from "@/pages/developer/DeveloperFinancesPage";
import DeveloperSubscriptionAnalyticsPage from "@/pages/developer/DeveloperSubscriptionAnalyticsPage";
import DeveloperExpensesPage from "@/pages/developer/DeveloperExpensesPage";
import DeveloperBackupsPage from "@/pages/developer/DeveloperBackupsPage";
import DeveloperCodeRedPage from "@/pages/developer/DeveloperCodeRedPage";
import DeveloperFeedbackInboxPage from "@/pages/developer/DeveloperFeedbackInboxPage";
import DeveloperAuditLogsPage from "@/pages/developer/DeveloperAuditLogsPage";
import DeveloperEmailCenterPage from "@/pages/developer/DeveloperEmailCenterPage";
import DeveloperHomePage from "@/pages/developer/DeveloperHomePage";
import DeveloperRecordViewPage from "@/pages/developer/DeveloperRecordViewPage";
import DeveloperCompanyMigrationsPage from "@/pages/developer/DeveloperCompanyMigrationsPage";
import DeveloperSettingsPage from "@/pages/developer/DeveloperSettingsPage";
import { DevAuthDebugPanel } from "@/components/debug/DevAuthDebugPanel";
import { PosthogAnalytics } from "@/components/analytics/PosthogAnalytics";

const queryClient = new QueryClient();

// Permission-driven landing: use effectiveAccess.landingPage so role/permission changes apply immediately.
const CompanyDashboardRoute = () => {
  const { user, effectiveAccess } = useAuth();

  if (!user) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[CompanyDashboardRoute] No user → /sign-in");
    }
    return <SignInRedirect />;
  }

  const landing = effectiveAccess.landingPage;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[CompanyDashboardRoute] landing", {
      uid: user.id,
      landingPage: landing,
      canSeeDashboard: effectiveAccess.canSeeDashboard,
      rolePreset: effectiveAccess.rolePreset,
    });
  }

  if (landing === "/admin") return <Navigate to="/developer" replace />;
  if (landing === "/dashboard") return <CompanyDashboard />;
  if (landing === "/manager" || landing === "/manager/operations") return <Navigate to="/manager" replace />;
  if (landing === "/broker") return <Navigate to="/broker" replace />;
  if (landing === "/driver") return <Navigate to="/driver" replace />;
  if (landing === "/staff") return <Navigate to="/staff" replace />;

  return <Navigate to={landing} replace />;
};

const AppRoutesWithLock = () => {
  const { user } = useAuth();
  const { showPrompt, refresh } = useAppLock();

  // Show first-time App Lock prompt if needed
  // Only shows when: not loading, no PIN exists, prompt not dismissed
  // Note: The actual lock screen is handled by AppLockGate at the root level
  if (showPrompt && user) {
    return (
      <AppLockPrompt
        onComplete={() => {
          refresh();
        }}
        onSkip={() => {
          refresh();
        }}
      />
    );
  }

  return (
    <Routes>
      {/* Public routes – no RequireAuth or onboarding; Clerk handles auth UI */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="/signin" element={<Navigate to="/sign-in" replace />} />
      <Route path="/signup" element={<Navigate to="/sign-up" replace />} />
      <Route path="/sign-in" element={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <SignInPage /> : <Navigate to="/emergency-access" replace />} />
      <Route path="/sign-in/*" element={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <SignInPage /> : <Navigate to="/emergency-access" replace />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route path="/accept-invitation/*" element={<AcceptInvitationPage />} />
      <Route path="/dev/sign-in" element={<DevSignInPage />} />
      <Route path="/dev/sign-in/*" element={<DevSignInPage />} />
      <Route path="/dev/sign-up" element={<DevSignUpPage />} />
      <Route path="/dev/sign-up/*" element={<DevSignUpPage />} />
      {/* Intercept any Clerk organization task routes for dev sign-up and send to Developer Home. */}
      <Route path="/dev/sign-up/tasks/*" element={<Navigate to="/developer" replace />} />
      <Route
        path="/dev/bootstrap"
        element={
          <DevRoute>
            <DevBootstrapPage />
          </DevRoute>
        }
      />
      <Route path="/auth/callback" element={<PostAuthContinuePage />} />
      <Route path="/auth/continue" element={<PostAuthContinuePage />} />
      <Route path="/auth/ambassador-continue" element={<AmbassadorAuthContinuePage />} />
      <Route path="/emergency-access" element={<EmergencyAccessPage />} />
      <Route path="/choose-plan" element={<Navigate to="/onboarding" replace />} />
      <Route path="/company" element={<Navigate to="/dashboard" replace />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/pending-approval" element={<RequireAuth><PendingApprovalPage /></RequireAuth>} />
      <Route path="/awaiting-approval" element={<Navigate to="/pending-approval" replace />} />
      <Route path="/start-fresh" element={<RequireAuth><StartFreshPage /></RequireAuth>} />
      <Route path="/setup-company" element={<Navigate to="/onboarding" replace />} />
      <Route path="/setup" element={<Navigate to="/onboarding" replace />} />

      {/* Core public pages */}
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/ambassador" element={<AmbassadorLandingPage />} />
      <Route path="/ambassador/signup" element={<AmbassadorSignupPage />} />
      <Route path="/ambassador/onboarding" element={<AmbassadorOnboardingPage />} />
      <Route path="/ambassador/refer" element={<Navigate to="/ambassador/console/refer" replace />} />
      <Route path="/ambassador/dashboard" element={<Navigate to="/ambassador/console/dashboard" replace />} />
      <Route path="/ambassador/console" element={<AmbassadorLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AmbassadorDashboardPage />} />
        <Route path="referrals" element={<AmbassadorReferralsPage />} />
        <Route path="earnings" element={<AmbassadorEarningsPage />} />
        <Route path="refer" element={<AmbassadorReferPage />} />
        <Route path="qr" element={<Navigate to="refer" replace />} />
        <Route path="settings" element={<AmbassadorSettingsPage />} />
      </Route>
      <Route path="/scan" element={<ScanPage />} />

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
        <Route path="/app" element={<CompanyDashboardRoute />} />
        <Route path="/app/*" element={<CompanyDashboardRoute />} />
        <Route path="/dashboard" element={<PermissionRoute module="dashboard"><CompanyDashboardRoute /></PermissionRoute>} />
        <Route path="/projects" element={<PermissionRoute module="projects"><RequireNotBroker><ProjectsPage /></RequireNotBroker></PermissionRoute>} />
        <Route path="/projects/new" element={<PermissionRoute module="projects" actionPath="create"><RequireNotBroker><Navigate to="/projects?new=1" replace /></RequireNotBroker></PermissionRoute>} />
        <Route path="/projects/:projectId/edit" element={<PermissionRoute module="projects"><RequireNotBroker><EditProjectPage /></RequireNotBroker></PermissionRoute>} />
        <Route path="/projects/:projectId" element={<PermissionRoute module="projects"><RequireNotBroker><ProjectDetailsPage /></RequireNotBroker></PermissionRoute>} />
        <Route path="/projects/:projectId/planning" element={<PermissionRoute module="planning"><RequireNotBroker><ProjectPlanningPage /></RequireNotBroker></PermissionRoute>} />
        <Route path="/crop-stages" element={<PermissionRoute module="planning"><CropStagesPage /></PermissionRoute>} />
        <Route path="/expenses" element={<PermissionRoute module="expenses"><ExpensesPage /></PermissionRoute>} />
        <Route path="/operations" element={<PermissionRoute module="operations"><AdminOperationsPage /></PermissionRoute>} />
        <Route path="/operations/legacy" element={<PermissionRoute module="operations"><OperationsPage /></PermissionRoute>} />
        <Route path="/inventory" element={<PermissionRoute module="inventory"><InventoryPage /></PermissionRoute>} />
        <Route path="/inventory/item/:itemId" element={<PermissionRoute module="inventory"><InventoryItemDetailsPage /></PermissionRoute>} />
        <Route path="/inventory/categories" element={<PermissionRoute module="inventory"><InventoryCategoriesPage /></PermissionRoute>} />
        <Route path="/inventory/suppliers" element={<PermissionRoute module="inventory"><InventorySuppliersPage /></PermissionRoute>} />
        {/* Crop-aware Harvest entrypoint (French Beans → Collections; others → Harvest & Sales) */}
        <Route path="/harvest" element={<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker/harvest-sales"><HarvestEntryRoute /></RequireNotBroker></PermissionRoute>} />
        <Route path="/harvest-sales" element={<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker/harvest-sales"><HarvestSalesPage /></RequireNotBroker></PermissionRoute>} />
        <Route path="/harvest-sales/harvest/:harvestId" element={<PermissionRoute module="harvest"><RequireNotBroker redirectTo="/broker/harvest-sales"><HarvestDetailsPage /></RequireNotBroker></PermissionRoute>} />
        {/* Single route with optional projectId so the page does not remount when URL gains/loses projectId */}
        <Route path="/harvest-collections/:projectId?" element={<PermissionRoute module="harvest"><RequireNotBroker><HarvestCollectionsPage /></RequireNotBroker></PermissionRoute>} />
        <Route path="/suppliers" element={<PermissionRoute module="projects"><SuppliersPage /></PermissionRoute>} />
        <Route path="/challenges" element={<PermissionRoute module="planning"><SeasonChallengesPage /></PermissionRoute>} />
        <Route path="/employees" element={<PermissionRoute module="employees"><EmployeesPage /></PermissionRoute>} />
        <Route path="/employees/:employeeId" element={<PermissionRoute module="employees"><EmployeeProfilePage /></PermissionRoute>} />
        <Route path="/reports" element={<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>} />
        <Route path="/billing" element={<PermissionRoute module="settings"><BillingPage /></PermissionRoute>} />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/settings" element={<PermissionRoute module="settings"><SettingsPage /></PermissionRoute>} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/records" element={<PermissionRoute module="notes"><AdminRecordsPage /></PermissionRoute>} />
        <Route path="/records/:cropSlug" element={<PermissionRoute module="notes"><CropDetailsPage /></PermissionRoute>} />
        <Route path="/records/:cropSlug/new" element={<PermissionRoute module="notes"><NotebookPage /></PermissionRoute>} />
        <Route path="/records/:cropSlug/:noteId" element={<PermissionRoute module="notes"><NotebookPage /></PermissionRoute>} />
      </Route>

      {/* Staff workspace routes */}
      <Route
        path="/staff"
        element={
          <RequireAuth>
            <StaffLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/staff/staff-dashboard" replace />} />
        <Route path="staff-dashboard" element={<StaffDashboard />} />
        <Route path="profile" element={<Navigate to="/settings" replace />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route
          path="harvest-collections"
          element={
            <PermissionRoute module="harvest">
              <HarvestCollectionsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="inventory"
          element={
            <PermissionRoute module="inventory">
              <InventoryPage />
            </PermissionRoute>
          }
        />
        <Route
          path="inventory/item/:itemId"
          element={
            <PermissionRoute module="inventory">
              <InventoryItemDetailsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <PermissionRoute module="expenses">
              <ExpensesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="operations"
          element={
            <PermissionRoute module="operations">
              <StaffOperationsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="reports"
          element={
            <PermissionRoute module="reports">
              <ReportsPage />
            </PermissionRoute>
          }
        />
      </Route>

      {/* Legacy role-based routes (manager/broker/driver) are no longer used; keep redirects for old bookmarks. */}
      <Route path="/manager" element={<Navigate to="/staff/staff-dashboard" replace />} />
      <Route path="/manager/*" element={<Navigate to="/staff/staff-dashboard" replace />} />
      <Route path="/broker" element={<Navigate to="/staff/staff-dashboard" replace />} />
      <Route path="/broker/*" element={<Navigate to="/staff/staff-dashboard" replace />} />
      <Route path="/driver" element={<Navigate to="/staff/staff-dashboard" replace />} />

      {/* Developer-only routes under /admin and /dev */}
      <Route
        element={
          <RequireDeveloper>
            <MainLayout />
          </RequireDeveloper>
        }
      >
        {/* Legacy /dev → canonical developer console */}
        <Route path="/dev" element={<Navigate to="/developer" replace />} />
        <Route path="/dev/dashboard" element={<Navigate to="/developer" replace />} />
        <Route path="/dev/diagnostics" element={<DevDiagnosticsPage />} />
        <Route path="/dev/referrals/:id" element={<DevReferralDetailPage />} />
        <Route path="/dev/referrals" element={<DevReferralsPage />} />
        <Route path="/dev/qr-generator" element={<Navigate to="/developer/qr" replace />} />
        {/* Legacy /admin/* still supported; index redirects to Developer Home */}
        <Route path="/admin" element={<Navigate to="/developer" replace />} />
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
      </Route>

      {/* New developer console under /developer with nested routes */}
      <Route
        path="/developer"
        element={
          <DeveloperRoute>
            <DeveloperLayout />
          </DeveloperRoute>
        }
      >
        <Route index element={<DeveloperHomePage />} />
        <Route path="companies" element={<DeveloperCompaniesPage />} />
        <Route path="companies/:companyId" element={<DeveloperCompanyDetailsPage />} />
        <Route path="users" element={<DeveloperUsersPage />} />
        <Route path="settings" element={<DeveloperSettingsPage />} />
        <Route path="billing-confirmation" element={<DeveloperBillingConfirmationPage />} />
        <Route path="finances" element={<DeveloperFinancesPage />} />
        <Route path="subscription-analytics" element={<DeveloperSubscriptionAnalyticsPage />} />
        <Route path="farmvault-expenses" element={<DeveloperExpensesPage />} />
        <Route path="backups" element={<DeveloperBackupsPage />} />
        <Route path="code-red" element={<DeveloperCodeRedPage />} />
        <Route path="feedback-inbox" element={<DeveloperFeedbackInboxPage />} />
        <Route path="audit-logs" element={<DeveloperAuditLogsPage />} />
        <Route path="email-center" element={<DeveloperEmailCenterPage />} />
        <Route path="email-logs" element={<Navigate to="/developer/email-center" replace />} />
        <Route path="records" element={<DeveloperRecordsPage />} />
        <Route path="records/:cropSlug" element={<CropDetailsPage />} />
        <Route path="records/:cropSlug/full-knowledge" element={<FullKnowledgePage />} />
        <Route path="records/:cropSlug/new" element={<NotebookPage />} />
        <Route path="records/:cropSlug/:noteId" element={<NotebookPage />} />
        <Route path="company-migrations" element={<DeveloperCompanyMigrationsPage />} />
        <Route path="qr" element={<DevQRGeneratorPage />} />
      </Route>
      
      {/* 404 route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

/**
 * Root App component.
 * 
 * CRITICAL: AppLockGate MUST be at the outermost level to enforce lock
 * BEFORE any providers, routing, or auth logic runs.
 * This prevents the lock from being bypassed by reload.
 */
const App = () => (
  <AppLockGate>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ProjectProvider>
          <NotificationProvider>
            <ConnectivityProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <HelmetProvider>
                    <DomainGuard />
                    <RoutePersistence />
                    <PosthogAnalytics />
                    <TourProvider>
                      <AppRoutesWithLock />
                    </TourProvider>
                    {import.meta.env.DEV && <DevAuthDebugPanel />}
                  </HelmetProvider>
                </BrowserRouter>
              </TooltipProvider>
            </ConnectivityProvider>
          </NotificationProvider>
        </ProjectProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </AppLockGate>
);

export default App;