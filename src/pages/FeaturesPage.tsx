import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Leaf, Package, DollarSign, BarChart3, Users, Calendar, Truck, FileText } from "lucide-react";
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
  { name: "Features" },
];

const features = [
  {
    icon: Leaf,
    title: "Crop & Farm Projects",
    description: "Plan and track all your farming activities from planting to harvest. Monitor crop growth stages, record observations, and generate detailed crop reports.",
    benefits: [
      "Track multiple crops and farm blocks",
      "Monitor growth stages and health",
      "Record field observations and notes",
      "Generate crop performance reports",
    ],
    link: SEO_ROUTES.cropMonitoringSoftware,
  },
  {
    icon: Calendar,
    title: "Operations & Task Management",
    description: "Assign tasks to workers, schedule farm operations, and track daily work logs. Keep your entire team coordinated and productive.",
    benefits: [
      "Create and assign tasks to workers",
      "Track task completion and time spent",
      "Schedule recurring operations",
      "View team productivity reports",
    ],
    link: SEO_ROUTES.farmProjectManagement,
  },
  {
    icon: Package,
    title: "Inventory & Input Tracking",
    description: "Track all farm inputs including seeds, fertilizers, pesticides, and equipment. Get low stock alerts and analyze usage patterns.",
    benefits: [
      "Track inventory levels in real-time",
      "Set reorder points and get alerts",
      "Record input usage per project",
      "Analyze input costs and efficiency",
    ],
    link: SEO_ROUTES.farmInventoryManagement,
  },
  {
    icon: DollarSign,
    title: "Expense Management",
    description: "Record and categorize all farm expenses including labor, inputs, transport, and overhead. See exactly where your money goes.",
    benefits: [
      "Log expenses by category and project",
      "Track labor costs and payments",
      "Compare budget vs actual spending",
      "Generate expense reports for tax",
    ],
    link: SEO_ROUTES.farmExpenseTracking,
  },
  {
    icon: Truck,
    title: "Harvest & Sales Tracking",
    description: "Log harvest quantities, track sales to buyers, and monitor revenue. See profitability per crop, per block, and per season.",
    benefits: [
      "Record daily harvest quantities",
      "Track sales and buyer payments",
      "Calculate profit per kilogram",
      "Monitor revenue trends over time",
    ],
    link: SEO_ROUTES.farmHarvestManagement,
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    description: "Generate comprehensive reports on profitability, productivity, and farm performance. Make data-driven decisions for better seasons.",
    benefits: [
      "Profitability reports by crop",
      "Expense breakdown analysis",
      "Yield comparison reports",
      "Export data to Excel/PDF",
    ],
    link: SEO_ROUTES.farmManagementSoftwareKenya,
  },
  {
    icon: Users,
    title: "Team & Access Management",
    description: "Add team members with different access levels. Farm managers, supervisors, and workers get the features they need.",
    benefits: [
      "Role-based access control",
      "Multiple user accounts per farm",
      "Activity logs and audit trails",
      "Mobile access for field workers",
    ],
    link: SEO_ROUTES.farmManagementSoftwareKenya,
  },
  {
    icon: FileText,
    title: "Farm Budgeting & Planning",
    description: "Create detailed budgets for each crop project. Compare planned vs actual costs and improve planning for future seasons.",
    benefits: [
      "Create project budgets upfront",
      "Track budget utilization",
      "Forecast costs and revenue",
      "Learn from past season data",
    ],
    link: SEO_ROUTES.farmBudgetingSoftware,
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background font-body">
      <SeoHead
        title="Features - FarmVault Farm Management Software | All Tools in One Place"
        description="Explore FarmVault features: crop tracking, inventory management, expense tracking, harvest sales, reports & analytics. Everything farmers need to run profitable operations."
        canonical={SEO_ROUTES.features}
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
              All the Features You Need to
              <span className="text-gradient-gold"> Run Your Farm</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
              FarmVault combines crop management, inventory tracking, expense management, and harvest sales in one powerful platform. Everything a modern farmer needs to make data-driven decisions and grow profitably.
            </p>
            <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold">
              <a href="/sign-up" className="inline-flex items-center">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
            {features.map((feature, i) => (
              <motion.article
                key={feature.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={cardVariants}
                className="bg-card rounded-3xl p-8 shadow-luxury hover:shadow-luxury-hover transition-all duration-500 border border-border"
              >
                <div className="flex items-start gap-5">
                  <div className="gradient-primary w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-glow-green">
                    <feature.icon className="h-7 w-7 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-foreground mb-3 tracking-tight">
                      {feature.title}
                    </h2>
                    <p className="text-muted-foreground mb-5 leading-relaxed">
                      {feature.description}
                    </p>
                    <ul className="space-y-2 mb-5">
                      {feature.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-center gap-3 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={feature.link}
                      className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                    >
                      Learn more <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Why FarmVault Section */}
      <section className="py-20 lg:py-28 bg-secondary/30">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8 text-center tracking-tight">
              Why Farmers Choose FarmVault
            </h2>
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                FarmVault is built specifically for African farmers and local farming conditions. Unlike generic farm software designed for large Western farms, FarmVault understands the unique challenges of farming in Kenya and across Africa.
              </p>
              <ul className="space-y-4 text-muted-foreground">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span><strong>Works Offline:</strong> Record data in the field even without internet. Everything syncs when you're back online.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span><strong>Mobile-First Design:</strong> Use FarmVault on your phone in the field. No expensive computers required.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span><strong>M-Pesa Integration:</strong> Pay for subscriptions and track payments using M-Pesa, the way Kenyans do business.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span><strong>Local Crop Support:</strong> Built-in guidance for tomatoes, maize, French beans, capsicum, and other popular Kenyan crops.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span><strong>Affordable Pricing:</strong> Plans designed for smallholder farmers, with a free tier to get started.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <span><strong>Local Support:</strong> Get help from a team that understands Kenyan agriculture.</span>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-2xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6 tracking-tight">
              Ready to Transform Your Farm?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Join thousands of farmers across Kenya who use FarmVault to run more profitable operations. Start your free trial today.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold">
                <a href="/sign-up" className="inline-flex items-center">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-2xl px-8 h-14 text-base font-medium">
                <Link to={SEO_ROUTES.pricing}>
                  View Pricing
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
