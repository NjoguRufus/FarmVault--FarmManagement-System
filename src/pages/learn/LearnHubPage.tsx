import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { getBreadcrumbSchema } from "@/seo/structuredData";
import {
  LEARN_CORE_SLUGS,
  LEARN_CROP_SLUGS,
  LEARN_HOWTO_SLUGS,
  LEARN_HUB_PATH,
  LEARN_MASTER_PATH,
  getLearnTopic,
} from "@/data/learnTopics";
import { SEO_ROUTES } from "@/seo/routes";

export default function LearnHubPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Learn" },
  ];
  const jsonLd = [getBreadcrumbSchema(breadcrumbs)];

  const renderGroup = (title: string, slugs: readonly string[]) => (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold text-foreground mb-4">{title}</h2>
      <ul className="grid sm:grid-cols-2 gap-3">
        {slugs.map((slug) => {
          const t = getLearnTopic(slug);
          if (!t) return null;
          return (
            <li key={slug}>
              <Link
                to={`${LEARN_HUB_PATH}/${slug}`}
                className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
              >
                <span className="font-medium text-foreground">{t.title}</span>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.metaDescription}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <SeoPageLayout>
      <SeoHead
        title="Farm management guides & agriculture topics | FarmVault Learn"
        description="Free guides on crop management, workers, harvest, expenses, inventory, analytics, and Kenyan farming—plus how FarmVault helps."
        canonical={LEARN_HUB_PATH}
        jsonLd={jsonLd}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          {" / "}
          <span className="text-foreground">Learn</span>
        </nav>

        <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">FarmVault Learn</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-10">
          Practical farm management topics for Kenya and Africa—operations, economics, and how digital records improve decisions. Start with the{" "}
          <Link to={LEARN_MASTER_PATH} className="text-primary font-medium hover:underline">
            master farm management hub
          </Link>{" "}
          or browse by category below. FarmVault is agriculture SaaS with{" "}
          <Link to={SEO_ROUTES.pricing} className="text-primary font-medium hover:underline">
            pricing in KES
          </Link>
          .
        </p>

        {renderGroup("Core topics", LEARN_CORE_SLUGS)}
        {renderGroup("Crop & enterprise guides", LEARN_CROP_SLUGS)}
        {renderGroup("How-to articles", LEARN_HOWTO_SLUGS)}

        <SeoInternalLinks />
      </article>
    </SeoPageLayout>
  );
}
