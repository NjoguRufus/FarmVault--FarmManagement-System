import React from "react";
import { Link } from "react-router-dom";
import { SeoPageLayout } from "@/components/seo/SeoPageLayout";
import { SeoHead } from "@/seo/SeoHead";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import type { FaqItem } from "@/components/seo/SeoFaq";

export interface CropPillarTemplateProps {
  title: string;
  description: string;
  canonical: string;
  breadcrumbName: string;
  children: React.ReactNode;
  faqs: FaqItem[];
}

export function CropPillarTemplate({
  title,
  description,
  canonical,
  breadcrumbName,
  children,
  faqs,
}: CropPillarTemplateProps) {
  const breadcrumbs = [{ name: "Home", path: "/" }, { name: breadcrumbName }];
  const jsonLd = [
    getBreadcrumbSchema(breadcrumbs),
    getFAQSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
  ];
  return (
    <SeoPageLayout>
      <SeoHead title={title} description={description} canonical={canonical} jsonLd={jsonLd} />
      <article className="container mx-auto px-4 lg:px-8 max-w-4xl">
        <nav className="text-sm text-muted-foreground mb-8" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>{breadcrumbName}</span>
        </nav>
        {children}
        <SeoFaq items={faqs} jsonLdOnly />
      </article>
    </SeoPageLayout>
  );
}
