/**
 * In-app Learn FarmVault page — rendered inside AmbassadorLayout (/ambassador/console/learn).
 * Same structured dashboard as the public /ambassador/learn page but without the landing
 * shell (no AmbassadorLandingNavbar, no hero background, no footer).
 */
import { AmbassadorLearnDashboard } from "@/components/ambassador/AmbassadorLearnDashboard";

export default function AmbassadorLearnConsolePage() {
  return (
    <div className="pb-10 text-foreground">
      <AmbassadorLearnDashboard />
    </div>
  );
}
