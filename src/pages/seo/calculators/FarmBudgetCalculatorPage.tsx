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
  { question: "How do I budget for a farm in Kenya?", answer: "List all expected costs: land prep, seeds, fertiliser, labour, chemicals, etc. Add them per acre or per project. Use FarmVault to track actuals and compare with your budget." },
  { question: "Is the farm budget calculator free?", answer: "Yes. Use it to plan; then record and track actual costs in FarmVault farm management software for a full picture of your farm finances." },
];

export default function FarmBudgetCalculatorPage() {
  const [landPrep, setLandPrep] = useState(15000);
  const [seeds, setSeeds] = useState(8000);
  const [fertilizer, setFertilizer] = useState(25000);
  const [labour, setLabour] = useState(40000);
  const [other, setOther] = useState(12000);
  const total = landPrep + seeds + fertilizer + labour + other;

  const jsonLd = [getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))];
  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm Budget Calculator Kenya | Plan Costs per Acre"
        description="Free farm budget calculator for Kenya: plan land prep, seeds, fertilizer, labour and other costs. Use with FarmVault to track actuals."
        canonical={SEO_ROUTES.farmBudgetCalculator}
        jsonLd={jsonLd}
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
        <p className="text-lg text-muted-foreground mb-8">
          Plan your farm costs (KES). Enter estimates per category; then track actuals in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> to see budget vs actual.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 mb-10 max-w-md space-y-4">
          <div><Label>Land prep (KES)</Label><Input type="number" value={landPrep} onChange={(e) => setLandPrep(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div><Label>Seeds / inputs (KES)</Label><Input type="number" value={seeds} onChange={(e) => setSeeds(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div><Label>Fertilizer (KES)</Label><Input type="number" value={fertilizer} onChange={(e) => setFertilizer(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div><Label>Labour (KES)</Label><Input type="number" value={labour} onChange={(e) => setLabour(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div><Label>Other (KES)</Label><Input type="number" value={other} onChange={(e) => setOther(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div className="pt-4 border-t">
            <p className="text-muted-foreground">Total budget: <strong className="text-foreground">KES {total.toLocaleString()}</strong></p>
          </div>
        </div>
        <p className="text-muted-foreground mb-10">
          See <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">Farm Budgeting Software</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">Farm Expense Tracking</Link>.
        </p>
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
