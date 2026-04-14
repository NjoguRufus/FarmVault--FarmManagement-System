import React from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { WhyFarmVault } from "@/components/landing/WhyFarmVault";
import { ProductTransitionSection } from "@/components/landing/ProductTransitionSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { PersistentCtaBar } from "@/components/landing/PersistentCtaBar";
import { Footer } from "@/components/landing/Footer";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { SeoHead } from "@/seo/SeoHead";
import { getOrganizationSchema, getSoftwareApplicationSchema, getFAQSchema } from "@/seo/structuredData";
import { FAQ_PRIMARY_ITEMS } from "@/data/faqContent";

const Index = () => {
  return (
    <div className="landing-page min-h-screen bg-white text-[#5f6f63] font-sans">
      <SeoHead
        title="FarmVault - Farm Management System in Africa"
        description="Track expenses in KES, record harvests, manage workers, and monitor farm profit in one system."
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
        <SolutionSection />
        <WhyFarmVault />
        <FeaturesSection />
        <ProductTransitionSection />
        <PricingSection />
        <CtaSection />
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
