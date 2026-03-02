import React from "react";
import { Link } from "react-router-dom";
import { CropPillarTemplate } from "./CropPillarTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "What is maize profit per acre in Kenya?", answer: "Profit depends on yield and price. With 20–30 bags per acre and market prices, net profit can range from KES 15,000 to 50,000+ per acre. Use the maize profit calculator and FarmVault to track your actual costs and revenue." },
  { question: "What is the best fertilizer for maize in Kenya?", answer: "DAP at planting and CAN or urea for top-dressing are widely used. Rates depend on soil and region. Soil testing helps. Track fertiliser use and costs in FarmVault to see cost per bag and improve budgeting." },
  { question: "When to plant maize in Kenya?", answer: "Plant with the rains—long rains (March–April) or short rains (October–November)—depending on region. Timely planting and good weed and pest control improve yield. Record planting dates in FarmVault for season comparison." },
  { question: "What are common maize diseases in Kenya?", answer: "Maize lethal necrosis (MLN), leaf blights, stalk borers and fall armyworm are major concerns. Use certified seed, follow advisories and record outbreaks and control costs in your farm management system." },
];

export default function MaizeFarmingKenyaPage() {
  return (
    <CropPillarTemplate
      title="Maize Farming in Kenya | Profit per Acre, Fertilizer & Yield"
      description="Maize farming Kenya: profit per acre, yield, fertilizer and disease guide. Plan and track with FarmVault farm management and maize profit calculator."
      canonical={SEO_ROUTES.maizeFarmingKenya}
      breadcrumbName="Maize Farming Kenya"
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Maize Farming in Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Maize is a staple crop for many Kenyan farmers. This page covers budget breakdown, yield per acre, common diseases, fertilizer use and profit estimation so you can plan and track your maize enterprise effectively.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budget breakdown (per acre)</h2>
        <p className="text-muted-foreground leading-relaxed">
          Land prep, seed, fertiliser (e.g. DAP, CAN), labour and pest control are main costs. Budgets often range from KES 15,000–35,000 per acre depending on scale and inputs. Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">FarmVault’s farm budget calculator</Link> and <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link> to plan and record actuals.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Yield per acre</h2>
        <p className="text-muted-foreground leading-relaxed">
          Good management can yield 20–30 bags (90 kg) per acre or more. Hybrid seed, timely planting and fertiliser improve results. Record harvests in FarmVault to compare seasons and blocks and use the <Link to={SEO_ROUTES.maizeProfitCalculator} className="text-primary hover:underline">maize profit calculator</Link> for estimates.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Common diseases and pests</h2>
        <p className="text-muted-foreground leading-relaxed">
          MLN, leaf blights, stalk borers and fall armyworm need proactive management. Certified seed and recommended pesticides help. Log control measures and costs in <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">FarmVault</Link> for better planning.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Fertilizer and harvest timeline</h2>
        <p className="text-muted-foreground leading-relaxed">
          DAP at planting and nitrogen top-dressing are standard. Harvest is typically 3–4 months after planting. Track inputs and harvest dates in FarmVault to see cost per bag and profit per acre.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Manage maize with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          Use FarmVault for <Link to={SEO_ROUTES.cropMonitoringSoftware} className="text-primary hover:underline">crop monitoring</Link>, <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">budgeting</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest</Link> so you have one place for maize costs, yields and profit.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Maize budget / yield screenshot]</div>
        </div>
      </div>
    </CropPillarTemplate>
  );
}
