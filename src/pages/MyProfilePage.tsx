import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/UserAvatar';
import { uploadAvatar, clearAvatar } from '@/services/avatarService';

export default function MyProfilePage() {
  const { user, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [displayName, setDisplayName] = useState(user?.name ?? user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>((user?.avatar as string | null) ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await db
          .core()
          .from('profiles')
          .select('full_name, avatar_url, email')
          .eq('clerk_user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const fullName =
          data?.full_name != null && String(data.full_name).trim().length > 0
            ? String(data.full_name)
            : null;
        const nextName = fullName ?? user.name ?? user.email ?? '';
        const nextAvatar =
          (data?.avatar_url != null && String(data.avatar_url).trim().length > 0
            ? String(data.avatar_url)
            : null) ?? ((user.avatar as string | null) ?? null);
        setDisplayName(nextName);
        setAvatarUrl(nextAvatar);
      } catch (e) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[MyProfilePage] profile load failed', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.name, user?.email, user?.avatar]);

  if (!user) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">You must be signed in to view this page.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const trimmed = displayName.trim();
      if (!trimmed) return;

      const { error } = await db
        .core()
        .from('profiles')
        .update({ full_name: trimmed })
        .eq('clerk_user_id', user.id);
      if (error) throw error;

      await refreshUserProfile();
      toast({ title: 'Saved', description: 'Your profile name has been updated.' });
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message ?? 'Failed to update your profile.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarUrl={avatarUrl ?? (user.avatar as string | null) ?? null}
              name={displayName}
              size="lg"
              className="h-16 w-16"
            />
            <div className="text-sm text-muted-foreground">
              Update your display name and profile photo. This name is shown across the admin workspace.
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Display name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Profile photo</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  if (!file || !user?.id) return;
                  setUploadingAvatar(true);
                  try {
                    const result = await uploadAvatar({
                      file,
                      clerkUserId: user.id,
                      companyId: user.companyId ?? null,
                    });
                    setAvatarUrl(result.url);
                    await refreshUserProfile();
                    toast({ title: 'Updated', description: 'Your profile photo has been updated.' });
                  } catch (err: any) {
                    toast({
                      title: 'Upload failed',
                      description: err?.message ?? 'Could not upload profile photo.',
                      variant: 'destructive',
                    });
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? 'Uploading…' : 'Upload photo'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!user?.id) return;
                  setUploadingAvatar(true);
                  try {
                    await clearAvatar(user.id);
                    setAvatarUrl(null);
                    await refreshUserProfile();
                    toast({ title: 'Removed', description: 'Profile photo removed.' });
                  } catch (err: any) {
                    toast({
                      title: 'Error',
                      description: err?.message ?? 'Could not remove profile photo.',
                      variant: 'destructive',
                    });
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
                disabled={uploadingAvatar}
              >
                Remove photo
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || loading || displayName.trim().length === 0}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

