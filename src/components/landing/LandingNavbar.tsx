import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppAuthUrl, buildUrl, getAppBaseUrl, isPublicProductionHost } from "@/lib/urls/domains";
import { useAuth } from "@/contexts/AuthContext";

const navLinks = [
  { name: "Product", href: "/#product-proof", type: "anchor" },
  { name: "Features", href: "/#practical-features", type: "anchor" },
  { name: "Trust", href: "/#trust", type: "anchor" },
  { name: "Learn", href: "/learn", type: "route" },
  { name: "Pricing", href: "/pricing", type: "route" },
] as const;

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { isAuthenticated, authReady } = useAuth();

  const showOpenDashboard = isPublicProductionHost() && authReady && isAuthenticated;
  const dashboardHref = buildUrl(getAppBaseUrl(), "/dashboard");
  const loginHref = getAppAuthUrl("sign-in");
  const signUpHref = getAppAuthUrl("sign-up");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = (link: typeof navLinks[number]) => {
    setOpen(false);
    if (link.type === "anchor" && location.pathname === "/") {
      const id = link.href.replace("/#", "");
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 border-b border-[#D8B980]/35 bg-[#1f2c23]/95 transition-all ${
        scrolled ? "py-2" : "py-3"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="/Logo/fv.png"
            alt="FarmVault"
            className="h-8 w-auto rounded-md object-contain"
          />
        </Link>

        <ul className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <li key={link.name}>
              {link.type === "route" ? (
                <Link
                  to={link.href}
                  className="text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]"
                >
                  {link.name}
                </Link>
              ) : (
                <a
                  href={link.href}
                  onClick={() => handleNavClick(link)}
                  className="text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]"
                >
                  {link.name}
                </a>
              )}
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {showOpenDashboard ? (
            <Button size="sm" asChild className="rounded-md bg-[#D8B980] px-4 font-semibold text-black hover:bg-[#c9aa74]">
              <a href={dashboardHref}>Open Dashboard</a>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="font-medium text-zinc-100 hover:bg-white/15 hover:text-zinc-100">
                <a href={loginHref}>Login</a>
              </Button>
              <Button size="sm" asChild className="rounded-md bg-[#D8B980] px-4 font-semibold text-black hover:bg-[#c9aa74]">
                <a href={signUpHref}>Start Free</a>
              </Button>
            </>
          )}
        </div>

        <button type="button" className="text-zinc-100 transition-colors lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="mx-4 mt-2 overflow-hidden rounded-xl border border-[#D8B980]/35 bg-[#263126] lg:hidden">
          <div className="p-5">
            <ul className="mb-5 flex flex-col gap-4">
              {navLinks.map((link) => (
                <li key={link.name}>
                  {link.type === "route" ? (
                    <Link
                      to={link.href}
                      className="text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]"
                      onClick={() => setOpen(false)}
                    >
                      {link.name}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      className="text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]"
                      onClick={() => handleNavClick(link)}
                    >
                      {link.name}
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              {showOpenDashboard ? (
                <Button size="sm" asChild className="flex-1 rounded-md bg-[#D8B980] font-semibold text-black hover:bg-[#c9aa74]">
                  <a href={dashboardHref} onClick={() => setOpen(false)}>Open Dashboard</a>
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" asChild className="flex-1 rounded-md border-zinc-700 bg-transparent text-zinc-200">
                    <a href={loginHref} onClick={() => setOpen(false)}>Login</a>
                  </Button>
                  <Button size="sm" asChild className="flex-1 rounded-md bg-[#D8B980] font-semibold text-black hover:bg-[#c9aa74]">
                    <a href={signUpHref} onClick={() => setOpen(false)}>Start Free</a>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
