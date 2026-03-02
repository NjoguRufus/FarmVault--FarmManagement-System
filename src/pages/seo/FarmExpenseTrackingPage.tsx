import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Expense Tracking Software" }];
const faqs = [
  { question: "What is farm expense tracking?", answer: "Farm expense tracking is the practice of recording every cost related to your farm—seeds, labour, chemicals, fuel, equipment—so you know where your money goes and can calculate profit per crop or per acre." },
  { question: "Why track farm expenses?", answer: "Without records, you cannot know true profitability. Tracking helps you stick to a budget, identify overspending and prepare accurate figures for buyers or lenders. It is the foundation of sound farm financial management." },
  { question: "How does FarmVault track expenses?", answer: "FarmVault lets you log expenses by category and link them to projects or activities. You can view spending over time, by crop and by type. Reports and dashboards show where your money goes and support better budgeting." },
  { question: "Can I track expenses on my phone?", answer: "Yes. You can record expenses in the field using FarmVault on your mobile browser or installed app. Data syncs so you can review and report on a computer when convenient." },
];

export default function FarmExpenseTrackingPage() {
  return (
    <PillarPageTemplate
      title="Farm Expense Tracking Software | Record Costs Kenya"
      description="Farm expense tracking software for Kenya: log inputs, labour and costs per crop. See spending and profit. Part of FarmVault farm management."
      canonical={SEO_ROUTES.farmExpenseTracking}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Expense Tracking Software</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farm expense tracking turns scattered receipts and mental notes into clear data. When every cost is recorded and linked to the right crop or activity, you see real profitability and can improve your <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">farm budgeting</Link> for the next season.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">What to track</h2>
        <p className="text-muted-foreground leading-relaxed">
          Track seeds and inputs, labour, chemicals, fuel, equipment hire and any other cost that belongs to a project or block. The more consistent you are, the more accurate your cost per acre and cost per kilogram become. FarmVault integrates with <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest</Link> so you can tie costs to yields.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Benefits</h2>
        <p className="text-muted-foreground leading-relaxed">
          Clear expense data supports better decisions, loan applications and buyer requirements. Use the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> to plan before you plant and compare with actuals. FarmVault is built for Kenyan farmers and works on mobile and desktop.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Start with FarmVault for free. Create your projects, add your first expenses and build a habit of recording. Over time your expense history becomes one of your most valuable assets for running a profitable farm.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Expense tracking screenshot]</div>
        </div>
      </div>
    </PillarPageTemplate>
  );
}
