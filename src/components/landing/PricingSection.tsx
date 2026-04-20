import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_PLANS, type BillingMode, getBillingModeDurationLabel } from "@/config/plans";
import { BillingModeSelector } from "@/components/subscription/BillingModeSelector";
import { useBillingPrices } from "@/hooks/useBillingPrices";

function PriceText({
  amount,
  isLoading,
}: {
  amount: number;
  isLoading: boolean;
}) {
  return (
    <span className="relative inline-flex items-baseline">
      <span className="text-3xl font-bold text-[#1f3a2d]">KES {amount.toLocaleString()}</span>
      {isLoading && (
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-1 h-2 rounded-md bg-black/10 animate-pulse"
        />
      )}
    </span>
  );
}

export function PricingSection() {
  const [billingMode, setBillingMode] = useState<BillingMode>("monthly");
  const { getAmount, isLoading } = useBillingPrices();

  // FALLBACK ONLY — sync with core.billing_prices if prices change
  const BASIC_MONTHLY_FALLBACK = 2500;
  // FALLBACK ONLY — sync with core.billing_prices if prices change
  const PRO_MONTHLY_FALLBACK = 5000;
  // FALLBACK ONLY — sync with core.billing_prices if prices change
  const BASIC_SEASONAL_FALLBACK = 8500;
  // FALLBACK ONLY — sync with core.billing_prices if prices change
  const PRO_SEASONAL_FALLBACK = 15000;
  // FALLBACK ONLY — sync with core.billing_prices if prices change
  const BASIC_ANNUAL_FALLBACK = 24000;
  // FALLBACK ONLY — sync with core.billing_prices if prices change
  const PRO_ANNUAL_FALLBACK = 48000;

  return (
    <section id="pricing" className="bg-white py-16 md:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1f3a2d] md:text-4xl">
            Pricing in <span className="text-[#D8B980]">KES</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#5f6f63]">
            Choose the plan that fits your farm size. Billing and features match what you get inside FarmVault.
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <BillingModeSelector mode={billingMode} onChange={setBillingMode} />
        </div>
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const cycle = billingMode === "season" ? "seasonal" : billingMode;
            const liveAmount =
              plan.value === "basic" || plan.value === "pro"
                ? getAmount(plan.value, cycle)
                : null;

            const fallbackAmount =
              plan.value === "basic"
                ? cycle === "monthly"
                  ? BASIC_MONTHLY_FALLBACK
                  : cycle === "seasonal"
                    ? BASIC_SEASONAL_FALLBACK
                    : BASIC_ANNUAL_FALLBACK
                : plan.value === "pro"
                  ? cycle === "monthly"
                    ? PRO_MONTHLY_FALLBACK
                    : cycle === "seasonal"
                      ? PRO_SEASONAL_FALLBACK
                      : PRO_ANNUAL_FALLBACK
                  : null;

            const amount = liveAmount ?? fallbackAmount;

            return (
              <article
                key={plan.value}
                className={`rounded-xl border p-6 ${plan.popular ? "border-[#D8B980] bg-[#fffdf9]" : "border-[#d8b980]/40 bg-white"}`}
              >
              <h3 className="text-xl font-bold text-[#1f3a2d]">{plan.name}</h3>
              <p className="mt-1 text-sm text-[#5f6f63]">{plan.description}</p>
              {plan.popular && (
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#D8B980]">
                  Most selected
                </p>
              )}

              <div className="mt-5">
                {amount != null ? (
                  <>
                    <PriceText amount={amount} isLoading={isLoading} />
                    <p className="mt-1 text-xs text-[#5f6f63]">
                      {getBillingModeDurationLabel(billingMode)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[#5f6f63]">Contact us for pricing.</p>
                )}
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-[#5f6f63]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D8B980]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button size="lg" asChild className="mt-6 h-11 w-full rounded-md bg-[#D8B980] text-black hover:bg-[#c9aa74]">
                <a href="/sign-up" className="inline-flex items-center justify-center">
                  Start free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
