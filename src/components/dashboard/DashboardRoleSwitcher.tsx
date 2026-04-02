import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { UserButton } from "@clerk/react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDashboardRoles } from "@/hooks/useDashboardRoles";

const COMPANY_PATH = "/company";
const AMBASSADOR_DASHBOARD_PATH = "/ambassador/dashboard";

function useOnAmbassadorRoute(): boolean {
  const location = useLocation();
  return (
    location.pathname.startsWith("/ambassador/console") ||
    location.pathname.startsWith("/ambassador/dashboard")
  );
}

/** Renders inside shadcn profile <DropdownMenuContent> when user has both company and ambassador access. */
export function DashboardRoleMenuItems() {
  const navigate = useNavigate();
  const onAmbassador = useOnAmbassadorRoute();
  const { hasCompanyAndAmbassador, loading } = useDashboardRoles();

  if (loading || !hasCompanyAndAmbassador) {
    return null;
  }

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Switch dashboard
      </DropdownMenuLabel>
      <DropdownMenuItem
        className={cn("cursor-pointer gap-2", !onAmbassador && "bg-muted/50")}
        onClick={() => navigate(COMPANY_PATH)}
      >
        <LayoutDashboard className="h-4 w-4 shrink-0 opacity-80" />
        Company Dashboard
      </DropdownMenuItem>
      <DropdownMenuItem
        className={cn("cursor-pointer gap-2", onAmbassador && "bg-muted/50")}
        onClick={() => navigate(AMBASSADOR_DASHBOARD_PATH)}
      >
        <Sparkles className="h-4 w-4 shrink-0 opacity-80" />
        Ambassador Dashboard
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}

/** Renders inside Clerk <UserButton> when user has both company and ambassador access. */
export function DashboardRoleClerkMenuItems() {
  const navigate = useNavigate();
  const { hasCompanyAndAmbassador, loading } = useDashboardRoles();

  if (loading || !hasCompanyAndAmbassador) {
    return null;
  }

  return (
    <UserButton.MenuItems>
      <UserButton.Action
        label="Company Dashboard"
        labelIcon={<LayoutDashboard className="h-4 w-4" />}
        onClick={() => navigate(COMPANY_PATH)}
      />
      <UserButton.Action
        label="Ambassador Dashboard"
        labelIcon={<Sparkles className="h-4 w-4" />}
        onClick={() => navigate(AMBASSADOR_DASHBOARD_PATH)}
      />
    </UserButton.MenuItems>
  );
}
