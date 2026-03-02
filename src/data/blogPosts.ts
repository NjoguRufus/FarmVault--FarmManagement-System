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
};

export const BLOG_SLUGS_LIST = Object.keys(BLOG_POSTS) as BlogSlug[];

export function getBlogPost(slug: string): BlogPost | null {
  return BLOG_POSTS[slug as BlogSlug] ?? null;
}
