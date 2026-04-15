import { useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { ArrowRight, Banknote, Gift, Loader2, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";
import { AmbassadorLandingNavbar } from "@/components/landing/AmbassadorLandingNavbar";
import { SEO_ROUTES } from "@/seo/routes";
import {
  persistReferralCodeIfEmpty,
  recordReferralSessionOnServer,
} from "@/lib/ambassador/referralPersistence";
import { useAmbassadorAccess } from "@/contexts/AmbassadorAccessContext";
import { useAuth } from "@/contexts/AuthContext";
import { setAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import { fetchMyAmbassadorDashboardStats } from "@/services/ambassadorService";

const cardClass =
  "rounded-2xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-md transition-all duration-300 " +
  "hover:border-[#9DC3E6]/35 hover:shadow-[0_20px_50px_-24px_rgba(157,195,230,0.2)]";

const gold = "#D8B980";
const blue = "#9DC3E6";

function SignedInRoutingLoader({ message }: { message: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#000] text-neutral-200"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-10 w-10 animate-spin text-[#9DC3E6]" aria-hidden />
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
}

export default function AmbassadorLandingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refParam = useMemo(() => searchParams.get("ref"), [searchParams]);
  const { setIsAccessingAmbassador, isAccessingAmbassador, workspaceMode, setWorkspaceMode } = useAmbassadorAccess();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { authReady, user: fvUser } = useAuth();

  useEffect(() => {
    const trimmed = refParam?.trim();
    if (!trimmed) return;
    const stored = persistReferralCodeIfEmpty(trimmed);
    if (stored) recordReferralSessionOnServer(stored);
  }, [refParam]);

  const shouldResolveAmbassadorRoute = useMemo(() => {
    if (!clerkUser || !fvUser) return false;
    const pt = fvUser.profileUserType;
    return (
      isAccessingAmbassador ||
      workspaceMode === "ambassador" ||
      pt === "ambassador" ||
      (pt === "both" && !fvUser.companyId)
    );
  }, [clerkUser, fvUser, isAccessingAmbassador, workspaceMode]);

  useEffect(() => {
    if (!clerkLoaded || !clerkUser) {
      return;
    }
    if (!authReady) return;

    if (!shouldResolveAmbassadorRoute) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const r = await fetchMyAmbassadorDashboardStats();
        if (cancelled) return;
        if (r.ok && r.onboarding_complete) {
          setWorkspaceMode("ambassador");
          navigate("/ambassador/console/dashboard", { replace: true });
          return;
        }
        setWorkspaceMode("ambassador");
        setAmbassadorAccessIntent(true);
        navigate("/ambassador/onboarding", { replace: true });
      } catch {
        if (!cancelled) {
          setWorkspaceMode("ambassador");
          setAmbassadorAccessIntent(true);
          navigate("/ambassador/onboarding", { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, clerkUser, authReady, shouldResolveAmbassadorRoute, navigate, setWorkspaceMode]);

  if (!clerkLoaded) {
    return <SignedInRoutingLoader message="Loading…" />;
  }

  if (clerkUser && !authReady) {
    return <SignedInRoutingLoader message="Preparing your session…" />;
  }

  if (clerkUser && authReady && shouldResolveAmbassadorRoute) {
    return <SignedInRoutingLoader message="Opening ambassador…" />;
  }

  const earnCards = [
    {
      icon: Banknote,
      amount: "KES 600",
      text: "Earn when a farmer makes their first payment",
    },
    {
      icon: Repeat2,
      amount: "KES 500 / month",
      text: "Recurring income for every active paying farmer (starts next month)",
    },
    {
      icon: Gift,
      amount: "KES 300",
      text: "Welcome bonus after your first successful referral payment",
    },
  ] as const;

  const incomeRows = [
    { farmers: "5", monthly: "KES 2,500" },
    { farmers: "10", monthly: "KES 5,000" },
    { farmers: "50", monthly: "KES 25,000" },
  ] as const;

  const trust = [
    "No upfront costs",
    "No payouts without real revenue",
    "Transparent earnings dashboard",
  ] as const;

  return (
    <div className="landing-page min-h-screen font-body relative overflow-hidden bg-[#000] text-neutral-100 antialiased">
      <SeoHead
        title="FarmVault Ambassadors — Earn with every paying farmer"
        description="Join FarmVault as an ambassador. Earn from successful farmer payments — not signups alone."
        canonical={SEO_ROUTES.ambassador}
      />

      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(157,195,230,0.18), transparent), radial-gradient(circle at 90% 20%, rgba(216,185,128,0.08), transparent)`,
        }}
        aria-hidden
      />

      <AmbassadorLandingNavbar />

      <main className="relative z-10 pt-28 pb-20 md:pb-28">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-5xl">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mb-14 md:mb-20 max-w-3xl"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] mb-4" style={{ color: blue }}>
              Ambassador program
            </p>
            <h1 className="font-extrabold tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-[3.1rem] leading-[1.08] max-w-[20ch] sm:max-w-none mb-6 text-white">
              Earn Monthly Income by Helping Farmers Grow
            </h1>
            <p className="text-base md:text-lg text-neutral-400 max-w-xl leading-relaxed mb-10">
              Join FarmVault as an ambassador and earn real income for every farmer you onboard.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-xl h-12 px-8 text-base font-semibold border-0 text-black transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${gold}, #c9a86f)` }}
              >
                <Link
                  to="/ambassador/onboarding"
                  onClick={() => setIsAccessingAmbassador(true)}
                  className="inline-flex items-center justify-center gap-2"
                >
                  Become an Ambassador
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-xl h-12 px-8 text-base font-semibold border-white/20 bg-white/[0.03] text-neutral-100 hover:bg-white/[0.07] transition-colors"
              >
                <a href="#how-you-earn">How you earn</a>
              </Button>
            </div>
          </motion.section>

          <section id="how-you-earn" className="scroll-mt-28 mb-16 md:mb-24" aria-labelledby="how-you-earn-heading">
            <h2 id="how-you-earn-heading" className="text-2xl md:text-3xl font-bold text-white mb-2">
              How you earn
            </h2>
            <p className="text-sm text-neutral-500 mb-8 max-w-lg">
              Three clear ways to build income — tied to real subscription revenue.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
              {earnCards.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.article
                    key={item.amount}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className={`${cardClass} p-6 md:p-7 flex flex-col`}
                  >
                    <span
                      className="mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" style={{ color: gold }} strokeWidth={1.75} />
                    </span>
                    <p className="text-xl md:text-2xl font-bold tabular-nums mb-2" style={{ color: gold }}>
                      {item.amount}
                    </p>
                    <p className="text-sm text-neutral-400 leading-relaxed">{item.text}</p>
                  </motion.article>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-neutral-500 max-w-2xl">
              Earnings are only generated from successful farmer payments.
            </p>
          </section>

          <section id="income-potential" className="scroll-mt-28 mb-16 md:mb-24" aria-labelledby="income-potential-heading">
            <h2 id="income-potential-heading" className="text-2xl md:text-3xl font-bold text-white mb-8">
              Income potential
            </h2>
            <div className={`${cardClass} overflow-hidden divide-y divide-white/[0.08]`}>
              {incomeRows.map((row) => (
                <div key={row.farmers} className="flex items-center justify-between px-6 py-4 md:px-8 md:py-5">
                  <span className="text-neutral-400 text-sm md:text-base">{row.farmers} farmers</span>
                  <span className="text-lg md:text-xl font-bold tabular-nums" style={{ color: gold }}>
                    {row.monthly}/month
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">Illustrative recurring share at KES 500 per active paying farmer per month.</p>
          </section>

          <section id="trust" className="scroll-mt-28 mb-16" aria-labelledby="trust-heading">
            <h2 id="trust-heading" className="text-2xl font-bold text-white mb-6">
              Trust
            </h2>
            <ul className="grid sm:grid-cols-3 gap-4">
              {trust.map((line) => (
                <li key={line} className={`${cardClass} px-5 py-4 text-sm text-neutral-300`}>
                  <span className="font-semibold" style={{ color: blue }}>
                    ✓
                  </span>{" "}
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`${cardClass} p-8 md:p-10 text-center mt-8`}
          >
            <p className="text-xl md:text-2xl font-bold text-white tracking-tight mb-3">Start Earning Today</p>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-8">
              Share your link, help farmers subscribe, and get paid when revenue is real.
            </p>
            <Button
              asChild
              size="lg"
              className="rounded-xl h-12 px-8 text-base font-semibold border-0 text-black hover:opacity-95 transition-opacity"
              style={{ background: `linear-gradient(135deg, ${gold}, #c9a86f)` }}
            >
              <Link to="/ambassador/onboarding" onClick={() => setIsAccessingAmbassador(true)} className="inline-flex items-center gap-2">
                Start Earning Today
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.08] bg-black/80 backdrop-blur-md">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-5xl py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-neutral-500">
          <p>© 2026 FarmVault Ltd. Nairobi, Kenya.</p>
          <nav className="flex flex-wrap gap-6 justify-center sm:justify-end" aria-label="Legal">
            <Link to="/terms" className="hover:text-neutral-300 transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-neutral-300 transition-colors">
              Privacy
            </Link>
            <Link to="/ambassador/terms" className="hover:text-neutral-300 transition-colors">
              Ambassador terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
