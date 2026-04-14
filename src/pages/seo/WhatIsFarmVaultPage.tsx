import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";
import { LEARN_HUB_PATH } from "@/data/learnTopics";

const breadcrumbs = [
  { name: "Home", path: "/" },
  { name: "What is FarmVault" },
];

const faqs = [
  {
    question: "What is FarmVault?",
    answer:
      "FarmVault is agricultural software built from real farm experience: a farm management platform for crops, workers, harvest, expenses, inventory, and analytics.",
  },
  {
    question: "Is FarmVault only for large farms?",
    answer:
      "No. Smallholders, cooperatives, and commercial growers all use FarmVault. You can start on a free tier and scale as projects and team members grow.",
  },
  {
    question: "Where can I learn more about farm topics?",
    answer:
      "Visit the Learn hub for guides on crop management, harvest tracking, expenses, and more—all grounded in real farm operations.",
  },
];

export default function WhatIsFarmVaultPage() {
  return (
    <PillarPageTemplate
      title="What is FarmVault? | Agricultural software for real operations"
      description="FarmVault is farm management software built from real farm experience: workers, harvest, expenses, inventory, and analytics in one practical platform."
      canonical="/what-is-farmvault"
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">What is FarmVault?</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        FarmVault is an agricultural software platform built from real farm experience to help farmers and agribusinesses manage daily operations with structured digital records. Instead of splitting data across notebooks, chat threads, and spreadsheets, teams work from one system designed for how real farms actually operate across different regions.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">What you can manage</h2>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>
            <strong className="text-foreground">Workers and field teams</strong> – align labour with harvest and operations.
          </li>
          <li>
            <strong className="text-foreground">Harvest and collections</strong> – record weights, grades, and logistics.
          </li>
          <li>
            <strong className="text-foreground">Expenses and budgets</strong> – see true cost per crop in KES.
          </li>
          <li>
            <strong className="text-foreground">Inventory</strong> – track inputs and usage by project.
          </li>
          <li>
            <strong className="text-foreground">Performance</strong> – reports that connect operations to outcomes.
          </li>
        </ul>
        <p className="text-muted-foreground leading-relaxed mt-6">
          Designed for real operations, FarmVault is used on real farms and built to work across different regions, crops, and farming systems.
        </p>
        <p className="text-muted-foreground leading-relaxed mt-6">
          Explore the{" "}
          <Link to={LEARN_HUB_PATH} className="text-primary hover:underline">
            Learn hub
          </Link>
          , compare{" "}
          <Link to={SEO_ROUTES.features} className="text-primary hover:underline">
            features
          </Link>
          , and see{" "}
          <Link to={SEO_ROUTES.pricing} className="text-primary hover:underline">
            pricing
          </Link>
          . For positioning versus generic tools, read{" "}
          <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary hover:underline">
            farm management software guide
          </Link>
          .
        </p>
      </div>
    </PillarPageTemplate>
  );
}
