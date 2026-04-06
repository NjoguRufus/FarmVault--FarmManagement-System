import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { Copy, Download, Leaf, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { getAmbassadorSignUpPath } from "@/lib/ambassador/clerkAuth";
import {
  buildAmbassadorReferralScanUrl,
  buildAmbassadorReferralShortUrl,
  buildFarmerSignupUrlWithRef,
} from "@/lib/ambassador/referralLink";
import {
  AmbassadorReferralQrBlock,
  type AmbassadorReferralQrBlockHandle,
} from "@/components/ambassador/AmbassadorReferralQrBlock";
import { clearAmbassadorSession, getAmbassadorSession } from "@/services/ambassadorService";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { useAmbassadorConsoleStatsQuery } from "@/hooks/useAmbassadorConsoleQueries";

const cardClass =
  "rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm shadow-sm " +
  "shadow-[4px_6px_20px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.06)] dark:shadow-[4px_6px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]";

export default function AmbassadorReferPage() {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const statsQ = useAmbassadorConsoleStatsQuery(isLoaded);
  const stats = statsQ.data;
  const qrRef = useRef<AmbassadorReferralQrBlockHandle>(null);

  const referralCode = stats?.ok ? stats.referral_code : null;
  const referralUrl = useMemo(
    () => (referralCode ? buildAmbassadorReferralScanUrl(referralCode) : ""),
    [referralCode],
  );
  const shortReferralUrl = useMemo(
    () => (referralCode ? buildAmbassadorReferralShortUrl(referralCode) : ""),
    [referralCode],
  );
  const signupWithRefUrl = useMemo(
    () => (referralCode ? buildFarmerSignupUrlWithRef(referralCode) : ""),
    [referralCode],
  );

  useEffect(() => {
    if (!statsQ.isFetched || !stats) return;
    if (stats.ok && !stats.onboarding_complete) {
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }
    if (!stats.ok && stats.error === "not_found" && user) {
      navigate("/ambassador/onboarding", { replace: true });
      return;
    }
    if (!stats.ok && stats.error === "not_found" && !user && !getAmbassadorSession()) {
      navigate("/ambassador/signup", { replace: true });
      return;
    }
    if (!stats.ok && stats.error === "not_found" && !user && getAmbassadorSession()) {
      clearAmbassadorSession();
    }
  }, [statsQ.isFetched, stats, user, navigate]);

  const copyLink = useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy");
    }
  }, [referralUrl]);

  const shareWhatsApp = useCallback(() => {
    if (!referralUrl) return;
    const text = `Sign up for FarmVault with my link:\n${referralUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }, [referralUrl]);

  const downloadQr = useCallback(() => {
    if (!referralCode) return;
    void qrRef.current?.downloadPng(`farmvault-referral-${referralCode}`);
  }, [referralCode]);

  if (statsQ.isError) {
    return (
      <>
        <SeoHead title="Refer & QR" description="Your FarmVault ambassador referral link and QR code." canonical={SEO_ROUTES.ambassadorRefer} />
        <DeveloperPageShell title="Refer & QR">
          <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm p-4 max-w-md">
            {statsQ.error instanceof Error ? statsQ.error.message : "Could not load referral data."}
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (!isLoaded || statsQ.isLoading) {
    return (
      <>
        <SeoHead title="Refer & QR" description="Your FarmVault ambassador referral link and QR code." canonical={SEO_ROUTES.ambassadorRefer} />
        <DeveloperPageShell title="Refer & QR" isLoading>
          <div className="h-64 rounded-xl border border-border/50 bg-muted/20 animate-pulse max-w-md mx-auto" />
        </DeveloperPageShell>
      </>
    );
  }

  if (stats && !stats.ok) {
    if (stats.error === "not_found" && user) return null;
    if (stats.error === "no_session") {
      return (
        <>
          <SeoHead title="Refer & QR" description="Sign in to get your referral link." canonical={SEO_ROUTES.ambassadorRefer} />
          <DeveloperPageShell title="Refer & QR">
            <div className={`${cardClass} p-8 max-w-md mx-auto text-center space-y-4`}>
              <Leaf className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Sign in to view your referral link and QR code.</p>
              <Button asChild>
                <Link to={getAmbassadorSignUpPath()}>Get started</Link>
              </Button>
            </div>
          </DeveloperPageShell>
        </>
      );
    }
    return (
      <>
        <SeoHead title="Refer & QR" description="Your FarmVault ambassador referral link and QR code." canonical={SEO_ROUTES.ambassadorRefer} />
        <DeveloperPageShell title="Refer & QR">
          <div className={`${cardClass} p-6 max-w-md mx-auto text-center space-y-4`}>
            <p className="text-sm text-muted-foreground">Could not load your referral code.</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/ambassador/console/dashboard">Dashboard</Link>
            </Button>
          </div>
        </DeveloperPageShell>
      </>
    );
  }

  if (!stats?.ok || !referralCode) {
    return null;
  }

  return (
    <>
      <SeoHead title="Refer & QR" description="Share FarmVault with your referral link and QR code." canonical={SEO_ROUTES.ambassadorRefer} />
      <DeveloperPageShell
        title="Refer & QR"
        description="Share your scan link or QR — farmers open FarmVault with your referral saved."
        isRefetching={statsQ.isFetching}
        onRefresh={() => void statsQ.refetch()}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-5 max-w-2xl mx-auto"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-primary uppercase tracking-wide">
            <Share2 className="h-4 w-4" aria-hidden />
            Your tools
          </div>

          <div className={`${cardClass} p-5 sm:p-6`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Referral code</p>
            <p className="font-mono text-xl sm:text-2xl font-bold text-foreground tracking-tight">{referralCode}</p>
          </div>

          <div className={`${cardClass} p-5 sm:p-6`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Referral link (scan)</p>
            <p className="text-sm text-foreground/90 break-all leading-relaxed mb-4">{referralUrl}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Short link</p>
            <p className="text-sm text-foreground/90 break-all leading-relaxed mb-4">{shortReferralUrl}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Sign-up with ref</p>
            <p className="text-sm text-foreground/90 break-all leading-relaxed mb-4">{signupWithRefUrl}</p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
              <Button type="button" onClick={() => void copyLink()} className="rounded-lg font-semibold">
                <Copy className="h-4 w-4 mr-2" />
                Copy link
              </Button>
              <Button type="button" variant="outline" onClick={shareWhatsApp} className="rounded-lg">
                <MessageCircle className="h-4 w-4 mr-2" />
                Share via WhatsApp
              </Button>
              <Button type="button" variant="outline" onClick={downloadQr} className="rounded-lg">
                <Download className="h-4 w-4 mr-2" />
                Download QR
              </Button>
            </div>
          </div>

          <div className={`${cardClass} p-6 sm:p-8`}>
            <p className="text-center text-xs font-semibold text-muted-foreground mb-5 uppercase tracking-wider">Scan to join</p>
            <div className="mx-auto w-full max-w-[260px] sm:max-w-[280px]">
              <AmbassadorReferralQrBlock ref={qrRef} url={referralUrl} hostClassName="rounded-lg" />
            </div>
          </div>

          <div className={`${cardClass} p-5 sm:p-6`}>
            <h2 className="text-base font-bold text-foreground mb-3 tracking-tight">How it works</h2>
            <ol className="space-y-3 list-decimal list-inside text-sm text-muted-foreground leading-relaxed marker:text-primary marker:font-bold">
              <li>
                <span className="font-semibold text-foreground">Share your link</span> — Send your URL or show your QR in person.
              </li>
              <li>
                <span className="font-semibold text-foreground">Farmer signs up</span> — They open FarmVault from your link or scan.
              </li>
              <li>
                <span className="font-semibold text-foreground">Earn commissions</span> — Track activity and payouts in your dashboard.
              </li>
            </ol>
          </div>
        </motion.div>
      </DeveloperPageShell>
    </>
  );
}
