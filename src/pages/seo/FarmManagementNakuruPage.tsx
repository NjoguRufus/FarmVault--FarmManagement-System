import React from "react";
import { Link } from "react-router-dom";
import { LocationPageTemplate } from "./LocationPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "Is there farm management software for Nakuru farmers?", answer: "Yes. FarmVault is used by farmers in Nakuru and the Rift Valley for crop monitoring, expense tracking and harvest management. Start free on mobile or desktop." },
  { question: "What can I track with FarmVault in Nakuru?", answer: "Track maize, potatoes, vegetables and other crops. Record costs per block, manage inventory and harvests, and see profit per acre. FarmVault is built for Kenyan conditions." },
];

export default function FarmManagementNakuruPage() {
  return (
    <LocationPageTemplate
      city="Nakuru"
      title="Farm Management Software Nakuru | Crop & Budget Tracking"
      description="Farm management software for Nakuru and Rift Valley: crop monitoring, expense tracking, harvest. For maize, potatoes and horticulture. Start free."
      canonical={SEO_ROUTES.nakuru}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Management Software Nakuru</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Nakuru and the Rift Valley are key agricultural regions. FarmVault gives farmers here one place to plan crops, track every expense and manage harvests—so you know your costs and profit per acre.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why Nakuru-area farmers use FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Use <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> in one system. Plan with the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link>. FarmVault supports <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link>, <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomatoes</Link> and more. Get started free at <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Nakuru region screenshot]</div>
        </div>
      </div>
    </LocationPageTemplate>
  );
}
