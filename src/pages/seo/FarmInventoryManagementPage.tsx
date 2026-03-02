import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Inventory Management System" }];
const faqs = [
  { question: "What is farm inventory management?", answer: "Farm inventory management is the practice of tracking seeds, fertilisers, chemicals and other inputs so you know what you have, where it is and when to reorder. Good systems reduce waste and prevent runouts at critical times." },
  { question: "Why do I need inventory software for my farm?", answer: "Manual lists get lost or outdated. Software gives you one place to record stock, usage and reorder points. You can link usage to specific crops or projects and see consumption trends for better purchasing." },
  { question: "Does FarmVault include inventory?", answer: "Yes. FarmVault includes inventory tracking so you can manage inputs, set low-stock alerts and see usage against your crop and expense records. It fits into the same system you use for crop monitoring and harvests." },
  { question: "Can I track inventory per crop?", answer: "FarmVault lets you associate inputs and usage with projects and activities, so you can see what was used per block or crop. This supports accurate cost tracking and budgeting." },
];

export default function FarmInventoryManagementPage() {
  return (
    <PillarPageTemplate
      title="Farm Inventory Management System | Inputs & Stock Kenya"
      description="Farm inventory management for Kenya: track seeds, fertilisers and chemicals. Low-stock alerts and usage reports. Part of FarmVault farm management software."
      canonical={SEO_ROUTES.farmInventoryManagement}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Farm Inventory Management System</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farm inventory management keeps your inputs under control. When you know what you have and what you use, you avoid running out at planting or spraying time and reduce overbuying. The right system ties inventory to your crops and expenses for a complete view of your operation.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Why inventory matters</h2>
        <p className="text-muted-foreground leading-relaxed">
          Seeds, fertilisers and crop protection products represent a large share of farm costs. Tracking stock levels and usage helps you order in time, negotiate better prices and understand true cost per acre. Integrated with <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> and <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">budgeting</Link>, inventory becomes a core part of your farm management.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Features to look for</h2>
        <p className="text-muted-foreground leading-relaxed">
          Look for recording of quantities and locations, usage linked to activities or crops, low-stock alerts and simple reports. FarmVault provides these within its <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">farm management software</Link>, so you do not need a separate tool.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Get started</h2>
        <p className="text-muted-foreground leading-relaxed">
          Start with FarmVault and add your main inputs. As you log usage against crops and projects, you will build a clear picture of consumption and costs for better planning.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Inventory dashboard screenshot]</div>
        </div>
      </div>
    </PillarPageTemplate>
  );
}
