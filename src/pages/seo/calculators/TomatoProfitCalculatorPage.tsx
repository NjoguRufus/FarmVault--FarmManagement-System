import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Calculators", path: SEO_ROUTES.farmCalculators }, { name: "Tomato Profit Calculator" }];
const faqs = [
  { question: "How is tomato profit calculated?", answer: "Profit = (Yield in kg × Price per kg) − Total costs. Enter your expected yield, selling price and costs to get an estimate. Use FarmVault to track actuals and compare." },
  { question: "What yield can I expect per acre for tomatoes in Kenya?", answer: "Open-field tomatoes often yield 15–25 tonnes per acre per season; greenhouse can reach 40+ tonnes. Actual yield depends on variety, inputs and management. Track your harvests in FarmVault." },
  { question: "Can I use this with FarmVault?", answer: "Yes. Use this calculator to plan; then record your actual costs and harvests in FarmVault to see real profit and improve next season’s budget." },
];

export default function TomatoProfitCalculatorPage() {
  const [yieldKg, setYieldKg] = useState(20000);
  const [pricePerKg, setPricePerKg] = useState(30);
  const [totalCost, setTotalCost] = useState(120000);
  const revenue = yieldKg * pricePerKg;
  const profit = revenue - totalCost;

  const jsonLd = [getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))];
  return (
    <SeoPageLayout>
      <SeoHead
        title="Tomato Profit Calculator Kenya | Estimate Revenue & Profit"
        description="Free tomato profit calculator for Kenya: enter yield, price and costs to estimate revenue and profit per acre. Use with FarmVault to track actuals."
        canonical={SEO_ROUTES.tomatoProfitCalculator}
        jsonLd={jsonLd}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <Link to={SEO_ROUTES.farmCalculators} className="hover:text-foreground">Farm Calculators</Link>
          <span className="mx-2">/</span>
          <span>Tomato Profit Calculator</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Tomato Profit Calculator</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Estimate revenue and profit for your tomato crop. Enter expected yield (kg), price per kg (KES) and total costs. Then track actuals in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 mb-10 max-w-md space-y-4">
          <div>
            <Label>Yield (kg)</Label>
            <Input type="number" value={yieldKg} onChange={(e) => setYieldKg(Number(e.target.value) || 0)} className="mt-1" />
          </div>
          <div>
            <Label>Price per kg (KES)</Label>
            <Input type="number" value={pricePerKg} onChange={(e) => setPricePerKg(Number(e.target.value) || 0)} className="mt-1" />
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
          For full budgeting and harvest tracking, see <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">Tomato Farming Kenya</Link> and <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">Farm Budget Calculator</Link>.
        </p>
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
