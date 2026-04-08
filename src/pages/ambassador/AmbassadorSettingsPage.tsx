import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/react";
import { ExternalLink, Loader2, Upload, X } from "lucide-react";
import { DeveloperPageShell } from "@/components/developer/DeveloperPageShell";
import { SeoHead } from "@/seo/SeoHead";
import { SEO_ROUTES } from "@/seo/routes";
import { Button } from "@/components/ui/button";
import { FarmVaultUserMenu } from "@/components/auth/FarmVaultUserMenu";
import { UserAvatar } from "@/components/UserAvatar";
import { clearAmbassadorSession, getAmbassadorSession } from "@/services/ambassadorService";
import { uploadAvatar, clearAvatar } from "@/services/avatarService";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function AmbassadorSettingsPage() {
  const { user, isLoaded } = useUser();
  const { user: appUser, refreshUserAvatar } = useAuth();
  const legacy = typeof window !== "undefined" ? getAmbassadorSession() : null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | undefined>(appUser?.avatar);

  useEffect(() => {
    setAvatarPreviewUrl(appUser?.avatar);
  }, [appUser?.avatar]);

  return (
    <>
      <SeoHead title="Ambassador settings" description="Account and program links." canonical={SEO_ROUTES.ambassadorDashboard} />
      <DeveloperPageShell
        title="Settings"
        description="Account shortcuts and program information."
      >
        <div className="fv-card space-y-6 p-4 sm:p-6 max-w-lg">
          {isLoaded && user && appUser?.id && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Profile photo</p>
              <div className="flex items-start gap-3">
                <UserAvatar
                  avatarUrl={avatarPreviewUrl}
                  name={appUser?.name ?? user.fullName ?? user.primaryEmailAddress?.emailAddress}
                  size="lg"
                  className="h-14 w-14"
                />
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!file || !appUser?.id) return;
                      setAvatarUploading(true);
                      try {
                        const result = await uploadAvatar({
                          file,
                          clerkUserId: appUser.id,
                          companyId: appUser.companyId ?? null,
                        });
                        setAvatarPreviewUrl(result.url);
                        await refreshUserAvatar?.();
                        toast.success("Profile photo updated");
                      } catch (err: any) {
                        toast.error(err?.message ?? "Could not upload profile photo.");
                      } finally {
                        setAvatarUploading(false);
                      }
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="gap-1.5"
                    >
                      {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {avatarUploading ? "Uploading..." : "Upload photo"}
                    </Button>
                    {avatarPreviewUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={avatarUploading}
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (!appUser?.id) return;
                          const previousAvatar = avatarPreviewUrl;
                          setAvatarUploading(true);
                          setAvatarPreviewUrl(undefined);
                          try {
                            await clearAvatar(appUser.id);
                            await refreshUserAvatar?.();
                            toast.success("Profile photo removed");
                          } catch (err: any) {
                            setAvatarPreviewUrl(previousAvatar);
                            toast.error(err?.message ?? "Could not remove profile photo.");
                          } finally {
                            setAvatarUploading(false);
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                        Remove photo
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Supported formats: JPG, PNG, WebP. Maximum size 5MB.</p>
                </div>
              </div>
            </div>
          )}

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
