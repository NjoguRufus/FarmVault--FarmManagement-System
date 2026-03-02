import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import { SEO_ROUTES } from "@/seo/routes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const breadcrumbs = [{ name: "Home", path: "/" }, { name: "Farm Calculators", path: SEO_ROUTES.farmCalculators }, { name: "Yield per Acre Calculator" }];
const faqs = [
  { question: "How do I calculate yield per acre?", answer: "Yield per acre = total harvest (kg or bags) ÷ area in acres. Record your harvests in FarmVault to track actual yield per block and compare seasons." },
  { question: "What is a good yield per acre for tomatoes in Kenya?", answer: "Open-field tomatoes often yield 15–25 tonnes per acre; greenhouse can reach 40+ tonnes. Use FarmVault crop monitoring and harvest tracking to see your actual yield." },
];

export default function YieldPerAcreCalculatorPage() {
  const [totalHarvestKg, setTotalHarvestKg] = useState(20000);
  const [acres, setAcres] = useState(1);
  const yieldPerAcre = acres > 0 ? (totalHarvestKg / acres).toFixed(0) : "0";

  const jsonLd = [getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))];
  return (
    <SeoPageLayout>
      <SeoHead
        title="Yield per Acre Calculator Kenya | Crop Yield Estimate"
        description="Free yield per acre calculator for Kenya: enter total harvest and area to get yield per acre. Track actuals with FarmVault."
        canonical={SEO_ROUTES.yieldPerAcreCalculator}
        jsonLd={jsonLd}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <Link to={SEO_ROUTES.farmCalculators} className="hover:text-foreground">Farm Calculators</Link>
          <span className="mx-2">/</span>
          <span>Yield per Acre Calculator</span>
        </nav>
        <h1 className="text-4xl font-bold text-foreground mb-6">Yield per Acre Calculator</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Enter total harvest (kg) and area (acres) to get yield per acre. Track your actual harvests in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> for accurate records.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 mb-10 max-w-md space-y-4">
          <div><Label>Total harvest (kg)</Label><Input type="number" value={totalHarvestKg} onChange={(e) => setTotalHarvestKg(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div><Label>Area (acres)</Label><Input type="number" step={0.1} value={acres} onChange={(e) => setAcres(Number(e.target.value) || 0)} className="mt-1" /></div>
          <div className="pt-4 border-t">
            <p className="text-muted-foreground">Yield per acre: <strong className="text-foreground">{yieldPerAcre} kg</strong></p>
          </div>
        </div>
        <p className="text-muted-foreground mb-10">
          See <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">Farm Harvest Management</Link> and <Link to={SEO_ROUTES.cropGuides} className="text-primary hover:underline">Crop Guides</Link>.
        </p>
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
