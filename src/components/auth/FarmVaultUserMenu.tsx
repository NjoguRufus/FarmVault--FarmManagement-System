import React from "react";
import { useNavigate } from "react-router-dom";
import { useClerk, useUser } from "@clerk/react";
import {
  Building2,
  ChevronDown,
  Crown,
  HelpCircle,
  LogOut,
  Settings,
  Sprout,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAmbassadorAccess } from "@/contexts/AmbassadorAccessContext";

export type FarmVaultUserMenuProps = {
  /** Clerk redirect after sign-out */
  afterSignOutUrl?: string;
  settingsPath?: string;
  supportPath?: string;
  /** Subscription / billing (company app) */
  showBilling?: boolean;
  showSupport?: boolean;
  accountLabel?: string;
  triggerClassName?: string;
  /** Show display name beside avatar on larger breakpoints */
  showNameOnDesktop?: boolean;
  /** Smaller trigger (e.g. settings page row) */
  compact?: boolean;
};

/**
 * FarmVault profile dropdown: Clerk `useUser` / `useClerk` for data and sign-out only — no Clerk UI primitives.
 */
export function FarmVaultUserMenu({
  afterSignOutUrl = "/sign-in",
  settingsPath = "/settings",
  supportPath = "/support",
  showBilling = false,
  showSupport = true,
  accountLabel = "My Account",
  triggerClassName,
  showNameOnDesktop = true,
  compact = false,
}: FarmVaultUserMenuProps) {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const { user: fvUser } = useAuth();
  const { workspaceMode, setWorkspaceMode, setIsAccessingAmbassador } = useAmbassadorAccess();

  const canSwitchCompanyAmbassador =
    fvUser?.profileUserType === "both" && Boolean(fvUser.companyId);

  const displayName =
    (fvUser?.name && String(fvUser.name).trim()) ||
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? fvUser?.email ?? "";
  const avatarUrl = fvUser?.avatar || user?.imageUrl || undefined;

  const handleSignOut = () => {
    void signOut({ redirectUrl: afterSignOutUrl });
  };

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-1.5 rounded-lg py-1.5 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "px-1.5" : "px-1.5 md:px-2",
          triggerClassName,
        )}
      >
        <UserAvatar
          avatarUrl={avatarUrl}
          name={displayName}
          className={cn("shrink-0", compact ? "h-8 w-8" : "h-7 w-7 md:h-8 md:w-8")}
          size="sm"
        />
        {!compact && showNameOnDesktop && (
          <div className="hidden md:flex flex-col items-start min-w-0">
            <span className="text-sm font-medium truncate max-w-[140px]">{displayName}</span>
            {email ? (
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{email}</span>
            ) : null}
          </div>
        )}
        {!compact && (
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block shrink-0" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-xs text-muted-foreground">{accountLabel}</p>
            <p className="text-sm font-medium leading-none">{displayName}</p>
            {email ? <p className="text-xs leading-none text-muted-foreground break-all">{email}</p> : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {showBilling ? (
          <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/billing")}>
            <Crown className="mr-2 h-4 w-4" />
            Billing
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(settingsPath)}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        {showSupport ? (
          <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(supportPath)}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Support
          </DropdownMenuItem>
        ) : null}

        {canSwitchCompanyAmbassador ? (
          <>
            <DropdownMenuSeparator />
            {workspaceMode === "company" ? (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => {
                  setWorkspaceMode("ambassador");
                  setIsAccessingAmbassador(true);
                  void navigate("/ambassador/console/dashboard");
                }}
              >
                <Sprout className="mr-2 h-4 w-4" />
                Ambassador dashboard
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => {
                  setWorkspaceMode("company");
                  void navigate("/dashboard");
                }}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Company dashboard
              </DropdownMenuItem>
            )}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
