import React from "react";
import { Link } from "react-router-dom";
import { LocationPageTemplate } from "./LocationPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "Is there farm management software for Mombasa farmers?", answer: "Yes. FarmVault is used by farmers in Mombasa and the coast for crop monitoring, expense tracking and harvest management. Start free on mobile or desktop." },
  { question: "What crops can I manage with FarmVault at the coast?", answer: "FarmVault supports coconuts, vegetables, fruits and other coastal crops. Track costs and harvests per block and see profit. Built for Kenyan conditions and KES." },
];

export default function FarmManagementMombasaPage() {
  return (
    <LocationPageTemplate
      city="Mombasa"
      title="Farm Management Software Mombasa | Crop & Budget Tracking"
      description="Farm management software for Mombasa and coast: crop monitoring, expense tracking, harvest. For vegetables and mixed farming. Start free."
      canonical={SEO_ROUTES.mombasa}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Management Software Mombasa</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farmers in Mombasa and the coast need one place to plan crops, track costs and manage harvests. FarmVault provides farm management software that works from the field to the office—for vegetables, fruits and mixed farming in the region.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why coast farmers use FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Use <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> in one system. Plan with the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link>. Get started free at <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Mombasa / coast screenshot]</div>
        </div>
      </div>
    </LocationPageTemplate>
  );
}
