import React from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { WhatIsFarmVaultSection } from "@/components/landing/WhatIsFarmVaultSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { RealWorldSection } from "@/components/landing/RealWorldSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { WhyFarmVault } from "@/components/landing/WhyFarmVault";
import { PricingSection } from "@/components/landing/PricingSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { ContactSection } from "@/components/landing/ContactSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { HomeFaqSection } from "@/components/landing/HomeFaqSection";
import { HomeTestimonialsSection } from "@/components/landing/HomeTestimonialsSection";
import { PersistentCtaBar } from "@/components/landing/PersistentCtaBar";
import { Footer } from "@/components/landing/Footer";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { SeoHead } from "@/seo/SeoHead";
import { getOrganizationSchema, getSoftwareApplicationSchema, getFAQSchema } from "@/seo/structuredData";
import { FAQ_PRIMARY_ITEMS } from "@/data/faqContent";

const Index = () => {
  return (
    <div className="landing-page min-h-screen bg-background font-body">
      <SeoHead
        title="FarmVault – Farm Management Software in Africa"
        description="FarmVault helps farmers manage workers, harvests, expenses, and farm operations."
        keywords="farm management software kenya, agriculture software kenya, farm ERP kenya"
        canonical="/"
        jsonLd={[
          getOrganizationSchema(),
          getSoftwareApplicationSchema(),
          getFAQSchema(
            FAQ_PRIMARY_ITEMS.map((item) => ({ question: item.question, answer: item.answer }))
          ),
        ]}
      />
      <LandingNavbar />
      <main id="main-content">
        <HeroSection />
        <WhatIsFarmVaultSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <RealWorldSection />
        <HowItWorksSection />
        <PricingSection />
        <WhyFarmVault />
        <AboutSection />
        <HomeTestimonialsSection />
        <ContactSection />
        <CtaSection />
        <HomeFaqSection />
        <div className="container mx-auto px-4 lg:px-8 max-w-4xl pb-8">
          <SeoInternalLinks />
        </div>
      </main>
      <Footer />
      <PersistentCtaBar />
    </div>
  );
};

export default Index;
