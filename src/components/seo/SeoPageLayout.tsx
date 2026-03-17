import React from "react";
import { Link } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Phone } from "lucide-react";
import { SEO_ROUTES } from "@/seo/routes";

const PHONE_NUMBER = "0714 748299";
const PHONE_LINK = "tel:+254714748299";

interface SeoPageLayoutProps {
  children: React.ReactNode;
  /** Optional CTA block below main content */
  showCta?: boolean;
}

export function SeoPageLayout({ children, showCta = true }: SeoPageLayoutProps) {
  return (
    <div className="landing-page min-h-screen bg-background font-body">
      <LandingNavbar />
      <main className="pt-24 pb-12">{children}</main>
      {showCta && (
        <section className="border-t bg-muted/30 py-16">
          <div className="container mx-auto px-4 lg:px-8 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Ready to manage your farm smarter?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Join Kenyan farmers using FarmVault for crop monitoring, budgets, inventory and harvest logistics.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="gradient-primary text-primary-foreground rounded-xl">
                <a href="/sign-up">
                  Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-xl">
                <a href={PHONE_LINK}>
                  <Phone className="mr-2 h-4 w-4" /> Call {PHONE_NUMBER}
                </a>
              </Button>
            </div>
          </div>
        </section>
      )}
      <Footer />
    </div>
  );
}

export { PHONE_NUMBER, PHONE_LINK };
