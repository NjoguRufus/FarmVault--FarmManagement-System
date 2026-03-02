import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Crop Disease Database" }];

export default function CropDiseaseDatabaseHubPage() {
  return (
    <SeoPageLayout>
      <SeoHead
        title="Crop Disease Database Kenya | Identify & Manage"
        description="Crop disease database for Kenya: identify and manage common tomato, maize and vegetable diseases. Use with FarmVault crop monitoring."
        canonical={SEO_ROUTES.cropDiseaseDatabase}
        jsonLd={getBreadcrumbSchema(breadcrumbs)}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Crop Disease Database</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Crop Disease Database</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Reference for common crop diseases in Kenya. Each crop guide includes disease information and control tips. Use <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">FarmVault crop monitoring</Link> to log outbreaks and treatments and plan better next season.
        </p>
        <ul className="space-y-4">
          <li><Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary font-medium hover:underline">Tomato diseases</Link></li>
          <li><Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary font-medium hover:underline">Maize diseases</Link></li>
          <li><Link to={SEO_ROUTES.capsicumFarmingKenya} className="text-primary font-medium hover:underline">Capsicum diseases</Link></li>
        </ul>
      </article>
    </SeoPageLayout>
  );
}
