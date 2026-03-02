import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getFAQSchema } from "@/seo/structuredData";
import { SeoHead } from "@/seo/SeoHead";

export interface FaqItem {
  question: string;
  answer: string;
}

interface SeoFaqProps {
  items: FaqItem[];
  /** If true, inject FAQ JSON-LD only (no duplicate headline). Use when page already has SeoHead. */
  jsonLdOnly?: boolean;
}

export function SeoFaq({ items, jsonLdOnly }: SeoFaqProps) {
  const schema = getFAQSchema(items);
  return (
    <>
      {!jsonLdOnly && (
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      )}
      <section className="py-12 border-t">
        <div className="container mx-auto px-4 lg:px-8">
          <h2 className="text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full max-w-3xl">
            {items.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-medium">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}

/** Use this to add FAQ schema to a page that already has SeoHead – pass schema to SeoHead jsonLd array. */
export function getFaqSchema(items: FaqItem[]) {
  return getFAQSchema(items);
}
