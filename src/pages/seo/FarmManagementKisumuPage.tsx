import React from "react";
import { Link } from "react-router-dom";
import { LocationPageTemplate } from "./LocationPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "Is there farm management software for Kisumu farmers?", answer: "Yes. FarmVault is used by farmers in Kisumu and the lake region for crop monitoring, expense tracking and harvest management. Start free on mobile or desktop." },
  { question: "What crops can I manage with FarmVault near Kisumu?", answer: "FarmVault supports rice, maize, vegetables and other crops common in the region. Track costs and harvests per block and see profit per acre." },
];

export default function FarmManagementKisumuPage() {
  return (
    <LocationPageTemplate
      city="Kisumu"
      title="Farm Management Software Kisumu | Crop & Budget Tracking"
      description="Farm management software for Kisumu and lake region: crop monitoring, expense tracking, harvest. For rice, maize and vegetables. Start free."
      canonical={SEO_ROUTES.kisumu}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Management Software Kisumu</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farmers in Kisumu and the lake region need clear records and visibility over costs and yields. FarmVault provides farm management software for rice, maize, vegetables and more—with crop monitoring, expense tracking and harvest management in one place.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why Kisumu-area farmers use FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Track <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crops</Link>, <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expenses</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvests</Link>. FarmVault supports <Link to={SEO_ROUTES.riceFarmingKenya} className="text-primary hover:underline">rice</Link>, <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link> and vegetables. Use the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> and get started free at <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Kisumu region screenshot]</div>
        </div>
      </div>
    </LocationPageTemplate>
  );
}
