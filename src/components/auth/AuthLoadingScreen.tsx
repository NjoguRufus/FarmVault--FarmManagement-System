interface AuthLoadingScreenProps {
  message?: string;
}

export function AuthLoadingScreen({ message = "Loading.." }: AuthLoadingScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5 text-center">
        <img
          src="/Logo/FarmVault_Logo dark mode.png"
          alt="FarmVault logo"
          className="mx-auto h-24 sm:h-28 w-auto object-contain"
        />
        <div className="flex justify-center" aria-live="polite" aria-busy="true">
          <span className="fv-auth-loader" />
        </div>
        <p className="landing-page text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
