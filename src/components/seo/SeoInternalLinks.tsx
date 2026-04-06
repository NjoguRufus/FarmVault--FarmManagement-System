import { Link } from "react-router-dom";
import { SEO_ROUTES } from "@/seo/routes";
import { LEARN_HUB_PATH } from "@/data/learnTopics";

const links = [
  { to: SEO_ROUTES.home, label: "Home" },
  { to: SEO_ROUTES.features, label: "Features" },
  { to: SEO_ROUTES.pricing, label: "Pricing" },
  { to: LEARN_HUB_PATH, label: "Learn" },
] as const;

export function SeoInternalLinks() {
  return (
    <nav
      aria-label="Explore FarmVault"
      className="not-prose mt-12 rounded-xl border border-border bg-muted/20 p-6"
    >
      <h2 className="text-base font-semibold text-foreground mb-3">Explore FarmVault</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {links.map(({ to, label }) => (
          <li key={to}>
            <Link to={to} className="text-primary hover:underline font-medium">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
