import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";

type CropId = "frenchbeans" | "tomatoes" | "capsicum" | "maize" | "rice";

type CropJourney = {
  id: CropId;
  label: string;
  emoji: string;
  headline: string;
  problem: string;
  intro: string;
  steps: string[];
  cta: string;
};

const STORAGE_KEY = "farmvault_scan_crop";
const QUERY_KEY = "crop";
const BRAND = {
  name: "FarmVault",
  logoSrc: "/Logo/FarmVault_Logo dark mode.png",
  logoAlt: "FarmVault",
};

const CROPS: CropJourney[] = [
  {
    id: "frenchbeans",
    label: "French Beans",
    emoji: "🌱",
    headline: "French Beans — from planning to harvest, keep everything clear.",
    problem: "Weights, picker records, and payments can easily get confusing.",
    intro: "With FarmVault, you can:",
    steps: [
      "Plan your season and farm activities",
      "Track pickers and daily work",
      "Record harvest weights clearly",
      "Know what each picker should be paid",
      "Keep all records safe and easy to check",
    ],
    cta: "Start managing your farm with FarmVault",
  },
  {
    id: "tomatoes",
    label: "Tomatoes",
    emoji: "🍅",
    headline: "Tomatoes — from planting to harvest, stay in control.",
    problem: "Farm work and spending can become hard to follow over time.",
    intro: "With FarmVault, you can:",
    steps: [
      "Plan your season well",
      "Track farm work as it happens",
      "Record harvest clearly",
      "Monitor your spending",
      "See your farm data from anywhere",
    ],
    cta: "Start managing your farm with FarmVault",
  },
  {
    id: "capsicum",
    label: "Capsicum (Hoho)",
    emoji: "🌶️",
    headline: "Capsicum — from planning to harvest, keep your farm organized.",
    problem: "When records are not clear, decisions become slower and harder.",
    intro: "With FarmVault, you can:",
    steps: [
      "Plan key stages before work begins",
      "Track daily farm activities and labor",
      "Record harvest in one clear place",
      "Keep worker and expense records together",
      "Check farm progress quickly at any time",
    ],
    cta: "Start managing your farm with FarmVault",
  },
  {
    id: "maize",
    label: "Maize",
    emoji: "🌽",
    headline: "Maize — from planting to harvest, keep track of work and costs.",
    problem: "It is easy to lose track of costs and daily progress in a long season.",
    intro: "With FarmVault, you can:",
    steps: [
      "Plan the season from the start",
      "Track field activities as work is done",
      "Record harvest and storage details",
      "Keep costs and payments clear",
      "See progress and make better next-step decisions",
    ],
    cta: "Start managing your farm with FarmVault",
  },
  {
    id: "rice",
    label: "Rice",
    emoji: "🌾",
    headline: "Rice — from planning to harvest, stay organized at every stage.",
    problem: "When many activities overlap, records can quickly become messy.",
    intro: "With FarmVault, you can:",
    steps: [
      "Plan important farm stages early",
      "Track daily work and workers clearly",
      "Record harvest and weights in one place",
      "Keep expense and payment records accurate",
      "Stay organized and avoid missing records",
    ],
    cta: "Start managing your farm with FarmVault",
  },
];

const cropLabelById = new Map(CROPS.map((crop) => [crop.id, crop.label]));

function normalizeCropParam(raw: string | null): CropId | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const normalized = v.replace(/\s+/g, "").replace(/_/g, "").replace(/-/g, "");
  const aliasToId: Record<string, CropId> = {
    frenchbeans: "frenchbeans",
    frenchbean: "frenchbeans",
    tomatoes: "tomatoes",
    tomato: "tomatoes",
    capsicum: "capsicum",
    hoho: "capsicum",
    maize: "maize",
    rice: "rice",
  };
  return aliasToId[normalized] ?? null;
}

function getSignupHref(cropId: CropId | null): string {
  if (!cropId) return "/signup";
  return `/signup?${new URLSearchParams({ [QUERY_KEY]: cropId }).toString()}`;
}

function CropSelector({
  selected,
  onSelect,
}: {
  selected: CropId | null;
  onSelect: (crop: CropId | null) => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-primary-foreground/65">What do you farm?</h2>
        <button
          type="button"
          className="text-xs font-semibold text-[#D8B980]/80 hover:text-[#D8B980] transition-colors"
          onClick={() => onSelect(null)}
        >
          All farmers
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {CROPS.map((crop, index) => {
          const active = selected === crop.id;
          return (
            <motion.button
              key={crop.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(crop.id)}
              initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.03, ease: "easeOut" }}
              whileHover={reducedMotion ? undefined : { y: -2, scale: 1.01 }}
              whileTap={reducedMotion ? undefined : { scale: 0.985 }}
              className={[
                "rounded-2xl border px-4 py-4 text-left transition-all duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B980]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/0",
                active
                  ? "border-[#D8B980]/65 bg-[linear-gradient(145deg,rgba(24,41,32,0.95),rgba(15,29,22,0.9))] shadow-[0_0_24px_rgba(216,185,128,0.2)]"
                  : "border-white/12 bg-[linear-gradient(145deg,rgba(16,32,24,0.85),rgba(12,24,19,0.8))] hover:border-[#D8B980]/35",
              ].join(" ")}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{crop.emoji}</span>
                  <span className="text-sm font-semibold text-primary-foreground">{crop.label}</span>
                </span>
                {active ? (
                  <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-[#D8B980]" />
                ) : (
                  <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-white/20" />
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

function CropJourneySection({ cropId }: { cropId: CropId | null }) {
  const reducedMotion = useReducedMotion();
  const data = cropId ? CROPS.find((crop) => crop.id === cropId) : null;
  const signupHref = getSignupHref(cropId);

  return (
    <section className="mt-9" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={cropId ?? "default"}
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: reducedMotion ? 0 : 0.35, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[28px] border border-[#D8B980]/25 bg-[linear-gradient(155deg,rgba(16,33,25,0.94),rgba(10,20,16,0.92)_55%,rgba(20,31,24,0.9))] p-6 shadow-[0_0_30px_rgba(216,185,128,0.12)] backdrop-blur-md sm:p-8"
        >
          <div className="pointer-events-none absolute -top-20 right-0 h-40 w-40 rounded-full bg-[#D8B980]/15 blur-3xl" />

          {!data ? (
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-primary-foreground">
                From planning to harvest, FarmVault helps you stay in control.
              </h3>
              <p className="mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-primary-foreground/80">
                Use one simple system to plan your season, track daily work, record harvest, manage worker payments,
                track expenses, and keep records clear even when you are away from the farm.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  asChild
                  className="h-13 rounded-2xl bg-[#D8B980] px-6 text-base font-semibold text-black hover:bg-[#D8B980]/90"
                >
                  <Link to={signupHref}>
                    <span className="inline-flex items-center">
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  asChild
                  className="h-13 rounded-2xl border border-[#D8B980]/45 px-6 text-base text-primary-foreground hover:border-[#D8B980]/80 hover:bg-[#D8B980]/10"
                >
                  <Link to="/login">Login</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-primary-foreground">
                {data.headline}
              </h3>
              <p className="mt-3 text-sm sm:text-base text-primary-foreground/80">{data.problem}</p>
              <p className="mt-5 text-sm font-semibold text-[#D8B980]">{data.intro}</p>

              <ul className="mt-3 space-y-3">
                {data.steps.map((step) => (
                  <li key={step} className="flex items-start gap-3 text-sm sm:text-base text-primary-foreground/85">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B980]" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <Button
                  size="lg"
                  asChild
                  className="h-13 rounded-2xl bg-[#D8B980] px-6 text-base font-semibold text-black hover:bg-[#D8B980]/90"
                >
                  <Link to={signupHref}>
                    <span className="inline-flex items-center">
                      {data.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

export default function ScanPage() {
  const reducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCrop, setSelectedCrop] = useState<CropId | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const dynamicSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (hydrated) return;
    const paramCrop = normalizeCropParam(searchParams.get(QUERY_KEY));
    if (paramCrop) {
      setSelectedCrop(paramCrop);
      setHydrated(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setSelectedCrop(normalizeCropParam(stored));
    } catch {
      setSelectedCrop(null);
    } finally {
      setHydrated(true);
    }
  }, [hydrated, searchParams]);

  useEffect(() => {
    if (!hydrated) return;
    const next = new URLSearchParams(searchParams);
    if (selectedCrop) next.set(QUERY_KEY, selectedCrop);
    else next.delete(QUERY_KEY);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    try {
      if (selectedCrop) window.localStorage.setItem(STORAGE_KEY, selectedCrop);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, [selectedCrop, hydrated, searchParams, setSearchParams]);

  const handleSelectCrop = (crop: CropId | null) => {
    setSelectedCrop(crop);
    if (!crop || typeof window === "undefined") return;
    if (window.innerWidth > 768) return;
    window.setTimeout(() => {
      dynamicSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <>
      <SeoHead
        title="FarmVault Scan"
        description="Farmers — this is for you. Choose your crop and start managing your farm with clear records from planning to harvest."
        canonical="/scan"
        noindex
      />

      <div className="landing-page min-h-screen overflow-hidden bg-fv-green-dark text-primary-foreground">
        <div className="relative">
          <div className="absolute inset-0 gradient-hero-overlay opacity-80" aria-hidden="true" />
          <motion.div
            aria-hidden="true"
            className="absolute -top-20 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-[90px]"
            animate={reducedMotion ? undefined : { opacity: [0.45, 0.78, 0.45] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#D8B980]/12 blur-[110px]"
            animate={reducedMotion ? undefined : { opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="container relative z-10 mx-auto px-4 pb-14 pt-10 lg:px-8">
            <header className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2.5">
                <img src={BRAND.logoSrc} alt={BRAND.logoAlt} className="h-9 w-auto rounded-md object-contain" />
                <span className="text-lg font-semibold tracking-tight text-primary-foreground">{BRAND.name}</span>
              </Link>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-primary-foreground/70 sm:block">
                {selectedCrop ? `Selected: ${cropLabelById.get(selectedCrop)}` : "For all farmers"}
              </span>
            </header>

            <main className="mt-8">
              <motion.section
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.42, ease: "easeOut" }}
              >
                <h1 className="text-3xl font-extrabold leading-[1.06] tracking-tight text-primary-foreground sm:text-4xl">
                  Farmers — this is for you.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
                  FarmVault helps you manage your farm from planning to harvest. Keep records clear, track workers,
                  harvest, expenses, payments, and reduce mistakes.
                </p>

                <CropSelector selected={selectedCrop} onSelect={handleSelectCrop} />
              </motion.section>

              <div ref={dynamicSectionRef}>
                <CropJourneySection cropId={selectedCrop} />
              </div>

              <section className="mt-8">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {["Track harvest", "Manage workers", "Record expenses", "Reduce data loss"].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-primary-foreground/85"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <footer className="mt-8">
                <div className="rounded-3xl border border-[#D8B980]/20 bg-[linear-gradient(145deg,rgba(15,30,23,0.9),rgba(9,18,14,0.88))] p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-primary-foreground">Ready to start?</h3>
                      <p className="mt-1 text-sm text-primary-foreground/75">Get started with the system in minutes.</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        asChild
                        className="h-13 rounded-2xl bg-[#D8B980] px-6 text-base font-semibold text-black hover:bg-[#D8B980]/90"
                      >
                        <Link to={getSignupHref(selectedCrop)}>Get Started</Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        className="h-13 rounded-2xl border border-[#D8B980]/45 px-6 text-base text-primary-foreground hover:border-[#D8B980]/80 hover:bg-[#D8B980]/10"
                      >
                        <Link to="/login">Login</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </footer>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

