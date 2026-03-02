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
  { question: "How do you calculate yield per acre?", answer: "Yield per acre = total harvest (kg or other unit) ÷ area (acres). This calculator helps you work out yield from total harvest and area. Record harvests in FarmVault for accurate yield per block." },
  { question: "What is a good yield per acre for tomatoes in Kenya?", answer: "Open-field tomatoes often yield 15–25 tonnes per acre per season. Use our tomato farming Kenya guide and this calculator to compare your results." },
  { question: "Can I track yield in FarmVault?", answer: "Yes. FarmVault harvest management lets you record harvests by project and area. You can see yield per acre (or per block) and compare seasons." },
];

export default function YieldPerAcreCalculatorPage() {
  const [totalHarvestKg, setTotalHarvestKg] = useState(20000);
  const [acres, setAcres] = useState(1);
  const yieldPerAcre = acres > 0 ? totalHarvestKg / acres : 0;

  return (
    <SeoPageLayout>
      <SeoHead
        title="Yield per Acre Calculator Kenya | Estimate Crop Yield"
        description="Free yield per acre calculator for Kenya: work out yield from total harvest and area. Track harvests with FarmVault farm management."
        canonical={SEO_ROUTES.yieldPerAcreCalculator}
        jsonLd={[getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer })))]}
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
        <p className="text-lg text-muted-foreground mb-10">
          Calculate yield per acre from total harvest and area. Use this for any crop. Record actual harvests in <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">FarmVault harvest management</Link> and <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">farm management software</Link> for accurate figures.
        </p>

        <div className="rounded-xl border bg-muted/30 p-6 mb-10">
          <div className="grid gap-4 max-w-md">
            <div>
              <Label htmlFor="harvest">Total harvest (kg)</Label>
              <Input id="harvest" type="number" value={totalHarvestKg} onChange={(e) => setTotalHarvestKg(Number(e.target.value) || 0)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="acres">Area (acres)</Label>
              <Input id="acres" type="number" step="0.1" value={acres} onChange={(e) => setAcres(Number(e.target.value) || 0)} className="mt-1" />
            </div>
          </div>
          <div className="mt-6 pt-6 border-t">
            <p className="text-muted-foreground">Yield per acre: <strong className="text-foreground">{yieldPerAcre.toLocaleString()} kg/acre</strong></p>
          </div>
        </div>

        <p className="text-muted-foreground mb-10">
          See <Link to={SEO_ROUTES.cropGuides} className="text-primary hover:underline">crop guides</Link> for typical yields and <Link to={SEO_ROUTES.tomatoProfitCalculator} className="text-primary hover:underline">tomato</Link> or <Link to={SEO_ROUTES.maizeProfitCalculator} className="text-primary hover:underline">maize profit calculators</Link> to estimate revenue from yield.
        </p>

        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
