import { Shield, Mail, Phone, MapPin, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Learn", href: "/learn" },
  { label: "FAQ", href: "/faq" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "What is FarmVault", href: "/what-is-farmvault" },
  { label: "Farm Management Software Kenya", href: "/farm-management-software-kenya" },
  { label: "Agriculture Software Kenya", href: "/agriculture-software-kenya" },
  { label: "Crop Guides", href: "/crop-guides" },
  { label: "Farm Calculators", href: "/farm-calculators" },
  { label: "Contact", href: "/#contact" },
];

export function Footer() {
  return (
    <footer className="bg-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_hsl(145_63%_22%_/_0.08),_transparent_60%)]" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="py-16 grid md:grid-cols-12 gap-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="gradient-primary rounded-xl p-2">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-xl text-primary-foreground">FarmVault</span>
            </div>
            <h2 className="text-base font-semibold text-primary-foreground mb-3">
              Farm Management System in Africa
            </h2>
            <p className="text-sm text-primary-foreground/50 leading-relaxed max-w-sm font-light">
              Track harvest, labor, inventory, and expenses with a modern farm management system built for African farmers.
            </p>
          </div>

          <div className="md:col-span-3">
            <h4 className="font-bold text-primary-foreground mb-5 text-sm tracking-wide uppercase">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {footerLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.href}
                    className="text-sm text-primary-foreground/50 hover:text-primary-foreground transition-colors duration-200 flex items-center gap-1 group"
                  >
                    {l.label}
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-4">
            <h4 className="font-bold text-primary-foreground mb-5 text-sm tracking-wide uppercase">
              Contact Us
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-primary-foreground/50">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/5 flex items-center justify-center">
                  <Phone className="h-3.5 w-3.5 text-primary-foreground/60" />
                </div>
                <a href="tel:+254714748299" className="hover:text-primary-foreground transition-colors">0714 748299</a>
              </li>
              <li className="flex items-center gap-3 text-sm text-primary-foreground/50">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/5 flex items-center justify-center">
                  <Mail className="h-3.5 w-3.5 text-primary-foreground/60" />
                </div>
                <a href="mailto:hello@farmvault.africa" className="hover:text-primary-foreground transition-colors">
                  hello@farmvault.africa
                </a>
              </li>
              <li className="flex items-center gap-3 text-sm text-primary-foreground/50">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/5 flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5 text-primary-foreground/60" />
                </div>
                Nairobi, Kenya
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/8 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-primary-foreground/30">
            © {new Date().getFullYear()} FarmVault. Smart Farm Management for Africa.
          </p>
          <div className="flex gap-6">
            <Link to="/terms" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">
              Terms &amp; Conditions
            </Link>
            <Link to="/privacy" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/refund" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
