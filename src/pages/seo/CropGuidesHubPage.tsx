import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Crop Guides" }];
const crops = [
  { name: "Tomato Farming Kenya", path: SEO_ROUTES.tomatoFarmingKenya },
  { name: "Maize Farming Kenya", path: SEO_ROUTES.maizeFarmingKenya },
  { name: "Rice Farming Kenya", path: SEO_ROUTES.riceFarmingKenya },
  { name: "French Beans Farming Kenya", path: SEO_ROUTES.frenchBeansFarmingKenya },
  { name: "Capsicum Farming Kenya", path: SEO_ROUTES.capsicumFarmingKenya },
  { name: "Watermelon Farming Kenya", path: SEO_ROUTES.watermelonFarmingKenya },
];

export default function CropGuidesHubPage() {
  return (
    <SeoPageLayout>
      <SeoHead
        title="Crop Guides Kenya | Tomato, Maize, Rice & More"
        description="FarmVault crop guides for Kenya: tomato, maize, rice, French beans, capsicum, watermelon. Budget, yield, fertilizer and diseases. Plan with farm management software."
        canonical={SEO_ROUTES.cropGuides}
        jsonLd={getBreadcrumbSchema(breadcrumbs)}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Crop Guides</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Crop Guides</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Practical guides for major crops in Kenya: budget per acre, yield expectations, common diseases and fertilizer recommendations. Use these with <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault farm management software</Link> to plan and track your crops.
        </p>
        <ul className="space-y-4">
          {crops.map((c) => (
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
