import { useState } from "react";
import { CheckCircle2, Truck, Users, Package, Receipt, BarChart3, Bell } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OptimizedImage } from "@/components/ui/OptimizedImage";

const features = [
  {
    icon: Truck,
    title: "Harvest Tracking",
    image: "/landing/farmer-card1.jpg",
    previewImage: "/landing/dashboard-examples/crop-farm-projects-dashboard.png",
    description: "Record daily harvest collections, monitor output, and track picker contributions accurately.",
    items: ["Daily harvest recording", "Per-picker tracking", "Output monitoring", "Harvest history"],
  },
  {
    icon: Users,
    title: "Labor Management",
    image: "/landing/farmer-card2.jpg",
    previewImage: "/landing/dashboard-examples/operations-tasks-dashboard.png",
    description: "Track workers, measure productivity, and manage payouts accurately and fairly.",
    items: ["Worker attendance", "Productivity tracking", "Payout management", "Performance reports"],
  },
  {
    icon: Package,
    title: "Inventory Management",
    image: "/landing/farmer-card3.jpg",
    previewImage: "/landing/dashboard-examples/inventory-inputs-dashboard.png",
    description: "Keep track of farm inputs like fertilizers, pesticides, fuel, and packaging materials.",
    items: ["Stock tracking", "Low stock alerts", "Usage reports", "Input costs"],
  },
  {
    icon: Receipt,
    title: "Expense Tracking",
    image: "/landing/farmer-card1.jpg",
    previewImage: "/landing/dashboard-examples/crop-farm-projects-dashboard.png",
    description: "Record and monitor farm-related spending in real time to control costs.",
    items: ["Real-time recording", "Category tracking", "Budget vs actual", "Expense reports"],
  },
  {
    icon: BarChart3,
    title: "Reports & Insights",
    image: "/landing/farmer-card2.jpg",
    previewImage: "/landing/dashboard-examples/operations-tasks-dashboard.png",
    description: "Understand farm performance using real data and actionable insights.",
    items: ["Performance dashboards", "Profitability analysis", "Trend reports", "Data export"],
  },
  {
    icon: Bell,
    title: "Notifications & Audit",
    image: "/landing/farmer-card3.jpg",
    previewImage: "/landing/dashboard-examples/inventory-inputs-dashboard.png",
    description: "Stay informed with alerts and maintain transparency with audit trails.",
    items: ["Real-time alerts", "Activity logs", "Audit transparency", "Team notifications"],
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export function FeaturesSection() {
  const [selectedFeature, setSelectedFeature] = useState<(typeof features)[number] | null>(null);
  const [activeImageSrc, setActiveImageSrc] = useState<string | null>(null);
  const [isFallbackPreview, setIsFallbackPreview] = useState(false);

  const openPreview = (feature: (typeof features)[number]) => {
    setSelectedFeature(feature);
    setActiveImageSrc(feature.previewImage ?? feature.image);
    setIsFallbackPreview(false);
  };

  return (
    <>
      <section id="features" className="py-24 lg:py-32 bg-secondary/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gold/5 rounded-full blur-[100px]" />

        <div className="container mx-auto px-4 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
              Features
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              Powerful Features Built for
              <br className="hidden md:block" />
              <span className="text-gradient-gold"> Real Farm Operations</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg font-light leading-relaxed">
              FarmVault is designed to handle real farm workflows, from harvest collection to financial reporting.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature, i) => (
              <motion.article
                key={feature.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={cardVariants}
                whileHover={{ y: -6, transition: { duration: 0.3 } }}
                className="bg-card rounded-3xl overflow-hidden shadow-luxury hover:shadow-luxury-hover transition-all duration-500 group"
              >
                <div className="relative h-48 overflow-hidden">
                  <OptimizedImage
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                  <div className="absolute top-4 left-4 w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow-green">
                    <feature.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <button
                    type="button"
                    onClick={() => openPreview(feature)}
                    className="absolute top-4 right-4 glass rounded-full px-3 py-1 text-xs font-semibold text-foreground hover:bg-background/80 transition-colors"
                  >
                    Preview →
                  </button>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{feature.description}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {feature.items.map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-xs text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <Dialog
        open={Boolean(selectedFeature)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFeature(null);
            setActiveImageSrc(null);
            setIsFallbackPreview(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {selectedFeature && (
            <div className="bg-background">
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle>{selectedFeature.title} Dashboard Preview</DialogTitle>
                <DialogDescription>
                  {selectedFeature.description}
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pb-6">
                {activeImageSrc ? (
                  <img
                    src={activeImageSrc}
                    alt={`${selectedFeature.title} dashboard preview`}
                    className="w-full rounded-xl border object-cover max-h-[70vh]"
                    onError={() => {
                      if (!selectedFeature) return;
                      if (activeImageSrc !== selectedFeature.image) {
                        setActiveImageSrc(selectedFeature.image);
                        setIsFallbackPreview(true);
                        return;
                      }
                      setActiveImageSrc(null);
                    }}
                  />
                ) : (
                  <div className="w-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Preview image is not available yet.
                  </div>
                )}
                {isFallbackPreview && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Showing temporary image.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
