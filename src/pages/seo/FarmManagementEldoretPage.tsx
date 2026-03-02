import React from "react";
import { Link } from "react-router-dom";
import { LocationPageTemplate } from "./LocationPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "Is there farm management software for Eldoret farmers?", answer: "Yes. FarmVault is used by farmers in Eldoret and Uasin Gishu for crop monitoring, expense tracking and harvest management. Start free and use it on mobile or desktop." },
  { question: "What crops can I manage with FarmVault near Eldoret?", answer: "FarmVault supports maize, wheat, potatoes, vegetables and more. Track costs and harvests per block and see profit per acre for any crop." },
];

export default function FarmManagementEldoretPage() {
  return (
    <LocationPageTemplate
      city="Eldoret"
      title="Farm Management Software Eldoret | Crop & Budget Tracking"
      description="Farm management software for Eldoret and Uasin Gishu: crop monitoring, expense tracking, harvest. For maize, wheat and mixed farmers. Start free."
      canonical={SEO_ROUTES.eldoret}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Management Software Eldoret</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farmers in Eldoret and the wider Rift Valley need reliable records and clear visibility over costs and yields. FarmVault provides farm management software that works from the field to the office—for maize, wheat, potatoes and other crops in the region.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why Eldoret-area farmers use FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Track <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crops</Link>, <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expenses</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvests</Link> in one place. Plan with the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> and compare with actuals. FarmVault supports <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link> and other staple and horticultural crops. Start free at <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Eldoret region screenshot]</div>
        </div>
      </div>
    </LocationPageTemplate>
  );
}
