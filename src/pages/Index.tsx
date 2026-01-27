import React from 'react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Farm Background Image with Overlay - Responsive */}
      <div className="absolute inset-0">
        {/* Mobile background (default) */}
        <div 
          className="md:hidden absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-backgroundmobile.jpg')`,
          }}
        />
        {/* Desktop background */}
        <div 
          className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-background-desktop.jpg')`,
          }}
        />
        {/* Optional overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8 md:py-12">
        {/* Logo and Branding */}
        <div className="text-center space-y-4 mb-8 md:mb-12">
          <div className="flex justify-center">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault logo"
              className="h-32 w-auto md:h-48 lg:h-56 object-contain drop-shadow-lg"
            />
          </div>
          <div>
            <p className="text-sm md:text-base text-white/90 mt-2 drop-shadow-md">
              <span className="hidden md:inline">A smart farm operations & decision system for modern agriculture</span>
              <span className="md:hidden">A smart farm operations for modern agriculture</span>
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B6F47] hover:bg-[#7A5F3A] text-white font-medium px-8 py-3.5 text-base transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/90 hover:bg-white text-[#2D4A3E] font-medium px-8 py-3.5 text-base transition-all shadow-lg hover:shadow-xl border border-white/20"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Index;
