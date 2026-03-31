import { useState } from "react";
import { Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { InstallFarmVault } from "@/components/pwa/InstallFarmVault";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { getAppAuthUrl } from "@/lib/urls/domains";

export function HeroSection() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const demoVideoSrc = "/landing/demo/farmvault-demo.mp4";

  return (
    <>
      <section className="relative min-h-[100vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <OptimizedImage
            src="/landing/hero-bg.jpg"
            webpSrc="/landing/hero-bg.webp"
            priority
            alt=""
            className="w-full h-full object-cover scale-105"
          />
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
                <span className="text-gradient-gold">Farm Management</span>
                <br />
                System in Kenya
              </h1>

              <p className="text-lg md:text-xl text-primary-foreground/80 mb-4 leading-relaxed max-w-lg font-medium">
                Track harvest, labor, inventory, and farm expenses in real time.
              </p>

              <p className="text-base text-primary-foreground/60 mb-10 leading-relaxed max-w-md font-light">
                Built from real farm experience, FarmVault helps farmers manage daily operations, reduce losses, and make better decisions using data.
              </p>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold">
                  <a href={getAppAuthUrl("sign-up")} className="inline-flex items-center">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <InstallFarmVault />
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
                    View Demo
                  </span>
                </Button>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="text-sm text-primary-foreground/50 mt-8 font-light"
              >
                Designed for modern farms in Kenya and across Africa.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="flex gap-8 mt-8 pt-8 border-t border-primary-foreground/10"
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
                <OptimizedImage
                  src="/landing/landing%20page%20mock.png"
                  alt="FarmVault farm management system dashboard on desktop, tablet and mobile"
                  className="relative z-10 w-[20rem] md:w-[26rem] lg:w-[30rem] xl:w-[34rem] drop-shadow-2xl animate-float"
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
