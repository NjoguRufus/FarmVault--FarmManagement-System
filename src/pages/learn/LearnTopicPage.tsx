import React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { getArticleSchema, getBreadcrumbSchema } from "@/seo/structuredData";
import { getLearnTopic, LEARN_HUB_PATH, LEARN_MASTER_PATH } from "@/data/learnTopics";
import { SEO_ROUTES } from "@/seo/routes";

export default function LearnTopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const topic = slug ? getLearnTopic(slug) : null;

  if (!topic) {
    return <Navigate to={LEARN_HUB_PATH} replace />;
  }

  const canonical = `${LEARN_HUB_PATH}/${topic.slug}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Learn", path: LEARN_HUB_PATH },
    { name: topic.title },
  ];

  const jsonLd = [
    getBreadcrumbSchema(breadcrumbs),
    getArticleSchema(topic.title, { description: topic.metaDescription }),
  ];

  return (
    <SeoPageLayout>
      <SeoHead title={`${topic.title} | FarmVault Learn`} description={topic.metaDescription} canonical={canonical} jsonLd={jsonLd} />
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
          <span className="text-foreground">{topic.title}</span>
        </nav>

        <h1 className="text-4xl font-bold text-foreground mb-6 tracking-tight">{topic.title}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-10">{topic.intro}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {topic.sections.map((section, si) => (
            <section key={`${topic.slug}-${si}`}>
              <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4 not-prose">{section.title}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground leading-relaxed">
                  {p}
                </p>
              ))}
            </section>
          ))}

          <section className="mt-10 rounded-xl border border-primary/20 bg-primary/5 p-6 not-prose">
            <h2 className="text-xl font-semibold text-foreground mb-3">How FarmVault helps</h2>
            {topic.solutionParagraphs.map((p, i) => (
              <p key={i} className="text-muted-foreground leading-relaxed mb-3 last:mb-0">
                {p}
              </p>
            ))}
            <p className="text-sm text-muted-foreground mt-4 mb-0">
              <Link to={SEO_ROUTES.pricing} className="text-primary font-medium hover:underline">
                View pricing in KES
              </Link>
              {" · "}
              <Link to={SEO_ROUTES.features} className="text-primary font-medium hover:underline">
                Product features
              </Link>
              {" · "}
              <Link to={SEO_ROUTES.farmManagementSoftwareKenya} className="text-primary font-medium hover:underline">
                Farm management software Kenya
              </Link>
            </p>
          </section>

          {topic.relatedSlugs && topic.relatedSlugs.length > 0 && (
            <section className="mt-10 not-prose">
              <h2 className="text-lg font-semibold text-foreground mb-3">Related guides</h2>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                {topic.relatedSlugs.map((s) => {
                  const t = getLearnTopic(s);
                  if (!t) return null;
                  return (
                    <li key={s}>
                      <Link to={`${LEARN_HUB_PATH}/${s}`} className="text-primary hover:underline">
                        {t.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-8">
          <Link to={LEARN_MASTER_PATH} className="text-primary hover:underline">
            All farm management guides
          </Link>
        </p>

        <SeoInternalLinks />
      </article>
    </SeoPageLayout>
  );
}
