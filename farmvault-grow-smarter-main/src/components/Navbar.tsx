import { useState, useEffect } from "react";
import { Menu, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = ["Home", "Features", "How It Works", "Pricing", "About", "Contact"];

const Navbar = () => {
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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-strong shadow-luxury py-2" : "bg-transparent py-4"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="gradient-primary rounded-xl p-2 shadow-glow-green transition-transform duration-300 group-hover:scale-105">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className={`font-display text-xl font-bold tracking-tight transition-colors ${scrolled ? "text-foreground" : "text-primary-foreground"}`}>
            FarmVault
          </span>
        </a>

        {/* Desktop links */}
        <ul className="hidden lg:flex items-center gap-8">
          {navLinks.map((link, i) => (
            <motion.li
              key={link}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.3, duration: 0.4 }}
            >
              <a
                href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                className={`text-sm font-medium transition-colors duration-200 hover:text-primary ${
                  scrolled ? "text-muted-foreground" : "text-primary-foreground/80 hover:text-primary-foreground"
                }`}
              >
                {link}
              </a>
            </motion.li>
          ))}
        </ul>

        {/* Desktop buttons */}
        <div className="hidden lg:flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className={`font-medium transition-colors ${
              scrolled
                ? "text-foreground hover:text-primary hover:bg-primary/5"
                : "text-primary-foreground/90 hover:text-primary-foreground hover:bg-primary-foreground/10"
            }`}
          >
            Login
          </Button>
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground btn-luxury rounded-xl px-6 font-semibold"
          >
            Get Started
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          className={`lg:hidden transition-colors ${scrolled ? "text-foreground" : "text-primary-foreground"}`}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden glass-strong overflow-hidden mx-4 mt-2 rounded-2xl"
          >
            <div className="p-6">
              <ul className="flex flex-col gap-4 mb-6">
                {navLinks.map((link) => (
                  <li key={link}>
                    <a
                      href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="flex-1 rounded-xl border-border text-foreground">
                  Login
                </Button>
                <Button size="sm" className="gradient-primary text-primary-foreground flex-1 rounded-xl btn-luxury">
                  Get Started
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
