import React from "react";
import { Link } from "react-router-dom";
import { PillarPageTemplate } from "@/components/seo/PillarPageTemplate";
import { SEO_ROUTES } from "@/seo/routes";
import { LEARN_HUB_PATH, LEARN_MASTER_PATH } from "@/data/learnTopics";

const breadcrumbs = [
  { name: "Home", path: "/" },
  { name: "Agriculture software Kenya" },
];

const faqs = [
  {
    question: "What is agriculture software?",
    answer:
      "Agriculture software (agriculture SaaS) helps plan and record farming: crops, costs, inventory, workers, and harvest. FarmVault is an example built for Kenya with local pricing and workflows.",
  },
  {
    question: "Why use agriculture software in Kenya?",
    answer:
      "Kenyan farms face input price swings, weather risk, and demanding buyers. Software improves traceability, speeds reconciliation, and shows margin per crop or block.",
  },
  {
    question: "Does FarmVault work on mobile?",
    answer:
      "Yes. FarmVault runs in the browser on phones and tablets so supervisors can log data at the field edge, then review dashboards on a computer.",
  },
];

export default function AgricultureSoftwareKenyaPage() {
  return (
    <PillarPageTemplate
      title="Agriculture software Kenya | FarmVault SaaS for farms"
      description="Agriculture software in Kenya: crop, labour, harvest, and expense records. FarmVault is agriculture SaaS with KES pricing for Kenyan growers."
      canonical="/agriculture-software-kenya"
      breadcrumbs={breadcrumbs}
      faqs={faqs}
    >
      <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">Agriculture software Kenya</h1>
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Agriculture software helps Kenyan farmers and agribusinesses digitise planning and operations. The best tools fit local crops, currencies, and labour patterns—not generic ERP modules bolted onto a farm.
      </p>
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">FarmVault as agriculture SaaS</h2>
        <p className="text-muted-foreground leading-relaxed">
          FarmVault sits in the category of agriculture SaaS: cloud software focused on farm operations, with subscription pricing in{" "}
          <Link to={SEO_ROUTES.pricing} className="text-primary hover:underline">
            Kenyan Shillings
          </Link>
          . It connects{" "}
          <Link to={SEO_ROUTES.farmExpenseTracking} className="text-primary hover:underline">
            expense tracking
          </Link>
          ,{" "}
          <Link to={SEO_ROUTES.farmHarvestManagement} className="text-primary hover:underline">
            harvest management
          </Link>
          , and{" "}
          <Link to={SEO_ROUTES.farmInventoryManagement} className="text-primary hover:underline">
            inventory
          </Link>{" "}
          so analytics reflect reality.
        </p>
        <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Topical guides</h2>
        <p className="text-muted-foreground leading-relaxed">
          Browse the{" "}
          <Link to={LEARN_MASTER_PATH} className="text-primary hover:underline">
            farm management hub
          </Link>{" "}
          or the full{" "}
          <Link to={LEARN_HUB_PATH} className="text-primary hover:underline">
            Learn
          </Link>{" "}
          library for crop management, irrigation, multi-farm governance, and more—written with Kenya and Africa in mind.
        </p>
      </div>
    </PillarPageTemplate>
  );
}
