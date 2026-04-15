import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Banknote, Check, Copy, Gift, Leaf, Link2, Loader2, Mail, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SeoHead } from "@/seo/SeoHead";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";
import { SEO_ROUTES } from "@/seo/routes";
import { getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";
import { clearAmbassadorAccessIntent, readAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import type { AmbassadorType } from "@/lib/ambassador/constants";
import {
  clearStoredAmbassadorRef,
  completeMyAmbassadorOnboarding,
  fetchMyAmbassadorDashboardStats,
  getStoredAmbassadorRef,
  registerAmbassadorForClerk,
  setAmbassadorSession,
} from "@/services/ambassadorService";
import { invokeNotifyAmbassadorOnboarding } from "@/lib/email";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { persistIntendedRoute } from "@/lib/routing/postAuth";
import { buildAmbassadorReferralScanUrl } from "@/lib/ambassador/referralLink";
import { getReferralDeviceId } from "@/lib/ambassador/referralPersistence";
import { useAmbassadorAccess } from "@/contexts/AmbassadorAccessContext";

type Screen = "boot" | "profile" | "welcome" | "earn" | "works" | "ready" | "no_intent";

const cardClass =
  "rounded-2xl border border-white/[0.12] bg-white/[0.05] backdrop-blur-xl transition-shadow duration-300 " +
  "shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)] hover:shadow-[0_24px_60px_-18px_rgba(157,195,230,0.12)]";

const gold = "text-[#D8B980]";
const blue = "text-[#9DC3E6]";

export default function AmbassadorOnboardingPage() {
  const queryClient = useQueryClient();
  const { user, isLoaded: clerkLoaded } = useUser();
  const navigate = useNavigate();
  const { setIsAccessingAmbassador, setWorkspaceMode } = useAmbassadorAccess();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<AmbassadorType>("agrovet");
  const [screen, setScreen] = useState<Screen>("boot");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [copied, setCopied] = useState(false);

  const clerkEmail = user?.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const storedRef = getStoredAmbassadorRef();

  const progressValue = useMemo(() => {
    switch (screen) {
      case "profile":
        return 15;
      case "welcome":
        return 28;
      case "earn":
        return 52;
      case "works":
        return 76;
      case "ready":
        return 100;
      default:
        return 6;
    }
  }, [screen]);

  const referralUrl = useMemo(
    () => (referralCode ? buildAmbassadorReferralScanUrl(referralCode) : ""),
    [referralCode],
  );

  const welcomeName = user?.firstName?.trim() || user?.fullName?.split(/\s+/)[0] || "there";

  const tryAutoCreateAmbassadorProfile = useCallback(async (): Promise<"welcome" | "profile"> => {
    if (!user) return "profile";
    const email = user.primaryEmailAddress?.emailAddress?.trim();
    const nm = user.fullName?.trim() || user.firstName?.trim() || "";
    if (!email || !nm) return "profile";
    try {
      const result = await registerAmbassadorForClerk({
        name: nm,
        phone: undefined,
        email,
        type: "farmer",
        referrerCode: storedRef ?? undefined,
        deviceId: getReferralDeviceId(),
      });
      clearStoredAmbassadorRef();
      setAmbassadorSession({ id: result.id, referral_code: result.referral_code });
      setReferralCode(result.referral_code);
      return "welcome";
    } catch {
      return "profile";
    }
  }, [user, storedRef]);

  useEffect(() => {
    if (!clerkLoaded) return;

    if (!readAmbassadorAccessIntent()) {
      setScreen("no_intent");
      return;
    }

    if (!user) {
      try {
        persistIntendedRoute("/ambassador/onboarding");
      } catch {
        /* ignore */
      }
      navigate(getAmbassadorSignUpPath(), { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      setBootError(null);
      setScreen("boot");
      try {
        const r = await fetchMyAmbassadorDashboardStats();
        if (cancelled) return;
        if (r.ok) {
          if (r.onboarding_complete) {
            clearAmbassadorAccessIntent();
            setWorkspaceMode("ambassador");
            navigate("/ambassador/console/dashboard?amb_refresh=1", { replace: true });
            return;
          }
          setReferralCode(r.referral_code);
          setScreen("welcome");
          return;
        }
        if (r.error === "not_found" || r.error === "not_authenticated") {
          const auto = await tryAutoCreateAmbassadorProfile();
          if (cancelled) return;
          if (auto === "welcome") {
            toast.success("Ambassador profile ready.");
            setScreen("welcome");
          } else {
            setScreen("profile");
          }
          return;
        }
        setBootError("Could not verify your ambassador profile.");
        setScreen("profile");
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : "Something went wrong.");
          setScreen("profile");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, user, navigate, tryAutoCreateAmbassadorProfile, setWorkspaceMode]);

  useEffect(() => {
    if (!user || name.trim()) return;
    const full = user.fullName?.trim();
    if (full) setName(full);
  }, [user, name]);

  async function onProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!clerkEmail) {
      toast.error("Add an email address to your account before continuing.");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerAmbassadorForClerk({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: clerkEmail,
        type,
        referrerCode: storedRef ?? undefined,
        deviceId: getReferralDeviceId(),
      });
      clearStoredAmbassadorRef();
      setAmbassadorSession({ id: result.id, referral_code: result.referral_code });
      setReferralCode(result.referral_code);
      if (result.already_registered) {
        const check = await fetchMyAmbassadorDashboardStats();
        if (check.ok && check.onboarding_complete) {
          clearAmbassadorAccessIntent();
          setWorkspaceMode("ambassador");
          await queryClient.invalidateQueries({ queryKey: ["ambassador", "console"] });
          navigate("/ambassador/console/dashboard?amb_refresh=1", { replace: true });
          return;
        }
      }
      toast.success(result.already_registered ? "Welcome back!" : "Profile saved.");
      setScreen("welcome");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function goToDashboardFinish() {
    if (finishing) return;
    setFinishing(true);
    try {
      await completeMyAmbassadorOnboarding();

      if (clerkEmail) {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const ambassadorDashUrl = base.startsWith("https://")
          ? `${base}/ambassador/console/dashboard`
          : "";
        invokeNotifyAmbassadorOnboarding({
          to: clerkEmail,
          ambassadorName: name.trim() || welcomeName,
          ...(ambassadorDashUrl ? { dashboardUrl: ambassadorDashUrl } : {}),
        }).catch(() => {});
      }

      await queryClient.invalidateQueries({ queryKey: ["ambassador", "console"] });
      await queryClient.refetchQueries({ queryKey: ["ambassador", "console", "stats"] });

      clearAmbassadorAccessIntent();
      setWorkspaceMode("ambassador");
      navigate("/ambassador/console/dashboard?amb_refresh=1", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not finish onboarding.";
      toast.error(msg);
    } finally {
      setFinishing(false);
    }
  }

  function copyLink() {
    if (!referralUrl) return;
    void navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    toast.success("Link copied");
    window.setTimeout(() => setCopied(false), 2000);
  }

  const whatsappHref = useMemo(() => {
    if (!referralUrl) return "#";
    const text = `I'm a FarmVault ambassador — join with my link:\n${referralUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [referralUrl]);

  if (!clerkLoaded || screen === "boot") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#000] text-neutral-200">
        <Loader2 className="h-10 w-10 animate-spin text-[#9DC3E6]" aria-hidden />
        <p className="text-sm text-neutral-400">Loading ambassador onboarding…</p>
      </div>
    );
  }

  if (screen === "no_intent") {
    return (
      <div className="min-h-screen font-body bg-[#000] text-neutral-200 px-4 pt-28 pb-20">
        <LandingNavbar />
        <div className={`${cardClass} max-w-md mx-auto p-8 text-center space-y-4`}>
          <p className="text-sm text-neutral-300">
            This page is for FarmVault ambassadors. Open the ambassador console or learn about the program.
          </p>
          <div className="flex flex-col gap-2">
            {user ? (
              <Button
                type="button"
                className="rounded-xl h-11 bg-[#D8B980] text-black font-semibold hover:bg-[#c9a86f] transition-colors"
                onClick={() => {
                  setWorkspaceMode("ambassador");
                  setIsAccessingAmbassador(true);
                  navigate("/ambassador/console/dashboard?amb_refresh=1", { replace: true });
                }}
              >
                Open ambassador console
              </Button>
            ) : null}
            <Button asChild variant="secondary" className="rounded-xl border-white/15 bg-white/5">
              <Link to="/ambassador">Ambassador program</Link>
            </Button>
            {!user ? (
              <Button asChild variant="outline" className="rounded-xl border-white/20 text-neutral-100">
                <Link to="/sign-in">Sign in</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen font-body relative overflow-hidden bg-[#000] text-neutral-200">
      <SeoHead
        title="Ambassador onboarding — FarmVault"
        description="Complete your FarmVault ambassador onboarding."
        canonical={SEO_ROUTES.ambassadorOnboarding}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(157,195,230,0.25), transparent 42%), radial-gradient(circle at 90% 80%, rgba(216,185,128,0.12), transparent 38%)",
        }}
        aria-hidden
      />
      <LandingNavbar />

      <main className="relative z-10 pt-24 pb-20 px-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-6">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-2">
              <span>Onboarding</span>
              <span className={blue}>{screen === "profile" ? "Profile" : "Steps"}</span>
            </div>
            <Progress value={progressValue} className="h-1.5 bg-white/10 [&>div]:bg-[#9DC3E6]" />
          </div>

          {screen === "profile" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <div className={`flex items-center gap-2 text-sm font-medium mb-2 ${gold}`}>
                <Leaf className="h-5 w-5" />
                Ambassador profile
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Tell us about you</h1>
              <p className="text-sm text-neutral-400 mb-6">
                We could not auto-create your profile. Complete these fields to continue.
              </p>

              {bootError ? (
                <p className="text-sm text-amber-200/90 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-4">
                  {bootError}
                </p>
              ) : null}

              {storedRef ? (
                <p className="text-xs rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 mb-6 text-neutral-300">
                  Referral captured: <span className="font-mono font-semibold text-[#D8B980]">{storedRef}</span>
                </p>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 mb-6 flex items-start gap-3">
                <Mail className="h-5 w-5 text-[#9DC3E6] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500">Email (from your account)</p>
                  <p className="text-sm font-medium text-white break-all">{clerkEmail || "— add email in your account"}</p>
                </div>
              </div>

              <form onSubmit={(e) => void onProfileSubmit(e)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="amb-onb-name" className="text-neutral-300">
                    Full name
                  </Label>
                  <Input
                    id="amb-onb-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Wanjiku"
                    required
                    className="bg-white/5 border-white/15 text-white placeholder:text-neutral-600 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amb-onb-phone" className="text-neutral-300">
                    Phone (optional)
                  </Label>
                  <Input
                    id="amb-onb-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 …"
                    className="bg-white/5 border-white/15 text-white placeholder:text-neutral-600 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-neutral-300">Ambassador type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as AmbassadorType)}>
                    <SelectTrigger className="bg-white/5 border-white/15 text-white rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agrovet">Agrovet</SelectItem>
                      <SelectItem value="farmer">Farmer</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={submitting || !clerkEmail}
                  className="w-full rounded-xl bg-[#D8B980] text-black font-semibold h-12 hover:bg-[#c9a86f] transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            </motion.div>
          )}

          {screen === "welcome" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-3">Step 1</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-3">Welcome to FarmVault Ambassadors</h1>
              <p className="text-sm text-neutral-400 leading-relaxed mb-8">
                You&apos;re about to unlock a new income stream by helping farmers digitize their operations.
              </p>
              <Button
                type="button"
                onClick={() => setScreen("earn")}
                className="w-full sm:w-auto rounded-xl h-12 px-8 bg-[#9DC3E6] text-black font-semibold hover:opacity-95 transition-opacity"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {screen === "earn" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-3">Step 2 · How you earn</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-4">How you earn</h1>
              <ul className="space-y-4 text-sm text-neutral-300 mb-2">
                <li className="flex gap-3 items-start">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"
                    aria-hidden
                  >
                    <Banknote className={`h-5 w-5 ${gold}`} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`font-bold tabular-nums ${gold}`}>KES 600</p>
                    <p className="text-neutral-300">Earn when a referred farmer makes their first payment.</p>
                  </div>
                </li>
                <li className="flex gap-3 items-start">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"
                    aria-hidden
                  >
                    <Repeat2 className={`h-5 w-5 ${gold}`} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`font-bold tabular-nums ${gold}`}>KES 500 / month</p>
                    <p className="text-neutral-300">Recurring income for every active paying farmer (starts next month).</p>
                  </div>
                </li>
                <li className="flex gap-3 items-start">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"
                    aria-hidden
                  >
                    <Gift className={`h-5 w-5 ${gold}`} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`font-bold tabular-nums ${gold}`}>KES 300</p>
                    <p className="text-neutral-300">Welcome bonus after your first successful referral payment.</p>
                  </div>
                </li>
              </ul>
              <p className="text-xs text-neutral-500 mb-8 border-t border-white/10 pt-4">
                Earnings are only generated from successful farmer payments.
              </p>
              <Button
                type="button"
                onClick={() => setScreen("works")}
                className="w-full sm:w-auto rounded-xl h-12 px-8 bg-[#9DC3E6] text-black font-semibold hover:opacity-95 transition-opacity"
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {screen === "works" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-3">Step 3 · How it works</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-4">How it works</h1>
              <ol className="list-decimal pl-5 space-y-3 text-sm text-neutral-300 mb-8">
                <li>Share your link</li>
                <li>Farmer signs up</li>
                <li>Farmer pays</li>
                <li>You earn</li>
              </ol>
              <Button
                type="button"
                onClick={() => setScreen("ready")}
                className="w-full sm:w-auto rounded-xl h-12 px-8 bg-[#9DC3E6] text-black font-semibold hover:opacity-95 transition-opacity"
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {screen === "ready" && referralCode && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-3">Step 4</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">You&apos;re Ready to Start Earning</h1>
              <p className={`text-sm mb-4 flex items-center gap-2 ${blue}`}>
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                Your referral link
              </p>

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 mb-4">
                <span className="flex-1 text-xs text-neutral-400 break-all leading-relaxed font-mono">{referralUrl}</span>
                <button
                  type="button"
                  title="Copy referral link"
                  onClick={() => copyLink()}
                  className="shrink-0 rounded-lg p-2 text-[#9DC3E6] hover:text-white hover:bg-white/10 transition-colors"
                >
                  {copied ? <Check className="h-4 w-4 text-[#D8B980]" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="mb-6 flex flex-col gap-3">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8B980]/40 bg-[#D8B980]/10 px-4 py-3 text-sm font-semibold text-[#D8B980] hover:bg-[#D8B980]/15 transition-colors"
                >
                  Share on WhatsApp
                </a>
              </div>

              <Button
                type="button"
                disabled={finishing}
                onClick={() => void goToDashboardFinish()}
                className="w-full rounded-xl h-12 bg-[#D8B980] text-black font-semibold hover:bg-[#c9a86f] transition-colors"
              >
                {finishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finishing…
                  </>
                ) : (
                  <>
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
