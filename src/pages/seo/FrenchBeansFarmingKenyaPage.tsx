import React from "react";
import { Link } from "react-router-dom";
import { CropPillarTemplate } from "./CropPillarTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "What is the yield of French beans per acre in Kenya?", answer: "Under good management, 4–8 tonnes per acre per season is possible depending on variety and picking frequency. Track harvests in FarmVault to see your actual yield and profit per acre." },
  { question: "What fertilizer for French beans in Kenya?", answer: "Balanced NPK at planting and nitrogen top-dressing are common. Rhizobium inoculation can reduce N need. Track inputs in FarmVault for cost per kilogram and better budgeting." },
  { question: "Who buys French beans in Kenya?", answer: "Export and local markets buy French beans. Good records help you meet buyer requirements. Use FarmVault for traceability and harvest logistics." },
];

export default function FrenchBeansFarmingKenyaPage() {
  return (
    <CropPillarTemplate
      title="French Beans Farming in Kenya | Yield, Budget & Export Guide"
      description="French beans farming Kenya: yield per acre, budget, fertilizer and harvest. Plan and track with FarmVault farm management software."
      canonical={SEO_ROUTES.frenchBeansFarmingKenya}
      breadcrumbName="French Beans Farming Kenya"
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">French Beans Farming in Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        French beans are an important export and local vegetable in Kenya. This guide covers budget, yield per acre, fertilizer and harvest timeline. Use FarmVault to plan and track your French beans crop.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budget and yield</h2>
        <p className="text-muted-foreground leading-relaxed">
          Costs include seeds, stakes, fertiliser, labour and pest control. Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link>. Record harvests in FarmVault for yield and profit per acre.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Harvest and logistics</h2>
        <p className="text-muted-foreground leading-relaxed">
          Picking is frequent; good <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> and logistics are essential. FarmVault helps you track picks, weights and sales for clearer reporting to buyers.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Manage with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Use <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> for <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and harvest so you have one system for French beans costs and yields.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[French beans screenshot]</div>
        </div>
      </div>
    </CropPillarTemplate>
  );
}
