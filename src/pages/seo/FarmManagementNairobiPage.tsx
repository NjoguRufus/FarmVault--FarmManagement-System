import React from "react";
import { Link } from "react-router-dom";
import { LocationPageTemplate } from "./LocationPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "Is there farm management software for Nairobi farmers?", answer: "Yes. FarmVault is used by farmers and agribusinesses in and around Nairobi for crop monitoring, expense tracking, inventory and harvest management. You can start free and use it on your phone or computer." },
  { question: "Can I use FarmVault for farms near Nairobi?", answer: "FarmVault works for any location. Farmers in Kiambu, Kajiado, Machakos and other areas around Nairobi use it to plan crops, track costs and manage harvests in one system." },
  { question: "How do I get started with farm software in Nairobi?", answer: "Sign up at FarmVault, create your first project and start logging crops and expenses. The system is built for Kenyan conditions and supports major crops and local budgeting in KES." },
];

export default function FarmManagementNairobiPage() {
  return (
    <LocationPageTemplate
      city="Nairobi"
      title="Farm Management Software Nairobi | Crop & Budget Tracking"
      description="Farm management software for Nairobi and surrounding areas: crop monitoring, expense tracking, harvest. Used by farmers in Nairobi, Kiambu and beyond. Start free."
      canonical={SEO_ROUTES.nairobi}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Management Software Nairobi</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farmers and agribusinesses in Nairobi and the surrounding counties need a clear view of their crops, costs and harvests. FarmVault provides farm management software that works from the office or the field—whether your farm is in Kiambu, Kajiado, Machakos or elsewhere in the region.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why Nairobi-area farmers use FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          FarmVault combines <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link>, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> in one system. Plan your <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomato</Link> or <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link> projects, track every cost and see profit per block. Start with a free trial and scale as you grow.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault farm management software</Link> is built for Kenya. Create your account, add your projects and begin recording crops and expenses. Use it on your phone in the field or on a computer for reports and planning.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Nairobi / region screenshot]</div>
        </div>
      </div>
    </LocationPageTemplate>
  );
}
