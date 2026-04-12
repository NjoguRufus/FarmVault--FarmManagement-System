/**
 * UpgradeCTA — shown when a user hits a plan feature limit.
 *
 * Usage variants:
 *
 * 1. Inline banner (inside a page / card):
 *    <UpgradeCTA
 *      title="Project limit reached"
 *      description="Upgrade to PRO for unlimited projects."
 *    />
 *
 * 2. Disabled button with badge:
 *    <UpgradeCTA asButton label="Add Project" disabled />
 *
 * 3. Programmatic toast (no component needed):
 *    import { showUpgradeToast } from '@/components/ui/UpgradeCTA';
 *    showUpgradeToast('You've reached the 2-project limit on Basic.');
 */

import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Standalone toast helper (no component required)
// ---------------------------------------------------------------------------

export function showUpgradeToast(description?: string): void {
  toast.error("Plan limit reached", {
    description:
      description ?? "Upgrade to PRO to unlock unlimited access.",
    action: {
      label: "Upgrade →",
      onClick: () => (window.location.href = "/settings/billing"),
    },
    duration: 6000,
  });
}

// ---------------------------------------------------------------------------
// Inline banner component
// ---------------------------------------------------------------------------

interface UpgradeCTAProps {
  title?:       string;
  description?: string;
  className?:   string;
  /** Show as a small lock-badge next to a disabled button */
  asButton?:    boolean;
  /** Button label when asButton=true */
  label?:       string;
  /** Pass through to the underlying element */
  disabled?:    boolean;
}

export function UpgradeCTA({
  title       = "Upgrade to PRO",
  description = "Upgrade to PRO to unlock unlimited access.",
  className,
  asButton = false,
  label    = "Add",
}: UpgradeCTAProps) {
  const navigate = useNavigate();

  if (asButton) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5">
              <Button
                disabled
                variant="outline"
                size="sm"
                className="cursor-not-allowed opacity-60"
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                {label}
              </Button>
              <Badge
                variant="secondary"
                className="cursor-pointer bg-amber-100 text-amber-800 hover:bg-amber-200"
                onClick={() => navigate("/settings/billing")}
              >
                <Zap className="mr-1 h-3 w-3" />
                PRO
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-center">
            {description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3",
        className,
      )}
    >
      <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">{title}</p>
        <p className="mt-0.5 text-xs text-amber-700">{description}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
        onClick={() => navigate("/settings/billing")}
      >
        Upgrade
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanLimitGuard — wraps children; shows CTA when limit is reached
//
// Usage:
//   <PlanLimitGuard
//     plan={plan}
//     feature="maxProjects"
//     currentCount={projectCount}
//     ctaDescription="You've used both project slots. Upgrade for unlimited."
//   >
//     <Button onClick={openNewProjectDialog}>New Project</Button>
//   </PlanLimitGuard>
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { isFeatureBlocked, type FarmPlan, type FeatureLimits } from "@/lib/rateLimitHandler";

interface PlanLimitGuardProps {
  plan:            FarmPlan;
  feature:         keyof FeatureLimits;
  currentCount:    number;
  children:        ReactNode;
  ctaTitle?:       string;
  ctaDescription?: string;
  /** When true, renders the disabled-button variant instead of the banner */
  asButton?:       boolean;
  buttonLabel?:    string;
}

export function PlanLimitGuard({
  plan,
  feature,
  currentCount,
  children,
  ctaTitle,
  ctaDescription,
  asButton = false,
  buttonLabel,
}: PlanLimitGuardProps) {
  const blocked = isFeatureBlocked(feature, plan, currentCount);

  if (!blocked) return <>{children}</>;

  const defaultMessages: Record<keyof FeatureLimits, { title: string; description: string }> = {
    maxProjects: {
      title:       "Project limit reached",
      description: "Basic plan allows up to 2 projects. Upgrade to PRO for unlimited projects.",
    },
    maxEmployees: {
      title:       "Employee limit reached",
      description: "Basic plan allows up to 2 employees. Upgrade to PRO for unlimited employees.",
    },
    maxPickersRoster: {
      title:       "Picker roster limit reached",
      description: "Basic plan allows up to 50 pickers in your roster. Upgrade to PRO for unlimited.",
    },
  };

  const defaults = defaultMessages[feature];

  return (
    <UpgradeCTA
      title={ctaTitle ?? defaults.title}
      description={ctaDescription ?? defaults.description}
      asButton={asButton}
      label={buttonLabel}
    />
  );
}
