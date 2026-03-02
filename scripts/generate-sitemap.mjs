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
const BASE_URL = process.env.SITEMAP_BASE_URL || "https://farmvault.co.ke";

const PATHS = [
  "/",
  "/farm-management-software-kenya",
  "/crop-monitoring-software",
  "/farm-inventory-management-system",
  "/farm-expense-tracking-software",
  "/farm-harvest-management-system",
  "/farm-project-management-software",
  "/farm-budgeting-software",
  "/crop-guides",
  "/farm-budget-guides",
  "/farm-chemicals-guide",
  "/crop-disease-database",
  "/farm-calculators",
  "/tomato-farming-kenya",
  "/maize-farming-kenya",
  "/rice-farming-kenya",
  "/french-beans-farming-kenya",
  "/capsicum-farming-kenya",
  "/watermelon-farming-kenya",
  "/farm-management-software-nairobi",
  "/farm-management-software-eldoret",
  "/farm-management-software-nakuru",
  "/farm-management-software-kisumu",
  "/farm-management-software-mombasa",
  "/tomato-profit-calculator",
  "/maize-profit-calculator",
  "/farm-budget-calculator",
  "/yield-per-acre-calculator",
  "/blog",
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
];

const today = new Date().toISOString().slice(0, 10);
const urls = PATHS.map(
  (path) => `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === "/" ? "1.0" : path.startsWith("/blog/") ? "0.8" : "0.9"}</priority>
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
