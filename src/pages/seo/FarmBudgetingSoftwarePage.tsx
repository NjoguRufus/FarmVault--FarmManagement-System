import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Budgeting Software" }];
const faqs = [
  { question: "What is farm budgeting software?", answer: "Farm budgeting software helps you plan income and costs before and during the season. You estimate inputs, labour and other expenses per crop or block and compare with actuals to improve decisions and secure financing." },
  { question: "Why budget for the farm?", answer: "A clear budget helps you avoid overspending, plan purchases and demonstrate viability to lenders or partners. When you track actuals against the budget, you see where you are on track and where to adjust." },
  { question: "Does FarmVault include budgeting?", answer: "Yes. FarmVault lets you plan and track costs by project. You can see budget vs actual and use the farm budget calculator to model scenarios. Expense and harvest data feed into the same system." },
  { question: "Can I budget per crop?", answer: "FarmVault is built around projects (e.g. per crop or block). You can set expected costs and compare with actual expenses and harvest revenue for each project, so budgeting is directly tied to your crop and harvest data." },
];

export default function FarmBudgetingSoftwarePage() {
  return (
    <PillarPageTemplate
      title="Farm Budgeting Software | Plan Costs & Profit Kenya"
      description="Farm budgeting software for Kenya: plan costs per crop, track actuals and compare. Use the farm budget calculator. Part of FarmVault."
      canonical={SEO_ROUTES.farmBudgetingSoftware}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Budgeting Software</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farm budgeting turns your plans into numbers. When you estimate costs and revenue per crop or block and then track what actually happens, you can run your farm with more control and make better choices for the next season.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why farm budgeting matters</h2>
        <p className="text-muted-foreground leading-relaxed">
          Without a budget, spending can drift and profit stay unclear. A budget gives you a target and a framework to track <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expenses</Link> and harvests. Many lenders and buyers also want to see planned and actual figures; budgeting software helps you provide that.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budgeting with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          FarmVault ties budgeting to your <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest</Link> data. Plan by project, record actuals as you go and use the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> to model different scenarios. Suitable for <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomato</Link>, <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link> and other Kenyan crops.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Start with FarmVault for free. Create projects, add your expected costs and begin logging actual expenses and harvests. Over time your budget vs actual history becomes a key tool for profitability.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Budget overview screenshot]</div>
        </div>
      </div>
    </PillarPageTemplate>
  );
}
