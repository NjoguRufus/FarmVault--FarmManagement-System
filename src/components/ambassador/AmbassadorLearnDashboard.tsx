import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sprout,
  Copy,
  ExternalLink,
  ArrowRight,
  BookOpen,
  MessageSquareQuote,
  Gift,
  CheckCircle2,
  Circle,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AMBASSADOR_LEARN_MODULE_COUNT,
  useAmbassadorLearnProgress,
} from "@/hooks/useAmbassadorLearnProgress";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-32px" },
  transition: { delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
});

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--gold)/0.2)]"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(var(--gold-light))]"
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      />
    </div>
  );
}

type ModuleDef = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const MODULES: ModuleDef[] = [
  {
    id: "what-is",
    title: "What is FarmVault",
    description: "Digital farm operations, less guesswork, clearer profit.",
    icon: BookOpen,
  },
  {
    id: "features",
    title: "Operations & areas",
    description: "Ops, inventory, expenses, harvest, and analytics to mention.",
    icon: Layers,
  },
  {
    id: "pitching",
    title: "Pitching",
    description: "How to open the conversation and what to say.",
    icon: MessageSquareQuote,
  },
  {
    id: "earn",
    title: "Referral & commission",
    description: "Your link, first-payment commission, recurring income, welcome bonus.",
    icon: Gift,
  },
];

const LEARNING_PATH = [
  { step: 1, label: "Overview", target: "learn-module-what-is" },
  { step: 2, label: "Features", target: "learn-module-features" },
  { step: 3, label: "Pitching", target: "learn-module-pitching" },
  { step: 4, label: "Referral", target: "learn-referral" },
  { step: 5, label: "Earnings", target: "learn-module-earn" },
] as const;

const pitchLines = [
  "FarmVault helps you track your farm operations and know your real profit.",
  "Instead of using notebooks, you can manage everything digitally.",
  "You'll see exactly where your money goes and which crops are most profitable.",
];

const targets = [
  "Commercial farmers",
  "Greenhouse farmers",
  "Agribusiness managers",
  "Farm supervisors",
  "Large-scale crop farmers",
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function AmbassadorLearnDashboard() {
  const { toggleComplete, isComplete, done, percent } = useAmbassadorLearnProgress();

  /* text-foreground: in .dark, primary-foreground is dark (for labels on gold) and fails on green/dark UIs. */
  return (
    <div className="space-y-10 md:space-y-12 text-foreground antialiased">
      {/* Hero — flat, no glass shell */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-5"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light">
          Ambassador learning
        </p>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-3">
            <h1 className="font-extrabold tracking-tight text-3xl sm:text-4xl md:text-[2.5rem] leading-tight">
              Learn FarmVault
            </h1>
            <p className="text-base md:text-lg text-foreground/95 leading-relaxed">
              Master the product, pitch with confidence, and grow your ambassador earnings.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => scrollToId("learn-modules-grid")}
            className="shrink-0 rounded-xl h-12 px-8 text-base font-semibold border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-[0.96] transition-opacity shadow-[0_6px_24px_-4px_hsl(var(--gold)/0.45)]"
          >
            Start learning
          </Button>
        </div>
        <div className="max-w-md space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground/90">
            <span>Progress</span>
            <span className="tabular-nums text-gold-light">{percent}%</span>
          </div>
          <ProgressBar value={percent} />
          <p className="text-xs text-foreground/90">
            {done} of {AMBASSADOR_LEARN_MODULE_COUNT} modules done (saved on this device)
          </p>
        </div>
      </motion.header>

      {/* Modules — light cards only */}
      <section aria-labelledby="modules-heading" className="scroll-mt-28">
        <h2 id="modules-heading" className="text-lg font-bold tracking-tight mb-4">
          Modules
        </h2>
        <div
          id="learn-modules-grid"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 scroll-mt-28"
        >
          {MODULES.map((m, i) => {
            const complete = isComplete(m.id);
            return (
              <motion.article
                key={m.id}
                {...fadeUp(i * 0.04)}
                className={cn(
                  "flex flex-col rounded-xl border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold)/0.06)] p-4 md:p-5",
                  "transition-transform duration-200 hover:-translate-y-0.5"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <m.icon className="h-5 w-5 text-gold-light shrink-0" strokeWidth={1.5} aria-hidden />
                  {complete ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gold-light">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Done
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/88">
                      <Circle className="h-3.5 w-3.5" aria-hidden />
                      Open
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold tracking-tight mb-1.5">{m.title}</h3>
                <p className="text-sm text-foreground/95 leading-relaxed flex-1 mb-4">
                  {m.description}
                </p>
                <div className="flex flex-wrap gap-2 mt-auto">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => scrollToId(`learn-module-${m.id}`)}
                    className="rounded-lg font-semibold border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-95"
                  >
                    Start
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleComplete(m.id)}
                    className="rounded-lg text-foreground hover:bg-white/10"
                  >
                    {complete ? "Undo" : "Mark done"}
                  </Button>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* Path — text row, no cards */}
      <nav aria-label="Learning path" className="border-t border-[hsl(var(--gold)/0.2)] pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-light mb-3">
          Learning path
        </p>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
          {LEARNING_PATH.map((s, idx) => (
            <span key={s.step} className="contents">
              {idx > 0 ? (
                <span className="text-foreground/65 px-1" aria-hidden>
                  ·
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => scrollToId(s.target)}
                className="font-medium text-foreground/90 hover:text-gold-light underline-offset-4 hover:underline"
              >
                <span className="text-gold-light tabular-nums">{s.step}.</span> {s.label}
              </button>
            </span>
          ))}
        </div>
      </nav>

      {/* Single reference block — one container */}
      <section
        aria-labelledby="reference-heading"
        className="border-t border-[hsl(var(--gold)/0.2)] pt-10 space-y-10 scroll-mt-24"
      >
        <h2 id="reference-heading" className="text-lg font-bold tracking-tight">
          Reference
        </h2>

        <div id="learn-module-what-is" className="scroll-mt-28 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <h3 className="text-base font-bold">What is FarmVault</h3>
            <Button
              type="button"
              variant={isComplete("what-is") ? "outline" : "default"}
              size="sm"
              onClick={() => toggleComplete("what-is")}
              className={cn(
                "shrink-0 rounded-lg w-fit",
                !isComplete("what-is") &&
                  "border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-95"
              )}
            >
              {isComplete("what-is") ? "Undo done" : "Mark done"}
            </Button>
          </div>
          <p className="text-sm text-foreground/95 leading-relaxed">
            FarmVault is a farm management platform that helps farmers run operations digitally —
            replacing notebooks and guesswork with accurate, real-time data across crops, expenses,
            inventory, harvest, and profit.
          </p>
        </div>

        <div id="learn-module-features" className="scroll-mt-28 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <h3 className="text-base font-bold">Operations, inventory, expenses, harvest & analytics</h3>
            <Button
              type="button"
              variant={isComplete("features") ? "outline" : "default"}
              size="sm"
              onClick={() => toggleComplete("features")}
              className={cn(
                "shrink-0 rounded-lg w-fit",
                !isComplete("features") &&
                  "border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-95"
              )}
            >
              {isComplete("features") ? "Undo done" : "Mark done"}
            </Button>
          </div>
          <p className="text-sm text-foreground/95 leading-relaxed">
            Cover structured field work and crop stages, inputs and stock, every cost category, harvest
            vs revenue, and simple dashboards so decisions use their own farm data — not vanity charts.
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-light pt-2">
            Who to target
          </p>
          <p className="text-sm text-foreground/95">{targets.join(" · ")}</p>
        </div>

        <div id="learn-module-pitching" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <h3 className="text-base font-bold">Pitching & quick script</h3>
            <Button
              type="button"
              variant={isComplete("pitching") ? "outline" : "default"}
              size="sm"
              onClick={() => toggleComplete("pitching")}
              className={cn(
                "shrink-0 rounded-lg w-fit",
                !isComplete("pitching") &&
                  "border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-95"
              )}
            >
              {isComplete("pitching") ? "Undo done" : "Mark done"}
            </Button>
          </div>
          <p className="text-sm text-foreground/95 leading-relaxed">
            Lead with outcomes: less admin, clearer profit, one app. Hi — I work with FarmVault, a simple
            app that helps you run the farm from your phone: crops, expenses, inventory, harvest, and
            profit in one place. FarmVault gives you numbers you can trust so you know what actually
            makes money.
          </p>
          <ul className="space-y-2 border-l-2 border-[hsl(var(--gold)/0.5)] pl-4" id="learn-quick-pitch">
            {pitchLines.map((line) => (
              <li key={line} className="text-sm text-foreground/95 italic leading-relaxed">
                “{line}”
              </li>
            ))}
          </ul>
        </div>

        <div id="learn-referral" className="scroll-mt-28 space-y-2">
          <h3 className="text-base font-bold">Referral basics</h3>
          <p className="text-sm text-foreground/95 leading-relaxed">
            Share your personal ambassador link from the console. Commissions are earned when referred farmers
            complete successful subscription payments — not from signups alone.
          </p>
        </div>

        <div id="learn-module-earn" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <h3 className="text-base font-bold">Commission</h3>
            <Button
              type="button"
              variant={isComplete("earn") ? "outline" : "default"}
              size="sm"
              onClick={() => toggleComplete("earn")}
              className={cn(
                "shrink-0 rounded-lg w-fit",
                !isComplete("earn") &&
                  "border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-95"
              )}
            >
              {isComplete("earn") ? "Undo done" : "Mark done"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-xl font-bold tabular-nums text-gold-light">KES 600</p>
              <p className="text-foreground/90">first farmer payment</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-foreground">KES 500</p>
              <p className="text-foreground/90">monthly per active payer (from next month)</p>
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-gold-light">KES 300</p>
              <p className="text-foreground/90">welcome bonus (unlocks after first farmer payment)</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA — minimal divider */}
      <motion.section
        {...fadeUp(0)}
        aria-labelledby="cta-heading"
        className="border-t border-[hsl(var(--gold)/0.2)] pt-10 text-center space-y-4"
      >
        <Sprout className="h-6 w-6 text-gold-light mx-auto" strokeWidth={1.5} aria-hidden />
        <h2 id="cta-heading" className="text-xl font-bold tracking-tight">
          Ready to start referring?
        </h2>
        <p className="text-sm text-foreground/95 max-w-md mx-auto leading-relaxed">
          Grab your referral link and start earning.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            asChild
            size="lg"
            className="rounded-xl h-12 px-8 text-base font-semibold border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-[0.96] transition-opacity shadow-[0_6px_24px_-4px_hsl(var(--gold)/0.45)]"
          >
            <Link to="/ambassador/console/refer" className="inline-flex items-center gap-2">
              <Copy className="h-4 w-4 shrink-0" aria-hidden />
              Copy Referral Link
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-xl h-12 px-8 text-base font-semibold border-[hsl(var(--gold)/0.35)] bg-transparent text-foreground hover:bg-[hsl(var(--gold)/0.08)]"
          >
            <Link to="/ambassador/console/referrals" className="inline-flex items-center gap-2">
              Go to Referrals
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-xl h-12 px-8 text-base font-semibold border-[hsl(var(--gold)/0.35)] bg-transparent text-foreground hover:bg-[hsl(var(--gold)/0.08)]"
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
