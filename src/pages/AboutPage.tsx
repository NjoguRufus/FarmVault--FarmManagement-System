import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Target, Heart, Globe, Users, Lightbulb, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";
import { SEO_ROUTES } from "@/seo/routes";
import { getOrganizationSchema, getBreadcrumbSchema } from "@/seo/structuredData";
import { SeoInternalLinks } from "@/components/seo/SeoInternalLinks";

const breadcrumbs = [
  { name: "Home", path: "/" },
  { name: "About" },
];

const values = [
  {
    icon: Target,
    title: "Mission",
    description: "To empower African farmers with simple, powerful tools for planning, operations, and growth. We believe every farmer deserves access to technology that helps them succeed.",
  },
  {
    icon: Heart,
    title: "Passion",
    description: "Agriculture is the backbone of African economies. We're passionate about building technology that puts farmers first and helps them thrive in a changing world.",
  },
  {
    icon: Globe,
    title: "Impact",
    description: "From smallholder farms to cooperatives and agribusinesses, FarmVault helps digitize and scale operations sustainably across Kenya and East Africa.",
  },
  {
    icon: Lightbulb,
    title: "Innovation",
    description: "We continuously improve FarmVault based on farmer feedback. Our team works closely with agricultural experts to build features that solve real farming challenges.",
  },
  {
    icon: Users,
    title: "Community",
    description: "FarmVault is more than software—it's a community of farmers sharing knowledge, best practices, and supporting each other's growth.",
  },
  {
    icon: Shield,
    title: "Trust",
    description: "Your farm data is secure with us. We use industry-standard encryption and never share your information without permission.",
  },
];

const stats = [
  { value: "10,000+", label: "Farmers Using FarmVault" },
  { value: "25+", label: "Crop Types Supported" },
  { value: "47", label: "Counties Reached" },
  { value: "4.8★", label: "User Rating" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background font-body">
      <SeoHead
        title="About FarmVault | Kenyan agricultural software platform"
        description="FarmVault is a Kenyan agricultural software platform helping farmers manage operations—workers, harvest, expenses, inventory, and analytics."
        canonical={SEO_ROUTES.about}
        jsonLd={[
          getOrganizationSchema(),
          getBreadcrumbSchema(breadcrumbs),
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
              Built for <span className="text-gradient-gold">Farmers</span>,
              <br className="hidden md:block" />
              by People Who Care
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
              FarmVault is a Kenyan agricultural software platform helping farmers manage operations. We combine crop planning, workers, harvest, inventory, expenses, and analytics so you can run the farm with clarity—from smallholdings to growing agribusinesses.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-y border-border bg-secondary/20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8 text-center tracking-tight">
                Our Story
              </h2>
              <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed mb-6">
                  FarmVault was born from a simple observation: while the rest of the world was going digital, most African farmers were still using paper notebooks and memory to run their farms. Important records got lost, expenses went untracked, and farmers had no clear picture of their true profitability.
                </p>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  We set out to change that. Working closely with farmers across Kenya, we built a farm management system that actually works for African conditions—one that runs on mobile phones, works offline in the field, accepts M-Pesa payments, and understands local crops and farming practices.
                </p>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Today, FarmVault helps thousands of farmers manage their operations with clarity and confidence. From smallholder tomato farmers in Nakuru to large horticultural exporters in Naivasha, our users represent the full spectrum of Kenyan agriculture.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  But we're just getting started. Our vision is to become the operating system for African agriculture—helping farmers not just record data, but use it to make better decisions, access finance, and connect with markets.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 lg:py-28 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight">
              What Drives Us
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our values guide everything we do at FarmVault, from product development to customer support.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {values.map((value, i) => (
              <motion.article
                key={value.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="bg-card rounded-3xl p-8 shadow-luxury hover:shadow-luxury-hover transition-all duration-500"
              >
                <div className="gradient-primary w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-glow-green">
                  <value.icon className="h-7 w-7 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">
                  {value.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {value.description}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Who We Serve Section */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8 text-center tracking-tight">
                Who We Serve
              </h2>
              <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed mb-6">
                  FarmVault is designed for the full spectrum of African agriculture:
                </p>
                <ul className="space-y-4 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Smallholder Farmers:</strong> Individual farmers managing 1-10 acres who want to move beyond paper records and understand their true costs and profits.
                  </li>
                  <li>
                    <strong className="text-foreground">Commercial Farms:</strong> Larger operations managing multiple blocks, crops, and workers who need robust tracking and reporting.
                  </li>
                  <li>
                    <strong className="text-foreground">Cooperatives & Groups:</strong> Farmer groups and cooperatives that need shared records, aggregated reporting, and coordination tools.
                  </li>
                  <li>
                    <strong className="text-foreground">Agribusinesses:</strong> Input suppliers, aggregators, and agro-dealers who work with multiple farmers and need visibility across operations.
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-6">
                  Whether you farm tomatoes in Nakuru, maize in Eldoret, French beans in Naivasha, or rice in Mwea, FarmVault has the tools you need to run a more profitable operation.
                </p>
              </div>
            </motion.div>
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
              Join the FarmVault Community
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Thousands of farmers across Kenya trust FarmVault to run their operations. Start your journey to smarter farming today.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold">
                <a href="/sign-up" className="inline-flex items-center">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-2xl px-8 h-14 text-base font-medium">
                <Link to={SEO_ROUTES.features}>
                  Explore Features
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
