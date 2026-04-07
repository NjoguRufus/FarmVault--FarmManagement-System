import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import {
  getAllLearnTopicSlugs,
  getLearnTopic,
  LEARN_HUB_PATH,
  LEARN_MASTER_PATH,
} from "@/data/learnTopics";
import { SEO_ROUTES } from "@/seo/routes";

export default function FarmManagementLearnMasterPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Learn", path: LEARN_HUB_PATH },
    { name: "Farm management" },
  ];
  const slugs = getAllLearnTopicSlugs();

  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm management hub | Guides for Kenya & Africa | FarmVault"
        description="Complete index of FarmVault learn guides: crop management, workers, harvest, expenses, inventory, multi-farm operations, analytics, and Kenyan crop playbooks."
        canonical={LEARN_MASTER_PATH}
        jsonLd={[getBreadcrumbSchema(breadcrumbs)]}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          {" / "}
          <Link to={LEARN_HUB_PATH} className="hover:text-foreground">
            Learn
          </Link>
          {" / "}
          <span className="text-foreground">Farm management</span>
        </nav>

        <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">Farm management knowledge hub</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-10">
          Every guide below is written for farmers and agribusiness teams in Kenya and similar African systems. Each page explains the topic, adds local context, and shows how{" "}
          <Link to={SEO_ROUTES.features} className="text-primary font-medium hover:underline">
            FarmVault
          </Link>{" "}
          supports better records and decisions. Explore{" "}
          <Link to={SEO_ROUTES.pricing} className="text-primary font-medium hover:underline">
            pricing
          </Link>{" "}
          and the{" "}
          <Link to={SEO_ROUTES.blog} className="text-primary font-medium hover:underline">
            blog
          </Link>{" "}
          for deeper reads.
        </p>

        <ul className="space-y-3 mb-12">
          {slugs.map((slug) => {
            const t = getLearnTopic(slug);
            if (!t) return null;
            return (
              <li key={slug}>
                <Link to={`${LEARN_HUB_PATH}/${slug}`} className="text-primary font-medium hover:underline text-lg">
                  {t.title}
                </Link>
                <p className="text-sm text-muted-foreground mt-0.5">{t.metaDescription}</p>
              </li>
            );
          })}
        </ul>

        <SeoInternalLinks />
      </article>
    </SeoPageLayout>
  );
}
