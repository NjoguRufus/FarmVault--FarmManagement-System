import React, { useEffect } from 'react';
import { HelpCircle, MessageCircle, Mail, Phone, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { buttonVariants } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type SupportChannel = {
  title: string;
  description: string;
  action: string;
  href: string;
  icon: React.ReactNode;
  iconClass: string;
  buttonVariant: NonNullable<VariantProps<typeof buttonVariants>['variant']>;
  buttonClass: string;
  external?: boolean;
};

export default function SupportPage() {
  const { user } = useAuth();

  useEffect(() => {
    captureEvent(AnalyticsEvents.SUPPORT_PAGE_VIEWED, {
      company_id: user?.companyId ?? undefined,
      module_name: 'support',
      route_path: '/support',
    });
  }, [user?.companyId]);

  const channels: SupportChannel[] = [
    {
      title: 'WhatsApp Support',
      description: 'Chat with us on WhatsApp for quick help',
      action: 'Open WhatsApp',
      href: 'https://wa.me/254714456167',
      icon: <MessageCircle className="h-4 w-4" aria-hidden />,
      iconClass:
        'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-400 dark:ring-emerald-400/30',
      buttonVariant: 'default',
      buttonClass:
        'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500/40 dark:hover:bg-emerald-600',
      external: true,
    },
    {
      title: 'Call Support',
      description: 'Call us for immediate assistance',
      action: 'Call Now',
      href: 'tel:+254714456167',
      icon: <Phone className="h-4 w-4" aria-hidden />,
      iconClass: 'bg-primary/12 text-primary ring-1 ring-primary/20',
      buttonVariant: 'default',
      buttonClass: 'shadow-sm',
      external: false,
    },
    {
      title: 'Email Support',
      description: 'Send us an email and we’ll reply ASAP',
      action: 'Send Email',
      href: 'mailto:support@farmvault.africa',
      icon: <Mail className="h-4 w-4" aria-hidden />,
      iconClass:
        'bg-[#D8B980]/20 text-[#6b5a3a] ring-1 ring-[#D8B980]/35 dark:bg-[#D8B980]/15 dark:text-[#e8d5b0] dark:ring-[#D8B980]/25',
      buttonVariant: 'outline',
      buttonClass:
        'border-[#D8B980]/50 text-foreground hover:bg-[#D8B980]/12 dark:border-[#D8B980]/40 dark:hover:bg-[#D8B980]/10',
      external: false,
    },
  ];

  const faqs = [
    {
      question: 'How do I create a new project?',
      answer: 'Navigate to the Projects page and click "New Project". Fill in the required details including crop type, location, and budget.',
    },
    {
      question: 'How does the project selector work?',
      answer: 'The project selector in the top navbar allows you to switch between projects. All pages will automatically update to show data for the selected project.',
    },
    {
      question: 'Can I export my data?',
      answer: 'Yes, you can export data from the Reports page. Choose the report type and click Export to download as CSV or PDF.',
    },
    {
      question: 'How do I add team members?',
      answer: 'Go to the Employees page and click "Add Employee". You can assign roles and departments to each team member.',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in pb-8">
      <header className="space-y-0.5">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Support</h1>
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Get help and find answers to your questions
        </p>
      </header>

      <section aria-label="Contact options" className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reach the team
        </h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
          {channels.map((ch) => (
            <div
              key={ch.title}
              className={cn(
                'flex flex-col rounded-xl border border-border/80 bg-card p-3.5 shadow-sm',
                'transition-colors duration-200 hover:border-border hover:bg-muted/20',
                'dark:border-border/60 dark:bg-card/60',
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    ch.iconClass,
                  )}
                >
                  {ch.icon}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="text-sm font-semibold leading-tight text-foreground">{ch.title}</h3>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{ch.description}</p>
                </div>
              </div>
              <a
                href={ch.href}
                {...(ch.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                className={cn(
                  buttonVariants({ variant: ch.buttonVariant, size: 'sm' }),
                  'mt-3 w-full rounded-lg text-xs font-medium no-underline h-9',
                  ch.buttonClass,
                )}
              >
                {ch.action}
                <ArrowUpRight className="h-3.5 w-3.5 opacity-90" aria-hidden />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="support-faq-heading">
        <div
          className={cn(
            'rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6',
            'dark:border-border/60 dark:bg-card/60',
          )}
        >
          <div className="mb-4 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h2 id="support-faq-heading" className="text-lg font-semibold tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <Accordion type="single" collapsible className="w-full rounded-xl border border-border/50 bg-muted/20 px-1 dark:bg-muted/10">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`faq-${index}`}
                className="border-border/60 px-3 last:border-b-0"
              >
                <AccordionTrigger className="py-3.5 text-left text-sm font-medium leading-snug text-foreground hover:no-underline [&[data-state=open]]:text-foreground">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section aria-labelledby="support-contact-heading">
        <div
          className={cn(
            'rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6',
            'dark:border-border/60 dark:bg-card/60',
          )}
        >
          <h2 id="support-contact-heading" className="text-lg font-semibold tracking-tight">
            Contact Information
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/15 p-4 dark:bg-muted/10">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="mt-0.5 break-all text-sm font-medium text-foreground">support@farmvault.africa</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/15 p-4 dark:bg-muted/10">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">+254 714 456167</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
