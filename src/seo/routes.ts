/**
 * Central list of all public SEO routes for sitemap generation and internal linking.
 * Update this when adding new pillar pages, blog posts, or location pages.
 */

const BASE = "";

export const SEO_ROUTES = {
  home: `${BASE}/`,
  // Core pages
  features: `${BASE}/features`,
  pricing: `${BASE}/pricing`,
  about: `${BASE}/about`,
  faq: `${BASE}/faq`,
  learn: `${BASE}/learn`,
  learnFarmManagement: `${BASE}/learn/farm-management`,
  whatIsFarmVault: `${BASE}/what-is-farmvault`,
  agricultureSoftwareKenya: `${BASE}/agriculture-software-kenya`,
  ambassador: `${BASE}/ambassador`,
  ambassadorSignup: `${BASE}/ambassador/signup`,
  ambassadorDashboard: `${BASE}/ambassador/console/dashboard`,
  ambassadorOnboarding: `${BASE}/ambassador/onboarding`,
  ambassadorRefer: `${BASE}/ambassador/console/refer`,
  // Product pillar pages
  farmManagementSoftwareKenya: `${BASE}/farm-management-software-kenya`,
  cropMonitoringSoftware: `${BASE}/crop-monitoring-software`,
  farmInventoryManagement: `${BASE}/farm-inventory-management-system`,
  farmExpenseTracking: `${BASE}/farm-expense-tracking-software`,
  farmHarvestManagement: `${BASE}/farm-harvest-management-system`,
  farmProjectManagement: `${BASE}/farm-project-management-software`,
  farmBudgetingSoftware: `${BASE}/farm-budgeting-software`,
  // Hubs
  cropGuides: `${BASE}/crop-guides`,
  farmBudgetGuides: `${BASE}/farm-budget-guides`,
  farmChemicalsGuide: `${BASE}/farm-chemicals-guide`,
  cropDiseaseDatabase: `${BASE}/crop-disease-database`,
  farmCalculators: `${BASE}/farm-calculators`,
  // Crop pillars
  tomatoFarmingKenya: `${BASE}/tomato-farming-kenya`,
  maizeFarmingKenya: `${BASE}/maize-farming-kenya`,
  riceFarmingKenya: `${BASE}/rice-farming-kenya`,
  frenchBeansFarmingKenya: `${BASE}/french-beans-farming-kenya`,
  capsicumFarmingKenya: `${BASE}/capsicum-farming-kenya`,
  watermelonFarmingKenya: `${BASE}/watermelon-farming-kenya`,
  // Location pages
  nairobi: `${BASE}/farm-management-software-nairobi`,
  eldoret: `${BASE}/farm-management-software-eldoret`,
  nakuru: `${BASE}/farm-management-software-nakuru`,
  kisumu: `${BASE}/farm-management-software-kisumu`,
  mombasa: `${BASE}/farm-management-software-mombasa`,
  // Calculators
  tomatoProfitCalculator: `${BASE}/tomato-profit-calculator`,
  maizeProfitCalculator: `${BASE}/maize-profit-calculator`,
  farmBudgetCalculator: `${BASE}/farm-budget-calculator`,
  yieldPerAcreCalculator: `${BASE}/yield-per-acre-calculator`,
  // Blog
  blog: `${BASE}/blog`,
} as const;

/** All routes for sitemap (order: home, pillars, hubs, crops, locations, calculators, blog). */
export function getAllSeoPaths(): string[] {
  return [
    SEO_ROUTES.home,
    SEO_ROUTES.features,
    SEO_ROUTES.pricing,
    SEO_ROUTES.about,
    SEO_ROUTES.faq,
    SEO_ROUTES.learn,
    SEO_ROUTES.learnFarmManagement,
    SEO_ROUTES.whatIsFarmVault,
    SEO_ROUTES.agricultureSoftwareKenya,
    SEO_ROUTES.ambassador,
    SEO_ROUTES.ambassadorSignup,
    SEO_ROUTES.ambassadorDashboard,
    SEO_ROUTES.ambassadorOnboarding,
    SEO_ROUTES.farmManagementSoftwareKenya,
    SEO_ROUTES.cropMonitoringSoftware,
    SEO_ROUTES.farmInventoryManagement,
    SEO_ROUTES.farmExpenseTracking,
    SEO_ROUTES.farmHarvestManagement,
    SEO_ROUTES.farmProjectManagement,
    SEO_ROUTES.farmBudgetingSoftware,
    SEO_ROUTES.cropGuides,
    SEO_ROUTES.farmBudgetGuides,
    SEO_ROUTES.farmChemicalsGuide,
    SEO_ROUTES.cropDiseaseDatabase,
    SEO_ROUTES.farmCalculators,
    SEO_ROUTES.tomatoFarmingKenya,
    SEO_ROUTES.maizeFarmingKenya,
    SEO_ROUTES.riceFarmingKenya,
    SEO_ROUTES.frenchBeansFarmingKenya,
    SEO_ROUTES.capsicumFarmingKenya,
    SEO_ROUTES.watermelonFarmingKenya,
    SEO_ROUTES.nairobi,
    SEO_ROUTES.eldoret,
    SEO_ROUTES.nakuru,
    SEO_ROUTES.kisumu,
    SEO_ROUTES.mombasa,
    SEO_ROUTES.tomatoProfitCalculator,
    SEO_ROUTES.maizeProfitCalculator,
    SEO_ROUTES.farmBudgetCalculator,
    SEO_ROUTES.yieldPerAcreCalculator,
    SEO_ROUTES.blog,
  ];
}

/** Blog slug list – add new posts here and to blog data. */
export const BLOG_SLUGS = [
  "farm-record-keeping-template-kenya",
  "best-fertilizer-for-tomatoes-kenya",
  "maize-farming-profit-per-acre-kenya",
  "how-to-track-farm-expenses",
  "crop-rotation-kenya",
  "drip-irrigation-vs-furrow-kenya",
  "tomato-diseases-kenya-control",
  "farm-budget-template-excel",
  "harvest-logistics-smallholder",
  "agricultural-management-software-africa",
  "greenhouse-vs-open-field-tomatoes",
  "organic-fertilizer-kenya",
  "farm-inventory-software-benefits",
  "post-harvest-handling-vegetables",
  "soil-testing-kenya-cost",
  "farm-project-management-tools",
  "irrigation-scheduling-kenya",
  "pest-management-tomatoes-kenya",
  "farm-finance-tracking-app",
  "climate-smart-agriculture-kenya",
  "best-farm-management-software-kenya",
  "agriculture-software-africa",
  "how-to-manage-farm-workers-kenya",
  "farm-record-keeping-system-kenya",
] as const;

export type BlogSlug = (typeof BLOG_SLUGS)[number];

export function getBlogPostPath(slug: BlogSlug): string {
  return `${BASE}/blog/${slug}`;
}

export function getAllSeoPathsWithBlog(): string[] {
  const base = getAllSeoPaths().filter((p) => p !== SEO_ROUTES.blog);
  const blogIndex = SEO_ROUTES.blog;
  const blogPosts = BLOG_SLUGS.map((s) => `${BASE}/blog/${s}`);
  return [...base, blogIndex, ...blogPosts];
}
