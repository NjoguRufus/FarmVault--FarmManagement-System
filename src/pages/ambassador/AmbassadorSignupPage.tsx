import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { ArrowLeft, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";
import { SEO_ROUTES } from "@/seo/routes";
import { getAmbassadorSignInPath, getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";
import { AMBASSADOR_REF_STORAGE_KEY } from "@/lib/ambassador/constants";
import { getStoredAmbassadorRef } from "@/services/ambassadorService";
import { setAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import { setSignupType } from "@/lib/ambassador/signupType";

export default function AmbassadorSignupPage() {
  const { isSignedIn, isLoaded } = useUser();
  const storedRef = getStoredAmbassadorRef();
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    setAmbassadorAccessIntent(true);
    setSignupType('ambassador');
  }, []);

  return (
    <div className="min-h-screen font-body relative overflow-hidden bg-gradient-to-b from-emerald-950 via-green-900 to-stone-900 text-emerald-50">
      <SeoHead
        title="Become a FarmVault Ambassador"
        description="Create your FarmVault account, then complete your ambassador profile."
        canonical={SEO_ROUTES.ambassadorSignup}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(190, 242, 100, 0.35), transparent 55%)`,
        }}
        aria-hidden
      />

      <LandingNavbar />

      <main className="relative z-10 pt-28 pb-20">
        <div className="container mx-auto px-4 lg:px-8 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <Button
              asChild
              variant="ghost"
              className="mb-6 text-emerald-200/90 hover:text-white hover:bg-white/10 -ml-2"
            >
              <Link to="/ambassador">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to program
              </Link>
            </Button>

            <div className="rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.25)] p-8 md:p-10">
              <div className="flex items-center gap-2 text-lime-300 mb-2">
                <Leaf className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wide">Ambassadors</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Become an ambassador</h1>
              <p className="text-sm text-emerald-100/75 mb-6">
                Use your existing FarmVault sign-up (Clerk) to create your login. We will collect your ambassador details
                next. Your email comes from your FarmVault account — no separate email field here. If you used a referral
                link, we keep <code className="text-emerald-200/90">{AMBASSADOR_REF_STORAGE_KEY}</code> until you finish
                profile setup.
              </p>

              {storedRef ? (
                <p className="text-xs rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 mb-6 text-emerald-100/90">
                  Referral captured: <span className="font-mono font-semibold text-lime-200">{storedRef}</span>
                </p>
              ) : null}

              {/* Terms acceptance checkbox */}
              <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur flex items-start gap-3">
                <input
                  type="checkbox"
                  id="amb-signup-terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                />
                <label htmlFor="amb-signup-terms" className="text-sm text-emerald-100/85 cursor-pointer leading-relaxed">
                  I agree to FarmVault's{" "}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-lime-300 underline-offset-2 hover:underline font-medium">
                    Terms &amp; Conditions
                  </Link>
                  ,{" "}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-lime-300 underline-offset-2 hover:underline font-medium">
                    Privacy Policy
                  </Link>
                  , and{" "}
                  <Link to="/ambassador/terms" target="_blank" rel="noopener noreferrer" className="text-lime-300 underline-offset-2 hover:underline font-medium">
                    Ambassador Terms
                  </Link>
                </label>
              </div>

              {isLoaded && isSignedIn ? (
                <div className="space-y-3">
                  <p className="text-sm text-emerald-100/80">You are signed in. Continue to complete your ambassador profile.</p>
                  <Button
                    asChild={agreedToTerms}
                    disabled={!agreedToTerms}
                    className="w-full rounded-full bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {agreedToTerms ? (
                      <Link
                        to="/ambassador/onboarding"
                        onClick={() => setAmbassadorAccessIntent(true)}
                      >
                        Continue to onboarding
                      </Link>
                    ) : (
                      <span>Continue to onboarding</span>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    asChild={agreedToTerms}
                    disabled={!agreedToTerms}
                    className="w-full rounded-full bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {agreedToTerms ? (
                      <Link to={getAmbassadorSignUpPath()}>Create FarmVault account</Link>
                    ) : (
                      <span>Create FarmVault account</span>
                    )}
                  </Button>
                  <p className="text-center text-xs text-emerald-200/60">
                    Already have an account?{" "}
                    <Link to={getAmbassadorSignInPath()} className="text-lime-300 underline-offset-2 hover:underline">
                      Sign in
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
