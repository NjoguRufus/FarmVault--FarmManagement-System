import React from "react";
import { SignUp } from "@clerk/react";

export default function DevSignUpPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background (reuse main auth look) */}
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

      {/* Centered Clerk SignUp */}
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
              Create your FarmVault developer account to get started
            </p>
          </div>

          <div className="bg-[#F5F1EB] rounded-3xl shadow-2xl p-4 md:p-6 border border-white/20">
            <SignUp
              routing="path"
              path="/dev/sign-up"
              signInUrl="/dev/sign-in"
              afterSignUpUrl="/developer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

