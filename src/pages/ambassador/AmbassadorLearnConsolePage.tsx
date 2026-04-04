/**
 * In-app Learn FarmVault page — rendered inside AmbassadorLayout (/ambassador/console/learn).
 * Same educational content as the public /ambassador/learn page but without the landing
 * shell (no AmbassadorLandingNavbar, no hero background, no footer).
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sprout,
  DollarSign,
  Package,
  BarChart3,
  Tractor,
  Users,
  Building2,
  UserCheck,
  Wheat,
  Copy,
  ArrowRight,
  BookOpen,
  MessageSquareQuote,
  Repeat2,
  UserPlus,
  Gift,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const neuGlass =
  "rounded-lg border border-white/[0.12] bg-[hsl(150_28%_8%/0.45)] backdrop-blur-md " +
  "shadow-[6px_8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.1)]";

const neuGlassCard =
  "rounded-lg border border-white/[0.1] bg-[hsl(150_26%_10%/0.42)] backdrop-blur-lg " +
  "shadow-[5px_6px_22px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)]";

const iconBox =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] " +
  "bg-[hsl(150_22%_14%/0.55)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),2px_3px_10px_rgba(0,0,0,0.25)]";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-32px" },
  transition: { delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground/40 mb-2">
      {children}
    </p>
  );
}

const features = [
  { icon: Sprout, label: "Crop stage tracking" },
  { icon: DollarSign, label: "Expense tracking" },
  { icon: Package, label: "Inventory management" },
  { icon: Wheat, label: "Harvest tracking" },
  { icon: BarChart3, label: "Analytics & insights" },
];

const targets = [
  { icon: Tractor, label: "Commercial farmers" },
  { icon: Building2, label: "Greenhouse farmers" },
  { icon: UserCheck, label: "Agribusiness managers" },
  { icon: Users, label: "Farm supervisors" },
  { icon: Wheat, label: "Large-scale crop farmers" },
];

const pitchLines = [
  "\"FarmVault helps you track your farm operations and know your real profit.\"",
  "\"Instead of using notebooks, you can manage everything digitally.\"",
  "\"You'll see exactly where your money goes and which crops are most profitable.\"",
];

export default function AmbassadorLearnConsolePage() {
  return (
    <div className="space-y-10 md:space-y-14 pb-10 text-primary-foreground">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`${neuGlass} p-6 md:p-8`}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className={iconBox}>
            <BookOpen className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
          </div>
          <span className="inline-flex items-center rounded-lg border border-[hsl(var(--gold)/0.35)] bg-[hsl(150_25%_12%/0.5)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light">
            Ambassador guide
          </span>
        </div>
        <h1 className="font-extrabold tracking-tight text-2xl sm:text-3xl leading-tight mb-2">
          Learn FarmVault
        </h1>
        <p className="text-sm text-primary-foreground/65 max-w-lg leading-relaxed font-light">
          Understand FarmVault so you can confidently introduce it to farmers.
        </p>
      </motion.div>

      {/* Section 1: What is FarmVault */}
      <section aria-labelledby="what-is-heading">
        <motion.div {...fadeUp(0)}>
          <SectionLabel>Section 1</SectionLabel>
          <h2 id="what-is-heading" className="text-lg md:text-xl font-bold tracking-tight mb-4">
            What is FarmVault?
          </h2>
        </motion.div>
        <motion.div {...fadeUp(0.05)} className={`${neuGlass} p-5 md:p-7`}>
          <p className="text-sm text-primary-foreground/75 leading-relaxed mb-5">
            FarmVault is a farm management platform that helps farmers run their operations
            digitally — replacing notebooks and guesswork with accurate, real-time data.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {["Crops", "Expenses", "Operations", "Inventory", "Harvest", "Profits"].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-[hsl(150_22%_12%/0.5)] px-3 py-2 text-sm font-medium text-primary-foreground/80"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-light/80" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* Section 2: Who to target */}
      <section aria-labelledby="targets-heading">
        <motion.div {...fadeUp(0)}>
          <SectionLabel>Section 2</SectionLabel>
          <h2 id="targets-heading" className="text-lg md:text-xl font-bold tracking-tight mb-4">
            Who should you target?
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {targets.map((item, i) => (
            <motion.div key={item.label} {...fadeUp(i * 0.04)} className={`${neuGlassCard} p-4 flex items-center gap-4`}>
              <div className={iconBox}>
                <item.icon className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
              </div>
              <span className="text-sm font-medium text-primary-foreground/85">{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Section 3: Key features */}
      <section aria-labelledby="features-heading">
        <motion.div {...fadeUp(0)}>
          <SectionLabel>Section 3</SectionLabel>
          <h2 id="features-heading" className="text-lg md:text-xl font-bold tracking-tight mb-4">
            Key features to mention
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {features.map((item, i) => (
            <motion.article key={item.label} {...fadeUp(i * 0.04)} className={`${neuGlassCard} p-4 flex items-center gap-4`}>
              <div className={iconBox}>
                <item.icon className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
              </div>
              <span className="text-sm font-medium text-primary-foreground/85">{item.label}</span>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Section 4: How to pitch */}
      <section aria-labelledby="pitch-heading">
        <motion.div {...fadeUp(0)}>
          <SectionLabel>Section 4</SectionLabel>
          <h2 id="pitch-heading" className="text-lg md:text-xl font-bold tracking-tight mb-4">
            How to pitch FarmVault
          </h2>
        </motion.div>
        <motion.div {...fadeUp(0.05)} className={`${neuGlass} p-5 md:p-7 space-y-4`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={iconBox}>
              <MessageSquareQuote className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/45">
              Sample script
            </p>
          </div>
          {pitchLines.map((line) => (
            <blockquote
              key={line}
              className="border-l-2 border-[hsl(var(--gold)/0.4)] pl-4 text-sm text-primary-foreground/80 italic leading-relaxed"
            >
              {line}
            </blockquote>
          ))}
        </motion.div>
      </section>

      {/* Section 5: Commission reminder */}
      <section aria-labelledby="commission-heading">
        <motion.div {...fadeUp(0)}>
          <SectionLabel>Section 5</SectionLabel>
          <h2 id="commission-heading" className="text-lg md:text-xl font-bold tracking-tight mb-4">
            Your commission
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <motion.div {...fadeUp(0)} className={`${neuGlassCard} p-5 md:p-6 flex items-center gap-4`}>
            <div className={iconBox}>
              <Gift className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-gold-light">KES 200</p>
              <p className="text-xs font-medium text-primary-foreground/50 mt-0.5">welcome signup bonus</p>
            </div>
          </motion.div>
          <motion.div {...fadeUp(0.05)} className={`${neuGlassCard} p-5 md:p-6 flex items-center gap-4`}>
            <div className={iconBox}>
              <UserPlus className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-gold-light">KES 600</p>
              <p className="text-xs font-medium text-primary-foreground/50 mt-0.5">per farmer signup</p>
            </div>
          </motion.div>
          <motion.div {...fadeUp(0.1)} className={`${neuGlassCard} p-5 md:p-6 flex items-center gap-4`}>
            <div className={iconBox}>
              <Repeat2 className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-primary-foreground/90">KES 400</p>
              <p className="text-xs font-medium text-primary-foreground/50 mt-0.5">monthly recurring</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <motion.section
        {...fadeUp(0)}
        aria-labelledby="cta-heading"
        className={`${neuGlass} p-6 md:p-8 text-center`}
      >
        <h2 id="cta-heading" className="text-lg md:text-xl font-bold tracking-tight mb-2">
          Ready to start referring?
        </h2>
        <p className="text-sm text-primary-foreground/60 font-light max-w-md mx-auto leading-relaxed mb-6">
          Grab your referral link and start earning.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            className="rounded-lg h-11 px-6 font-semibold border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-95 transition-opacity shadow-[0_6px_24px_-4px_hsl(var(--gold)/0.45)]"
          >
            <Link to="/ambassador/console/refer" className="inline-flex items-center gap-2">
              <Copy className="h-4 w-4 shrink-0" aria-hidden />
              Copy Referral Link
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-lg h-11 px-6 font-semibold border-white/20 bg-[hsl(150_25%_10%/0.35)] text-primary-foreground hover:bg-[hsl(150_25%_12%/0.45)]"
          >
            <Link to="/ambassador/console/referrals" className="inline-flex items-center gap-2">
              Go to Referrals
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-lg h-11 px-6 font-semibold border-white/20 bg-[hsl(150_25%_10%/0.35)] text-primary-foreground hover:bg-[hsl(150_25%_12%/0.45)]"
          >
            <Link to="/" className="inline-flex items-center gap-2">
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              View Demo
            </Link>
          </Button>
        </div>
      </motion.section>
    </div>
  );
}
