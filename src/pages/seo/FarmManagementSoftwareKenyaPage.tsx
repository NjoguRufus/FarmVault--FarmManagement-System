import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";

const breadcrumbs = [
  { name: "Home", path: "/" },
  { name: "Farm Management Software Kenya" },
];

const faqs = [
  {
    question: "What is farm management software?",
    answer:
      "Farm management software is a digital tool that helps farmers and agribusinesses plan, track and analyse crops, expenses, inventory, operations and harvests in one place. In Kenya, solutions like FarmVault are built for local crops, weather and markets.",
  },
  {
    question: "Why do Kenyan farmers need farm management software?",
    answer:
      "Manual record-keeping leads to lost receipts, unclear profit per crop and poor planning. Software helps you see real-time costs, yields and profitability per acre, improve budgeting for inputs and labour, and meet buyer or lender requirements for records.",
  },
  {
    question: "How much does farm management software cost in Kenya?",
    answer:
      "FarmVault offers a free tier so you can start recording crops and expenses at no cost. Paid plans add more users, storage and features. Pricing is in KES and designed for Kenyan smallholders and growing agribusinesses.",
  },
  {
    question: "Can I use farm management software on my phone?",
    answer:
      "Yes. FarmVault works on mobile browsers and can be installed as an app. You can log expenses in the field, check inventory and update crop stages from your phone, then review reports on a computer.",
  },
  {
    question: "Which crops does FarmVault support in Kenya?",
    answer:
      "FarmVault supports tomatoes, maize, rice, French beans, capsicum, watermelon and many other crops. You get crop-specific stages, common diseases and fertilizer guidance, plus budgeting and harvest tracking tailored to Kenyan farming.",
  },
];

export default function FarmManagementSoftwareKenyaPage() {
  return (
    <PillarPageTemplate
      title="Farm Management Software Kenya | Crop, Budget & Harvest Tracking"
      description="Farm management software for Kenya: plan crops, track expenses, manage inventory and harvest logistics. Used by Kenyan farmers for tomatoes, maize and more. Start free."
      canonical={SEO_ROUTES.farmManagementSoftwareKenya}
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">
        Farm Management Software Kenya
      </h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Farm management software in Kenya helps farmers and agribusinesses run their operations with clarity and control. From smallholder plots to larger commercial farms, the right tool lets you plan crops, track every expense, manage inventory and coordinate harvest and sales—all in one place.
      </p>

      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
          Why use farm management software in Kenya?
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Paper records get lost; spreadsheets become outdated. Dedicated farm management software gives you a single source of truth. You can see how much you spent on seeds, labour and chemicals per block or per crop, compare seasons and improve your farm budgeting. Many buyers and financiers also expect clear records; software makes it easier to meet those requirements.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
          Core features to look for
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          When evaluating farm management software for Kenya, look for these capabilities:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Crop and project planning</strong> – Define blocks, varieties and planting dates, and track growth stages through to harvest.</li>
          <li><strong>Expense tracking</strong> – Log inputs, labour and other costs per project or per activity so you know your true cost per acre or per kilogram.</li>
          <li><strong>Inventory management</strong> – Track seeds, fertilisers and chemicals so you reorder in time and avoid waste.</li>
          <li><strong>Harvest and sales</strong> – Record harvests, weights and sales to see revenue and link it back to your costs.</li>
          <li><strong>Reports and dashboards</strong> – Summaries of spending, yields and profitability help you make better decisions next season.</li>
        </ul>

        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
          FarmVault: built for Kenyan farmers
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          FarmVault is an intelligent farm management system designed with Kenya and East Africa in mind. It combines crop monitoring, <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">farm budgeting</Link>, <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">inventory</Link> and <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">harvest logistics</Link> in one platform. You can start with a free trial, use it on your phone in the field and scale as your operation grows.
        </p>

        <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
          Crop monitoring and planning
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          Track multiple crops and blocks, record planting dates and follow growth stages. FarmVault supports major Kenyan crops including <Link to={SEO_ROUTES.tomatoFarmingKenya} className="text-primary hover:underline">tomatoes</Link>, <Link to={SEO_ROUTES.maizeFarmingKenya} className="text-primary hover:underline">maize</Link>, rice, French beans and more, with guidance on common diseases and fertiliser use.
        </p>

        <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
          Budget and expense tracking
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          Record every expense by category and link it to projects. See where your money goes and improve your <Link to={SEO_ROUTES.farmBudgetingSoftware} className="text-primary hover:underline">farm budgeting</Link> for the next season. Use the <Link to={SEO_ROUTES.farmBudgetCalculator} className="text-primary hover:underline">farm budget calculator</Link> to plan before you plant.
        </p>

        <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
          Harvest and logistics
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          From first pick to sale, log harvests and collections. Track weights and revenue so you can compare actual results to your budget and improve planning for the next cycle.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
          Who is it for?
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          FarmVault suits smallholder farmers who want to move beyond paper, cooperatives and groups that need shared records, and growing agribusinesses that need crop monitoring, expense tracking and harvest management in one system. Whether you farm in <Link to={SEO_ROUTES.nairobi} className="text-primary hover:underline">Nairobi</Link>, <Link to={SEO_ROUTES.eldoret} className="text-primary hover:underline">Eldoret</Link>, <Link to={SEO_ROUTES.nakuru} className="text-primary hover:underline">Nakuru</Link>, <Link to={SEO_ROUTES.kisumu} className="text-primary hover:underline">Kisumu</Link> or <Link to={SEO_ROUTES.mombasa} className="text-primary hover:underline">Mombasa</Link>, you can run your farm with clearer data and better control.
        </p>

        <div className="rounded-xl border bg-muted/30 p-6 my-10">
          <h3 className="font-semibold text-foreground mb-2">Screenshot placeholder</h3>
          <p className="text-sm text-muted-foreground">Dashboard: crop projects and expense overview</p>
          <div className="mt-4 h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">
            [FarmVault dashboard screenshot]
          </div>
        </div>

        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
          Get started
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          You can start with FarmVault for free. Create your account, add your first project and begin logging crops and expenses. As you use the system, you will build a clear picture of your costs and yields and make more informed decisions for the next season.
        </p>
      </div>
    </PillarPageTemplate>
  );
}
