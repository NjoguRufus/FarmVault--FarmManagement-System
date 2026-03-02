import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Crop Monitoring Software" }];
const faqs = [
  { question: "What is crop monitoring software?", answer: "Crop monitoring software helps farmers track growth stages, health and conditions of crops in the field. You can record planting dates, log observations and link data to specific blocks or varieties for better decisions and record-keeping." },
  { question: "Why is crop monitoring important in Kenya?", answer: "Monitoring lets you spot disease or nutrient issues early, plan labour and inputs, and compare performance across seasons. Good records also help when applying for credit or selling to buyers who require traceability." },
  { question: "Does FarmVault support crop monitoring?", answer: "Yes. FarmVault includes crop and project planning, growth stage tracking and links to expenses and harvests. It supports major Kenyan crops including tomatoes, maize, rice and French beans with stage-based guidance." },
  { question: "Can I use crop monitoring on mobile?", answer: "FarmVault works in the browser on your phone so you can update crop stages and add notes from the field. Data syncs to your account for reporting and planning on any device." },
];

export default function CropMonitoringSoftwarePage() {
  return (
    <PillarPageTemplate
      title="Crop Monitoring Software | Track Growth & Health Kenya"
      description="Crop monitoring software for Kenyan farmers: track growth stages, crop health and field conditions. Plan and monitor tomatoes, maize and more. Try FarmVault free."
      canonical={SEO_ROUTES.cropMonitoringSoftware}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Crop Monitoring Software</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Crop monitoring software gives farmers a clear view of what is happening in the field. By recording planting dates, growth stages and observations, you can spot problems early, plan inputs and labour, and build a history that improves your decisions season after season.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">What crop monitoring includes</h2>
        <p className="text-muted-foreground leading-relaxed">
          Effective crop monitoring covers planning (what you plant, where and when), tracking (growth stages and health) and linking to costs and harvests. Software like FarmVault brings these together so you see the full picture from land prep to sale.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Benefits for Kenyan farmers</h2>
        <p className="text-muted-foreground leading-relaxed">
          With structured crop data you can identify which varieties and blocks perform best, when to apply fertiliser or pesticides, and how much you spent per acre. This supports better <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">farm budgeting</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link>. FarmVault supports <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomato</Link>, <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link> and other major crops with localised guidance.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Start with FarmVault for free: create projects, add your crops and begin logging stages and notes. As you build history, your crop monitoring becomes a powerful tool for planning and profitability.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Crop monitoring screenshot]</div>
        </div>
      </div>
    </PillarPageTemplate>
  );
}
