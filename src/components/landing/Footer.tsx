import { Mail, Phone, MapPin } from "lucide-react";
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
    <footer className="border-t border-[#D8B980]/35 bg-[#1f2c23]">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="py-16 grid md:grid-cols-12 gap-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-5">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault"
                className="h-8 w-auto rounded-md object-contain"
              />
              <span className="font-semibold text-xl text-zinc-100">Farm<span className="text-[#D8B980]">Vault</span></span>
            </div>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">
              <span className="text-[#D8B980]">Farm Management</span> System in Africa
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-300">
              Built for farmers, farm managers, and agribusinesses handling real farm operations and money.
            </p>
          </div>

          <div className="md:col-span-3">
            <h4 className="mb-5 text-sm font-bold uppercase tracking-wide text-zinc-100">
              Pages
            </h4>
            <ul className="space-y-3">
              {footerLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.href}
                    className="text-sm text-zinc-300 transition-colors duration-200 hover:text-[#D8B980]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-4">
            <h4 className="mb-5 text-sm font-bold uppercase tracking-wide text-zinc-100">
              Contact
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-8 h-8 rounded-lg bg-[#2c3b30] flex items-center justify-center">
                  <Phone className="h-3.5 w-3.5 text-[#D8B980]" />
                </div>
                <a href="tel:+254714748299" className="transition-colors hover:text-white">0714 748299</a>
              </li>
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-8 h-8 rounded-lg bg-[#2c3b30] flex items-center justify-center">
                  <Mail className="h-3.5 w-3.5 text-[#D8B980]" />
                </div>
                <a href="mailto:hello@farmvault.africa" className="transition-colors hover:text-white">
                  hello@farmvault.africa
                </a>
              </li>
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-8 h-8 rounded-lg bg-[#2c3b30] flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5 text-[#D8B980]" />
                </div>
                Nairobi, Kenya
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#D8B980]/25 py-6 md:flex-row">
          <p className="text-xs text-zinc-400">
            © {new Date().getFullYear()} FarmVault. Farm management system.
          </p>
          <div className="flex gap-6">
            <Link to="/terms" className="text-xs text-zinc-400 transition-colors hover:text-white">
              Terms &amp; Conditions
            </Link>
            <Link to="/privacy" className="text-xs text-zinc-400 transition-colors hover:text-white">
              Privacy Policy
            </Link>
            <Link to="/refund" className="text-xs text-zinc-400 transition-colors hover:text-white">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
