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
  { question: "How is tomato profit per acre calculated?", answer: "Profit = (yield in kg × price per kg) − total cost. Use this calculator to estimate based on your expected yield, price and costs. Track actuals in FarmVault for accurate figures." },
  { question: "What is a typical tomato yield per acre in Kenya?", answer: "Open-field tomatoes often yield 15–25 tonnes per acre per season; greenhouse can reach 40+ tonnes. Yields vary with variety, inputs and management. See our tomato farming Kenya guide for more." },
  { question: "Can I track actual tomato profit in FarmVault?", answer: "Yes. FarmVault lets you record expenses and harvests per project. You can compare actual revenue and cost to your calculator estimate and improve planning next season." },
];

export default function TomatoProfitCalculatorPage() {
  const [yieldKg, setYieldKg] = useState(20000);
  const [pricePerKg, setPricePerKg] = useState(30);
  const [totalCost, setTotalCost] = useState(120000);
  const revenue = yieldKg * pricePerKg;
  const profit = revenue - totalCost;

  return (
    <SeoPageLayout>
      <SeoHead
        title="Tomato Profit Calculator Kenya | Estimate Revenue & Profit"
        description="Free tomato profit calculator for Kenya: estimate revenue and profit per acre from yield and price. Track actuals with FarmVault farm management."
        canonical={SEO_ROUTES.tomatoProfitCalculator}
        jsonLd={[getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))]}
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
        <p className="text-lg text-muted-foreground mb-10">
          Estimate revenue and profit from your tomato crop. Enter expected yield (kg), price per kg and total cost. For detailed budgeting and tracking, use <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomato farming Kenya guide</Link> and <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link>.
        </p>

        <div className="rounded-xl border bg-muted/30 p-6 mb-10">
          <div className="grid gap-4 max-w-md">
            <div>
              <Label htmlFor="yield">Expected yield (kg per acre)</Label>
              <Input id="yield" type="number" value={yieldKg} onChange={(e) => setYieldKg(Number(e.target.value) || 0)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="price">Price per kg (KES)</Label>
              <Input id="price" type="number" value={pricePerKg} onChange={(e) => setPricePerKg(Number(e.target.value) || 0)} className="mt-1" />
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
          Track your actual tomato costs and harvests in <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">FarmVault expense tracking</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link>. Use the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> to plan costs before planting.
        </p>

        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
