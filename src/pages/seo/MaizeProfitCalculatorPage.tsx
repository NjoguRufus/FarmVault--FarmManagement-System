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
  { question: "What is maize profit per acre in Kenya?", answer: "Profit depends on yield (bags) and price per bag minus total cost. This calculator gives an estimate. Track actuals in FarmVault for accurate profit per acre." },
  { question: "How many bags of maize per acre in Kenya?", answer: "With good management, 20–30 bags (90 kg) per acre is common. Hybrid seed and fertiliser improve yield. See our maize farming Kenya guide for details." },
  { question: "Can I track maize profit in FarmVault?", answer: "Yes. Record expenses and harvests per project in FarmVault. Compare actual revenue and cost to this estimate and improve your maize budgeting next season." },
];

export default function MaizeProfitCalculatorPage() {
  const [bags, setBags] = useState(25);
  const [pricePerBag, setPricePerBag] = useState(3500);
  const [totalCost, setTotalCost] = useState(45000);
  const revenue = bags * pricePerBag;
  const profit = revenue - totalCost;

  return (
    <SeoPageLayout>
      <SeoHead
        title="Maize Profit Calculator Kenya | Profit per Acre"
        description="Free maize profit calculator for Kenya: estimate profit per acre from bags and price. Track actuals with FarmVault farm management."
        canonical={SEO_ROUTES.maizeProfitCalculator}
        jsonLd={[getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))]}
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
        <p className="text-lg text-muted-foreground mb-10">
          Estimate profit from your maize crop. Enter expected bags (90 kg), price per bag and total cost. See <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize farming Kenya</Link> for budget and yield guidance; track actuals in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>

        <div className="rounded-xl border bg-muted/30 p-6 mb-10">
          <div className="grid gap-4 max-w-md">
            <div>
              <Label htmlFor="bags">Expected bags per acre (90 kg)</Label>
              <Input id="bags" type="number" value={bags} onChange={(e) => setBags(Number(e.target.value) || 0)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="price">Price per bag (KES)</Label>
              <Input id="price" type="number" value={pricePerBag} onChange={(e) => setPricePerBag(Number(e.target.value) || 0)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cost">Total cost (KES)</Label>
              <Input id="cost" type="number" value={totalCost} onChange={(e) => setTotalCost(Number(e.target.value) || 0)} className="mt-1" />
            </div>
          </div>
          <div className="mt-6 pt-6 border-t">
            <p className="text-muted-foreground">Estimated revenue: <strong className="text-foreground">KES {revenue.toLocaleString()}</strong></p>
            <p className="text-muted-foreground mt-1">Estimated profit: <strong className={profit >= 0 ? "text-green-600" : "text-destructive"}>{profit >= 0 ? "KES " : "-KES "}{Math.abs(profit).toLocaleString()}</strong></p>
          </div>
        </div>

        <p className="text-muted-foreground mb-10">
          Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> to plan costs and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">FarmVault expense tracking</Link> to record actuals.
        </p>

        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
