import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { ArrowRight, Leaf, Loader2, Mail } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { persistIntendedRoute } from "@/lib/routing/postAuth";
import { buildAmbassadorReferralScanUrl } from "@/lib/ambassador/referralLink";
import {
  AmbassadorReferralQrBlock,
  type AmbassadorReferralQrBlockHandle,
} from "@/components/ambassador/AmbassadorReferralQrBlock";

type Screen = "check" | "profile" | "welcome" | "earn" | "link" | "next";

const cardClass =
  "rounded-lg border border-white/15 bg-white/[0.08] backdrop-blur-xl " +
  "shadow-[6px_8px_28px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]";

export default function AmbassadorOnboardingPage() {
  const { user, isLoaded: clerkLoaded } = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<AmbassadorType>("agrovet");
  const [screen, setScreen] = useState<Screen>("check");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const qrRef = useRef<AmbassadorReferralQrBlockHandle>(null);

  const clerkEmail = user?.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const storedRef = getStoredAmbassadorRef();

  const progressValue = useMemo(() => {
    switch (screen) {
      case "profile":
        return 12;
      case "welcome":
        return 30;
      case "earn":
        return 48;
      case "link":
        return 68;
      case "next":
        return 88;
      default:
        return 4;
    }
  }, [screen]);

  const referralUrl = useMemo(
    () => (referralCode ? buildAmbassadorReferralScanUrl(referralCode) : ""),
    [referralCode],
  );

  const welcomeName = user?.firstName?.trim() || user?.fullName?.split(/\s+/)[0] || "there";

  useEffect(() => {
    if (!clerkLoaded) return;

    if (!readAmbassadorAccessIntent()) {
      if (user) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/ambassador", { replace: true });
      }
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
      try {
        const r = await fetchMyAmbassadorDashboardStats();
        if (cancelled) return;
        if (r.ok) {
          if (r.onboarding_complete) {
            clearAmbassadorAccessIntent();
            navigate("/ambassador/console/dashboard", { replace: true });
            return;
          }
          setReferralCode(r.referral_code);
          setScreen("welcome");
          return;
        }
        if (r.error === "not_found" || r.error === "not_authenticated") {
          setScreen("profile");
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
  }, [clerkLoaded, user, navigate]);

  useEffect(() => {
    if (!user || name.trim()) return;
    const full = user.fullName?.trim();
    if (full) setName(full);
  }, [user, name]);

  async function onProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clerkEmail) {
      toast.error("Add an email address to your account in Clerk before continuing.");
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
        referrerCode: storedRef,
      });
      clearStoredAmbassadorRef();
      setAmbassadorSession({ id: result.id, referral_code: result.referral_code });
      setReferralCode(result.referral_code);
      toast.success(result.already_registered ? "Welcome back!" : "Welcome to the ambassador program!");
      setScreen("welcome");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function goToReferPage() {
    setFinishing(true);
    try {
      await completeMyAmbassadorOnboarding();
      clearAmbassadorAccessIntent();
      navigate("/ambassador/console/refer", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not finish onboarding.";
      toast.error(msg);
    } finally {
      setFinishing(false);
    }
  }

  if (!clerkLoaded || screen === "check") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-emerald-950 via-green-900 to-stone-900 text-emerald-50">
        <Loader2 className="h-10 w-10 animate-spin text-lime-300" />
        <p className="text-sm text-emerald-200/70">Preparing onboarding…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (bootError) {
    return (
      <div className="min-h-screen font-body bg-gradient-to-b from-emerald-950 via-green-900 to-stone-900 text-emerald-50 px-4 pt-28 pb-20">
        <LandingNavbar />
        <div className={`${cardClass} max-w-md mx-auto p-8 text-center`}>
          <p className="text-sm text-emerald-100/85 mb-4">{bootError}</p>
          <Button asChild variant="secondary" className="rounded-lg">
            <Link to={getAmbassadorSignUpPath()}>Back</Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-body relative overflow-hidden bg-gradient-to-b from-emerald-950 via-green-900 to-emerald-950 text-emerald-50">
      <SeoHead
        title="Ambassador onboarding — FarmVault"
        description="Complete your FarmVault ambassador onboarding."
        canonical={SEO_ROUTES.ambassadorOnboarding}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 20%, rgba(190, 242, 100, 0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(34, 197, 94, 0.2), transparent 40%)",
        }}
        aria-hidden
      />
      <LandingNavbar />

      <main className="relative z-10 pt-24 pb-20 px-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-6">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-emerald-200/60 mb-2">
              <span>Onboarding</span>
              <span>{screen === "profile" ? "Profile" : "Steps"}</span>
            </div>
            <Progress
              value={progressValue}
              className="h-1.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-lime-400 [&>div]:to-emerald-500"
            />
          </div>

          {screen === "profile" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <div className="flex items-center gap-2 text-lime-300 text-sm font-medium mb-2">
                <Leaf className="h-5 w-5" />
                Ambassador profile
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Almost there</h1>
              <p className="text-sm text-emerald-100/75 mb-6">
                We use your FarmVault login email from Clerk. Tell us how to reach you and what kind of partner you are.
              </p>

              {storedRef ? (
                <p className="text-xs rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 mb-6 text-emerald-100/90">
                  Referral captured: <span className="font-mono font-semibold text-lime-200">{storedRef}</span>
                </p>
              ) : null}

              <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 mb-6 flex items-start gap-3">
                <Mail className="h-5 w-5 text-lime-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-emerald-200/50">Email (from Clerk)</p>
                  <p className="text-sm font-medium text-white break-all">{clerkEmail || "— add email in your account"}</p>
                </div>
              </div>

              <form onSubmit={(e) => void onProfileSubmit(e)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="amb-onb-name" className="text-emerald-100">
                    Full name
                  </Label>
                  <Input
                    id="amb-onb-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Wanjiku"
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-emerald-200/40 rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amb-onb-phone" className="text-emerald-100">
                    Phone (optional)
                  </Label>
                  <Input
                    id="amb-onb-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 …"
                    className="bg-white/10 border-white/20 text-white placeholder:text-emerald-200/40 rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-emerald-100">Ambassador type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as AmbassadorType)}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white rounded-lg">
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
                  className="w-full rounded-lg bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 font-semibold h-12"
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
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8 text-center sm:text-left`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/50 mb-3">Step 1</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-3">Welcome, {welcomeName}</h1>
              <p className="text-sm text-emerald-100/80 leading-relaxed mb-8">
                You&apos;re in the FarmVault ambassador program. Over the next steps we&apos;ll show how you earn, your personal link and QR
                code, and how to start sharing.
              </p>
              <Button type="button" onClick={() => setScreen("earn")} className="w-full sm:w-auto rounded-lg h-12 px-8 bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 font-semibold">
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {screen === "earn" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/50 mb-3">Step 2</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-4">How you earn</h1>
              <ul className="space-y-3 text-sm text-emerald-100/85 mb-8">
                <li className="flex gap-3">
                  <span className="font-bold text-gold-light tabular-nums shrink-0">KES 600</span>
                  <span>Signup bonus when a referred farmer joins.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-gold-light tabular-nums shrink-0">KES 400</span>
                  <span>Monthly recurring commission on eligible subscriptions.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-gold-light tabular-nums shrink-0">KES 150</span>
                  <span>Ambassador invite bonus when someone you referred becomes an ambassador too.</span>
                </li>
              </ul>
              <Button type="button" onClick={() => setScreen("link")} className="w-full sm:w-auto rounded-lg h-12 px-8 bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 font-semibold">
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {screen === "link" && referralCode && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/50 mb-3">Step 3</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Your referral link</h1>
              <p className="text-xs text-emerald-100/65 mb-4">
                Code: <span className="font-mono font-semibold text-lime-200">{referralCode}</span>
              </p>
              <p className="text-xs text-emerald-100/80 break-all leading-relaxed mb-6">{referralUrl}</p>
              <div className="mx-auto max-w-[220px] sm:max-w-[260px] mb-8">
                <AmbassadorReferralQrBlock ref={qrRef} url={referralUrl} />
              </div>
              <Button type="button" onClick={() => setScreen("next")} className="w-full sm:w-auto rounded-lg h-12 px-8 bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 font-semibold">
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {screen === "next" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardClass} p-6 sm:p-8 text-center sm:text-left`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/50 mb-3">Step 4</p>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-3">What to do next</h1>
              <p className="text-lg text-emerald-100/90 font-medium mb-8">Share your link to start earning.</p>
              <Button
                type="button"
                disabled={finishing}
                onClick={() => void goToReferPage()}
                className="w-full rounded-lg h-12 px-8 bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-light))] text-[hsl(150_35%_12%)] font-semibold shadow-[0_6px_24px_-4px_hsl(var(--gold)/0.45)]"
              >
                {finishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finishing…
                  </>
                ) : (
                  <>
                    Go to referral page
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-[11px] text-emerald-200/50 mt-4">
                After this step you can open your full dashboard anytime from the menu.
              </p>
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
