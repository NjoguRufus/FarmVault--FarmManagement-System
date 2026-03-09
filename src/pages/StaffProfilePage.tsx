import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStaff } from '@/contexts/StaffContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/UserAvatar';

export default function StaffProfilePage() {
  const { user } = useAuth();
  const { fullName, companyName } = useStaff();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(fullName ?? user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">You must be signed in to view this page.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (displayName.trim().length > 0) {
        updates.name = displayName.trim();
      }
      if (avatarUrl.trim().length > 0) {
        updates.avatar_url = avatarUrl.trim();
      }
      if (Object.keys(updates).length > 0) {
        await db.core().from('profiles').update(updates).eq('clerk_user_id', user.id);
      }
      toast({ title: 'Profile updated', description: 'Your staff profile has been saved.' });
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message ?? 'Failed to update profile.',
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
          <CardTitle>My Staff Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarUrl={avatarUrl || user.avatar}
              name={displayName}
              size="lg"
              className="h-16 w-16"
            />
            <div>
              <p className="text-sm text-muted-foreground">
                This is how you appear in the staff workspace and on the admin side.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Display name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name as staff"
            />
            <p className="text-xs text-muted-foreground">
              Updating your display name here will not change your employee record used by admins.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Avatar image URL</label>
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
            <p className="text-xs text-muted-foreground">
              Paste a direct image URL for now. This picture will also be visible on the admin side.
            </p>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Email:</span> {user.email}
            </p>
            {companyName && (
              <p>
                <span className="font-medium text-foreground">Company:</span> {companyName}
              </p>
            )}
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

