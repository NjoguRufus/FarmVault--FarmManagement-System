import React from "react";
import { Link } from "react-router-dom";
import { CropPillarTemplate } from "./CropPillarTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "What is the yield of rice per acre in Kenya?", answer: "Paddy yield varies; under irrigation, 3–5 tonnes per acre per season is achievable. Improved varieties and good water and nutrient management improve results. Track your harvests in FarmVault to see actual yield per block." },
  { question: "What fertilizer for rice in Kenya?", answer: "NPK and urea are commonly used; rates depend on soil and water regime. Track inputs and costs in FarmVault so you know cost per bag and can refine your budget next season." },
  { question: "Where is rice grown in Kenya?", answer: "Major rice-growing areas include Mwea, Ahero and Bunyala. FarmVault works for rice farmers in these and other regions for crop and expense tracking and harvest management." },
];

export default function RiceFarmingKenyaPage() {
  return (
    <CropPillarTemplate
      title="Rice Farming in Kenya | Yield, Budget & Management Guide"
      description="Rice farming Kenya: yield per acre, budget, fertilizer and harvest. Plan and track with FarmVault farm management software."
      canonical={SEO_ROUTES.riceFarmingKenya}
      breadcrumbName="Rice Farming Kenya"
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Rice Farming in Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Rice farming in Kenya is important in irrigated schemes and suitable rain-fed areas. This guide covers budget, yield per acre, fertilizer use and harvest timeline. Use FarmVault to plan and track your rice crop and costs.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budget and yield per acre</h2>
        <p className="text-muted-foreground leading-relaxed">
          Costs include land prep, seed, fertiliser, water, labour and harvest. Yields of 3–5 tonnes paddy per acre are possible under good management. Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> in FarmVault to plan and record actuals.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Diseases and fertilizer</h2>
        <p className="text-muted-foreground leading-relaxed">
          Blast and other diseases need monitoring; use recommended varieties and sprays. Record control measures in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>. Fertilizer and harvest tracking help you see cost per kilogram and profit per acre.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Manage rice with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Track rice projects, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link>, expenses and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvests</Link> in one place with FarmVault. Start free and build a clear record of your rice farming performance.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Rice farming screenshot]</div>
        </div>
      </div>
    </CropPillarTemplate>
  );
}
