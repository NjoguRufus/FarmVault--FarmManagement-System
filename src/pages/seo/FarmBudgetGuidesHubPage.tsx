import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Budget Guides" }];

export default function FarmBudgetGuidesHubPage() {
  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm Budget Guides Kenya | Plan Costs & Profit"
        description="Farm budget guides and tools for Kenya: plan costs per crop, use the farm budget calculator and track actuals with FarmVault."
        canonical={SEO_ROUTES.farmBudgetGuides}
        jsonLd={getBreadcrumbSchema(breadcrumbs)}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Farm Budget Guides</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Farm Budget Guides</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Plan your farm costs and compare with actuals. Use our guides and calculators with <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> for better budgeting.
        </p>
        <ul className="space-y-4">
          <li><Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary font-medium hover:underline">Farm Budgeting Software</Link></li>
          <li><Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary font-medium hover:underline">Farm Budget Calculator</Link></li>
          <li><Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary font-medium hover:underline">Tomato Farming Kenya (Budget)</Link></li>
          <li><Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary font-medium hover:underline">Maize Farming Kenya (Budget)</Link></li>
        </ul>
      </article>
    </SeoPageLayout>
  );
}
