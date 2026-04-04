import { useEffect } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Footer } from "@/components/landing/Footer";

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground">Last updated: April 4, 2026</p>
          </header>

          <div className="space-y-10 text-foreground/80 text-base leading-relaxed">

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">1. Introduction</h2>
              <p>
                FarmVault Ltd. ("FarmVault", "we", "us") is committed to protecting your personal information. This
                Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use
                our farm management platform and related services. We comply with the Kenya Data Protection Act, 2019.
              </p>
              <p className="mt-2">
                By using FarmVault, you consent to the practices described in this policy. If you do not agree,
                please discontinue use of the Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">2. Information We Collect</h2>
              <h3 className="text-base font-semibold text-foreground mb-2">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75 mb-4">
                <li>Account information: name, email address, phone number, password.</li>
                <li>Farm data: crop records, harvest logs, inventory entries, expense reports, employee records.</li>
                <li>Payment information: billing details processed via our payment provider (we do not store card numbers).</li>
                <li>Communications: messages you send to our support team.</li>
              </ul>
              <h3 className="text-base font-semibold text-foreground mb-2">2.2 Information Collected Automatically</h3>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>Usage data: pages visited, features used, session duration, click patterns.</li>
                <li>Device data: IP address, browser type, operating system, device identifiers.</li>
                <li>Cookies and similar tracking technologies (see Section 6).</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">3. How We Use Your Information</h2>
              <p className="mb-2">We use your information to:</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li>Provide, operate, and improve the Service.</li>
                <li>Process transactions and send billing notifications.</li>
                <li>Send service announcements, updates, and security alerts.</li>
                <li>Respond to your support requests and inquiries.</li>
                <li>Analyze usage trends to improve user experience.</li>
                <li>Detect and prevent fraud, abuse, and security threats.</li>
                <li>Comply with legal obligations under Kenyan law.</li>
              </ul>
              <p className="mt-3">
                We will not use your farm data for advertising, sell your data to third parties, or use it to train
                AI models without your explicit consent.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">4. Information Sharing &amp; Disclosure</h2>
              <p className="mb-2">We may share your information with:</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li><strong>Service providers:</strong> Third-party vendors who assist in operating our platform (hosting, payments, authentication, analytics). They are contractually bound to protect your data.</li>
                <li><strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred. We will notify you before your data is transferred and becomes subject to a different privacy policy.</li>
                <li><strong>Legal requirements:</strong> When required by Kenyan law, court order, or government authority.</li>
                <li><strong>With your consent:</strong> In any other case where you have explicitly authorized disclosure.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">5. Data Storage &amp; Security</h2>
              <p>
                Your data is stored on secure servers hosted by our cloud provider. We implement industry-standard
                security measures including encryption in transit (TLS), encryption at rest, access controls, and
                regular security audits. Despite these measures, no method of transmission over the internet is
                100% secure, and we cannot guarantee absolute security.
              </p>
              <p className="mt-3">
                We retain your data for as long as your account is active or as needed to provide the Service.
                You may request deletion of your account and personal data at any time (see Section 7).
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">6. Cookies &amp; Tracking Technologies</h2>
              <p className="mb-2">
                We use cookies and similar technologies to operate and improve the Service. Types of cookies we use:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li><strong>Essential cookies:</strong> Required for the Service to function (authentication sessions, security).</li>
                <li><strong>Analytics cookies:</strong> Help us understand how users interact with the platform (PostHog).</li>
                <li><strong>Preference cookies:</strong> Remember your settings and preferences.</li>
              </ul>
              <p className="mt-3">
                You can control cookies through your browser settings. Disabling certain cookies may affect the
                functionality of the Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">7. Your Rights (Kenya Data Protection Act, 2019)</h2>
              <p className="mb-2">Under the Kenya Data Protection Act, 2019, you have the right to:</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/75">
                <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data.</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal retention obligations).</li>
                <li><strong>Objection:</strong> Object to processing of your data in certain circumstances.</li>
                <li><strong>Portability:</strong> Request your data in a structured, machine-readable format.</li>
                <li><strong>Withdraw consent:</strong> Withdraw consent at any time where processing is based on consent.</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, contact us at{" "}
                <a href="mailto:hello@farmvault.africa" className="text-primary underline-offset-2 hover:underline font-medium">hello@farmvault.africa</a>.
                We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">8. Children's Privacy</h2>
              <p>
                The Service is not directed to children under 18 years of age. We do not knowingly collect personal
                information from children. If you believe a child has provided us with personal information, contact
                us immediately and we will delete it.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes by
                email or in-app notification at least 14 days in advance. The "Last updated" date at the top of
                this page reflects the most recent revision. We encourage you to review this policy periodically.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">10. Contact Us</h2>
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy, contact our Data
                Protection Officer at:
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
