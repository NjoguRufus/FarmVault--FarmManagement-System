import { useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { UserPlus, Repeat2, Network, Gift, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";
import { AmbassadorLandingNavbar } from "@/components/landing/AmbassadorLandingNavbar";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { SEO_ROUTES } from "@/seo/routes";
import { AMBASSADOR_REF_STORAGE_KEY } from "@/lib/ambassador/constants";
import { useAmbassadorAccess } from "@/contexts/AmbassadorAccessContext";
import { useAuth } from "@/contexts/AuthContext";
import { setAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import { fetchMyAmbassadorDashboardStats } from "@/services/ambassadorService";

function AmbassadorLandingGateLoader({ message }: { message: string }) {
  return (
    <div
      className="landing-page min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-emerald-950 via-green-900 to-stone-900 text-emerald-50"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-10 w-10 animate-spin text-lime-300" aria-hidden />
      <p className="text-sm text-emerald-200/70">{message}</p>
    </div>
  );
}

/** Soft outer lift + inner bevel, paired with glass blur */
const neuGlass =
  "rounded-lg border border-white/[0.12] bg-[hsl(150_28%_8%/0.45)] backdrop-blur-md backdrop-saturate-150 " +
  "shadow-[6px_8px_28px_rgba(0,0,0,0.42),-2px_-2px_16px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.35)]";

const neuGlassCard =
  "rounded-lg border border-white/[0.1] bg-[hsl(150_26%_10%/0.42)] backdrop-blur-lg backdrop-saturate-150 " +
  "shadow-[5px_6px_22px_rgba(0,0,0,0.38),-1px_-2px_12px_rgba(255,255,255,0.035),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.28)]";

export default function AmbassadorLandingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refParam = useMemo(() => searchParams.get("ref"), [searchParams]);
  const { setIsAccessingAmbassador } = useAmbassadorAccess();
  const { user, isLoaded: clerkLoaded } = useUser();
  const { authReady } = useAuth();

  useEffect(() => {
    const trimmed = refParam?.trim();
    if (trimmed) {
      localStorage.setItem(AMBASSADOR_REF_STORAGE_KEY, trimmed);
    }
  }, [refParam]);

  // Signed-in users: never send to sign-up — route to dashboard or onboarding (access-revoked safe).
  useEffect(() => {
    if (!clerkLoaded || !user || !authReady) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchMyAmbassadorDashboardStats();
        if (cancelled) return;
        if (r.ok && r.onboarding_complete) {
          navigate("/ambassador/dashboard", { replace: true });
          return;
        }
        setAmbassadorAccessIntent(true);
        navigate("/ambassador/onboarding", { replace: true });
      } catch {
        if (!cancelled) {
          setAmbassadorAccessIntent(true);
          navigate("/ambassador/onboarding", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, user, authReady, navigate]);

  if (!clerkLoaded) {
    return <AmbassadorLandingGateLoader message="Loading…" />;
  }

  if (user) {
    if (!authReady) {
      return <AmbassadorLandingGateLoader message="Preparing your session…" />;
    }
    return <AmbassadorLandingGateLoader message="Opening ambassador…" />;
  }

  const features = [
    { icon: Gift, title: "Welcome Bonus", amount: "KES 200", detail: "when you sign up" },
    { icon: UserPlus, title: "Refer Farmers", amount: "KES 600", detail: "per signup" },
    { icon: Repeat2, title: "Recurring Income", amount: "KES 400", detail: "monthly" },
    { icon: Network, title: "Build Network", amount: "KES 150", detail: "ambassador bonus" },
  ] as const;

  const howItWorks = [
    {
      step: "01",
      title: "Apply Online",
      body: "Submit your ambassador application and receive approval within 48 hours.",
    },
    {
      step: "02",
      title: "Get Your Link",
      body: "Receive a unique referral link and marketing materials to share with farmers.",
    },
    {
      step: "03",
      title: "Refer & Track",
      body: "Share your link. Monitor signups and commissions in your ambassador dashboard.",
    },
    {
      step: "04",
      title: "Get Paid",
      body: "Commissions credited to your M-Pesa account monthly, with no minimum threshold.",
    },
  ] as const;

  return (
    <div className="landing-page min-h-screen font-body relative overflow-hidden text-primary-foreground">
      <SeoHead
        title="FarmVault Ambassadors — Grow with us"
        description="Invite farmers, track performance, and earn recurring commissions with FarmVault."
        canonical={SEO_ROUTES.ambassador}
      />

      {/* Farm field (same asset as main landing), blurred */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <OptimizedImage
          src="/landing/hero-bg.jpg"
          webpSrc="/landing/hero-bg.webp"
          priority
          alt=""
          className="h-full w-full min-h-[100vh] object-cover scale-110 blur-md opacity-90"
        />
        <div className="absolute inset-0 gradient-hero-overlay" />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[hsl(150_32%_6%/0.88)] via-[hsl(150_28%_8%/0.78)] to-[hsl(150_30%_5%/0.92)]"
          style={{
            boxShadow:
              "inset 0 0 100px rgba(0,0,0,0.45), inset 0 -80px 120px rgba(0,0,0,0.35)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_70%_0%,hsl(45_50%_35%/0.12),transparent_55%)]" />
      </div>

      <AmbassadorLandingNavbar />

      <main className="relative z-10 pt-28 pb-20 md:pb-28">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-6xl">
          <div className="lg:grid lg:grid-cols-12 lg:gap-x-10 lg:gap-y-0 lg:items-end">
            {/* Hero — asymmetric column */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-8"
            >
              <div className={`${neuGlass} p-8 md:p-10 lg:p-12`}>
                <div className="mb-8 flex flex-wrap items-center gap-4 md:gap-6">
                  <span
                    className="inline-flex items-center rounded-lg border border-[hsl(var(--gold)/0.35)] bg-[hsl(150_25%_12%/0.5)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light"
                    style={{
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.06), 2px 3px 12px rgba(0,0,0,0.25)",
                    }}
                  >
                    Ambassador program
                  </span>
                  <div className="hidden sm:block h-px flex-1 max-w-[120px] bg-gradient-to-r from-[hsl(var(--gold)/0.4)] to-transparent" />
                </div>

                <h1 className="font-extrabold tracking-tight text-primary-foreground text-[2.125rem] leading-[1.08] sm:text-4xl md:text-5xl lg:text-[3.125rem] lg:leading-[1.05] max-w-[18ch] sm:max-w-none mb-6">
                  Grow With FarmVault.
                  <span className="mt-2 block text-gradient-gold">Earn From Every Farmer.</span>
                </h1>

                <p className="text-base md:text-lg text-primary-foreground/72 max-w-md leading-relaxed font-medium mb-10 md:mb-12">
                  Invite farmers, track performance, earn recurring commissions.
                </p>

                <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4">
                  <Button
                    asChild
                    size="lg"
                    className="rounded-lg h-12 px-8 text-base font-semibold border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-[0.96] transition-opacity shadow-[0_6px_24px_-4px_hsl(var(--gold)/0.45),inset_0_1px_0_rgba(255,255,255,0.35)]"
                  >
                    <Link
                      to="/ambassador/onboarding"
                      onClick={() => setIsAccessingAmbassador(true)}
                      className="inline-flex items-center justify-center gap-2"
                    >
                      Become Ambassador
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="rounded-lg h-12 px-8 text-base font-semibold border-white/20 bg-[hsl(150_25%_10%/0.35)] text-primary-foreground hover:bg-[hsl(150_25%_12%/0.45)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06),2px_4px_14px_rgba(0,0,0,0.2)]"
                  >
                    <a href="#earnings-model">See Earnings Model</a>
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Editorial rail — earnings at a glance */}
            <aside className="mt-10 lg:mt-0 lg:col-span-4 hidden md:block w-full lg:self-end">
              <div className={`${neuGlass} p-6 lg:p-7`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary-foreground/45 mb-5">
                  Earnings stack
                </p>
                <ul className="space-y-4">
                  <li className="flex items-baseline justify-between gap-3 border-b border-white/[0.08] pb-4">
                    <span className="text-sm text-primary-foreground/55">Signup</span>
                    <span className="text-lg font-bold tabular-nums text-gold-light">600</span>
                  </li>
                  <li className="flex items-baseline justify-between gap-3 border-b border-white/[0.08] pb-4">
                    <span className="text-sm text-primary-foreground/55">Monthly</span>
                    <span className="text-lg font-bold tabular-nums text-primary-foreground/90">400</span>
                  </li>
                  <li className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-primary-foreground/55">Network</span>
                    <span className="text-lg font-bold tabular-nums text-primary-foreground/90">150</span>
                  </li>
                </ul>
                <p className="mt-4 text-[11px] text-primary-foreground/40 leading-snug">KES · per referred farmer terms</p>
              </div>
            </aside>
          </div>

          {/* Mobile earnings rail */}
          <div className="md:hidden mt-8">
            <div className={`${neuGlass} p-5`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground/45 mb-3">
                Earnings · KES
              </p>
              <div className="flex justify-between text-sm font-semibold tabular-nums">
                <span>
                  <span className="block text-primary-foreground/45 text-[10px] font-medium uppercase tracking-wider mb-0.5">
                    Signup
                  </span>
                  600
                </span>
                <span>
                  <span className="block text-primary-foreground/45 text-[10px] font-medium uppercase tracking-wider mb-0.5">
                    Mo
                  </span>
                  400
                </span>
                <span>
                  <span className="block text-primary-foreground/45 text-[10px] font-medium uppercase tracking-wider mb-0.5">
                    Net
                  </span>
                  150
                </span>
              </div>
            </div>
          </div>

          <section
            id="earnings-model"
            className="mt-14 md:mt-20 lg:mt-24 scroll-mt-28 md:scroll-mt-32"
            aria-labelledby="earnings-model-heading"
          >
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 md:mb-10">
              <h2
                id="earnings-model-heading"
                className="text-xl md:text-2xl font-bold tracking-tight text-primary-foreground"
              >
                How you earn
              </h2>
              <p className="text-sm text-primary-foreground/50 max-w-xs sm:text-right leading-relaxed font-light">
                Four revenue streams. One dashboard.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
              {features.map((item, i) => (
                <motion.article
                  key={item.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`${neuGlassCard} p-6 md:p-7 flex flex-col ${i === 1 ? "lg:-translate-y-1" : ""}`}
                >
                  <div
                    className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[hsl(150_22%_14%/0.55)]"
                    style={{
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.07), 2px 3px 10px rgba(0,0,0,0.25)",
                    }}
                  >
                    <item.icon className="h-4 w-4 text-gold-light/90" strokeWidth={1.35} aria-hidden />
                  </div>
                  <h3 className="text-base font-bold text-primary-foreground tracking-tight mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xl md:text-2xl font-bold tabular-nums tracking-tight text-primary-foreground">
                    {item.amount}
                  </p>
                  <p className="text-xs font-medium text-primary-foreground/55 mt-1">{item.detail}</p>
                </motion.article>
              ))}
            </div>
          </section>

          <section
            id="how-it-works"
            className="mt-16 md:mt-20 lg:mt-28 scroll-mt-28 md:scroll-mt-32"
            aria-labelledby="how-it-works-heading"
          >
            <div className="mb-8 md:mb-10">
              <h2
                id="how-it-works-heading"
                className="text-2xl md:text-3xl font-bold tracking-tight text-primary-foreground mb-2"
              >
                How It Works
              </h2>
              <p className="text-base text-primary-foreground/60 font-light max-w-lg">
                Simple steps to your first payout.
              </p>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6 list-none p-0 m-0">
              {howItWorks.map((item, i) => (
                <motion.li
                  key={item.step}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-32px" }}
                  transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`${neuGlassCard} p-6 md:p-7 flex gap-5`}
                >
                  <span
                    className="shrink-0 font-bold tabular-nums text-2xl md:text-3xl leading-none text-gold-light/90"
                    aria-hidden
                  >
                    {item.step}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-primary-foreground tracking-tight mb-2">{item.title}</h3>
                    <p className="text-sm text-primary-foreground/65 leading-relaxed font-light">{item.body}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </section>

          <div className={`${neuGlass} mt-14 md:mt-16 lg:mt-20 p-8 md:p-10 lg:p-12 text-center`}>
            <p className="text-xl md:text-2xl font-bold text-primary-foreground tracking-tight">
              Start earning this season.
            </p>
            <p className="mt-3 text-base md:text-lg text-primary-foreground/65 font-light max-w-xl mx-auto leading-relaxed">
              Join Kenya&apos;s fastest-growing agritech ambassador network.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 rounded-lg h-12 px-8 text-base font-semibold border-0 text-[hsl(150_35%_12%)] bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] hover:opacity-[0.96] transition-opacity shadow-[0_6px_24px_-4px_hsl(var(--gold)/0.45),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              <Link
                to="/ambassador/onboarding"
                onClick={() => setIsAccessingAmbassador(true)}
                className="inline-flex items-center justify-center gap-2"
              >
                Apply Now — It&apos;s Free
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.1] bg-[hsl(150_32%_5%/0.85)] backdrop-blur-md">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-6xl py-8 md:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs md:text-sm text-primary-foreground/45 font-light text-center sm:text-left order-2 sm:order-1">
              © 2025 FarmVault Ltd. Nairobi, Kenya.
            </p>
            <nav
              className="flex flex-wrap items-center justify-center gap-6 sm:justify-end order-1 sm:order-2"
              aria-label="Legal and support"
            >
              <Link
                to="/terms"
                className="text-xs md:text-sm font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors"
              >
                Terms &amp; Conditions
              </Link>
              <Link
                to="/privacy"
                className="text-xs md:text-sm font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/ambassador/terms"
                className="text-xs md:text-sm font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors"
              >
                Ambassador Terms
              </Link>
              <Link
                to="/support"
                className="text-xs md:text-sm font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors"
              >
                Support
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
