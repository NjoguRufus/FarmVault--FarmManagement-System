import React from "react";
import { Link } from "react-router-dom";
import { SignIn } from "@clerk/react";
import { ClerkLoadErrorBoundary } from "@/components/auth/ClerkLoadErrorBoundary";
import { isEmergencyAccessEnabled } from "@/config/emergencyAccess";

/**
 * Sign-in UI depends only on Clerk. No AuthContext or employee/company lookup runs here;
 * data fetching runs only after a Clerk user exists (in AuthContext).
 */
export default function SignInPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Farm background image with gradient overlay (matches main marketing/login look) */}
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

      {/* Centered auth card with logo + Clerk SignIn */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center space-y-3 mb-8">
            <div className="flex justify-center">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault logo"
                className="h-32 w-auto md:h-40 lg:h-48 object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-sm md:text-base text-white/90 mt-1 drop-shadow-md">
              Sign in to continue to your farm workspace
            </p>
          </div>

          <div className="bg-[#F5F1EB] rounded-3xl shadow-2xl p-4 md:p-6 border border-white/20">
            <ClerkLoadErrorBoundary>
              <SignIn
                routing="path"
                path="/sign-in"
                signUpUrl="/sign-up"
                afterSignInUrl="/auth/continue"
              />
            </ClerkLoadErrorBoundary>
          </div>

          {isEmergencyAccessEnabled() && (
            <p className="mt-4 text-center">
              <Link
                to="/emergency-access"
                className="text-sm text-white/80 hover:text-white underline"
              >
                Sign-in not loading? Use emergency access
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

