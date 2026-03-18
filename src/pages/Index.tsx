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
import { SeoHead } from "@/seo/SeoHead";
import { getOrganizationSchema, getSoftwareApplicationSchema, getFAQSchema } from "@/seo/structuredData";
import { HOME_FAQ_ITEMS } from "@/components/landing/HomeFaqSection";

const Index = () => {
  return (
    <div className="landing-page min-h-screen bg-background font-body">
      <SeoHead
        title="FarmVault – Farm Management System in Kenya | Track Harvest, Labor & Expenses"
        description="FarmVault is a farm management system in Kenya that helps farmers track harvest, labor, inventory, and expenses in real time. Built from real farm experience for African farmers."
        canonical="/"
        jsonLd={[
          getOrganizationSchema(),
          getSoftwareApplicationSchema(),
          getFAQSchema(HOME_FAQ_ITEMS),
        ]}
      />
      <LandingNavbar />
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
      <Footer />
      <PersistentCtaBar />
    </div>
  );
};

export default Index;
