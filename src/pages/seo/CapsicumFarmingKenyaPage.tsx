import React from "react";
import { Link } from "react-router-dom";
import { CropPillarTemplate } from "./CropPillarTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "What is the yield of capsicum per acre in Kenya?", answer: "Greenhouse capsicum can yield 15–25 tonnes per acre per year; open field is lower. Track harvests in FarmVault to see your actual yield and profit." },
  { question: "What fertilizer for capsicum in Kenya?", answer: "Balanced NPK and calcium are important. Track inputs and costs in FarmVault for cost per kilogram and better budgeting next season." },
  { question: "What are common capsicum diseases in Kenya?", answer: "Bacterial spot, powdery mildew and viruses occur. Use resistant varieties and good hygiene. Log control measures in FarmVault for planning." },
];

export default function CapsicumFarmingKenyaPage() {
  return (
    <CropPillarTemplate
      title="Capsicum Farming in Kenya | Yield, Budget & Greenhouse Guide"
      description="Capsicum farming Kenya: yield per acre, budget, fertilizer and diseases. Plan and track with FarmVault farm management software."
      canonical={SEO_ROUTES.capsicumFarmingKenya}
      breadcrumbName="Capsicum Farming Kenya"
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Capsicum Farming in Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Capsicum (bell pepper) is grown under greenhouse and open field in Kenya. This guide covers budget, yield, fertilizer and harvest. Use FarmVault to plan and track your capsicum crop.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budget and yield per acre</h2>
        <p className="text-muted-foreground leading-relaxed">
          Greenhouse costs are higher but yields can reach 15–25 tonnes per acre per year. Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> in FarmVault to plan and record actuals.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Diseases and fertilizer</h2>
        <p className="text-muted-foreground leading-relaxed">
          Monitor for bacterial spot, mildew and viruses; use recommended sprays. Record inputs and control costs in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> for better planning.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Manage with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Track capsicum projects, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link>, expenses and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvests</Link> in one place. Start free and build a clear record of your capsicum performance.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Capsicum screenshot]</div>
        </div>
      </div>
    </CropPillarTemplate>
  );
}
