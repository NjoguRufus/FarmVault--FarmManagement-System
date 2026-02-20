import { Shield, Mail, Phone, MapPin, ArrowUpRight } from "lucide-react";

const footerLinks = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

const Footer = () => {
  return (
    <footer className="bg-foreground relative overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_hsl(145_63%_22%_/_0.08),_transparent_60%)]" />

      <div className="container mx-auto px-4 lg:px-8 relative">
        {/* Main footer */}
        <div className="py-16 grid md:grid-cols-12 gap-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="gradient-primary rounded-xl p-2">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold text-primary-foreground">FarmVault</span>
            </div>
            <p className="text-sm text-primary-foreground/50 font-body leading-relaxed max-w-xs font-light">
              The all-in-one farm management system built for African farmers. Empowering agriculture through technology.
            </p>
          </div>

          {/* Links */}
          <div className="md:col-span-3">
            <h4 className="font-display font-bold text-primary-foreground mb-5 text-sm tracking-wide uppercase">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {footerLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-primary-foreground/50 hover:text-primary-foreground transition-colors duration-200 font-body flex items-center gap-1 group"
                  >
                    {l.label}
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-4">
            <h4 className="font-display font-bold text-primary-foreground mb-5 text-sm tracking-wide uppercase">
              Contact Us
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-primary-foreground/50 font-body">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/5 flex items-center justify-center">
                  <Phone className="h-3.5 w-3.5 text-primary-foreground/60" />
                </div>
                +254 700 123 456
              </li>
              <li className="flex items-center gap-3 text-sm text-primary-foreground/50 font-body">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/5 flex items-center justify-center">
                  <Mail className="h-3.5 w-3.5 text-primary-foreground/60" />
                </div>
                hello@farmvault.co.ke
              </li>
              <li className="flex items-center gap-3 text-sm text-primary-foreground/50 font-body">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/5 flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5 text-primary-foreground/60" />
                </div>
                Nairobi, Kenya
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-primary-foreground/8 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-primary-foreground/30 font-body">
            © {new Date().getFullYear()} FarmVault. All rights reserved.
          </p>
          <div className="flex gap-6">
            {["Privacy", "Terms", "Cookies"].map((item) => (
              <a key={item} href="#" className="text-xs text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors font-body">
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
