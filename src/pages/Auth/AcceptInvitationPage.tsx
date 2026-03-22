import React from "react";
import { useLocation } from "react-router-dom";
import { SignUp } from "@clerk/react";

export default function AcceptInvitationPage() {
  const location = useLocation();
  const search = location.search ?? "";
  const params = new URLSearchParams(search);
  const invitedEmail = params.get("email") ?? "";
  const invitedCompanyId = params.get("company_id") ?? "";
  const invitedRole = params.get("role") ?? "";
  const ticket = params.get("__clerk_ticket");
  const clerkStatus = params.get("__clerk_status");

  const hasErrorStatus =
    clerkStatus === "expired" ||
    clerkStatus === "revoked" ||
    clerkStatus === "abandoned" ||
    clerkStatus === "failed";

  if (import.meta.env.DEV) {
    // Temporary debug log for invitation ticket handling and email/company hints
    console.log("[AcceptInvitationPage] load", {
      search,
      hasTicket: Boolean(ticket),
      clerkStatus,
      invitedEmail,
      invitedCompanyId,
      invitedRole,
      ticketPreview: ticket ? `${ticket.slice(0, 12)}...` : null,
    });
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Farm background image with gradient overlay (matches main auth pages) */}
      <div className="absolute inset-0">
        <div
          className="md:hidden absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-backgroundmobile.jpg')",
          }}
        />
        <div
          className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-background-desktop.jpg')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />
      </div>

      {/* Centered auth card with logo + Clerk SignUp (invitation-aware via __clerk_ticket) */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center space-y-3 mb-6">
            <div className="flex justify-center">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault logo"
                className="h-32 w-auto md:h-40 lg:h-48 object-contain drop-shadow-lg"
              />
            </div>
            <h1 className="text-lg md:text-2xl font-semibold text-white drop-shadow-md">
              You’ve been invited to join FarmVault
            </h1>
            <p className="text-xs md:text-sm text-white/90 drop-shadow-md">
              Complete your employee account to join your company’s existing FarmVault workspace.
            </p>
            <p className="text-[11px] md:text-xs text-white/80 drop-shadow-md">
              The invited email from your admin is locked by Clerk in this flow and cannot be changed.
              You are joining an existing company, not creating a new one.
            </p>
            {invitedEmail && (
              <p className="text-xs md:text-sm text-white/90 mt-1 drop-shadow-md">
                You’ll join using this email:{" "}
                <span className="font-semibold">{invitedEmail}</span>
              </p>
            )}
            {hasErrorStatus && (
              <p className="text-xs md:text-sm text-red-100 mt-1 drop-shadow-md">
                This invitation link may be invalid or expired. You can try signing in with the invited email,
                or ask your admin to send a new invitation.
              </p>
            )}
          </div>

          <div className="bg-[#F5F1EB] rounded-3xl shadow-2xl p-4 md:p-6 border border-white/20">
            {invitedEmail && (
              <div className="mb-4 text-left space-y-1">
                <label className="text-xs font-medium text-foreground/80">
                  Invited email (cannot be changed)
                </label>
                <input
                  className="fv-input text-sm bg-muted/60 cursor-not-allowed"
                  value={invitedEmail}
                  readOnly
                  disabled
                />
              </div>
            )}
            <SignUp
              routing="path"
              path="/accept-invitation"
              signInUrl="/sign-in"
              afterSignUpUrl="/auth/continue"
              afterSignInUrl="/auth/continue"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

