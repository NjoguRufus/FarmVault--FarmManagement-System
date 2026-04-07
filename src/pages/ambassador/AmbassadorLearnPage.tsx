import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AmbassadorLandingNavbar } from "@/components/landing/AmbassadorLandingNavbar";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { AmbassadorLearnDashboard } from "@/components/ambassador/AmbassadorLearnDashboard";

export default function AmbassadorLearnPage() {
  return (
    <div className="landing-page dark min-h-screen font-body relative overflow-hidden text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <OptimizedImage
          src="/landing/hero-bg.jpg"
          webpSrc="/landing/hero-bg.webp"
          priority
          alt=""
          className="h-full w-full min-h-[100vh] object-cover scale-110 blur-md opacity-90"
        />
        <div className="absolute inset-0 gradient-hero-overlay" />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[hsl(150_32%_6%/0.88)] via-[hsl(150_28%_8%/0.78)] to-[hsl(150_30%_5%/0.92)]"
          style={{ boxShadow: "inset 0 0 100px rgba(0,0,0,0.45), inset 0 -80px 120px rgba(0,0,0,0.35)" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_70%_0%,hsl(45_50%_35%/0.12),transparent_55%)]" />
      </div>

      <AmbassadorLandingNavbar />

      <main className="relative z-10 pt-28 pb-20 md:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-6xl"
        >
          <AmbassadorLearnDashboard />
        </motion.div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.1] bg-[hsl(150_32%_5%/0.85)] backdrop-blur-md">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-6xl py-8 md:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs md:text-sm text-foreground/80 font-light text-center sm:text-left order-2 sm:order-1">
              © 2025 FarmVault Ltd. Nairobi, Kenya.
            </p>
            <nav
              className="flex flex-wrap items-center justify-center gap-6 sm:justify-end order-1 sm:order-2"
              aria-label="Legal and support"
            >
              <Link
                to="/ambassador"
                className="text-xs md:text-sm font-medium text-foreground/85 hover:text-foreground transition-colors"
              >
                Ambassador Program
              </Link>
              <Link
                to="/support"
                className="text-xs md:text-sm font-medium text-foreground/85 hover:text-foreground transition-colors"
              >
                Support
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
