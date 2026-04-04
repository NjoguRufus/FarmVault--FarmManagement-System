import { useEffect } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";

export default function TermsPage() {
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
              Terms &amp; Conditions
            </h1>
            <p className="text-sm text-muted-foreground">Last updated: April 4, 2026</p>
          </header>

          <div className="space-y-10 text-foreground/80 text-base leading-relaxed">

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">1. Introduction</h2>
              <p>
                Welcome to FarmVault ("we", "our", or "us"). These Terms &amp; Conditions govern your access to and
                use of FarmVault's farm management platform, including all related websites, applications, APIs, and
                services (collectively, the "Service"). By registering for or using the Service, you agree to be
                bound by these Terms. If you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">2. Eligibility</h2>
              <p>
                You must be at least 18 years old and capable of entering into a legally binding agreement to use
                the Service. By using FarmVault, you represent and warrant that you meet these requirements.
                The Service is intended for individuals and businesses operating within Kenya and Africa.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">3. Account Registration &amp; Security</h2>
              <p className="mb-2">
                To access the Service, you must register an account. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>Provide accurate, complete, and current information during registration.</li>
                <li>Maintain the confidentiality of your login credentials.</li>
                <li>Notify us immediately of any unauthorized access to your account.</li>
                <li>Accept responsibility for all activity that occurs under your account.</li>
              </ul>
              <p className="mt-3">
                FarmVault reserves the right to suspend or terminate accounts that violate these Terms or engage
                in fraudulent activity.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">4. Subscription &amp; Billing</h2>
              <p className="mb-2">
                Access to certain features of FarmVault requires a paid subscription. By subscribing, you agree to:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>Pay all applicable subscription fees as described on the pricing page.</li>
                <li>Authorize us to charge your designated payment method on a recurring basis.</li>
                <li>Provide accurate billing information and keep it up to date.</li>
              </ul>
              <p className="mt-3">
                Subscription fees are non-refundable except as described in our Refund Policy. We reserve the
                right to modify pricing with 30 days' advance notice. Continued use of the Service after a price
                change constitutes your acceptance of the new pricing.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">5. Acceptable Use</h2>
              <p className="mb-2">You agree not to use the Service to:</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>Violate any applicable Kenyan or international laws or regulations.</li>
                <li>Infringe the intellectual property rights of FarmVault or third parties.</li>
                <li>Transmit harmful, fraudulent, or misleading information.</li>
                <li>Attempt to gain unauthorized access to our systems or other users' accounts.</li>
                <li>Reverse-engineer, decompile, or disassemble any part of the Service.</li>
                <li>Use automated scripts, bots, or scrapers against the Service without written consent.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">6. Data &amp; Privacy</h2>
              <p>
                Your use of the Service is also governed by our <a href="/privacy" className="text-primary underline-offset-2 hover:underline font-medium">Privacy Policy</a>,
                which is incorporated into these Terms by reference. By using the Service, you consent to the
                collection, processing, and storage of your data as described in the Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">7. Intellectual Property</h2>
              <p>
                All content, trademarks, logos, software, and features of the Service are and remain the exclusive
                property of FarmVault Ltd. Nothing in these Terms grants you any license or right to use FarmVault's
                intellectual property except as expressly stated. User-generated data (your farm records, entries,
                and reports) remains your property. You grant FarmVault a limited license to process and display
                your data solely to provide the Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">8. Disclaimers &amp; Limitation of Liability</h2>
              <p className="mb-2">
                The Service is provided "as is" without warranties of any kind, express or implied. FarmVault does
                not warrant that the Service will be uninterrupted, error-free, or free of viruses.
              </p>
              <p>
                To the fullest extent permitted by Kenyan law, FarmVault's total liability to you for any claim
                arising out of or related to these Terms shall not exceed the amount you paid to FarmVault in the
                three (3) months preceding the claim. FarmVault is not liable for any indirect, incidental,
                consequential, or punitive damages.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">9. Termination</h2>
              <p>
                Either party may terminate these Terms at any time. You may cancel your account through your account
                settings. FarmVault may suspend or terminate your access immediately if you breach these Terms. Upon
                termination, your right to access the Service ceases and we may delete your data after 30 days,
                subject to our data retention obligations.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">10. Governing Law &amp; Disputes</h2>
              <p>
                These Terms are governed by the laws of Kenya. Any disputes arising from or related to these Terms
                shall be subject to the exclusive jurisdiction of the courts of Nairobi, Kenya. Before initiating
                formal proceedings, both parties agree to attempt good-faith resolution within 30 days of written
                notice of the dispute.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">11. Amendments</h2>
              <p>
                We reserve the right to update these Terms at any time. We will notify you of material changes by
                email or an in-app notification at least 14 days before the changes take effect. Your continued use
                of the Service after the effective date constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">12. Contact</h2>
              <p>
                For questions about these Terms, contact us at:
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
