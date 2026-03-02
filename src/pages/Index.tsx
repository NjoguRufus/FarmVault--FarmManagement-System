import React from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
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
        canonical="/"
        jsonLd={[
          getOrganizationSchema(),
          getSoftwareApplicationSchema(),
          getFAQSchema(HOME_FAQ_ITEMS),
        ]}
      />
      <LandingNavbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <WhyFarmVault />
      <PricingSection />
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
