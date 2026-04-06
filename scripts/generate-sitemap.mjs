#!/usr/bin/env node
/**
 * Generates public/sitemap.xml for FarmVault SEO.
 * Run before build: npm run generate:sitemap
 * Set BASE_URL via env or default to production.
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.SITEMAP_BASE_URL || "https://farmvault.africa";

const PATHS = [
  // Core pages
  "/",
  "/features",
  "/pricing",
  "/about",
  "/faq",
  "/blog",
  "/learn",
  "/learn/farm-management",
  "/what-is-farmvault",
  "/agriculture-software-kenya",
  // Learn – topical authority
  "/learn/crop-management",
  "/learn/farm-worker-management",
  "/learn/harvest-tracking",
  "/learn/farm-expense-management",
  "/learn/farm-inventory-management",
  "/learn/multi-farm-management",
  "/learn/agriculture-analytics",
  "/learn/farm-record-keeping",
  "/learn/farm-planning",
  "/learn/irrigation-management",
  "/learn/maize-farming-management",
  "/learn/avocado-farming-management",
  "/learn/vegetable-farming-management",
  "/learn/poultry-farming-management",
  "/learn/dairy-farming-management",
  "/learn/greenhouse-farming-management",
  "/learn/how-to-track-farm-workers",
  "/learn/how-to-manage-farm-expenses",
  "/learn/how-to-track-harvest-yield",
  "/learn/how-to-manage-multiple-farms",
  "/learn/how-to-manage-crop-stages",
  // SEO landing pages
  "/farm-management-software-kenya",
  "/crop-monitoring-software",
  "/farm-inventory-management-system",
  "/farm-expense-tracking-software",
  "/farm-harvest-management-system",
  "/farm-project-management-software",
  "/farm-budgeting-software",
  // Guides
  "/crop-guides",
  "/farm-budget-guides",
  "/farm-chemicals-guide",
  "/crop-disease-database",
  "/farm-calculators",
  // Crop guides
  "/tomato-farming-kenya",
  "/maize-farming-kenya",
  "/rice-farming-kenya",
  "/french-beans-farming-kenya",
  "/capsicum-farming-kenya",
  "/watermelon-farming-kenya",
  // Location pages
  "/farm-management-software-nairobi",
  "/farm-management-software-eldoret",
  "/farm-management-software-nakuru",
  "/farm-management-software-kisumu",
  "/farm-management-software-mombasa",
  // Calculators
  "/tomato-profit-calculator",
  "/maize-profit-calculator",
  "/farm-budget-calculator",
  "/yield-per-acre-calculator",
  // Blog posts
  "/blog/farm-record-keeping-template-kenya",
  "/blog/best-fertilizer-for-tomatoes-kenya",
  "/blog/maize-farming-profit-per-acre-kenya",
  "/blog/how-to-track-farm-expenses",
  "/blog/crop-rotation-kenya",
  "/blog/drip-irrigation-vs-furrow-kenya",
  "/blog/tomato-diseases-kenya-control",
  "/blog/farm-budget-template-excel",
  "/blog/harvest-logistics-smallholder",
  "/blog/agricultural-management-software-africa",
  "/blog/greenhouse-vs-open-field-tomatoes",
  "/blog/organic-fertilizer-kenya",
  "/blog/farm-inventory-software-benefits",
  "/blog/post-harvest-handling-vegetables",
  "/blog/soil-testing-kenya-cost",
  "/blog/farm-project-management-tools",
  "/blog/irrigation-scheduling-kenya",
  "/blog/pest-management-tomatoes-kenya",
  "/blog/farm-finance-tracking-app",
  "/blog/climate-smart-agriculture-kenya",
  "/blog/best-farm-management-software-kenya",
  "/blog/agriculture-software-africa",
  "/blog/how-to-manage-farm-workers-kenya",
  "/blog/farm-record-keeping-system-kenya",
];

function getPriority(path) {
  if (path === "/") return "1.0";
  if (["/features", "/pricing", "/about", "/learn", "/faq"].includes(path)) return "0.9";
  if (path.startsWith("/learn/")) return "0.85";
  if (path === "/blog") return "0.9";
  if (path.startsWith("/blog/")) return "0.8";
  return "0.9";
}

function getChangeFreq(path) {
  if (path === "/") return "weekly";
  if (["/features", "/pricing", "/about", "/faq"].includes(path)) return "monthly";
  if (path === "/learn" || path.startsWith("/learn/")) return "weekly";
  if (path === "/blog") return "daily";
  if (path.startsWith("/blog/")) return "weekly";
  return "weekly";
}

const today = new Date().toISOString().slice(0, 10);
const urls = PATHS.map(
  (path) => `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${getChangeFreq(path)}</changefreq>
    <priority>${getPriority(path)}</priority>
  </url>`
).join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const outPath = join(__dirname, "..", "public", "sitemap.xml");
writeFileSync(outPath, sitemap, "utf8");
console.log(`Sitemap written: ${outPath} (${PATHS.length} URLs)`);
