import type { BlogSlug } from "@/seo/routes";

export interface BlogPost {
  slug: BlogSlug;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  /** Optional image path for OG */
  image?: string;
  /** Optional full article body (HTML or markdown). If missing, a placeholder is shown. */
  content?: string;
}

export const BLOG_POSTS: Record<BlogSlug, BlogPost> = {
  "farm-record-keeping-template-kenya": {
    slug: "farm-record-keeping-template-kenya",
    title: "Farm Record Keeping Template Kenya | Free Guide & Best Practices",
    description: "Farm record keeping template and best practices for Kenya. What to track, how to organise records and why FarmVault helps Kenyan farmers keep clear, useful records.",
    datePublished: "2024-01-15",
    dateModified: "2024-06-01",
  },
  "best-fertilizer-for-tomatoes-kenya": {
    slug: "best-fertilizer-for-tomatoes-kenya",
    title: "Best Fertilizer for Tomatoes in Kenya | NPK, CAN & Foliar Guide",
    description: "Guide to the best fertilizer for tomatoes in Kenya: NPK, CAN, urea and foliar feeds. When and how to apply, and how to track usage with FarmVault.",
    datePublished: "2024-01-20",
  },
  "maize-farming-profit-per-acre-kenya": {
    slug: "maize-farming-profit-per-acre-kenya",
    title: "Maize Farming Profit per Acre Kenya | Real Numbers & Calculator",
    description: "Maize farming profit per acre in Kenya: typical costs, yields and net profit. Use our maize profit calculator and FarmVault to track your actuals.",
    datePublished: "2024-02-01",
  },
  "how-to-track-farm-expenses": {
    slug: "how-to-track-farm-expenses",
    title: "How to Track Farm Expenses | Step-by-Step Guide Kenya",
    description: "How to track farm expenses: categories, frequency and tools. Why tracking matters and how FarmVault expense tracking helps Kenyan farmers.",
    datePublished: "2024-02-10",
  },
  "crop-rotation-kenya": {
    slug: "crop-rotation-kenya",
    title: "Crop Rotation Kenya | Benefits & Examples for Smallholders",
    description: "Crop rotation in Kenya: benefits for soil and pests, simple rotation examples and how to plan and record rotations with farm management software.",
    datePublished: "2024-02-20",
  },
  "drip-irrigation-vs-furrow-kenya": {
    slug: "drip-irrigation-vs-furrow-kenya",
    title: "Drip Irrigation vs Furrow Kenya | Cost, Yield & Water Use",
    description: "Drip irrigation vs furrow irrigation in Kenya: cost comparison, water use and yield impact. How to factor irrigation into your farm budget.",
    datePublished: "2024-03-01",
  },
  "tomato-diseases-kenya-control": {
    slug: "tomato-diseases-kenya-control",
    title: "Tomato Diseases in Kenya | Identification & Control Guide",
    description: "Common tomato diseases in Kenya: late blight, bacterial wilt, TYLCV. How to identify, prevent and control. Log outbreaks in FarmVault for planning.",
    datePublished: "2024-03-10",
  },
  "farm-budget-template-excel": {
    slug: "farm-budget-template-excel",
    title: "Farm Budget Template Excel vs FarmVault | Which to Use",
    description: "Farm budget template Excel: pros and cons. When to use a spreadsheet vs farm management software like FarmVault for budgeting and tracking.",
    datePublished: "2024-03-20",
  },
  "harvest-logistics-smallholder": {
    slug: "harvest-logistics-smallholder",
    title: "Harvest Logistics for Smallholder Farmers | Kenya Guide",
    description: "Harvest logistics for smallholder farmers in Kenya: picking, transport, storage and sales. How FarmVault harvest management helps you coordinate and record.",
    datePublished: "2024-04-01",
  },
  "agricultural-management-software-africa": {
    slug: "agricultural-management-software-africa",
    title: "Agricultural Management Software Africa | Why Kenya First",
    description: "Agricultural management software in Africa: why FarmVault starts with Kenya, local crops and KES, and plans for East Africa.",
    datePublished: "2024-04-10",
  },
  "greenhouse-vs-open-field-tomatoes": {
    slug: "greenhouse-vs-open-field-tomatoes",
    title: "Greenhouse vs Open Field Tomatoes Kenya | Cost & Yield",
    description: "Greenhouse vs open field tomatoes in Kenya: cost per acre, yield comparison and when each makes sense. Track both with FarmVault.",
    datePublished: "2024-04-20",
  },
  "organic-fertilizer-kenya": {
    slug: "organic-fertilizer-kenya",
    title: "Organic Fertilizer Kenya | Types, Cost & How to Track",
    description: "Organic fertilizer in Kenya: types, approximate cost and how to record usage and results in your farm management system.",
    datePublished: "2024-05-01",
  },
  "farm-inventory-software-benefits": {
    slug: "farm-inventory-software-benefits",
    title: "Farm Inventory Software Benefits | Why Track Inputs",
    description: "Benefits of farm inventory software: less waste, timely reorders and accurate cost per acre. How FarmVault inventory fits your operation.",
    datePublished: "2024-05-10",
  },
  "post-harvest-handling-vegetables": {
    slug: "post-harvest-handling-vegetables",
    title: "Post Harvest Handling Vegetables Kenya | Best Practices",
    description: "Post harvest handling of vegetables in Kenya: grading, packing and storage to reduce losses. Record harvest quality and sales in FarmVault.",
    datePublished: "2024-05-20",
  },
  "soil-testing-kenya-cost": {
    slug: "soil-testing-kenya-cost",
    title: "Soil Testing Kenya Cost | Where & Why to Test",
    description: "Soil testing in Kenya: typical cost, where to get it done and why it pays for better fertilizer decisions. Log results in your farm records.",
    datePublished: "2024-06-01",
  },
  "farm-project-management-tools": {
    slug: "farm-project-management-tools",
    title: "Farm Project Management Tools | Plan Crops & Tasks",
    description: "Farm project management tools: what to look for and how FarmVault helps you plan crops, assign tasks and track progress and costs.",
    datePublished: "2024-06-10",
  },
  "irrigation-scheduling-kenya": {
    slug: "irrigation-scheduling-kenya",
    title: "Irrigation Scheduling Kenya | When & How Much to Water",
    description: "Irrigation scheduling in Kenya: factors to consider and how to align with crop stages. Track irrigation and costs in FarmVault.",
    datePublished: "2024-06-20",
  },
  "pest-management-tomatoes-kenya": {
    slug: "pest-management-tomatoes-kenya",
    title: "Pest Management Tomatoes Kenya | IPM & Spray Records",
    description: "Pest management for tomatoes in Kenya: IPM principles and keeping spray records. Use FarmVault to log treatments and costs.",
    datePublished: "2024-07-01",
  },
  "farm-finance-tracking-app": {
    slug: "farm-finance-tracking-app",
    title: "Farm Finance Tracking App | Expense & Profit on Mobile",
    description: "Farm finance tracking app: why mobile matters and how FarmVault helps you track expenses and profit from the field.",
    datePublished: "2024-07-10",
  },
  "climate-smart-agriculture-kenya": {
    slug: "climate-smart-agriculture-kenya",
    title: "Climate Smart Agriculture Kenya | Records & Adaptation",
    description: "Climate smart agriculture in Kenya: how good records and farm management software support adaptation and resilience.",
    datePublished: "2024-07-20",
  },
  "best-farm-management-software-kenya": {
    slug: "best-farm-management-software-kenya",
    title: "Best farm management software Kenya | What to compare in 2026",
    description:
      "How to choose farm management software in Kenya: crops, workers, harvest, KES pricing, and mobile use. Why teams pick FarmVault.",
    datePublished: "2026-04-01",
    dateModified: "2026-04-07",
    content: `
<p class="lead text-muted-foreground">Kenyan farms need software that matches horticulture and broadacre reality—not generic business tools with a farm label.</p>
<h2>What “best” means on a Kenyan farm</h2>
<p>Look for crop projects, harvest logging, expense tracking in <strong>KES</strong>, inventory, and reports that connect cost to yield. Mobile access for supervisors is non‑negotiable.</p>
<h2>FarmVault checklist</h2>
<ul>
<li>Structured workers and harvest workflows</li>
<li>Expenses tagged to projects</li>
<li>Guides for <a href="/learn/farm-management">farm management</a> and <a href="/learn">Learn</a></li>
</ul>
<p>See <a href="/pricing">pricing</a>, <a href="/features">features</a>, and <a href="/farm-management-software-kenya">farm management software Kenya</a> for depth.</p>
`,
  },
  "agriculture-software-africa": {
    slug: "agriculture-software-africa",
    title: "Agriculture software Africa | Kenya hub, East Africa scale",
    description:
      "Agriculture SaaS in Africa: why Kenya is the launchpad, what FarmVault covers today, and how records unlock finance and buyers.",
    datePublished: "2026-04-02",
    dateModified: "2026-04-07",
    content: `
<p>African agriculture is diverse, but good software starts with <strong>local currency</strong>, <strong>local crops</strong>, and <strong>field-first UX</strong>.</p>
<h2>Kenya as the reference market</h2>
<p>FarmVault is built around Kenyan supply chains and pricing, then extends to comparable systems across the continent.</p>
<p>Read <a href="/agriculture-software-kenya">agriculture software Kenya</a> and the <a href="/blog/agricultural-management-software-africa">management software Africa</a> article for related context.</p>
<h2>Explore</h2>
<p><a href="/learn">Learn hub</a> · <a href="/pricing">Pricing</a> · <a href="/">Home</a></p>
`,
  },
  "how-to-manage-farm-workers-kenya": {
    slug: "how-to-manage-farm-workers-kenya",
    title: "How to manage farm workers Kenya | Fair records & payouts",
    description:
      "Practical steps for farm worker management in Kenya: daily logs, piece rates, M‑Pesa reconciliation, and software that reduces disputes.",
    datePublished: "2026-04-03",
    dateModified: "2026-04-07",
    content: `
<p>Trust comes from <strong>transparent tallies</strong>. Train team leads, pick a unit (kg, crates, hours), and reconcile before pay day.</p>
<h2>Software support</h2>
<p>FarmVault links people to operations and harvest so you are not copying notebooks twice.</p>
<p>Guides: <a href="/learn/farm-worker-management">Farm worker management</a>, <a href="/learn/how-to-track-farm-workers">How to track farm workers</a>.</p>
<p><a href="/features">Features</a> · <a href="/faq">FAQ</a></p>
`,
  },
  "farm-record-keeping-system-kenya": {
    slug: "farm-record-keeping-system-kenya",
    title: "Farm record keeping system Kenya | Digital register",
    description:
      "Build a farm record keeping system: inputs, labour, harvest, sales. Why Kenyan growers digitise and how FarmVault centralises history.",
    datePublished: "2026-04-04",
    dateModified: "2026-04-07",
    content: `
<p>Minimum viable records: <strong>planting</strong>, <strong>inputs</strong>, <strong>protection</strong>, <strong>harvest</strong>, <strong>sales</strong>, and <strong>labour payments</strong>.</p>
<h2>Why digitise</h2>
<p>Searchable history, easier audits, and faster answers when a buyer or bank asks for proof.</p>
<p><a href="/learn/farm-record-keeping">Farm record keeping guide</a> · <a href="/learn">Learn</a> · <a href="/pricing">Pricing</a></p>
`,
  },
};

export const BLOG_SLUGS_LIST = Object.keys(BLOG_POSTS) as BlogSlug[];

export function getBlogPost(slug: string): BlogPost | null {
  return BLOG_POSTS[slug as BlogSlug] ?? null;
}
