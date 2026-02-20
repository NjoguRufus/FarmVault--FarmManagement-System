import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Check, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUBSCRIPTION_PLANS } from '@/config/plans';

export default function ChoosePlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const statePlan = (location.state as { plan?: string })?.plan;
  const [selectedPlan, setSelectedPlan] = useState<string>(statePlan && SUBSCRIPTION_PLANS.some(p => p.value === statePlan) ? statePlan : 'professional');

  const handleContinue = () => {
    navigate('/setup-company', { state: { plan: selectedPlan }, replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950 via-background to-emerald-900 px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault"
            className="h-10 w-auto rounded-md object-contain"
          />
          <h1 className="text-2xl font-semibold text-foreground">Choose your plan</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Select a package to continue. You can change it later in Billing.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.value;
            return (
              <button
                key={plan.value}
                type="button"
                onClick={() => setSelectedPlan(plan.value)}
                className={cn(
                  'fv-card text-left transition-all duration-300 relative',
                  isSelected ? 'ring-2 ring-primary ring-offset-2' : 'hover:border-primary/50',
                  plan.popular && 'border-fv-gold/50'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="fv-badge fv-badge--gold inline-flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Most Popular
                    </span>
                  </div>
                )}
                <div className="mb-4 pt-2">
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-fv-success shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-center mt-4 py-2 rounded-lg bg-muted/50 text-sm font-medium">
                  {isSelected ? 'Selected' : 'Click to select'}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            type="button"
            onClick={handleContinue}
            className="fv-btn fv-btn--primary inline-flex items-center gap-2 px-8"
          >
            Continue to setup
            <ArrowRight className="h-4 w-4" />
          </button>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
