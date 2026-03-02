import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Harvest Management System" }];
const faqs = [
  { question: "What is harvest management software?", answer: "Harvest management software helps you record harvests, weights, collections and sales. You can see what was picked, when and from where, and link harvest data to costs for profit analysis." },
  { question: "Why is harvest logistics important?", answer: "Efficient harvest logistics reduce delays and losses. When you track collections, weights and buyers, you can coordinate labour and transport and have accurate figures for pricing and payment. Good records also support traceability for buyers." },
  { question: "Does FarmVault handle harvests?", answer: "Yes. FarmVault includes harvest and collection tracking so you can log picks, weights and sales. Data links to your crop and expense records so you can see revenue and profit per project or crop." },
  { question: "Can I track harvest by block or crop?", answer: "FarmVault lets you associate harvests with specific projects and blocks. You can see yield per area, compare seasons and use the data for better planning and budgeting next time." },
];

export default function FarmHarvestManagementPage() {
  return (
    <PillarPageTemplate
      title="Farm Harvest Management System | Harvest Logistics Kenya"
      description="Harvest management and logistics for Kenyan farmers: track picks, weights and sales. Link harvests to costs. Part of FarmVault farm management software."
      canonical={SEO_ROUTES.farmHarvestManagement}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Harvest Management System</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Harvest management and harvest logistics are where your crop work turns into revenue. Recording what you pick, when and from where—and linking it to sales—gives you a clear picture of yield and profit. The right system connects harvest data to your crops and costs so you can improve season after season.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">What harvest management covers</h2>
        <p className="text-muted-foreground leading-relaxed">
          From first pick to sale, you need to know quantities, dates and (where relevant) buyers. Harvest management software like FarmVault lets you log collections by project or block, record weights and sales, and see how revenue compares to your <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expenses</Link> and <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">budget</Link>.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Harvest logistics in practice</h2>
        <p className="text-muted-foreground leading-relaxed">
          Good harvest logistics mean the right labour at the right time, efficient transport and clear records for buyers. When harvest data is in one place with your <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link> and costs, you can spot bottlenecks and improve planning. FarmVault supports this workflow for <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomatoes</Link>, <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link> and other Kenyan crops.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Start with FarmVault for free. Add your projects, record your harvests and sales, and build a harvest history that supports better decisions and clearer reporting for buyers and lenders.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Harvest management screenshot]</div>
        </div>
      </div>
    </PillarPageTemplate>
  );
}
