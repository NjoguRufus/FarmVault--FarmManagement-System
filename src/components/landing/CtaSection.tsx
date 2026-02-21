import { useState } from "react";
import { Play, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";

export function CtaSection() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const demoVideoSrc = "/landing/demo/farmvault-demo.mp4";

  return (
    <>
      <section className="relative py-28 lg:py-36 overflow-hidden">
        <div className="absolute inset-0">
          <img src="/landing/cta-bg.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 gradient-cta-overlay" />
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-[80px] animate-pulse-glow" />
          <div className="absolute bottom-1/4 right-1/3 w-48 h-48 bg-gold/10 rounded-full blur-[60px] animate-pulse-glow" style={{ animationDelay: "2s" }} />
        </div>

        <div className="container mx-auto px-4 lg:px-8 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
          >
            <div className="glass-dark inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-xs font-medium text-primary-foreground/80 tracking-wide uppercase">
                Start Free Today
              </span>
            </div>

            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6 tracking-tight leading-tight">
              Ready to Digitize
              <br />
              <span className="text-gradient-gold">Your Farm?</span>
            </h2>

            <p className="text-primary-foreground/60 text-lg mb-12 max-w-md mx-auto font-light leading-relaxed">
              Join thousands of farmers managing their operations smarter with FarmVault.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-10 h-14 text-base font-semibold">
                <Link to="/choose-plan" className="inline-flex items-center">
                  Get Started Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                type="button"
                onClick={() => setIsDemoOpen(true)}
                className="glass-dark text-primary-foreground hover:bg-primary-foreground/10 rounded-2xl px-8 h-14 text-base font-medium"
              >
                <span className="inline-flex items-center">
                  <span className="gradient-primary rounded-full p-2 mr-3 inline-flex">
                    <Play className="h-3 w-3 fill-primary-foreground text-primary-foreground" />
                  </span>
                  Watch Demo
                </span>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Dialog open={isDemoOpen} onOpenChange={setIsDemoOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="bg-background">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle>FarmVault Demo</DialogTitle>
              <DialogDescription>
                Watch how the system is used from setup to daily farm operations.
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-6">
              <video
                controls
                preload="metadata"
                className="w-full rounded-xl border bg-black max-h-[70vh]"
              >
                <source src={demoVideoSrc} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
