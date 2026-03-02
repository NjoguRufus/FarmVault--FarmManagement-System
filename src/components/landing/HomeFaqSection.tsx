import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const HOME_FAQ_ITEMS = [
  {
    question: "What is FarmVault?",
    answer: "FarmVault is farm management software for Kenya. It helps you plan crops, track expenses, manage inventory and coordinate harvests in one system. Used by smallholders and growing agribusinesses across the country.",
  },
  {
    question: "How much does FarmVault cost?",
    answer: "FarmVault offers a free tier so you can start recording crops and expenses at no cost. Paid plans add more users and features. Pricing is in KES and designed for Kenyan farmers.",
  },
  {
    question: "Can I use FarmVault on my phone?",
    answer: "Yes. FarmVault works in your mobile browser and can be installed as an app. Log expenses in the field, check inventory and update crop stages from your phone.",
  },
  {
    question: "Which crops does FarmVault support?",
    answer: "FarmVault supports tomatoes, maize, rice, French beans, capsicum, watermelon and many other crops. You get crop-specific stages, common diseases and fertilizer guidance, plus budgeting and harvest tracking.",
  },
  {
    question: "How do I start?",
    answer: "Create your free account, add your first project and begin logging crops and expenses. You can also request a demo or call 0714 748299 to speak with the team.",
  },
];

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
          {HOME_FAQ_ITEMS.map((item, i) => (
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
