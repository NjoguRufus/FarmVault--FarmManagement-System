import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { InstallPWAButton } from "@/components/InstallPWAButton";

const navLinks = ["Home", "Features", "How It Works", "Pricing", "About", "Contact"];

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "glass-strong shadow-luxury py-2" : "bg-transparent py-4"}`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault"
            className="h-8 w-auto rounded-md object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className={`font-semibold text-xl tracking-tight transition-colors ${scrolled ? "text-foreground" : "text-primary-foreground"}`}>
            FarmVault
          </span>
        </Link>

        <ul className="hidden lg:flex items-center gap-8">
          {navLinks.map((link, i) => (
            <motion.li key={link} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i + 0.3, duration: 0.4 }}>
              <a href={`#${link.toLowerCase().replace(/ /g, "-")}`} className={`text-sm font-medium transition-colors duration-200 hover:text-primary ${scrolled ? "text-muted-foreground" : "text-primary-foreground/80 hover:text-primary-foreground"}`}>
                {link}
              </a>
            </motion.li>
          ))}
        </ul>

        <div className="hidden lg:flex items-center gap-3">
          <InstallPWAButton
            className={scrolled ? "rounded-xl font-medium" : "rounded-xl font-medium border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"}
          />
          <Button variant="ghost" size="sm" asChild className={scrolled ? "text-foreground hover:text-primary hover:bg-primary/5 font-medium" : "text-primary-foreground/90 hover:text-primary-foreground hover:bg-primary-foreground/10 font-medium"}>
            <Link to="/login">Login</Link>
          </Button>
          <Button size="sm" asChild className="gradient-primary text-primary-foreground btn-luxury rounded-xl px-6 font-semibold">
            <Link to="/choose-plan">Get Started</Link>
          </Button>
        </div>

        <button type="button" className={`lg:hidden transition-colors ${scrolled ? "text-foreground" : "text-primary-foreground"}`} onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="lg:hidden glass-strong overflow-hidden mx-4 mt-2 rounded-2xl">
            <div className="p-6">
              <ul className="flex flex-col gap-4 mb-6">
                {navLinks.map((link) => (
                  <li key={link}>
                    <a href={`#${link.toLowerCase().replace(/ /g, "-")}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors" onClick={() => setOpen(false)}>
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" asChild className="flex-1 rounded-xl">
                  <Link to="/login" onClick={() => setOpen(false)}>Login</Link>
                </Button>
                <Button size="sm" asChild className="gradient-primary text-primary-foreground flex-1 rounded-xl btn-luxury">
                  <Link to="/choose-plan" onClick={() => setOpen(false)}>Get Started</Link>
                </Button>
              </div>
              <InstallPWAButton className="w-full rounded-xl mt-3" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
