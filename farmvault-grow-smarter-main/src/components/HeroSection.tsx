import { Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";
import phoneMockup from "@/assets/phone-mockup.png";

const HeroSection = () => {
  return (
    <section className="relative min-h-[100vh] flex items-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover scale-105" />
        <div className="absolute inset-0 gradient-hero-overlay" />
        {/* Decorative orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-gold/10 rounded-full blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
      </div>

      <div className="container mx-auto px-4 lg:px-8 relative z-10 pt-28 pb-16">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-xl"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="glass-dark inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-primary-glow animate-pulse" />
              <span className="text-xs font-medium text-primary-foreground/80 tracking-wide uppercase">
                Farm Management System
              </span>
            </motion.div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] mb-6 text-primary-foreground tracking-tight">
              Built for Farmers
              <br />
              <span className="text-gradient-gold">to Manage</span> Every
              <br />
              Part of Their Farm
            </h1>

            <p className="text-base md:text-lg text-primary-foreground/70 mb-10 font-body leading-relaxed max-w-md font-light">
              Manage Crops, Operations, Inventory, Expenses & Harvest Sales — all in one powerful system.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground btn-luxury rounded-2xl px-8 h-14 text-base font-semibold"
              >
                Get Started Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="glass-dark text-primary-foreground hover:bg-primary-foreground/10 rounded-2xl px-8 h-14 text-base font-medium"
              >
                <div className="gradient-primary rounded-full p-2 mr-3">
                  <Play className="h-3 w-3 fill-primary-foreground text-primary-foreground" />
                </div>
                Watch Demo
              </Button>
            </div>

            {/* Stats */}
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
                  <p className="text-2xl font-bold text-primary-foreground font-display">{stat.value}</p>
                  <p className="text-xs text-primary-foreground/50 font-body uppercase tracking-wider mt-1">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Phone */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
            className="flex justify-center lg:justify-end"
          >
            <div className="relative">
              {/* Glow rings */}
              <div className="absolute inset-0 -m-12 rounded-full bg-gradient-to-br from-primary/20 to-gold/20 blur-[60px] animate-pulse-glow" />
              <div className="absolute inset-0 -m-6 rounded-full bg-gradient-to-tr from-gold/10 to-primary/10 blur-[40px] animate-pulse-glow" style={{ animationDelay: "1s" }} />
              
              <img
                src={phoneMockup}
                alt="FarmVault dashboard on mobile"
                className="relative z-10 w-72 md:w-80 lg:w-[380px] drop-shadow-2xl animate-float"
              />

              {/* Floating badge */}
              <motion.div
                animate={{ y: [-5, 5, -5] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-8 top-1/3 glass-strong rounded-2xl px-4 py-3 shadow-luxury hidden lg:block"
              >
                <p className="text-xs font-semibold text-foreground">📊 Revenue</p>
                <p className="text-lg font-bold text-gradient-green font-display">KES 806,550</p>
              </motion.div>

              <motion.div
                animate={{ y: [5, -5, 5] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-4 bottom-1/4 glass-strong rounded-2xl px-4 py-3 shadow-luxury hidden lg:block"
              >
                <p className="text-xs font-semibold text-foreground">🌱 Crops Active</p>
                <p className="text-lg font-bold text-gradient-gold font-display">12 Projects</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
