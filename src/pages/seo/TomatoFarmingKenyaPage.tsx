import React from "react";
import { Link } from "react-router-dom";
import { CropPillarTemplate } from "./CropPillarTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const faqs = [
  { question: "What is the best tomato variety in Kenya?", answer: "Popular varieties include Anna F1, Rambo F1, and Cal J. Choice depends on market, season and growing conditions. FarmVault helps you track performance per variety so you can compare yields and profits." },
  { question: "What is the yield of tomatoes per acre in Kenya?", answer: "Under good management, open-field tomatoes can yield 15–25 tonnes per acre per season; greenhouse can reach 40+ tonnes. Actual yield depends on variety, inputs and pest/disease control. Use FarmVault to record and compare your own yields." },
  { question: "What is the best fertilizer for tomatoes in Kenya?", answer: "Balanced NPK at planting and top-dressing with CAN or urea for nitrogen is common. Foliar feeds and calcium can help fruit quality. Soil testing is recommended. FarmVault’s crop guides and expense tracking help you record what you use and the results." },
  { question: "What are common tomato diseases in Kenya?", answer: "Late blight, bacterial wilt, early blight and TYLCV (virus) are common. Good crop rotation, resistant varieties and timely sprays help. Track outbreaks and control measures in FarmVault for better planning next season." },
  { question: "When is the best time to plant tomatoes in Kenya?", answer: "Timing varies by region and season. Avoid heavy rains at flowering and harvest. Many farmers plant after the long rains or use irrigation. FarmVault helps you record planting dates and link them to harvest and profit." },
];

export default function TomatoFarmingKenyaPage() {
  return (
    <CropPillarTemplate
      title="Tomato Farming in Kenya | Budget, Yield & Profit Guide"
      description="Tomato farming in Kenya: budget per acre, yield expectations, common diseases and fertilizer tips. Plan and track with FarmVault farm management software."
      canonical={SEO_ROUTES.tomatoFarmingKenya}
      breadcrumbName="Tomato Farming Kenya"
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Tomato Farming in Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Tomato farming is one of the most important horticultural enterprises in Kenya. This guide covers budget breakdowns, typical yields per acre, common diseases, fertilizer recommendations and harvest timelines so you can plan and track your crop with confidence.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Budget breakdown (per acre)</h2>
        <p className="text-muted-foreground leading-relaxed">
          Costs vary by scale, variety and region. Typical items include land prep, seeds/seedlings, fertiliser, pesticides, labour, irrigation and stakes. A rough range for open-field tomatoes might be KES 80,000–150,000 per acre per season. Use <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">FarmVault’s farm budget calculator</Link> to model your own figures and track actuals with <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">expense tracking</Link>.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Yield per acre</h2>
        <p className="text-muted-foreground leading-relaxed">
          Under good management, open-field tomatoes in Kenya can yield about 15–25 tonnes per acre per season; greenhouse production can reach 40+ tonnes. Yield depends on variety, nutrition, water and pest/disease control. Record your harvests in FarmVault to see your real yield per block and season.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Common diseases</h2>
        <p className="text-muted-foreground leading-relaxed">
          Late blight, bacterial wilt, early blight and tomato yellow leaf curl virus (TYLCV) are common. Use resistant varieties where possible, rotate crops and apply recommended sprays. Log disease events and controls in your <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">farm management</Link> records for future reference.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Fertilizer recommendations</h2>
        <p className="text-muted-foreground leading-relaxed">
          Balanced NPK at planting and nitrogen top-dressing (e.g. CAN or urea) are standard. Foliar feeds and calcium can improve fruit quality. Soil testing helps tailor rates. Track inputs and costs in FarmVault so you know cost per kilogram and can refine next season’s <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">budget</Link>.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Harvest timeline and profit estimation</h2>
        <p className="text-muted-foreground leading-relaxed">
          Harvest usually starts around 60–90 days after transplanting and can continue for several weeks. Profit depends on yield, market price and total cost. Use the <Link to={SEO_ROUTES.tomatoProfitCalculator} className="text-primary hover:underline">tomato profit calculator</Link> to estimate returns and compare with your actual data in FarmVault.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Manage tomatoes with FarmVault</h2>
        <p className="text-muted-foreground leading-relaxed">
          FarmVault helps you plan tomato projects, track expenses and harvests, and see profit per block. Use crop monitoring, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest management</Link> in one place. Start free and build a clear record of your tomato farming performance.
        </p>
        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">[Tomato farming / budget screenshot]</div>
        </div>
      </div>
    </CropPillarTemplate>
  );
}
