import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppAuthUrl } from "@/lib/urls/domains";

type NavLink =
  | { name: string; href: string; type: "anchor" }
  | { name: string; to: string; type: "route" };

const navLinks: NavLink[] = [
  { name: "How you earn", href: "#how-you-earn", type: "anchor" },
  { name: "Income", href: "#income-potential", type: "anchor" },
  { name: "Trust", href: "#trust", type: "anchor" },
  { name: "Learn FarmVault", to: "/ambassador/learn", type: "route" },
];

export function AmbassadorLandingNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const loginHref = getAppAuthUrl("sign-in");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleAnchorClick = (href: string) => {
    setOpen(false);
    if (location.pathname !== "/ambassador") {
      navigate(`/ambassador${href}`);
      return;
    }
    const id = href.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const linkClass = "text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]";

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 border-b border-[#D8B980]/35 bg-[#1f2c23]/95 transition-all ${
        scrolled ? "py-2" : "py-3"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 lg:px-8">
        <Link to="/ambassador" className="flex items-center gap-2.5">
          <img
            src="/Logo/fv.png"
            alt="FarmVault"
            className="h-8 w-auto rounded-md object-contain"
          />
        </Link>

        {/* Desktop nav */}
        <ul className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <li key={link.name}>
              {link.type === "route" ? (
                <Link to={link.to} className={linkClass}>
                  {link.name}
                </Link>
              ) : (
                <a
                  href={location.pathname === "/ambassador" ? link.href : `/ambassador${link.href}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleAnchorClick(link.href);
                  }}
                  className={linkClass}
                >
                  {link.name}
                </a>
              )}
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="font-medium text-zinc-100 hover:bg-white/15 hover:text-zinc-100"
          >
            <a href={loginHref}>Login</a>
          </Button>
          <Button
            size="sm"
            asChild
            className="rounded-md bg-[#D8B980] px-4 font-semibold text-black hover:bg-[#c9aa74]"
          >
            <Link to="/ambassador/signup">Become Ambassador</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="text-zinc-100 transition-colors lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
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
                      to={link.to}
                      className="text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]"
                      onClick={() => setOpen(false)}
                    >
                      {link.name}
                    </Link>
                  ) : (
                    <a
                      href={location.pathname === "/ambassador" ? link.href : `/ambassador${link.href}`}
                      className="text-sm font-medium text-zinc-200 transition-colors hover:text-[#D8B980]"
                      onClick={(e) => {
                        e.preventDefault();
                        handleAnchorClick(link.href);
                      }}
                    >
                      {link.name}
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" asChild className="flex-1 rounded-md border-zinc-700 bg-transparent text-zinc-200">
                <a href={loginHref} onClick={() => setOpen(false)}>Login</a>
              </Button>
              <Button size="sm" asChild className="flex-1 rounded-md bg-[#D8B980] font-semibold text-black hover:bg-[#c9aa74]">
                <Link to="/ambassador/signup" onClick={() => setOpen(false)}>Become Ambassador</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
