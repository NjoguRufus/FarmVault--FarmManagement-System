import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Zap, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";
import { SEO_ROUTES } from "@/seo/routes";
import { getOrganizationSchema, getBreadcrumbSchema, getFAQSchema } from "@/seo/structuredData";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";
import { SUBSCRIPTION_PLANS, type BillingMode, getPlanPrice, getBillingModeDurationLabel } from "@/config/plans";
import { BillingModeSelector } from "@/components/subscription/BillingModeSelector";

const breadcrumbs = [
  { name: "Home", path: "/" },
  { name: "Pricing" },
];

const faqs = [
  {
    question: "Can I try FarmVault for free?",
    answer: "Yes! FarmVault offers a free tier that lets you record crops, expenses, and harvests at no cost. You can use it indefinitely to manage a small operation. Upgrade anytime to unlock more features and users.",
  },
  {
    question: "How does billing work?",
    answer: "FarmVault offers monthly and annual billing options. Annual plans give you significant savings (up to 2 months free). You can pay via M-Pesa or card.",
  },
  {
    question: "Can I change my plan later?",
    answer: "Yes, you can upgrade or downgrade your plan at any time. When upgrading, you'll only pay the difference. When downgrading, the credit is applied to future billing.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept M-Pesa, Visa, Mastercard, and other major payment methods used in real farm operations.",
  },
  {
    question: "Is there a contract or commitment?",
    answer: "No long-term contracts required. Monthly plans can be cancelled anytime. Annual plans are paid upfront but offer better value.",
  },
  {
    question: "What happens if I exceed my plan limits?",
    answer: "We'll notify you when you're approaching limits and give you the option to upgrade. We never delete your data or lock you out suddenly.",
  },
];

export default function PricingPage() {
  const [billingMode, setBillingMode] = useState<BillingMode>('monthly');

  return (
    <div className="min-h-screen bg-background font-body">
      <SeoHead
        title="Pricing - FarmVault Farm Management Software | Affordable Plans for Every Farm"
        description="FarmVault pricing plans for real farm operations. Start free, upgrade when ready. Monthly and annual options. M-Pesa accepted. Affordable farm management software."
        canonical={SEO_ROUTES.pricing}
        jsonLd={[
          getOrganizationSchema(),
          getBreadcrumbSchema(breadcrumbs),
          getFAQSchema(faqs),
        ]}
      />
      <LandingNavbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <nav className="text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
              {breadcrumbs.map((b, i) => (
                <span key={i}>
                  {i > 0 && " / "}
                  {b.path ? (
                    <Link to={b.path} className="hover:text-foreground">
                      {b.name}
                    </Link>
                  ) : (
                    <span>{b.name}</span>
                  )}
                </span>
              ))}
            </nav>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 tracking-tight">
              Simple, <span className="text-gradient-gold">Transparent</span> Pricing
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
              Choose the plan that fits your farm. Start free and upgrade as you grow. Built from real farm experience and designed for real operations across different regions.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Billing Mode Selector */}
      <section className="pb-8">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex justify-center">
            <BillingModeSelector mode={billingMode} onChange={setBillingMode} />
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 lg:pb-28">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {SUBSCRIPTION_PLANS.map((plan, i) => {
              const amount = getPlanPrice(plan.value, billingMode);
              const durationLabel = getBillingModeDurationLabel(billingMode);

              return (
                <motion.article
                  key={plan.value}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className={`rounded-3xl p-8 transition-all duration-500 relative ${
                    plan.popular
                      ? "bg-card shadow-luxury-hover border-2 border-primary/20"
                      : "bg-card shadow-luxury border border-border"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-semibold">
                        <Zap className="h-3 w-3" /> Most Popular
                      </span>
                    </div>
                  )}

                  <h2 className="text-xl font-bold text-foreground mb-1 tracking-tight">
                    {plan.name}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6 font-light">
                    {plan.description}
                  </p>

                  <div className="mb-6">
                    {amount != null ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-foreground">
                            KES {amount.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{durationLabel}</p>
                        {billingMode === 'annual' && (
                          <p className="text-xs text-emerald-600 mt-1">
                            Save more with annual billing
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-lg font-medium text-muted-foreground">
                        Contact us for pricing
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <div className="gradient-primary rounded-full p-0.5 shrink-0 mt-0.5">
                          <Check className="h-3.5 w-3.5 text-primary-foreground" />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    size="lg"
                    asChild
                    className={
                      plan.popular
                        ? "gradient-primary text-primary-foreground btn-luxury rounded-2xl w-full h-12"
                        : "rounded-2xl w-full h-12 border-2 border-primary text-primary hover:bg-primary/5"
                    }
                  >
                    <a href="/sign-up" className="inline-flex items-center justify-center">
                      Get Started <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Comparison */}
      <section className="py-20 lg:py-28 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
              What's Included in Every Plan
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              All FarmVault plans include core features to help you manage your farm. Higher tiers unlock more users, storage, and advanced capabilities.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: "Crop Tracking", desc: "Monitor all your crops and farm projects" },
                { title: "Expense Management", desc: "Record and categorize all farm costs" },
                { title: "Inventory Tracking", desc: "Track inputs, supplies, and equipment" },
                { title: "Harvest Recording", desc: "Log harvests and track yields" },
                { title: "Mobile Access", desc: "Use on any device, in the field" },
                { title: "Basic Reports", desc: "Essential reports on farm performance" },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="flex items-start gap-3 bg-card rounded-xl p-4"
                >
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Common questions about FarmVault pricing and billing.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <motion.details
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="group bg-card rounded-2xl border border-border"
                >
                  <summary className="flex items-center justify-between cursor-pointer p-6 list-none">
                    <span className="font-semibold text-foreground pr-4">{faq.question}</span>
                    <HelpCircle className="h-5 w-5 text-muted-foreground group-open:text-primary transition-colors shrink-0" />
                  </summary>
                  <div className="px-6 pb-6 pt-0">
                    <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                </motion.details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-primary/5">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-2xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6 tracking-tight">
              Start Managing Your Farm Today
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              No credit card required to start. Try FarmVault free and see how it transforms your farm operations.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold">
                <a href="/sign-up" className="inline-flex items-center">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-2xl px-8 h-14 text-base font-medium">
                <Link to={SEO_ROUTES.features}>
                  View All Features
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 lg:px-8 max-w-4xl pb-8">
        <SeoInternalLinks />
      </div>

      <Footer />
    </div>
  );
}
