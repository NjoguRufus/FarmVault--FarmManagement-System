import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const features = [
  {
    title: "Crop & Farm Projects",
    image: "/landing/farmer-card1.jpg",
    previewImage: "/landing/dashboard-examples/crop-farm-projects-dashboard.png",
    items: ["Plan & Track Activities", "Monitor Growth", "View Crop Reports"],
  },
  {
    title: "Operations & Tasks",
    image: "/landing/farmer-card2.jpg",
    previewImage: "/landing/dashboard-examples/operations-tasks-dashboard.png",
    items: ["Assign Tasks", "Record Work Logs", "Manage Workers"],
  },
  {
    title: "Inventory & Inputs",
    image: "/landing/farmer-card3.jpg",
    previewImage: "/landing/dashboard-examples/inventory-inputs-dashboard.png",
    items: ["Track Inputs & Supplies", "Low Stock Alerts", "Usage Reports"],
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: "easeOut" as const },
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
      <section id="features" className="py-24 lg:py-32 bg-background relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gold/5 rounded-full blur-[100px]" />

        <div className="container mx-auto px-4 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
              Core Features
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-5 tracking-tight">
              Everything a Farmer Needs —
              <br className="hidden md:block" />
              <span className="text-gradient-gold"> In One System</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-base font-light leading-relaxed">
              From planting to harvest and sales, FarmVault keeps your entire operation organized and profitable.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={cardVariants}
                whileHover={{ y: -8, transition: { duration: 0.3 } }}
                className="bg-card rounded-3xl overflow-hidden shadow-luxury hover:shadow-luxury-hover transition-all duration-500 group"
              >
                <div className="relative h-56 overflow-hidden">
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  <button
                    type="button"
                    onClick={() => openPreview(feature)}
                    className="absolute top-4 right-4 glass rounded-full px-3 py-1 text-xs font-semibold text-foreground hover:bg-background/80 transition-colors"
                  >
                    View →
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <h3 className="text-xl font-bold text-foreground tracking-tight">{feature.title}</h3>
                  <div className="space-y-3">
                    {feature.items.map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="gradient-primary rounded-full p-0.5">
                          <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                        </div>
                        <span className="text-sm text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
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
                  Example image for this dashboard card.
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pb-6">
                {activeImageSrc ? (
                  <img
                    src={activeImageSrc}
                    alt={`${selectedFeature.title} dashboard preview`}
                    className="w-full rounded-xl border object-cover max-h-[70vh]"
                    onError={() => {
                      if (!selectedFeature) {
                        return;
                      }

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
                    Showing temporary image. Replace with your uploaded dashboard screenshot in
                    `public/landing/dashboard-examples/`.
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
