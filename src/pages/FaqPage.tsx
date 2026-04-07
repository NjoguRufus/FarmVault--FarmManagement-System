import React from "react";
import { Link } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";
import { SeoHead } from "@/seo/SeoHead";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import { FAQ_PRIMARY_ITEMS } from "@/data/faqContent";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SEO_ROUTES } from "@/seo/routes";
import { LEARN_HUB_PATH } from "@/data/learnTopics";

const breadcrumbs = [
  { name: "Home", path: "/" },
  { name: "FAQ" },
];

export default function FaqPage() {
  const faqForSchema = FAQ_PRIMARY_ITEMS.map((item) => ({
    question: item.question,
    answer: item.answer,
  }));

  return (
    <div className="landing-page min-h-screen bg-background font-body">
      <SeoHead
        title="FarmVault FAQ | Farm management software Kenya"
        description="Answers about FarmVault: workers, crop yield, multiple farms, and availability in Kenya. Agriculture SaaS with KES pricing."
        canonical="/faq"
        jsonLd={[getBreadcrumbSchema(breadcrumbs), getFAQSchema(faqForSchema)]}
      />
      <LandingNavbar />
      <main className="pt-28 pb-16">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <nav className="text-sm text-muted-foreground mb-8" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            {" / "}
            <span className="text-foreground">FAQ</span>
          </nav>
          <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">Frequently asked questions</h1>
          <p className="text-muted-foreground leading-relaxed mb-10">
            Quick answers about FarmVault for Kenyan farmers and agribusinesses. For step-by-step guides, visit{" "}
            <Link to={LEARN_HUB_PATH} className="text-primary font-medium hover:underline">
              Learn
            </Link>{" "}
            or{" "}
            <Link to={SEO_ROUTES.blog} className="text-primary font-medium hover:underline">
              Blog
            </Link>
            .
          </p>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_PRIMARY_ITEMS.map((item, i) => (
              <AccordionItem key={item.question} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-medium">{item.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <SeoInternalLinks />
        </div>
      </main>
      <Footer />
    </div>
  );
}
