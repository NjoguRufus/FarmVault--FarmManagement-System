import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Calculators", path: SEO_ROUTES.farmCalculators }, { name: "Maize Profit Calculator" }];
const faqs = [
  { question: "What is maize profit per acre in Kenya?", answer: "Profit depends on yield (bags) and price per bag minus costs. Use this calculator to estimate; track actuals in FarmVault for real profit per acre." },
  { question: "How many bags of maize per acre in Kenya?", answer: "Good management can yield 20–30 bags (90 kg) per acre or more. Use the yield per acre calculator and FarmVault to record your actual harvests." },
];

export default function MaizeProfitCalculatorPage() {
  const [bags, setBags] = useState(25);
  const [pricePerBag, setPricePerBag] = useState(3500);
  const [totalCost, setTotalCost] = useState(25000);
  const revenue = bags * pricePerBag;
  const profit = revenue - totalCost;

  const jsonLd = [getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))];
  return (
    <SeoPageLayout>
      <SeoHead
        title="Maize Profit Calculator Kenya | Profit per Acre"
        description="Free maize profit calculator for Kenya: enter bags, price per bag and costs to estimate profit per acre. Use with FarmVault to track actuals."
        canonical={SEO_ROUTES.maizeProfitCalculator}
        jsonLd={jsonLd}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <Link to={SEO_ROUTES.farmCalculators} className="hover:text-foreground">Farm Calculators</Link>
          <span className="mx-2">/</span>
          <span>Maize Profit Calculator</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Maize Profit Calculator</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Estimate profit for your maize crop. Enter number of 90 kg bags, price per bag (KES) and total costs. Track actuals in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 mb-10 max-w-md space-y-4">
          <div>
            <Label>Bags (90 kg)</Label>
            <Input type="number" value={bags} onChange={(e) => setBags(Number(e.target.value) || 0)} className="mt-1" />
          </div>
          <div>
            <Label>Price per bag (KES)</Label>
            <Input type="number" value={pricePerBag} onChange={(e) => setPricePerBag(Number(e.target.value) || 0)} className="mt-1" />
          </div>
          <div>
            <Label>Total costs (KES)</Label>
            <Input type="number" value={totalCost} onChange={(e) => setTotalCost(Number(e.target.value) || 0)} className="mt-1" />
          </div>
          <div className="pt-4 border-t">
            <p className="text-muted-foreground">Revenue: <strong className="text-foreground">KES {revenue.toLocaleString()}</strong></p>
            <p className="text-muted-foreground">Profit: <strong className={profit >= 0 ? "text-green-600" : "text-destructive"}>{profit >= 0 ? "KES " : "-KES "}{Math.abs(profit).toLocaleString()}</strong></p>
          </div>
        </div>
        <p className="text-muted-foreground mb-10">
          See <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">Maize Farming Kenya</Link> and <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">Farm Budget Calculator</Link>.
        </p>
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
