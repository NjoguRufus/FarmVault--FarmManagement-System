import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

/** Soft outer lift + inner bevel glass — matches ambassador landing aesthetic */
const neuGlass =
  "rounded-lg border border-white/[0.12] bg-[hsl(150_28%_8%/0.45)] backdrop-blur-md backdrop-saturate-150 " +
  "shadow-[6px_8px_28px_rgba(0,0,0,0.42),-2px_-2px_16px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.35)]";

export default function AmbassadorTermsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div className="min-h-screen font-body relative overflow-hidden text-primary-foreground"
      style={{ background: "linear-gradient(to bottom, hsl(150 32% 6%), hsl(150 28% 9%), hsl(150 30% 5%))" }}
    >
      <LandingNavbar />

      <main className="relative z-10 pt-28 pb-20">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-[900px]">

          <header className="mb-10">
            <span className="inline-flex items-center rounded-lg border border-[hsl(var(--gold)/0.35)] bg-[hsl(150_25%_12%/0.5)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-light,45_80%_72%))] mb-4">
              Ambassador Program
            </span>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-primary-foreground mb-3">
              Ambassador Terms
            </h1>
            <p className="text-sm text-primary-foreground/45">Last updated: April 4, 2026</p>
          </header>

          <div className={`${neuGlass} p-8 md:p-10 space-y-10 text-primary-foreground/75 text-base leading-relaxed`}>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">1. Program Overview</h2>
              <p>
                The FarmVault Ambassador Program ("Program") allows approved individuals ("Ambassadors") to earn
                commissions by referring farmers and agricultural businesses to FarmVault's farm management
                platform. By applying for or participating in the Program, you agree to these Ambassador Terms,
                which are in addition to FarmVault's general{" "}
                <Link to="/terms" className="text-primary-foreground/90 underline-offset-2 hover:underline font-medium">Terms &amp; Conditions</Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-primary-foreground/90 underline-offset-2 hover:underline font-medium">Privacy Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">2. Eligibility</h2>
              <p className="mb-2">To participate in the Ambassador Program, you must:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Be at least 18 years of age.</li>
                <li>Be a resident of Kenya or another country approved by FarmVault.</li>
                <li>Have an active FarmVault account in good standing.</li>
                <li>Complete the ambassador onboarding process, including providing a valid M-Pesa number for payouts.</li>
                <li>Not be an employee, contractor, or agent of FarmVault.</li>
              </ul>
              <p className="mt-3">
                FarmVault reserves the right to approve or reject any ambassador application at its sole discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">3. Commission Structure</h2>
              <p className="mb-3">
                As an approved Ambassador, you are eligible to earn the following commissions:
              </p>
              <div className="space-y-3">
                <div className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-5 py-4">
                  <p className="font-bold text-primary-foreground">KES 600 — Signup Commission</p>
                  <p className="text-sm mt-1">
                    Earned when a farmer you referred creates a paid FarmVault account using your unique referral
                    link and completes their first subscription payment.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-5 py-4">
                  <p className="font-bold text-primary-foreground">KES 400 — Monthly Recurring Commission</p>
                  <p className="text-sm mt-1">
                    Earned each month that a referred farmer maintains an active paid subscription. Commissions
                    continue as long as the referred user remains a paying customer.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-5 py-4">
                  <p className="font-bold text-primary-foreground">KES 150 — Network Bonus</p>
                  <p className="text-sm mt-1">
                    Earned when another ambassador you referred to the Program successfully refers a paying farmer.
                    This is a one-time bonus per qualifying network referral.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-primary-foreground/55">
                Commission rates are subject to change with 30 days' written notice. Changes do not affect
                commissions already earned.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">4. Welcome Bonus</h2>
              <p>
                Upon completing your ambassador onboarding, you will receive a one-time welcome bonus of{" "}
                <strong className="text-primary-foreground">KES 200</strong> credited to your ambassador
                earnings balance. This bonus is paid out in your first monthly payment cycle.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">5. Payment Terms</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Commissions are credited to your FarmVault ambassador earnings balance.</li>
                <li>Payouts are processed <strong>monthly</strong>, within the first 5 business days of each month for the prior month's earnings.</li>
                <li>Payments are made via <strong>M-Pesa</strong> to your registered mobile number.</li>
                <li>There is no minimum payout threshold — all accrued earnings are paid out each cycle.</li>
                <li>You are responsible for any taxes applicable to ambassador income in your jurisdiction.</li>
                <li>FarmVault reserves the right to withhold payment if there is reasonable suspicion of fraud or Terms violations pending investigation.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">6. Referral Attribution</h2>
              <p>
                Referrals are tracked via your unique referral link. A referral is attributed to you when a user
                clicks your link and creates a paid account within <strong>30 days</strong> of clicking the link.
                If a user clears their cookies or uses a different device, attribution may not be possible.
                FarmVault's tracking system is the sole authority for commission attribution and its decisions
                are final.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">7. Prohibited Activities</h2>
              <p className="mb-2">As an Ambassador, you must not:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Make false or misleading claims about FarmVault's features, pricing, or benefits.</li>
                <li>Self-refer (use your own referral link to create another account).</li>
                <li>Engage in spam, unsolicited messaging, or prohibited advertising methods.</li>
                <li>Use paid advertising that uses FarmVault's brand name as a keyword without written approval.</li>
                <li>Offer unauthorized discounts, rebates, or incentives on behalf of FarmVault.</li>
                <li>Impersonate FarmVault staff or claim to be an official representative.</li>
                <li>Engage in any activity that damages FarmVault's brand or reputation.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">8. Termination of Membership</h2>
              <p>
                FarmVault may suspend or terminate your ambassador membership at any time if you violate these
                Terms or engage in fraudulent activity. Upon termination, any pending commissions from fraudulent
                or disputed referrals will be forfeited. Legitimate commissions already credited before
                termination will be paid in the next payout cycle, subject to FarmVault's review.
              </p>
              <p className="mt-3">
                You may voluntarily exit the Program at any time by contacting our support team. Pending
                legitimate earnings will be paid in the next cycle.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">9. Amendments</h2>
              <p>
                FarmVault reserves the right to modify the Ambassador Program and these Terms at any time. We
                will notify you by email or in-app notification at least 30 days before changes take effect.
                Continued participation in the Program after the effective date constitutes acceptance of the
                revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">10. Governing Law</h2>
              <p>
                These Ambassador Terms are governed by the laws of Kenya. Any disputes shall be subject to
                the exclusive jurisdiction of the courts of Nairobi, Kenya.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-primary-foreground mb-3">11. Contact</h2>
              <p>
                For questions about the Ambassador Program or these Terms:
              </p>
              <address className="not-italic mt-2 space-y-1">
                <p><strong className="text-primary-foreground">FarmVault Ltd.</strong></p>
                <p>Nairobi, Kenya</p>
                <p>Email: <a href="mailto:hello@farmvault.africa" className="text-primary-foreground/90 underline-offset-2 hover:underline">hello@farmvault.africa</a></p>
              </address>
            </section>

          </div>
        </div>
      </main>

      {/* Dark-themed footer matching ambassador landing */}
      <footer className="relative z-10 border-t border-white/[0.1] bg-[hsl(150_32%_5%/0.85)] backdrop-blur-md">
        <div className="container mx-auto px-5 sm:px-6 lg:px-8 max-w-[900px] py-8 md:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-primary-foreground/45 font-light text-center sm:text-left order-2 sm:order-1">
              © {new Date().getFullYear()} FarmVault Ltd. Nairobi, Kenya.
            </p>
            <nav
              className="flex flex-wrap items-center justify-center gap-6 sm:justify-end order-1 sm:order-2"
              aria-label="Legal links"
            >
              <Link to="/terms" className="text-xs font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors">Terms</Link>
              <Link to="/privacy" className="text-xs font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors">Privacy</Link>
              <Link to="/ambassador/terms" className="text-xs font-medium text-primary-foreground/55 hover:text-primary-foreground transition-colors">Ambassador Terms</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
