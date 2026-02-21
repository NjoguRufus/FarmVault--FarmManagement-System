import { useState } from "react";
import { Play, ArrowRight } from "lucide-react";
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

export function HeroSection() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const demoVideoSrc = "/landing/demo/farmvault-demo.mp4";

  return (
    <>
      <section className="relative min-h-[100vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="/landing/hero-bg.jpg" alt="" className="w-full h-full object-cover scale-105" />
          <div className="absolute inset-0 gradient-hero-overlay" />
          <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-pulse-glow" />
          <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-gold/10 rounded-full blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
        </div>

        <div className="container mx-auto px-4 lg:px-8 relative z-10 pt-28 pb-16">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-xl"
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] mb-6 text-primary-foreground tracking-tight">
                Built for Farmers
                <br />
                <span className="text-gradient-gold">to Manage</span> Every
                <br />
                Part of Their Farm
              </h1>

              <p className="text-base md:text-lg text-primary-foreground/70 mb-10 leading-relaxed max-w-md font-light">
                Manage Crops, Operations, Inventory, Expenses & Harvest Sales — all in one powerful system.
              </p>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold">
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

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="flex gap-8 mt-12 pt-8 border-t border-primary-foreground/10"
              >
                {[
                  { value: "10K+", label: "Farmers" },
                  { value: "25+", label: "Crop Types" },
                  { value: "4.8★", label: "Rating" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-2xl font-bold text-primary-foreground">{stat.value}</p>
                    <p className="text-xs text-primary-foreground/50 uppercase tracking-wider mt-1">{stat.label}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
              className="flex justify-center lg:justify-end"
            >
              <div className="relative">
                <div className="absolute inset-0 -m-12 rounded-full bg-gradient-to-br from-primary/20 to-gold/20 blur-[60px] animate-pulse-glow" />
                <div className="absolute inset-0 -m-6 rounded-full bg-gradient-to-tr from-gold/10 to-primary/10 blur-[40px] animate-pulse-glow" style={{ animationDelay: "1s" }} />
                <img
                  src="/landing/phone-mockup.png"
                  alt="FarmVault dashboard on mobile"
                  className="relative z-10 w-72 md:w-80 lg:w-[380px] drop-shadow-2xl animate-float"
                />
                <motion.div
                  animate={{ y: [-5, 5, -5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -left-8 top-1/3 glass-strong rounded-2xl px-4 py-3 shadow-luxury hidden lg:block"
                >
                  <p className="text-xs font-semibold text-foreground">📊 Revenue</p>
                  <p className="text-lg font-bold text-gradient-green">KES 806,550</p>
                </motion.div>
                <motion.div
                  animate={{ y: [5, -5, 5] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -right-4 bottom-1/4 glass-strong rounded-2xl px-4 py-3 shadow-luxury hidden lg:block"
                >
                  <p className="text-xs font-semibold text-foreground">🌱 Crops Active</p>
                  <p className="text-lg font-bold text-gradient-gold">12 Projects</p>
                </motion.div>
              </div>
            </motion.div>
          </div>
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
