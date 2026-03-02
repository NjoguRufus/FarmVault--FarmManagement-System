import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "./SeoPageLayout";
import { SeoFaq, FaqItem } from "./SeoFaq";
import { SeoHead } from "@/seo/SeoHead";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";

export interface PillarPageTemplateProps {
  title: string;
  description: string;
  canonical: string;
  breadcrumbs: Array<{ name: string; path?: string }>;
  children: React.ReactNode;
  faqs: FaqItem[];
  /** Optional JSON-LD to merge (e.g. FAQ schema is added automatically from faqs). */
  additionalJsonLd?: object | object[];
}

export function PillarPageTemplate({
  title,
  description,
  canonical,
  breadcrumbs,
  children,
  faqs,
  additionalJsonLd,
}: PillarPageTemplateProps) {
  const jsonLd = [
    getBreadcrumbSchema(breadcrumbs),
    getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
    ...(Array.isArray(additionalJsonLd) ? additionalJsonLd : additionalJsonLd ? [additionalJsonLd] : []),
  ];
  return (
    <SeoPageLayout>
      <SeoHead
        title={title}
        description={description}
        canonical={canonical}
        jsonLd={jsonLd}
      />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i}>
              {i > 0 && " / "}
              {b.path ? (
                <Link to={b.path} className="hover:text-foreground">
                  {b.name}
                </Link>
              ) : (
                <span>{b.name}</span>
              )}
            </span>
          ))}
        </nav>
        {children}
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
