import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Calculators" }];
const calculators = [
  { name: "Tomato Profit Calculator", path: SEO_ROUTES.tomatoProfitCalculator },
  { name: "Maize Profit Calculator", path: SEO_ROUTES.maizeProfitCalculator },
  { name: "Farm Budget Calculator", path: SEO_ROUTES.farmBudgetCalculator },
  { name: "Yield per Acre Calculator", path: SEO_ROUTES.yieldPerAcreCalculator },
];

export default function FarmCalculatorsHubPage() {
  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm Calculators Kenya | Profit, Budget & Yield"
        description="Free farm calculators for Kenya: tomato profit, maize profit, farm budget and yield per acre. Plan with FarmVault farm management software."
        canonical={SEO_ROUTES.farmCalculators}
        jsonLd={getBreadcrumbSchema(breadcrumbs)}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Farm Calculators</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Farm Calculators</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Free tools to estimate profit, budget and yield. Use with <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> to track actuals and improve your planning.
        </p>
        <ul className="space-y-4">
          {calculators.map((c) => (
            <li key={c.path}>
              <Link to={c.path} className="text-primary font-medium hover:underline">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </SeoPageLayout>
  );
}
