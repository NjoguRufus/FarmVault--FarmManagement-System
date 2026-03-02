import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { getBreadcrumbSchema, getFAQSchema, getLocalBusinessSchema } from "@/seo/structuredData";
import type { FaqItem } from "@/components/seo/SeoFaq";

export interface LocationPageTemplateProps {
  city: string;
  title: string;
  description: string;
  canonical: string;
  children: React.ReactNode;
  faqs: FaqItem[];
}

export function LocationPageTemplate({
  city,
  title,
  description,
  canonical,
  children,
  faqs,
}: LocationPageTemplateProps) {
  const breadcrumbs = [{ name: "Home", path: "/" }, { name: `Farm Management Software ${city}` }];
  const jsonLd = [
    getBreadcrumbSchema(breadcrumbs),
    getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
    getLocalBusinessSchema({ city }),
  ];
  return (
    <SeoPageLayout>
      <SeoHead title={title} description={description} canonical={canonical} jsonLd={jsonLd} />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>Farm Management Software {city}</span>
        </nav>
        {children}
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
