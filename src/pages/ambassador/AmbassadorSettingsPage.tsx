import React from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/react";
import { ExternalLink } from "lucide-react";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { Button } from "@/components/ui/button";
import { FarmVaultUserMenu } from "@/components/auth/FarmVaultUserMenu";
import { clearAmbassadorSession, getAmbassadorSession } from "@/services/ambassadorService";
import { toast } from "sonner";

export default function AmbassadorSettingsPage() {
  const { user, isLoaded } = useUser();
  const legacy = typeof window !== "undefined" ? getAmbassadorSession() : null;

  return (
    <>
      <SeoHead title="Ambassador settings" description="Account and program links." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Settings"
        description="Account shortcuts and program information."
      >
        <div className="fv-card space-y-6 p-4 sm:p-6 max-w-lg">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Account</p>
            {isLoaded && user ? (
              <div className="flex flex-wrap items-center gap-3">
                <FarmVaultUserMenu
                  accountLabel="Ambassador"
                  afterSignOutUrl="/ambassador"
                  settingsPath="/ambassador/console/settings"
                  supportPath="/support"
                  compact
                />
                <span className="text-sm text-muted-foreground">Open the menu for account actions and sign out.</span>
              </div>
            ) : legacy ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  clearAmbassadorSession();
                  toast.message("Signed out");
                  window.location.href = "/ambassador/signup";
                }}
              >
                Sign out (legacy session)
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">No account actions available.</p>
            )}
          </div>

          <div className="border-t border-border/50 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Program</p>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/ambassador">
                Program home
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </DeveloperPageShell>
    </>
  );
}
