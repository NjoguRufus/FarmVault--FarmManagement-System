import React from "react";
import { Link } from "react-router-dom";
import { CropPillarTemplate } from "./CropPillarTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "What is the yield of watermelon per acre in Kenya?", answer: "Under good management, 15–30 tonnes per acre per season is possible. Track harvests in FarmVault to see your actual yield and profit per acre." },
  { question: "What fertilizer for watermelon in Kenya?", answer: "Balanced NPK at planting and potassium later can improve fruit quality. Track inputs in FarmVault for cost per kilogram and budgeting." },
  { question: "When to plant watermelon in Kenya?", answer: "Plant with the rains or under irrigation. Avoid cold and waterlogging. Record planting and harvest dates in FarmVault for season comparison." },
];

export default function WatermelonFarmingKenyaPage() {
  return (
    <CropPillarTemplate
      title="Watermelon Farming in Kenya | Yield, Budget & Profit Guide"
      description="Watermelon farming Kenya: yield per acre, budget, fertilizer and harvest. Plan and track with FarmVault farm management software."
      canonical={SEO_ROUTES.watermelonFarmingKenya}
      breadcrumbName="Watermelon Farming Kenya"
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Watermelon Farming in Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Watermelon is a popular fruit crop in Kenya. This guide covers budget, yield per acre, fertilizer and harvest timeline. Use FarmVault to plan and track your watermelon crop and costs.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budget and yield per acre</h2>
        <p className="text-muted-foreground leading-relaxed">
          Costs include seeds, fertiliser, labour and pest control. Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link>. Record harvests in FarmVault for yield and profit per acre.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Harvest and profit</h2>
        <p className="text-muted-foreground leading-relaxed">
          Harvest is typically 70–90 days after planting. Use <Link to={SEO_ROUTES.yieldPerAcreCalculator} className="text-primary hover:underline">yield per acre calculator</Link> and FarmVault’s <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> to track picks and sales and see profit.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Manage with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Use <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> for <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">budgeting</Link> and harvest so you have one system for watermelon costs and yields.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Watermelon screenshot]</div>
        </div>
      </div>
    </CropPillarTemplate>
  );
}
