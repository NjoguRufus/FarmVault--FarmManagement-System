import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_PRIMARY_ITEMS } from "@/data/faqContent";

export function HomeFaqSection() {
  return (
    <section id="faq" className="py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground">
            Quick answers about FarmVault and farm management in Kenya.
          </p>
        </div>
        <Accordion type="single" collapsible className="max-w-3xl mx-auto">
          {FAQ_PRIMARY_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`home-faq-${i}`}>
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
  );
}
