import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Calculators", path: SEO_ROUTES.farmCalculators }, { name: "Farm Budget Calculator" }];
const faqs = [
  { question: "How do I budget for a farm in Kenya?", answer: "List all expected costs: land prep, seeds, fertiliser, labour, chemicals, etc. Estimate per acre or per project. Use this calculator to sum categories and track actuals in FarmVault." },
  { question: "What is included in farm budget?", answer: "Land preparation, seeds/seedlings, fertiliser, pesticides, labour, irrigation, equipment hire and any other cost per season or project. FarmVault lets you record and compare to your budget." },
  { question: "Can I track budget vs actual in FarmVault?", answer: "Yes. FarmVault expense tracking links costs to projects. You can see planned vs actual spending and adjust next season's budget using real data." },
];

export default function FarmBudgetCalculatorPage() {
  const [landPrep, setLandPrep] = useState(15000);
  const [seeds, setSeeds] = useState(20000);
  const [fertiliser, setFertiliser] = useState(25000);
  const [labour, setLabour] = useState(40000);
  const [other, setOther] = useState(15000);
  const total = landPrep + seeds + fertiliser + labour + other;

  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm Budget Calculator Kenya | Plan Costs per Acre"
        description="Free farm budget calculator for Kenya: plan costs per acre or project. Track actuals with FarmVault farm management software."
        canonical={SEO_ROUTES.farmBudgetCalculator}
        jsonLd={[getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))]}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <Link to={SEO_ROUTES.farmCalculators} className="hover:text-foreground">Farm Calculators</Link>
          <span className="mx-2">/</span>
          <span>Farm Budget Calculator</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Farm Budget Calculator</h1>
        <p className="text-lg text-muted-foreground mb-10">
          Plan your farm costs before you plant. Enter estimated amounts per category (e.g. per acre). Then track actual spending in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> and compare to this budget. See <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">farm budgeting software</Link> for more.
        </p>

        <div className="rounded-xl border bg-muted/30 p-6 mb-10">
          <div className="grid gap-4 max-w-md">
            <div><Label>Land prep (KES)</Label><Input type="number" value={landPrep} onChange={(e) => setLandPrep(Number(e.target.value) || 0)} className="mt-1" /></div>
            <div><Label>Seeds/seedlings (KES)</Label><Input type="number" value={seeds} onChange={(e) => setSeeds(Number(e.target.value) || 0)} className="mt-1" /></div>
            <div><Label>Fertiliser (KES)</Label><Input type="number" value={fertiliser} onChange={(e) => setFertiliser(Number(e.target.value) || 0)} className="mt-1" /></div>
            <div><Label>Labour (KES)</Label><Input type="number" value={labour} onChange={(e) => setLabour(Number(e.target.value) || 0)} className="mt-1" /></div>
            <div><Label>Other (chemicals, irrigation, etc.) (KES)</Label><Input type="number" value={other} onChange={(e) => setOther(Number(e.target.value) || 0)} className="mt-1" /></div>
          </div>
          <div className="mt-6 pt-6 border-t">
            <p className="text-muted-foreground">Total budget: <strong className="text-foreground">KES {total.toLocaleString()}</strong></p>
          </div>
        </div>

        <p className="text-muted-foreground mb-10">
          Use <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">FarmVault expense tracking</Link> to record actual costs and <Link to={SEO_ROUTES.tomatoProfitCalculator} className="text-primary hover:underline">tomato</Link> or <Link to={SEO_ROUTES.maizeProfitCalculator} className="text-primary hover:underline">maize profit calculators</Link> to estimate revenue.
        </p>

        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
