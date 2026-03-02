import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Chemicals Guide" }];

export default function FarmChemicalsGuideHubPage() {
  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm Chemicals Guide Kenya | Fertilizer & Crop Protection"
        description="Farm chemicals guide for Kenya: fertilizer and crop protection best practices. Track usage with FarmVault inventory and expense tracking."
        canonical={SEO_ROUTES.farmChemicalsGuide}
        jsonLd={getBreadcrumbSchema(breadcrumbs)}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Farm Chemicals Guide</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Farm Chemicals Guide</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Guidance on fertilisers and crop protection products for Kenyan farmers. Use <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">FarmVault inventory</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> to record what you use and the results. See crop-specific advice in our <Link to={SEO_ROUTES.cropGuides} className="text-primary hover:underline">crop guides</Link> and <Link to={SEO_ROUTES.cropDiseaseDatabase} className="text-primary hover:underline">crop disease database</Link>.
        </p>
      </article>
    </SeoPageLayout>
  );
}
