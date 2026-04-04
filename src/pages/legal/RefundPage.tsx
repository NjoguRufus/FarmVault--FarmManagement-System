import { useEffect } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";

export default function RefundPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div className="min-h-screen bg-background font-body">
      <LandingNavbar />

      <main className="pt-28 pb-20">
        <div className="container mx-auto px-4 max-w-[900px]">
          <header className="mb-10">
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-3">
              Refund Policy
            </h1>
            <p className="text-sm text-muted-foreground">Last updated: April 4, 2026</p>
          </header>

          <div className="space-y-10 text-foreground/80 text-base leading-relaxed">

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">1. Overview</h2>
              <p>
                At FarmVault, we strive to provide a high-quality farm management experience. If you are not
                satisfied with your subscription, this Refund Policy explains your options. This policy applies
                to all paid subscriptions on the FarmVault platform.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">2. Subscription Plans</h2>
              <p>
                FarmVault offers monthly and annual subscription plans. Subscriptions are billed in advance for
                each billing cycle. All prices are displayed in Kenyan Shillings (KES) and are inclusive of
                applicable taxes unless otherwise stated.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">3. Refund Window</h2>
              <p className="mb-2">
                You may request a full refund within <strong>14 days</strong> of your initial subscription
                purchase if:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>This is your first time subscribing to FarmVault (new subscribers only).</li>
                <li>You have not used the platform to manage active farm operations beyond basic exploration.</li>
                <li>Your request is submitted within 14 calendar days of the charge date.</li>
              </ul>
              <p className="mt-3">
                Renewal charges (monthly or annual renewals of an existing subscription) are not eligible for
                refunds unless required by applicable Kenyan consumer protection law.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">4. Annual Plan Pro-rata</h2>
              <p>
                If you subscribed on an annual plan and request a cancellation after the 14-day refund window,
                we may, at our sole discretion, offer a pro-rata refund for unused months minus a processing fee
                of KES 500. This is evaluated case-by-case and is not guaranteed. Contact our support team to
                discuss your situation.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">5. How to Request a Refund</h2>
              <p className="mb-2">To request a refund:</p>
              <ol className="list-decimal pl-6 space-y-2 text-foreground/75">
                <li>Email us at <a href="mailto:hello@farmvault.africa" className="text-primary underline-offset-2 hover:underline font-medium">hello@farmvault.africa</a> with the subject line <strong>"Refund Request"</strong>.</li>
                <li>Include your registered email address and the reason for your refund request.</li>
                <li>We will review your request and respond within 3 business days.</li>
                <li>Approved refunds are processed within 7–14 business days and returned to the original payment method.</li>
              </ol>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">6. Non-Refundable Items</h2>
              <p className="mb-2">The following are not eligible for refunds:</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>Subscription renewals after the initial 14-day window.</li>
                <li>Partial billing periods (i.e., you cancel mid-month — access continues until end of the paid period).</li>
                <li>Accounts suspended or terminated due to violations of our Terms &amp; Conditions.</li>
                <li>Custom onboarding or setup services rendered.</li>
                <li>Any charges more than 14 days old.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">7. Cancellation</h2>
              <p>
                You may cancel your subscription at any time through your account settings. Cancellation stops
                future billing but does not generate a refund for the current paid period. You retain access to
                FarmVault until the end of your current billing cycle. After cancellation, your data is retained
                for 30 days before being permanently deleted, allowing you to export your records.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">8. Exceptions</h2>
              <p>
                In exceptional circumstances (e.g., service outages lasting more than 48 consecutive hours that
                are directly attributable to FarmVault), we may issue pro-rated credits or partial refunds at our
                discretion. These will be evaluated on a case-by-case basis.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">9. Contact</h2>
              <p>
                Questions about our refund policy? Reach out to us:
              </p>
              <address className="not-italic mt-2 text-foreground/75 space-y-1">
                <p><strong>FarmVault Ltd.</strong></p>
                <p>Nairobi, Kenya</p>
                <p>Email: <a href="mailto:hello@farmvault.africa" className="text-primary underline-offset-2 hover:underline">hello@farmvault.africa</a></p>
                <p>Phone: <a href="tel:+254714748299" className="text-primary underline-offset-2 hover:underline">0714 748299</a></p>
              </address>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
