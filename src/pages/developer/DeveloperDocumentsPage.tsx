import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, FileText, Shield, Users, CreditCard, BookOpen, Database, Scale } from 'lucide-react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';

const DOCUMENTS = [
  {
    title: 'Terms of Service',
    description:
      'Account responsibilities, subscription rules, payment policy, limitation of liability, and termination rights.',
    href: '/legal/terms-of-service.html',
    icon: FileText,
    badge: 'All Users',
  },
  {
    title: 'Privacy Policy',
    description:
      'Data collected, usage, storage and security measures, retention periods, and user data rights.',
    href: '/legal/privacy-policy.html',
    icon: Shield,
    badge: 'All Users',
  },
  {
    title: 'Ambassador Agreement',
    description:
      'Commission structure, payment conditions, non-employment clause, fraud prevention, and termination.',
    href: '/legal/ambassador-agreement.html',
    icon: Users,
    badge: 'Ambassadors',
  },
  {
    title: 'Subscription & Billing Policy',
    description:
      'Manual and STK Push payment rules, renewal policy, expiry and grace periods, and pricing changes.',
    href: '/legal/subscription-billing-policy.html',
    icon: CreditCard,
    badge: 'Subscribers',
  },
  {
    title: 'Acceptable Use Policy',
    description:
      'Permitted use, platform misuse rules, prohibited behaviour, abuse prevention, and enforcement actions.',
    href: '/legal/acceptable-use-policy.html',
    icon: BookOpen,
    badge: 'All Users',
  },
  {
    title: 'Data Processing Agreement',
    description:
      'Data ownership, processing obligations, security measures, subprocessor clause, and compliance.',
    href: '/legal/data-processing-agreement.html',
    icon: Database,
    badge: 'Business Subscribers',
  },
] as const;

export default function DeveloperDocumentsPage() {
  return (
    <div className="space-y-4">
      <Link
        to="/developer"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Developer Dashboard
      </Link>

      <DeveloperPageShell
        title="Legal Documents"
        description="Official legal agreements and policies governing the FarmVault platform. Version 1.0 — effective 4 April 2026."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {DOCUMENTS.map((doc) => {
            const Icon = doc.icon;
            return (
              <a
                key={doc.href}
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 hover:border-primary/50 hover:shadow-md transition-all duration-150"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/18 transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full leading-none flex items-center">
                    {doc.badge}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors leading-snug">
                    {doc.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {doc.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">v1.0 · April 2026</span>
                  <span className="text-[11px] font-semibold text-primary group-hover:underline">
                    Open ↗
                  </span>
                </div>
              </a>
            );
          })}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Scale className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium text-foreground">Legal &amp; Compliance</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All documents are governed by the laws of Kenya. Legal inquiries:{' '}
              <span className="font-medium text-foreground">legal@farmvault.africa</span>
              {' '}· Data protection:{' '}
              <span className="font-medium text-foreground">privacy@farmvault.africa</span>
            </p>
          </div>
        </div>
      </DeveloperPageShell>
    </div>
  );
}
